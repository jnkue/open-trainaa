"""Utility for checking user analytics consent (Sentry, Langfuse)."""

import threading
import time
from typing import Optional

from agent.core.singletons import get_supabase_client_sync
from agent.log import LOGGER

# TTL-based cache with thread safety
_CACHE_TTL_SECONDS = 300  # 5 minutes
_CACHE_MAX_SIZE = 10_000

_lock = threading.Lock()
_consent_cache: dict[
    str, tuple[Optional[bool], float]
] = {}  # user_id -> (consent, timestamp)


def check_analytics_consent(user_id: str) -> bool:
    """Check if user has consented to analytics. Returns True only if explicitly consented."""
    if not user_id:
        return False

    now = time.monotonic()

    with _lock:
        if user_id in _consent_cache:
            consent, cached_at = _consent_cache[user_id]
            if now - cached_at < _CACHE_TTL_SECONDS:
                return consent is True

    try:
        supabase = get_supabase_client_sync()
        result = (
            supabase.table("user_infos")
            .select("analytics_consent")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )

        consent = result.data.get("analytics_consent") if result.data else None

        with _lock:
            # Evict oldest entries if cache is full
            if len(_consent_cache) >= _CACHE_MAX_SIZE and user_id not in _consent_cache:
                oldest_key = min(_consent_cache, key=lambda k: _consent_cache[k][1])
                del _consent_cache[oldest_key]
            _consent_cache[user_id] = (consent, now)

        return consent is True
    except Exception as e:
        LOGGER.error(f"Error checking analytics consent for user {user_id}: {e}")
        return False


def clear_consent_cache(user_id: Optional[str] = None):
    """Clear consent cache, optionally for a specific user."""
    with _lock:
        if user_id:
            _consent_cache.pop(user_id, None)
        else:
            _consent_cache.clear()
