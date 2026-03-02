"""
Garmin Connect webhook router.
Handles incoming webhook events from Garmin for:
- Activity updates (downloads)
- User deregistrations (disconnects)
- User permission changes (privacy settings)
"""

import os
from typing import List, Optional

from api.log import LOGGER
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi.responses import JSONResponse
from api.routers.activities import process_fit_messages

from .helpers import get_valid_access_token, supabase

router = APIRouter(prefix="/garmin/webhook", tags=["garmin-webhook"])
limiter = Limiter(key_func=get_remote_address)


# ============================================================================
# Pydantic Models for Webhook Payloads
# ============================================================================


class GarminWebhookPing(BaseModel):
    """Ping notification (Ping/Pull mode)."""

    userId: str  # Garmin's user identifier
    callbackURL: str  # URL to fetch the actual data


class GarminWebhookActivityFile(BaseModel):
    """Activity file notification (Ping mode for FIT files)."""

    userId: str
    summaryId: str
    fileType: str
    callbackURL: str  # Direct URL to download the FIT file
    activityId: int
    activityType: str
    activityName: Optional[str] = None
    manual: bool = False
    deviceName: Optional[str] = None
    startTimeInSeconds: Optional[int] = None


class GarminWebhookActivity(BaseModel):
    """Activity data in webhook payload (for 'activities' Push webhook type)."""

    userId: str  # Garmin's user identifier
    activityId: int  # Garmin uses camelCase
    activityName: Optional[str] = None


class GarminWebhookActivityDetails(BaseModel):
    """Activity details data in webhook payload (for 'activityDetails' Push webhook type)."""

    userId: str  # Garmin's user identifier
    summaryId: str
    activityId: int
    summary: dict  # Contains the full activity summary
    samples: Optional[list] = None  # GPS/sensor samples
    laps: Optional[list] = None


class GarminDeregistration(BaseModel):
    """Deregistration event when user disconnects."""

    userId: str


class GarminUserPermissionChange(BaseModel):
    """User permission change event."""

    userId: str
    summaryId: Optional[str] = None
    permissions: List[str]
    changeTimeInSeconds: Optional[int] = None


# ============================================================================
# Webhook Token Verification
# ============================================================================


def verify_webhook_client_id(client_id: str) -> bool:
    """
    Verify the Garmin client ID from webhook request.

    Args:
        client_id: The garmin-client-id from the request header

    Returns:
        bool: True if client ID is valid, False otherwise
    """
    expected_client_id = os.getenv("GARMIN_CLIENT_ID")

    if not expected_client_id:
        LOGGER.error("❌ GARMIN_CLIENT_ID not configured")
        return False

    is_valid = client_id == expected_client_id

    if not is_valid:
        LOGGER.warning(
            f"⚠️ Invalid garmin-client-id received: {client_id[:10] if client_id else 'None'}..."
        )

    return is_valid


# ============================================================================
# Main Webhook Endpoint
# ============================================================================


