BEGIN;

------------------------------------------------------------------------------------------------------
-- General User Feedback
------------------------------------------------------------------------------------------------------
-- This table stores general user feedback including feature requests, bug reports, and other feedback

CREATE TABLE IF NOT EXISTS user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Type of feedback: feature_request, bug_report, general_feedback
    type VARCHAR(50) NOT NULL CHECK (type IN ('feature_request', 'bug_report', 'general_feedback')),

    -- Feedback text content
    text TEXT NOT NULL,

    -- Status: open, in_progress, resolved, closed
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

    -- Additional metadata (device info, app version, etc.)
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(type);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - users can only access their own feedback
CREATE POLICY "Users can view own feedback" ON user_feedback
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own feedback" ON user_feedback
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own feedback" ON user_feedback
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own feedback" ON user_feedback
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_feedback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_feedback_timestamp
    BEFORE UPDATE ON user_feedback
    FOR EACH ROW EXECUTE FUNCTION update_user_feedback_timestamp();

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON user_feedback TO authenticated;

COMMIT;