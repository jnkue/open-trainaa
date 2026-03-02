#!/usr/bin/env python3
"""
Workout Text to Wahoo Format Converter

Converts workout text files (following our workout definition format)
into Wahoo workout JSON format using the wahoodefinitions models.
"""

import re
from pathlib import Path
from typing import Dict, List, Tuple

from .txt_workout_validator import WorkoutValidator

# Import Wahoo definitions
from .wahoo_workout_definition import (
    ExitTriggerType,
    Header,
    InnerInterval,
    IntensityType,
    Interval,
    Target,
    TargetType,
    Workout,
    WorkoutTypeFamily,
    WorkoutTypeLocation,
)


class WahooConverter:
    """Converts text workout definitions to Wahoo format."""

    # Mapping from our workout types to Wahoo types (lowercase keys)
    WORKOUT_TYPE_MAPPING = {
        "cycling": WorkoutTypeFamily.BIKING,
        "running": WorkoutTypeFamily.RUNNING,
    }

    # Workout types that cannot be converted to Wahoo format
    UNSUPPORTED_WORKOUT_TYPES = {
        "swimming": "Swimming workouts are not supported by Wahoo format",
        "training": "Strength/training workouts are not supported by Wahoo format",
        "hiking": "Hiking workouts are not supported by Wahoo format",
        "rowing": "Rowing workouts are not supported by Wahoo format",
        "walking": "Walking workouts are not supported by Wahoo format",
    }

    # Default athlete values for relative targets
    DEFAULT_FTP = 250  # watts
    DEFAULT_MAP = 320  # watts (5min power)
    DEFAULT_AC = 380  # watts (1min power)
    DEFAULT_NM = 750  # watts (5sec power)
    DEFAULT_THRESHOLD_HR = 165  # bpm
    DEFAULT_MAX_HR = 190  # bpm
    DEFAULT_THRESHOLD_SPEED = 4.17  # m/s (15 km/h)

    def __init__(self):
        self.validator = WorkoutValidator()

    def parse_duration(self, duration_str: str) -> Tuple[ExitTriggerType, float]:
        """Parse duration string and return trigger type and value."""
        # Time formats: 10m, 8m30s, 2h30m, 5s, 1h
        if re.match(r"^\d+m$", duration_str):
            # Simple minutes: 10m
            minutes = int(duration_str[:-1])
            return ExitTriggerType.time, minutes * 60

        elif re.match(r"^\d+s$", duration_str):
            # Simple seconds: 30s
            seconds = int(duration_str[:-1])
            return ExitTriggerType.time, seconds

        elif re.match(r"^\d+h$", duration_str):
            # Simple hours: 2h
            hours = int(duration_str[:-1])
            return ExitTriggerType.time, hours * 3600

        elif re.match(r"^\d+m\d+s$", duration_str):
            # Minutes and seconds: 8m30s
            parts = duration_str.replace("s", "").split("m")
            minutes = int(parts[0])
            seconds = int(parts[1])
            return ExitTriggerType.time, minutes * 60 + seconds

        elif re.match(r"^\d+h\d+m$", duration_str):
            # Hours and minutes: 2h30m
            parts = duration_str.replace("m", "").split("h")
            hours = int(parts[0])
            minutes = int(parts[1])
            return ExitTriggerType.time, hours * 3600 + minutes * 60

        elif re.match(r"^[\d\.]+km$", duration_str):
            # Distance in kilometers: 0.4km, 1.5km
            km = float(duration_str[:-2])
            meters = int(km * 1000)
            return ExitTriggerType.distance, meters

        else:
            raise ValueError(f"Unsupported duration format: {duration_str}")

    def parse_intensity(self, intensity_str: str) -> Tuple[List[Target], IntensityType]:
        """Parse intensity string and return targets and intensity type."""
        targets = []
        intensity_type = IntensityType.active

        # Zone-based: Z1, Z2, Z3, etc.
        if re.match(r"^Z\d+$", intensity_str):
            zone = int(intensity_str[1:])

            # Map zones to intensity types and power percentages
            zone_mapping = {
                1: (IntensityType.recover, 0.50, 0.60),  # Recovery
                2: (IntensityType.active, 0.60, 0.70),  # Aerobic base
                3: (IntensityType.tempo, 0.70, 0.80),  # Tempo
                4: (IntensityType.lt, 0.80, 0.90),  # Threshold
                5: (IntensityType.map, 0.90, 1.05),  # VO2 max
                6: (IntensityType.ac, 1.05, 1.20),  # Anaerobic
                7: (IntensityType.nm, 1.20, 1.50),  # Neuromuscular
            }

            if zone in zone_mapping:
                intensity_type, low_pct, high_pct = zone_mapping[zone]
                targets.append(Target(type=TargetType.ftp, low=low_pct, high=high_pct))
            else:
                # Default for unknown zones
                targets.append(Target(type=TargetType.ftp, low=0.60, high=0.70))

        # Relative FTP: %FTP 88%
        elif re.match(r"^%FTP \d+%$", intensity_str):
            percentage = int(intensity_str.split()[1][:-1]) / 100.0

            # Determine intensity type based on percentage
            if percentage < 0.60:
                intensity_type = IntensityType.recover
            elif percentage < 0.75:
                intensity_type = IntensityType.active
            elif percentage < 0.85:
                intensity_type = IntensityType.tempo
            elif percentage < 1.05:
                intensity_type = IntensityType.lt
            else:
                intensity_type = IntensityType.map

            targets.append(
                Target(
                    type=TargetType.ftp,
                    low=percentage * 0.95,  # 5% tolerance
                    high=percentage * 1.05,
                )
            )

        # Relative HR: %HR 75%
        elif re.match(r"^%HR \d+%$", intensity_str):
            percentage = int(intensity_str.split()[1][:-1]) / 100.0

            if percentage < 0.70:
                intensity_type = IntensityType.recover
            elif percentage < 0.80:
                intensity_type = IntensityType.active
            elif percentage < 0.90:
                intensity_type = IntensityType.tempo
            else:
                intensity_type = IntensityType.lt

            targets.append(
                Target(
                    type=TargetType.threshold_hr,
                    low=percentage * 0.95,
                    high=percentage * 1.05,
                )
            )

        # Absolute Power: Power 250W
        elif re.match(r"^Power \d+W$", intensity_str):
            watts = int(intensity_str.split()[1][:-1])

            if watts < 150:
                intensity_type = IntensityType.recover
            elif watts < 200:
                intensity_type = IntensityType.active
            elif watts < 300:
                intensity_type = IntensityType.tempo
            else:
                intensity_type = IntensityType.lt

            targets.append(
                Target(type=TargetType.watts, low=watts * 0.95, high=watts * 1.05)
            )

        # Absolute Heart Rate: HeartRate 150bpm
        elif re.match(r"^HeartRate \d+bpm$", intensity_str):
            bpm = int(intensity_str.split()[1][:-3])

            if bpm < 130:
                intensity_type = IntensityType.recover
            elif bpm < 150:
                intensity_type = IntensityType.active
            elif bpm < 170:
                intensity_type = IntensityType.tempo
            else:
                intensity_type = IntensityType.lt

            targets.append(Target(type=TargetType.hr, low=bpm - 5, high=bpm + 5))

        # Speed targets: Speed 15km/h or Speed 1:30/100m
        elif re.match(r"^Speed \d+km/h$", intensity_str):
            kmh = int(intensity_str.split()[1][:-4])
            ms = kmh / 3.6  # Convert km/h to m/s

            targets.append(Target(type=TargetType.speed, low=ms * 0.95, high=ms * 1.05))

        # Swimming pace: Speed 1:30/100m
        elif re.match(r"^Speed \d+:\d+/100m$", intensity_str):
            pace_str = intensity_str.split()[1].split("/")[0]
            minutes, seconds = map(int, pace_str.split(":"))

            # Convert pace to speed (m/s)
            time_per_100m = minutes * 60 + seconds
            speed_ms = 100.0 / time_per_100m

            targets.append(
                Target(type=TargetType.speed, low=speed_ms * 0.95, high=speed_ms * 1.05)
            )

        # Strength percentage: Strength 80%
        elif re.match(r"^Strength \d+%$", intensity_str):
            percentage = int(intensity_str.split()[1][:-1])

            if percentage == 0:
                intensity_type = IntensityType.rest
            elif percentage < 50:
                intensity_type = IntensityType.recover
            elif percentage < 75:
                intensity_type = IntensityType.active
            else:
                intensity_type = IntensityType.tempo

            # Use RPE for strength training
            rpe = max(1, min(10, int(percentage / 10)))
            targets.append(Target(type=TargetType.rpe, low=rpe, high=rpe))

        else:
            # Default fallback
            targets.append(Target(type=TargetType.ftp, low=0.60, high=0.70))

        return targets, intensity_type

    def parse_workout_text(self, text: str) -> Dict:
        """Parse workout text and extract structured data."""
        lines = [line.strip() for line in text.strip().split("\n")]

        if len(lines) < 4:
            raise ValueError("Workout must have at least 4 lines")

        workout_type = lines[0]
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

    def convert_to_wahoo(self, text: str) -> Workout:
        """Convert workout text to Wahoo Workout object."""

        # First validate the text
        is_valid, errors = self.validator.validate_text(text)
        if not is_valid:
            raise ValueError(f"Invalid workout text: {errors}")

        # Parse the text
        parsed = self.parse_workout_text(text)

        # Check if workout type is supported for Wahoo conversion
        if parsed["workout_type"] in self.UNSUPPORTED_WORKOUT_TYPES:
            error_msg = self.UNSUPPORTED_WORKOUT_TYPES[parsed["workout_type"]]
            raise ValueError(f"Conversion not possible: {error_msg}")

        # Create header
        workout_type_family = self.WORKOUT_TYPE_MAPPING.get(parsed["workout_type"])

        if workout_type_family is None:
            raise ValueError(f"Unsupported workout type: {parsed['workout_type']}")

        # Calculate total duration
        total_duration = 0
        for set_data in parsed["sets"]:
            for step in set_data["steps"]:
                trigger_type, trigger_value = self.parse_duration(step["duration"])
                if trigger_type == ExitTriggerType.time:
                    total_duration += trigger_value * set_data["reps"]

        header = Header(
            name=parsed["workout_name"],
            version="1.0.0",
            workout_type_family=workout_type_family,
            workout_type_location=WorkoutTypeLocation.INDOOR,
            description=f"Converted from text workout: {parsed['workout_name']}",
            duration_s=int(total_duration),
            ftp=self.DEFAULT_FTP,
            map=self.DEFAULT_MAP,
            ac=self.DEFAULT_AC,
            nm=self.DEFAULT_NM,
            threshold_hr=self.DEFAULT_THRESHOLD_HR,
            max_hr=self.DEFAULT_MAX_HR,
            threshold_speed=self.DEFAULT_THRESHOLD_SPEED,
        )

        # Create intervals
        intervals = []

        for set_data in parsed["sets"]:
            if set_data["reps"] > 1:
                # Create repeat interval
                inner_intervals = []

                for step in set_data["steps"]:
                    trigger_type, trigger_value = self.parse_duration(step["duration"])
                    targets, intensity_type = self.parse_intensity(step["intensity"])

                    inner_interval = InnerInterval(
                        name=f"{set_data['name']} Step",
                        exit_trigger_type=trigger_type,
                        exit_trigger_value=trigger_value,
                        intensity_type=intensity_type,
                        targets=targets,
                    )
                    inner_intervals.append(inner_interval)

                # Create main interval with repetitions
                interval = Interval(
                    name=set_data["name"],
                    exit_trigger_type=ExitTriggerType.repeat,
                    exit_trigger_value=set_data["reps"],
                    intensity_type=IntensityType.active,
                    intervals=inner_intervals,
                )
                intervals.append(interval)

            else:
                # Single intervals
                for step in set_data["steps"]:
                    trigger_type, trigger_value = self.parse_duration(step["duration"])
                    targets, intensity_type = self.parse_intensity(step["intensity"])

                    interval = Interval(
                        name=set_data["name"],
                        exit_trigger_type=trigger_type,
                        exit_trigger_value=trigger_value,
                        intensity_type=intensity_type,
                        targets=targets,
                    )
                    intervals.append(interval)

        return Workout(header=header, intervals=intervals)

    def convert_file(self, file_path: str) -> Workout:
        """Convert a workout file to Wahoo format."""
        with open(file_path, "r") as f:
            text = f.read()
        return self.convert_to_wahoo(text)

    def convert_all_valid_files(self, output_dir: str = "wahoo_output"):
        """Convert all valid workout files to Wahoo format."""
        valid_dir = Path("testfiles/valid")
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)

        if not valid_dir.exists():
            print(f"❌ Directory {valid_dir} not found!")
            return

        valid_files = list(valid_dir.glob("*.txt"))

        print(f"Converting {len(valid_files)} workout files to Wahoo format...")
        print(f"Output directory: {output_path}")
        print("=" * 60)

        success_count = 0
        for file_path in sorted(valid_files):
            try:
                print(f"Converting {file_path.name}...")

                workout = self.convert_file(str(file_path))

                # Save as JSON
                output_file = output_path / f"{file_path.stem}.json"
                with open(output_file, "w") as f:
                    f.write(workout.model_dump_json(indent=2))

                print(f"✅ Success: {output_file}")
                success_count += 1

            except Exception as e:
                print(f"❌ Error converting {file_path.name}: {e}")

        print("=" * 60)
        print(
            f"Conversion complete: {success_count}/{len(valid_files)} files converted successfully"
        )


