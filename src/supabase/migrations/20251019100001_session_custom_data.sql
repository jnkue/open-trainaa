BEGIN;

------------------------------------------------------------------------------------------------------
-- Session Custom Data
------------------------------------------------------------------------------------------------------
-- This table stores custom/user-generated data separate from raw session data.
-- Multiple sessions (e.g., duplicates from Wahoo and Strava) can share the same custom data record.
-- This prevents data duplication and ensures custom data persists even if individual sessions are deleted.

CREATE TABLE IF NOT EXISTS session_custom_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Heart rate load (calculated metric, moved from sessions table)
    heart_rate_load FLOAT DEFAULT 0,

    -- LLM-generated feedback about session quality, issues, etc. (moved from sessions table)
    llm_feedback TEXT,

    -- User feedback fields (moved from user_session_feedback table)
    feeling VARCHAR(20) CHECK (feeling IN ('great', 'good', 'okay', 'tired', 'exhausted')),
    feedback_text TEXT,

    -- Metadata for future extensions
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_session_custom_data_user_id ON session_custom_data(user_id);
CREATE INDEX IF NOT EXISTS idx_session_custom_data_feeling ON session_custom_data(feeling);
CREATE INDEX IF NOT EXISTS idx_session_custom_data_created_at ON session_custom_data(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE session_custom_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - users can only access their own custom data
CREATE POLICY "Users can view own session custom data" ON session_custom_data
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own session custom data" ON session_custom_data
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own session custom data" ON session_custom_data
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own session custom data" ON session_custom_data
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Create trigger for updated_at timestamp
CREATE TRIGGER update_session_custom_data_timestamp
    BEFORE UPDATE ON session_custom_data
    FOR EACH ROW EXECUTE FUNCTION update_provider_connection_timestamp();

-- Grant permissions to service role
CREATE POLICY "grant service_role" ON session_custom_data AS PERMISSIVE FOR ALL TO service_role;

------------------------------------------------------------------------------------------------------
-- Modify sessions table to reference session_custom_data
------------------------------------------------------------------------------------------------------

-- Add foreign key to session_custom_data (nullable to support gradual migration)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_custom_data_id UUID REFERENCES session_custom_data(id) ON DELETE SET NULL;

-- Create index for the new foreign key
CREATE INDEX IF NOT EXISTS idx_sessions_custom_data_id ON sessions(session_custom_data_id);

-- Remove columns that are now in session_custom_data (if they exist)
-- Note: We use IF EXISTS to make this migration idempotent
ALTER TABLE sessions DROP COLUMN IF EXISTS heart_rate_load;
ALTER TABLE sessions DROP COLUMN IF EXISTS llm_feedback;

------------------------------------------------------------------------------------------------------
-- Drop user_session_feedback table
------------------------------------------------------------------------------------------------------
-- Data has been consolidated into session_custom_data table

DROP TABLE IF EXISTS user_session_feedback CASCADE;

------------------------------------------------------------------------------------------------------
-- Update HR Load calculation function to use session_custom_data
------------------------------------------------------------------------------------------------------

-- Drop and recreate the function to update the new table structure
DROP FUNCTION IF EXISTS calculate_session_hr_load(UUID);

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
    custom_data_id UUID;
BEGIN
    -- Get user_id and session_custom_data_id from session
    SELECT s.user_id, s.session_custom_data_id INTO user_uuid, custom_data_id
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

    -- Update the session_custom_data with the calculated HR load
    IF custom_data_id IS NOT NULL THEN
        UPDATE session_custom_data
        SET heart_rate_load = total_hr_load,
            updated_at = NOW()
        WHERE id = custom_data_id;
    ELSE
        RAISE NOTICE 'No session_custom_data_id found for session %, cannot save HR load', session_uuid;
    END IF;

    RAISE NOTICE 'HR Load calculated for session %: % (based on % records, threshold HR: % bpm)',
                 session_uuid, ROUND(total_hr_load::NUMERIC, 2), record_count, threshold_hr;

    RETURN total_hr_load;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_session_hr_load(UUID) IS
'Calculates heart rate load for a single session and stores it in session_custom_data table using the formula:
hr_load = (total_weighted_time / 3600)^0.9 * 100
where total_weighted_time = sum(weighted_intensity * duration_per_record)
and weighted_intensity = (heart_rate / threshold_heart_rate)^4';

-- Update the check function to use session_custom_data
DROP FUNCTION IF EXISTS check_sessions_with_hr_data();

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
        scd.heart_rate_load::FLOAT,
        s.total_timer_time,
        ua.threshold_heart_rate
    FROM sessions s
    INNER JOIN records r ON r.session_id = s.id
    LEFT JOIN session_custom_data scd ON scd.id = s.session_custom_data_id
    LEFT JOIN user_infos ua ON ua.user_id = s.user_id
    WHERE r.heart_rate IS NOT NULL
    AND COALESCE(array_length(r.heart_rate, 1), 0) > 0
    ORDER BY s.start_time DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_sessions_with_hr_data() IS
'Helper function to see which sessions have heart rate data and their current HR load status from session_custom_data';

-- Update calculate_all_hr_loads to check session_custom_data
DROP FUNCTION IF EXISTS calculate_all_hr_loads();

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
        LEFT JOIN session_custom_data scd ON scd.id = s.session_custom_data_id
        WHERE r.heart_rate IS NOT NULL
        AND COALESCE(array_length(r.heart_rate, 1), 0) > 0
        AND (scd.heart_rate_load IS NULL OR scd.heart_rate_load = 0)
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

COMMENT ON FUNCTION calculate_all_hr_loads() IS
'Batch calculates heart rate load for all sessions that have heart rate data but no HR load calculated yet in session_custom_data';

COMMIT;
