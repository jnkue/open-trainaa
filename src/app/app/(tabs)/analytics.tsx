import React, {useState, useCallback} from 'react';
import {View, ScrollView, RefreshControl, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '@/components/ui';
import {useQueryClient} from '@tanstack/react-query';
import {analyticsKeys} from '@/hooks/useAnalytics';
import {PowerCurveChart} from '@/components/analytics/PowerCurveChart';
import {CPTimelineChart} from '@/components/analytics/CPTimelineChart';
import {PowerZonesDisplay} from '@/components/analytics/PowerZonesDisplay';
import {RunningPredictions} from '@/components/analytics/RunningPredictions';
import {VdotTimelineChart} from '@/components/analytics/VdotTimelineChart';
import {MaxHRCard} from '@/components/analytics/MaxHRCard';
import {HRCurveChart} from '@/components/analytics/HRCurveChart';
import {HRZonesDisplay} from '@/components/analytics/HRZonesDisplay';
import {HRThresholdTimelineChart} from '@/components/analytics/HRThresholdTimelineChart';
import {EFTimelineChart} from '@/components/analytics/EFTimelineChart';

type Sport = 'cycling' | 'running';

export default function AnalyticsScreen() {
  const {t} = useTranslation();
  const [selectedSport, setSelectedSport] = useState<Sport>('cycling');
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({queryKey: analyticsKeys.all});
    setRefreshing(false);
  }, [queryClient]);

  const sportOptions: {key: Sport; label: string}[] = [
    {key: 'running', label: t('analytics.running')},
    {key: 'cycling', label: t('analytics.cycling')}
  ];

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="px-4 pt-4 pb-8">
        <Text className="text-2xl font-bold text-foreground mb-4">{t('analytics.title')}</Text>

        <View className="flex-row bg-secondary rounded-xl p-1 mb-6">
          {sportOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              onPress={() => setSelectedSport(option.key)}
              className={`flex-1 py-2.5 rounded-lg items-center ${
                selectedSport === option.key ? 'bg-background' : ''
              }`}
              activeOpacity={0.7}
            >
              <Text
                className={`text-sm font-semibold ${
                  selectedSport === option.key ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedSport === 'cycling' ? (
          <View className="gap-4">
            <PowerCurveChart />
            <CPTimelineChart />
            <PowerZonesDisplay />
            <MaxHRCard sport="cycling" />
            <HRCurveChart sport="cycling" />
            <HRZonesDisplay sport="cycling" />
            <HRThresholdTimelineChart sport="cycling" />
            <EFTimelineChart sport="cycling" />
          </View>
        ) : (
          <View className="gap-4">
            <RunningPredictions />
            <VdotTimelineChart />
            <MaxHRCard sport="running" />
            <HRCurveChart sport="running" />
            <HRZonesDisplay sport="running" />
            <HRThresholdTimelineChart sport="running" />
            <EFTimelineChart sport="running" />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
