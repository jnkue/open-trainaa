"""
Push token management router.
Handles registration and removal of Expo push notification tokens.
"""

from typing import Optional

from api.auth import User, get_current_user
from api.log import LOGGER
from api.utils.general import get_user_supabase_client
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
security_bearer = HTTPBearer()

router = APIRouter(
    prefix="/push-tokens",
    tags=["push-tokens"],
)


class RegisterTokenRequest(BaseModel):
    expo_push_token: str
    device_name: Optional[str] = None
    platform: Optional[str] = None


class PushTokenResponse(BaseModel):
    id: str
    expo_push_token: str
    device_name: Optional[str] = None
    platform: Optional[str] = None


@router.post("/register", response_model=PushTokenResponse)
@limiter.limit("10/minute")
async def register_push_token(
    request: Request,
    body: RegisterTokenRequest,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Register or update a push notification token for the current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)

        result = (
            user_supabase.table("user_push_tokens")
            .upsert(
                {
                    "user_id": current_user.id,
                    "expo_push_token": body.expo_push_token,
                    "device_name": body.device_name,
                    "platform": body.platform,
                },
                on_conflict="user_id,expo_push_token",
            )
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to register push token"
            )

        return PushTokenResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(
            f"Error registering push token for user {current_user.id}: {e}"
        )
        raise HTTPException(
            status_code=500, detail="Failed to register push token"
        )


@router.delete("/unregister")
@limiter.limit("10/minute")
async def unregister_push_token(
    request: Request,
    token: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Remove a push notification token for the current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        (
            user_supabase.table("user_push_tokens")
            .delete()
            .eq("user_id", current_user.id)
            .eq("expo_push_token", token)
            .execute()
        )
        return {"message": "Push token removed successfully"}
    except Exception as e:
        LOGGER.error(f"Error removing push token: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to remove push token"
        )
