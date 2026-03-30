import React from "react";
import { Pressable, View } from "react-native";
import AnimatedRN, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { useOnboarding } from "./_layout";
import { useOnboardingSteps } from "@/hooks/useOnboardingSteps";
import { lightHaptic } from "@/utils/haptics";

const DAYS_OPTIONS = [2, 3, 4, 5, 6];

export default function DaysScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const { step, totalSteps } = useOnboardingSteps("days");

  const selectDays = (days: number) => {
    lightHaptic();
    setState((prev) => ({ ...prev, trainingDaysPerWeek: days }));
  };

  const subtitle = state.sports.length > 0
    ? t("onboarding.days.subtitle", {
        sports: state.sports.map((s) => t(`onboarding.sports.${s}`)).join(", "),
      })
    : undefined;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={() => router.back()}
      ctaLabel={t("onboarding.continue")}
      onCta={() => router.push("/(onboarding)/hours")}
    >
      <AnimatedRN.View entering={FadeInDown.duration(400)}>
        <Text className="text-3xl font-bold text-foreground mb-2">
          {t("onboarding.days.title")}
        </Text>
        {subtitle && (
          <Text className="text-base text-muted-foreground mb-6">
            {subtitle}
          </Text>
        )}
        {!subtitle && <View className="mb-4" />}
      </AnimatedRN.View>

      <AnimatedRN.View entering={FadeInDown.delay(100).duration(400)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {DAYS_OPTIONS.map((days, i) => {
            const selected = state.trainingDaysPerWeek === days;
            return (
              <AnimatedRN.View
                key={days}
                entering={FadeIn.delay(200 + i * 60).duration(300)}
              >
                <Pressable
                  onPress={() => selectDays(days)}
                  style={{
                    width: 64,
                    height: 64,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 16,
                  }}
                  className={selected ? "bg-primary" : "bg-muted"}
                >
                  <Text
                    className={`text-lg font-semibold ${
                      selected ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {days}
                  </Text>
                </Pressable>
              </AnimatedRN.View>
            );
          })}
        </View>
      </AnimatedRN.View>
    </OnboardingLayout>
  );
}
