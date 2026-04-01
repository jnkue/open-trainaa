import React from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/contexts/ThemeContext";
import { lightHaptic } from "@/utils/haptics";
import { Check } from "lucide-react-native";
import {
  Footprints,
  Mountain,
  Bike,
  Dumbbell,
  Waves,
  Medal,
  StretchHorizontal,
} from "lucide-react-native";
import type { SportSlug } from "@/types/onboarding";

const SPORT_ICONS: Record<SportSlug, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  running: Footprints,
  trailrunning: Mountain,
  cycling: Bike,
  gym: Dumbbell,
  swimming: Waves,
  triathlon: Medal,
  yoga: StretchHorizontal,
};

interface SportCardProps {
  slug: SportSlug;
  label: string;
  selected: boolean;
  onPress: () => void;
  index?: number;
}

export function SportCard({ slug, label, selected, onPress, index = 0 }: SportCardProps) {
  const { isDark } = useTheme();
  const selectedColor = isDark ? "#e5e5e5" : "#1a1a1a";
  const unselectedColor = isDark ? "#6B7280" : "#9CA3AF";
  const Icon = SPORT_ICONS[slug] ?? SPORT_ICONS.running;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    lightHaptic();
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
    setTimeout(() => { scale.value = withSpring(1, { damping: 12, stiffness: 300 }); }, 80);
    onPress();
  };

  return (
    <Animated.View entering={FadeIn.delay(index * 60).duration(300)} style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        className={`flex-row items-center rounded-xl border px-4 py-3 ${
          selected
            ? "border-primary bg-primary/10"
            : "border-border bg-card"
        }`}
      >
        <View className="mr-3">
          <Icon
            size={22}
            color={selected ? selectedColor : unselectedColor}
            strokeWidth={selected ? 2.2 : 1.6}
          />
        </View>
        <Text
          className={`flex-1 text-base ${
            selected ? "text-foreground font-semibold" : "text-muted-foreground font-medium"
          }`}
        >
          {label}
        </Text>
        {selected && (
          <Check size={18} color={selectedColor} strokeWidth={2.5} />
        )}
      </Pressable>
    </Animated.View>
  );
}
