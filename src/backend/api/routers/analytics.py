"""Analytics API Router - power curve, CP, zones, VDOT, race predictions, HR analytics.

All queries use sessions_no_duplicates view to exclude duplicate activities.
CP is fitted on aggregate power curves, not per-session estimates.
"""

from datetime import date, timedelta

from api.auth import User, get_current_user
from api.utils import get_user_supabase_client
from api.analytics.cp_model import fit_cp_model, get_power_zones, compute_aggregate_envelope
from api.analytics.vdot import predict_race_times
from api.analytics.hr_curve import get_hr_zones, estimate_session_lthr
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Literal

from pydantic import BaseModel, Field

router = APIRouter(prefix="/analytics", tags=["analytics"])
security_bearer = HTTPBearer()


# --- Response Models ---

class PowerCurvePoint(BaseModel):
    duration_seconds: int
    max_avg_watts: int

class PowerCurveResponse(BaseModel):
    power_curve: list[PowerCurvePoint]
    session_count: int
    range: str

class CPHistoryPoint(BaseModel):
    date: str
    cp_watts: float
    w_prime: float

class CPHistoryResponse(BaseModel):
    history: list[CPHistoryPoint]

class PowerZone(BaseModel):
    zone: int
    name: str
    min_watts: int
    max_watts: int | None

class PowerZonesResponse(BaseModel):
    cp_watts: float
    w_prime: float
    zones: list[PowerZone]

class RacePrediction(BaseModel):
    distance: str
    predicted_seconds: int
    predicted_formatted: str

class RunningPredictionsResponse(BaseModel):
    vdot: float
    predictions: list[RacePrediction]
    based_on_sessions: int

class VdotHistoryPoint(BaseModel):
    date: str
    vdot: float

class VdotHistoryResponse(BaseModel):
    history: list[VdotHistoryPoint]


def _format_time(seconds: int) -> str:
    if seconds <= 0:
        return "0:00"
    hours = seconds // 3600
    mins = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def _fetch_power_curves(user_supabase, user_id: str, cutoff: str | None = None) -> list[dict]:
    """Fetch power curve dicts from sessions_no_duplicates."""
    query = (
        user_supabase.table("sessions_no_duplicates")
        .select("power_curve, start_time")
        .eq("user_id", user_id)
        .eq("sport", "cycling")
        .not_.is_("power_curve", "null")
    )
    if cutoff:
        query = query.gte("start_time", cutoff)
    response = query.order("start_time", desc=False).execute()
    return response.data if response.data else []


