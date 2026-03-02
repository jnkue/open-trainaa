"""
Singleton pattern implementations for shared resources.

This module ensures that expensive resources like LLM connections,
database pools, and API clients are initialized only once and reused
throughout the application lifecycle.
"""

import asyncio
import os
from typing import Dict, Optional

from agent.log import LOGGER
from langchain_openai import ChatOpenAI
from psycopg_pool import AsyncConnectionPool
from supabase import Client, create_client

# Global singletons
_llm_instances: Dict[str, ChatOpenAI] = {}
_llm_lock = asyncio.Lock()

_supabase_client: Optional[Client] = None
_supabase_lock = asyncio.Lock()

_chat_history_pool: Optional[AsyncConnectionPool] = None
_chat_history_pool_lock = asyncio.Lock()

_activity_db_pool: Optional[AsyncConnectionPool] = None
_activity_db_pool_lock = asyncio.Lock()

# Environment variables - loaded once
_PRIVATE_OPENROUTER_API_KEY = os.getenv("PRIVATE_OPENROUTER_API_KEY")
_PUBLIC_SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL")
_PRIVATE_SUPABASE_KEY = os.getenv("PRIVATE_SUPABASE_KEY")
_CHAT_HISTORY_DB_CONN_STRING = os.getenv("CHAT_HISTORY_DB_CONN_STRING")
_ACTIVITY_DB_CONN_STRING = os.getenv("ACTIVITY_DB_CONN_STRING")
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


def get_llm(
    model: str = "google/gemini-2.5-flash", temperature: float = 0.0
) -> ChatOpenAI:
    """
    Get or create an LLM instance (singleton per model).

    This function ensures only one LLM instance exists per model configuration,
    preventing duplicate initializations and reducing memory usage.

    Args:
        model: The model identifier (e.g., "google/gemini-2.5-flash")
        temperature: Temperature setting for the model

    Returns:
        ChatOpenAI: Cached LLM instance for the specified model

    Note:
        This is a synchronous function. For async contexts, it's still safe to call
        as the LLM initialization itself is not async.
    """
    global _llm_instances

    cache_key = f"{model}_{temperature}"

    if cache_key not in _llm_instances:
        LOGGER.info(
            f"Initializing LLM singleton for model: {model} (temperature: {temperature})"
        )

        if not _PRIVATE_OPENROUTER_API_KEY:
            raise ValueError("PRIVATE_OPENROUTER_API_KEY not configured")

        _llm_instances[cache_key] = ChatOpenAI(
            model=model,
            openai_api_key=_PRIVATE_OPENROUTER_API_KEY,
            openai_api_base="https://openrouter.ai/api/v1",
            temperature=temperature,
        )
        LOGGER.info(f"✅ LLM singleton created for {model}")
    else:
        LOGGER.debug(f"Reusing existing LLM instance for {model}")

    return _llm_instances[cache_key]


def get_user_llm(
    api_key: str,
    model: str = "google/gemini-2.5-flash",
    temperature: float = 0.0,
) -> ChatOpenAI:
    """
    Create an LLM instance using a user-provided OpenRouter API key (BYOK).

    Unlike get_llm(), this creates a new instance per call and does NOT cache it,
    since each user has their own key.

    Args:
        api_key: User's decrypted OpenRouter API key
        model: The model identifier
        temperature: Temperature setting for the model

    Returns:
        ChatOpenAI: LLM instance configured with the user's API key
    """
    LOGGER.info(f"Creating BYOK LLM instance for model: {model}")
    return ChatOpenAI(
        model=model,
        openai_api_key=api_key,
        openai_api_base="https://openrouter.ai/api/v1",
        temperature=temperature,
    )


async def get_supabase_client() -> Client:
    """
    Get or create a Supabase client (singleton).

    Returns:
        Client: Cached Supabase client instance

    Raises:
        ValueError: If Supabase credentials are not configured
    """
    global _supabase_client

    if _supabase_client is None:
        async with _supabase_lock:
            # Double-check after acquiring lock
            if _supabase_client is None:
                LOGGER.info("Initializing Supabase client singleton")

                if not _PUBLIC_SUPABASE_URL or not _PRIVATE_SUPABASE_KEY:
                    raise ValueError("Supabase credentials not configured")

                _supabase_client = create_client(
                    _PUBLIC_SUPABASE_URL, _PRIVATE_SUPABASE_KEY
                )
                LOGGER.info("✅ Supabase client singleton created")
    else:
        LOGGER.debug("Reusing existing Supabase client")

    return _supabase_client


def get_supabase_client_sync() -> Client:
    """
    Synchronous version of get_supabase_client for non-async contexts.

    Returns:
        Client: Cached Supabase client instance
    """
    global _supabase_client

    if _supabase_client is None:
        LOGGER.info("Initializing Supabase client singleton (sync)")

        if not _PUBLIC_SUPABASE_URL or not _PRIVATE_SUPABASE_KEY:
            raise ValueError("Supabase credentials not configured")

        _supabase_client = create_client(_PUBLIC_SUPABASE_URL, _PRIVATE_SUPABASE_KEY)
        LOGGER.info("✅ Supabase client singleton created (sync)")
    else:
        LOGGER.debug("Reusing existing Supabase client (sync)")

    return _supabase_client


