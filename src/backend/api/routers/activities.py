"""
Central Activities router - fetches activities from Supabase database.
This router provides unified access to activities from all providers (Strava, Garmin, etc.).
"""

import os
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator, validator
from slowapi import Limiter
from slowapi.util import get_remote_address
from supabase import Client, create_client

from api.auth import User, get_current_user
from api.log import LOGGER
from api.models.sport_types import FIT_SPORT_ID_MAPPING, SportType
from api.training_status import calculate_training_status
from api.utils import get_user_supabase_client, post_processing_of_session
from api.utils.fit_value_validator import get_valid_fit_int, get_valid_fit_value

security_bearer = HTTPBearer()

# Initialize Supabase client
supabase_url = os.environ.get("PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("PRIVATE_SUPABASE_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("Missing required Supabase environment variables")

assert supabase_url is not None
assert supabase_key is not None

supabase: Client = create_client(supabase_url, supabase_key)

router = APIRouter(prefix="/activities", tags=["activities"])
limiter = Limiter(key_func=get_remote_address)


# TODO Anpassen
class ActivitySummary(BaseModel):
    id: str
    name: str
    activity_type: str
    provider: str
    distance: Optional[float]
    duration: Optional[int]
    start_date: str
    elevation_gain: Optional[float]
    average_heartrate: Optional[float]
    strava_activity_id: Optional[int] = None


class SessionSummary(BaseModel):
    id: str
    activity_id: str
    session_number: int
    title: Optional[str]
    sport: str
    sub_sport: Optional[str]
    start_time: str
    distance: Optional[float]
    duration: Optional[int]
    total_timer_time: Optional[float]
    total_elapsed_time: Optional[float]
    calories: Optional[int]
    elevation_gain: Optional[float]
    average_heartrate: Optional[float]
    max_heartrate: Optional[float]
    average_speed: Optional[float]
    max_speed: Optional[float]
    average_cadence: Optional[int]


class SessionsResponse(BaseModel):
    items: list[SessionSummary]
    total: int
    page: int
    perPage: int
    totalPages: int


class ActivityDetail(BaseModel):
    id: str
    user_id: str
    provider_id: str
    provider_activity_id: str
    name: str
    activity_type: str
    start_date: str
    distance: Optional[float]
    duration: Optional[int]
    elevation_gain: Optional[float]
    calories: Optional[float]
    average_heartrate: Optional[float]
    max_heartrate: Optional[float]
    average_speed: Optional[float]
    max_speed: Optional[float]
    average_power: Optional[float]
    max_power: Optional[float]
    description: Optional[str]
    provider_name: str
    strava_activity_id: Optional[int] = None


async def process_fit_messages(
    messages,
    fit_file_id,
    user_id,
    background_tasks: BackgroundTasks = None,
    upload_source: str = "manual",
    duplicate_of: Optional[str] = None,
    external_id: Optional[str] = None,
    device_name: Optional[str] = None,
):
    """
    Process FIT file messages and store them in the database according to the multi-provider schema.

    This function has been updated to work with the new database structure from migration 20250830210842_multi-provider.sql:
    - Uses UUIDs as primary keys (id) instead of numeric IDs
    - Sessions now include user_id for better data organization
    - Laps now reference both activity_id and session_id
    - Activities can include total_distance for summary information

    Enhanced Features:
    - Comprehensive input validation with detailed error messages
    - Robust error handling with proper exception logging
    - Detailed progress logging with emoji indicators
    - Graceful degradation: continues processing even if some components fail
    - Batched record processing with progress indicators for large datasets
    - Improved session and lap assignment logic
    - Better coordinate conversion handling
    - Background processing for large record datasets (>1000 records)
    - Duplicate handling: creates new activity linked to original via duplicate_of

    Args:
        messages: Parsed FIT file messages from garmin_fit_sdk
        fit_file_id: ID of the FIT file record in fit_files table
        user_id: UUID of the user who owns this activity
        background_tasks: Optional BackgroundTasks for async record processing
        upload_source: Source provider ('manual', 'wahoo', etc.)
        duplicate_of: Optional activity ID this is a duplicate of
        external_id: Optional external provider activity ID (e.g., Garmin activity ID, Strava activity ID)
        device_name: Optional human-readable device name from provider API (e.g., "Garmin Venu 2")

    Raises:
        HTTPException: For validation errors, unsupported file types, or critical failures
    """
    LOGGER.info(f"🚀 Starting to process FIT file {fit_file_id} for user {user_id}")

    try:
        # Validate input parameters
        if not messages:
            LOGGER.error(f"❌ Empty messages received for FIT file {fit_file_id}")
            raise HTTPException(status_code=400, detail="No FIT messages found")

        if not fit_file_id:
            LOGGER.error("❌ No fit_file_id provided")
            raise HTTPException(status_code=400, detail="FIT file ID is required")

        if not user_id:
            LOGGER.error("❌ No user_id provided")
            raise HTTPException(status_code=400, detail="User ID is required")

        # Check if file_id_mesgs exists and has data
        if "file_id_mesgs" not in messages or not messages["file_id_mesgs"]:
            LOGGER.error(f"❌ No file_id_mesgs found in FIT file {fit_file_id}")
            raise HTTPException(
                status_code=400, detail="Invalid FIT file: Missing file ID messages"
            )

        # Check file type
        try:
            fit_type = messages["file_id_mesgs"][0]["type"]
            LOGGER.info(
                f"📋 Processing FIT file of type: {fit_type} (file_id: {fit_file_id})"
            )
        except (KeyError, IndexError) as e:
            LOGGER.error(f"❌ Failed to extract FIT file type: {e}")
            raise HTTPException(
                status_code=400, detail="Invalid FIT file: Cannot determine file type"
            )

        # Process different FIT file types
        if fit_type == "activity":
            LOGGER.info(f"🏃 Processing activity FIT file {fit_file_id}")
            await _process_activity_fit(
                messages,
                fit_file_id,
                user_id,
                background_tasks,
                upload_source,
                duplicate_of,
                external_id,
                device_name,
            )
        elif fit_type == "workout":
            LOGGER.warning(
                f"🚧 Workout FIT files not yet supported (file_id: {fit_file_id})"
            )
            raise HTTPException(
                status_code=400, detail="Workout FIT files are not yet supported"
            )
        else:
            LOGGER.warning(
                f"⚠️ FIT file type '{fit_type}' not fully supported (file_id: {fit_file_id})"
            )
            raise HTTPException(
                status_code=400, detail=f"FIT file type '{fit_type}' is not supported"
            )

        # Update the fit_files table to mark as processed
        try:
            LOGGER.debug(f"📝 Updating fit_files table for file {fit_file_id}")
            update_result = (
                supabase.table("fit_files")
                .update({"last_processed": datetime.now().isoformat()})
                .eq("file_id", fit_file_id)
                .execute()
            )

            if not update_result.data:
                LOGGER.warning(
                    f"⚠️ Failed to update last_processed timestamp for file {fit_file_id}"
                )
            else:
                LOGGER.debug(
                    f"✅ Updated last_processed timestamp for file {fit_file_id}"
                )

        except Exception as e:
            LOGGER.error(f"❌ Failed to update fit_files table: {e}")
            # Don't raise here as the main processing was successful

        LOGGER.info(
            f"✅ Successfully processed FIT file {fit_file_id} for user {user_id}"
        )

    except HTTPException:
        LOGGER.error(f"❌ HTTPException during FIT processing for file {fit_file_id}")
        raise
    except Exception as e:
        LOGGER.error(
            f"❌ Unexpected error processing FIT messages for file {fit_file_id}: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to process FIT file: {str(e)}"
        )


async def _process_records_in_background(activity_id, record_mesgs, session_mesgs):
    """Background task to process record messages without blocking the main thread."""
    try:
        LOGGER.info(f"🔄 Background processing started for activity {activity_id}")
        _process_activity_records(activity_id, record_mesgs, session_mesgs)
        LOGGER.info(f"✅ Background processing completed for activity {activity_id}")
    except Exception as e:
        LOGGER.error(
            f"❌ Background processing failed for activity {activity_id}: {str(e)}",
            exc_info=True,
        )


async def _post_process_sessions_in_background(session_ids):
    """Background task to calculate HR loads for sessions."""
    try:
        LOGGER.info(f"🔄 Post-processing {len(session_ids)} sessions in background")
        for session_id in session_ids:
            await post_processing_of_session(session_id)
        calculate_training_status()
        LOGGER.info(f"✅ Post-processing completed for {len(session_ids)} sessions")
    except Exception as e:
        LOGGER.error(f"❌ Post-processing failed for sessions: {str(e)}", exc_info=True)


async def _process_activity_fit(
    messages,
    fit_file_id,
    user_id,
    background_tasks: BackgroundTasks = None,
    upload_source: str = "manual",
    duplicate_of: Optional[str] = None,
    external_id: Optional[str] = None,
    device_name: Optional[str] = None,
):
    """Process activity FIT files according to the database schema.

    Args:
        messages: Parsed FIT messages
        fit_file_id: ID of the FIT file
        user_id: User ID
        background_tasks: Optional BackgroundTasks for async processing of records
        upload_source: Source provider ('manual', 'wahoo', etc.)
        duplicate_of: Optional activity ID this is a duplicate of
        external_id: Optional external provider activity ID
        device_name: Optional human-readable device name from provider API
    """
    LOGGER.info(f"🏃 Starting activity FIT processing for file {fit_file_id}")

    try:
        num_sessions = 1
        total_elapsed_time = None
        total_distance = None
        manufacturer = None
        product = None

        # Extract device metadata from file_id_mesgs
        if "file_id_mesgs" in messages and messages["file_id_mesgs"]:
            file_id_msg = messages["file_id_mesgs"][0]
            manufacturer = file_id_msg.get("manufacturer")
            product = file_id_msg.get("product")

            if manufacturer or product:
                LOGGER.info(
                    f"🔧 Device info - Manufacturer: {manufacturer}, Product: {product}"
                )

        # Extract activity-level data
        if "activity_mesgs" in messages and messages["activity_mesgs"]:
            LOGGER.debug(
                f"📊 Found {len(messages['activity_mesgs'])} activity messages"
            )
            activity_msg = messages["activity_mesgs"][0]
            num_sessions = activity_msg.get("num_sessions", 1)
            total_elapsed_time = activity_msg.get("total_timer_time")
            total_distance = activity_msg.get("total_distance")

            LOGGER.info(
                f"📈 Activity summary - Sessions: {num_sessions}, "
                f"Duration: {total_elapsed_time}s, Distance: {total_distance}m"
            )
        else:
            LOGGER.warning(
                f"⚠️ No activity messages found in FIT file {fit_file_id}, using defaults"
            )

        # Create the main activity record
        LOGGER.debug(f"🗃️ Creating activity record for user {user_id}")
        activity_data = {
            "user_id": user_id,
            "num_sessions": num_sessions,
            "fit_file_id": fit_file_id,
            "upload_source": upload_source,  # 'manual' for uploads, 'wahoo' for Wahoo webhook
            "total_elapsed_time": total_elapsed_time,
            "total_distance": total_distance,
            "manufacturer": manufacturer,
            "product": str(product) if product is not None else None,
            "external_id": external_id,
            "device_name": device_name,
        }

        # Add duplicate_of if this is a duplicate upload
        if duplicate_of:
            activity_data["duplicate_of"] = duplicate_of
            LOGGER.info(f"📋 Creating duplicate activity linked to {duplicate_of}")

        try:
            activity_result = (
                supabase.table("activities").insert(activity_data).execute()
            )
            if not activity_result.data:
                LOGGER.error("❌ Failed to create activity record - no data returned")
                raise HTTPException(
                    status_code=500, detail="Failed to create activity record"
                )

            activity_id = activity_result.data[0]["id"]
            LOGGER.info(f"✅ Created activity {activity_id} for user {user_id}")

        except Exception as e:
            LOGGER.error(
                f"❌ Database error creating activity: {str(e)}", exc_info=True
            )
            raise HTTPException(
                status_code=500, detail=f"Failed to create activity record: {str(e)}"
            )

        # Process sessions
        session_mesgs = messages.get("session_mesgs", [])
        LOGGER.info(f"🏃 Found {len(session_mesgs)} session messages to process")

        if not session_mesgs:
            LOGGER.warning("⚠️ No session messages found, creating default session")
            # Create a default session from available data
            session_mesgs = [{}]

        session_ids = []
        for session_idx, session_msg in enumerate(session_mesgs):
            try:
                LOGGER.debug(
                    f"📝 Processing session {session_idx + 1}/{len(session_mesgs)}"
                )
                session_id = _create_session_record(
                    activity_id, user_id, session_idx, session_msg
                )
                session_ids.append(session_id)

                # Process laps for this session
                _process_session_laps(
                    activity_id, session_id, session_idx, session_msg, messages
                )

            except Exception as e:
                LOGGER.error(
                    f"❌ Failed to process session {session_idx}: {str(e)}",
                    exc_info=True,
                )
                # Continue with other sessions rather than failing completely
                continue

        if not session_ids:
            LOGGER.error(f"❌ Failed to create any sessions for activity {activity_id}")
            raise HTTPException(
                status_code=500, detail="Failed to create any sessions for activity"
            )

        # Process record messages (time series data)
        record_mesgs = messages.get("record_mesgs", [])
        LOGGER.info(f"📊 Found {len(record_mesgs)} record messages to process")

        if record_mesgs:
            # If BackgroundTasks is available and there are many records, process in background
            if background_tasks and len(record_mesgs) > 1000:
                LOGGER.info(
                    f"⚡ Scheduling {len(record_mesgs)} records for background processing"
                )
                background_tasks.add_task(
                    _process_records_in_background,
                    activity_id,
                    record_mesgs,
                    session_mesgs,
                )
                background_tasks.add_task(
                    _post_process_sessions_in_background, session_ids
                )
            else:
                # Process synchronously for small files or when no background tasks available
                _process_activity_records(activity_id, record_mesgs, session_mesgs)
                # calculate HR_loads
                for session_id in session_ids:
                    await post_processing_of_session(session_id)
                calculate_training_status()
        else:
            LOGGER.warning(f"⚠️ No record messages found in FIT file {fit_file_id}")

        LOGGER.info(
            f"✅ Completed activity FIT processing for file {fit_file_id} - created {len(session_ids)} sessions"
        )

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(
            f"❌ Unexpected error in _process_activity_fit for file {fit_file_id}: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to process activity FIT file: {str(e)}"
        )


def _process_session_laps(activity_id, session_id, session_idx, session_msg, messages):
    """Process laps for a specific session with improved error handling."""
    try:
        # Filter laps that belong to this session based on first_lap_index and num_laps from session
        lap_mesgs = messages.get("lap_mesgs", [])
        LOGGER.debug(
            f"🔄 Processing laps for session {session_idx} - found {len(lap_mesgs)} total lap messages"
        )

        first_lap_index = session_msg.get("first_lap_index", 0)
        num_laps = session_msg.get("num_laps", 0)

        # If we have lap information in the session, use it to filter laps
        if first_lap_index is not None and num_laps > 0:
            session_laps = lap_mesgs[first_lap_index : first_lap_index + num_laps]
            LOGGER.debug(
                f"📋 Using session lap index: {first_lap_index}-{first_lap_index + num_laps} ({num_laps} laps)"
            )
        else:
            # Fallback: assign laps based on timing or session index
            session_laps = []
            session_start = session_msg.get("start_time") or session_msg.get(
                "timestamp"
            )
            LOGGER.debug(
                f"⏰ Using timestamp-based lap assignment for session starting at {session_start}"
            )

            if session_start:
                for lap in lap_mesgs:
                    lap_start = lap.get("start_time") or lap.get("timestamp")
                    if lap_start and lap_start >= session_start:
                        # Check if this lap belongs to this session by comparing with next session start
                        belongs_to_session = True
                        if session_idx + 1 < len(messages.get("session_mesgs", [])):
                            next_session_start = messages["session_mesgs"][
                                session_idx + 1
                            ].get("start_time") or messages["session_mesgs"][
                                session_idx + 1
                            ].get("timestamp")
                            if next_session_start and lap_start >= next_session_start:
                                belongs_to_session = False

                        if belongs_to_session:
                            session_laps.append(lap)

        LOGGER.info(f"🏁 Processing {len(session_laps)} laps for session {session_id}")

        lap_count = 0
        for lap_idx, lap_msg in enumerate(session_laps):
            try:
                _create_lap_record(activity_id, session_id, lap_idx, lap_msg)
                lap_count += 1
            except Exception as e:
                LOGGER.error(
                    f"❌ Failed to create lap {lap_idx} for session {session_id}: {str(e)}"
                )
                # Continue with other laps
                continue

        LOGGER.debug(
            f"✅ Successfully created {lap_count}/{len(session_laps)} laps for session {session_id}"
        )

    except Exception as e:
        LOGGER.error(
            f"❌ Error processing laps for session {session_id}: {str(e)}",
            exc_info=True,
        )
        # Don't raise - laps are optional


def _process_activity_records(activity_id, record_mesgs, session_mesgs):
    """Process record messages into array-based format - one record row per session.

    OPTIMIZED VERSION:
    - Pre-fetches all sessions once (eliminates N+1 queries)
    - Batch processes records efficiently
    - Uses lookup maps for fast session matching
    """
    try:
        LOGGER.info(
            f"📊 Processing {len(record_mesgs)} record messages for activity {activity_id}"
        )

        # OPTIMIZATION 1: Pre-fetch all sessions once
        sessions_result = (
            supabase.table("sessions")
            .select("id, session_number, start_time")
            .eq("activity_id", activity_id)
            .execute()
        )

        if not sessions_result.data:
            LOGGER.warning(f"⚠️ No sessions found for activity {activity_id}")
            return

        # Create lookup maps: session_number -> (session_id, start_time)
        session_lookup = {}
        for session in sessions_result.data:
            session_number = session["session_number"]
            session_id = session["id"]
            start_time = session["start_time"]

            # Pre-convert start_time to datetime once
            if isinstance(start_time, str):
                start_time_dt = datetime.fromisoformat(
                    start_time.replace("Z", "+00:00")
                )
            else:
                start_time_dt = start_time

            session_lookup[session_number] = (session_id, start_time_dt)

        LOGGER.debug(f"✅ Pre-fetched {len(session_lookup)} sessions")

        # Fallback session (first session)
        fallback_session_id, fallback_start_time = session_lookup.get(0, (None, None))

        # Group records by session
        session_records = {}  # session_id -> record data arrays

        # OPTIMIZATION 2: Batch process records
        for i, record_msg in enumerate(record_mesgs):
            try:
                record_timestamp = record_msg.get("timestamp")
                if not record_timestamp:
                    continue

                # Convert timestamp once
                if isinstance(record_timestamp, str):
                    record_dt = datetime.fromisoformat(
                        record_timestamp.replace("Z", "+00:00")
                    )
                else:
                    record_dt = record_timestamp

                # OPTIMIZATION 3: Find session using pre-fetched lookup
                session_id = None
                session_start_dt = None

                if session_mesgs:
                    # Match record to session by timestamp
                    for session_idx, session in enumerate(session_mesgs):
                        session_start = session.get("start_time") or session.get(
                            "timestamp"
                        )
                        if session_start and record_dt >= session_start:
                            # Use lookup map instead of database query
                            if session_idx in session_lookup:
                                session_id, session_start_dt = session_lookup[
                                    session_idx
                                ]
                                break

                # Fallback to first session
                if not session_id and fallback_session_id:
                    session_id = fallback_session_id
                    session_start_dt = fallback_start_time

                if not session_id or not session_start_dt:
                    continue

                # Initialize session record arrays if needed
                if session_id not in session_records:
                    session_records[session_id] = {
                        "session_id": session_id,
                        "activity_id": activity_id,
                        "timestamp": [],
                        "latitude": [],
                        "longitude": [],
                        "altitude": [],
                        "heart_rate": [],
                        "cadence": [],
                        "speed": [],
                        "distance": [],
                        "power": [],
                        "temperature": [],
                        "position": [],
                    }

                # Calculate seconds from session start
                seconds_from_start = int((record_dt - session_start_dt).total_seconds())

                # Convert semicircles to degrees for GPS coordinates
                latitude = record_msg.get("position_lat")
                longitude = record_msg.get("position_long")

                if latitude is not None and latitude != 0:
                    latitude = latitude * (180.0 / 2**31)
                else:
                    latitude = None

                if longitude is not None and longitude != 0:
                    longitude = longitude * (180.0 / 2**31)
                else:
                    longitude = None

                # Create geography point if we have coordinates
                position = None
                if latitude is not None and longitude is not None:
                    position = f"POINT({longitude} {latitude})"

                # Append data to arrays
                session_records[session_id]["timestamp"].append(seconds_from_start)
                session_records[session_id]["latitude"].append(latitude)
                session_records[session_id]["longitude"].append(longitude)
                session_records[session_id]["altitude"].append(
                    record_msg.get("altitude") or record_msg.get("enhanced_altitude")
                )
                session_records[session_id]["heart_rate"].append(
                    record_msg.get("heart_rate")
                )
                session_records[session_id]["cadence"].append(record_msg.get("cadence"))
                session_records[session_id]["speed"].append(
                    record_msg.get("speed") or record_msg.get("enhanced_speed")
                )
                session_records[session_id]["distance"].append(
                    record_msg.get("distance")
                )
                session_records[session_id]["power"].append(record_msg.get("power"))
                session_records[session_id]["temperature"].append(
                    record_msg.get("temperature")
                )
                session_records[session_id]["position"].append(position)

                # Log progress every 5000 records
                if (i + 1) % 5000 == 0:
                    LOGGER.debug(
                        f"📈 Processed {i + 1}/{len(record_mesgs)} record messages"
                    )

            except Exception as e:
                LOGGER.warning(f"⚠️ Failed to process record {i}: {str(e)}")
                continue

        # Insert one record row per session
        total_inserted = 0
        for session_id, record_data in session_records.items():
            try:
                result = supabase.table("records").insert(record_data).execute()
                if result.data:
                    total_inserted += 1
                    array_length = len(record_data["timestamp"])
                    LOGGER.info(
                        f"✅ Created record for session {session_id} with {array_length} data points"
                    )
            except Exception as e:
                LOGGER.error(
                    f"❌ Error inserting record for session {session_id}: {str(e)}"
                )
                continue

        LOGGER.info(
            f"📊 Records processing complete: Created {total_inserted} record rows for {len(session_records)} sessions"
        )

    except Exception as e:
        LOGGER.error(f"❌ Error in _process_activity_records: {str(e)}", exc_info=True)
        # Don't raise - records are optional


def _create_session_record(activity_id, user_id, session_number, session_msg):
    """Create a session record from FIT session message with improved error handling."""
    LOGGER.debug(f"🏃 Creating session {session_number} for activity {activity_id}")

    try:
        # Map FIT sport types to our sport names using centralized mapping
        sport = session_msg.get("sport", 2)  # Default to cycling
        if isinstance(sport, int):
            sport_str = str(sport)
            sport_enum = FIT_SPORT_ID_MAPPING.get(sport_str, SportType.GENERIC)
            sport_name = sport_enum.value
        else:
            sport_name = str(sport).lower()

        sub_sport = session_msg.get("sub_sport")
        if isinstance(sub_sport, int):
            # Map common sub-sport values
            sub_sport_mapping = {1: "mountain", 2: "road", 3: "track", 4: "trail"}
            sub_sport = sub_sport_mapping.get(sub_sport, "generic")

        LOGGER.debug(
            f"🏃 Session {session_number}: sport={sport_name}, sub_sport={sub_sport}"
        )

        # Note: Title will be set during post-processing in session_custom_data
        start_time = session_msg.get("start_time") or session_msg.get("timestamp")

        # Convert timestamp to ISO format if it's a datetime object
        if start_time and hasattr(start_time, "isoformat"):
            start_time_iso = start_time.isoformat()
        else:
            start_time_iso = start_time

        # Extract feel and rpe from FIT file (will be moved to session_custom_data during post-processing)
        workout_feel = session_msg.get("workout_feel")
        workout_rpe = session_msg.get("workout_rpe")

        # Note: session_custom_data will be created/linked during post-processing
        # Title will be set in session_custom_data during post-processing
        session_data = {
            "user_id": user_id,
            "activity_id": activity_id,
            "session_number": session_number,
            "sport": sport_name,
            "sub_sport": sub_sport,
            "start_time": start_time_iso,
            "total_distance": get_valid_fit_value(
                session_msg.get("total_distance"), expected_type="uint32"
            ),
            "total_elapsed_time": get_valid_fit_value(
                session_msg.get("total_elapsed_time"), expected_type="uint32"
            ),
            "total_timer_time": get_valid_fit_value(
                session_msg.get("total_timer_time"), expected_type="uint32"
            ),
            "total_calories": get_valid_fit_int(
                session_msg.get("total_calories"), expected_type="uint16"
            ),
            "avg_heart_rate": get_valid_fit_int(
                session_msg.get("avg_heart_rate"), expected_type="uint8"
            ),
            "max_heart_rate": get_valid_fit_int(
                session_msg.get("max_heart_rate"), expected_type="uint8"
            ),
            "avg_speed": get_valid_fit_value(
                session_msg.get("avg_speed"),
                session_msg.get("enhanced_avg_speed"),
                expected_type="uint16",
            ),
            "max_speed": get_valid_fit_value(
                session_msg.get("max_speed"),
                session_msg.get("enhanced_max_speed"),
                expected_type="uint16",
            ),
            "avg_cadence": get_valid_fit_int(
                session_msg.get("avg_cadence"), expected_type="uint8"
            ),
            "total_elevation_gain": get_valid_fit_value(
                session_msg.get("total_ascent"), expected_type="uint16"
            ),
            "feel": get_valid_fit_int(workout_feel, expected_type="uint8"),
            "rpe": get_valid_fit_int(workout_rpe, expected_type="uint8"),
        }

        # Remove None values
        session_data = {k: v for k, v in session_data.items() if v is not None}

        LOGGER.debug(f"📝 Inserting session data: {len(session_data)} fields")
        session_result = supabase.table("sessions").insert(session_data).execute()
        if not session_result.data:
            LOGGER.error("❌ Failed to create session record - no data returned")
            raise HTTPException(
                status_code=500, detail="Failed to create session record"
            )

        session_id = session_result.data[0]["id"]
        LOGGER.info(f"✅ Created session {session_id} for activity {activity_id}")
        return session_id

    except Exception as e:
        LOGGER.error(
            f"❌ Error creating session {session_number}: {str(e)}", exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to create session: {str(e)}"
        )


def _create_lap_record(activity_id, session_id, lap_number, lap_msg):
    """Create a lap record from FIT lap message with improved error handling."""
    LOGGER.debug(f"🏁 Creating lap {lap_number} for session {session_id}")

    try:
        lap_data = {
            "activity_id": activity_id,
            "session_id": session_id,
            "lap_number": lap_number,
            "start_time": lap_msg.get("start_time") or lap_msg.get("timestamp"),
            "total_distance": get_valid_fit_value(
                lap_msg.get("total_distance"), expected_type="uint32"
            ),
            "total_elapsed_time": get_valid_fit_value(
                lap_msg.get("total_elapsed_time"), expected_type="uint32"
            ),
            "total_timer_time": get_valid_fit_value(
                lap_msg.get("total_timer_time"), expected_type="uint32"
            ),
            "avg_heart_rate": get_valid_fit_int(
                lap_msg.get("avg_heart_rate"), expected_type="uint8"
            ),
            "max_heart_rate": get_valid_fit_int(
                lap_msg.get("max_heart_rate"), expected_type="uint8"
            ),
            "avg_speed": get_valid_fit_value(
                lap_msg.get("avg_speed"),
                lap_msg.get("enhanced_avg_speed"),
                expected_type="uint16",
            ),
            "max_speed": get_valid_fit_value(
                lap_msg.get("max_speed"),
                lap_msg.get("enhanced_max_speed"),
                expected_type="uint16",
            ),
            "total_calories": get_valid_fit_int(
                lap_msg.get("total_calories"), expected_type="uint16"
            ),
            "avg_cadence": get_valid_fit_int(
                lap_msg.get("avg_cadence"), expected_type="uint8"
            ),
            "total_elevation_gain": get_valid_fit_value(
                lap_msg.get("total_ascent"), expected_type="uint16"
            ),
        }

        # Convert timestamps to ISO format
        if lap_data["start_time"] and hasattr(lap_data["start_time"], "isoformat"):
            lap_data["start_time"] = lap_data["start_time"].isoformat()

        # Remove None values
        lap_data = {k: v for k, v in lap_data.items() if v is not None}

        LOGGER.debug(f"📝 Inserting lap data: {len(lap_data)} fields")
        lap_result = supabase.table("laps").insert(lap_data).execute()
        if not lap_result.data:
            LOGGER.error("❌ Failed to create lap record - no data returned")
            raise HTTPException(status_code=500, detail="Failed to create lap record")

        lap_id = lap_result.data[0]["id"]
        LOGGER.info(f"✅ Created lap {lap_id} for session {session_id}")
        return lap_id

    except Exception as e:
        LOGGER.error(f"❌ Error creating lap {lap_number}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create lap: {str(e)}")


@router.get("/sessions")
async def list_sessions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sport: Optional[str] = Query(None, description="Filter by sport type"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get paginated list of sessions for the current user."""
    try:
        LOGGER.info(
            f"🔍 Fetching sessions for user {current_user.id}, page={page}, per_page={per_page}, sport={sport}"
        )
        LOGGER.debug(
            f"🔑 JWT token (first 20 chars): {credentials.credentials[:20]}..."
        )

        # Create user-specific Supabase client with JWT token
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Calculate offset
        offset = (page - 1) * per_page

        # Build query for sessions with user's JWT
        # Filter out sessions from duplicate activities (activities.duplicate_of IS NOT NULL)
        # JOIN with session_custom_data to get title
        query = (
            user_supabase.table("sessions")
            .select("*, activities!inner(duplicate_of), session_custom_data(title)")
            .eq("user_id", current_user.id)
            .is_(
                "activities.duplicate_of", "null"
            )  # Only show non-duplicate activities
            .order("start_time", desc=True)
        )

        # Add sport filter if specified
        if sport:
            query = query.eq("sport", sport)
            LOGGER.debug(f"🏃 Added sport filter: {sport}")

        # Get paginated results
        LOGGER.debug(f"📊 Executing query with offset={offset}, limit={per_page}")
        sessions_response = query.range(offset, offset + per_page - 1).execute()
        LOGGER.debug(
            f"✅ Query executed successfully, got {len(sessions_response.data) if sessions_response.data else 0} sessions"
        )

        # Get total count for pagination
        LOGGER.debug("📊 Fetching total count")
        count_query = (
            user_supabase.table("sessions")
            .select("id, activities!inner(duplicate_of)", count="exact")  # type: ignore
            .eq("user_id", current_user.id)
            .is_(
                "activities.duplicate_of", "null"
            )  # Only count non-duplicate activities
        )

        if sport:
            count_query = count_query.eq("sport", sport)

        count_response = count_query.execute()
        total_count = count_response.count or 0
        LOGGER.debug(f"✅ Total count: {total_count}")

        # Format sessions
        sessions = []
        for session in sessions_response.data:
            # Get title from session_custom_data, fallback to sport
            custom_data = session.get("session_custom_data")
            title = custom_data.get("title") if custom_data else None
            if not title:
                title = (
                    session["sport"].replace("_", " ").title()
                    if session.get("sport")
                    else "Activity"
                )

            sessions.append(
                SessionSummary(
                    id=session["id"],
                    activity_id=session["activity_id"],
                    session_number=session["session_number"],
                    title=title,
                    sport=session["sport"],
                    sub_sport=session.get("sub_sport"),
                    start_time=session["start_time"],
                    distance=session.get("total_distance"),
                    duration=int(session.get("total_elapsed_time"))
                    if session.get("total_elapsed_time")
                    else None,
                    total_timer_time=session.get("total_timer_time"),
                    total_elapsed_time=session.get("total_elapsed_time"),
                    calories=session.get("total_calories"),
                    elevation_gain=session.get("total_elevation_gain"),
                    average_heartrate=session.get("avg_heart_rate"),
                    max_heartrate=session.get("max_heart_rate"),
                    average_speed=session.get("avg_speed"),
                    max_speed=session.get("max_speed"),
                    average_cadence=session.get("avg_cadence"),
                )
            )

        LOGGER.info(f"📋 Retrieved {len(sessions)} sessions for user {current_user.id}")

        return SessionsResponse(
            items=sessions,
            total=total_count,
            page=page,
            perPage=per_page,
            totalPages=(total_count + per_page - 1) // per_page,
        )

    except Exception as e:
        LOGGER.error(f"❌ Error fetching sessions: {e}", exc_info=True)
        # Include more details in the error response
        error_detail = str(e)
        if hasattr(e, "__dict__"):
            LOGGER.error(f"📋 Error attributes: {e.__dict__}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch sessions: {error_detail}"
        )


# NOTE: All specific /sessions/* routes MUST come BEFORE the parameterized /sessions/{session_id} route
# to avoid FastAPI treating literal paths like "date-range" as session IDs


@router.get("/sessions/date-range")
async def get_sessions_by_date_range(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    sport: Optional[str] = Query(None, description="Filter by sport type"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get sessions within a specific date range."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Build query for sessions in date range
        # Filter out sessions from duplicate activities
        # JOIN with session_custom_data to get title
        query = (
            user_supabase.table("sessions")
            .select("*, activities!inner(duplicate_of), session_custom_data(title)")
            .eq("user_id", current_user.id)
            .is_(
                "activities.duplicate_of", "null"
            )  # Only show non-duplicate activities
            .gte("start_time", start_date)
            .lte("start_time", end_date + "T23:59:59")
            .order("start_time", desc=True)
        )

        # Add sport filter if specified
        if sport:
            query = query.eq("sport", sport)

        sessions_response = query.execute()

        # Format sessions
        sessions = []
        for session in sessions_response.data:
            # Get title from session_custom_data, fallback to sport
            custom_data = session.get("session_custom_data")
            title = custom_data.get("title") if custom_data else None
            if not title:
                title = (
                    session["sport"].replace("_", " ").title()
                    if session.get("sport")
                    else "Activity"
                )

            sessions.append(
                SessionSummary(
                    id=session["id"],
                    activity_id=session["activity_id"],
                    session_number=session["session_number"],
                    title=title,
                    sport=session["sport"],
                    sub_sport=session.get("sub_sport"),
                    start_time=session["start_time"],
                    distance=session.get("total_distance"),
                    duration=int(session.get("total_elapsed_time"))
                    if session.get("total_elapsed_time")
                    else None,
                    total_timer_time=session.get("total_timer_time"),
                    total_elapsed_time=session.get("total_elapsed_time"),
                    calories=session.get("total_calories"),
                    elevation_gain=session.get("total_elevation_gain"),
                    average_heartrate=session.get("avg_heart_rate"),
                    max_heartrate=session.get("max_heart_rate"),
                    average_speed=session.get("avg_speed"),
                    max_speed=session.get("max_speed"),
                    average_cadence=session.get("avg_cadence"),
                )
            )

        LOGGER.info(
            f"📋 Retrieved {len(sessions)} sessions in date range {start_date} to {end_date}"
        )

        return {
            "sessions": sessions,
            "start_date": start_date,
            "end_date": end_date,
            "total": len(sessions),
            "sport_filter": sport,
        }

    except Exception as e:
        LOGGER.error(f"❌ Error fetching sessions by date range: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch sessions by date range"
        )


@router.get("/sessions/by-date")
async def get_sessions_by_date(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    sport: Optional[str] = Query(None, description="Filter by sport type"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get sessions for a specific date."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Build query for sessions on specific date
        # Filter out sessions from duplicate activities
        query = (
            user_supabase.table("sessions")
            .select("*, activities!inner(duplicate_of)")
            .eq("user_id", current_user.id)
            .is_(
                "activities.duplicate_of", "null"
            )  # Only show non-duplicate activities
            .gte("start_time", date)
            .lt("start_time", date + "T23:59:59")
            .order("start_time", desc=False)
        )

        # Add sport filter if specified
        if sport:
            query = query.eq("sport", sport)

        sessions_response = query.execute()

        # Format sessions
        sessions = []
        total_distance = 0
        total_duration = 0

        for session in sessions_response.data:
            session_summary = SessionSummary(
                id=session["id"],
                activity_id=session["activity_id"],
                session_number=session["session_number"],
                sport=session["sport"],
                sub_sport=session.get("sub_sport"),
                start_time=session["start_time"],
                distance=session.get("total_distance"),
                duration=int(session.get("total_elapsed_time"))
                if session.get("total_elapsed_time")
                else None,
                calories=session.get("total_calories"),
                elevation_gain=session.get("total_elevation_gain"),
                average_heartrate=session.get("avg_heart_rate"),
                max_heartrate=session.get("max_heart_rate"),
                average_speed=session.get("avg_speed"),
                max_speed=session.get("max_speed"),
                average_cadence=session.get("avg_cadence"),
            )
            sessions.append(session_summary)

            # Accumulate totals
            if session.get("total_distance"):
                total_distance += session["total_distance"]
            if session.get("total_elapsed_time"):
                total_duration += session["total_elapsed_time"]

        LOGGER.info(f"📋 Retrieved {len(sessions)} sessions for date {date}")

        return {
            "date": date,
            "sessions": sessions,
            "summary": {
                "total_sessions": len(sessions),
                "total_distance": total_distance,
                "total_duration": total_duration,
            },
            "sport_filter": sport,
        }

    except Exception as e:
        LOGGER.error(f"❌ Error fetching sessions by date: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sessions by date")


@router.get("/sessions/calendar")
async def get_sessions_calendar(
    year: int = Query(..., description="Year"),
    month: int = Query(..., description="Month (1-12)"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get sessions for calendar view (grouped by date)."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Calculate start and end dates for the month
        import calendar
        from datetime import datetime

        # Get first and last day of month
        first_day = datetime(year, month, 1)
        last_day = datetime(year, month, calendar.monthrange(year, month)[1])

        # Build query for sessions in the month
        # Filter out sessions from duplicate activities
        query = (
            user_supabase.table("sessions")
            .select("*, activities!inner(duplicate_of)")
            .eq("user_id", current_user.id)
            .is_(
                "activities.duplicate_of", "null"
            )  # Only show non-duplicate activities
            .gte("start_time", first_day.isoformat())
            .lte("start_time", last_day.isoformat() + "T23:59:59")
            .order("start_time", desc=False)
        )

        sessions_response = query.execute()

        # Group sessions by date
        sessions_by_date = {}
        for session in sessions_response.data:
            # Extract date from start_time
            session_date = session["start_time"][:10]  # YYYY-MM-DD format

            if session_date not in sessions_by_date:
                sessions_by_date[session_date] = {
                    "date": session_date,
                    "sessions": [],
                    "total_distance": 0,
                    "total_duration": 0,
                }

            session_summary = SessionSummary(
                id=session["id"],
                activity_id=session["activity_id"],
                session_number=session["session_number"],
                sport=session["sport"],
                sub_sport=session.get("sub_sport"),
                start_time=session["start_time"],
                distance=session.get("total_distance"),
                duration=int(session.get("total_elapsed_time"))
                if session.get("total_elapsed_time")
                else None,
                calories=session.get("total_calories"),
                elevation_gain=session.get("total_elevation_gain"),
                average_heartrate=session.get("avg_heart_rate"),
                max_heartrate=session.get("max_heart_rate"),
                average_speed=session.get("avg_speed"),
                max_speed=session.get("max_speed"),
                average_cadence=session.get("avg_cadence"),
            )

            sessions_by_date[session_date]["sessions"].append(session_summary)

            # Add to totals
            if session.get("total_distance"):
                sessions_by_date[session_date]["total_distance"] += session[
                    "total_distance"
                ]
            if session.get("total_elapsed_time"):
                sessions_by_date[session_date]["total_duration"] += session[
                    "total_elapsed_time"
                ]

        LOGGER.info(
            f"📅 Retrieved calendar data for {year}-{month:02d}: {len(sessions_by_date)} days with sessions"
        )

        return {
            "year": year,
            "month": month,
            "sessions_by_date": sessions_by_date,
            "total_days_with_sessions": len(sessions_by_date),
        }

    except Exception as e:
        LOGGER.error(f"❌ Error fetching sessions calendar: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sessions calendar")


@router.get("/sessions/stats")
async def get_session_stats(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    sport: Optional[str] = Query(None, description="Filter by sport type"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get session statistics for a date range."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Build query for sessions in date range
        # Filter out sessions from duplicate activities
        query = (
            user_supabase.table("sessions")
            .select("*, activities!inner(duplicate_of)")
            .eq("user_id", current_user.id)
            .is_(
                "activities.duplicate_of", "null"
            )  # Only show non-duplicate activities
            .gte("start_time", start_date)
            .lte("start_time", end_date + "T23:59:59")
        )

        # Add sport filter if specified
        if sport:
            query = query.eq("sport", sport)

        sessions_response = query.execute()
        sessions = sessions_response.data

        # Calculate statistics
        total_sessions = len(sessions)
        total_distance = sum(s.get("total_distance", 0) or 0 for s in sessions)
        total_duration = sum(s.get("total_elapsed_time", 0) or 0 for s in sessions)
        total_calories = sum(s.get("total_calories", 0) or 0 for s in sessions)
        total_elevation = sum(s.get("total_elevation_gain", 0) or 0 for s in sessions)

        # Sport breakdown
        sports_breakdown = {}
        for session in sessions:
            sport_name = session.get("sport", "unknown")
            if sport_name not in sports_breakdown:
                sports_breakdown[sport_name] = {
                    "count": 0,
                    "total_distance": 0,
                    "total_duration": 0,
                }
            sports_breakdown[sport_name]["count"] += 1
            sports_breakdown[sport_name]["total_distance"] += (
                session.get("total_distance", 0) or 0
            )
            sports_breakdown[sport_name]["total_duration"] += (
                session.get("total_elapsed_time", 0) or 0
            )

        # Average calculations
        avg_distance = total_distance / total_sessions if total_sessions > 0 else 0
        avg_duration = total_duration / total_sessions if total_sessions > 0 else 0

        LOGGER.info(
            f"📊 Generated session stats for {start_date} to {end_date}: {total_sessions} sessions"
        )

        return {
            "start_date": start_date,
            "end_date": end_date,
            "sport_filter": sport,
            "total_sessions": total_sessions,
            "total_distance": total_distance,
            "total_duration": total_duration,
            "total_calories": total_calories,
            "total_elevation_gain": total_elevation,
            "average_distance": avg_distance,
            "average_duration": avg_duration,
            "sports_breakdown": sports_breakdown,
        }

    except Exception as e:
        LOGGER.error(f"❌ Error generating session stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate session stats")


@router.get("/sessions/{session_id}")
async def get_session_detail(
    session_id: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Get detailed information for a specific session.

    IMPORTANT: This endpoint returns SESSION data, not activity data.
    A session is an individual training session (e.g., one run, one bike ride).
    An activity can contain multiple sessions (e.g., a triathlon FIT file).
    """
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format")

        # Get session from database with parent activity's metadata
        response = (
            user_supabase.table("sessions")
            .select(
                "*, activities!inner(external_id, upload_source, device_name, manufacturer, product)"
            )
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session_data = response.data[0]

        # Flatten the activity metadata to the session level for easier access
        if session_data.get("activities") and isinstance(
            session_data["activities"], dict
        ):
            activities = session_data["activities"]
            external_id = activities.get("external_id")
            upload_source = activities.get("upload_source")

            # Flatten all activity metadata fields
            session_data["external_id"] = external_id
            session_data["upload_source"] = upload_source
            session_data["device_name"] = activities.get("device_name")
            session_data["manufacturer"] = activities.get("manufacturer")
            session_data["product"] = activities.get("product")

            # For backward compatibility, populate strava_activity_id if it's a Strava activity
            if upload_source == "strava" and external_id:
                try:
                    session_data["strava_activity_id"] = int(external_id)
                except (ValueError, TypeError):
                    session_data["strava_activity_id"] = None
            else:
                session_data["strava_activity_id"] = None

        # Remove nested activities object since we've flattened it
        session_data.pop("activities", None)

        LOGGER.info(f"📊 Retrieved session detail for {session_id}")

        return {"session": session_data}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error fetching session detail: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch session detail")


@router.get("/sessions/{session_id}/complete")
async def get_session_complete(
    session_id: str,
    include_records: bool = Query(True, description="Include session records"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Get complete session data in a single request for optimal performance.

    Returns:
    - Session detail (metrics, start time, etc.)
    - Custom data (HR load, trainer feedback, user feedback from session_custom_data table)
    - Session records (optional, GPS/HR/power time-series data)

    This endpoint combines 3-4 separate API calls into one for faster page loads.
    """
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format")

        # Fetch session detail with parent activity's metadata and custom data
        session_response = (
            user_supabase.table("sessions")
            .select(
                "*, activities!inner(external_id, upload_source, device_name, manufacturer, product), session_custom_data(*)"
            )
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not session_response.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session_data = session_response.data[0]

        # Flatten the activity metadata to the session level
        if session_data.get("activities") and isinstance(
            session_data["activities"], dict
        ):
            activities = session_data["activities"]
            external_id = activities.get("external_id")
            upload_source = activities.get("upload_source")

            # Flatten all activity metadata fields
            session_data["external_id"] = external_id
            session_data["upload_source"] = upload_source
            session_data["device_name"] = activities.get("device_name")
            session_data["manufacturer"] = activities.get("manufacturer")
            session_data["product"] = activities.get("product")

            # For backward compatibility, populate strava_activity_id if it's a Strava activity
            if upload_source == "strava" and external_id:
                try:
                    session_data["strava_activity_id"] = int(external_id)
                except (ValueError, TypeError):
                    session_data["strava_activity_id"] = None
            else:
                session_data["strava_activity_id"] = None
        session_data.pop("activities", None)

        # Extract custom data (trainer feedback, user feedback, HR load)
        custom_data = session_data.get("session_custom_data")
        trainer_feedback = None
        user_feedback = None
        hr_load = None

        if custom_data and isinstance(custom_data, dict):
            trainer_feedback = custom_data.get("llm_feedback")
            hr_load = custom_data.get("heart_rate_load")

            # Build user feedback object if present
            if (
                custom_data.get("feel") is not None
                or custom_data.get("rpe") is not None
            ):
                user_feedback = {
                    "feel": custom_data.get("feel"),
                    "rpe": custom_data.get("rpe"),
                    "created_at": custom_data.get("created_at"),
                    "updated_at": custom_data.get("updated_at"),
                }

        # Remove nested custom_data object since we've extracted the data
        session_data.pop("session_custom_data", None)

        # Add HR load to session data for backward compatibility
        session_data["heart_rate_load"] = hr_load

        # Fetch records if requested
        records_data = None
        if include_records:
            records_response = (
                user_supabase.table("records")
                .select("*")
                .eq("session_id", session_id)
                .limit(10000)
                .execute()
            )

            if records_response.data and len(records_response.data) > 0:
                # Format records in the same structure as /sessions/{id}/records endpoint
                record_row = records_response.data[0]
                timestamp_array = record_row.get("timestamp") or []
                array_length = len(timestamp_array)

                records_data = {
                    "session_start_time": session_data.get("start_time"),
                    "data": {
                        "timestamp": record_row.get("timestamp") or [],
                        "heart_rate": record_row.get("heart_rate") or [],
                        "cadence": record_row.get("cadence") or [],
                        "speed": record_row.get("speed") or [],
                        "distance": record_row.get("distance") or [],
                        "power": record_row.get("power") or [],
                        "latitude": record_row.get("latitude") or [],
                        "longitude": record_row.get("longitude") or [],
                        "altitude": record_row.get("altitude") or [],
                        "temperature": record_row.get("temperature") or [],
                    },
                    "length": array_length,
                }

        LOGGER.info(
            f"📊 Retrieved complete session data for {session_id} (records: {include_records})"
        )

        return {
            "session": session_data,
            "trainer_feedback": trainer_feedback,
            "user_feedback": user_feedback,
            "records": records_data,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error fetching complete session data: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch complete session data"
        )


@router.get("/list")
async def list_activities(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    provider: Optional[str] = Query(
        None, description="Filter by provider (strava, garmin, etc.)"
    ),
    activity_type: Optional[str] = Query(None, description="Filter by activity type"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get paginated list of activities for the current user from all providers."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Calculate offset
        offset = (page - 1) * per_page

        # Build query for activities with sessions data
        # We need to join activities with sessions to get sport/activity type and other details
        query = (
            user_supabase.table("activities")
            .select("""
                id,
                num_sessions,
                total_distance,
                total_elapsed_time,
                created_at,
                strava_activity_id,
                sessions(
                    sport,
                    sub_sport,
                    start_time,
                    total_distance,
                    total_elapsed_time,
                    total_calories,
                    avg_heart_rate,
                    max_heart_rate,
                    total_elevation_gain
                )
            """)
            .eq("user_id", current_user.id)
        )

        # Add activity type filter if specified (filter by session sport)
        if activity_type:
            query = query.eq("sessions.sport", activity_type)

        # Get paginated results
        activities_response = query.range(offset, offset + per_page - 1).execute()

        # Get total count for pagination
        count_query = (
            user_supabase.table("activities")
            .select("id", count="exact")  # type: ignore
            .eq("user_id", current_user.id)
        )

        if activity_type:
            count_query = count_query.eq("sessions.sport", activity_type)

        total_count = count_query.execute().count or 0

        # Format activities
        activities = []
        for activity in activities_response.data:
            # Get primary session data (first session or aggregate if multi-sport)
            session_data = activity.get("sessions", [])
            primary_session = session_data[0] if session_data else {}

            # Determine activity name/type
            activity_name = f"{primary_session.get('sport', 'Activity').title()}"
            if activity.get("num_sessions", 1) > 1:
                activity_name = (
                    f"Multi-sport Activity ({activity['num_sessions']} sessions)"
                )

            # Use activity-level data if available, otherwise aggregate from sessions
            total_distance = activity.get("total_distance")
            if not total_distance and session_data:
                total_distance = sum(
                    s.get("total_distance", 0) or 0 for s in session_data
                )

            total_duration = activity.get("total_elapsed_time")
            if not total_duration and session_data:
                total_duration = sum(
                    s.get("total_elapsed_time", 0) or 0 for s in session_data
                )

            # Get start date from first session
            start_date = primary_session.get("start_time") or activity.get("created_at")

            activities.append(
                ActivitySummary(
                    id=activity["id"],
                    name=activity_name,
                    activity_type=primary_session.get("sport", "unknown"),
                    provider="fit_file",  # Since we're working with FIT files primarily
                    distance=total_distance,
                    duration=int(total_duration) if total_duration else None,
                    start_date=start_date,
                    elevation_gain=primary_session.get("total_elevation_gain"),
                    average_heartrate=primary_session.get("avg_heart_rate"),
                    strava_activity_id=activity.get("strava_activity_id"),
                )
            )

        LOGGER.info(
            f"📋 Retrieved {len(activities)} activities for user {current_user.id}"
        )

        return {
            "items": activities,
            "total": total_count,
            "page": page,
            "perPage": per_page,
            "totalPages": (total_count + per_page - 1) // per_page,
            "filters": {"provider": provider, "activity_type": activity_type},
        }

    except Exception as e:
        LOGGER.error(f"❌ Error fetching activities: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activities")


@router.get("/{activity_id}/detail")
async def get_activity_detail(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get detailed information for a specific activity."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(activity_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid activity ID format")

        # Get activity from database with sessions information
        # JOIN with session_custom_data to get title
        response = (
            user_supabase.table("activities")
            .select("""
                id,
                user_id,
                num_sessions,
                total_distance,
                total_elapsed_time,
                created_at,
                fit_file_id,
                strava_response_id,
                strava_activity_id,
                sessions(
                    id,
                    sport,
                    sub_sport,
                    start_time,
                    total_distance,
                    total_elapsed_time,
                    total_timer_time,
                    total_calories,
                    avg_heart_rate,
                    max_heart_rate,
                    avg_speed,
                    max_speed,
                    avg_cadence,
                    total_elevation_gain,
                    session_custom_data(title)
                )
            """)
            .eq("id", activity_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Activity not found")

        activity_data = response.data[0]
        sessions = activity_data.get("sessions", [])
        primary_session = sessions[0] if sessions else {}

        # Aggregate data from sessions if not available at activity level
        total_distance = activity_data.get("total_distance")
        if not total_distance and sessions:
            total_distance = sum(s.get("total_distance", 0) or 0 for s in sessions)

        total_duration = activity_data.get("total_elapsed_time")
        if not total_duration and sessions:
            total_duration = sum(s.get("total_elapsed_time", 0) or 0 for s in sessions)

        # Determine provider
        provider_name = (
            "fit_file"
            if activity_data.get("fit_file_id")
            else "strava"
            if activity_data.get("strava_response_id")
            else "unknown"
        )

        # Get title from session_custom_data, fallback to sport
        custom_data = primary_session.get("session_custom_data")
        title = custom_data.get("title") if custom_data else None
        if not title:
            title = primary_session.get("sport", "Activity").replace("_", " ").title()

        # Create activity name - use title, fallback to sport
        activity_name = title
        if activity_data.get("num_sessions", 1) > 1:
            activity_name = (
                f"Multi-sport Activity ({activity_data['num_sessions']} sessions)"
            )

        activity = ActivityDetail(
            id=activity_data["id"],
            user_id=activity_data["user_id"],
            provider_id=provider_name,  # Using provider name since we don't have provider_id in new schema
            provider_activity_id=str(
                activity_data.get("fit_file_id")
                or activity_data.get("strava_response_id")
                or ""
            ),
            name=activity_name,
            activity_type=primary_session.get("sport", "unknown"),
            start_date=primary_session.get("start_time")
            or activity_data.get("created_at", ""),
            distance=total_distance,
            duration=int(total_duration) if total_duration else None,
            elevation_gain=primary_session.get("total_elevation_gain"),
            calories=primary_session.get("total_calories"),
            average_heartrate=primary_session.get("avg_heart_rate"),
            max_heartrate=primary_session.get("max_heart_rate"),
            average_speed=primary_session.get("avg_speed"),
            max_speed=primary_session.get("max_speed"),
            average_power=None,  # Power data would be in records table
            max_power=None,  # Power data would be in records table
            description=f"{activity_data.get('num_sessions', 1)} session(s)",
            provider_name=provider_name,
            strava_activity_id=activity_data.get("strava_activity_id"),
        )

        LOGGER.info(f"📊 Retrieved activity detail for {activity_id}")

        return {"activity": activity}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error fetching activity detail: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activity detail")


@router.get("/sessions/{session_id}/records")
async def get_session_records(
    session_id: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
    limit: int = Query(10000, ge=1, le=10000, description="Limit number of records"),
):
    """
    Get records for a specific session.

    IMPORTANT: Returns array-based format for optimal performance.
    Records are stored as arrays - one row per session with all data points.
    Frontend should process these arrays directly for charts.
    """
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format")

        # Check if session exists and belongs to user
        session_response = (
            user_supabase.table("sessions")
            .select("id, start_time")
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not session_response.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session_start_time = session_response.data[0]["start_time"]

        # Get the array-based record for this session
        records_response = (
            user_supabase.table("records")
            .select("*")
            .eq("session_id", session_id)
            .execute()
        )

        if not records_response.data or len(records_response.data) == 0:
            LOGGER.info(f"📊 No records found for session {session_id}")
            return {"session_start_time": session_start_time, "data": {}, "length": 0}

        # Return the array-based record directly
        record_row = records_response.data[0]

        # Get array length
        timestamp_array = record_row.get("timestamp") or []
        array_length = len(timestamp_array)

        LOGGER.info(
            f"📊 Retrieved record with {array_length} data points for session {session_id}"
        )

        return {
            "session_start_time": session_start_time,
            "data": {
                "timestamp": record_row.get("timestamp") or [],
                "heart_rate": record_row.get("heart_rate") or [],
                "cadence": record_row.get("cadence") or [],
                "speed": record_row.get("speed") or [],
                "distance": record_row.get("distance") or [],
                "power": record_row.get("power") or [],
                "latitude": record_row.get("latitude") or [],
                "longitude": record_row.get("longitude") or [],
                "altitude": record_row.get("altitude") or [],
                "temperature": record_row.get("temperature") or [],
            },
            "length": array_length,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error fetching session records: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch session records")


@router.get("/stats")
def _get_stream_unit(stream_name):
    """Get the unit for a given stream type."""
    units = {
        "time": "seconds",
        "latlng": "degrees",
        "altitude": "meters",
        "heartrate": "bpm",
        "cadence": "rpm",
        "velocity_smooth": "m/s",
        "distance": "meters",
        "watts": "watts",
        "temp": "celsius",
    }
    return units.get(stream_name, "")


@router.get("/stats")
async def get_activity_stats(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    days: int = Query(
        30, ge=1, le=365, description="Number of days to include in stats"
    ),
):
    """Get activity statistics for the current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Build base query for recent activities
        from datetime import datetime, timedelta

        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

        query = (
            user_supabase.table("activities")
            .select("""
                id,
                num_sessions,
                total_distance,
                total_elapsed_time,
                created_at,
                fit_file_id,
                strava_response_id,
                sessions(
                    sport,
                    total_distance,
                    total_elapsed_time,
                    total_elevation_gain
                )
            """)
            .eq("user_id", current_user.id)
            .gte("created_at", cutoff_date)
        )

        activities = query.execute().data

        # Calculate statistics
        total_activities = len(activities)
        total_distance = 0
        total_duration = 0
        total_elevation = 0

        # Activity type breakdown
        activity_types = {}
        providers_used = {}

        for activity in activities:
            # Aggregate data from activity or sessions
            activity_distance = activity.get("total_distance") or 0
            activity_duration = activity.get("total_elapsed_time") or 0

            # If no activity-level data, sum from sessions
            sessions = activity.get("sessions", [])
            if not activity_distance and sessions:
                activity_distance = sum(
                    s.get("total_distance", 0) or 0 for s in sessions
                )
            if not activity_duration and sessions:
                activity_duration = sum(
                    s.get("total_elapsed_time", 0) or 0 for s in sessions
                )

            # Sum elevation from sessions
            activity_elevation = sum(
                s.get("total_elevation_gain", 0) or 0 for s in sessions
            )

            total_distance += activity_distance
            total_duration += activity_duration
            total_elevation += activity_elevation

            # Determine provider
            provider_name = (
                "fit_file"
                if activity.get("fit_file_id")
                else "strava"
                if activity.get("strava_response_id")
                else "unknown"
            )
            providers_used[provider_name] = providers_used.get(provider_name, 0) + 1

            # Count activity types from sessions
            for session in sessions:
                activity_type = session.get("sport", "unknown")
                activity_types[activity_type] = activity_types.get(activity_type, 0) + 1

        LOGGER.info(
            f"📊 Generated stats for user {current_user.id}: {total_activities} activities in {days} days"
        )

        return {
            "period_days": days,
            "total_activities": total_activities,
            "total_distance_meters": total_distance,
            "total_duration_seconds": total_duration,
            "total_elevation_gain_meters": total_elevation,
            "activity_types": activity_types,
            "providers": providers_used,
            "filters": {"provider": provider},
        }

    except Exception as e:
        LOGGER.error(f"❌ Error generating activity stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate activity stats")


@router.post("/sessions/{session_id}/reprocess")
async def reprocess_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Reprocess a session - triggers post-processing tasks like HR load calculation,
    max heart rate updates, and feedback generation.
    """
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format")

        # Verify session belongs to user
        session_check = (
            user_supabase.table("sessions")
            .select("id")
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not session_check.data:
            raise HTTPException(status_code=404, detail="Session not found")

        LOGGER.info(f"🔄 Reprocessing session {session_id} for user {current_user.id}")

        # Call the post-processing function
        await post_processing_of_session(session_id)

        LOGGER.info(f"✅ Successfully reprocessed session {session_id}")

        return {"detail": "Session reprocessed successfully", "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error reprocessing session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reprocess session")


@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: str,
    delete_duplicates: bool = Query(
        True, description="If true, also delete all duplicate activities"
    ),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Delete a specific activity for the current user.

    Args:
        activity_id: The ID of the activity to delete
        delete_duplicates: If True, also deletes all activities that are duplicates of this one
        current_user: The authenticated user
        credentials: The user's credentials
    """

    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(activity_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid activity ID format")

        # Verify activity belongs to user
        activity_check = (
            user_supabase.table("activities")
            .select("id")
            .eq("id", activity_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not activity_check.data:
            raise HTTPException(status_code=404, detail="Activity not found")

        # Collect all activity IDs to delete
        activity_ids_to_delete = [activity_id]

        # If delete_duplicates is True, find all duplicate activities
        if delete_duplicates:
            duplicates_response = (
                user_supabase.table("activities")
                .select("id")
                .eq("duplicate_of", activity_id)
                .eq("user_id", current_user.id)
                .execute()
            )

            if duplicates_response.data:
                duplicate_ids = [dup["id"] for dup in duplicates_response.data]
                activity_ids_to_delete.extend(duplicate_ids)
                LOGGER.info(
                    f"🗑️ Found {len(duplicate_ids)} duplicate activities to delete along with {activity_id}"
                )

        deleted_count = 0
        # Delete each activity (original and duplicates if requested)
        for current_activity_id in activity_ids_to_delete:
            try:
                # Delete associated data in correct order due to foreign key constraints
                # 1. Delete records first
                supabase.table("records").delete().eq(
                    "activity_id", current_activity_id
                ).execute()

                # 2. Delete laps
                supabase.table("laps").delete().eq(
                    "activity_id", current_activity_id
                ).execute()

                # 3. Delete sessions
                supabase.table("sessions").delete().eq(
                    "activity_id", current_activity_id
                ).execute()

                # 4. Get the fit_file_id, external_id, and upload_source from the activity before deletion
                activity_data = (
                    user_supabase.table("activities")
                    .select("fit_file_id, external_id, upload_source")
                    .eq("id", current_activity_id)
                    .single()
                    .execute()
                )

                fit_file_id = (
                    activity_data.data.get("fit_file_id")
                    if activity_data.data
                    else None
                )
                external_id = (
                    activity_data.data.get("external_id")
                    if activity_data.data
                    else None
                )
                upload_source = (
                    activity_data.data.get("upload_source")
                    if activity_data.data
                    else None
                )

                # 5. Delete the activity
                supabase.table("activities").delete().eq(
                    "id", current_activity_id
                ).execute()

                # 6. Delete any strava_responses record
                if upload_source == "strava" and external_id:
                    try:
                        supabase.table("strava_responses").delete().eq(
                            "strava_id", int(external_id)
                        ).execute()
                        LOGGER.info(
                            f"🗑️ Deleted strava_responses record associated with: {external_id}"
                        )
                    except Exception as strava_error:
                        LOGGER.warning(
                            f"⚠️ Failed to delete strava_responses record: {strava_error}"
                        )

                # 7. Delete any fit_files record and the associated file from storage
                if fit_file_id:
                    try:
                        # Get the file_path before deleting the record
                        fit_file_data = (
                            supabase.table("fit_files")
                            .select("file_path")
                            .eq("file_id", fit_file_id)
                            .single()
                            .execute()
                        )

                        file_path = (
                            fit_file_data.data.get("file_path")
                            if fit_file_data.data
                            else None
                        )

                        # Delete the file from storage
                        if file_path:
                            try:
                                supabase.storage.from_("fit-files").remove([file_path])
                                LOGGER.info(
                                    f"🗑️ Deleted FIT file from storage: {file_path}"
                                )
                            except Exception as storage_error:
                                LOGGER.warning(
                                    f"⚠️ Failed to delete FIT file from storage ({file_path}): {storage_error}"
                                )

                        # Delete the fit_files record
                        supabase.table("fit_files").delete().eq(
                            "file_id", fit_file_id
                        ).execute()
                        LOGGER.info(f"🗑️ Deleted fit_files record: {fit_file_id}")

                    except Exception as fit_error:
                        LOGGER.warning(
                            f"⚠️ Failed to delete fit_files record or storage file: {fit_error}"
                        )

                LOGGER.info(
                    f"🗑️ Deleted activity {current_activity_id} and all associated data for user {current_user.id}"
                )
                deleted_count += 1

            except Exception as activity_error:
                LOGGER.error(
                    f"❌ Error deleting activity {current_activity_id}: {activity_error}"
                )
                # Continue with other activities even if one fails
                continue

        response_detail = f"Successfully deleted {deleted_count} activity(ies)"
        if delete_duplicates and deleted_count > 1:
            response_detail += f" (1 original + {deleted_count - 1} duplicate(s))"

        return {"detail": response_detail, "deleted_count": deleted_count}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error deleting activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete activity")


class SessionFeedbackUpdate(BaseModel):
    feel: Optional[int] = Field(
        None,
        description="Feeling (0=Very Weak, 25=Weak, 50=Normal, 75=Strong, 100=Very Strong)",
    )
    rpe: Optional[int] = Field(
        None, description="Rate of Perceived Exertion (0-100 scale)"
    )

    @validator("feel")
    def validate_feel(cls, v):
        if v is not None and v not in [0, 25, 50, 75, 100]:
            raise ValueError("feel must be one of: 0, 25, 50, 75, 100")
        return v

    @validator("rpe")
    def validate_rpe(cls, v):
        if v is not None and v not in [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]:
            raise ValueError(
                "rpe must be one of: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100"
            )
        return v


@router.post("/sessions/{session_id}/feedback")
async def update_session_feedback(
    session_id: str,
    feedback: SessionFeedbackUpdate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Create or update user feedback for a session.

    Updates the session_custom_data table with user's feel and rpe values.
    """
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format")

        # Verify session belongs to user and get custom_data_id
        session_check = (
            user_supabase.table("sessions")
            .select("id, session_custom_data_id")
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not session_check.data:
            raise HTTPException(status_code=404, detail="Session not found")

        custom_data_id = session_check.data[0].get("session_custom_data_id")

        if not custom_data_id:
            LOGGER.error(f"❌ No custom_data_id found for session {session_id}")
            raise HTTPException(
                status_code=500,
                detail="Session has no custom data record. Please contact support.",
            )

        # Update the custom data with user feedback
        update_data = {}
        if feedback.feel is not None:
            update_data["feel"] = feedback.feel
        if feedback.rpe is not None:
            update_data["rpe"] = feedback.rpe

        if not update_data:
            raise HTTPException(
                status_code=400, detail="No feedback data provided to update"
            )

        result = (
            supabase.table("session_custom_data")
            .update(update_data)
            .eq("id", custom_data_id)
            .execute()
        )

        if not result.data:
            LOGGER.error(f"❌ Failed to update custom data {custom_data_id}")
            raise HTTPException(status_code=500, detail="Failed to update feedback")

        LOGGER.info(
            f"✅ Updated feedback for session {session_id} (custom_data: {custom_data_id})"
        )

        return {
            "detail": "Feedback updated successfully",
            "session_id": session_id,
            "feedback": result.data[0],
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error updating session feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update session feedback")


@router.get("/sessions/{session_id}/feedback")
async def get_session_feedback(
    session_id: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Get user feedback for a session.

    Retrieves feel and rpe from session_custom_data table.
    """
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format")

        # Get session with custom data
        session_response = (
            user_supabase.table("sessions")
            .select("id, session_custom_data(*)")
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not session_response.data:
            raise HTTPException(status_code=404, detail="Session not found")

        custom_data = session_response.data[0].get("session_custom_data")

        if not custom_data:
            return {"session_id": session_id, "feedback": None}

        feedback = {
            "feel": custom_data.get("feel"),
            "rpe": custom_data.get("rpe"),
            "created_at": custom_data.get("created_at"),
            "updated_at": custom_data.get("updated_at"),
        }

        LOGGER.info(f"📊 Retrieved feedback for session {session_id}")

        return {"session_id": session_id, "feedback": feedback}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error fetching session feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch session feedback")


@router.delete("/sessions/{session_id}/feedback")
async def delete_session_feedback(
    session_id: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Delete user feedback for a session.

    Clears feel and rpe from session_custom_data table.
    Note: This does not delete the custom_data record itself (to preserve HR load and LLM feedback),
    it only clears the user feedback fields.
    """
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Validate UUID format
        try:
            UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format")

        # Verify session belongs to user and get custom_data_id
        session_check = (
            user_supabase.table("sessions")
            .select("id, session_custom_data_id")
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not session_check.data:
            raise HTTPException(status_code=404, detail="Session not found")

        custom_data_id = session_check.data[0].get("session_custom_data_id")

        if not custom_data_id:
            # No custom data means nothing to delete
            return {"detail": "No feedback to delete"}

        # Clear user feedback fields (keep HR load and LLM feedback)
        supabase.table("session_custom_data").update({"feel": None, "rpe": None}).eq(
            "id", custom_data_id
        ).execute()

        LOGGER.info(
            f"🗑️ Deleted feedback for session {session_id} (custom_data: {custom_data_id})"
        )

        return {"detail": "Feedback deleted successfully", "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error deleting session feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete session feedback")


@router.post("/upload-fit")
async def create_activity_from_fit(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="FIT file to upload and process"),
    current_user: User = Depends(get_current_user),
):
    """Upload and process a FIT file to create a new activity.

    Large files (>1000 records) will be processed in the background for faster response times.
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.lower().endswith(".fit"):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only .fit files are supported.",
            )

        # Check file size (limit to 10MB)
        if file.size and file.size > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400, detail="File too large. Maximum size is 10MB."
            )

        # Read file content
        file_content = await file.read()
        LOGGER.info(f"Processing FIT file: {file.filename} ({len(file_content)} bytes)")

        # Use shared utilities from fit_file_utils
        from api.utils.fit_file_utils import (
            calculate_file_hash,
            check_duplicate_file,
            create_fit_file_record,
            decode_fit_file,
            get_activity_id_from_fit_file,
            store_fit_file_to_storage,
            validate_fit_file_content,
        )

        # Validate file content
        validate_fit_file_content(file_content, file.filename)

        # Decode FIT file
        messages, errors = decode_fit_file(file_content)

        if len(errors) > 0:
            LOGGER.error(f"FIT file decoding errors: {errors}")
            raise HTTPException(status_code=400, detail="Failed to decode FIT file.")

        # Calculate file hash and check for duplicates
        file_hash = calculate_file_hash(file_content)
        existing_fit_file_id = check_duplicate_file(
            supabase, current_user.id, file_hash
        )

        # Handle duplicate detection
        duplicate_of_activity_id = None
        if existing_fit_file_id:
            # Find the activity ID associated with the existing FIT file
            duplicate_of_activity_id = get_activity_id_from_fit_file(
                supabase, existing_fit_file_id
            )
            LOGGER.info(
                f"Duplicate upload detected - will create new activity linked to {duplicate_of_activity_id}"
            )

        # Upload to storage (even if duplicate - user uploaded it again)
        file_path = store_fit_file_to_storage(
            supabase, current_user.id, file.filename, file_content
        )

        # Create database record (even for duplicates)
        fit_file_id = create_fit_file_record(
            supabase,
            current_user.id,
            file_path,
            file.filename,
            len(file_content),
            file_hash,
        )

        # Process FIT messages (manual upload source)
        await process_fit_messages(
            messages,
            fit_file_id,
            current_user.id,
            background_tasks,
            upload_source="manual",
            duplicate_of=duplicate_of_activity_id,
        )

        num_records = len(messages.get("record_mesgs", []))
        LOGGER.info(f"Successfully processed and stored FIT file {file.filename}")

        # Inform user if processing is happening in background
        processing_mode = "background" if num_records > 1000 else "synchronous"

        response = {
            "detail": "FIT file uploaded and processed successfully",
            "fit_file_id": fit_file_id,
            "file_path": file_path,
            "message": f"Processed FIT file with {num_records} records ({processing_mode} mode)",
            "processing_mode": processing_mode,
            "is_duplicate": duplicate_of_activity_id is not None,
        }

        if duplicate_of_activity_id:
            response["duplicate_of"] = duplicate_of_activity_id
            response["message"] += (
                f" - Duplicate detected, linked to existing activity {duplicate_of_activity_id}"
            )

        return response

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error processing FIT file: {e}")
        raise HTTPException(status_code=500, detail="Failed to process FIT file")


# --- JSON Activity Upload (for Apple Health and other client-side integrations) ---


class RecordsPayload(BaseModel):
    timestamp: list[int] = Field(default_factory=list)
    heart_rate: list[Optional[int]] = Field(default_factory=list)
    latitude: list[Optional[float]] = Field(default_factory=list)
    longitude: list[Optional[float]] = Field(default_factory=list)
    altitude: list[Optional[float]] = Field(default_factory=list)
    speed: list[Optional[float]] = Field(default_factory=list)
    distance: list[Optional[float]] = Field(default_factory=list)
    cadence: list[Optional[int]] = Field(default_factory=list)
    power: list[Optional[int]] = Field(default_factory=list)
    temperature: list[Optional[int]] = Field(default_factory=list)


class ActivityJsonUpload(BaseModel):
    upload_source: Literal["apple_health", "garmin", "wahoo", "strava", "manual"] = Field(
        ..., description="Source provider, e.g. 'apple_health'"
    )
    external_id: str = Field(
        ..., description="External ID for deduplication, e.g. HealthKit workout UUID"
    )
    sport: str = Field(..., description="Sport type, e.g. 'running'")
    sub_sport: Optional[str] = None
    start_time: str = Field(
        ..., description="ISO 8601 start time, e.g. '2024-01-15T08:30:00Z'"
    )
    total_distance: Optional[float] = Field(None, ge=0, description="Meters")
    total_elapsed_time: Optional[float] = Field(None, ge=0, description="Seconds")
    total_timer_time: Optional[float] = Field(None, ge=0, description="Seconds")
    total_calories: Optional[int] = Field(None, ge=0)
    avg_heart_rate: Optional[int] = Field(None, ge=0)
    max_heart_rate: Optional[int] = Field(None, ge=0)
    avg_speed: Optional[float] = Field(None, ge=0, description="m/s")
    max_speed: Optional[float] = Field(None, ge=0, description="m/s")
    avg_cadence: Optional[int] = Field(None, ge=0)
    total_elevation_gain: Optional[float] = Field(None, ge=0, description="Meters")
    records: Optional[RecordsPayload] = None

    @field_validator("start_time")
    @classmethod
    def validate_start_time(cls, v: str) -> str:
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("start_time must be a valid ISO 8601 datetime string")
        return v


@router.post("/upload-json")
async def create_activity_from_json(
    payload: ActivityJsonUpload,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Upload an activity from structured JSON data (e.g. Apple Health).

    Unlike FIT file uploads, this endpoint accepts pre-parsed workout data
    as JSON. Handles deduplication via external_id + upload_source and
    cross-provider dedup via start_time matching.
    """
    try:
        # Check for duplicate by external_id + upload_source
        existing = (
            supabase.table("activities")
            .select("id")
            .eq("user_id", current_user.id)
            .eq("external_id", payload.external_id)
            .eq("upload_source", payload.upload_source)
            .limit(1)
            .execute()
        )

        if existing.data:
            return {
                "detail": "Activity already imported",
                "activity_id": existing.data[0]["id"],
                "is_duplicate": True,
            }

        # Create activity record
        activity_data = {
            "user_id": current_user.id,
            "num_sessions": 1,
            "upload_source": payload.upload_source,
            "external_id": payload.external_id,
            "total_distance": payload.total_distance,
            "total_elapsed_time": payload.total_elapsed_time,
        }

        activity_result = supabase.table("activities").insert(activity_data).execute()
        if not activity_result.data:
            raise HTTPException(
                status_code=500, detail="Failed to create activity record"
            )

        activity_id = activity_result.data[0]["id"]
        LOGGER.info(
            f"Created activity {activity_id} from {payload.upload_source} for user {current_user.id}"
        )

        # Create session record
        session_data = {
            "user_id": current_user.id,
            "activity_id": activity_id,
            "session_number": 0,
            "sport": payload.sport,
            "sub_sport": payload.sub_sport,
            "start_time": payload.start_time,
            "total_distance": payload.total_distance,
            "total_elapsed_time": payload.total_elapsed_time,
            "total_timer_time": payload.total_timer_time,
            "total_calories": payload.total_calories,
            "avg_heart_rate": payload.avg_heart_rate,
            "max_heart_rate": payload.max_heart_rate,
            "avg_speed": payload.avg_speed,
            "max_speed": payload.max_speed,
            "avg_cadence": payload.avg_cadence,
            "total_elevation_gain": payload.total_elevation_gain,
        }

        # Remove None values
        session_data = {k: v for k, v in session_data.items() if v is not None}

        session_result = supabase.table("sessions").insert(session_data).execute()
        if not session_result.data:
            raise HTTPException(
                status_code=500, detail="Failed to create session record"
            )

        session_id = session_result.data[0]["id"]
        LOGGER.info(f"Created session {session_id} for activity {activity_id}")

        # Create records if provided
        if payload.records and payload.records.timestamp:
            record_data = {
                "session_id": session_id,
                "activity_id": activity_id,
                "timestamp": payload.records.timestamp,
                "heart_rate": payload.records.heart_rate or [],
                "latitude": payload.records.latitude or [],
                "longitude": payload.records.longitude or [],
                "altitude": payload.records.altitude or [],
                "speed": payload.records.speed or [],
                "distance": payload.records.distance or [],
                "cadence": payload.records.cadence or [],
                "power": payload.records.power or [],
                "temperature": payload.records.temperature or [],
                "position": [],
            }

            # Build position array from lat/lon
            for i in range(len(payload.records.timestamp)):
                lat = (
                    payload.records.latitude[i]
                    if i < len(payload.records.latitude)
                    else None
                )
                lon = (
                    payload.records.longitude[i]
                    if i < len(payload.records.longitude)
                    else None
                )
                if lat is not None and lon is not None:
                    record_data["position"].append(f"POINT({lon} {lat})")
                else:
                    record_data["position"].append(None)

            try:
                supabase.table("records").insert(record_data).execute()
                LOGGER.info(
                    f"Created records for session {session_id} with {len(payload.records.timestamp)} data points"
                )
            except Exception as e:
                LOGGER.warning(f"Failed to create records: {e}")
                # Non-fatal: activity and session are still valid without records

        # Run post-processing in background (dedup detection, HR load, feedback)
        background_tasks.add_task(post_processing_of_session, session_id)

        return {
            "detail": "Activity uploaded successfully",
            "activity_id": activity_id,
            "session_id": session_id,
            "is_duplicate": False,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error creating activity from JSON: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Failed to create activity"
        )
