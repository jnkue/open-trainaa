BEGIN;



------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------
--Source of for activity data: Strava and FIT files
------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------

-- Create table for storing Strava API responses
CREATE TABLE strava_responses (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    response_type VARCHAR(50) NOT NULL, -- e.g., 'activity', 'streams'
    strava_id BIGINT    , -- Strava's activity ID
    response_json JSONB NOT NULL, -- Full JSON response for reference
    last_processed TIMESTAMP WITH TIME ZONE, -- Updated when processed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for Strava activity lookups (used in duplicate detection)
CREATE INDEX idx_strava_responses_user_id ON strava_responses(user_id);
CREATE INDEX idx_strava_responses_strava_id ON strava_responses(strava_id);

-- Create table for storing FIT file metadata
CREATE TABLE fit_files (
    file_id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_path VARCHAR(255) NOT NULL, -- to the supabase bucket
    original_filename VARCHAR(255) NOT NULL,
    file_size_bytes INT NOT NULL DEFAULT 0,
    file_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash for duplicate detection
    metadata JSONB, -- File header info, device info, etc.
    last_processed TIMESTAMP WITH TIME ZONE, -- Updated when processed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for FIT file lookups
CREATE INDEX idx_fit_files_user_id ON fit_files(user_id);
CREATE INDEX idx_fit_files_file_hash ON fit_files(file_hash);

ALTER TABLE fit_files ENABLE ROW LEVEL SECURITY;
create policy "grant service_role" on fit_files as PERMISSIVE for ALL to service_role;

CREATE POLICY "Users can view own fit files" ON fit_files
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own fit files" ON fit_files
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own fit files" ON fit_files
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own fit files" ON fit_files
    FOR SELECT USING (user_id = (SELECT auth.uid()));



-- Create storage bucket for FIT files
INSERT INTO storage.buckets (id, name, public)
VALUES ('fit-files', 'fit-files', false);


-- Create function for updating timestamps
CREATE OR REPLACE FUNCTION update_provider_connection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------
--Multi-provider part
------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------


-- Enable PostGIS extension for location data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 1: Create new multi-provider tables if they don't exist
CREATE TABLE IF NOT EXISTS fitness_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    auth_url TEXT NOT NULL,
    token_url TEXT NOT NULL,
    api_base_url TEXT NOT NULL,
    supports_activities BOOLEAN DEFAULT true,
    supports_wellness BOOLEAN DEFAULT false,
    supports_gps BOOLEAN DEFAULT true,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_provider_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES fitness_providers(id) ON DELETE CASCADE,
    provider_user_id VARCHAR(100) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, provider_id)
);





------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------
-- activity, sessions, laps, records tables
------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    num_sessions INT NOT NULL DEFAULT 1 CHECK (num_sessions >= 1), -- Number of sessions
    fit_file_id INT REFERENCES fit_files(file_id) ON DELETE CASCADE,
    strava_response_id INT REFERENCES strava_responses(id) ON DELETE CASCADE,
    strava_activity_id BIGINT, -- Strava's activity ID (BIGINT to handle IDs > 2 billion)
    total_distance FLOAT, -- Optional: Derived sum for queries (can be computed via views)
    total_elapsed_time FLOAT, -- Derived sum in seconds with decimal precision (can be computed via views)
    duplicate_of UUID REFERENCES activities(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- every activity needs to have either a strava response id or fit file id
    upload_source VARCHAR(50) REFERENCES fitness_providers(name),
    CONSTRAINT chk_fit_or_strava CHECK (
        (fit_file_id IS NOT NULL AND strava_response_id IS NULL) OR 
        (fit_file_id IS NULL AND strava_response_id IS NOT NULL)
    )
);

