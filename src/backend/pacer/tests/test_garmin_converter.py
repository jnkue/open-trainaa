#!/usr/bin/env python3
"""
Tests for Garmin Workout Converter.

Tests conversion of workout text format to Garmin Training API V2 JSON format.
"""

import sys
from pathlib import Path

import pytest
from src.garmin_workout_converter import GarminConverter
from src.garmin_workout_definition import (
    GarminDurationType,
    GarminIntensity,
    GarminSportType,
    GarminTargetType,
)

# Add parent directory to path to find the src package
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))


class TestGarminConverterBasic:
    """Test basic conversion functionality."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_converter_initialization(self):
        """Test converter initializes correctly."""
        assert self.converter is not None
        assert self.converter.validator is not None

    def test_simple_cycling_workout(self):
        """Test conversion of simple cycling workout."""
        workout_text = """cycling
Easy Ride

- 10m Z2
- 20m Z3
- 5m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.workoutName == "Easy Ride"
        assert workout.sport == GarminSportType.CYCLING
        assert len(workout.segments) == 1
        assert workout.segments[0].sport == GarminSportType.CYCLING
        assert len(workout.segments[0].steps) == 3

        # Check first step
        step1 = workout.segments[0].steps[0]
        assert step1.durationType == GarminDurationType.TIME
        assert step1.durationValue == 600  # 10 minutes = 600 seconds
        assert step1.intensity == GarminIntensity.ACTIVE

    def test_simple_running_workout(self):
        """Test conversion of simple running workout."""
        workout_text = """running
Morning Run

- 5m Z2
- 15m Z3
- 5m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.workoutName == "Morning Run"
        assert workout.sport == GarminSportType.RUNNING
        assert len(workout.segments) == 1
        assert workout.segments[0].sport == GarminSportType.RUNNING

    def test_workout_with_repeat_block(self):
        """Test conversion of workout with repeat block."""
        workout_text = """cycling
Intervals

- 10m Z2
3x Intervals
- 5m Z4
- 2m Z2
Cooldown
- 5m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert len(workout.segments[0].steps) == 3  # warmup, repeat block, cooldown

        # Check repeat block
        repeat_step = workout.segments[0].steps[1]
        assert repeat_step.type == "WorkoutRepeatStep"
        assert repeat_step.repeatValue == 3
        assert len(repeat_step.steps) == 2  # interval + recovery


