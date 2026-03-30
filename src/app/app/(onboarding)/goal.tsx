import React from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { GoalCard } from "@/components/onboarding/GoalCard";
import { useOnboarding } from "./_layout";
import { useOnboardingSteps } from "@/hooks/useOnboardingSteps";
import type { GoalSlug } from "@/types/onboarding";

const GOALS: GoalSlug[] = [
  "breakPR",
  "buildConsistency",
  "weightManagement",
  "trainForRace",
  "stayHealthy",
  "reduceStress",
];

export default function GoalScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const { step, totalSteps } = useOnboardingSteps("goal");

  const toggleGoal = (key: GoalSlug) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.includes(key)
        ? prev.goals.filter((g) => g !== key)
        : [...prev.goals, key],
    }));
  };

  const hasRaceGoal = state.goals.includes("trainForRace");

  const handleContinue = () => {
    if (hasRaceGoal) {
      router.push("/(onboarding)/race");
    } else {
      // Clear race data if they deselected the race goal
      setState((prev) => ({ ...prev, hasRace: false, race: null }));
      router.push("/(onboarding)/days");
    }
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={() => router.back()}
      ctaLabel={t("onboarding.continue")}
      onCta={handleContinue}
      ctaDisabled={state.goals.length === 0}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text className="text-3xl font-bold text-foreground mb-2">
          {t("onboarding.goal.title")}
        </Text>
        <Text className="text-base text-muted-foreground mb-2">
          {t("onboarding.goal.subtitle")}
        </Text>
        {state.sports.length > 0 && (
          <Text className="text-sm text-muted-foreground mb-6">
            {t("onboarding.goal.personalizedSubtitle", {
              sports: state.sports
                .map((s) => t(`onboarding.sports.${s}`))
                .join(", "),
            })}
          </Text>
        )}
        {state.sports.length === 0 && <View className="mb-4" />}
      </Animated.View>
      <View className="gap-3">
        {GOALS.map((key, i) => (
          <GoalCard
            key={key}
            slug={key}
            label={t(`onboarding.goal.${key}`)}
            selected={state.goals.includes(key)}
            onPress={() => toggleGoal(key)}
            index={i}
          />
        ))}
      </View>
    </OnboardingLayout>
  );
}
