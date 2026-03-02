// Utility functions for formatting data in the mobile app

export const formatDistance = (meters: number): string => {
  if (!meters || meters <= 0) return '0 km';
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
};

export const formatTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Unit system for velocity/pace formatting
 */
export type UnitSystem = 'metric' | 'imperial';

/**
 * Result of velocity formatting
 */
export interface VelocityFormatted {
  value: string;
  unit: string;
  label: string;
  numericValue: number;
}

/**
 * Determines if a sport should use pace (min/km or min/mile) instead of speed (km/h or mph)
 * Running, walking, and jogging activities use pace format
 *
 * @param sportType - The type of sport/activity
 * @returns true if the sport should use pace format, false for speed format
 */
export const shouldUsePace = (sportType: string): boolean => {
  if (!sportType) return false;
  const sportLower = sportType.toLowerCase();
  return sportLower.includes('run') || sportLower.includes('walk') || sportLower.includes('jog');
};

/**
 * Converts meters per second to pace format (min:sec)
 *
 * @param metersPerSecond - Velocity in meters per second
 * @param unitSystem - Unit system to use ('metric' for km, 'imperial' for miles)
 * @returns Formatted pace string (e.g., "5:42")
 */
export const formatPaceValue = (metersPerSecond: number, unitSystem: UnitSystem = 'metric'): string => {
  if (!metersPerSecond || metersPerSecond <= 0) return '-';

  // Distance conversion factor (1000m for km, 1609.34m for mile)
  const distanceInMeters = unitSystem === 'metric' ? 1000 : 1609.34;

  // Calculate minutes per distance unit
  const paceMinPerUnit = distanceInMeters / (metersPerSecond * 60);
  const minutes = Math.floor(paceMinPerUnit);
  const seconds = Math.round((paceMinPerUnit - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Converts meters per second to speed format (decimal number)
 *
 * @param metersPerSecond - Velocity in meters per second
 * @param unitSystem - Unit system to use ('metric' for km/h, 'imperial' for mph)
 * @returns Formatted speed string (e.g., "25.3")
 */
export const formatSpeedValue = (metersPerSecond: number, unitSystem: UnitSystem = 'metric'): string => {
  if (!metersPerSecond || metersPerSecond <= 0) return '-';

  // Conversion factor (3.6 for km/h, 2.23694 for mph)
  const conversionFactor = unitSystem === 'metric' ? 3.6 : 2.23694;
  const speed = metersPerSecond * conversionFactor;

  return speed.toFixed(1);
};

/**
 * Formats velocity (speed or pace) based on sport type and unit system
 * This is the main function to use for consistent velocity formatting across the app
 *
 * @param metersPerSecond - Velocity in meters per second (null/undefined returns fallback)
 * @param sportType - Type of sport/activity to determine pace vs speed
 * @param unitSystem - Unit system to use (default: 'metric')
 * @returns Formatted velocity with value, unit, label, and numeric value
 *
 * @example
 * // Running activity in metric
 * formatVelocity(3.5, 'Run') // { value: "4:46", unit: "/km", label: "Pace", numericValue: 4.76 }
 *
 * // Cycling activity in metric
 * formatVelocity(8.3, 'Ride') // { value: "29.9", unit: "km/h", label: "Speed", numericValue: 29.9 }
 *
 * // Running activity in imperial
 * formatVelocity(3.5, 'Run', 'imperial') // { value: "7:40", unit: "/mi", label: "Pace", numericValue: 7.67 }
 */
export const formatVelocity = (
  metersPerSecond: number | null | undefined,
  sportType: string,
  unitSystem: UnitSystem = 'metric'
): VelocityFormatted => {
  // Handle null/undefined/zero values
  if (!metersPerSecond || metersPerSecond <= 0) {
    const usePace = shouldUsePace(sportType);
    return {
      value: '-',
      unit: usePace
        ? (unitSystem === 'metric' ? '/km' : '/mi')
        : (unitSystem === 'metric' ? 'km/h' : 'mph'),
      label: usePace ? 'Pace' : 'Speed',
      numericValue: 0,
    };
  }

  const usePace = shouldUsePace(sportType);

  if (usePace) {
    // Pace format (min:sec per km or mile)
    const paceString = formatPaceValue(metersPerSecond, unitSystem);
    const distanceInMeters = unitSystem === 'metric' ? 1000 : 1609.34;
    const paceMinPerUnit = distanceInMeters / (metersPerSecond * 60);

    return {
      value: paceString,
      unit: unitSystem === 'metric' ? '/km' : '/mi',
      label: 'Pace',
      numericValue: paceMinPerUnit,
    };
  } else {
    // Speed format (km/h or mph)
    const speedString = formatSpeedValue(metersPerSecond, unitSystem);
    const conversionFactor = unitSystem === 'metric' ? 3.6 : 2.23694;
    const speedValue = metersPerSecond * conversionFactor;

    return {
      value: speedString,
      unit: unitSystem === 'metric' ? 'km/h' : 'mph',
      label: 'Speed',
      numericValue: speedValue,
    };
  }
};

/**
 * @deprecated Use formatVelocity() instead for consistent formatting
 * Legacy function kept for backwards compatibility
 */
export const formatPace = (metersPerSecond?: number): string => {
  if (!metersPerSecond || metersPerSecond <= 0) return '-';
  const paceString = formatPaceValue(metersPerSecond, 'metric');
  return `${paceString} /km`;
};

export const formatElevation = (meters: number): string => {
  if (!meters || meters <= 0) return '0 m';
  return `${Math.round(meters)} m`;
};

export const formatPower = (watts: number): string => {
  if (!watts || watts <= 0) return '0 W';
  return `${Math.round(watts)} W`;
};

export const formatHeartRate = (bpm: number): string => {
  if (!bpm || bpm <= 0) return '0 bpm';
  return `${Math.round(bpm)} bpm`;
};

export const formatCalories = (calories: number): string => {
  if (!calories || calories <= 0) return '0 kcal';
  return `${Math.round(calories)} kcal`;
};

export const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return dateString;
  }
};

export const formatDateShort = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (error) {
    return dateString;
  }
};

