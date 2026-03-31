import React from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/contexts/ThemeContext";
import { lightHaptic } from "@/utils/haptics";
import {
  Trophy,
  CalendarCheck,
  Scale,
  Flag,
  Heart,
  Brain,
} from "lucide-react-native";
import type { GoalSlug } from "@/types/onboarding";

const GOAL_ICONS: Record<GoalSlug, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  breakPR: Trophy,
  buildConsistency: CalendarCheck,
  weightManagement: Scale,
  trainForRace: Flag,
  stayHealthy: Heart,
  reduceStress: Brain,
};

interface GoalCardProps {
  slug?: GoalSlug;
  label: string;
  selected: boolean;
  onPress: () => void;
  index?: number;
}

export function GoalCard({ slug, label, selected, onPress, index = 0 }: GoalCardProps) {
  const { isDark } = useTheme();
  const selectedColor = isDark ? "#e5e5e5" : "#1a1a1a";
  const unselectedColor = isDark ? "#6B7280" : "#9CA3AF";
  const Icon = slug ? GOAL_ICONS[slug] : undefined;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    lightHaptic();
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
    setTimeout(() => { scale.value = withSpring(1, { damping: 12, stiffness: 300 }); }, 80);
    onPress();
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(300)} style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        className={`flex-row items-center rounded-2xl border px-4 py-4 ${
          selected ? "border-primary bg-primary/10" : "border-border bg-card"
        }`}
      >
        {Icon && (
          <View className="mr-3">
            <Icon
              size={22}
              color={selected ? selectedColor : unselectedColor}
              strokeWidth={selected ? 2.2 : 1.6}
            />
          </View>
        )}
        <Text
          className={`text-base flex-1 ${
            selected ? "text-foreground font-semibold" : "text-muted-foreground"
          }`}
        >
          {label}
        </Text>
        <View
          className={`w-5 h-5 rounded-md border-2 items-center justify-center ${
            selected ? "border-primary bg-primary" : "border-muted-foreground/40"
          }`}
        >
          {selected && (
            <Text className="text-white text-xs font-bold leading-none">
              {"✓"}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
