#!/usr/bin/env python3
"""Backfill analytics data for existing sessions.

Usage (in Docker container):
    python scripts/backfill_analytics.py              # Full run
    python scripts/backfill_analytics.py --dry-run    # Preview only
    python scripts/backfill_analytics.py --batch-size 25 --sleep 2

Usage (locally from repo root):
    python src/backend/scripts/backfill_analytics.py

NOTE: Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Never commit the key.
Safe to run multiple times — only processes sessions with NULL analytics values.
"""

import argparse
import os
import sys

# Support running from both repo root (locally) and inside Docker container (/backend)
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)  # parent of scripts/
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Load .env if it exists (local dev); in Docker env vars are set externally
env_path = os.path.join(backend_dir, ".env")
if os.path.exists(env_path):
    from dotenv import load_dotenv

    load_dotenv(env_path)

from collections import defaultdict  # noqa: E402

from api.analytics.cp_model import fit_cp_model  # noqa: E402
from api.analytics.power_curve import extract_power_curve  # noqa: E402
from api.analytics.vdot import calculate_vdot_for_session  # noqa: E402
from api.analytics.hr_curve import (  # noqa: E402
    filter_hr_data, extract_hr_curve, estimate_session_lthr,
    calculate_efficiency_factor, calculate_hr_zone_time, detect_max_hr,
)

from supabase import create_client  # noqa: E402


def get_supabase():
    url = os.environ["PUBLIC_SUPABASE_URL"]
    key = os.environ["PRIVATE_SUPABASE_KEY"]
    return create_client(url, key)


def backfill_cycling(supabase, dry_run: bool, batch_size: int, sleep_secs: float):
    import time

    print("Fetching cycling sessions with power data but no power_curve...")
    response = (
        supabase.table("sessions")
        .select("id")
        .eq("sport", "cycling")
        .is_("power_curve", "null")
        .execute()
    )
    session_ids = [s["id"] for s in (response.data or [])]
    print(f"Found {len(session_ids)} cycling sessions to process.")

    processed = 0
    errors = 0
    for i, sid in enumerate(session_ids):
        try:
            records = (
                supabase.table("records")
                .select("power")
                .eq("session_id", sid)
                .execute()
            )
            power_data = (
                records.data[0]["power"]
                if records.data and records.data[0].get("power")
                else []
            )
            if not power_data:
                continue

            power_curve = extract_power_curve(power_data)
            update = {
                "power_curve": power_curve,
                "max_watts_5_min": power_curve.get("300", 0),
                "max_watts_20_min": power_curve.get("1200", 0),
                "max_watts_60_min": power_curve.get("3600", 0),
            }
            cp_result = fit_cp_model(power_curve)
            if cp_result:
                update["cp_estimate"] = round(cp_result[0], 1)
                update["w_prime_estimate"] = round(cp_result[1], 0)

            if dry_run:
                print(
                    f"  [DRY RUN] {sid}: {len(power_curve)} points, CP={update.get('cp_estimate', 'N/A')}"
                )
            else:
                supabase.table("sessions").update(update).eq("id", sid).execute()

            processed += 1
        except Exception as e:
            errors += 1
            print(f"  Error: {sid}: {e}")

        if (i + 1) % batch_size == 0:
            print(f"  Processed {i + 1}/{len(session_ids)}...")
            if not dry_run:
                time.sleep(sleep_secs)

    print(f"Cycling: processed {processed}, errors {errors}")


