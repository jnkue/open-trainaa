/**
 * Apple Health (HealthKit) service layer.
 *
 * Handles authorization, fetching workouts from HealthKit,
 * and converting them to TRAINAA's upload format.
 */

import { Platform } from "react-native";
import {
  requestAuthorization,
  queryWorkoutSamples,
  queryQuantitySamples,
} from "@kingstinct/react-native-healthkit";
import type {
  WorkoutActivityType,
  QuantitySample,
  QuantityTypeIdentifier,
} from "@kingstinct/react-native-healthkit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hkToTrainaa } from "@/utils/healthkitMapping";

const CONNECTED_KEY = "apple_health_connected";
const LAST_SYNC_KEY = "apple_health_last_sync";

type WorkoutProxy = Awaited<ReturnType<typeof queryWorkoutSamples>>[number];

/**
 * Workout data returned from HealthKit queries.
 */
export interface HKWorkoutData {
  uuid: string;
  workoutActivityType: WorkoutActivityType;
  startDate: Date;
  endDate: Date;
  duration: { quantity: number; unit: string };
  totalDistance?: { quantity: number; unit: string };
  totalEnergyBurned?: { quantity: number; unit: string };
}

export interface HKWorkoutWithProxy {
  data: HKWorkoutData;
  proxy: WorkoutProxy;
}

export interface RouteData {
  timestamps: number[];
  latitudes: number[];
  longitudes: number[];
  altitudes: number[];
  speeds: number[];
}

/**
 * Check if HealthKit is available (iOS only).
 */
export function isHealthKitAvailable(): boolean {
  return Platform.OS === "ios";
}

/**
 * Request HealthKit read permissions for workout data.
 * Returns true if authorization was granted.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  const result = await requestAuthorization({
    toRead: [
      "HKWorkoutTypeIdentifier",
      "HKWorkoutRouteTypeIdentifier",
      "HKQuantityTypeIdentifierHeartRate",
      "HKQuantityTypeIdentifierRunningSpeed",
      "HKQuantityTypeIdentifierCyclingSpeed",
      "HKQuantityTypeIdentifierRunningPower",
      "HKQuantityTypeIdentifierCyclingPower",
      "HKQuantityTypeIdentifierCyclingCadence",
      "HKQuantityTypeIdentifierSwimmingStrokeCount",
    ],
  });
  return result;
}

/**
 * Fetch workouts from HealthKit within a date range.
 */
export async function fetchWorkouts(
  startDate: Date,
  endDate: Date,
): Promise<HKWorkoutWithProxy[]> {
  const workouts = await queryWorkoutSamples({
    limit: -1,
    filter: {
      date: {
        startDate,
        endDate,
      },
    },
  });

  return workouts.map((w) => ({
    data: {
      uuid: w.uuid,
      workoutActivityType: w.workoutActivityType,
      startDate: new Date(w.startDate),
      endDate: new Date(w.endDate),
      duration: w.duration,
      totalDistance: w.totalDistance,
      totalEnergyBurned: w.totalEnergyBurned,
    },
    proxy: w,
  }));
}

/**
 * Fetch quantity samples for a given type and time range.
 */
async function fetchQuantitySamples(
  identifier: QuantityTypeIdentifier,
  unit: string,
  startDate: Date,
  endDate: Date,
): Promise<QuantitySample[]> {
  const samples = await queryQuantitySamples(identifier, {
    limit: -1,
    unit,
    filter: { date: { startDate, endDate } },
  });
  return samples as QuantitySample[];
}

/**
 * Fetch heart rate samples for a given time range.
 */
export async function fetchHeartRateSamples(
  startDate: Date,
  endDate: Date,
): Promise<QuantitySample[]> {
  return fetchQuantitySamples(
    "HKQuantityTypeIdentifierHeartRate",
    "count/min",
    startDate,
    endDate,
  );
}

/**
 * Fetch workout route (GPS + altitude) from a WorkoutProxy.
 */
export async function fetchWorkoutRoute(
  workout: HKWorkoutData,
  proxy: WorkoutProxy,
): Promise<RouteData | undefined> {
  try {
    const routes = await proxy.getWorkoutRoutes();
    if (!routes || routes.length === 0) return undefined;

    const allLocations: typeof routes[number]["locations"][number][] = [];
    for (const route of routes) {
      allLocations.push(...route.locations);
    }
    if (allLocations.length === 0) return undefined;

    const startMs = workout.startDate.getTime();
    const data: RouteData = {
      timestamps: [],
      latitudes: [],
      longitudes: [],
      altitudes: [],
      speeds: [],
    };

    for (const loc of allLocations) {
      const locTime = new Date(loc.date).getTime();
      const secondsFromStart = Math.round((locTime - startMs) / 1000);
      if (secondsFromStart >= 0) {
        data.timestamps.push(secondsFromStart);
        data.latitudes.push(loc.latitude);
        data.longitudes.push(loc.longitude);
        data.altitudes.push(loc.altitude);
        // CoreLocation returns -1 when speed is unavailable
        data.speeds.push(loc.speed >= 0 ? loc.speed : 0);
      }
    }

    return data;
  } catch {
    return undefined;
  }
}

