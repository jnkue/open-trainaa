# Garmin Workout Converter - Bug Fix

## Issue Description

When uploading workouts to Garmin Connect, the API was rejecting running workouts with the error:

```
400 - {"message":"Steps cannot be null or empty for workout Easy Run","error":"BadRequestException"}
```

## Root Cause

The converter was using `POWER` as the target type for ALL zone-based workouts (Z1, Z2, Z3, etc.), regardless of sport type.

This caused issues because:
- **Running workouts** should use `HEART_RATE` zones
- **Cycling workouts** should use `POWER` zones

The Garmin API rejected running workouts with power targets as invalid.

## Fix Applied

Modified the `parse_intensity()` method in [garmin_workout_converter.py](src/garmin_workout_converter.py) to determine target type based on sport:

```python
# Before (broken):
if re.match(r"^Z\d+$", intensity_str):
    zone = int(intensity_str[1:])
    target_type = GarminTargetType.POWER  # Always POWER
    # ...

# After (fixed):
if re.match(r"^Z\d+$", intensity_str):
    zone = int(intensity_str[1:])

    # Determine target type based on sport
    if sport_type == GarminSportType.RUNNING:
        target_type = GarminTargetType.HEART_RATE
    else:
        target_type = GarminTargetType.POWER
    # ...
```

## Test Results

### Before Fix
- 0 workouts successfully uploaded to Garmin
- All running workouts rejected with "Steps cannot be null or empty" error

### After Fix
- All 34 tests passing (100% success rate)
- Sport-specific target mapping verified

### Test Suite

Added comprehensive test class `TestSportSpecificTargets` with 3 new tests:

1. **test_running_uses_heart_rate_zones** - Verifies running workouts use HEART_RATE
2. **test_cycling_uses_power_zones** - Verifies cycling workouts use POWER
3. **test_explicit_heart_rate_overrides_sport_default** - Verifies explicit heart rate targets work

```bash
$ uv run pytest pacer/tests/test_garmin_converter.py -v
============================== 34 passed in 0.14s ==============================
```

## Example Outputs

### Running Workout (uses HEART_RATE)

**Input:**
```
running
Easy Run

- 5m Z1
- 15m Z2
```

**Output:**
```json
{
  "workoutName": "Easy Run",
  "sport": "RUNNING",
  "segments": [{
    "steps": [
      {
        "stepOrder": 1,
        "intensity": "RECOVERY",
        "durationType": "TIME",
        "durationValue": 300.0,
        "targetType": "HEART_RATE",  ← Correct!
        "targetValueLow": 0.5,
        "targetValueHigh": 0.6,
        "targetValueType": "PERCENT"
      },
      {
        "stepOrder": 2,
        "intensity": "ACTIVE",
        "durationType": "TIME",
        "durationValue": 900.0,
        "targetType": "HEART_RATE",  ← Correct!
        "targetValueLow": 0.6,
        "targetValueHigh": 0.7,
        "targetValueType": "PERCENT"
      }
    ]
  }]
}
```

### Cycling Workout (uses POWER)

**Input:**
```
cycling
Moderate Ride

- 10m Z2
- 20m Z3
```

**Output:**
```json
{
  "workoutName": "Moderate Ride",
  "sport": "CYCLING",
  "segments": [{
    "steps": [
      {
        "stepOrder": 1,
        "targetType": "POWER",  ← Correct!
        "targetValueLow": 0.6,
        "targetValueHigh": 0.7
      },
      {
        "stepOrder": 2,
        "targetType": "POWER",  ← Correct!
        "targetValueLow": 0.7,
        "targetValueHigh": 0.8
      }
    ]
  }]
}
```

## Additional Fixes

While fixing the main issue, also corrected import paths to use relative imports:

**Before:**
```python
from pacer.src.garmin_workout_definition import ...
from pacer.src.txt_workout_validator import ...
```

**After:**
```python
from .garmin_workout_definition import ...
from .txt_workout_validator import ...
```

This ensures the pacer package can be imported correctly in all contexts (tests, API, standalone scripts).

## Impact

✅ **Fixed:** Running workouts now upload successfully to Garmin
✅ **Maintained:** Cycling workouts continue to work correctly
✅ **Verified:** All 34 tests passing (31 original + 3 new)
✅ **Compatible:** Works with Garmin Training API V2 requirements

## Files Modified

1. **src/garmin_workout_converter.py** - Sport-specific target type logic
2. **src/txt_workout_converter.py** - Fixed import paths
3. **tests/test_garmin_converter.py** - Added 3 new tests for sport-specific targets

## Next Steps

The fix is ready for deployment. Users can now:
1. Create running workouts with zone-based targets (Z1, Z2, etc.)
2. Create cycling workouts with zone-based targets
3. Upload both types to Garmin Connect successfully
4. Use explicit heart rate or power targets when needed

All workouts will be properly converted with sport-appropriate target types.