-- Sessions table (for multisport activities and FIT files)
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    session_number INT NOT NULL DEFAULT 0 CHECK (session_number >= 0), -- Index (0-based for consistency)
    title varchar(300) NOT NULL, --  title/name of the session
    sport VARCHAR(50) NOT NULL, -- e.g., 'running', 'cycling', 'swimming', 'transition' (from .FIT 'sport' or Strava 'sport_type')
    sub_sport VARCHAR(50), -- Optional refinement (e.g., 'mountain_biking')
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    total_distance FLOAT CHECK (total_distance >= 0), -- in meters
    total_elapsed_time FLOAT CHECK (total_elapsed_time >= 0), -- in seconds with decimal precision (includes pauses)
    total_timer_time FLOAT CHECK (total_timer_time >= 0), -- in seconds with decimal precision (moving time)
    total_calories INT CHECK (total_calories >= 0),
    avg_heart_rate INT CHECK (avg_heart_rate >= 0), -- in bpm
    max_heart_rate INT CHECK (max_heart_rate >= 0), -- in bpm
    avg_speed FLOAT CHECK (avg_speed >= 0), -- in meters/second
    max_speed FLOAT CHECK (max_speed >= 0), -- in meters/second
    avg_cadence INT CHECK (avg_cadence >= 0), -- in rpm/spm
    max_watts_5_min INT,
    max_watts_20_min INT,
    max_watts_60_min INT,
    total_elevation_gain FLOAT CHECK (total_elevation_gain >= 0), -- in meters

    -- calculated fields for easier querying
    heart_rate_load FLOAT DEFAULT 0,

    -- LLM feedback
    llm_feedback TEXT, -- feedback from LLM about session quality, issues, etc.

    --timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),


    CONSTRAINT unique_session UNIQUE (id, session_number)
);
-- alter table public.sessions add column title varchar(300) NOT NULL;

CREATE TABLE laps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    lap_number INT NOT NULL DEFAULT 0 CHECK (lap_number >= 0), -- Index within session
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    total_distance FLOAT CHECK (total_distance >= 0), -- in meters
    total_elapsed_time FLOAT CHECK (total_elapsed_time >= 0), -- in seconds with decimal precision
    total_timer_time FLOAT CHECK (total_timer_time >= 0), -- in seconds with decimal precision
    avg_heart_rate INT CHECK (avg_heart_rate >= 0), -- in bpm
    max_heart_rate INT CHECK (max_heart_rate >= 0), -- in bpm
    avg_speed FLOAT CHECK (avg_speed >= 0), -- in meters/second
    max_speed FLOAT CHECK (max_speed >= 0), -- in meters/second
    total_calories INT CHECK (total_calories >= 0),
    avg_cadence INT CHECK (avg_cadence >= 0), -- in rpm/spm
    total_elevation_gain FLOAT CHECK (total_elevation_gain >= 0), -- in meters
    CONSTRAINT unique_lap UNIQUE (session_id, lap_number)
    
);