def backfill_running(supabase, dry_run: bool, batch_size: int, sleep_secs: float):
    import time

    print("Fetching running sessions without vdot_estimate...")
    response = (
        supabase.table("sessions")
        .select("id, total_distance, total_timer_time")
        .eq("sport", "running")
        .is_("vdot_estimate", "null")
        .not_.is_("total_distance", "null")
        .not_.is_("total_timer_time", "null")
        .execute()
    )
    sessions = response.data or []
    print(f"Found {len(sessions)} running sessions to process.")

    processed = 0
    errors = 0
    for i, s in enumerate(sessions):
        try:
            distance = float(s["total_distance"])
            timer_time = float(s["total_timer_time"])

            speed_data = None
            distance_data = None
            try:
                records = (
                    supabase.table("records")
                    .select("speed, distance")
                    .eq("session_id", s["id"])
                    .execute()
                )
                if records.data and records.data[0]:
                    speed_data = records.data[0].get("speed")
                    distance_data = records.data[0].get("distance")
            except Exception:
                pass

            vdot = calculate_vdot_for_session(
                distance, timer_time, speed_data, distance_data
            )
            if vdot is None:
                continue

            if dry_run:
                print(f"  [DRY RUN] {s['id']}: VDOT={vdot}")
            else:
                supabase.table("sessions").update({"vdot_estimate": round(vdot, 1)}).eq(
                    "id", s["id"]
                ).execute()

            processed += 1
        except Exception as e:
            errors += 1
            print(f"  Error: {s['id']}: {e}")

        if (i + 1) % batch_size == 0:
            print(f"  Processed {i + 1}/{len(sessions)}...")
            if not dry_run:
                time.sleep(sleep_secs)

    print(f"Running: processed {processed}, errors {errors}")


