"""
Wahoo Fitness authentication router.
"""

import os
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode

import requests
from api.auth import User, get_current_user
from api.log import LOGGER
from api.utils import get_user_supabase_client
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from .helpers import deauthorize_wahoo, supabase

security_bearer = HTTPBearer()


router = APIRouter(prefix="/wahoo/auth", tags=["wahoo-auth"])
limiter = Limiter(key_func=get_remote_address)


# Environment variables
WAHOO_CLIENT_ID: Optional[str] = os.getenv("WAHOO_CLIENT_ID")
WAHOO_CLIENT_SECRET: Optional[str] = os.getenv("WAHOO_CLIENT_SECRET")
BACKEND_BASE_URL: Optional[str] = os.getenv("BACKEND_BASE_URL")
FRONTEND_BASE_URL: Optional[str] = os.getenv("FRONTEND_BASE_URL")


class WahooTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int  # Wahoo returns expires_in (seconds), not expires_at
    user_id: str
    token_type: str
    scope: Optional[str] = None


@router.get("/authorize")
async def authorize_wahoo(
    current_user: User = Depends(get_current_user),
    redirect_uri: Optional[str] = Query(None),
):
    """Initiate Wahoo OAuth flow.

    The redirect_uri parameter is stored for later use in the callback,
    but the actual Wahoo OAuth always goes through our backend callback.
    """
    if not WAHOO_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Wahoo client ID not configured")

    # Always use backend /exchange_token endpoint for Wahoo OAuth
    callback_uri = f"{BACKEND_BASE_URL}/v1/wahoo/auth/exchange_token"

    # Store the final redirect URI in the state parameter along with user ID
    state_data = {
        "user_id": current_user.id,
        "redirect_uri": redirect_uri or f"{FRONTEND_BASE_URL}/connect-wahoo",
    }

    import base64
    import json

    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    # Generate OAuth URL
    # Required scopes: workouts_read, workouts_write, plans_read, plans_write, offline_data, user_read
    # Note: Wahoo expects space-separated scopes which urlencode converts to + signs
    scopes = [
        "workouts_read",
        "workouts_write",
        "plans_read",
        "plans_write",
        "offline_data",
        "user_read",
    ]

    params = {
        "client_id": WAHOO_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": callback_uri,
        "scope": " ".join(
            scopes
        ),  # Space-separated, will be converted to + by urlencode
        "state": state,
        "locale": "de",
    }

    oauth_url = f"https://api.wahooligan.com/oauth/authorize?{urlencode(params)}"
    LOGGER.info(f"Redirecting user {current_user.id} to Wahoo OAuth: {oauth_url}")

    return {"authorization_url": oauth_url}


