"""
Wahoo Fitness API integration router.
"""

from datetime import datetime, timedelta

from api.auth import User, get_current_user
from api.log import LOGGER
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from .helpers import (
    get_valid_access_token,
    is_wahoo_enabled,
    make_wahoo_api_request,
    supabase,
)

router = APIRouter(prefix="/wahoo/api", tags=["wahoo-api"])
limiter = Limiter(key_func=get_remote_address)


class SyncResponse(BaseModel):
    """Response model for activity sync."""

    success: bool
    message: str
    activities_found: int
    new_activities: int
    activity_ids: list[str]


@router.post("/activities/sync")
async def sync_wahoo_activities(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
) -> SyncResponse:
    """
    Sync activities from Wahoo for the authenticated user.

    Args:
        days: Number of days to sync (1-90)
        current_user: Authenticated user from token

    Returns:
        SyncResponse with sync results
    """
    try:
        # Check if download is enabled (query directly without refreshing token)
        download_settings = (
            supabase.table("wahoo_tokens")
            .select("download_activities_enabled")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not download_settings.data:
            raise HTTPException(status_code=404, detail="Wahoo account not connected")

        if not download_settings.data[0].get("download_activities_enabled", True):
            raise HTTPException(
                status_code=403,
                detail="Activity download is disabled. Enable it in settings.",
            )

        # Get valid access token right before API call
        access_token = get_valid_access_token(current_user.id)
        if not access_token:
            raise HTTPException(
                status_code=401, detail="Failed to get valid Wahoo access token"
            )

        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        # Fetch workouts from Wahoo API
        # Wahoo API endpoint: GET /v1/workouts
        params = {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        }

        LOGGER.info(
            f"Fetching Wahoo workouts for user {current_user.id} from {start_date} to {end_date}"
        )

        # Make API request to Wahoo
        workouts = make_wahoo_api_request(
            access_token,
            f"workouts?start_date={params['start_date']}&end_date={params['end_date']}",
        )

        if workouts is None:
            raise HTTPException(
                status_code=500, detail="Failed to fetch activities from Wahoo"
            )

        # Process and store activities
        # TODO: Implement activity processing similar to Strava
        # For now, just return the count
        activities_found = len(workouts.get("workouts", []))
        new_activities = 0
        activity_ids = []

        LOGGER.info(
            f"Found {activities_found} Wahoo workouts for user {current_user.id}"
        )

        return SyncResponse(
            success=True,
            message=f"Successfully synced {activities_found} activities from Wahoo",
            activities_found=activities_found,
            new_activities=new_activities,
            activity_ids=activity_ids,
        )

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error syncing Wahoo activities for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to sync Wahoo activities: {str(e)}"
        )


@router.post("/sync/user")
async def sync_user_workouts_to_wahoo(
    current_user: User = Depends(get_current_user),
):
    """
    Manually trigger batch sync of all pending queue operations to Wahoo.

    This processes all pending operations in the user's sync queue immediately,
    including creates, updates, and deletes for both plans and scheduled workouts.

    Args:
        current_user: Authenticated user from token

    Returns:
        Sync statistics including number of operations processed and results
    """
    try:
        # Check if Wahoo is enabled and upload is turned on
        if not is_wahoo_enabled(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="Wahoo account not connected or workout upload is disabled. Enable it in settings.",
            )

        LOGGER.info(f"Starting manual sync for user {current_user.id}")

        # Process pending operations using unified sync service
        from api.services.workout_sync import get_sync_service
        from api.database import supabase

        # Get pending queue entries for this user
        pending = (
            supabase.table("workout_sync_queue")
            .select("*")
            .eq("user_id", str(current_user.id))
            .is_("processed_at", "null")
            .execute()
        )

        if not pending.data:
            return {
                "success": True,
                "message": "No pending operations to sync",
                "operations_processed": 0,
                "succeeded": 0,
                "failed": 0,
            }

        # Process each entry
        sync_service = get_sync_service()
        succeeded = 0
        failed = 0

        for entry in pending.data:
            try:
                success = await sync_service.process_queue_entry(entry)
                if success:
                    succeeded += 1
                else:
                    failed += 1
            except Exception as e:
                LOGGER.error(f"Error processing queue entry {entry['id']}: {e}")
                failed += 1

        return {
            "success": True,
            "message": "Sync completed"
            if failed == 0
            else "Sync completed with errors",
            "operations_processed": succeeded + failed,
            "succeeded": succeeded,
            "failed": failed,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error syncing workouts for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to sync workouts: {str(e)}"
        )


