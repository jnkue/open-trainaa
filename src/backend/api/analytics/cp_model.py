"""Critical Power model fitting and power zone derivation.

CP is fitted on aggregate power curves (envelope of best efforts across sessions),
NOT on individual session curves. Per-session estimates are stored for convenience
but the authoritative CP comes from the aggregate fit.
"""

import numpy as np
from scipy.optimize import curve_fit

from api.log import LOGGER

ZONE_DEFINITIONS = [
    (1, "Recovery", 0.0, 0.55),
    (2, "Endurance", 0.55, 0.75),
    (3, "Tempo", 0.75, 0.90),
    (4, "Threshold", 0.90, 1.05),
    (5, "VO2max", 1.05, 1.20),
    (6, "Anaerobic", 1.20, 1.50),
    (7, "Neuromuscular", 1.50, None),
]


def _cp_function(t: np.ndarray, cp: float, w_prime: float) -> np.ndarray:
    return cp + w_prime / t


def compute_aggregate_envelope(power_curves: list[dict[str, int]]) -> dict[str, int]:
    envelope: dict[str, int] = {}
    for curve in power_curves:
        if not curve:
            continue
        for dur_str, watts in curve.items():
            if dur_str not in envelope or watts > envelope[dur_str]:
                envelope[dur_str] = watts
    return envelope


def fit_cp_model(power_curve: dict[str, int]) -> tuple[float, float] | None:
    if not power_curve:
        return None
    durations = []
    powers = []
    for dur_str, watts in power_curve.items():
        dur = int(dur_str)
        if dur >= 120 and watts > 0:
            durations.append(dur)
            powers.append(watts)
    if len(durations) < 3:
        return None
    t = np.array(durations, dtype=np.float64)
    p = np.array(powers, dtype=np.float64)
    try:
        popt, _ = curve_fit(
            _cp_function, t, p,
            p0=[np.median(p), 20000.0],
            bounds=([30.0, 500.0], [700.0, 150000.0]),
            maxfev=5000,
        )
        cp, w_prime = popt
        return (float(cp), float(w_prime))
    except (RuntimeError, ValueError) as e:
        LOGGER.warning(f"CP model fitting failed: {e}")
        return None


def get_power_zones(cp_watts: float) -> list[dict]:
    zones = []
    for zone_num, name, min_pct, max_pct in ZONE_DEFINITIONS:
        min_watts = int(round(cp_watts * min_pct))
        max_watts = int(round(cp_watts * max_pct)) if max_pct is not None else None
        zones.append({"zone": zone_num, "name": name, "min_watts": min_watts, "max_watts": max_watts})
    return zones
