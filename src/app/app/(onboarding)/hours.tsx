import React from "react";
import { View } from "react-native";
import AnimatedRN, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Slider from "@react-native-community/slider";
import { Text } from "@/components/ui/text";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { useOnboarding } from "./_layout";
import { useOnboardingSteps } from "@/hooks/useOnboardingSteps";
import { useTheme } from "@/contexts/ThemeContext";

export default function HoursScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const { step, totalSteps } = useOnboardingSteps("hours");
  const { isDark } = useTheme();

  const primaryColor = isDark ? "#e5e5e5" : "#1a1a1a";
  const trackColor = isDark ? "#374151" : "#e5e7eb";

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={() => router.back()}
      ctaLabel={t("onboarding.continue")}
      onCta={() => router.push("/(onboarding)/experience")}
    >
      <AnimatedRN.View entering={FadeInDown.duration(400)}>
        <Text className="text-3xl font-bold text-foreground mb-2">
          {t("onboarding.hours.title")}
        </Text>
        <Text className="text-base text-muted-foreground mb-8">
          {t("onboarding.hours.subtitle", { days: state.trainingDaysPerWeek })}
        </Text>
      </AnimatedRN.View>

      <AnimatedRN.View entering={FadeInDown.delay(150).duration(400)}>
        <Text className="text-4xl font-bold text-primary mb-4">
          {state.weeklyTrainingHours}h
        </Text>
        <Slider
          value={state.weeklyTrainingHours}
          onValueChange={(val) =>
            setState((prev) => ({ ...prev, weeklyTrainingHours: Math.round(val) }))
          }
          minimumValue={0}
          maximumValue={20}
          step={1}
          minimumTrackTintColor={primaryColor}
          maximumTrackTintColor={trackColor}
          thumbTintColor={primaryColor}
        />
        <View className="flex-row justify-between mt-1">
          <Text className="text-xs text-muted-foreground">0h</Text>
          <Text className="text-xs text-muted-foreground">20h</Text>
        </View>
      </AnimatedRN.View>
    </OnboardingLayout>
  );
}
