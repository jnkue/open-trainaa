"""
Strava authentication router.
"""

import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import requests
from api.auth import User, get_current_user
from api.log import LOGGER
from api.utils import get_user_supabase_client, supabase
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from .helpers import sync_activities

security_bearer = HTTPBearer()


router = APIRouter(prefix="/strava/auth", tags=["strava-auth"])
limiter = Limiter(key_func=get_remote_address)


def has_activity_write_scope(scope: Optional[str]) -> bool:
    """Check if the scope string contains activity:write permission."""
    if not scope:
        return False
    scopes = [s.strip() for s in scope.split(",")]
    return "activity:write" in scopes


# Environment variables
STRAVA_CLIENT_ID: Optional[str] = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET: Optional[str] = os.getenv("STRAVA_CLIENT_SECRET")
BACKEND_BASE_URL: Optional[str] = os.getenv("BACKEND_BASE_URL")
FRONTEND_BASE_URL: Optional[str] = os.getenv("FRONTEND_BASE_URL")


class StravaTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int
    athlete: dict


@router.get("/authorize")
async def authorize_strava(
    current_user: User = Depends(get_current_user),
    redirect_uri: Optional[str] = Query(None),
):
    """Initiate Strava OAuth flow.

    The redirect_uri parameter is stored for later use in the callback,
    but the actual Strava OAuth always goes through our backend callback.
    """
    if not STRAVA_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Strava client ID not configured")

    # Always use backend /exchange_token endpoint for Strava OAuth
    # The redirect_uri will be used after successful auth to redirect to the app
    callback_uri = f"{BACKEND_BASE_URL}/v1/strava/auth/exchange_token"

    # TODO check and also check if FRONTEND_BASE_URL is still used
    # Store the final redirect URI in the state parameter along with user ID
    state_data = {
        "user_id": current_user.id,
        "redirect_uri": redirect_uri or f"{FRONTEND_BASE_URL}/connect-strava",
    }

    import base64
    import json

    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    # Generate OAuth URL
    params = {
        "client_id": STRAVA_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": callback_uri,
        "approval_prompt": "force",
        "scope": "activity:read_all,activity:write,profile:read_all",
        "state": state,  # Pass encoded state with user ID and redirect URI
    }

    oauth_url = f"https://www.strava.com/oauth/authorize?{urlencode(params)}"
    LOGGER.info(f"Redirecting user {current_user.id} to Strava OAuth: {oauth_url}")

    return {"authorization_url": oauth_url}


