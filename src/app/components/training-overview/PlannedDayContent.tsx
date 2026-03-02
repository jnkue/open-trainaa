import React from 'react';
import { View, Text } from 'react-native';
import { PlannedWorkout } from '@/services/training';
import { getSportTranslation } from '@/utils/formatters';
import { useTranslation } from 'react-i18next';

interface PlannedDayContentProps {
  plannedWorkouts: PlannedWorkout[];
  formatDuration: (hours: number) => string;
}

/**
 * Get planned intensity info based on total training time
 */
function getPlannedIntensityInfo(
  totalMinutes: number,
  title: string,
  t: (key: string) => string
): { level: string; color: string } {
  if (totalMinutes === 0) return { level: t('training.rest'), color: '#E5E7EB' };

  // Use estimated HR load based on time (rough estimate: ~1.5 HR load per minute)
  const estimatedLoad = totalMinutes * 1.5;

  if (estimatedLoad <= 30) return { level: title, color: '#D1D5DB' };
  if (estimatedLoad <= 50) return { level: title, color: '#F59E0B' };
  if (estimatedLoad <= 100) return { level: title, color: '#6EE7B7' };
  if (estimatedLoad <= 150) return { level: title, color: '#059669' };
  return { level: title, color: '#047857' };
}

export const PlannedDayContent: React.FC<PlannedDayContentProps> = ({
  plannedWorkouts,
  formatDuration,
}) => {
  const { t } = useTranslation();

  // Check if this is an explicit rest day
  const isExplicitRestDay = plannedWorkouts.some(
    (workout) => workout.workout?.sport === 'rest_day'
  );

  // Calculate total planned training time for the day (excluding rest days)
  const totalPlannedMinutes = plannedWorkouts
    .filter((workout) => workout.workout?.sport !== 'rest_day')
    .reduce((total, workout) => total + (workout.workout?.workout_minutes || 0), 0);
  const totalPlannedHours = totalPlannedMinutes / 60;

  // Get display title from workout sports
  let displayTitle = '';
  if (plannedWorkouts.length === 1) {
    displayTitle = plannedWorkouts[0].workout?.sport
      ? getSportTranslation(plannedWorkouts[0].workout.sport, t)
      : t('training.training');
  } else if (plannedWorkouts.length > 1) {
    const sports = plannedWorkouts.map((w) =>
      w.workout?.sport ? getSportTranslation(w.workout.sport, t) : t('training.training')
    );
    displayTitle = sports.length > 1 ? sports.join(' & ') : sports[0];
  }

  const intensityInfo = getPlannedIntensityInfo(totalPlannedMinutes, displayTitle, t);

  // Handle explicit rest day
  if (isExplicitRestDay) {
    const restWorkout = plannedWorkouts.find((w) => w.workout?.sport === 'rest_day');
    return (
      <View className="flex-1">
        <Text className="text-sm font-medium text-muted-foreground">{t('home.restDay')}</Text>
        <Text className="text-xs text-muted-foreground">
          {restWorkout?.workout?.name || t('home.recoveryRegeneration')}
        </Text>

        {/* Blue progress bar for explicit rest */}
        <View className="w-full h-2 bg-muted rounded-full mb-1 mt-1">
          <View
            className="h-2 rounded-full"
            style={{
              backgroundColor: '#93C5FD',
              width: '100%',
            }}
          />
        </View>
        <Text className="text-xs text-muted-foreground">{t('home.plannedRest')}</Text>
      </View>
    );
  }

  // Handle not yet planned
  if (plannedWorkouts.length === 0) {
    return (
      <View className="flex-1">
        <Text className="text-sm font-medium text-muted-foreground">{t('home.notYetPlanned')}</Text>
        <Text className="text-xs text-muted-foreground">{t('home.noWorkoutsScheduled')}</Text>

        {/* Empty gray bar */}
        <View className="w-full h-2 bg-muted rounded-full mb-1 mt-1">
          <View
            className="h-2 rounded-full"
            style={{
              backgroundColor: '#E5E7EB',
              width: '0%',
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Show individual workouts if multiple */}
      {plannedWorkouts.length === 1 ? (
        <View className="flex-row justify-between mb-2">
          <Text className="text-sm font-medium text-foreground">
            {plannedWorkouts[0].workout?.sport
              ? getSportTranslation(plannedWorkouts[0].workout.sport, t)
              : t('training.training')}
            : {plannedWorkouts[0].workout?.name || t('training.training')}
          </Text>
        </View>
      ) : (
        <View className="space-y-1">
          <View className="flex-row justify-between">
            <Text className="text-sm font-medium text-foreground">
              {plannedWorkouts.length} {t('home.trainingsPlanned')}
            </Text>
            <Text className="text-sm font-medium text-foreground">{totalPlannedMinutes} Min</Text>
          </View>
          {plannedWorkouts.slice(0, 2).map((workout, wIndex) => (
            <View key={wIndex} className="flex-row justify-between">
              <Text className="text-sm font-medium text-foreground">
                • {workout.workout?.sport ? getSportTranslation(workout.workout.sport, t) : t('training.training')}
              </Text>
            </View>
          ))}
          {plannedWorkouts.length > 2 && (
            <Text className="text-sm font-medium text-foreground">
              +{plannedWorkouts.length - 2} {t('home.moreWorkouts')}
            </Text>
          )}
        </View>
      )}

      {/* Intensity visualization similar to historical data */}
      <View className="w-full h-2 bg-muted rounded-full mb-1">
        <View
          className="h-2 rounded-full"
          style={{
            backgroundColor: intensityInfo.color,
            width: `${Math.min((totalPlannedMinutes / 120) * 100, 100)}%`, // Assuming 120min = 100%
          }}
        />
      </View>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs text-muted-foreground">{intensityInfo.level}</Text>
        <Text className="text-xs text-muted-foreground">{formatDuration(totalPlannedHours)}</Text>
      </View>
    </View>
  );
};