class FitFileConverter:
    """Converts workout text files to FIT file format using fit_tool library."""

    # Mapping from our workout types to FIT Sport types (lowercase keys)
    SPORT_TYPE_MAPPING = {
        "cycling": "CYCLING",
        "running": "RUNNING",
        "swimming": "SWIMMING",
        "training": "TRAINING",
        "walking": "WALKING",
    }

    # Mapping from our intensity types to FIT Intensity types
    INTENSITY_MAPPING = {
        "warmup": "WARMUP",
        "cooldown": "COOLDOWN",
        "active": "ACTIVE",
        "rest": "REST",
        "recovery": "RECOVERY",
        "interval": "INTERVAL",
    }

    def __init__(self):
        self.validator = WorkoutValidator()
        # Import fit_tool dependencies
        try:
            from fit_tool.fit_file_builder import FitFileBuilder
            from fit_tool.profile.messages.file_id_message import FileIdMessage
            from fit_tool.profile.messages.workout_message import WorkoutMessage
            from fit_tool.profile.messages.workout_step_message import (
                WorkoutStepMessage,
            )
            from fit_tool.profile.profile_type import (
                FileType,
                Intensity,
                Manufacturer,
                Sport,
                WorkoutStepDuration,
                WorkoutStepTarget,
            )

            self.FitFileBuilder = FitFileBuilder
            self.FileIdMessage = FileIdMessage
            self.WorkoutMessage = WorkoutMessage
            self.WorkoutStepMessage = WorkoutStepMessage
            self.FileType = FileType
            self.Intensity = Intensity
            self.Manufacturer = Manufacturer
            self.Sport = Sport
            self.WorkoutStepDuration = WorkoutStepDuration
            self.WorkoutStepTarget = WorkoutStepTarget
        except ImportError as e:
            raise ImportError(f"fit_tool library not available. Please install it: {e}")

    def _parse_workout_text(self, text: str) -> Dict:
        """Parse workout text using WahooConverter's parser."""
        converter = WahooConverter()
        return converter.parse_workout_text(text)

    def _map_intensity_to_fit(self, intensity_type_str: str):
        """Map our intensity type to FIT Intensity enum."""
        fit_intensity_name = self.INTENSITY_MAPPING.get(
            intensity_type_str.lower(), "ACTIVE"
        )
        return getattr(self.Intensity, fit_intensity_name)

    def _create_workout_step(self, step_data: Dict, set_name: str):
        """Create a FIT WorkoutStepMessage from step data."""
        step = self.WorkoutStepMessage()

        # Parse duration
        duration_str = step_data["duration"]
        converter = WahooConverter()
        trigger_type, trigger_value = converter.parse_duration(duration_str)

        # Parse intensity
        intensity_str = step_data["intensity"]
        targets, intensity_type = converter.parse_intensity(intensity_str)

        # Set step name
        step.workout_step_name = f"{set_name}: {duration_str} {intensity_str}"

        # Set duration
        if trigger_type.name == "time":
            step.duration_type = self.WorkoutStepDuration.TIME
            step.duration_time = trigger_value
        elif trigger_type.name == "distance":
            step.duration_type = self.WorkoutStepDuration.DISTANCE
            step.duration_distance = trigger_value
        else:
            step.duration_type = self.WorkoutStepDuration.OPEN
            step.duration_value = 0

        # Set intensity
        step.intensity = self._map_intensity_to_fit(intensity_type.name)

        # Set target based on the first target (FIT only supports one target per step)
        if targets and len(targets) > 0:
            target = targets[0]

            if target.type.name == "ftp" or target.type.name == "watts":
                step.target_type = self.WorkoutStepTarget.POWER
                # Convert percentage to zone (simplified mapping)
                if target.low <= 0.6:
                    step.target_power_zone = 1
                elif target.low <= 0.75:
                    step.target_power_zone = 2
                elif target.low <= 0.85:
                    step.target_power_zone = 3
                elif target.low <= 0.95:
                    step.target_power_zone = 4
                elif target.low <= 1.05:
                    step.target_power_zone = 5
                else:
                    step.target_power_zone = 6

            elif target.type.name in ["hr", "threshold_hr"]:
                step.target_type = self.WorkoutStepTarget.HEART_RATE
                # Convert to HR zone (simplified)
                if target.low <= 0.7:
                    step.target_hr_zone = 1
                elif target.low <= 0.8:
                    step.target_hr_zone = 2
                elif target.low <= 0.9:
                    step.target_hr_zone = 3
                elif target.low <= 0.95:
                    step.target_hr_zone = 4
                else:
                    step.target_hr_zone = 5

            elif target.type.name == "speed":
                step.target_type = self.WorkoutStepTarget.SPEED
                step.target_speed_zone = 0  # Custom speed

            else:
                step.target_type = self.WorkoutStepTarget.OPEN
                step.target_value = 0
        else:
            step.target_type = self.WorkoutStepTarget.OPEN
            step.target_value = 0

        return step

    def convert_to_fit(self, text: str, output_path: str) -> None:
        """
        Convert workout text to FIT file format.

        Args:
            text: Workout text in our format
            output_path: Path where the .fit file should be saved
        """
        import datetime

        # Validate the text
        is_valid, errors = self.validator.validate_text(text)
        if not is_valid:
            raise ValueError(f"Invalid workout text: {errors}")

        # Parse the text
        parsed = self._parse_workout_text(text)

        # Create file ID message
        file_id_message = self.FileIdMessage()
        file_id_message.type = self.FileType.WORKOUT
        file_id_message.manufacturer = self.Manufacturer.DEVELOPMENT.value
        file_id_message.product = 0
        file_id_message.time_created = round(datetime.datetime.now().timestamp() * 1000)
        file_id_message.serial_number = 0x12345678

        # Map workout type to Sport
        workout_type_lower = parsed["workout_type"].lower()
        sport_name = self.SPORT_TYPE_MAPPING.get(workout_type_lower, "GENERIC")
        sport = getattr(self.Sport, sport_name)

        # Create workout steps
        workout_steps = []
        for set_data in parsed["sets"]:
            set_name = set_data["name"]
            reps = set_data["reps"]

            # For repeated sets, we need to create the steps multiple times
            # or use REPEAT_UNTIL_STEPS_CMPLT duration type
            for rep in range(reps):
                for step_data in set_data["steps"]:
                    step = self._create_workout_step(step_data, set_name)
                    workout_steps.append(step)

        # Create workout message
        workout_message = self.WorkoutMessage()
        workout_message.workoutName = parsed["workout_name"]
        workout_message.sport = sport
        workout_message.num_valid_steps = len(workout_steps)

        # Build the FIT file
        builder = self.FitFileBuilder(auto_define=True, min_string_size=50)
        builder.add(file_id_message)
        builder.add(workout_message)
        builder.add_all(workout_steps)

        fit_file = builder.build()

        # Save to file
        fit_file.to_file(output_path)

    def convert_file(self, file_path: str, output_path: str) -> None:
        """
        Convert a workout file to FIT format.

        Args:
            file_path: Path to the input workout text file
            output_path: Path where the .fit file should be saved
        """
        with open(file_path, "r") as f:
            text = f.read()
        self.convert_to_fit(text, output_path)

    def convert_all_valid_files(self, output_dir: str = "fit_output"):
        """Convert all valid workout files to FIT format."""
        valid_dir = Path("testfiles/valid")
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)

        if not valid_dir.exists():
            print(f"❌ Directory {valid_dir} not found!")
            return

        valid_files = list(valid_dir.glob("*.txt"))

        print(f"Converting {len(valid_files)} workout files to FIT format...")
        print(f"Output directory: {output_path}")
        print("=" * 60)

        success_count = 0
        for file_path in sorted(valid_files):
            try:
                print(f"Converting {file_path.name}...")

                output_file = output_path / f"{file_path.stem}.fit"
                self.convert_file(str(file_path), str(output_file))

                print(f"✅ Success: {output_file}")
                success_count += 1

            except Exception as e:
                print(f"❌ Error converting {file_path.name}: {e}")

        print("=" * 60)
        print(
            f"Conversion complete: {success_count}/{len(valid_files)} files converted successfully"
        )


