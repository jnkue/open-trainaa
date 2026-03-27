"""Heart rate data filtering, curve extraction, LTHR estimation, EF calculation, and zone time.

All HR data passes through a multi-step filtering pipeline before computation:
1. Physiological bounds (30-220 bpm)
2. Spike detection (rolling median, 30 bpm threshold)
3. Cadence lock detection (stddev < 5 over 60+ min sessions)
4. Minimum valid data threshold (80%)
5. Small gap interpolation (1-3 seconds)
"""

import math
from typing import Optional

import numpy as np

from api.log import LOGGER

HR_CURVE_DURATIONS = [
    1, 5, 10, 30,
    60, 120, 180, 240, 300, 360, 420, 480, 540, 600,
    660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200,
    1800, 2700, 3600, 5400, 7200,
]

HR_ZONE_DEFINITIONS = [
    (1, "Recovery", 0.0, 0.68),
    (2, "Aerobic", 0.68, 0.83),
    (3, "Tempo", 0.83, 0.94),
    (4, "Threshold", 0.94, 1.05),
    (5, "Anaerobic", 1.05, None),
]

MIN_HR = 30
MAX_HR = 220
SPIKE_THRESHOLD_BPM = 30
ROLLING_MEDIAN_WINDOW = 5
MIN_VALID_RATIO = 0.80
MAX_INTERPOLATION_GAP = 3
CADENCE_LOCK_MIN_DURATION = 3600
CADENCE_LOCK_MAX_STDDEV = 5.0


def filter_hr_data(raw_data: list) -> Optional[list[float]]:
    """Apply multi-step filtering pipeline to raw HR data.

    Returns filtered list of floats (with NaN for invalid points),
    or None if the session should be skipped entirely.
    """
    if not raw_data:
        return None

    n = len(raw_data)
    # Convert None values to NaN before creating numpy array
    cleaned = [float('nan') if v is None else v for v in raw_data]
    arr = np.array(cleaned, dtype=np.float64)

    # Step 1: Physiological bounds
    dropout_mask = arr < MIN_HR  # sensor dropouts (0, low values) - eligible for interpolation
    over_max_mask = arr > MAX_HR  # impossibly high values - not interpolated
    arr[dropout_mask | over_max_mask] = np.nan

    # Step 3 (before spike detection): Cadence lock detection for long sessions
    if n >= CADENCE_LOCK_MIN_DURATION:
        valid_mask = ~np.isnan(arr)
        valid_values = arr[valid_mask]
        if len(valid_values) > 0 and np.std(valid_values) < CADENCE_LOCK_MAX_STDDEV:
            LOGGER.info(f"Cadence lock detected: HR stddev={np.std(valid_values):.1f} over {n}s session")
            return None

    # Step 4: Minimum valid data threshold (checked before spike removal)
    # Only apply to sessions with enough data points to be meaningful
    valid_count = int(np.sum(~np.isnan(arr)))
    if n >= 30 and valid_count / n < MIN_VALID_RATIO:
        return None

    # Step 5: Interpolate small gaps from sensor dropouts only (not over-max values)
    result = arr.copy()
    i = 0
    while i < n:
        if np.isnan(result[i]):
            gap_start = i
            while i < n and np.isnan(result[i]):
                i += 1
            gap_end = i
            gap_length = gap_end - gap_start
            # Only interpolate if all gap values were dropouts (not over-max)
            all_dropout = all(dropout_mask[j] for j in range(gap_start, gap_end))
            if (gap_length <= MAX_INTERPOLATION_GAP and gap_start > 0
                    and gap_end < n and all_dropout):
                left_val = result[gap_start - 1]
                right_val = result[gap_end]
                if not np.isnan(left_val) and not np.isnan(right_val):
                    for j in range(gap_start, gap_end):
                        t = (j - gap_start + 1) / (gap_length + 1)
                        result[j] = left_val + t * (right_val - left_val)
        else:
            i += 1

    # Step 2: Spike detection (exclude current point from median to detect single-sample spikes)
    arr_for_spike = result.copy()
    for i in range(n):
        if np.isnan(arr_for_spike[i]):
            continue
        start = max(0, i - ROLLING_MEDIAN_WINDOW)
        end = min(n, i + ROLLING_MEDIAN_WINDOW + 1)
        window = np.concatenate([arr_for_spike[start:i], arr_for_spike[i + 1:end]])
        valid_in_window = window[~np.isnan(window)]
        if len(valid_in_window) == 0:
            continue
        median = np.median(valid_in_window)
        if abs(arr_for_spike[i] - median) > SPIKE_THRESHOLD_BPM:
            result[i] = np.nan

    return result.tolist()


