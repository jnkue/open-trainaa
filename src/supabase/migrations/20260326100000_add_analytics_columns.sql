-- Add analytics columns to sessions table for power curve, CP model, and VDOT data

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS power_curve JSONB;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS cp_estimate FLOAT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS w_prime_estimate FLOAT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS vdot_estimate FLOAT;

COMMENT ON COLUMN public.sessions.power_curve IS 'Pre-computed best average power at 29 standard durations. Format: {"1": 950, "5": 780, ...} where keys are seconds.';
COMMENT ON COLUMN public.sessions.cp_estimate IS 'Critical Power estimate in watts, stored per-session for convenience. Authoritative CP comes from aggregate fit.';
COMMENT ON COLUMN public.sessions.w_prime_estimate IS 'W-prime anaerobic work capacity in joules from per-session CP model fit.';
COMMENT ON COLUMN public.sessions.vdot_estimate IS 'VDOT estimate from best continuous effort within the running session.';

-- Partial indexes for analytics query patterns (user_id + start_time filtered by non-null analytics columns)
CREATE INDEX IF NOT EXISTS idx_sessions_analytics_cycling
  ON public.sessions(user_id, start_time)
  WHERE power_curve IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_analytics_running
  ON public.sessions(user_id, start_time)
  WHERE vdot_estimate IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_cp_estimate
  ON public.sessions(user_id, start_time)
  WHERE cp_estimate IS NOT NULL;

-- Recreate views that use SELECT s.* from sessions so they pick up the new columns.
-- PostgreSQL resolves * at view creation time, so views must be recreated after ALTER TABLE.

CREATE OR REPLACE VIEW sessions_no_duplicates
WITH (security_invoker = true) AS
SELECT s.*
FROM sessions s
INNER JOIN activities a ON s.activity_id = a.id
WHERE a.duplicate_of IS NULL;

CREATE OR REPLACE VIEW sessions_with_custom_data_no_duplicates
WITH (security_invoker = true) AS
SELECT
    s.id,
    s.user_id,
    s.activity_id,
    s.session_number,
    s.sport,
    s.sub_sport,
    s.start_time,
    s.total_distance,
    s.total_elapsed_time,
    s.total_timer_time,
    s.total_calories,
    s.avg_heart_rate,
    s.max_heart_rate,
    s.avg_speed,
    s.max_speed,
    s.total_elevation_gain,
    s.session_custom_data_id,
    s.created_at,
    s.updated_at,
    scd.heart_rate_load,
    scd.feel,
    scd.rpe,
    scd.llm_feedback,
    scd.metadata AS custom_metadata
FROM sessions s
INNER JOIN activities a ON s.activity_id = a.id
LEFT JOIN session_custom_data scd ON s.session_custom_data_id = scd.id
WHERE a.duplicate_of IS NULL;