async def get_chat_history_connection_pool() -> Optional[AsyncConnectionPool]:
    """
    Get or create a connection pool for chat history database (singleton).

    Returns:
        AsyncConnectionPool or None: Connection pool if configured and healthy

    Note:
        Returns None in production if pool creation fails (graceful degradation)
    """
    global _chat_history_pool

    if _chat_history_pool is None:
        async with _chat_history_pool_lock:
            # Double-check after acquiring lock
            if _chat_history_pool is None:
                try:
                    if not _CHAT_HISTORY_DB_CONN_STRING:
                        LOGGER.warning("CHAT_HISTORY_DB_CONN_STRING not configured")
                        if _ENVIRONMENT != "production":
                            raise ValueError(
                                "Database connection string required in non-production"
                            )
                        return None

                    LOGGER.info("Initializing chat history connection pool singleton")

                    # Configure pool size based on environment
                    max_size = 10 if _ENVIRONMENT == "production" else 5
                    min_size = 2 if _ENVIRONMENT == "production" else 1

                    _chat_history_pool = AsyncConnectionPool(
                        _CHAT_HISTORY_DB_CONN_STRING,
                        open=False,
                        min_size=min_size,
                        max_size=max_size,
                        timeout=30,  # Wait up to 30s for a connection from pool
                        max_idle=300,  # Close idle connections after 5 minutes
                        max_lifetime=1800,  # Recycle connections after 30 minutes
                        kwargs={
                            "autocommit": True,
                            "connect_timeout": 10,  # Increased from 5s
                            "prepare_threshold": None,
                            # TCP keepalive settings to prevent connection drops
                            "keepalives": 1,
                            "keepalives_idle": 30,  # Start keepalives after 30s idle
                            "keepalives_interval": 10,  # Send keepalive every 10s
                            "keepalives_count": 5,  # Max 5 failed keepalives before disconnect
                        },
                        check=AsyncConnectionPool.check_connection,  # Validate connections before use
                    )
                    await _chat_history_pool.open()

                    LOGGER.info(
                        f"✅ Chat history connection pool created (max_size={max_size}, env={_ENVIRONMENT})"
                    )

                except Exception as e:
                    LOGGER.error(f"Failed to create chat history connection pool: {e}")
                    if _ENVIRONMENT == "production":
                        LOGGER.warning(
                            "Continuing without connection pool in production"
                        )
                        return None
                    raise
    else:
        LOGGER.debug("Reusing existing chat history connection pool")

    return _chat_history_pool


async def get_activity_db_connection_pool() -> Optional[AsyncConnectionPool]:
    """
    Get or create a connection pool for activity database (singleton).

    Returns:
        AsyncConnectionPool or None: Connection pool if configured and healthy
    """
    global _activity_db_pool

    if _activity_db_pool is None:
        async with _activity_db_pool_lock:
            # Double-check after acquiring lock
            if _activity_db_pool is None:
                try:
                    if not _ACTIVITY_DB_CONN_STRING:
                        LOGGER.warning("ACTIVITY_DB_CONN_STRING not configured")
                        if _ENVIRONMENT != "production":
                            raise ValueError(
                                "Database connection string required in non-production"
                            )
                        return None

                    LOGGER.info("Initializing activity DB connection pool singleton")

                    # Configure pool size based on environment
                    max_size = 10 if _ENVIRONMENT == "production" else 5
                    min_size = 2 if _ENVIRONMENT == "production" else 1

                    _activity_db_pool = AsyncConnectionPool(
                        _ACTIVITY_DB_CONN_STRING,
                        open=False,
                        min_size=min_size,
                        max_size=max_size,
                        timeout=30,  # Wait up to 30s for a connection from pool
                        max_idle=300,  # Close idle connections after 5 minutes
                        max_lifetime=1800,  # Recycle connections after 30 minutes
                        kwargs={
                            "autocommit": True,
                            "connect_timeout": 10,  # Increased from 5s
                            "prepare_threshold": None,
                            # TCP keepalive settings to prevent connection drops
                            "keepalives": 1,
                            "keepalives_idle": 30,  # Start keepalives after 30s idle
                            "keepalives_interval": 10,  # Send keepalive every 10s
                            "keepalives_count": 5,  # Max 5 failed keepalives before disconnect
                        },
                        check=AsyncConnectionPool.check_connection,  # Validate connections before use
                    )
                    await _activity_db_pool.open()

                    LOGGER.info(
                        f"✅ Activity DB connection pool created (max_size={max_size}, env={_ENVIRONMENT})"
                    )

                except Exception as e:
                    LOGGER.error(f"Failed to create activity DB connection pool: {e}")
                    if _ENVIRONMENT == "production":
                        LOGGER.warning(
                            "Continuing without connection pool in production"
                        )
                        return None
                    raise
    else:
        LOGGER.debug("Reusing existing activity DB connection pool")

    return _activity_db_pool


async def cleanup_resources():
    """
    Cleanup all singleton resources.

    Call this during application shutdown to gracefully close connections.
    """
    LOGGER.info("Cleaning up singleton resources...")

    global _chat_history_pool, _activity_db_pool

    if _chat_history_pool:
        try:
            await _chat_history_pool.close()
            LOGGER.info("✅ Chat history connection pool closed")
        except Exception as e:
            LOGGER.error(f"Error closing chat history pool: {e}")
        _chat_history_pool = None

    if _activity_db_pool:
        try:
            await _activity_db_pool.close()
            LOGGER.info("✅ Activity DB connection pool closed")
        except Exception as e:
            LOGGER.error(f"Error closing activity DB pool: {e}")
        _activity_db_pool = None

    LOGGER.info("✅ Resource cleanup complete")
