-- Grant necessary permissions on tables to authenticated users
-- This is separate from RLS - it's basic PostgreSQL table permissions
-- Required when using new Supabase keys format

BEGIN;

-- Activity-related tables
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON laps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON records TO authenticated;

-- Chat-related tables
GRANT SELECT, INSERT, UPDATE, DELETE ON threads TO authenticated;


-- User-related tables
GRANT SELECT, INSERT, UPDATE, DELETE ON user_provider_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON strava_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON strava_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fit_files TO authenticated;


-- Training-related tables
GRANT SELECT, INSERT, UPDATE, DELETE ON training_status TO authenticated;



-- Feedback tables
GRANT SELECT, INSERT, UPDATE, DELETE ON user_feedback TO authenticated;
-- Provider table (read-only for users)
GRANT SELECT ON fitness_providers TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON SEQUENCE records_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE fit_files_file_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE strava_responses_id_seq TO authenticated;

-- Grant to anon role for public endpoints (minimal access)
GRANT SELECT ON fitness_providers TO anon;

COMMIT;
