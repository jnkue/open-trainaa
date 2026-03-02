import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { CombinedDay } from '@/hooks/useCombinedTrainingDays';
import { CalendarSession } from '@/services/api';
import { HistoricalDayContent } from './HistoricalDayContent';
import { PlannedDayContent } from './PlannedDayContent';

interface DayCardProps {
  day: CombinedDay;
  sessions: CalendarSession[];
  formatDuration: (hours: number) => string;
}

export const DayCard: React.FC<DayCardProps> = ({ day, sessions, formatDuration }) => {

  const dayName = day.date.toLocaleDateString('de-DE', { weekday: 'short' });
  const dayNumber = day.date.getDate();

  // Determine card styling based on day type
  let cardClassName = 'flex-row items-center rounded-lg p-3 ';
  let dayTextClassName = 'text-xs text-muted-foreground';
  let dayNumberClassName = 'text-lg font-bold text-foreground';

  if (day.isToday) {
    cardClassName += 'bg-primary/10 border border-primary/20';
    dayTextClassName += ' font-semibold';
    dayNumberClassName = 'text-lg font-bold text-primary';
  } else if (day.isTomorrow && day.type === 'planned') {
    cardClassName += 'bg-yellow-500/10 border border-yellow-500/20';
    dayTextClassName += ' font-semibold';
    dayNumberClassName = 'text-lg font-bold text-yellow-600';
  } else {
    cardClassName += 'bg-muted/30';
  }

  const handlePress = () => {
    router.push(`/calendar?date=${day.dateString}&view=week`);
  };

  return (
    <TouchableOpacity className={cardClassName} onPress={handlePress} activeOpacity={0.7}>
      {/* Day Info */}
      <View className="w-12 items-center">
        <Text className={dayTextClassName}>{dayName}</Text>
        <Text className={dayNumberClassName}>{dayNumber}</Text>
      </View>

      {/* Training Details */}
      {day.type === 'historical' && day.trainingData ? (
        <HistoricalDayContent
          trainingData={day.trainingData}
          plannedWorkouts={day.plannedWorkouts}
          sessions={sessions}
          formatDuration={formatDuration}
        />
      ) : (
        <PlannedDayContent plannedWorkouts={day.plannedWorkouts} formatDuration={formatDuration} />
      )}
    </TouchableOpacity>
  );
};
