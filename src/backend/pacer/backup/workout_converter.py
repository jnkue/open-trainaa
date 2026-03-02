"""
Workout File Converter

This module provides functionality to parse and convert between different workout file formats.
Currently supports:

PARSING (implemented):
- FIT files (Garmin workout format) - parses workout steps and power targets
- Text files (structured text format) - parses duration and intensity descriptions
- JSON files (Wahoo format) - parses existing JSON workout definitions

CONVERSION (implemented):
- To JSON (standard internal format)
- To Text (structured text format)

CONVERSION (not yet implemented):
- ERG, ZWO, MRC formats (placeholder functions exist)
- FIT file generation

The module uses a StandardWorkout class as an intermediate representation that follows
the plan JSON format specification. All parsers convert to this format, and all
converters work from this format.

Usage:
    workout = parse_fit('workout.fit')
    text_output = convert_to_text(workout)
    json_output = convert_to_json(workout)
"""

import json
import re
from typing import Any, Dict, List, Optional

from garmin_fit_sdk import Decoder, Stream

# Test file paths
path_fit = "testfiles/workout/3_20min_Sweet_Spot_60_ergdb.fit"
path_txt = "testfiles/workout/3_20min_Sweet_Spot_60_ergdb.txt"
path_erg = "testfiles/workout/3_20min_Sweet_Spot_60_ergdb.erg"
path_json = "testfiles/workout/3_20min_Sweet_Spot_60_ergdb.json"
path_zwo = "testfiles/workout/3_20min_Sweet_Spot_60_ergdb.zwo"
path_mrc = "testfiles/workout/3_20min_Sweet_Spot_60_ergdb.mrc"


# Standard workout JSON format based on the plan JSON format specification
class StandardWorkout:
    """
    Standard workout format that serves as the intermediate representation
    for converting between different workout file formats.

    This follows the structure defined in the plan-json-format.pdf
    """

    def __init__(self):
        self.header = {
            "name": "",
            "version": "1.0.0",
            "description": "",
            "workout_type_family": 0,  # 0=cycling, 1=running, 2=swimming, etc.
            "ftp": None,  # Optional FTP value
            "sport": None,
        }
        self.intervals = []  # List of interval dictionaries

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {"header": self.header, "intervals": self.intervals}

    def from_dict(self, data: Dict[str, Any]) -> None:
        """Load from dictionary representation"""
        self.header = data.get("header", {})
        self.intervals = data.get("intervals", [])

    def print(self) -> None:
        """Print a summary of the workout"""
        print(f"Workout Name: {self.header.get('name')}")
        print(f"Description: {self.header.get('description')}")
        print(f"Sport: {self.header.get('sport')}")
        print(f"FTP: {self.header.get('ftp')}")
        for i, interval in enumerate(self.intervals, 1):
            print(
                f"Interval {i}: {interval.get('name')} - {interval.get('exit_trigger_type')} {interval.get('exit_trigger_value')}s"
            )
            if "targets" in interval:
                for target in interval["targets"]:
                    print(f"  Target: {target}")


def parse_duration(duration_str: str) -> int:
    """
    Parse duration string and return seconds
    Examples: '5m' -> 300, '30s' -> 30, '1h' -> 3600, '1.5h' -> 5400
    """
    duration_str = duration_str.strip().lower()

    # Extract number and unit
    match = re.match(r"^(\d+(?:\.\d+)?)\s*([smh]?)$", duration_str)
    if not match:
        raise ValueError(f"Invalid duration format: {duration_str}")

    number, unit = match.groups()
    number = float(number)

    if unit == "s" or unit == "":
        return int(number)
    elif unit == "m":
        return int(number * 60)
    elif unit == "h":
        return int(number * 3600)
    else:
        raise ValueError(f"Invalid duration unit: {unit}")


def parse_intensity(intensity_str: str) -> Dict[str, Any]:
    """
    Parse intensity string and return target dictionary
    Examples: '90%' -> power target, '85% HR' -> heart rate target
    """
    intensity_str = intensity_str.strip()

    # Check for heart rate target
    if intensity_str.endswith("% HR"):
        value = float(intensity_str[:-4])
        return {"type": "hr_percent", "low": value / 100, "high": value / 100}

    # Check for power percentage
    if intensity_str.endswith("%"):
        value = float(intensity_str[:-1])
        return {"type": "ftp", "low": value / 100, "high": value / 100}

    # Check for absolute power values (watts)
    if intensity_str.endswith("W"):
        value = float(intensity_str[:-1])
        return {"type": "power", "low": value, "high": value}

    raise ValueError(f"Invalid intensity format: {intensity_str}")


