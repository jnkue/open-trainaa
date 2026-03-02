"""
Chat history utilities for persisting and retrieving messages from Supabase.

This module handles saving user messages, assistant messages, and action messages
to the chat_history table for persistent storage and retrieval.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from api.database import supabase
from api.log import LOGGER


async def save_message(
    user_id: str,
    thread_id: str,
    role: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
    agent_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Save a message to the chat_history table.

    Args:
        user_id: User ID (UUID)
        thread_id: Thread ID
        role: Message role ('user', 'assistant', 'action', or 'system')
        content: Message content (for actions, should be JSON string)
        metadata: Optional metadata dictionary
        agent_type: Optional agent type that handled the message

    Returns:
        Saved message record

    Raises:
        Exception: If save operation fails
    """
    try:
        message_data = {
            "id": str(uuid4()),
            "user_id": user_id,
            "thread_id": thread_id,
            "role": role,
            "content": content,
            "metadata": metadata or {},
            "agent_type": agent_type,
            # Don't set created_at - let the database use DEFAULT NOW()
            # This ensures consistent timestamps from the database
        }

        response = supabase.table("chat_history").insert(message_data).execute()

        if response.data:
            LOGGER.debug(
                f"✅ Saved {role} message to chat_history (thread: {thread_id[:8]}...)"
            )
            return response.data[0]
        else:
            raise Exception("No data returned from chat_history insert")

    except Exception as e:
        LOGGER.error(f"❌ Failed to save message to chat_history: {e}")
        raise


async def get_thread_messages(
    user_id: str, thread_id: str, limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Retrieve all messages for a thread from chat_history table.

    Args:
        user_id: User ID (UUID) for security filtering
        thread_id: Thread ID to retrieve messages for
        limit: Optional limit on number of messages to return

    Returns:
        List of message dictionaries ordered by created_at

    Raises:
        Exception: If query fails
    """
    try:
        # Order by created_at first, then by id as a tiebreaker for messages
        # created at the same millisecond
        query = (
            supabase.table("chat_history")
            .select("id, role, content, metadata, agent_type, created_at")
            .eq("user_id", user_id)
            .eq("thread_id", thread_id)
            .order("created_at", desc=False)
            .order("id", desc=False)  # Secondary sort by id for consistency
        )

        if limit:
            query = query.limit(limit)

        response = query.execute()

        messages = response.data or []
        LOGGER.debug(
            f"✅ Retrieved {len(messages)} messages from chat_history (thread: {thread_id[:8]}...)"
        )
        return messages

    except Exception as e:
        LOGGER.error(f"❌ Failed to retrieve messages from chat_history: {e}")
        raise


async def save_user_message(
    user_id: str, thread_id: str, content: str
) -> Dict[str, Any]:
    """
    Convenience function to save a user message.

    Args:
        user_id: User ID
        thread_id: Thread ID
        content: User message content

    Returns:
        Saved message record
    """
    return await save_message(user_id, thread_id, "user", content)


async def save_assistant_message(
    user_id: str,
    thread_id: str,
    content: str,
    agent_type: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Convenience function to save an assistant message.

    Args:
        user_id: User ID
        thread_id: Thread ID
        content: Assistant response content
        agent_type: Optional agent type
        metadata: Optional metadata

    Returns:
        Saved message record
    """
    return await save_message(
        user_id,
        thread_id,
        "assistant",
        content,
        metadata=metadata,
        agent_type=agent_type,
    )


async def save_action_message(
    user_id: str, thread_id: str, action_json: str, action_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Convenience function to save an action message.

    Args:
        user_id: User ID
        thread_id: Thread ID
        action_json: JSON string containing action details
        action_type: Optional action type for metadata

    Returns:
        Saved message record
    """
    metadata = {"action_type": action_type} if action_type else {}
    return await save_message(
        user_id, thread_id, "action", action_json, metadata=metadata
    )


async def get_last_user_message_time(
    user_id: str,
    thread_id: str,
) -> Optional[datetime]:
    """
    Get the timestamp of the previous user message in a thread.

    Note: This skips the most recent user message (offset=1) because the current
    message is already saved to the database before this is called.

    Args:
        user_id: User ID (UUID) for security filtering
        thread_id: Thread ID to retrieve the previous user message for

    Returns:
        Datetime of the previous user message, or None if no previous messages exist
    """
    try:
        response = (
            supabase.table("chat_history")
            .select("created_at")
            .eq("user_id", user_id)
            .eq("thread_id", thread_id)
            .eq("role", "user")
            .order("created_at", desc=True)
            .limit(2)
            .range(1, 1)  # Skip the first (most recent) message
            .execute()
        )

        if response.data:
            return datetime.fromisoformat(
                response.data[0]["created_at"].replace("Z", "+00:00")
            )
        return None

    except Exception as e:
        LOGGER.error(f"Failed to get last user message time: {e}")
        return None
