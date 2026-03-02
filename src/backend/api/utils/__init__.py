"""
Utilities package for the API.
"""

# Re-export supabase client for backward compatibility
from api.database import supabase

# Import from general utilities (previously utils.py)
from api.utils.general import (
    calculate_hr_load_for_session,
    get_user_supabase_client,
    post_processing_of_session,
)

# Import from chat history utilities
from api.utils.chat_history import (
    get_thread_messages,
    save_action_message,
    save_assistant_message,
    save_message,
    save_user_message,
)

__all__ = [
    # Database
    "supabase",
    # General utilities
    "get_user_supabase_client",
    "calculate_hr_load_for_session",
    "post_processing_of_session",
    # Chat history utilities
    "save_message",
    "save_user_message",
    "save_assistant_message",
    "save_action_message",
    "get_thread_messages",
]
