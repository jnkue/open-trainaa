"""
Shared utilities for FIT file processing.

This module contains common functions for decoding and processing FIT files
from various sources (manual upload, Wahoo webhook, Strava, etc.).
"""

import hashlib
import os
import tempfile
from datetime import datetime
from typing import Optional, Tuple

from api.log import LOGGER
from fastapi import HTTPException
from garmin_fit_sdk import Decoder, Stream

from supabase import Client


def validate_fit_file_content(
    fit_content: bytes, filename: Optional[str] = None
) -> None:
    """
    Validate FIT file content before processing.

    Args:
        fit_content: Raw bytes of the FIT file
        filename: Optional filename for better error messages

    Raises:
        HTTPException: If validation fails
    """
    file_desc = f"'{filename}'" if filename else "FIT file"

    if len(fit_content) < 14:
        LOGGER.error(f"File too small: {file_desc} ({len(fit_content)} bytes)")
        raise HTTPException(
            status_code=400,
            detail="File too small to be a valid FIT file (minimum 14 bytes required).",
        )

    # Log file header info for debugging
    LOGGER.debug(
        f"File size: {len(fit_content)} bytes, "
        f"first 16 bytes: {fit_content[:16].hex() if len(fit_content) >= 16 else 'N/A'}"
    )


def calculate_file_hash(fit_content: bytes) -> str:
    """
    Calculate SHA256 hash of FIT file content.

    Args:
        fit_content: Raw bytes of the FIT file

    Returns:
        Hexadecimal SHA256 hash string
    """
    return hashlib.sha256(fit_content).hexdigest()


def check_duplicate_file(
    supabase: Client, user_id: str, file_hash: str
) -> Optional[str]:
    """
    Check if a FIT file with the same hash has already been processed for this user.

    Args:
        supabase: Supabase client instance
        user_id: User ID to check duplicates for
        file_hash: SHA256 hash of the file

    Returns:
        File ID if duplicate exists, None otherwise (does NOT raise exception)
    """
    result = (
        supabase.table("fit_files")
        .select("file_id")
        .eq("user_id", user_id)
        .eq("file_hash", file_hash)
        .execute()
    )

    if result.data:
        file_id = result.data[0].get("file_id") or result.data[0].get("id")
        LOGGER.info(f"Duplicate FIT file detected (existing file_id: {file_id})")
        return file_id

    return None


def get_activity_id_from_fit_file(supabase: Client, fit_file_id: str) -> Optional[str]:
    """
    Get the activity_id associated with a fit_file_id.

    Args:
        supabase: Supabase client instance
        fit_file_id: FIT file ID to look up

    Returns:
        Activity ID if found, None otherwise
    """
    result = (
        supabase.table("activities")
        .select("id")
        .eq("fit_file_id", fit_file_id)
        .limit(1)
        .execute()
    )

    if result.data:
        activity_id = result.data[0]["id"]
        LOGGER.debug(f"Found activity {activity_id} for fit_file {fit_file_id}")
        return activity_id

    return None


def store_fit_file_to_storage(
    supabase: Client, user_id: str, filename: str, fit_content: bytes
) -> str:
    """
    Upload FIT file to Supabase storage.

    Args:
        supabase: Supabase client instance
        user_id: User ID for organizing storage
        filename: Original filename
        fit_content: Raw bytes of the FIT file

    Returns:
        Storage path of the uploaded file

    Raises:
        HTTPException: If upload fails
    """
    timestamp_str = datetime.now().strftime("%Y%m%d%H%M%S")
    storage_path = f"{user_id}/{filename}_{timestamp_str}.fit"

    LOGGER.debug(f"Uploading FIT file to storage: {storage_path}")

    storage_response = supabase.storage.from_("fit-files").upload(
        storage_path, fit_content
    )

    if hasattr(storage_response, "path") and storage_response.path:
        LOGGER.info(
            f"Successfully uploaded FIT file to storage: {storage_response.path}"
        )
        return storage_response.path
    else:
        LOGGER.error(f"Failed to upload FIT file to storage: {storage_response}")
        raise HTTPException(
            status_code=500, detail="Failed to upload FIT file to storage."
        )


