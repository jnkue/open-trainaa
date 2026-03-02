# FIT File Converter Usage

The `FitFileConverter` class converts workout text files to FIT file format, which can be uploaded to fitness devices and platforms like Garmin, Wahoo, and others.

## Basic Usage

### Python API

```python
from pacer.src.txt_workout_converter import FitFileConverter

# Create converter instance
converter = FitFileConverter()

# Convert workout text to FIT file
workout_text = """cycling
Tempo Ride

Warmup
- 10m Z1

Main Set
- 20m Z3
- 5m Z1

Cooldown
- 5m Z1
"""

converter.convert_to_fit(workout_text, "tempo_ride.fit")
```

### Convert a single file

```python
converter.convert_file("workouts/my_workout.txt", "output/my_workout.fit")
```

### Convert all valid workout files

```python
converter.convert_all_valid_files(output_dir="fit_output")
```

## Command Line Usage

### Convert single file to FIT format

```bash
cd src/backend
uv run python -m pacer.src.txt_workout_converter --file workouts/my_workout.txt --format fit
```

### Convert all valid files to FIT format

```bash
cd src/backend
uv run python -m pacer.src.txt_workout_converter --all --format fit --output fit_output
```

## Features

### Supported Workout Types
- Cycling
- Running
- Swimming
- Training (strength)
- Walking

### Supported Duration Types
- Time-based: `10m`, `8m30s`, `2h30m`, `5s`, `1h`
- Distance-based: `400m`, `5km`

### Supported Intensity Types
- Zone-based: `Z1`, `Z2`, `Z3`, `Z4`, `Z5`, `Z6`, `Z7`
- Percentage FTP: `%FTP 88%`
- Percentage HR: `%HR 75%`
- Absolute Power: `Power 250W`
- Absolute Heart Rate: `HeartRate 150bpm`
- Speed: `Speed 15km/h` or `Speed 1:30/100m`
- Strength: `Strength 80%`

### FIT File Mapping

The converter maps your workout structure to FIT file format:

- **Workout Type** → FIT Sport (CYCLING, RUNNING, etc.)
- **Duration** → WorkoutStepDuration (TIME, DISTANCE, OPEN)
- **Intensity Zones** → Power/HR zones
- **Repeated Sets** → Multiple workout steps (unrolled)

## Example Conversions

### Simple Cycling Workout

Input:
```
cycling
Sweet Spot Training

Warmup
- 10m Z1
- 5m Z2

Main Set
- 20m Z3

Cooldown
- 5m Z1
```

This creates a FIT file with 4 workout steps:
1. Warm up 10min in Zone 1
2. Warm up 5min in Zone 2
3. Main 20min in Zone 3
4. Cool down 5min in Zone 1

### Interval Workout with Repetitions

Input:
```
running
5K Intervals

Warmup
- 10m Z1

3x Intervals
- 5m Z4
- 2m Z1

Cooldown
- 5m Z1
```

This creates a FIT file with 8 steps:
1. Warm up 10min in Zone 1
2-7. 3 repetitions of (5min Zone 4, 2min Zone 1)
8. Cool down 5min in Zone 1

## Technical Details

### FIT File Structure

The converter creates FIT files with:
- **FileIdMessage**: Metadata about the file
  - Manufacturer: DEVELOPMENT (255)
  - Type: WORKOUT
  - Timestamp: Current time
- **WorkoutMessage**: Overall workout information
  - Name
  - Sport
  - Number of steps
- **WorkoutStepMessage**: Individual workout steps
  - Name
  - Duration type and value
  - Intensity
  - Target type (power/HR/speed/open)
  - Target zones or values

### Zone Mapping

Power zones (based on FTP percentage):
- Zone 1: ≤60%
- Zone 2: 60-75%
- Zone 3: 75-85%
- Zone 4: 85-95%
- Zone 5: 95-105%
- Zone 6: >105%

Heart Rate zones (based on threshold HR percentage):
- Zone 1: ≤70%
- Zone 2: 70-80%
- Zone 3: 80-90%
- Zone 4: 90-95%
- Zone 5: >95%

## Requirements

The converter requires the `fit_tool` library, which is included in the project's dependencies:

```bash
cd src/backend
uv pip install -e python_fit_tool_jnkue/
```

## Limitations

1. **Repeated sets are unrolled**: FIT doesn't have native "repeat" functionality for workout steps, so repeated sets are expanded into individual steps.

2. **Single target per step**: FIT workout steps support only one target type (power, HR, or speed). If multiple targets are specified, only the first one is used.

3. **Zone approximation**: Relative percentages are mapped to discrete zones, which may not exactly match your intended values.

## Error Handling

The converter validates workout text before conversion. Common errors:

- Invalid workout format
- Unsupported duration format
- Unsupported intensity format
- Missing fit_tool library

All errors raise clear exceptions with descriptive messages.
