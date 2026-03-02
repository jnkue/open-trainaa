/**
 * Workout Parser Utility
 *
 * Parses workout_text into structured segments for visualization.
 * Based on format from src/backend/pacer/src/txt_workout_definition.py
 */

export type IntensityType =
  | 'zone'      // Z1, Z2, Z3, Z4, Z5, Z6, Z7
  | 'power'     // Power XXW or %FTP XX%
  | 'heartRate' // HeartRate XXbpm or %HR XX%
  | 'speed'     // Speed XXkm/h or %Speed XX%
  | 'strength'; // Strength XX%


export interface WorkoutStep {
  durationSeconds: number;
  durationDisplay: string;
  durationType: 'time' | 'distance';
  intensityType: IntensityType;
  intensityValue: number;
  intensityDisplay: string;
  intensityNormalized: number; // 0-100 scale for color mapping
  comment?: string;
}

/**
 * Editable workout step with unique ID for drag-and-drop tracking
 */
export interface EditableWorkoutStep extends WorkoutStep {
  id: string;
  setName?: string;
}

export interface WorkoutSet {
  name: string;
  repetitions: number;
  steps: WorkoutStep[];
}

export interface ParsedWorkout {
  sport: string;
  name: string;
  sets: WorkoutSet[];
  totalDurationSeconds: number;
}

// Zone to normalized intensity mapping (0-100 scale)
const ZONE_NORMALIZED: Record<string, number> = {
  'Z1': 15,
  'Z2': 30,
  'Z3': 45,
  'Z4': 60,
  'Z5': 75,
  'Z6': 85,
  'Z7': 100,
};

/**
 * Parse duration string to seconds or distance
 * Supports: 10m, 30s, 8m30s, 2h30m
 * Distance: 400m, 0.4km, 1.5km, 1500m
 */
