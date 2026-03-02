# now in tools

from datetime import datetime, timedelta

import pandas as pd
from agent.core.singletons import get_supabase_client_sync


# Get Supabase client (singleton)
def get_supabase():
    """Get Supabase client singleton for context tools."""
    return get_supabase_client_sync()


def get_compact_weekly_context(user_id: str) -> str:
    """
    Generate a compact weekly training context for embedding in system prompts.

    Returns a concise text summary including:
    - Last week's completed sessions summary
    - Current week's scheduled workouts
    - Key training metrics and insights

    Args:
        user_id: User identifier

    Returns:
        str: Formatted text summary for system prompt inclusion
    """
    try:
        supabase = get_supabase()
        today = datetime.now().date()
        last_week_start = today - timedelta(days=7)
        current_week_start = today - timedelta(days=today.weekday())  # Monday
        next_week_end = current_week_start + timedelta(days=13)  # End of next week

        # Get last week's completed sessions (using duplicate-filtered view)
        last_week_sessions = (
            supabase.table("sessions_no_duplicates")
            .select(
                "start_time, sport, total_timer_time, total_distance, avg_heart_rate"
            )
            .eq("user_id", user_id)
            .gte("start_time", last_week_start.isoformat())
            .lt("start_time", today.isoformat())
            .order("start_time")
            .execute()
            .data
        )

        # Get current and next week's scheduled workouts
        scheduled_workouts = (
            supabase.table("workouts_scheduled")
            .select("scheduled_time, workout_id(sport, name, workout_minutes)")
            .eq("user_id", user_id)
            .gte("scheduled_time", current_week_start.isoformat())
            .lte("scheduled_time", next_week_end.isoformat())
            .order("scheduled_time")
            .execute()
            .data
        )

        # Process last week's sessions
        last_week_summary = []
        if last_week_sessions:
            total_hours = (
                sum(
                    session.get("total_timer_time", 0) for session in last_week_sessions
                )
                / 3600
            )
            sports_count = {}
            for session in last_week_sessions:
                sport = session.get("sport", "Unknown")
                sports_count[sport] = sports_count.get(sport, 0) + 1

            last_week_summary = [
                f"LAST WEEK COMPLETED ({last_week_start} to {today - timedelta(days=1)}):",
                f"• {len(last_week_sessions)} sessions, {total_hours:.1f} hours total",
                f"• Sports: {', '.join(f'{sport} ({count})' for sport, count in sports_count.items())}",
            ]
        else:
            last_week_summary = ["LAST WEEK: No completed sessions"]

        # Process scheduled workouts by day
        weekly_schedule = {}
        current_week_total = 0
        next_week_total = 0

        for workout in scheduled_workouts:
            workout_date = datetime.fromisoformat(
                workout["scheduled_time"].replace("Z", "+00:00")
            ).date()
            day_name = workout_date.strftime("%A")
            date_str = workout_date.strftime("%m-%d")

            workout_data = workout.get("workout_id", {})
            sport = workout_data.get("sport", "Unknown")
            duration = workout_data.get("workout_minutes", 0)

            # Determine if it's current week or next week
            if workout_date < current_week_start + timedelta(days=7):
                week_label = "current"
                current_week_total += duration
            else:
                week_label = "next"
                next_week_total += duration

            day_key = f"{week_label}_{day_name}_{date_str}"
            if day_key not in weekly_schedule:
                weekly_schedule[day_key] = []

            weekly_schedule[day_key].append(f"{sport} ({duration}min)")

        # Build current week schedule
        current_week_lines = [
            f"CURRENT WEEK SCHEDULED ({current_week_total}min total):"
        ]
        for i in range(7):
            day_date = current_week_start + timedelta(days=i)
            day_name = day_date.strftime("%A")
            date_str = day_date.strftime("%m-%d")
            day_key = f"current_{day_name}_{date_str}"

            if day_key in weekly_schedule:
                sessions = ", ".join(weekly_schedule[day_key])
                current_week_lines.append(f"• {day_name} {date_str}: {sessions}")
            else:
                current_week_lines.append(f"• {day_name} {date_str}: Rest day")

        # Build next week schedule (compact)
        next_week_sessions = []
        for i in range(7, 14):
            day_date = current_week_start + timedelta(days=i)
            day_name = day_date.strftime("%A")
            date_str = day_date.strftime("%m-%d")
            day_key = f"next_{day_name}_{date_str}"

            if day_key in weekly_schedule:
                sessions = ", ".join(weekly_schedule[day_key])
                next_week_sessions.append(f"{day_name}: {sessions}")

        next_week_lines = []
        if next_week_sessions:
            next_week_lines = [
                f"NEXT WEEK SCHEDULED ({next_week_total}min total):",
                f"• {'; '.join(next_week_sessions)}",
            ]
        else:
            next_week_lines = ["NEXT WEEK: No scheduled workouts"]

        # Combine all sections
        context_lines = (
            last_week_summary + [""] + current_week_lines + [""] + next_week_lines
        )

        return "\n".join(context_lines)

    except Exception as e:
        return f"TRAINING CONTEXT: Error loading data - {str(e)}"


