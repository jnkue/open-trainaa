-- Add Garmin workout ID fields to workouts table
-- Note: sync_status, last_synced_at, and sync_error columns already exist (shared with Wahoo)
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS garmin_workout_id BIGINT;

-- Add Garmin workout ID field to workouts_scheduled table
ALTER TABLE workouts_scheduled
    ADD COLUMN IF NOT EXISTS garmin_workout_id BIGINT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workouts_garmin_workout_id ON workouts(garmin_workout_id) WHERE garmin_workout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workouts_scheduled_garmin_workout_id ON workouts_scheduled(garmin_workout_id) WHERE garmin_workout_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN workouts.garmin_workout_id IS 'Garmin Training API V2 workout ID returned from POST /training-api/workout';
COMMENT ON COLUMN workouts_scheduled.garmin_workout_id IS 'Garmin Training API V2 workout ID for scheduled workout (synced to Garmin calendar)';
