import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent, ScrollView } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  SharedValue,
  LinearTransition,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  parseWorkout,
  getEditableSteps,
  stepsToWorkoutText,
  createDefaultStep,
  EditableWorkoutStep,
  formatDuration,
} from '@/utils/workoutParser';
import { getColorForIntensity } from '@/constants/WorkoutColors';
import { Colors } from '@/constants/Colors';

interface WorkoutBuilderProps {
  workoutText: string;
  sport: string;
  workoutName: string;
  onWorkoutChange: (newText: string) => void;
  isEditing: boolean;
  onStepPress?: (step: EditableWorkoutStep, index: number) => void;
  height?: number;
}

interface DraggableBlockProps {
  step: EditableWorkoutStep;
  index: number;
  position: { x: number; width: number };
  blockHeight: number;
  blockColor: string;
  isDark: boolean;
  isDraggingThis: boolean;
  dragX: SharedValue<number>;
  onPress: () => void;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragUpdate: (translationX: number, index: number, positionX: number, width: number) => void;
}

const MIN_BLOCK_WIDTH = 30;
const MIN_HEIGHT_PERCENT = 0.3;
const TIME_AXIS_HEIGHT = 20;
const BLOCK_GAP = 2;

// Separate component for draggable blocks to properly use hooks
function DraggableBlock({
  step,
  index,
  position,
  blockHeight,
  blockColor,
  isDark,
  isDraggingThis,
  dragX,
  onPress,
  onDragStart,
  onDragEnd,
  onDragUpdate,
}: DraggableBlockProps) {
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
      return `${m}m`;
    }
    return `${seconds}s`;
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      runOnJS(onDragStart)(index);
    })
    .onUpdate((event) => {
      'worklet';
      dragX.value = event.translationX;
      runOnJS(onDragUpdate)(event.translationX, index, position.x, position.width);
    })
    .onEnd(() => {
      'worklet';
      dragX.value = withSpring(0);
      runOnJS(onDragEnd)();
    });

  const animatedStyle = useAnimatedStyle(() => {
    if (isDraggingThis) {
      return {
        transform: [{ translateX: dragX.value }],
        zIndex: 999, // Ensure dragged item is always on top
      };
    }
    return {
      transform: [{ translateX: 0 }],
      zIndex: 1,
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        layout={LinearTransition.springify().damping(15)}
        style={[
          styles.blockWrapper,
          { left: position.x },
          animatedStyle,
        ]}
      >
        <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
          <View
            style={[
              styles.block,
              {
                width: position.width,
                height: blockHeight,
                backgroundColor: blockColor,
              },
              isDraggingThis && styles.blockDragging,
            ]}
          >
            {position.width > 25 && (
              <Text
                style={[
                  styles.durationLabel,
                  step.intensityNormalized < 50 && !isDark && styles.durationLabelDarkText,
                ]}
                numberOfLines={1}
              >
                {getDurationLabel()}
              </Text>
            )}
            {position.width > 45 && (
              <Text
                style={[
                  styles.intensityLabel,
                  step.intensityNormalized < 50 && !isDark && styles.intensityLabelDarkText,
                ]}
                numberOfLines={1}
              >
                {step.intensityDisplay}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

// Static block (non-draggable) for view mode
function StaticBlock({
  step,
  position,
  blockHeight,
  blockColor,
  isDark,
}: {
  step: EditableWorkoutStep;
  position: { x: number; width: number };
  blockHeight: number;
  blockColor: string;
  isDark: boolean;
}) {
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
      return `${m}m`;
    }
    return `${seconds}s`;
  };

  return (
    <Animated.View 
      layout={LinearTransition.springify().damping(15)}
      style={[styles.blockWrapper, { left: position.x }]}
    >
      <View
        style={[
          styles.block,
          {
            width: position.width,
            height: blockHeight,
            backgroundColor: blockColor,
          },
        ]}
      >
        {position.width > 25 && (
          <Text
            style={[
              styles.durationLabel,
              step.intensityNormalized < 50 && !isDark && styles.durationLabelDarkText,
            ]}
            numberOfLines={1}
          >
            {getDurationLabel()}
          </Text>
        )}
        {position.width > 45 && (
          <Text
            style={[
              styles.intensityLabel,
              step.intensityNormalized < 50 && !isDark && styles.intensityLabelDarkText,
            ]}
            numberOfLines={1}
          >
            {step.intensityDisplay}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

export function WorkoutBuilder({
  workoutText,
  sport,
  workoutName,
  onWorkoutChange,
  isEditing,
  onStepPress,
  height = 120,
}: WorkoutBuilderProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [containerWidth, setContainerWidth] = useState(300);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const stepOrderRef = React.useRef<EditableWorkoutStep[]>([]);

  // Parse workout text into editable steps
  const { steps, totalDuration } = useMemo(() => {
    try {
      const parsed = parseWorkout(workoutText);
      const editableSteps = getEditableSteps(parsed);
      return {
        steps: editableSteps,
        totalDuration: parsed.totalDurationSeconds,
      };
    } catch {
      return { steps: [], totalDuration: 0 };
    }
  }, [workoutText]);

  // State for step positions (for reordering)
  const [stepOrder, setStepOrder] = useState<EditableWorkoutStep[]>(steps);

  // Update step order when steps change from parsing
  React.useEffect(() => {
    setStepOrder(steps);
    stepOrderRef.current = steps;
  }, [steps]);

  // Shared value for drag animation
  const dragX = useSharedValue(0);

  // Handle layout
  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  // Calculate block positions - allow content to be wider than container for scrolling
  const { blockPositions, totalContentWidth } = useMemo(() => {
    if (totalDuration === 0) return { blockPositions: [], totalContentWidth: 0 };

    const totalGaps = BLOCK_GAP * (stepOrder.length - 1);
    const availableWidth = containerWidth - totalGaps - 8; // 8 for padding

    // Calculate what width each step would get proportionally
    const proportionalWidths = stepOrder.map(step =>
      (step.durationSeconds / totalDuration) * availableWidth
    );

    // Check if any step would be smaller than MIN_BLOCK_WIDTH
    const needsScroll = proportionalWidths.some(w => w < MIN_BLOCK_WIDTH);

    let positions: { x: number; width: number }[] = [];
    let currentX = 0;

    if (needsScroll) {
      // Use minimum widths and allow scrolling
      positions = stepOrder.map((step) => {
        const widthPercent = step.durationSeconds / totalDuration;
        // Give each block at least MIN_BLOCK_WIDTH, but scale up proportionally for longer steps
        const width = Math.max(MIN_BLOCK_WIDTH, widthPercent * Math.max(availableWidth, stepOrder.length * MIN_BLOCK_WIDTH));
        const pos = { x: currentX, width };
        currentX += width + BLOCK_GAP;
        return pos;
      });
    } else {
      // Fit everything in container
      positions = stepOrder.map((step) => {
        const widthPercent = step.durationSeconds / totalDuration;
        const width = Math.max(MIN_BLOCK_WIDTH, widthPercent * availableWidth);
        const pos = { x: currentX, width };
        currentX += width + BLOCK_GAP;
        return pos;
      });
    }

    return {
      blockPositions: positions,
      totalContentWidth: currentX + 40 // +40 for add button space
    };
  }, [stepOrder, totalDuration, containerWidth]);

  // Handle reorder
  // Handle reorder
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;

      const newOrder = [...stepOrder];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);

      setStepOrder(newOrder);
      stepOrderRef.current = newOrder;
    },
    [stepOrder]
  );

  // Handle step press (for editing)
  const handleStepPress = useCallback(
    (step: EditableWorkoutStep, index: number) => {
      if (onStepPress) {
        onStepPress(step, index);
      }
    },
    [onStepPress]
  );

  // Handle add step
  const handleAddStep = useCallback(() => {
    const lastStep = stepOrder[stepOrder.length - 1];
    const newStep = createDefaultStep(lastStep?.setName);
    const newOrder = [...stepOrder, newStep];

    setStepOrder(newOrder);
    stepOrderRef.current = newOrder;
    const newText = stepsToWorkoutText(sport, workoutName, newOrder);
    onWorkoutChange(newText);
  }, [stepOrder, sport, workoutName, onWorkoutChange]);

  // Handle drag callbacks
  const handleDragStart = useCallback((index: number) => {
    setDraggingIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null);
    // Commit changes to parent
    const newText = stepsToWorkoutText(sport, workoutName, stepOrderRef.current);
    onWorkoutChange(newText);
  }, [sport, workoutName, onWorkoutChange]);

  const handleDragUpdate = useCallback(
    (translationX: number, index: number, positionX: number, width: number) => {
      // Calculate which position we're over
      const currentPos = positionX + translationX + width / 2;
      let targetIndex = index;

      for (let i = 0; i < blockPositions.length; i++) {
        const bp = blockPositions[i];
        // Add a buffer to prevent flickering when near the edge
        if (currentPos >= bp.x && currentPos < bp.x + bp.width) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex !== index && targetIndex >= 0 && targetIndex < stepOrder.length) {
        // Debounce reordering slightly or just ensure we don't swap too aggressively
        handleReorder(index, targetIndex);
        setDraggingIndex(targetIndex);
      }
    },
    [blockPositions, stepOrder.length, handleReorder]
  );

  // Time axis labels
  const timeLabels = useMemo(() => {
    if (totalDuration === 0) return [];

    const labelCount = Math.min(5, Math.max(2, Math.floor(containerWidth / 80)));
    const labels = [];

    for (let i = 0; i <= labelCount; i++) {
      const time = (totalDuration / labelCount) * i;
      const x = (containerWidth / labelCount) * i;
      labels.push({ time, x, label: formatDuration(Math.round(time)) });
    }

    return labels;
  }, [totalDuration, containerWidth]);

  // Block height calculation
  const blockContainerHeight = height - TIME_AXIS_HEIGHT;

  if (stepOrder.length === 0) {
    return (
      <View style={[styles.container, { height }, isDark && styles.containerDark]} onLayout={onLayout}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
            {t('workouts.noWorkouts', 'No workout steps')}
          </Text>
          {isEditing && (
            <TouchableOpacity style={styles.addButton} onPress={handleAddStep}>
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const needsScroll = totalContentWidth > containerWidth;

  return (
    <View style={[styles.container, { height }, isDark && styles.containerDark]} onLayout={onLayout}>
      {/* Scrollable blocks container */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={needsScroll}
        scrollEnabled={needsScroll}
        contentContainerStyle={[
          styles.scrollContent,
          { width: Math.max(totalContentWidth, containerWidth - 8), height: blockContainerHeight }
        ]}
      >
        <View style={[styles.blocksContainer, { height: blockContainerHeight, width: totalContentWidth }]}>
          {stepOrder.map((step, index) => {
            const position = blockPositions[index];
            if (!position) return null;

            const heightPercent = MIN_HEIGHT_PERCENT + (step.intensityNormalized / 100) * (1 - MIN_HEIGHT_PERCENT);
            const blockHeight = heightPercent * blockContainerHeight;
            const blockColor = getColorForIntensity(step.intensityNormalized, isDark);

            if (isEditing) {
              return (
                <DraggableBlock
                  key={step.id}
                  step={step}
                  index={index}
                  position={position}
                  blockHeight={blockHeight}
                  blockColor={blockColor}
                  isDark={isDark}
                  isDraggingThis={draggingIndex === index}
                  dragX={dragX}
                  onPress={() => handleStepPress(step, index)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragUpdate={handleDragUpdate}
                />
              );
            }

            return (
              <StaticBlock
                key={step.id}
                step={step}
                position={position}
                blockHeight={blockHeight}
                blockColor={blockColor}
                isDark={isDark}
              />
            );
          })}

          {/* Add button - inside scrollable area */}
          {isEditing && (
            <TouchableOpacity
              style={[
                styles.addStepButton,
                {
                  left: blockPositions.length > 0
                    ? blockPositions[blockPositions.length - 1].x + blockPositions[blockPositions.length - 1].width + BLOCK_GAP
                    : 0,
                  height: blockContainerHeight * 0.5,
                },
                isDark && styles.addStepButtonDark,
              ]}
              onPress={handleAddStep}
            >
              <Text style={[styles.addStepButtonText, isDark && styles.addStepButtonTextDark]}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Time axis */}
      <View style={styles.timeAxis}>
        {timeLabels.map((label, index) => (
          <Text
            key={index}
            style={[
              styles.timeLabel,
              isDark && styles.timeLabelDark,
              {
                position: 'absolute',
                left: label.x,
                transform: [{ translateX: index === 0 ? 0 : index === timeLabels.length - 1 ? -30 : -15 }],
              },
            ]}
          >
            {label.label}
          </Text>
        ))}
      </View>

      {/* Hint text */}
      {isEditing && (
        <Text style={[styles.hintText, isDark && styles.hintTextDark]}>
          {t('workoutBuilder.dragToReorder', 'Drag to reorder, tap to edit')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.light.muted,
  },
  containerDark: {
    backgroundColor: Colors.dark.muted,
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  blocksContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
    paddingTop: 4,
  },
  blockWrapper: {
    position: 'absolute',
    bottom: 0,
  },
  block: {
    borderRadius: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  blockDragging: {
    opacity: 0.9,
    transform: [{ scale: 1.05 }],
    zIndex: 100,
  },
  durationLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  durationLabelDarkText: {
    color: '#333333',
  },
  intensityLabel: {
    fontSize: 8,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginTop: 1,
  },
  intensityLabelDarkText: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
  timeAxis: {
    height: TIME_AXIS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    position: 'relative',
  },
  timeLabel: {
    fontSize: 9,
    color: Colors.light.icon,
  },
  timeLabelDark: {
    color: Colors.dark.icon,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.icon,
  },
  emptyTextDark: {
    color: Colors.dark.icon,
  },
  addButton: {
    marginTop: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '600',
  },
  addStepButton: {
    position: 'absolute',
    bottom: 0,
    width: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  addStepButtonDark: {
    borderColor: Colors.dark.border,
  },
  addStepButtonText: {
    fontSize: 20,
    color: Colors.light.tint,
    fontWeight: '600',
  },
  addStepButtonTextDark: {
    color: Colors.dark.icon,
  },
  hintText: {
    fontSize: 10,
    color: Colors.light.icon,
    textAlign: 'center',
    paddingVertical: 4,
    fontStyle: 'italic',
  },
  hintTextDark: {
    color: Colors.dark.icon,
  },
});

export default WorkoutBuilder;
