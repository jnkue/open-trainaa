BEGIN;

------------------------------------------------------------------------------------------------------
-- LLM-Friendly Views for Activities, Sessions, Laps, and Records
------------------------------------------------------------------------------------------------------


-- Detailed session view for LLM queries
CREATE OR REPLACE VIEW public.session_details with (security_invoker = on) AS
SELECT 
    s.id as session_id,
    s.user_id,
    s.session_number,
    s.sport,
    s.sub_sport,
    s.start_time,
    DATE(s.start_time) as session_date,
    EXTRACT(YEAR FROM s.start_time) as session_year,
    EXTRACT(MONTH FROM s.start_time) as session_month,
    TO_CHAR(s.start_time, 'Month') as session_month_name,
    TO_CHAR(s.start_time, 'Day') as session_day_name,
    EXTRACT(HOUR FROM s.start_time) as session_hour,
    -- Distance metrics
    s.total_distance as distance_m,
    ROUND((s.total_distance / 1000.0)::numeric, 2) as distance_km,
    -- Time metrics
    s.total_elapsed_time as elapsed_time_s,
    s.total_timer_time as moving_time_s,
    ROUND((s.total_elapsed_time / 60.0)::numeric, 1) as elapsed_time_min,
    ROUND((s.total_timer_time / 60.0)::numeric, 1) as moving_time_min,
    -- Performance metrics
    s.total_calories as calories,
    s.avg_heart_rate as avg_hr_bpm,
    s.max_heart_rate as max_hr_bpm,
    s.avg_speed as avg_speed_ms,
    ROUND((s.avg_speed * 3.6)::numeric, 2) as avg_speed_kmh,
    s.max_speed as max_speed_ms,
    ROUND((s.max_speed * 3.6)::numeric, 2) as max_speed_kmh,
    s.avg_cadence as avg_cadence_rpm,
    s.total_elevation_gain as elevation_gain_m,
    -- Calculated pace (min/km) for running/walking sports
    CASE 
        WHEN s.avg_speed > 0 AND s.sport IN ('running', 'walking', 'hiking') 
        THEN ROUND(((1000.0 / s.avg_speed) / 60.0)::numeric, 2)
        ELSE NULL 
    END as avg_pace_min_per_km,
    -- Activity context
    a.num_sessions as activity_total_sessions,
    CASE 
        WHEN a.fit_file_id IS NOT NULL THEN 'FIT File'
        WHEN a.strava_response_id IS NOT NULL THEN 'Strava'
        ELSE 'Unknown'
    END as data_source
FROM sessions s
JOIN activities a ON s.activity_id = a.id
WHERE a.duplicate_of IS NULL;

-- Lap summary view for LLM queries
CREATE OR REPLACE VIEW public.lap_summary  with (security_invoker = on) AS
SELECT 
    l.id as lap_id,
    l.activity_id,
    l.session_id,
    l.lap_number,
    s.sport,
    s.sub_sport,
    l.start_time,
    DATE(l.start_time) as lap_date,
    -- Distance and time
    l.total_distance as distance_m,
    ROUND((l.total_distance / 1000.0)::numeric, 2) as distance_km,
    l.total_elapsed_time as elapsed_time_s,
    l.total_timer_time as moving_time_s,
    ROUND((l.total_elapsed_time / 60.0)::numeric, 1) as elapsed_time_min,
    ROUND((l.total_timer_time / 60.0)::numeric, 1) as moving_time_min,
    -- Performance
    l.avg_heart_rate as avg_hr_bpm,
    l.max_heart_rate as max_hr_bpm,
    l.avg_speed as avg_speed_ms,
    ROUND((l.avg_speed * 3.6)::numeric, 2) as avg_speed_kmh,
    l.max_speed as max_speed_ms,
    ROUND((l.max_speed * 3.6)::numeric, 2) as max_speed_kmh,
    l.total_calories as calories,
    l.avg_cadence as avg_cadence_rpm,
    l.total_elevation_gain as elevation_gain_m,
    -- Calculated pace for running/walking sports
    CASE 
        WHEN l.avg_speed > 0 AND s.sport IN ('running', 'walking', 'hiking') 
        THEN ROUND(((1000.0 / l.avg_speed) / 60.0)::numeric, 2)
        ELSE NULL 
    END as avg_pace_min_per_km,
    -- Session context
    s.session_number,
    COUNT(*) OVER (PARTITION BY l.session_id) as total_laps_in_session
FROM laps l
JOIN sessions s ON l.session_id = s.id
JOIN activities a ON l.activity_id = a.id
WHERE a.duplicate_of IS NULL
ORDER BY l.session_id, l.lap_number;

-- Record summary view for GPS tracking and detailed analysis
-- This view expands the array-based records back into individual rows for compatibility
CREATE OR REPLACE VIEW public.record_summary  with (security_invoker = on) AS
SELECT
    r.id as record_id,
    r.activity_id,
    r.session_id,
    elem_idx as record_index,
    elem_timestamp as seconds_from_session_start,
    s.start_time + (elem_timestamp || ' seconds')::INTERVAL as timestamp,
    DATE(s.start_time + (elem_timestamp || ' seconds')::INTERVAL) as record_date,
    -- Location data (unnested from arrays)
    elem_latitude as latitude,
    elem_longitude as longitude,
    elem_altitude as altitude_m,
    CASE
        WHEN elem_latitude IS NOT NULL AND elem_longitude IS NOT NULL
        THEN ST_AsText(ST_SetSRID(ST_MakePoint(elem_longitude, elem_latitude), 4326))
        ELSE NULL
    END as position_wkt,
    -- Performance metrics (unnested from arrays)
    elem_heart_rate as hr_bpm,
    elem_cadence as cadence_rpm,
    elem_speed as speed_ms,
    ROUND((elem_speed * 3.6)::numeric, 2) as speed_kmh,
    elem_distance as cumulative_distance_m,
    ROUND((elem_distance / 1000.0)::numeric, 3) as cumulative_distance_km,
    elem_power as power_watts,
    elem_temperature as temperature_c,
    -- Session context
    s.sport,
    s.sub_sport,
    s.session_number
