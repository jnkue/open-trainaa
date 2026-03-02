import React, {useState, useCallback, useRef, useEffect} from "react";
import {View, Text, StyleSheet, Platform, TouchableOpacity} from "react-native";
import {Svg, Path, Rect, Line as SvgLine, Defs, LinearGradient, Stop, G, Text as SvgText} from "react-native-svg";
import {GestureDetector, Gesture} from "react-native-gesture-handler";
import {runOnJS} from "react-native-reanimated";
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

export interface ZoomableLineChartProps {
	data: DataPoint[];
	title: string;
	subtitle?: string;
	color: string;
	unit: string;
	zones?: Zone[];
	height?: number;
	showZones?: boolean;
	showSmoothnessControl?: boolean;
	showDebugStats?: boolean;
	showAltitudeToggle?: boolean;
	altitudeColor?: string;
	attributionText?: string;
}

const ZoomableLineChart: React.FC<ZoomableLineChartProps> = ({
	data,
	title,
	subtitle,
	color,
	unit,
	zones = [],
	height = 300,
	showZones = true,
	showSmoothnessControl = true,
	showDebugStats = false,
	showAltitudeToggle = false,
	altitudeColor = "#10b981",
	attributionText,
}) => {
	const {isDark} = useTheme();
	const colors = isDark ? COLORS.dark : COLORS.light;
	const [chartWidth, setChartWidth] = useState(300);

	// Viewport state (0 to 1, representing start and end position)
	const [viewportStart, setViewportStart] = useState(0);
	const [viewportEnd, setViewportEnd] = useState(1);

	// Smoothness control (0 = raw data, 1 = maximum smoothing)
	const [smoothness, setSmoothness] = useState(0.3);

	// Height profile fill toggle
	const [showFill, setShowFill] = useState(false);

	// Altitude line toggle
	const [showAltitude, setShowAltitude] = useState(false);

	// Refs for gesture handling
	const savedViewportStart = useRef(0);
	const savedViewportEnd = useRef(1);
	const isPanning = useRef(false);
	const lastPanX = useRef(0);

	// Check if altitude data is available
	const hasAltitude = data.length > 0 && data[0].altitude !== undefined;

	// Constants
	const yAxisWidth = 50;
	const rightYAxisWidth = showAltitude && hasAltitude ? 50 : 0;
	const xAxisHeight = 30;
	const padding = 12;

	// Calculate viewport indices
	const startIndex = Math.floor(viewportStart * (data.length - 1));
	const endIndex = Math.ceil(viewportEnd * (data.length - 1));
	const viewportData = data.slice(startIndex, endIndex + 1);

	// Apply smoothing to data
	const smoothData = (rawData: DataPoint[], smoothFactor: number): DataPoint[] => {
		if (smoothFactor === 0 || rawData.length < 3) return rawData;

		// Calculate window size based on smooth factor (0-1 maps to 1-30 points)
		const windowSize = Math.max(1, Math.floor(1 + smoothFactor * 600));

		return rawData.map((point, index) => {
			const startIdx = Math.max(0, index - Math.floor(windowSize / 2));
			const endIdx = Math.min(rawData.length, index + Math.ceil(windowSize / 2));
			const windowData = rawData.slice(startIdx, endIdx);
			const avgValue = windowData.reduce((sum, p) => sum + p.value, 0) / windowData.length;

			return {...point, value: avgValue};
		});
	};

	const smoothedData = smoothData(viewportData, smoothness);

	// Prepare altitude data if available (NO smoothing for altitude)
	const altitudeViewportData = hasAltitude ? viewportData : [];
	const smoothedAltitudeData = hasAltitude ? altitudeViewportData.map((p) => ({...p, value: p.altitude || 0})) : [];

	// Calculate Y-axis range from FULL dataset (not viewport) so it stays fixed when zooming
	const yMin = data.length > 0 ? Math.min(...data.map((d) => d.value)) : 0;
	const yMax = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 100;
	const yPadding = (yMax - yMin) * 0.1 || 10;
	const yRangeMin = Math.max(0, yMin - yPadding);
	const yRangeMax = yMax + yPadding;
	const yScale = yRangeMax - yRangeMin || 1;

	// Calculate altitude Y-axis range (separate scale for right Y-axis)
	const altYMin = hasAltitude ? Math.min(...data.map((d) => d.altitude || 0)) : 0;
	const altYMax = hasAltitude ? Math.max(...data.map((d) => d.altitude || 0)) : 100;
	const altYPadding = (altYMax - altYMin) * 0.1 || 10;
	const altYRangeMin = Math.max(0, altYMin - altYPadding);
	const altYRangeMax = altYMax + altYPadding;
	const altYScale = altYRangeMax - altYRangeMin || 1;

	// Generate Y-axis labels
	const yAxisLabels = (() => {
		const stepCount = 6;
		const step = yScale / (stepCount - 1);
		return Array.from({length: stepCount - 1}, (_, i) => Math.round(yRangeMin + step * i));
	})();

	// Create line path
	const createLinePath = (): string => {
		if (smoothedData.length < 2) return "";

		let path = "";
		smoothedData.forEach((point, index) => {
			const x = yAxisWidth + (index / (smoothedData.length - 1)) * chartWidth;
			const y = height - ((point.value - yRangeMin) / yScale) * height;

			if (index === 0) {
				path += `M${x},${y}`;
			} else {
				path += ` L${x},${y}`;
			}
		});
		return path;
	};

	// Create fill path (area under the line)
	const createFillPath = (): string => {
		if (smoothedData.length < 2) return "";

		let path = "";

		// Start at bottom left
		path += `M${yAxisWidth},${height}`;

		// Draw up to first data point
		const firstY = height - ((smoothedData[0].value - yRangeMin) / yScale) * height;
		path += ` L${yAxisWidth},${firstY}`;

		// Draw the data line
		smoothedData.forEach((point, index) => {
			const x = yAxisWidth + (index / (smoothedData.length - 1)) * chartWidth;
			const y = height - ((point.value - yRangeMin) / yScale) * height;
			path += ` L${x},${y}`;
		});

		// Draw down to bottom right
		const lastX = yAxisWidth + chartWidth;
		path += ` L${lastX},${height}`;

		// Close path
		path += " Z";

		return path;
	};

	// Create altitude area fill path
	const createAltitudeAreaPath = (): string => {
		if (!hasAltitude || smoothedAltitudeData.length < 2) return "";

		let path = "";

		// Start at bottom left
		path += `M${yAxisWidth},${height}`;

		// Draw up to first altitude point
		const firstY = height - ((smoothedAltitudeData[0].value - altYRangeMin) / altYScale) * height;
		path += ` L${yAxisWidth},${firstY}`;

		// Draw the altitude line
		smoothedAltitudeData.forEach((point, index) => {
			const x = yAxisWidth + (index / (smoothedAltitudeData.length - 1)) * chartWidth;
			const y = height - ((point.value - altYRangeMin) / altYScale) * height;
			path += ` L${x},${y}`;
		});

		// Draw down to bottom right
		const lastX = yAxisWidth + chartWidth;
		path += ` L${lastX},${height}`;

		// Close path
		path += " Z";

		return path;
	};

	const linePath = createLinePath();
	const fillPath = createFillPath();
	const altitudeAreaPath = createAltitudeAreaPath();

	// Generate Y-axis labels for altitude (right side)
	const altYAxisLabels = (() => {
		if (!hasAltitude) return [];
		const stepCount = 6;
		const step = altYScale / (stepCount - 1);
		return Array.from({length: stepCount}, (_, i) => Math.round(altYRangeMin + step * i));
	})();

	// Generate X-axis labels with proper time formatting
	const xAxisLabels = (() => {
		if (smoothedData.length === 0) return [];

		const numLabels = Math.min(6, Math.max(3, Math.floor(chartWidth / 80)));
		const step = Math.floor(smoothedData.length / (numLabels - 1));
		const labels = [];

		for (let i = 0; i < numLabels; i++) {
			const dataIndex = i === numLabels - 1 ? smoothedData.length - 1 : i * step;
			if (dataIndex < smoothedData.length) {
				const point = smoothedData[dataIndex];
				// Format time properly based on seconds
				const totalSeconds = point.second || point.minute * 60;
				const hours = Math.floor(totalSeconds / 3600);
				const minutes = Math.floor((totalSeconds % 3600) / 60);
				const seconds = totalSeconds % 60;

				let timeStr;
				if (hours > 0) {
					timeStr = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
				} else {
					timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
				}

				labels.push({
					index: dataIndex,
					time: timeStr,
				});
			}
		}

		return labels;
	})();

	// Handle layout changes
	const handleLayout = (event: any) => {
		const {width} = event.nativeEvent.layout;
		setChartWidth(Math.max(width - yAxisWidth - rightYAxisWidth - padding * 2, 200));
	};

	// Zoom function (centered zoom)
	const handleZoom = useCallback(
		(scale: number, centerX: number) => {
			const currentRange = savedViewportEnd.current - savedViewportStart.current;
			const newRange = Math.max(0.01, Math.min(1, currentRange / scale));

			// Calculate focal point in viewport coordinates (0-1)
			const relativeX = (centerX - yAxisWidth) / chartWidth;
			const focalPoint = savedViewportStart.current + relativeX * currentRange;

			// Zoom centered on focal point
			let newStart = focalPoint - relativeX * newRange;
			let newEnd = newStart + newRange;

			// Constrain to bounds
			if (newStart < 0) {
				newStart = 0;
				newEnd = newRange;
			}
			if (newEnd > 1) {
				newEnd = 1;
				newStart = 1 - newRange;
			}

			setViewportStart(newStart);
			setViewportEnd(newEnd);
			savedViewportStart.current = newStart;
			savedViewportEnd.current = newEnd;
		},
		[chartWidth]
	);

	// Pan function
	const handlePan = useCallback(
		(deltaX: number) => {
			const currentRange = savedViewportEnd.current - savedViewportStart.current;
			const panAmount = -deltaX / chartWidth;

			let newStart = savedViewportStart.current + panAmount;
			let newEnd = savedViewportEnd.current + panAmount;

			// Constrain to bounds
			if (newStart < 0) {
				newStart = 0;
				newEnd = currentRange;
			}
			if (newEnd > 1) {
				newEnd = 1;
				newStart = 1 - currentRange;
			}

			setViewportStart(newStart);
			setViewportEnd(newEnd);
		},
		[chartWidth]
	);

	// Mouse wheel handler for web
	const handleWheel = useCallback(
		(event: any) => {
			if (Platform.OS === "web") {
				event.preventDefault();
				const delta = event.deltaY;
				const scale = delta > 0 ? 0.9 : 1.1;
				const rect = event.currentTarget.getBoundingClientRect();
				const centerX = event.clientX - rect.left;
				handleZoom(scale, centerX);
			}
		},
		[handleZoom]
	);

	// Gesture handlers for mobile
	const panGesture = Gesture.Pan()
		.enabled(Platform.OS !== "web")
		.onStart(() => {
			"worklet";
			isPanning.current = true;
			savedViewportStart.current = viewportStart;
			savedViewportEnd.current = viewportEnd;
			lastPanX.current = 0;
		})
		.onUpdate((event) => {
			"worklet";
			const deltaX = event.translationX - lastPanX.current;
			lastPanX.current = event.translationX;
			runOnJS(handlePan)(deltaX);
		})
		.onEnd(() => {
			"worklet";
			isPanning.current = false;
			savedViewportStart.current = viewportStart;
			savedViewportEnd.current = viewportEnd;
		});

	const pinchGesture = Gesture.Pinch()
		.enabled(Platform.OS !== "web")
		.onStart(() => {
			"worklet";
			savedViewportStart.current = viewportStart;
			savedViewportEnd.current = viewportEnd;
		})
		.onUpdate((event) => {
			"worklet";
			runOnJS(handleZoom)(event.scale, event.focalX);
		})
		.onEnd(() => {
			"worklet";
			savedViewportStart.current = viewportStart;
			savedViewportEnd.current = viewportEnd;
		});

	const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

	// Attach wheel event listener for web
	const chartRef = useRef<any>(null);
	useEffect(() => {
		if (Platform.OS === "web" && chartRef.current) {
			const element = chartRef.current;
			element.addEventListener("wheel", handleWheel, {passive: false});
			return () => element.removeEventListener("wheel", handleWheel);
		}
	}, [handleWheel]);

	const styles = StyleSheet.create({
		container: {
			backgroundColor: colors.card,
			borderRadius: 16,
			borderWidth: 1,
			borderColor: colors.border,
			padding: 16,
			marginBottom: 16,
		},
		headerContainer: {
			marginBottom: 12,
		},
		title: {
			fontSize: 16,
			fontWeight: "600",
			color: colors.foreground,
			marginBottom: 2,
		},
		subtitle: {
			fontSize: 12,
			color: colors.mutedForeground,
		},
		chartContainer: {
			backgroundColor: colors.card,
		},
		controlsContainer: {
			marginTop: 8,
			marginRight: 16,
		},
		controlLabel: {
			fontSize: 11,
			color: colors.mutedForeground,
			marginBottom: 4,
		},
		smoothnessButtons: {
			flexDirection: "row",
			gap: 6,
			marginTop: 4,
		},
		smoothnessButton: {
			paddingHorizontal: 12,
			paddingVertical: 6,
			backgroundColor: colors.muted,
			borderRadius: 6,
			borderWidth: 1,
			borderColor: colors.border,
		},
		smoothnessButtonActive: {
			backgroundColor: color,
			borderColor: color,
		},
		smoothnessButtonText: {
			fontSize: 10,
			color: colors.foreground,
			fontWeight: "500",
		},
		smoothnessButtonTextActive: {
			color: colors.background,
		},
		debugContainer: {
			marginTop: 8,
			padding: 8,
			backgroundColor: colors.muted,
			borderRadius: 8,
		},
		debugTitle: {
			fontSize: 11,
			fontWeight: "600",
			color: colors.foreground,
			marginBottom: 6,
		},
		debugGrid: {
			gap: 4,
		},
		debugRow: {
			flexDirection: "row",
			justifyContent: "space-between",
		},
		debugLabel: {
			fontSize: 10,
			color: colors.mutedForeground,
		},
		debugValue: {
			fontSize: 10,
			color: colors.foreground,
			fontWeight: "500",
		},
		zoneContainer: {
			marginTop: 8,
			padding: 8,
			backgroundColor: colors.muted,
			borderRadius: 8,
		},
		zoneTitle: {
			fontSize: 11,
			fontWeight: "600",
			color: colors.foreground,
			marginBottom: 6,
		},
		zoneList: {
			flexDirection: "row",
			flexWrap: "wrap",
			gap: 8,
		},
		zoneItem: {
			flexDirection: "row",
			alignItems: "center",
		},
		zoneColor: {
			width: 10,
			height: 10,
			borderRadius: 5,
			marginRight: 4,
		},
		zoneLabel: {
			fontSize: 10,
			color: colors.foreground,
		},
		hintText: {
			fontSize: 10,
			color: colors.mutedForeground,
			textAlign: "center",
			marginTop: 8,
			fontStyle: "italic",
		},
		attributionText: {
			fontSize: 10,
			color: colors.mutedForeground,
			textAlign: "right",
			marginTop: 8,
		},
	});

	const isZoomed = viewportStart > 0 || viewportEnd < 1;

	return (
		<View style={styles.container}>
			{/* Header */}
			<View style={styles.headerContainer}>
				<Text style={styles.title}>{title}</Text>
				{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
			</View>

			{/* Chart */}
			{Platform.OS === "web" ? (
				<View ref={chartRef} onLayout={handleLayout} style={styles.chartContainer}>
					<Svg width={chartWidth + yAxisWidth + rightYAxisWidth} height={height + xAxisHeight}>
						{/* Gradient definitions */}
						<Defs>
							<LinearGradient id={`line-gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
								<Stop offset="0%" stopColor={color} stopOpacity="1" />
								<Stop offset="100%" stopColor={color} stopOpacity="0.8" />
							</LinearGradient>
							<LinearGradient id={`altitude-gradient-${altitudeColor}`} x1="0%" y1="0%" x2="0%" y2="100%">
								<Stop offset="0%" stopColor={altitudeColor} stopOpacity="0.4" />
								<Stop offset="100%" stopColor={altitudeColor} stopOpacity="0.1" />
							</LinearGradient>
							{zones.map((zone, index) => (
								<LinearGradient key={index} id={`zone-${index}-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
									<Stop offset="0%" stopColor={zone.color} stopOpacity="0.25" />
									<Stop offset="100%" stopColor={zone.color} stopOpacity="0.1" />
								</LinearGradient>
							))}
						</Defs>

						{/* Y-axis labels */}
						{yAxisLabels.map((value, index) => {
							const y = height - ((value - yRangeMin) / yScale) * height;
							return (
								<G key={`y-label-${index}`}>
									<SvgText x={yAxisWidth - 6} y={y + 3} fontSize="9" fill={colors.mutedForeground} textAnchor="end">
										{value}
									</SvgText>
								</G>
							);
						})}

						{/* X-axis labels */}
						{xAxisLabels.map((label, i) => {
							const isFirst = i === 0;
							const isLast = i === xAxisLabels.length - 1;
							let x = yAxisWidth + (label.index / Math.max(smoothedData.length - 1, 1)) * chartWidth;
							let textAnchor: "start" | "middle" | "end" = "middle";

							// Add padding for first and last labels
							if (isFirst) {
								textAnchor = "start";
								x = Math.max(x, yAxisWidth + 2); // Ensure at least 2px from left edge
							} else if (isLast) {
								textAnchor = "end";
								x = Math.min(x, yAxisWidth + chartWidth - 2); // Ensure at least 2px from right edge
							}

							return (
								<SvgText key={`x-label-${i}`} x={x} y={height + 18} fontSize="9" fill={colors.mutedForeground} textAnchor={textAnchor}>
									{label.time}
								</SvgText>
							);
						})}

						{/* Grid lines */}
						{yAxisLabels.map((value, index) => {
							const y = height - ((value - yRangeMin) / yScale) * height;
							return (
								<SvgLine
									key={`grid-${index}`}
									x1={yAxisWidth}
									y1={y}
									x2={chartWidth + yAxisWidth}
									y2={y}
									stroke={colors.border}
									strokeWidth={0.5}
									strokeDasharray="2,2"
									opacity={0.4}
								/>
							);
						})}

						{/* Zone backgrounds */}
						{showZones &&
							zones.map((zone, index) => {
								const yMin = Math.min(height, height - ((zone.min - yRangeMin) / yScale) * height);
								const yMax = Math.max(0, height - ((zone.max - yRangeMin) / yScale) * height);
								const clippedHeight = Math.max(0, yMin - yMax);
								return (
									<Rect
										key={`zone-bg-${index}`}
										x={yAxisWidth}
										y={yMax}
										width={chartWidth}
										height={clippedHeight}
										fill={`url(#zone-${index}-${color})`}
									/>
								);
							})}

						{/* Height profile fill */}
						{showFill && <Path d={fillPath} fill={`url(#line-gradient-${color})`} opacity={0.3} />}

						{/* Data line */}
						<Path d={linePath} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

						{/* Altitude area fill */}
						{showAltitude && hasAltitude && <Path d={altitudeAreaPath} fill={`url(#altitude-gradient-${altitudeColor})`} />}

						{/* Right Y-axis labels for altitude */}
						{showAltitude &&
							hasAltitude &&
							altYAxisLabels.map((value, index) => {
								const y = height - ((value - altYRangeMin) / altYScale) * height;
								return (
									<G key={`alt-y-label-${index}`}>
										<SvgText x={chartWidth + yAxisWidth + 6} y={y + 3} fontSize="9" fill={altitudeColor} textAnchor="start">
											{value}m
										</SvgText>
									</G>
								);
							})}
					</Svg>
				</View>
			) : (
				<GestureDetector gesture={composedGesture}>
					<View ref={chartRef} onLayout={handleLayout} style={styles.chartContainer}>
						<Svg width={chartWidth + yAxisWidth + rightYAxisWidth} height={height + xAxisHeight}>
							{/* Gradient definitions */}
							<Defs>
								<LinearGradient id={`line-gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
									<Stop offset="0%" stopColor={color} stopOpacity="1" />
									<Stop offset="100%" stopColor={color} stopOpacity="0.8" />
								</LinearGradient>
								<LinearGradient id={`altitude-gradient-${altitudeColor}`} x1="0%" y1="0%" x2="0%" y2="100%">
									<Stop offset="0%" stopColor={altitudeColor} stopOpacity="0.4" />
									<Stop offset="100%" stopColor={altitudeColor} stopOpacity="0.1" />
								</LinearGradient>
								{zones.map((zone, index) => (
									<LinearGradient key={index} id={`zone-${index}-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
										<Stop offset="0%" stopColor={zone.color} stopOpacity="0.25" />
										<Stop offset="100%" stopColor={zone.color} stopOpacity="0.1" />
									</LinearGradient>
								))}
							</Defs>

							{/* Y-axis labels */}
							{yAxisLabels.map((value, index) => {
								const y = height - ((value - yRangeMin) / yScale) * height;
								return (
									<G key={`y-label-${index}`}>
										<SvgText x={yAxisWidth - 6} y={y + 3} fontSize="9" fill={colors.mutedForeground} textAnchor="end">
											{value}
										</SvgText>
									</G>
								);
							})}

							{/* X-axis labels */}
							{xAxisLabels.map((label, i) => {
								const isFirst = i === 0;
								const isLast = i === xAxisLabels.length - 1;
								let x = yAxisWidth + (label.index / Math.max(smoothedData.length - 1, 1)) * chartWidth;
								let textAnchor: "start" | "middle" | "end" = "middle";

								// Add padding for first and last labels
								if (isFirst) {
									textAnchor = "start";
									x = Math.max(x, yAxisWidth + 2); // Ensure at least 2px from left edge
								} else if (isLast) {
									textAnchor = "end";
									x = Math.min(x, yAxisWidth + chartWidth - 2); // Ensure at least 2px from right edge
								}

								return (
									<SvgText key={`x-label-${i}`} x={x} y={height + 18} fontSize="9" fill={colors.mutedForeground} textAnchor={textAnchor}>
										{label.time}
									</SvgText>
								);
							})}

							{/* Grid lines */}
							{yAxisLabels.map((value, index) => {
								const y = height - ((value - yRangeMin) / yScale) * height;
								return (
									<SvgLine
										key={`grid-${index}`}
										x1={yAxisWidth}
										y1={y}
										x2={chartWidth + yAxisWidth}
										y2={y}
										stroke={colors.border}
										strokeWidth={0.5}
										strokeDasharray="2,2"
										opacity={0.4}
									/>
								);
							})}

							{/* Zone backgrounds */}
							{showZones &&
								zones.map((zone, index) => {
									const yMin = Math.min(height, height - ((zone.min - yRangeMin) / yScale) * height);
									const yMax = Math.max(0, height - ((zone.max - yRangeMin) / yScale) * height);
									const clippedHeight = Math.max(0, yMin - yMax);
									return (
										<Rect
											key={`zone-bg-${index}`}
											x={yAxisWidth}
											y={yMax}
											width={chartWidth}
											height={clippedHeight}
											fill={`url(#zone-${index}-${color})`}
										/>
									);
								})}

							{/* Height profile fill */}
							{showFill && <Path d={fillPath} fill={`url(#line-gradient-${color})`} opacity={0.3} />}

							{/* Data line */}
							<Path d={linePath} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

							{/* Altitude area fill */}
							{showAltitude && hasAltitude && <Path d={altitudeAreaPath} fill={`url(#altitude-gradient-${altitudeColor})`} />}

							{/* Right Y-axis labels for altitude */}
							{showAltitude &&
								hasAltitude &&
								altYAxisLabels.map((value, index) => {
									const y = height - ((value - altYRangeMin) / altYScale) * height;
									return (
										<G key={`alt-y-label-${index}`}>
											<SvgText x={chartWidth + yAxisWidth + 6} y={y + 3} fontSize="9" fill={altitudeColor} textAnchor="start">
												{value}m
											</SvgText>
										</G>
									);
								})}
						</Svg>
					</View>
				</GestureDetector>
			)}
			{/* Interaction hint */}
			{Platform.OS === "web" ? (
				<Text style={styles.hintText}>
					{isZoomed
						? "Mausrad zum Zoomen • Ziehen zum Verschieben • Doppelklick zum Zurücksetzen"
						: "Mausrad oder Pinch zum Zoomen • Ziehen zum Verschieben"}
				</Text>
			) : (
				<Text style={styles.hintText}>Pinch zum Zoomen • Ziehen zum Verschieben</Text>
			)}
			
			{/* Smoothness Control */}
			{showSmoothnessControl && (
				<View style={styles.controlsContainer}>
					<Text style={styles.controlLabel}>Glättung</Text>
					<View style={styles.smoothnessButtons}>
						<TouchableOpacity style={[styles.smoothnessButton, smoothness === 0 && styles.smoothnessButtonActive]} onPress={() => setSmoothness(0)}>
							<Text style={[styles.smoothnessButtonText, smoothness === 0 && styles.smoothnessButtonTextActive]}>Roh</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.smoothnessButton, smoothness === 0.3 && styles.smoothnessButtonActive]}
							onPress={() => setSmoothness(0.3)}
						>
							<Text style={[styles.smoothnessButtonText, smoothness === 0.3 && styles.smoothnessButtonTextActive]}>Leicht</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.smoothnessButton, smoothness === 0.6 && styles.smoothnessButtonActive]}
							onPress={() => setSmoothness(0.6)}
						>
							<Text style={[styles.smoothnessButtonText, smoothness === 0.6 && styles.smoothnessButtonTextActive]}>Mittel</Text>
						</TouchableOpacity>
						<TouchableOpacity style={[styles.smoothnessButton, smoothness === 1 && styles.smoothnessButtonActive]} onPress={() => setSmoothness(1)}>
							<Text style={[styles.smoothnessButtonText, smoothness === 1 && styles.smoothnessButtonTextActive]}>Stark</Text>
						</TouchableOpacity>
					</View>
				</View>
			)}

			<View style={{flexDirection: "row", justifyContent: "flex-start"}}>
				{/* Height Profile Fill Toggle */}
				<View style={styles.controlsContainer}>
					<Text style={styles.controlLabel}>Höhenprofil</Text>
					<View style={styles.smoothnessButtons}>
						<TouchableOpacity style={[styles.smoothnessButton, showFill && styles.smoothnessButtonActive]} onPress={() => setShowFill(!showFill)}>
							<Text style={[styles.smoothnessButtonText, showFill && styles.smoothnessButtonTextActive]}>
								{showFill ? "Ausfüllung An" : "Ausfüllung Aus"}
							</Text>
						</TouchableOpacity>
					</View>
				</View>

				{/* Altitude Line Toggle */}
				{showAltitudeToggle && hasAltitude && (
					<View style={styles.controlsContainer}>
						<Text style={styles.controlLabel}>Höhenmeter</Text>
						<View style={styles.smoothnessButtons}>
							<TouchableOpacity
								style={[styles.smoothnessButton, showAltitude && styles.smoothnessButtonActive]}
								onPress={() => setShowAltitude(!showAltitude)}
							>
								<Text style={[styles.smoothnessButtonText, showAltitude && styles.smoothnessButtonTextActive]}>
									{showAltitude ? "Höhe Verbergen" : "Höhe Anzeigen"}
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				)}
			</View>
			{/* Debug Stats */}
			{showDebugStats && (
				<View style={styles.debugContainer}>
					<Text style={styles.debugTitle}>Debug Info</Text>
					<View style={styles.debugGrid}>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Total Data Points:</Text>
							<Text style={styles.debugValue}>{data.length}</Text>
						</View>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Viewport Range:</Text>
							<Text style={styles.debugValue}>
								{startIndex} - {endIndex} ({viewportData.length} pts)
							</Text>
						</View>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Smoothed Points:</Text>
							<Text style={styles.debugValue}>{smoothedData.length}</Text>
						</View>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Smoothness Factor:</Text>
							<Text style={styles.debugValue}>
								{smoothness.toFixed(2)} (window: {Math.max(1, Math.floor(1 + smoothness * 29))})
							</Text>
						</View>
						{data.length > 0 && (
							<>
								<View style={styles.debugRow}>
									<Text style={styles.debugLabel}>First Point:</Text>
									<Text style={styles.debugValue}>
										{data[0].second}s ({data[0].time})
									</Text>
								</View>
								<View style={styles.debugRow}>
									<Text style={styles.debugLabel}>Last Point:</Text>
									<Text style={styles.debugValue}>
										{data[data.length - 1].second}s ({data[data.length - 1].time})
									</Text>
								</View>
							</>
						)}
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Y-axis Range:</Text>
							<Text style={styles.debugValue}>
								{yRangeMin.toFixed(1)} - {yRangeMax.toFixed(1)}
							</Text>
						</View>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Viewport:</Text>
							<Text style={styles.debugValue}>
								{(viewportStart * 100).toFixed(1)}% - {(viewportEnd * 100).toFixed(1)}%
							</Text>
						</View>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Has Altitude:</Text>
							<Text style={styles.debugValue}>{hasAltitude ? "Yes" : "No"}</Text>
						</View>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Show Altitude:</Text>
							<Text style={styles.debugValue}>{showAltitude ? "Yes" : "No"}</Text>
						</View>
						<View style={styles.debugRow}>
							<Text style={styles.debugLabel}>Show Altitude Toggle:</Text>
							<Text style={styles.debugValue}>{showAltitudeToggle ? "Yes" : "No"}</Text>
						</View>
						{hasAltitude && (
							<>
								<View style={styles.debugRow}>
									<Text style={styles.debugLabel}>Altitude Range:</Text>
									<Text style={styles.debugValue}>
										{altYRangeMin.toFixed(1)} - {altYRangeMax.toFixed(1)}m
									</Text>
								</View>
								<View style={styles.debugRow}>
									<Text style={styles.debugLabel}>Altitude Data Points:</Text>
									<Text style={styles.debugValue}>{smoothedAltitudeData.length}</Text>
								</View>
								<View style={styles.debugRow}>
									<Text style={styles.debugLabel}>First Altitude:</Text>
									<Text style={styles.debugValue}>{data[0].altitude}m</Text>
								</View>
							</>
						)}
					</View>
				</View>
			)}



			{/* Zone legend */}
			{showZones && zones.length > 0 && (
				<View style={styles.zoneContainer}>
					<Text style={styles.zoneTitle}>Trainingszonen</Text>
					<View style={styles.zoneList}>
						{zones.map((zone, index) => (
							<View key={index} style={styles.zoneItem}>
								<View style={[styles.zoneColor, {backgroundColor: zone.color}]} />
								<Text style={styles.zoneLabel}>{zone.label}</Text>
							</View>
						))}
					</View>
				</View>
			)}

			{/* Attribution text */}
			{attributionText && (
				<Text style={styles.attributionText}>{attributionText}</Text>
			)}
		</View>
	);
};

export default ZoomableLineChart;
