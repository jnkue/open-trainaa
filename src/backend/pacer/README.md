# Pacer - Workout Validator and Processor

This package provides functionality for validating and processing text-based workout definitions.

## Features

- **Workout Validator**: Validates workout text files against the defined workout format specification
- **Text Workout Converter**: Converts between different workout formats
- **Wahoo Workout Integration**: Support for Wahoo workout definitions

## Components

- `txt_workout_validator.py`: Core validation logic for text-based workout files
- `txt_workout_definition.py`: Workout definition constants and schemas
- `txt_workout_converter.py`: Conversion utilities
- `wahoo_workout_validator.py`: Wahoo-specific validation
- `wahoo_workout_definition.py`: Wahoo workout schemas

## Testing

Run the comprehensive test suite:

```bash
python tests/test_workout_validator.py
```

Available test commands:

- `python tests/test_workout_validator.py` - Run all tests
- `python tests/test_workout_validator.py --debug` - Interactive debug mode
- `python tests/test_workout_validator.py --list` - List all test files
- `python tests/test_workout_validator.py --help` - Show help

## Test Structure

- `tests/testfiles/valid/` - Contains workout files that should pass validation
- `tests/testfiles/invalid/` - Contains workout files that should fail validation

The test suite validates all files in these directories automatically.
