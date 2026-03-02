#!/usr/bin/env python3
"""
Admin Script: Bulk Training Status Recalculation

This script recalculates training status for all users who have training status records.
Use this after deploying the duplicate activity fix to correct historical data.

Automatically determines each user's earliest session date and recalculates from there.

Usage:
    cd src/backend
    uv run python scripts/recalculate_all_users.py [--dry-run] [--user-id USER_ID]

Options:
    --dry-run           Show what would be recalculated without making changes
    --user-id USER_ID   Recalculate only for specific user (optional)
    --help              Show this help message
"""

import argparse
import sys
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

# Add parent directory to path to allow imports
script_dir = Path(__file__).resolve().parent
backend_dir = script_dir.parent
sys.path.insert(0, str(backend_dir))

from api.database import supabase  # noqa: E402
from api.log import LOGGER  # noqa: E402
from api.training_status import _calculate_training_status_for_user  # noqa: E402


def get_all_users_with_training_data() -> List[str]:
    """
    Get all users who have training status records.

    Returns:
        List of user IDs
    """
    try:
        LOGGER.info("🔍 Fetching all users with training status data...")

        response = supabase.table("training_status").select("user_id").execute()

        # Get unique user IDs
        user_ids = list(set([record["user_id"] for record in response.data]))

        LOGGER.info(f"✅ Found {len(user_ids)} users with training status data")
        return user_ids

    except Exception as e:
        LOGGER.error(f"❌ Error fetching users: {e}")
        raise


def get_user_earliest_session_date(user_id: str) -> Optional[date]:
    """
    Get the earliest session date for a user.

    Args:
        user_id: User UUID

    Returns:
        Date of earliest session, or None if no sessions found
    """
    try:
        response = (
            supabase.table("sessions_no_duplicates")
            .select("start_time")
            .eq("user_id", user_id)
            .order("start_time", desc=False)
            .limit(1)
            .execute()
        )

        if response.data and len(response.data) > 0:
            start_time_str = response.data[0]["start_time"]
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
            return start_time.date()

        return None

    except Exception as e:
        LOGGER.error(f"❌ Error fetching earliest session for user {user_id}: {e}")
        return None


def recalculate_user(user_id: str, dry_run: bool = False) -> int:
    """
    Recalculate training status for a single user from their earliest session.

    Args:
        user_id: User UUID
        dry_run: If True, don't actually recalculate

    Returns:
        Number of records that would be/were processed
    """
    try:
        # Get earliest session date
        earliest_date = get_user_earliest_session_date(user_id)

        if earliest_date is None:
            LOGGER.warning(f"⚠️ No sessions found for user {user_id}, skipping")
            return 0

        today = date.today()
        end_date = today  # Calculate up to today

        if dry_run:
            LOGGER.info(
                f"🔍 [DRY RUN] Would recalculate from {earliest_date} to {end_date} for user {user_id}"
            )
            # In dry run, estimate by counting existing records
            response = (
                supabase.table("training_status")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .execute()
            )
            return response.count or 0
        else:
            LOGGER.info(
                f"🔄 Recalculating from {earliest_date} to {end_date} for user {user_id}..."
            )
            records = _calculate_training_status_for_user(
                user_id=user_id, start_date=earliest_date, end_date=end_date
            )
            LOGGER.info(f"✅ Processed {records} records for user {user_id}")
            return records

    except Exception as e:
        LOGGER.error(f"❌ Error processing user {user_id}: {e}")
        return 0


def main():
    """Main script execution."""
    parser = argparse.ArgumentParser(
        description="Bulk recalculate training status for all users from their earliest session",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be recalculated without making changes",
    )
    parser.add_argument(
        "--user-id",
        type=str,
        help="Recalculate only for specific user UUID (optional)",
    )

    args = parser.parse_args()

    # Print configuration
    LOGGER.info("=" * 80)
    LOGGER.info("🔄 BULK TRAINING STATUS RECALCULATION")
    LOGGER.info("=" * 80)
    LOGGER.info(f"Started at: {datetime.now().isoformat()}")
    LOGGER.info("Recalculation: From each user's earliest session to today")
    LOGGER.info(
        f"Mode: {'DRY RUN (no changes)' if args.dry_run else 'LIVE (will update database)'}"
    )
    if args.user_id:
        LOGGER.info(f"Target: Single user {args.user_id}")
    else:
        LOGGER.info("Target: All users with training status data")
    LOGGER.info("=" * 80)
    LOGGER.info("")

    try:
        # Get users to process
        if args.user_id:
            user_ids = [args.user_id]
            LOGGER.info(f"🎯 Processing single user: {args.user_id}")
        else:
            user_ids = get_all_users_with_training_data()

        if not user_ids:
            LOGGER.warning("⚠️ No users found to process")
            sys.exit(0)

        # Confirm before proceeding (unless dry run)
        if not args.dry_run:
            LOGGER.warning("")
            LOGGER.warning(
                "⚠️  WARNING: This will recalculate training status for all users!"
            )
            LOGGER.warning(
                "⚠️  This may take several minutes and will update the database."
            )
            LOGGER.warning("")
            response = input("Are you sure you want to continue? (yes/no): ")
            if response.lower() != "yes":
                LOGGER.info("❌ Aborted by user")
                sys.exit(0)
            LOGGER.info("")

        # Process each user
        total_records = 0
        successful_users = 0
        failed_users = 0

        for i, user_id in enumerate(user_ids, 1):
            LOGGER.info(f"📊 Processing user {i}/{len(user_ids)}: {user_id}")

            try:
                records = recalculate_user(user_id=user_id, dry_run=args.dry_run)
                total_records += records
                successful_users += 1
            except Exception as e:
                LOGGER.error(f"❌ Failed to process user {user_id}: {e}")
                failed_users += 1
                continue

            # Progress update every 10 users
            if i % 10 == 0:
                LOGGER.info(
                    f"📈 Progress: {i}/{len(user_ids)} users, "
                    f"{total_records} records processed, "
                    f"{successful_users} successful, {failed_users} failed"
                )

        # Final summary
        LOGGER.info("")
        LOGGER.info("=" * 80)
        LOGGER.info("✅ RECALCULATION COMPLETE")
        LOGGER.info("=" * 80)
        LOGGER.info(f"Completed at: {datetime.now().isoformat()}")
        LOGGER.info(f"Total users processed: {successful_users}/{len(user_ids)}")
        LOGGER.info(f"Total records processed: {total_records}")
        LOGGER.info(f"Failed users: {failed_users}")
        if args.dry_run:
            LOGGER.info("Mode: DRY RUN - No changes were made to the database")
        LOGGER.info("=" * 80)

    except KeyboardInterrupt:
        LOGGER.warning("\n⚠️ Interrupted by user (Ctrl+C)")
        sys.exit(1)
    except Exception as e:
        LOGGER.error(f"\n❌ Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
