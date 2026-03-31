import json
import os
from datetime import date, datetime, timedelta
from typing import Any, Dict

from agent.core.singletons import get_llm, get_supabase_client_sync
from agent.log import LOGGER

# Optional Langfuse import
try:
    from langfuse.langchain import CallbackHandler

    LANGFUSE_AVAILABLE = True
except ImportError:
    CallbackHandler = None
    LANGFUSE_AVAILABLE = False
from api.analytics.cp_model import compute_aggregate_envelope, fit_cp_model
from api.analytics.vdot import predict_race_times
from api.analytics.hr_curve import estimate_session_lthr


# Configure Langfuse handler for feedback tracing
_langfuse_handler = None
if LANGFUSE_AVAILABLE and os.getenv("LANGFUSE_PUBLIC_API_KEY"):
    try:
        _langfuse_handler = CallbackHandler()
    except Exception:
        _langfuse_handler = None


# Get Supabase client (singleton)
def get_supabase():
    """Get Supabase client singleton (sync version for compatibility)."""
    return get_supabase_client_sync()


def _format_time(seconds: int) -> str:
    if seconds <= 0:
        return "0:00"
    hours = seconds // 3600
    mins = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


async def _get_analytics_context(session_data: dict, user_id: str) -> dict:
    """Compute current vs previous analytics to detect changes for feedback."""
    sport = session_data.get("sport")
    if sport not in ("cycling", "running"):
        return {}

    result: dict = {}
    supabase = get_supabase()
    today = date.today()

    try:
        # --- Cycling: CP comparison ---
        if sport == "cycling":
            cutoff = (today - timedelta(days=56)).isoformat()
            response = (
                supabase.table("sessions_no_duplicates")
                .select("power_curve, start_time")
                .eq("user_id", user_id)
                .eq("sport", "cycling")
                .not_.is_("power_curve", "null")
                .gte("start_time", cutoff)
                .order("start_time", desc=False)
                .execute()
            )
            sessions = response.data or []
            boundary = (today - timedelta(days=28)).isoformat()
            current_curves = [
                s["power_curve"] for s in sessions if s["start_time"][:10] >= boundary
            ]
            previous_curves = [
                s["power_curve"] for s in sessions if s["start_time"][:10] < boundary
            ]
            current_cp = None
            previous_cp = None
            if current_curves:
                envelope = compute_aggregate_envelope(current_curves)
                cp_result = fit_cp_model(envelope)
                if cp_result:
                    current_cp = round(cp_result[0], 1)
                    result["current_cp_watts"] = current_cp
                    result["current_w_prime"] = round(cp_result[1], 0)
            if previous_curves:
                envelope = compute_aggregate_envelope(previous_curves)
                cp_result = fit_cp_model(envelope)
                if cp_result:
                    previous_cp = round(cp_result[0], 1)
                    result["previous_cp_watts"] = previous_cp
            if current_cp is not None and previous_cp is not None:
                result["cp_change_watts"] = round(current_cp - previous_cp, 1)

        # --- Running: VDOT + race predictions ---
        if sport == "running":
            cutoff = (today - timedelta(weeks=24)).isoformat()
            response = (
                supabase.table("sessions_no_duplicates")
                .select("vdot_estimate, start_time")
                .eq("user_id", user_id)
                .eq("sport", "running")
                .not_.is_("vdot_estimate", "null")
                .gte("start_time", cutoff)
                .order("start_time", desc=False)
                .execute()
            )
            sessions = response.data or []
            boundary = (today - timedelta(weeks=12)).isoformat()
            current_vdots = [
                s["vdot_estimate"] for s in sessions if s["start_time"][:10] >= boundary
            ]
            previous_vdots = [
                s["vdot_estimate"] for s in sessions if s["start_time"][:10] < boundary
            ]
            current_vdot = max(current_vdots) if current_vdots else None
            previous_vdot = max(previous_vdots) if previous_vdots else None
            if current_vdot is not None:
                result["current_vdot"] = round(current_vdot, 1)
                predictions = predict_race_times(current_vdot)
                result["race_predictions"] = {
                    dist: _format_time(secs) for dist, secs in predictions.items()
                }
            if previous_vdot is not None:
                result["previous_vdot"] = round(previous_vdot, 1)
            if current_vdot is not None and previous_vdot is not None:
                result["vdot_change"] = round(current_vdot - previous_vdot, 1)

        # --- Both sports: LTHR comparison ---
        cutoff = (today - timedelta(days=180)).isoformat()
        response = (
            supabase.table("sessions_no_duplicates")
            .select("hr_curve, start_time")
            .eq("user_id", user_id)
            .eq("sport", sport)
            .not_.is_("hr_curve", "null")
            .gte("start_time", cutoff)
            .order("start_time", desc=False)
            .execute()
        )
        sessions = response.data or []
        boundary = (today - timedelta(days=90)).isoformat()
        current_lthrs = []
        previous_lthrs = []
        for s in sessions:
            lthr = estimate_session_lthr(s.get("hr_curve") or {})
            if lthr is not None:
                if s["start_time"][:10] >= boundary:
                    current_lthrs.append(lthr)
                else:
                    previous_lthrs.append(lthr)
        if current_lthrs:
            result["current_lthr"] = round(max(current_lthrs), 1)
        if previous_lthrs:
            result["previous_lthr"] = round(max(previous_lthrs), 1)
        if current_lthrs and previous_lthrs:
            result["lthr_change"] = round(max(current_lthrs) - max(previous_lthrs), 1)

    except Exception as e:
        LOGGER.warning(f"Failed to compute analytics context for feedback: {e}")

    return result


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

        # Get analytics context (CP, VDOT, LTHR changes)
        analytics_context = await _get_analytics_context(session_data, user_id)

        # Generate feedback using LLM
        feedback_response = await _generate_feedback_with_llm(
            session_data, todays_workouts, training_status, user_id, analytics_context
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
    analytics_context: Dict[str, Any] | None = None,
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
        "analytics": analytics_context or {},
    }

    # Language-specific instruction
    language_instruction = f"\n\nIMPORTANT: Provide all feedback in {user_language.upper()} language. The user's preferred language is '{user_language}'."

    system_prompt = f"""You are an expert fitness coach providing brief, actionable feedback after a training session.

CONTEXT:
- Session data: Performance metrics from the completed session
- Today's scheduled workouts: What was planned vs what was completed
- Recent training status: Fitness, fatigue, and form trends
- User information: Goals, preferences, and training strategy
- Analytics data: Current and recent fitness metrics (CP, VDOT, LTHR) with changes over time, plus race predictions

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
- Analytics trends (CP, VDOT, LTHR changes)
- Include sport science context where relevant

ANALYTICS GUIDANCE:
- If CP, VDOT, or LTHR changed notably (>1-2%), mention it briefly
- Reference race predictions when relevant for runners
- Focus on trends (improving, plateauing, declining), not raw numbers
- Don't force analytics commentary if changes are minimal


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
    config: dict = {}
    if _langfuse_handler:
        from api.utils.consent import check_analytics_consent

        if check_analytics_consent(user_id):
            config["callbacks"] = [_langfuse_handler]
            config["metadata"] = {
                "langfuse_user_id": user_id,
                "langfuse_session_id": f"feedback_{session_data.get('id', '')}",
            }
    response = await llm.ainvoke(messages, config=config)
    return response.content


# Export the main function for integration
__all__ = ["give_feedback"]
