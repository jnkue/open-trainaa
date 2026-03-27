import React from 'react';
import {View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Text} from '@/components/ui';
import {Spinner} from '@/components/ui/spinner';
import {useRunningPredictions} from '@/hooks/useAnalytics';

const DISTANCE_I18N_MAP: Record<string, string> = {
  '5k': 'analytics.runningPredictions.fiveK',
  '10k': 'analytics.runningPredictions.tenK',
  'half_marathon': 'analytics.runningPredictions.halfMarathon',
  'marathon': 'analytics.runningPredictions.marathon',
};

const DISTANCE_METERS: Record<string, number> = {
  '5k': 5000, '10k': 10000, 'half_marathon': 21097.5, 'marathon': 42195,
};

function formatPacePerKm(totalSeconds: number, distanceMeters: number): string {
  const secondsPerKm = totalSeconds / (distanceMeters / 1000);
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function RunningPredictions() {
  const {t} = useTranslation();
  const {data, isLoading, isError} = useRunningPredictions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.runningPredictions.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <View className="items-center justify-center py-12"><Spinner /></View>
        ) : isError ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.runningPredictions.error')}</Text>
        ) : !data ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.runningPredictions.noData')}</Text>
        ) : (
          <>
            <View className="items-center mb-5">
              <Text className="text-xs text-muted-foreground mb-1">{t('analytics.runningPredictions.vdotScore')}</Text>
              <Text className="text-4xl font-bold text-foreground">{data.vdot.toFixed(1)}</Text>
              <Text className="text-xs text-muted-foreground mt-2">{t('analytics.runningPredictions.basedOn')}</Text>
            </View>
            <View className="gap-2">
              {data.predictions.map((prediction) => {
                const distanceMeters = DISTANCE_METERS[prediction.distance] || 5000;
                const pacePerKm = formatPacePerKm(prediction.predicted_seconds, distanceMeters);
                return (
                  <View key={prediction.distance} className="flex-row items-center justify-between bg-secondary rounded-xl px-4 py-3">
                    <Text className="text-sm font-medium text-foreground">
                      {t(DISTANCE_I18N_MAP[prediction.distance] || prediction.distance)}
                    </Text>
                    <View className="items-end">
                      <Text className="text-sm font-bold text-foreground">{prediction.predicted_formatted}</Text>
                      <Text className="text-xs text-muted-foreground">{pacePerKm} {t('analytics.runningPredictions.perKm')}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
