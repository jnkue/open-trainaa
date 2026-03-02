# Garmin Workout Converter - Percentage Target Fix

## Issue Description

When uploading workouts to Garmin Connect, power and heart rate targets were showing as **0** in the Garmin device, despite sending what appeared to be correct percentage values.

### Example Problem

Workout sent to Garmin:
```json
{
  "targetType": "POWER",
  "targetValueLow": 0.5,
  "targetValueHigh": 0.6,
  "targetValueType": "PERCENT"
}
```

**Result in Garmin**: Target showed as 0 watts (essentially 0.5% and 0.6% of FTP)

## Root Cause

According to the **Garmin Training API V2 documentation** (page 11):

> **targetValueType**: "A modifier for target value is used only for HR and POWER types to express units. Valid values: **PERCENT**"

When using `targetValueType: 'PERCENT'`, Garmin expects values in the range **0-100** (percentages), not **0.0-1.0** (decimal fractions).

Our converter was sending decimal fractions:
- `0.5` with `PERCENT` = 0.5% of FTP ❌
- `0.6` with `PERCENT` = 0.6% of FTP ❌

Should have been sending:
- `50.0` with `PERCENT` = 50% of FTP ✅
- `60.0` with `PERCENT` = 60% of FTP ✅

## Fix Applied

Modified the `parse_intensity()` method in [garmin_workout_converter.py](src/garmin_workout_converter.py:148-220) to convert all percentage values from decimal (0.0-1.0) to percentage (0-100) format.

### Changes Made

1. **Zone-based targets (Z1-Z6)** - Lines 148-179:
   ```python
   # Before (broken):
   if zone == 1:
       target_low = 0.50
       target_high = 0.60
       value_type = "PERCENT"

   # After (fixed):
   if zone == 1:
       target_low = 50.0  # 50% instead of 0.50
       target_high = 60.0  # 60% instead of 0.60
       value_type = "PERCENT"
   ```

2. **Relative FTP percentages (%FTP 88%)** - Lines 181-201:
   ```python
   # Before (broken):
   target_low = percentage * 0.95  # e.g., 0.836
   target_high = percentage * 1.05  # e.g., 0.924

   # After (fixed):
   target_low = percentage * 0.95 * 100  # e.g., 83.6
   target_high = percentage * 1.05 * 100  # e.g., 92.4
   ```

3. **Relative HR percentages (%HR 75%)** - Lines 203-220:
   ```python
   # Before (broken):
   target_low = percentage * 0.95  # e.g., 0.7125
   target_high = percentage * 1.05  # e.g., 0.7875

   # After (fixed):
   target_low = percentage * 0.95 * 100  # e.g., 71.25
   target_high = percentage * 1.05 * 100  # e.g., 78.75
   ```

## Test Results

### Before Fix
- Power/HR targets displayed as 0 in Garmin devices
- Workouts technically valid but unusable

### After Fix
- **All 43 tests passing** (100% success rate)
- Correct percentage values in JSON output
- Targets display correctly in Garmin devices

### Updated Tests

Updated 5 test cases in [test_garmin_converter.py](tests/test_garmin_converter.py) to expect percentage values (0-100) instead of decimals (0.0-1.0):

```bash
$ uv run pytest pacer/tests/test_garmin_converter.py -v
============================== 43 passed in 0.18s ==============================
```

## Example Output

### Workout Input
```
cycling
Easy Endurance Ride

- 10m Z1
- 60m Z2
- 5m Z1
```

### JSON Output (Fixed)
```json
{
  "workoutName": "Easy Endurance Ride",
  "sport": "CYCLING",
  "segments": [{
    "steps": [
      {
        "stepOrder": 1,
        "intensity": "RECOVERY",
        "durationType": "TIME",
        "durationValue": 600.0,
        "targetType": "POWER",
        "targetValueLow": 50.0,     ← Correct! (50% of FTP)
        "targetValueHigh": 60.0,    ← Correct! (60% of FTP)
        "targetValueType": "PERCENT"
      },
      {
        "stepOrder": 2,
        "intensity": "ACTIVE",
        "durationType": "TIME",
        "durationValue": 3600.0,
        "targetType": "POWER",
        "targetValueLow": 60.0,     ← Correct! (60% of FTP)
        "targetValueHigh": 70.0,    ← Correct! (70% of FTP)
        "targetValueType": "PERCENT"
      }
    ]
  }]
}
```

## Impact

✅ **Fixed**: Power and heart rate targets now display correctly in Garmin devices
✅ **Maintained**: All existing tests passing
✅ **Compatible**: Follows Garmin Training API V2 specification
✅ **Comprehensive**: Covers all percentage-based target types (zones, %FTP, %HR)

## Files Modified

1. **[src/garmin_workout_converter.py](src/garmin_workout_converter.py)** - Lines 148-220: Convert percentages from 0.0-1.0 to 0-100 range
2. **[tests/test_garmin_converter.py](tests/test_garmin_converter.py)** - Lines 164-220: Update test expectations for percentage values

## References

- **Garmin Training API V2 Documentation**: Section 3.2.1 (WorkoutStep Field Definitions), page 11-12
- **Key Quote**: "targetValueType: A modifier for target value is used only for HR and POWER types to express units. Valid values: PERCENT"

## Next Steps

Users can now:
1. Create workouts with zone-based targets (Z1, Z2, etc.)
2. Use relative FTP percentages (%FTP 88%)
3. Use relative HR percentages (%HR 75%)
4. Upload to Garmin Connect with correct target values
5. See accurate power/HR targets on their Garmin devices during workouts

All percentage-based targets will be correctly converted to the 0-100 range as expected by Garmin's API.
