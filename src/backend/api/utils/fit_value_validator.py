"""
Utility functions for validating FIT file field values.

FIT files use specific sentinel values to indicate invalid/unset fields.
These values vary by data type and can cause issues when not properly handled.

References:
- Garmin FIT SDK: FitSDKRelease_21.171.00/py/garmin_fit_sdk/fit.py
- Base Type definitions: python_fit_tool_jnkue/fit_tool/base_type.py
"""

from typing import Optional, Union

# Invalid value constants for FIT data types
# These represent "unset" or "invalid" fields in FIT files
FIT_INVALID_UINT8 = 255
FIT_INVALID_SINT8 = 127
FIT_INVALID_UINT16 = 65535
FIT_INVALID_SINT16 = 32767
FIT_INVALID_UINT32 = 4294967295
FIT_INVALID_SINT32 = 2147483647
FIT_INVALID_UINT64 = 18446744073709551615
FIT_INVALID_SINT64 = 9223372036854775807

# Tolerance for floating point comparisons
# Used when checking scaled values (e.g., 65535 scaled to 65.535)
FLOAT_TOLERANCE = 0.001


def is_fit_value_invalid(
    value: Optional[Union[int, float]], expected_type: str = "uint16"
) -> bool:
    """
    Check if a FIT value represents an invalid/unset field.

    FIT files use maximum values for each data type as sentinels to indicate
    invalid or unset fields. When the FIT decoder applies scale factors,
    these values may become floats (e.g., 65535 → 65.535 with scale 1/1000).

    Args:
        value: The value to check (can be None, int, or float)
        expected_type: The FIT data type ("uint8", "uint16", "uint32", "sint8", etc.)

    Returns:
        True if the value is None or matches the invalid sentinel for the type

    Examples:
        >>> is_fit_value_invalid(None)
        True
        >>> is_fit_value_invalid(65.535, "uint16")  # Scaled invalid value
        True
        >>> is_fit_value_invalid(255, "uint8")
        True
        >>> is_fit_value_invalid(100, "uint8")
        False
        >>> is_fit_value_invalid(2.636, "uint16")  # Valid speed value
        False
    """
    if value is None:
        return True

    expected_type = expected_type.lower()

    # UINT8 (unsigned 8-bit): invalid = 255
    # Used for: heart rate, cadence, feel, rpe, respiration rate
    if expected_type == "uint8":
        return value == FIT_INVALID_UINT8

    # SINT8 (signed 8-bit): invalid = 127
    if expected_type == "sint8":
        return value == FIT_INVALID_SINT8

    # UINT16 (unsigned 16-bit): invalid = 65535
    # Used for: speed (scaled to 65.535), calories, some time fields
    # Check both raw (65535) and common scaled values (65.535, 6.5535, etc.)
    if expected_type == "uint16":
        if isinstance(value, int):
            return value == FIT_INVALID_UINT16
        # For floats, check common scale factors
        # Scale 1/1000: 65535 → 65.535
        if abs(value - 65.535) < FLOAT_TOLERANCE:
            return True
        # Scale 1/10: 65535 → 6553.5
        if abs(value - 6553.5) < FLOAT_TOLERANCE:
            return True
        # Scale 1/100: 65535 → 655.35
        if abs(value - 655.35) < FLOAT_TOLERANCE:
            return True
        # Raw value as float
        if abs(value - FIT_INVALID_UINT16) < FLOAT_TOLERANCE:
            return True
        return False

    # SINT16 (signed 16-bit): invalid = 32767
    if expected_type == "sint16":
        if isinstance(value, int):
            return value == FIT_INVALID_SINT16
        # Check scaled values
        if abs(value - 32.767) < FLOAT_TOLERANCE:
            return True
        if abs(value - 3276.7) < FLOAT_TOLERANCE:
            return True
        if abs(value - 327.67) < FLOAT_TOLERANCE:
            return True
        if abs(value - FIT_INVALID_SINT16) < FLOAT_TOLERANCE:
            return True
        return False

    # UINT32 (unsigned 32-bit): invalid = 4294967295
    # Used for: distance, time fields
    if expected_type == "uint32":
        if isinstance(value, int):
            return value == FIT_INVALID_UINT32
        # Check common scaled values
        # Scale 1/1000: 4294967295 → 4294967.295
        if abs(value - 4294967.295) < FLOAT_TOLERANCE:
            return True
        # Scale 1/100: 4294967295 → 42949672.95
        if abs(value - 42949672.95) < FLOAT_TOLERANCE:
            return True
        if abs(value - FIT_INVALID_UINT32) < FLOAT_TOLERANCE:
            return True
        return False

    # SINT32 (signed 32-bit): invalid = 2147483647
    if expected_type == "sint32":
        if isinstance(value, int):
            return value == FIT_INVALID_SINT32
        if abs(value - FIT_INVALID_SINT32) < FLOAT_TOLERANCE:
            return True
        return False

    # UINT64 (unsigned 64-bit): invalid = 18446744073709551615
    if expected_type == "uint64":
        return value == FIT_INVALID_UINT64

    # SINT64 (signed 64-bit): invalid = 9223372036854775807
    if expected_type == "sint64":
        return value == FIT_INVALID_SINT64

    # Unknown type - be conservative and only reject None
    return False


def get_valid_fit_value(
    primary: Optional[Union[int, float]],
    fallback: Optional[Union[int, float]] = None,
    expected_type: str = "uint16",
) -> Optional[Union[int, float]]:
    """
    Get a valid FIT value, using fallback if primary is invalid.

    This is particularly useful for FIT fields that have both standard and
    "enhanced" versions (e.g., avg_speed vs enhanced_avg_speed).

    Args:
        primary: The primary value to check
        fallback: Optional fallback value if primary is invalid
        expected_type: The FIT data type for validation

    Returns:
        The first valid value found (primary, then fallback), or None

    Examples:
        >>> get_valid_fit_value(65.535, 2.636, "uint16")
        2.636
        >>> get_valid_fit_value(255, None, "uint8")
        None
        >>> get_valid_fit_value(120, 130, "uint8")
        120
        >>> get_valid_fit_value(None, 2.636, "uint16")
        2.636
    """
    if not is_fit_value_invalid(primary, expected_type):
        return primary

    if fallback is not None and not is_fit_value_invalid(fallback, expected_type):
        return fallback

    return None


def get_valid_fit_int(
    primary: Optional[Union[int, float]],
    fallback: Optional[Union[int, float]] = None,
    expected_type: str = "uint16",
) -> Optional[int]:
    """
    Get a valid FIT value as an integer, using fallback if primary is invalid.

    Same as get_valid_fit_value() but ensures the result is an integer.

    Args:
        primary: The primary value to check
        fallback: Optional fallback value if primary is invalid
        expected_type: The FIT data type for validation

    Returns:
        The first valid value found as an int, or None

    Examples:
        >>> get_valid_fit_int(255, 120, "uint8")
        120
        >>> get_valid_fit_int(150.7, None, "uint8")
        150
    """
    value = get_valid_fit_value(primary, fallback, expected_type)
    return int(value) if value is not None else None
