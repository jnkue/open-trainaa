import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workoutService, type Workout, type PlannedWorkout } from '../services/training';

// Query keys for cache management
export const workoutKeys = {
  all: ['workouts'] as const,
  lists: () => [...workoutKeys.all, 'list'] as const,
  list: (filters: string) => [...workoutKeys.lists(), { filters }] as const,
  details: () => [...workoutKeys.all, 'detail'] as const,
  detail: (id: string) => [...workoutKeys.details(), id] as const,
  planned: () => [...workoutKeys.all, 'planned'] as const,
};

// Hook to fetch all planned workouts
export function usePlannedWorkouts() {
  return useQuery({
    queryKey: workoutKeys.planned(),
    queryFn: () => workoutService.getPlannedWorkouts(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Hook to fetch a specific workout
export function useWorkout(workoutId: string) {
  return useQuery({
    queryKey: workoutKeys.detail(workoutId),
    queryFn: () => workoutService.getWorkout(workoutId),
    enabled: !!workoutId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to fetch all workouts
export function useWorkouts() {
  return useQuery({
    queryKey: workoutKeys.lists(),
    queryFn: () => workoutService.getWorkouts(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to create a new workout
export function useCreateWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workout: Omit<Workout, 'id' | 'created_at' | 'updated_at' | 'user_id'>) =>
      workoutService.createWorkout(workout),
    onSuccess: () => {
      // Invalidate and refetch workout lists
      queryClient.invalidateQueries({ queryKey: workoutKeys.lists() });
    },
  });
}

// Hook to schedule a workout
export function useScheduleWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workoutId, scheduledTime }: { workoutId: string; scheduledTime: string }) =>
      workoutService.scheduleWorkout(workoutId, scheduledTime),
    onSuccess: () => {
      // Invalidate and refetch planned workouts
      queryClient.invalidateQueries({ queryKey: workoutKeys.planned() });
    },
  });
}

// Hook to update a workout
export function useUpdateWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workoutId, updates }: { 
      workoutId: string; 
      updates: Partial<Omit<Workout, 'id' | 'created_at' | 'user_id'>> 
    }) => workoutService.updateWorkout(workoutId, updates),
    onSuccess: (data) => {
      // Update the specific workout in cache
      queryClient.setQueryData(workoutKeys.detail(data.id), data);
      // Invalidate lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: workoutKeys.lists() });
    },
  });
}

// Hook to delete a planned workout
export function useDeletePlannedWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (plannedWorkoutId: string) =>
      workoutService.deletePlannedWorkout(plannedWorkoutId),
    onSuccess: () => {
      // Invalidate and refetch planned workouts
      queryClient.invalidateQueries({ queryKey: workoutKeys.planned() });
    },
  });
}
