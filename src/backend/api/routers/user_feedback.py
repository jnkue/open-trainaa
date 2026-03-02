"""
User Feedback router - manages general user feedback including feature requests and bug reports.
"""

from typing import List, Optional
from uuid import UUID

from api.auth import User, get_current_user
from api.log import LOGGER
from api.utils import get_user_supabase_client
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
security_bearer = HTTPBearer()

router = APIRouter(
    prefix="/user-feedback",
    tags=["user-feedback"],
    dependencies=[],
)


# Pydantic models for user_feedback table
class UserFeedbackBase(BaseModel):
    type: str = Field(
        ...,
        description="Type of feedback: feature_request, bug_report, general_feedback",
    )
    text: str = Field(
        ..., description="Feedback content", min_length=10, max_length=2000
    )
    metadata: Optional[dict] = Field(
        default_factory=dict, description="Additional metadata"
    )


class UserFeedbackCreate(UserFeedbackBase):
    pass


class UserFeedbackUpdate(BaseModel):
    text: Optional[str] = Field(None, min_length=10, max_length=2000)
    metadata: Optional[dict] = None


class UserFeedbackResponse(UserFeedbackBase):
    id: UUID
    user_id: UUID
    status: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# User Feedback endpoints
@router.get("/", response_model=List[UserFeedbackResponse])
@limiter.limit("30/minute")
async def get_user_feedback(
    request: Request,
    current_user: User = Depends(get_current_user),
    type_filter: Optional[str] = Query(None, description="Filter by feedback type"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, le=100, description="Limit number of results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get user feedback for the current user with optional filtering."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        query = (
            user_supabase.table("user_feedback")
            .select("*")
            .eq("user_id", current_user.id)
        )

        if type_filter:
            query = query.eq("type", type_filter)
        if status_filter:
            query = query.eq("status", status_filter)

        result = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        return [UserFeedbackResponse(**item) for item in result.data]
    except Exception as e:
        LOGGER.error(f"Error fetching user feedback for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user feedback")


@router.post("/", response_model=UserFeedbackResponse)
@limiter.limit("5/minute")
async def create_user_feedback(
    request: Request,
    feedback: UserFeedbackCreate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Create new user feedback."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Validate feedback type
        valid_types = [
            "feature_request",
            "bug_report",
            "general_feedback",
            "feeling_feedback",
        ]
        if feedback.type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid feedback type. Must be one of: {', '.join(valid_types)}",
            )

        data = feedback.model_dump(exclude_unset=True)
        data["user_id"] = current_user.id
        data["status"] = "open"  # Default status

        result = user_supabase.table("user_feedback").insert(data).execute()

        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to create user feedback"
            )

        LOGGER.info(
            f"User feedback created: {result.data[0]['id']} by user {current_user.id}"
        )
        return UserFeedbackResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error creating user feedback for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create user feedback")


@router.get("/{feedback_id}", response_model=UserFeedbackResponse)
@limiter.limit("30/minute")
async def get_user_feedback_by_id(
    request: Request,
    feedback_id: UUID,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get specific user feedback by ID."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        result = (
            user_supabase.table("user_feedback")
            .select("*")
            .eq("id", feedback_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Feedback not found")

        return UserFeedbackResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(
            f"Error fetching feedback {feedback_id} for user {current_user.id}: {e}"
        )
        raise HTTPException(status_code=500, detail="Failed to fetch feedback")


@router.put("/{feedback_id}", response_model=UserFeedbackResponse)
@limiter.limit("10/minute")
async def update_user_feedback(
    request: Request,
    feedback_id: UUID,
    feedback_update: UserFeedbackUpdate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Update existing user feedback."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Check if feedback exists and belongs to user
        existing = (
            user_supabase.table("user_feedback")
            .select("id")
            .eq("id", feedback_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Feedback not found")

        data = feedback_update.model_dump(exclude_unset=True, exclude_none=True)

        if not data:
            raise HTTPException(status_code=400, detail="No data provided for update")

        result = (
            user_supabase.table("user_feedback")
            .update(data)
            .eq("id", feedback_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update feedback")

        return UserFeedbackResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(
            f"Error updating feedback {feedback_id} for user {current_user.id}: {e}"
        )
        raise HTTPException(status_code=500, detail="Failed to update feedback")


@router.delete("/{feedback_id}")
@limiter.limit("5/minute")
async def delete_user_feedback(
    request: Request,
    feedback_id: UUID,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Delete user feedback."""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Check if feedback exists and belongs to user
        existing = (
            user_supabase.table("user_feedback")
            .select("id")
            .eq("id", feedback_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Feedback not found")

        user_supabase.table("user_feedback").delete().eq("id", feedback_id).eq(
            "user_id", current_user.id
        ).execute()

        return {"message": "Feedback deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(
            f"Error deleting feedback {feedback_id} for user {current_user.id}: {e}"
        )
        raise HTTPException(status_code=500, detail="Failed to delete feedback")