def create_fit_file_record(
    supabase: Client,
    user_id: str,
    file_path: str,
    original_filename: str,
    file_size_bytes: int,
    file_hash: str,
) -> str:
    """
    Create a FIT file record in the database.

    Args:
        supabase: Supabase client instance
        user_id: User ID who owns the file
        file_path: Storage path or virtual path
        original_filename: Original filename
        file_size_bytes: Size of the file in bytes
        file_hash: SHA256 hash of the file

    Returns:
        file_id of the created record

    Raises:
        HTTPException: If database insert fails
    """
    file_metadata = {
        "user_id": user_id,
        "file_path": file_path,
        "original_filename": original_filename,
        "file_size_bytes": file_size_bytes,
        "file_hash": file_hash,
    }

    LOGGER.debug(f"Creating FIT file record: {file_metadata}")

    result = supabase.table("fit_files").insert(file_metadata).execute()

    if hasattr(result, "error") and result.error:
        LOGGER.error(f"Error saving FIT file metadata: {result.error}")
        raise HTTPException(status_code=500, detail="Failed to save FIT file metadata.")

    if not result.data or len(result.data) == 0:
        LOGGER.error("No data returned from fit_files insert")
        raise HTTPException(status_code=500, detail="Failed to save FIT file metadata.")

    fit_file_id = result.data[0].get("file_id") or result.data[0].get("id")
    LOGGER.info(f"Created FIT file record with id: {fit_file_id}")

    return fit_file_id


def decode_fit_file(fit_content: bytes) -> Tuple[dict, list]:
    """
    Decode a FIT file from bytes content.

    This function handles the complete decoding process:
    1. Writes content to temporary file
    2. Creates stream and decoder
    3. Reads FIT messages
    4. Cleans up temporary file

    IMPORTANT: Do NOT call decoder.is_fit() or decoder.check_integrity() before
    decoder.read() as these methods advance the stream position and cause read()
    to return empty results.

    Args:
        fit_content: Raw bytes of the FIT file

    Returns:
        Tuple of (messages dict, errors list)
        - messages: Dict with message types as keys (e.g., 'record_mesgs', 'session_mesgs')
        - errors: List of any decoding errors encountered

    Raises:
        Exception: If file operations or decoding fail critically
    """
    temp_file_path = None
    try:
        # Create temporary file with FIT content
        with tempfile.NamedTemporaryFile(delete=False, suffix=".fit") as temp_file:
            temp_file.write(fit_content)
            temp_file.flush()  # Critical: ensure content is written to disk
            temp_file_path = temp_file.name

            LOGGER.debug(
                f"Created temp FIT file: {temp_file_path} ({len(fit_content)} bytes)"
            )

            # Decode the FIT file INSIDE the with block (critical!)
            # This ensures the file handle remains valid during decoding
            stream = Stream.from_file(temp_file_path)
            decoder = Decoder(stream)

            # NOTE: Do NOT call decoder.is_fit() or decoder.check_integrity() before read()
            # These methods advance the stream position and prevent decoder.read() from working!

            messages, errors = decoder.read(
                apply_scale_and_offset=True,
                convert_types_to_strings=True,
                merge_heart_rates=True,
                convert_datetimes_to_dates=True,
            )

            LOGGER.debug(
                f"Decoded FIT file: {len(messages) if messages else 0} message types, "
                f"{len(errors) if errors else 0} errors"
            )

            return messages, errors

    finally:
        # Clean up temporary file
        if temp_file_path:
            try:
                os.unlink(temp_file_path)
                LOGGER.debug(f"Deleted temp file: {temp_file_path}")
            except Exception as e:
                LOGGER.warning(f"Failed to delete temp file {temp_file_path}: {e}")
                LOGGER.warning(f"Failed to delete temp file {temp_file_path}: {e}")