def detect_max_hr(raw_data: list) -> Optional[int]:
    """Detect max HR using only physiological bounds (relaxed filter)."""
    if not raw_data:
        return None
    cleaned = [float('nan') if v is None else v for v in raw_data]
    arr = np.array(cleaned, dtype=np.float64)
    valid = arr[(arr >= MIN_HR) & (arr <= MAX_HR) & ~np.isnan(arr)]
    if len(valid) == 0:
        return None
    return int(np.max(valid))


def calculate_max_average_hr(data: list[float], window_size: int) -> int:
    """Calculate maximum average HR over a sliding window, skipping windows with NaN."""
    if not data or len(data) < window_size:
        return 0
    arr = np.array(data, dtype=np.float64)
    valid = ~np.isnan(arr)
    valid_cumsum = np.concatenate(([0], np.cumsum(valid.astype(np.float64))))
    valid_counts = valid_cumsum[window_size:] - valid_cumsum[:-window_size]
    arr_zeroed = np.where(valid, arr, 0.0)
    cumsum = np.concatenate(([0], np.cumsum(arr_zeroed)))
    window_sums = cumsum[window_size:] - cumsum[:-window_size]
    fully_valid = valid_counts == window_size
    if not np.any(fully_valid):
        return 0
    valid_averages = window_sums[fully_valid] / window_size
    max_avg = np.max(valid_averages)
    return int(round(max_avg))


def extract_hr_curve(filtered_data: list[float]) -> dict[str, int]:
    """Extract best average HR at 29 standard durations from filtered data."""
    if not filtered_data:
        return {}
    result = {}
    for duration in HR_CURVE_DURATIONS:
        if len(filtered_data) < duration:
            break
        bpm = calculate_max_average_hr(filtered_data, duration)
        if bpm > 0:
            result[str(duration)] = bpm
    return result


def estimate_session_lthr(hr_curve: dict[str, int]) -> Optional[float]:
    """Estimate LTHR from an HR curve.

    Primary: 60-min best avg HR.
    Fallback 1: 30-min best avg * 0.97.
    Fallback 2: 20-min best avg * 0.95.
    """
    if "3600" in hr_curve:
        return float(hr_curve["3600"])
    if "1800" in hr_curve:
        return round(float(hr_curve["1800"]) * 0.97, 1)
    if "1200" in hr_curve:
        return round(float(hr_curve["1200"]) * 0.95, 1)
    return None


def calculate_efficiency_factor(
    sport: str,
    avg_heart_rate: int,
    avg_power: Optional[int] = None,
    total_distance: Optional[float] = None,
    total_timer_time: Optional[float] = None,
) -> Optional[float]:
    """Calculate efficiency factor for a session."""
    if avg_heart_rate < 100:
        return None
    if sport == "cycling":
        if avg_power is None or avg_power <= 0:
            return None
        return round(avg_power / avg_heart_rate, 2)
    if sport == "running":
        if total_distance is None or total_timer_time is None:
            return None
        if total_distance <= 0 or total_timer_time <= 0:
            return None
        avg_speed = total_distance / total_timer_time
        return round((avg_speed * 100) / avg_heart_rate, 2)
    return None


def calculate_hr_zone_time(filtered_data: list[float], lthr: float) -> dict[str, int]:
    """Calculate seconds spent in each HR zone."""
    zone_time = {str(z[0]): 0 for z in HR_ZONE_DEFINITIONS}
    for val in filtered_data:
        if math.isnan(val):
            continue
        pct = val / lthr
        assigned = False
        for zone_num, _, min_pct, max_pct in HR_ZONE_DEFINITIONS:
            if max_pct is None:
                if pct >= min_pct:
                    zone_time[str(zone_num)] += 1
                    assigned = True
                    break
            elif pct < max_pct:
                zone_time[str(zone_num)] += 1
                assigned = True
                break
        if not assigned:
            zone_time[str(HR_ZONE_DEFINITIONS[-1][0])] += 1
    return zone_time


def get_hr_zones(lthr: float) -> list[dict]:
    """Derive 5 HR training zones from LTHR."""
    zones = []
    for zone_num, name, min_pct, max_pct in HR_ZONE_DEFINITIONS:
        min_bpm = int(round(lthr * min_pct))
        max_bpm = int(round(lthr * max_pct)) if max_pct is not None else None
        zones.append({"zone": zone_num, "name": name, "min_bpm": min_bpm, "max_bpm": max_bpm})
    return zones
