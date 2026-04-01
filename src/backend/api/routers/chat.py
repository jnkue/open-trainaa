"""
Chat and WebSocket router for LLM communication.
"""

import json
import os
from typing import cast
from uuid import uuid4

import jwt

# from agent.main_agent import MainAgent
# from agent.old.graph import AgentState, workflow
from agent.main_agent import astream_main_agent
from api.auth import User, get_current_user, get_jwks_client
from api.database import supabase
from api.log import LOGGER
from api.utils import get_user_supabase_client
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

# from langgraph.store.postgres.aio import AsyncPostgresStore  # Temporarily disabled
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/chat", tags=["chat"])
limiter = Limiter(key_func=get_remote_address)
security_bearer = HTTPBearer()


# Environment variables
CHAT_HISTORY_DB_CONN_STRING: str = cast(str, os.getenv("CHAT_HISTORY_DB_CONN_STRING"))


def serialize_event(event):
    """Serialize LangChain objects for JSON transmission."""
    if isinstance(event, dict):
        serialized = {}
        for key, value in event.items():
            if isinstance(value, AIMessage):
                # Convert AIMessage to serializable format
                serialized[key] = {
                    "content": value.content,
                    "id": getattr(value, "id", None),
                    "type": "ai_message",
                }
            elif isinstance(value, HumanMessage):
                # Convert HumanMessage to serializable format
                serialized[key] = {
                    "content": value.content,
                    "id": getattr(value, "id", None),
                    "type": "human_message",
                }
            else:
                serialized[key] = value
        return serialized
    return event


class ThreadMessage(BaseModel):
    id: str
    content: str
    is_assistant: bool
    timestamp: str


class CreateThreadRequest(BaseModel):
    """Request model for creating a new thread."""

    trainer: str = "Simon"


class CreateThreadResponse(BaseModel):
    """Response model for creating a new thread."""

    thread_id: str
    trainer: str
    created_at: str


class ChatMessage(BaseModel):
    """A single chat message in a thread."""

    id: str
    role: str  # "user", "assistant", "action", or "system"
    content: str
    created_at: str
    metadata: dict = {}


class ThreadMessagesResponse(BaseModel):
    """Response model for thread messages endpoint."""

    thread_id: str
    messages: list[ChatMessage]
    total_messages: int


