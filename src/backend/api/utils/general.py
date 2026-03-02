import os
from datetime import datetime
from typing import Optional
from uuid import UUID

from agent.feedback_agent import give_feedback
from api.database import supabase
from api.log import LOGGER
from api.training_status import calculate_training_status, date_needs_update
from dotenv import load_dotenv

from supabase import Client, ClientOptions, create_client

load_dotenv()


def get_user_supabase_client(jwt_token: str) -> Client:
    """
    Create a Supabase client with user's JWT token for RLS authentication.

    This is required when using the new Supabase keys format, where RLS policies
    are enforced based on the JWT token's auth.uid().

    Args:
        jwt_token: The user's JWT token from Authorization header

    Returns:
        Client: Supabase client configured with the user's JWT token
    """
    supabase_url = os.getenv("PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("PRIVATE_SUPABASE_KEY")

    return create_client(
        supabase_url,
        supabase_key,
        options=ClientOptions(headers={"Authorization": f"Bearer {jwt_token}"}),
    )


def detect_and_link_duplicate_session(
    session_id: UUID, user_id: str, sport: str, start_time: str, activity_id: str
) -> Optional[dict]:
    """
    Detect if a session is a duplicate based on start time matching.

    This function implements UNIVERSAL duplicate detection:
    - Checks for existing sessions with the same user_id, sport, and start_time (exact match to the second)
    - If found, marks the CURRENT activity as duplicate_of the ORIGINAL activity
    - Returns the original session's custom_data_id to link to

    Why time-based matching?
    - Works regardless of upload order (Wahoo→Strava or Strava→Wahoo)
    - Works regardless of upload source (manual, Wahoo, Strava, Garmin, etc.)
    - The FIRST session to be processed becomes the "original"
    - All subsequent sessions with same start_time are marked as duplicates

    Examples:
    1. User uploads to Wahoo → Wahoo session created FIRST → Becomes original
       Later: Strava syncs → Strava session marked as duplicate of Wahoo

    2. User uploads to Strava → Strava session created FIRST → Becomes original
       Later: Manual FIT upload → Manual session marked as duplicate of Strava

    3. User uploads same FIT file twice → First upload is original, second is duplicate

    Returns:
        dict with:
            - 'custom_data_id': str - The custom_data_id to link to
            - 'original_session_id': str - The original session's ID
            - 'original_activity_id': str - The original activity's ID
        Or None if no duplicate found
    """
    try:
        # Look for existing sessions with exact same start_time, user, and sport
        # Exclude the current session
        existing_sessions = (
            supabase.table("sessions")
            .select(
                "id, session_custom_data_id, activity_id, activities!inner(id, upload_source)"
            )
            .eq("user_id", user_id)
            .eq("sport", sport)
            .eq("start_time", start_time)
            .neq("id", str(session_id))  # Exclude current session
            .not_.is_("session_custom_data_id", "null")  # Must have custom_data already
            .order("created_at", desc=False)  # Get oldest first (original)
            .limit(1)
            .execute()
        )

        if existing_sessions.data and len(existing_sessions.data) > 0:
            original_session = existing_sessions.data[0]
            original_custom_data_id = original_session["session_custom_data_id"]
            original_session_id = original_session["id"]
            original_activity_id = original_session["activity_id"]
            original_source = original_session["activities"]["upload_source"]

            LOGGER.info(
                f"🔗 Duplicate session detected! start_time={start_time}, "
                f"original_session={original_session_id} ({original_source}), "
                f"will link to custom_data={original_custom_data_id}"
            )

            # Mark current activity as duplicate of original activity
            try:
                supabase.table("activities").update(
                    {"duplicate_of": original_activity_id}
                ).eq("id", activity_id).execute()
                LOGGER.info(
                    f"✅ Marked activity {activity_id} as duplicate of {original_activity_id}"
                )
            except Exception as e:
                LOGGER.warning(f"⚠️ Failed to mark activity as duplicate: {e}")

            return {
                "custom_data_id": original_custom_data_id,
                "original_session_id": original_session_id,
                "original_activity_id": original_activity_id,
            }

        return None

    except Exception as e:
        LOGGER.error(f"❌ Error detecting duplicate session: {e}")
        return None


def link_or_create_session_custom_data(session_id: UUID) -> tuple[Optional[str], bool]:
    """
    Link session to existing custom_data (if duplicate) or create new one.

    This is the main entry point for session custom data management.
    It delegates duplicate detection to detect_and_link_duplicate_session().

    Returns:
        tuple of (custom_data_id, is_duplicate):
            - custom_data_id (str): The custom_data_id if successful, None otherwise
            - is_duplicate (bool): True if this is a duplicate session, False if original
    """
    try:
        # Get session details with activity info
        session_result = (
            supabase.table("sessions")
            .select(
                "id, user_id, sport, start_time, activity_id, activities!inner(id, upload_source)"
            )
            .eq("id", str(session_id))
            .single()
            .execute()
        )

        if not session_result.data:
            LOGGER.error(f"❌ Session {session_id} not found")
            return None, False

        session = session_result.data
        user_id = session["user_id"]
        sport = session["sport"]
        start_time = session["start_time"]
        activity_id = session["activity_id"]
        upload_source = session["activities"]["upload_source"]

        custom_data_id = None
        is_duplicate = False

        # UNIVERSAL DUPLICATE DETECTION: Check for duplicate by start time
        duplicate_info = detect_and_link_duplicate_session(
            session_id, user_id, sport, start_time, activity_id
        )

        if duplicate_info:
            custom_data_id = duplicate_info["custom_data_id"]
            is_duplicate = True
            LOGGER.info(
                f"🔗 Linking {upload_source} session to original session's custom_data "
                f"(custom_data_id: {custom_data_id})"
            )

        # If no duplicate found, create new custom_data
        if not custom_data_id:
            custom_data_result = (
                supabase.table("session_custom_data")
                .insert({"user_id": user_id})
                .execute()
            )

            if custom_data_result.data:
                custom_data_id = custom_data_result.data[0]["id"]
                LOGGER.debug(f"✨ Created new custom_data record: {custom_data_id}")
            else:
                LOGGER.error(
                    f"❌ Failed to create custom_data for session {session_id}"
                )
                return None, False

        # Update session with custom_data_id
        update_result = (
            supabase.table("sessions")
            .update({"session_custom_data_id": custom_data_id})
            .eq("id", str(session_id))
            .execute()
        )

        if not update_result.data:
            LOGGER.error(
                f"❌ Failed to update session {session_id} with custom_data_id"
            )
            return None, False

        LOGGER.info(
            f"✅ Linked session {session_id} to custom_data {custom_data_id} (duplicate: {is_duplicate})"
        )
        return custom_data_id, is_duplicate

    except Exception as e:
        LOGGER.error(
            f"❌ Error linking/creating custom_data for session {session_id}: {e}"
        )
        return None, False


def calculate_hr_load_for_session(session_id: UUID) -> Optional[float]:
    """
    Calculate the heart rate load for a given session based on its records.

    HR Load is calculated as:
    HR Load = (Average Heart Rate)^2 * Duration (in hours) / 1000

    Args:
        session_id (UUID): The UUID of the session to calculate HR load for.
    Returns:
        Optional[float]: The calculated HR load, or None if it cannot be calculated.
    """
    try:
        # call the postgresql fuction
        result = supabase.rpc(
            "calculate_session_hr_load",
            params={"session_uuid": str(session_id)},
        ).execute()
        if result.data:
            return result.data
        else:
            LOGGER.warning(f"⚠️ No HR load calculated for session {session_id}")
            return None

    except Exception as e:
        LOGGER.error(f"❌ Error calculating HR load for session {session_id}: {e}")
        return None


def set_session_title(custom_data_id: str, title: str) -> bool:
    """
    Set or update the title for a session_custom_data record.

    This function updates the title in session_custom_data, which automatically
    applies to ALL sessions sharing this custom_data_id (including duplicates).

    Args:
        custom_data_id: The UUID of the session_custom_data record
        title: The title to set

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        result = (
            supabase.table("session_custom_data")
            .update({"title": title})
            .eq("id", custom_data_id)
            .execute()
        )

        if result.data:
            LOGGER.debug(f"✅ Set title '{title}' for custom_data {custom_data_id}")
            return True
        else:
            LOGGER.warning(f"⚠️ Failed to set title for custom_data {custom_data_id}")
            return False

    except Exception as e:
        LOGGER.error(f"❌ Error setting title for custom_data {custom_data_id}: {e}")
        return False


async def generate_or_retrieve_feedback(
    session_id: UUID, custom_data_id: Optional[str], user_id: str
) -> Optional[dict]:
    """
    Generate feedback for a session or retrieve existing feedback for duplicates.

    For duplicate sessions (sessions that share custom_data_id), this retrieves the existing
    feedback instead of generating new feedback. Only generates new feedback if none exists.

    Args:
        session_id: The session to generate/retrieve feedback for
        custom_data_id: The custom_data_id to check for existing feedback (None for non-duplicates)
        user_id: User ID (currently not used for restrictions)

    Returns:
        dict with 'success' and 'feedback' keys, or None if feedback generation failed
    """
    existing_feedback = None

    # wait for 10 seconds here because if the first webhook is still processing,
    # the feedback might not yet be available for duplicate sessions
    import asyncio

    await asyncio.sleep(10)

    # Check if feedback already exists in custom_data (for duplicate sessions)
    if custom_data_id:
        try:
            custom_data_check = (
                supabase.table("session_custom_data")
                .select("llm_feedback")
                .eq("id", custom_data_id)
                .single()
                .execute()
            )
            if custom_data_check.data:
                existing_feedback = custom_data_check.data.get("llm_feedback")
        except Exception as e:
            LOGGER.warning(f"⚠️ Could not check existing feedback: {e}")

    # Generate new feedback if none exists
    if existing_feedback:
        LOGGER.info(
            "♻️ Using existing feedback from shared custom_data (duplicate session)"
        )
        return {"success": True, "feedback": existing_feedback}
    else:
        result = await give_feedback(str(session_id))
        LOGGER.info(f"Feedback result: {result}")
        return result


async def post_feedback_to_strava(
    user_id: str, custom_data_id: Optional[str], session_id: UUID, feedback: str
) -> None:
    """
    Post feedback to Strava for all activities that share the same custom_data_id.

    This function:
    1. Checks if user has enabled Strava feedback posting
    2. Checks if the session's activity has a strava_activity_id
    3. Posts feedback to ALL Strava activities linked to the same custom_data_id (including duplicates)

    Args:
        user_id: User to check Strava preferences for
        custom_data_id: The custom_data_id to find related sessions (None for non-duplicates)
        session_id: The current session being processed
        feedback: The feedback text to post
    """
    try:
        # Check if user wants feedback posted to Strava
        user_prefs_response = (
            supabase.table("user_infos")
            .select("post_feedback_to_strava")
            .eq("user_id", user_id)
            .execute()
        )

        if not (
            user_prefs_response.data
            and len(user_prefs_response.data) > 0
            and user_prefs_response.data[0].get("post_feedback_to_strava", False)
        ):
            LOGGER.debug(f"ℹ️ User {user_id} has not enabled Strava feedback posting")
            return

        # Get ALL sessions that share the same custom_data_id
        # This includes the current session AND any duplicates
        all_related_sessions = []
        if custom_data_id:
            related_sessions_response = (
                supabase.table("sessions")
                .select("id, activity_id")
                .eq("session_custom_data_id", custom_data_id)
                .execute()
            )
            if related_sessions_response.data:
                all_related_sessions = related_sessions_response.data
        else:
            # Fallback to just current session if no custom_data_id
            all_related_sessions = [{"id": str(session_id), "activity_id": None}]

        # Get athlete_id once for all Strava posts
        from api.routers.strava.helpers import (
            get_athlete_by_user_id,
            update_strava_activity_description,
        )

        athlete_data = get_athlete_by_user_id(user_id)
        if not athlete_data or not athlete_data.get("athlete_id"):
            LOGGER.debug(f"ℹ️ No Strava athlete data found for user {user_id}")
            return

        athlete_id = str(athlete_data["athlete_id"])

        # Post feedback to ALL Strava activities (original + duplicates)
        for session_info in all_related_sessions:
            try:
                activity_id = session_info.get("activity_id")
                if not activity_id:
                    continue

                # Get the external_id and upload_source
                strava_info_response = (
                    supabase.table("activities")
                    .select("external_id, upload_source")
                    .eq("id", activity_id)
                    .execute()
                )

                if strava_info_response.data and len(strava_info_response.data) > 0:
                    activity_data = strava_info_response.data[0]
                    external_id = activity_data.get("external_id")
                    upload_source = activity_data.get("upload_source")

                    if upload_source == "strava" and external_id:
                        try:
                            strava_activity_id = int(external_id)
                            # Update Strava activity with feedback
                            success = await update_strava_activity_description(
                                strava_activity_id, athlete_id, feedback
                            )

                            if success:
                                LOGGER.info(
                                    f"✅ Posted feedback to Strava activity {strava_activity_id} "
                                    f"(session {session_info['id']})"
                                )
                            else:
                                LOGGER.warning(
                                    f"⚠️ Failed to post feedback to Strava activity {strava_activity_id}"
                                )
                        except (ValueError, TypeError) as e:
                            LOGGER.warning(
                                f"⚠️ Invalid external_id for Strava activity: {external_id}, error: {e}"
                            )
            except Exception as e:
                LOGGER.warning(
                    f"⚠️ Error posting feedback to Strava for session {session_info['id']}: {e}"
                )
                # Continue with other sessions even if one fails

    except Exception as e:
        LOGGER.warning(
            f"⚠️ Error posting feedback to Strava for session {session_id}: {e}"
        )
        # Don't fail the entire post-processing if Strava update fails


async def post_processing_of_session(session_id):
    """
    Perform post-processing tasks for a session.

    This includes:
    1. Link or create session_custom_data (handles duplicate detection)
    2. For NON-DUPLICATE sessions only:
       - Calculate user metrics (HR, FTP, watts) if automatic mode is enabled
       - Calculate HR load for the session
       - Update training status
       - Generate feedback
    3. For ALL sessions (including duplicates):
       - Post feedback to Strava (only if user enabled and activity has strava_activity_id)

    Performance optimization: Duplicate sessions skip expensive calculations since
    they were already performed for the original session.
    """
    # Import here to avoid circular dependency
    from api.routers.ai_tools import calculate_ftp, max_heart_rate_user, save_max_watts

    session_data = (
        supabase.table("sessions").select("user_id").eq("id", str(session_id)).execute()
    )

    if not session_data.data or len(session_data.data) == 0:
        LOGGER.error(f"❌ No session found with id {session_id}")
        return
    user_id = session_data.data[0]["user_id"]
    if not user_id:
        LOGGER.error(f"❌ No user_id found for session {session_id}")
        return

    LOGGER.info(f"🔄 Starting post-processing for session {session_id}")

    # STEP 1: Link or create session_custom_data (handles duplicates)
    custom_data_id, is_duplicate = link_or_create_session_custom_data(session_id)
    if not custom_data_id:
        LOGGER.warning(
            f"⚠️ Failed to link/create custom_data for session {session_id}, continuing anyway"
        )

    # STEP 1.5: Set title for non-duplicate sessions (duplicates inherit title from original)
    if not is_duplicate and custom_data_id:
        # Get session info to generate title
        session_info = (
            supabase.table("sessions")
            .select("sport, activities!inner(upload_source, external_id)")
            .eq("id", str(session_id))
            .single()
            .execute()
        )

        if session_info.data:
            sport = session_info.data.get("sport", "Activity")
            upload_source = session_info.data.get("activities", {}).get("upload_source")
            external_id = session_info.data.get("activities", {}).get("external_id")

            # For Strava sessions, fetch the activity name from Strava
            title = None
            if upload_source == "strava" and external_id:
                try:
                    strava_activity_id = int(external_id)
                    # Get the Strava activity name from strava_responses table
                    strava_response = (
                        supabase.table("strava_responses")
                        .select("response_json")
                        .eq("strava_id", strava_activity_id)
                        .eq("user_id", user_id)
                        .single()
                        .execute()
                    )
                    if strava_response.data:
                        response_json = strava_response.data.get("response_json", {})
                        title = response_json.get("name")
                except Exception as e:
                    LOGGER.warning(f"⚠️ Failed to get Strava activity name: {e}")

            # Fallback to sport-based title if no Strava name
            if not title:
                title = sport.replace("_", " ").title() if sport else "Activity"

            # Set the title in custom_data
            set_session_title(custom_data_id, title)
            LOGGER.info(f"📝 Set title '{title}' for session {session_id}")

        # STEP 1.6: Copy feel/rpe from session to custom_data (for FIT file extracted values)
        # Get feel/rpe from session
        session_feel_rpe = (
            supabase.table("sessions")
            .select("feel, rpe")
            .eq("id", str(session_id))
            .single()
            .execute()
        )

        if session_feel_rpe.data:
            feel = session_feel_rpe.data.get("feel")
            rpe = session_feel_rpe.data.get("rpe")

            # Copy to session_custom_data if values exist
            if feel is not None or rpe is not None:
                update_data = {}
                if feel is not None:
                    update_data["feel"] = feel
                if rpe is not None:
                    update_data["rpe"] = rpe

                supabase.table("session_custom_data").update(update_data).eq(
                    "id", custom_data_id
                ).execute()
                LOGGER.info(
                    f"📝 Copied feel/rpe to custom_data for session {session_id}: feel={feel}, rpe={rpe}"
                )

    # STEP 2: For duplicate sessions, skip expensive calculations
    if is_duplicate:
        LOGGER.info(
            f"♻️ Skipping calculations for duplicate session {session_id} (already done for original)"
        )
    else:
        # Only perform calculations for original (non-duplicate) sessions
        LOGGER.info(f"🆕 Processing original session {session_id}")

        save_max_watts(str(session_id))

        max_heart_rate = max_heart_rate_user(user_id)
        ftp = calculate_ftp(user_id)

        LOGGER.info(
            f"💓 Max heart rate for user {user_id} is {max_heart_rate} and FTP is {ftp}"
        )

        # Calculate HR load
        hr_load = calculate_hr_load_for_session(str(session_id))
        LOGGER.info(f"💓 Calculated HR load {hr_load} for session {session_id}")

        data = (
            supabase.table("sessions")
            .select("user_id", "start_time")
            .eq("id", str(session_id))
            .execute()
        )
        session_date = data.data[0]["start_time"]
        if not session_date:
            LOGGER.error(f"❌ No start_time found for session {session_id}")
        else:
            # Convert string to datetime object if needed
            if isinstance(session_date, str):
                session_date = datetime.fromisoformat(
                    session_date.replace("Z", "+00:00")
                )
            date_needs_update(user_id, session_date)

        # Update training status (only for non-duplicates)
        calculate_training_status()

    # STEP 3: Generate or retrieve feedback (skips generation for duplicates)
    result = await generate_or_retrieve_feedback(session_id, custom_data_id, user_id)

    # STEP 4: Post feedback to Strava (for ALL sessions if conditions are met)
    if result and result.get("success") and result.get("feedback"):
        await post_feedback_to_strava(
            user_id, custom_data_id, session_id, result["feedback"]
        )

    LOGGER.info(f"✅ Completed post-processing for session {session_id}")
    return
