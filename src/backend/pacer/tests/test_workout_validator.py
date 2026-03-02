#!/usr/bin/env python3
"""
Automated test runner for workout validator.
Tests all files in testfiles/valid (should be valid) and testfiles/invalid (should be invalid).
"""

import os
import sys
from pathlib import Path

# Now we can import from the src package
from txt_workout_validator import WorkoutValidator

# Add parent directory to path to find the src package
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))


class TestResults:
    """Track test results and statistics."""

    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.failures = []

    def add_pass(self, test_name):
        self.total_tests += 1
        self.passed_tests += 1
        print(f"✅ PASS - {test_name}")

    def add_fail(self, test_name, expected, actual, errors=None):
        self.total_tests += 1
        self.failed_tests += 1
        print(f"❌ FAIL - {test_name}")
        print(f"   Expected: {expected}, Got: {actual}")
        if errors:
            for error in errors[:2]:  # Show first 2 errors
                print(f"   - {error.error_type}: {error.message}")

        self.failures.append(
            {
                "name": test_name,
                "expected": expected,
                "actual": actual,
                "errors": errors,
            }
        )

    def print_summary(self):
        print(f"\n{'=' * 60}")
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.failed_tests}")

        if self.total_tests > 0:
            success_rate = (self.passed_tests / self.total_tests) * 100
            print(f"Success Rate: {success_rate:.1f}%")

        if self.failed_tests == 0:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"\n❌ {self.failed_tests} test(s) failed:")
            for failure in self.failures:
                print(
                    f"  - {failure['name']}: expected {failure['expected']}, got {failure['actual']}"
                )
            return False


def test_valid_files(validator, results):
    """Test all files in testfiles/valid directory - should all be valid."""
    print("\n" + "=" * 60)
    print("TESTING VALID FILES")
    print("=" * 60)

    # Use the correct path relative to this test file
    test_dir = Path(__file__).parent
    valid_dir = test_dir / "testfiles" / "valid"

    if not valid_dir.exists():
        print(f"❌ Directory {valid_dir} not found!")
        return

    valid_files = list(valid_dir.glob("*.txt"))
    if not valid_files:
        print(f"❌ No .txt files found in {valid_dir}")
        return

    print(f"Found {len(valid_files)} files in {valid_dir}")
    print()

    for file_path in sorted(valid_files):
        file_name = file_path.name
        is_valid, errors = validator.validate_file(str(file_path))

        if is_valid:
            results.add_pass(f"VALID/{file_name}")
        else:
            results.add_fail(f"VALID/{file_name}", "VALID", "INVALID", errors)


def test_invalid_files(validator, results):
    """Test all files in testfiles/invalid directory - should all be invalid."""
    print("\n" + "=" * 60)
    print("TESTING INVALID FILES")
    print("=" * 60)

    # Use the correct path relative to this test file
    test_dir = Path(__file__).parent
    invalid_dir = test_dir / "testfiles" / "invalid"

    if not invalid_dir.exists():
        print(f"❌ Directory {invalid_dir} not found!")
        return

    invalid_files = list(invalid_dir.glob("*.txt"))
    if not invalid_files:
        print(f"❌ No .txt files found in {invalid_dir}")
        return

    print(f"Found {len(invalid_files)} files in {invalid_dir}")
    print()

    for file_path in sorted(invalid_files):
        file_name = file_path.name
        is_valid, errors = validator.validate_file(str(file_path))

        if not is_valid:
            results.add_pass(f"INVALID/{file_name}")
        else:
            results.add_fail(f"INVALID/{file_name}", "INVALID", "VALID")


def show_file_contents(file_path, max_lines=10):
    """Show first few lines of a file for debugging."""
    try:
        with open(file_path, "r") as f:
            lines = f.readlines()

        print(f"Content of {file_path}:")
        for i, line in enumerate(lines[:max_lines], 1):
            print(f"  {i}: {line.rstrip()}")

        if len(lines) > max_lines:
            print(f"  ... ({len(lines) - max_lines} more lines)")
        print()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")