@router.get("/exchange_token")
async def wahoo_exchange_token(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Handle Wahoo OAuth callback."""
    if error:
        LOGGER.error(f"Wahoo OAuth error: {error}")
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/connect-wahoo?error=wahoo_oauth_failed&message={error}"
        )

    # Decode the state parameter to get user_id and redirect_uri
    user_id = None
    redirect_uri = f"{FRONTEND_BASE_URL}/connect-wahoo"

    if state:
        try:
            import base64
            import json

            decoded_state = json.loads(
                base64.urlsafe_b64decode(state.encode()).decode()
            )
            user_id = decoded_state.get("user_id")
            redirect_uri = decoded_state.get("redirect_uri", redirect_uri)
            LOGGER.info(
                f"Decoded state: user_id={user_id}, redirect_uri={redirect_uri}"
            )
        except Exception as e:
            LOGGER.warning(
                f"Failed to decode state parameter: {e}, using state as user_id"
            )
            user_id = state

    if not user_id:
        LOGGER.error("No user ID found in state parameter")
        return RedirectResponse(url=f"{redirect_uri}?error=invalid_state")

    # Check if we already have a token
    if not code:
        LOGGER.info(
            "No authorization code received from Wahoo; checking existing tokens"
        )
        try:
            resp = (
                supabase.table("wahoo_tokens")
                .select("athlete_id, expires_at")
                .eq("user_id", user_id)
                .execute()
            )
            if resp.data:
                athlete_id = resp.data[0].get("athlete_id")
                LOGGER.info(
                    f"Found existing Wahoo token for user {user_id}, athlete {athlete_id}"
                )
                return RedirectResponse(
                    url=f"{redirect_uri}?success=wahoo_connected&athlete_id={athlete_id}&user_id={user_id}"
                )
        except Exception as e_check:
            LOGGER.warning(
                f"Error checking existing Wahoo token for user {user_id}: {e_check}"
            )

        LOGGER.error(
            "No authorization code received from Wahoo and no existing token found"
        )
        return RedirectResponse(url=f"{redirect_uri}?error=missing_code")

    try:
        # Exchange code for token
        callback_uri = f"{BACKEND_BASE_URL}/v1/wahoo/auth/exchange_token"

        token_data = {
            "client_id": WAHOO_CLIENT_ID,
            "client_secret": WAHOO_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": callback_uri,
        }

        response = requests.post(
            "https://api.wahooligan.com/oauth/token",
            data=token_data,
        )

        if response.status_code != 200:
            LOGGER.error(f"Failed to exchange token: {response.text}")
            return RedirectResponse(url=f"{redirect_uri}?error=token_exchange_failed")

        token_response = response.json()
        LOGGER.info(f"Wahoo token response: {token_response}")

        # Wahoo returns user_id in the token response
        athlete_id = token_response.get("user_id")

        if not athlete_id:
            LOGGER.error("No user ID in token response")
            return RedirectResponse(url=f"{redirect_uri}?error=no_athlete_id")

        # Save token to database
        # Wahoo returns expires_in (seconds), not expires_at (timestamp)
        expires_in = token_response.get("expires_in", 7200)  # Default to 2 hours
        expires_at_timestamp = datetime.now().timestamp() + expires_in
        expires_at_dt = datetime.fromtimestamp(expires_at_timestamp)

        # Parse granted scopes to auto-enable features
        scope_str = token_response.get("scope", "")
        granted_scopes = scope_str.split() if scope_str else []

        # Auto-enable upload if both workouts_write and plans_write are granted
        upload_enabled = (
            "workouts_write" in granted_scopes and "plans_write" in granted_scopes
        )

        # Auto-enable download if workouts_read is granted
        download_enabled = "workouts_read" in granted_scopes

        token_record = {
            "user_id": user_id,
            "athlete_id": str(athlete_id),
            "access_token": token_response.get("access_token"),
            "refresh_token": token_response.get("refresh_token"),
            "expires_at": expires_at_dt.isoformat(),
            "scope": scope_str,
            "athlete_data": {},
            "upload_workouts_enabled": upload_enabled,
            "download_activities_enabled": download_enabled,
            "needs_reauth": False,
        }

        # Upsert token
        try:
            supabase.table("wahoo_tokens").upsert(token_record).execute()
            LOGGER.info(f"Successfully saved Wahoo token for athlete {athlete_id}")
        except Exception as e_upsert:
            LOGGER.error(f"Failed to upsert Wahoo token: {e_upsert}")
            return RedirectResponse(url=f"{redirect_uri}?error=database_save_failed")

        # If download is enabled, trigger initial workout sync in background
        if download_enabled:
            LOGGER.info(
                f"Download enabled for user {user_id}, scheduling initial workout sync"
            )
            from .api import sync_initial_workouts

            background_tasks.add_task(sync_initial_workouts, user_id, 30)
        else:
            LOGGER.info(
                f"Download not enabled for user {user_id}, skipping initial workout sync"
            )

        return RedirectResponse(
            url=f"{redirect_uri}?success=wahoo_connected&athlete_id={athlete_id}&user_id={user_id}"
        )

    except Exception as e:
        LOGGER.error(f"Error in Wahoo callback: {e}")
        return RedirectResponse(
            url=f"{redirect_uri}?error=callback_failed&message={str(e)}"
        )


@router.delete("/disconnect")
async def disconnect_wahoo(current_user: User = Depends(get_current_user)):
    """
    Disconnect Wahoo account.

    This will:
    1. Deauthorize the app with Wahoo (revokes ALL tokens)
    2. Delete the token from local database

    User will need to go through OAuth flow again to reconnect.
    """
    try:
        # First, fetch the current token to deauthorize with Wahoo
        token_result = (
            supabase.table("wahoo_tokens")
            .select("access_token")
            .eq("user_id", current_user.id)
            .execute()
        )

        deauth_success = False
        if token_result.data:
            access_token = token_result.data[0]["access_token"]
            # Attempt to deauthorize with Wahoo
            deauth_success = deauthorize_wahoo(access_token)

            if deauth_success:
                LOGGER.info(
                    f"Successfully deauthorized Wahoo for user {current_user.id}"
                )
            else:
                LOGGER.warning(
                    f"Failed to deauthorize Wahoo for user {current_user.id}, "
                    "but will still delete from local database"
                )
        else:
            LOGGER.info(f"No Wahoo token found for user {current_user.id}")

        # Always delete from local database, even if deauthorization failed
        # This ensures local state is consistent
        delete_result = (
            supabase.table("wahoo_tokens")
            .delete()
            .eq("user_id", current_user.id)
            .execute()
        )

        if delete_result.data or not token_result.data:
            message = "Wahoo account disconnected successfully"
            if not deauth_success and token_result.data:
                message += " (local only - Wahoo API deauthorization failed)"

            LOGGER.info(f"Deleted Wahoo token from database for user {current_user.id}")
            return {"success": True, "message": message}
        else:
            LOGGER.warning(
                f"No Wahoo connection found to disconnect for user {current_user.id}"
            )
            return {
                "success": True,
                "message": "No Wahoo connection found to disconnect",
            }

    except Exception as e:
        LOGGER.error(f"Error disconnecting Wahoo for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect Wahoo")


@router.get("/status")
async def wahoo_connection_status(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get Wahoo connection status for current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        response = (
            user_supabase.table("wahoo_tokens")
            .select(
                "athlete_id, expires_at, scope, upload_workouts_enabled, download_activities_enabled, needs_reauth"
            )
            .eq("user_id", current_user.id)
            .execute()
        )

        if response.data:
            token_data = response.data[0]
            expires_at_str = token_data["expires_at"]
            # Parse datetime and remove timezone info for comparison
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            # Make datetime.now() timezone-aware if expires_at has timezone, or compare naive datetimes
            if expires_at.tzinfo is not None:
                from datetime import timezone

                is_expired = expires_at <= datetime.now(timezone.utc)
            else:
                is_expired = expires_at <= datetime.now()

            # Parse scope to check for specific permissions
            scope_str = token_data.get("scope", "")
            scopes = scope_str.split() if scope_str else []

            has_workouts_write = "workouts_write" in scopes
            has_plans_write = "plans_write" in scopes
            has_workouts_read = "workouts_read" in scopes

            return {
                "connected": True,
                "athlete_id": token_data.get("athlete_id"),
                "expires_at": token_data.get("expires_at"),
                "is_expired": is_expired,
                "scope": token_data.get("scope"),
                "upload_workouts_enabled": token_data.get(
                    "upload_workouts_enabled", False
                ),
                "download_activities_enabled": token_data.get(
                    "download_activities_enabled", True
                ),
                "has_workouts_write": has_workouts_write,
                "has_plans_write": has_plans_write,
                "has_workouts_read": has_workouts_read,
                "needs_reauth": token_data.get("needs_reauth", False),
            }
        else:
            return {"connected": False}

    except Exception as e:
        LOGGER.error(f"Error checking Wahoo status for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to check Wahoo status")


@router.put("/settings")
async def update_wahoo_settings(
    background_tasks: BackgroundTasks,
    upload_workouts_enabled: bool = Query(...),
    download_activities_enabled: bool = Query(...),
    current_user: User = Depends(get_current_user),
):
    """
    Update Wahoo integration settings.

    When upload_workouts_enabled is set to True, this will trigger a background
    sync of all pending workouts and scheduled workouts to Wahoo.
    """
    try:
        # Get current settings to check if upload is being enabled
        current_settings = (
            supabase.table("wahoo_tokens")
            .select("upload_workouts_enabled")
            .eq("user_id", current_user.id)
            .execute()
        )

        was_upload_disabled = not current_settings.data or not current_settings.data[
            0
        ].get("upload_workouts_enabled", False)

        # Update settings
        result = (
            supabase.table("wahoo_tokens")
            .update(
                {
                    "upload_workouts_enabled": upload_workouts_enabled,
                    "download_activities_enabled": download_activities_enabled,
                }
            )
            .eq("user_id", current_user.id)
            .execute()
        )

        if result.data:
            LOGGER.info(
                f"Updated Wahoo settings for user {current_user.id}: "
                f"upload={upload_workouts_enabled}, download={download_activities_enabled}"
            )

            # If upload was just enabled, trigger background sync by enqueueing all workouts
            if upload_workouts_enabled and was_upload_disabled:
                LOGGER.info(
                    f"Workout upload enabled for user {current_user.id}, triggering bulk sync"
                )

                async def sync_all_upcoming_workouts():
                    """Enqueue user workouts scheduled for today and future for Wahoo sync."""
                    try:
                        from api.services.workout_sync import get_sync_service

                        sync_service = get_sync_service()

                        # Get today's date at 00:00:00
                        today_start = datetime.now().replace(
                            hour=0, minute=0, second=0, microsecond=0
                        )
                        today_start_str = today_start.isoformat()

                        # Get scheduled workouts for today and future
                        scheduled_result = (
                            supabase.table("workouts_scheduled")
                            .select("id, workout_id")
                            .eq("user_id", str(current_user.id))
                            .gte("scheduled_time", today_start_str)
                            .execute()
                        )

                        # Extract unique workout IDs from scheduled workouts
                        workout_ids = list(
                            set(
                                scheduled["workout_id"]
                                for scheduled in scheduled_result.data
                                if scheduled.get("workout_id")
                            )
                        )

                        # Enqueue only workouts that are scheduled for today/future
                        workout_count = 0
                        if workout_ids:
                            workouts_result = (
                                supabase.table("workouts")
                                .select("id")
                                .eq("user_id", str(current_user.id))
                                .in_("id", workout_ids)
                                .execute()
                            )

                            for workout in workouts_result.data:
                                await sync_service.enqueue_sync(
                                    current_user.id,
                                    "workout",
                                    workout["id"],
                                    "create",
                                    "wahoo",
                                )
                            workout_count = len(workouts_result.data)

                        # Enqueue scheduled workouts for today and future
                        for scheduled in scheduled_result.data:
                            await sync_service.enqueue_sync(
                                current_user.id,
                                "workout_scheduled",
                                scheduled["id"],
                                "create",
                                "wahoo",
                            )

                        LOGGER.info(
                            f"Bulk sync enqueued for user {current_user.id}: "
                            f"{workout_count} workouts, {len(scheduled_result.data)} scheduled (today/future only)"
                        )
                    except Exception as e:
                        LOGGER.error(f"Error enqueueing workouts for Wahoo sync: {e}")

                background_tasks.add_task(sync_all_upcoming_workouts)

            return {
                "success": True,
                "upload_workouts_enabled": upload_workouts_enabled,
                "download_activities_enabled": download_activities_enabled,
                "sync_triggered": upload_workouts_enabled and was_upload_disabled,
            }
        else:
            raise HTTPException(status_code=404, detail="Wahoo connection not found")

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error updating Wahoo settings for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update Wahoo settings")