class TestDurationParsing:
    """Test duration parsing functionality."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_parse_minutes(self):
        """Test parsing simple minutes."""
        duration_type, value, value_type = self.converter.parse_duration("10m")
        assert duration_type == GarminDurationType.TIME
        assert value == 600  # 10 * 60
        assert value_type is None

    def test_parse_seconds(self):
        """Test parsing simple seconds."""
        duration_type, value, value_type = self.converter.parse_duration("45s")
        assert duration_type == GarminDurationType.TIME
        assert value == 45
        assert value_type is None

    def test_parse_hours(self):
        """Test parsing simple hours."""
        duration_type, value, value_type = self.converter.parse_duration("2h")
        assert duration_type == GarminDurationType.TIME
        assert value == 7200  # 2 * 3600
        assert value_type is None

    def test_parse_minutes_seconds(self):
        """Test parsing minutes and seconds."""
        duration_type, value, value_type = self.converter.parse_duration("8m30s")
        assert duration_type == GarminDurationType.TIME
        assert value == 510  # 8*60 + 30
        assert value_type is None

    def test_parse_hours_minutes(self):
        """Test parsing hours and minutes."""
        duration_type, value, value_type = self.converter.parse_duration("1h30m")
        assert duration_type == GarminDurationType.TIME
        assert value == 5400  # 1*3600 + 30*60
        assert value_type is None

    def test_parse_kilometers(self):
        """Test parsing kilometers."""
        duration_type, value, value_type = self.converter.parse_duration("5km")
        assert duration_type == GarminDurationType.DISTANCE
        assert value == 5000  # meters
        assert value_type == "METER"

    def test_parse_miles(self):
        """Test parsing miles."""
        duration_type, value, value_type = self.converter.parse_duration("3mi")
        assert duration_type == GarminDurationType.DISTANCE
        assert value == pytest.approx(4828.02, rel=0.01)  # meters
        assert value_type == "METER"


class TestIntensityParsing:
    """Test intensity parsing functionality."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_parse_zone_1(self):
        """Test parsing Zone 1."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "Z1", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.RECOVERY
        assert target_type == GarminTargetType.POWER
        # Garmin API expects percentages (0-100), not decimals (0.0-1.0)
        assert low == pytest.approx(50.0)
        assert high == pytest.approx(60.0)
        assert value_type == "PERCENT"

    def test_parse_zone_3(self):
        """Test parsing Zone 3."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "Z3", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.ACTIVE
        assert target_type == GarminTargetType.POWER
        # Garmin API expects percentages (0-100), not decimals (0.0-1.0)
        assert low == pytest.approx(70.0)
        assert high == pytest.approx(80.0)
        assert value_type == "PERCENT"

    def test_parse_zone_5(self):
        """Test parsing Zone 5."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "Z5", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.INTERVAL
        assert target_type == GarminTargetType.POWER
        # Garmin API expects percentages (0-100), not decimals (0.0-1.0)
        assert low == pytest.approx(90.0)
        assert high == pytest.approx(105.0)
        assert value_type == "PERCENT"

    def test_parse_ftp_percentage(self):
        """Test parsing FTP percentage."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "%FTP 88%", GarminSportType.CYCLING
        )
        assert target_type == GarminTargetType.POWER
        # Garmin API expects percentages (0-100), not decimals (0.0-1.0)
        assert low == pytest.approx(0.88 * 0.95 * 100, rel=0.01)  # 5% tolerance
        assert high == pytest.approx(0.88 * 1.05 * 100, rel=0.01)
        assert value_type == "PERCENT"

    def test_parse_hr_percentage(self):
        """Test parsing HR percentage."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "%HR 75%", GarminSportType.RUNNING
        )
        assert target_type == GarminTargetType.HEART_RATE
        # Garmin API expects percentages (0-100), not decimals (0.0-1.0)
        assert low == pytest.approx(0.75 * 0.95 * 100, rel=0.01)
        assert high == pytest.approx(0.75 * 1.05 * 100, rel=0.01)
        assert value_type == "PERCENT"

    def test_parse_absolute_power(self):
        """Test parsing absolute power."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "Power 250W", GarminSportType.CYCLING
        )
        assert target_type == GarminTargetType.POWER
        assert low == pytest.approx(250 * 0.95)
        assert high == pytest.approx(250 * 1.05)
        assert value_type is None

    def test_parse_absolute_heart_rate(self):
        """Test parsing absolute heart rate."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "HeartRate 150bpm", GarminSportType.RUNNING
        )
        assert target_type == GarminTargetType.HEART_RATE
        assert low == 145
        assert high == 155
        assert value_type is None

    def test_parse_speed(self):
        """Test parsing speed."""
        intensity, target_type, low, high, value_type = self.converter.parse_intensity(
            "Speed 15km/h", GarminSportType.RUNNING
        )
        assert target_type == GarminTargetType.PACE
        expected_ms = 15 / 3.6  # km/h to m/s
        assert low == pytest.approx(expected_ms * 0.95, rel=0.01)
        assert high == pytest.approx(expected_ms * 1.05, rel=0.01)


class TestComplexWorkouts:
    """Test complex workout scenarios."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_sweet_spot_intervals(self):
        """Test Sweet Spot interval workout."""
        workout_text = """cycling
Sweet Spot Intervals

- 10m Z2
- 5m %FTP 88%
3x Main Set
- 8m %FTP 92%
- 2m Z2
Cooldown
- 10m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.workoutName == "Sweet Spot Intervals"
        assert len(workout.segments[0].steps) == 4  # warmup, tempo, repeat, cooldown

        # Check repeat block
        repeat_step = workout.segments[0].steps[2]
        assert repeat_step.type == "WorkoutRepeatStep"
        assert repeat_step.repeatValue == 3

    def test_tempo_run(self):
        """Test tempo run workout."""
        workout_text = """running
Tempo Run