export const getActivityIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    'Run': 'figure.run',
    'Ride': 'bicycle',
    'Swim': 'figure.pool.swim',
    'Hike': 'figure.hiking',
    'Walk': 'figure.walk',
    'Workout': 'figure.strengthtraining.traditional',
    'Yoga': 'figure.mind.and.body',
    'WeightTraining': 'dumbbell',
    'Rowing': 'oar.2.crossed',
  };

  return iconMap[type] || 'figure.run';
};

/**
 * Normalizes a sport name by converting underscores to spaces and capitalizing properly.
 * This is useful for displaying backend sport types (e.g., "cross_country_skiing" -> "Cross Country Skiing").
 *
 * @param sport - The sport type/name to normalize
 * @returns The normalized sport name with proper capitalization
 */
export const normalizeSportName = (sport: string): string => {
  if (!sport) return "Training";

  // Replace underscores with spaces and capitalize each word
  return sport
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Gets the translated sport name from i18n translations
 * Falls back to normalized sport name if translation doesn't exist
 *
 * @param sport - The sport type/name to translate
 * @param t - The translation function from useTranslation hook
 * @returns The translated sport name or normalized fallback
 */
export const getSportTranslation = (sport: string, t: (key: string) => string): string => {
  if (!sport) return t("activityTypes.training");

  // Try to find the translation key for the sport
  const translationKey = `activityTypes.${sport}`;
  const translated = t(translationKey);

  // If translation exists (not the same as the key), return it
  // Otherwise, return normalized sport name
  if (translated !== translationKey) {
    return translated;
  }
  return normalizeSportName(sport);
};