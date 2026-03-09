"""
Unified Workout Sync Worker

Background scheduler for batch processing workout sync queue across all providers.
Runs every 10 minutes to sync pending workouts to Wahoo, Garmin, and other providers.
Also handles daily overview push notifications.
"""

import asyncio
import os
from datetime import date, datetime

import pytz
from api.database import supabase
from api.log import LOGGER
from api.services.push_notifications import send_push_notification
from api.services.workout_sync import get_sync_service
from api.training_status import calculate_training_status_all_users
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger


def run_batch_sync():
    """
    Scheduled job to process unified workout sync queue.

    This function is called by the scheduler every N minutes to batch process
    all pending sync operations across all providers (Wahoo, Garmin, etc.).
    """
    try:
        LOGGER.info("🔄 Starting scheduled workout batch sync...")

        sync_service = get_sync_service()

        # Run async function in sync context
        result = asyncio.run(sync_service.process_all_queues())

        processed = result.get("processed", 0)
        failed = result.get("failed", 0)
        total = processed + failed

        if total > 0:
            LOGGER.info(
                f"✅ Batch sync complete: {total} operations ({processed} succeeded, {failed} failed)"
            )
        else:
            LOGGER.debug("No pending sync operations to process")

        return result

    except Exception as e:
        LOGGER.error(f"❌ Error in batch sync job: {e}", exc_info=True)
        return {"processed": 0, "failed": 0, "error": str(e)}


def run_nightly_training_status():
    """
    Scheduled job to recalculate training status for all users.

    Runs nightly to ensure training status stays current even on rest days.
    Fitness and fatigue decay naturally via EWMA, so daily recalculation
    keeps the values accurate without requiring a new activity upload.
    """
    try:
        LOGGER.info("🌙 Starting nightly training status recalculation...")

        users_processed = calculate_training_status_all_users()

        LOGGER.info(
            f"✅ Nightly training status complete: {users_processed} users updated"
        )

        return {"users_processed": users_processed}

    except Exception as e:
        LOGGER.error(f"❌ Error in nightly training status job: {e}", exc_info=True)
        return {"users_processed": 0, "error": str(e)}


def _is_target_hour_in_timezone(timezone_str: str, target_hour: int = 6) -> bool:
    """Check if the current UTC time corresponds to the target hour in the given timezone."""
    try:
        tz = pytz.timezone(timezone_str)
        local_now = datetime.now(tz)
        return local_now.hour == target_hour
    except Exception:
        return False


def _generate_daily_overview(user_id: str, timezone_str: str) -> dict | None:
    """Generate a brief overview of today's training plan for a user."""
    try:
        tz = pytz.timezone(timezone_str)
        today = datetime.now(tz).date().isoformat()
    except Exception:
        today = date.today().isoformat()

    workouts = (
        supabase.table("workouts_scheduled")
        .select("*, workouts(name, sport)")
        .eq("user_id", user_id)
        .gte("scheduled_time", f"{today}T00:00:00")
        .lte("scheduled_time", f"{today}T23:59:59")
        .order("scheduled_time")
        .execute()
    )

    status = (
        supabase.table("training_status")
        .select("fitness, fatigue, form")
        .eq("user_id", user_id)
        .order("date", desc=True)
        .limit(1)
        .execute()
    )

    workout_count = len(workouts.data) if workouts.data else 0

    if workout_count == 0 and not status.data:
        return None

    parts = []
    if workout_count > 0:
        workout_names = [
            w["workouts"]["name"]
            for w in workouts.data
            if w.get("workouts") and w["workouts"].get("name")
        ]
        if workout_names:
            parts.append(f"Today: {', '.join(workout_names[:3])}")
        else:
            parts.append(f"{workout_count} workout(s) planned")
    else:
        parts.append("Rest day - no workouts planned")

    if status.data:
        s = status.data[0]
        form_val = s.get("form", 0)
        if form_val is not None:
            if form_val > 10:
                parts.append("Form: Fresh")
            elif form_val > -10:
                parts.append("Form: Balanced")
            else:
                parts.append("Form: Fatigued")

    return {
        "title": "Training Overview",
        "body": " | ".join(parts),
    }


