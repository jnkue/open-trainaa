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

# i18n strings for daily overview push notifications
_DAILY_OVERVIEW_I18N = {
    "en": {
        "title": "Today's Plan",
        "no_training": "We haven't planned your training yet — ask your trainer!",
        "rest_day": "Today: Rest Day. Enjoy your recovery!",
        "today": "Today",
        "workouts_planned": "workout(s) planned",
    },
    "de": {
        "title": "Dein Tagesplan",
        "no_training": "Dein Training ist noch nicht geplant — frag deinen Trainer!",
        "rest_day": "Heute: Ruhetag. Genieße die Erholung!",
        "today": "Heute",
        "workouts_planned": "Training(s) geplant",
    },
    "es": {
        "title": "Tu plan de hoy",
        "no_training": "Tu entrenamiento aún no está planificado — pregunta a tu entrenador!",
        "rest_day": "Hoy: Día de descanso. Disfruta tu recuperación!",
        "today": "Hoy",
        "workouts_planned": "entrenamiento(s) planificado(s)",
    },
    "fr": {
        "title": "Ton plan du jour",
        "no_training": "Ton entraînement n'est pas encore prévu — demande à ton coach !",
        "rest_day": "Aujourd'hui : Jour de repos. Profite de ta récupération !",
        "today": "Aujourd'hui",
        "workouts_planned": "entraînement(s) prévu(s)",
    },
}


def _get_i18n(lang: str) -> dict:
    """Get i18n strings for a language, falling back to English."""
    return _DAILY_OVERVIEW_I18N.get(lang, _DAILY_OVERVIEW_I18N["en"])


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


def _generate_daily_overview(
    user_id: str, timezone_str: str, lang: str = "en"
) -> dict | None:
    """Generate a brief overview of today's training plan for a user."""
    i18n = _get_i18n(lang)

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

    workout_count = len(workouts.data) if workouts.data else 0

    if workout_count == 0:
        # Case 1: No training planned
        return {
            "title": i18n["title"],
            "body": i18n["no_training"],
            "data": {"type": "daily_overview", "overview_type": "no_training"},
        }

    # Separate real workouts from rest days
    real_workouts = [
        w for w in workouts.data if w.get("workouts", {}).get("sport") != "rest_day"
    ]
    rest_workouts = [
        w for w in workouts.data if w.get("workouts", {}).get("sport") == "rest_day"
    ]

    if not real_workouts and rest_workouts:
        # Case 2: Rest day
        return {
            "title": i18n["title"],
            "body": i18n["rest_day"],
            "data": {"type": "daily_overview", "overview_type": "rest_day"},
        }

    # Case 3: Training planned
    workout_names = [
        w["workouts"]["name"]
        for w in real_workouts
        if w.get("workouts") and w["workouts"].get("name")
    ]
    first_workout_id = (
        str(real_workouts[0].get("workout_id")) if real_workouts else None
    )

    if workout_names:
        body = f"{i18n['today']}: {', '.join(workout_names[:3])}"
    else:
        body = f"{len(real_workouts)} {i18n['workouts_planned']}"

    data = {
        "type": "daily_overview",
        "overview_type": "training",
    }
    if first_workout_id:
        data["workout_id"] = first_workout_id

    return {
        "title": i18n["title"],
        "body": body,
        "data": data,
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
            .select("user_id, timezone, language")
            .eq("push_notification_daily_overview", True)
            .execute()
        )

        if not users.data:
            return {"sent": 0}

        sent_count = 0
        for user_row in users.data:
            user_id = user_row["user_id"]
            timezone_str = user_row.get("timezone") or "UTC"
            lang = user_row.get("language") or "en"

            if not _is_target_hour_in_timezone(timezone_str, target_hour=6):
                continue

            try:
                overview = _generate_daily_overview(user_id, timezone_str, lang)
                if overview:
                    asyncio.run(
                        send_push_notification(
                            user_id=user_id,
                            title=overview["title"],
                            body=overview["body"],
                            data=overview.get("data", {"type": "daily_overview"}),
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
        scheduler.add_job(
            func=run_daily_overview_notifications,
            trigger=IntervalTrigger(minutes=2),
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
