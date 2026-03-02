"""
Core modules for the agent system.

This package contains singleton patterns, shared resources,
and core utilities used across all agents.
"""

from .singletons import (
    get_activity_db_connection_pool,
    get_chat_history_connection_pool,
    get_llm,
    get_supabase_client,
)

__all__ = [
    "get_llm",
    "get_supabase_client",
    "get_chat_history_connection_pool",
    "get_activity_db_connection_pool",
]
