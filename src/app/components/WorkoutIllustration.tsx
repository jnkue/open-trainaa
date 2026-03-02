import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { parseWorkout, getFlattenedSteps } from '@/utils/workoutParser';
import { getColorForIntensity } from '@/constants/WorkoutColors';
import { Colors } from '@/constants/Colors';

interface WorkoutIllustrationProps {
  workoutText: string;
  height?: number;
  style?: ViewStyle;
}

interface Segment {
  widthPercent: number;
  color: string;
}

export function WorkoutIllustration({
  workoutText,
  height = 48,
  style,
}: WorkoutIllustrationProps) {
  const { isDark } = useTheme();

  const segments = useMemo((): Segment[] => {
    if (!workoutText || !workoutText.trim()) {
      return [];
    }

    try {
      const parsed = parseWorkout(workoutText);
      const steps = getFlattenedSteps(parsed);

      if (steps.length === 0 || parsed.totalDurationSeconds === 0) {
        return [];
      }

      return steps.map((step) => ({
        widthPercent: (step.durationSeconds / parsed.totalDurationSeconds) * 100,
        color: getColorForIntensity(step.intensityNormalized, isDark),
      }));
    } catch (error) {
      console.warn('Failed to parse workout text:', error);
      return [];
    }
  }, [workoutText, isDark]);

  if (segments.length === 0) {
    // Return empty placeholder
    return (
      <View
        style={[
          styles.container,
          styles.emptyContainer,
          { height },
          isDark && styles.emptyContainerDark,
          style,
        ]}
      />
    );
  }

  return (
    <View style={[styles.container, { height }, style]}>
      {segments.map((segment, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            {
              flex: segment.widthPercent,
              backgroundColor: segment.color,
            },
            // Add small gap between segments for visual separation
            index < segments.length - 1 && styles.segmentGap,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  emptyContainer: {
    backgroundColor: Colors.light.muted,
  },
  emptyContainerDark: {
    backgroundColor: Colors.dark.muted,
  },
  segment: {
    height: '100%',
  },
  segmentGap: {
    marginRight: 1,
  },
});

export default WorkoutIllustration;
