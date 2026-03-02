"""
Wahoo Fitness webhook router.
Handles incoming webhook events from Wahoo for workout_summary updates.
"""

import os
from typing import Optional

from api.log import LOGGER
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from .helpers import get_valid_access_token, make_wahoo_api_request, supabase

router = APIRouter(prefix="/wahoo/webhook", tags=["wahoo-webhook"])
limiter = Limiter(key_func=get_remote_address)


class WebhookUser(BaseModel):
    """User object in webhook payload."""

    id: int


class WebhookFile(BaseModel):
    """File object in workout summary."""

    url: str


class WebhookWorkoutSummary(BaseModel):
    """Workout summary data in webhook payload."""

    id: int
    ascent_accum: Optional[float] = None
    cadence_avg: Optional[float] = None
    calories_accum: Optional[int] = None
    distance_accum: Optional[str] = None
    duration_active_accum: Optional[str] = None
    duration_paused_accum: Optional[str] = None
    duration_total_accum: Optional[str] = None
    heart_rate_avg: Optional[float] = None
    power_bike_np_last: Optional[float] = None
    power_bike_tss_last: Optional[float] = None
    power_avg: Optional[float] = None
    speed_avg: Optional[float] = None
    work_accum: Optional[float] = None
    fitness_app_id: Optional[int] = None
    time_zone: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    file: Optional[WebhookFile] = None
    workout: Optional["WebhookWorkout"] = None


class WebhookWorkout(BaseModel):
    """Workout data in webhook payload."""

    id: int
    starts: Optional[str] = None
    minutes: Optional[int] = None
    name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    plan_id: Optional[int] = None
    workout_token: Optional[str] = None
    workout_type_id: Optional[int] = None
    fitness_app_id: Optional[int] = None


class WahooWebhookEvent(BaseModel):
    """Wahoo webhook event payload structure."""

    event_type: str
    webhook_token: str
    user: WebhookUser
    workout_summary: WebhookWorkoutSummary


def verify_webhook_token(token: str) -> bool:
    """
    Verify the webhook token from Wahoo.

    Args:
        token: The webhook_token from the payload

    Returns:
        bool: True if token is valid, False otherwise
    """
    expected_token = os.getenv("WAHOO_WEBHOOK_VERIFY_TOKEN")

    if not expected_token:
        LOGGER.error("❌ WAHOO_WEBHOOK_VERIFY_TOKEN not configured")
        return False

    is_valid = token == expected_token

    if not is_valid:
        LOGGER.warning(f"⚠️ Invalid webhook token received: {token[:10]}...")

    return is_valid


@router.post("/callback")
async def handle_webhook_event(request: Request, background_tasks: BackgroundTasks):
    """
    Handle incoming Wahoo webhook events (POST request).

    Wahoo sends webhook events for:
    - workout_summary: When workout summary data is created or updated

    Must acknowledge the POST with 200 OK quickly.
    Actual processing is done asynchronously in the background.
    """
    try:
        # Parse the JSON body
        import json

        body = await request.body()
        event_data = json.loads(body)

        LOGGER.info(f"📨 Received Wahoo webhook event: {event_data}")

        # Validate the webhook event
        try:
            event = WahooWebhookEvent(**event_data)
        except Exception as e:
            LOGGER.error(f"❌ Invalid webhook payload structure: {e}")
            raise HTTPException(status_code=400, detail="Invalid webhook payload")

        # Verify webhook token
        if not verify_webhook_token(event.webhook_token):
            LOGGER.error("❌ Webhook token verification failed")
            raise HTTPException(status_code=401, detail="Invalid webhook token")

        LOGGER.info(
            f"📨 Verified webhook event: {event.event_type} for user {event.user.id}, "
            f"workout_summary {event.workout_summary.id}"
        )

        # Log the raw event data immediately
        try:
            # Find our user_id from Wahoo athlete_id
            user_mapping = (
                supabase.table("wahoo_tokens")
                .select("user_id")
                .eq("athlete_id", str(event.user.id))
                .execute()
            )

            if not user_mapping.data:
                LOGGER.error(
                    f"❌ No user found for Wahoo athlete_id {event.user.id}, "
                    "cannot log event"
                )
                # Still return 200 to acknowledge receipt
                return {
                    "status": "received",
                    "message": "User not found, event logged without user_id",
                }

            user_id = user_mapping.data[0]["user_id"]

            # Log to wahoo_responses table
            log_result = (
                supabase.table("wahoo_responses")
                .insert(
                    {
                        "user_id": user_id,
                        "response_type": "webhook",
                        "wahoo_id": event.workout_summary.id,
                        "response_json": event_data,
                    }
                )
                .execute()
            )

            if hasattr(log_result, "error") and log_result.error:
                LOGGER.error(
                    f"❌ Failed to log webhook event: {log_result.error.message}"
                )
            else:
                LOGGER.info(
                    f"✅ Logged webhook event with id {log_result.data[0]['id']}"
                )

        except Exception as e:
            LOGGER.error(f"❌ Error logging webhook event: {e}")
            # Continue processing even if logging fails

        # Schedule background processing - don't block the response
        background_tasks.add_task(_process_webhook_event, event, event_data)

        # Return 200 OK immediately
        return {"status": "received", "message": "Event queued for processing"}

    except json.JSONDecodeError as e:
        LOGGER.error(f"❌ Invalid JSON in webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error receiving webhook event: {e}")
        raise HTTPException(status_code=500, detail="Failed to receive webhook event")


