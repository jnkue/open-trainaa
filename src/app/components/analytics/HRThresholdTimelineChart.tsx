import React, {useCallback, useMemo, useState} from 'react';
import {View, LayoutChangeEvent, PanResponder, Platform} from 'react-native';
import Svg, {Path, Line, Text as SvgText, Circle, Rect, G} from 'react-native-svg';
import {useTranslation} from 'react-i18next';
import {useTheme} from '@/contexts/ThemeContext';
import {COLORS} from '@/lib/colors';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Text} from '@/components/ui';
import {Spinner} from '@/components/ui/spinner';
import {useHRThresholdHistory} from '@/hooks/useAnalytics';

const CHART_HEIGHT = 170;
const Y_AXIS_WIDTH = 40;
const PADDING_RIGHT = 8;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 28;
const IS_WEB = Platform.OS === 'web';

interface HoverInfo {
  x: number;
  index: number;
  date: string;
  lthr: number;
}

interface Props {
  sport: 'cycling' | 'running';
}

export function HRThresholdTimelineChart({sport}: Props) {
  const {t} = useTranslation();
  const {isDark} = useTheme();
  const colors = isDark ? COLORS.dark : COLORS.light;
  const {data, isLoading, isError} = useHRThresholdHistory(sport, 365);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const history = useMemo(() => data?.history || [], [data]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const svgWidth = containerWidth;
  const chartWidth = svgWidth - Y_AXIS_WIDTH - PADDING_RIGHT;

  const {yMin, yMax, yTicks, latestLthr} = useMemo(() => {
    if (history.length === 0) return {yMin: 120, yMax: 200, yTicks: [120, 140, 160, 180, 200], latestLthr: 0};
    const lthrValues = history.map((h) => h.lthr);
    const min = Math.floor(Math.min(...lthrValues) / 10) * 10;
    const max = Math.ceil(Math.max(...lthrValues) / 10) * 10;
    const calcYMin = Math.max(0, min - 10);
    const calcYMax = max + 10;
    const step = Math.max(5, Math.ceil((calcYMax - calcYMin) / 5 / 5) * 5);
    const ticks = [];
    for (let v = calcYMin; v <= calcYMax; v += step) ticks.push(v);
    const latest = history[history.length - 1];
    return {yMin: calcYMin, yMax: calcYMax, yTicks: ticks, latestLthr: latest.lthr};
  }, [history]);

  const xScale = useCallback((index: number): number => {
    if (history.length <= 1) return Y_AXIS_WIDTH;
    return Y_AXIS_WIDTH + (index / (history.length - 1)) * chartWidth;
  }, [history.length, chartWidth]);

  const yScale = useCallback((lthr: number): number => {
    const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    if (yMax === yMin) return PADDING_TOP + drawHeight / 2;
    return PADDING_TOP + drawHeight * (1 - (lthr - yMin) / (yMax - yMin));
  }, [yMin, yMax]);

  const linePath = useMemo(() => {
    if (history.length === 0 || chartWidth <= 0) return '';
    return history.map((h, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(h.lthr).toFixed(1)}`).join(' ');
  }, [history, xScale, yScale, chartWidth]);

  const dateLabels = useMemo(() => {
    if (history.length < 2) return [];
    const count = Math.min(5, history.length);
    const step = Math.max(1, Math.floor((history.length - 1) / (count - 1)));
    const labels = [];
    for (let i = 0; i < history.length; i += step) labels.push({index: i, date: history[i].date});
    const lastIdx = history.length - 1;
    if (labels[labels.length - 1]?.index !== lastIdx) {
      labels.push({index: lastIdx, date: history[lastIdx].date});
    }
    return labels;
  }, [history]);

  const processPosition = useCallback((x: number) => {
    if (history.length === 0 || chartWidth <= 0 || x < Y_AXIS_WIDTH || x > Y_AXIS_WIDTH + chartWidth) {
      setHoverInfo(null);
      return;
    }
    const normalized = (x - Y_AXIS_WIDTH) / chartWidth;
    const index = Math.round(normalized * (history.length - 1));
    const clamped = Math.max(0, Math.min(history.length - 1, index));
    const h = history[clamped];
    setHoverInfo({
      x: xScale(clamped),
      index: clamped,
      date: h.date,
      lthr: h.lthr,
    });
  }, [history, chartWidth, xScale]);

  const onMouseMove = useCallback((e: {nativeEvent: {offsetX: number}}) => {
    processPosition(e.nativeEvent.offsetX);
  }, [processPosition]);

  const onMouseLeave = useCallback(() => setHoverInfo(null), []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => processPosition(evt.nativeEvent.locationX),
    onPanResponderMove: (evt) => processPosition(evt.nativeEvent.locationX),
    onPanResponderRelease: () => setHoverInfo(null),
    onPanResponderTerminate: () => setHoverInfo(null),
  }), [processPosition]);

  const interactionProps = IS_WEB
    ? {onMouseMove, onMouseLeave, style: {overflow: 'hidden' as const, cursor: 'crosshair'}}
    : {...panResponder.panHandlers, style: {overflow: 'hidden' as const}};

  const lineColor = colors.chart4 || colors.chart2;

  const tooltipWidth = 130;
  const tooltipX = hoverInfo
    ? Math.min(Math.max(hoverInfo.x - tooltipWidth / 2, 0), svgWidth - tooltipWidth)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.lthrTimeline.title')}</CardTitle>
        <Text className="text-sm text-muted-foreground">{t('analytics.lthrTimeline.subtitle')}</Text>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <View className="items-center justify-center py-12"><Spinner /></View>
        ) : isError ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.lthrTimeline.error')}</Text>
        ) : history.length === 0 ? (
          <Text className="text-muted-foreground text-center py-8">{t('analytics.lthrTimeline.noData')}</Text>
        ) : (
          <>
            <View className="flex-row gap-6 mb-2">
              <View>
                <Text className="text-xs text-muted-foreground">{t('analytics.lthrTimeline.currentLthr')}</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {Math.round(latestLthr)} <Text className="text-sm font-normal text-muted-foreground">{t('analytics.lthrTimeline.bpm')}</Text>
                </Text>
              </View>
            </View>
            <View onLayout={onLayout} {...interactionProps}>
              {svgWidth > 0 && (
                <Svg width={svgWidth} height={CHART_HEIGHT}>
                  {/* Y grid lines + labels */}
                  {yTicks.map((tick) => (
                    <G key={tick}>
                      <Line x1={Y_AXIS_WIDTH} y1={yScale(tick)} x2={Y_AXIS_WIDTH + chartWidth} y2={yScale(tick)} stroke={colors.border} strokeWidth={0.5} strokeDasharray="4,4" />
                      <SvgText x={Y_AXIS_WIDTH - 6} y={yScale(tick) + 3.5} textAnchor="end" fontSize={10} fill={colors.mutedForeground} fontWeight="300">{tick}</SvgText>
                    </G>
                  ))}

                  {/* X-axis baseline */}
                  <Line
                    x1={Y_AXIS_WIDTH} y1={CHART_HEIGHT - PADDING_BOTTOM}
                    x2={Y_AXIS_WIDTH + chartWidth} y2={CHART_HEIGHT - PADDING_BOTTOM}
                    stroke={colors.border} strokeWidth={0.5}
                  />

                  {/* X-axis date labels */}
                  {dateLabels.map(({index, date}) => (
                    <SvgText key={index} x={xScale(index)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize={9} fill={colors.mutedForeground} fontWeight="300">
                      {date.slice(5)}
                    </SvgText>
                  ))}

                  {/* LTHR line */}
                  <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Latest point dot */}
                  {history.length > 0 && chartWidth > 0 && (
                    <Circle cx={xScale(history.length - 1)} cy={yScale(history[history.length - 1].lthr)} r={3.5} fill={lineColor} />
                  )}

                  {/* Hover cursor + tooltip */}
                  {hoverInfo && (
                    <>
                      <Line
                        x1={hoverInfo.x} y1={PADDING_TOP}
                        x2={hoverInfo.x} y2={CHART_HEIGHT - PADDING_BOTTOM}
                        stroke={colors.mutedForeground} strokeWidth={1} strokeDasharray="3,3" opacity={0.6}
                      />
                      <Circle cx={hoverInfo.x} cy={yScale(hoverInfo.lthr)} r={4} fill={lineColor} />
                      <Rect
                        x={tooltipX} y={0}
                        width={tooltipWidth} height={36}
                        rx={6} ry={6}
                        fill={isDark ? 'hsl(240, 6%, 20%)' : 'hsl(0, 0%, 98%)'}
                        stroke={colors.border} strokeWidth={0.5} opacity={0.95}
                      />
                      <SvgText x={tooltipX + tooltipWidth / 2} y={13} textAnchor="middle" fontSize={10} fill={colors.mutedForeground} fontWeight="500">
                        {hoverInfo.date}
                      </SvgText>
                      <SvgText x={tooltipX + 8} y={29} fontSize={11} fill={colors.foreground} fontWeight="600">
                        LTHR {Math.round(hoverInfo.lthr)} bpm
                      </SvgText>
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