@router.get("/exchange_token")
async def strava_exchange_token(
    background_tasks: BackgroundTasks,
    code: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Handle Strava OAuth callback."""
    if error:
        LOGGER.error(f"Strava OAuth error: {error}")
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/connect-strava?error=strava_oauth_failed&message={error}"
        )

    # Decode the state parameter to get user_id and redirect_uri
    user_id = None
    redirect_uri = f"{FRONTEND_BASE_URL}/connect-strava"

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
            # Fallback: treat state as user_id (backward compatibility)
            user_id = state

    if not user_id:
        LOGGER.error("No user ID found in state parameter")
        return RedirectResponse(url=f"{redirect_uri}?error=invalid_state")

    # If no authorization code is present, but a user_id was provided,
    # check if we already have a token for that user and treat as success.
    if not code:
        LOGGER.info(
            "No authorization code received from Strava; checking existing tokens"
        )
        try:
            resp = (
                supabase.table("strava_tokens")
                .select("athlete_id, expires_at")
                .eq("user_id", user_id)
                .execute()
            )
            if resp.data:
                athlete_id = resp.data[0].get("athlete_id")
                LOGGER.info(
                    f"Found existing Strava token for user {user_id}, athlete {athlete_id}"
                )
                return RedirectResponse(
                    url=f"{redirect_uri}?success=strava_connected&athlete_id={athlete_id}&user_id={user_id}"
                )
        except Exception as e_check:
            LOGGER.warning(
                f"Error checking existing Strava token for user {user_id}: {e_check}"
            )

        LOGGER.error(
            "No authorization code received from Strava and no existing token found"
        )
        return RedirectResponse(url=f"{redirect_uri}?error=missing_code")

    try:
        # Exchange code for token
        token_data = {
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        }

        LOGGER.info(f"Exchanging code with Strava for user {user_id}")
        response = requests.post(
            "https://www.strava.com/api/v3/oauth/token",
            data=token_data,
        )

        if response.status_code != 200:
            LOGGER.error(
                f"Failed to exchange token. Status: {response.status_code}, Response: {response.text}"
            )
            return RedirectResponse(
                url=f"{redirect_uri}?error=token_exchange_failed&details={response.status_code}"
            )

        token_response = response.json()
        athlete_data = token_response.get("athlete") or {}
        athlete_id = (
            str(athlete_data.get("id")) if athlete_data.get("id") is not None else None
        )

        if not athlete_id:
            LOGGER.error("No athlete ID in token response")
            return RedirectResponse(url=f"{redirect_uri}?error=no_athlete_id")

        # Save token to database
        expires_at = datetime.fromtimestamp(token_response["expires_at"])

        # Get scope from token response (this is the actual granted scope)
        # Fall back to query parameter scope if not in response
        granted_scope = token_response.get("scope") or scope
        LOGGER.info(f"Granted scope for user {user_id}: {granted_scope}")

        token_record = {
            "user_id": user_id,  # User ID from decoded state parameter
            "athlete_id": athlete_id,
            "access_token": token_response.get("access_token"),
            "refresh_token": token_response.get("refresh_token"),
            "scope": granted_scope,
            "expires_at": expires_at.isoformat(),
            "athlete_data": athlete_data or {},
        }

        # Upsert token (insert or update if exists).
        # Specify on_conflict to handle existing records with the same user_id
        # Some deployments may not yet have the `athlete_data` column (migration pending).
        # Try upsert with athlete_data first; on failure, retry without that field.
        try:
            supabase.table("strava_tokens").upsert(
                token_record, on_conflict="user_id"
            ).execute()
            LOGGER.info(
                f"Successfully saved Strava token for athlete {athlete_id} (with athlete_data)"
            )

            # Sync last 21 days of activities on initial connection in the background
            background_tasks.add_task(sync_activities, 21, athlete_id, user_id)
            LOGGER.info(
                f"Scheduled background sync of activities for user {user_id} after Strava connect"
            )
        except Exception as e_upsert:
            LOGGER.warning(
                f"Upsert with athlete_data failed, retrying without athlete_data: {e_upsert}"
            )
            try:
                token_record_min = token_record.copy()
                token_record_min.pop("athlete_data", None)
                supabase.table("strava_tokens").upsert(
                    token_record_min, on_conflict="user_id"
                ).execute()
                LOGGER.info(
                    f"Successfully saved Strava token for athlete {athlete_id} (without athlete_data)"
                )
            except Exception as e2:
                LOGGER.error(
                    f"Failed to upsert Strava token even without athlete_data: {e2}"
                )
                raise

        return RedirectResponse(
            url=f"{redirect_uri}?success=strava_connected&athlete_id={athlete_id}&user_id={user_id}"
        )

    except Exception as e:
        import traceback

        LOGGER.error(f"Error in Strava callback: {e}")
        LOGGER.error(f"Traceback: {traceback.format_exc()}")
        return RedirectResponse(
            url=f"{redirect_uri}?error=callback_failed&message={str(e)}"
        )


async def disconnect_strava_by_user_id(user_id: str) -> dict:
    """
    Disconnect Strava account and clean up related data for a user.

    This function can be called by:
    1. The disconnect endpoint when a user manually disconnects
    2. The webhook handler when a user deauthorizes the app from Strava

    Args:
        user_id: The user's UUID

    Returns:
        dict: Status message indicating success or failure
    """
    try:
        # Strava tokens
        result = (
            supabase.table("strava_tokens").delete().eq("user_id", user_id).execute()
        )

        if result.data:
            LOGGER.info(f"Deleted Strava tokens for user {user_id}")
        else:
            LOGGER.warning(
                f"No Strava connection found to disconnect for user {user_id}"
            )

        # Strava responses
        result = (
            supabase.table("strava_responses").delete().eq("user_id", user_id).execute()
        )
        if result.data:
            LOGGER.info(
                f"Deleted {len(result.data)} Strava responses for user {user_id}"
            )
        else:
            LOGGER.info(f"No Strava responses found for user {user_id} to delete")

        return {"status": "success", "message": "Strava disconnected"}

    except Exception as e:
        LOGGER.error(f"Error disconnecting Strava for user {user_id}: {e}")
        raise


@router.delete("/disconnect")
async def disconnect_strava(current_user: User = Depends(get_current_user)):
    """Disconnect Strava account for the current user."""
    try:
        return await disconnect_strava_by_user_id(current_user.id)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to disconnect Strava")


@router.get("/status")
async def strava_connection_status(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get Strava connection status for current user."""
    LOGGER.info(f"Checking Strava status for user {current_user.id}")
    try:
        # Try including athlete_data (preferred)
        try:
            user_supabase = get_user_supabase_client(credentials.credentials)
            response = (
                user_supabase.table("strava_tokens")
                .select("athlete_id, expires_at, scope")
                .eq("user_id", current_user.id)
                .execute()
            )
        except Exception as e_select:
            LOGGER.warning(f"Selecting athlete_data failed: {e_select}")
            # Retry without athlete_data

        if response.data:
            token_data = response.data[0]
            expires_at = datetime.fromisoformat(token_data["expires_at"])
            is_expired = expires_at <= datetime.now(timezone.utc)
            scope = token_data.get("scope")

            return {
                "connected": True,
                "athlete_id": token_data.get("athlete_id"),
                "expires_at": token_data.get("expires_at"),
                "is_expired": is_expired,
                "scope": scope,
                "has_activity_write": has_activity_write_scope(scope),
                # If athlete_data wasn't selected, default to None
                "athlete_data": token_data.get("athlete_data", None),
            }
        else:
            return {"connected": False}

    except Exception as e:
        LOGGER.error(f"Error checking Strava status for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to check Strava status")


@router.get("/status/{user_id}")
async def strava_connection_status_by_user_id(user_id: str):
    """Get Strava connection status for a specific user ID (for callback verification)."""
    LOGGER.info(f"Checking Strava status for user {user_id}")
    try:
        # Try including athlete_data (preferred)
        try:
            response = (
                supabase.table("strava_tokens")
                .select("athlete_id, expires_at, scope, athlete_data")
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as e_select:
            LOGGER.warning(
                f"Selecting athlete_data failed (maybe column missing): {e_select}"
            )
            # Retry without athlete_data
            response = (
                supabase.table("strava_tokens")
                .select("athlete_id, expires_at, scope")
                .eq("user_id", user_id)
                .execute()
            )

        if response.data:
            token_data = response.data[0]
            expires_at = datetime.fromisoformat(token_data["expires_at"])
            is_expired = expires_at <= datetime.now(timezone.utc)
            scope = token_data.get("scope")

            return {
                "connected": True,
                "athlete_id": token_data.get("athlete_id"),
                "expires_at": token_data.get("expires_at"),
                "is_expired": is_expired,
                "scope": scope,
                "has_activity_write": has_activity_write_scope(scope),
                # If athlete_data wasn't selected, default to None
                "athlete_data": token_data.get("athlete_data", None),
            }
        else:
            return {"connected": False}

    except Exception as e:
        LOGGER.error(f"Error checking Strava status for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to check Strava status")
