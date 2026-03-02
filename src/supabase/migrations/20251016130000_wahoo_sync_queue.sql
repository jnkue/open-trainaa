-- Create wahoo_sync_queue table for batch sync operations
CREATE TABLE IF NOT EXISTS wahoo_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('workout', 'workout_scheduled')),
    entity_id UUID NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT DEFAULT 0
);

-- Partial unique index to prevent duplicate pending operations for the same entity
-- This only enforces uniqueness when processed_at IS NULL (pending operations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_unique_pending
    ON wahoo_sync_queue(entity_type, entity_id, operation)
    WHERE processed_at IS NULL;

-- Indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
    ON wahoo_sync_queue(user_id, created_at)
    WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sync_queue_entity
    ON wahoo_sync_queue(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_sync_queue_processed
    ON wahoo_sync_queue(processed_at)
    WHERE processed_at IS NOT NULL;

-- Add sync_on_delete flag to track if deletion should sync to Wahoo
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS sync_on_delete BOOLEAN DEFAULT true;

ALTER TABLE workouts_scheduled
    ADD COLUMN IF NOT EXISTS sync_on_delete BOOLEAN DEFAULT true;

-- Enable RLS
ALTER TABLE wahoo_sync_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can only view their own sync queue"
    ON wahoo_sync_queue FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can only insert to their own sync queue"
    ON wahoo_sync_queue FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can only update their own sync queue"
    ON wahoo_sync_queue FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON wahoo_sync_queue TO authenticated;

-- Comments for documentation
COMMENT ON TABLE wahoo_sync_queue IS 'Queue for batch processing Wahoo workout sync operations';
COMMENT ON COLUMN wahoo_sync_queue.entity_type IS 'Type of entity: workout (plan) or workout_scheduled (scheduled workout)';
COMMENT ON COLUMN wahoo_sync_queue.operation IS 'Operation to perform: create, update, or delete';
COMMENT ON COLUMN wahoo_sync_queue.processed_at IS 'NULL if pending, timestamp when processed';
COMMENT ON COLUMN wahoo_sync_queue.retry_count IS 'Number of times this operation has been retried';
