import React from 'react';
import { View, Text } from 'react-native';
import { TrainingStatus } from '@/services/trainingStatus';
import { PlannedWorkout } from '@/services/training';
import { CalendarSession } from '@/services/api';
import { useCombinedTrainingDays } from '@/hooks/useCombinedTrainingDays';
import { DayCard } from './DayCard';
import { useTranslation } from 'react-i18next';

interface TrainingOverviewProps {
  weekData: TrainingStatus[];
  plannedWorkouts: PlannedWorkout[];
  sessionsByDate: Record<string, CalendarSession[]>;
}

/**
 * Format duration from hours to human-readable string
 */
function formatDuration(hours: number): string {
  if (hours === 0) return '0min';
  if (hours < 1) {
    return `${Math.round(hours * 60)}min`;
  } else {
    const fullHours = Math.floor(hours);
    const minutes = Math.round((hours - fullHours) * 60);
    if (minutes === 0) {
      return `${fullHours}h`;
    } else {
      return `${fullHours}:${minutes.toString().padStart(2, '0')}h`;
    }
  }
}

export const TrainingOverview: React.FC<TrainingOverviewProps> = ({
  weekData,
  plannedWorkouts,
  sessionsByDate,
}) => {
  const { t } = useTranslation();

  // Use the custom hook to get combined days with proper deduplication
  const combinedDays = useCombinedTrainingDays(weekData, plannedWorkouts);

  return (
    <View className="px-6 mb-6">
      <Text className="text-xl font-bold text-foreground mb-4">{t('home.trainingOverview')}</Text>

      <View className="bg-card rounded-xl p-4 border border-border">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-semibold text-foreground">{t('home.lastNextDays')}</Text>
        </View>

        <View className="space-y-1">
          {combinedDays.map((day, index) => {
            // Get sessions for this day
            const daySessions = sessionsByDate[day.dateString] || [];

            return <DayCard key={day.dateString} day={day} sessions={daySessions} formatDuration={formatDuration} />;
          })}
        </View>

        {/* Combined Summary */}
        <View className="mt-4 pt-4 border-t border-border">
          <Text className="text-sm font-semibold text-foreground mb-3">{t('home.fourteenDayOverview')}</Text>
          <View className="grid grid-cols-2 gap-4">
            <View className="space-y-2">
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">{t('home.pastWeek')}</Text>
                <Text className="text-xs font-semibold text-foreground">
                  {formatDuration(weekData.reduce((sum, day) => sum + day.daily_training_time, 0) / 60)}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">{t('home.trainingDays')}</Text>
                <Text className="text-xs font-semibold text-foreground">
                  {weekData.filter((day) => day.daily_hr_load > 0).length}/7
                </Text>
              </View>
            </View>
            <View className="space-y-2">
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">{t('home.plannedWeek')}</Text>
                <Text className="text-xs font-semibold text-foreground">
                  {formatDuration(
                    plannedWorkouts
                      .filter((workout) => {
                        const workoutDate = new Date(workout.scheduled_time);
                        const today = new Date();
                        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                        return workoutDate > today && workoutDate <= nextWeek;
                      })
                      .reduce((total, workout) => total + (workout.workout?.workout_minutes || 0), 0) / 60
                  )}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">{t('home.plannedTrainings')}</Text>
                <Text className="text-xs font-semibold text-foreground">
                  {
                    plannedWorkouts.filter((workout) => {
                      const workoutDate = new Date(workout.scheduled_time);
                      const today = new Date();
                      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                      return workoutDate > today && workoutDate <= nextWeek;
                    }).length
                  }
                  /7
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
