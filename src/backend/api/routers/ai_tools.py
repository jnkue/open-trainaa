# DEPRECATED: This entire module is deprecated and will be deleted.
# Max HR and FTP calculations have moved to the analytics module
# (see api/analytics/hr_curve.py and api/analytics/cp_model.py).
# The /ai-tools/calculate-attribute endpoint is no longer called from the frontend.

from api.auth import User, get_current_user
from api.log import LOGGER
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from ..database import supabase

router = APIRouter(prefix="/ai-tools", tags=["ai-tools"])
security_bearer = HTTPBearer()


class CalculationRequest(BaseModel):
    user_id: str
    field_type: str  # "max_heart_rate", "functional_threshold_power", "threshold_heart_rate", or "run_threshold_pace"


class CalculationResponse(BaseModel):
    field_type: str
    calculated_value: float | None
    message: str | None = None


def calculate_max_average(data: list[float], window_size: int) -> int:
    """Calculate the maximum average over a sliding window.

    Deprecated: Use api.analytics.power_curve.calculate_max_average_np instead.
    """

    if not data or len(data) < window_size:
        return 0

    max_avg = 0
    for i in range(len(data) - window_size + 1):
        window = data[i : i + window_size]
        avg = sum(window) / window_size
        max_avg = max(max_avg, avg)

    max_avg = round(max_avg, 0)
    return int(max_avg)


def save_max_watts(session_id: str) -> bool:
    """Deprecated: Use api.analytics.power_curve.extract_power_curve instead."""
    try:
        response = (
            supabase.table("records")
            .select("power")
            .eq("session_id", session_id)
            .execute()
        )
        power_data = response.data[0]["power"] if response.data else []
        max_5 = calculate_max_average(power_data, 5 * 60)  # 5 seconds
        max_20 = calculate_max_average(power_data, 20 * 60)  # 20 minutes window
        max_60 = calculate_max_average(power_data, 60 * 60)  # 60 minutes window

        LOGGER.info(
            f"Calculated max watts for session {session_id}: 5-min {max_5}, 20-min {max_20}, 60-min {max_60}"
        )

        supabase.table("sessions").update(
            {
                "max_watts_5_min": max_5,
                "max_watts_20_min": max_20,
                "max_watts_60_min": max_60,
            }
        ).eq("id", session_id).execute()

        return True
    except Exception as e:
        LOGGER.error(f"Error saving max watts for session {session_id}: {e}")
        return False