@router.post("/callback")
async def handle_webhook_event(request: Request, background_tasks: BackgroundTasks):
    """
    Handle incoming Garmin webhook events (POST request).

    Garmin sends three types of webhook events to the same endpoint:
    1. **Activities** - When new activities are uploaded
    2. **Deregistrations** - When user disconnects from their Garmin account
    3. **User Permission Changes** - When user changes data sharing permissions

    Must acknowledge the POST with 200 OK quickly.
    Actual processing is done asynchronously in the background.
    """
    try:
        # Parse the JSON body
        import json

        body = await request.body()
        event_data = json.loads(body)

        LOGGER.info(f"📨 Received Garmin webhook event: {event_data}")

        # Verify garmin-client-id from header
        client_id = request.headers.get("garmin-client-id")
        if not client_id or not verify_webhook_client_id(client_id):
            LOGGER.error("❌ Webhook client ID verification failed")
            raise HTTPException(status_code=401, detail="Invalid garmin-client-id")

        # Check for empty payload (Ping/health check)
        if not event_data:
            LOGGER.info("📡 Received Garmin Ping notification (health check)")
            return JSONResponse(status_code=200, content={})

        # ============================================================================
        # Event Type 1: Deregistrations
        # ============================================================================
        if "deregistrations" in event_data:
            deregistrations = event_data["deregistrations"]
            LOGGER.info(f"🔴 Received {len(deregistrations)} deregistration(s)")

            for dereg_data in deregistrations:
                try:
                    dereg = GarminDeregistration(**dereg_data)
                    background_tasks.add_task(_process_deregistration, dereg)
                except Exception as e:
                    LOGGER.error(f"❌ Invalid deregistration data: {e}")

            return JSONResponse(status_code=200, content={})

        # ============================================================================
        # Event Type 2: User Permission Changes
        # ============================================================================
        if "userPermissionsChange" in event_data:
            permission_changes = event_data["userPermissionsChange"]
            LOGGER.info(f"🔄 Received {len(permission_changes)} permission change(s)")

            for perm_data in permission_changes:
                try:
                    perm_change = GarminUserPermissionChange(**perm_data)
                    background_tasks.add_task(_process_permission_change, perm_change)
                except Exception as e:
                    LOGGER.error(f"❌ Invalid permission change data: {e}")

            return JSONResponse(status_code=200, content={})

        # ============================================================================
        # Event Type 3: Activities (Ping or Push mode)
        # ============================================================================
        if "activities" in event_data and event_data["activities"]:
            activities = event_data["activities"]
            LOGGER.info(f"📥 Received {len(activities)} activity/activities")
            LOGGER.error(
                "This should not happen we working only with fit files downloads to get all the details"
            )

            """    for activity_data in activities:
                try:
                    # Check if this is Ping mode (has callbackURL) or Push mode (has activityId)
                    if "callbackURL" in activity_data:
                        # Ping mode: Need to call the callback URL to fetch data
                        ping = GarminWebhookPing(**activity_data)
                        background_tasks.add_task(_process_ping_event, ping)
                    else:
                        # Push mode: Activity data is included in the webhook
                        activity = GarminWebhookActivity(**activity_data)
                        background_tasks.add_task(_process_activity_event, activity, event_data)
                except Exception as e:
                    LOGGER.error(f"❌ Invalid activity data: {e}") """

            return JSONResponse(status_code=200, content={})

        # ============================================================================
        # Event Type 4: Activity Details (Ping or Push mode)
        # ============================================================================
        if "activityDetails" in event_data and event_data["activityDetails"]:
            activity_details_list = event_data["activityDetails"]
            LOGGER.info(f"📥 Received {len(activity_details_list)} activity details")
            LOGGER.error(
                "This should not happen we working only with fit files downloads to get all the details"
            )

            """             for activity_details_data in activity_details_list:
                try:
                    # Check if this is Ping mode (has callbackURL) or Push mode (has full data)
                    if "callbackURL" in activity_details_data:
                        # Ping mode: Need to call the callback URL to fetch data
                        ping = GarminWebhookPing(**activity_details_data)
                        background_tasks.add_task(_process_ping_event, ping)
                    else:
                        # Push mode: Activity details data is included in the webhook
                        activity_details = GarminWebhookActivityDetails(**activity_details_data)
                        background_tasks.add_task(_process_activity_details_event, activity_details, event_data)
                except Exception as e:
                    LOGGER.error(f"❌ Invalid activity details data: {e}") """

            return JSONResponse(status_code=200, content={})

        # ============================================================================
        # Event Type 5: Activity Files (Ping mode - direct FIT file download)
        # ============================================================================
        if "activityFiles" in event_data and event_data["activityFiles"]:
            activity_files = event_data["activityFiles"]
            LOGGER.info(f"📥 Received {len(activity_files)} activity file(s)")

            for file_data in activity_files:
                try:
                    activity_file = GarminWebhookActivityFile(**file_data)
                    background_tasks.add_task(
                        _process_activity_file_event, activity_file
                    )
                except Exception as e:
                    LOGGER.error(f"❌ Invalid activity file data: {e}")

            return JSONResponse(status_code=200, content={})

        # ============================================================================
        # Event Type 6: Manually updated Activity
        # ============================================================================

        if (
            "manuallyUpdatedActivities" in event_data
            and event_data["manuallyUpdatedActivities"]
        ):
            manually_updated = event_data["manuallyUpdatedActivities"]
            LOGGER.info(
                f"📝 Received {len(manually_updated)} manually updated activity/activities"
            )
            LOGGER.error("TODO This should not happen not yet implemented")

            return JSONResponse(status_code=200, content={})

        LOGGER.error("⚠️ Unknown Garmin webhook event type received")
        return JSONResponse(status_code=200, content={})

    except json.JSONDecodeError as e:
        LOGGER.error(f"❌ Invalid JSON in webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error receiving webhook event: {e}")
        raise HTTPException(status_code=500, detail="Failed to receive webhook event")


