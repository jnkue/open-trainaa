"""
Wahoo API helper functions and utilities.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from api.database import supabase
from api.log import LOGGER

# Wahoo API endpoints
WAHOO_API_BASE_URL = "https://api.wahooligan.com/v1"
WAHOO_TOKEN_URL = "https://api.wahooligan.com/oauth/token"


def is_wahoo_enabled(user_id: str) -> bool:
    """
    Check if Wahoo sync is enabled for user.

    This function only checks if the user has Wahoo connected and upload enabled.
    It does NOT refresh tokens - use get_valid_access_token() when you need a token.

    Returns:
        True if Wahoo is connected and upload_workouts_enabled is True
    """
    try:
        result = (
            supabase.table("wahoo_tokens")
            .select("upload_workouts_enabled")
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return False

        return result.data[0].get("upload_workouts_enabled", False)

    except Exception as e:
        LOGGER.error(f"Error checking Wahoo status for user {user_id}: {e}")
        return False


def get_valid_access_token(user_id: str) -> Optional[str]:
    """
    Get a valid Wahoo access token for immediate API usage.

    This function checks token expiry and refreshes if needed.
    ONLY call this function when you're about to make an API request.

    Returns:
        Valid access token string, or None if unavailable
    """
    try:
        result = (
            supabase.table("wahoo_tokens").select("*").eq("user_id", user_id).execute()
        )

        if not result.data:
            LOGGER.warning(f"No Wahoo token found for user {user_id}")
            return None

        token_data = result.data[0]

        # Skip refresh if connection needs re-authorization
        if token_data.get("needs_reauth", False):
            LOGGER.warning(
                f"Wahoo connection for user {user_id} needs re-authorization. "
                f"Skipping token refresh."
            )
            return None

        expires_at = datetime.fromisoformat(token_data["expires_at"])

        # Check if token is expired or will expire in next 2 minutes
        # Using shorter buffer (2 min instead of 5) to reduce unnecessary refreshes
        if expires_at <= datetime.now(timezone.utc) + timedelta(minutes=2):
            LOGGER.info(
                f"🔄 Refreshing expired Wahoo token for user {user_id} "
                f"(expires at {expires_at.isoformat()})"
            )
            refreshed_data = refresh_wahoo_token(user_id, token_data["refresh_token"])
            if refreshed_data:
                return refreshed_data["access_token"]
            else:
                LOGGER.error(f"❌ Failed to get valid access token for user {user_id}")
                return None

        return token_data["access_token"]

    except Exception as e:
        LOGGER.error(
            f"❌ Error getting valid Wahoo access token for user {user_id}: {e}",
            exc_info=True,
        )
        return None


def refresh_wahoo_token(user_id: str, refresh_token: str) -> Optional[dict]:
    """
    Refresh Wahoo access token.

    Note: According to Wahoo API docs, old tokens are only revoked AFTER an API call
    is made with the new refreshed token. This means tokens can accumulate if:
    1. Token is refreshed but never used
    2. User disconnects/reconnects multiple times (creates new auth tokens, not refresh)

    To prevent accumulation, the disconnect endpoint properly deauthorizes with Wahoo.
    """
    try:
        client_id = os.getenv("WAHOO_CLIENT_ID")
        client_secret = os.getenv("WAHOO_CLIENT_SECRET")

        if not client_id or not client_secret:
            LOGGER.error("Wahoo credentials not configured")
            return None

        response = requests.post(
            WAHOO_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )

        if response.status_code != 200:
            error_text = response.text
            LOGGER.error(f"Failed to refresh Wahoo token: {error_text}")

            # Check for "too many tokens" error - attempt auto-recovery
            if "Too many unrevoked access tokens" in error_text:
                LOGGER.error(
                    f"User {user_id} has hit Wahoo's token limit. "
                    "Attempting recovery via deauthorization."
                )
                _handle_too_many_tokens(user_id)

            return None

        token_response = response.json()
        LOGGER.debug(
            f"Wahoo token refresh response for user {user_id}: {token_response}"
        )

        # Wahoo returns expires_in (seconds), not expires_at (timestamp)
        # Calculate expires_at from expires_in, same as initial auth flow
        expires_in = token_response.get("expires_in", 7200)  # Default to 2 hours
        expires_at_timestamp = datetime.now(timezone.utc).timestamp() + expires_in
        expires_at = datetime.fromtimestamp(expires_at_timestamp)

        LOGGER.info(
            f"Wahoo token will expire in {expires_in} seconds "
            f"(at {expires_at.isoformat()}) for user {user_id}"
        )

        # Validate that we have required fields
        access_token = token_response.get("access_token")
        if not access_token:
            LOGGER.error(
                f"No access_token in Wahoo refresh response for user {user_id}: {token_response}"
            )
            return None

        # CRITICAL: Make a lightweight API call with the new token to trigger
        # revocation of old tokens. Per Wahoo API docs, old tokens are only
        # revoked after an API call with the new token. CDN downloads do NOT
        # count. Without this, tokens accumulate and hit the 10-token limit.
        try:
            activation_response = requests.get(
                f"{WAHOO_API_BASE_URL}/user",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            if activation_response.status_code == 200:
                LOGGER.info(
                    f"Token activation call succeeded for user {user_id} "
                    f"(old tokens will be revoked by Wahoo)"
                )
            else:
                LOGGER.warning(
                    f"Token activation call returned {activation_response.status_code} "
                    f"for user {user_id}. Old tokens may not be revoked."
                )
        except Exception as activation_error:
            LOGGER.warning(
                f"Token activation call failed for user {user_id}: {activation_error}. "
                f"Old tokens may not be revoked."
            )

        # Update token in database
        updated_token = {
            "access_token": access_token,
            "refresh_token": token_response.get("refresh_token", refresh_token),
            "expires_at": expires_at.isoformat(),
        }

        supabase.table("wahoo_tokens").update(updated_token).eq(
            "user_id", user_id
        ).execute()

        LOGGER.info(
            f"✅ Successfully refreshed Wahoo token for user {user_id} "
            f"(expires at {expires_at.isoformat()})"
        )

        # Return full token data
        result = (
            supabase.table("wahoo_tokens").select("*").eq("user_id", user_id).execute()
        )
        return result.data[0] if result.data else None

    except KeyError as e:
        LOGGER.error(
            f"❌ Missing required field in Wahoo token response for user {user_id}: {e}"
        )
        LOGGER.error(
            f"Token response was: {response.json() if response else 'No response'}"
        )
        return None
    except Exception as e:
        LOGGER.error(
            f"❌ Error refreshing Wahoo token for user {user_id}: {e}", exc_info=True
        )
        return None


def _handle_too_many_tokens(user_id: str) -> None:
    """
    Handle the "too many unrevoked access tokens" error from Wahoo.

    Attempts to deauthorize using the stored token and marks the connection
    as needing re-authorization. The user must disconnect and reconnect
    their Wahoo account from the app.
    """
    try:
        result = (
            supabase.table("wahoo_tokens")
            .select("access_token")
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            LOGGER.warning(
                f"No stored token found for user {user_id} during "
                f"too-many-tokens recovery"
            )
            return

        stored_access_token = result.data[0]["access_token"]

        # Attempt deauthorization with the stored (possibly expired) token
        deauth_success = deauthorize_wahoo(stored_access_token)

        if deauth_success:
            LOGGER.info(
                f"Successfully deauthorized Wahoo for user {user_id} "
                f"during too-many-tokens recovery. User must re-authenticate."
            )
        else:
            LOGGER.warning(
                f"Deauthorization failed for user {user_id} during "
                f"too-many-tokens recovery. Token may be fully expired. "
                f"User must disconnect and reconnect manually."
            )

        # Mark the connection as needing re-authorization regardless
        supabase.table("wahoo_tokens").update({"needs_reauth": True}).eq(
            "user_id", user_id
        ).execute()

        LOGGER.info(f"Marked Wahoo connection as needs_reauth for user {user_id}")

    except Exception as e:
        LOGGER.error(
            f"Error during too-many-tokens recovery for user {user_id}: {e}",
            exc_info=True,
        )


def deauthorize_wahoo(access_token: str) -> bool:
    """
    Deauthorize the app by revoking all tokens for the user.

    This calls DELETE /v1/permissions which revokes ALL access tokens for this user.
    The user will need to go through the OAuth flow again to reconnect.

    Args:
        access_token: The user's current valid access token

    Returns:
        True if deauthorization was successful, False otherwise
    """
    try:
        url = f"{WAHOO_API_BASE_URL}/permissions"
        headers = {"Authorization": f"Bearer {access_token}"}

        response = requests.delete(url, headers=headers)

        if response.status_code == 204:
            LOGGER.info("Successfully deauthorized Wahoo app")
            return True
        else:
            LOGGER.warning(
                f"Wahoo deauthorization returned unexpected status {response.status_code}: {response.text}"
            )
            return False

    except Exception as e:
        LOGGER.error(f"Error deauthorizing Wahoo app: {e}")
        return False


def make_wahoo_api_request(
    access_token: str, endpoint: str, method: str = "GET", data: dict = None
) -> Optional[dict]:
    """Make authenticated request to Wahoo API."""
    try:
        url = f"{WAHOO_API_BASE_URL}/{endpoint.lstrip('/')}"
        headers = {"Authorization": f"Bearer {access_token}"}

        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")

        if response.status_code not in [200, 201, 204]:
            LOGGER.error(
                f"Wahoo API request failed: {response.status_code} - {response.text}"
            )
            return None

        # Handle 204 No Content responses
        if response.status_code == 204:
            return {"success": True}

        return response.json()

    except Exception as e:
        LOGGER.error(f"Error making Wahoo API request: {e}")
        return None


# Plan Management Functions


def create_wahoo_plan(
    access_token: str,
    plan_data: dict,
    workout_name: str = "Workout",
    workout_id: str = None,
) -> Optional[dict]:
    """
    Create a workout plan in Wahoo.

    Args:
        access_token: Valid Wahoo access token
        plan_data: Wahoo plan JSON structure (Header + Intervals)
        workout_name: Name for the workout plan
        workout_id: Optional workout ID to use as external_id

    Returns:
        dict with 'id' of created plan, or None on failure
    """
    try:
        import base64
        import json

        # Wahoo API requires the workout to be uploaded as base64 encoded JSON
        # Format the plan data as JSON string (null fields should already be excluded)
        file_content = json.dumps(plan_data, indent=2)

        LOGGER.debug(
            f"Creating Wahoo plan with data: {file_content[:500]}..."
        )  # Log first 500 chars

        # Generate external_id if not provided
        external_id = (
            workout_id
            if workout_id
            else f"pacer_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        )

        # Base64 encode the JSON file as required by Wahoo API
        file_content_bytes = file_content.encode("utf-8")
        base64_content = base64.b64encode(file_content_bytes).decode("utf-8")

        # Format as data URI: data:application/json;base64,<base64-content>
        file_data_uri = f"data:application/json;base64,{base64_content}"

        # Prepare form data with required fields (note the plan[...] prefix)
        url = f"{WAHOO_API_BASE_URL}/plans"
        headers = {"Authorization": f"Bearer {access_token}"}

        form_data = {
            "plan[file]": file_data_uri,
            "plan[filename]": f"{workout_name.replace(' ', '_')}.json",
            "plan[external_id]": external_id,
            "plan[provider_updated_at]": datetime.now(timezone.utc).isoformat(),
        }

        LOGGER.info(
            f"Sending Wahoo plan: name={workout_name}, external_id={external_id}, file_size={len(file_content)} bytes"
        )

        response = requests.post(url, headers=headers, data=form_data)

        LOGGER.info(f"Wahoo API response: status={response.status_code}")

        if response.status_code not in [200, 201]:
            LOGGER.error(
                f"Wahoo API request failed: {response.status_code} - {response.text}"
            )
            LOGGER.error(f"File content preview: {file_content[:300]}")
            return None

        result = response.json()
        if result and "id" in result:
            LOGGER.info(f"Successfully created Wahoo plan: {result['id']}")
            return result
        return None
    except Exception as e:
        LOGGER.error(f"Error creating Wahoo plan: {e}")
        return None


def update_wahoo_plan(
    access_token: str, plan_id: str, plan_data: dict
) -> Optional[dict]:
    """
    Update an existing workout plan in Wahoo.

    Args:
        access_token: Valid Wahoo access token
        plan_id: Wahoo plan ID
        plan_data: Updated plan JSON structure

    Returns:
        dict with updated plan data, or None on failure
    """
    try:
        result = make_wahoo_api_request(
            access_token, f"plans/{plan_id}", method="PUT", data=plan_data
        )
        if result:
            LOGGER.info(f"Successfully updated Wahoo plan: {plan_id}")
            return result
        return None
    except Exception as e:
        LOGGER.error(f"Error updating Wahoo plan {plan_id}: {e}")
        return None


def delete_wahoo_plan(access_token: str, plan_id: str) -> bool:
    """
    Delete a workout plan from Wahoo.

    Args:
        access_token: Valid Wahoo access token
        plan_id: Wahoo plan ID

    Returns:
        True if deletion succeeded, False otherwise
    """
    try:
        result = make_wahoo_api_request(
            access_token, f"plans/{plan_id}", method="DELETE"
        )
        if result:
            LOGGER.info(f"Successfully deleted Wahoo plan: {plan_id}")
            return True
        return False
    except Exception as e:
        LOGGER.error(f"Error deleting Wahoo plan {plan_id}: {e}")
        return False


def get_wahoo_plan(access_token: str, plan_id: str) -> Optional[dict]:
    """
    Get a workout plan from Wahoo.

    Args:
        access_token: Valid Wahoo access token
        plan_id: Wahoo plan ID

    Returns:
        dict with plan data, or None on failure
    """
    try:
        result = make_wahoo_api_request(access_token, f"plans/{plan_id}")
        return result
    except Exception as e:
        LOGGER.error(f"Error getting Wahoo plan {plan_id}: {e}")
        return None


# Workout Management Functions


def create_wahoo_workout(
    access_token: str,
    name: str,
    plan_id: str,
    scheduled_time: datetime,
    duration_minutes: int,
    workout_type_id: int,
) -> Optional[dict]:
    """
    Create a scheduled workout in Wahoo.

    Args:
        access_token: Valid Wahoo access token
        name: Workout name
        plan_id: Wahoo plan ID (used as workout_token for tracking)
        scheduled_time: When the workout is scheduled
        duration_minutes: Duration of the workout in minutes
        workout_type_id: Wahoo workout type ID (default: 40)

    Returns:
        dict with 'id' of created workout, or None on failure
    """
    try:
        # Wahoo API requires workout[...] prefixed parameters
        workout_data = {
            "workout[name]": name,
            "workout[plan_id]": plan_id,  # Link to the plan
            "workout[workout_token]": plan_id,  # Use plan_id as identifier
            "workout[workout_type_id]": workout_type_id,
            "workout[starts]": scheduled_time.isoformat(),
            "workout[minutes]": duration_minutes,
        }

        LOGGER.info(
            f"Creating Wahoo scheduled workout: name={name}, plan_id={plan_id}, type_id={workout_type_id}, duration={duration_minutes}min, starts={scheduled_time.isoformat()}"
        )
        LOGGER.debug(f"Workout data: {workout_data}")

        # Send as form data (not JSON)
        url = f"{WAHOO_API_BASE_URL}/workouts"
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.post(url, headers=headers, data=workout_data)

        LOGGER.info(f"Wahoo API response: status={response.status_code}")

        if response.status_code not in [200, 201]:
            LOGGER.error(
                f"Wahoo API request failed: {response.status_code} - {response.text}"
            )
            LOGGER.error(f"Sent data: {workout_data}")
            return None

        result = response.json()
        if result and "id" in result:
            LOGGER.info(f"Successfully created Wahoo workout: {result['id']}")
            return result
        return None
    except Exception as e:
        LOGGER.error(f"Error creating Wahoo workout: {e}", exc_info=True)
        return None


def update_wahoo_workout(
    access_token: str, workout_id: str, update_data: dict
) -> Optional[dict]:
    """
    Update an existing workout in Wahoo.

    Args:
        access_token: Valid Wahoo access token
        workout_id: Wahoo workout ID
        update_data: Fields to update (name, plan_id, starts, etc.)

    Returns:
        dict with updated workout data, or None on failure
    """
    try:
        result = make_wahoo_api_request(
            access_token, f"workouts/{workout_id}", method="PUT", data=update_data
        )
        if result:
            LOGGER.info(f"Successfully updated Wahoo workout: {workout_id}")
            return result
        return None
    except Exception as e:
        LOGGER.error(f"Error updating Wahoo workout {workout_id}: {e}")
        return None


def delete_wahoo_workout(access_token: str, workout_id: str) -> bool:
    """
    Delete a scheduled workout from Wahoo.

    Args:
        access_token: Valid Wahoo access token
        workout_id: Wahoo workout ID

    Returns:
        True if deletion succeeded, False otherwise
    """
    try:
        result = make_wahoo_api_request(
            access_token, f"workouts/{workout_id}", method="DELETE"
        )
        if result:
            LOGGER.info(f"Successfully deleted Wahoo workout: {workout_id}")
            return True
        return False
    except Exception as e:
        LOGGER.error(f"Error deleting Wahoo workout {workout_id}: {e}")
        return False


def get_wahoo_workout(access_token: str, workout_id: str) -> Optional[dict]:
    """
    Get a scheduled workout from Wahoo.

    Args:
        access_token: Valid Wahoo access token
        workout_id: Wahoo workout ID

    Returns:
        dict with workout data, or None on failure
    """
    try:
        result = make_wahoo_api_request(access_token, f"workouts/{workout_id}")
        return result
    except Exception as e:
        LOGGER.error(f"Error getting Wahoo workout {workout_id}: {e}")
        return None