@router.websocket("/{thread_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    thread_id: str,
    token: str = Query(...),  # JWT token as query parameter
):
    """
    WebSocket endpoint for chat communication with JWT authentication.
    Token is passed as query parameter: ws://host/ws/{thread_id}?token=jwt_token
    """
    LOGGER.info(f"New WebSocket connection attempt for thread: {thread_id}")

    try:
        # Verify JWT token using JWKS (Supabase signing keys)
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        jwt_payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
        user_id = jwt_payload.get("sub")
        if not user_id:
            LOGGER.error("No user ID found in JWT token")
            raise jwt.InvalidTokenError("No user ID in token")

    except jwt.ExpiredSignatureError:
        LOGGER.error("JWT token expired")
        await websocket.close(code=1008)
        return
    except jwt.InvalidTokenError as e:
        LOGGER.error(f"JWT authentication failed: {e}")
        await websocket.close(code=1008)
        return
    except Exception as e:
        LOGGER.error(f"Authentication error: {e}")
        await websocket.close(code=1008)
        return

    await websocket.accept()
    LOGGER.info(
        f"WebSocket connection established for user {user_id} on thread {thread_id}"
    )
    # old
    """     async with (
            AsyncPostgresSaver.from_conn_string(
                CHAT_HISTORY_DB_CONN_STRING
            ) as checkpointer,
            AsyncPostgresStore.from_conn_string(CHAT_HISTORY_DB_CONN_STRING) as store,
        ):
            await checkpointer.setup()
            await store.setup()

            app = workflow.compile(
                checkpointer=checkpointer,
                store=store,
            )
            while True:
                data = await websocket.receive_text()
                # Parse the incoming message to extract the user input and the trainer
                try:
                    payload = json.loads(data)
                    user_input = payload.get("message", "")
                    trainer = payload.get("trainer", "Simon")
                except json.JSONDecodeError:
                    user_input = data
                    trainer = "Simon"

                LOGGER.info(
                    f"Received message on thread {thread_id} from user {user_id}: {user_input[:100]}{'...' if len(user_input) > 100 else ''} (trainer: {trainer})"
                )

                async for event in app.astream(
                    cast(
                        AgentState,
                        {
                            "messages": [HumanMessage(content=user_input, id=str(uuid4()))],
                            "user_query": user_input,
                            "intent": None,
                            "sql_query": [],
                            "sql_result": [],
                            "sql_retries": 0,
                            "error": None,
                            "needs_more_data": None,
                            "evaluation_reason": None,
                            "planned_query": None,
                            "query_iteration": 0,
                        },
                    ),
                    config={
                        "configurable": {
                            "thread_id": thread_id,
                            "user_id": user_id,
                            "trainer": trainer,
                        }
                    },
                    stream_mode="custom",
                ):
                    # LOGGER.info(f"Sending event to client: {event}")
                    await websocket.send_text(json.dumps(event))
    """

    try:
        while True:
            data = await websocket.receive_text()
            # Parse the incoming message to extract the user input and the trainer
            # todo remove trainer from payload
            try:
                payload = json.loads(data)
                user_input = payload.get("message", "")
                trainer = payload.get("trainer", "Simon")
                hide_from_history = payload.get("hide_from_history", False)
                is_onboarding = payload.get("is_onboarding", False)
            except json.JSONDecodeError:
                user_input = data
                trainer = "Simon"
                hide_from_history = False
                is_onboarding = False

            LOGGER.info(
                f"Received message on thread {thread_id} from user {user_id}: {user_input[:100]}{'...' if len(user_input) > 100 else ''} (trainer: {trainer})"
            )

            # Check if user can send a message (subscription limits)
            send_check = {"can_send": True, "is_pro": True, "message_count": 0, "remaining": 999}
            try:
                from api.utils.subscription_limits import can_send_message

                send_check = await can_send_message(user_id)

                if not send_check["can_send"]:
                    # User has reached their message limit
                    LOGGER.info(
                        f"User {user_id} has reached message limit ({send_check['message_count']} messages this month)"
                    )

                    # Send limit reached message
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "limit_reached",
                                "content": "Monthly message limit reached. Upgrade to PRO for unlimited messages.",
                                "is_pro": send_check["is_pro"],
                                "message_count": send_check["message_count"],
                                "remaining": send_check["remaining"],
                            }
                        )
                    )
                    # Send ENDOF_STREAM to signal the end of this interaction
                    await websocket.send_text(
                        json.dumps({"type": "ENDOF_STREAM", "content": ""})
                    )
                    continue  # Skip processing this message

                # Log remaining messages for free users
                if not send_check["is_pro"]:
                    LOGGER.debug(
                        f"Free user {user_id} has {send_check['remaining']} messages remaining this month"
                    )

            except Exception as e:
                LOGGER.error(f"❌ Failed to check message send permission: {e}")
                # On error, allow message to proceed (fail open)

            # Save user message to chat_history (skip for hidden messages like onboarding prompts)
            try:
                from api.utils.chat_history import save_user_message

                if not hide_from_history:
                    await save_user_message(user_id, thread_id, user_input)
                    LOGGER.debug("✅ Saved user message to chat_history")
                else:
                    LOGGER.debug("⏭️ Skipped saving hidden message to chat_history")

                # Send message count info to frontend (for free users)
                if not send_check["is_pro"]:
                    # Remaining count will be one less now that we've saved the message
                    new_remaining = max(0, send_check["remaining"] - 1)
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "message_count",
                                "is_pro": False,
                                "message_count": send_check["message_count"] + 1,
                                "remaining": new_remaining,
                            }
                        )
                    )
            except Exception as e:
                LOGGER.error(f"❌ Failed to save user message: {e}")

            # Check for BYOK API key — if user provided their own key, use it
            byok_api_key = None
            try:
                from api.utils.encryption import decrypt_api_key

                byok_result = (
                    supabase.table("user_infos")
                    .select("openrouter_api_key_encrypted")
                    .eq("user_id", user_id)
                    .execute()
                )
                if byok_result.data and byok_result.data[0].get(
                    "openrouter_api_key_encrypted"
                ):
                    byok_api_key = decrypt_api_key(
                        byok_result.data[0]["openrouter_api_key_encrypted"]
                    )
                    LOGGER.debug(f"Using BYOK API key for user {user_id}")
            except Exception as e:
                LOGGER.error(f"Failed to fetch BYOK key for user {user_id}: {e}")

            # Create the async generator for proper cleanup
            agent_stream = astream_main_agent(
                user_input, user_id, thread_id, openrouter_api_key=byok_api_key, is_onboarding=is_onboarding
            )
            stream_finalized = False
            try:
                async for event in agent_stream:
                    # Handle AIMessage serialization
                    serialized_event = serialize_event(event)
                    if isinstance(serialized_event, dict) and serialized_event.get(
                        "type"
                    ) in ("ENDOF_STREAM", "error_message"):
                        stream_finalized = True
                    await websocket.send_text(json.dumps(serialized_event))
            except WebSocketDisconnect:
                LOGGER.info(
                    f"WebSocket disconnected during streaming for thread {thread_id}"
                )
                break
            except Exception as e:
                LOGGER.error(
                    f"Error during agent streaming for thread {thread_id}: {e}",
                    exc_info=True,
                )
                # Send error as a single atomic event the frontend can handle
                try:
                    if byok_api_key:
                        error_content = "There was an issue with your OpenRouter API key. Please check your key's limits and billing."
                    else:
                        error_content = "I encountered an issue processing your request. Please try again."
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error_message",
                                "content": error_content,
                            }
                        )
                    )
                    stream_finalized = True
                except (WebSocketDisconnect, Exception):
                    # Client already disconnected or other error
                    break
                # Don't break - allow user to send more messages
            finally:
                # Ensure proper cleanup of LangGraph async tasks to prevent
                # "Task was destroyed but it is pending!" errors
                await agent_stream.aclose()
                # Safety net: if the stream ended without a finalizing event
                # (e.g. LangGraph swallowed a node exception), ensure the
                # frontend can recover by sending one now.
                if not stream_finalized:
                    try:
                        LOGGER.warning(
                            f"Stream ended without finalization for thread {thread_id}, sending recovery event"
                        )
                        if byok_api_key:
                            await websocket.send_text(
                                json.dumps(
                                    {
                                        "type": "error_message",
                                        "content": "There was an issue with your OpenRouter API key. Please check your key's limits and billing.",
                                    }
                                )
                            )
                        else:
                            await websocket.send_text(
                                json.dumps({"type": "ENDOF_STREAM", "content": ""})
                            )
                    except Exception:
                        pass

    except WebSocketDisconnect:
        LOGGER.info(f"WebSocket connection closed for thread {thread_id}")
    except Exception as e:
        LOGGER.error(
            f"Unexpected error in WebSocket endpoint for thread {thread_id}: {e}"
        )


