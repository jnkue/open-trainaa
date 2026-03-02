"""
Training Status API Router
Provides endpoints for retrieving training status metrics.
"""

from datetime import date, timedelta
from typing import List

from api.auth import User, get_current_user
from api.log import LOGGER
from api.training_status import calculate_training_status, calculate_training_status_all_users
from api.utils import get_user_supabase_client
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter(prefix="/training-status", tags=["training-status"])
security_bearer = HTTPBearer()


class TrainingStatusResponse(BaseModel):
    """Training status data model"""

    date: str
    fitness: float
    fatigue: float
    form: float
    daily_hr_load: float
    daily_training_time: float
    training_streak: int
    rest_days_streak: int
    training_days_7d: int
    training_monotony: float
    training_strain: float
    avg_training_time_7d: float
    avg_training_time_21d: float
    training_days_21d: int
    fitness_trend_7d: float
    fatigue_trend_7d: float


@router.get("/current", response_model=TrainingStatusResponse)
async def get_current_training_status(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> TrainingStatusResponse:
    """Get the current training status for the authenticated user."""
    user_id = current_user.id

    try:
        # Create user-specific Supabase client with JWT token
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Get the most recent training status record
        response = (
            user_supabase.table("training_status")
            .select("*")
            .eq("user_id", user_id)
            .order("date", desc=True)
            .limit(1)
            .execute()
        )

        if not response.data:
            # Return default values if no data exists
            return TrainingStatusResponse(
                date=date.today().isoformat(),
                fitness=0.0,
                fatigue=0.0,
                form=0.0,
                daily_hr_load=0.0,
                daily_training_time=0.0,
                training_streak=0,
                rest_days_streak=1,
                training_days_7d=0,
                training_monotony=0.0,
                training_strain=0.0,
                avg_training_time_7d=0.0,
                avg_training_time_21d=0.0,
                training_days_21d=0,
                fitness_trend_7d=0.0,
                fatigue_trend_7d=0.0,
            )

        data = response.data[0]
        return TrainingStatusResponse(
            date=data["date"],
            fitness=data["fitness"],
            fatigue=data["fatigue"],
            form=data["form"],
            daily_hr_load=data["daily_hr_load"] or 0.0,
            daily_training_time=data["daily_training_time"] or 0.0,
            training_streak=data["training_streak"] or 0,
            rest_days_streak=data["rest_days_streak"] or 0,
            training_days_7d=data["training_days_7d"] or 0,
            training_monotony=data["training_monotony"] or 0.0,
            training_strain=data["training_strain"] or 0.0,
            avg_training_time_7d=data["avg_training_time_7d"] or 0.0,
            avg_training_time_21d=data["avg_training_time_21d"] or 0.0,
            training_days_21d=data["training_days_21d"] or 0,
            fitness_trend_7d=data["fitness_trend_7d"] or 0.0,
            fatigue_trend_7d=data["fatigue_trend_7d"] or 0.0,
        )

    except Exception as e:
        LOGGER.error(f"❌ Error fetching training status: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch training status")


@router.get("/history", response_model=List[TrainingStatusResponse])
async def get_training_status_history(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> List[TrainingStatusResponse]:
    """Get training status history for the authenticated user."""
    user_id = current_user.id
    start_date = date.today() - timedelta(days=days)

    try:
        # Create user-specific Supabase client with JWT token
        user_supabase = get_user_supabase_client(credentials.credentials)

        response = (
            user_supabase.table("training_status")
            .select("*")
            .eq("user_id", user_id)
            .gte("date", start_date.isoformat())
            .order("date", desc=False)
            .execute()
        )

        return [
            TrainingStatusResponse(
                date=data["date"],
                fitness=data["fitness"],
                fatigue=data["fatigue"],
                form=data["form"],
                daily_hr_load=data["daily_hr_load"] or 0.0,
                daily_training_time=data["daily_training_time"] or 0.0,
                training_streak=data["training_streak"] or 0,
                rest_days_streak=data["rest_days_streak"] or 0,
                training_days_7d=data["training_days_7d"] or 0,
                training_monotony=data["training_monotony"] or 0.0,
                training_strain=data["training_strain"] or 0.0,
                avg_training_time_7d=data["avg_training_time_7d"] or 0.0,
                avg_training_time_21d=data["avg_training_time_21d"] or 0.0,
                training_days_21d=data["training_days_21d"] or 0,
                fitness_trend_7d=data["fitness_trend_7d"] or 0.0,
                fatigue_trend_7d=data["fatigue_trend_7d"] or 0.0,
            )
            for data in response.data
        ]

    except Exception as e:
        LOGGER.error(f"❌ Error fetching training status history: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch training status history"
        )


class CalculateStatusResponse(BaseModel):
    """Response model for training status calculation"""

    success: bool
    users_processed: int
    message: str


@router.post("/calculate", response_model=CalculateStatusResponse)
async def calculate_training_status_endpoint() -> CalculateStatusResponse:
    """
    Calculate/recalculate training status for all users with pending updates.

    This endpoint triggers an immediate calculation of training status metrics
    including fitness, fatigue, and form for all users who have needs_update=TRUE.
    Calculates from the earliest needed date to (today + 5 days) for future projections.

    No authentication required - designed to be triggered by background jobs or cron.

    Returns:
        CalculateStatusResponse with success status and number of users processed
    """
    try:
        LOGGER.info("🔄 Triggering training status calculation for all users")

        # Calculate training status for all users with pending updates
        users_processed = calculate_training_status()

        return CalculateStatusResponse(
            success=True,
            users_processed=users_processed,
            message=f"Successfully calculated training status for {users_processed} users",
        )

    except Exception as e:
        LOGGER.error(f"❌ Error calculating training status: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to calculate training status: {str(e)}"
        )


@router.post("/calculate-all", response_model=CalculateStatusResponse)
async def calculate_all_training_status_endpoint() -> CalculateStatusResponse:
    """
    Calculate training status for ALL users, regardless of needs_update flag.

    This recalculates the last 7 days through today + 5 days for every user
    who has training status records. Useful for ensuring training status stays
    current on rest days when no new activities are uploaded.

    No authentication required - designed to be triggered by the nightly
    scheduled job or manually for debugging.

    Returns:
        CalculateStatusResponse with success status and number of users processed
    """
    try:
        LOGGER.info("🔄 Triggering training status calculation for ALL users")

        users_processed = calculate_training_status_all_users()

        return CalculateStatusResponse(
            success=True,
            users_processed=users_processed,
            message=f"Successfully recalculated training status for {users_processed} users",
        )

    except Exception as e:
        LOGGER.error(f"❌ Error calculating training status for all users: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate training status: {str(e)}",
        )
