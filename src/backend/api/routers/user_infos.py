"""
User Attributes router - manages user physiological and performance attributes.
Provides endpoints for both structured attributes and flexible key-value storage.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import httpx
from api.auth import User, get_current_user
from api.database import supabase
from api.log import LOGGER
from api.utils import get_user_supabase_client
from api.utils.encryption import encrypt_api_key
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
security_bearer = HTTPBearer()

router = APIRouter(
    prefix="/user-attributes",
    tags=["user-attributes"],
    dependencies=[],
)


# Pydantic models for user_infos table
class UserAttributesBase(BaseModel):
    max_heart_rate: Optional[int] = None
    threshold_heart_rate: Optional[int] = None
    resting_heart_rate: Optional[int] = None
    functional_threshold_power: Optional[int] = None
    run_threshold_pace: Optional[str] = None  # interval type stored as string
    vdot: Optional[float] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    automatic_calculation_mode: bool = True
    preferred_units: str = "metric"
    notes: Optional[str] = None
    language: str = "en"  # User's preferred language code (e.g., en, de, es, fr, it)
    post_feedback_to_strava: bool = (
        False  # Whether to post AI feedback to Strava activities
    )
    analytics_consent: Optional[bool] = (
        None  # NULL = not asked, TRUE = consented, FALSE = declined
    )
    push_notification_feedback: bool = False
    push_notification_daily_overview: bool = False


class UserAttributesCreate(UserAttributesBase):
    pass


class UserAttributesUpdate(UserAttributesBase):
    pass


class UserAttributesResponse(UserAttributesBase):
    id: UUID
    user_id: UUID
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# User Attributes (structured table) endpoints
@router.get("/", response_model=Optional[UserAttributesResponse])
@limiter.limit("30/minute")
async def get_user_infos(
    request: Request,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get structured user attributes for the current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        result = (
            user_supabase.table("user_infos")
            .select("*")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            return None

        return UserAttributesResponse(**result.data[0])
    except Exception as e:
        LOGGER.error(f"Error fetching user attributes for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user attributes")


@router.post("/", response_model=UserAttributesResponse)
@limiter.limit("10/minute")
async def create_user_infos(
    request: Request,
    attributes: UserAttributesCreate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Create structured user attributes for the current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Check if attributes already exist
        existing = (
            user_supabase.table("user_infos")
            .select("id")
            .eq("user_id", current_user.id)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="User attributes already exist. Use PUT to update.",
            )

        data = attributes.model_dump(exclude_unset=True)
        data["user_id"] = current_user.id

        result = user_supabase.table("user_infos").insert(data).execute()

        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to create user attributes"
            )

        return UserAttributesResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error creating user attributes for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create user attributes")


@router.put("/", response_model=UserAttributesResponse)
@limiter.limit("10/minute")
async def update_user_infos(
    request: Request,
    attributes: UserAttributesUpdate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Update structured user attributes for the current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        data = attributes.model_dump(exclude_unset=True)

        # Check if record exists
        existing = (
            user_supabase.table("user_infos")
            .select("id")
            .eq("user_id", current_user.id)
            .execute()
        )

        if existing.data:
            # Update existing record
            result = (
                user_supabase.table("user_infos")
                .update(data)
                .eq("user_id", current_user.id)
                .execute()
            )
        else:
            # Create new record
            data["user_id"] = current_user.id
            result = user_supabase.table("user_infos").insert(data).execute()

        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to update user attributes"
            )

        # Invalidate consent cache when analytics_consent changes
        if "analytics_consent" in data:
            from api.utils.consent import clear_consent_cache

            clear_consent_cache(current_user.id)

        return UserAttributesResponse(**result.data[0])
    except Exception as e:
        LOGGER.error(f"Error updating user attributes for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update user attributes")


@router.delete("/")
@limiter.limit("5/minute")
async def delete_user_infos(
    request: Request,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Delete structured user attributes for the current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        user_supabase.table("user_infos").delete().eq(
            "user_id", current_user.id
        ).execute()
        return {"message": "User attributes deleted successfully"}
    except Exception as e:
        LOGGER.error(f"Error deleting user attributes for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user attributes")


# --- BYOK (Bring Your Own Key) Endpoints ---


class SetApiKeyRequest(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=500)
    accepted_terms: bool


class ApiKeyStatusResponse(BaseModel):
    has_api_key: bool
    accepted_at: Optional[str] = None


@router.get("/api-key", response_model=ApiKeyStatusResponse)
@limiter.limit("30/minute")
async def get_api_key_status(
    request: Request,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Check if user has a BYOK OpenRouter API key configured. Never returns the key itself."""
    try:
        result = (
            supabase.table("user_infos")
            .select("openrouter_api_key_encrypted, byok_accepted_at")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            return ApiKeyStatusResponse(has_api_key=False)

        row = result.data[0]
        has_key = bool(row.get("openrouter_api_key_encrypted"))
        accepted_at = row.get("byok_accepted_at")

        return ApiKeyStatusResponse(has_api_key=has_key, accepted_at=accepted_at)
    except Exception as e:
        LOGGER.error(f"Error checking API key status for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to check API key status")


@router.put("/api-key", response_model=ApiKeyStatusResponse)
@limiter.limit("5/minute")
async def set_api_key(
    request: Request,
    body: SetApiKeyRequest,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Set or update the user's BYOK OpenRouter API key. Validates the key before storing."""
    if not body.accepted_terms:
        raise HTTPException(
            status_code=400,
            detail="You must accept the terms and cost responsibility before setting an API key.",
        )

    # Validate the API key against OpenRouter
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {body.api_key}"},
            )
            if resp.status_code == 401:
                raise HTTPException(status_code=400, detail="Invalid API key.")
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail="Could not validate API key with OpenRouter. Please try again.",
                )
    except httpx.RequestError as e:
        LOGGER.error(f"Error validating OpenRouter API key: {e}")
        raise HTTPException(
            status_code=502,
            detail="Could not reach OpenRouter to validate the API key. Please try again later.",
        )

    # Encrypt and store
    try:
        encrypted_key = encrypt_api_key(body.api_key)
        now = datetime.now(timezone.utc).isoformat()

        user_supabase = get_user_supabase_client(credentials.credentials)

        # Check if record exists
        existing = (
            user_supabase.table("user_infos")
            .select("id")
            .eq("user_id", current_user.id)
            .execute()
        )

        update_data = {
            "openrouter_api_key_encrypted": encrypted_key,
            "byok_accepted_at": now,
        }

        if existing.data:
            user_supabase.table("user_infos").update(update_data).eq(
                "user_id", current_user.id
            ).execute()
        else:
            update_data["user_id"] = current_user.id
            user_supabase.table("user_infos").insert(update_data).execute()

        LOGGER.info(f"BYOK API key set for user {current_user.id}")
        return ApiKeyStatusResponse(has_api_key=True, accepted_at=now)

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error setting API key for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save API key")


@router.delete("/api-key")
@limiter.limit("5/minute")
async def delete_api_key(
    request: Request,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Remove the user's BYOK OpenRouter API key."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        user_supabase.table("user_infos").update(
            {
                "openrouter_api_key_encrypted": None,
                "byok_accepted_at": None,
            }
        ).eq("user_id", current_user.id).execute()

        LOGGER.info(f"BYOK API key removed for user {current_user.id}")
        return {"message": "API key removed successfully"}
    except Exception as e:
        LOGGER.error(f"Error removing API key for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove API key")
