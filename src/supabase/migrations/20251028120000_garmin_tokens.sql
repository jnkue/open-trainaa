-- Create table for Garmin Connect tokens
CREATE TABLE IF NOT EXISTS garmin_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    athlete_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    athlete_data JSONB DEFAULT '{}',

    -- Garmin-specific settings
    upload_workouts_enabled BOOLEAN DEFAULT false NOT NULL,
    download_activities_enabled BOOLEAN DEFAULT true NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- A user can only have one Garmin account
    UNIQUE(user_id),
    UNIQUE(athlete_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON garmin_tokens TO authenticated;

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_garmin_tokens_user_id ON garmin_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_tokens_athlete_id ON garmin_tokens(athlete_id);

-- Enable RLS (Row Level Security)
ALTER TABLE garmin_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can only view their own Garmin tokens"
    ON garmin_tokens FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can only create their own Garmin tokens"
    ON garmin_tokens FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can only update their own Garmin tokens"
    ON garmin_tokens FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can only delete their own Garmin tokens"
    ON garmin_tokens FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_garmin_tokens_updated_at
    BEFORE UPDATE ON garmin_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add Garmin to fitness_providers table
INSERT INTO fitness_providers (name, display_name, auth_url, token_url, api_base_url, supports_activities, supports_wellness, supports_gps, enabled)
VALUES
    ('garmin', 'Garmin Connect', 'https://connect.garmin.com/oauth2Confirm', 'https://diauth.garmin.com/di-oauth2-service/oauth/token', 'https://apis.garmin.com', true, true, true, true)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    auth_url = EXCLUDED.auth_url,
    token_url = EXCLUDED.token_url,
    api_base_url = EXCLUDED.api_base_url,
    supports_activities = EXCLUDED.supports_activities,
    supports_wellness = EXCLUDED.supports_wellness,
    supports_gps = EXCLUDED.supports_gps,
    enabled = EXCLUDED.enabled;
