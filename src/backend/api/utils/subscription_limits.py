"""
Subscription limits and checks for PRO vs Free tier users.

This module handles:
- Checking user subscription status (synced from RevenueCat via webhooks)
- Counting monthly message limits
- Enforcing free tier restrictions
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from api.database import supabase
from api.log import LOGGER

FREE_TIER_MESSAGE_LIMIT = 10


def pick_active_subscription_store(items: List[Dict[str, Any]]) -> Optional[str]:
    """
    Pick the store of the most relevant subscription from a list of
    RevenueCat subscription items.

    Priority:
    1. Subscriptions where gives_access is True
    2. Non-expired subscriptions
    3. Any subscription with a store value
    Within each tier, production environment is preferred over sandbox.

    Returns:
        Normalized lowercase store string or None
    """
    if not items:
        return None

    def _prefer_production(subs: List[Dict[str, Any]]) -> str:
        prod = [s for s in subs if s.get("environment") != "sandbox"]
        chosen = prod[0] if prod else subs[0]
        return chosen["store"].lower()

    giving_access = [
        s for s in items if s.get("gives_access") is True and s.get("store")
    ]
    if giving_access:
        return _prefer_production(giving_access)

    non_expired = [s for s in items if s.get("status") != "expired" and s.get("store")]
    if non_expired:
        return _prefer_production(non_expired)

    with_store = [s for s in items if s.get("store")]
    if with_store:
        return _prefer_production(with_store)

    return None


async def has_byok_key(user_id: str) -> bool:
    """
    Check if a user has a BYOK OpenRouter API key configured.

    Args:
        user_id: User ID (UUID)

    Returns:
        True if user has an encrypted API key stored, False otherwise
    """
    try:
        response = (
            supabase.table("user_infos")
            .select("openrouter_api_key_encrypted")
            .eq("user_id", user_id)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            return False

        return bool(response.data[0].get("openrouter_api_key_encrypted"))

    except Exception as e:
        LOGGER.error(f"Error checking BYOK key for user {user_id}: {e}")
        return False


async def is_pro_subscriber(user_id: str) -> bool:
    """
    Check if a user has PRO-level access.

    Returns True if the user has an active PRO subscription (via RevenueCat)
    OR has a valid BYOK OpenRouter API key configured.

    Args:
        user_id: User ID (UUID)

    Returns:
        True if user has PRO access (subscription or BYOK), False otherwise
    """
    try:
        # Query both subscription status and BYOK key in a single query
        response = (
            supabase.table("user_infos")
            .select("is_pro_subscriber, openrouter_api_key_encrypted")
            .eq("user_id", user_id)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            LOGGER.debug(f"No user_infos found for user {user_id}, assuming free tier")
            return False

        row = response.data[0]
        is_pro = row.get("is_pro_subscriber", False)
        has_byok = bool(row.get("openrouter_api_key_encrypted"))

        if is_pro:
            LOGGER.debug(f"User {user_id} has PRO subscription")
            return True

        if has_byok:
            LOGGER.debug(f"User {user_id} has BYOK API key - granting PRO access")
            return True

        LOGGER.debug(f"User {user_id} is free tier")
        return False

    except Exception as e:
        LOGGER.error(f"Error checking PRO status for user {user_id}: {e}")
        # On error, assume free tier (fail closed)
        return False


async def get_monthly_user_message_count(user_id: str) -> int:
    """
    Count how many messages the user has sent this month.
    Only counts messages with role='user'.

    Args:
        user_id: User ID (UUID)

    Returns:
        Number of user messages sent this month
    """
    try:
        # Get first day of current month
        now = datetime.now(timezone.utc)
        first_day_of_month = now.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        # Count user messages since start of month
        response = (
            supabase.table("chat_history")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("role", "user")
            .gte("created_at", first_day_of_month.isoformat())
            .execute()
        )

        count = response.count if response.count is not None else 0
        LOGGER.debug(f"User {user_id} has sent {count} messages this month")
        return count

    except Exception as e:
        LOGGER.error(f"Error counting messages for user {user_id}: {e}")
        # On error, return 0 to allow message (fail open for counting)
        return 0


async def can_send_message(user_id: str) -> Dict[str, any]:
    """
    Check if a user can send a message based on their subscription status
    and monthly message count.

    Args:
        user_id: User ID (UUID)

    Returns:
        Dictionary with:
        - can_send: bool - Whether user can send a message
        - is_pro: bool - Whether user is PRO subscriber
        - message_count: int - Number of messages sent this month
        - remaining: int - Number of free messages remaining (0 for PRO)
        - reason: str - Reason if can_send is False
    """
    try:
        # Check if user is PRO
        is_pro = await is_pro_subscriber(user_id)

        if is_pro:
            # PRO users have unlimited messages
            return {
                "can_send": True,
                "is_pro": True,
                "message_count": 0,
                "remaining": -1,  # -1 indicates unlimited
                "reason": None,
            }

        # Free user - check message count
        message_count = await get_monthly_user_message_count(user_id)
        remaining = max(0, FREE_TIER_MESSAGE_LIMIT - message_count)
        can_send = message_count < FREE_TIER_MESSAGE_LIMIT

        result = {
            "can_send": can_send,
            "is_pro": False,
            "message_count": message_count,
            "remaining": remaining,
            "reason": "Monthly message limit reached" if not can_send else None,
        }

        LOGGER.debug(f"Message send check for user {user_id}: {result}")
        return result

    except Exception as e:
        LOGGER.error(f"Error checking message send permissions for user {user_id}: {e}")
        # On error, allow message (fail open)
        return {
            "can_send": True,
            "is_pro": False,
            "message_count": 0,
            "remaining": FREE_TIER_MESSAGE_LIMIT,
            "reason": None,
        }


async def should_generate_session_feedback(user_id: str) -> bool:
    """
    Check if session feedback should be generated for a user.
    Only PRO users get AI-generated session feedback.

    Args:
        user_id: User ID (UUID)

    Returns:
        True if feedback should be generated, False otherwise
    """
    is_pro = await is_pro_subscriber(user_id)
    LOGGER.debug(f"Session feedback check for user {user_id}: PRO={is_pro}")
    return is_pro
