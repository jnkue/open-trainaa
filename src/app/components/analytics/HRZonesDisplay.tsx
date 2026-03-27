import React from 'react';
import {View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Text} from '@/components/ui';
import {Spinner} from '@/components/ui/spinner';
import {useHRZones} from '@/hooks/useAnalytics';

const ZONE_COLORS = [
  '#94a3b8',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#ef4444',
];

const ZONE_I18N_KEYS = [
  'analytics.hrZones.zone1',
  'analytics.hrZones.zone2',
  'analytics.hrZones.zone3',
  'analytics.hrZones.zone4',
  'analytics.hrZones.zone5',
];

interface HRZonesDisplayProps {
  sport: 'cycling' | 'running';
}

export function HRZonesDisplay({sport}: HRZonesDisplayProps) {
  const {t} = useTranslation();
  const {data, isLoading, isError} = useHRZones(sport);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.hrZones.title')}</CardTitle>
        {data && (
          <Text className="text-sm text-muted-foreground">
            {t('analytics.hrZones.subtitle', {lthr: Math.round(data.lthr)})}
          </Text>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <View className="items-center justify-center py-8"><Spinner /></View>
        ) : isError || !data ? (
          <Text className="text-muted-foreground text-center py-6 text-sm">
            {t('analytics.hrZones.noLthr')}
          </Text>
        ) : (
          <View className="gap-2">
            {data.zones.map((zone, index) => (
              <View key={zone.zone} className="flex-row items-center gap-3">
                <View style={{width: 6, height: 28, backgroundColor: ZONE_COLORS[index], borderRadius: 3}} />
                <View className="flex-1 flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-foreground">
                    Z{zone.zone} {t(ZONE_I18N_KEYS[index])}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {zone.max_bpm !== null
                      ? `${zone.min_bpm} - ${zone.max_bpm} bpm`
                      : `> ${zone.min_bpm} bpm`}
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