def max_heart_rate_user(user_id: str) -> int | None:
    """
    Deprecated: Use api.analytics.hr_curve.detect_max_hr instead.

    Update or create user's max heart rate based on session data.

    This function:
    1. Queries the top 2 highest max_heart_rate values from the user's sessions
    2. Validates heart rate is within realistic bounds (130-220 bpm)
    3. Falls back to second highest value if first is unrealistic
    4. Creates or updates the user_infos record with the validated max heart rate
    5. Automatically calculates threshold_heart_rate (85% of max HR)

    Args:
        user_id: The unique identifier of the user

    Returns:
        int: The user's max heart rate (either from database or calculated)

    Raises:
        Exception: If database operations fail

    Note:
        - Heart rates below 130 or above 220 are considered unrealistic
        - If first value is unrealistic, attempts to use second highest
        - Only updates user_infos if new max HR is higher than existing value
        - Strict validation range for updates: 130-225 bpm
        - Returns existing value if automatic calculation is disabled or update not needed
    """
    # Physiological constants for validation
    MIN_REALISTIC_HR = 130
    MAX_REALISTIC_HR = 220
    STRICT_MAX_HR = 225
    DEFAULT_LOW_HR = 160
    THRESHOLD_HR_PERCENTAGE = 0.85

    # TODOBACKLOG optimize

    LOGGER.info(f"Calculating max heart rate for user {user_id}")

    # Fetch existing user_infos record and check automatic calculation mode
    user_info_response = (
        supabase.table("user_infos")
        .select("max_heart_rate, threshold_heart_rate, automatic_calculation_mode")
        .eq("user_id", user_id)
        .execute()
    )

    # Check if user has disabled automatic calculation
    if user_info_response.data and len(user_info_response.data) > 0:
        automatic_mode = user_info_response.data[0].get("automatic_calculation_mode")
        existing_max_hr = user_info_response.data[0].get("max_heart_rate")
        if automatic_mode is False:
            LOGGER.info(
                f"ℹ️ User {user_id} has disabled automatic max heart rate calculation. Returning existing value."
            )
            # Return existing value or None if none exists
            return existing_max_hr if existing_max_hr is not None else None

    try:
        # Fetch the top 2 highest max heart rates from user's sessions
        # This allows fallback to second value if first is unrealistic
        # Use duplicate-filtered view to avoid counting same workout multiple times
        session_data = (
            supabase.table("sessions_no_duplicates")
            .select("max_heart_rate")
            .eq("user_id", user_id)
            .not_.is_("max_heart_rate", "null")
            .order("max_heart_rate", desc=True)
            .limit(2)
            .execute()
        )

        max_heart_rate = None

        # Extract and validate max heart rate from session data
        if session_data.data and len(session_data.data) > 0:
            # Check first (highest) value
            first_max_hr = session_data.data[0].get("max_heart_rate")

            if first_max_hr is not None:
                # Validate first value is within realistic bounds
                if MIN_REALISTIC_HR <= first_max_hr <= MAX_REALISTIC_HR:
                    max_heart_rate = first_max_hr
                else:
                    LOGGER.warning(
                        f"⚠️ First max heart rate for user {user_id} is unrealistic: {first_max_hr} bpm. "
                        f"Checking second highest value..."
                    )

                    # Try second highest value if available
                    if len(session_data.data) > 1:
                        second_max_hr = session_data.data[1].get("max_heart_rate")

                        if second_max_hr is not None:
                            if MIN_REALISTIC_HR <= second_max_hr <= MAX_REALISTIC_HR:
                                max_heart_rate = second_max_hr
                                LOGGER.info(
                                    f"✓ Using second highest max heart rate for user {user_id}: {second_max_hr} bpm"
                                )
                            else:
                                LOGGER.warning(
                                    f"⚠️ Second max heart rate for user {user_id} is also unrealistic: {second_max_hr} bpm. "
                                    f"No valid data available."
                                )
                                # Use None if data is unrealistic in either direction
                                max_heart_rate = (
                                    DEFAULT_LOW_HR
                                    if first_max_hr < MIN_REALISTIC_HR
                                    else None
                                )
                        else:
                            # Second value is None, use None or low default
                            max_heart_rate = (
                                DEFAULT_LOW_HR
                                if first_max_hr < MIN_REALISTIC_HR
                                else None
                            )
                    else:
                        # No second value available, use None or low default
                        max_heart_rate = (
                            DEFAULT_LOW_HR if first_max_hr < MIN_REALISTIC_HR else None
                        )
                        LOGGER.warning(
                            f"⚠️ Only one session found with unrealistic HR for user {user_id}. "
                            f"Using default: {max_heart_rate} bpm"
                        )

        if max_heart_rate is None:
            LOGGER.info(
                f"ℹ️ No valid max heart rate data available for user {user_id}. "
                f"Returning existing value or None."
            )
            # Return existing value from database or None
            if user_info_response.data and len(user_info_response.data) > 0:
                existing_max_hr = user_info_response.data[0].get("max_heart_rate")
                if existing_max_hr is not None:
                    return existing_max_hr
            return None

        # Handle case where user_infos record does not exist
        if not user_info_response.data or len(user_info_response.data) == 0:
            threshold_hr = int(max_heart_rate * THRESHOLD_HR_PERCENTAGE)

            result = (
                supabase.table("user_infos")
                .insert(
                    {
                        "user_id": user_id,
                        "max_heart_rate": max_heart_rate,
                        "threshold_heart_rate": threshold_hr,
                    }
                )
                .execute()
            )
            LOGGER.info(
                f"✨ Created user_infos for user {user_id} with max HR: {max_heart_rate} bpm, "
                f"threshold HR: {threshold_hr} bpm"
            )

            LOGGER.debug(f"Insert result: {result}")
            return max_heart_rate
        else:
            # User_infos record exists, check if we should update it
            max_heart_rate_database = user_info_response.data[0].get("max_heart_rate")

            LOGGER.debug(
                f"User {user_id} - Max HR from sessions: {max_heart_rate}, "
                f"Max HR in database: {max_heart_rate_database}"
            )

            # Update only if:
            # 1. Either no existing value OR new value is higher
            # 2. New value is within strict validation bounds
            should_update = (
                max_heart_rate_database is None
                or max_heart_rate > max_heart_rate_database
            )

            if should_update:
                # Apply stricter validation for updates
                if max_heart_rate > STRICT_MAX_HR or max_heart_rate < MIN_REALISTIC_HR:
                    LOGGER.warning(
                        f"❌ Rejecting unrealistic max heart rate update for user {user_id}: "
                        f"{max_heart_rate} bpm (valid range: {MIN_REALISTIC_HR}-{STRICT_MAX_HR})"
                    )
                    # Return existing value or None
                    return (
                        max_heart_rate_database
                        if max_heart_rate_database is not None
                        else None
                    )
                else:
                    threshold_hr = int(max_heart_rate * THRESHOLD_HR_PERCENTAGE)

                    result = (
                        supabase.table("user_infos")
                        .update(
                            {
                                "max_heart_rate": max_heart_rate,
                                "threshold_heart_rate": threshold_hr,
                            }
                        )
                        .eq("user_id", user_id)
                        .execute()
                    )
                    LOGGER.info(
                        f"✨ Updated user_infos for user {user_id}: "
                        f"max HR {max_heart_rate_database} → {max_heart_rate} bpm, "
                        f"threshold HR → {threshold_hr} bpm"
                    )
                    LOGGER.debug(f"Update result: {result}")
                    return max_heart_rate
            else:
                LOGGER.debug(
                    f"ℹ️ No update needed for user {user_id}. "
                    f"New max HR ({max_heart_rate}) not higher than existing ({max_heart_rate_database})"
                )
                return (
                    max_heart_rate_database
                    if max_heart_rate_database is not None
                    else max_heart_rate
                )

    except Exception as e:
        LOGGER.error(
            f"❌ Error updating max heart rate for user {user_id}: {str(e)}",
            exc_info=True,
        )
        raise