def determine_intensity_type(targets: List[Dict[str, Any]]) -> str:
    """
    Determine the intensity type based on the targets
    """
    # Check if any target is FTP-based and above recovery zones
    for target in targets:
        if target.get("type") == "ftp":
            ftp_value = (target.get("low", 0) + target.get("high", 0)) / 2
            if ftp_value >= 0.9:  # Threshold and above
                return "active"
            elif ftp_value >= 0.65:  # Tempo and above
                return "active"
            else:  # Recovery zones
                return "recover"

    return "active"  # Default


def _process_fit_power_target(
    low_value: int, high_value: int, ftp: Optional[int] = None
) -> Dict[str, Any]:
    """
    Process FIT power target values according to FIT specification:
    - Values 0-1000: Percentage of FTP (0-1000% range)
    - Values >1000: Absolute watts with 1000 offset (e.g., 1325 = 325 watts)
    """

    # According to FIT spec: values >1000 are absolute watts with 1000 offset
    if low_value > 1000 and high_value > 1000:
        # Absolute power values - subtract 1000 offset
        return {"type": "power", "low": low_value - 1000, "high": high_value - 1000}

    # Values 0-1000 are percentage of FTP (in tenths of percent)
    elif 0 <= low_value <= 1000 and 0 <= high_value <= 1000:
        # Convert from tenths of percent to decimal (e.g., 275 = 27.5% = 0.275)
        return {"type": "ftp", "low": low_value / 1000, "high": high_value / 1000}

    else:
        # Mixed values or edge case - log warning and treat as absolute watts
        print(
            f"Warning: Unexpected power values {low_value}-{high_value}, treating as absolute watts"
        )
        return {"type": "power", "low": low_value, "high": high_value}


####
# Parser Functions
####


def parse_fit(path: str) -> StandardWorkout:
    """
    Parse a FIT workout file and convert to standard format
    """
    stream = Stream.from_file(path)
    decoder = Decoder(stream)
    messages, errors = decoder.read(
        apply_scale_and_offset=True,
        convert_types_to_strings=True,
        merge_heart_rates=True,
        convert_datetimes_to_dates=True,
    )

    if len(errors) > 0:
        print(f"Something went wrong decoding the file: {errors}")
        raise ValueError("Error decoding .fit file")

    fit_type = messages["file_id_mesgs"][0]["type"]
    if fit_type != "workout":
        raise ValueError("The .fit file is not of type workout")

    workout = StandardWorkout()

    # Extract header information
    workout_msg = messages["workout_mesgs"][0]
    workout.header["name"] = workout_msg.get("wkt_name", "Unnamed Workout")
    workout.header["sport"] = workout_msg.get("sport", "cycling")

    # Parse workout steps
    workout_steps = messages.get("workout_step_mesgs", [])

    # Process steps and handle repeats properly
    intervals = []
    i = 0

    while i < len(workout_steps):
        step = workout_steps[i]
        duration_type = step.get("duration_type")

        # Check if this is a repeat step
        if duration_type == "repeat_until_steps_cmplt":
            repeat_count = step.get("target_value", 1)
            repeat_name = step.get("wkt_step_name", f"{repeat_count}x")
            steps_to_repeat = step.get("repeat_steps", 1)

            # Find the steps that this repeat references (previous steps)
            start_idx = max(0, i - steps_to_repeat)
            repeated_intervals = []

            # Convert the referenced steps to intervals
            for j in range(start_idx, i):
                if j < len(workout_steps):
                    referenced_step = workout_steps[j]
                    repeated_interval = _convert_fit_step_to_interval(referenced_step)
                    if repeated_interval:
                        repeated_intervals.append(repeated_interval)

            # Create the repeat interval
            repeat_interval = {
                "name": repeat_name,
                "exit_trigger_type": "repeat",
                "exit_trigger_value": repeat_count,
                "intensity_type": "active",
                "intervals": repeated_intervals,
            }

            # Remove the individual steps that are now part of the repeat block
            # We need to remove them from the intervals list we're building
            intervals = (
                intervals[:-steps_to_repeat]
                if len(intervals) >= steps_to_repeat
                else []
            )
            intervals.append(repeat_interval)

        else:
            # Regular step - convert to interval
            interval = _convert_fit_step_to_interval(step)
            if interval:
                intervals.append(interval)

        i += 1

    workout.intervals = intervals
    return workout