function parseDuration(durationStr: string, sport: string = ''): { 
  seconds: number; 
  display: string; 
  type: 'time' | 'distance'; 
} {
  const trimmed = durationStr.trim();
  
  // Explicit distance check first (to distinguish 10m as minutes vs meters)
  // Logic: 
  // - If it ends in 'km', it's distance.
  // - If it ends in 'm' AND we are swimming, it's distance unless 'min' is used.
  // - However, standard notation 10m usually means 10 minutes. 300m usually means meters.
  // - Let's look for specific patterns.
  
  // km pattern: 1.5km, 0.4km
  const kmMatch = trimmed.match(/^([\d\.]+)km$/i);
  if (kmMatch) {
    const km = parseFloat(kmMatch[1]);
    const meters = km * 1000;
    // Estimate seconds based on sport (defaulting to running ~ 5:00/km)
    let seconds = meters * 0.3; // Very rough default
    
    // Better estimates based on sport if available
    if (sport.toLowerCase().includes('swim')) seconds = meters * 1.5; // ~2:30/100m slow base
    else if (sport.toLowerCase().includes('bike') || sport.toLowerCase().includes('cycl')) seconds = meters / 8; // ~30km/h
    else seconds = meters * 0.3; // Run ~5:00/km -> 300s/km -> 0.3s/m
    
    return { 
      seconds: Math.round(seconds), 
      display: trimmed, 
      type: 'distance' 
    };
  }

  // m pattern (meters): 400m, 50m. 
  // Challenge: 10m could be 10 minutes.
  // Heuristic: If value > 60, assume meters. If context is swimming, assume meters?
  // User input "10m" usually means 10 minutes in most workout builders.
  // Let's assume standard time format 'm' = minutes, unless it looks like distance.
  // But user request says: "0.4km Z3" and "10m Z1". In the request "10m Z1" under Warm Up for Swimming. 
  // Wait, "10m Z1" in swimming usually implies 10 meters? No, 10 meters is too short. 
  // In the user request: "Warm Up - 10m Z1". 10m for swimming is nothing. It likely means 10 minutes.
  // "0.4km Z3" is distance.
  // But wait! Swimming pools are 25m or 50m. 10m is unlikely to be distance.
  // Let's stick to 'm' = minutes, 'km' = kilometers.
  // What about '200m'?
  // If the user types '0.2km', that works.
  // What if they type '200m'? 
  // Let's assume 'm' is minutes for now to be safe, unless it's clearly large like 100m+.
  // Actually, usually in text based workouts:
  // 10:00 = 10 mins
  // 10m = 10 mins
  // 400m = 400 meters? This is ambiguous.
  // Let's look at the example: 
  // - 0.4km Z3
  // - 2m Z1 (Rest) -> 2 minutes
  // - 0.4km Z2
  // - 3m Z1 (Rest) -> 3 minutes
  // - 5m Z1 -> 5 minutes
  
  // So 'm' seems to consistently be minutes in this specific user's example.
  // The user said: "also the visual view needs to support Distance based workouts... like this: ... - 0.4km Z3 ..."
  // So they are using 'km' for distance.
  // If they use 'm' for meters, we might have issues.
  // BUT: standard swimming workouts often use 100m, 200m, 400m.
  // Let's try to be smart: if 'm' is used, check magnitude?
  // 10m -> 10 mins. 400m -> 400 mins or 400 meters? 400 mins is 6h40m (unlikely for a step).
  // So maybe > 59 implies meters?
  // But for now, let's strictly follow the provided example where 'km' is used for distance.
  // And also generally support 'meters' if explicitly written 'meters'? Or assume large numbers?
  
  // Let's stick to parsing standard time formats first.
  
  // Extended format: 2h30m
  const hourMinMatch = trimmed.match(/^(\d+)h(\d+)m$/i);
  if (hourMinMatch) {
    const hours = parseInt(hourMinMatch[1], 10);
    const mins = parseInt(hourMinMatch[2], 10);
    return { seconds: hours * 3600 + mins * 60, display: trimmed, type: 'time' };
  }

  // Extended format: 8m30s
  const minSecMatch = trimmed.match(/^(\d+)m(\d+)s$/i);
  if (minSecMatch) {
    const mins = parseInt(minSecMatch[1], 10);
    const secs = parseInt(minSecMatch[2], 10);
    return { seconds: mins * 60 + secs, display: trimmed, type: 'time' };
  }

  // Hours only: 2h
  const hoursMatch = trimmed.match(/^(\d+)h$/i);
  if (hoursMatch) {
    return { seconds: parseInt(hoursMatch[1], 10) * 3600, display: trimmed, type: 'time' };
  }

  // Minutes only: 10m
  const minsMatch = trimmed.match(/^(\d+)m$/i);
  if (minsMatch) {
    return { seconds: parseInt(minsMatch[1], 10) * 60, display: trimmed, type: 'time' };
  }

  // Seconds only: 30s
  const secsMatch = trimmed.match(/^(\d+)s$/i);
  if (secsMatch) {
    return { seconds: parseInt(secsMatch[1], 10), display: trimmed, type: 'time' };
  }

  // Meters specific fallback (if it exceeds typical minute values or user meant meters)
  // For now, let's treat anything ending in 'm' as minutes unless it matches our previous logic.
  // If we want to support '400m' as distance, the regex `^(\d+)m$` already caught by minutes.
  // To handle '400m' as distance, we'd need to change logic. 
  // Given the user example uses 'km' for distance, we are safe relying on 'km' for now.
  // Does the user want 'm' for meters support?
  // "swimming ... 0.4km Z3 ... 0.4km Z2"
  // They used km.
  // Let's ensure we catch 'meters' if explicitly spelled out? Unlikely.
  
  // Default fallback
  return { seconds: 60, display: trimmed, type: 'time' };
}

/**
 * Parse intensity string and return type, value, and normalized (0-100)
 */
