"""
Garmin Connect API integration router.
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
    is_garmin_enabled,
    make_garmin_api_request,
    supabase,
)

router = APIRouter(prefix="/garmin/api", tags=["garmin-api"])
limiter = Limiter(key_func=get_remote_address)


class SyncResponse(BaseModel):
    """Response model for activity sync."""

    success: bool
    message: str
    activities_found: int
    new_activities: int
    activity_ids: list[str]


@router.post("/activities/sync")
async def sync_garmin_activities(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
) -> SyncResponse:
    """
    Sync activities from Garmin for the authenticated user.

    Args:
        days: Number of days to sync (1-90)
        current_user: Authenticated user from token

    Returns:
        SyncResponse with sync results
    """
    try:
        # Check if download is enabled (query directly without refreshing token)
        download_settings = (
            supabase.table("garmin_tokens")
            .select("download_activities_enabled")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not download_settings.data:
            raise HTTPException(status_code=404, detail="Garmin account not connected")

        if not download_settings.data[0].get("download_activities_enabled", True):
            raise HTTPException(
                status_code=403,
                detail="Activity download is disabled. Enable it in settings.",
            )

        # Get valid access token right before API call
        access_token = get_valid_access_token(current_user.id)
        if not access_token:
            raise HTTPException(
                status_code=401, detail="Failed to get valid Garmin access token"
            )

        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        # Format dates for Garmin API (ISO 8601)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        LOGGER.info(
            f"Fetching Garmin activities for user {current_user.id} from {start_str} to {end_str}"
        )

        # Fetch activities from Garmin API
        # Garmin Activity API endpoint: GET /wellness-api/rest/activities
        activities = make_garmin_api_request(
            access_token,
            f"wellness-api/rest/activities?uploadStartTimeInSeconds={int(start_date.timestamp())}&uploadEndTimeInSeconds={int(end_date.timestamp())}",
        )

        if activities is None:
            raise HTTPException(
                status_code=500, detail="Failed to fetch activities from Garmin"
            )

        # Process and store activities
        # TODO: Implement activity processing similar to Strava/Wahoo
        # For now, just return the count
        activities_list = activities if isinstance(activities, list) else []
        activities_found = len(activities_list)
        new_activities = 0
        activity_ids = []

        LOGGER.info(
            f"Found {activities_found} Garmin activities for user {current_user.id}"
        )

        return SyncResponse(
            success=True,
            message=f"Successfully synced {activities_found} activities from Garmin",
            activities_found=activities_found,
            new_activities=new_activities,
            activity_ids=activity_ids,
        )

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error syncing Garmin activities for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to sync Garmin activities: {str(e)}"
        )


@router.post("/sync/user")
async def sync_user_workouts_to_garmin(
    current_user: User = Depends(get_current_user),
):
    """
    Manually trigger batch sync of all pending workouts to Garmin.

    This processes all pending operations in the user's sync queue immediately,
    including workout creates, updates, and deletes.

    Args:
        current_user: Authenticated user from token

    Returns:
        Sync statistics including number of operations processed and results
    """
    try:
        # Check if Garmin is enabled and upload is turned on
        if not is_garmin_enabled(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="Garmin account not connected or workout upload is disabled. Enable it in settings.",
            )

        LOGGER.info(f"Starting manual sync to Garmin for user {current_user.id}")

        # Process pending operations using unified sync service
        from api.services.workout_sync import get_sync_service
        from api.database import supabase

        # Get pending queue entries for this user and Garmin
        pending = (
            supabase.table("workout_sync_queue")
            .select("*")
            .eq("user_id", str(current_user.id))
            .eq("provider", "garmin")
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
        LOGGER.error(
            f"Error syncing workouts to Garmin for user {current_user.id}: {e}"
        )
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

        # Check if Garmin is enabled
        garmin_enabled = is_garmin_enabled(current_user.id)

        return {
            "garmin_enabled": garmin_enabled,
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
async def get_garmin_workouts(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """
    Get list of workouts from Garmin.

    Args:
        limit: Maximum number of workouts to return
        current_user: Authenticated user from token

    Returns:
        List of workouts
    """
    try:
        # Get valid access token right before API call
        access_token = get_valid_access_token(current_user.id)
        if not access_token:
            raise HTTPException(
                status_code=404, detail="Garmin account not connected or token invalid"
            )

        # Fetch workouts from Garmin Training API V2
        workouts = make_garmin_api_request(
            access_token,
            f"training-api/workout?limit={limit}",
        )

        if workouts is None:
            raise HTTPException(
                status_code=500, detail="Failed to fetch workouts from Garmin"
            )

        # Garmin returns a list of workouts directly
        workout_list = workouts if isinstance(workouts, list) else []

        return {
            "workouts": workout_list,
            "total": len(workout_list),
            "limit": limit,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error fetching Garmin workouts for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch Garmin workouts: {str(e)}"
        )


@router.get("/activities")
async def get_garmin_activities(
    limit: int = Query(default=20, ge=1, le=100),
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    """
    Get list of activities from Garmin.

    Args:
        limit: Maximum number of activities to return
        days: Number of days to look back
        current_user: Authenticated user from token

    Returns:
        List of activities
    """
    try:
        # Get valid access token right before API call
        access_token = get_valid_access_token(current_user.id)
        if not access_token:
            raise HTTPException(
                status_code=404, detail="Garmin account not connected or token invalid"
            )

        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        # Fetch activities from Garmin API
        activities = make_garmin_api_request(
            access_token,
            f"wellness-api/rest/activities?uploadStartTimeInSeconds={int(start_date.timestamp())}&uploadEndTimeInSeconds={int(end_date.timestamp())}&limit={limit}",
        )

        if activities is None:
            raise HTTPException(
                status_code=500, detail="Failed to fetch activities from Garmin"
            )

        # Garmin returns a list of activities directly
        activity_list = activities if isinstance(activities, list) else []

        return {
            "activities": activity_list,
            "total": len(activity_list),
            "limit": limit,
            "days": days,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(
            f"Error fetching Garmin activities for user {current_user.id}: {e}"
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch Garmin activities: {str(e)}"
        )