/**
 * Fetch power samples (running or cycling) for a workout time range.
 */
export async function fetchPowerSamples(
  startDate: Date,
  endDate: Date,
): Promise<QuantitySample[]> {
  const [running, cycling] = await Promise.all([
    fetchQuantitySamples(
      "HKQuantityTypeIdentifierRunningPower",
      "W",
      startDate,
      endDate,
    ).catch(() => []),
    fetchQuantitySamples(
      "HKQuantityTypeIdentifierCyclingPower",
      "W",
      startDate,
      endDate,
    ).catch(() => []),
  ]);
  return running.length > 0 ? running : cycling;
}

/**
 * Fetch cadence samples (cycling cadence only).
 */
export async function fetchCadenceSamples(
  startDate: Date,
  endDate: Date,
): Promise<QuantitySample[]> {
  return fetchQuantitySamples(
    "HKQuantityTypeIdentifierCyclingCadence",
    "count/min",
    startDate,
    endDate,
  ).catch(() => []);
}

function computeStats(values: number[], round = true): { avg: number; max: number } | undefined {
  const finite = values.filter(isFinite);
  if (finite.length === 0) return undefined;
  const avg = finite.reduce((s, v) => s + v, 0) / finite.length;
  const max = finite.reduce((m, v) => (v > m ? v : m), finite[0]);
  return round ? { avg: Math.round(avg), max: Math.round(max) } : { avg, max };
}

function samplesToTimeSeries(
  samples: QuantitySample[],
  startMs: number,
): { timestamps: number[]; values: (number | null)[] } {
  const timestamps: number[] = [];
  const values: (number | null)[] = [];
  for (const sample of samples) {
    const secondsFromStart = Math.round(
      (new Date(sample.startDate).getTime() - startMs) / 1000,
    );
    if (secondsFromStart >= 0) {
      timestamps.push(secondsFromStart);
      values.push(sample.quantity != null ? Math.round(sample.quantity) : null);
    }
  }
  return { timestamps, values };
}

export interface WorkoutSamples {
  heartRate: QuantitySample[];
  power: QuantitySample[];
  cadence: QuantitySample[];
  route?: RouteData;
}

/**
 * Fetch all supplementary samples for a workout in parallel.
 */
export async function fetchWorkoutSamples(
  workout: HKWorkoutData,
  proxy: WorkoutProxy,
): Promise<WorkoutSamples> {
  const [heartRate, power, cadence, route] = await Promise.all([
    fetchHeartRateSamples(workout.startDate, workout.endDate),
    fetchPowerSamples(workout.startDate, workout.endDate),
    fetchCadenceSamples(workout.startDate, workout.endDate),
    fetchWorkoutRoute(workout, proxy),
  ]);
  return { heartRate, power, cadence, route };
}

/**
 * Compute total elevation gain from route altitude data.
 */
function computeElevationGain(altitudes: number[]): number | undefined {
  if (altitudes.length < 2) return undefined;
  let gain = 0;
  for (let i = 1; i < altitudes.length; i++) {
    const diff = altitudes[i] - altitudes[i - 1];
    if (diff > 0) gain += diff;
  }
  return gain > 0 ? Math.round(gain) : undefined;
}

/**
 * Convert a HealthKit workout + all samples to the JSON upload payload.
 */