FROM records r
JOIN sessions s ON r.session_id = s.id
JOIN activities a ON r.activity_id = a.id
CROSS JOIN LATERAL (
    SELECT
        idx AS elem_idx,
        COALESCE(r.timestamp[idx], idx) AS elem_timestamp,
        r.latitude[idx] AS elem_latitude,
        r.longitude[idx] AS elem_longitude,
        r.altitude[idx] AS elem_altitude,
        r.heart_rate[idx] AS elem_heart_rate,
        r.cadence[idx] AS elem_cadence,
        r.speed[idx] AS elem_speed,
        r.distance[idx] AS elem_distance,
        r.power[idx] AS elem_power,
        r.temperature[idx] AS elem_temperature
    FROM generate_series(1, GREATEST(
        COALESCE(array_length(r.timestamp, 1), 0),
        COALESCE(array_length(r.heart_rate, 1), 0),
        COALESCE(array_length(r.speed, 1), 0)
    )) idx
) expanded
WHERE a.duplicate_of IS NULL
ORDER BY r.session_id, elem_idx;


-- Sport-specific statistics
CREATE OR REPLACE VIEW public.sport_statistics   with (security_invoker = on)AS
SELECT 
    s.user_id,
    s.sport,
    COUNT(*) as session_count,
    COUNT(DISTINCT DATE(s.start_time)) as unique_session_days,
    -- Distance metrics
    SUM(s.total_distance) as total_distance_m,
    ROUND((SUM(s.total_distance) / 1000.0)::numeric, 2) as total_distance_km,
    ROUND(AVG(s.total_distance)::numeric, 0) as avg_distance_per_session_m,
    ROUND((AVG(s.total_distance) / 1000.0)::numeric, 2) as avg_distance_per_session_km,
    -- Time metrics
    SUM(s.total_elapsed_time) as total_elapsed_time_s,
    SUM(s.total_timer_time) as total_moving_time_s,
    ROUND((SUM(s.total_elapsed_time) / 3600.0)::numeric, 1) as total_elapsed_time_h,
    ROUND((SUM(s.total_timer_time) / 3600.0)::numeric, 1) as total_moving_time_h,
    ROUND(AVG(s.total_elapsed_time)::numeric, 0) as avg_elapsed_time_per_session_s,
    ROUND((AVG(s.total_elapsed_time) / 60.0)::numeric, 1) as avg_elapsed_time_per_session_min,
    -- Performance metrics
    ROUND(AVG(s.avg_heart_rate)::numeric, 0) as avg_heart_rate_bpm,
    MAX(s.max_heart_rate) as max_heart_rate_bpm,
    ROUND(AVG(s.avg_speed)::numeric, 2) as avg_speed_ms,
    ROUND((AVG(s.avg_speed) * 3.6)::numeric, 2) as avg_speed_kmh,
    MAX(s.max_speed) as max_speed_ms,
    ROUND((MAX(s.max_speed) * 3.6)::numeric, 2) as max_speed_kmh,
    SUM(s.total_calories) as total_calories,
    SUM(s.total_elevation_gain) as total_elevation_gain_m,
    -- Date ranges
    MIN(DATE(s.start_time)) as first_session_date,
    MAX(DATE(s.start_time)) as last_session_date
FROM sessions s
JOIN activities a ON s.activity_id = a.id
WHERE a.duplicate_of IS NULL
GROUP BY s.user_id, s.sport
ORDER BY s.user_id, total_distance_km DESC;

-- Monthly activity summary for trend analysis
CREATE OR REPLACE VIEW public.monthly_activity_summary with (security_invoker = on) AS
SELECT 
    user_id,
    EXTRACT(YEAR FROM created_at) as year,
    EXTRACT(MONTH FROM created_at) as month,
    TO_CHAR(created_at, 'YYYY-MM') as year_month,
    TO_CHAR(created_at, 'Month YYYY') as month_year_name,
    COUNT(*) as activity_count,
    SUM(total_distance) as total_distance_m,
    ROUND((SUM(total_distance) / 1000.0)::numeric, 2) as total_distance_km,
    SUM(total_elapsed_time) as total_elapsed_time_s,
    ROUND((SUM(total_elapsed_time) / 3600.0)::numeric, 1) as total_elapsed_time_h,
    ROUND(AVG(total_distance)::numeric, 0) as avg_distance_per_activity_m,
    ROUND((AVG(total_distance) / 1000.0)::numeric, 2) as avg_distance_per_activity_km
FROM activities
WHERE duplicate_of IS NULL
GROUP BY user_id, EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at), TO_CHAR(created_at, 'YYYY-MM'), TO_CHAR(created_at, 'Month YYYY')
ORDER BY user_id, year, month;

------------------------------------------------------------------------------------------------------
-- Row Level Security for Views
------------------------------------------------------------------------------------------------------

-- Enable RLS on views (they inherit from underlying tables)
-- Views automatically respect the RLS policies of the underlying tables

-- Grant permissions to authenticated users

GRANT SELECT ON public.session_details TO service_role;
GRANT SELECT ON public.lap_summary TO service_role;
GRANT SELECT ON public.record_summary TO service_role;
GRANT SELECT ON public.sport_statistics TO service_role;
GRANT SELECT ON public.monthly_activity_summary TO service_role;

COMMIT;