# ============================================================================
# Background Processing Functions
# ============================================================================


async def _process_deregistration(dereg: GarminDeregistration):
    """
    Process user deregistration event.

    This is called when:
    - User disconnects from Garmin Connect
    - Your app calls DELETE /registration

    Action: Delete the user's Garmin token from database
    """
    try:
        user_id = dereg.userId
        LOGGER.info(f"🔴 Processing deregistration for Garmin user: {user_id}")

        # Find the user by Garmin athlete_id (which is the userId from webhook)
        user_lookup = (
            supabase.table("garmin_tokens")
            .select("user_id, athlete_id")
            .eq("athlete_id", user_id)
            .execute()
        )

        if not user_lookup.data:
            LOGGER.warning(f"⚠️ No user found for Garmin athlete_id: {user_id}")
            return

        our_user_id = user_lookup.data[0]["user_id"]

        # Delete the Garmin token
        delete_result = (
            supabase.table("garmin_tokens").delete().eq("athlete_id", user_id).execute()
        )

        if delete_result.data:
            LOGGER.info(
                f"✅ Successfully deleted Garmin token for user {our_user_id} (athlete {user_id})"
            )
        else:
            LOGGER.warning(f"⚠️ No token deleted for athlete {user_id}")

    except Exception as e:
        LOGGER.error(f"❌ Error processing deregistration for {dereg.userId}: {e}")


