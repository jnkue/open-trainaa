/**
 * Custom hooks for session data fetching using TanStack Query
 *
 * These hooks provide optimized data fetching with caching, automatic refetching,
 * and proper error handling for session-related data.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { apiClient, ActivityDetail, CreateUserFeedback, UserSessionFeedback } from '@/services/api';

// Query key factory for consistent cache management
export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (filters: string) => [...sessionKeys.lists(), { filters }] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
  complete: (id: string) => [...sessionKeys.details(), id, 'complete'] as const,
  records: (id: string) => [...sessionKeys.all, 'records', id] as const,
  userFeedback: (id: string) => [...sessionKeys.all, 'userFeedback', id] as const,
};

// Response type for the combined endpoint
export interface SessionCompleteResponse {
  session: any; // Session data with all metrics
  trainer_feedback: string | null; // LLM-generated feedback
  user_feedback: UserSessionFeedback | null; // User's own feedback
  records: any; // Array-based records data
}

/**
 * Hook to fetch complete session data in a single request
 * Combines session detail, trainer feedback, user feedback, and records
 *
 * @param sessionId - The session UUID
 * @param includeRecords - Whether to include time-series records (default: true)
 */
export function useSessionComplete(
  sessionId: string | undefined,
  includeRecords: boolean = true,
  options?: Omit<UseQueryOptions<SessionCompleteResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.complete(sessionId || ''),
    queryFn: async () => {
      console.log('🔄 Fetching session complete data for:', sessionId);
      try {
        const result = await apiClient.getSessionComplete(sessionId!, includeRecords);
        console.log('✅ Session complete data received:', {
          hasSession: !!result.session,
          hasRecords: !!result.records,
          hasFeedback: !!result.trainer_feedback,
        });
        return result;
      } catch (error) {
        console.error('❌ Error fetching session complete:', error);
        throw error;
      }
    },
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000, // 5 minutes - session data doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
    retry: 2, // Retry failed requests twice
    retryDelay: 1000, // Wait 1 second between retries
    ...options,
  });
}

/**
 * Hook to fetch only session detail (without records)
 * Use this when you only need basic session info
 *
 * @param sessionId - The session UUID
 */
export function useSessionDetail(
  sessionId: string | undefined,
  options?: Omit<UseQueryOptions<{ session: any }>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId || ''),
    queryFn: () => apiClient.getSessionDetail(sessionId!),
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook to fetch session records (time-series data)
 * Includes GPS, heart rate, power, speed, etc.
 *
 * @param sessionId - The session UUID
 * @param limit - Max number of records (default: 10000)
 */
export function useSessionRecords(
  sessionId: string | undefined,
  limit: number = 10000,
  options?: Omit<UseQueryOptions<any>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.records(sessionId || ''),
    queryFn: () => apiClient.getSessionRecords(sessionId!, limit),
    enabled: !!sessionId,
    staleTime: 60 * 60 * 1000, // 1 hour - records rarely change
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    ...options,
  });
}

/**
 * Hook to fetch user feedback for a session
 *
 * @param sessionId - The session UUID
 */
export function useUserSessionFeedback(
  sessionId: string | undefined,
  options?: Omit<UseQueryOptions<UserSessionFeedback | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: sessionKeys.userFeedback(sessionId || ''),
    queryFn: () => apiClient.getUserSessionFeedback(sessionId!),
    enabled: !!sessionId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook to save/update user feedback for a session
 * Automatically invalidates and refetches the feedback after saving
 *
 * @param sessionId - The session UUID
 */
export function useSaveUserSessionFeedback(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feedback: CreateUserFeedback) =>
      apiClient.saveUserSessionFeedback(sessionId, feedback),
    onSuccess: () => {
      // Invalidate user feedback query to trigger refetch
      queryClient.invalidateQueries({
        queryKey: sessionKeys.userFeedback(sessionId),
      });
      // Also invalidate complete session query since it includes user feedback
      queryClient.invalidateQueries({
        queryKey: sessionKeys.complete(sessionId),
      });
    },
  });
}

/**
 * Hook to delete user feedback for a session
 *
 * @param sessionId - The session UUID
 */
export function useDeleteUserSessionFeedback(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.deleteUserSessionFeedback(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.userFeedback(sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: sessionKeys.complete(sessionId),
      });
    },
  });
}


