"""
Garmin Connect authentication router with OAuth2 PKCE flow.
"""

import asyncio
import os
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import requests
from api.auth import User, get_current_user
from api.log import LOGGER
from api.redis import delete_pkce_verifier, get_pkce_verifier, set_pkce_verifier
from api.utils import get_user_supabase_client
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from .helpers import (
    GARMIN_AUTH_URL,
    GARMIN_TOKEN_URL,
    generate_pkce_challenge,
    supabase,
    trigger_activity_backfill,
)

security_bearer = HTTPBearer()

router = APIRouter(prefix="/garmin/auth", tags=["garmin-auth"])
limiter = Limiter(key_func=get_remote_address)


# Environment variables
GARMIN_CLIENT_ID: Optional[str] = os.getenv("GARMIN_CLIENT_ID")
GARMIN_CLIENT_SECRET: Optional[str] = os.getenv("GARMIN_CLIENT_SECRET")
BACKEND_BASE_URL: Optional[str] = os.getenv("BACKEND_BASE_URL")
FRONTEND_BASE_URL: Optional[str] = os.getenv("FRONTEND_BASE_URL")


class GarminTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int  # Garmin returns expires_in (seconds)
    token_type: str
    scope: Optional[str] = None


@router.get("/authorize")
async def authorize_garmin(
    current_user: User = Depends(get_current_user),
    redirect_uri: Optional[str] = Query(None),
):
    """Initiate Garmin OAuth2 PKCE flow.

    The redirect_uri parameter is stored for later use in the callback,
    but the actual Garmin OAuth always goes through our backend callback.
    """
    if not GARMIN_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Garmin client ID not configured")

    # Always use backend /exchange_token endpoint for Garmin OAuth
    callback_uri = f"{BACKEND_BASE_URL}/v1/garmin/auth/exchange_token"

    # Generate PKCE challenge
    code_verifier, code_challenge = generate_pkce_challenge()

    # Store the final redirect URI in the state parameter along with user ID
    state_data = {
        "user_id": current_user.id,
        "redirect_uri": redirect_uri or f"{FRONTEND_BASE_URL}/connect-garmin",
    }

    import base64
    import json

    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    # Store code_verifier for later use (indexed by user_id for security)
    set_pkce_verifier(current_user.id, code_verifier)

    # Generate OAuth URL with PKCE challenge
    # Required scopes for Garmin: activities, workouts
    params = {
        "client_id": GARMIN_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": callback_uri,
        "scope": "activities workouts",  # Space-separated scopes
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",  # SHA-256
    }

    oauth_url = f"{GARMIN_AUTH_URL}?{urlencode(params)}"
    LOGGER.info(f"Redirecting user {current_user.id} to Garmin OAuth: {oauth_url}")

    return {"authorization_url": oauth_url}


