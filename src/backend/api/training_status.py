"""
Training Status Calculator
Fills the training_status table with calculated metrics for users.
"""

from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from api.database import supabase
from api.log import LOGGER


class TrainingStatusCalculator:
    """Calculate and store daily training status metrics for users."""

    def __init__(self):
        self.k_fitness = 42  # CTL time constant (days)
        self.k_fatigue = 7  # ATL time constant (days)
        self.decay_fitness = np.exp(-1 / self.k_fitness)
        self.decay_fatigue = np.exp(-1 / self.k_fatigue)

    def calculate_training_status_for_user(
        self, user_id: str, start_date: date, end_date: Optional[date] = None
    ) -> int:
        """
        Calculate and store training status for a user over a date range.

        Args:
            user_id: UUID of the user
            start_date: Start date for calculation
            end_date: End date for calculation (defaults to today)

        Returns:
            Number of records processed
        """
        if end_date is None:
            end_date = date.today()

        LOGGER.info(
            f"🔄 Calculating training status for user {user_id} from {start_date} to {end_date}"
        )

        try:
            # Get all sessions for the user in the date range (with some buffer for EWMA calculation)
            buffer_start = start_date - timedelta(days=max(self.k_fitness, 60))
            sessions_data = self._get_sessions_data(user_id, buffer_start, end_date)

            if not sessions_data:
                LOGGER.warning(f"⚠️ No sessions found for user {user_id}")
                return 0

            # Convert to DataFrame for easier processing
            df = pd.DataFrame(sessions_data)
            df["start_time"] = pd.to_datetime(df["start_time"], format="ISO8601")
            df["date"] = df["start_time"].dt.date

            # Group by date and aggregate daily metrics
            daily_metrics = self._calculate_daily_aggregates(df)

            # Calculate EWMA metrics and moving averages
            records_processed = self._calculate_and_store_metrics(
                user_id, daily_metrics, start_date, end_date
            )

            LOGGER.info(
                f"✅ Processed {records_processed} training status records for user {user_id}"
            )
            return records_processed

        except Exception as e:
            LOGGER.error(
                f"❌ Error calculating training status for user {user_id}: {e}"
            )
            raise

    def _get_sessions_data(
        self, user_id: str, start_date: date, end_date: date
    ) -> List[Dict]:
        """
        Fetch sessions data from database using duplicate-filtered view.

        Uses sessions_with_custom_data_no_duplicates view to automatically
        exclude duplicate activities and include heart_rate_load from session_custom_data.
        """
        try:
            response = (
                supabase.table("sessions_with_custom_data_no_duplicates")
                .select(
                    "id, start_time, total_timer_time, total_distance, "
                    "total_elevation_gain, heart_rate_load"
                )
                .eq("user_id", user_id)
                .gte("start_time", start_date.isoformat())
                .lte("start_time", (end_date + timedelta(days=1)).isoformat())
                .order("start_time")
                .execute()
            )

            sessions = response.data if response.data else []

            # Ensure heart_rate_load has a default value if null
            for session in sessions:
                if session.get("heart_rate_load") is None:
                    session["heart_rate_load"] = 0

            return sessions

        except Exception as e:
            LOGGER.error(f"❌ Error fetching sessions data: {e}")
            raise

    def _calculate_daily_aggregates(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate daily aggregated metrics from sessions."""
        # Group by date and calculate daily totals
        daily_agg = (
            df.groupby("date")
            .agg(
                {
                    "heart_rate_load": "sum",
                    "total_timer_time": "sum",
                    "total_distance": "sum",
                    "total_elevation_gain": "sum",
                    "id": "count",  # session count
                }
            )
            .reset_index()
        )

        # Rename columns
        daily_agg.columns = [
            "date",
            "daily_hr_load",
            "daily_training_time_seconds",
            "daily_distance",
            "daily_elevation",
            "daily_sessions_count",
        ]

        # Convert training time to minutes
        daily_agg["daily_training_time"] = (
            daily_agg["daily_training_time_seconds"] / 60.0
        )

        # Fill NaN values with 0
        daily_agg = daily_agg.fillna(0)

        return daily_agg

    def _calculate_and_store_metrics(
        self,
        user_id: str,
        daily_metrics: pd.DataFrame,
        start_date: date,
        end_date: date,
    ) -> int:
        """Calculate EWMA and other metrics, then store in database."""

        # Create complete date range
        date_range = pd.date_range(
            start=daily_metrics["date"].min(), end=end_date, freq="D"
        )
        full_df = pd.DataFrame({"date": date_range.date})

        # Merge with daily metrics
        full_df = full_df.merge(daily_metrics, on="date", how="left").fillna(0)
        full_df = full_df.sort_values("date")

        # Calculate EWMA values
        self._calculate_ewma_metrics(full_df)

        # Calculate moving averages and other metrics
        self._calculate_moving_averages(full_df)

        # Store records for the requested date range
        records_processed = 0

        for _, row in full_df.iterrows():
            row_date = row["date"]

            # Only store records within the requested range
            if start_date <= row_date <= end_date:
                try:
                    self._store_training_status_record(user_id, row)
                    records_processed += 1
                except Exception as e:
                    LOGGER.error(f"❌ Error storing record for {row_date}: {e}")

        return records_processed

    def _calculate_ewma_metrics(self, df: pd.DataFrame):
        """Calculate fitness, fatigue, and form using EWMA."""
        fitness_values = []
        fatigue_values = []
        form_values = []

        # Initialize
        prev_fitness = 0
        prev_fatigue = 0

        for _, row in df.iterrows():
            hr_load = row["daily_hr_load"]

            # EWMA calculation
            fitness = (prev_fitness * self.decay_fitness) + (
                hr_load * (1 - self.decay_fitness)
            )
            fatigue = (prev_fatigue * self.decay_fatigue) + (
                hr_load * (1 - self.decay_fatigue)
            )
            form = fitness - fatigue

            fitness_values.append(fitness)
            fatigue_values.append(fatigue)
            form_values.append(form)

            # Update for next iteration
            prev_fitness = fitness
            prev_fatigue = fatigue

        df["fitness"] = fitness_values
        df["fatigue"] = fatigue_values
        df["form"] = form_values

    def _calculate_moving_averages(self, df: pd.DataFrame):
        """Calculate moving averages and other derived metrics."""
        # 7-day moving averages
        df["avg_training_time_7d"] = (
            df["daily_training_time"].rolling(window=7, min_periods=1).mean()
        )

        # 21-day moving averages
        df["avg_training_time_21d"] = (
            df["daily_training_time"].rolling(window=21, min_periods=1).mean()
        )

        # Training days count
        df["training_days_7d"] = (
            (df["daily_hr_load"] > 0).rolling(window=7, min_periods=1).sum()
        )
        df["training_days_21d"] = (
            (df["daily_hr_load"] > 0).rolling(window=21, min_periods=1).sum()
        )

        # Training monotony (avg / std dev for last 7 days)
        df["training_monotony"] = (
            df["daily_hr_load"]
            .rolling(window=7, min_periods=1)
            .apply(lambda x: x.mean() / x.std() if x.std() > 0 else 0)
        )

        # Training strain (avg * monotony)
        avg_7d = df["daily_hr_load"].rolling(window=7, min_periods=1).mean()
        df["training_strain"] = avg_7d * df["training_monotony"]

        # Fitness and fatigue trends (7-day change rate)
        df["fitness_trend_7d"] = df["fitness"].diff(7)
        df["fatigue_trend_7d"] = df["fatigue"].diff(7)

        # Calculate streaks
        self._calculate_streaks(df)

        # Fill NaN values
        df.fillna(0, inplace=True)

    def _calculate_streaks(self, df: pd.DataFrame):
        """Calculate training and rest streaks."""
        training_streaks = []
        rest_streaks = []

        current_training_streak = 0
        current_rest_streak = 0

        for _, row in df.iterrows():
            had_training = row["daily_hr_load"] > 0

            if had_training:
                current_training_streak += 1
                current_rest_streak = 0
            else:
                current_rest_streak += 1
                current_training_streak = 0

            training_streaks.append(current_training_streak)
            rest_streaks.append(current_rest_streak)

        df["training_streak"] = training_streaks
        df["rest_days_streak"] = rest_streaks

    def _store_training_status_record(self, user_id: str, row: pd.Series):
        """Store a single training status record in the database."""
        record_data = {
            "user_id": user_id,
            "date": row["date"].isoformat(),
            "fitness": float(row["fitness"]),
            "fatigue": float(row["fatigue"]),
            "form": float(row["form"]),
            "daily_hr_load": float(row["daily_hr_load"]),
            "daily_training_time": float(row["daily_training_time"]),
            "avg_training_time_7d": float(row["avg_training_time_7d"]),
            "avg_training_time_21d": float(row["avg_training_time_21d"]),
            "training_streak": int(row["training_streak"]),
            "rest_days_streak": int(row["rest_days_streak"]),
            "training_days_7d": int(row["training_days_7d"]),
            "training_days_21d": int(row["training_days_21d"]),
            "training_monotony": float(row["training_monotony"]),
            "training_strain": float(row["training_strain"]),
            "fitness_trend_7d": float(row["fitness_trend_7d"]),
            "fatigue_trend_7d": float(row["fatigue_trend_7d"]),
            "needs_update": False,  # Mark as no longer needing update after calculation
        }

        # Upsert the record
        supabase.table("training_status").upsert(
            record_data, on_conflict="user_id,date"
        ).execute()


# Convenience functions
def _calculate_training_status_for_user(
    user_id: str, start_date: date, end_date: Optional[date] = None
) -> int:
    """
    INTERNAL: Calculate and store training status for a user.

    ⚠️ WARNING: This function should not be called directly as it may produce
    incorrect states if not all prerequisite data is calculated first.

    Use the safe public functions instead:
    - date_needs_update() - Mark dates needing recalculation
    - calculate_training_status() - Process all pending updates

    Args:
        user_id: UUID of the user
        start_date: Start date for calculation
        end_date: End date for calculation (defaults to today)

    Returns:
        Number of records processed
    """
    calculator = TrainingStatusCalculator()
    return calculator.calculate_training_status_for_user(user_id, start_date, end_date)


def date_needs_update(user_id: str, session_date: date) -> bool:
    """
    Mark a specific date as needing training status update.

    This function is called when a new session is imported. It either creates
    a new training_status record for the session date with needs_update=TRUE,
    or sets needs_update=TRUE on an existing record for that date.

    Args:
        user_id: UUID of the user
        session_date: Date of the session that was imported

    Returns:
        True if successful, False otherwise
    """
    try:
        LOGGER.info(f"🔄 Marking {session_date} as needing update for user {user_id}")

        # Try to update existing record first
        update_response = (
            supabase.table("training_status")
            .update({"needs_update": True})
            .eq("user_id", user_id)
            .eq("date", session_date.isoformat())
            .execute()
        )

        # If no existing record was updated, create a new one
        if not update_response.data:
            insert_data = {
                "user_id": user_id,
                "date": session_date.isoformat(),
                "needs_update": True,
                # Set default values for required fields
                "fitness": 0.0,
                "fatigue": 0.0,
                "form": 0.0,
            }

            supabase.table("training_status").insert(insert_data).execute()
            LOGGER.info(
                f"✅ Created new training_status record for {session_date} with needs_update=TRUE"
            )
        else:
            LOGGER.info(
                f"✅ Updated existing training_status record for {session_date} with needs_update=TRUE"
            )

        return True

    except Exception as e:
        LOGGER.error(f"❌ Error marking {session_date} as needing update: {e}")
        return False


def calculate_training_status_for_user_now(user_id: str, days_back: int = 60) -> int:
    """
    Calculate training status for a specific user immediately.

    This is a convenience function for manual/on-demand calculation.
    Calculates from (today - days_back) to (today + 5 days).

    Args:
        user_id: UUID of the user
        days_back: Number of days to look back (default: 60)

    Returns:
        Number of records processed
    """
    start_date = date.today() - timedelta(days=days_back)
    end_date = date.today() + timedelta(days=5)

    LOGGER.info(
        f"🔄 Calculating training status for user {user_id} from {start_date} to {end_date}"
    )

    return _calculate_training_status_for_user(user_id, start_date, end_date)


def calculate_training_status() -> int:
    """
    Calculate training status for all users with needs_update=TRUE.

    This function is designed to be called periodically (e.g., every 5 minutes)
    by a background job. It finds the earliest date that needs updating for each
    user and recalculates training status from that date to today + 5 days.

    Returns:
        Number of users processed
    """
    try:
        LOGGER.info("🔄 Starting scheduled training status calculation")

        # Find all unique users with pending updates, along with their earliest date needing update
        response = (
            supabase.table("training_status")
            .select("user_id, date")
            .eq("needs_update", True)
            .order("user_id, date")
            .execute()
        )

        if not response.data:
            LOGGER.info("ℹ️ No training status records need updating")
            return 0

        # Group by user_id and find earliest date for each user
        users_to_update = {}
        for record in response.data:
            user_id = record["user_id"]
            record_date = datetime.fromisoformat(record["date"]).date()

            if user_id not in users_to_update:
                users_to_update[user_id] = record_date
            else:
                # Keep the earliest date
                if record_date < users_to_update[user_id]:
                    users_to_update[user_id] = record_date

        users_processed = 0

        for user_id, earliest_date in users_to_update.items():
            try:
                LOGGER.info(
                    f"🔄 Processing training status for user {user_id} from {earliest_date}"
                )

                # Calculate training status from earliest needed date to today + 5 days
                end_date = date.today() + timedelta(days=5)
                records_processed = _calculate_training_status_for_user(
                    user_id, earliest_date, end_date
                )

                # Mark all records for this user as no longer needing update
                supabase.table("training_status").update({"needs_update": False}).eq(
                    "user_id", user_id
                ).eq("needs_update", True).execute()

                users_processed += 1

                LOGGER.info(
                    f"✅ Completed training status calculation for user {user_id} "
                    f"({records_processed} records processed)"
                )

            except Exception as e:
                LOGGER.error(f"❌ Error processing user {user_id}: {e}")
                # Continue with other users even if one fails
                continue

        LOGGER.info(
            f"✅ Scheduled training status calculation completed. {users_processed} users processed"
        )
        return users_processed

    except Exception as e:
        LOGGER.error(f"❌ Error in scheduled training status calculation: {e}")
        return 0


def calculate_training_status_all_users() -> int:
    """
    Calculate training status for ALL active users regardless of needs_update flag.

    Designed to run as a nightly job to ensure training status stays current
    even on rest days when no new activities are uploaded. Fitness and fatigue
    naturally decay via EWMA, so daily recalculation keeps values accurate.

    Returns:
        Number of users processed
    """
    try:
        LOGGER.info("🔄 Starting nightly training status calculation for all users")

        # Get all distinct users who have training status records
        response = (
            supabase.table("training_status")
            .select("user_id")
            .execute()
        )

        if not response.data:
            LOGGER.info("ℹ️ No users with training status records found")
            return 0

        # Get unique user IDs
        user_ids = list({record["user_id"] for record in response.data})

        LOGGER.info(f"🔄 Found {len(user_ids)} users to update")

        users_processed = 0
        start_date = date.today() - timedelta(days=7)
        end_date = date.today() + timedelta(days=5)

        for user_id in user_ids:
            try:
                records_processed = _calculate_training_status_for_user(
                    user_id, start_date, end_date
                )
                users_processed += 1

                LOGGER.info(
                    f"✅ Nightly update for user {user_id}: {records_processed} records"
                )

            except Exception as e:
                LOGGER.error(
                    f"❌ Error in nightly update for user {user_id}: {e}"
                )
                continue

        LOGGER.info(
            f"✅ Nightly training status calculation completed. "
            f"{users_processed}/{len(user_ids)} users processed"
        )
        return users_processed

    except Exception as e:
        LOGGER.error(f"❌ Error in nightly training status calculation: {e}")
        return 0
