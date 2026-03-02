-- Migration: HR Load Calculation Function
-- Creates a function to calculate and update heart_rate_load for sessions
-- Uses the algorithm: hr_load = (weighted_intensity * duration) / 3600 * 100

CREATE OR REPLACE FUNCTION calculate_session_hr_load(session_uuid UUID)
RETURNS FLOAT AS $$
DECLARE
    user_uuid UUID;
    threshold_hr INTEGER;
    total_hr_load FLOAT := 0;
    record_count INTEGER := 0;
    avg_duration_per_record FLOAT;
    current_hr INTEGER;
    relative_intensity FLOAT;
    weighted_intensity FLOAT;
    session_duration FLOAT;
    hr_array INT[];
    hr_value INTEGER;
BEGIN
    -- Get user_id from session
    SELECT s.user_id INTO user_uuid
    FROM sessions s
    WHERE s.id = session_uuid;

    IF user_uuid IS NULL THEN
        RAISE EXCEPTION 'Session not found: %', session_uuid;
    END IF;

    -- Get threshold heart rate for the user
    SELECT ua.threshold_heart_rate INTO threshold_hr
    FROM user_infos ua
    WHERE ua.user_id = user_uuid;

    IF threshold_hr IS NULL OR threshold_hr <= 0 THEN
        RAISE NOTICE 'No valid threshold heart rate found for user %, skipping HR load calculation', user_uuid;
        RETURN 0;
    END IF;

    -- Get total session duration in seconds
    SELECT total_timer_time INTO session_duration
    FROM sessions
    WHERE id = session_uuid;

    IF session_duration IS NULL OR session_duration <= 0 THEN
        RAISE NOTICE 'No valid session duration found for session %, skipping HR load calculation', session_uuid;
        RETURN 0;
    END IF;

    -- Get heart rate array from records table
    SELECT heart_rate INTO hr_array
    FROM records
    WHERE session_id = session_uuid;

    -- Check if heart rate array exists and has data
    IF hr_array IS NULL OR array_length(hr_array, 1) IS NULL OR array_length(hr_array, 1) = 0 THEN
        RAISE NOTICE 'No heart rate records found for session %, skipping HR load calculation', session_uuid;
        RETURN 0;
    END IF;

    -- Count valid heart rate values
    record_count := (SELECT COUNT(*) FROM unnest(hr_array) AS hr WHERE hr IS NOT NULL AND hr > 0);

    IF record_count = 0 THEN
        RAISE NOTICE 'No valid heart rate values in array for session %, skipping HR load calculation', session_uuid;
        RETURN 0;
    END IF;

    -- Calculate average duration per record (total duration / number of records)
    avg_duration_per_record := session_duration / record_count;

    -- Loop through heart rate array and calculate weighted intensity
    FOREACH hr_value IN ARRAY hr_array
    LOOP
        -- Skip NULL or invalid values
        IF hr_value IS NULL OR hr_value <= 0 THEN
            CONTINUE;
        END IF;

        current_hr := hr_value;

        -- Calculate relative intensity = heart_rate / threshold_heart_rate
        relative_intensity := current_hr::FLOAT / threshold_hr::FLOAT;

        -- Calculate weighted intensity = relative_intensity^4
        weighted_intensity := POWER(relative_intensity, 4);

        -- Add to total HR load: (weighted_intensity * duration_per_record)
        total_hr_load := total_hr_load + (weighted_intensity * avg_duration_per_record);
    END LOOP;

    -- Final calculation: hr_load = (total_weighted_duration / 3600)^0.9 * 100
    total_hr_load := POWER(total_hr_load / 3600.0, 0.9) * 100.0;

    -- Update the session with the calculated HR load
    UPDATE sessions
    SET heart_rate_load = total_hr_load,
        updated_at = NOW()
    WHERE id = session_uuid;

    RAISE NOTICE 'HR Load calculated for session %: % (based on % records, threshold HR: % bpm)',
                 session_uuid, ROUND(total_hr_load::NUMERIC, 2), record_count, threshold_hr;

    RETURN total_hr_load;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate HR load for all sessions of a user
CREATE OR REPLACE FUNCTION calculate_user_hr_loads(user_uuid UUID)
RETURNS TABLE(session_id UUID, hr_load FLOAT) AS $$
DECLARE
    session_record RECORD;
    calculated_load FLOAT;
