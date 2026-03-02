import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd
from agent.core.singletons import get_llm, get_supabase_client_sync
from agent.log import LOGGER
from agent.query_agent import astream_query_agent
from agent.utils import write_to_stream
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from typing_extensions import Annotated


# Get Supabase client (singleton)
def get_supabase():
    """Get Supabase client singleton (sync version for compatibility)."""
    return get_supabase_client_sync()


async def llm_merge_user_info(existing_info: str, new_info: str) -> str:
    """Use LLM to intelligently merge new information with existing user information.

    This function preserves all existing information while incorporating new updates,
    only overriding existing information when there are direct contradictions.

    Args:
        existing_info: The current user information stored in the database
        new_info: The new information to be merged

    Returns:
        str: The intelligently merged user information
    """
    LOGGER.debug(
        f"Merging user info - Existing length: {len(existing_info)}, New length: {len(new_info)}"
    )

    try:
        # Get LLM for merging (singleton)
        llm = get_llm("anthropic/claude-3-5-sonnet-20241022")

        prompt = f"""You are updating a user's fitness profile. Merge the NEW information with the EXISTING information following these rules:

RULES:
- Preserve ALL existing information unless directly contradicted by new info
- Add any new information from the new content
- If new info contradicts existing info, use the new info (it's more recent)
- Keep the same format and structure as the existing information
- Return only the merged user information, no explanations or commentary
- Maintain the JSON-like structure if present

EXISTING INFORMATION:
{existing_info}

NEW INFORMATION TO MERGE:
{new_info}

MERGED RESULT:"""

        response = await llm.ainvoke(prompt)
        merged_content = response.content.strip()

        LOGGER.debug(f"LLM merge completed - Result length: {len(merged_content)}")
        return merged_content

    except Exception as e:
        LOGGER.error(f"Error during LLM merge: {e}")
        # Fallback: append new info to existing info with a separator
        # Don't stream errors to users - handle internally
        return f"{existing_info}\n\nUpdated: {new_info}"


@tool()
def get_current_datetime() -> str:
    """Get the current date and time in ISO 8601 format."""
    return datetime.now().isoformat()


