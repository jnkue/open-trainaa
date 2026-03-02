-- Add Wahoo sync fields to workouts table
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS wahoo_plan_id TEXT,
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'disabled')),
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Add Wahoo sync fields to workouts_scheduled table
ALTER TABLE workouts_scheduled
    ADD COLUMN IF NOT EXISTS wahoo_workout_id TEXT,
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'disabled')),
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workouts_wahoo_plan_id ON workouts(wahoo_plan_id) WHERE wahoo_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workouts_sync_status ON workouts(sync_status);
CREATE INDEX IF NOT EXISTS idx_workouts_scheduled_wahoo_workout_id ON workouts_scheduled(wahoo_workout_id) WHERE wahoo_workout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workouts_scheduled_sync_status ON workouts_scheduled(sync_status);

-- Add comments for documentation
COMMENT ON COLUMN workouts.wahoo_plan_id IS 'Wahoo Cloud API plan ID returned from POST /v1/plans';
COMMENT ON COLUMN workouts.sync_status IS 'Sync status: pending (not synced), synced (successfully synced), failed (sync error), disabled (user disabled Wahoo sync)';
COMMENT ON COLUMN workouts.last_synced_at IS 'Timestamp of last successful sync to Wahoo';
COMMENT ON COLUMN workouts.sync_error IS 'Error message if sync failed';

COMMENT ON COLUMN workouts_scheduled.wahoo_workout_id IS 'Wahoo Cloud API workout ID returned from POST /v1/workouts';
COMMENT ON COLUMN workouts_scheduled.sync_status IS 'Sync status: pending (not synced), synced (successfully synced), failed (sync error), disabled (user disabled Wahoo sync)';
COMMENT ON COLUMN workouts_scheduled.last_synced_at IS 'Timestamp of last successful sync to Wahoo';
COMMENT ON COLUMN workouts_scheduled.sync_error IS 'Error message if sync failed';
