/* 
# All Tables:
1.1 strava_tokens 
1.2 strava_responses
1.3 fit_files
1.4 fitness_providers
1.5 user_provider_connections -not yet in use

1.6 activities
1.7 sessions
1.8 laps
1.9 records

1.10 user_infos
1.11 user_infos_history

1.1 2workouts
1.1 3workouts_scheduled

1.14 training_status
1.15 chat_history
1.16 user_session_feedback
1.17 user_feedback
1.18 threads
*/


/* 
# Views:
2.1 session_details
2.2 lap_summary
2.3 record_summary
2.4 sport_statistics
2.5 monthly_activity_summary

*/





-- 1.1 strava_tokens 
GRANT SELECT, INSERT, UPDATE, DELETE ON strava_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON strava_tokens TO service_role;

-- 1.2 strava_responses
GRANT SELECT, INSERT, UPDATE, DELETE ON strava_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON strava_responses TO service_role;
ALTER TABLE strava_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own strava responses" ON strava_responses
    FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own strava responses" ON strava_responses
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own strava responses" ON strava_responses
    FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own strava responses" ON strava_responses
    FOR DELETE USING (user_id = (SELECT auth.uid()));



-- 1.3 fit_files
GRANT SELECT, INSERT, UPDATE, DELETE ON fit_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fit_files TO service_role;

-- 1.4 fitness_providers
GRANT SELECT ON fitness_providers TO authenticated;
GRANT SELECT ON fitness_providers TO anon;

-- 1.5 user_provider_connections -not yet in use
GRANT SELECT, INSERT, UPDATE, DELETE ON user_provider_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fit_files TO service_role;

-- 1.6 activities
GRANT SELECT, INSERT, UPDATE, DELETE ON activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON activities TO service_role;


-- 1.7 sessions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO service_role;


-- 1.8 laps
GRANT SELECT, INSERT, UPDATE, DELETE ON laps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON laps TO service_role;


-- 1.9 records
GRANT SELECT, INSERT, UPDATE, DELETE ON records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON records TO service_role;




-- 1.10 user_infos
GRANT SELECT, INSERT, UPDATE, DELETE ON user_infos TO authenticated;
GRANT ALL ON user_infos TO service_role;
ALTER TABLE user_infos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own user info" ON user_infos
    FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own user info" ON user_infos
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own user info" ON user_infos
    FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own user info" ON user_infos
    FOR DELETE USING (user_id = (SELECT auth.uid()));




-- 1.11 user_infos_history
GRANT SELECT, INSERT, UPDATE, DELETE ON user_infos_history TO authenticated;
GRANT ALL ON user_infos_history TO service_role;
ALTER TABLE user_infos_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own user info history" ON user_infos_history
    FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own user info history" ON user_infos_history
    FOR INSERT WITH CHECK  (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own user info history" ON user_infos_history
    FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own user info history" ON user_infos_history
    FOR DELETE USING (user_id = (SELECT auth.uid()));




-- 1.12 workouts
GRANT SELECT, INSERT, UPDATE, DELETE ON workouts TO authenticated;
GRANT ALL ON workouts TO service_role;


-- 1.13 workouts_scheduled
GRANT SELECT, INSERT, UPDATE, DELETE ON workouts_scheduled TO authenticated;
GRANT ALL ON workouts_scheduled TO service_role;



-- 1.14 training_status
GRANT SELECT, INSERT, UPDATE, DELETE ON training_status TO authenticated;
GRANT ALL ON training_status TO service_role;



-- 1.15 chat_history
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_history TO authenticated;
GRANT ALL ON chat_history TO service_role;


-- 1.16 user_session_feedback
GRANT SELECT, INSERT, UPDATE, DELETE ON user_session_feedback TO authenticated;
GRANT ALL ON user_session_feedback TO service_role;


-- 1.17 user_feedback
GRANT SELECT, INSERT, UPDATE, DELETE ON user_feedback TO authenticated;
GRANT ALL ON user_feedback TO service_role;


-- 1.18 threads
GRANT SELECT, INSERT, UPDATE, DELETE ON threads TO authenticated;
GRANT ALL ON threads TO service_role;









-- Grant usage on sequences
GRANT USAGE ON SEQUENCE records_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE fit_files_file_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE strava_responses_id_seq TO authenticated;