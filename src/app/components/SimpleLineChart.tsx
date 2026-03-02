import React from "react";
import {View, Text, StyleSheet} from "react-native";
import {Svg, Path, Circle, Line as SvgLine, Defs, LinearGradient, Stop} from "react-native-svg";
import {useTheme} from "@/contexts/ThemeContext";
import {COLORS} from "@/lib/colors";

export interface DataPoint {
	second: number;
	minute: number;
	time: string;
	value: number;
	[key: string]: any;
}

export interface Zone {
	min: number;
	max: number;
	color: string;
	label: string;
}

export interface SimpleLineChartProps {
	data: DataPoint[];
	title: string;
	subtitle?: string;
	zones?: Zone[];
	lineColor: string;
	lineGradientId: string;
	lineGradient: {offset: string; color: string; opacity: number}[];
	dotColor: string;
	dotStroke: string;
	valueUnit: string;
	height?: number;
	showZones?: boolean;
}

const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
	data,
	title,
	subtitle,
	zones = [],
	lineColor,
	lineGradientId,
	lineGradient,
	dotColor,
	dotStroke,
	valueUnit,
	height = 300,
	showZones = true,
}) => {
	const {isDark} = useTheme();
	const colors = isDark ? COLORS.dark : COLORS.light;
	const yAxisWidth = 40;
	const chartWidth = 280;

	// Calculate data range
	const maxValue = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 0;
	const minValue = data.length > 0 ? Math.min(...data.map((d) => d.value)) : 0;
	const range = maxValue - minValue || 1;

	// Generate Y-axis labels
	const generateYAxisLabels = () => {
		const stepCount = 5;
		const step = range / (stepCount - 1);
		const labels = [];
		
		for (let i = 0; i < stepCount; i++) {
			const value = minValue + (step * i);
			labels.push(Math.round(value));
		}
		
		return labels;
	};

	const yAxisLabels = generateYAxisLabels();

	// Create path for the line
	const createLinePath = () => {
		if (data.length < 2) return "";
		let path = "";

		data.forEach((dataPoint, index) => {
			const x = yAxisWidth + (index / (data.length - 1)) * chartWidth;
			const y = height - ((dataPoint.value - minValue) / range) * height;

			if (path === "") {
				path += `M${x},${y}`;
			} else {
				path += ` L${x},${y}`;
			}
		});
		return path;
	};

	const linePath = createLinePath();
	const uniqueLineGradientId = `${lineGradientId}-${Math.random().toString(36).substr(2, 9)}`;

	const styles = StyleSheet.create({
		container: {
			backgroundColor: colors.card,
			borderRadius: 24,
			borderWidth: 1,
			borderColor: colors.border,
			padding: 24,
			marginHorizontal: 8,
			boxShadow: isDark ? '0 2px 4px rgba(0, 0, 0, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.05)',
			elevation: 2,
		},
		headerContainer: {
			marginBottom: 24,
		},
		title: {
			fontSize: 20,
			fontWeight: 'bold',
			color: colors.foreground,
			marginBottom: 8,
		},
		subtitle: {
			fontSize: 14,
			color: colors.mutedForeground,
		},
		chartContainer: {
			backgroundColor: colors.card,
			borderRadius: 16,
			borderWidth: 1,
			borderColor: colors.border,
			padding: 16,
		},
	});

	return (
		<View style={styles.container}>
			<View style={styles.headerContainer}>
				<Text style={styles.title}>{title}</Text>
				{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
			</View>

			<View style={styles.chartContainer}>
				<Svg width={chartWidth + yAxisWidth} height={height}>
					{/* Gradient definitions */}
					<Defs>
						<LinearGradient id={uniqueLineGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
							{lineGradient.map((stop, index) => (
								<Stop key={index} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
							))}
						</LinearGradient>
					</Defs>

					{/* Y-axis labels */}
					{yAxisLabels.map((value, index) => {
						const y = height - ((value - minValue) / range) * height;
						if (y >= 0 && y <= height) {
							return (
								<g key={`label-${value}-${index}`}>
									<text
										x={yAxisWidth - 8}
										y={y + 5}
										fontSize="11"
										fill={colors.mutedForeground}
										textAnchor="end"
										fontFamily="system-ui, -apple-system, sans-serif"
										fontWeight="500"
									>
										{value}
									</text>
								</g>
							);
						}
						return null;
					})}

					{/* Grid lines */}
					{yAxisLabels.map((value, index) => {
						const y = height - ((value - minValue) / range) * height;
						if (y >= 0 && y <= height) {
							return (
								<SvgLine
									key={`grid-${value}-${index}`}
									x1={yAxisWidth}
									y1={y}
									x2={chartWidth + yAxisWidth}
									y2={y}
									stroke={colors.border}
									strokeWidth={1.5}
									strokeDasharray="3,3"
								/>
							);
						}
						return null;
					})}

					{/* Main line */}
					<Path
						d={linePath}
						stroke={`url(#${uniqueLineGradientId})`}
						strokeWidth={3.5}
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>

					{/* Data points */}
					{data.map((dataPoint, index) => {
						if (data.length > 20 && index % Math.ceil(data.length / 20) !== 0) return null;

						const x = yAxisWidth + (index / (data.length - 1)) * chartWidth;
						const y = height - ((dataPoint.value - minValue) / range) * height;

						return (
							<Circle
								key={`point-${index}`}
								cx={x}
								cy={y}
								r={5}
								fill={dotColor}
								stroke={dotStroke}
								strokeWidth={2}
							/>
						);
					})}
				</Svg>
			</View>
		</View>
	);
};

export default SimpleLineChart;