- 10m Z2
- 20m %HR 85%
- 10m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.sport == GarminSportType.RUNNING
        assert len(workout.segments[0].steps) == 3

        # Check tempo section
        tempo_step = workout.segments[0].steps[1]
        assert tempo_step.targetType == GarminTargetType.HEART_RATE
        assert tempo_step.targetValueType == "PERCENT"

    def test_pyramid_intervals(self):
        """Test pyramid interval workout."""
        workout_text = """cycling
Pyramid Intervals

- 10m Z2
2x Build
- 3m Z4
- 5m Z4
- 8m Z4
- 5m Z4
- 3m Z4
- 3m Z2
Cooldown
- 10m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert len(workout.segments[0].steps) == 3  # warmup, repeat, cooldown

        # Check repeat block has multiple intervals
        repeat_step = workout.segments[0].steps[1]
        assert repeat_step.repeatValue == 2
        assert len(repeat_step.steps) == 6  # 5 intervals + recovery


class TestErrorHandling:
    """Test error handling and validation."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_invalid_workout_format(self):
        """Test that invalid format raises ValueError."""
        workout_text = "invalid"
        with pytest.raises(ValueError, match="Invalid workout text"):
            self.converter.convert_to_garmin(workout_text)

    def test_unsupported_workout_type_hiking(self):
        """Test that hiking raises ValueError."""
        workout_text = """hiking
Mountain Hike

- 60m Z2
"""
        with pytest.raises(ValueError, match="Conversion not possible"):
            self.converter.convert_to_garmin(workout_text)

    def test_unsupported_workout_type_rowing(self):
        """Test that rowing raises ValueError."""
        workout_text = """rowing
Rowing Session

- 20m Z3
"""
        with pytest.raises(ValueError, match="Conversion not possible"):
            self.converter.convert_to_garmin(workout_text)

    def test_unknown_workout_type(self):
        """Test that unknown type raises ValueError."""
        workout_text = """badminton
Badminton Game

- 30m Z3
"""
        # Badminton is not in the mapping so it will raise "Unsupported workout type"
        with pytest.raises(ValueError):
            self.converter.convert_to_garmin(workout_text)


class TestJSONSerialization:
    """Test JSON serialization of converted workouts."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_model_dump_excludes_none(self):
        """Test that model_dump excludes None values."""
        workout_text = """cycling
Simple Workout

- 20m Z3
"""
        workout = self.converter.convert_to_garmin(workout_text)
        workout_dict = workout.model_dump(exclude_none=True)

        # Should not have None values
        assert "workoutId" not in workout_dict  # Should be excluded
        assert "ownerId" not in workout_dict  # Should be excluded
        assert "workoutName" in workout_dict
        assert "segments" in workout_dict

    def test_full_workout_structure(self):
        """Test complete workout structure."""
        workout_text = """cycling
Test Workout

- 10m Z2
"""
        workout = self.converter.convert_to_garmin(workout_text)
        workout_dict = workout.model_dump(exclude_none=True)

        # Required top-level fields
        assert "workoutName" in workout_dict
        assert "sport" in workout_dict
        assert "workoutProvider" in workout_dict
        assert "workoutSourceId" in workout_dict
        assert "segments" in workout_dict
        assert "isSessionTransitionEnabled" in workout_dict

        # Segment structure
        segment = workout_dict["segments"][0]
        assert "segmentOrder" in segment
        assert "sport" in segment
        assert "steps" in segment

        # Step structure
        step = segment["steps"][0]
        assert "type" in step
        assert "stepOrder" in step
        assert "intensity" in step
        assert "durationType" in step
        assert "durationValue" in step


class TestRealWorldWorkouts:
    """Test real-world workout examples."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_vo2max_intervals(self):
        """Test VO2 Max interval workout."""
        workout_text = """cycling
VO2 Max Intervals

- 15m Z2
5x VO2 Max
- 3m Z5
- 3m Z1
Cooldown
- 15m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.workoutName == "VO2 Max Intervals"
        assert len(workout.segments[0].steps) == 3

        repeat_step = workout.segments[0].steps[1]
        assert repeat_step.repeatValue == 5
        assert len(repeat_step.steps) == 2

    def test_threshold_run(self):
        """Test threshold running workout."""
        workout_text = """running
Threshold Run

