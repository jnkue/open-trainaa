BEGIN;

-- Create table for storing Wahoo API responses (similar to strava_responses)
CREATE TABLE IF NOT EXISTS wahoo_responses (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    response_type VARCHAR(50) NOT NULL, -- e.g., 'webhook', 'workout', 'workout_summary'
    wahoo_id BIGINT, -- Wahoo's workout/workout_summary ID
    response_json JSONB NOT NULL, -- Full JSON response for reference
    last_processed TIMESTAMP WITH TIME ZONE, -- Updated when processed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_wahoo_responses_user_id ON wahoo_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_wahoo_responses_wahoo_id ON wahoo_responses(wahoo_id);
CREATE INDEX IF NOT EXISTS idx_wahoo_responses_response_type ON wahoo_responses(response_type);
CREATE INDEX IF NOT EXISTS idx_wahoo_responses_created_at ON wahoo_responses(created_at);

-- Enable Row Level Security
ALTER TABLE wahoo_responses ENABLE ROW LEVEL SECURITY;

-- Grant service_role full access
CREATE POLICY "grant service_role" ON wahoo_responses AS PERMISSIVE FOR ALL TO service_role;

-- Allow users to view their own responses
CREATE POLICY "Users can view own wahoo responses" ON wahoo_responses
    FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Allow users to insert their own responses
CREATE POLICY "Users can insert own wahoo responses" ON wahoo_responses
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Allow users to update their own responses
CREATE POLICY "Users can update own wahoo responses" ON wahoo_responses
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Allow users to delete their own responses
CREATE POLICY "Users can delete own wahoo responses" ON wahoo_responses
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_wahoo_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER wahoo_responses_updated_at
    BEFORE UPDATE ON wahoo_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_wahoo_responses_updated_at();

COMMIT;