def main():
    """Main function for command line usage."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Convert workout text files to Wahoo JSON or FIT format"
    )
    parser.add_argument("--file", help="Convert a specific file")
    parser.add_argument("--all", action="store_true", help="Convert all valid files")
    parser.add_argument("--output", default="wahoo_output", help="Output directory")
    parser.add_argument(
        "--format",
        choices=["wahoo", "fit"],
        default="wahoo",
        help="Output format: wahoo (JSON) or fit (FIT file)",
    )

    args = parser.parse_args()

    if args.format == "wahoo":
        converter = WahooConverter()

        if args.file:
            try:
                workout = converter.convert_file(args.file)
                print(workout.model_dump_json(indent=2))
            except Exception as e:
                print(f"Error: {e}")
                sys.exit(1)

        elif args.all:
            converter.convert_all_valid_files(args.output)

        else:
            print("Please specify --file <filename> or --all")
            print("Use --help for more options")

    elif args.format == "fit":
        converter = FitFileConverter()

        if args.file:
            try:
                output_file = Path(args.file).stem + ".fit"
                converter.convert_file(args.file, output_file)
                print(f"✅ Successfully created FIT file: {output_file}")
            except Exception as e:
                print(f"Error: {e}")
                sys.exit(1)

        elif args.all:
            converter.convert_all_valid_files(args.output)

        else:
            print("Please specify --file <filename> or --all")
            print("Use --help for more options")


if __name__ == "__main__":
    main()
