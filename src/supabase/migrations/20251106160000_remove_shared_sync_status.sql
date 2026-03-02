-- Remove ambiguous shared sync status fields
-- These fields created impossible states when multiple providers (Wahoo, Garmin, etc.)
-- had different sync outcomes. The workout_sync_queue table is now the single source
-- of truth for per-provider sync status.

-- Drop columns from workouts table
ALTER TABLE workouts
DROP COLUMN IF EXISTS sync_status,
DROP COLUMN IF EXISTS sync_error,
DROP COLUMN IF EXISTS last_synced_at;

-- Drop columns from workouts_scheduled table
ALTER TABLE workouts_scheduled
DROP COLUMN IF EXISTS sync_status,
DROP COLUMN IF EXISTS sync_error,
DROP COLUMN IF EXISTS last_synced_at;