def list_test_files():
    """List all available test files."""
    print("TEST FILE INVENTORY")
    print("=" * 60)

    # Use the correct path relative to this test file
    test_dir = Path(__file__).parent
    valid_dir = test_dir / "testfiles" / "valid"
    invalid_dir = test_dir / "testfiles" / "invalid"

    if valid_dir.exists():
        valid_files = list(valid_dir.glob("*.txt"))
        print(f"Valid test files ({len(valid_files)}):")
        for file_path in sorted(valid_files):
            file_size = file_path.stat().st_size
            print(f"  ✅ {file_path.name} ({file_size} bytes)")
    else:
        print("❌ testfiles/valid directory not found")

    print()

    if invalid_dir.exists():
        invalid_files = list(invalid_dir.glob("*.txt"))
        print(f"Invalid test files ({len(invalid_files)}):")
        for file_path in sorted(invalid_files):
            file_size = file_path.stat().st_size
            print(f"  ❌ {file_path.name} ({file_size} bytes)")
    else:
        print("❌ testfiles/invalid directory not found")


def debug_mode():
    """Interactive debug mode to examine specific files."""
    validator = WorkoutValidator()

    while True:
        print("\n" + "=" * 60)
        print("DEBUG MODE")
        print("=" * 60)
        print("Commands:")
        print("  list - Show all test files")
        print("  test <file> - Test a specific file")
        print("  show <file> - Show file contents")
        print("  quit - Exit debug mode")

        cmd = input("\nEnter command: ").strip().split()

        if not cmd:
            continue

        if cmd[0] == "quit":
            break
        elif cmd[0] == "list":
            list_test_files()
        elif cmd[0] == "test" and len(cmd) > 1:
            file_path = cmd[1]
            if not os.path.exists(file_path):
                # Try in testfiles directories
                test_dir = Path(__file__).parent
                for base_dir in ["testfiles/valid", "testfiles/invalid"]:
                    potential_path = test_dir / base_dir / file_path
                    if potential_path.exists():
                        file_path = str(potential_path)
                        break

            if os.path.exists(file_path):
                print(f"\nTesting {file_path}...")
                is_valid, errors = validator.validate_file(file_path)

                print(f"Result: {'✅ VALID' if is_valid else '❌ INVALID'}")
                if errors:
                    print("Errors:")
                    for error in errors:
                        print(f"  Line {error.line_number}: {error.error_type}")
                        print(f"    {error.message}")
                        if error.line_content:
                            print(f"    Content: '{error.line_content}'")
            else:
                print(f"File not found: {file_path}")

        elif cmd[0] == "show" and len(cmd) > 1:
            file_path = cmd[1]
            if not os.path.exists(file_path):
                # Try in testfiles directories
                test_dir = Path(__file__).parent
                for base_dir in ["testfiles/valid", "testfiles/invalid"]:
                    potential_path = test_dir / base_dir / file_path
                    if potential_path.exists():
                        file_path = str(potential_path)
                        break

            if os.path.exists(file_path):
                show_file_contents(file_path)
            else:
                print(f"File not found: {file_path}")
        else:
            print("Unknown command or missing arguments")


def main():
    """Main test runner."""
    print("WORKOUT VALIDATOR AUTOMATED TEST RUNNER")
    print("=" * 60)

    # Check if we're in the right directory
    if not Path("src/txt_workout_validator.py").exists():
        print("❌ txt_workout_validator.py not found!")
        print(
            "Please run this script from the pacer directory containing src/txt_workout_validator.py"
        )
        return False

    # Handle command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--debug":
            debug_mode()
            return True
        elif sys.argv[1] == "--list":
            list_test_files()
            return True
        elif sys.argv[1] == "--help":
            print("Usage:")
            print("  python3 test_runner.py          # Run all tests")
            print("  python3 test_runner.py --debug  # Interactive debug mode")
            print("  python3 test_runner.py --list   # List all test files")
            print("  python3 test_runner.py --help   # Show this help")
            return True

    # Initialize validator and results
    validator = WorkoutValidator()
    results = TestResults()

    # Show file inventory
    list_test_files()

    # Run tests
    test_valid_files(validator, results)
    test_invalid_files(validator, results)

    # Show summary
    success = results.print_summary()

    if not success:
        print(f"\nTo debug failures, run: python3 {sys.argv[0]} --debug")

    return success


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        sys.exit(1)
