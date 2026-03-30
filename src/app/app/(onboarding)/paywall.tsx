import { useEffect } from "react";
import { View, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { WebPaywall } from "@/components/WebPaywall";

export default function PaywallScreen() {
  const router = useRouter();
  const { markCompleted } = useOnboardingStatus();
  const { presentPaywall } = useRevenueCat();

  const handleComplete = async () => {
    await markCompleted();
    router.replace("/(tabs)");
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      // Native: present RevenueCat paywall, then complete onboarding regardless
      presentPaywall()
        .then(() => handleComplete())
        .catch(() => handleComplete());
    }
    // Web: renders WebPaywall inline below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native: show nothing while RevenueCat paywall is being presented
  if (Platform.OS !== "web") {
    return <View className="flex-1 bg-background" />;
  }

  // Web: render WebPaywall inline
  return (
    <WebPaywall
      mode="inline"
      onDismiss={handleComplete}
      onPurchaseComplete={handleComplete}
    />
  );
}
