import os
from datetime import datetime, timezone
from typing import Annotated, Optional, TypedDict
from uuid import uuid4

from agent.core.error_handler import handle_error
from agent.core.singletons import (
    get_chat_history_connection_pool,
    get_llm,
    get_user_llm,
)
from agent.log import LOGGER
from agent.personas import DEFAULT_PERSONA
from agent.security import MAX_INPUT_LENGTH, sanitize_input, validate_input
from agent.system_prompts import get_system_prompt
from agent.tools.context_tools import get_compact_weekly_context
from agent.tools.tools import tools_main_agent
from agent.utils import write_to_stream
from api.utils.chat_history import get_last_user_message_time
from langchain_core.messages import (
    AIMessage,
    AnyMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.messages.modifier import RemoveMessage
from langchain_core.messages.utils import count_tokens_approximately
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langmem.short_term import SummarizationNode

# Optional Langfuse import
try:
    from langfuse.langchain import CallbackHandler

    LANGFUSE_AVAILABLE = True
except ImportError:
    LOGGER.warning("Langfuse not installed - tracing disabled")
    CallbackHandler = None
    LANGFUSE_AVAILABLE = False
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode


class BYOKError(Exception):
    """Raised when a user's BYOK OpenRouter API key fails (rate limit, invalid, etc.)."""

    def __init__(self, user_message: str, internal_message: str):
        self.user_message = user_message
        self.internal_message = internal_message
        super().__init__(internal_message)


# Configuration - only load environment variables once at module level
CHAT_HISTORY_DB_CONN_STRING = os.getenv("CHAT_HISTORY_DB_CONN_STRING")
environment = os.getenv("ENVIRONMENT", "development")

# Summarization configuration
MAX_CONVERSATION_TOKENS = 8000  # Token threshold to trigger summarization
MAX_SUMMARY_TOKENS = 2000  # Maximum tokens for summary text
MODEL_CONTEXT_WINDOW = 32000  # Gemini 2.5 Flash context window

# Configure Langfuse (only if available and keys are present)
langfuse_handler = None
if LANGFUSE_AVAILABLE and os.getenv("LANGFUSE_PUBLIC_API_KEY"):
    try:
        os.environ["LANGFUSE_PUBLIC_KEY"] = os.getenv("LANGFUSE_PUBLIC_API_KEY")
        os.environ["LANGFUSE_SECRET_KEY"] = os.getenv("LANGFUSE_SECRET_API_KEY")
        os.environ["LANGFUSE_HOST"] = os.getenv("LANGFUSE_HOST")
        os.environ["LANGFUSE_TRACING_ENVIRONMENT"] = environment
        langfuse_handler = CallbackHandler()
        LOGGER.info("✅ Langfuse tracing configured")
    except Exception as e:
        LOGGER.warning(f"Failed to initialize Langfuse: {e}")
        langfuse_handler = None
elif not LANGFUSE_AVAILABLE:
    LOGGER.debug("Langfuse not available (not installed)")
else:
    LOGGER.debug("Langfuse not configured (no API keys)")


# State Definition
class ChatAgentState(TypedDict):
    """State for the MainAgent workflow."""

    # Core conversation
    messages: Annotated[list[AnyMessage], add_messages]
    user_query: Optional[str]  # The most recent user query
    summary: Optional[
        str
    ]  # Summary of earlier conversation when messages are condensed

    # Agent behavior
    trainer_name: Optional[str]  # Selected trainer persona

    # Response generation
    final_response: Optional[str]  # Final response to user
    error: Optional[str]  # Error message if any

    # Metadata
    user_id: Optional[str]  # User identifier for tool access
    thread_id: Optional[str]  # Thread identifier for conversation tracking


# Cache for compiled graph to avoid recreating on every request
_compiled_graph_cache = None
_graph_cache_lock = None


def _get_llm_with_tools(openrouter_api_key: Optional[str] = None) -> ChatOpenAI:
    """
    Get LLM instance bound with tools (lazy initialization).

    Args:
        openrouter_api_key: Optional user-provided BYOK API key. If provided,
            creates a per-user LLM instance instead of using the shared singleton.

    Returns:
        ChatOpenAI: LLM instance with tools bound
    """
    try:
        if openrouter_api_key:
            llm = get_user_llm(openrouter_api_key, "google/gemini-2.5-flash")
            LOGGER.debug("Using BYOK LLM instance")
        else:
            llm = get_llm("google/gemini-2.5-flash")

        llm_with_tools = llm.bind_tools(tools_main_agent)
        LOGGER.debug(f"LLM bound with {len(tools_main_agent)} tools")
        return llm_with_tools

    except Exception as e:
        LOGGER.error(f"Failed to bind tools to LLM: {e}")
        # Fallback: return LLM without tools
        if openrouter_api_key:
            return get_user_llm(openrouter_api_key, "google/gemini-2.5-flash")
        return get_llm("google/gemini-2.5-flash")


async def _get_temporal_context(user_id: str, thread_id: str) -> str:
    """
    Get temporal context including current time and time since last user message.

    Args:
        user_id: User ID for fetching last interaction from chat history
        thread_id: Thread ID for fetching last interaction from chat history

    Returns:
        Formatted temporal context string for system prompt
    """
    try:
        # Get current time
        current_time = datetime.now(timezone.utc)
        current_time_str = current_time.strftime("%A, %Y-%m-%d %H:%M:%S UTC")

        # Fetch last interaction time from chat history
        last_interaction = await get_last_user_message_time(user_id, thread_id)

        if last_interaction:
            # Calculate time difference
            time_diff = current_time - last_interaction

            # Format human-readable duration
            days = time_diff.days
            hours = time_diff.seconds // 3600
            minutes = (time_diff.seconds % 3600) // 60

            if days > 0:
                duration_str = f"{days} day{'s' if days > 1 else ''}" + (
                    f" and {hours} hour{'s' if hours > 1 else ''}" if hours > 0 else ""
                )
            elif hours > 0:
                duration_str = f"{hours} hour{'s' if hours > 1 else ''}" + (
                    f" and {minutes} minute{'s' if minutes > 1 else ''}"
                    if minutes > 0
                    else ""
                )
            elif minutes > 0:
                duration_str = f"{minutes} minute{'s' if minutes > 1 else ''}"
            else:
                duration_str = "less than a minute"

            temporal_context = f"""
TEMPORAL CONTEXT:
- Current date and time: {current_time_str}
- Last user message was: {last_interaction.strftime("%A, %Y-%m-%d %H:%M:%S UTC")} ({duration_str} ago)

IMPORTANT: Consider the time gap when responding. If significant time has passed (hours or days), adjust your response accordingly. For example:
- If it's been a day or more, the user may be asking about training for TODAY (current date)
- If it's been several days, check for new training data since the last conversation
- Use the get_current_datetime() tool if you need precise current time for recommendations"""

        else:
            # First message in thread
            temporal_context = f"""
TEMPORAL CONTEXT:
- Current date and time: {current_time_str}
- This is the first message in this conversation thread"""

        return temporal_context

    except Exception as e:
        LOGGER.warning(f"Failed to get temporal context: {e}")
        # Fallback to just current time
        current_time = datetime.now(timezone.utc)
        return f"""
TEMPORAL CONTEXT:
- Current date and time: {current_time.strftime("%A, %Y-%m-%d %H:%M:%S UTC")}"""


async def _save_messages_to_history(state: ChatAgentState, assistant_response: str):
    """
    Save assistant response to chat_history table.

    Note: Actions are saved immediately when they occur (in write_to_stream),
    not batched here at the end. This ensures correct chronological ordering.

    Args:
        state: Current agent state containing user_id and thread info
        assistant_response: The assistant's response text
    """
    try:
        # Import here to avoid circular dependencies
        from api.utils.chat_history import save_assistant_message

        user_id = state.get("user_id")

        if not user_id:
            LOGGER.warning("Cannot save to chat_history: user_id not in state")
            return

        thread_id = state.get("thread_id")
        if not thread_id:
            LOGGER.warning("Cannot save to chat_history: thread_id not in state")
            return

        # Save assistant message
        await save_assistant_message(
            user_id=user_id,
            thread_id=thread_id,
            content=assistant_response,
            agent_type="main_agent",
        )
        LOGGER.info("✅ Saved assistant message to chat_history")

        # Actions are now saved immediately in write_to_stream() for correct ordering
        # No need to save them here

    except Exception as e:
        # Don't fail the conversation if saving fails
        LOGGER.error(f"❌ Failed to save messages to chat_history: {e}", exc_info=True)


async def node_summarize_conversation(
    state: ChatAgentState, config: RunnableConfig
) -> dict:
    """
    Summarize conversation when token threshold is exceeded.

    Uses langmem's SummarizationNode to condense the message history while
    preserving important context.

    Args:
        state: Current agent state
        config: Runnable config containing callbacks and metadata

    Returns:
        Updated state with condensed messages
    """
    LOGGER.info("🔄 SUMMARIZATION NODE TRIGGERED")

    try:
        messages = state.get("messages", [])

        # Count tokens before summarization
        token_count_before = count_tokens_approximately(messages)
        message_count_before = len(messages)

        LOGGER.info("📊 Pre-summarization stats:")
        LOGGER.info(f"  - Messages: {message_count_before}")
        LOGGER.info(f"  - Tokens: {token_count_before}")
        LOGGER.debug(f"  - Message types: {[type(m).__name__ for m in messages]}")

        # Create summarization node with langmem
        summarization_node = SummarizationNode(
            token_counter=count_tokens_approximately,
            model=get_llm("google/gemini-2.5-flash"),
            max_tokens=MAX_CONVERSATION_TOKENS,  # Threshold for summarization
            max_summary_tokens=MAX_SUMMARY_TOKENS,  # Budget for summary
            output_messages_key="messages",  # Replace messages in state
        )

        LOGGER.debug("🤖 Calling summarization LLM...")

        # Execute summarization
        result = await summarization_node.ainvoke(state, config=config)

        # Count tokens after summarization (filter out RemoveMessage instances)
        new_messages = result.get("messages", [])
        # RemoveMessage is a special marker used by LangGraph to indicate messages to remove
        actual_messages = [m for m in new_messages if not isinstance(m, RemoveMessage)]

        token_count_after = count_tokens_approximately(actual_messages)
        message_count_after = len(actual_messages)

        # Calculate reduction
        token_reduction = token_count_before - token_count_after
        token_reduction_pct = (
            (token_reduction / token_count_before * 100)
            if token_count_before > 0
            else 0
        )
        message_reduction = message_count_before - message_count_after

        LOGGER.info("✅ Summarization complete!")
        LOGGER.info("📊 Post-summarization stats:")
        LOGGER.info(
            f"  - Messages: {message_count_after} (reduced by {message_reduction})"
        )
        LOGGER.info(
            f"  - Tokens: {token_count_after} (reduced by {token_reduction}, {token_reduction_pct:.1f}%)"
        )

        # Log summary preview if available
        summary_messages = [
            m
            for m in actual_messages
            if isinstance(m, SystemMessage) and "summary" in m.content.lower()
        ]
        if summary_messages:
            summary_preview = summary_messages[0].content[:200]
            LOGGER.debug(f"  - Summary preview: {summary_preview}...")

        return result

    except Exception as e:
        LOGGER.error(f"❌ Summarization failed: {e}", exc_info=True)
        LOGGER.warning("⚠️ Continuing with original messages (no summarization)")
        # Return original state if summarization fails
        return {"messages": state.get("messages", [])}


async def node_generate_response(state: ChatAgentState, config: RunnableConfig) -> dict:
    """Generate a response using LLM with tools.

    Args:
        state: Current agent state
        config: Runnable config containing callbacks and metadata for tracing
    """
    LOGGER.info("🚀 Starting node_generate_response")
    LOGGER.info(f"📊 State keys: {list(state.keys())}")
    LOGGER.info(f"👤 User ID: {state.get('user_id')}")
    LOGGER.info(f"🧵 Thread ID: {state.get('thread_id')}")

    try:
        # Get ALL messages from the current state (includes persisted conversation history)
        messages = state.get("messages", [])

        # Count tokens and analyze message composition
        token_count = count_tokens_approximately(messages) if messages else 0
        message_types = {}
        for msg in messages:
            msg_type = type(msg).__name__
            message_types[msg_type] = message_types.get(msg_type, 0) + 1

        LOGGER.info("📋 Conversation state:")
        LOGGER.info(f"  - Total messages: {len(messages)}")
        LOGGER.info(
            f"  - Token count: {token_count} / {MAX_CONVERSATION_TOKENS} (context limit)"
        )
        LOGGER.debug(f"  - Message breakdown: {message_types}")

        # if last message is result of tool call log the result
        last_message = messages[-1] if messages else None
        if isinstance(last_message, ToolMessage):
            LOGGER.debug(
                f"  - Last tool result preview: {str(last_message.content)[:200]}..."
            )

        write_to_stream({"type": "status", "content": "Thinking"})

        # Get user_id and thread_id for context
        user_id = state.get("user_id")
        thread_id = state.get("thread_id")

        # Get temporal context (fetches last interaction from chat history)
        temporal_context = await _get_temporal_context(user_id, thread_id)

        # Get weekly training context for system prompt
        weekly_context = ""
        if user_id:
            try:
                weekly_context = get_compact_weekly_context(user_id)
            except Exception as e:
                LOGGER.warning(f"Failed to get weekly context: {e}")
                weekly_context = (
                    "TRAINING CONTEXT: Unable to load current training data"
                )

        # Build system prompt with dynamic weekly context and temporal awareness
        system_prompt_content = get_system_prompt(
            temporal_context=temporal_context, weekly_context=weekly_context
        )

        # Ensure the current user query is in the message history
        # Only add if it's not already the last HumanMessage in the conversation

        # Build message list for LLM
        llm_messages = [
            SystemMessage(content=system_prompt_content, id=str(uuid4()))
        ] + messages

        # Log LLM call details
        system_prompt_tokens = (
            count_tokens_approximately([llm_messages[0]]) if llm_messages else 0
        )
        total_llm_tokens = count_tokens_approximately(llm_messages)

        LOGGER.info("🤖 Preparing LLM call:")
        LOGGER.info(f"  - Total messages to LLM: {len(llm_messages)}")
        LOGGER.info(f"  - System prompt tokens: {system_prompt_tokens}")
        LOGGER.info(f"  - Total input tokens: {total_llm_tokens}")
        LOGGER.debug(f"  - System prompt length: {len(system_prompt_content)} chars")
        LOGGER.debug(f"  - User query: {state.get('user_query', '')[:100]}...")

        # Get LLM with tools (lazy initialization)
        # Use BYOK key from config if available
        byok_key = config.get("configurable", {}).get("openrouter_api_key")
        llm_with_tools = _get_llm_with_tools(openrouter_api_key=byok_key)

        LOGGER.debug(f"🔧 LLM has {len(tools_main_agent)} tools available")

        # Stream the response - we MUST fully consume the stream for Langfuse to track properly
        # We cannot break early, even when tool calls are detected
        agent_message = ""
        has_tool_calls = False
        full_response = None  # Accumulated complete response from all chunks

        async for chunk in llm_with_tools.astream(llm_messages, config=config):
            # Accumulate chunks to build the complete response
            # Each chunk is an incremental AIMessageChunk - they must be concatenated
            # to reconstruct the full message with complete tool call arguments
            if full_response is None:
                full_response = chunk
            else:
                full_response = full_response + chunk

            if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                # Tool calls detected - mark it but continue consuming stream
                if not has_tool_calls:
                    has_tool_calls = True
                    LOGGER.info(
                        f"🔧 Tool calls detected: {[tc.get('name') for tc in chunk.tool_calls]}"
                    )
                # Don't stream content when tool calls are present
            elif hasattr(chunk, "content") and chunk.content:
                # Regular content chunk - stream it to user
                write_to_stream({"type": "chunk", "content": chunk.content})
                agent_message += chunk.content

        # Check if we found tool calls (use accumulated full_response which has complete args)
        if full_response and hasattr(full_response, "tool_calls") and full_response.tool_calls:
            tool_call_names = [
                tc.get("name") for tc in full_response.tool_calls
            ]
            LOGGER.info("✅ LLM Response received:")
            LOGGER.info(
                f"  - Response type: Tool calls ({len(full_response.tool_calls)})"
            )
            LOGGER.info(f"  - Tools to execute: {tool_call_names}")
            if agent_message:
                LOGGER.info(f"  - Partial content length: {len(agent_message)} chars")
            LOGGER.debug(
                f"  - Tool call details: {[{tc.get('name'): tc.get('args')} for tc in full_response.tool_calls]}"
            )
            LOGGER.info(
                "✅ Completed node_generate_response - Proceeding to tool execution"
            )

            # CRITICAL: If we streamed any content before tool calls were detected,
            # we must finalize that partial message to prevent concatenation bugs
            if agent_message:
                LOGGER.info(
                    f"⚠️ Finalizing partial content ({len(agent_message)} chars) before tool execution"
                )
                # Save to database BEFORE sending ENDOF_STREAM (prevent race condition)
                await _save_messages_to_history(state, agent_message)
                # Now send ENDOF_STREAM to finalize in UI
                write_to_stream({"type": "ENDOF_STREAM", "content": ""})

            write_to_stream({"type": "info", "content": "Calling tools..."})

            # Ensure content is never None (prevents Langfuse "undefined" error)
            if full_response.content is None:
                full_response.content = ""

            result = {
                "messages": [full_response],
                "error": None,
            }

        else:
            # No tool calls, we have the complete response
            LOGGER.info("✅ LLM Response received:")
            LOGGER.info("  - Response type: Final text response")
            LOGGER.info(f"  - Response length: {len(agent_message)} chars")
            LOGGER.debug(f"  - Response preview: {agent_message[:200]}...")
            LOGGER.info(
                "✅ Completed node_generate_response - Final response generated"
            )

            # CRITICAL: Save to database BEFORE sending ENDOF_STREAM
            # This prevents race condition where frontend reloads messages from DB
            # before save completes, causing the message to disappear
            await _save_messages_to_history(state, agent_message)

            # Now that message is saved, send ENDOF_STREAM to finalize in UI
            write_to_stream({"type": "ENDOF_STREAM", "content": agent_message})

            result = {
                "messages": [AIMessage(content=agent_message, id=str(uuid4()))],
                "error": None,
            }
        return result

    except Exception as e:
        # Check if this is a BYOK API key error (rate limit, invalid key, etc.)
        byok_key = config.get("configurable", {}).get("openrouter_api_key")
        error_str = str(e).lower()
        if byok_key and (
            "403" in str(e)
            or "401" in str(e)
            or "key limit" in error_str
            or "permission" in error_str
            or "insufficient" in error_str
        ):
            LOGGER.warning(f"BYOK API key error for user {state.get('user_id')}: {e}")
            # Try to extract the OpenRouter error message
            error_message = "Your OpenRouter API key was rejected. Please check your key's limits and billing."
            try:
                raw = str(e)
                if "'message': '" in raw:
                    extracted = raw.split("'message': '", 1)[-1].split("'", 1)[0]
                    if extracted:
                        error_message = f"There's an issue with your OpenRouter API key: {extracted}"
            except Exception:
                pass
            # Raise BYOKError to be caught by astream_main_agent, which yields
            # directly to the WebSocket — bypassing LangGraph's custom stream
            # buffer which may not flush events from exception handlers reliably.
            raise BYOKError(user_message=error_message, internal_message=str(e))

        # Handle other errors internally, never expose to user
        # Extract thread_id safely - messages contain LangChain objects, not dicts
        messages = state.get("messages", [])
        first_msg_id = getattr(messages[0], "id", None) if messages else None

        agent_error = handle_error(
            e,
            context="generating response",
            user_id=state.get("user_id"),
            thread_id=first_msg_id,
        )

        # Send user-friendly message
        error_message = agent_error.user_message
        write_to_stream({"type": "status", "content": error_message})

        # Return error state
        return {
            "messages": [
                AIMessage(
                    content=error_message,
                    id=str(uuid4()),
                )
            ],
            "error": agent_error.internal_message,
        }


async def astream_main_agent(
    user_query,
    user_id,
    thread_id,
    trainer_name: str = DEFAULT_PERSONA["name"],
    openrouter_api_key: Optional[str] = None,
):
    """Run the agent workflow in streaming mode.

    Args:
        user_query: The user's message
        user_id: User ID
        thread_id: Thread ID
        trainer_name: Selected trainer persona name
        openrouter_api_key: Optional decrypted BYOK OpenRouter API key
    """
    LOGGER.info("=" * 80)
    LOGGER.info("🚀 NEW AGENT WORKFLOW STARTING")
    LOGGER.info(f"  - User ID: {user_id}")
    LOGGER.info(f"  - Thread ID: {thread_id}")
    LOGGER.info(
        f"  - User query: {user_query[:100]}{'...' if len(user_query) > 100 else ''}"
    )
    LOGGER.info(f"  - Trainer: {trainer_name}")
    LOGGER.info(f"  - BYOK: {'yes' if openrouter_api_key else 'no'}")
    LOGGER.info("=" * 80)

    # === SECURITY: Input Validation ===
    # Check input length
    if len(user_query) > MAX_INPUT_LENGTH:
        LOGGER.warning(
            f"🛡️ Input rejected: too long ({len(user_query)} > {MAX_INPUT_LENGTH})"
        )
        yield {
            "type": "chunk",
            "content": "Your message is too long. Please shorten it and try again.",
        }
        yield {"type": "ENDOF_STREAM", "content": ""}
        return

    # Validate for injection attempts
    is_valid, rejection_reason = validate_input(user_query)
    LOGGER.info(
        f"✅ Input validation result: is_valid={is_valid}, reason={rejection_reason}"
    )
    if not is_valid:
        # trigger an error log to monitor injection attempts in sentry
        LOGGER.error(
            f"🛡️ Potential injection blocked: reason={rejection_reason}, "
            f"user_id={user_id}, query_preview={user_query[:100]}"
        )
        # Return soft response - don't reveal that injection was detected
        # TODO this is not added to message history
        yield {
            "type": "chunk",
            "content": "I'm Simon, your fitness coach. How can I help with your training today?",
        }
        yield {"type": "ENDOF_STREAM", "content": ""}
        return

    # Sanitize input
    user_query = sanitize_input(user_query)

    # Check analytics consent before enabling Langfuse
    from api.utils.consent import check_analytics_consent

    has_consent = check_analytics_consent(user_id)

    # Build config with callbacks only if langfuse is configured AND user consented
    callbacks = [langfuse_handler] if langfuse_handler and has_consent else []

    LOGGER.debug("🔧 Runnable config:")
    LOGGER.debug(f"  - Callbacks: {len(callbacks)} configured")
    LOGGER.debug(
        f"  - Langfuse tracing: {'enabled' if langfuse_handler and has_consent else 'disabled'}"
        f"{' (no consent)' if langfuse_handler and not has_consent else ''}"
    )
    LOGGER.debug("  - Recursion limit: 20")

    configurable = {
        "thread_id": thread_id,
        "user_id": user_id,
    }
    if openrouter_api_key:
        configurable["openrouter_api_key"] = openrouter_api_key

    config = RunnableConfig(
        configurable=configurable,
        callbacks=callbacks,
        metadata={
            "langfuse_user_id": user_id,
            "langfuse_session_id": thread_id,
        }
        if langfuse_handler
        else {},
        recursion_limit=20,  # Limit recursion to prevent infinite loops
    )

    initial_state: ChatAgentState = {
        "messages": [HumanMessage(content=user_query, id=str(uuid4()))],
        "user_query": user_query,
        "summary": None,  # Will be populated if conversation gets summarized
        "trainer_name": trainer_name,
        "final_response": None,
        "error": None,
        "user_id": user_id,
        "thread_id": thread_id,
    }

    graph = await get_compiled_graph()

    try:
        async for event in graph.astream(
            initial_state, config=config, stream_mode="custom"
        ):
            yield event
    except Exception as e:
        # Check if this is a BYOKError (direct or wrapped by LangGraph)
        byok_err = None
        if isinstance(e, BYOKError):
            byok_err = e
        elif isinstance(getattr(e, "__cause__", None), BYOKError):
            byok_err = e.__cause__
        elif isinstance(getattr(e, "__context__", None), BYOKError):
            byok_err = e.__context__

        if byok_err:
            LOGGER.warning(
                f"BYOK error caught in astream_main_agent: {byok_err.user_message}"
            )
            # Yield a single error_message event — the frontend handles this
            # atomically (creates a complete non-streaming message + resets state).
            # This avoids timing issues with chunk→ENDOF_STREAM in React Native.
            yield {"type": "error_message", "content": byok_err.user_message}
            # Save error message to chat history
            try:
                from api.utils.chat_history import save_assistant_message

                await save_assistant_message(
                    user_id=user_id,
                    thread_id=thread_id,
                    content=byok_err.user_message,
                    agent_type="main_agent",
                )
            except Exception as save_err:
                LOGGER.error(f"Failed to save BYOK error to chat history: {save_err}")
        else:
            raise  # Re-raise non-BYOK errors for chat.py fallback


async def safe_tool_node(state: ChatAgentState, config: RunnableConfig) -> dict:
    """
    Wrapper around ToolNode that ensures proper output formatting.

    Ensures all tool messages have defined content.

    Args:
        state: The current agent state
        config: The runnable config (required by LangGraph, contains configurable params and callbacks)
    """
    try:
        # Create ToolNode instance with error handling enabled
        # handle_tool_errors=True ensures validation errors (e.g. missing required args)
        # are returned as ToolMessages with correct tool_call_id instead of raising exceptions
        tool_node_instance = ToolNode(tools=tools_main_agent, handle_tool_errors=True)

        # Log which tools are being called for debugging
        messages = state.get("messages", [])
        tool_calls = []
        if messages:
            last_msg = messages[-1]
            if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
                tool_calls = last_msg.tool_calls
                tool_names = [tc.get("name") for tc in tool_calls]
                LOGGER.info("🔧 Tool execution starting:")
                LOGGER.info(f"  - Number of tools: {len(tool_calls)}")
                LOGGER.info(f"  - Tools: {tool_names}")
                for tc in tool_calls:
                    LOGGER.debug(f"  - {tc.get('name')}: {tc.get('args')}")

        # Execute tools with the provided config
        LOGGER.debug("⚙️ Invoking tool node...")
        result = await tool_node_instance.ainvoke(state, config=config)
        LOGGER.debug("✅ Tool node invocation complete")

        # Ensure result has proper format with messages
        if not isinstance(result, dict):
            LOGGER.warning(f"Tool node returned non-dict result: {type(result)}")
            result = {"messages": []}
        elif "messages" not in result:
            LOGGER.warning("Tool node result missing 'messages' key")
            result["messages"] = []

        # Ensure all tool messages have defined content
        for msg in result.get("messages", []):
            if isinstance(msg, ToolMessage):
                # Handle None content
                if msg.content is None:
                    msg.content = "Tool executed successfully (no output)"
                # Handle empty string content
                elif msg.content == "":
                    msg.content = "Tool executed successfully (no output)"
                # Handle dict content
                elif isinstance(msg.content, dict):
                    import json

                    try:
                        msg.content = json.dumps(msg.content, ensure_ascii=False)
                    except Exception as e:
                        LOGGER.warning(f"Failed to serialize dict content: {e}")
                        msg.content = str(msg.content)
                # Ensure content is always a string
                elif not isinstance(msg.content, str):
                    msg.content = str(msg.content)

                # Final validation: ensure it's not just whitespace
                if isinstance(msg.content, str) and msg.content.strip() == "":
                    msg.content = "Tool executed successfully (no output)"

        # Log tool results
        tool_messages = result.get("messages", [])
        LOGGER.info("✅ Tool execution complete:")
        LOGGER.info(f"  - Tool messages generated: {len(tool_messages)}")
        for tm in tool_messages:
            if isinstance(tm, ToolMessage):
                content_preview = str(tm.content)[:150] if tm.content else "No content"
                LOGGER.debug(f"  - Tool result preview: {content_preview}...")

        return result
    except Exception as e:
        LOGGER.error(f"Error in tool execution: {e}", exc_info=True)
        # Return error as ToolMessages matching each pending tool call ID
        # Using the correct tool_call_id is critical so the LLM can associate
        # the error with its original tool call and retry properly
        error_messages = []
        for tc in tool_calls:
            error_messages.append(
                ToolMessage(
                    content=f"Tool execution failed: {str(e)}",
                    tool_call_id=tc.get("id", str(uuid4())),
                )
            )
        if not error_messages:
            error_messages.append(
                ToolMessage(
                    content=f"Tool execution failed: {str(e)}",
                    tool_call_id=str(uuid4()),
                )
            )
        return {"messages": error_messages}


def should_summarize(state: ChatAgentState) -> str:
    """
    Check if conversation needs summarization based on token count.

    Args:
        state: Current agent state

    Returns:
        "summarize" if token threshold exceeded, "continue" otherwise
    """
    messages = state.get("messages", [])

    if not messages:
        LOGGER.debug("🚦 No messages - skipping summarization check")
        return "continue"

    # Count tokens in current conversation
    token_count = count_tokens_approximately(messages)

    LOGGER.debug(f"🚦 Token check: {token_count} / {MAX_CONVERSATION_TOKENS} tokens")

    if token_count > MAX_CONVERSATION_TOKENS:
        LOGGER.info(
            f"⚠️ Token threshold exceeded ({token_count} > {MAX_CONVERSATION_TOKENS})"
        )
        LOGGER.info("🚦 Routing to summarization node")
        return "summarize"

    LOGGER.debug("✅ Token count within limits - proceeding to response generation")
    return "continue"


workflow = StateGraph(ChatAgentState)
workflow.add_node("node_summarize", node_summarize_conversation)
workflow.add_node("node_generate_response", node_generate_response)
workflow.add_node("tool_node", safe_tool_node)


def tool_node_or_END(state: ChatAgentState) -> str:
    """Determine if we should continue to tool execution or end."""

    LOGGER.info("🚀 Starting tool_node_or_END function")
    LOGGER.debug(f"  - State keys: {list(state.keys())}")

    last_message = state.get("messages", [])[-1] if state.get("messages") else None

    if last_message:
        LOGGER.debug(f"  - Last message type: {type(last_message).__name__}")

    if (
        isinstance(last_message, AIMessage)
        and hasattr(last_message, "tool_calls")
        and last_message.tool_calls
    ):
        tool_names = [tc.get("name") for tc in last_message.tool_calls]
        LOGGER.info(f"🚦 Routing to tool_node - Tools: {tool_names}")
        return "tool_node"

    LOGGER.info("🚦 Routing to END - No tool calls")
    return END


# Set conditional entry point to check for summarization
workflow.set_conditional_entry_point(
    should_summarize,
    {"summarize": "node_summarize", "continue": "node_generate_response"},
)

# After summarization, proceed to response generation
workflow.add_edge("node_summarize", "node_generate_response")

# Response generation can lead to tool execution or end
workflow.add_conditional_edges("node_generate_response", tool_node_or_END)

# After tool execution, loop back to response generation
workflow.add_edge("tool_node", "node_generate_response")


async def get_compiled_graph():
    """
    Get or compile the graph with checkpointer (cached after first compilation).

    Returns:
        Compiled LangGraph workflow with checkpointer for conversation memory
    """
    global _compiled_graph_cache, _graph_cache_lock

    # Initialize lock on first access
    if _graph_cache_lock is None:
        import asyncio

        _graph_cache_lock = asyncio.Lock()

    # Return cached graph if available
    if _compiled_graph_cache is not None:
        LOGGER.debug("Reusing cached compiled graph")
        return _compiled_graph_cache

    # Compile graph (with lock to prevent duplicate compilation)
    async with _graph_cache_lock:
        # Double-check after acquiring lock
        if _compiled_graph_cache is not None:
            return _compiled_graph_cache

        LOGGER.info("Compiling workflow graph (first time)...")

        # Initialize memory checkpointer for conversation persistence
        connection_pool = await get_chat_history_connection_pool()
        checkpointer = None

        if connection_pool:
            checkpointer = AsyncPostgresSaver(connection_pool)
            await checkpointer.setup()
            LOGGER.info("💾 Checkpointer configured with connection pool")
            LOGGER.debug(
                "  - Checkpointer will persist conversation state to PostgreSQL"
            )
        else:
            LOGGER.warning(
                "⚠️ Running without checkpointer - conversation history disabled"
            )

        # Compile graph with checkpointer for conversation memory
        _compiled_graph_cache = workflow.compile(checkpointer=checkpointer)
        LOGGER.info("✅ Workflow graph compiled and cached")

        return _compiled_graph_cache


async def main():
    test_user_id = "2e04d74c-3d0b-45bc-83a0-bbdd8640b6a5"
    thread_id = str(uuid4())

    while True:
        user_input = input("\nYour question (or 'q' to quit): ")
        if user_input.lower() == "q":
            break
        else:
            first_chunk = True
            async for event in astream_main_agent(user_input, test_user_id, thread_id):
                if event.get("type") == "chunk":
                    if first_chunk:
                        LOGGER.info(
                            "\nAGENT RESPONSE START-----------------------------------------"
                        )
                        LOGGER.info(f"{event.get('content', '')}")
                        first_chunk = False
                    else:
                        LOGGER.info(f"{event.get('content', '')}")
                elif event.get("type") == "ENDOF_STREAM":
                    LOGGER.info(
                        "\nAGENT RESPONSE END-----------------------------------------"
                    )
                    first_chunk = True
                else:
                    LOGGER.debug(f"Event: {event}")


if __name__ == "__main__":
    import asyncio

    # python3 -m agent.main_agent
    asyncio.run(main())
