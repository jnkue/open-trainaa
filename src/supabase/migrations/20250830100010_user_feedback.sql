BEGIN;

------------------------------------------------------------------------------------------------------
-- User Feedback for Sessions
------------------------------------------------------------------------------------------------------
-- This table stores user feedback for sessions including feeling ratings and text notes

CREATE TABLE IF NOT EXISTS user_session_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

    -- Feeling rating (one of: great, good, okay, tired, exhausted)
    feeling VARCHAR(20) CHECK (feeling IN ('great', 'good', 'okay', 'tired', 'exhausted')),

    -- Optional text feedback from user
    feedback_text TEXT,

    -- Metadata for future extensions
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure one feedback per user per session
    CONSTRAINT unique_user_session_feedback UNIQUE (user_id, session_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_session_feedback_user_id ON user_session_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_session_feedback_session_id ON user_session_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_user_session_feedback_feeling ON user_session_feedback(feeling);
CREATE INDEX IF NOT EXISTS idx_user_session_feedback_created_at ON user_session_feedback(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE user_session_feedback ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - users can only access their own feedback
CREATE POLICY "Users can view own session feedback" ON user_session_feedback
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own session feedback" ON user_session_feedback
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own session feedback" ON user_session_feedback
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own session feedback" ON user_session_feedback
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Create trigger for updated_at timestamp
CREATE TRIGGER update_user_session_feedback_timestamp
    BEFORE UPDATE ON user_session_feedback
    FOR EACH ROW EXECUTE FUNCTION update_provider_connection_timestamp();



COMMIT;