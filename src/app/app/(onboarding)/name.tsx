import React, { useState } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { useOnboarding } from "./_layout";
import { useOnboardingSteps } from "@/hooks/useOnboardingSteps";
import { apiClient } from "@/services/api";
import { showAlert } from "@/utils/alert";

export default function NameScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const { step, totalSteps } = useOnboardingSteps("name");
  const [loading, setLoading] = useState(false);

  // Pre-populate name from social login metadata (Google/Apple) on first mount
  React.useEffect(() => {
    if (state.name !== "") return;
    void apiClient.supabase.auth.getUser().then(({ data: { user } }) => {
      const socialName: string = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "";
      if (socialName) {
        setState((prev) => ({ ...prev, name: socialName }));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleContinue = async () => {
    setLoading(true);
    try {
      await apiClient.supabase.auth.updateUser({
        data: { full_name: state.name.trim() },
      });
      router.push("/(onboarding)/building");
    } catch (error) {
      console.error("Failed to save name:", error);
      showAlert(t("common.error"), t("onboarding.name.saveError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={() => router.back()}
      ctaLabel={t("onboarding.continue")}
      onCta={handleContinue}
      ctaDisabled={state.name.trim().length === 0}
      ctaLoading={loading}
    >
      <Animated.View entering={FadeInDown.duration(500)}>
        <Text className="text-3xl font-bold text-foreground mb-2">
          {t("onboarding.name.title")}
        </Text>
        <Text className="text-base text-muted-foreground mb-6">
          {t("onboarding.name.subtitle")}
        </Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <Input
          value={state.name}
          onChangeText={(text) => setState((prev) => ({ ...prev, name: text }))}
          placeholder={t("onboarding.name.placeholder")}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => { if (state.name.trim().length > 0) handleContinue(); }}
        />
      </Animated.View>
    </OnboardingLayout>
  );
}
