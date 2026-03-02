/**
 * Custom hooks for training status data fetching using TanStack Query
 *
 * These hooks provide optimized data fetching with caching, automatic refetching,
 * and proper error handling for training status data (fitness, fatigue, form).
 *
 * For workout-related hooks, use @/hooks/useWorkouts
 *
 * IMPORTANT: These hooks automatically invalidate cache when the AI agent
 * modifies training data.
 */

import { useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { trainingStatusService, TrainingStatus } from '@/services/trainingStatus';

// Re-export workout hooks from useWorkouts for backward compatibility
export {
  usePlannedWorkouts,
  useWorkout,
  useWorkouts,
  useCreateWorkout,
  useScheduleWorkout,
  useUpdateWorkout,
  useDeletePlannedWorkout,
} from './useWorkouts';

// Query key factory for training status cache management
export const trainingKeys = {
  all: ['training'] as const,
  status: () => [...trainingKeys.all, 'status'] as const,
  currentStatus: () => [...trainingKeys.status(), 'current'] as const,
  history: () => [...trainingKeys.status(), 'history'] as const,
  historyByDays: (days: number) => [...trainingKeys.history(), days] as const,
};

/**
 * Hook to fetch current training status
 * Includes fitness, fatigue, form, and trends
 *
 * @param options - Additional TanStack Query options
 */
export function useCurrentTrainingStatus(
  options?: Omit<UseQueryOptions<TrainingStatus>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: trainingKeys.currentStatus(),
    queryFn: () => trainingStatusService.getCurrentTrainingStatus(),
    staleTime: 5 * 60 * 1000, // 5 minutes - training status changes slowly
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
    ...options,
  });
}

/**
 * Hook to fetch training status history
 * Returns daily training metrics for the specified number of days
 *
 * @param days - Number of days to fetch (default: 30)
 * @param options - Additional TanStack Query options
 */
export function useTrainingStatusHistory(
  days: number = 30,
  options?: Omit<UseQueryOptions<TrainingStatus[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: trainingKeys.historyByDays(days),
    queryFn: () => trainingStatusService.getTrainingStatusHistory(days),
    staleTime: 10 * 60 * 1000, // 10 minutes - historical data rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

/**
 * Helper function to invalidate all training status data
 * Useful when you know training status changed but aren't sure what
 */
export function useInvalidateAllTrainingData() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({
      queryKey: trainingKeys.all,
    });
  };
}

/**
 * Helper function to manually refetch current training status
 * Useful for pull-to-refresh or after completing an activity
 */
export function useRefetchTrainingStatus() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({
      queryKey: trainingKeys.status(),
    });
  };
}
