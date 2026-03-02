"""
Garmin Training API V2 Workout Definitions

Pydantic models for Garmin Connect Training API V2 workout format.
Based on Garmin Training API V2 documentation version 1.0.
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class GarminSportType(str, Enum):
    """Supported sport types for Garmin workouts."""

    RUNNING = "RUNNING"
    CYCLING = "CYCLING"
    LAP_SWIMMING = "LAP_SWIMMING"
    STRENGTH_TRAINING = "STRENGTH_TRAINING"
    CARDIO_TRAINING = "CARDIO_TRAINING"
    GENERIC = "GENERIC"
    YOGA = "YOGA"
    PILATES = "PILATES"
    MULTI_SPORT = "MULTI_SPORT"


class GarminIntensity(str, Enum):
    """Step intensity types."""

    REST = "REST"
    WARMUP = "WARMUP"
    COOLDOWN = "COOLDOWN"
    RECOVERY = "RECOVERY"
    ACTIVE = "ACTIVE"
    INTERVAL = "INTERVAL"
    MAIN = "MAIN"  # SWIM only


class GarminDurationType(str, Enum):
    """Duration types for workout steps."""

    TIME = "TIME"
    DISTANCE = "DISTANCE"
    HR_LESS_THAN = "HR_LESS_THAN"
    HR_GREATER_THAN = "HR_GREATER_THAN"
    CALORIES = "CALORIES"
    OPEN = "OPEN"
    POWER_LESS_THAN = "POWER_LESS_THAN"
    POWER_GREATER_THAN = "POWER_GREATER_THAN"
    TIME_AT_VALID_CDA = "TIME_AT_VALID_CDA"
    FIXED_REST = "FIXED_REST"  # For rest steps
    REPS = "REPS"  # HIIT, CARDIO, STRENGTH_TRAINING only
    # LAP_SWIMMING ONLY:
    REPETITION_SWIM_CSS_OFFSET = "REPETITION_SWIM_CSS_OFFSET"  # CSS-Based Send-Off Time
    FIXED_REPETITION = "FIXED_REPETITION"  # Send-off time


class GarminTargetType(str, Enum):
    """Target types for workout steps."""

    SPEED = "SPEED"
    HEART_RATE = "HEART_RATE"
    CADENCE = "CADENCE"
    POWER = "POWER"
    GRADE = "GRADE"
    RESISTANCE = "RESISTANCE"
    POWER_3S = "POWER_3S"
    POWER_10S = "POWER_10S"
    POWER_30S = "POWER_30S"
    POWER_LAP = "POWER_LAP"
    SPEED_LAP = "SPEED_LAP"
    HEART_RATE_LAP = "HEART_RATE_LAP"
    OPEN = "OPEN"
    PACE = "PACE"  # Speed in m/s


class GarminRepeatType(str, Enum):
    """Repeat types for WorkoutRepeatStep."""

    REPEAT_UNTIL_STEPS_CMPLT = "REPEAT_UNTIL_STEPS_CMPLT"
    REPEAT_UNTIL_TIME = "REPEAT_UNTIL_TIME"
    REPEAT_UNTIL_DISTANCE = "REPEAT_UNTIL_DISTANCE"
    REPEAT_UNTIL_CALORIES = "REPEAT_UNTIL_CALORIES"
    REPEAT_UNTIL_HR_LESS_THAN = "REPEAT_UNTIL_HR_LESS_THAN"
    REPEAT_UNTIL_HR_GREATER_THAN = "REPEAT_UNTIL_HR_GREATER_THAN"
    REPEAT_UNTIL_POWER_LESS_THAN = "REPEAT_UNTIL_POWER_LESS_THAN"
    REPEAT_UNTIL_POWER_GREATER_THAN = "REPEAT_UNTIL_POWER_GREATER_THAN"
    REPEAT_UNTIL_POWER_LAST_LAP_LESS_THAN = "REPEAT_UNTIL_POWER_LAST_LAP_LESS_THAN"
    REPEAT_UNTIL_MAX_POWER_LAST_LAP_LESS_THAN = (
        "REPEAT_UNTIL_MAX_POWER_LAST_LAP_LESS_THAN"
    )


class GarminPoolLengthUnit(str, Enum):
    """Pool length units."""

    YARD = "YARD"
    METER = "METER"


class GarminWorkoutStep(BaseModel):
    """
    Individual workout step in Garmin format.

    Represents a single action in the workout (e.g., run 10 minutes at zone 3).
    """

    type: str = Field(default="WorkoutStep", description="Step type")
    stepOrder: int = Field(..., description="Order of the step")
    intensity: GarminIntensity = Field(..., description="Intensity of the step")
    description: Optional[str] = Field(
        None, max_length=512, description="Step description"
    )

    # Duration fields
    durationType: GarminDurationType = Field(..., description="Type of duration")
    durationValue: float = Field(..., description="Duration value")
    durationValueType: Optional[str] = Field(
        None, description="Duration value type (METER, PERCENT)"
    )

    # Target fields
    targetType: Optional[GarminTargetType] = Field(
        None, description="Primary target type"
    )
    targetValue: Optional[float] = Field(
        None, description="Target zone (1-5 HR, 1-7 power)"
    )
    targetValueLow: Optional[float] = Field(None, description="Custom target range low")
    targetValueHigh: Optional[float] = Field(
        None, description="Custom target range high"
    )
    targetValueType: Optional[str] = Field(
        None, description="Target value type (PERCENT)"
    )

    # Secondary target fields (for cycling)
    secondaryTargetType: Optional[GarminTargetType] = Field(
        None, description="Secondary target type"
    )
    secondaryTargetValue: Optional[float] = Field(
        None, description="Secondary target zone"
    )
    secondaryTargetValueLow: Optional[float] = Field(
        None, description="Secondary target range low"
    )
    secondaryTargetValueHigh: Optional[float] = Field(
        None, description="Secondary target range high"
    )
    secondaryTargetValueType: Optional[str] = Field(
        None, description="Secondary target value type"
    )

    # Swimming-specific fields
    strokeType: Optional[str] = Field(None, description="Stroke type for swimming")
    drillType: Optional[str] = Field(None, description="Drill type for swimming")
    equipmentType: Optional[str] = Field(None, description="Equipment type")

    # Strength/cardio-specific fields
    exerciseCategory: Optional[str] = Field(None, description="Exercise category")
    exerciseName: Optional[str] = Field(None, description="Exercise name")
    weightValue: Optional[float] = Field(None, description="Weight value in kilograms")
    weightDisplayUnit: Optional[str] = Field(
        None, description="Weight display unit (KILOGRAM, POUND)"
    )


class GarminWorkoutRepeatStep(BaseModel):
    """
    Repeat step containing sub-steps to be repeated.

    Represents a block of steps that should be repeated multiple times
    or until a condition is met.
    """

    type: str = Field(default="WorkoutRepeatStep", description="Step type")
    stepOrder: int = Field(..., description="Order of the step")
    repeatType: GarminRepeatType = Field(..., description="Type of repeat condition")
    repeatValue: float = Field(
        ..., description="Repeat value (e.g., number of repetitions)"
    )
    skipLastRestStep: Optional[bool] = Field(
        None, description="Skip last rest step (for swim)"
    )
    steps: List["GarminWorkoutStep"] = Field(..., description="Steps to repeat")


class GarminSegment(BaseModel):
    """
    Workout segment representing a single sport within a workout.

    Even single-sport workouts have one segment.
    """

    segmentOrder: int = Field(..., description="Order of the segment")
    sport: GarminSportType = Field(..., description="Sport type for this segment")
    poolLength: Optional[float] = Field(None, description="Pool length (for swimming)")
    poolLengthUnit: Optional[GarminPoolLengthUnit] = Field(
        None, description="Pool length unit"
    )
    estimatedDurationInSecs: Optional[int] = Field(
        None, description="Estimated duration (server-calculated)"
    )
    estimatedDistanceInMeters: Optional[float] = Field(
        None, description="Estimated distance (server-calculated)"
    )
    steps: List[GarminWorkoutStep | GarminWorkoutRepeatStep] = Field(
        ..., description="List of workout steps"
    )


class GarminWorkout(BaseModel):
    """
    Complete Garmin workout in Training API V2 format.

    This is the top-level structure sent to Garmin Connect.
    """

    # Basic info
    workoutName: str = Field(..., description="Name of the workout")
    description: Optional[str] = Field(
        None, max_length=1024, description="Workout description"
    )
    sport: GarminSportType = Field(..., description="Primary sport type")

    # Metadata
    workoutProvider: str = Field(
        default="trainaa", max_length=20, description="Workout provider name"
    )
    workoutSourceId: str = Field(
        default="trainaa", max_length=20, description="Workout source ID"
    )

    # Swimming-specific
    poolLength: Optional[float] = Field(None, description="Pool length (for swimming)")
    poolLengthUnit: Optional[GarminPoolLengthUnit] = Field(
        None, description="Pool length unit"
    )

    # Multi-sport settings
    isSessionTransitionEnabled: bool = Field(
        default=False, description="Enable transitions for multisport"
    )

    # Server-calculated fields (optional for create/update)
    workoutId: Optional[int] = Field(
        None, description="Unique workout ID (server-assigned)"
    )
    ownerId: Optional[int] = Field(None, description="Owner ID (required for updates)")
    estimatedDurationInSecs: Optional[int] = Field(
        None, description="Estimated duration (server-calculated)"
    )
    estimatedDistanceInMeters: Optional[float] = Field(
        None, description="Estimated distance (server-calculated)"
    )
    createdDate: Optional[str] = Field(
        None, description="Creation date (server-assigned)"
    )
    updatedDate: Optional[str] = Field(
        None, description="Last update date (server-assigned)"
    )

    # Workout content
    segments: List[GarminSegment] = Field(..., description="List of workout segments")


# Update forward references
GarminWorkoutRepeatStep.model_rebuild()
GarminSegment.model_rebuild()
