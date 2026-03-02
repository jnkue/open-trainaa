import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WorkoutIllustration } from './WorkoutIllustration';
import { getSportTranslation } from '@/utils/formatters';
import { Workout } from '@/services/training';

interface WorkoutListItemProps {
  workout: Workout;
  onPress: () => void;
}

export function WorkoutListItem({ workout, onPress }: WorkoutListItemProps) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      className="bg-card border-border rounded-xl p-4 mx-4 my-1.5 border active:opacity-70"
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header: Name and Sport Badge */}
      <View className="flex-row justify-between items-center mb-3">
        <Text
          className="text-foreground text-base font-semibold flex-1 mr-2"
          numberOfLines={1}
        >
          {workout.name}
        </Text>
        <View className="bg-muted px-2.5 py-1 rounded-md">
          <Text className="text-foreground text-xs font-medium">
            {getSportTranslation(workout.sport, t)}
          </Text>
        </View>
      </View>

      {/* Workout Illustration */}
      <WorkoutIllustration
        workoutText={workout.workout_text}
        height={32}
        style={{ marginBottom: 12 }}
      />

      {/* Footer: Duration and Source */}
      <View className="flex-row justify-between items-center">
        <Text className="text-muted-foreground text-[13px]">
          {workout.workout_minutes} min
        </Text>
        {workout.source === 'chat' && (
          <Text className="text-primary text-xs italic">
            {t('workouts.source.chat')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default WorkoutListItem;
