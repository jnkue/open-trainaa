"""Garmin workout sync provider implementation."""

import requests
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

from api.database import supabase
from api.log import LOGGER
from api.providers.base import (
    WorkoutSyncProvider,
    RateLimitError,
    AuthenticationError,
    RecordNotFoundError,
    ProviderError,
)
from api.routers.garmin import helpers as garmin_helpers
from api.services.rate_limiter import get_rate_limiter
from pacer.src import GarminConverter


class GarminProvider(WorkoutSyncProvider):
    """Garmin Connect API workout sync provider."""

    def __init__(self):
        """Initialize Garmin provider."""
        super().__init__("garmin")
        self.rate_limiter = get_rate_limiter()

    async def get_auth_token(self, user_id: UUID) -> Optional[str]:
        """Get valid Garmin access token for user.

        Args:
            user_id: User's UUID

        Returns:
            Valid access token or None if not connected

        Raises:
            AuthenticationError: If token refresh fails
        """
        try:
            token = garmin_helpers.get_valid_access_token(str(user_id))
            if not token:
                raise AuthenticationError(
                    f"Failed to get valid Garmin token for user {user_id}"
                )
            return token
        except Exception as e:
            LOGGER.error(f"Error getting Garmin token for user {user_id}: {e}")
            raise AuthenticationError(str(e))

    def _is_enabled(self, user_id: UUID) -> bool:
        """Check if Garmin sync is enabled for user."""
        return garmin_helpers.is_garmin_enabled(str(user_id))

    def _handle_api_error(self, response: requests.Response, operation: str) -> None:
        """Handle API error responses and raise appropriate exceptions.

        Args:
            response: Failed API response
            operation: Description of the operation that failed

        Raises:
            RateLimitError: If rate limit exceeded (429)
            AuthenticationError: If auth failed (401)
            ProviderError: For other errors
        """
        status = response.status_code
        error_text = response.text

        if status == 429:
            # Rate limit exceeded
            retry_after = response.headers.get("Retry-After")
            retry_seconds = int(retry_after) if retry_after else 60
            raise RateLimitError(
                f"Garmin API rate limit exceeded during {operation}",
                retry_after=retry_seconds,
            )
        elif status == 401:
            raise AuthenticationError(
                f"Garmin authentication failed during {operation}"
            )
        elif status == 404:
            raise RecordNotFoundError(f"Garmin resource not found during {operation}")
        else:
            raise ProviderError(
                f"Garmin API error during {operation}: {status} - {error_text}"
            )

    async def sync_workout(
        self, user_id: UUID, workout_id: UUID, workout_data: Dict[str, Any]
    ) -> bool:
        """Sync a workout template to Garmin.

        Args:
            user_id: User's UUID
            workout_id: Workout UUID
            workout_data: Full workout data from database including workout_text

        Returns:
            True if sync successful, False otherwise

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
            ProviderError: For other provider-specific errors
        """
        try:
            # Check if enabled
            if not self._is_enabled(user_id):
                LOGGER.info(
                    f"Garmin sync disabled for user {user_id}, skipping workout {workout_id}"
                )
                return False

            # Fetch user attributes for adaptive intensity classification
            user_ftp = None
            user_max_hr = None
            try:
                user_attrs_result = (
                    supabase.table("user_infos")
                    .select("functional_threshold_power, max_heart_rate")
                    .eq("user_id", str(user_id))
                    .execute()
                )
                if user_attrs_result.data:
                    user_ftp = user_attrs_result.data[0].get(
                        "functional_threshold_power"
                    )
                    user_max_hr = user_attrs_result.data[0].get("max_heart_rate")
                    LOGGER.debug(
                        f"User {user_id} attributes: FTP={user_ftp}, Max HR={user_max_hr}"
                    )
                    if user_ftp is None or user_max_hr is None:
                        LOGGER.warning(
                            f"User {user_id} missing FTP or Max HR for Garmin workout conversion"
                        )

            except Exception as e:
                LOGGER.warning(f"Failed to fetch user attributes for {user_id}: {e}")
                # Continue with default values

            # Convert workout text to Garmin format with user-specific intensity thresholds
            try:
                converter = GarminConverter(user_ftp=user_ftp, user_max_hr=user_max_hr)
                garmin_workout = converter.convert_to_garmin(
                    workout_data["workout_text"]
                )
                # Use mode='json' to properly serialize enums to their string values
                workout_payload = garmin_workout.model_dump(
                    exclude_none=True, mode="json"
                )

                LOGGER.info(
                    f"Converted workout {workout_id} to Garmin format: {workout_payload}"
                )  # todo remove later
            except ValueError as e:
                error_msg = f"Cannot convert to Garmin format: {str(e)}"
                LOGGER.warning(f"Workout {workout_id} conversion failed: {error_msg}")
                return False

            # Get access token
            access_token = await self.get_auth_token(user_id)

            # Apply rate limiting
            self.rate_limiter.wait_if_needed(str(user_id), self.provider_name)

            # Check if workout already exists (update) or create new
            garmin_workout_id = workout_data.get("garmin_workout_id")
            workout_name = workout_data.get("name", "Workout")

            if garmin_workout_id:
                # Update existing workout
                LOGGER.info(
                    f"Updating Garmin workout {garmin_workout_id} for workout {workout_id}"
                )
                result = garmin_helpers.update_garmin_workout(
                    access_token, str(garmin_workout_id), workout_payload
                )
                if not result:
                    raise ProviderError("Failed to update workout in Garmin")
            else:
                # Create new workout
                LOGGER.info(f"Creating new Garmin workout for workout {workout_id}")
                result = garmin_helpers.create_garmin_workout(
                    access_token, workout_payload, workout_name=workout_name
                )
                if not result or "workoutId" not in result:
                    raise ProviderError("Failed to create workout in Garmin")

                garmin_workout_id = result["workoutId"]
                LOGGER.info(
                    f"Created Garmin workout {garmin_workout_id} for workout {workout_id}"
                )

            # Update workout with Garmin workout ID
            supabase.table("workouts").update(
                {"garmin_workout_id": garmin_workout_id}
            ).eq("id", str(workout_id)).execute()

            return True

        except (RateLimitError, AuthenticationError):
            # Re-raise these for proper handling by sync service
            raise
        except Exception as e:
            error_msg = f"Unexpected error during Garmin sync: {str(e)}"
            LOGGER.error(
                f"Error syncing workout {workout_id} to Garmin: {e}", exc_info=True
            )
            return False

    async def sync_scheduled_workout(
        self, user_id: UUID, scheduled_id: UUID, scheduled_data: Dict[str, Any]
    ) -> bool:
        """Sync a scheduled workout to Garmin calendar.

        Note: Garmin schedules workouts on the calendar (not separate workout entities).
        The parent workout must be synced first to get a garmin_workout_id.

        Args:
            user_id: User's UUID
            scheduled_id: Scheduled workout UUID
            scheduled_data: Full scheduled workout data including nested workout

        Returns:
            True if sync successful, False otherwise

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
            ProviderError: For other provider-specific errors
        """
        try:
            # Check if enabled
            if not self._is_enabled(user_id):
                LOGGER.info(
                    f"Garmin sync disabled for user {user_id}, skipping scheduled {scheduled_id}"
                )
                return False

            # Get nested workout data
            workout = scheduled_data.get("workouts")
            if not workout:
                raise RecordNotFoundError(
                    f"Workout not found for scheduled workout {scheduled_id}"
                )

            # Check if parent workout has a Garmin workout ID
            garmin_workout_id = workout.get("garmin_workout_id")
            if not garmin_workout_id:
                error_msg = "Parent workout must be synced to Garmin first"
                LOGGER.warning(f"Scheduled workout {scheduled_id}: {error_msg}")
                return False

            # Get access token
            access_token = await self.get_auth_token(user_id)

            # Apply rate limiting
            self.rate_limiter.wait_if_needed(str(user_id), self.provider_name)

            # Parse scheduled time (field is 'scheduled_time' in database, format as YYYY-MM-DD for Garmin)
            scheduled_datetime = datetime.fromisoformat(
                scheduled_data["scheduled_time"]
            )
            scheduled_date_str = scheduled_datetime.strftime("%Y-%m-%d")

            # Schedule the workout on Garmin calendar
            LOGGER.info(
                f"Scheduling Garmin workout {garmin_workout_id} for {scheduled_date_str}"
            )
            result = garmin_helpers.schedule_garmin_workout(
                access_token, str(garmin_workout_id), scheduled_date_str
            )

            if not result:
                raise ProviderError("Failed to schedule workout in Garmin calendar")

            LOGGER.info(f"Successfully scheduled Garmin workout for {scheduled_id}")
            return True

        except (RateLimitError, AuthenticationError):
            # Re-raise these for proper handling by sync service
            raise
        except RecordNotFoundError:
            # Record already deleted, mark as processed
            LOGGER.info(
                f"Scheduled workout {scheduled_id} or parent workout not found, marking as processed"
            )
            return False
        except Exception as e:
            error_msg = f"Unexpected error during Garmin sync: {str(e)}"
            LOGGER.error(
                f"Error syncing scheduled workout {scheduled_id} to Garmin: {e}",
                exc_info=True,
            )
            return False

    async def delete_workout(
        self, user_id: UUID, workout_id: UUID, provider_workout_id: Optional[str] = None
    ) -> bool:
        """Delete a workout from Garmin.

        Args:
            user_id: User's UUID
            workout_id: Workout UUID
            provider_workout_id: Garmin workout ID (if known)

        Returns:
            True if deletion successful or already deleted, False otherwise

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
        """
        try:
            # If no workout ID provided, look it up
            if not provider_workout_id:
                result = (
                    supabase.table("workouts")
                    .select("garmin_workout_id")
                    .eq("id", str(workout_id))
                    .execute()
                )
                if not result.data or not result.data[0].get("garmin_workout_id"):
                    LOGGER.info(
                        f"No Garmin workout ID found for workout {workout_id}, nothing to delete"
                    )
                    return True
                provider_workout_id = str(result.data[0]["garmin_workout_id"])

            # Get access token
            access_token = await self.get_auth_token(user_id)

            # Apply rate limiting
            self.rate_limiter.wait_if_needed(str(user_id), self.provider_name)

            # Delete the workout
            LOGGER.info(
                f"Deleting Garmin workout {provider_workout_id} for workout {workout_id}"
            )
            success = garmin_helpers.delete_garmin_workout(
                access_token, provider_workout_id
            )

            if success:
                LOGGER.info(
                    f"Successfully deleted Garmin workout {provider_workout_id}"
                )
            else:
                LOGGER.warning(
                    f"Failed to delete Garmin workout {provider_workout_id}, may already be deleted"
                )

            return True  # Return True even if delete failed (idempotent)

        except RecordNotFoundError:
            # Already deleted
            LOGGER.info(f"Garmin workout for workout {workout_id} already deleted")
            return True
        except (RateLimitError, AuthenticationError):
            raise
        except Exception as e:
            LOGGER.error(
                f"Error deleting Garmin workout for workout {workout_id}: {e}",
                exc_info=True,
            )
            return False

    async def delete_scheduled_workout(
        self,
        user_id: UUID,
        scheduled_id: UUID,
        provider_scheduled_id: Optional[str] = None,
    ) -> bool:
        """Delete a scheduled workout from Garmin calendar.

        Note: Garmin schedules are managed via calendar API.
        For now, we just mark as deleted since Garmin doesn't have explicit schedule IDs.

        Args:
            user_id: User's UUID
            scheduled_id: Scheduled workout UUID
            provider_scheduled_id: Not used for Garmin (calendar-based scheduling)

        Returns:
            True (always succeeds, Garmin handles calendar cleanup automatically)

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
        """
        try:
            # Garmin doesn't have explicit schedule deletion API
            # When workout is deleted from calendar by user, it's automatically handled
            # We just mark as processed
            LOGGER.info(
                f"Garmin scheduled workout {scheduled_id} marked as processed (calendar-based)"
            )
            return True

        except Exception as e:
            LOGGER.error(
                f"Error processing Garmin scheduled workout deletion {scheduled_id}: {e}",
                exc_info=True,
            )
            return False