export function convertToUploadPayload(
  workout: HKWorkoutData,
  samples: WorkoutSamples,
) {
  const sport = hkToTrainaa(workout.workoutActivityType);

  const startTime = workout.startDate;
  const endTime = workout.endDate;
  const startMs = startTime.getTime();
  const elapsedSeconds = (endTime.getTime() - startMs) / 1000;

  // HR stats
  const hrValues = samples.heartRate
    .map((s) => s.quantity)
    .filter((v): v is number => v != null && v > 0);
  const hrStats = computeStats(hrValues);

  // Power stats
  const powerValues = samples.power
    .map((s) => s.quantity)
    .filter((v): v is number => v != null && v > 0);
  const powerStats = computeStats(powerValues);

  // Cadence stats
  const cadenceValues = samples.cadence
    .map((s) => s.quantity)
    .filter((v): v is number => v != null && v > 0);
  const cadenceStats = computeStats(cadenceValues);

  // Speed stats from route (preserve decimal precision for m/s)
  const speedValues = samples.route?.speeds.filter((v) => v > 0) ?? [];
  const speedStats = computeStats(speedValues, false);

  // Elevation gain from route
  const elevationGain = samples.route
    ? computeElevationGain(samples.route.altitudes)
    : undefined;

  // Build records
  const hrSeries = samplesToTimeSeries(samples.heartRate, startMs);
  const powerSeries = samplesToTimeSeries(samples.power, startMs);
  const cadenceSeries = samplesToTimeSeries(samples.cadence, startMs);

  const hasRecords =
    hrSeries.timestamps.length > 0 ||
    powerSeries.timestamps.length > 0 ||
    samples.route;

  let records:
    | {
        timestamp: number[];
        heart_rate: (number | null)[];
        power: (number | null)[];
        cadence: (number | null)[];
        speed: (number | null)[];
        latitude: (number | null)[];
        longitude: (number | null)[];
        altitude: (number | null)[];
      }
    | undefined;

  if (hasRecords) {
    // Merge all time series onto a unified timestamp grid
    const tsSet = new Set<number>();
    hrSeries.timestamps.forEach((t) => tsSet.add(t));
    powerSeries.timestamps.forEach((t) => tsSet.add(t));
    cadenceSeries.timestamps.forEach((t) => tsSet.add(t));
    if (samples.route) samples.route.timestamps.forEach((t) => tsSet.add(t));

    const allTimestamps = Array.from(tsSet).sort((a, b) => a - b);

    // Build lookup maps
    const hrMap = new Map(
      hrSeries.timestamps.map((t, i) => [t, hrSeries.values[i]]),
    );
    const powerMap = new Map(
      powerSeries.timestamps.map((t, i) => [t, powerSeries.values[i]]),
    );
    const cadenceMap = new Map(
      cadenceSeries.timestamps.map((t, i) => [t, cadenceSeries.values[i]]),
    );

    const routeLatMap = samples.route
      ? new Map(samples.route.timestamps.map((t, i) => [t, samples.route!.latitudes[i]]))
      : undefined;
    const routeLngMap = samples.route
      ? new Map(samples.route.timestamps.map((t, i) => [t, samples.route!.longitudes[i]]))
      : undefined;
    const routeAltMap = samples.route
      ? new Map(samples.route.timestamps.map((t, i) => [t, samples.route!.altitudes[i]]))
      : undefined;
    const routeSpeedMap = samples.route
      ? new Map(samples.route.timestamps.map((t, i) => [t, samples.route!.speeds[i]]))
      : undefined;

    records = {
      timestamp: allTimestamps,
      heart_rate: allTimestamps.map((t) => hrMap.get(t) ?? null),
      power: allTimestamps.map((t) => powerMap.get(t) ?? null),
      cadence: allTimestamps.map((t) => cadenceMap.get(t) ?? null),
      speed: allTimestamps.map((t) => routeSpeedMap?.get(t) ?? null),
      latitude: allTimestamps.map((t) => routeLatMap?.get(t) ?? null),
      longitude: allTimestamps.map((t) => routeLngMap?.get(t) ?? null),
      altitude: allTimestamps.map((t) => routeAltMap?.get(t) ?? null),
    };
  }

  return {
    upload_source: "apple_health",
    external_id: workout.uuid,
    sport,
    start_time: startTime.toISOString(),
    total_distance: workout.totalDistance?.quantity,
    total_elapsed_time: elapsedSeconds > 0 ? elapsedSeconds : undefined,
    total_timer_time: workout.duration?.quantity,
    total_calories: workout.totalEnergyBurned
      ? Math.round(workout.totalEnergyBurned.quantity)
      : undefined,
    avg_heart_rate: hrStats?.avg,
    max_heart_rate: hrStats?.max,
    avg_speed: speedStats?.avg,
    max_speed: speedStats?.max,
    avg_cadence: cadenceStats?.avg,
    avg_power: powerStats?.avg,
    max_power: powerStats?.max,
    total_elevation_gain: elevationGain,
    records,
  };
}

// --- Persistence helpers ---

/**
 * Get the last sync date, or null if never synced.
 */
export async function getLastSyncDate(): Promise<Date | null> {
  const stored = await AsyncStorage.getItem(LAST_SYNC_KEY);
  if (stored) {
    return new Date(stored);
  }
  return null;
}

/**
 * Store the last sync date.
 */
export async function setLastSyncDate(date: Date): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, date.toISOString());
}

/**
 * Check if the user has previously connected Apple Health.
 */
export async function isConnected(): Promise<boolean> {
  const val = await AsyncStorage.getItem(CONNECTED_KEY);
  return val === "true";
}

/**
 * Mark Apple Health as connected.
 */
export async function setConnected(connected: boolean): Promise<void> {
  if (connected) {
    await AsyncStorage.setItem(CONNECTED_KEY, "true");
  } else {
    await AsyncStorage.removeItem(CONNECTED_KEY);
  }
}

/**
 * Clear all Apple Health tracking data (used on disconnect).
 */
export async function clearAppleHealthData(): Promise<void> {
  await AsyncStorage.multiRemove([
    CONNECTED_KEY,
    LAST_SYNC_KEY,
  ]);
}
