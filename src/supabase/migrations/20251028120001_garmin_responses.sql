BEGIN;

-- Create table for storing Garmin API responses (similar to strava_responses and wahoo_responses)
CREATE TABLE IF NOT EXISTS garmin_responses (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    response_type VARCHAR(50) NOT NULL, -- e.g., 'webhook', 'activity', 'workout'
    garmin_id BIGINT, -- Garmin's activity/workout ID
    response_json JSONB NOT NULL, -- Full JSON response for reference
    last_processed TIMESTAMP WITH TIME ZONE, -- Updated when processed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_garmin_responses_user_id ON garmin_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_responses_garmin_id ON garmin_responses(garmin_id);
CREATE INDEX IF NOT EXISTS idx_garmin_responses_response_type ON garmin_responses(response_type);
CREATE INDEX IF NOT EXISTS idx_garmin_responses_created_at ON garmin_responses(created_at);

-- Enable Row Level Security
ALTER TABLE garmin_responses ENABLE ROW LEVEL SECURITY;

-- Grant service_role full access
CREATE POLICY "grant service_role" ON garmin_responses AS PERMISSIVE FOR ALL TO service_role;

-- Allow users to view their own responses
CREATE POLICY "Users can view own garmin responses" ON garmin_responses
    FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Allow users to insert their own responses
CREATE POLICY "Users can insert own garmin responses" ON garmin_responses
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Allow users to update their own responses
CREATE POLICY "Users can update own garmin responses" ON garmin_responses
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Allow users to delete their own responses
CREATE POLICY "Users can delete own garmin responses" ON garmin_responses
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_garmin_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER garmin_responses_updated_at
    BEFORE UPDATE ON garmin_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_garmin_responses_updated_at();

COMMIT;
