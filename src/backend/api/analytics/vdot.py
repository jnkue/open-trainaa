"""VDOT calculation with best-effort extraction and race time predictions."""

import math

import numpy as np
from scipy.optimize import brentq

from api.log import LOGGER

RACE_DISTANCES = {
    "5k": 5000,
    "10k": 10000,
    "half_marathon": 21097.5,
    "marathon": 42195,
}

BEST_EFFORT_DISTANCES = [5000, 10000, 21097.5]

MIN_TIME_SECONDS = 720
MAX_TIME_SECONDS = 14400
MIN_DISTANCE_METERS = 1000


def _vo2_from_velocity(velocity_m_per_min: float) -> float:
    v = velocity_m_per_min
    return -4.60 + 0.182258 * v + 0.000104 * v * v


def _fraction_vo2max(time_minutes: float) -> float:
    t = time_minutes
    return 0.8 + 0.1894393 * math.exp(-0.012778 * t) + 0.2989558 * math.exp(-0.1932605 * t)


def calculate_vdot(distance_meters: float, time_seconds: float) -> float | None:
    if time_seconds <= 0 or distance_meters < MIN_DISTANCE_METERS:
        return None
    if time_seconds < MIN_TIME_SECONDS or time_seconds > MAX_TIME_SECONDS:
        return None
    time_minutes = time_seconds / 60.0
    velocity_m_per_min = distance_meters / time_minutes
    vo2 = _vo2_from_velocity(velocity_m_per_min)
    fraction = _fraction_vo2max(time_minutes)
    if fraction <= 0:
        return None
    return round(vo2 / fraction, 1)


def find_best_effort_vdot(
    speed_data: list[float],
    distance_data: list[float],
) -> float | None:
    if not speed_data or not distance_data or len(speed_data) < MIN_TIME_SECONDS:
        return None
    total_distance = distance_data[-1] if distance_data else 0
    if total_distance is None or (isinstance(total_distance, float) and math.isnan(total_distance)):
        total_distance = 0
    total_time = len(speed_data)
    dist_arr = np.array(distance_data, dtype=np.float64)
    np.nan_to_num(dist_arr, copy=False, nan=0.0)
    best_vdot = None

    for target_distance in BEST_EFFORT_DISTANCES:
        if total_distance < target_distance:
            continue
        left = 0
        best_time_for_dist = float('inf')
        for right in range(len(dist_arr)):
            while left < right and (dist_arr[right] - dist_arr[left]) >= target_distance:
                time_secs = right - left
                if time_secs > 0 and time_secs < best_time_for_dist:
                    best_time_for_dist = time_secs
                left += 1
        if best_time_for_dist < float('inf') and best_time_for_dist >= MIN_TIME_SECONDS:
            vdot = calculate_vdot(target_distance, best_time_for_dist)
            if vdot is not None and (best_vdot is None or vdot > best_vdot):
                best_vdot = vdot

    if best_vdot is None and total_distance >= MIN_DISTANCE_METERS:
        best_vdot = calculate_vdot(total_distance, total_time)
    return best_vdot


def calculate_vdot_for_session(
    total_distance: float,
    total_timer_time: float,
    speed_data: list[float] | None = None,
    distance_data: list[float] | None = None,
) -> float | None:
    if speed_data and distance_data and len(speed_data) >= MIN_TIME_SECONDS:
        vdot = find_best_effort_vdot(speed_data, distance_data)
        if vdot is not None:
            return vdot
    return calculate_vdot(total_distance, total_timer_time)


def _time_for_distance_at_vdot(distance_meters: float, vdot: float) -> int:
    def equation(time_minutes: float) -> float:
        velocity = distance_meters / time_minutes
        vo2 = _vo2_from_velocity(velocity)
        fraction = _fraction_vo2max(time_minutes)
        return vo2 / fraction - vdot
    t_min, t_max = 3.0, 600.0
    try:
        result_minutes = brentq(equation, t_min, t_max)
        return round(result_minutes * 60)
    except ValueError:
        LOGGER.warning(f"Could not find time for distance={distance_meters}m at VDOT={vdot}")
        return 0


def predict_race_times(vdot: float) -> dict[str, int]:
    return {key: _time_for_distance_at_vdot(dist, vdot) for key, dist in RACE_DISTANCES.items()}