async def _process_permission_change(perm_change: GarminUserPermissionChange):
    """
    Process user permission change event.

    This is called when user changes their data sharing permissions at:
    https://connect.garmin.com/modern/settings/accountInformation

    The user's access token remains valid, but they may have opted out of
    certain data types (activities, wellness, etc.)

    Action: Update the user's permission settings in database
    """
    try:
        user_id = perm_change.userId
        permissions = perm_change.permissions

        LOGGER.info(
            f"🔄 Processing permission change for Garmin user: {user_id}, "
            f"permissions: {permissions}"
        )

        # Find the user by Garmin athlete_id
        user_lookup = (
            supabase.table("garmin_tokens")
            .select("user_id, athlete_id")
            .eq("athlete_id", user_id)
            .execute()
        )

        if not user_lookup.data:
            LOGGER.warning(f"⚠️ No user found for Garmin athlete_id: {user_id}")
            return

        our_user_id = user_lookup.data[0]["user_id"]

        # Fetch full permissions from Garmin API to ensure we have the complete list
        # The webhook may only contain changed permissions, not the full set
        from .helpers import get_valid_access_token, fetch_garmin_permissions

        access_token = get_valid_access_token(our_user_id)
        if access_token:
            full_permissions = fetch_garmin_permissions(access_token)
            if full_permissions is not None:
                # Use the full permissions from API
                permissions = full_permissions
                LOGGER.info(f"Fetched full permissions from API: {permissions}")
            else:
                LOGGER.warning(
                    f"Failed to fetch full permissions, using webhook data: {permissions}"
                )
        else:
            LOGGER.warning(
                f"No valid access token, using webhook permissions: {permissions}"
            )

        # Determine feature flags based on permissions
        # ACTIVITY_EXPORT = can download activities
        # WORKOUT_IMPORT = can upload workouts
        download_activities = "ACTIVITY_EXPORT" in permissions
        upload_workouts = "WORKOUT_IMPORT" in permissions

        # Update settings in database with full permissions array
        update_result = (
            supabase.table("garmin_tokens")
            .update(
                {
                    "permissions": permissions,  # Store full permissions array
                    "download_activities_enabled": download_activities,
                    "upload_workouts_enabled": upload_workouts,
                }
            )
            .eq("athlete_id", user_id)
            .execute()
        )

        if update_result.data:
            LOGGER.info(
                f"✅ Updated permissions for user {our_user_id} (athlete {user_id}): "
                f"download={download_activities}, upload={upload_workouts}"
            )
        else:
            LOGGER.warning(f"⚠️ No settings updated for athlete {user_id}")

        # Log the permission change for audit
        try:
            supabase.table("garmin_responses").insert(
                {
                    "user_id": our_user_id,
                    "response_type": "permission_change",
                    "garmin_id": None,
                    "response_json": perm_change.dict(),
                }
            ).execute()
        except Exception as log_error:
            LOGGER.warning(f"⚠️ Failed to log permission change: {log_error}")

    except Exception as e:
        LOGGER.error(
            f"❌ Error processing permission change for {perm_change.userId}: {e}"
        )


