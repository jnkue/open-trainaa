"""
Redis client module for caching and temporary data storage.

Provides Redis connection management and helper functions for PKCE verifier storage.
"""

import os
import logging
from typing import Optional
from redis import Redis, ConnectionPool, RedisError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# PKCE verifier TTL (10 minutes in seconds)
PKCE_TTL = 600

# Initialize connection pool for multi-worker safety
try:
    pool = ConnectionPool.from_url(
        REDIS_URL,
        password=REDIS_PASSWORD,
        decode_responses=True,
        max_connections=10,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    redis_client = Redis(connection_pool=pool)
except Exception as e:
    logger.error(f"Failed to initialize Redis connection pool: {e}")
    redis_client = None


def test_redis_connection() -> bool:
    """
    Test Redis connection health.

    Returns:
        bool: True if Redis is accessible, False otherwise.
    """
    if redis_client is None:
        logger.error("Redis client not initialized")
        return False

    try:
        redis_client.ping()
        logger.info("Redis connection successful")
        return True
    except RedisError as e:
        logger.error(f"Redis connection failed: {e}")
        return False


def set_pkce_verifier(user_id: str, code_verifier: str) -> bool:
    """
    Store PKCE code verifier for a user with TTL.

    Args:
        user_id: User UUID as string
        code_verifier: PKCE code verifier to store

    Returns:
        bool: True if stored successfully, False otherwise.
    """
    if redis_client is None:
        logger.error("Redis client not available for storing PKCE verifier")
        return False

    try:
        key = f"pkce:{user_id}"
        redis_client.setex(key, PKCE_TTL, code_verifier)
        logger.info(f"Stored PKCE verifier for user {user_id}")
        return True
    except RedisError as e:
        logger.error(f"Failed to store PKCE verifier for user {user_id}: {e}")
        return False


def get_pkce_verifier(user_id: str) -> Optional[str]:
    """
    Retrieve PKCE code verifier for a user.

    Args:
        user_id: User UUID as string

    Returns:
        Optional[str]: The code verifier if found, None otherwise.
    """
    if redis_client is None:
        logger.error("Redis client not available for retrieving PKCE verifier")
        return None

    try:
        key = f"pkce:{user_id}"
        verifier = redis_client.get(key)
        if verifier:
            logger.info(f"Retrieved PKCE verifier for user {user_id}")
        else:
            logger.warning(f"No PKCE verifier found for user {user_id}")
        return verifier
    except RedisError as e:
        logger.error(f"Failed to retrieve PKCE verifier for user {user_id}: {e}")
        return None


def delete_pkce_verifier(user_id: str) -> bool:
    """
    Delete PKCE code verifier for a user.

    Args:
        user_id: User UUID as string

    Returns:
        bool: True if deleted successfully, False otherwise.
    """
    if redis_client is None:
        logger.error("Redis client not available for deleting PKCE verifier")
        return False

    try:
        key = f"pkce:{user_id}"
        deleted = redis_client.delete(key)
        if deleted:
            logger.info(f"Deleted PKCE verifier for user {user_id}")
        else:
            logger.warning(f"No PKCE verifier to delete for user {user_id}")
        return bool(deleted)
    except RedisError as e:
        logger.error(f"Failed to delete PKCE verifier for user {user_id}: {e}")
        return False
