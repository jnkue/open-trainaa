#!/usr/bin/env python3
"""
Workout Definition Validator

This script validates workout text files against the defined workout format specification.
"""

import re
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class ValidationError:
    line_number: int
    error_type: str
    message: str
    line_content: str


class WorkoutValidator:
    """Validates workout definitions according to the specification."""

    # Valid workout types (lowercase to match backend SportType enum)
    WORKOUT_TYPES = {
        "cycling",
        "running",
        "swimming",
        "training",
        "hiking",
        "rowing",
        "walking",
    }

    # Regex patterns
    DURATION_PATTERNS = [
        r"^\d+[hms]$",  # Simple time: 10m, 5s, 2h
        r"^\d+m\d+s$",  # Extended time: 8m30s
        r"^\d+h\d+m$",  # Extended time: 2h30m
        r"^[\d\.]+km$",  # Distance in km: 0.4km, 1.5km
    ]

    INTENSITY_PATTERNS = [
        r"^Power \d+W$",  # Absolute power: Power 250W
        r"^HeartRate \d+bpm$",  # Absolute heart rate: HeartRate 150bpm
        r"^Speed \d+km/h$",  # Absolute speed: Speed 25km/h
        r"^%FTP \d+%$",  # Relative FTP: %FTP 85%
        r"^%HR \d+%$",  # Relative HR: %HR 75%
        r"^%Speed \d+%$",  # Relative Speed: %Speed 90%
        r"^Z\d+$",  # Zone-based: Z2, Z3
        r"^Strength \d+%$",  # Strength percentage: Strength 80%
        r"^Speed \d+:\d+/100m$",  # Swimming pace: Speed 1:30/100m
    ]

    def __init__(self):
        self.errors: List[ValidationError] = []
        self.lines: List[str] = []

    def validate_file(self, file_path: str) -> Tuple[bool, List[ValidationError]]:
        """Validate a workout file."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            return self.validate_text(content)
        except FileNotFoundError:
            return False, [
                ValidationError(0, "FILE_ERROR", f"File not found: {file_path}", "")
            ]
        except Exception as e:
            return False, [
                ValidationError(0, "FILE_ERROR", f"Error reading file: {str(e)}", "")
            ]

    def validate_text(self, text: str) -> Tuple[bool, List[ValidationError]]:
        """Validate workout text content."""
        self.errors = []
        self.lines = text.strip().split("\n")

        if len(self.lines) < 4:
            self.errors.append(
                ValidationError(
                    0,
                    "STRUCTURE_ERROR",
                    "Workout must have at least 4 lines (type, name, empty line, content)",
                    "",
                )
            )
            return False, self.errors

        # Validate structure
        self._validate_workout_type(0)
        self._validate_workout_name(1)
        self._validate_empty_line(2)
        self._validate_workout_content(3)

        return len(self.errors) == 0, self.errors

    def _validate_workout_type(self, line_idx: int):
        """Validate the workout type (line 1)."""
        if line_idx >= len(self.lines):
            return

        line = self.lines[line_idx].strip()
        if line not in self.WORKOUT_TYPES:
            self.errors.append(
                ValidationError(
                    line_idx + 1,
                    "WORKOUT_TYPE_ERROR",
                    f"Invalid workout type. Must be one of: {', '.join(self.WORKOUT_TYPES)}",
                    line,
                )
            )

    def _validate_workout_name(self, line_idx: int):
        """Validate the workout name (line 2)."""
        if line_idx >= len(self.lines):
            return

        line = self.lines[line_idx].strip()
        if not line:
            self.errors.append(
                ValidationError(
                    line_idx + 1,
                    "WORKOUT_NAME_ERROR",
                    "Workout name cannot be empty",
                    line,
                )
            )

    def _validate_empty_line(self, line_idx: int):
        """Validate the empty line (line 3)."""
        if line_idx >= len(self.lines):
            return

        line = self.lines[line_idx]
        if line.strip():
            self.errors.append(
                ValidationError(
                    line_idx + 1,
                    "EMPTY_LINE_ERROR",
                    "Line 3 must be empty to separate header from content",
                    line,
                )
            )

    def _validate_workout_content(self, start_line: int):
        """Validate workout content (sets and steps)."""
        i = start_line
        while i < len(self.lines):
            line = self.lines[i].strip()

            if not line:  # Skip empty lines
                i += 1
                continue

            if self._is_workout_set(line):
                self._validate_workout_set(i, line)
            elif self._is_workout_step(line):
                self._validate_workout_step(i, line)
            else:
                self.errors.append(
                    ValidationError(
                        i + 1,
                        "CONTENT_ERROR",
                        "Line must be either a workout set or workout step",
                        line,
                    )
                )
            i += 1

    def _is_workout_set(self, line: str) -> bool:
        """Check if line is a workout set."""
        # Pattern: NumberOfReps x Name or just Name (no quotes required)
        return re.match(r"^\d+x\s+\w+.*", line) or (
            not line.startswith("-")
            and not re.match(r'^\d+x\s*".*"$', line)
            and line.strip()
        )

    def _is_workout_step(self, line: str) -> bool:
        """Check if line is a workout step."""
        return line.startswith("- ")

    def _validate_workout_set(self, line_idx: int, line: str):
        """Validate a workout set line."""
        line = line.strip()
        # Check for proper format (no quotes required)
        # Should be either "NumberOfReps x Name" or just "Name"
        if line.startswith("-"):
            self.errors.append(
                ValidationError(
                    line_idx + 1,
                    "WORKOUT_SET_ERROR",
                    "Workout set should not start with '-' (that's for steps)",
                    line,
                )
            )

    def _validate_workout_step(self, line_idx: int, line: str):
        """Validate a workout step line."""
        # Remove the "- " prefix and clean up whitespace
        step_content = line[2:].strip()

        # Check for optional comment (starts with #)
        if "#" in step_content:
            parts = step_content.split("#", 1)
            step_content = parts[0].strip()
            # Comment is available but we don't need to validate it further

        # Split into duration and intensity, handling multiple spaces
        parts = [p for p in step_content.split() if p]
        if len(parts) < 2:
            self.errors.append(
                ValidationError(
                    line_idx + 1,
                    "WORKOUT_STEP_ERROR",
                    "Workout step must have format: - {Duration} {Intensity} [#{Comment}]",
                    line,
                )
            )
            return

        duration = parts[0]
        intensity = " ".join(parts[1:])  # Join remaining parts for intensity

        # Validate duration
        if not self._validate_duration(duration):
            self.errors.append(
                ValidationError(
                    line_idx + 1,
                    "DURATION_ERROR",
                    f"Invalid duration format: {duration}. Must be like: 10m, 8m30s, 400m, 2h",
                    line,
                )
            )

        # Validate intensity
        if not self._validate_intensity(intensity):
            self.errors.append(
                ValidationError(
                    line_idx + 1,
                    "INTENSITY_ERROR",
                    f"Invalid intensity format: {intensity}. See specification for valid formats",
                    line,
                )
            )

    def _validate_duration(self, duration: str) -> bool:
        """Validate duration format."""
        for pattern in self.DURATION_PATTERNS:
            if re.match(pattern, duration):
                return True
        return False

    def _validate_intensity(self, intensity: str) -> bool:
        """Validate intensity format."""
        for pattern in self.INTENSITY_PATTERNS:
            if re.match(pattern, intensity):
                return True
        return False

    def print_errors(self, errors: List[ValidationError]):
        """Print validation errors in a readable format."""
        if not errors:
            print("✅ Validation successful! Workout definition is valid.")
            return

        print(f"❌ Validation failed with {len(errors)} error(s):")
        print("-" * 60)

        for error in errors:
            print(f"Line {error.line_number}: {error.error_type}")
            print(f"  Message: {error.message}")
            if error.line_content:
                print(f"  Content: '{error.line_content}'")
            print()