@router.get("/sync/status")
async def get_sync_status(
    current_user: User = Depends(get_current_user),
):
    """
    Get sync status for user's workouts and scheduled workouts.

    Returns:
        Statistics about synced, pending, and failed workouts
    """
    try:
        # Get workout sync status
        workouts_result = (
            supabase.table("workouts")
            .select("sync_status")
            .eq("user_id", current_user.id)
            .execute()
        )

        workout_status_counts = {
            "synced": 0,
            "pending": 0,
            "failed": 0,
            "disabled": 0,
        }

        for workout in workouts_result.data:
            status = workout.get("sync_status", "pending")
            workout_status_counts[status] = workout_status_counts.get(status, 0) + 1

        # Get scheduled workout sync status
        scheduled_result = (
            supabase.table("workouts_scheduled")
            .select("sync_status")
            .eq("user_id", current_user.id)
            .execute()
        )

        scheduled_status_counts = {
            "synced": 0,
            "pending": 0,
            "failed": 0,
            "disabled": 0,
        }

        for scheduled in scheduled_result.data:
            status = scheduled.get("sync_status", "pending")
            scheduled_status_counts[status] = scheduled_status_counts.get(status, 0) + 1

        # Check if Wahoo is enabled
        wahoo_enabled = is_wahoo_enabled(current_user.id)

        return {
            "wahoo_enabled": wahoo_enabled,
            "workouts": workout_status_counts,
            "scheduled_workouts": scheduled_status_counts,
            "total_workouts": len(workouts_result.data),
            "total_scheduled": len(scheduled_result.data),
        }

    except Exception as e:
        LOGGER.error(f"Error getting sync status for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get sync status: {str(e)}"
        )