@router.get("/power-curve", response_model=PowerCurveResponse)
async def get_power_curve(
    range: str = Query("all", pattern="^(all|year|28d)$"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> PowerCurveResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = None
    if range == "year":
        cutoff = (date.today() - timedelta(days=365)).isoformat()
    elif range == "28d":
        cutoff = (date.today() - timedelta(days=28)).isoformat()
    sessions = _fetch_power_curves(user_supabase, current_user.id, cutoff)
    envelope = compute_aggregate_envelope([s["power_curve"] for s in sessions])
    curve = sorted(
        [PowerCurvePoint(duration_seconds=int(d), max_avg_watts=w) for d, w in envelope.items()],
        key=lambda p: p.duration_seconds,
    )
    return PowerCurveResponse(power_curve=curve, session_count=len(sessions), range=range)


@router.get("/cp-history", response_model=CPHistoryResponse)
async def get_cp_history(
    days: int = Query(365, ge=7, le=1825),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> CPHistoryResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = (date.today() - timedelta(days=days + 28)).isoformat()
    sessions = _fetch_power_curves(user_supabase, current_user.id, cutoff)
    if not sessions:
        return CPHistoryResponse(history=[])
    start_date = date.today() - timedelta(days=days)
    history = []
    current_date = start_date
    while current_date <= date.today():
        window_start = (current_date - timedelta(days=28)).isoformat()
        window_end = current_date.isoformat()
        window_curves = [
            s["power_curve"] for s in sessions
            if s["start_time"][:10] >= window_start and s["start_time"][:10] <= window_end
        ]
        if window_curves:
            envelope = compute_aggregate_envelope(window_curves)
            cp_result = fit_cp_model(envelope)
            if cp_result:
                history.append(CPHistoryPoint(
                    date=current_date.isoformat(),
                    cp_watts=round(cp_result[0], 1),
                    w_prime=round(cp_result[1], 0),
                ))
        current_date += timedelta(days=7)
    return CPHistoryResponse(history=history)


@router.get("/power-zones", response_model=PowerZonesResponse)
async def get_power_zones_endpoint(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> PowerZonesResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = (date.today() - timedelta(days=28)).isoformat()
    sessions = _fetch_power_curves(user_supabase, current_user.id, cutoff)
    if not sessions:
        raise HTTPException(status_code=404, detail="No cycling data in the last 28 days with power data.")
    envelope = compute_aggregate_envelope([s["power_curve"] for s in sessions])
    cp_result = fit_cp_model(envelope)
    if not cp_result:
        raise HTTPException(status_code=404, detail="Not enough varied efforts to estimate Critical Power.")
    cp, w_prime = cp_result
    zones = get_power_zones(cp)
    return PowerZonesResponse(
        cp_watts=round(cp, 1),
        w_prime=round(w_prime, 0),
        zones=[PowerZone(**z) for z in zones],
    )


@router.get("/running-predictions", response_model=RunningPredictionsResponse)
async def get_running_predictions(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> RunningPredictionsResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = (date.today() - timedelta(weeks=12)).isoformat()
    response = (
        user_supabase.table("sessions_no_duplicates")
        .select("vdot_estimate")
        .eq("user_id", current_user.id)
        .eq("sport", "running")
        .not_.is_("vdot_estimate", "null")
        .gte("start_time", cutoff)
        .order("vdot_estimate", desc=True)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="No running VDOT data in the last 12 weeks.")
    best_vdot = response.data[0]["vdot_estimate"]
    count_response = (
        user_supabase.table("sessions_no_duplicates")
        .select("id", count="exact")
        .eq("user_id", current_user.id)
        .eq("sport", "running")
        .not_.is_("vdot_estimate", "null")
        .gte("start_time", cutoff)
        .execute()
    )
    session_count = count_response.count or 0
    times = predict_race_times(best_vdot)
    predictions = [
        RacePrediction(distance=dist, predicted_seconds=secs, predicted_formatted=_format_time(secs))
        for dist, secs in times.items()
    ]
    return RunningPredictionsResponse(vdot=best_vdot, predictions=predictions, based_on_sessions=session_count)


@router.get("/vdot-history", response_model=VdotHistoryResponse)
async def get_vdot_history(
    days: int = Query(365, ge=7, le=1825),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> VdotHistoryResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    response = (
        user_supabase.table("sessions_no_duplicates")
        .select("start_time, vdot_estimate")
        .eq("user_id", current_user.id)
        .eq("sport", "running")
        .not_.is_("vdot_estimate", "null")
        .gte("start_time", cutoff)
        .order("start_time", desc=False)
        .execute()
    )
    sessions = response.data if response.data else []
    history = [
        VdotHistoryPoint(date=s["start_time"][:10], vdot=round(s["vdot_estimate"], 1))
        for s in sessions
    ]
    return VdotHistoryResponse(history=history)


# --- HR Analytics Response Models ---

class HRCurvePoint(BaseModel):
    duration_seconds: int
    max_avg_bpm: int

class HRCurveResponse(BaseModel):
    hr_curve: list[HRCurvePoint]
    session_count: int
    range: str
    sport: str

class HRZone(BaseModel):
    zone: int
    name: str
    min_bpm: int
    max_bpm: int | None

class HRZonesResponse(BaseModel):
    lthr: float
    zones: list[HRZone]

class HRThresholdHistoryPoint(BaseModel):
    date: str
    lthr: float

class HRThresholdHistoryResponse(BaseModel):
    history: list[HRThresholdHistoryPoint]

class EFHistoryPoint(BaseModel):
    date: str
    ef: float

class EFHistoryResponse(BaseModel):
    history: list[EFHistoryPoint]

class MaxHRResponse(BaseModel):
    max_heart_rate: int | None
    source: str | None

class MaxHRUpdateRequest(BaseModel):
    sport: Literal["cycling", "running"]
    max_heart_rate: int = Field(ge=100, le=220)

class HRZoneDistributionResponse(BaseModel):
    zone_time: dict[str, int]
    total_seconds: int
    session_count: int


# --- HR Analytics Helper ---

def _fetch_hr_curves(user_supabase, user_id: str, sport: str, cutoff: str | None = None) -> list[dict]:
    """Fetch HR curve dicts from sessions_no_duplicates, filtered by sport."""
    query = (
        user_supabase.table("sessions_no_duplicates")
        .select("hr_curve, start_time")
        .eq("user_id", user_id)
        .eq("sport", sport)
        .not_.is_("hr_curve", "null")
    )
    if cutoff:
        query = query.gte("start_time", cutoff)
    response = query.order("start_time", desc=False).execute()
    return response.data if response.data else []


# --- HR Analytics Endpoints ---

@router.get("/hr-curve", response_model=HRCurveResponse)
async def get_hr_curve(
    range: str = Query("all", pattern="^(all|year|28d)$"),
    sport: str = Query("cycling", pattern="^(cycling|running)$"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> HRCurveResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = None
    if range == "year":
        cutoff = (date.today() - timedelta(days=365)).isoformat()
    elif range == "28d":
        cutoff = (date.today() - timedelta(days=28)).isoformat()
    sessions = _fetch_hr_curves(user_supabase, current_user.id, sport, cutoff)
    envelope = compute_aggregate_envelope([s.get("hr_curve") or {} for s in sessions])
    curve = sorted(
        [HRCurvePoint(duration_seconds=int(d), max_avg_bpm=bpm) for d, bpm in envelope.items()],
        key=lambda p: p.duration_seconds,
    )
    return HRCurveResponse(hr_curve=curve, session_count=len(sessions), range=range, sport=sport)


@router.get("/hr-zones", response_model=HRZonesResponse)
async def get_hr_zones_endpoint(
    sport: str = Query("cycling", pattern="^(cycling|running)$"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> HRZonesResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    response = (
        user_supabase.table("user_sport_settings")
        .select("threshold_heart_rate")
        .eq("user_id", current_user.id)
        .eq("sport", sport)
        .limit(1)
        .execute()
    )
    if not response.data or response.data[0].get("threshold_heart_rate") is None:
        raise HTTPException(status_code=404, detail=f"No LTHR configured for {sport}. Update your sport settings.")
    lthr = float(response.data[0]["threshold_heart_rate"])
    zones = get_hr_zones(lthr)
    return HRZonesResponse(lthr=lthr, zones=[HRZone(**z) for z in zones])


@router.get("/hr-threshold-history", response_model=HRThresholdHistoryResponse)
async def get_hr_threshold_history(
    sport: str = Query("cycling", pattern="^(cycling|running)$"),
    days: int = Query(365, ge=7, le=1825),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> HRThresholdHistoryResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = (date.today() - timedelta(days=days + 90)).isoformat()
    sessions = _fetch_hr_curves(user_supabase, current_user.id, sport, cutoff)
    if not sessions:
        return HRThresholdHistoryResponse(history=[])
    # Attach estimated LTHR per session
    session_lthrs: list[tuple[str, float]] = []
    for s in sessions:
        hr_curve = s.get("hr_curve") or {}
        lthr = estimate_session_lthr(hr_curve)
        if lthr is not None:
            session_lthrs.append((s["start_time"][:10], lthr))
    if not session_lthrs:
        return HRThresholdHistoryResponse(history=[])
    start_date = date.today() - timedelta(days=days)
    history = []
    current_date = start_date
    while current_date <= date.today():
        window_start = (current_date - timedelta(days=90)).isoformat()
        window_end = current_date.isoformat()
        window_lthrs = [
            lthr for d, lthr in session_lthrs
            if window_start <= d <= window_end
        ]
        if window_lthrs:
            best_lthr = max(window_lthrs)
            history.append(HRThresholdHistoryPoint(
                date=current_date.isoformat(),
                lthr=round(best_lthr, 1),
            ))
        current_date += timedelta(days=7)
    return HRThresholdHistoryResponse(history=history)


@router.get("/ef-history", response_model=EFHistoryResponse)
async def get_ef_history(
    sport: str = Query("cycling", pattern="^(cycling|running)$"),
    days: int = Query(365, ge=7, le=1825),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> EFHistoryResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    if sport == "cycling":
        select_fields = "start_time, avg_heart_rate, avg_power"
    else:
        select_fields = "start_time, avg_heart_rate, total_distance, total_timer_time"
    response = (
        user_supabase.table("sessions_no_duplicates")
        .select(select_fields)
        .eq("user_id", current_user.id)
        .eq("sport", sport)
        .not_.is_("avg_heart_rate", "null")
        .gte("start_time", cutoff)
        .order("start_time", desc=False)
        .execute()
    )
    sessions = response.data if response.data else []
    history = []
    for s in sessions:
        avg_hr = s.get("avg_heart_rate")
        if not avg_hr or avg_hr < 100:
            continue
        ef: float | None = None
        if sport == "cycling":
            avg_power = s.get("avg_power")
            if avg_power and avg_power > 0:
                ef = round(avg_power / avg_hr, 2)
        else:
            total_distance = s.get("total_distance")
            total_timer_time = s.get("total_timer_time")
            if total_distance and total_timer_time and total_distance > 0 and total_timer_time > 0:
                avg_speed = total_distance / total_timer_time
                ef = round((avg_speed * 100) / avg_hr, 2)
        if ef is not None:
            history.append(EFHistoryPoint(date=s["start_time"][:10], ef=ef))
    return EFHistoryResponse(history=history)


@router.get("/max-hr", response_model=MaxHRResponse)
async def get_max_hr(
    sport: str = Query("cycling", pattern="^(cycling|running)$"),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> MaxHRResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    response = (
        user_supabase.table("user_sport_settings")
        .select("max_heart_rate, max_heart_rate_source")
        .eq("user_id", current_user.id)
        .eq("sport", sport)
        .limit(1)
        .execute()
    )
    if not response.data or response.data[0].get("max_heart_rate") is None:
        return MaxHRResponse(max_heart_rate=None, source=None)
    return MaxHRResponse(
        max_heart_rate=int(response.data[0]["max_heart_rate"]),
        source=response.data[0].get("max_heart_rate_source", "auto"),
    )


@router.put("/max-hr", response_model=MaxHRResponse)
async def update_max_hr(
    body: MaxHRUpdateRequest,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> MaxHRResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    user_supabase.table("user_sport_settings").upsert(
        {
            "user_id": current_user.id,
            "sport": body.sport,
            "max_heart_rate": body.max_heart_rate,
            "max_heart_rate_source": "manual",
        },
        on_conflict="user_id,sport",
    ).execute()
    return MaxHRResponse(max_heart_rate=body.max_heart_rate, source="manual")


@router.get("/hr-zone-distribution", response_model=HRZoneDistributionResponse)
async def get_hr_zone_distribution(
    sport: str = Query("cycling", pattern="^(cycling|running)$"),
    days: int = Query(28, ge=7, le=365),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
) -> HRZoneDistributionResponse:
    user_supabase = get_user_supabase_client(credentials.credentials)
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    # Fetch sessions with hr_zone_time aggregated data
    response = (
        user_supabase.table("sessions_no_duplicates")
        .select("hr_zone_time")
        .eq("user_id", current_user.id)
        .eq("sport", sport)
        .not_.is_("hr_zone_time", "null")
        .gte("start_time", cutoff)
        .execute()
    )
    sessions = response.data if response.data else []
    zone_totals: dict[str, int] = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    total_seconds = 0
    for s in sessions:
        hr_zone_time = s.get("hr_zone_time") or {}
        for zone_key in zone_totals:
            seconds = hr_zone_time.get(zone_key, 0) or 0
            zone_totals[zone_key] += seconds
            total_seconds += seconds
    return HRZoneDistributionResponse(
        zone_time=zone_totals,
        total_seconds=total_seconds,
        session_count=len(sessions),
    )
