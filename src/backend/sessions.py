import asyncio
import logging
from typing import Optional
from uuid import UUID

from api.database import supabase
from api.training_status import calculate_training_status
from api.utils import post_processing_of_session


async def post_process_sessions_of_user(user_id: UUID):
    """Perform post-processing tasks for all sessions of a user that need update."""
    sessions = supabase.table("sessions").select("id").eq("user_id", user_id).execute()
    if not sessions.data or len(sessions.data) == 0:
        print(f"❌ No sessions found for user {user_id} needing post-processing")
        return

    for session in sessions.data:
        session_id = session["id"]
        await post_processing_of_session(session_id)


if __name__ == "__main__":
    # asyncio.run(post_process_sessions_of_user("399d3778-c474-4f07-a46a-ddda2e08ccbb"))
    calculate_training_status()
