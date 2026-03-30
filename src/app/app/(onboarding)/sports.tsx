import React from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { SportCard } from "@/components/onboarding/SportCard";
import { useOnboarding } from "./_layout";
import { useOnboardingSteps } from "@/hooks/useOnboardingSteps";
import type { SportSlug } from "@/types/onboarding";

const SPORTS: SportSlug[] = [
  "running",
  "trailrunning",
  "cycling",
  "gym",
  "swimming",
  "triathlon",
  "yoga",
];

export default function SportsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const { step, totalSteps } = useOnboardingSteps("sports");

  const toggleSport = (slug: SportSlug) => {
    setState((prev) => ({
      ...prev,
      sports: prev.sports.includes(slug)
        ? prev.sports.filter((s) => s !== slug)
        : [...prev.sports, slug],
    }));
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={() => router.back()}
      ctaLabel={t("onboarding.continue")}
      onCta={() => router.push("/(onboarding)/goal")}
      ctaDisabled={state.sports.length === 0 && state.customSports.trim().length === 0}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text className="text-3xl font-bold text-foreground mb-2">
          {t("onboarding.sports.title")}
        </Text>
        <Text className="text-base text-muted-foreground mb-6">
          {t("onboarding.sports.subtitle")}
        </Text>
      </Animated.View>
      <View className="flex-row flex-wrap gap-3">
        {SPORTS.map((slug, i) => (
          <SportCard
            key={slug}
            slug={slug}
            label={t(`onboarding.sports.${slug}`)}
            selected={state.sports.includes(slug)}
            onPress={() => toggleSport(slug)}
            index={i}
          />
        ))}
      </View>
      <Animated.View entering={FadeInDown.delay(200).duration(400)} className="mt-6">
        <Text className="text-sm font-medium text-foreground mb-1.5">
          {t("onboarding.sports.otherLabel")}
        </Text>
        <Input
          value={state.customSports}
          onChangeText={(text) => setState((prev) => ({ ...prev, customSports: text }))}
          placeholder={t("onboarding.sports.otherPlaceholder")}
          multiline
          numberOfLines={2}
          className="min-h-[60px]"
          textAlignVertical="top"
        />
      </Animated.View>
    </OnboardingLayout>
  );
}
