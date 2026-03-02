from typing import Literal, TypedDict

from agent.core.singletons import get_llm
from agent.log import LOGGER
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer


class StreamMessage(TypedDict):
    """A message structure for streaming outputs.
    type can be one of:
    - "status": General status updates.
    - "info": Informational messages
    - "chunk": Partial chunks of message
    - "action": Action performed (e.g., workout created)
    - "ENDOF_STREAM": Indicates the end of a chunk stream.

    NOTE: "error" type removed - errors should never be streamed to users.
    Use internal logging and return user-friendly status messages instead.
    """

    type: Literal["status", "info", "chunk", "action", "error_message", "ENDOF_STREAM"]
    content: str


def write_to_stream(message: StreamMessage, suppress_errors: bool = True):
    """
    Write a message to the stream with enhanced status tracking.

    Args:
        message: The message to stream to the user
        suppress_errors: If True, errors are logged but don't raise exceptions

    Note:
        This function should NEVER be used to stream errors to end users.
        All errors should be handled internally and converted to user-friendly
        status messages before streaming.

        Action messages are saved immediately to chat_history for proper ordering.
    """
    try:
        # Defensive check: ensure message is a dict, not an AIMessage or other object
        if not isinstance(message, dict):
            error_msg = f"write_to_stream expects a dict, got {type(message).__name__}"
            LOGGER.error(f"❌ {error_msg}")
            if not suppress_errors:
                raise TypeError(error_msg)
            return

        # Defensive check: ensure content is a string, not an AIMessage or other object
        content = message.get("content")
        if content is not None and not isinstance(content, str):
            error_msg = f"write_to_stream content must be a string, got {type(content).__name__}"
            LOGGER.error(f"❌ {error_msg}. Converting to string...")
            # Try to extract content if it's an AIMessage
            if hasattr(content, "content"):
                message["content"] = str(content.content)
            else:
                message["content"] = str(content)
            content = message["content"]

        # Save action messages immediately to database for correct ordering
        if message["type"] == "action":
            LOGGER.info(f"🎯 ACTION detected: {message['content'][:100]}")
            try:
                # Import here to avoid circular dependencies and get context from config
                from langgraph.config import get_config
                from api.utils.chat_history import save_action_message

                config = get_config()
                user_id = config.get("configurable", {}).get("user_id")
                thread_id = config.get("configurable", {}).get("thread_id")

                LOGGER.info(
                    f"🔑 Got config - user_id: {user_id[:8] if user_id else None}, thread_id: {thread_id[:8] if thread_id else None}"
                )

                if user_id and thread_id:
                    # Use asyncio to run the async save function
                    import asyncio

                    loop = asyncio.get_event_loop()
                    LOGGER.debug(f"📍 Event loop running: {loop.is_running()}")

                    if loop.is_running():
                        # If loop is running, schedule as a task
                        asyncio.create_task(
                            save_action_message(user_id, thread_id, message["content"])
                        )
                        LOGGER.info("✅ Action save task created (async)")
                    else:
                        # If no loop, run synchronously
                        loop.run_until_complete(
                            save_action_message(user_id, thread_id, message["content"])
                        )
                        LOGGER.info("✅ Action saved synchronously")
                else:
                    LOGGER.warning(
                        "⚠️ Cannot save action - missing user_id or thread_id in config"
                    )
            except Exception as e:
                LOGGER.error(
                    f"❌ Failed to save action immediately: {e}", exc_info=True
                )
                # Don't fail the stream, just log the error

        # Validate message structure
        message = StreamMessage(
            type=message["type"],
            content=message["content"],
        )

        # Try to get stream writer, but gracefully handle if outside runnable context
        try:
            writer = get_stream_writer()
            writer(message)
            LOGGER.debug("📨 Message written to stream successfully")
        except RuntimeError as e:
            if "Called get_config outside of a runnable context" in str(e):
                # Fallback to logging when outside runnable context
                LOGGER.debug(f"[{message['type'].upper()}] {message['content'][:100]}")
            else:
                raise e

    except Exception as e:
        LOGGER.error(f"❌ Failed to write message to stream: {e}", exc_info=True)
        if not suppress_errors:
            raise


def initialize_llm(model: str, temperature: float = 0.0) -> ChatOpenAI:
    """
    Initialize the Language Learning Model using singleton pattern.

    DEPRECATED: Use agent.core.singletons.get_llm() directly instead.

    This function is kept for backward compatibility but delegates to
    the singleton implementation to prevent duplicate initializations.

    Args:
        model: The model identifier (e.g., "google/gemini-2.5-flash")
        temperature: Temperature setting for the model

    Returns:
        ChatOpenAI: LLM instance (singleton, not recreated on each call)
    """
    return get_llm(model, temperature)
