import React from "react";
import { View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

interface ProgressBarProps {
  step: number;       // 1-based current step
  totalSteps: number;
}

function Segment({ filled, index, isDark }: { filled: boolean; index: number; isDark: boolean }) {
  const filledColor = isDark ? "#e5e5e5" : "#1a1a1a";
  const style = useAnimatedStyle(() => ({
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: withTiming(filled ? filledColor : "rgba(128,128,128,0.15)", { duration: 300 }),
  }));

  return (
    <Animated.View
      entering={FadeIn.delay(index * 40).duration(200)}
      style={style}
    />
  );
}

export function ProgressBar({ step, totalSteps }: ProgressBarProps) {
  const { isDark } = useTheme();

  return (
    <View className="flex-row gap-1.5 px-6 pt-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <Segment key={i} filled={i < step} index={i} isDark={isDark} />
      ))}
    </View>
  );
}
