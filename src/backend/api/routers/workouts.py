"""
Workouts router - manages workout creation, updates, and planning.
This router provides CRUD operations for workouts and planned workouts.
"""

import asyncio
import os
import re
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from api.auth import User, get_current_user
from api.log import LOGGER
from api.models.sport_types import WorkoutSportType
from api.services.workout_sync import get_sync_service
from api.utils import get_user_supabase_client
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pacer.src import WorkoutValidator
from pacer.src.txt_workout_converter import FitFileConverter
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from supabase import Client, create_client

security_bearer = HTTPBearer()

# Initialize Supabase client
supabase_url = os.environ.get("PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("PRIVATE_SUPABASE_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("Missing required Supabase environment variables")

assert supabase_url is not None
assert supabase_key is not None

supabase: Client = create_client(supabase_url, supabase_key)

router = APIRouter(prefix="/workouts", tags=["workouts"])
limiter = Limiter(key_func=get_remote_address)


# Initialize workout validator
workout_validator = WorkoutValidator()

# TODO komplett nochmal anschauen

# Generate regex pattern from WorkoutSportType enum
_WORKOUT_SPORT_PATTERN = (
    "^(" + "|".join([sport.value for sport in WorkoutSportType]) + ")$"
)


# Pydantic models
class WorkoutBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    sport: str = Field(..., pattern=_WORKOUT_SPORT_PATTERN)
    workout_minutes: int = Field(..., ge=1)
    workout_text: str = Field(..., min_length=10)
    is_public: bool = False


class WorkoutCreate(WorkoutBase):
    pass


class WorkoutUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    sport: Optional[str] = Field(None, pattern=_WORKOUT_SPORT_PATTERN)
    workout_minutes: Optional[int] = Field(None, ge=1)
    workout_text: Optional[str] = Field(None, min_length=10)
    is_public: Optional[bool] = None


class Workout(WorkoutBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    estimated_time: Optional[int] = None
    estimated_heart_rate_load: Optional[float] = None


class PlannedWorkoutBase(BaseModel):
    workout_id: UUID
    scheduled_time: datetime


class PlannedWorkoutCreate(PlannedWorkoutBase):
    pass


class PlannedWorkoutUpdate(BaseModel):
    workout_id: Optional[UUID] = None
    scheduled_time: Optional[datetime] = None


class PlannedWorkout(PlannedWorkoutBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class WorkoutWithPlanning(Workout):
    """Workout with optional planning information"""

    planned_workout_id: Optional[UUID] = None
    scheduled_time: Optional[datetime] = None


# Helper functions
def validate_workout_format(workout_text: str) -> tuple[bool, List[str]]:
    """Validate workout text format using WorkoutValidator"""
    try:
        lines = workout_text.strip().split("\n")

        # Special handling for rest days
        if lines and lines[0].strip().lower() == "rest_day":
            # Rest days have a simpler format:
            # Line 1: rest_day
            # Line 2: name
            # Line 3: blank (optional)
            # Line 4+: optional description/notes (but NO workout steps)
            if len(lines) < 2:
                return False, ["Rest day must have a name on line 2"]
            if len(lines) >= 3 and lines[2].strip() != "":
                return False, ["Line 3 must be blank for rest days"]

            # Check that no lines contain workout steps (lines starting with -)
            for i, line in enumerate(lines[3:], start=4):
                if line.strip().startswith("-"):
                    return False, [
                        f"Rest days cannot contain workout steps (found on line {i})"
                    ]

            return True, []

        # Regular workout validation
        is_valid, errors = workout_validator.validate_text(workout_text)
        error_messages = []
        if not is_valid:
            error_messages = [f"Line {e.line_number}: {e.message}" for e in errors]
        return is_valid, error_messages
    except Exception as e:
        return False, [f"Validation error: {str(e)}"]


def calculate_workout_estimates(
    workout_text: str,
) -> tuple[Optional[int], Optional[float]]:
    """Calculate estimated time and heart rate load for a workout"""
    try:
        # Parse workout text to extract duration and intensity information
        lines = workout_text.strip().split("\n")

        # Special handling for rest days - no duration or load
        if lines and lines[0].strip().lower() == "rest_day":
            return 0, 0.0

        total_minutes = 0
        total_hr_load = 0.0
        current_set_reps = 1  # Track repetitions for current set

        # Extract sport type from line 1 for distance-based time estimation
        sport_type = lines[0].strip().lower() if lines else "running"

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if line.startswith("- "):
                # This is a workout step, parse duration and intensity
                step_content = line[2:].strip()

                # Extract duration (e.g., "10m", "8m30s", "2h30m", "0.4km")
                duration_minutes = 0
                parts = step_content.split()
                for part in parts:
                    # Format like "2h30m"
                    if re.match(r"^\d+h\d+m$", part):
                        h_part, m_part = part.replace("m", "").split("h")
                        duration_minutes = int(h_part) * 60 + int(m_part)
                        break
                    # Format like "8m30s"
                    elif re.match(r"^\d+m\d+s$", part):
                        m_part, s_part = part.replace("s", "").split("m")
                        duration_minutes = int(m_part) + int(s_part) / 60
                        break
                    # Format like "2h"
                    elif re.match(r"^\d+h$", part):
                        duration_minutes = int(part[:-1]) * 60
                        break
                    # Format like "10m"
                    elif re.match(r"^\d+m$", part):
                        duration_minutes = int(part[:-1])
                        break
                    # Format like "45s"
                    elif re.match(r"^\d+s$", part):
                        duration_minutes = int(part[:-1]) / 60
                        break
                    # Format like "0.4km" or "1.5km" (distance-based)
                    elif re.match(r"^[\d\.]+km$", part, re.IGNORECASE):
                        km = float(part[:-2])
                        meters = km * 1000
                        # Estimate time based on sport type
                        if "swim" in sport_type:
                            # Swimming: ~2:00 per 100m = 1.2 sec/m
                            duration_minutes = (meters * 1.2) / 60
                        elif "cycl" in sport_type or "bike" in sport_type:
                            # Cycling: ~30 km/h = 2 min/km
                            duration_minutes = km * 2
                        else:
                            # Running/default: ~5:30 per km
                            duration_minutes = km * 5.5
                        break

                # Extract intensity factor for HR load calculation
                intensity_factor = 1.0  # Default moderate intensity
                if (
                    "%FTP" in step_content
                    or "%HR" in step_content
                    or "%Speed" in step_content
                ):
                    # Extract percentage
                    parts = step_content.split()
                    for part in parts:
                        if part.endswith("%") and part[:-1].isdigit():
                            percentage = int(part[:-1])
                            # Convert to intensity factor (rough approximation)
                            intensity_factor = max(0.5, min(1.5, percentage / 100))
                            break
                elif "Z" in step_content:
                    # Zone-based intensity
                    parts = step_content.split()
                    for part in parts:
                        if (
                            part.startswith("Z")
                            and len(part) > 1
                            and part[1:].isdigit()
                        ):
                            zone = int(part[1:])
                            # Convert zone to intensity factor
                            zone_factors = {
                                1: 0.6,
                                2: 0.7,
                                3: 0.8,
                                4: 0.9,
                                5: 1.0,
                                6: 1.2,
                                7: 1.4,
                            }
                            intensity_factor = zone_factors.get(zone, 1.0)
                            break
                elif "Strength" in step_content:
                    # Strength training has different load calculation
                    intensity_factor = 0.8  # Moderate for strength training

                # Apply current set repetitions to this step
                total_minutes += duration_minutes * current_set_reps
                # Heart rate load is duration * intensity factor * reps
                total_hr_load += duration_minutes * intensity_factor * current_set_reps
            else:
                # This is a set header, check for repetition count
                if re.match(r"^\d+x ", line):
                    # Has repetition count: "3x Set Name"
                    current_set_reps = int(line.split("x")[0])
                else:
                    # No repetition count: "Set Name"
                    current_set_reps = 1

        # Round to reasonable precision
        estimated_time = max(1, round(total_minutes)) if total_minutes > 0 else None
        estimated_hr_load = round(total_hr_load, 1) if total_hr_load > 0 else None

        return estimated_time, estimated_hr_load

    except Exception as e:
        LOGGER.warning(f"Error calculating workout estimates: {e}")
        return None, None


# Routes


@router.post("/", response_model=Workout)
async def create_workout(
    workout: WorkoutCreate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Create a new workout"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Validate workout format
        is_valid, error_messages = validate_workout_format(workout.workout_text)
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail={"message": "Invalid workout format", "errors": error_messages},
            )

        # Calculate estimates based on workout content
        estimated_time, estimated_hr_load = calculate_workout_estimates(
            workout.workout_text
        )

        # Insert into database
        result = (
            user_supabase.table("workouts")
            .insert(
                {
                    "name": workout.name,
                    "description": workout.description,
                    "sport": workout.sport,
                    "workout_minutes": workout.workout_minutes,
                    "workout_text": workout.workout_text,
                    "estimated_time": estimated_time,
                    "estimated_heart_rate_load": estimated_hr_load,
                    "is_public": workout.is_public,
                    "user_id": current_user.id,
                }
            )
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create workout")

        created_workout = Workout(**result.data[0])

        # Enqueue for batch sync to enabled providers only
        sync_service = get_sync_service()
        if sync_service.is_provider_enabled(current_user.id, "wahoo"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id, "workout", created_workout.id, "create", "wahoo"
                )
            )
        if sync_service.is_provider_enabled(current_user.id, "garmin"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id, "workout", created_workout.id, "create", "garmin"
                )
            )

        return created_workout

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error creating workout: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[Workout])
async def get_workouts(
    sport: Optional[str] = Query(None, pattern=_WORKOUT_SPORT_PATTERN),
    is_public: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get workouts for the current user or public workouts"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        query = user_supabase.table("workouts").select("*")

        # Filter by user's workouts or public workouts
        query = query.or_(f"user_id.eq.{current_user.id},is_public.eq.true")

        # Apply filters
        if sport:
            query = query.eq("sport", sport)
        if is_public is not None:
            query = query.eq("is_public", is_public)

        # Apply pagination
        query = query.range(offset, offset + limit - 1)

        # Order by creation date (newest first)
        query = query.order("created_at", desc=True)

        result = query.execute()

        return [Workout(**workout) for workout in result.data]

    except Exception as e:
        LOGGER.error(f"Error fetching workouts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{workout_id}", response_model=Workout)
async def get_workout(
    workout_id: UUID,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get a specific workout by ID"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        result = (
            user_supabase.table("workouts").select("*").eq("id", workout_id).execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Workout not found")

        workout = result.data[0]

        # Check access permissions
        if workout["user_id"] != current_user.id and not workout["is_public"]:
            raise HTTPException(status_code=403, detail="Access denied")

        return Workout(**workout)

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error fetching workout {workout_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{workout_id}", response_model=Workout)
async def update_workout(
    workout_id: UUID,
    workout_update: WorkoutUpdate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Update a workout"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Check if workout exists and user has permission
        existing = (
            user_supabase.table("workouts").select("*").eq("id", workout_id).execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workout not found")

        if existing.data[0]["user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Prepare update data
        update_data = {}
        workout_text_changed = False
        for field, value in workout_update.dict(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value

        # Validate workout format if workout_text is being updated
        if "workout_text" in update_data:
            workout_text_changed = True
            is_valid, error_messages = validate_workout_format(
                update_data["workout_text"]
            )
            if not is_valid:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": "Invalid workout format",
                        "errors": error_messages,
                    },
                )

            # Recalculate estimates if workout_text is updated
            estimated_time, estimated_hr_load = calculate_workout_estimates(
                update_data["workout_text"]
            )
            update_data["estimated_time"] = estimated_time
            update_data["estimated_heart_rate_load"] = estimated_hr_load

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Update in database
        result = (
            user_supabase.table("workouts")
            .update(update_data)
            .eq("id", workout_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update workout")

        updated_workout = Workout(**result.data[0])

        # Enqueue for batch sync to enabled providers if workout_text changed
        if workout_text_changed:
            sync_service = get_sync_service()
            if sync_service.is_provider_enabled(current_user.id, "wahoo"):
                asyncio.create_task(
                    sync_service.enqueue_sync(
                        current_user.id, "workout", workout_id, "update", "wahoo"
                    )
                )
            if sync_service.is_provider_enabled(current_user.id, "garmin"):
                asyncio.create_task(
                    sync_service.enqueue_sync(
                        current_user.id, "workout", workout_id, "update", "garmin"
                    )
                )

        return updated_workout

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error updating workout {workout_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{workout_id}")
async def delete_workout(
    workout_id: UUID,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Delete a workout"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Check if workout exists and user has permission
        existing = (
            user_supabase.table("workouts").select("*").eq("id", workout_id).execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Workout not found")

        if existing.data[0]["user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Check if workout is used in planned workouts
        planned = (
            user_supabase.table("workouts_scheduled")
            .select("id")
            .eq("workout_id", workout_id)
            .execute()
        )
        if planned.data:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete workout that is scheduled in planned workouts",
            )

        # Enqueue deletion for synced providers (if enabled)
        # Always enqueue delete - the enqueue_sync method will cancel any pending creates,
        # preventing orphaned workouts on external providers
        sync_service = get_sync_service()
        if sync_service.is_provider_enabled(current_user.id, "wahoo"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id, "workout", workout_id, "delete", "wahoo"
                )
            )
        if sync_service.is_provider_enabled(current_user.id, "garmin"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id, "workout", workout_id, "delete", "garmin"
                )
            )

        # Delete workout from local database
        result = user_supabase.table("workouts").delete().eq("id", workout_id).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to delete workout")

        return {"message": "Workout deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error deleting workout {workout_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Planned Workouts Routes


@router.post("/planned", response_model=PlannedWorkout)
async def create_planned_workout(
    planned_workout: PlannedWorkoutCreate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Create a planned workout (schedule a workout)"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Verify workout exists and user has access
        workout_result = (
            user_supabase.table("workouts")
            .select("*")
            .eq("id", planned_workout.workout_id)
            .execute()
        )
        if not workout_result.data:
            raise HTTPException(status_code=404, detail="Workout not found")

        workout = workout_result.data[0]
        if workout["user_id"] != current_user.id and not workout["is_public"]:
            raise HTTPException(status_code=403, detail="Access denied to workout")

        # Insert planned workout
        result = (
            user_supabase.table("workouts_scheduled")
            .insert(
                {
                    "workout_id": planned_workout.workout_id,
                    "scheduled_time": planned_workout.scheduled_time.isoformat(),
                    "user_id": current_user.id,
                }
            )
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to create planned workout"
            )

        created_planned = PlannedWorkout(**result.data[0])

        # Enqueue for batch sync to enabled providers only
        sync_service = get_sync_service()
        if sync_service.is_provider_enabled(current_user.id, "wahoo"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id,
                    "workout_scheduled",
                    created_planned.id,
                    "create",
                    "wahoo",
                )
            )
        if sync_service.is_provider_enabled(current_user.id, "garmin"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id,
                    "workout_scheduled",
                    created_planned.id,
                    "create",
                    "garmin",
                )
            )

        return created_planned

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error creating planned workout: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/planned", response_model=List[WorkoutWithPlanning])
async def get_workouts_scheduled(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    sport: Optional[str] = Query(None, pattern=_WORKOUT_SPORT_PATTERN),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Get planned workouts for the current user"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Join workouts_scheduled with workouts
        query = (
            user_supabase.table("workouts_scheduled")
            .select("*, workouts(*)")
            .eq("user_id", current_user.id)
        )

        # Apply date filters
        if start_date:
            query = query.gte("scheduled_time", start_date.isoformat())
        if end_date:
            query = query.lte("scheduled_time", end_date.isoformat())

        # Apply pagination
        query = query.range(offset, offset + limit - 1)

        # Order by scheduled time
        query = query.order("scheduled_time", desc=False)

        result = query.execute()

        workouts_scheduled = []
        for item in result.data:
            workout_data = item["workouts"]
            # Filter by sport if specified
            if sport and workout_data["sport"] != sport:
                continue

            # Combine workout and planning data
            combined = {
                **workout_data,
                "planned_workout_id": item["id"],
                "scheduled_time": item["scheduled_time"],
            }
            workouts_scheduled.append(WorkoutWithPlanning(**combined))

        return workouts_scheduled

    except Exception as e:
        LOGGER.error(f"Error fetching planned workouts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/planned/{planned_workout_id}", response_model=PlannedWorkout)
async def update_planned_workout(
    planned_workout_id: UUID,
    planned_workout_update: PlannedWorkoutUpdate,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Update a planned workout"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Check if planned workout exists and user has permission
        existing = (
            user_supabase.table("workouts_scheduled")
            .select("*")
            .eq("id", planned_workout_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Planned workout not found")

        if existing.data[0]["user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Prepare update data
        update_data = {}
        needs_resync = False
        for field, value in planned_workout_update.dict(exclude_unset=True).items():
            if value is not None:
                if field == "scheduled_time":
                    update_data[field] = value.isoformat()
                    needs_resync = True
                else:
                    update_data[field] = value
                    if field == "workout_id":
                        needs_resync = True

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        # If updating workout_id, verify access to new workout
        if "workout_id" in update_data:
            workout_result = (
                user_supabase.table("workouts")
                .select("*")
                .eq("id", update_data["workout_id"])
                .execute()
            )
            if not workout_result.data:
                raise HTTPException(status_code=404, detail="New workout not found")

            workout = workout_result.data[0]
            if workout["user_id"] != current_user.id and not workout["is_public"]:
                raise HTTPException(
                    status_code=403, detail="Access denied to new workout"
                )

        # Update in database
        result = (
            user_supabase.table("workouts_scheduled")
            .update(update_data)
            .eq("id", planned_workout_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to update planned workout"
            )

        updated_planned = PlannedWorkout(**result.data[0])

        # Enqueue for batch sync to enabled providers if needed
        if needs_resync:
            sync_service = get_sync_service()
            if sync_service.is_provider_enabled(current_user.id, "wahoo"):
                asyncio.create_task(
                    sync_service.enqueue_sync(
                        current_user.id,
                        "workout_scheduled",
                        planned_workout_id,
                        "update",
                        "wahoo",
                    )
                )
            if sync_service.is_provider_enabled(current_user.id, "garmin"):
                asyncio.create_task(
                    sync_service.enqueue_sync(
                        current_user.id,
                        "workout_scheduled",
                        planned_workout_id,
                        "update",
                        "garmin",
                    )
                )

        return updated_planned

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error updating planned workout {planned_workout_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/planned/{planned_workout_id}")
async def delete_planned_workout(
    planned_workout_id: UUID,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Delete a planned workout"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Check if planned workout exists and user has permission
        existing = (
            user_supabase.table("workouts_scheduled")
            .select("*")
            .eq("id", planned_workout_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Planned workout not found")

        if existing.data[0]["user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Enqueue deletion for synced providers (if enabled)
        # Always enqueue delete - the enqueue_sync method will cancel any pending creates,
        # preventing orphaned workouts on external providers
        sync_service = get_sync_service()
        if sync_service.is_provider_enabled(current_user.id, "wahoo"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id,
                    "workout_scheduled",
                    planned_workout_id,
                    "delete",
                    "wahoo",
                )
            )
        if sync_service.is_provider_enabled(current_user.id, "garmin"):
            asyncio.create_task(
                sync_service.enqueue_sync(
                    current_user.id,
                    "workout_scheduled",
                    planned_workout_id,
                    "delete",
                    "garmin",
                )
            )

        # Delete planned workout from local database
        result = (
            user_supabase.table("workouts_scheduled")
            .delete()
            .eq("id", planned_workout_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to delete planned workout"
            )

        return {"message": "Planned workout deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error deleting planned workout {planned_workout_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Validation endpoint
@router.post("/validate")
async def validate_workout_text(
    workout_text: str,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Validate workout text format"""
    try:
        is_valid, error_messages = validate_workout_format(workout_text)

        return {"is_valid": is_valid, "errors": error_messages if not is_valid else []}

    except Exception as e:
        LOGGER.error(f"Error validating workout text: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# FIT file download endpoint
@router.get("/{workout_id}/download-fit")
async def download_workout_as_fit(
    workout_id: UUID,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """Download a workout as a FIT file"""
    try:
        user_supabase = get_user_supabase_client(credentials.credentials)
        # Get workout
        result = (
            user_supabase.table("workouts").select("*").eq("id", workout_id).execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Workout not found")

        workout = result.data[0]

        # Check access permissions
        if workout["user_id"] != current_user.id and not workout["is_public"]:
            raise HTTPException(status_code=403, detail="Access denied")

        # Convert to FIT format
        import tempfile

        converter = FitFileConverter()

        # Create temporary file for FIT output
        with tempfile.NamedTemporaryFile(delete=False, suffix=".fit") as temp_file:
            temp_path = temp_file.name

        try:
            # Convert workout text to FIT file
            converter.convert_to_fit(workout["workout_text"], temp_path)

            # Read the FIT file
            with open(temp_path, "rb") as fit_file:
                fit_content = fit_file.read()

            # Clean up temporary file
            os.remove(temp_path)

            # Create safe filename from workout name
            safe_filename = "".join(
                c if c.isalnum() or c in (" ", "-", "_") else "_"
                for c in workout["name"]
            )
            safe_filename = safe_filename.strip().replace(" ", "_")

            # Return FIT file as download
            return Response(
                content=fit_content,
                media_type="application/octet-stream",
                headers={
                    "Content-Disposition": f'attachment; filename="{safe_filename}.fit"'
                },
            )

        except Exception as e:
            # Clean up temporary file in case of error
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise e

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error downloading workout {workout_id} as FIT: {e}")
        raise HTTPException(status_code=500, detail=str(e))
