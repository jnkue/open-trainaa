import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  SharedValue,
} from 'react-native-reanimated';
import { EditableWorkoutStep } from '@/utils/workoutParser';
import { getColorForIntensity } from '@/constants/WorkoutColors';

interface WorkoutBlockProps {
  step: EditableWorkoutStep;
  index: number;
  totalDuration: number;
  containerWidth: number;
  containerHeight: number;
  isDark: boolean;
  isEditing: boolean;
  isDragging: boolean;
  dragX?: SharedValue<number>;
  onPress: () => void;
  onLongPress: () => void;
}

const MIN_BLOCK_WIDTH = 30;
const MIN_HEIGHT_PERCENT = 0.3; // Minimum 30% of container height

export function WorkoutBlock({
  step,
  totalDuration,
  containerWidth,
  containerHeight,
  isDark,
  isEditing,
  isDragging,
  dragX,
  onPress,
  onLongPress,
}: WorkoutBlockProps) {
  // Calculate dimensions
  const widthPercent = step.durationSeconds / totalDuration;
  const calculatedWidth = Math.max(MIN_BLOCK_WIDTH, widthPercent * containerWidth);

  // Height is based on intensity (30% to 100% of container)
  const heightPercent = MIN_HEIGHT_PERCENT + (step.intensityNormalized / 100) * (1 - MIN_HEIGHT_PERCENT);
  const blockHeight = heightPercent * containerHeight;

  // Color based on intensity
  const blockColor = getColorForIntensity(step.intensityNormalized, isDark);

  // Format duration label
  const getDurationLabel = () => {
    if (step.durationType === 'distance') {
      return step.durationDisplay;
    }

    const seconds = step.durationSeconds;
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return m > 0 ? `${h}h${m}m` : `${h}h`;
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${m}m`;
    }
    return `${seconds}s`;
  };

  // Animated styles for dragging
  const animatedStyle = useAnimatedStyle(() => {
    if (isDragging && dragX) {
      return {
        transform: [{ translateX: dragX.value }],
        zIndex: 100,
        opacity: 0.9,
      };
    }
    return {
      transform: [{ translateX: withSpring(0) }],
      zIndex: 1,
      opacity: 1,
    };
  });

  const content = (
    <View
      style={[
        styles.block,
        {
          width: calculatedWidth,
          height: blockHeight,
          backgroundColor: blockColor,
        },
        isDark && styles.blockDark,
        isDragging && styles.blockDragging,
      ]}
    >
      <Text
        style={[
          styles.durationLabel,
          isDark && styles.durationLabelDark,
          // Use dark text for light colors (Z1, Z2, Z3)
          step.intensityNormalized < 50 && !isDark && styles.durationLabelDarkText,
        ]}
        numberOfLines={1}
      >
        {getDurationLabel()}
      </Text>
      {step.intensityDisplay && calculatedWidth > 50 && (
        <Text
          style={[
            styles.intensityLabel,
            isDark && styles.intensityLabelDark,
            step.intensityNormalized < 50 && !isDark && styles.intensityLabelDarkText,
          ]}
          numberOfLines={1}
        >
          {step.intensityDisplay}
        </Text>
      )}
    </View>
  );

  if (isEditing) {
    return (
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={200}
          activeOpacity={0.7}
        >
          {content}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return <View>{content}</View>;
}

const styles = StyleSheet.create({
  block: {
    borderRadius: 6,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginHorizontal: 1,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  blockDark: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  blockDragging: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  durationLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  durationLabelDark: {
    color: '#ffffff',
  },
  durationLabelDarkText: {
    color: '#333333',
  },
  intensityLabel: {
    fontSize: 8,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginTop: 2,
  },
  intensityLabelDark: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  intensityLabelDarkText: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
});

export default WorkoutBlock;