async def _process_webhook_event(event: WahooWebhookEvent, event_data: dict):
    """
    Process the webhook event asynchronously in the background.
    This allows the webhook endpoint to return 200 OK immediately.
    """
    try:
        # Find our user_id from Wahoo athlete_id
        user_mapping = (
            supabase.table("wahoo_tokens")
            .select("user_id, athlete_id, download_activities_enabled")
            .eq("athlete_id", str(event.user.id))
            .execute()
        )

        if not user_mapping.data:
            LOGGER.error(
                f"❌ No user found for Wahoo athlete_id {event.user.id}, "
                "skipping event processing"
            )
            return

        user_data = user_mapping.data[0]
        user_id = user_data["user_id"]
        download_enabled = user_data.get("download_activities_enabled", True)

        if not download_enabled:
            LOGGER.info(
                f"⏭️ Activity download disabled for user {user_id}, skipping webhook processing"
            )
            return

        # Get valid access token right before making API calls
        access_token = get_valid_access_token(user_id)
        if not access_token:
            LOGGER.error(f"❌ Failed to get valid access token for user {user_id}")
            return

        LOGGER.info(f"🔄 Processing webhook event for user {user_id}")

        # Handle different event types
        if event.event_type == "workout_summary":
            await _handle_workout_summary_event(event, user_id, access_token)
        else:
            LOGGER.warning(f"⚠️ Unknown event type: {event.event_type}")

        LOGGER.info(
            f"✅ Successfully processed webhook event for {event.event_type} "
            f"(workout_summary {event.workout_summary.id})"
        )

    except Exception as e:
        LOGGER.error(f"❌ Error processing webhook event in background: {e}")
        # Don't raise - this is a background task


