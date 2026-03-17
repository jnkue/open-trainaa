"""
Push Notification Service

Sends push notifications via Expo Push Notification Service.
Docs: https://docs.expo.dev/push-notifications/sending-notifications/
"""

from datetime import datetime, timezone
from typing import Optional

import httpx
from api.database import supabase
from api.log import LOGGER

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> dict:
    """
    Send a push notification to all devices registered by the given user.

    Returns dict with 'sent' count and any 'errors'.
    """
    tokens_result = (
        supabase.table("user_push_tokens")
        .select("expo_push_token")
        .eq("user_id", user_id)
        .execute()
    )

    if not tokens_result.data:
        LOGGER.debug(f"No push tokens found for user {user_id}")
        return {"sent": 0, "errors": []}

    tokens = [t["expo_push_token"] for t in tokens_result.data]

    messages = []
    for token in tokens:
        message = {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
        }
        if data:
            message["data"] = data
        messages.append(message)

    errors = []
    sent = 0
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json"},
            )
            if response.status_code == 200:
                result_data = response.json().get("data", [])
                for i, ticket in enumerate(result_data):
                    if ticket.get("status") == "ok":
                        sent += 1
                    else:
                        error_msg = ticket.get("message", "Unknown error")
                        errors.append({"token": tokens[i], "error": error_msg})
                        if "DeviceNotRegistered" in error_msg:
                            _remove_invalid_token(user_id, tokens[i])
            else:
                LOGGER.error(
                    f"Expo push API error: {response.status_code} {response.text}"
                )
                errors.append({"error": f"HTTP {response.status_code}"})
    except Exception as e:
        LOGGER.error(f"Error sending push notifications: {e}")
        errors.append({"error": str(e)})

    LOGGER.info(
        f"Push notification sent to user {user_id}: {sent}/{len(tokens)} succeeded"
    )
    return {"sent": sent, "errors": errors}


def _remove_invalid_token(user_id: str, token: str):
    """Remove an invalid push token from the database."""
    try:
        (
            supabase.table("user_push_tokens")
            .delete()
            .eq("user_id", user_id)
            .eq("expo_push_token", token)
            .execute()
        )
        LOGGER.info(f"Removed invalid push token for user {user_id}")
    except Exception as e:
        LOGGER.warning(f"Failed to remove invalid token: {e}")


def _is_todays_activity(session_id: str) -> bool:
    """
    Returns True if the session's start_time is today (UTC).
    Only today's activities warrant a push notification — older sessions are not
    actionable and bulk historical syncs should not trigger notifications.
    """
    result = (
        supabase.table("sessions")
        .select("start_time")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not result.data or not result.data.get("start_time"):
        return False
    session_date = datetime.fromisoformat(result.data["start_time"]).date()
    return session_date == datetime.now(timezone.utc).date()


async def send_feedback_notification(
    user_id: str,
    feedback_text: str,
    session_id: str,
) -> None:
    """
    Send a push notification with ride feedback.
    Checks user preference before sending.
    Only sends for today's activities — skips historical sessions (e.g. bulk syncs).
    """
    if not _is_todays_activity(session_id):
        LOGGER.debug(
            f"Session {session_id} is not from today, skipping feedback notification"
        )
        return

    prefs = (
        supabase.table("user_infos")
        .select("push_notification_feedback")
        .eq("user_id", user_id)
        .execute()
    )

    if not (
        prefs.data
        and len(prefs.data) > 0
        and prefs.data[0].get("push_notification_feedback", False)
    ):
        LOGGER.debug(f"User {user_id} has feedback notifications disabled")
        return

    truncated = (
        feedback_text[:200] + "..." if len(feedback_text) > 200 else feedback_text
    )

    await send_push_notification(
        user_id=user_id,
        title="Trainer Feedback",
        body=truncated,
        data={"type": "feedback", "session_id": session_id},
    )
