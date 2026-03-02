# Workout Sync System

The workout sync system provides unified, reliable synchronization of workouts and scheduled workouts to external training platforms (Wahoo, Garmin, TrainingPeaks, etc.).

## Overview

The system uses a **provider-agnostic architecture** that:
- Queues sync operations for batch processing
- Handles errors intelligently with automatic retries
- Implements rate limiting to prevent API throttling
- Makes adding new providers simple and consistent

## Architecture

```
┌─────────────────┐
│ Workouts Router │  Creates/Updates/Deletes workout
└────────┬────────┘
         │ Enqueues operation
         ▼
┌──────────────────────┐
│ workout_sync_queue   │  Database queue table
│ (provider-agnostic)  │
└──────────┬───────────┘
         │ Processed every 10min
         ▼
┌──────────────────────┐
│ WorkoutSyncService   │  Orchestrates sync
└──────────┬───────────┘
         │ Delegates to provider
         ▼
┌──────────────────────┐
│ Provider (Wahoo/     │  Calls external API
│ Garmin/etc.)         │
└──────────────────────┘
```

### Components

#### 1. Providers (`api/providers/`)
- **Base Interface** (`api/providers/base.py`) - Abstract `WorkoutSyncProvider` class
- **Wahoo Provider** (`api/providers/wahoo.py`) - Wahoo ELEMNT integration
- **Garmin Provider** (`api/providers/garmin.py`) - Garmin Connect integration

Each provider implements:
```python
async def sync_workout(user_id, workout_id, workout_data) -> bool
async def sync_scheduled_workout(user_id, scheduled_id, scheduled_data) -> bool
async def delete_workout(user_id, workout_id, provider_workout_id) -> bool
async def delete_scheduled_workout(user_id, scheduled_id, provider_scheduled_id) -> bool
```

#### 2. Sync Service (`api/services/workout_sync.py`)
Orchestrates sync operations across all providers:
- Fetches entity data from database
- Handles errors and classifies them
- Manages retry logic with exponential backoff
- Updates queue status

#### 3. Queue Table (`workout_sync_queue`)
Unified queue table for all providers:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Queue entry ID |
| `user_id` | UUID | User performing the operation |
| `entity_type` | VARCHAR | `workout` or `workout_scheduled` |
| `entity_id` | UUID | ID of the workout/scheduled workout |
| `operation` | VARCHAR | `create`, `update`, or `delete` |
| `provider` | VARCHAR | `wahoo`, `garmin`, `trainingpeaks`, etc. |
| `retry_count` | INT | Number of retry attempts |
| `next_retry_at` | TIMESTAMPTZ | When to retry (exponential backoff) |
| `error_type` | VARCHAR | Error classification |
| `error_message` | TEXT | Detailed error message |
| `processed_at` | TIMESTAMPTZ | NULL = pending, timestamp = processed |

#### 4. Background Worker (`api/workers/workout_sync_worker.py`)
Scheduled job that runs every 10 minutes:
- Fetches pending queue entries
- Processes each entry sequentially (respects rate limits)
- Handles retries and permanent failures

## How It Works

### 1. Enqueueing Sync Operations

When a workout is created, updated, or deleted, the router checks if the provider is enabled and then enqueues sync operations:

```python
from api.services.workout_sync import get_sync_service

sync_service = get_sync_service()

# Only enqueue for enabled providers
if sync_service.is_provider_enabled(user_id, "wahoo"):
    asyncio.create_task(sync_service.enqueue_sync(
        user_id, "workout", workout_id, "create", "wahoo"
    ))
if sync_service.is_provider_enabled(user_id, "garmin"):
    asyncio.create_task(sync_service.enqueue_sync(
        user_id, "workout", workout_id, "create", "garmin"
    ))
```

**Why check before enqueueing?**
- Avoids creating unnecessary queue entries for disabled providers
- Keeps the queue clean and monitoring accurate
- Reduces database writes

**Sync Triggers:**
- **Workout created** → Enqueue `create` for all **enabled** providers
- **Workout updated** (workout_text changed) → Enqueue `update` for all **enabled** providers
- **Workout deleted** (if synced) → Enqueue `delete` for each **enabled** synced provider
- **Scheduled workout created** → Enqueue `create` for all **enabled** providers
- **Scheduled workout updated** (date/time changed) → Enqueue `update` for all **enabled** providers
- **Scheduled workout deleted** (if synced) → Enqueue `delete` for each **enabled** synced provider

> **Note**: "Enabled" means the user has connected the provider and has `upload_workouts_enabled = true` in the provider's tokens table.

### 2. Processing Queue