def run_daily_overview_notifications():
    """
    Scheduled job to send daily training overview push notifications.

    Runs every hour. For each run, checks which users currently have 6 AM
    in their local timezone and sends the overview only to those users.
    """
    try:
        LOGGER.debug("Checking for daily overview notifications...")

        users = (
            supabase.table("user_infos")
            .select("user_id, timezone")
            .eq("push_notification_daily_overview", True)
            .execute()
        )

        if not users.data:
            return {"sent": 0}

        sent_count = 0
        for user_row in users.data:
            user_id = user_row["user_id"]
            timezone_str = user_row.get("timezone") or "UTC"

            ### Deactivated for debugging
            # if not _is_target_hour_in_timezone(timezone_str, target_hour=6):
            #   continue

            try:
                overview = _generate_daily_overview(user_id, timezone_str)
                if overview:
                    asyncio.run(
                        send_push_notification(
                            user_id=user_id,
                            title=overview["title"],
                            body=overview["body"],
                            data={"type": "daily_overview"},
                        )
                    )
                    sent_count += 1
            except Exception as e:
                LOGGER.warning(f"Failed to send daily overview to user {user_id}: {e}")

        if sent_count > 0:
            LOGGER.info(f"Daily overview sent to {sent_count} users")

        return {"sent": sent_count}

    except Exception as e:
        LOGGER.error(f"Error in daily overview job: {e}", exc_info=True)
        return {"sent": 0, "error": str(e)}


# Create scheduler instance
scheduler = BackgroundScheduler()

# Get sync interval from environment (default: 10 minutes)
SYNC_INTERVAL_MINUTES = int(os.getenv("WORKOUT_SYNC_INTERVAL_MINUTES", "2"))

# Get nightly training status hour from environment (default: 2 AM)
TRAINING_STATUS_CRON_HOUR = int(os.getenv("TRAINING_STATUS_CRON_HOUR", "2"))


def start_scheduler():
    """Start the background scheduler for workout sync."""
    try:
        # Add the batch sync job
        scheduler.add_job(
            func=run_batch_sync,
            trigger=IntervalTrigger(minutes=SYNC_INTERVAL_MINUTES),
            id="workout_batch_sync",
            name="Workout Batch Sync (All Providers)",
            replace_existing=True,
            max_instances=1,  # Prevent concurrent runs
        )

        # Add the nightly training status job
        scheduler.add_job(
            func=run_nightly_training_status,
            trigger=CronTrigger(hour=TRAINING_STATUS_CRON_HOUR, minute=0),
            id="nightly_training_status",
            name="Nightly Training Status Recalculation",
            replace_existing=True,
            max_instances=1,
        )

        # Add the daily overview notification job (runs hourly, filters by user timezone)
        # just for debugging every 5 minutes
        scheduler.add_job(
            func=run_daily_overview_notifications,
            trigger=IntervalTrigger(minutes=5),
            id="daily_overview_notifications",
            name="Daily Training Overview Notifications",
            replace_existing=True,
            max_instances=1,
        )

        # Start the scheduler
        scheduler.start()

        LOGGER.info(
            f"✅ Workout sync scheduler started (interval: {SYNC_INTERVAL_MINUTES} minutes)"
        )
        LOGGER.info(
            f"✅ Nightly training status job scheduled (daily at {TRAINING_STATUS_CRON_HOUR}:00)"
        )
        LOGGER.info("✅ Daily overview notifications job scheduled (hourly)")

    except Exception as e:
        LOGGER.error(f"❌ Failed to start workout sync scheduler: {e}")


def stop_scheduler():
    """Stop the background scheduler."""
    try:
        scheduler.shutdown(wait=True)
        LOGGER.info("🛑 Workout sync scheduler stopped")
    except Exception as e:
        LOGGER.error(f"❌ Error stopping scheduler: {e}")