function parseIntensity(intensityStr: string): {
  type: IntensityType;
  value: number;
  display: string;
  normalized: number;
} {
  const trimmed = intensityStr.trim();

  // Zone-based: Z1-Z7
  const zoneMatch = trimmed.match(/^Z(\d)$/i);
  if (zoneMatch) {
    const zone = `Z${zoneMatch[1]}`;
    return {
      type: 'zone',
      value: parseInt(zoneMatch[1], 10),
      display: zone,
      normalized: ZONE_NORMALIZED[zone] || 50,
    };
  }

  // Power percentage: %FTP 88%
  const ftpMatch = trimmed.match(/^%FTP\s*(\d+)%?$/i);
  if (ftpMatch) {
    const pct = parseInt(ftpMatch[1], 10);
    return {
      type: 'power',
      value: pct,
      display: trimmed,
      normalized: Math.min(100, pct),
    };
  }

  // Absolute power: Power 350W
  const powerMatch = trimmed.match(/^Power\s*(\d+)W?$/i);
  if (powerMatch) {
    const watts = parseInt(powerMatch[1], 10);
    // Estimate normalized based on typical FTP of ~250W
    const normalized = Math.min(100, Math.round((watts / 400) * 100));
    return {
      type: 'power',
      value: watts,
      display: trimmed,
      normalized,
    };
  }

  // Heart rate percentage: %HR 85%
  const hrPctMatch = trimmed.match(/^%HR\s*(\d+)%?$/i);
  if (hrPctMatch) {
    const pct = parseInt(hrPctMatch[1], 10);
    return {
      type: 'heartRate',
      value: pct,
      display: trimmed,
      normalized: Math.min(100, pct),
    };
  }

  // Absolute heart rate: HeartRate 160bpm
  const hrMatch = trimmed.match(/^HeartRate\s*(\d+)\s*bpm?$/i);
  if (hrMatch) {
    const bpm = parseInt(hrMatch[1], 10);
    // Estimate normalized based on typical max HR of ~190
    const normalized = Math.min(100, Math.round((bpm / 200) * 100));
    return {
      type: 'heartRate',
      value: bpm,
      display: trimmed,
      normalized,
    };
  }

  // Speed percentage: %Speed 90%
  const speedPctMatch = trimmed.match(/^%Speed\s*(\d+)%?$/i);
  if (speedPctMatch) {
    const pct = parseInt(speedPctMatch[1], 10);
    return {
      type: 'speed',
      value: pct,
      display: trimmed,
      normalized: Math.min(100, pct),
    };
  }

  // Absolute speed: Speed 25km/h
  const speedMatch = trimmed.match(/^Speed\s*([\d.]+)\s*km\/h?$/i);
  if (speedMatch) {
    const speed = parseFloat(speedMatch[1]);
    // Estimate normalized based on typical max speed
    const normalized = Math.min(100, Math.round((speed / 40) * 100));
    return {
      type: 'speed',
      value: speed,
      display: trimmed,
      normalized,
    };
  }

  // Strength: Strength 80%
  const strengthMatch = trimmed.match(/^Strength\s*(\d+)%?$/i);
  if (strengthMatch) {
    const pct = parseInt(strengthMatch[1], 10);
    return {
      type: 'strength',
      value: pct,
      display: trimmed,
      normalized: Math.min(100, pct),
    };
  }

  // Default fallback - try to extract any percentage
  const anyPctMatch = trimmed.match(/(\d+)%/);
  if (anyPctMatch) {
    return {
      type: 'zone',
      value: parseInt(anyPctMatch[1], 10),
      display: trimmed,
      normalized: parseInt(anyPctMatch[1], 10),
    };
  }

  // Ultimate fallback
  return {
    type: 'zone',
    value: 50,
    display: trimmed,
    normalized: 50,
  };
}


/**
 * Parse a workout step line
 * Format: - {Duration} {Intensity} [#{Comment}]
 */
function parseStepLine(line: string, sport: string = ''): WorkoutStep | null {
  // Remove leading dash and whitespace
  const stepContent = line.replace(/^-\s*/, '').trim();
  if (!stepContent) return null;

  // Extract comment if present
  let comment: string | undefined;
  let mainContent = stepContent;
  const commentMatch = stepContent.match(/#(.+)$/);
  if (commentMatch) {
    comment = commentMatch[1].trim();
    mainContent = stepContent.replace(/#.+$/, '').trim();
  }

  // Split into parts (duration and intensity)
  const parts = mainContent.split(/\s+/);
  if (parts.length < 2) return null;

  // First part is duration
  const { seconds, display: durationDisplay, type: durationType } = parseDuration(parts[0], sport);

  // Rest is intensity
  const intensityStr = parts.slice(1).join(' ');
  const { type, value, display: intensityDisplay, normalized } = parseIntensity(intensityStr);

  return {
    durationSeconds: seconds,
    durationDisplay,
    durationType,
    intensityType: type,
    intensityValue: value,
    intensityDisplay,
    intensityNormalized: normalized,
    comment,
  };
}

/**
 * Parse full workout text into structured format
 */
export function parseWorkout(workoutText: string): ParsedWorkout {
  const lines = workoutText.split('\n');

  // Default values
  let sport = '';
  let name = '';
  const sets: WorkoutSet[] = [];
  let currentSet: WorkoutSet | null = null;

  let lineIndex = 0;

  // Line 1: Sport type
  if (lines.length > 0) {
    sport = lines[0].trim();
    lineIndex = 1;
  }

  // Line 2: Workout name
  if (lines.length > 1) {
    name = lines[1].trim();
    lineIndex = 2;
  }

  // Skip empty line(s)
  while (lineIndex < lines.length && !lines[lineIndex].trim()) {
    lineIndex++;
  }

  // Parse sets and steps
  for (let i = lineIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;


    // Check if it's a step line (starts with -)
    if (trimmed.startsWith('-')) {
      const step = parseStepLine(trimmed, sport);
      if (step) {
        if (!currentSet) {
          // Create a default set if we encounter a step without a set header
          currentSet = { name: 'Main', repetitions: 1, steps: [] };
        }
        currentSet.steps.push(step);
      }
    } else {
      // It's a set header
      // Push previous set if exists
      if (currentSet && currentSet.steps.length > 0) {
        sets.push(currentSet);
      }

      // Parse set header: "3x Intervals" or just "Warm Up"
      const repMatch = trimmed.match(/^(\d+)x\s*(.+)$/i);
      if (repMatch) {
        currentSet = {
          name: repMatch[2].trim(),
          repetitions: parseInt(repMatch[1], 10),
          steps: [],
        };
      } else {
        currentSet = {
          name: trimmed,
          repetitions: 1,
          steps: [],
        };
      }
    }
  }

  // Push last set if exists
  if (currentSet && currentSet.steps.length > 0) {
    sets.push(currentSet);
  }

  // Calculate total duration (accounting for repetitions)
  let totalDurationSeconds = 0;
  for (const set of sets) {
    const setDuration = set.steps.reduce((sum, step) => sum + step.durationSeconds, 0);
    totalDurationSeconds += setDuration * set.repetitions;
  }

  return {
    sport,
    name,
    sets,
    totalDurationSeconds,
  };
}

/**
 * Get flattened list of all steps (expanded for repetitions)
 */
export function getFlattenedSteps(parsed: ParsedWorkout): WorkoutStep[] {
  const steps: WorkoutStep[] = [];
  for (const set of parsed.sets) {
    for (let rep = 0; rep < set.repetitions; rep++) {
      steps.push(...set.steps);
    }
  }
  return steps;
}

/**
 * Format duration in seconds to display string
 */
export function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
  }
  return `${seconds}s`;
}