@tool()
async def get_user_information(
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Return a json dictonary with user information.
    This should be used to track everthing realted to the user.
    Like prefrences, goals, available equipment, injuries, etc.
    Example:
    {
        "user_information": "The user is a 35-year-old male with a preference for cycling workouts."
        "goals": "Improve endurance and prepare for a half-marathon in 3 months.",
        "available_equipment": "Road bike, indoor trainer, running shoes.",
        "injuries": "No current injuries, but has a history of knee pain.",
        "preferred_units": "metric",
        "long_term_training_strategy": "Focus on building a strong aerobic base with gradual increases in volume and intensity. Incorporate strength training and flexibility exercises to support overall fitness and injury prevention."
    }
    """

    supabase = get_supabase()
    query = (
        supabase.table("user_infos")
        .select("llm_user_information")
        .eq("user_id", user_id)
        .execute()
    )

    if query.data and len(query.data) > 0:
        user_info = query.data[0].get("llm_user_information", "")
        return {"user_information": user_info}
    else:
        return {"user_information": "No user information found."}


@tool()
async def update_user_information(
    user_information: str,
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Update user information with smart merging to prevent data loss.

    SMART BEHAVIOR:
    - If new content is longer than or equal to existing content: Direct save (assumes comprehensive update)
    - If new content is shorter than existing content: Uses LLM to intelligently merge with existing data

    This prevents accidental data loss while still allowing intentional complete overwrites.

    Args:
        user_information: The user information to save or merge
        user_id: User identifier (injected from state)

    Returns:
        Dict containing success status, final content, and merge information
    """
    if not user_id:
        return {"success": False, "error": "user_id is required"}

    if not user_information or not user_information.strip():
        return {"success": False, "error": "user_information cannot be empty"}

    user_information = user_information.strip()

    # Get existing user information directly from database
    supabase = get_supabase()
    query = (
        supabase.table("user_infos")
        .select("llm_user_information")
        .eq("user_id", user_id)
        .execute()
    )

    if query.data and len(query.data) > 0:
        existing_content = query.data[0].get("llm_user_information", "")
    else:
        existing_content = ""

    # Skip processing if no existing data or existing data is "No user information found."
    if not existing_content or existing_content == "No user information found.":
        final_content = user_information
        merge_used = False
        write_to_stream(
            {
                "type": "status",
                "content": "No existing user information - saving new content directly",
            }
        )
    else:
        # Smart length-based decision
        new_length = len(user_information)
        existing_length = len(existing_content)

        if new_length >= existing_length:
            # New content is longer/same - assume comprehensive update
            final_content = user_information
            merge_used = False
            write_to_stream(
                {
                    "type": "status",
                    "content": f"New content is comprehensive ({new_length} >= {existing_length} chars) - saving directly",
                }
            )
        else:
            # New content is shorter - use LLM merge for safety
            write_to_stream(
                {
                    "type": "status",
                    "content": f"New content is shorter ({new_length} < {existing_length} chars) - using smart merge",
                }
            )
            final_content = await llm_merge_user_info(
                existing_content, user_information
            )
            merge_used = True

    # Save the final content to database
    try:
        # First check if user already has an entry and get the newest one
        existing_result = (
            supabase.table("user_infos")
            .select("id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if existing_result.data and len(existing_result.data) > 0:
            # Update the newest existing entry
            newest_id = existing_result.data[0]["id"]
            result = (
                supabase.table("user_infos")
                .update({"llm_user_information": final_content})
                .eq("id", newest_id)
                .execute()
            )
        else:
            # Insert new entry
            data_to_save = {
                "user_id": user_id,
                "llm_user_information": final_content,
            }
            result = supabase.table("user_infos").insert(data_to_save).execute()

        if hasattr(result, "error") and result.error:
            return {"success": False, "error": str(result.error)}

        merge_status = "LLM merged with existing data" if merge_used else "Direct save"
        write_to_stream(
            {
                "type": "status",
                "content": f"User information updated successfully - {merge_status}",
            }
        )

        return {
            "success": True,
            "data": result.data,
            "user_information": final_content,
            "merge_used": merge_used,
            "merge_status": merge_status,
            "original_length": len(existing_content) if existing_content else 0,
            "new_input_length": len(user_information),
            "final_length": len(final_content),
        }

    except Exception as e:
        LOGGER.error(f"Error updating user information: {e}")
        return {"success": False, "error": str(e)}


@tool()
async def get_long_term_training_strategy(
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Get the user's long-term training strategy.

    This should be used to retrieve the comprehensive training strategy
    including periodization, phases, weekly targets, and training philosophy.

    Returns:
        Dict containing the long-term training strategy or empty if none found
    """
    if not user_id:
        return {"success": False, "error": "user_id is required"}

    try:
        supabase = get_supabase()
        query = (
            supabase.table("user_infos")
            .select("llm_long_term_training_strategy")
            .eq("user_id", user_id)
            .execute()
        )

        if query.data and len(query.data) > 0:
            strategy = query.data[0].get("llm_long_term_training_strategy", "")
            if strategy:
                return {"success": True, "strategy": strategy}
            else:
                return {
                    "success": True,
                    "strategy": "No long-term training strategy found.",
                }
        else:
            return {
                "success": True,
                "strategy": "No long-term training strategy found.",
            }

    except Exception as e:
        LOGGER.error(f"Error getting long-term training strategy: {e}")
        return {"success": False, "error": str(e)}


@tool()
async def update_long_term_training_strategy(
    strategy: str,
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Update the user's long-term training strategy with smart merging.

    SMART BEHAVIOR:
    - If new strategy is longer than or equal to existing: Direct save (comprehensive update)
    - If new strategy is shorter than existing: Uses LLM to intelligently merge

    Args:
        strategy: The training strategy content to save or merge
        user_id: User identifier (injected from state)

    Returns:
        Dict containing success status, final content, and merge information
    """
    if not user_id:
        return {"success": False, "error": "user_id is required"}

    if not strategy or not strategy.strip():
        return {"success": False, "error": "strategy cannot be empty"}

    strategy = strategy.strip()

    # Get existing strategy directly from database
    try:
        supabase = get_supabase()
        query = (
            supabase.table("user_infos")
            .select("llm_long_term_training_strategy")
            .eq("user_id", user_id)
            .execute()
        )

        if query.data and len(query.data) > 0:
            existing_strategy = query.data[0].get("llm_long_term_training_strategy", "")
        else:
            existing_strategy = ""

        # Skip processing if no existing strategy
        if (
            not existing_strategy
            or existing_strategy == "No long-term training strategy found."
        ):
            final_strategy = strategy
            merge_used = False
            write_to_stream(
                {
                    "type": "status",
                    "content": "No existing training strategy - saving new strategy directly",
                }
            )
        else:
            # Smart length-based decision
            new_length = len(strategy)
            existing_length = len(existing_strategy)

            if new_length >= existing_length:
                # New strategy is longer/same - assume comprehensive update
                final_strategy = strategy
                merge_used = False
                write_to_stream(
                    {
                        "type": "status",
                        "content": f"New strategy is comprehensive ({new_length} >= {existing_length} chars) - saving directly",
                    }
                )
            else:
                # New strategy is shorter - use LLM merge for safety
                write_to_stream(
                    {
                        "type": "status",
                        "content": f"New strategy is shorter ({new_length} < {existing_length} chars) - using smart merge",
                    }
                )
                final_strategy = await llm_merge_training_strategy(
                    existing_strategy, strategy
                )
                merge_used = True

        # Save to database
        existing_result = (
            supabase.table("user_infos")
            .select("id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if existing_result.data and len(existing_result.data) > 0:
            # Update existing entry
            newest_id = existing_result.data[0]["id"]
            result = (
                supabase.table("user_infos")
                .update({"llm_long_term_training_strategy": final_strategy})
                .eq("id", newest_id)
                .execute()
            )
        else:
            # Insert new entry
            data_to_save = {
                "user_id": user_id,
                "llm_long_term_training_strategy": final_strategy,
            }
            result = supabase.table("user_infos").insert(data_to_save).execute()

        if hasattr(result, "error") and result.error:
            return {"success": False, "error": str(result.error)}

        merge_status = (
            "LLM merged with existing strategy" if merge_used else "Direct save"
        )
        write_to_stream(
            {
                "type": "status",
                "content": f"Training strategy updated successfully - {merge_status}",
            }
        )

        return {
            "success": True,
            "data": result.data,
            "strategy": final_strategy,
            "merge_used": merge_used,
            "merge_status": merge_status,
            "original_length": len(existing_strategy) if existing_strategy else 0,
            "new_input_length": len(strategy),
            "final_length": len(final_strategy),
        }

    except Exception as e:
        LOGGER.error(f"Error updating long-term training strategy: {e}")
        return {"success": False, "error": str(e)}


async def llm_merge_training_strategy(existing_strategy: str, new_strategy: str) -> str:
    """Use LLM to intelligently merge new training strategy with existing strategy.

    Args:
        existing_strategy: The current training strategy stored in the database
        new_strategy: The new strategy information to be merged

    Returns:
        str: The intelligently merged training strategy
    """
    LOGGER.debug(
        f"Merging training strategy - Existing length: {len(existing_strategy)}, New length: {len(new_strategy)}"
    )

    try:
        # Get LLM for merging (singleton)
        llm = get_llm("anthropic/claude-3-5-sonnet-20241022")

        prompt = f"""You are updating a user's long-term training strategy. Merge the NEW strategy information with the EXISTING strategy following these rules:

RULES:
- Preserve ALL existing strategy elements unless directly contradicted by new info
- Add any new strategy information from the new content
- If new info contradicts existing strategy, use the new info (it's more recent)
- Maintain periodization structure, phases, and timeline information
- Keep the same format and structure as the existing strategy
- Return only the merged training strategy, no explanations or commentary
- Focus on training periodization, phases, weekly targets, and long-term goals

EXISTING TRAINING STRATEGY:
{existing_strategy}

NEW STRATEGY INFORMATION TO MERGE:
{new_strategy}

MERGED TRAINING STRATEGY:"""

        response = await llm.ainvoke(prompt)
        merged_strategy = response.content.strip()

        LOGGER.debug(
            f"LLM training strategy merge completed - Result length: {len(merged_strategy)}"
        )
        return merged_strategy

    except Exception as e:
        LOGGER.error(f"Error during training strategy LLM merge: {e}")
        # Fallback: append new strategy to existing with separator
        write_to_stream(
            {
                "type": "error",
                "content": f"LLM strategy merge failed, using fallback merge: {str(e)}",
            }
        )
        return f"{existing_strategy}\n\nUpdated Strategy: {new_strategy}"


@tool()
async def query_database(
    query: str,
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
):
    """Query the database.
    Args:
        query: The information in natural language about what to query.
        user_id: The user identifier (injected from state)
    """
    # Generate a thread_id for the query agent sub-conversation
    # Using a consistent pattern based on user_id to maintain conversation history
    thread_id = f"{user_id}_query_agent"

    async for event in astream_query_agent(query, user_id, thread_id):
        if event["type"] != "tool_result":
            write_to_stream(event)
        elif event["type"] == "tool_result":
            return event["content"]


# ============================================================================
# TRAINER AGENT TOOLS
# ============================================================================


@tool()
async def get_training_status(
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Get comprehensive training status including recent sessions, planned workouts, and training metrics.

    This function queries the training_status table, planned workouts, and sessions to create a
    comprehensive summary. The LLM will interpret this data for training load assessment,
    injury risk evaluation, and performance trend analysis.

    Args:
        user_id: The user identifier (injected from state)

    Returns:
        Comprehensive training status with raw data for LLM interpretation
    """
    if not user_id:
        return {"error": "User ID is required but not provided in state"}

    write_to_stream(
        {"type": "status", "content": "Retrieving comprehensive training status..."}
    )

    try:
        supabase = get_supabase()
        # Query training status from database
        training_status_response = (
            supabase.table("training_status")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )

        # Query recent sessions (last 8 weeks) - using duplicate-filtered view
        sessions_response = (
            supabase.table("sessions_no_duplicates")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", "2025-07-25")
            .order("created_at", desc=True)
            .execute()
        )

        # Query planned workouts for next 2 weeks
        planned_workouts_response = (
            supabase.table("workouts_scheduled")
            .select("*, workouts(*)")
            .eq("user_id", user_id)
            .gte("scheduled_time", "2025-09-20")
            .lte("scheduled_time", "2025-10-04")
            .order("scheduled_time")
            .execute()
        )

        training_status = {
            "user_id": user_id,
            "timestamp": datetime.now().isoformat(),
            "training_status_data": training_status_response.data,
            "recent_sessions": sessions_response.data,
            "planned_workouts": planned_workouts_response.data,
            "data_summary": {
                "total_recent_sessions": len(sessions_response.data),
                "upcoming_workouts": len(planned_workouts_response.data),
                "training_status_records": len(training_status_response.data),
            },
        }

        # Don't show as action - this is just data retrieval, not a database change
        # write_to_stream(
        #     {
        #         "type": "action",
        #         "content": json.dumps(
        #             {
        #                 "type": "training_status_retrieved",
        #                 "sessions_count": len(sessions_response.data),
        #                 "planned_workouts_count": len(planned_workouts_response.data),
        #             }
        #         ),
        #     }
        # )

        return training_status

    except Exception as e:
        write_to_stream(
            {"type": "error", "content": f"Error retrieving training status: {str(e)}"}
        )
        return {"error": f"Database query failed: {str(e)}"}


@tool()
async def workout_create(
    workout_request: str,
    workout_type: str = "cycling",
    scheduled_date: Optional[str] = None,
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Create a new workout with specific format requirements.

    Args:
        workout_request: Description of the workout to create (e.g., "45-minute sweet spot cycling workout zones based on heart rate")  Only create power based workouts if the user has a power meter. If not, create heart rate based workouts.
        workout_type: Type of workout (cycling, running, swimming, training, hiking, rowing, walking, rest_day)
        scheduled_date: Optional ISO date string when workout should be scheduled (e.g., "2025-09-21T15:00:00")
        user_id: The user identifier (injected from state)

    Returns:
        Created workout with database ID and validation results
    """
    from agent.workout_management_agent import get_workout_management_agent

    if not user_id:
        return {
            "success": False,
            "error": "User ID is required but not provided in state",
        }

    write_to_stream(
        {"type": "status", "content": f"Creating {workout_type} workout for user..."}
    )

    try:
        agent = get_workout_management_agent()

        # Parse scheduled date if provided
        schedule_datetime = None
        if scheduled_date:
            try:
                from datetime import datetime, timedelta, timezone

                # Handle relative date keywords
                scheduled_date_lower = scheduled_date.lower().strip()
                if scheduled_date_lower == "today":
                    schedule_datetime = datetime.now(timezone.utc).replace(
                        hour=12, minute=0, second=0, microsecond=0
                    )
                elif scheduled_date_lower == "tomorrow":
                    schedule_datetime = (
                        datetime.now(timezone.utc) + timedelta(days=1)
                    ).replace(hour=12, minute=0, second=0, microsecond=0)
                else:
                    # Try parsing as ISO format
                    schedule_datetime = datetime.fromisoformat(
                        scheduled_date.replace("Z", "+00:00")
                    )
                    # If no time was specified (defaults to 00:00:00), set to 12:00
                    if (
                        schedule_datetime.hour == 0
                        and schedule_datetime.minute == 0
                        and schedule_datetime.second == 0
                    ):
                        schedule_datetime = schedule_datetime.replace(
                            hour=12, minute=0, second=0, microsecond=0
                        )
            except ValueError:
                write_to_stream(
                    {
                        "type": "error",
                        "content": f"Invalid date format: {scheduled_date} please use ISO format'",
                    }
                )
                return {"success": False, "error": "Invalid date format"}

        result = await agent.create_workout(
            user_id=user_id,
            workout_request=workout_request,
            scheduled_date=schedule_datetime,
            workout_type=workout_type,
        )

        return result

    except Exception as e:
        write_to_stream(
            {"type": "error", "content": f"Error creating workout: {str(e)}"}
        )
        return {"success": False, "error": str(e)}


@tool()
async def delete_workouts_by_date(
    date: str,
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Delete all workouts scheduled for a specific date.

    Args:
        date: Date to delete workouts for (e.g., "2025-09-21", "tomorrow", "next Tuesday")
        user_id: The user identifier (injected from state)

    Returns:
        Deletion confirmation with count of deleted workouts
    """
    from agent.workout_management_agent import get_workout_management_agent

    if not user_id:
        LOGGER.error("User ID is required but not provided in state")
        return {
            "success": False,
            "error": "User ID is required but not provided in state",
        }

    write_to_stream(
        {"type": "status", "content": f"Deleting all workouts for {date}..."}
    )

    try:
        agent = get_workout_management_agent()
        result = await agent.delete_workouts_by_date(
            user_id=user_id,
            target_date=date,
        )

        return result

    except Exception as e:
        write_to_stream(
            {
                "type": "error",
                "content": f"Error deleting workouts for {date}: {str(e)}",
            }
        )
        return {"success": False, "error": str(e)}


@tool()
async def modify_workouts_by_date(
    date: str,
    modification_request: str,
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Modify all workouts for a specific date by deleting existing ones and creating new ones.

    Args:
        date: Date to modify workouts for (e.g., "2025-09-21", "tomorrow", "next Tuesday")
        modification_request: Description of what the new workouts should be
        user_id: The user identifier (injected from state)

    Returns:
        Modification result with details of deleted and created workouts
    """
    from agent.workout_management_agent import get_workout_management_agent

    if not user_id:
        return {
            "success": False,
            "error": "User ID is required but not provided in state",
        }

    write_to_stream(
        {"type": "status", "content": f"Modifying all workouts for {date}..."}
    )

    try:
        agent = get_workout_management_agent()
        result = await agent.modify_workouts_by_date(
            user_id=user_id,
            target_date=date,
            modification_request=modification_request,
        )

        return result

    except Exception as e:
        write_to_stream(
            {
                "type": "error",
                "content": f"Error modifying workouts for {date}: {str(e)}",
            }
        )
        return {"success": False, "error": str(e)}


@tool
def get_scheduled_workouts(
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Get a comprehensive overview of the athlete's training status.

    This function provides a detailed summary of the athlete's recent training history,
    current training metrics, and upcoming planned workouts. It is designed to give
    coaches and LLM agents a holistic view of the athlete's status for informed decision-making.
    """

    def parse_datetime_robust(dt_series):
        """Robust datetime parsing that handles various formats"""
        try:
            return pd.to_datetime(dt_series, format="mixed", errors="coerce")
        except Exception:
            try:
                return pd.to_datetime(dt_series, format="ISO8601", errors="coerce")
            except Exception:
                return pd.to_datetime(dt_series, errors="coerce")

    # TODO komplett überarbeiten
    lookahead_days = 14
    # Date ranges
    today = datetime.now().date()
    lookahead_end = today + timedelta(days=lookahead_days)

    result = {
        "scheduled_workouts": {},
    }
    supabase = get_supabase()
    planned_workouts = (
        supabase.table("workouts_scheduled")
        .select("id, workout_id(sport,workout_text), scheduled_time, created_at")
        .eq("user_id", user_id)
        .gte("scheduled_time", today.isoformat())
        .lte("scheduled_time", lookahead_end.isoformat())
        .order("scheduled_time")
        .execute()
        .data
    )

    if planned_workouts:
        planned_df = pd.DataFrame(planned_workouts)
        # Robust datetime parsing
        planned_df["scheduled_time"] = parse_datetime_robust(
            planned_df["scheduled_time"]
        )
        planned_df["date"] = planned_df["scheduled_time"].dt.date

        # Group by week
        this_week_end = today + timedelta(days=6)
        this_week = planned_df[planned_df["date"] <= this_week_end]
        next_week = planned_df[planned_df["date"] > this_week_end]

        result["scheduled_workouts"] = {
            "total_scheduled_sessions": len(planned_workouts),
            "this_week_scheduled": len(this_week),
            "next_week_scheduled": len(next_week),
            "upcoming_sessions": [
                {
                    "workout_scheduled_id": row["id"],
                    "date": row["date"].isoformat(),
                    "scheduled_time": row["scheduled_time"].strftime("%H:%M"),
                    "workout_id": row["workout_id"],
                }
                for _, row in planned_df.iterrows()
            ],
        }
    else:
        result["scheduled_workouts"] = {
            "message": f"No scheduled workouts found for next {lookahead_days} days",
            "total_scheduled_sessions": 0,
        }
    return result


@tool()
async def assess_current_training_week(
    week_start_date: Optional[str] = None,
    user_id: Annotated[Optional[str], InjectedState("user_id")] = None,
) -> Dict[str, Any]:
    """Get a detailed professional assessment of the training week with day-by-day breakdown.

    This tool provides a comprehensive view of scheduled workouts for a given week,
    including daily sessions, training load distribution, and professional LLM-powered
    assessment against the user's goals and training strategy.

    Features:
    - Day-by-day workout schedule with session details
    - Training load metrics and distribution analysis
    - Professional trainer assessment using LLM evaluation
    - Goal alignment and periodization review
    - Actionable recommendations for training adjustments

    Args:
        week_start_date: Optional start date of week to assess (e.g., "2025-09-21", "this week").
                        If not provided, uses current week.
        user_id: The user identifier (injected from state)

    Returns:
        Comprehensive assessment including professional evaluation and priority rating
    """
    if not user_id:
        return {
            "success": False,
            "error": "User ID is required but not provided in state",
        }

    try:
        # Parse week start date
        from datetime import datetime, timedelta

        if week_start_date:
            # Try to parse the provided date
            try:
                if week_start_date.lower() in ["this week", "current week"]:
                    today = datetime.now()
                    week_start = today - timedelta(
                        days=today.weekday()
                    )  # Monday of current week
                elif week_start_date.lower() in ["next week"]:
                    today = datetime.now()
                    week_start = (
                        today - timedelta(days=today.weekday()) + timedelta(days=7)
                    )
                else:
                    # Try to parse as date
                    if re.match(r"\d{4}-\d{2}-\d{2}", week_start_date):
                        week_start = datetime.strptime(week_start_date[:10], "%Y-%m-%d")
                    else:
                        # Fallback to current week
                        today = datetime.now()
                        week_start = today - timedelta(days=today.weekday())
            except Exception:
                today = datetime.now()
                week_start = today - timedelta(days=today.weekday())
        else:
            # Default to current week
            today = datetime.now()
            week_start = today - timedelta(days=today.weekday())

        week_end = week_start + timedelta(days=6)
        week_start_str = week_start.date().isoformat()
        week_end_str = week_end.date().isoformat()

        write_to_stream(
            {
                "type": "status",
                "content": f"Assessing training week {week_start_str} to {week_end_str}...",
            }
        )

        # OPTIMIZATION: Get both user info fields in a single query
        supabase = get_supabase()
        user_info_response = (
            supabase.table("user_infos")
            .select("llm_long_term_training_strategy, llm_user_information")
            .eq("user_id", user_id)
            .execute()
        )

        user_information = ""
        user_profile = ""
        if user_info_response.data:
            user_information = user_info_response.data[0].get(
                "llm_long_term_training_strategy", ""
            )
            user_profile = user_info_response.data[0].get("llm_user_information", "")

        # Get scheduled workouts for the week
        workouts_result = (
            supabase.table("workouts_scheduled")
            .select("*, workouts(name, sport, workout_text, workout_minutes)")
            .eq("user_id", user_id)
            .gte("scheduled_time", f"{week_start_str}T00:00:00")
            .lte("scheduled_time", f"{week_end_str}T23:59:59")
            .order("scheduled_time")
            .execute()
        )

        scheduled_workouts = workouts_result.data if workouts_result.data else []

        # Get training status for context
        training_status_result = (
            supabase.table("training_status")
            .select("*")
            .eq("user_id", user_id)
            .order("date", desc=True)
            .limit(7)
            .execute()
        )

        recent_training_status = (
            training_status_result.data if training_status_result.data else []
        )

        # Analyze the week
        analysis = _analyze_training_week(
            scheduled_workouts,
            user_information,
            recent_training_status,
            week_start_str,
            week_end_str,
        )

        # Add professional LLM-powered assessment
        write_to_stream(
            {
                "type": "status",
                "content": "Getting professional trainer assessment...",
            }
        )

        professional_assessment = await _get_professional_week_assessment(
            analysis, user_profile, user_information, week_start_str, week_end_str
        )

        # Merge professional assessment into analysis
        analysis["professional_assessment"] = professional_assessment

        # Don't show as action - this is just an assessment, not a database change
        # write_to_stream(
        #     {
        #         "type": "action",
        #         "content": f'{{"type":"training_week_assessed","week":"{week_start_str}","assessment":"{analysis["overall_assessment"]}","workouts_count":{len(scheduled_workouts)}}}',
        #     }
        # )

        write_to_stream(
            {
                "type": "status",
                "content": "Training week assessment completed with professional insights",
            }
        )

        return {
            "success": True,
            "week_period": f"{week_start_str} to {week_end_str}",
            "assessment": analysis["overall_assessment"],
            "recommendations": analysis["recommendations"],
            "week_summary": analysis["week_summary"],
            "daily_schedule": analysis["daily_schedule"],
            "professional_assessment": analysis["professional_assessment"],
            "note": analysis.get("note", "Basic analysis completed"),
            "assessed_at": datetime.now().isoformat(),
        }

    except Exception as e:
        LOGGER.error(f"Error assessing training week: {e}")
        write_to_stream(
            {"type": "error", "content": f"Error assessing training week: {str(e)}"}
        )
        return {
            "success": False,
            "error": str(e),
        }


async def _get_professional_week_assessment(
    basic_analysis: Dict[str, Any],
    user_profile: str,
    training_strategy: str,
    week_start: str,
    week_end: str,
) -> Dict[str, Any]:
    """
    Get professional trainer assessment using LLM to evaluate the week against user goals and strategy.

    Args:
        basic_analysis: The basic metrics and daily schedule analysis
        user_profile: User information including goals, preferences, etc.
        training_strategy: Long-term training strategy and periodization plan
        week_start: Start date of the week being assessed
        week_end: End date of the week being assessed

    Returns:
        Professional assessment with strategic recommendations
    """
    try:
        # OPTIMIZATION: Use faster Haiku model for quick assessments
        llm = get_llm("anthropic/claude-3.5-haiku")

        # Format the daily schedule for LLM review
        daily_schedule_text = []
        for date, day_info in basic_analysis["daily_schedule"].items():
            day_name = day_info["day_name"]
            sessions = day_info["sessions"]
            if sessions:
                session_details = []
                for session in sessions:
                    session_details.append(
                        f"{session['sport']} ({session['duration_minutes']}min)"
                    )
                daily_schedule_text.append(
                    f"{day_name} ({date}): {', '.join(session_details)}"
                )
            else:
                daily_schedule_text.append(f"{day_name} ({date}): Rest day")

        # Build comprehensive prompt for professional assessment
        assessment_prompt = f"""You are an expert personal trainer conducting a professional weekly training assessment.

ATHLETE PROFILE:
{user_profile if user_profile else "No detailed profile available - assess based on training data"}

TRAINING STRATEGY:
{training_strategy if training_strategy else "No specific strategy defined - provide general training guidance"}

WEEK BEING ASSESSED: {week_start} to {week_end}

WEEKLY TRAINING SCHEDULE:
{chr(10).join(daily_schedule_text)}

TRAINING METRICS:
- Total workouts: {basic_analysis["week_summary"]["total_workouts"]}
- Total training time: {basic_analysis["week_summary"]["total_hours"]} hours
- Rest days: {basic_analysis["week_summary"]["rest_days"]}
- Sports breakdown: {basic_analysis["week_summary"]["sports_breakdown"]}
- High-volume days (>2h): {basic_analysis["week_summary"]["high_volume_days"]}

PROVIDE A PROFESSIONAL TRAINER ASSESSMENT INCLUDING:

1. **GOAL ALIGNMENT**: How well does this week align with the athlete's stated goals and training strategy?

2. **TRAINING LOAD EVALUATION**: Is the volume, intensity distribution, and recovery appropriate for this athlete?

3. **PERIODIZATION ASSESSMENT**: How does this week fit into their long-term training progression?

4. **SPECIFIC CONCERNS**: Any red flags regarding overtraining, undertraining, or poor load distribution?

5. **ACTIONABLE RECOMMENDATIONS**: Specific changes or improvements needed for this week or upcoming weeks.

6. **PRIORITY RATING**: Rate this week as one of:
   - EXCELLENT: Perfect execution, no changes needed
   - GOOD: Minor adjustments would optimize
   - NEEDS_IMPROVEMENT: Moderate changes required
   - POOR: Significant restructuring needed

Format your response as a structured assessment that another coach could use to make informed training decisions.
Focus on being specific, actionable, and based on exercise science principles."""

        response = await llm.ainvoke(assessment_prompt)
        professional_assessment_text = response.content.strip()

        # Extract priority rating from the assessment
        priority_rating = "NEEDS_IMPROVEMENT"  # default
        if "EXCELLENT" in professional_assessment_text.upper():
            priority_rating = "EXCELLENT"
        elif "GOOD" in professional_assessment_text.upper():
            priority_rating = "GOOD"
        elif "POOR" in professional_assessment_text.upper():
            priority_rating = "POOR"

        return {
            "professional_evaluation": professional_assessment_text,
            "priority_rating": priority_rating,
            "assessed_week": f"{week_start} to {week_end}",
            "assessment_timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        LOGGER.error(f"Error during professional assessment: {e}")
        return {
            "professional_evaluation": f"Professional assessment unavailable: {str(e)}",
            "priority_rating": "UNKNOWN",
            "assessed_week": f"{week_start} to {week_end}",
            "assessment_timestamp": datetime.now().isoformat(),
        }


def _analyze_training_week(
    scheduled_workouts: List[Dict],
    user_information: str = "",
    recent_training_status: List[Dict] = None,
    week_start: str = "",
    week_end: str = "",
) -> Dict[str, Any]:
    """Analyze a week's training schedule with detailed day-by-day breakdown."""
    from datetime import datetime, timedelta

    # Parse week dates to create daily structure
    week_start_date = datetime.strptime(week_start, "%Y-%m-%d")

    # Create daily schedule structure
    daily_schedule = {}
    for i in range(7):
        day_date = week_start_date + timedelta(days=i)
        day_name = day_date.strftime("%A")
        day_key = day_date.strftime("%Y-%m-%d")
        daily_schedule[day_key] = {
            "day_name": day_name,
            "date": day_key,
            "sessions": [],
            "total_minutes": 0,
            "session_count": 0,
        }

    # Populate daily schedule with workouts
    total_workouts = len(scheduled_workouts)
    total_minutes = 0
    sports_count = {}
    explicit_rest_days = 0  # Track explicit rest day workouts

    for workout in scheduled_workouts:
        # Extract workout details
        workout_data = workout.get("workouts", {})
        sport = workout_data.get("sport", "Unknown")
        workout_name = workout_data.get("name", "Unnamed Workout")
        workout_minutes = workout_data.get("workout_minutes", 0)
        workout_text = workout_data.get("workout_text", "")

        # Track explicit rest days separately
        if sport == "rest_day":
            explicit_rest_days += 1

        # Parse scheduled date
        scheduled_time = workout.get("scheduled_time", "")
        if scheduled_time:
            try:
                if isinstance(scheduled_time, str):
                    workout_date = datetime.fromisoformat(
                        scheduled_time.replace("Z", "+00:00")
                    ).date()
                else:
                    workout_date = scheduled_time.date()
                workout_date_str = workout_date.strftime("%Y-%m-%d")

                # Add to daily schedule if within the week
                if workout_date_str in daily_schedule:
                    session_info = {
                        "sport": sport,
                        "name": workout_name,
                        "duration_minutes": workout_minutes,
                        "scheduled_time": scheduled_time,
                        "workout_text_preview": workout_text[:100] + "..."
                        if len(workout_text) > 100
                        else workout_text,
                    }
                    daily_schedule[workout_date_str]["sessions"].append(session_info)
                    daily_schedule[workout_date_str]["session_count"] += 1

                    # Don't include rest days in training volume
                    if sport != "rest_day":
                        daily_schedule[workout_date_str]["total_minutes"] += (
                            workout_minutes
                        )
                        total_minutes += workout_minutes

                    # Update sports count
                    sports_count[sport] = sports_count.get(sport, 0) + 1

            except Exception:
                # Skip workouts with invalid dates
                continue

    total_hours = round(total_minutes / 60, 1)

    # Generate informational recommendations (no automatic adjustment flags)
    recommendations = []

    # Volume insights
    if total_hours > 15:
        recommendations.append(
            f"High training volume: {total_hours}h per week. Monitor recovery and adaptation."
        )
    elif total_hours > 10:
        recommendations.append(
            f"Substantial training volume: {total_hours}h per week. Ensure proper periodization."
        )
    elif total_hours < 3 and total_workouts > 0:
        recommendations.append(
            f"Light training volume: {total_hours}h per week. Consider if this aligns with your goals."
        )
    elif total_workouts == 0:
        recommendations.append("Rest week - no workouts scheduled.")

    # Frequency insights
    if total_workouts > 10:
        recommendations.append(
            f"High frequency: {total_workouts} sessions. Consider training load distribution."
        )
    elif total_workouts >= 7:
        recommendations.append(
            f"Daily training frequency: {total_workouts} sessions. Monitor recovery status."
        )

    # Daily distribution insights
    rest_days = sum(1 for day in daily_schedule.values() if day["session_count"] == 0)
    high_volume_days = sum(
        1 for day in daily_schedule.values() if day["total_minutes"] > 120
    )

    # Provide recommendations based on explicit rest days
    if explicit_rest_days > 0:
        recommendations.append(
            f"{explicit_rest_days} explicit rest day(s) planned - good recovery structure."
        )
    elif rest_days == 0:
        recommendations.append("No rest days scheduled - consider recovery needs.")
    elif rest_days == 1:
        recommendations.append("One rest day scheduled - monitor fatigue levels.")
    else:
        recommendations.append(f"{rest_days} rest days - good recovery distribution.")

    # Suggest adding explicit rest days for heavy training
    if explicit_rest_days == 0 and total_workouts >= 6 and rest_days < 2:
        recommendations.append(
            "Consider adding 1-2 explicit rest days for optimal recovery with current training load."
        )

    if high_volume_days > 0:
        recommendations.append(
            f"{high_volume_days} high-volume days (>2h) - ensure adequate recovery."
        )

    # Sport distribution insights
    if len(sports_count) > 1:
        main_sport = max(sports_count, key=sports_count.get)
        recommendations.append(
            f"Multi-sport week: {main_sport} primary ({sports_count[main_sport]} sessions)."
        )
    elif len(sports_count) == 1:
        sport = list(sports_count.keys())[0]
        recommendations.append(
            f"Single-sport focus: {sport} ({sports_count[sport]} sessions)."
        )

    # Overall assessment based on multiple factors
    if total_workouts == 0:
        overall_assessment = "rest_week"
    elif total_hours > 15 or total_workouts > 12:
        overall_assessment = "high_load"
    elif total_hours < 3 and total_workouts > 0:
        overall_assessment = "light_load"
    elif rest_days == 0 and total_workouts >= 7:
        overall_assessment = "high_frequency"
    else:
        overall_assessment = "balanced"

    return {
        "overall_assessment": overall_assessment,
        "recommendations": recommendations,
        "daily_schedule": daily_schedule,
        "week_summary": {
            "total_workouts": total_workouts,
            "total_hours": total_hours,
            "total_minutes": total_minutes,
            "sports_breakdown": sports_count,
            "rest_days": rest_days,
            "high_volume_days": high_volume_days,
            "average_session_duration": round(total_minutes / total_workouts, 1)
            if total_workouts > 0
            else 0,
        },
        "note": "Detailed daily analysis with informational recommendations for agent decision-making.",
    }


# Removed: _analyze_workout_intensities function - language-dependent text parsing not reliable


# Removed: _has_easy_day function - language-dependent text parsing not reliable


# Removed: _parse_user_strategy function - replaced with LLM-based strategy management


# Removed: _get_fitness_context function - currently unused


# ============================================================================
# TOOL SELECTION LISTS FOR DIFFERENT AGENTS
# ============================================================================

tools_main_agent = [
    get_current_datetime,
    get_user_information,
    update_user_information,
    get_long_term_training_strategy,
    update_long_term_training_strategy,
    query_database,
    # Direct workout management tools (date-based approach)
    get_scheduled_workouts,
    workout_create,
    delete_workouts_by_date,
    modify_workouts_by_date,
    assess_current_training_week,
]

tools_trainer_agent = [
    get_current_datetime,
    get_long_term_training_strategy,
    update_long_term_training_strategy,
    get_scheduled_workouts,
    workout_create,  # calls the workout management agent
    delete_workouts_by_date,  # calls the workout management agent
    modify_workouts_by_date,  # calls the workout management agent
]

tools_workout_management_agent = [
    get_current_datetime,
    workout_create,
    delete_workouts_by_date,
    modify_workouts_by_date,
]
