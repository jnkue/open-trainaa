import React, {useState} from 'react';
import {View, TouchableOpacity, TextInput} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useTheme} from '@/contexts/ThemeContext';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Text} from '@/components/ui';
import {Spinner} from '@/components/ui/spinner';
import {useMaxHR, useUpdateMaxHR} from '@/hooks/useAnalytics';

interface MaxHRCardProps {
  sport: 'cycling' | 'running';
}

export function MaxHRCard({sport}: MaxHRCardProps) {
  const {t} = useTranslation();
  const {isDark} = useTheme();
  const {data, isLoading} = useMaxHR(sport);
  const updateMaxHR = useUpdateMaxHR();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = () => {
    setEditValue(data?.max_heart_rate?.toString() || '');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const saveEdit = () => {
    const val = parseInt(editValue, 10);
    if (val >= 100 && val <= 220) {
      updateMaxHR.mutate({sport, maxHeartRate: val});
      setIsEditing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.maxHr.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <View className="items-center justify-center py-6"><Spinner /></View>
        ) : !data?.max_heart_rate ? (
          <Text className="text-muted-foreground text-center py-4 text-sm">
            {t('analytics.maxHr.noData')}
          </Text>
        ) : isEditing ? (
          <View className="flex-row items-center gap-3">
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              keyboardType="numeric"
              maxLength={3}
              className={`text-2xl font-bold px-3 py-1 rounded-lg border ${
                isDark ? 'text-white border-gray-600 bg-gray-800' : 'text-black border-gray-300 bg-gray-50'
              }`}
              style={{width: 80}}
              autoFocus
            />
            <Text className="text-sm text-muted-foreground">{t('analytics.maxHr.bpm')}</Text>
            <View className="flex-row gap-2 ml-auto">
              <TouchableOpacity onPress={saveEdit} activeOpacity={0.7}>
                <Text className="text-sm font-medium text-primary">{t('analytics.maxHr.save')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelEdit} activeOpacity={0.7}>
                <Text className="text-sm text-muted-foreground">{t('analytics.maxHr.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-baseline gap-2">
              <Text className="text-3xl font-bold text-foreground">{data.max_heart_rate}</Text>
              <Text className="text-sm text-muted-foreground">{t('analytics.maxHr.bpm')}</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className={`px-2 py-0.5 rounded-full ${data.source === 'manual' ? 'bg-blue-500/10' : 'bg-green-500/10'}`}>
                <Text className={`text-xs ${data.source === 'manual' ? 'text-blue-500' : 'text-green-500'}`}>
                  {t(data.source === 'manual' ? 'analytics.maxHr.manual' : 'analytics.maxHr.auto')}
                </Text>
              </View>
              <TouchableOpacity onPress={startEdit} activeOpacity={0.7}>
                <Text className="text-sm text-primary">{t('analytics.maxHr.edit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