CREATE TABLE records (
    id SERIAL PRIMARY KEY,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    -- Array-based data storage: one row per session instead of one row per data point
    timestamp INT[], -- seconds from session start_time
    latitude FLOAT[], -- in degrees (from .FIT semicircles or Strava latlng)
    longitude FLOAT[], -- in degrees
    altitude FLOAT[], -- in meters
    heart_rate INT[], -- in bpm
    cadence INT[], -- in rpm/spm
    speed FLOAT[], -- in meters/second
    distance FLOAT[], -- cumulative in meters
    power INT[], -- in watts
    temperature INT[], -- in Celsius
    position GEOGRAPHY(POINT, 4326)[], -- For geospatial queries (SRID 4326)
    CONSTRAINT unique_record_per_session UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_laps_session_id ON laps(session_id);
CREATE INDEX IF NOT EXISTS idx_records_id ON records(id);
CREATE INDEX IF NOT EXISTS idx_records_session_id ON records(session_id);
-- Removed timestamp index since timestamp is now an array
-- Removed position GIST index since position is now an array


-- Create indexes on user_provider_connections
CREATE INDEX IF NOT EXISTS idx_user_provider_connections_user_id ON user_provider_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_connections_provider_id ON user_provider_connections(provider_id);

-- Step 5: Insert default fitness providers
INSERT INTO fitness_providers (name, display_name, auth_url, token_url, api_base_url, supports_activities, supports_wellness, supports_gps, enabled)
VALUES 
    ('strava', 'Strava', 'https://www.strava.com/oauth/authorize', 'https://www.strava.com/oauth/token', 'https://www.strava.com/api/v3', true, false, true, true),
    ('garmin', 'Garmin Connect', 'https://connect.garmin.com/oauth/authorize', 'https://connect.garmin.com/oauth/token', 'https://connect.garmin.com/api', true, true, true, false),
    ('polar', 'Polar Flow', 'https://flow.polar.com/oauth/authorize', 'https://flow.polar.com/oauth/token', 'https://flow.polar.com/api', true, true, true, false),
    ('manual', 'Manual Entry', '', '', '', true, false, false, true)
ON CONFLICT (name) DO NOTHING;

-- Step 2: Migrate existing Strava connections
DO $$
DECLARE
    strava_provider_id UUID;
    migrated_count INTEGER := 0;
BEGIN
    -- Get Strava provider ID
    SELECT id INTO strava_provider_id 
    FROM fitness_providers 
    WHERE name = 'strava';
    
    -- Migrate existing strava_tokens to user_provider_connections
    INSERT INTO user_provider_connections (
        user_id,
        provider_id,
        provider_user_id,
        access_token,
        refresh_token,
        token_expires_at,
        scope,
        connected_at,
        last_sync_at,
        is_active
    )
    SELECT 
        user_id,
        strava_provider_id,
        athlete_id::TEXT,
        access_token,
        refresh_token,
        expires_at,
        scope,
        created_at,
        updated_at,
        true
    FROM strava_tokens
    WHERE strava_provider_id IS NOT NULL
    ON CONFLICT (user_id, provider_id) DO UPDATE SET
        provider_user_id = EXCLUDED.provider_user_id,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        scope = EXCLUDED.scope,
        last_sync_at = EXCLUDED.last_sync_at;
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % Strava token records', migrated_count;
END $$;

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_user_provider_connections_timestamp
    BEFORE UPDATE ON user_provider_connections
    FOR EACH ROW EXECUTE FUNCTION update_provider_connection_timestamp();

CREATE TRIGGER update_activities_timestamp
    BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION update_provider_connection_timestamp();

CREATE TRIGGER update_sessions_timestamp
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_provider_connection_timestamp();

CREATE TRIGGER update_laps_timestamp
    BEFORE UPDATE ON laps
    FOR EACH ROW EXECUTE FUNCTION update_provider_connection_timestamp();

-- Records table doesn't need update timestamp trigger since it's written once per session


-- Step 6: Create RLS (Row Level Security) policies

-- Enable RLS on all tables
ALTER TABLE fitness_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE laps ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

-- Fitness providers are visible to all authenticated users
CREATE POLICY "Fitness providers are public" ON fitness_providers
    FOR SELECT TO authenticated USING (enabled = true);

-- Users can only access their own provider connections
CREATE POLICY "Users can view own connections" ON user_provider_connections
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own connections" ON user_provider_connections
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own connections" ON user_provider_connections
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own connections" ON user_provider_connections
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Users can only access their own activities
CREATE POLICY "Users can view own activities" ON activities
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own activities" ON activities
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own activities" ON activities
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own activities" ON activities
    FOR DELETE USING (user_id = (SELECT auth.uid()));



-- Users can only access their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own sessions" ON sessions
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own sessions" ON sessions
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own sessions" ON sessions
    FOR SELECT USING (user_id = (SELECT auth.uid()));



--------------------------------------
-- laps
-- Users can only access their own laps
CREATE POLICY "Users can view own laps" ON laps
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sessions s
            JOIN activities a ON s.id = a.id
            WHERE s.id = laps.session_id
            AND a.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can insert own laps" ON laps
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sessions s
            JOIN activities a ON s.id = a.id
            WHERE s.id = laps.session_id
            AND a.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can update own laps" ON laps
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sessions s
            JOIN activities a ON s.id = a.id
            WHERE s.id = laps.session_id
            AND a.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can delete own laps" ON laps
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sessions s
            JOIN activities a ON s.id = a.id
            WHERE s.id = laps.session_id
            AND a.user_id = (SELECT auth.uid())
        )
    );

-- Users can only access their own records
CREATE POLICY "Users can view own records" ON records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM activities a
            WHERE a.id = records.activity_id
            AND a.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can insert own records" ON records
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM activities a
            WHERE a.id = records.activity_id
            AND a.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can update own records" ON records
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM activities a
            WHERE a.id = records.activity_id
            AND a.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can delete own records" ON records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM activities a
            WHERE a.id = records.activity_id
            AND a.user_id = (SELECT auth.uid())
        )
    );



COMMIT;