class ThreadInfo(BaseModel):
    """Information about a chat thread."""

    thread_id: str
    trainer: str
    created_at: str


@router.get("/threads", response_model=list[ThreadInfo])
async def get_threads(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Get all threads for the current user.

    Returns a list of threads associated with the authenticated user,
    ordered by creation date (most recent first).

    Args:
        current_user: The authenticated user from JWT token

    Returns:
        List[ThreadInfo]: List of thread information containing thread_id, trainer, and created_at

    Raises:
        HTTPException: 500 if database query fails
    """
    try:
        # Create user-specific Supabase client with JWT token
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Query the threads table using Supabase, ordered by newest first
        response = (
            user_supabase.table("threads")
            .select("thread_id, trainer, created_at")
            .eq("user_id", current_user.id)
            .order("created_at", desc=True)
            .execute()
        )

        threads = [
            ThreadInfo(
                thread_id=row["thread_id"],
                trainer=row["trainer"],
                created_at=row["created_at"],
            )
            for row in response.data or []
        ]

        # Only log if there are threads
        if threads:
            LOGGER.info(f"Returning {len(threads)} threads for user {current_user.id}")
        return threads

    except Exception as e:
        LOGGER.error(f"Error fetching threads: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch threads")


@router.get("/threads/{thread_id}/messages", response_model=ThreadMessagesResponse)
@limiter.limit("30/minute")  # Rate limiting: 30 requests per minute
async def get_thread_messages(
    request: Request, thread_id: str, current_user: User = Depends(get_current_user)
) -> ThreadMessagesResponse:
    """
    Retrieve chat messages for a specific thread from chat_history table.

    This endpoint fetches all messages (user, assistant, and action) from the
    chat_history table for a conversation thread that belongs to the authenticated user.

    Args:
        request: FastAPI request object (for rate limiting)
        thread_id: Unique identifier for the conversation thread
        current_user: Authenticated user (injected via JWT token)

    Returns:
        ThreadMessagesResponse: Contains thread_id, list of messages, and total count

    Raises:
        HTTPException:
            - 404 if thread doesn't exist or doesn't belong to user
            - 500 if database query fails
            - 429 if rate limit exceeded (30 requests/minute)

    Note:
        - Only returns messages for threads that belong to the authenticated user
        - Messages are returned in chronological order
        - Includes all message types: user, assistant, action, and system
        - Empty array is returned for new threads
    """
    LOGGER.debug(f"Retrieving messages for thread {thread_id}, user {current_user.id}")

    try:
        from api.utils.chat_history import (
            get_thread_messages as get_messages_from_history,
        )

        # Fetch messages from chat_history table
        raw_messages = await get_messages_from_history(
            user_id=current_user.id, thread_id=thread_id
        )

        # Convert to response format
        messages = [
            ChatMessage(
                id=msg["id"],
                role=msg["role"],
                content=msg["content"],
                created_at=msg["created_at"],
                metadata=msg.get("metadata", {}),
            )
            for msg in raw_messages
        ]

        if messages:
            LOGGER.info(f"Found {len(messages)} messages in thread {thread_id}")

        return ThreadMessagesResponse(
            thread_id=thread_id, messages=messages, total_messages=len(messages)
        )

    except Exception as e:
        LOGGER.error(f"Error retrieving thread messages for {thread_id}: {e}")
        # Return empty structured response for errors
        return ThreadMessagesResponse(
            thread_id=thread_id, messages=[], total_messages=0
        )


@router.post("/threads", response_model=CreateThreadResponse)
async def create_thread(
    request: CreateThreadRequest,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Create a new chat thread.

    Args:
        request: Thread creation request containing trainer preference
        current_user: The authenticated user from JWT token
        credentials: JWT credentials for user-authenticated Supabase client

    Returns:
        CreateThreadResponse: Created thread information

    Raises:
        HTTPException: 500 if thread creation fails
    """
    LOGGER.info(
        f"🆕 [DEBUG] Creating new thread for user: {current_user.id}, trainer: {request.trainer}"
    )

    try:
        # Generate new thread ID
        thread_id = str(uuid4())

        # Use user-authenticated Supabase client to respect RLS policies
        user_supabase = get_user_supabase_client(credentials.credentials)

        # Insert thread into threads table
        response = (
            user_supabase.table("threads")
            .insert(
                {
                    "thread_id": thread_id,
                    "user_id": current_user.id,
                    "trainer": request.trainer,
                }
            )
            .execute()
        )

        if response.data:
            thread_data = response.data[0]
            LOGGER.info(f"✅ [DEBUG] Successfully created thread {thread_id}")
            return CreateThreadResponse(
                thread_id=thread_data["thread_id"],
                trainer=thread_data["trainer"],
                created_at=thread_data["created_at"],
            )
        else:
            raise Exception("No data returned from thread creation")

    except Exception as e:
        LOGGER.error(f"❌ [DEBUG] Error creating thread: {e}")
        raise HTTPException(status_code=500, detail="Failed to create thread")


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, current_user: User = Depends(get_current_user)):
    """Delete a specific thread and all its data."""
    try:
        # First, delete from threads table
        response = (
            supabase.table("threads")
            .delete()
            .eq("thread_id", thread_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        # Then delete checkpoints using LangGraph
        async with AsyncPostgresSaver.from_conn_string(
            CHAT_HISTORY_DB_CONN_STRING
        ) as checkpointer:
            # Delete all checkpoints for the thread using the proper LangGraph method
            checkpoint_result = await checkpointer.adelete_thread(thread_id)

            LOGGER.info(
                f"🗑️ Deleted thread {thread_id}, checkpoints result: {checkpoint_result}, threads table result: {len(response.data) if response.data else 0} rows"
            )
            return {"success": True, "message": f"Thread {thread_id} deleted"}

    except Exception as e:
        LOGGER.error(f"❌ Error deleting thread {thread_id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete thread: {str(e)}"
        )
