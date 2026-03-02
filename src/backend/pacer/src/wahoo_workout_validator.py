#!/usr/bin/env python3
"""
Test script to validate converted Wahoo JSON files.
"""

import json
from pathlib import Path

from .wahoo_workout_validator import Workout


def validate_wahoo_files():
    """Validate all generated Wahoo JSON files."""
    output_dir = Path("wahoo_output")

    if not output_dir.exists():
        print("❌ No wahoo_output directory found!")
        print("Run 'python3 workout_converter.py --all' first")
        return False

    json_files = list(output_dir.glob("*.json"))

    if not json_files:
        print("❌ No JSON files found in wahoo_output/")
        return False

    print(f"Validating {len(json_files)} Wahoo JSON files...")
    print("=" * 60)

    success_count = 0

    for json_file in sorted(json_files):
        try:
            with open(json_file, "r") as f:
                data = json.load(f)

            # Validate using Pydantic model
            workout = Workout(**data)

            # Basic validation checks
            assert workout.header.name, "Workout name is required"
            assert workout.intervals, "Workout must have intervals"
            assert workout.header.duration_s > 0, "Duration must be positive"

            print(f"✅ {json_file.name}")
            print(f"   Name: {workout.header.name}")
            print(
                f"   Duration: {workout.header.duration_s}s ({workout.header.duration_s / 60:.1f}m)"
            )
            print(f"   Intervals: {len(workout.intervals)}")
            print(f"   Type: {workout.header.workout_type_family.name}")
            print()

            success_count += 1

        except Exception as e:
            print(f"❌ {json_file.name}: {e}")
            print()

    print("=" * 60)
    print(f"Validation complete: {success_count}/{len(json_files)} files valid")

    if success_count == len(json_files):
        print("🎉 All Wahoo JSON files are valid!")
        return True
    else:
        print(f"❌ {len(json_files) - success_count} files failed validation")
        return False


def show_conversion_summary():
    """Show a summary of the conversion process."""
    valid_dir = Path("testfiles/valid")
    output_dir = Path("wahoo_output")

    if not valid_dir.exists() or not output_dir.exists():
        print("❌ Required directories not found")
        return

    txt_files = list(valid_dir.glob("*.txt"))
    json_files = list(output_dir.glob("*.json"))

    print("CONVERSION SUMMARY")
    print("=" * 60)
    print(f"Input files (text): {len(txt_files)}")
    print(f"Output files (JSON): {len(json_files)}")
    print(
        f"Conversion rate: {len(json_files)}/{len(txt_files)} ({len(json_files) / len(txt_files) * 100:.1f}%)"
    )

    print("\nFile mapping:")
    for txt_file in sorted(txt_files):
        json_file = output_dir / f"{txt_file.stem}.json"
        status = "✅" if json_file.exists() else "❌"
        print(
            f"  {status} {txt_file.name} → {json_file.name if json_file.exists() else 'MISSING'}"
        )


def main():
    """Main function."""
    print("WAHOO JSON VALIDATION TOOL")
    print("=" * 60)

    show_conversion_summary()
    print("\n")

    success = validate_wahoo_files()

    return success


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
    exit(0 if success else 1)
