import { useOnboarding } from "@/app/(onboarding)/_layout";

type ScreenName = "sports" | "goal" | "race" | "days" | "hours" | "experience" | "name";

export function useOnboardingSteps(screen: ScreenName) {
  const { state } = useOnboarding();
  const hasRace = state.goals.includes("trainForRace");

  const screens: ScreenName[] = [
    "sports",
    "goal",
    ...(hasRace ? ["race" as const] : []),
    "days",
    "hours",
    "experience",
    "name",
  ];

  return {
    step: screens.indexOf(screen) + 1,
    totalSteps: screens.length,
  };
}