BEGIN
    FOR session_record IN 
        SELECT s.id
        FROM sessions s
        WHERE s.user_id = user_uuid
        ORDER BY s.start_time
    LOOP
        calculated_load := calculate_session_hr_load(session_record.id);
        session_id := session_record.id;
        hr_load := calculated_load;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to batch update HR loads for all sessions with heart rate data
CREATE OR REPLACE FUNCTION calculate_all_hr_loads()
RETURNS INTEGER AS $$
DECLARE
    session_record RECORD;
    calculated_load FLOAT;
    processed_count INTEGER := 0;
BEGIN
    FOR session_record IN
        SELECT DISTINCT s.id, s.start_time
        FROM sessions s
        INNER JOIN records r ON r.session_id = s.id
        WHERE r.heart_rate IS NOT NULL
        AND COALESCE(array_length(r.heart_rate, 1), 0) > 0
        AND (s.heart_rate_load IS NULL OR s.heart_rate_load = 0)
        ORDER BY s.start_time
    LOOP
        BEGIN
            calculated_load := calculate_session_hr_load(session_record.id);
            processed_count := processed_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error calculating HR load for session %: %', session_record.id, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE 'Processed % sessions for HR load calculation', processed_count;
    RETURN processed_count;
END;
$$ LANGUAGE plpgsql;

-- Index for records is now on session_id only (already created in main migration)
-- Array-based heart_rate doesn't need a separate index

-- Create an index for user_infos threshold_heart_rate lookup
CREATE INDEX IF NOT EXISTS idx_user_infos_user_threshold ON user_infos(user_id, threshold_heart_rate)
WHERE threshold_heart_rate IS NOT NULL;

COMMENT ON FUNCTION calculate_session_hr_load(UUID) IS
'Calculates heart rate load for a single session using the formula:
hr_load = (total_weighted_time / 3600)^0.9 * 100
where total_weighted_time = sum(weighted_intensity * duration_per_record)
and weighted_intensity = (heart_rate / threshold_heart_rate)^4';

COMMENT ON FUNCTION calculate_user_hr_loads(UUID) IS 
'Calculates heart rate load for all sessions of a specific user';

COMMENT ON FUNCTION calculate_all_hr_loads() IS 
'Batch calculates heart rate load for all sessions that have heart rate data but no HR load calculated yet';

-- Helper function to check which sessions have heart rate data
CREATE OR REPLACE FUNCTION check_sessions_with_hr_data()
RETURNS TABLE(
    session_id UUID,
    user_id UUID,
    sport VARCHAR,
    start_time TIMESTAMPTZ,
    hr_record_count BIGINT,
    current_hr_load FLOAT,
    session_duration FLOAT,
    threshold_hr INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        s.id,
        s.user_id,
        s.sport,
        s.start_time,
        (SELECT COUNT(*) FROM unnest(COALESCE(r.heart_rate, ARRAY[]::INT[])) AS hr WHERE hr IS NOT NULL AND hr > 0)::BIGINT as hr_record_count,
        s.heart_rate_load::FLOAT,
        s.total_timer_time,
        ua.threshold_heart_rate
    FROM sessions s
    INNER JOIN records r ON r.session_id = s.id
    LEFT JOIN user_infos ua ON ua.user_id = s.user_id
    WHERE r.heart_rate IS NOT NULL
    AND COALESCE(array_length(r.heart_rate, 1), 0) > 0
    ORDER BY s.start_time DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_sessions_with_hr_data() IS 
'Helper function to see which sessions have heart rate data and their current HR load status';

-- Verwendungsbeispiele:

-- Einzelne Session berechnen
-- SELECT calculate_session_hr_load('session-uuid-here');

-- Alle Sessions eines Users
-- SELECT * FROM calculate_user_hr_loads('user-uuid-here');

-- Alle Sessions mit HR-Daten batch-verarbeiten
-- SELECT calculate_all_hr_loads();

-- Verfügbare Sessions mit HR-Daten prüfen
-- SELECT * FROM check_sessions_with_hr_data();

-- Finde Sessions mit HR-Daten aber ohne HR-Load
-- SELECT session_id, user_id, sport, hr_record_count, current_hr_load, threshold_hr 
-- FROM check_sessions_with_hr_data() 
-- WHERE (current_hr_load IS NULL OR current_hr_load = 0) 
-- AND hr_record_count > 0;

