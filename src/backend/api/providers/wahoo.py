"""Wahoo workout sync provider implementation."""

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
from api.routers.wahoo import helpers as wahoo_helpers
from api.services.rate_limiter import get_rate_limiter
from pacer.src import WahooConverter


class WahooProvider(WorkoutSyncProvider):
    """Wahoo Cloud API workout sync provider."""

    def __init__(self):
        """Initialize Wahoo provider."""
        super().__init__("wahoo")
        self.converter = WahooConverter()
        self.rate_limiter = get_rate_limiter()

    async def get_auth_token(self, user_id: UUID) -> Optional[str]:
        """Get valid Wahoo access token for user.

        Args:
            user_id: User's UUID

        Returns:
            Valid access token or None if not connected

        Raises:
            AuthenticationError: If token refresh fails
        """
        try:
            token = wahoo_helpers.get_valid_access_token(str(user_id))
            if not token:
                raise AuthenticationError(
                    f"Failed to get valid Wahoo token for user {user_id}"
                )
            return token
        except Exception as e:
            LOGGER.error(f"Error getting Wahoo token for user {user_id}: {e}")
            raise AuthenticationError(str(e))

    def _is_enabled(self, user_id: UUID) -> bool:
        """Check if Wahoo sync is enabled for user."""
        return wahoo_helpers.is_wahoo_enabled(str(user_id))

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
                f"Wahoo API rate limit exceeded during {operation}",
                retry_after=retry_seconds,
            )
        elif status == 401:
            raise AuthenticationError(f"Wahoo authentication failed during {operation}")
        elif status == 404:
            raise RecordNotFoundError(f"Wahoo resource not found during {operation}")
        else:
            raise ProviderError(
                f"Wahoo API error during {operation}: {status} - {error_text}"
            )

    async def sync_workout(
        self, user_id: UUID, workout_id: UUID, workout_data: Dict[str, Any]
    ) -> bool:
        """Sync a workout template (plan) to Wahoo.

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
                    f"Wahoo sync disabled for user {user_id}, skipping workout {workout_id}"
                )
                return False

            # Convert workout text to Wahoo format
            try:
                wahoo_workout = self.converter.convert_to_wahoo(
                    workout_data["workout_text"]
                )
                plan_data = wahoo_workout.model_dump(exclude_none=True)
            except ValueError as e:
                error_msg = f"Cannot convert to Wahoo format: {str(e)}"
                LOGGER.warning(f"Workout {workout_id} conversion failed: {error_msg}")
                return False

            # Get access token
            access_token = await self.get_auth_token(user_id)

            # Apply rate limiting
            self.rate_limiter.wait_if_needed(str(user_id), self.provider_name)

            # Check if plan already exists (update) or create new
            wahoo_plan_id = workout_data.get("wahoo_plan_id")
            workout_name = workout_data.get("name", "Workout")

            if wahoo_plan_id:
                # Update existing plan
                LOGGER.info(
                    f"Updating Wahoo plan {wahoo_plan_id} for workout {workout_id}"
                )
                result = wahoo_helpers.update_wahoo_plan(
                    access_token, wahoo_plan_id, plan_data
                )
                if not result:
                    raise ProviderError("Failed to update plan in Wahoo")
            else:
                # Create new plan
                LOGGER.info(f"Creating new Wahoo plan for workout {workout_id}")
                result = wahoo_helpers.create_wahoo_plan(
                    access_token,
                    plan_data,
                    workout_name=workout_name,
                    workout_id=str(workout_id),
                )
                if not result or "id" not in result:
                    raise ProviderError("Failed to create plan in Wahoo")

                wahoo_plan_id = result["id"]
                LOGGER.info(
                    f"Created Wahoo plan {wahoo_plan_id} for workout {workout_id}"
                )

            # Update workout with Wahoo plan ID
            supabase.table("workouts").update({"wahoo_plan_id": wahoo_plan_id}).eq(
                "id", str(workout_id)
            ).execute()

            return True

        except (RateLimitError, AuthenticationError):
            # Re-raise these for proper handling by sync service
            raise
        except Exception as e:
            error_msg = f"Unexpected error during Wahoo sync: {str(e)}"
            LOGGER.error(
                f"Error syncing workout {workout_id} to Wahoo: {e}", exc_info=True
            )
            return False

    async def sync_scheduled_workout(
        self, user_id: UUID, scheduled_id: UUID, scheduled_data: Dict[str, Any]
    ) -> bool:
        """Sync a scheduled workout to Wahoo.

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
                    f"Wahoo sync disabled for user {user_id}, skipping scheduled {scheduled_id}"
                )
                return False

            # Get nested workout data
            workout = scheduled_data.get("workouts")
            if not workout:
                raise RecordNotFoundError(
                    f"Workout not found for scheduled workout {scheduled_id}"
                )

            # Check if parent workout has a Wahoo plan
            wahoo_plan_id = workout.get("wahoo_plan_id")
            if not wahoo_plan_id:
                error_msg = "Parent workout must be synced to Wahoo first"
                LOGGER.warning(f"Scheduled workout {scheduled_id}: {error_msg}")
                return False

            # Get access token
            access_token = await self.get_auth_token(user_id)

            # Apply rate limiting
            self.rate_limiter.wait_if_needed(str(user_id), self.provider_name)

            # Parse scheduled time (field is 'scheduled_time' in database)
            scheduled_date = datetime.fromisoformat(scheduled_data["scheduled_time"])
            workout_name = workout.get("name", "Workout")
            duration_minutes = scheduled_data.get("planned_duration_minutes", 60)
            workout_type_id = scheduled_data.get("workout_type_id", 40)

            # Check if scheduled workout already exists (update) or create new
            wahoo_workout_id = scheduled_data.get("wahoo_workout_id")

            if wahoo_workout_id:
                # Update existing scheduled workout
                LOGGER.info(
                    f"Updating Wahoo workout {wahoo_workout_id} for scheduled {scheduled_id}"
                )
                update_data = {
                    "workout[name]": workout_name,
                    "workout[starts]": scheduled_date.isoformat(),
                    "workout[minutes]": duration_minutes,
                }
                result = wahoo_helpers.update_wahoo_workout(
                    access_token, wahoo_workout_id, update_data
                )
                if not result:
                    raise ProviderError("Failed to update scheduled workout in Wahoo")
            else:
                # Create new scheduled workout
                LOGGER.info(f"Creating new Wahoo scheduled workout for {scheduled_id}")
                result = wahoo_helpers.create_wahoo_workout(
                    access_token,
                    name=workout_name,
                    plan_id=wahoo_plan_id,
                    scheduled_time=scheduled_date,
                    duration_minutes=duration_minutes,
                    workout_type_id=workout_type_id,
                )
                if not result or "id" not in result:
                    raise ProviderError("Failed to create scheduled workout in Wahoo")

                wahoo_workout_id = result["id"]
                LOGGER.info(
                    f"Created Wahoo workout {wahoo_workout_id} for scheduled {scheduled_id}"
                )

            # Update scheduled workout with Wahoo workout ID
            supabase.table("workouts_scheduled").update(
                {"wahoo_workout_id": wahoo_workout_id}
            ).eq("id", str(scheduled_id)).execute()

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
            error_msg = f"Unexpected error during Wahoo sync: {str(e)}"
            LOGGER.error(
                f"Error syncing scheduled workout {scheduled_id} to Wahoo: {e}",
                exc_info=True,
            )
            return False

    async def delete_workout(
        self, user_id: UUID, workout_id: UUID, provider_workout_id: Optional[str] = None
    ) -> bool:
        """Delete a workout (plan) from Wahoo.

        Args:
            user_id: User's UUID
            workout_id: Workout UUID
            provider_workout_id: Wahoo plan ID (if known)

        Returns:
            True if deletion successful or already deleted, False otherwise

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
        """
        try:
            # If no plan ID provided, look it up
            if not provider_workout_id:
                result = (
                    supabase.table("workouts")
                    .select("wahoo_plan_id")
                    .eq("id", str(workout_id))
                    .execute()
                )
                if not result.data or not result.data[0].get("wahoo_plan_id"):
                    LOGGER.info(
                        f"No Wahoo plan ID found for workout {workout_id}, nothing to delete"
                    )
                    return True
                provider_workout_id = result.data[0]["wahoo_plan_id"]

            # Get access token
            access_token = await self.get_auth_token(user_id)

            # Apply rate limiting
            self.rate_limiter.wait_if_needed(str(user_id), self.provider_name)

            # Delete the plan
            LOGGER.info(
                f"Deleting Wahoo plan {provider_workout_id} for workout {workout_id}"
            )
            success = wahoo_helpers.delete_wahoo_plan(access_token, provider_workout_id)

            if success:
                LOGGER.info(f"Successfully deleted Wahoo plan {provider_workout_id}")
            else:
                LOGGER.warning(
                    f"Failed to delete Wahoo plan {provider_workout_id}, may already be deleted"
                )

            return True  # Return True even if delete failed (idempotent)

        except RecordNotFoundError:
            # Already deleted
            LOGGER.info(f"Wahoo plan for workout {workout_id} already deleted")
            return True
        except (RateLimitError, AuthenticationError):
            raise
        except Exception as e:
            LOGGER.error(
                f"Error deleting Wahoo plan for workout {workout_id}: {e}",
                exc_info=True,
            )
            return False

    async def delete_scheduled_workout(
        self,
        user_id: UUID,
        scheduled_id: UUID,
        provider_scheduled_id: Optional[str] = None,
    ) -> bool:
        """Delete a scheduled workout from Wahoo.

        Args:
            user_id: User's UUID
            scheduled_id: Scheduled workout UUID
            provider_scheduled_id: Wahoo workout ID (if known)

        Returns:
            True if deletion successful or already deleted, False otherwise

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
        """
        try:
            # If no workout ID provided, look it up
            if not provider_scheduled_id:
                result = (
                    supabase.table("workouts_scheduled")
                    .select("wahoo_workout_id")
                    .eq("id", str(scheduled_id))
                    .execute()
                )
                if not result.data or not result.data[0].get("wahoo_workout_id"):
                    LOGGER.info(
                        f"No Wahoo workout ID found for scheduled {scheduled_id}, nothing to delete"
                    )
                    return True
                provider_scheduled_id = result.data[0]["wahoo_workout_id"]

            # Get access token
            access_token = await self.get_auth_token(user_id)

            # Apply rate limiting
            self.rate_limiter.wait_if_needed(str(user_id), self.provider_name)

            # Delete the scheduled workout
            LOGGER.info(
                f"Deleting Wahoo workout {provider_scheduled_id} for scheduled {scheduled_id}"
            )
            success = wahoo_helpers.delete_wahoo_workout(
                access_token, provider_scheduled_id
            )

            if success:
                LOGGER.info(
                    f"Successfully deleted Wahoo workout {provider_scheduled_id}"
                )
            else:
                LOGGER.warning(
                    f"Failed to delete Wahoo workout {provider_scheduled_id}, may already be deleted"
                )

            return True  # Return True even if delete failed (idempotent)

        except RecordNotFoundError:
            # Already deleted
            LOGGER.info(f"Wahoo workout for scheduled {scheduled_id} already deleted")
            return True
        except (RateLimitError, AuthenticationError):
            raise
        except Exception as e:
            LOGGER.error(
                f"Error deleting Wahoo workout for scheduled {scheduled_id}: {e}",
                exc_info=True,
            )
            return False