The background worker (`workout_sync_worker.py`) runs every 10 minutes and:

1. Fetches pending queue entries (where `processed_at IS NULL`)
2. For each entry:
   - Fetches entity data from database
   - Calls appropriate provider method
   - Handles errors and updates queue status
3. Logs summary statistics

### 3. Error Handling

The system classifies errors and handles them appropriately:

| Error Type | Retry? | Backoff | Description |
|------------|--------|---------|-------------|
| `record_not_found` | ❌ No | - | Record deleted before sync (mark as processed) |
| `rate_limit` | ✅ Yes | API-specified or 60s | API rate limit exceeded (429) |
| `auth_error` | ❌ No | - | Token invalid/expired (user must reconnect) |
| `provider_error` | ✅ Yes | 2min → 10min → 1hr | Provider API error (temporary) |
| `unexpected_error` | ✅ Yes | 2min → 10min → 1hr | Unknown error (temporary) |

**Retry Logic:**
- Max retries: 3 attempts
- Exponential backoff: 2 minutes → 10 minutes → 1 hour
- After max retries: marked as processed (permanent failure)

### 4. Rate Limiting

Built-in rate limiter prevents hitting API limits:
- **Default**: 30 requests/minute per user per provider
- Tracks calls in-memory per `(user_id, provider)` key
- Automatically sleeps when limit reached
- Handles 429 responses with retry scheduling

## Configuration

### Environment Variables

```bash
# Sync interval (default: 10 minutes)
WORKOUT_SYNC_INTERVAL_MINUTES=10
```

### Provider-Specific Settings

**Wahoo:**
- Rate limit: 30 req/min (configurable in `rate_limiter.py`)
- API tokens stored in `wahoo_tokens` table
- Workout plan IDs stored in `workouts.wahoo_plan_id`
- Scheduled workout IDs stored in `workouts_scheduled.wahoo_workout_id`

**Garmin:**
- Rate limit: 30 req/min (configurable in `rate_limiter.py`)
- API tokens stored in `garmin_tokens` table
- Workout IDs stored in `workouts.garmin_workout_id`
- Scheduling: Calendar-based (no separate scheduled workout ID)

## Adding a New Provider

To add a new provider (e.g., TrainingPeaks), follow these steps:

### 1. Create Provider Implementation

Create `api/providers/trainingpeaks.py`:

```python
from api.providers.base import WorkoutSyncProvider
from api.services.rate_limiter import get_rate_limiter

class TrainingPeaksProvider(WorkoutSyncProvider):
    def __init__(self):
        super().__init__("trainingpeaks")
        self.rate_limiter = get_rate_limiter()

    async def get_auth_token(self, user_id: UUID) -> Optional[str]:
        # Get token from trainingpeaks_tokens table
        pass

    async def sync_workout(self, user_id, workout_id, workout_data) -> bool:
        # Convert workout_text to TrainingPeaks format
        # Call TrainingPeaks API
        # Update workouts.trainingpeaks_workout_id
        pass

    async def sync_scheduled_workout(self, user_id, scheduled_id, scheduled_data) -> bool:
        # Schedule workout on TrainingPeaks calendar
        pass

    async def delete_workout(self, user_id, workout_id, provider_workout_id) -> bool:
        # Delete from TrainingPeaks
        pass

    async def delete_scheduled_workout(self, user_id, scheduled_id, provider_scheduled_id) -> bool:
        # Remove from TrainingPeaks calendar
        pass
```

### 2. Register Provider

Update `api/services/workout_sync.py`:

```python
from api.providers import TrainingPeaksProvider

class WorkoutSyncService:
    def __init__(self):
        self.providers = {
            "wahoo": WahooProvider(),
            "garmin": GarminProvider(),
            "trainingpeaks": TrainingPeaksProvider(),  # Add here
        }
```

### 3. Update Database Migration

Add provider to CHECK constraint in migration:

```sql
provider VARCHAR(20) NOT NULL CHECK (
    provider IN ('wahoo', 'garmin', 'trainingpeaks')
)
```

### 4. Update Router

Add enqueue calls in `api/routers/workouts.py`:

```python
asyncio.create_task(sync_service.enqueue_sync(
    current_user.id, "workout", workout_id, "create", "trainingpeaks"
))
```

### 5. Add Database Columns

Add provider-specific ID columns to workout tables:

```sql
ALTER TABLE workouts
ADD COLUMN trainingpeaks_workout_id BIGINT;

ALTER TABLE workouts_scheduled
ADD COLUMN trainingpeaks_scheduled_id BIGINT;
```

That's it! The new provider is now integrated into the unified sync system.

## Monitoring

