import React from 'react';
import {View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Text} from '@/components/ui';
import {Spinner} from '@/components/ui/spinner';
import {usePowerZones} from '@/hooks/useAnalytics';

const ZONE_COLORS = [
  '#94a3b8', '#3b82f6', '#22c55e', '#eab308',
  '#f97316', '#ef4444', '#a855f7',
];

const ZONE_I18N_KEYS = [
  'analytics.powerZones.zone1', 'analytics.powerZones.zone2',
  'analytics.powerZones.zone3', 'analytics.powerZones.zone4',
  'analytics.powerZones.zone5', 'analytics.powerZones.zone6',
  'analytics.powerZones.zone7',
];

export function PowerZonesDisplay() {
  const {t} = useTranslation();
  const {data, isLoading, isError} = usePowerZones();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.powerZones.title')}</CardTitle>
        {data && (
          <Text className="text-sm text-muted-foreground">
            {t('analytics.powerZones.subtitle', {cp: Math.round(data.cp_watts)})}
          </Text>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <View className="items-center justify-center py-12"><Spinner /></View>
        ) : isError ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.powerZones.error')}</Text>
        ) : !data ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.powerZones.noData')}</Text>
        ) : (
          <View className="gap-1.5">
            {data.zones.map((zone, index) => (
              <View key={zone.zone} className="flex-row items-center gap-3">
                <View style={{width: 6, height: 28, backgroundColor: ZONE_COLORS[index], borderRadius: 3}} />
                <View className="flex-1 flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-foreground">Z{zone.zone} {t(ZONE_I18N_KEYS[index])}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {zone.max_watts !== null ? `${zone.min_watts} - ${zone.max_watts} W` : `> ${zone.min_watts} W`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </CardContent>
    </Card>
  );
}
