// src/app/types/onboarding.ts

export type SportSlug =
  | "running"
  | "trailrunning"
  | "cycling"
  | "gym"
  | "swimming"
  | "triathlon"
  | "yoga";

export type GoalSlug =
  | "breakPR"
  | "buildConsistency"
  | "weightManagement"
  | "trainForRace"
  | "stayHealthy"
  | "reduceStress";

export interface RaceInfo {
  name: string;
  date: string;  // ISO date string: "YYYY-MM-DD"
  eventType: string;
}

export interface OnboardingState {
  name: string;
  sports: SportSlug[];
  goals: GoalSlug[];
  hasRace: boolean | null;  // null = not yet answered on race screen
  race: RaceInfo | null;
  trainingDaysPerWeek: number;
  weeklyTrainingHours: number;
  trainingExperienceYears: number;
  customSports: string;  // Free-text field for other sports
  trainingStrategy: string;  // AI-generated training strategy text
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  name: "",
  sports: [],
  goals: [],
  hasRace: null,
  race: null,
  trainingDaysPerWeek: 3,
  weeklyTrainingHours: 3,
  trainingExperienceYears: 1,
  customSports: "",
  trainingStrategy: "",
};

export interface RaceEvent {
  id: string;
  user_id: string;
  name: string;
  event_date: string;  // "YYYY-MM-DD"
  event_type: string | null;
  created_at: string;
  updated_at: string;
}
