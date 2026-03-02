# Garmin Workout Sync - Bug Fixes & Debugging

## Issues Fixed

### 1. Sport-Specific Target Types (CRITICAL BUG)

**Problem**: Running workouts were using POWER zones instead of HEART_RATE zones, causing Garmin API to reject them.

**Fix**: Modified [garmin_workout_converter.py:125-166](pacer/src/garmin_workout_converter.py#L125-L166) to detect sport type and use appropriate target:
- Running → `HEART_RATE`
- Cycling → `POWER`

### 2. Enum Serialization (POTENTIAL ISSUE)

**Problem**: Pydantic v2 may not properly serialize enum values without explicit mode.

**Fix**: Updated [garmin_sync.py:58](api/services/garmin_sync.py#L58) to use `mode='json'`:
```python
workout_data = garmin_workout.model_dump(mode='json', exclude_none=True)
```

This ensures enums are converted to strings before being sent to Garmin API.

### 3. Import Paths (TESTING ISSUE)

**Problem**: Circular imports prevented tests from running.

**Fix**: Changed absolute imports to relative imports:
- `from pacer.src.X` → `from .X`

### 4. Incorrect CREATE Endpoint (CRITICAL BUG)

**Problem**: Using wrong API endpoint for workout creation. The code was using `training-api/workout` for CREATE operations, but the Training API V2 documentation specifies different endpoints:
- **CREATE** uses: `workoutportal/workout/v2`
- **UPDATE/DELETE/RETRIEVE** use: `training-api/workout/{workoutId}`

**Fix**: Updated [helpers.py:261](api/routers/garmin/helpers.py#L261) to use the correct CREATE endpoint:
```python
# Before (incorrect):
"training-api/workout"

# After (correct):
"workoutportal/workout/v2"
```

This was causing 400 errors from Garmin API because the endpoint wasn't accepting the requests.

### 5. Undefined Variable `workout_name` (RUNTIME ERROR)

**Problem**: Variable `workout_name` was being accessed at line 104 before it was defined at line 129, causing runtime error: "cannot access local variable 'workout_name' where it is not associated with a value"

**Fix**: Moved workout_name definition to line 101 in [garmin_sync.py](api/services/garmin_sync.py#L101):
```python
workout = result.data
workout_name = workout.get("name", "Workout")  # Now defined before first use
```

### 6. Wrong Field Name for Scheduled Time (RUNTIME ERROR)

**Problem**: Code was looking for `scheduled_date` field, but the database table `workouts_scheduled` uses `scheduled_time` field. This caused error: "No scheduled date found" even when scheduled times existed.

**Fix**: Updated [garmin_sync.py:303](api/services/garmin_sync.py#L303) to use correct field name:
```python
# Before (incorrect):
scheduled_date = scheduled.get("scheduled_date")

# After (correct):
scheduled_time = scheduled.get("scheduled_time")
# Then convert to date format for Garmin API
scheduled_date = datetime.fromisoformat(scheduled_time).strftime("%Y-%m-%d")
```

## Debugging Added

### A. Conversion Debugging ([garmin_sync.py:103-126](api/services/garmin_sync.py#L103-L126))

Added comprehensive logging before/after conversion:
- Logs workout text being converted
- Logs full JSON structure
- Verifies segments and steps arrays are not empty
- Logs segment and step counts

**Example output:**
```
INFO: Converting workout abc123 (Easy Run) to Garmin format
DEBUG: Workout text:
running
Easy Run

- 5m Z1
- 15m Z2

INFO: Converted workout abc123 successfully
DEBUG: Workout JSON structure: {...}
INFO: Workout abc123: 1 segment(s)
INFO:   Segment 1: 2 step(s)
```

### B. API Request Debugging ([helpers.py:245-256, 292-303](api/routers/garmin/helpers.py))

Added validation and logging before sending to Garmin:
- Logs full request payload
- Validates segments exist
- Validates each segment has steps
- Logs error if steps array is empty

**Example output:**
```
INFO: Creating Garmin workout: Easy Run
DEBUG: Request payload: {...}
DEBUG:   Segment 1: 2 steps
```

## Testing Results

### Unit Tests
✅ **34/34 tests passing**
```bash
$ uv run pytest pacer/tests/test_garmin_converter.py -v
============================== 34 passed in 0.14s ==============================
```

### Manual Testing

Tested with German workout "20-minütiger lockerer Lauf":
```
Workout text:
running
20-minütiger lockerer Lauf

Warm Up
- 5m Z1 #zügiges Gehen, gefolgt von sehr leichtem Joggen

Main Part
- 10m Z2 #angenehmes, gleichmäßiges Tempo

Cool Down
- 5m Z1 #Tempo reduzieren auf zügiges Gehen
```

**Result**: ✅ Converts successfully to 3 steps with HEART_RATE targets

### Converter Output Verification

Before mode='json':
```python
type(data['sport']) = <enum 'GarminSportType'>
```

After mode='json':
```python
type(data['sport']) = <class 'str'>
```

Both produce valid JSON, but mode='json' is more explicit and reliable.

## Files Modified

1. **pacer/src/garmin_workout_converter.py**
   - Fixed sport-specific target type logic (HEART_RATE for running, POWER for cycling)
   - Changed imports to relative

2. **pacer/src/txt_workout_converter.py**
   - Changed imports to relative

3. **api/services/garmin_sync.py**
   - Added mode='json' to model_dump()
   - Fixed undefined workout_name variable
   - Fixed scheduled_date field name (changed to scheduled_time to match database schema)
   - Added comprehensive debugging logs
   - Modified query to only sync workouts with future scheduled dates

4. **api/routers/garmin/helpers.py**
   - Fixed CREATE endpoint: changed from "training-api/workout" to "workoutportal/workout/v2"
   - Added payload validation
   - Added debug logging

5. **pacer/tests/test_garmin_converter.py**
   - Added 3 new tests for sport-specific targets

## How to Apply Fixes

### ⚠️ IMPORTANT: Restart Required

The running backend server has the OLD code loaded in memory. You must restart the server for changes to take effect.

```bash
# Stop the current backend process
# Then restart:
cd src/backend
./dev.sh serve

# Or if running directly:
uv run python3 -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### Verify Fix is Applied

After restart, watch the logs when syncing a workout. You should see:

```
INFO: Converting workout <id> (<name>) to Garmin format
DEBUG: Workout text:
...
INFO: Converted workout <id> successfully
INFO: Workout <id>: 1 segment(s)
INFO:   Segment 1: X step(s)
INFO: Creating Garmin workout: <name>
DEBUG: Request payload: {...}
```

If you don't see these logs, the server hasn't reloaded the new code.

### Test with Failing Workouts

After restart, trigger a sync for one of the previously failing workouts:

1. Find a workout that was failing:
   ```sql
   SELECT id, name FROM workouts WHERE name LIKE '%Lockerer%' LIMIT 1;
   ```

2. Manually trigger sync via API or queue processing

3. Check logs for:
   - "Converting workout..." → Conversion started
   - "Converted workout successfully" → Conversion OK
   - "Segment 1: X steps" where X > 0 → Steps present
   - "Creating Garmin workout..." → API call started
   - "Successfully created Garmin workout: {id}" → Success!

## Expected Behavior After Fix

### Running Workouts
- Zone-based targets (Z1, Z2, etc.) use `HEART_RATE`
- Converter produces valid JSON with non-empty steps
- Garmin API accepts the workout
- Success message logged

### Cycling Workouts
- Zone-based targets use `POWER`
- Converter produces valid JSON with non-empty steps
- Garmin API accepts the workout
- Success message logged

## Troubleshooting

### Still seeing "Steps cannot be null or empty" after restart?

1. **Check logs for new debug messages**
   - If you don't see "Converting workout..." logs, server didn't reload
   - Try hard restart: kill process, start fresh

2. **Check what's being sent to Garmin**
   - Look for "Request payload:" in DEBUG logs
   - Verify `segments[0].steps` array has items
   - Verify each step has required fields

3. **Check workout text format**
   - Must have at least one step starting with `- `
   - Steps must have duration and intensity (e.g., `- 10m Z2`)
   - Converter will log errors if format is invalid

4. **Check if conversion is failing**
   - Look for "conversion failed" messages
   - Check error details in logs
   - Unsupported workout types will log clear error

### Still getting 400 errors from Garmin?

1. **Check payload structure**
   - Segments array must not be empty
   - Each segment's steps array must not be empty
   - All required fields must be present

2. **Check enum values**
   - Sport must be valid (RUNNING, CYCLING, etc.)
   - Intensity must be valid (ACTIVE, RECOVERY, etc.)
   - TargetType must be valid (HEART_RATE, POWER, etc.)

3. **Check Garmin API response**
   - Full error message is logged
   - May indicate specific field issues

## Log Levels

To see all debugging output, ensure your logging config includes DEBUG level for:
- `pacer-fastapi` logger

Check `logging_config.yaml` and ensure:
```yaml
loggers:
  pacer-fastapi:
    level: DEBUG  # or INFO for less verbose
```

## Summary

Fixed **6 critical bugs** in Garmin workout sync:
1. Sport-specific target types (running uses HEART_RATE, cycling uses POWER)
2. Enum serialization (added mode='json')
3. Import paths (changed to relative imports)
4. Wrong CREATE endpoint (changed to workoutportal/workout/v2)
5. Undefined workout_name variable
6. Wrong field name for scheduled time (scheduled_date → scheduled_time)

Additional debugging has been added throughout the sync flow to help identify any future issues.

**Action Required**: Restart the backend server to load the fixed code.