@router.get("/exchange_token")
async def garmin_exchange_token(
    background_tasks: BackgroundTasks,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Handle Garmin OAuth callback with PKCE verification."""
    if error:
        LOGGER.error(f"Garmin OAuth error: {error}")
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/connect-garmin?error=garmin_oauth_failed&message={error}"
        )

    # Decode the state parameter to get user_id and redirect_uri
    user_id = None
    redirect_uri = f"{FRONTEND_BASE_URL}/connect-garmin"

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
            "No authorization code received from Garmin; checking existing tokens"
        )
        try:
            resp = (
                supabase.table("garmin_tokens")
                .select("athlete_id, expires_at")
                .eq("user_id", user_id)
                .execute()
            )
            if resp.data:
                athlete_id = resp.data[0].get("athlete_id")
                LOGGER.info(
                    f"Found existing Garmin token for user {user_id}, athlete {athlete_id}"
                )
                return RedirectResponse(
                    url=f"{redirect_uri}?success=garmin_connected&athlete_id={athlete_id}&user_id={user_id}"
                )
        except Exception as e_check:
            LOGGER.warning(
                f"Error checking existing Garmin token for user {user_id}: {e_check}"
            )

        LOGGER.error(
            "No authorization code received from Garmin and no existing token found"
        )
        return RedirectResponse(url=f"{redirect_uri}?error=missing_code")

    # Retrieve code_verifier from storage
    code_verifier = get_pkce_verifier(user_id)
    if not code_verifier:
        LOGGER.error(f"No PKCE code_verifier found for user {user_id}")
        return RedirectResponse(url=f"{redirect_uri}?error=missing_pkce_verifier")

    try:
        # Exchange code for token using PKCE
        callback_uri = f"{BACKEND_BASE_URL}/v1/garmin/auth/exchange_token"

        token_data = {
            "client_id": GARMIN_CLIENT_ID,
            "client_secret": GARMIN_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": callback_uri,
            "code_verifier": code_verifier,  # PKCE verification
        }

        response = requests.post(
            GARMIN_TOKEN_URL,
            data=token_data,
        )

        # Clean up code_verifier from storage
        delete_pkce_verifier(user_id)

        if response.status_code != 200:
            LOGGER.error(f"Failed to exchange token: {response.text}")
            return RedirectResponse(url=f"{redirect_uri}?error=token_exchange_failed")

        token_response = response.json()
        LOGGER.info(f"Garmin token response: {token_response}")

        # Garmin doesn't return user_id in token response, we need to fetch it
        access_token = token_response.get("access_token")

        # Fetch user profile to get athlete_id
        try:
            from .helpers import fetch_garmin_permissions, make_garmin_api_request

            # Use user profile endpoint to get athlete ID
            user_profile = make_garmin_api_request(
                access_token, "wellness-api/rest/user/id"
            )

            if not user_profile or "userId" not in user_profile:
                LOGGER.error("Failed to fetch Garmin user profile")
                return RedirectResponse(url=f"{redirect_uri}?error=no_athlete_id")

            athlete_id = str(user_profile["userId"])
            LOGGER.info(f"Fetched Garmin athlete ID: {athlete_id}")

            # Fetch user permissions
            permissions = fetch_garmin_permissions(access_token)
            if permissions is None:
                LOGGER.warning("Failed to fetch Garmin permissions, using empty array")
                permissions = []

        except Exception as e_profile:
            LOGGER.error(f"Error fetching Garmin user profile: {e_profile}")
            return RedirectResponse(url=f"{redirect_uri}?error=profile_fetch_failed")

        # Save token to database
        expires_in = token_response.get("expires_in", 86400)  # Default to 24 hours
        expires_at = datetime.now() + timedelta(seconds=expires_in)

        # Map Garmin permissions to our boolean flags
        # WORKOUT_IMPORT allows uploading workouts to Garmin
        # ACTIVITY_EXPORT allows downloading activities from Garmin
        has_workout_import = "WORKOUT_IMPORT" in permissions
        has_activity_export = "ACTIVITY_EXPORT" in permissions

        token_record = {
            "user_id": user_id,
            "athlete_id": str(athlete_id),
            "access_token": token_response.get("access_token"),
            "refresh_token": token_response.get("refresh_token"),
            "expires_at": expires_at.isoformat(),
            "scope": token_response.get("scope", ""),
            "athlete_data": user_profile if user_profile else {},
            "permissions": permissions,  # Store full permissions array
            "upload_workouts_enabled": has_workout_import,  # Enable only if permission granted
            "download_activities_enabled": has_activity_export,  # Enable only if permission granted
        }

        # Upsert token
        try:
            supabase.table("garmin_tokens").upsert(token_record).execute()
            LOGGER.info(f"Successfully saved Garmin token for athlete {athlete_id}")
        except Exception as e_upsert:
            LOGGER.error(f"Failed to upsert Garmin token: {e_upsert}")
            return RedirectResponse(url=f"{redirect_uri}?error=database_save_failed")

        # Retry permissions and backfill in background with exponential backoff.
        # Garmin registers the user-partner association asynchronously after OAuth,
        # so immediate API calls often fail with 403. Retrying after a delay fixes this.
        # Note: the access token was just minted (expires_in=86400s) so it will be
        # valid for the entire retry window (~100s).
        _needs_permission_retry = permissions == []
        _access_token = access_token
        _user_id = user_id

        async def retry_permissions_and_backfill():
            """Background task to retry permissions fetch and trigger backfill."""
            permission_pending = _needs_permission_retry
            backfill_pending = True
            delays = [10, 30, 60]

            for delay in delays:
                if not permission_pending and not backfill_pending:
                    return

                await asyncio.sleep(delay)

                if permission_pending:
                    try:
                        retried = await asyncio.to_thread(
                            fetch_garmin_permissions, _access_token
                        )
                        if retried is not None and len(retried) > 0:
                            supabase.table("garmin_tokens").update(
                                {
                                    "permissions": retried,
                                    "upload_workouts_enabled": "WORKOUT_IMPORT"
                                    in retried,
                                    "download_activities_enabled": "ACTIVITY_EXPORT"
                                    in retried,
                                }
                            ).eq("user_id", _user_id).execute()
                            LOGGER.info(
                                f"Successfully updated permissions on retry for user {_user_id}: {retried}"
                            )
                            permission_pending = False
                    except Exception as e_perm:
                        LOGGER.warning(
                            f"Permission retry failed for user {_user_id}: {e_perm}"
                        )

                if backfill_pending:
                    try:
                        LOGGER.info(
                            f"Triggering 21-day activity backfill for user {_user_id}"
                        )
                        success = await asyncio.to_thread(
                            trigger_activity_backfill, _access_token, 21
                        )
                        if success:
                            LOGGER.info(
                                f"Successfully triggered backfill for user {_user_id}"
                            )
                            backfill_pending = False
                        else:
                            LOGGER.warning(
                                f"Backfill not accepted for user {_user_id}, will retry"
                            )
                    except Exception as e_backfill:
                        LOGGER.warning(
                            f"Backfill retry failed for user {_user_id}: {e_backfill}"
                        )

            if permission_pending or backfill_pending:
                LOGGER.error(
                    f"Failed after all retries for user {_user_id}: "
                    f"permissions={'pending' if permission_pending else 'ok'}, "
                    f"backfill={'pending' if backfill_pending else 'ok'}"
                )

        background_tasks.add_task(retry_permissions_and_backfill)

        return RedirectResponse(
            url=f"{redirect_uri}?success=garmin_connected&athlete_id={athlete_id}&user_id={user_id}"
        )

    except Exception as e:
        LOGGER.error(f"Error in Garmin callback: {e}")
        # Clean up code_verifier on error
        delete_pkce_verifier(user_id)
        return RedirectResponse(
            url=f"{redirect_uri}?error=callback_failed&message={str(e)}"
        )


@router.delete("/disconnect")
async def disconnect_garmin(current_user: User = Depends(get_current_user)):
    """Disconnect Garmin account."""
    try:
        result = (
            supabase.table("garmin_tokens")
            .delete()
            .eq("user_id", current_user.id)
            .execute()
        )

        if result.data:
            LOGGER.info(f"Disconnected Garmin for user {current_user.id}")
            return {
                "success": True,
                "message": "Garmin account disconnected successfully",
            }
        else:
            return {
                "success": True,
                "message": "No Garmin connection found to disconnect",
            }

    except Exception as e:
        LOGGER.error(f"Error disconnecting Garmin for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect Garmin")


@router.get("/status")
async def garmin_connection_status(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get Garmin connection status for current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        response = (
            user_supabase.table("garmin_tokens")
            .select(
                "athlete_id, expires_at, scope, upload_workouts_enabled, download_activities_enabled, permissions"
            )
            .eq("user_id", current_user.id)
            .execute()
        )

        if response.data:
            token_data = response.data[0]
            expires_at_str = token_data["expires_at"]
            # Parse datetime and remove timezone info for comparison
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            # Make datetime.now() timezone-aware if expires_at has timezone
            if expires_at.tzinfo is not None:
                from datetime import timezone

                is_expired = expires_at <= datetime.now(timezone.utc)
            else:
                is_expired = expires_at <= datetime.now()

            # Get permissions and compute convenience booleans
            permissions = token_data.get("permissions", [])
            has_workout_import = "WORKOUT_IMPORT" in permissions
            has_activity_export = "ACTIVITY_EXPORT" in permissions

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
                "permissions": permissions,
                "has_workout_import_permission": has_workout_import,
                "has_activity_export_permission": has_activity_export,
            }
        else:
            return {"connected": False}

    except Exception as e:
        LOGGER.error(f"Error checking Garmin status for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to check Garmin status")


@router.put("/settings")
async def update_garmin_settings(
    background_tasks: BackgroundTasks,
    upload_workouts_enabled: bool = Query(...),
    download_activities_enabled: bool = Query(...),
    current_user: User = Depends(get_current_user),
):
    """
    Update Garmin integration settings.

    When upload_workouts_enabled is set to True, this will trigger a background
    sync of all pending workouts and scheduled workouts to Garmin.
    """
    try:
        # Get current settings and permissions to check if upload is being enabled
        current_settings = (
            supabase.table("garmin_tokens")
            .select("upload_workouts_enabled, download_activities_enabled, permissions")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not current_settings.data:
            raise HTTPException(status_code=404, detail="Garmin connection not found")

        current_data = current_settings.data[0]
        was_upload_disabled = not current_data.get("upload_workouts_enabled", False)
        permissions = current_data.get("permissions", [])

        # Validate permissions before enabling features
        if upload_workouts_enabled and "WORKOUT_IMPORT" not in permissions:
            raise HTTPException(
                status_code=400,
                detail="Cannot enable workout upload: WORKOUT_IMPORT permission not granted by Garmin. "
                "Please update your permissions in Garmin Connect settings.",
            )

        if download_activities_enabled and "ACTIVITY_EXPORT" not in permissions:
            raise HTTPException(
                status_code=400,
                detail="Cannot enable activity download: ACTIVITY_EXPORT permission not granted by Garmin. "
                "Please update your permissions in Garmin Connect settings.",
            )

        # Update settings
        result = (
            supabase.table("garmin_tokens")
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
                f"Updated Garmin settings for user {current_user.id}: "
                f"upload={upload_workouts_enabled}, download={download_activities_enabled}"
            )

            # If upload was just enabled, trigger background sync
            if upload_workouts_enabled and was_upload_disabled:
                LOGGER.info(
                    f"Workout upload enabled for user {current_user.id}, triggering bulk sync"
                )

                async def sync_all_upcoming_workouts():
                    """Enqueue user workouts scheduled for today and future for Garmin sync."""
                    try:
                        from api.database import supabase
                        from api.services.workout_sync import get_sync_service

                        sync_service = get_sync_service()

                        # Get today's date at 00:00:00
                        today_start = datetime.now().replace(
                            hour=0, minute=0, second=0, microsecond=0
                        )
                        today_start_str = today_start.isoformat()

                        # Get scheduled workouts for today and future
                        scheduled = (
                            supabase.table("workouts_scheduled")
                            .select("id, workout_id")
                            .eq("user_id", str(current_user.id))
                            .gte("scheduled_time", today_start_str)
                            .execute()
                        )

                        # Extract unique workout IDs from scheduled workouts
                        workout_ids = list(
                            set(
                                sched["workout_id"]
                                for sched in scheduled.data
                                if sched.get("workout_id")
                            )
                        )

                        # Enqueue only workouts that are scheduled for today/future
                        workout_count = 0
                        if workout_ids:
                            workouts = (
                                supabase.table("workouts")
                                .select("id")
                                .eq("user_id", str(current_user.id))
                                .in_("id", workout_ids)
                                .execute()
                            )

                            for workout in workouts.data:
                                await sync_service.enqueue_sync(
                                    current_user.id,
                                    "workout",
                                    workout["id"],
                                    "create",
                                    "garmin",
                                )
                            workout_count = len(workouts.data)

                        # Enqueue scheduled workouts for today and future
                        for sched in scheduled.data:
                            await sync_service.enqueue_sync(
                                current_user.id,
                                "workout_scheduled",
                                sched["id"],
                                "create",
                                "garmin",
                            )

                        LOGGER.info(
                            f"Bulk sync enqueued for user {current_user.id}: "
                            f"{workout_count} workouts, {len(scheduled.data)} scheduled (today/future only)"
                        )
                    except Exception as e:
                        LOGGER.error(f"Error enqueueing workouts for Garmin sync: {e}")

                background_tasks.add_task(sync_all_upcoming_workouts)

            return {
                "success": True,
                "upload_workouts_enabled": upload_workouts_enabled,
                "download_activities_enabled": download_activities_enabled,
                "sync_triggered": upload_workouts_enabled and was_upload_disabled,
            }
        else:
            raise HTTPException(status_code=404, detail="Garmin connection not found")

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error updating Garmin settings for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update Garmin settings")
