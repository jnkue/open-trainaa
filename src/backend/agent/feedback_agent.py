import json
from datetime import datetime, timedelta
from typing import Any, Dict

from agent.core.singletons import get_llm, get_supabase_client_sync
from agent.log import LOGGER


# Get Supabase client (singleton)
def get_supabase():
    """Get Supabase client singleton (sync version for compatibility)."""
    return get_supabase_client_sync()


async def give_feedback(session_id: str) -> Dict[str, Any]:
    """
    Generate concise, valuable feedback for a training session and save it to the database.

    This function:
    1. Retrieves session data and user context
    2. Analyzes training status and scheduled workouts
    3. Generates personalized feedback using LLM
    4. Updates the session record with the feedback

    Args:
        session_id: The session identifier

    Returns:
        Result dictionary with success status and feedback
    """
    LOGGER.info(f"🚀 Generating feedback for session {session_id}")

    try:
        # Get session data first to extract user_id
        session_data = await _get_session_data(session_id)
        if not session_data:
            return {
                "success": False,
                "error": f"Session {session_id} not found",
                "session_id": session_id,
            }

        user_id = session_data.get("user_id")
        if not user_id:
            return {
                "success": False,
                "error": "No user_id found in session data",
                "session_id": session_id,
            }

        # Get today's scheduled workouts
        todays_workouts = await _get_todays_workouts(user_id)

        # Get recent training status
        training_status = await _get_recent_training_status(user_id)

        # Generate feedback using LLM
        feedback_response = await _generate_feedback_with_llm(
            session_data, todays_workouts, training_status, user_id
        )

        # Get the session_custom_data_id from the session
        custom_data_id = session_data.get("session_custom_data_id")

        if not custom_data_id:
            LOGGER.error(f"No session_custom_data_id found for session {session_id}")
            return {
                "success": False,
                "error": "Session has no custom data record",
                "session_id": session_id,
                "feedback": feedback_response,
            }

        # Save feedback to session_custom_data record
        update_result = (
            get_supabase()
            .table("session_custom_data")
            .update({"llm_feedback": feedback_response})
            .eq("id", custom_data_id)
            .execute()
        )

        # Check for errors in the response
        if hasattr(update_result, "error") and update_result.error:
            LOGGER.error(
                f"Failed to update custom data {custom_data_id} with feedback: {update_result.error}"
            )
            return {
                "success": False,
                "error": f"Failed to save feedback: {update_result.error}",
                "session_id": session_id,
                "feedback": feedback_response,
            }

        # Check if the update was successful (should have data)
        if not update_result.data:
            LOGGER.error(f"No data returned when updating custom data {custom_data_id}")
            return {
                "success": False,
                "error": "Failed to update session custom data - no data returned",
                "session_id": session_id,
                "feedback": feedback_response,
            }

        LOGGER.info(
            f"✅ Successfully generated and saved feedback for session {session_id}"
        )

        return {
            "success": True,
            "session_id": session_id,
            "feedback": feedback_response,
            "generated_at": datetime.now().isoformat(),
        }

    except Exception as e:
        LOGGER.error(f"Error generating feedback for session {session_id}: {e}")
        return {"success": False, "error": str(e), "session_id": session_id}


async def _get_session_data(session_id: str) -> Dict[str, Any]:
    """Get session data from database."""
    session_response = (
        get_supabase().table("sessions").select("*").eq("id", session_id).execute()
    )

    if session_response.data and len(session_response.data) > 0:
        return session_response.data[0]

    return {}


async def _get_todays_workouts(user_id: str) -> Dict[str, Any]:
    """Get today's scheduled workouts."""
    today = datetime.now().date().isoformat()

    workouts_response = (
        get_supabase()
        .table("workouts_scheduled")
        .select("*, workouts(name, sport, workout_text, workout_minutes)")
        .eq("user_id", user_id)
        .gte("scheduled_time", f"{today}T00:00:00")
        .lte("scheduled_time", f"{today}T23:59:59")
        .order("scheduled_time")
        .execute()
    )

    return {
        "scheduled_workouts": workouts_response.data or [],
        "total_scheduled": len(workouts_response.data) if workouts_response.data else 0,
    }


async def _get_recent_training_status(user_id: str) -> Dict[str, Any]:
    """Get recent training status for context."""
    # Get last 7 days of training status
    week_ago = (datetime.now() - timedelta(days=7)).date().isoformat()

    status_response = (
        get_supabase()
        .table("training_status")
        .select("*")
        .eq("user_id", user_id)
        .gte("date", week_ago)
        .order("date", desc=True)
        .execute()
    )

    # Get recent sessions for performance context
    sessions_response = (
        get_supabase()
        .table("sessions")
        .select("*")
        .eq("user_id", user_id)
        .gte("created_at", f"{week_ago}T00:00:00")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )

    return {
        "training_status": status_response.data or [],
        "recent_sessions": sessions_response.data or [],
    }


async def _generate_feedback_with_llm(
    session_data: Dict[str, Any],
    todays_workouts: Dict[str, Any],
    training_status: Dict[str, Any],
    user_id: str,
) -> str:
    """Generate feedback using LLM with context about session and training status."""

    # Get user information for personalization
    user_info_response = (
        get_supabase()
        .table("user_infos")
        .select("llm_user_information, language")
        .eq("user_id", user_id)
        .execute()
    )

    user_info = ""
    user_language = "en"  # Default to English
    if user_info_response.data and len(user_info_response.data) > 0:
        user_info = user_info_response.data[0].get("llm_user_information", "")
        user_language = user_info_response.data[0].get("language", "en")

    # Build context for LLM
    context = {
        "session_data": session_data,
        "todays_workouts": todays_workouts,
        "user_information": user_info,
    }

    # Language-specific instruction
    language_instruction = f"\n\nIMPORTANT: Provide all feedback in {user_language.upper()} language. The user's preferred language is '{user_language}'."

    system_prompt = f"""You are an expert fitness coach providing brief, actionable feedback after a training session.

CONTEXT:
- Session data: Performance metrics from the completed session
- Today's scheduled workouts: What was planned vs what was completed
- Recent training status: Fitness, fatigue, and form trends
- User information: Goals, preferences, and training strategy

FEEDBACK REQUIREMENTS:
1. Keep it concise (2-3 sentences max)
2. Focus on the most important insight or action
3. Be encouraging but honest about performance
4. Relate to their goals and training plan
5. Mention recovery if fatigue is high or upcoming workouts are intense

FEEDBACK FOCUS AREAS:
- Session performance vs plan
- Recovery recommendations
- Upcoming workout adjustments
- Progress toward goals
- Training load management
- Include sport science context where relevant


 DONT just repeat data from the session

Avoid generic advice. Be specific to their da^ta and situation.
And also include some sport science context.{language_instruction}
"""

    user_prompt = f"""Generate feedback for this training session:

SESSION CONTEXT:
{json.dumps(context, indent=2, default=str)}

Provide concise, valuable feedback focusing on the most important insight for this athlete.
Do not include the language code in your response.

"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Get LLM instance (singleton)
    llm = get_llm("google/gemini-2.5-flash")
    response = await llm.ainvoke(messages)
    return response.content


# Export the main function for integration
__all__ = ["give_feedback"]
