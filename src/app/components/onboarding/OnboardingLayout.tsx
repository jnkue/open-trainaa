import React from "react";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ProgressBar } from "./ProgressBar";

interface OnboardingLayoutProps {
  step?: number;          // undefined = hide progress bar (interstitial, summary)
  totalSteps?: number;
  onBack?: () => void;    // undefined = hide back button
  children: React.ReactNode;
  ctaLabel: string;
  onCta: () => void;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
}

const isWeb = Platform.OS === "web";

export function OnboardingLayout({
  step,
  totalSteps = 6,
  onBack,
  children,
  ctaLabel,
  onCta,
  ctaDisabled = false,
  ctaLoading = false,
}: OnboardingLayoutProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 bg-background"
      style={[
        { paddingTop: insets.top },
        isWeb && { alignItems: "center" },
      ]}
    >
      <View
        style={isWeb ? { width: "100%", maxWidth: 480, flex: 1 } : { flex: 1 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 py-4 min-h-[52px]">
          {onBack ? (
            <TouchableOpacity onPress={onBack} hitSlop={8}>
              <Text className="text-sm text-muted-foreground">
                {t("onboarding.back")}
              </Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          {step !== undefined && (
            <Text className="text-xs text-muted-foreground">
              {t("onboarding.step", { current: step, total: totalSteps })}
            </Text>
          )}
          <View />
        </View>

        {/* Progress bar */}
        {step !== undefined && (
          <ProgressBar step={step} totalSteps={totalSteps} />
        )}

        {/* Content */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pt-6 pb-6"
          contentContainerStyle={isWeb ? { flexGrow: 0 } : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}

          {/* CTA – inline on web so it sits below content, not pinned to bottom */}
          {isWeb && (
            <View className="pt-6 pb-4">
              <Button
                onPress={onCta}
                disabled={ctaDisabled || ctaLoading}
                className="w-full"
              >
                {ctaLoading ? <Spinner size="small" /> : <Text>{ctaLabel}</Text>}
              </Button>
            </View>
          )}
        </ScrollView>

        {/* CTA – pinned to bottom on native for thumb reach */}
        {!isWeb && (
          <View
            className="px-6 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <Button
              onPress={onCta}
              disabled={ctaDisabled || ctaLoading}
              className="w-full"
            >
              {ctaLoading ? <Spinner size="small" /> : <Text>{ctaLabel}</Text>}
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}