### Queue Status

Check pending operations:
```sql
SELECT provider, operation, entity_type, COUNT(*) as pending
FROM workout_sync_queue
WHERE processed_at IS NULL
GROUP BY provider, operation, entity_type;
```

### Error Analysis

Check error patterns:
```sql
SELECT error_type, COUNT(*) as count
FROM workout_sync_queue
WHERE processed_at IS NULL AND error_type IS NOT NULL
GROUP BY error_type
ORDER BY count DESC;
```

### Failed Operations

Find permanently failed operations:
```sql
SELECT *
FROM workout_sync_queue
WHERE processed_at IS NOT NULL
  AND error_type IS NOT NULL
  AND retry_count >= 3
ORDER BY created_at DESC
LIMIT 10;
```

### Sync Success Rate

Calculate success rate per provider:
```sql
SELECT
    provider,
    COUNT(*) as total,
    SUM(CASE WHEN error_type IS NULL THEN 1 ELSE 0 END) as succeeded,
    ROUND(100.0 * SUM(CASE WHEN error_type IS NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM workout_sync_queue
WHERE processed_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY provider;
```

### Programmatic Status Queries

Check sync status from Python code:

```python
from api.services.workout_sync import get_sync_service

sync_service = get_sync_service()

# Get status for a specific provider
status = sync_service.get_sync_status("workout", workout_id, "wahoo")
if status:
    if status["synced"]:
        print(f"Successfully synced to Wahoo")
    elif status["pending"]:
        print(f"Sync pending (retry #{status['retry_count']})")
    elif status["failed"]:
        print(f"Sync failed: {status['error_message']}")
else:
    print("Never synced to Wahoo")

# Get status across all providers
all_statuses = sync_service.get_all_sync_statuses("workout", workout_id)
for provider, status in all_statuses.items():
    if status and status["synced"]:
        print(f"✓ {provider}: synced")
    elif status and status["pending"]:
        print(f"⏳ {provider}: pending")
    elif status and status["failed"]:
        print(f"✗ {provider}: failed - {status['error_type']}")
    else:
        print(f"- {provider}: not synced")
```

**Status Response Format:**
```python
{
    'synced': bool,         # True if successfully synced
    'pending': bool,        # True if queued but not processed
    'failed': bool,         # True if processed with error
    'error_type': str,      # Error classification (or None)
    'error_message': str,   # Detailed error (or None)
    'last_attempt': str,    # ISO timestamp of last attempt
    'retry_count': int,     # Number of retries
}
```

## Logs

The system logs sync operations at various levels:

```
INFO: 🔄 Starting scheduled workout batch sync...
INFO: Processing wahoo workout <uuid> create (attempt 1)
INFO: Successfully created Wahoo plan <plan_id> for workout <uuid>
INFO: ✅ Batch sync complete: 42 operations (40 succeeded, 2 failed)
```

Error logs include full stack traces:
```
ERROR: Rate limit hit for queue entry <uuid>: Wahoo API rate limit exceeded
ERROR: Error syncing workout <uuid> to Wahoo: <detailed error>
```

## Troubleshooting

### Issue: Workouts not syncing

1. **Check if user has provider connected:**
   ```sql
   SELECT * FROM wahoo_tokens WHERE user_id = '<user_id>';
   ```

2. **Check queue for pending/failed operations:**
   ```sql
   SELECT * FROM workout_sync_queue
   WHERE user_id = '<user_id>'
   ORDER BY created_at DESC;
   ```

3. **Check logs for errors:**
   ```bash
   grep "Error syncing workout" logs/app.log
   ```

### Issue: 429 Rate Limit Errors

- Reduce sync frequency: increase `WORKOUT_SYNC_INTERVAL_MINUTES`
- Adjust rate limiter: modify `calls_per_minute` in `rate_limiter.py`
- Check if too many users syncing simultaneously

### Issue: Auth Errors

User needs to disconnect and reconnect their provider:
1. User goes to settings
2. Disconnects provider (clears tokens)
3. Reconnects provider (fresh OAuth flow)

### Issue: Record Not Found Errors

This is normal when workouts are deleted before sync completes. The system automatically marks these as processed (no retry needed).

## Best Practices

1. **Always enqueue to all connected providers** - Let the sync service decide if sync is needed
2. **Don't block user requests** - Use `asyncio.create_task()` for fire-and-forget enqueueing
3. **Monitor error rates** - Set up alerts for high failure rates
4. **Clean up old queue entries** - Periodically delete processed entries older than 30 days
5. **Test provider integrations** - Use staging/test accounts before going to production

## See Also

- [Integrations](./integrations.md)