@router.get("/workouts")
async def get_wahoo_workouts(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """
    Get list of workouts from Wahoo.

    Args:
        limit: Maximum number of workouts to return
        offset: Number of workouts to skip
        current_user: Authenticated user from token

    Returns:
        List of workouts
    """
    try:
        # Get valid access token right before API call
        access_token = get_valid_access_token(current_user.id)
        if not access_token:
            raise HTTPException(
                status_code=404, detail="Wahoo account not connected or token invalid"
            )

        # Fetch workouts from Wahoo API
        workouts = make_wahoo_api_request(
            access_token,
            f"workouts?limit={limit}&offset={offset}",
        )

        if workouts is None:
            raise HTTPException(
                status_code=500, detail="Failed to fetch workouts from Wahoo"
            )

        return {
            "workouts": workouts.get("workouts", []),
            "total": workouts.get("total", 0),
            "limit": limit,
            "offset": offset,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error fetching Wahoo workouts for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch Wahoo workouts: {str(e)}"
        )


async def _process_single_workout(
    workout_data: dict, user_id: str, access_token: str
) -> bool:
    """
    Process a single workout from Wahoo API.

    Downloads the FIT file and processes it using the existing pipeline.

    Args:
        workout_data: Workout data from Wahoo API
        user_id: User ID
        access_token: Valid Wahoo access token

    Returns:
        bool: True if processed successfully, False otherwise
    """
    try:
        workout_id = workout_data.get("id")
        workout_summary = workout_data.get("workout_summary", {})

        # Try to get file URL from workout summary
        file_url = None
        if isinstance(workout_summary, dict):
            file_info = workout_summary.get("file")
            if isinstance(file_info, dict):
                file_url = file_info.get("url")
            elif isinstance(file_info, str):
                file_url = file_info

        LOGGER.info(
            f"Processing workout {workout_id} for user {user_id}, "
            f"file_url={'present' if file_url else 'missing'}"
        )

        # If no file URL in the response, try fetching the workout details
        if not file_url:
            LOGGER.info(f"Fetching workout details for workout {workout_id}")
            workout_details = make_wahoo_api_request(
                access_token, f"workouts/{workout_id}"
            )

            if workout_details and workout_details.get("workout_summary"):
                workout_summary_details = workout_details["workout_summary"]
                if isinstance(workout_summary_details, dict):
                    file_info = workout_summary_details.get("file")
                    if isinstance(file_info, dict):
                        file_url = file_info.get("url")
                    elif isinstance(file_info, str):
                        file_url = file_info

        if not file_url:
            LOGGER.warning(
                f"No FIT file URL available for workout {workout_id}, skipping"
            )
            return False

        # Download and process the FIT file
        import requests

        LOGGER.info(f"Downloading FIT file from {file_url}")
        response = requests.get(file_url, timeout=30)

        if response.status_code != 200:
            LOGGER.error(
                f"Failed to download FIT file for workout {workout_id}: "
                f"HTTP {response.status_code}"
            )
            return False

        fit_content = response.content
        if len(fit_content) == 0:
            LOGGER.warning(f"Downloaded FIT file is empty for workout {workout_id}")
            return False

        # Use shared utilities from fit_file_utils
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
            validate_fit_file_content(fit_content, f"wahoo_workout_{workout_id}.fit")
        except HTTPException as e:
            LOGGER.error(
                f"FIT file validation failed for workout {workout_id}: {e.detail}"
            )
            return False

        # Calculate file hash and check for duplicates
        file_hash = calculate_file_hash(fit_content)
        existing_fit_file_id = check_duplicate_file(supabase, user_id, file_hash)

        # Handle duplicate detection
        duplicate_of_activity_id = None
        if existing_fit_file_id:
            duplicate_of_activity_id = get_activity_id_from_fit_file(
                supabase, existing_fit_file_id
            )
            LOGGER.info(
                f"Duplicate workout detected (workout {workout_id}) - "
                f"will create new activity linked to {duplicate_of_activity_id}"
            )

        # Decode the FIT file
        try:
            messages, errors = decode_fit_file(fit_content)

            if errors:
                LOGGER.warning(
                    f"FIT file decoding errors for workout {workout_id}: {errors}"
                )

            if not messages:
                LOGGER.warning(
                    f"No messages decoded from FIT file for workout {workout_id}, skipping"
                )
                return False

            LOGGER.info(
                f"Decoded {len(messages)} message types from workout {workout_id}"
            )
        except Exception as decode_error:
            LOGGER.error(
                f"Failed to decode FIT file for workout {workout_id}: {decode_error}"
            )
            return False

        # Store the FIT file record
        fit_file_id = create_fit_file_record(
            supabase,
            user_id,
            f"wahoo/workout_{workout_id}.fit",
            f"wahoo_workout_{workout_id}.fit",
            len(fit_content),
            file_hash,
        )
        LOGGER.info(
            f"Stored FIT file record for workout {workout_id} (id: {fit_file_id})"
        )

        # Process the FIT messages using existing function
        try:
            from api.routers.activities import process_fit_messages

            await process_fit_messages(
                messages,
                fit_file_id,
                user_id,
                upload_source="wahoo",
                duplicate_of=duplicate_of_activity_id,
            )

            LOGGER.info(
                f"Successfully processed Wahoo workout {workout_id} as FIT file {fit_file_id}"
            )
            return True

        except Exception as e:
            LOGGER.error(
                f"Error processing FIT messages for workout {workout_id}: {e}",
                exc_info=True,
            )
            # Delete the FIT file record since processing failed
            try:
                supabase.table("fit_files").delete().eq(
                    "file_id", fit_file_id
                ).execute()
                LOGGER.info(f"Deleted failed FIT file record {fit_file_id}")
            except Exception as delete_error:
                LOGGER.warning(
                    f"Failed to delete FIT file record {fit_file_id}: {delete_error}"
                )
            return False

    except Exception as e:
        LOGGER.error(
            f"Error processing workout {workout_data.get('id')}: {e}",
            exc_info=True,
        )
        return False


async def sync_initial_workouts(user_id: str, limit: int = 30):
    """
    Sync initial workouts from Wahoo after successful token exchange.

    This is called as a background task after a user connects their Wahoo account
    and has download enabled. It fetches the most recent workouts to provide
    immediate workout history.

    Args:
        user_id: User ID to sync workouts for
        limit: Maximum number of workouts to sync (default 30)
    """
    try:
        LOGGER.info(
            f"Starting initial workout sync for user {user_id} (limit: {limit})"
        )

        # Get valid access token
        access_token = get_valid_access_token(user_id)
        if not access_token:
            LOGGER.error(
                f"Failed to get valid access token for initial sync (user {user_id})"
            )
            return

        # Fetch workouts from Wahoo API
        # The API returns workouts in descending order by default (most recent first)
        workouts_response = make_wahoo_api_request(
            access_token, f"workouts?limit={limit}"
        )

        if not workouts_response:
            LOGGER.error(f"Failed to fetch workouts from Wahoo API for user {user_id}")
            return

        workouts = workouts_response.get("workouts", [])
        total_workouts = len(workouts)

        LOGGER.info(f"Fetched {total_workouts} workouts from Wahoo for user {user_id}")

        if total_workouts == 0:
            LOGGER.info(f"No workouts to sync for user {user_id}")
            return

        # Process each workout
        successful = 0
        failed = 0

        for workout in workouts:
            try:
                success = await _process_single_workout(workout, user_id, access_token)
                if success:
                    successful += 1
                else:
                    failed += 1
            except Exception as e:
                LOGGER.error(
                    f"Error processing workout {workout.get('id')} during initial sync: {e}"
                )
                failed += 1

        LOGGER.info(
            f"Initial workout sync completed for user {user_id}: "
            f"{successful} successful, {failed} failed out of {total_workouts} total"
        )

    except Exception as e:
        LOGGER.error(
            f"Error during initial workout sync for user {user_id}: {e}",
            exc_info=True,
        )
