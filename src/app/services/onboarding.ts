// src/app/services/onboarding.ts
import { apiClient } from "./api";
import type { OnboardingState, SportSlug, GoalSlug } from "../types/onboarding";

const SPORT_LABELS: Record<SportSlug, string> = {
  running: "Running",
  trailrunning: "Trail Running",
  cycling: "Cycling",
  gym: "Gym",
  swimming: "Swimming",
  triathlon: "Triathlon",
  yoga: "Yoga & Stretching",
};

const GOAL_LABELS: Record<GoalSlug, string> = {
  breakPR: "Break a personal record",
  buildConsistency: "Build consistency",
  weightManagement: "Weight management",
  trainForRace: "Train for a race",
  stayHealthy: "Stay healthy & injury-free",
  reduceStress: "Reduce stress & feel better",
};

// Note: LLM context is intentionally always in English — the AI agent communicates in the user's language but processes structured data in English.
function buildLlmUserInformation(state: OnboardingState): string {
  const sports = state.sports.map((s) => SPORT_LABELS[s] ?? s).join(", ");
  const goals = state.goals.map((g) => GOAL_LABELS[g] ?? g).join(", ");

  let info =
    `Name: ${state.name}\n` +
    `Sports: ${sports || "Not specified"}\n` +
    (state.customSports ? `Additional sports: ${state.customSports}\n` : "") +
    `Training goals: ${goals || "Not specified"}\n` +
    `Training availability: ${state.trainingDaysPerWeek} days per week\n` +
    `Current weekly training volume: ${state.weeklyTrainingHours} hours/week\n` +
    `Training experience: ${state.trainingExperienceYears >= 10 ? "10+ years" : `${state.trainingExperienceYears} years`}`;

  if (state.hasRace && state.race) {
    info +=
      `\nUpcoming race: ${state.race.name} on ${state.race.date}` +
      (state.race.eventType ? ` (${state.race.eventType})` : "");
  }

  return info;
}

export async function saveOnboardingData(state: OnboardingState): Promise<void> {
  const llmUserInformation = buildLlmUserInformation(state);

  const { data: { user } } = await apiClient.supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const payload = {
    user_id: user.id,
    sports: state.sports,
    goals: state.goals,
    training_days_per_week: state.trainingDaysPerWeek,
    weekly_training_hours: state.weeklyTrainingHours,
    training_experience_years: state.trainingExperienceYears,
    custom_sports: state.customSports || null,
    name: state.name,
    onboarding_completed: true,
    llm_user_information: llmUserInformation,
  };

  const { error } = await apiClient.supabase
    .from("user_infos")
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;
}
