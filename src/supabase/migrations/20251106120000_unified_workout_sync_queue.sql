-- Unified workout sync queue for all providers (Wahoo, Garmin, etc.)
-- This migration consolidates wahoo_sync_queue and garmin_sync_queue into a single table

-- Drop old provider-specific tables
DROP TABLE IF EXISTS wahoo_sync_queue CASCADE;
DROP TABLE IF EXISTS garmin_sync_queue CASCADE;

-- Create unified workout_sync_queue table
CREATE TABLE IF NOT EXISTS workout_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('workout', 'workout_scheduled')),
    entity_id UUID NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('wahoo', 'garmin', 'trainingpeaks')),

    -- Retry and error tracking
    retry_count INT DEFAULT 0 NOT NULL,
    max_retries INT DEFAULT 3 NOT NULL,
    next_retry_at TIMESTAMPTZ,
    error_type VARCHAR(50),
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMPTZ
);

-- Partial unique index to prevent duplicate pending operations for the same entity and provider
-- This only enforces uniqueness when processed_at IS NULL (pending operations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_sync_queue_unique_pending
    ON workout_sync_queue(entity_type, entity_id, provider, operation)
    WHERE processed_at IS NULL;

-- Index for efficient queue processing (pending entries ready for retry)
CREATE INDEX IF NOT EXISTS idx_workout_sync_queue_pending
    ON workout_sync_queue(user_id, created_at)
    WHERE processed_at IS NULL;

-- Index for finding entries ready for retry
CREATE INDEX IF NOT EXISTS idx_workout_sync_queue_retry
    ON workout_sync_queue(next_retry_at)
    WHERE processed_at IS NULL AND next_retry_at IS NOT NULL;

-- Index for looking up sync operations by entity
CREATE INDEX IF NOT EXISTS idx_workout_sync_queue_entity
    ON workout_sync_queue(entity_type, entity_id, provider);

-- Index for processed entries (for analytics/cleanup)
CREATE INDEX IF NOT EXISTS idx_workout_sync_queue_processed
    ON workout_sync_queue(processed_at)
    WHERE processed_at IS NOT NULL;

-- Index for error tracking and monitoring
CREATE INDEX IF NOT EXISTS idx_workout_sync_queue_errors
    ON workout_sync_queue(error_type, retry_count)
    WHERE processed_at IS NULL AND error_type IS NOT NULL;

-- Enable RLS
ALTER TABLE workout_sync_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can only view their own sync queue"
    ON workout_sync_queue FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can only insert to their own sync queue"
    ON workout_sync_queue FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can only update their own sync queue"
    ON workout_sync_queue FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_sync_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_sync_queue TO service_role;

-- Comments for documentation
COMMENT ON TABLE workout_sync_queue IS 'Unified queue for batch processing workout sync operations across all providers';
COMMENT ON COLUMN workout_sync_queue.entity_type IS 'Type of entity: workout (template) or workout_scheduled (scheduled workout)';
COMMENT ON COLUMN workout_sync_queue.operation IS 'Operation to perform: create, update, or delete';
COMMENT ON COLUMN workout_sync_queue.provider IS 'Provider name: wahoo, garmin, trainingpeaks, etc.';
COMMENT ON COLUMN workout_sync_queue.processed_at IS 'NULL if pending, timestamp when processed';
COMMENT ON COLUMN workout_sync_queue.retry_count IS 'Number of times this operation has been retried';
COMMENT ON COLUMN workout_sync_queue.next_retry_at IS 'When to retry this operation (NULL = retry immediately, used for exponential backoff)';
COMMENT ON COLUMN workout_sync_queue.error_type IS 'Classification of error: rate_limit, auth_error, provider_error, etc.';
COMMENT ON COLUMN workout_sync_queue.error_message IS 'Detailed error message for debugging';
