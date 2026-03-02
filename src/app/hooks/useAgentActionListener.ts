/**
 * Hook to listen for AI agent actions and automatically invalidate query cache
 *
 * This hook monitors WebSocket messages for agent actions (like creating workouts,
 * scheduling sessions, etc.) and automatically invalidates the appropriate TanStack
 * Query cache keys to keep the UI in sync.
 *
 * Usage:
 * ```tsx
 * // In any component that needs to react to agent actions:
 * useAgentActionListener();
 * ```
 *
 * The hook will automatically:
 * - Parse action messages from the WebSocket
 * - Determine what data changed
 * - Invalidate the appropriate query keys
 * - Trigger automatic refetching of affected data
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { trainingKeys } from './useTraining';
import { workoutKeys } from './useWorkouts';
import { sessionKeys } from './useSession';
import { DeviceEventEmitter, Platform } from 'react-native';

// Action types that the AI agent can send
export interface AgentAction {
  type: 'workout_created' | 'workout_scheduled' | 'workout_updated' | 'workout_deleted'
        | 'training_plan_modified' | 'activity_uploaded' | 'session_processed'
        | 'feedback_generated' | 'general_update';
  workout_id?: string;
  session_id?: string;
  scheduled_time?: string;
  metadata?: Record<string, any>;
}

/**
 * Hook to automatically invalidate query cache when AI agent performs actions
 *
 * This is a passive hook that listens for agent actions via a custom event system.
 * The ChatInterface component should emit 'agentAction' events when it receives
 * action messages via WebSocket.
 *
 * @param enabled - Whether the listener is active (default: true)
 */
export function useAgentActionListener(enabled: boolean = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const handleAgentAction = (action: AgentAction) => {
      console.log('🤖 Agent action received:', action.type, action);

      switch (action.type) {
        case 'workout_created':
          // New workout created - refresh workout lists
          console.log('♻️ Invalidating workout queries (workout created)');
          queryClient.invalidateQueries({
            queryKey: workoutKeys.lists(),
          });
          if (action.scheduled_time) {
            // If it was also scheduled, refresh planned workouts
            queryClient.invalidateQueries({
              queryKey: workoutKeys.planned(),
            });
          }
          break;

        case 'workout_scheduled':
          // Workout scheduled - refresh planned workouts
          console.log('♻️ Invalidating planned workout queries (workout scheduled)');
          queryClient.invalidateQueries({
            queryKey: workoutKeys.planned(),
          });
          break;

        case 'workout_updated':
          // Workout updated - refresh specific workout and lists
          console.log('♻️ Invalidating workout queries (workout updated)');
          if (action.workout_id) {
            queryClient.invalidateQueries({
              queryKey: workoutKeys.detail(action.workout_id),
            });
          }
          queryClient.invalidateQueries({
            queryKey: workoutKeys.lists(),
          });
          queryClient.invalidateQueries({
            queryKey: workoutKeys.planned(),
          });
          break;

        case 'workout_deleted':
          // Workout deleted - refresh all workout queries
          console.log('♻️ Invalidating workout queries (workout deleted)');
          queryClient.invalidateQueries({
            queryKey: workoutKeys.lists(),
          });
          queryClient.invalidateQueries({
            queryKey: workoutKeys.planned(),
          });
          break;

        case 'training_plan_modified':
          // Entire training plan modified - refresh everything training-related
          console.log('♻️ Invalidating all training and workout queries (plan modified)');
          queryClient.invalidateQueries({
            queryKey: trainingKeys.all,
          });
          queryClient.invalidateQueries({
            queryKey: workoutKeys.all,
          });
          break;

        case 'activity_uploaded':
        case 'session_processed':
          // New activity/session processed - refresh training status and sessions
          console.log('♻️ Invalidating training status and sessions (new activity)');
          queryClient.invalidateQueries({
            queryKey: trainingKeys.status(),
          });
          queryClient.invalidateQueries({
            queryKey: sessionKeys.lists(),
          });
          break;

        case 'feedback_generated':
          // Feedback generated for a session - refresh that session's data
          console.log('♻️ Invalidating session queries (feedback generated)');
          if (action.session_id) {
            queryClient.invalidateQueries({
              queryKey: sessionKeys.complete(action.session_id),
            });
            queryClient.invalidateQueries({
              queryKey: sessionKeys.detail(action.session_id),
            });
          }
          break;

        case 'general_update':
        default:
          // Generic update - refresh all training and workout data to be safe
          console.log('♻️ Invalidating all queries (general update)');
          queryClient.invalidateQueries({
            queryKey: trainingKeys.all,
          });
          queryClient.invalidateQueries({
            queryKey: workoutKeys.all,
          });
          break;
      }
    };

    // Listen for agent action events using React Native's DeviceEventEmitter
    const subscription = DeviceEventEmitter.addListener('agentAction', handleAgentAction);

    console.log('👂 Agent action listener initialized');

    // Cleanup
    return () => {
      subscription.remove();
      console.log('👋 Agent action listener cleaned up');
    };
  }, [enabled, queryClient]);
}

/**
 * Helper function to emit an agent action event
 * Should be called from ChatInterface when receiving action messages
 *
 * @param action - The agent action to broadcast
 */
export function emitAgentAction(action: AgentAction) {
  DeviceEventEmitter.emit('agentAction', action);
}

/**
 * Helper function to parse action message content
 * Handles various formats that the agent might send
 *
 * @param content - Raw action message content from WebSocket
 * @returns Parsed AgentAction or null if invalid
 */
export function parseAgentAction(content: string): AgentAction | null {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content);

    // Validate required fields
    if (!parsed.type) {
      console.warn('⚠️ Action message missing type field:', parsed);
      return null;
    }

    return parsed as AgentAction;
  } catch (error) {
    console.error('❌ Failed to parse agent action:', error);
    return null;
  }
}
