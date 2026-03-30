"""Race events CRUD router."""
from datetime import date
from typing import Optional
from uuid import UUID

from api.auth import User, get_current_user
from api.log import LOGGER
from api.utils import get_user_supabase_client
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/race-events", tags=["race-events"])
security_bearer = HTTPBearer()


class RaceEventCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    event_date: date
    event_type: Optional[str] = Field(None, max_length=100)

    @field_validator("event_date")
    @classmethod
    def event_date_must_be_future(cls, v: date) -> date:
        if v < date.today():
            raise ValueError("event_date must be today or in the future")
        return v


class RaceEventResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    event_date: date
    event_type: Optional[str] = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.get("/", response_model=list[RaceEventResponse])
@limiter.limit("60/minute")
async def list_race_events(
    request: Request,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """List all race events for the current user, ordered by event_date ASC."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        result = (
            user_supabase.table("race_events")
            .select("*")
            .eq("user_id", str(current_user.id))
            .order("event_date", desc=False)
            .execute()
        )
        return result.data
    except Exception as e:
        LOGGER.error(f"Error listing race events for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list race events")


@router.post("/", response_model=RaceEventResponse, status_code=201)
@limiter.limit("20/minute")
async def create_race_event(
    request: Request,
    body: RaceEventCreate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Create a new race event."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        result = (
            user_supabase.table("race_events")
            .insert(
                {
                    "user_id": str(current_user.id),
                    "name": body.name,
                    "event_date": str(body.event_date),
                    "event_type": body.event_type,
                }
            )
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create race event")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error creating race event for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create race event")


@router.delete("/{race_event_id}", status_code=204)
@limiter.limit("20/minute")
async def delete_race_event(
    request: Request,
    race_event_id: UUID,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Delete a race event. 404 if not found or not owned by current user."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        result = (
            user_supabase.table("race_events")
            .delete()
            .eq("id", str(race_event_id))
            .eq("user_id", str(current_user.id))
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Race event not found")
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(
            f"Error deleting race event {race_event_id} for user {current_user.id}: {e}"
        )
        raise HTTPException(status_code=500, detail="Failed to delete race event")