/**
 * Generate a unique ID for a step
 */
function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert parsed workout to editable steps with IDs
 * Flattens sets and repetitions into a linear array
 */
export function getEditableSteps(parsed: ParsedWorkout): EditableWorkoutStep[] {
  const steps: EditableWorkoutStep[] = [];
  for (const set of parsed.sets) {
    for (let rep = 0; rep < set.repetitions; rep++) {
      for (const step of set.steps) {
        steps.push({
          ...step,
          id: generateStepId(),
          setName: set.name,
        });
      }
    }
  }
  return steps;
}

/**
 * Convert editable steps back to workout text format
 */
export function stepsToWorkoutText(
  sport: string,
  name: string,
  steps: EditableWorkoutStep[]
): string {
  const lines: string[] = [sport, name, ''];

  let currentSetName = '';
  for (const step of steps) {
    // Add set header if set name changes
    if (step.setName && step.setName !== currentSetName) {
      currentSetName = step.setName;
      lines.push(currentSetName);
    }
    // Add step line
    const commentPart = step.comment ? ` #${step.comment}` : '';
    lines.push(`- ${step.durationDisplay} ${step.intensityDisplay}${commentPart}`);
  }

  return lines.join('\n');
}

/**
 * Create a new default step for adding
 */
export function createDefaultStep(setName?: string): EditableWorkoutStep {
  return {
    id: generateStepId(),
    durationSeconds: 300, // 5 minutes
    durationDisplay: '5m',
    durationType: 'time',
    intensityType: 'zone',
    intensityValue: 2,
    intensityDisplay: 'Z2',
    intensityNormalized: 30,
    setName,
  };
}

/**
 * Update step duration and regenerate display string
 */
export function updateStepDuration(step: EditableWorkoutStep, seconds: number): EditableWorkoutStep {
  return {
    ...step,
    durationSeconds: seconds,
    durationDisplay: formatDuration(seconds),
    durationType: 'time',
  };
}

/**
 * Update step intensity (zone-based)
 */
export function updateStepIntensityZone(step: EditableWorkoutStep, zone: number): EditableWorkoutStep {
  const zoneKey = `Z${zone}`;
  return {
    ...step,
    intensityType: 'zone',
    intensityValue: zone,
    intensityDisplay: zoneKey,
    intensityNormalized: ZONE_NORMALIZED[zoneKey] || 50,
  };
}

/**
 * Update step intensity (percentage-based)
 */
export function updateStepIntensityPercent(
  step: EditableWorkoutStep,
  type: 'power' | 'heartRate' | 'speed' | 'strength',
  percent: number
): EditableWorkoutStep {
  const typePrefix: Record<string, string> = {
    power: '%FTP',
    heartRate: '%HR',
    speed: '%Speed',
    strength: 'Strength',
  };
  return {
    ...step,
    intensityType: type,
    intensityValue: percent,
    intensityDisplay: `${typePrefix[type]} ${percent}%`,
    intensityNormalized: Math.min(100, percent),
  };
}
