import React, { useEffect, useState } from "react";
import {
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { X, MessageCircle, RefreshCw, BarChart3 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/contexts/ThemeContext";
import { apiClient, PricesResponse } from "@/services/api";

const logoWhite = require("@/assets/images/logo-white.png");
const logoBlack = require("@/assets/images/logo-black.png");

interface WebPaywallProps {
  mode: "inline" | "modal";
  onDismiss: () => void;
  onPurchaseComplete: () => void;
}

const BENEFITS = [
  { titleKey: "benefit1Title", descKey: "benefit1Desc", Icon: MessageCircle },
  { titleKey: "benefit2Title", descKey: "benefit2Desc", Icon: RefreshCw },
  { titleKey: "benefit3Title", descKey: "benefit3Desc", Icon: BarChart3 },
] as const;

export function WebPaywall({ mode, onDismiss, onPurchaseComplete }: WebPaywallProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"yearly" | "monthly">("yearly");
  const [purchasing, setPurchasing] = useState(false);
  const [dismissVisible, setDismissVisible] = useState(false);

  // CTA button pulse animation
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ),
      -1,
      true
    );
  }, [pulseScale]);

  const ctaAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Delayed dismiss button
  useEffect(() => {
    const timer = setTimeout(() => setDismissVisible(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Fetch prices
  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await apiClient.getStripePrices();
      setPrices(response);
    } catch (e) {
      console.error("Failed to fetch prices:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!prices) return;
    setPurchasing(true);
    try {
      const priceId = selectedPlan === "yearly" ? prices.yearly.price_id : prices.monthly.price_id;
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
      const successUrl = `${baseUrl}${currentPath}?checkout=success`;
      const cancelUrl = `${baseUrl}${currentPath}?checkout=cancelled`;
      const { url } = await apiClient.createStripeCheckoutSession(successUrl, cancelUrl, priceId);
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
    } catch (e) {
      console.error("Failed to create checkout session:", e);
      setPurchasing(false);
    }
  };

  // Calculate savings: compare yearly cost vs 12 months of monthly
  const yearlySavings = prices
    ? prices.monthly.amount * 12 - prices.yearly.amount
    : 0;
  const discountPercent = prices
    ? Math.round(yearlySavings / (prices.monthly.amount * 12) * 100)
    : 0;

  const isYearly = selectedPlan === "yearly";
  const iconColor = isDark ? "#a1a1aa" : "#71717a";

  const containerClass =
    mode === "modal"
      ? "absolute inset-0 z-50 bg-background"
      : "flex-1 bg-background";

  return (
    <View className={containerClass}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Constrained content card */}
        <View style={{ width: "100%", maxWidth: 440, paddingHorizontal: 24 }}>

          {/* Logo + Title */}
          <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: "center", marginBottom: 32 }}>
            <Image
              source={isDark ? logoWhite : logoBlack}
              style={{ width: 120, height: 32, alignSelf: "center" }}
              resizeMode="contain"
            />
            <Text className="text-3xl font-bold text-foreground text-center" style={{ marginTop: 16 }}>
              {t("webPaywall.title")}
            </Text>
            <Text className="text-base text-muted-foreground text-center" style={{ marginTop: 6 }}>
              {t("webPaywall.subtitle")}
            </Text>
          </Animated.View>

          {/* Benefits list */}
          <Animated.View entering={FadeInDown.delay(150).duration(500)} style={{ marginBottom: 32 }}>
            {BENEFITS.map(({ titleKey, descKey, Icon }, i) => (
              <View
                key={titleKey}
                style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: i < BENEFITS.length - 1 ? 20 : 0 }}
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
                  <Icon size={22} color={isDark ? "#60a5fa" : "#2563eb"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="text-base font-semibold text-foreground">
                    {t(`webPaywall.${titleKey}`)}
                  </Text>
                  <Text className="text-sm text-muted-foreground" style={{ marginTop: 2, lineHeight: 20 }}>
                    {t(`webPaywall.${descKey}`)}
                  </Text>
                </View>
              </View>
            ))}
          </Animated.View>

          {/* Pricing + CTA */}
          <Animated.View entering={FadeInDown.delay(300).duration(500)}>
            {loading ? (
              <View className="items-center py-8">
                <ActivityIndicator size="large" />
                <Text className="text-muted-foreground mt-2">
                  {t("webPaywall.loadingPrices")}
                </Text>
              </View>
            ) : error || !prices ? (
              <View className="items-center py-8">
                <Text className="text-muted-foreground mb-3">
                  {t("webPaywall.errorLoadingPrices")}
                </Text>
                <TouchableOpacity onPress={fetchPrices}>
                  <Text className="text-primary font-medium">
                    {t("webPaywall.retry")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Trial badge */}
                {isYearly && (
                  <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: "center", marginBottom: 14 }}>
                    <View style={{
                      backgroundColor: isDark ? "#166534" : "#dcfce7",
                      borderRadius: 100,
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                    }}>
                      <Text style={{
                        color: isDark ? "#4ade80" : "#15803d",
                        fontSize: 12,
                        fontWeight: "600",
                      }}>
                        {t("webPaywall.trialBadge")}
                      </Text>
                    </View>
                  </Animated.View>
                )}

                {/* Annual plan */}
                <TouchableOpacity
                  onPress={() => setSelectedPlan("yearly")}
                  style={{
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: isYearly ? (isDark ? "#60a5fa" : "#2563eb") : (isDark ? "#333" : "#e5e5e5"),
                    backgroundColor: isYearly ? (isDark ? "rgba(96,165,250,0.05)" : "rgba(37,99,235,0.03)") : "transparent",
                    padding: 16,
                    marginBottom: 12,
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor: isYearly ? (isDark ? "#60a5fa" : "#2563eb") : "#999",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 12,
                        }}
                      >
                        {isYearly && (
                          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: isDark ? "#60a5fa" : "#2563eb" }} />
                        )}
                      </View>
                      <Text className="text-base font-semibold text-foreground">
                        {t("webPaywall.annual")}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {discountPercent > 0 && (
                        <View style={{ backgroundColor: isDark ? "#60a5fa" : "#2563eb", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                            {t("webPaywall.discountBadge", { percent: discountPercent })}
                          </Text>
                        </View>
                      )}
                      <Text className="text-base font-semibold text-foreground">
                        {prices.yearly.formatted}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-muted-foreground" style={{ marginTop: 4, marginLeft: 34 }}>
                    {t("webPaywall.afterTrial")} {prices.yearly.monthly_equivalent}
                  </Text>
                </TouchableOpacity>

                {/* Monthly plan */}
                <TouchableOpacity
                  onPress={() => setSelectedPlan("monthly")}
                  style={{
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: !isYearly ? (isDark ? "#60a5fa" : "#2563eb") : (isDark ? "#333" : "#e5e5e5"),
                    backgroundColor: !isYearly ? (isDark ? "rgba(96,165,250,0.05)" : "rgba(37,99,235,0.03)") : "transparent",
                    padding: 16,
                    marginBottom: 24,
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor: !isYearly ? (isDark ? "#60a5fa" : "#2563eb") : "#999",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 12,
                        }}
                      >
                        {!isYearly && (
                          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: isDark ? "#60a5fa" : "#2563eb" }} />
                        )}
                      </View>
                      <Text className="text-base font-semibold text-foreground">
                        {t("webPaywall.monthly")}
                      </Text>
                    </View>
                    <Text className="text-base font-semibold text-foreground">
                      {prices.monthly.formatted}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* CTA Button */}
                <Animated.View style={ctaAnimatedStyle}>
                  <TouchableOpacity
                    onPress={handleContinue}
                    disabled={purchasing}
                    className="bg-primary rounded-2xl py-4 px-6 items-center active:opacity-90"
                  >
                    {purchasing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-primary-foreground text-lg font-bold">
                        {isYearly ? t("webPaywall.ctaTrial") : t("webPaywall.ctaNoTrial")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>

                {/* Footer links */}
                <View className="flex-row justify-center items-center mt-4 gap-4">
                  <TouchableOpacity onPress={() => Linking.openURL("https://trainaa.com/terms")}>
                    <Text className="text-xs text-muted-foreground">
                      {t("webPaywall.terms")}
                    </Text>
                  </TouchableOpacity>
                  <Text className="text-xs text-muted-foreground">|</Text>
                  <TouchableOpacity onPress={() => Linking.openURL("https://trainaa.com/privacy")}>
                    <Text className="text-xs text-muted-foreground">
                      {t("webPaywall.privacy")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      {/* Dismiss button — top right, delayed */}
      {dismissVisible && (
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{ position: "absolute", top: 16, right: 16, zIndex: 60 }}
        >
          <TouchableOpacity
            onPress={onDismiss}
            style={{ opacity: 0.4, padding: 8 }}
          >
            <X size={22} color={isDark ? "#e5e5e5" : "#1a1a1a"} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}