- 15m Z2
- 25m %HR 88%
- 10m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.sport == GarminSportType.RUNNING
        threshold_step = workout.segments[0].steps[1]
        assert threshold_step.targetType == GarminTargetType.HEART_RATE

    def test_endurance_ride(self):
        """Test long endurance ride."""
        workout_text = """cycling
Endurance Ride

- 10m Z2
- 90m Z2
- 10m Z1
"""
        workout = self.converter.convert_to_garmin(workout_text)

        main_step = workout.segments[0].steps[1]
        assert main_step.durationValue == 5400  # 90 * 60


class TestSportSpecificTargets:
    """Test that target types are sport-specific."""

    def setup_method(self):
        """Setup test fixtures."""
        self.converter = GarminConverter()

    def test_running_uses_heart_rate_zones(self):
        """Test that running workouts use HEART_RATE for zone-based targets."""
        workout_text = """running
Zone Test

- 10m Z1
- 10m Z2
- 10m Z3
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.sport == GarminSportType.RUNNING
        # All zone-based steps should use HEART_RATE
        for step in workout.segments[0].steps:
            assert step.targetType == GarminTargetType.HEART_RATE
            assert step.targetValueType == "PERCENT"

    def test_cycling_uses_power_zones(self):
        """Test that cycling workouts use POWER for zone-based targets."""
        workout_text = """cycling
Zone Test

- 10m Z1
- 10m Z2
- 10m Z3
"""
        workout = self.converter.convert_to_garmin(workout_text)

        assert workout.sport == GarminSportType.CYCLING
        # All zone-based steps should use POWER
        for step in workout.segments[0].steps:
            assert step.targetType == GarminTargetType.POWER
            assert step.targetValueType == "PERCENT"

    def test_explicit_heart_rate_overrides_sport_default(self):
        """Test that explicit heart rate targets work for any sport."""
        workout_text = """cycling
Heart Rate Based Cycling