def backfill_hr(supabase, dry_run: bool, batch_size: int, sleep_secs: float):
    import time

    print("\n=== HR Analytics Backfill ===")
    user_sport_data: dict[tuple[str, str], dict] = defaultdict(lambda: {"max_hr": 0, "best_lthr": 0.0})

    for sport in ("cycling", "running"):
        response = (
            supabase.table("sessions")
            .select("id, user_id, sport, avg_heart_rate, avg_power, total_distance, total_timer_time")
            .eq("sport", sport)
            .is_("hr_curve", "null")
            .execute()
        )
        sessions = response.data or []
        print(f"Found {len(sessions)} {sport} sessions to process for HR.")

        processed = 0
        errors = 0
        skipped_no_hr = 0
        skipped_filtered = 0
        for i, s in enumerate(sessions):
            try:
                records = (
                    supabase.table("records")
                    .select("heart_rate")
                    .eq("session_id", s["id"])
                    .execute()
                )
                raw_hr = records.data[0]["heart_rate"] if records.data and records.data[0].get("heart_rate") else []
                if not raw_hr:
                    skipped_no_hr += 1
                    continue

                update = {}
                filtered = filter_hr_data(raw_hr)
                if filtered:
                    hr_curve = extract_hr_curve(filtered)
                    if hr_curve:
                        update["hr_curve"] = hr_curve
                    avg_hr = s.get("avg_heart_rate")
                    if avg_hr:
                        ef = calculate_efficiency_factor(
                            sport=sport,
                            avg_heart_rate=avg_hr,
                            avg_power=s.get("avg_power") if sport == "cycling" else None,
                            total_distance=float(s["total_distance"]) if sport == "running" and s.get("total_distance") else None,
                            total_timer_time=float(s["total_timer_time"]) if sport == "running" and s.get("total_timer_time") else None,
                        )
                        if ef:
                            update["efficiency_factor"] = ef
                else:
                    skipped_filtered += 1

                max_hr = detect_max_hr(raw_hr)
                user_key = (s['user_id'], sport)
                if max_hr and max_hr > user_sport_data[user_key]["max_hr"]:
                    user_sport_data[user_key]["max_hr"] = max_hr

                if filtered:
                    hr_curve_data = update.get("hr_curve") or extract_hr_curve(filtered)
                    session_lthr = estimate_session_lthr(hr_curve_data)
                    if session_lthr and session_lthr > user_sport_data[user_key]["best_lthr"]:
                        user_sport_data[user_key]["best_lthr"] = session_lthr

                if update:
                    if dry_run:
                        print(f"  [DRY RUN] {s['id']}: {list(update.keys())}")
                    else:
                        supabase.table("sessions").update(update).eq("id", s["id"]).execute()

                processed += 1
            except Exception as e:
                errors += 1
                print(f"  Error {s['id']}: {e}")

            if (i + 1) % batch_size == 0:
                print(f"  Processed {i + 1}/{len(sessions)} {sport}...")
                if not dry_run:
                    time.sleep(sleep_secs)

        print(f"HR ({sport}): processed {processed}, skipped_no_hr {skipped_no_hr}, skipped_filtered {skipped_filtered}, errors {errors}")

    # Batch upsert user_sport_settings
    print(f"\nUpdating user_sport_settings for {len(user_sport_data)} user+sport combos...")
    for (user_id, sport), data in user_sport_data.items():
        if data["max_hr"] == 0:
            continue
        entry = {
            "user_id": user_id,
            "sport": sport,
            "max_heart_rate": data["max_hr"],
            "max_heart_rate_source": "auto",
        }
        if data["best_lthr"] > 0:
            entry["threshold_heart_rate"] = round(data["best_lthr"], 1)
        if dry_run:
            print(f"  [DRY RUN] {user_id}/{sport}: max_hr={data['max_hr']}, lthr={data['best_lthr']:.1f}")
        else:
            try:
                supabase.table("user_sport_settings").upsert(entry, on_conflict="user_id,sport").execute()
            except Exception as e:
                print(f"  Error upserting {user_id}/{sport}: {e}")

    # Zone time pass (requires LTHR to be set first)
    if not dry_run:
        print("\n=== HR Zone Time Pass ===")
        for sport in ("cycling", "running"):
            response = (
                supabase.table("sessions")
                .select("id, user_id, sport")
                .eq("sport", sport)
                .not_.is_("hr_curve", "null")
                .is_("hr_zone_time", "null")
                .execute()
            )
            sessions = response.data or []
            print(f"Found {len(sessions)} {sport} sessions for zone time.")
            lthr_cache: dict[tuple[str, str], float | None] = {}
            processed = 0
            for s in sessions:
                cache_key = (s['user_id'], sport)
                if cache_key not in lthr_cache:
                    try:
                        lthr_resp = (
                            supabase.table("user_sport_settings")
                            .select("threshold_heart_rate")
                            .eq("user_id", s["user_id"])
                            .eq("sport", sport)
                            .single()
                            .execute()
                        )
                        lthr_cache[cache_key] = lthr_resp.data.get("threshold_heart_rate") if lthr_resp.data else None
                    except Exception:
                        lthr_cache[cache_key] = None
                lthr = lthr_cache[cache_key]
                if not lthr:
                    continue
                try:
                    records = (
                        supabase.table("records")
                        .select("heart_rate")
                        .eq("session_id", s["id"])
                        .execute()
                    )
                    raw_hr = records.data[0]["heart_rate"] if records.data and records.data[0].get("heart_rate") else []
                    if not raw_hr:
                        continue
                    filtered = filter_hr_data(raw_hr)
                    if not filtered:
                        continue
                    zone_time = calculate_hr_zone_time(filtered, lthr)
                    supabase.table("sessions").update({"hr_zone_time": zone_time}).eq("id", s["id"]).execute()
                    processed += 1
                except Exception as e:
                    print(f"  Zone time error {s['id']}: {e}")
            print(f"Zone time ({sport}): processed {processed}")


def main():
    parser = argparse.ArgumentParser(description="Backfill analytics data")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument(
        "--sleep", type=float, default=1.0, help="Sleep seconds between batches"
    )
    parser.add_argument("--hr-only", action="store_true", help="Only backfill HR analytics")
    parser.add_argument("--power-only", action="store_true", help="Only backfill power/running analytics")
    args = parser.parse_args()

    supabase = get_supabase()
    if args.dry_run:
        print("=== DRY RUN MODE ===")

    if not args.hr_only:
        backfill_cycling(supabase, args.dry_run, args.batch_size, args.sleep)
        backfill_running(supabase, args.dry_run, args.batch_size, args.sleep)
    if not args.power_only:
        backfill_hr(supabase, args.dry_run, args.batch_size, args.sleep)
    print("Done.")


if __name__ == "__main__":
    main()
