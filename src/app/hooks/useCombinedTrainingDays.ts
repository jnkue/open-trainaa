/**
 * Custom hook for combining historical training data with planned workouts
 * This hook ensures no duplicate days and properly merges data from different sources
 */

import { useMemo } from 'react';
import { TrainingStatus } from '@/services/trainingStatus';
import { PlannedWorkout } from '@/services/training';
import { CalendarSession } from '@/services/api';

export interface CombinedDay {
  type: 'historical' | 'planned';
  date: Date;
  dateString: string; // YYYY-MM-DD format
  isToday: boolean;
  isTomorrow: boolean;
  trainingData: TrainingStatus | null;
  plannedWorkouts: PlannedWorkout[];
}

/**
 * Normalize a date to midnight UTC and return YYYY-MM-DD string
 */
function normalizeDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Create an empty training status object for missing days
 */
function createEmptyTrainingData(dateString: string): TrainingStatus {
  return {
    date: dateString,
    fitness: 0,
    fatigue: 0,
    form: 0,
    daily_hr_load: 0,
    daily_training_time: 0,
    training_streak: 0,
    rest_days_streak: 0,
    training_days_7d: 0,
    training_monotony: 0,
    training_strain: 0,
    avg_training_time_7d: 0,
    avg_training_time_21d: 0,
    training_days_21d: 0,
    fitness_trend_7d: 0,
    fatigue_trend_7d: 0,
  };
}

export function useCombinedTrainingDays(
  weekData: TrainingStatus[],
  plannedWorkouts: PlannedWorkout[]
): CombinedDay[] {
  return useMemo(() => {
    // Use a Map to prevent duplicates - key is YYYY-MM-DD string
    const daysMap = new Map<string, CombinedDay>();

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to midnight
    const todayString = normalizeDateString(today);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowString = normalizeDateString(tomorrow);

    // Calculate 7 days ago (start of historical range)
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000); // 6 days ago + today = 7 days

    // Step 1: Add historical training days (only last 7 days)
    weekData.forEach((day) => {
      const dayDate = new Date(day.date);
      dayDate.setHours(0, 0, 0, 0); // Normalize to midnight
      const dateString = normalizeDateString(dayDate);

      // Only include if within last 7 days
      if (dayDate >= sevenDaysAgo && dayDate <= today) {
        daysMap.set(dateString, {
          type: 'historical',
          date: dayDate,
          dateString,
          isToday: dateString === todayString,
          isTomorrow: dateString === tomorrowString,
          trainingData: day,
          plannedWorkouts: [], // Will be populated in step 3
        });
      }
    });

    // Step 2: Fill gaps in the last 7 days (from 7 days ago to today)
    let currentDate = new Date(sevenDaysAgo);
    while (currentDate <= today) {
      const dateString = normalizeDateString(currentDate);

      // Only add if this date doesn't already exist
      if (!daysMap.has(dateString)) {
        daysMap.set(dateString, {
          type: 'historical',
          date: new Date(currentDate),
          dateString,
          isToday: dateString === todayString,
          isTomorrow: dateString === tomorrowString,
          trainingData: createEmptyTrainingData(dateString),
          plannedWorkouts: [],
        });
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Step 3: Add planned workouts to their respective days (both historical and future)
    plannedWorkouts.forEach((workout) => {
      const workoutDate = new Date(workout.scheduled_time);
      const dateString = normalizeDateString(workoutDate);

      // Get or create the day entry
      let dayEntry = daysMap.get(dateString);

      if (!dayEntry) {
        // This is a future day with a planned workout
        dayEntry = {
          type: 'planned',
          date: workoutDate,
          dateString,
          isToday: dateString === todayString,
          isTomorrow: dateString === tomorrowString,
          trainingData: null,
          plannedWorkouts: [],
        };
        daysMap.set(dateString, dayEntry);
      }

      // Add the planned workout to this day
      dayEntry.plannedWorkouts.push(workout);
    });

    // Step 4: Ensure we have next 7 days (even if no planned workouts)
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const dateString = normalizeDateString(futureDate);

      // Only add if this date doesn't already exist
      if (!daysMap.has(dateString)) {
        daysMap.set(dateString, {
          type: 'planned',
          date: futureDate,
          dateString,
          isToday: false,
          isTomorrow: dateString === tomorrowString,
          trainingData: null,
          plannedWorkouts: [],
        });
      }
    }

    // Step 5: Calculate the valid date range (last 7 days + next 7 days = 14 days total)
    const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Convert Map to array, filter to only include days in our 14-day window, and sort by date (oldest first)
    const sortedDays = Array.from(daysMap.values())
      .filter((day) => {
        return day.date >= sevenDaysAgo && day.date <= sevenDaysFromNow;
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return sortedDays;
  }, [weekData, plannedWorkouts]);
}