def comprehensive_athlete_overview(
    user_id: str, lookback_days: int = 7, lookahead_days: int = 14
) -> dict:
    """
    Enhanced comprehensive overview optimized for LLM agents to understand athlete's training status.

    Returns structured data about:
    - Recent training performance vs planned workouts
    - Current fitness/fatigue status with clear interpretations
    - Upcoming planned training with recommendations
    - Historical weekly training summaries for long-term perspective

    Args:
        user_id: Athlete's user ID
        lookback_days: Days to look back for completed sessions (default: 7)
        lookahead_days: Days to look ahead for planned workouts (default: 14)

    Returns:
        dict: Structured overview optimized for LLM consumption
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

    # Date ranges
    today = datetime.now().date()
    lookback_start = today - timedelta(days=lookback_days)
    lookahead_end = today + timedelta(days=lookahead_days)

    # Extended lookback for historical analysis (4 weeks)
    historical_start = today - timedelta(days=28)

    result = {
        "report_date": today.isoformat(),
        "period_analyzed": {
            "completed_sessions_from": lookback_start.isoformat(),
            "scheduled_workouts_until": lookahead_end.isoformat(),
            "historical_analysis_from": historical_start.isoformat(),
        },
        "training_summary": {},
        "fitness_status": {},
        "scheduled_workouts": {},
        "historical_weekly_summary": {},
    }

    try:
        supabase = get_supabase()

        # === 1. COMPLETED SESSIONS ANALYSIS (Recent + Historical) ===
        # Use duplicate-filtered view with pre-joined session_custom_data
        all_sessions = (
            supabase.table("sessions_with_custom_data_no_duplicates")
            .select(
                "start_time, sport, sub_sport, total_timer_time, total_distance, "
                "avg_heart_rate, max_heart_rate, total_calories, "
                "avg_speed, max_speed, avg_cadence, total_elevation_gain, "
                "heart_rate_load"
            )
            .eq("user_id", user_id)
            .gte("start_time", historical_start.isoformat())
            .lt("start_time", today.isoformat())
            .order("start_time")
            .execute()
            .data
        )

        if all_sessions:
            # Ensure heart_rate_load has a default value if null
            for session in all_sessions:
                if session.get("heart_rate_load") is None:
                    session["heart_rate_load"] = 0

            all_sessions_df = pd.DataFrame(all_sessions)
            # Robust datetime parsing
            all_sessions_df["start_time"] = parse_datetime_robust(
                all_sessions_df["start_time"]
            )
            all_sessions_df["date"] = all_sessions_df["start_time"].dt.date
            all_sessions_df["duration_hours"] = (
                all_sessions_df["total_timer_time"] / 3600
            )
            all_sessions_df["distance_km"] = all_sessions_df["total_distance"] / 1000

            # Recent sessions (last week)
            recent_sessions = all_sessions_df[all_sessions_df["date"] >= lookback_start]

            if len(recent_sessions) > 0:
                # Training summary for recent period
                total_sessions = len(recent_sessions)
                total_hours = recent_sessions["duration_hours"].sum()
                total_distance = recent_sessions["distance_km"].sum()
                total_hr_load = recent_sessions["heart_rate_load"].sum()
                avg_hr = recent_sessions["avg_heart_rate"].mean()
                sports_breakdown = recent_sessions["sport"].value_counts().to_dict()

                # Calculate training intensity distribution
                hr_zones = []
                for _, session in recent_sessions.iterrows():
                    if (
                        pd.notna(session["avg_heart_rate"])
                        and session["avg_heart_rate"] > 0
                    ):
                        if session["avg_heart_rate"] < 140:
                            hr_zones.append("Easy")
                        elif session["avg_heart_rate"] < 160:
                            hr_zones.append("Moderate")
                        elif session["avg_heart_rate"] < 175:
                            hr_zones.append("Hard")
                        else:
                            hr_zones.append("Very Hard")

                intensity_distribution = (
                    pd.Series(hr_zones).value_counts().to_dict() if hr_zones else {}
                )

                result["training_summary"] = {
                    "total_sessions": total_sessions,
                    "total_training_hours": round(total_hours, 1),
                    "total_distance_km": round(total_distance, 1),
                    "total_heart_rate_load": int(total_hr_load),
                    "average_heart_rate": int(avg_hr) if pd.notna(avg_hr) else None,
                    "sports_breakdown": sports_breakdown,
                    "intensity_distribution": intensity_distribution,
                    "training_frequency": f"{total_sessions} sessions in {lookback_days} days",
                    "weekly_volume_hours": round((total_hours / lookback_days) * 7, 1),
                }

                # Enhanced detailed session list for LLM analysis
                session_details = []
                for _, session in recent_sessions.iterrows():
                    # Calculate pace for running/cycling
                    pace_data = {}
                    if pd.notna(session["distance_km"]) and session["distance_km"] > 0:
                        pace_min_per_km = (session["total_timer_time"] / 60) / session[
                            "distance_km"
                        ]
                        if (
                            session["sport"] == "Run" and pace_min_per_km < 15
                        ):  # Reasonable running pace
                            pace_data["pace_min_per_km"] = round(pace_min_per_km, 2)
                        elif session["sport"] == "Ride":
                            avg_speed_kmh = (
                                session["distance_km"] / session["duration_hours"]
                            )
                            pace_data["avg_speed_kmh"] = round(avg_speed_kmh, 1)

                    session_detail = {
                        "date": session["date"].isoformat(),
                        "sport": session["sport"],
                        "sub_sport": session["sub_sport"]
                        if pd.notna(session["sub_sport"])
                        else None,
                        "duration_minutes": round(session["duration_hours"] * 60, 0),
                        "distance_km": round(session["distance_km"], 1)
                        if pd.notna(session["distance_km"])
                        else None,
                        "avg_heart_rate": int(session["avg_heart_rate"])
                        if pd.notna(session["avg_heart_rate"])
                        else None,
                        "max_heart_rate": int(session["max_heart_rate"])
                        if pd.notna(session["max_heart_rate"])
                        else None,
                        "heart_rate_load": int(session["heart_rate_load"]),
                        "calories": int(session["total_calories"])
                        if pd.notna(session["total_calories"])
                        else None,
                        "elevation_gain_m": int(session["total_elevation_gain"])
                        if pd.notna(session["total_elevation_gain"])
                        else None,
                        "avg_cadence": int(session["avg_cadence"])
                        if pd.notna(session["avg_cadence"])
                        else None,
                        "max_speed_kmh": round((session["max_speed"] * 3.6), 1)
                        if pd.notna(session["max_speed"])
                        else None,
                    }
                    session_detail.update(pace_data)
                    session_details.append(session_detail)

                result["training_summary"]["recent_sessions"] = session_details
            else:
                result["training_summary"] = {
                    "message": f"No completed sessions found in last {lookback_days} days",
                    "total_sessions": 0,
                    "total_training_hours": 0,
                }

            # === HISTORICAL WEEKLY SUMMARY ===
            historical_summary = {}

            # Calculate weekly summaries for the last 4 weeks
            for week_offset in range(4):
                week_start = today - timedelta(days=(week_offset + 1) * 7)
                week_end = today - timedelta(days=week_offset * 7)
                week_label = f"week_{week_offset + 1}_ago"

                week_sessions = all_sessions_df[
                    (all_sessions_df["date"] >= week_start)
                    & (all_sessions_df["date"] < week_end)
                ]

                if len(week_sessions) > 0:
                    week_hours = week_sessions["duration_hours"].sum()
                    week_distance = week_sessions["distance_km"].sum()
                    week_hr_load = week_sessions["heart_rate_load"].sum()
                    week_sessions_count = len(week_sessions)
                    week_sports = week_sessions["sport"].value_counts().to_dict()

                    # Calculate average heart rate for the week
                    week_avg_hr = week_sessions["avg_heart_rate"].mean()

                    historical_summary[week_label] = {
                        "week_period": f"{week_start.isoformat()} to {(week_end - timedelta(days=1)).isoformat()}",
                        "total_sessions": week_sessions_count,
                        "total_hours": round(week_hours, 1),
                        "total_distance_km": round(week_distance, 1),
                        "total_hr_load": int(week_hr_load),
                        "avg_heart_rate": int(week_avg_hr)
                        if pd.notna(week_avg_hr)
                        else None,
                        "sports_breakdown": week_sports,
                    }
                else:
                    historical_summary[week_label] = {
                        "week_period": f"{week_start.isoformat()} to {(week_end - timedelta(days=1)).isoformat()}",
                        "total_sessions": 0,
                        "total_hours": 0,
                        "message": "No training sessions",
                    }

            result["historical_weekly_summary"] = historical_summary

        else:
            result["training_summary"] = {
                "message": "No completed sessions found in analysis period",
                "total_sessions": 0,
                "total_training_hours": 0,
            }
            result["historical_weekly_summary"] = {
                "message": "No historical data available"
            }

        # === 2. FITNESS STATUS (from database training_status table) ===
        try:
            # Get the latest training status from database
            training_status_response = (
                supabase.table("training_status")
                .select(
                    "date, fitness, fatigue, form, training_streak, rest_days_streak, "
                    "training_days_7d, training_days_21d, training_monotony, training_strain, "
                    "fitness_trend_7d, fatigue_trend_7d, calculated_at"
                )
                .eq("user_id", user_id)
                .order("date", desc=True)
                .limit(1)
                .execute()
            )

            if training_status_response.data:
                ts_data = training_status_response.data[0]
                fitness = float(ts_data["fitness"])
                fatigue = float(ts_data["fatigue"])
                form = float(ts_data["form"])

                result["fitness_status"] = {
                    "chronic_training_load_fitness": round(fitness, 1),
                    "acute_training_load_fatigue": round(fatigue, 1),
                    "training_stress_balance_form": round(form, 1),
                    "training_streak": int(ts_data["training_streak"]),
                    "rest_days_streak": int(ts_data["rest_days_streak"]),
                    "training_days_7d": int(ts_data["training_days_7d"]),
                    "training_days_21d": int(ts_data["training_days_21d"]),
                    "training_monotony": round(float(ts_data["training_monotony"]), 2),
                    "training_strain": round(float(ts_data["training_strain"]), 1),
                    "fitness_trend_7d": round(float(ts_data["fitness_trend_7d"]), 1),
                    "fatigue_trend_7d": round(float(ts_data["fatigue_trend_7d"]), 1),
                    "status_date": ts_data["date"],
                    "last_updated": ts_data["calculated_at"],
                }
            else:
                result["fitness_status"] = {
                    "message": "Fitness metrics not available - need more training data with heart rate",
                    "recommendation": "Ensure heart rate data is captured in training sessions",
                }
        except Exception as fitness_error:
            result["fitness_status"] = {
                "message": f"Error fetching fitness status: {str(fitness_error)}",
                "recommendation": "Check training status calculation and database connectivity",
            }

        # === 3. PLANNED WORKOUTS ===
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

    except Exception as e:
        result["error"] = f"Error generating overview: {str(e)}"

    return result
