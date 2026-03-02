-- Migration: Duplicate-Filtered Views for Activities and Sessions
-- Purpose: Provide views that automatically filter out duplicate activities to prevent
--          double-counting in training status calculations and analytics
-- Date: 2025-11-18

-- =============================================================================
-- View 1: activities_no_duplicates
-- =============================================================================
-- Filters out activities that are marked as duplicates
-- Use this view whenever you need to query activities and want to exclude duplicates

CREATE OR REPLACE VIEW activities_no_duplicates
WITH (security_invoker = true) AS
SELECT *
FROM activities
WHERE duplicate_of IS NULL;

COMMENT ON VIEW activities_no_duplicates IS
'View of activities table with duplicates filtered out (WHERE duplicate_of IS NULL). Use this view to ensure duplicate activities from multiple sources (Strava, Garmin, etc.) are not counted multiple times.';


-- =============================================================================
-- View 2: sessions_no_duplicates
-- =============================================================================
-- Filters out sessions that belong to duplicate activities
-- Use this view for session queries that don't need custom data

CREATE OR REPLACE VIEW sessions_no_duplicates
WITH (security_invoker = true) AS
SELECT s.*
FROM sessions s
INNER JOIN activities a ON s.activity_id = a.id
WHERE a.duplicate_of IS NULL;

COMMENT ON VIEW sessions_no_duplicates IS
'View of sessions table with sessions from duplicate activities filtered out. Joins with activities table to exclude sessions where activities.duplicate_of IS NOT NULL.';


-- =============================================================================
-- View 3: sessions_with_custom_data_no_duplicates
-- =============================================================================
-- Pre-joins sessions with custom data and filters duplicates
-- Optimized for training status calculations that need heart_rate_load

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
    -- Custom data fields
    scd.heart_rate_load,
    scd.feel,
    scd.rpe,
    scd.llm_feedback,
    scd.metadata AS custom_metadata
FROM sessions s
INNER JOIN activities a ON s.activity_id = a.id
LEFT JOIN session_custom_data scd ON s.session_custom_data_id = scd.id
WHERE a.duplicate_of IS NULL;

COMMENT ON VIEW sessions_with_custom_data_no_duplicates IS
'View that combines sessions with session_custom_data and filters out duplicates. Optimized for training status calculations that need heart_rate_load and other custom metrics. Only includes sessions where activities.duplicate_of IS NULL.';


-- =============================================================================
-- Performance Index: training_status.needs_update
-- =============================================================================
-- Partial index for efficient queries on records needing recalculation
-- Used by background jobs and the /calculate endpoint

CREATE INDEX IF NOT EXISTS idx_training_status_needs_update
ON training_status(user_id, needs_update)
WHERE needs_update = TRUE;

COMMENT ON INDEX idx_training_status_needs_update IS
'Partial index for efficiently finding training_status records that need recalculation. Used by the /calculate endpoint and background jobs.';


-- =============================================================================
-- Grant Permissions (Row Level Security)
-- =============================================================================
-- Allow authenticated users to query the views

GRANT SELECT ON activities_no_duplicates TO authenticated;
GRANT SELECT ON sessions_no_duplicates TO authenticated;
GRANT SELECT ON sessions_with_custom_data_no_duplicates TO authenticated;


-- =============================================================================
-- Migration Notes
-- =============================================================================
-- After this migration is applied, update backend code to use these views instead
-- of direct table queries to ensure duplicates are never counted multiple times.
--
-- Views to use:
-- - activities_no_duplicates: For general activity queries
-- - sessions_no_duplicates: For session queries without custom data
-- - sessions_with_custom_data_no_duplicates: For training status and analytics
--
-- After deployment, existing users may have incorrect training status due to
-- historical duplicate counting. Run the recalculation script or use the
-- POST /training-status/recalculate endpoint to fix historical data.
