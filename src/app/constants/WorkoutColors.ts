/**
 * Workout Intensity Color Constants
 *
 * Color scheme for workout zone/intensity visualization.
 * Follows standard fitness app conventions for training zones.
 */

export interface ZoneColor {
  light: string;
  dark: string;
}

// Zone colors with light/dark variants
export const ZONE_COLORS: Record<string, ZoneColor> = {
  Z1: { light: '#64B5F6', dark: '#1E88E5' },  // Recovery - Blue
  Z2: { light: '#81C784', dark: '#43A047' },  // Endurance - Green
  Z3: { light: '#FFF176', dark: '#FDD835' },  // Tempo - Yellow
  Z4: { light: '#FFB74D', dark: '#FB8C00' },  // Threshold - Orange
  Z5: { light: '#E57373', dark: '#E53935' },  // VO2max - Red
  Z6: { light: '#BA68C8', dark: '#8E24AA' },  // Anaerobic - Purple
  Z7: { light: '#F06292', dark: '#D81B60' },  // Neuromuscular - Magenta
};

// Intensity thresholds for percentage-based coloring
const INTENSITY_THRESHOLDS = [
  { max: 20, zone: 'Z1' },
  { max: 35, zone: 'Z2' },
  { max: 50, zone: 'Z3' },
  { max: 65, zone: 'Z4' },
  { max: 80, zone: 'Z5' },
  { max: 90, zone: 'Z6' },
  { max: 100, zone: 'Z7' },
];

/**
 * Get color for a specific zone
 */
export function getZoneColor(zone: string, isDark: boolean): string {
  const zoneKey = zone.toUpperCase();
  const colors = ZONE_COLORS[zoneKey];
  if (colors) {
    return isDark ? colors.dark : colors.light;
  }
  // Default to Z2 (endurance) color
  return isDark ? ZONE_COLORS.Z2.dark : ZONE_COLORS.Z2.light;
}

/**
 * Get color for a normalized intensity (0-100)
 */
export function getColorForIntensity(percentage: number, isDark: boolean): string {
  // Clamp percentage to 0-100
  const clampedPct = Math.max(0, Math.min(100, percentage));

  // Find the appropriate zone based on intensity
  for (const threshold of INTENSITY_THRESHOLDS) {
    if (clampedPct <= threshold.max) {
      return getZoneColor(threshold.zone, isDark);
    }
  }

  // Fallback to highest zone
  return getZoneColor('Z7', isDark);
}

/**
 * Interpolate between two colors based on a ratio (0-1)
 * For smoother gradient transitions if needed in the future
 */
export function interpolateColors(color1: string, color2: string, ratio: number): string {
  // Parse hex colors
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  if (!c1 || !c2) return color1;

  // Interpolate RGB values
  const r = Math.round(c1.r + (c2.r - c1.r) * ratio);
  const g = Math.round(c1.g + (c2.g - c1.g) * ratio);
  const b = Math.round(c1.b + (c2.b - c1.b) * ratio);

  return rgbToHex(r, g, b);
}

/**
 * Convert hex color to RGB object
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB values to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Get zone label for a normalized intensity
 */
export function getZoneLabelForIntensity(percentage: number): string {
  for (const threshold of INTENSITY_THRESHOLDS) {
    if (percentage <= threshold.max) {
      return threshold.zone;
    }
  }
  return 'Z7';
}

/**
 * Zone descriptions for tooltips/labels
 */
export const ZONE_DESCRIPTIONS: Record<string, string> = {
  Z1: 'Recovery',
  Z2: 'Endurance',
  Z3: 'Tempo',
  Z4: 'Threshold',
  Z5: 'VO2max',
  Z6: 'Anaerobic',
  Z7: 'Neuromuscular',
};
