"""Simple rate limiter for API calls."""

import time
import logging
from typing import Dict, Tuple
from threading import Lock

LOGGER = logging.getLogger(__name__)


class RateLimiter:
    """Simple rate limiter that tracks calls per user per provider."""

    def __init__(self, calls_per_minute: int = 30):
        """Initialize rate limiter.

        Args:
            calls_per_minute: Maximum number of calls allowed per minute per user per provider
        """
        self.calls_per_minute = calls_per_minute
        self.window_seconds = 60
        # Track calls per (user_id, provider) key
        self._call_history: Dict[Tuple[str, str], list[float]] = {}
        self._lock = Lock()

    def wait_if_needed(self, user_id: str, provider: str) -> None:
        """Wait if rate limit would be exceeded.

        Args:
            user_id: User ID making the request
            provider: Provider name (e.g., 'wahoo', 'garmin')
        """
        key = (user_id, provider)
        now = time.time()

        with self._lock:
            # Initialize history for this key if needed
            if key not in self._call_history:
                self._call_history[key] = []

            # Remove calls older than window
            self._call_history[key] = [
                call_time
                for call_time in self._call_history[key]
                if now - call_time < self.window_seconds
            ]

            # Check if we're at limit
            if len(self._call_history[key]) >= self.calls_per_minute:
                oldest_call = self._call_history[key][0]
                sleep_time = self.window_seconds - (now - oldest_call)

                if sleep_time > 0:
                    LOGGER.info(
                        f"Rate limit reached for {provider} user {user_id}. "
                        f"Sleeping {sleep_time:.1f}s"
                    )
                    time.sleep(sleep_time)
                    now = time.time()

                    # Clean up again after sleep
                    self._call_history[key] = [
                        call_time
                        for call_time in self._call_history[key]
                        if now - call_time < self.window_seconds
                    ]

            # Record this call
            self._call_history[key].append(now)

    def cleanup_old_entries(self) -> None:
        """Clean up old tracking data to prevent memory growth."""
        now = time.time()
        with self._lock:
            keys_to_delete = []
            for key, calls in self._call_history.items():
                # Remove old calls
                self._call_history[key] = [
                    call_time
                    for call_time in calls
                    if now - call_time < self.window_seconds
                ]
                # If no recent calls, remove the key entirely
                if not self._call_history[key]:
                    keys_to_delete.append(key)

            for key in keys_to_delete:
                del self._call_history[key]


# Global rate limiter instance
_rate_limiter = RateLimiter(calls_per_minute=30)


def get_rate_limiter() -> RateLimiter:
    """Get the global rate limiter instance."""
    return _rate_limiter
