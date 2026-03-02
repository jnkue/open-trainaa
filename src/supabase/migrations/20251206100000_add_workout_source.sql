-- Add source field to track workout origin (chat-generated vs user-created)
ALTER TABLE workouts
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'chat'
CHECK (source IN ('chat', 'user'));

-- Add comment for documentation
COMMENT ON COLUMN workouts.source IS 'Origin of workout: chat (AI-generated) or user (manually created)';

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_workouts_source ON workouts(source);
