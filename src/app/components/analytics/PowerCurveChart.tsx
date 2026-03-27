import React, {useCallback, useMemo, useRef, useState} from 'react';
import {View, LayoutChangeEvent, PanResponder, Platform} from 'react-native';
import Svg, {Path, Line, Text as SvgText, Circle, Rect, G} from 'react-native-svg';
import {useTranslation} from 'react-i18next';
import {useTheme} from '@/contexts/ThemeContext';
import {COLORS} from '@/lib/colors';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Text} from '@/components/ui';
import {Spinner} from '@/components/ui/spinner';
import {usePowerCurve} from '@/hooks/useAnalytics';
import type {PowerCurvePoint} from '@/services/analytics';

const CHART_HEIGHT = 200;
const Y_AXIS_WIDTH = 40;
const PADDING_RIGHT = 8;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 28;
const IS_WEB = Platform.OS === 'web';

const X_LABELS: [number, string][] = [
  [1, '1s'], [10, '10s'], [60, '1m'], [300, '5m'],
  [1200, '20m'], [3600, '60m'], [7200, '120m'],
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface TouchInfo {
  x: number;
  duration: number;
  points: {key: string; color: string; watts: number}[];
}

export function PowerCurveChart() {
  const {t} = useTranslation();
  const {isDark} = useTheme();
  const colors = isDark ? COLORS.dark : COLORS.light;
  const [containerWidth, setContainerWidth] = useState(0);
  const [touchInfo, setTouchInfo] = useState<TouchInfo | null>(null);
  const containerRef = useRef<View>(null);

  const allTime = usePowerCurve('all');
  const year = usePowerCurve('year');
  const days28 = usePowerCurve('28d');

  const isLoading = allTime.isLoading || year.isLoading || days28.isLoading;
  const isError = allTime.isError && year.isError && days28.isError;

  const ranges = useMemo(() => [
    {key: 'all', labelKey: 'analytics.powerCurve.rangeAll', data: allTime.data?.power_curve, color: colors.chart1, width: 2.5},
    {key: 'year', labelKey: 'analytics.powerCurve.rangeYear', data: year.data?.power_curve, color: colors.chart2, width: 1.5},
    {key: '28d', labelKey: 'analytics.powerCurve.range28d', data: days28.data?.power_curve, color: colors.chart3, width: 1.5},
  ], [allTime.data, year.data, days28.data, colors]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const svgWidth = containerWidth;
  const chartWidth = svgWidth - Y_AXIS_WIDTH - PADDING_RIGHT;

  const {yMax, yTicks} = useMemo(() => {
    let max = 0;
    ranges.forEach((r) => r.data?.forEach((p) => { if (p.max_avg_watts > max) max = p.max_avg_watts; }));
    if (max === 0) return {yMax: 500, yTicks: [0, 100, 200, 300, 400, 500]};
    const calcYMax = Math.ceil(max / 100) * 100;
    const step = Math.ceil(calcYMax / 5 / 50) * 50;
    const ticks = [];
    for (let v = 0; v <= calcYMax; v += step) ticks.push(v);
    return {yMax: calcYMax, yTicks: ticks};
  }, [ranges]);

  const logScale = useCallback((seconds: number): number => {
    if (chartWidth <= 0) return Y_AXIS_WIDTH;
    const maxLog = Math.log(7200);
    return Y_AXIS_WIDTH + (Math.log(Math.max(1, seconds)) / maxLog) * chartWidth;
  }, [chartWidth]);

  const inverseLogScale = useCallback((x: number): number => {
    if (chartWidth <= 0) return 1;
    const maxLog = Math.log(7200);
    const normalized = (x - Y_AXIS_WIDTH) / chartWidth;
    return Math.exp(normalized * maxLog);
  }, [chartWidth]);

  const yScale = useCallback((watts: number): number => {
    const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    return PADDING_TOP + drawHeight * (1 - watts / yMax);
  }, [yMax]);

  const buildPath = useCallback((data: PowerCurvePoint[]): string => {
    if (!data || data.length === 0 || chartWidth <= 0) return '';
    const sorted = [...data].sort((a, b) => a.duration_seconds - b.duration_seconds);
    return sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${logScale(p.duration_seconds).toFixed(1)},${yScale(p.max_avg_watts).toFixed(1)}`).join(' ');
  }, [logScale, yScale, chartWidth]);

  const hasData = ranges.some((r) => r.data && r.data.length > 0);

  const findNearest = useCallback((data: PowerCurvePoint[] | undefined, targetDuration: number): PowerCurvePoint | null => {
    if (!data || data.length === 0) return null;
    let bestDist = Infinity;
    let best: PowerCurvePoint | null = null;
    for (const p of data) {
      const dist = Math.abs(Math.log(p.duration_seconds) - Math.log(targetDuration));
      if (dist < bestDist) { bestDist = dist; best = p; }
    }
    return best;
  }, []);

  const processPosition = useCallback((x: number) => {
    if (x < Y_AXIS_WIDTH || x > Y_AXIS_WIDTH + chartWidth || chartWidth <= 0) {
      setTouchInfo(null);
      return;
    }
    const duration = inverseLogScale(x);
    const points: TouchInfo['points'] = [];
    for (const r of ranges) {
      const nearest = findNearest(r.data, duration);
      if (nearest) points.push({key: r.key, color: r.color, watts: nearest.max_avg_watts});
    }
    const nearestAll = findNearest(ranges[0].data, duration);
    const snappedDuration = nearestAll ? nearestAll.duration_seconds : Math.round(duration);
    const snappedX = logScale(snappedDuration);
    setTouchInfo({x: snappedX, duration: snappedDuration, points});
  }, [chartWidth, inverseLogScale, ranges, findNearest, logScale]);

  // Web: hover handlers
  const onMouseMove = useCallback((e: {nativeEvent: {offsetX: number}}) => {
    processPosition(e.nativeEvent.offsetX);
  }, [processPosition]);

  const onMouseLeave = useCallback(() => {
    setTouchInfo(null);
  }, []);

  // Native: touch handlers via PanResponder
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => processPosition(evt.nativeEvent.locationX),
    onPanResponderMove: (evt) => processPosition(evt.nativeEvent.locationX),
    onPanResponderRelease: () => setTouchInfo(null),
    onPanResponderTerminate: () => setTouchInfo(null),
  }), [processPosition]);

  // Tooltip positioning
  const tooltipWidth = 120;
  const tooltipHeight = touchInfo ? 14 + touchInfo.points.length * 16 : 0;
  const tooltipX = touchInfo
    ? Math.min(Math.max(touchInfo.x - tooltipWidth / 2, 0), svgWidth - tooltipWidth)
    : 0;

  // Interaction props: hover on web, touch on native
  const interactionProps = IS_WEB
    ? {onMouseMove, onMouseLeave, style: {overflow: 'hidden' as const, cursor: 'crosshair'}}
    : {...panResponder.panHandlers, style: {overflow: 'hidden' as const}};

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.powerCurve.title')}</CardTitle>
        <Text className="text-sm text-muted-foreground">{t('analytics.powerCurve.subtitle')}</Text>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <View className="items-center justify-center py-12"><Spinner /></View>
        ) : isError ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.powerCurve.error')}</Text>
        ) : !hasData ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.powerCurve.noData')}</Text>
        ) : (
          <>
            <View className="flex-row justify-center gap-5 mb-4">
              {ranges.map((r) => (
                <View key={r.key} className="flex-row items-center gap-1.5">
                  <View style={{width: 16, height: 3, backgroundColor: r.color, borderRadius: 2}} />
                  <Text className="text-xs text-muted-foreground">{t(r.labelKey)}</Text>
                </View>
              ))}
            </View>
            <View ref={containerRef} onLayout={onLayout} {...interactionProps}>
              {svgWidth > 0 && (
                <Svg width={svgWidth} height={CHART_HEIGHT}>
                  {/* Grid lines */}
                  {yTicks.map((tick) => (
                    <G key={tick}>
                      <Line x1={Y_AXIS_WIDTH} y1={yScale(tick)} x2={Y_AXIS_WIDTH + chartWidth} y2={yScale(tick)} stroke={colors.border} strokeWidth={0.5} strokeDasharray="4,4" />
                      <SvgText x={Y_AXIS_WIDTH - 6} y={yScale(tick) + 3.5} textAnchor="end" fontSize={10} fill={colors.mutedForeground} fontWeight="300">{tick}</SvgText>
                    </G>
                  ))}

                  {/* X-axis labels */}
                  {X_LABELS.map(([sec, label]) => (
                    <SvgText key={sec} x={logScale(sec)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize={9} fill={colors.mutedForeground} fontWeight="300">{label}</SvgText>
                  ))}

                  {/* Power curve lines */}
                  {ranges.map((r) => {
                    const path = buildPath(r.data || []);
                    if (!path) return null;
                    return <Path key={r.key} d={path} stroke={r.color} strokeWidth={r.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
                  })}

                  {/* Hover/touch cursor */}
                  {touchInfo && (
                    <>
                      <Line
                        x1={touchInfo.x} y1={PADDING_TOP}
                        x2={touchInfo.x} y2={CHART_HEIGHT - PADDING_BOTTOM}
                        stroke={colors.mutedForeground} strokeWidth={1} strokeDasharray="3,3" opacity={0.6}
                      />
                      {touchInfo.points.map((p) => (
                        <Circle key={p.key} cx={touchInfo.x} cy={yScale(p.watts)} r={4} fill={p.color} />
                      ))}
                      <Rect
                        x={tooltipX} y={0}
                        width={tooltipWidth} height={tooltipHeight}
                        rx={6} ry={6}
                        fill={isDark ? 'hsl(240, 6%, 20%)' : 'hsl(0, 0%, 98%)'}
                        stroke={colors.border} strokeWidth={0.5} opacity={0.95}
                      />
                      <SvgText
                        x={tooltipX + tooltipWidth / 2} y={12}
                        textAnchor="middle" fontSize={10}
                        fill={colors.mutedForeground} fontWeight="500"
                      >
                        {formatDuration(touchInfo.duration)}
                      </SvgText>
                      {touchInfo.points.map((p, i) => (
                        <G key={p.key}>
                          <Circle cx={tooltipX + 10} cy={22 + i * 16} r={3} fill={p.color} />
                          <SvgText x={tooltipX + 18} y={26 + i * 16} fontSize={11} fill={colors.foreground} fontWeight="600">
                            {p.watts} W
                          </SvgText>
                        </G>
                      ))}
                    </>
                  )}
                </Svg>
              )}
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
