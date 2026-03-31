import { View, Platform } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

const isWeb = Platform.OS === "web";

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 justify-center bg-background"
      style={[
        { paddingTop: insets.top, paddingBottom: insets.bottom },
        isWeb && { alignItems: "center" },
      ]}
    >
      <View style={isWeb ? { width: "100%", maxWidth: 480, paddingHorizontal: 24 } : { paddingHorizontal: 24 }}>
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text className="text-4xl font-bold text-foreground mb-3">
            {t("onboarding.welcome.title")}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <Text className="text-base text-muted-foreground mb-10">
            {t("onboarding.welcome.subtitle")}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <Button onPress={() => router.push("/(onboarding)/sports")} className="w-full">
            <Text>{t("onboarding.welcome.cta")}</Text>
          </Button>
        </Animated.View>
      </View>
    </View>
  );
}