- 10m HeartRate 140bpm
- 20m %HR 85%
"""
        workout = self.converter.convert_to_garmin(workout_text)

        # Both steps should use HEART_RATE even though it's cycling
        for step in workout.segments[0].steps:
            assert step.targetType == GarminTargetType.HEART_RATE


class TestUserAdaptiveIntensity:
    """Test user-adaptive intensity classification."""

    def test_default_ftp_and_max_hr(self):
        """Test converter uses default values when not provided."""
        converter = GarminConverter()
        assert converter.user_ftp == 250
        assert converter.user_max_hr == 190

    def test_custom_ftp_and_max_hr(self):
        """Test converter accepts custom FTP and max HR."""
        converter = GarminConverter(user_ftp=300, user_max_hr=200)
        assert converter.user_ftp == 300
        assert converter.user_max_hr == 200

    def test_absolute_power_intensity_with_different_ftp(self):
        """Test absolute power intensity classification adapts to user's FTP."""
        # Test with FTP=200W
        converter_low_ftp = GarminConverter(user_ftp=200)

        # 180W is 90% of 200W FTP -> should be INTERVAL
        intensity, _, _, _, _ = converter_low_ftp.parse_intensity(
            "Power 180W", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.INTERVAL

        # Test with FTP=300W
        converter_high_ftp = GarminConverter(user_ftp=300)

        # 180W is 60% of 300W FTP -> should be ACTIVE
        intensity, _, _, _, _ = converter_high_ftp.parse_intensity(
            "Power 180W", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.ACTIVE

    def test_absolute_power_intensity_thresholds(self):
        """Test absolute power intensity classification at various thresholds."""
        converter = GarminConverter(user_ftp=250)

        # < 60% FTP (< 150W) -> RECOVERY
        intensity, _, _, _, _ = converter.parse_intensity(
            "Power 140W", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.RECOVERY

        # 60-75% FTP (150-187W) -> ACTIVE
        intensity, _, _, _, _ = converter.parse_intensity(
            "Power 170W", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.ACTIVE

        # 75-90% FTP (187-225W) -> ACTIVE
        intensity, _, _, _, _ = converter.parse_intensity(
            "Power 200W", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.ACTIVE

        # >= 90% FTP (>= 225W) -> INTERVAL
        intensity, _, _, _, _ = converter.parse_intensity(
            "Power 230W", GarminSportType.CYCLING
        )
        assert intensity == GarminIntensity.INTERVAL

    def test_absolute_hr_intensity_with_different_max_hr(self):
        """Test absolute HR intensity classification adapts to user's max HR."""
        # Test with max HR=170
        converter_low_hr = GarminConverter(user_max_hr=170)

        # 160bpm is 94% of 170 max HR -> should be INTERVAL
        intensity, _, _, _, _ = converter_low_hr.parse_intensity(
            "HeartRate 160bpm", GarminSportType.RUNNING
        )
        assert intensity == GarminIntensity.INTERVAL

        # Test with max HR=200
        converter_high_hr = GarminConverter(user_max_hr=200)

        # 160bpm is 80% of 200 max HR -> should be ACTIVE
        intensity, _, _, _, _ = converter_high_hr.parse_intensity(
            "HeartRate 160bpm", GarminSportType.RUNNING
        )
        assert intensity == GarminIntensity.ACTIVE

    def test_absolute_hr_intensity_thresholds(self):
        """Test absolute HR intensity classification at various thresholds."""
        converter = GarminConverter(user_max_hr=190)

        # < 70% max HR (< 133bpm) -> RECOVERY
        intensity, _, _, _, _ = converter.parse_intensity(
            "HeartRate 130bpm", GarminSportType.RUNNING
        )
        assert intensity == GarminIntensity.RECOVERY

        # 70-80% max HR (133-152bpm) -> ACTIVE
        intensity, _, _, _, _ = converter.parse_intensity(
            "HeartRate 145bpm", GarminSportType.RUNNING
        )
        assert intensity == GarminIntensity.ACTIVE

        # 80-90% max HR (152-171bpm) -> ACTIVE
        intensity, _, _, _, _ = converter.parse_intensity(
            "HeartRate 165bpm", GarminSportType.RUNNING
        )
        assert intensity == GarminIntensity.ACTIVE

        # >= 90% max HR (>= 171bpm) -> INTERVAL
        intensity, _, _, _, _ = converter.parse_intensity(
            "HeartRate 175bpm", GarminSportType.RUNNING
        )
        assert intensity == GarminIntensity.INTERVAL

    def test_workout_conversion_with_user_attributes(self):
        """Test full workout conversion with user-specific attributes."""
        converter = GarminConverter(user_ftp=200, user_max_hr=180)

        workout_text = """cycling
Threshold Workout

- 10m Z2
- 20m Power 180W
- 10m Z1
"""
        workout = converter.convert_to_garmin(workout_text)

        # Check that workout converted successfully
        assert workout.workoutName == "Threshold Workout"
        assert len(workout.segments[0].steps) == 3

        # The 180W step should be classified as INTERVAL (90% of 200W FTP)
        power_step = workout.segments[0].steps[1]
        assert power_step.intensity == GarminIntensity.INTERVAL

    def test_target_values_unchanged_by_user_attributes(self):
        """Test that target values remain unchanged regardless of user attributes."""
        converter1 = GarminConverter(user_ftp=200)
        converter2 = GarminConverter(user_ftp=300)

        # Both should produce same target values, only intensity differs
        _, _, low1, high1, _ = converter1.parse_intensity(
            "Power 180W", GarminSportType.CYCLING
        )
        _, _, low2, high2, _ = converter2.parse_intensity(
            "Power 180W", GarminSportType.CYCLING
        )

        assert low1 == low2 == pytest.approx(180 * 0.95)
        assert high1 == high2 == pytest.approx(180 * 1.05)

    def test_enum_serialization_with_mode_json(self):
        """Test that enums are properly serialized to strings with mode='json'."""
        converter = GarminConverter()
        workout_text = """cycling
Easy Ride

- 10m Z2
"""
        workout = converter.convert_to_garmin(workout_text)

        # Serialize with mode='json' to get proper string values
        payload = workout.model_dump(exclude_none=True, mode="json")

        # Check that enums are serialized to strings, not enum objects
        assert payload["sport"] == "CYCLING"
        assert isinstance(payload["sport"], str)

        # Check nested enums in steps
        step = payload["segments"][0]["steps"][0]
        assert step["intensity"] == "ACTIVE"
        assert step["durationType"] == "TIME"
        assert step["targetType"] == "POWER"
        assert isinstance(step["intensity"], str)
        assert isinstance(step["durationType"], str)
        assert isinstance(step["targetType"], str)


if __name__ == "__main__":
    # Run tests with pytest
    print("Running Garmin Converter tests...")
    pytest.main([__file__, "-v", "--tb=short"])
