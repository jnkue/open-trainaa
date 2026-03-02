WORKOUTDEFINITION = """
 # Workout Definition Format

## Structure

A workout consists of three main parts:

1. **Workout Type** (Line 1)
2. **Workout Name** (Line 2)  
3. **Empty Line** (Line 3)
4. **Workout Content** (Line 4+)

## Format Specification

### 1. Workout Type

```text
{cycling | running | swimming | training | hiking | rowing | walking | rest_day}
```

Note: Sport types must be lowercase.

**Special: Rest Day Format**

For rest days, use a simplified format with NO workout steps:

```text
rest_day
{Rest Day Name}

[Optional recovery notes]
```

Example:
```text
rest_day
Active Recovery Day

Light stretching or foam rolling recommended
```

### 2. Workout Name

```text
{Name of the workout}
```

### 3. Workout Content

Consists of workout sets and workout steps:

**Workout Set:**

```text
{NumberOfReps}x {Name of Workout Set}
```

- `NumberOfReps`: Number of repetitions (optional, omit if only 1 rep)
- `Name of Workout Set`: Descriptive name

**Workout Step:**

```text
- {Duration} {Intensity} [#{Comment}]
```

- Optional comment can be added with `#` followed by descriptive text
- Comments provide additional guidance or focus points for the step

**Duration:**

- Time: `{Number}{h|m|s}` (h=hours, m=minutes, s=seconds)
- Extended Time: `{Number}m{Number}s` (e.g., 8m30s for 8 minutes 30 seconds)
- Extended Time: `{Number}h{Number}m` (e.g., 2h30m for 2 hours 30 minutes)
- Distance: `{Number}km` (kilometers, e.g., 0.4km for 400 meters) NEVER in meters because of parsing ambiguity


**Intensity:**

- Absolute: `{Power|HeartRate|Speed} {Number}{W|bpm|km/h}`
- Relative: `{%FTP|%HR|%Speed} {Number}%`
- Zone-based: `Z{Number}` (e.g., Z2 for Zone 2)

## Examples

### Example 1: Simple Cycling Workout

```text
cycling
Sweet Spot Intervals

3x Sweet Spot Set
- 10m %FTP 88% #focus on breathing
- 2m %FTP 55% #active recovery

Cool Down
- 10m %FTP 50% #easy spinning
```

### Example 2: Running Workout

```text
running
Tempo Run

Warm Up
- 15m %HR 65%

Tempo Block
- 20m %HR 85%

Cool Down
- 10m %HR 60%
```text
running
Tempo Run

Warm Up
- 15m %HR 65%

Tempo Block
- 20m %HR 85%

Cool Down
- 10m %HR 60%
- 10m %HR 60%
```

### Example 3: Swimming Workout

```text
swimming
Endurance Swim

Warm Up
- 0.8km Z1 #easy freestyle

4x Main Set
- 0.4km Z3 #freestyle
- 2m Z1 #rest

Cool Down
- 0.3km Z1 #easy backstroke
```


### Example 4: Strength Training

```text
training
Upper Body Workout

3x Push Set
- 45s Strength 80%
- 15s Strength 0%

2x Pull Set
- 60s Strength 75%
- 30s Strength 0%
```

### Example 5: Zone-based Training

```text
cycling
Endurance Base Training

Warm Up
- 10m Z1

Main Set
- 8m30s Z2
- 2m Z1
- 15m Z2

Cool Down
- 5m Z1
```

"""
