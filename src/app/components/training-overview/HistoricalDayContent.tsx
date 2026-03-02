import React from 'react';
import { View, Text } from 'react-native';
import { TrainingStatus } from '@/services/trainingStatus';
import { PlannedWorkout } from '@/services/training';
import { CalendarSession } from '@/services/api';
import { getSportTranslation } from '@/utils/formatters';
import { useTranslation } from 'react-i18next';

interface HistoricalDayContentProps {
  trainingData: TrainingStatus;
  plannedWorkouts: PlannedWorkout[];
  sessions: CalendarSession[];
  formatDuration: (hours: number) => string;
}

/**
 * Get intensity level and color based on HR load
 */
function getIntensityInfo(
  load: number,
  displayTitle: string,
  t: (key: string) => string
): { level: string; color: string } {
  if (load === 0) return { level: displayTitle || t('training.rest'), color: '#E5E7EB' };
  if (load <= 30) return { level: displayTitle, color: '#D1D5DB' };
  if (load <= 50) return { level: displayTitle, color: '#F59E0B' };
  if (load <= 100) return { level: displayTitle, color: '#6EE7B7' };
  if (load <= 150) return { level: displayTitle, color: '#059669' };
  return { level: displayTitle, color: '#047857' };
}

export const HistoricalDayContent: React.FC<HistoricalDayContentProps> = ({
  trainingData,
  plannedWorkouts,
  sessions,
  formatDuration,
}) => {
  const { t } = useTranslation();

  const timeHours = trainingData.daily_training_time / 60;
  const hasTraining = trainingData.daily_hr_load > 0;
  const hasPlannedWorkouts = plannedWorkouts && plannedWorkouts.length > 0;

  // Get display title: show sport names from sessions, or intensity level as fallback
  let displayTitle = '';
  if (sessions.length > 0) {
    // Show sport names from sessions
    const sports = sessions.map((s) => getSportTranslation(s.sport, t));
    displayTitle = sports.length > 1 ? sports.join(' & ') : sports[0];
  } else if (hasTraining) {
    // Fallback to intensity level if no session data available
    const getIntensityLevel = (load: number) => {
      if (load === 0) return t('training.rest');
      if (load <= 30) return t('training.veryLight');
      if (load <= 50) return t('training.light');
      if (load <= 100) return t('training.moderate');
      if (load <= 150) return t('training.hard');
      return t('training.veryHard');
    };
    displayTitle = getIntensityLevel(trainingData.daily_hr_load);
  }

  const intensityInfo = getIntensityInfo(trainingData.daily_hr_load, displayTitle, t);

  return (
    <View className="flex-1">
      {hasTraining ? (
        <>
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-sm font-medium text-foreground">{intensityInfo.level}</Text>
            <Text className="text-xs text-muted-foreground">{formatDuration(timeHours)}</Text>
          </View>

          <View className="w-full h-2 bg-muted rounded-full mb-1">
            <View
              className="h-2 rounded-full"
              style={{
                backgroundColor: intensityInfo.color,
                width: `${Math.min((trainingData.daily_hr_load / 150) * 100, 100)}%`,
              }}
            />
          </View>

          <View className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">
              HR Load: {trainingData.daily_hr_load.toFixed(0)}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Form: {trainingData.form > 0 ? '+' : ''}
              {trainingData.form.toFixed(1)}
            </Text>
          </View>
        </>
      ) : hasPlannedWorkouts ? (
        <>
          {/* Show planned workouts if no completed training */}
          <Text className="text-sm font-medium text-foreground">
            {plannedWorkouts.length === 1
              ? `${getSportTranslation(plannedWorkouts[0].workout?.sport || 'Training', t)}: ${plannedWorkouts[0].workout?.name || t('training.training')}`
              : `${plannedWorkouts.length} ${t('home.trainingsPlanned')}`}
          </Text>
          <Text className="text-xs text-muted-foreground mt-1">
            {plannedWorkouts.reduce((total, w) => total + (w.workout?.workout_minutes || 0), 0)} min{' '}
            {t('home.trainingPlanned')}
          </Text>
        </>
      ) : (
        <>
          <Text className="text-sm font-medium text-muted-foreground">{t('home.restDay')}</Text>
          <Text className="text-xs text-muted-foreground">{t('home.recoveryRegeneration')}</Text>
        </>
      )}
    </View>
  );
};
