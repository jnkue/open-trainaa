import React, { useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { RaceForm } from "@/components/onboarding/RaceForm";
import { useOnboarding } from "./_layout";
import { useOnboardingSteps } from "@/hooks/useOnboardingSteps";
import type { RaceInfo } from "@/types/onboarding";

export default function RaceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const { step, totalSteps } = useOnboardingSteps("race");
  const [selected, setSelected] = useState<"yes" | "no" | null>(
    state.hasRace === true ? "yes" : state.hasRace === false ? "no" : null
  );

  const handleYes = () => {
    setSelected("yes");
    setState((prev) => ({
      ...prev,
      hasRace: true,
      race: prev.race ?? { name: "", date: "", eventType: "" },
    }));
  };

  const handleNo = () => {
    setSelected("no");
    setState((prev) => ({ ...prev, hasRace: false, race: null }));
  };

  const handleRaceChange = (value: RaceInfo) => {
    setState((prev) => ({ ...prev, race: value }));
  };

  const ctaDisabled =
    selected === null ||
    (state.hasRace === true && (!state.race?.name?.trim() || !state.race?.date));

  // Race screen is always step 4 of 5 (only shown when trainForRace goal is selected)
  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={() => router.back()}
      ctaLabel={t("onboarding.continue")}
      onCta={() => router.push("/(onboarding)/days")}
      ctaDisabled={ctaDisabled}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text className="text-3xl font-bold text-foreground mb-2">
          {t("onboarding.race.title")}
        </Text>
        <Text className="text-base text-muted-foreground mb-6">
          {t("onboarding.race.subtitle")}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(400)}>
        <View className="flex-row gap-3 mb-6">
          <Button
            onPress={handleYes}
            variant={selected === "yes" ? "default" : "outline"}
            className="flex-1"
          >
            <Text>{t("onboarding.race.yesButton")}</Text>
          </Button>
          <Button
            onPress={handleNo}
            variant={selected === "no" ? "default" : "outline"}
            className="flex-1"
          >
            <Text>{t("onboarding.race.noButton")}</Text>
          </Button>
        </View>
      </Animated.View>

      {selected === "yes" && state.race && (
        <Animated.View entering={FadeInDown.duration(300)}>
          <RaceForm value={state.race} onChange={handleRaceChange} />
        </Animated.View>
      )}
    </OnboardingLayout>
  );
}
