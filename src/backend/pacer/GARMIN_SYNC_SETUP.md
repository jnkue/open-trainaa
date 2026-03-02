# Garmin Workout Sync - Database Setup

## Overview

This document describes the database migrations required for Garmin workout sync functionality.

## Migrations

### 1. `20251029100000_garmin_workout_sync.sql`

Adds Garmin workout ID tracking to workout tables:

```sql
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS garmin_workout_id BIGINT;

ALTER TABLE workouts_scheduled
    ADD COLUMN IF NOT EXISTS garmin_workout_id BIGINT;
```

**Note**: This migration only adds `garmin_workout_id` columns. The sync status tracking columns (`sync_status`, `last_synced_at`, `sync_error`) are shared with Wahoo sync and were created by the Wahoo migration (`20251016120000_wahoo_workout_sync.sql`).

### 2. `20251029100001_garmin_sync_queue.sql`

Creates the `garmin_sync_queue` table for batch processing of sync operations:

```sql
CREATE TABLE garmin_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('workout', 'workout_scheduled')),
    entity_id UUID NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT DEFAULT 0
);
```

This follows the same pattern as the Wahoo sync queue.

## Shared Sync Status Design

### Architecture Decision

Both Wahoo and Garmin sync use **shared status columns**:
- `sync_status` - Current sync state (pending, synced, failed, disabled)
- `last_synced_at` - Timestamp of last successful sync
- `sync_error` - Error message if sync failed

While each service has its own ID column:
- `wahoo_plan_id` - Wahoo Cloud API plan ID
- `garmin_workout_id` - Garmin Training API workout ID

### Rationale

1. **Simplified Schema**: Avoids column proliferation (wahoo_sync_status, garmin_sync_status, etc.)
2. **Service Detection**: The presence of `wahoo_plan_id` or `garmin_workout_id` indicates which services a workout is synced to
3. **Most Recent Status**: The shared status columns reflect the most recent sync operation across all services
4. **Queue-Based Processing**: Both services use background queues, so all syncs will eventually complete

### Implications

- The `sync_status` field shows the most recent sync operation status (could be Wahoo or Garmin)
- To check if a workout is synced to a specific service, check for the presence of that service's ID field
- Both services will sync via their respective queues, regardless of the current sync_status value

### Example Scenario

```
Workout created:
  sync_status: 'pending'
  wahoo_plan_id: NULL
  garmin_workout_id: NULL

Wahoo sync completes:
  sync_status: 'synced'
  wahoo_plan_id: '12345'
  garmin_workout_id: NULL
  last_synced_at: 2025-10-29 20:00:00

Garmin sync completes:
  sync_status: 'synced'
  wahoo_plan_id: '12345'
  garmin_workout_id: 54321
  last_synced_at: 2025-10-29 20:01:00
```

Both services are now synced, indicated by the presence of both ID fields. The `sync_status` and `last_synced_at` reflect the most recent operation (Garmin).

## Queue Processing

The queue service optimizes operations:
- Removes redundant create→delete pairs
- Consolidates multiple updates to the same entity
- Processes deletions before creates/updates
- Handles both services independently

See `GarminSyncQueueService` in `api/services/garmin_sync_queue.py` for implementation details.

## Running Migrations

Migrations are automatically applied when deploying to Supabase:

```bash
# Local Supabase instance
cd src/supabase
supabase db push

# Or via Supabase CLI migrations
supabase db push --db-url <your-database-url>
```

For production, migrations are applied via CI/CD pipeline.

## Testing

After applying migrations, verify:

1. Tables have new columns:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workouts'
  AND column_name IN ('garmin_workout_id', 'sync_status', 'last_synced_at');
```

2. Queue table exists:
```sql
SELECT * FROM garmin_sync_queue LIMIT 1;
```

3. Indexes are created:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'workouts';
```

## Rollback

If needed, migrations can be rolled back manually:

```sql
-- Remove garmin_workout_id columns
ALTER TABLE workouts DROP COLUMN IF EXISTS garmin_workout_id;
ALTER TABLE workouts_scheduled DROP COLUMN IF EXISTS garmin_workout_id;

-- Drop queue table
DROP TABLE IF EXISTS garmin_sync_queue;
```

**Note**: Do not drop shared columns (sync_status, last_synced_at, sync_error) as they are used by Wahoo sync.