async def _handle_workout_summary_event(
    event: WahooWebhookEvent, user_id: str, access_token: str
):
    """
    Handle workout_summary webhook events.

    When a workout summary is created or updated, download the FIT file
    and process it using the existing FIT file processing capabilities.
    """
    workout_summary_id = event.workout_summary.id
    file_url = event.workout_summary.file.url if event.workout_summary.file else None

    LOGGER.info(
        f"📥 Processing workout_summary {workout_summary_id} for user {user_id}"
    )
    LOGGER.info(
        f"🔍 Workout summary details: "
        f"distance={event.workout_summary.distance_accum}, "
        f"duration={event.workout_summary.duration_active_accum}, "
        f"file_url={'present' if file_url else 'missing'}"
    )

    if not file_url:
        LOGGER.warning(
            f"⚠️ No file URL in workout_summary {workout_summary_id}, "
            "checking if we need to fetch it"
        )

        # Try to fetch the workout summary directly from API
        summary_data = make_wahoo_api_request(
            access_token, f"workouts/{workout_summary_id}"
        )

        if summary_data and "workout_summary" in summary_data:
            file_info = summary_data["workout_summary"].get("file")
            if isinstance(file_info, dict):
                file_url = file_info.get("url")
            elif isinstance(file_info, str):
                file_url = file_info

    if not file_url:
        LOGGER.error(
            f"❌ No FIT file URL available for workout_summary {workout_summary_id}"
        )
        return

    # Download and process the FIT file
    try:
        LOGGER.info(f"Downloading FIT file from {file_url}")

        import requests

        # Download the FIT file (CDN URL is pre-signed, no auth needed)
        response = requests.get(file_url, timeout=30)

        LOGGER.info(
            f"Response status: {response.status_code}, "
            f"Content-Type: {response.headers.get('content-type')}, "
            f"Content-Length: {response.headers.get('content-length')}"
        )

        if response.status_code != 200:
            LOGGER.error(
                f"Failed to download FIT file: HTTP {response.status_code}, "
                f"Content-Type: {response.headers.get('content-type')}, "
                f"Response: {response.text[:200]}"
            )
            return

        fit_content = response.content
        LOGGER.info(f"Received {len(fit_content)} bytes of content")

        if len(fit_content) == 0:
            LOGGER.error("Downloaded FIT file is empty (0 bytes)")
            return

        # Use shared utilities from fit_file_utils
        from api.utils.fit_file_utils import (
            calculate_file_hash,
            check_duplicate_file,
            create_fit_file_record,
            decode_fit_file,
            get_activity_id_from_fit_file,
            validate_fit_file_content,
        )

        # Validate file content (logs header info automatically)
        try:
            validate_fit_file_content(
                fit_content, f"wahoo_workout_{workout_summary_id}.fit"
            )
        except HTTPException as e:
            LOGGER.error(f"FIT file validation failed: {e.detail}")
            return

        # Calculate file hash and check for duplicates
        file_hash = calculate_file_hash(fit_content)
        existing_fit_file_id = check_duplicate_file(supabase, user_id, file_hash)

        # Handle duplicate detection
        duplicate_of_activity_id = None
        if existing_fit_file_id:
            # Find the activity ID associated with the existing FIT file
            duplicate_of_activity_id = get_activity_id_from_fit_file(
                supabase, existing_fit_file_id
            )
            LOGGER.info(
                f"Duplicate Wahoo workout detected - will create new activity linked to {duplicate_of_activity_id}"
            )

        # Decode the FIT file
        LOGGER.info(f"Decoding FIT file ({len(fit_content)} bytes)")
        try:
            messages, errors = decode_fit_file(fit_content)

            if errors:
                LOGGER.warning(f"FIT file decoding errors: {errors}")

            if not messages:
                LOGGER.warning(
                    f"No messages decoded from FIT file for workout {workout_summary_id}. "
                    f"File size: {len(fit_content)} bytes, "
                    f"errors: {errors}. "
                    f"This might be because the workout was too short or the file is incomplete. "
                    f"Will retry on next webhook event if the file changes."
                )
                return

            LOGGER.info(
                f"Decoded {len(messages)} message types from FIT file: "
                f"{list(messages.keys()) if isinstance(messages, dict) else 'unknown format'}"
            )
        except Exception as decode_error:
            LOGGER.error(
                f"Failed to decode FIT file for workout {workout_summary_id}: {decode_error}",
                exc_info=True,
            )
            return

        # Store the FIT file record using shared utility
        LOGGER.info("Storing FIT file record in database")
        fit_file_id = create_fit_file_record(
            supabase,
            user_id,
            f"wahoo/workout_{workout_summary_id}.fit",  # Virtual path, not uploaded to storage
            f"wahoo_workout_{workout_summary_id}.fit",
            len(fit_content),
            file_hash,
        )
        LOGGER.info(f"Stored FIT file record (id: {fit_file_id})")

        # Process the FIT messages using existing function
        try:
            from api.routers.activities import process_fit_messages

            LOGGER.info(f"Processing FIT messages for file {fit_file_id}")
            await process_fit_messages(
                messages,
                fit_file_id,
                user_id,
                upload_source="wahoo",
                duplicate_of=duplicate_of_activity_id,
            )

            LOGGER.info(
                f"Successfully processed Wahoo workout {workout_summary_id} "
                f"as FIT file {fit_file_id}"
            )
        except Exception as e:
            LOGGER.error(
                f"Error processing FIT messages for workout {workout_summary_id}: {e}",
                exc_info=True,
            )
            # Delete the FIT file record since processing failed
            try:
                LOGGER.info(
                    f"Attempting to delete failed FIT file record {fit_file_id}"
                )
                supabase.table("fit_files").delete().eq(
                    "file_id", fit_file_id
                ).execute()
                LOGGER.info(f"Deleted failed FIT file record {fit_file_id}")
            except Exception as delete_error:
                LOGGER.warning(
                    f"Failed to delete FIT file record {fit_file_id}: {delete_error}"
                )

    except Exception as e:
        LOGGER.error(
            f"Error downloading/processing FIT file for workout {workout_summary_id}: {e}"
        )
