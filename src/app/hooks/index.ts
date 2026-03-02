// Hook exports
export { useUserAttributes } from "./useUserAttributes";
export { useStravaIntegration } from "./useStravaIntegration";

// Session data hooks
export {
  useSessionComplete,
  useSessionDetail,
  useSessionRecords,
  useUserSessionFeedback,
  useSaveUserSessionFeedback,
  useDeleteUserSessionFeedback,
  useReprocessSession,
  sessionKeys,
} from "./useSession";

// Training data hooks
export {
  useCurrentTrainingStatus,
  useTrainingStatusHistory,
  usePlannedWorkouts,
  useWorkout,
  useWorkouts,
  useCreateWorkout,
  useScheduleWorkout,
  useUpdateWorkout,
  useDeletePlannedWorkout,
  useInvalidateAllTrainingData,
  useRefetchTrainingStatus,
  trainingKeys,
} from "./useTraining";

// Agent action listener
export {
  useAgentActionListener,
  emitAgentAction,
  parseAgentAction,
} from "./useAgentActionListener";
export type { AgentAction } from "./useAgentActionListener";

// Analytics consent
export { useAnalyticsConsent } from "./useAnalyticsConsent";