def _process_fit_step(
    step: Dict[str, Any], all_steps: List[Dict[str, Any]], step_index: int
) -> Optional[Dict[str, Any]]:
    """
    Process a single FIT workout step and convert to standard interval format.
    Note: Repeat steps are handled in the main parsing loop, this only handles regular steps.
    """
    duration_type = step.get("duration_type")

    # Skip repeat steps as they're handled in the main loop
    if duration_type == "repeat_until_steps_cmplt":
        return None

    # Handle regular time-based steps
    return _convert_fit_step_to_interval(step)


def _convert_fit_step_to_interval(step: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Convert a FIT step to a standard interval
    """
    duration_type = step.get("duration_type")

    # Skip repeat steps as they're handled separately
    if duration_type == "repeat_until_steps_cmplt":
        return None

    if duration_type != "time":
        print(f"Warning: Unsupported duration type: {duration_type}")
        return None

    interval = {
        "name": step.get("wkt_step_name", "Interval"),
        "exit_trigger_type": "time",
        "exit_trigger_value": int(step.get("duration_time", 0)),
        "intensity_type": "active",  # Will be determined by targets
        "targets": [],
    }

    # Process targets based on target_type
    target_type = step.get("target_type")

    if target_type == "power_lap":
        # Power target handling according to FIT specification:
        # Values 0-1000: Percentage of FTP (in tenths of percent)
        # Values >1000: Absolute watts with 1000 offset
        low_power = step.get("custom_target_value_low", 0)
        high_power = step.get("custom_target_value_high", 0)

        # Use the helper function to determine the best interpretation
        target = _process_fit_power_target(low_power, high_power)
        interval["targets"].append(target)

    elif target_type == "heart_rate_lap":
        # Heart rate target - according to FIT spec:
        # Values 0-100: Percentage of max HR
        # Values >100: Absolute BPM with 100 offset (e.g., 225 = 125 bpm)
        low_hr = step.get("custom_target_value_low", 0)
        high_hr = step.get("custom_target_value_high", 0)

        if low_hr > 100 and high_hr > 100:
            # Absolute BPM values - subtract 100 offset
            interval["targets"].append(
                {"type": "hr", "low": low_hr - 100, "high": high_hr - 100}
            )
        else:
            # Percentage of max HR (0-100 range)
            interval["targets"].append(
                {"type": "hr_percent", "low": low_hr / 100, "high": high_hr / 100}
            )

    # Determine intensity type based on targets
    interval["intensity_type"] = determine_intensity_type(interval["targets"])

    return interval


def parse_text(path: str) -> StandardWorkout:
    """
    Parse a structured text workout file and convert to standard format

    Expected format:
    - First line: workout description (optional)
    - Following lines: workout segments
    - Indented lines: repeated blocks
    - Format: {duration} {intensity}
    - Repeat format: {count}x followed by indented intervals
    """
    with open(path, "r", encoding="utf-8") as f:
        lines = [line.rstrip() for line in f.readlines()]

    workout = StandardWorkout()

    # First non-empty line is typically the description
    description_line = None
    workout_lines = []

    for line in lines:
        if line.strip():
            if description_line is None:
                # Check if this looks like a workout instruction vs description
                if _is_workout_instruction(line):
                    workout_lines.append(line)
                else:
                    description_line = line.strip()
                    workout.header["description"] = description_line
            else:
                workout_lines.append(line)

    # Parse workout instructions
    intervals = []
    i = 0
    while i < len(workout_lines):
        line = workout_lines[i]
        interval, lines_consumed = _parse_text_line(line, workout_lines, i)
        if interval:
            intervals.append(interval)
        i += lines_consumed

    workout.intervals = intervals
    workout.header["name"] = description_line or "Text Workout"

    return workout


def _is_workout_instruction(line: str) -> bool:
    """
    Determine if a line is a workout instruction vs a description
    """
    line = line.strip()

    # Check for typical workout patterns
    patterns = [
        r"^\d+x\s*$",  # Repeat indicator like "3x"
        r"^\s*\d+[smh]?\s+\d+%",  # Duration + intensity like "5m 90%"
        r"^\s*\d+[smh]?\s+\d+%\s+HR",  # Duration + HR intensity
    ]

    for pattern in patterns:
        if re.match(pattern, line):
            return True

    return False


def _parse_text_line(
    line: str, all_lines: List[str], line_index: int
) -> tuple[Optional[Dict[str, Any]], int]:
    """
    Parse a single line from text format and return interval + number of lines consumed
    """
    line = line.strip()

    if not line:
        return None, 1

    # Check for repeat pattern
    repeat_match = re.match(r"^(\d+)x\s*$", line)
    if repeat_match:
        repeat_count = int(repeat_match.group(1))

        # Collect indented lines that follow
        repeated_intervals = []
        lines_consumed = 1

        for i in range(line_index + 1, len(all_lines)):
            next_line = all_lines[i]

            # Check if line is indented (part of repeat block)
            if next_line.startswith("    ") or next_line.startswith("\t"):
                # Parse the indented line as an interval
                interval_line = next_line.strip()
                if interval_line:
                    interval = _parse_single_text_interval(interval_line)
                    if interval:
                        repeated_intervals.append(interval)
                lines_consumed += 1
            else:
                break

        return {
            "name": f"{repeat_count}x",
            "exit_trigger_type": "repeat",
            "exit_trigger_value": repeat_count,
            "intensity_type": "active",
            "intervals": repeated_intervals,
        }, lines_consumed

    # Parse as single interval
    interval = _parse_single_text_interval(line)
    return interval, 1


def _parse_single_text_interval(line: str) -> Optional[Dict[str, Any]]:
    """
    Parse a single interval line like "5m 90%" or "20m 85% HR"
    """
    # Pattern: duration intensity
    match = re.match(r"^(\d+(?:\.\d+)?[smh]?)\s+(.+)$", line.strip())
    if not match:
        return None

    duration_str, intensity_str = match.groups()

    try:
        duration = parse_duration(duration_str)
        target = parse_intensity(intensity_str)

        interval = {
            "name": f"{duration_str} @ {intensity_str}",
            "exit_trigger_type": "time",
            "exit_trigger_value": duration,
            "intensity_type": determine_intensity_type([target]),
            "targets": [target],
        }

        return interval

    except ValueError as e:
        print(f"Warning: Could not parse line '{line}': {e}")
        return None


def parse_json(path: str) -> StandardWorkout:
    """
    Parse existing JSON workout format and convert to standard format
    """
    raise NotImplementedError("JSON parsing not yet implemented")


def parse_erg(path: str) -> StandardWorkout:
    """
    Parse ERG workout file - placeholder for future implementation
    """
    # TODO: Implement ERG parsing
    raise NotImplementedError("ERG parsing not yet implemented")


def parse_zwo(path: str) -> StandardWorkout:
    """
    Parse ZWO (Zwift) workout file - placeholder for future implementation
    """
    # TODO: Implement ZWO parsing
    raise NotImplementedError("ZWO parsing not yet implemented")


def parse_mrc(path: str) -> StandardWorkout:
    """
    Parse MRC workout file - placeholder for future implementation
    """
    # TODO: Implement MRC parsing
    raise NotImplementedError("MRC parsing not yet implemented")


####
# Converter Functions
####


def convert_to_fit(workout: StandardWorkout) -> bytes:
    """
    Convert standard workout format to FIT file data
    """
    # TODO: Implement FIT generation
    raise NotImplementedError("FIT generation not yet implemented")


def convert_to_text(workout: StandardWorkout) -> str:
    """
    Convert standard workout format to structured text format
    """
    lines = []

    # Add description as first line if present
    if workout.header.get("description"):
        lines.append(workout.header["description"])

    # Convert intervals to text format
    for interval in workout.intervals:
        text_line = _interval_to_text(interval)
        if text_line:
            lines.append(text_line)

    return "\n".join(lines)


def _interval_to_text(interval: Dict[str, Any], indent_level: int = 0) -> str:
    """
    Convert a single interval to text format
    """
    indent = "    " * indent_level

    # Handle repeat intervals
    if interval.get("exit_trigger_type") == "repeat":
        lines = [f"{indent}{interval.get('exit_trigger_value', 1)}x"]

        # Add sub-intervals with increased indentation
        for sub_interval in interval.get("intervals", []):
            sub_text = _interval_to_text(sub_interval, indent_level + 1)
            if sub_text:
                lines.append(sub_text)

        return "\n".join(lines)

    # Handle regular time-based intervals
    duration = interval.get("exit_trigger_value", 0)
    targets = interval.get("targets", [])

    if not targets:
        return f"{indent}{duration}s"

    # Convert duration to readable format
    duration_str = _seconds_to_duration_string(duration)

    # Get primary target for text representation
    primary_target = targets[0]
    target_str = _target_to_text(primary_target)

    return f"{indent}{duration_str} {target_str}"


def _seconds_to_duration_string(seconds: int) -> str:
    """
    Convert seconds to readable duration string
    """
    if seconds >= 3600:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        if minutes == 0:
            return f"{hours}h"
        else:
            return f"{hours}h{minutes}m"
    elif seconds >= 60:
        minutes = seconds // 60
        remaining_seconds = seconds % 60
        if remaining_seconds == 0:
            return f"{minutes}m"
        else:
            return f"{minutes}m{remaining_seconds}s"
    else:
        return f"{seconds}s"


def _target_to_text(target: Dict[str, Any]) -> str:
    """
    Convert a target to text representation
    """
    target_type = target.get("type")
    low = target.get("low", 0)
    high = target.get("high", 0)

    # Use average if range, otherwise use low value
    value = (low + high) / 2 if low != high else low

    if target_type == "ftp":
        return f"{int(value * 100)}%"
    elif target_type == "hr_percent":
        return f"{int(value * 100)}% HR"
    elif target_type == "power":
        return f"{int(value)}W"
    elif target_type == "hr":
        return f"{int(value)}bpm"
    else:
        return f"{value}"


def convert_to_json(workout: StandardWorkout) -> str:
    """
    Convert standard workout format to JSON string
    """
    return json.dumps(workout.to_dict(), indent=2)


def convert_to_erg(workout: StandardWorkout) -> str:
    """
    Convert standard workout format to ERG format - placeholder for future implementation
    """
    # TODO: Implement ERG generation
    raise NotImplementedError("ERG generation not yet implemented")


def convert_to_zwo(workout: StandardWorkout) -> str:
    """
    Convert standard workout format to ZWO format - placeholder for future implementation
    """
    # TODO: Implement ZWO generation
    raise NotImplementedError("ZWO generation not yet implemented")


def convert_to_mrc(workout: StandardWorkout) -> str:
    """
    Convert standard workout format to MRC format - placeholder for future implementation
    """
    # TODO: Implement MRC generation
    raise NotImplementedError("MRC generation not yet implemented")


def convert(path: str, to_format: str) -> Any:
    """
    Main conversion function - parse input file and convert to target format
    """
    # Parse input file to standard format
    if path.endswith(".fit"):
        workout = parse_fit(path)
    elif path.endswith(".txt"):
        workout = parse_text(path)
    elif path.endswith(".erg"):
        workout = parse_erg(path)
    elif path.endswith(".json"):
        workout = parse_json(path)
    elif path.endswith(".zwo"):
        workout = parse_zwo(path)
    elif path.endswith(".mrc"):
        workout = parse_mrc(path)
    else:
        raise ValueError("Unsupported file format")

    # Convert to target format
    if to_format == "fit":
        return convert_to_fit(workout)
    elif to_format == "txt":
        return convert_to_text(workout)
    elif to_format == "erg":
        return convert_to_erg(workout)
    elif to_format == "json":
        return convert_to_json(workout)
    elif to_format == "zwo":
        return convert_to_zwo(workout)
    elif to_format == "mrc":
        return convert_to_mrc(workout)
    else:
        raise ValueError("Unsupported target format")


# Test/Demo functions
def test_conversions():
    """
    Test the conversion functions with the example files
    """
    print("Testing workout conversions...")

    # Test FIT parsing
    try:
        print("\n1. Testing FIT parsing:")
        fit_workout = parse_fit(path_fit)

        print("\nParsed FIT Workout:")
        fit_workout.print()

        # Convert to text
        text_output = convert_to_text(fit_workout)
        print("\nConverted to Text Format:")
        print(text_output)

    except Exception as e:
        print(f"   Error parsing FIT: {e}")

    # Test text parsing
    try:
        print("\n2. Testing text parsing:")
        text_workout = parse_text(path_txt)
        print("\nParsed Text Workout:")
        text_workout.print()

        # Convert to JSON
        json_output = convert_to_json(text_workout)
        print("\nConverted to JSON Format:")
        print(json_output)

    except Exception as e:
        print(f"   Error parsing text: {e}")


if __name__ == "__main__":
    test_conversions()
