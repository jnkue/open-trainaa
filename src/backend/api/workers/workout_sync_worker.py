"""
Unified Workout Sync Worker

Background scheduler for batch processing workout sync queue across all providers.
Runs every 10 minutes to sync pending workouts to Wahoo, Garmin, and other providers.
"""

import asyncio
import os

from api.log import LOGGER
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

        # Start the scheduler
        scheduler.start()

        LOGGER.info(
            f"✅ Workout sync scheduler started (interval: {SYNC_INTERVAL_MINUTES} minutes)"
        )
        LOGGER.info(
            f"✅ Nightly training status job scheduled (daily at {TRAINING_STATUS_CRON_HOUR}:00)"
        )

    except Exception as e:
        LOGGER.error(f"❌ Failed to start workout sync scheduler: {e}")


def stop_scheduler():
    """Stop the background scheduler."""
    try:
        scheduler.shutdown(wait=True)
        LOGGER.info("🛑 Workout sync scheduler stopped")
    except Exception as e:
        LOGGER.error(f"❌ Error stopping scheduler: {e}")