async def _process_activity_file_event(activity_file: GarminWebhookActivityFile):
    """
    Process activity file notification by downloading FIT file directly.

    In Ping mode with activityFiles, Garmin provides a direct callback URL
    to download the FIT file without needing to fetch activity summary first.
    """
    try:
        garmin_user_id = activity_file.userId
        activity_id = activity_file.activityId
        callback_url = activity_file.callbackURL
        file_type = activity_file.fileType
        device_name = activity_file.deviceName

        LOGGER.info(
            f"📁 Processing activity file for Garmin userId: {garmin_user_id}, "
            f"activity {activity_id}, type: {file_type}"
        )
        LOGGER.info(f"🔗 File callback URL: {callback_url}")

        # Find our user by Garmin's userId (stored as athlete_id)
        user_mapping = (
            supabase.table("garmin_tokens")
            .select("user_id, athlete_id, download_activities_enabled")
            .eq("athlete_id", garmin_user_id)
            .execute()
        )

        if not user_mapping.data:
            LOGGER.error(
                f"❌ No user found for Garmin userId {garmin_user_id}, cannot process activity file"
            )
            return

        user_data = user_mapping.data[0]
        user_id = user_data["user_id"]
        download_enabled = user_data.get("download_activities_enabled", True)

        if not download_enabled:
            LOGGER.info(
                f"⏭️ Activity download disabled for user {user_id}, skipping activity file"
            )
            return

        # Get valid access token
        access_token = get_valid_access_token(user_id)
        if not access_token:
            LOGGER.error(f"❌ Failed to get valid access token for user {user_id}")
            return

        # Download the FIT file directly from callback URL
        import requests

        try:
            LOGGER.info("📥 Downloading FIT file from callback URL...")

            headers = {"Authorization": f"Bearer {access_token}"}

            response = requests.get(callback_url, headers=headers, timeout=30)

            LOGGER.info(
                f"📦 FIT file download response: {response.status_code}, "
                f"Content-Type: {response.headers.get('content-type')}, "
                f"Content-Length: {response.headers.get('content-length')}"
            )

            if response.status_code != 200:
                LOGGER.error(
                    f"❌ Failed to download FIT file: HTTP {response.status_code}, "
                    f"Response: {response.text[:200]}"
                )
                return

            fit_content = response.content
            LOGGER.info(f"✅ Downloaded FIT file: {len(fit_content)} bytes")

            if len(fit_content) == 0:
                LOGGER.error("❌ Downloaded FIT file is empty (0 bytes)")
                return

            # Process the FIT file using existing utilities
            from api.utils.fit_file_utils import (
                calculate_file_hash,
                check_duplicate_file,
                create_fit_file_record,
                decode_fit_file,
                get_activity_id_from_fit_file,
                validate_fit_file_content,
            )

            # Validate file content
            try:
                validate_fit_file_content(
                    fit_content, f"garmin_activity_{activity_id}.fit"
                )
            except HTTPException as e:
                LOGGER.error(f"❌ FIT file validation failed: {e.detail}")
                return

            # Calculate file hash and check for duplicates
            file_hash = calculate_file_hash(fit_content)
            existing_fit_file_id = check_duplicate_file(supabase, user_id, file_hash)

            duplicate_of_activity_id = None
            if existing_fit_file_id:
                duplicate_of_activity_id = get_activity_id_from_fit_file(
                    supabase, existing_fit_file_id
                )
                LOGGER.info(
                    f"🔄 Duplicate Garmin activity detected - will create new activity linked to {duplicate_of_activity_id}"
                )

            # Decode the FIT file
            LOGGER.info(f"🔍 Decoding FIT file ({len(fit_content)} bytes)")
            try:
                messages, errors = decode_fit_file(fit_content)

                if errors:
                    LOGGER.warning(f"⚠️ FIT file decoding errors: {errors}")

                if not messages:
                    LOGGER.error(
                        f"❌ No messages decoded from FIT file for activity {activity_id}"
                    )
                    return

                LOGGER.info(
                    f"✅ Decoded {len(messages)} message types from FIT file: "
                    f"{list(messages.keys()) if isinstance(messages, dict) else 'unknown format'}"
                )
            except Exception as decode_error:
                LOGGER.error(
                    f"❌ Failed to decode FIT file for activity {activity_id}: {decode_error}",
                    exc_info=True,
                )
                return

            # Store the FIT file record
            LOGGER.info("💾 Storing FIT file record in database")
            fit_file_id = create_fit_file_record(
                supabase,
                user_id,
                f"garmin/activity_{activity_id}.fit",
                f"garmin_activity_{activity_id}.fit",
                len(fit_content),
                file_hash,
            )
            LOGGER.info(f"✅ Stored FIT file record (id: {fit_file_id})")

            # Process the FIT messages
            try:
                LOGGER.info(f"⚙️ Processing FIT messages for file {fit_file_id}")
                await process_fit_messages(
                    messages,
                    fit_file_id,
                    user_id,
                    upload_source="garmin",
                    external_id=activity_id,
                    duplicate_of=duplicate_of_activity_id,
                    device_name=device_name,
                )

                LOGGER.info(
                    f"✅ Successfully processed Garmin activity file {activity_id} "
                    f"as FIT file {fit_file_id}"
                )
            except Exception as e:
                LOGGER.error(
                    f"❌ Error processing FIT messages for activity {activity_id}: {e}",
                    exc_info=True,
                )
                # Delete the FIT file record since processing failed
                try:
                    supabase.table("fit_files").delete().eq(
                        "file_id", fit_file_id
                    ).execute()
                    LOGGER.info(f"🗑️ Deleted failed FIT file record {fit_file_id}")
                except Exception as delete_error:
                    LOGGER.warning(
                        f"⚠️ Failed to delete FIT file record {fit_file_id}: {delete_error}"
                    )

        except requests.RequestException as e:
            LOGGER.error(f"❌ Failed to download FIT file from callback URL: {e}")
            return

    except Exception as e:
        LOGGER.error(f"❌ Error processing activity file event: {e}", exc_info=True)
        # Don't raise - this is a background task
