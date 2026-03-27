-- Add HR analytics: user_sport_settings table + hr_curve, efficiency_factor, hr_zone_time on sessions

-- 1. New table for per-sport physiological settings
CREATE TABLE IF NOT EXISTS public.user_sport_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sport TEXT NOT NULL CHECK (sport IN ('cycling', 'running')),
    max_heart_rate INT,
    max_heart_rate_source TEXT DEFAULT 'auto' CHECK (max_heart_rate_source IN ('auto', 'manual')),
    threshold_heart_rate FLOAT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, sport)
);

COMMENT ON TABLE public.user_sport_settings IS 'Per-sport physiological settings for analytics. Extensible for future per-sport metrics.';
COMMENT ON COLUMN public.user_sport_settings.max_heart_rate IS 'Max HR in bpm, auto-detected from session data or manually overridden.';
COMMENT ON COLUMN public.user_sport_settings.max_heart_rate_source IS 'auto = detected from sessions, manual = user override.';
COMMENT ON COLUMN public.user_sport_settings.threshold_heart_rate IS 'Lactate threshold HR in bpm, auto-computed from best 60/30/20-min avg HR.';

-- RLS policies (matching user_infos pattern)
GRANT SELECT, INSERT, UPDATE, DELETE ON user_sport_settings TO authenticated;
GRANT ALL ON user_sport_settings TO service_role;
ALTER TABLE user_sport_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sport settings" ON user_sport_settings
    FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own sport settings" ON user_sport_settings
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own sport settings" ON user_sport_settings
    FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own sport settings" ON user_sport_settings
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER set_updated_at_user_sport_settings
    BEFORE UPDATE ON public.user_sport_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. New columns on sessions table
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS hr_curve JSONB;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS efficiency_factor FLOAT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS hr_zone_time JSONB;

COMMENT ON COLUMN public.sessions.hr_curve IS 'Pre-computed best average HR at 29 standard durations. Format: {"1": 185, "5": 182, ...} where keys are seconds.';
COMMENT ON COLUMN public.sessions.efficiency_factor IS 'Cycling: avg_power/avg_hr. Running: (avg_speed*100)/avg_hr.';
COMMENT ON COLUMN public.sessions.hr_zone_time IS 'Seconds spent in each HR zone. Format: {"1": 600, "2": 1200, "3": 900, "4": 300, "5": 60}.';

-- Partial index for HR analytics queries
CREATE INDEX IF NOT EXISTS idx_sessions_analytics_hr
    ON public.sessions(user_id, start_time)
    WHERE hr_curve IS NOT NULL;

-- Recreate views to pick up new columns
CREATE OR REPLACE VIEW sessions_no_duplicates
WITH (security_invoker = true) AS
SELECT s.*
FROM sessions s
INNER JOIN activities a ON s.activity_id = a.id
WHERE a.duplicate_of IS NULL;

CREATE OR REPLACE VIEW sessions_with_custom_data_no_duplicates
WITH (security_invoker = true) AS
SELECT
    s.id, s.user_id, s.activity_id, s.session_number,
    s.sport, s.sub_sport, s.start_time,
    s.total_distance, s.total_elapsed_time, s.total_timer_time,
    s.total_calories, s.avg_heart_rate, s.max_heart_rate,
    s.avg_speed, s.max_speed, s.total_elevation_gain,
    s.avg_power, s.max_power,
    s.power_curve, s.cp_estimate, s.w_prime_estimate, s.vdot_estimate,
    s.hr_curve, s.efficiency_factor, s.hr_zone_time,
    s.session_custom_data_id, s.created_at, s.updated_at,
    scd.heart_rate_load, scd.feel, scd.rpe, scd.llm_feedback,
    scd.metadata AS custom_metadata
FROM sessions s
INNER JOIN activities a ON s.activity_id = a.id
LEFT JOIN session_custom_data scd ON s.session_custom_data_id = scd.id
WHERE a.duplicate_of IS NULL;