def calculate_ftp(user_id: str) -> int:
    """
    Deprecated: Use api.analytics.cp_model.fit_cp_model instead.

    Calculate Functional Threshold Power (FTP) for a user based on recent activities.

    This function:
    1. Fetches recent cycling activities with power data
    2. Analyzes power data to estimate FTP
    3. Updates the user_infos record with the calculated FTP

    Args:
        user_id: The unique identifier of the user
    """
    # Use duplicate-filtered view to avoid counting same workout multiple times
    highest_5min_watts = (
        supabase.table("sessions_no_duplicates")
        .select("max_watts_5_min")
        .eq("user_id", user_id)
        .not_.is_("max_watts_5_min", "null")
        .order("max_watts_5_min", desc=True)
        .limit(5)
        .execute()
    )

    highest_20min_watts = (
        supabase.table("sessions_no_duplicates")
        .select("max_watts_20_min")
        .eq("user_id", user_id)
        .not_.is_("max_watts_20_min", "null")
        .order("max_watts_20_min", desc=True)
        .limit(5)
        .execute()
    )
    highest_60min_watts = (
        supabase.table("sessions_no_duplicates")
        .select("max_watts_60_min")
        .eq("user_id", user_id)
        .not_.is_("max_watts_60_min", "null")
        .order("max_watts_60_min", desc=True)
        .limit(5)
        .execute()
    )
    potential_ftps = []
    for record in highest_5min_watts.data:
        if record["max_watts_5_min"] and record["max_watts_5_min"] > 0:
            potential_ftps.append(int(record["max_watts_5_min"] * 0.95))
    for record in highest_20min_watts.data:
        if record["max_watts_20_min"] and record["max_watts_20_min"] > 0:
            potential_ftps.append(int(record["max_watts_20_min"] * 0.99))
    for record in highest_60min_watts.data:
        if record["max_watts_60_min"] and record["max_watts_60_min"] > 0:
            potential_ftps.append(int(record["max_watts_60_min"] * 1.03))
    if not potential_ftps:
        LOGGER.info(f"No power data available to calculate FTP for user {user_id}")
        return 0
    calculate_ftp = max(potential_ftps)
    try:
        result = (
            supabase.table("user_infos")
            .update({"functional_threshold_power": calculate_ftp})
            .eq("user_id", user_id)
            .execute()
        )

        LOGGER.info(
            f"✨ Updated FTP for user {user_id} to {result.data[0]['functional_threshold_power']} watts based on recent activities"
        )
        return calculate_ftp
    except Exception as e:
        LOGGER.error(
            f"❌ Error updating FTP for user {user_id}: {str(e)}", exc_info=True
        )
        return 0


@router.post("/calculate-attribute", response_model=CalculationResponse)
async def calculate_user_attribute(
    request: CalculationRequest,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Deprecated: No longer called from the frontend. Will be deleted.

    Calculate user attribute using AI/ML models.
    Fetches user data automatically and returns calculated value.
    """
    try:
        LOGGER.info(f"Calculating {request.field_type} for user {request.user_id}")

        if request.field_type == "max_heart_rate":
            result = max_heart_rate_user(current_user.id)
        elif request.field_type == "functional_threshold_power":
            result = calculate_ftp(current_user.id)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported field type: {request.field_type}"
            )

        # Handle case where calculation is not possible
        if result is None or result == 0:
            LOGGER.warning(
                f"No calculation possible for {request.field_type} for user {current_user.id}"
            )
            return CalculationResponse(
                field_type=request.field_type,
                calculated_value=None,
                message="No calculation possible - insufficient data available",
            )

        return CalculationResponse(
            field_type=request.field_type, calculated_value=float(result), message=None
        )

    except Exception as e:
        LOGGER.error(f"Error calculating {request.field_type}: {str(e)}")
        raise HTTPException(status_code=500, detail="Calculation failed")
