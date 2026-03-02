-- Simple workouts table to store workouts as text
CREATE TABLE IF NOT EXISTS workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sport VARCHAR(50) NOT NULL, -- e.g., 'running', 'cycling', 'swimming'
    sub_sport VARCHAR(50),
    workout_minutes INT NOT NULL,
    workout_text TEXT NOT NULL, -- The actual workout in text format

    --estimation fields for planning purposes
    estimated_time INT, -- Estimated time in minutes
    estimated_heart_rate_load FLOAT, -- Estimated heart rate load
    
    is_public BOOLEAN DEFAULT false,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled workouts table for scheduling text-based workouts
CREATE TABLE IF NOT EXISTS workouts_scheduled (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID REFERENCES workouts(id) ON DELETE RESTRICT,
    scheduled_time TIMESTAMP NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workouts_sport ON workouts(sport);
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_public ON workouts(is_public);

CREATE INDEX IF NOT EXISTS idx_workouts_scheduled_user ON workouts_scheduled(user_id);


-- Add RLS (Row Level Security) policies
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts_scheduled ENABLE ROW LEVEL SECURITY;

-- Policies for workouts table
CREATE POLICY "Users can view public workouts" ON workouts
    FOR SELECT USING (is_public = true OR user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create their own workouts" ON workouts
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own workouts" ON workouts
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete their own workouts" ON workouts
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Policies for workouts_scheduled table
CREATE POLICY "Users can manage their own planned workouts" ON workouts_scheduled
    FOR ALL USING (user_id = (SELECT auth.uid()));

-- Function to update the updated_at column automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_workouts_updated_at 
    BEFORE UPDATE ON workouts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workouts_scheduled_updated_at 
    BEFORE UPDATE ON workouts_scheduled 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

