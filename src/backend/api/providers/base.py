"""Base provider interface for workout sync providers."""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from uuid import UUID


class WorkoutSyncProvider(ABC):
    """Abstract base class for workout sync providers (Wahoo, Garmin, etc.)."""

    def __init__(self, provider_name: str):
        """Initialize provider with name.

        Args:
            provider_name: Name of the provider (e.g., 'wahoo', 'garmin')
        """
        self.provider_name = provider_name

    @abstractmethod
    async def sync_workout(
        self, user_id: UUID, workout_id: UUID, workout_data: Dict[str, Any]
    ) -> bool:
        """Sync a workout template to the provider.

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
        pass

    @abstractmethod
    async def sync_scheduled_workout(
        self, user_id: UUID, scheduled_id: UUID, scheduled_data: Dict[str, Any]
    ) -> bool:
        """Sync a scheduled workout to the provider.

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
        pass

    @abstractmethod
    async def delete_workout(
        self, user_id: UUID, workout_id: UUID, provider_workout_id: Optional[str] = None
    ) -> bool:
        """Delete a workout from the provider.

        Args:
            user_id: User's UUID
            workout_id: Workout UUID
            provider_workout_id: Provider-specific workout ID (if known)

        Returns:
            True if deletion successful or already deleted, False otherwise

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
            ProviderError: For other provider-specific errors
        """
        pass

    @abstractmethod
    async def delete_scheduled_workout(
        self,
        user_id: UUID,
        scheduled_id: UUID,
        provider_scheduled_id: Optional[str] = None,
    ) -> bool:
        """Delete a scheduled workout from the provider.

        Args:
            user_id: User's UUID
            scheduled_id: Scheduled workout UUID
            provider_scheduled_id: Provider-specific scheduled workout ID (if known)

        Returns:
            True if deletion successful or already deleted, False otherwise

        Raises:
            RateLimitError: If rate limit exceeded
            AuthenticationError: If auth token invalid/expired
            ProviderError: For other provider-specific errors
        """
        pass

    @abstractmethod
    async def get_auth_token(self, user_id: UUID) -> Optional[str]:
        """Get valid access token for user.

        Args:
            user_id: User's UUID

        Returns:
            Valid access token or None if not connected
        """
        pass


class ProviderError(Exception):
    """Base exception for provider errors."""

    pass


class RateLimitError(ProviderError):
    """Raised when API rate limit is exceeded."""

    def __init__(self, message: str, retry_after: Optional[int] = None):
        """Initialize rate limit error.

        Args:
            message: Error message
            retry_after: Seconds to wait before retrying (if provided by API)
        """
        super().__init__(message)
        self.retry_after = retry_after


class AuthenticationError(ProviderError):
    """Raised when authentication fails or token is invalid."""

    pass


class RecordNotFoundError(ProviderError):
    """Raised when record doesn't exist (already deleted or never created)."""

    pass
