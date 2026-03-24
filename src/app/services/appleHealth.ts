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
} from "@kingstinct/react-native-healthkit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hkToTrainaa } from "@/utils/healthkitMapping";

const CONNECTED_KEY = "apple_health_connected";
const LAST_SYNC_KEY = "apple_health_last_sync";

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
      "HKQuantityTypeIdentifierHeartRate",
      "HKQuantityTypeIdentifierActiveEnergyBurned",
      "HKQuantityTypeIdentifierDistanceWalkingRunning",
      "HKQuantityTypeIdentifierDistanceCycling",
      "HKQuantityTypeIdentifierDistanceSwimming",
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
): Promise<HKWorkoutData[]> {
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
    uuid: w.uuid,
    workoutActivityType: w.workoutActivityType,
    startDate: new Date(w.startDate),
    endDate: new Date(w.endDate),
    duration: w.duration,
    totalDistance: w.totalDistance,
    totalEnergyBurned: w.totalEnergyBurned,
  }));
}

/**
 * Fetch heart rate samples for a given time range.
 */
export async function fetchHeartRateSamples(
  startDate: Date,
  endDate: Date,
): Promise<QuantitySample[]> {
  const samples = await queryQuantitySamples(
    "HKQuantityTypeIdentifierHeartRate",
    {
      limit: -1,
      unit: "count/min",
      filter: {
        date: {
          startDate,
          endDate,
        },
      },
    },
  );
  return samples as QuantitySample[];
}

/**
 * Convert a HealthKit workout + heart rate samples to the JSON upload payload.
 */
export function convertToUploadPayload(
  workout: HKWorkoutData,
  heartRateSamples: QuantitySample[],
) {
  const sport = hkToTrainaa(workout.workoutActivityType);

  const startTime = workout.startDate;
  const endTime = workout.endDate;
  const elapsedSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

  // Calculate HR stats from samples
  let avgHr: number | undefined;
  let maxHr: number | undefined;
  const hrValues = heartRateSamples
    .map((s) => s.quantity)
    .filter((v): v is number => v != null && v > 0);

  if (hrValues.length > 0) {
    avgHr = Math.round(
      hrValues.reduce((sum, v) => sum + v, 0) / hrValues.length,
    );
    maxHr = hrValues.reduce((max, v) => (v > max ? v : max), hrValues[0]);
  }

  // Build records from HR samples
  let records:
    | { timestamp: number[]; heart_rate: (number | null)[] }
    | undefined;

  if (heartRateSamples.length > 0) {
    records = { timestamp: [], heart_rate: [] };
    for (const sample of heartRateSamples) {
      const sampleTime = new Date(sample.startDate);
      const secondsFromStart = Math.round(
        (sampleTime.getTime() - startTime.getTime()) / 1000,
      );
      if (secondsFromStart >= 0) {
        records.timestamp.push(secondsFromStart);
        records.heart_rate.push(
          sample.quantity != null ? Math.round(sample.quantity) : null,
        );
      }
    }
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
    avg_heart_rate: avgHr,
    max_heart_rate: maxHr,
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
