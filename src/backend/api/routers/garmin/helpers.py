"""
Garmin Connect API helper functions and utilities.
"""

import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from api.database import supabase
from api.log import LOGGER

# Garmin API endpoints
GARMIN_API_BASE_URL = "https://apis.garmin.com"
GARMIN_TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token"
GARMIN_AUTH_URL = "https://connect.garmin.com/oauth2Confirm"


def generate_pkce_challenge() -> tuple[str, str]:
    """
    Generate PKCE code verifier and code challenge for OAuth2 PKCE flow.

    Returns:
        tuple: (code_verifier, code_challenge)
            code_verifier: Random 43-128 character string
            code_challenge: Base64-URL-encoded SHA256 hash of code_verifier
    """
    # Generate random code_verifier (43-128 chars, we use 128 for maximum entropy)
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(96)).decode("utf-8")
    code_verifier = code_verifier.rstrip("=")  # Remove padding

    # Generate code_challenge as SHA256 hash of code_verifier
    challenge_bytes = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode("utf-8")
    code_challenge = code_challenge.rstrip("=")  # Remove padding

    return code_verifier, code_challenge


def is_garmin_enabled(user_id: str) -> bool:
    """
    Check if Garmin sync is enabled for user.

    This function only checks if the user has Garmin connected and upload enabled.
    It does NOT refresh tokens - use get_valid_access_token() when you need a token.

    Returns:
        True if Garmin is connected and upload_workouts_enabled is True
    """
    try:
        result = (
            supabase.table("garmin_tokens")
            .select("upload_workouts_enabled")
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return False

        return result.data[0].get("upload_workouts_enabled", False)

    except Exception as e:
        LOGGER.error(f"Error checking Garmin status for user {user_id}: {e}")
        return False


def fetch_garmin_permissions(access_token: str) -> Optional[list[str]]:
    """
    Fetch user permissions from Garmin Wellness API.

    Calls GET https://apis.garmin.com/wellness-api/rest/user/permissions
    to retrieve the list of permissions the user has granted.

    Example response: ["ACTIVITY_EXPORT", "WORKOUT_IMPORT", "HEALTH_EXPORT", "COURSE_IMPORT", "MCT_EXPORT"]

    Args:
        access_token: Valid Garmin access token

    Returns:
        List of permission strings, or None on failure
    """
    try:
        LOGGER.info("Fetching Garmin user permissions")

        result = make_garmin_api_request(
            access_token, "wellness-api/rest/user/permissions", method="GET"
        )

        if result is None:
            LOGGER.error(
                "Failed to fetch Garmin permissions: API request returned None"
            )
            return None

        # The response should be a JSON array of permission strings
        # Handle both direct array and wrapped response
        if isinstance(result, list):
            permissions = result
        elif isinstance(result, dict) and "permissions" in result:
            permissions = result["permissions"]
        else:
            LOGGER.error(f"Unexpected Garmin permissions response format: {result}")
            return None

        LOGGER.info(f"Successfully fetched Garmin permissions: {permissions}")
        return permissions

    except Exception as e:
        LOGGER.error(f"Error fetching Garmin permissions: {e}")
        return None


def get_valid_access_token(user_id: str) -> Optional[str]:
    """
    Get a valid Garmin access token for immediate API usage.

    This function checks token expiry and refreshes if needed.
    ONLY call this function when you're about to make an API request.

    Garmin tokens expire after ~24 hours, but we use a 600 second (10 minute)
    buffer to be safe.

    Returns:
        Valid access token string, or None if unavailable
    """
    try:
        result = (
            supabase.table("garmin_tokens").select("*").eq("user_id", user_id).execute()
        )

        if not result.data:
            LOGGER.warning(f"No Garmin token found for user {user_id}")
            return None

        token_data = result.data[0]
        expires_at = datetime.fromisoformat(token_data["expires_at"])

        # Check if token is expired or will expire in next 10 minutes
        # Using 10 minute buffer for Garmin's longer-lived tokens
        if expires_at <= datetime.now(timezone.utc) + timedelta(seconds=600):
            LOGGER.info(f"Refreshing expired Garmin token for user {user_id}")
            refreshed_data = refresh_garmin_token(user_id, token_data["refresh_token"])
            if refreshed_data:
                return refreshed_data["access_token"]
            return None

        return token_data["access_token"]

    except Exception as e:
        LOGGER.error(f"Error getting valid Garmin access token for user {user_id}: {e}")
        return None


def refresh_garmin_token(user_id: str, refresh_token: str) -> Optional[dict]:
    """Refresh Garmin access token."""
    try:
        client_id = os.getenv("GARMIN_CLIENT_ID")
        client_secret = os.getenv("GARMIN_CLIENT_SECRET")

        if not client_id or not client_secret:
            LOGGER.error("Garmin credentials not configured")
            return None

        response = requests.post(
            GARMIN_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )

        if response.status_code != 200:
            LOGGER.error(f"Failed to refresh Garmin token: {response.text}")
            return None

        token_response = response.json()

        # Garmin returns expires_in (seconds from now)
        expires_in = token_response.get("expires_in", 86400)  # Default 24 hours
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Update token in database
        updated_token = {
            "access_token": token_response["access_token"],
            "refresh_token": token_response.get("refresh_token", refresh_token),
            "expires_at": expires_at.isoformat(),
        }

        supabase.table("garmin_tokens").update(updated_token).eq(
            "user_id", user_id
        ).execute()

        LOGGER.info(f"Successfully refreshed Garmin token for user {user_id}")

        # Return full token data
        result = (
            supabase.table("garmin_tokens").select("*").eq("user_id", user_id).execute()
        )
        return result.data[0] if result.data else None

    except Exception as e:
        LOGGER.error(f"Error refreshing Garmin token: {e}")
        return None


def make_garmin_api_request(
    access_token: str,
    endpoint: str,
    method: str = "GET",
    data: dict = None,
    headers: dict = None,
) -> Optional[dict]:
    """
    Make authenticated request to Garmin API.

    Args:
        access_token: Valid Garmin access token
        endpoint: API endpoint path (e.g., "wellness-api/rest/activities")
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Optional JSON data for POST/PUT requests
        headers: Optional additional headers

    Returns:
        Response JSON dict, or None on failure
    """
    try:
        url = f"{GARMIN_API_BASE_URL}/{endpoint.lstrip('/')}"

        request_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        # Merge additional headers if provided
        if headers:
            request_headers.update(headers)

        if method == "GET":
            response = requests.get(url, headers=request_headers)
        elif method == "POST":
            response = requests.post(url, headers=request_headers, json=data)
        elif method == "PUT":
            response = requests.put(url, headers=request_headers, json=data)
        elif method == "DELETE":
            response = requests.delete(url, headers=request_headers)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")

        if response.status_code not in [200, 201, 202, 204]:
            LOGGER.error(
                f"Garmin API request failed: {response.status_code} - {response.text}"
            )
            return None

        # Handle 204 No Content responses
        if response.status_code == 204:
            return {"success": True}

        # Handle 202 Accepted responses (async operations like backfill)
        if response.status_code == 202:
            return {"success": True, "accepted": True}

        return response.json()

    except Exception as e:
        LOGGER.error(f"Error making Garmin API request: {e}")
        return None


def trigger_activity_backfill(access_token: str, days: int = 21) -> bool:
    """
    Trigger backfill of historical activity data from Garmin.

    This initiates an asynchronous backfill request to Garmin's Activity API.
    Activities will be delivered later via Push/Ping notifications once
    the backfill process completes.

    According to Garmin API documentation (Section 8: Summary Backfill):
    - Maximum range: 30 days per request
    - Returns HTTP 202 (Accepted) immediately
    - Actual data arrives later via configured Push/Ping endpoints

    Args:
        access_token: Valid Garmin access token
        days: Number of days to backfill (default: 21, max: 30)

    Returns:
        True if backfill request was accepted, False otherwise
    """
    try:
        if days > 30:
            LOGGER.warning(f"Backfill days {days} exceeds max of 30, limiting to 30")
            days = 30

        # Calculate date range (last N days)
        end_time = datetime.now(timezone.utc) + timedelta(days=1)
        start_time = end_time - timedelta(days=days)

        # Convert to Unix timestamps (seconds)
        summary_start = int(start_time.timestamp())
        summary_end = int(end_time.timestamp())

        LOGGER.info(
            f"Triggering Garmin activity backfill for {days} days "
            f"({start_time.isoformat()} to {end_time.isoformat()})"
        )

        # Make backfill request
        # Endpoint: GET /wellness-api/rest/backfill/activities
        endpoint = (
            f"wellness-api/rest/backfill/activities?"
            f"summaryStartTimeInSeconds={summary_start}&"
            f"summaryEndTimeInSeconds={summary_end}"
        )

        result = make_garmin_api_request(access_token, endpoint, method="GET")

        if result and result.get("accepted"):
            LOGGER.info(
                f"Garmin activity backfill request accepted for {days} days. "
                f"Activities will arrive via Push/Ping notifications."
            )
            return True
        else:
            LOGGER.error("Garmin activity backfill request failed or was not accepted")
            return False

    except Exception as e:
        LOGGER.error(f"Error triggering Garmin activity backfill: {e}")
        return False


# Workout Management Functions
# These will be implemented in Phase 3 for workout upload


def create_garmin_workout(
    access_token: str,
    workout_data: dict,
    workout_name: str = "Workout",
) -> Optional[dict]:
    """
    Create a workout in Garmin using Training API V2.

    Args:
        access_token: Valid Garmin access token
        workout_data: Garmin workout JSON structure (Training API V2 format)
        workout_name: Name for the workout

    Returns:
        dict with 'workoutId' of created workout, or None on failure
    """
    try:
        import json

        LOGGER.info(f"Creating Garmin workout: {workout_name}")
        LOGGER.debug(f"Request payload: {json.dumps(workout_data, indent=2)}")

        # Validate payload before sending
        if not workout_data.get("segments"):
            LOGGER.error(f"Workout '{workout_name}': Missing segments in payload!")
        else:
            for i, segment in enumerate(workout_data["segments"]):
                steps = segment.get("steps", [])
                LOGGER.debug(f"  Segment {i + 1}: {len(steps)} steps")
                if not steps:
                    LOGGER.error(
                        f"  Segment {i + 1}: EMPTY STEPS ARRAY - Garmin will reject this!"
                    )

        # Training API V2 endpoint - CREATE uses workoutportal, not training-api
        result = make_garmin_api_request(
            access_token,
            "workoutportal/workout/v2",
            method="POST",
            data=workout_data,
        )

        if result and "workoutId" in result:
            LOGGER.info(f"Successfully created Garmin workout: {result['workoutId']}")
            return result
        return None
    except Exception as e:
        LOGGER.error(f"Error creating Garmin workout: {e}")
        return None


def update_garmin_workout(
    access_token: str, workout_id: str, workout_data: dict
) -> Optional[dict]:
    """
    Update an existing workout in Garmin.

    Args:
        access_token: Valid Garmin access token
        workout_id: Garmin workout ID
        workout_data: Updated workout JSON structure

    Returns:
        dict with updated workout data, or None on failure
    """
    try:
        import json

        LOGGER.info(f"Updating Garmin workout: {workout_id}")
        LOGGER.debug(f"Update payload: {json.dumps(workout_data, indent=2)}")

        # Validate payload before sending
        if not workout_data.get("segments"):
            LOGGER.error(f"Workout {workout_id}: Missing segments in update payload!")
        else:
            for i, segment in enumerate(workout_data["segments"]):
                steps = segment.get("steps", [])
                LOGGER.debug(f"  Segment {i + 1}: {len(steps)} steps")
                if not steps:
                    LOGGER.error(
                        f"  Segment {i + 1}: EMPTY STEPS ARRAY - Garmin will reject this!"
                    )

        result = make_garmin_api_request(
            access_token,
            f"training-api/workout/{workout_id}",
            method="PUT",
            data=workout_data,
        )
        if result:
            LOGGER.info(f"Successfully updated Garmin workout: {workout_id}")
            return result
        return None
    except Exception as e:
        LOGGER.error(f"Error updating Garmin workout {workout_id}: {e}")
        return None


def delete_garmin_workout(access_token: str, workout_id: str) -> bool:
    """
    Delete a workout from Garmin.

    Args:
        access_token: Valid Garmin access token
        workout_id: Garmin workout ID

    Returns:
        True if deletion succeeded, False otherwise
    """
    try:
        result = make_garmin_api_request(
            access_token, f"training-api/workout/{workout_id}", method="DELETE"
        )
        if result:
            LOGGER.info(f"Successfully deleted Garmin workout: {workout_id}")
            return True
        return False
    except Exception as e:
        LOGGER.error(f"Error deleting Garmin workout {workout_id}: {e}")
        return False


def get_garmin_workout(access_token: str, workout_id: str) -> Optional[dict]:
    """
    Get a workout from Garmin.

    Args:
        access_token: Valid Garmin access token
        workout_id: Garmin workout ID

    Returns:
        dict with workout data, or None on failure
    """
    try:
        result = make_garmin_api_request(
            access_token, f"training-api/workout/{workout_id}"
        )
        return result
    except Exception as e:
        LOGGER.error(f"Error getting Garmin workout {workout_id}: {e}")
        return None


def schedule_garmin_workout(
    access_token: str,
    workout_id: str,
    scheduled_date: str,
) -> Optional[dict]:
    """
    Schedule a workout in Garmin calendar.

    Args:
        access_token: Valid Garmin access token
        workout_id: Garmin workout ID
        scheduled_date: Date in ISO format (YYYY-MM-DD)

    Returns:
        dict with schedule data, or None on failure
    """
    try:
        schedule_data = {
            "workoutId": workout_id,
            "date": scheduled_date,
        }

        result = make_garmin_api_request(
            access_token,
            "training-api/schedule",
            method="POST",
            data=schedule_data,
        )

        if result:
            LOGGER.info(
                f"Successfully scheduled Garmin workout {workout_id} for {scheduled_date}"
            )
            return result
        return None
    except Exception as e:
        LOGGER.error(f"Error scheduling Garmin workout {workout_id}: {e}")
        return None
