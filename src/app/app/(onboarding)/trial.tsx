import React from "react";
import { View, ScrollView, Image } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gift, Target, Zap } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { useOnboarding } from "./_layout";

const logoWhite = require("@/assets/images/logo-white.png");
const logoBlack = require("@/assets/images/logo-black.png");

const GOAL_HEADLINE_KEY: Record<string, string> = {
  breakPR: "onboarding.trial.headline_breakPR",
  buildConsistency: "onboarding.trial.headline_buildConsistency",
  weightManagement: "onboarding.trial.headline_weightManagement",
  trainForRace: "onboarding.trial.headline_trainForRace",
  stayHealthy: "onboarding.trial.headline_stayHealthy",
  reduceStress: "onboarding.trial.headline_reduceStress",
};

const BENEFITS = [
  { titleKey: "onboarding.trial.benefit1Title", descKey: "onboarding.trial.benefit1Desc", Icon: Gift },
  { titleKey: "onboarding.trial.benefit2Title", descKey: "onboarding.trial.benefit2Desc", Icon: Target },
  { titleKey: "onboarding.trial.benefit3Title", descKey: "onboarding.trial.benefit3Desc", Icon: Zap },
] as const;

export default function TrialScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { state } = useOnboarding();

  const accentColor = isDark ? "#60a5fa" : "#2563eb";

  const primaryGoal = state.goals[0];
  const headlineKey = (primaryGoal && GOAL_HEADLINE_KEY[primaryGoal]) || "onboarding.trial.headline_default";

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 40,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 440, paddingHorizontal: 24 }}>
          {/* Logo + Headline */}
          <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: "center", marginBottom: 32 }}>
            <Image
              source={isDark ? logoWhite : logoBlack}
              style={{ width: 120, height: 32, alignSelf: "center" }}
              resizeMode="contain"
            />
            <Text className="text-3xl font-bold text-foreground text-center" style={{ marginTop: 16 }}>
              {t(headlineKey)}
            </Text>
            <Text className="text-base text-muted-foreground text-center" style={{ marginTop: 6, lineHeight: 22 }}>
              {t("onboarding.trial.subtitle")}
            </Text>
          </Animated.View>

          {/* Benefits */}
          <Animated.View entering={FadeInDown.delay(150).duration(500)} style={{ marginBottom: 32 }}>
            {BENEFITS.map(({ titleKey, descKey, Icon }, i) => (
              <View
                key={titleKey}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: i < BENEFITS.length - 1 ? 20 : 0,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 16,
                    backgroundColor: isDark ? "rgba(96,165,250,0.1)" : "rgba(37,99,235,0.08)",
                  }}
                >
                  <Icon size={22} color={accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="text-base font-semibold text-foreground">
                    {t(titleKey)}
                  </Text>
                  <Text className="text-sm text-muted-foreground" style={{ marginTop: 2, lineHeight: 20 }}>
                    {t(descKey)}
                  </Text>
                </View>
              </View>
            ))}
          </Animated.View>

          {/* CTA */}
          <Animated.View entering={FadeInDown.delay(300).duration(500)}>
            <Button
              onPress={() => router.replace("/(onboarding)/paywall")}
              className="w-full"
            >
              <Text>{t("onboarding.trial.cta")}</Text>
            </Button>

            <Text className="text-xs text-muted-foreground text-center" style={{ marginTop: 12, lineHeight: 18 }}>
              {t("onboarding.trial.trust")}
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}
