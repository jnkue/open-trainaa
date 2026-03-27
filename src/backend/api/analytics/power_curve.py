"""Power curve extraction from raw per-second power data using numpy-accelerated sliding windows."""

import numpy as np

POWER_CURVE_DURATIONS = [
    1, 5, 10, 30,
    60, 120, 180, 240, 300, 360, 420, 480, 540, 600,
    660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200,
    1800, 2700, 3600, 5400, 7200,
]


def calculate_max_average_np(data: list[int], window_size: int) -> int:
    if not data or len(data) < window_size:
        return 0
    arr = np.array(data, dtype=np.float64)
    # Replace NaN/None (sensor dropouts) with 0
    np.nan_to_num(arr, copy=False, nan=0.0)
    cumsum = np.concatenate(([0], np.cumsum(arr)))
    window_sums = cumsum[window_size:] - cumsum[:-window_size]
    max_avg = np.max(window_sums) / window_size
    if np.isnan(max_avg):
        return 0
    return int(round(max_avg))


def extract_power_curve(power_data: list[int]) -> dict[str, int]:
    if not power_data:
        return {}
    result = {}
    for duration in POWER_CURVE_DURATIONS:
        if len(power_data) < duration:
            break
        watts = calculate_max_average_np(power_data, duration)
        if watts > 0:
            result[str(duration)] = watts
    return result
