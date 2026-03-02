#!/usr/bin/env python3
"""
Workout Text to Garmin Training API V2 Format Converter

Converts workout text files (following our workout definition format)
into Garmin Training API V2 JSON format.
"""

import re
from typing import List, Optional, Tuple, Union

from .garmin_workout_definition import (
    GarminDurationType,
    GarminIntensity,
    GarminRepeatType,
    GarminSegment,
    GarminSportType,
    GarminTargetType,
    GarminWorkout,
    GarminWorkoutRepeatStep,
    GarminWorkoutStep,
)
from .txt_workout_validator import WorkoutValidator


class GarminConverter:
    """Converts text workout definitions to Garmin Training API V2 format."""

    # Mapping from our workout types to Garmin types (lowercase keys)
    WORKOUT_TYPE_MAPPING = {
        "cycling": GarminSportType.CYCLING,
        "running": GarminSportType.RUNNING,
        "swimming": GarminSportType.LAP_SWIMMING,  # Note: requires special handling
        "training": GarminSportType.STRENGTH_TRAINING,
        "cardio": GarminSportType.CARDIO_TRAINING,
    }

    # Workout types that cannot be converted to Garmin format
    UNSUPPORTED_WORKOUT_TYPES = {
        "hiking": "Hiking workouts are not supported by Garmin Training API",
        "rowing": "Rowing workouts are not supported by Garmin Training API",
        "walking": "Walking workouts are not supported by Garmin Training API",
    }

    # Default values for user attributes when not provided
    DEFAULT_FTP = 250  # Default Functional Threshold Power in watts
    DEFAULT_MAX_HR = 190  # Default maximum heart rate in bpm

    def __init__(
        self, user_ftp: Optional[int] = None, user_max_hr: Optional[int] = None
    ):
        """Initialize converter with optional user-specific attributes.

        Args:
            user_ftp: User's Functional Threshold Power in watts (default: 250W)
            user_max_hr: User's maximum heart rate in bpm (default: 190bpm)
        """
        self.validator = WorkoutValidator()
        self.user_ftp = user_ftp if user_ftp is not None else self.DEFAULT_FTP
        self.user_max_hr = (
            user_max_hr if user_max_hr is not None else self.DEFAULT_MAX_HR
        )

    def parse_duration(
        self, duration_str: str
    ) -> Tuple[GarminDurationType, float, str]:
        """
        Parse duration string and return trigger type, value, and value type.

        Returns:
            tuple: (durationType, durationValue, durationValueType)
        """
        # Time formats: 10m, 8m30s, 2h30m, 5s, 1h
        if re.match(r"^\d+m$", duration_str):
            # Simple minutes: 10m
            minutes = int(duration_str[:-1])
            return GarminDurationType.TIME, minutes * 60, None

        elif re.match(r"^\d+s$", duration_str):
            # Simple seconds: 30s
            seconds = int(duration_str[:-1])
            return GarminDurationType.TIME, seconds, None

        elif re.match(r"^\d+h$", duration_str):
            # Simple hours: 2h
            hours = int(duration_str[:-1])
            return GarminDurationType.TIME, hours * 3600, None

        elif re.match(r"^\d+m\d+s$", duration_str):
            # Minutes and seconds: 8m30s
            parts = duration_str.replace("s", "").split("m")
            minutes = int(parts[0])
            seconds = int(parts[1])
            return GarminDurationType.TIME, minutes * 60 + seconds, None

        elif re.match(r"^\d+h\d+m$", duration_str):
            # Hours and minutes: 2h30m
            parts = duration_str.replace("m", "").split("h")
            hours = int(parts[0])
            minutes = int(parts[1])
            return GarminDurationType.TIME, hours * 3600 + minutes * 60, None

        # Distance: check if it ends with 'km' or 'm' or 'mi'
        elif duration_str.endswith("km"):
            # Kilometers: 5km
            km = float(duration_str[:-2])
            return GarminDurationType.DISTANCE, km * 1000, "METER"

        elif duration_str.endswith("mi"):
            # Miles: 3mi
            miles = float(duration_str[:-2])
            return GarminDurationType.DISTANCE, miles * 1609.34, "METER"

        elif re.match(r"^\d+m$", duration_str):
            # Could be meters (e.g., 400m for distance)
            # This conflicts with minutes - context needed
            # For now, treat as distance if value suggests it
            value = int(duration_str[:-1])
            if value >= 100:  # Likely distance if >= 100
                return GarminDurationType.DISTANCE, value, "METER"
            else:  # Likely minutes if < 100
                return GarminDurationType.TIME, value * 60, None

        else:
            raise ValueError(f"Unsupported duration format: {duration_str}")

    def parse_intensity(
        self, intensity_str: str, sport_type: GarminSportType
    ) -> Tuple[GarminIntensity, GarminTargetType, float, float, str]:
        """
        Parse intensity string and return intensity, target type, low/high values, and value type.

        Returns:
            tuple: (intensity, targetType, targetValueLow, targetValueHigh, targetValueType)
        """
        intensity = GarminIntensity.ACTIVE
        target_type = None
        target_low = None
        target_high = None
        value_type = None

        # Zone-based: Z1, Z2, Z3, etc.
        if re.match(r"^Z\d+$", intensity_str):
            zone = int(intensity_str[1:])

            # Determine target type based on sport
            # Running uses heart rate zones, cycling uses power zones
            if sport_type == GarminSportType.RUNNING:
                target_type = GarminTargetType.HEART_RATE
            else:
                target_type = GarminTargetType.POWER

            # Map zones to intensity and targets
            # Note: Garmin API expects percentages (0-100), not decimals (0.0-1.0)
            if zone == 1:
                intensity = GarminIntensity.RECOVERY
                target_low = 50.0
                target_high = 60.0
                value_type = "PERCENT"
            elif zone == 2:
                intensity = GarminIntensity.ACTIVE
                target_low = 60.0
                target_high = 70.0
                value_type = "PERCENT"
            elif zone == 3:
                intensity = GarminIntensity.ACTIVE
                target_low = 70.0
                target_high = 80.0
                value_type = "PERCENT"
            elif zone == 4:
                intensity = GarminIntensity.ACTIVE
                target_low = 80.0
                target_high = 90.0
                value_type = "PERCENT"
            elif zone == 5:
                intensity = GarminIntensity.INTERVAL
                target_low = 90.0
                target_high = 105.0
                value_type = "PERCENT"
            elif zone >= 6:
                intensity = GarminIntensity.INTERVAL
                target_low = 105.0
                target_high = 120.0
                value_type = "PERCENT"

        # Relative FTP: %FTP 88%
        elif re.match(r"^%FTP \d+%$", intensity_str):
            percentage = int(intensity_str.split()[1][:-1]) / 100.0

            # Determine intensity based on percentage
            if percentage < 0.60:
                intensity = GarminIntensity.RECOVERY
            elif percentage < 0.75:
                intensity = GarminIntensity.ACTIVE
            elif percentage < 0.85:
                intensity = GarminIntensity.ACTIVE
            elif percentage < 1.05:
                intensity = GarminIntensity.INTERVAL
            else:
                intensity = GarminIntensity.INTERVAL

            target_type = GarminTargetType.POWER
            # Garmin API expects percentages (0-100), not decimals (0.0-1.0)
            target_low = percentage * 0.95 * 100  # 5% tolerance
            target_high = percentage * 1.05 * 100
            value_type = "PERCENT"

        # Relative HR: %HR 75%
        elif re.match(r"^%HR \d+%$", intensity_str):
            percentage = int(intensity_str.split()[1][:-1]) / 100.0

            if percentage < 0.70:
                intensity = GarminIntensity.RECOVERY
            elif percentage < 0.80:
                intensity = GarminIntensity.ACTIVE
            elif percentage < 0.90:
                intensity = GarminIntensity.ACTIVE
            else:
                intensity = GarminIntensity.INTERVAL

            target_type = GarminTargetType.HEART_RATE
            # Garmin API expects percentages (0-100), not decimals (0.0-1.0)
            target_low = percentage * 0.95 * 100
            target_high = percentage * 1.05 * 100
            value_type = "PERCENT"

        # Absolute Power: Power 250W
        elif re.match(r"^Power \d+W$", intensity_str):
            watts = int(intensity_str.split()[1][:-1])

            # Calculate as percentage of user's FTP for adaptive intensity classification
            ftp_percentage = watts / self.user_ftp

            if ftp_percentage < 0.60:
                intensity = GarminIntensity.RECOVERY
            elif ftp_percentage < 0.75:
                intensity = GarminIntensity.ACTIVE
            elif ftp_percentage < 0.90:
                intensity = GarminIntensity.ACTIVE
            else:
                intensity = GarminIntensity.INTERVAL

            target_type = GarminTargetType.POWER
            target_low = watts * 0.95
            target_high = watts * 1.05
            value_type = None  # Absolute value

        # Absolute Heart Rate: HeartRate 150bpm
        elif re.match(r"^HeartRate \d+bpm$", intensity_str):
            bpm = int(intensity_str.split()[1][:-3])

            # Calculate as percentage of user's max HR for adaptive intensity classification
            hr_percentage = bpm / self.user_max_hr

            if hr_percentage < 0.70:
                intensity = GarminIntensity.RECOVERY
            elif hr_percentage < 0.80:
                intensity = GarminIntensity.ACTIVE
            elif hr_percentage < 0.90:
                intensity = GarminIntensity.ACTIVE
            else:
                intensity = GarminIntensity.INTERVAL

            target_type = GarminTargetType.HEART_RATE
            target_low = bpm - 5
            target_high = bpm + 5
            value_type = None  # Absolute value

        # Speed targets: Speed 15km/h
        elif re.match(r"^Speed \d+km/h$", intensity_str):
            kmh = int(intensity_str.split()[1][:-4])
            ms = kmh / 3.6  # Convert km/h to m/s

            target_type = GarminTargetType.PACE
            target_low = ms * 0.95
            target_high = ms * 1.05
            value_type = None

        # Strength percentage: Strength 80%
        elif re.match(r"^Strength \d+%$", intensity_str):
            percentage = int(intensity_str.split()[1][:-1])

            if percentage == 0:
                intensity = GarminIntensity.REST
            elif percentage < 50:
                intensity = GarminIntensity.RECOVERY
            elif percentage < 75:
                intensity = GarminIntensity.ACTIVE
            else:
                intensity = GarminIntensity.ACTIVE

            # Garmin doesn't have a direct strength target, use OPEN
            target_type = GarminTargetType.OPEN

        else:
            # Default fallback - no specific target
            target_type = GarminTargetType.OPEN

        return intensity, target_type, target_low, target_high, value_type

    def parse_workout_text(self, text: str) -> dict:
        """Parse workout text and extract structured data."""
        lines = [line.strip() for line in text.strip().split("\n")]

        if len(lines) < 4:
            raise ValueError("Workout must have at least 4 lines")

        workout_type = lines[0].lower()
        workout_name = lines[1]
        # Line 2 should be empty

        # Parse content starting from line 3
        content_lines = lines[3:]

        sets = []
        current_set = None

        for line in content_lines:
            if not line:
                continue

            if line.startswith("- "):
                # Workout step
                step_content = line[2:].strip()

                # Remove comment if present
                if "#" in step_content:
                    step_content = step_content.split("#")[0].strip()

                # Parse step
                parts = [p for p in step_content.split() if p]
                if len(parts) >= 2:
                    duration = parts[0]
                    intensity = " ".join(parts[1:])

                    if current_set is None:
                        current_set = {"name": "Main Set", "reps": 1, "steps": []}

                    current_set["steps"].append(
                        {"duration": duration, "intensity": intensity}
                    )
            else:
                # Workout set header
                if current_set is not None:
                    sets.append(current_set)

                # Parse set header
                if re.match(r"^\d+x ", line):
                    # Has repetition count: "3x Set Name"
                    reps = int(line.split("x")[0])
                    name = line.split("x", 1)[1].strip()
                else:
                    # No repetition count: "Set Name"
                    reps = 1
                    name = line

                current_set = {"name": name, "reps": reps, "steps": []}

        # Add last set
        if current_set is not None:
            sets.append(current_set)

        return {
            "workout_type": workout_type,
            "workout_name": workout_name,
            "sets": sets,
        }

    def convert_to_garmin(self, text: str) -> GarminWorkout:
        """Convert workout text to Garmin Workout object."""

        # First validate the text
        is_valid, errors = self.validator.validate_text(text)
        if not is_valid:
            raise ValueError(f"Invalid workout text: {errors}")

        # Parse the text
        parsed = self.parse_workout_text(text)

        # Check if workout type is supported
        workout_type_lower = parsed["workout_type"]
        if workout_type_lower in self.UNSUPPORTED_WORKOUT_TYPES:
            error_msg = self.UNSUPPORTED_WORKOUT_TYPES[workout_type_lower]
            raise ValueError(f"Conversion not possible: {error_msg}")

        # Get Garmin sport type
        garmin_sport = self.WORKOUT_TYPE_MAPPING.get(workout_type_lower)
        if garmin_sport is None:
            raise ValueError(f"Unsupported workout type: {parsed['workout_type']}")

        # Convert sets to Garmin steps
        step_order = 1
        garmin_steps: List[Union[GarminWorkoutStep, GarminWorkoutRepeatStep]] = []

        for set_data in parsed["sets"]:
            if set_data["reps"] == 1:
                # Single set - add steps directly
                for step in set_data["steps"]:
                    garmin_step = self._convert_step(step, step_order, garmin_sport)
                    garmin_steps.append(garmin_step)
                    step_order += 1
            else:
                # Repeat set
                repeat_steps = []
                temp_order = 1
                for step in set_data["steps"]:
                    repeat_step = self._convert_step(step, temp_order, garmin_sport)
                    repeat_steps.append(repeat_step)
                    temp_order += 1

                repeat_block = GarminWorkoutRepeatStep(
                    stepOrder=step_order,
                    repeatType=GarminRepeatType.REPEAT_UNTIL_STEPS_CMPLT,
                    repeatValue=set_data["reps"],
                    steps=repeat_steps,
                )
                garmin_steps.append(repeat_block)
                step_order += 1

        # Create segment
        segment = GarminSegment(
            segmentOrder=1,
            sport=garmin_sport,
            poolLength=None,
            poolLengthUnit=None,
            steps=garmin_steps,
        )

        # Create workout
        workout = GarminWorkout(
            workoutName=parsed["workout_name"],
            description=None,
            sport=garmin_sport,
            workoutProvider="trainaa",
            workoutSourceId="trainaa",
            poolLength=None,
            poolLengthUnit=None,
            isSessionTransitionEnabled=False,
            segments=[segment],
        )

        return workout

    def _convert_step(
        self, step: dict, step_order: int, sport_type: GarminSportType
    ) -> GarminWorkoutStep:
        """Convert a single step to Garmin format."""
        duration_str = step["duration"]
        intensity_str = step["intensity"]

        # Parse duration
        duration_type, duration_value, duration_value_type = self.parse_duration(
            duration_str
        )

        # Parse intensity
        intensity, target_type, target_low, target_high, target_value_type = (
            self.parse_intensity(intensity_str, sport_type)
        )

        return GarminWorkoutStep(
            stepOrder=step_order,
            intensity=intensity,
            description=None,
            durationType=duration_type,
            durationValue=duration_value,
            durationValueType=duration_value_type,
            targetType=target_type,
            targetValue=None,  # Using custom range instead
            targetValueLow=target_low,
            targetValueHigh=target_high,
            targetValueType=target_value_type,
            # Secondary targets not used for basic conversion
            secondaryTargetType=None,
            secondaryTargetValue=None,
            secondaryTargetValueLow=None,
            secondaryTargetValueHigh=None,
            secondaryTargetValueType=None,
            # Sport-specific fields
            strokeType=None,
            drillType=None,
            equipmentType=None,
            exerciseCategory=None,
            exerciseName=None,
            weightValue=None,
            weightDisplayUnit=None,
        )
