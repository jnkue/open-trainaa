import React, {useMemo, useState} from "react";
import {View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, Linking, ActionSheetIOS} from "react-native";
import Slider from "@react-native-community/slider";
import {StatusBar} from "expo-status-bar";
import {useLocalSearchParams, router, useNavigation} from "expo-router";
import {showAlert} from "@/utils/alert";
import {useAuth} from "@/contexts/AuthContext";
import {apiClient, ActivityDetail, ActivityRecord} from "@/services/api";
import {formatDistance, formatTime, formatElevation, formatDate, formatVelocity} from "@/utils/formatters";
import {IconSymbol} from "@/components/ui/IconSymbol";
import {Card, CardHeader, CardTitle, CardDescription, CardContent, Text} from "@/components/ui";
import {useQueryClient} from "@tanstack/react-query";
import {useTheme} from "@/contexts/ThemeContext";
import ZoomableLineChart, {DataPoint, Zone} from "@/components/ZoomableLineChart";
import {useTranslation} from "react-i18next";
import Markdown from "react-native-markdown-display";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import ActivityMap from "@/components/ActivityMap";
import SocialMediaOverlaysSection from "@/components/SocialMediaOverlaysSection";
import {useSessionComplete, useSaveUserSessionFeedback} from "@/hooks/useSession";

// Type definition for metrics
interface Metric {
	icon: string;
	value: string;
	maxValue?: string | null;
	unit?: string;
	label: string;
	category: string;
}

function convertArrayRecordsToObjects(recordsResponse: any): ActivityRecord[] {
	if (!recordsResponse || !recordsResponse.data || !recordsResponse.session_start_time) {
		return [];
	}

	const {data, session_start_time, length} = recordsResponse;
	const records: ActivityRecord[] = [];

	for (let i = 0; i < length; i++) {
		const secondsFromStart = data.timestamp?.[i] ?? i;

		// Calculate timestamp
		const startDate = new Date(session_start_time);
		const recordDate = new Date(startDate.getTime() + secondsFromStart * 1000);

		records.push({
			id: `${i}`,
			activity_id: "session",
			timestamp: recordDate.toISOString(),
			heart_rate: data.heart_rate?.[i] ?? null,
			cadence: data.cadence?.[i] ?? null,
			speed: data.speed?.[i] ?? null,
			distance: data.distance?.[i] ?? null,
			power: data.power?.[i] ?? null,
			latitude: data.latitude?.[i] ?? null,
			longitude: data.longitude?.[i] ?? null,
			altitude: data.altitude?.[i] ?? null,
			temperature: data.temperature?.[i] ?? null,
		} as ActivityRecord);
	}

	return records;
}

// Data Analysis Component for activity records
const ActivityDataAnalysis = React.memo(({activity, records}: {activity: ActivityDetail; records?: ActivityRecord[]}) => {
	const {t} = useTranslation();
	const analyzeRecords = () => {
		if (!records || records.length === 0) {
			return {
				totalDataPoints: 0,
				gpsPoints: 0,
				hrDataPoints: 0,
				speedDataPoints: 0,
				elevationGain: 0,
				averageHR: null,
				maxHR: null,
				topSpeed: null,
				consistencyScore: 0,
			};
		}

		const gpsPoints = records.filter((r) => r.latitude && r.longitude).length;
		const hrData = records.filter((r) => r.heart_rate && r.heart_rate > 0);
		const speedData = records.filter((r) => r.speed && r.speed > 0);
		const elevationData = records.filter((r) => r.altitude !== null && r.altitude !== undefined);

		// Calculate elevation gain from records
		let elevationGain = 0;
		if (elevationData.length > 1) {
			for (let i = 1; i < elevationData.length; i++) {
				const diff = elevationData[i].altitude! - elevationData[i - 1].altitude!;
				if (diff > 0) elevationGain += diff;
			}
		}

		// Heart rate analysis
		const hrValues = hrData.map((r) => r.heart_rate!);
		const avgHR = hrValues.length > 0 ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : null;
		const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : null;

		// Speed analysis
		const speedValues = speedData.map((r) => r.speed!);
		const topSpeed = speedValues.length > 0 ? Math.max(...speedValues) : null;

		// Consistency score (lower standard deviation = higher consistency)
		let consistencyScore = 0;
		if (speedValues.length > 2) {
			const avgSpeed = speedValues.reduce((a, b) => a + b, 0) / speedValues.length;
			const variance = speedValues.reduce((acc, speed) => acc + Math.pow(speed - avgSpeed, 2), 0) / speedValues.length;
			const stdDev = Math.sqrt(variance);
			consistencyScore = Math.max(0, 100 - (stdDev / avgSpeed) * 100);
		}

		return {
			totalDataPoints: records.length,
			gpsPoints,
			hrDataPoints: hrData.length,
			speedDataPoints: speedData.length,
			elevationGain: Math.round(elevationGain),
			averageHR: avgHR ? Math.round(avgHR) : null,
			maxHR: maxHR ? Math.round(maxHR) : null,
			topSpeed,
			consistencyScore: Math.round(consistencyScore),
		};
	};

	const analysis = analyzeRecords();

	return (
		<Card className="mx-4 mt-4">
			<CardHeader className="pb-3">
				<CardTitle className="flex-row items-center text-lg">
					<IconSymbol name="chart.bar.doc.horizontal" size={18} color="#3b82f6" />
					<Text className="ml-2">{t("activities.metrics")}</Text>
				</CardTitle>
				<CardDescription className="text-sm">{t("activities.detail.dataAnalysis", {count: analysis.totalDataPoints})}</CardDescription>
			</CardHeader>
			<CardContent className="pt-0">
				<View className="space-y-4">
					{/* Data Quality Overview */}
					<View className="bg-muted/30 rounded-xl p-4">
						<Text className="font-semibold text-sm text-foreground mb-3">{t("activities.detail.dataQuality")}</Text>
						<View className="flex-row justify-between mb-3">
							<View className="flex-1 mr-2">
								<View className="flex-row items-center justify-between mb-1">
									<Text className="text-xs text-muted-foreground">{t("activities.detail.gpsPoints")}</Text>
									<Text className="text-sm font-bold text-foreground">{analysis.gpsPoints}</Text>
								</View>
								<View className="bg-border rounded-full h-2">
									<View
										className="bg-green-500 h-2 rounded-full"
										style={{width: `${Math.min(100, (analysis.gpsPoints / analysis.totalDataPoints) * 100)}%`}}
									/>
								</View>
							</View>
							<View className="flex-1 ml-2">
								<View className="flex-row items-center justify-between mb-1">
									<Text className="text-xs text-muted-foreground">{t("activities.detail.heartRatePoints")}</Text>
									<Text className="text-sm font-bold text-foreground">{analysis.hrDataPoints}</Text>
								</View>
								<View className="bg-border rounded-full h-2">
									<View
										className="bg-red-500 h-2 rounded-full"
										style={{width: `${Math.min(100, (analysis.hrDataPoints / analysis.totalDataPoints) * 100)}%`}}
									/>
								</View>
							</View>
						</View>
					</View>

					{/* Performance Metrics from Records */}
					{(analysis.averageHR || analysis.topSpeed || analysis.elevationGain > 0) && (
						<View className="bg-muted/30 rounded-xl p-4">
							<Text className="font-semibold text-sm text-foreground mb-3">{t("activities.detail.calculatedValues")}</Text>
							<View className="flex-row flex-wrap">
								{analysis.averageHR && (
									<View className="w-1/2 mb-3 pr-2">
										<View className="flex-row items-center mb-1">
											<IconSymbol name="heart.fill" size={14} color="#ef4444" />
											<Text className="text-xs text-muted-foreground ml-1">{t("activities.detail.averageHR")}</Text>
										</View>
										<Text className="text-lg font-bold text-foreground">{analysis.averageHR} bpm</Text>
									</View>
								)}
								{analysis.maxHR && (
									<View className="w-1/2 mb-3 pl-2">
										<View className="flex-row items-center mb-1">
											<IconSymbol name="heart.fill" size={14} color="#dc2626" />
											<Text className="text-xs text-muted-foreground ml-1">{t("activities.detail.maxHR")}</Text>
										</View>
										<Text className="text-lg font-bold text-foreground">{analysis.maxHR} bpm</Text>
									</View>
								)}
								{analysis.topSpeed && (
									<View className="w-1/2 mb-3 pr-2">
										<View className="flex-row items-center mb-1">
											<IconSymbol name="speedometer" size={14} color="#f59e0b" />
											<Text className="text-xs text-muted-foreground ml-1">{t("activities.detail.topSpeed")}</Text>
										</View>
										<Text className="text-lg font-bold text-foreground">{(analysis.topSpeed * 3.6).toFixed(1)} km/h</Text>
									</View>
								)}
								{analysis.elevationGain > 0 && (
									<View className="w-1/2 mb-3 pl-2">
										<View className="flex-row items-center mb-1">
											<IconSymbol name="mountain.2.fill" size={14} color="#8b5cf6" />
											<Text className="text-xs text-muted-foreground ml-1">{t("activities.detail.elevationGain")}</Text>
										</View>
										<Text className="text-lg font-bold text-foreground">{analysis.elevationGain}m</Text>
									</View>
								)}
							</View>
						</View>
					)}

					{/* Consistency Analysis */}
					{analysis.consistencyScore > 0 && (
						<View className="bg-muted/30 rounded-xl p-4">
							<Text className="font-semibold text-sm text-foreground mb-3">{t("activities.detail.consistency")}</Text>
							<View className="flex-row items-center justify-between mb-2">
								<Text className="text-sm text-muted-foreground">{t("activities.detail.paceConsistency")}</Text>
								<Text
									className="text-lg font-bold"
									style={{
										color: analysis.consistencyScore > 80 ? "#22c55e" : analysis.consistencyScore > 60 ? "#f59e0b" : "#ef4444",
									}}
								>
									{analysis.consistencyScore}%
								</Text>
							</View>
							<View className="bg-border rounded-full h-3">
								<View
									className="h-3 rounded-full"
									style={{
										width: `${analysis.consistencyScore}%`,
										backgroundColor: analysis.consistencyScore > 80 ? "#22c55e" : analysis.consistencyScore > 60 ? "#f59e0b" : "#ef4444",
									}}
								/>
							</View>
							<Text className="text-xs text-muted-foreground mt-2">
								{analysis.consistencyScore > 80
									? t("activities.detail.veryConsistent")
									: analysis.consistencyScore > 60
										? t("activities.detail.moderateVariations")
										: t("activities.detail.highVariations")}
							</Text>
						</View>
					)}
				</View>
			</CardContent>
		</Card>
	);
});

ActivityDataAnalysis.displayName = "ActivityDataAnalysis";


// Dense and informative metrics grid component
const EnhancedMetricsGrid = React.memo(({activity, colorScheme, recordsResponse}: {activity: ActivityDetail; colorScheme: string; recordsResponse?: any}) => {
	const {t} = useTranslation();
	const activityType = activity.activity_type?.toLowerCase() || "";

	// Calculate derived metrics
	const calculateDerivedMetrics = () => {
		const duration = activity.duration || 0;
		const avgSpeed = activity.average_speed || 0;
		const avgHR = activity.average_heartrate || 0;

		// Training stress estimation
		const trainingStress = avgHR > 0 && duration > 0 ? Math.round((avgHR / 180) * (duration / 3600) * 100) : null;

		// Efficiency ratio (for running)
		const efficiencyRatio = activityType.includes("run") && avgSpeed > 0 && avgHR > 0 ? (((avgSpeed * 3.6) / avgHR) * 1000).toFixed(1) : null;

		// VAM (Vertical Ascent Meters per hour) for cycling
		const vam = activityType.includes("cycl") && activity.elevation_gain && duration > 0 ? Math.round(activity.elevation_gain / (duration / 3600)) : null;

		// Caloric burn rate (kcal/min)
		const calorieRate = activity.calories && duration > 0 ? (activity.calories / (duration / 60)).toFixed(1) : null;

		// Power-to-weight ratio (W/kg) - assuming 70kg
		const powerToWeight = activity.average_power ? (activity.average_power / 70).toFixed(1) : null;

		// Running economy (energy cost)
		const runningEconomy = activityType.includes("run") && avgSpeed > 0 && avgHR > 0 ? Math.round((avgHR * 4.184) / ((avgSpeed * 3.6) / 1000)) : null;

		// Training impulse (TRIMP)
		const trimp = avgHR > 0 && duration > 0 ? Math.round((duration / 60) * ((avgHR - 50) / (190 - 50)) * 100) : null;

		return {trainingStress, efficiencyRatio, vam, calorieRate, powerToWeight, runningEconomy, trimp};
	};

	const derived = calculateDerivedMetrics();

	// Core metrics always shown - prioritize HR and Power if available
	const coreMetrics: Metric[] = [
		{
			icon: "figure.walk",
			value: formatDistance(activity.distance || 0),
			label: t("activities.distance"),
			category: "primary",
		},
		{
			icon: "clock",
			value: formatTime(activity.duration || 0),
			label: t("activities.duration"),
			category: "primary",
		},
		// Anstieg as third metric in first row
		...(activity.elevation_gain && activity.elevation_gain > 0
			? [
					{
						icon: "mountain.2",
						value: formatElevation(activity.elevation_gain),
						label: t("activities.detail.ascent"),
						category: "primary",
					},
				]
			: []),
		// Heart rate gets priority in primary metrics - show both avg and max
		...(activity.average_heartrate
			? [
					{
						icon: "heart.fill",
						value: `${Math.round(activity.average_heartrate)}`,
						maxValue: activity.max_heartrate ? `${Math.round(activity.max_heartrate)}` : undefined,
						unit: "bpm",
						label: t("activities.heartRate"),
						category: "primary",
					},
				]
			: []),
		...(activity.average_speed
			? [
					(() => {
						const avgVelocity = formatVelocity(activity.average_speed, activityType);
						const maxVelocity = activity.max_speed ? formatVelocity(activity.max_speed, activityType) : null;
						return {
							icon: "speedometer",
							value: avgVelocity.value,
							maxValue: maxVelocity?.value,
							unit: avgVelocity.unit,
							label: avgVelocity.label === 'Pace' ? t("activities.pace") : t("activities.speed"),
							category: "primary" as const,
						};
					})(),
				]
			: []),
		// Power gets priority in primary metrics if available - show both avg and max
		...(activity.average_power
			? [
					{
						icon: "bolt.fill",
						value: `${Math.round(activity.average_power)}`,
						maxValue: activity.max_power ? `${Math.round(activity.max_power)}` : undefined,
						unit: "W",
						label: t("activities.power"),
						category: "primary",
					},
				]
			: []),
	];

	// Secondary metrics
	const secondaryMetrics: Metric[] = [
		// Remove Max HR, Max Power, and Max Speed from secondary since they're now in primary
		...(activity.calories
			? [
					{
						icon: "flame",
						value: `${Math.round(activity.calories)}`,
						unit: "kcal",
						label: t("activities.calories"),
						category: "secondary",
					},
				]
			: []),
		// Calorie burn rate
		...(derived.calorieRate
			? [
					{
						icon: "speedometer",
						value: derived.calorieRate,
						unit: "kcal/min",
						label: t("activities.detail.burnRate"),
						category: "secondary",
					},
				]
			: []),
		// Power-to-weight ratio
		...(derived.powerToWeight
			? [
					{
						icon: "scalemass",
						value: derived.powerToWeight,
						unit: "W/kg",
						label: t("activities.powerWeight"),
						category: "secondary",
					},
				]
			: []),
		// Derived performance metrics
		...(derived.trainingStress
			? [
					{
						icon: "chart.line.uptrend.xyaxis",
						value: `${derived.trainingStress}`,
						unit: "TSS",
						label: t("activities.detail.trainingLoad"),
						category: "derived",
					},
				]
			: []),
		...(derived.trimp
			? [
					{
						icon: "target",
						value: `${derived.trimp}`,
						unit: "TRIMP",
						label: t("activities.detail.trainingImpulse"),
						category: "derived",
					},
				]
			: []),
		...(derived.efficiencyRatio
			? [
					{
						icon: "gauge.medium",
						value: derived.efficiencyRatio,
						unit: "",
						label: t("activities.detail.runEfficiency"),
						category: "derived",
					},
				]
			: []),
		...(derived.runningEconomy
			? [
					{
						icon: "lungs",
						value: `${derived.runningEconomy}`,
						unit: "J/m",
						label: t("activities.detail.economy"),
						category: "derived",
					},
				]
			: []),
		...(derived.vam
			? [
					{
						icon: "mountain.2",
						value: `${derived.vam}`,
						unit: "m/h",
						label: t("activities.detail.vam"),
						category: "derived",
					},
				]
			: []),
	];

	const allMetrics = [...coreMetrics, ...secondaryMetrics];
	const primaryMetrics = allMetrics.filter((m) => m.category === "primary");

	return (
		<Card className="mx-4 mt-4">
			<CardHeader className="pb-0">
				<CardTitle className="text-lg font-bold">{t("activities.detail.overview")}</CardTitle>
			</CardHeader>
			<CardContent className="pt-0">
				{/* GPS Route Visualization */}
				{(() => {
					const records = convertArrayRecordsToObjects(recordsResponse);
					const gpsCoords = records
						.filter((r) => r.latitude && r.longitude && r.latitude !== 0 && r.longitude !== 0)
						.map((r) => ({lat: r.latitude!, lon: r.longitude!}));

					if (gpsCoords.length > 2) {
						return (
							<ActivityMap
								coords={gpsCoords}
								height={250}
								style={{
									alignSelf: "center",
									marginBottom: 24,
								}}
							/>
						);
					}
					return null;
				})()}

				{/* Compact metrics in rows */}
				<View className="">
					{/* Device Information - aligned to the right */}
					{(activity.device_name && activity.device_name !== "unknown")  && (
						<View className="flex-row justify-end mb-3">
							<View className="flex-1 mx-1">
								<View className="bg-muted rounded-lg p-3">
									<Text className="text-xs text-muted-foreground mb-1">{t("activities.detail.device")}</Text>
									<Text className="text-sm font-medium text-foreground">{activity.device_name}</Text>
								</View>
							</View>
						</View>
					)}

					{/* Primary row - most important metrics */}
					<View className="flex-row justify-between mb-3">
						{primaryMetrics.slice(0, 3).map((metric, index) => (
							<View key={index} className="flex-1 mx-1">
								<View className="bg-muted rounded-lg p-3">
									<View className="flex-row items-center justify-between mb-1">
										<Text className="text-xs font-medium text-muted-foreground">{metric.label}</Text>
										{metric.unit && <Text className="text-xs text-muted-foreground">{metric.unit}</Text>}
									</View>
									{metric.maxValue ? (
										<View>
											<View className="flex-row items-center justify-between">
												<Text className="text-xs text-muted-foreground">{t("activities.detail.avg")}</Text>
												<Text className="text-sm font-bold text-foreground">{metric.value}</Text>
											</View>
											<View className="flex-row items-center justify-between mt-1">
												<Text className="text-xs text-muted-foreground">{t("activities.detail.max")}</Text>
												<Text className="text-sm font-bold text-primary">{metric.maxValue}</Text>
											</View>
										</View>
									) : (
										<Text className="text-lg font-bold text-foreground">{metric.value}</Text>
									)}
								</View>
							</View>
						))}
					</View>

					{/* Secondary row if we have more primary metrics */}
					{primaryMetrics.length > 3 && (
						<View className="flex-row justify-between">
							{primaryMetrics.slice(3, 6).map((metric, index) => (
								<View key={index} className="flex-1 mx-1">
									<View className="bg-muted rounded-lg p-3">
										<View className="flex-row items-center justify-between mb-1">
											<Text className="text-xs font-medium text-muted-foreground">{metric.label}</Text>
											{metric.unit && <Text className="text-xs text-muted-foreground">{metric.unit}</Text>}
										</View>
										{metric.maxValue ? (
											<View>
												<View className="flex-row items-center justify-between">
													<Text className="text-xs text-muted-foreground">{t("activities.detail.avg")}</Text>
													<Text className="text-sm font-bold text-foreground">{metric.value}</Text>
												</View>
												<View className="flex-row items-center justify-between mt-1">
													<Text className="text-xs text-muted-foreground">{t("activities.detail.max")}</Text>
													<Text className="text-sm font-bold text-primary">{metric.maxValue}</Text>
												</View>
											</View>
										) : (
											<Text className="text-lg font-bold text-foreground">{metric.value}</Text>
										)}
									</View>
								</View>
							))}
						</View>
					)}
				</View>
			</CardContent>
		</Card>
	);
});

EnhancedMetricsGrid.displayName = "EnhancedMetricsGrid";

// Trainer Feedback Component
const TrainerFeedback = React.memo(({feedback}: {feedback: string | null}) => {
	const {t} = useTranslation();
	const {colorScheme} = useTheme();
	const isDark = colorScheme === "dark";

	// Don't render if no feedback
	if (!feedback) {
		return null;
	}

	return (
		<Card className="mx-4 mt-4">
			<CardHeader className="">
				<CardTitle className="flex-row items-center text-lg">
					<Text className="ml-2">{t("activities.detail.trainerFeedback")}</Text>
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0">
				{/* Single chat bubble */}
				<View className="flex-row items-center">
					{/* Chat Bubble */}
					<View className="flex-1 max-w-[100%]">
						<View className="px-4 py-4 rounded-2xl rounded-bl-md bg-muted" style={{}}>
							<Markdown
								style={{
									body: {
										fontSize: 14,
										lineHeight: 20,
										color: isDark ? "#ffffff" : "#000000",
										margin: 0,
										padding: 0,
									},
									paragraph: {
										marginTop: 0,
										marginBottom: 8,
										color: isDark ? "#ffffff" : "#000000",
									},
									strong: {
										fontWeight: "bold",
										color: isDark ? "#ffffff" : "#000000",
									},
									em: {
										fontStyle: "italic",
										color: isDark ? "#ffffff" : "#000000",
									},
									code_inline: {
										backgroundColor: isDark ? "#333333" : "#f3f4f6",
										color: isDark ? "#a1a1aa" : "#6b7280",
										paddingHorizontal: 4,
										paddingVertical: 2,
										borderRadius: 4,
										fontSize: 13,
									},
									code_block: {
										backgroundColor: isDark ? "#333333" : "#f3f4f6",
										color: isDark ? "#a1a1aa" : "#6b7280",
										padding: 8,
										borderRadius: 8,
										fontSize: 13,
										marginVertical: 4,
									},
									fence: {
										backgroundColor: isDark ? "#333333" : "#f3f4f6",
										color: isDark ? "#a1a1aa" : "#6b7280",
										padding: 8,
										borderRadius: 8,
										fontSize: 13,
										marginVertical: 4,
									},
									blockquote: {
										backgroundColor: isDark ? "#2a2a2a" : "#f9fafb",
										borderLeftWidth: 4,
										borderLeftColor: "#005287",
										paddingLeft: 12,
										paddingVertical: 8,
										marginVertical: 4,
									},
									list_item: {
										color: isDark ? "#ffffff" : "#000000",
										marginBottom: 4,
									},
								}}
							>
								{feedback}
							</Markdown>
						</View>
					</View>
				</View>
			</CardContent>
		</Card>
	);
});

TrainerFeedback.displayName = "TrainerFeedback";

// User Feedback Component - now using TanStack Query
const UserFeedbackSection = React.memo(({sessionId, initialUserFeedback}: {sessionId: string; initialUserFeedback: any}) => {
	const [feel, setFeel] = useState<number | null>(initialUserFeedback?.feel ?? null);
	const [rpe, setRpe] = useState<number | null>(initialUserFeedback?.rpe ?? null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isEditing, setIsEditing] = useState(!initialUserFeedback);
	const [hasSavedFeedback, setHasSavedFeedback] = useState(!!initialUserFeedback);
	const {colorScheme} = useTheme();

	const {t} = useTranslation();
	const isDark = colorScheme === "dark";

	// Feel options: 0=Very Weak, 25=Weak, 50=Normal, 75=Strong, 100=Very Strong
	const feelOptions = [
		{value: 0, label: "Very Weak", emoji: "😫", color: "#ef4444"},
		{value: 25, label: "Weak", emoji: "😕", color: "#f97316"},
		{value: 50, label: "Normal", emoji: "😐", color: "#f59e0b"},
		{value: 75, label: "Strong", emoji: "🙂", color: "#84cc16"},
		{value: 100, label: "Very Strong", emoji: "💪", color: "#22c55e"},
	];

	// RPE options: 0-100 with labels
	const rpeOptions = [
		{value: 0, label: "Nothing at all"},
		{value: 10, label: "Very Easy"},
		{value: 20, label: "Easy"},
		{value: 30, label: "Easy"},
		{value: 40, label: "Comfortable"},
		{value: 50, label: "Slightly Challenging"},
		{value: 60, label: "Difficult"},
		{value: 70, label: "Hard"},
		{value: 80, label: "Very Hard"},
		{value: 90, label: "Extremely Hard"},
		{value: 100, label: "Maximal Effort"},
	];

	const saveFeedbackMutation = useSaveUserSessionFeedback(sessionId);

	const saveFeedback = async () => {
		if (feel === null && rpe === null) return;

		setError(null);
		setSaveSuccess(false);

		try {
			await saveFeedbackMutation.mutateAsync({
				feel: feel ?? undefined,
				rpe: rpe ?? undefined,
			});
			setHasSavedFeedback(true);
			setIsEditing(false);
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 3000);
		} catch (error) {
			console.error("Error saving feedback:", error);
			setError(t("activities.detail.feedbackSaveError"));
			setTimeout(() => setError(null), 5000);
		}
	};

	const selectedFeel = feelOptions.find((f) => f.value === feel);
	const selectedRpe = rpeOptions.find((r) => r.value === rpe);

	// Shared container style for standardizing spacing
	const SectionContainer = ({children, className}: {children: React.ReactNode; className?: string}) => (
		<View className={`w-full ${className}`}>{children}</View>
	);

	return (
		<Card className="mx-4 mt-4 overflow-hidden">
			<CardHeader className="pb-3">
				<View className="flex-row items-center justify-between">
					<CardTitle className="text-lg">{t("activities.detail.yourFeedback")}</CardTitle>

					{hasSavedFeedback && !isEditing && (
						<TouchableOpacity
							onPress={() => setIsEditing(true)}
							className={`p-2 rounded-full ${isDark ? "bg-muted hover:bg-muted/80" : "bg-secondary hover:bg-secondary/80"}`}
							style={{width: 32, height: 32, alignItems: "center", justifyContent: "center"}}
						>
							<IconSymbol name="pencil" size={12} color={isDark ? "#9ca3af" : "#6b7280"} />
						</TouchableOpacity>
					)}
				</View>
				{(!hasSavedFeedback || isEditing) && <CardDescription>{t("activities.detail.howDidYouFeel")}</CardDescription>}
			</CardHeader>

			<CardContent className="p-4 pt-0">
				{hasSavedFeedback && !isEditing ? (
					// READ-ONLY VIEW
					<View className="flex-row flex-wrap gap-4">
						{/* Feel Display */}
						{selectedFeel && (
							<View className="flex-1 min-w-[45%]">
								<Text className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
									{t("activities.detail.feedback.feel")}
								</Text>
								<View
									className="flex-row items-center p-3 rounded-xl border"
									style={{
										backgroundColor: `${selectedFeel.color}10`,
										borderColor: `${selectedFeel.color}30`,
									}}
								>
									<Text className="text-lg mr-3">{selectedFeel.emoji}</Text>
									<View>
										<Text className="font-semibold text-base" style={{color: selectedFeel.color}}>
											{t(`activities.detail.feedback.feelValues.${selectedFeel.value}`)}
										</Text>
									</View>
								</View>
							</View>
						)}

						{/* RPE Display */}
						{selectedRpe && (
							<View className="flex-1 min-w-[45%]">
								<Text className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
									{t("activities.detail.feedback.rpe")}
								</Text>
								<View
									className={`flex-row items-center p-3 rounded-xl border ${isDark ? "bg-muted/50 border-border" : "bg-secondary/30 border-secondary"}`}
								>
									<View
										className="w-8 h-8 rounded-full items-center justifyContent-center mr-3"
										style={{backgroundColor: isDark ? "#3b82f6" : "#2563eb"}}
									>
										<Text className="text-white text-xs font-bold">{rpe}</Text>
									</View>
									<View>
										<Text className="font-semibold text-base text-foreground">
											{t(`activities.detail.feedback.rpeValues.${selectedRpe.value}`)}
										</Text>
										<Text className="text-xs text-muted-foreground">{t("activities.detail.perceivedExertion")}</Text>
									</View>
								</View>
							</View>
						)}
					</View>
				) : (
					// EDIT VIEW
					<View className="gap-5">
						{/* Feel Selection */}
						<SectionContainer>
							<Text className="text-sm font-semibold text-foreground mb-3 ml-1">
								{t("activities.detail.feedback.howDidYouFeel")}
							</Text>
							<View className="flex-row justify-between gap-2 overflow-hidden">
								{feelOptions.map((option) => (
									<TouchableOpacity
										key={option.value}
										onPress={() => setFeel(option.value)}
										activeOpacity={0.7}
										className="flex-1 items-center gap-1.5 p-1.5 rounded-xl border transition-all"
										style={{
											backgroundColor:
												feel === option.value ? `${option.color}15` : isDark ? "transparent" : "#f9fafb",
											borderColor: feel === option.value ? option.color : isDark ? "#333" : "#e5e7eb",
											borderWidth: feel === option.value ? 2 : 1,
											minWidth: 55,
										}}
									>
										<Text className="text-lg">{option.emoji}</Text>
										<Text
											numberOfLines={1}
											adjustsFontSizeToFit
											className="text-[10px] font-medium text-center"
											style={{
												color: feel === option.value ? option.color : isDark ? "#9ca3af" : "#6b7280",
											}}
										>
											{t(`activities.detail.feedback.feelValues.${option.value}`)}
										</Text>
									</TouchableOpacity>
								))}
							</View>
						</SectionContainer>

						<View className="h-[1px] bg-border/50" />

						{/* RPE Selection */}
						<SectionContainer>
							<View className="flex-col items-start justify-between mb-4">
								<Text className="text-sm font-semibold text-foreground ml-1 mb-2">{t("activities.detail.feedback.rpe")}</Text>
								{rpe !== null && (
									<View className="px-2.5 py-1 rounded-full bg-primary">
										<Text className="text-xs font-bold text-primary-foreground">
											{rpe} — {t(`activities.detail.feedback.rpeValues.${rpe}`)}
										</Text>
									</View>
								)}
							</View>

							<View className="px-2">
								<Slider
									minimumValue={0}
									maximumValue={100}
									step={10}
									value={rpe ?? 0}
									onSlidingComplete={(value) => setRpe(value)}
									minimumTrackTintColor={isDark ? "#3b82f6" : "#2563eb"}
									maximumTrackTintColor={isDark ? "#374151" : "#e5e7eb"}
									thumbTintColor={isDark ? "#60a5fa" : "#3b82f6"}
									style={{height: 40}}
								/>
								<View className="flex-row justify-between mt-1 px-1">
									<Text className="text-[10px] bg-muted px-2 py-0.5 rounded-md overflow-hidden text-muted-foreground">
										{t("activities.detail.feedback.rpeMin")}
									</Text>
									<Text className="text-[10px] bg-muted px-2 py-0.5 rounded-md overflow-hidden text-muted-foreground">
										{t("activities.detail.feedback.rpeMax")}
									</Text>
								</View>
							</View>
						</SectionContainer>

						{/* Feedback Messages */}
						{saveSuccess && (
							<View className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex-row items-center justify-center">
								<IconSymbol name="checkmark.circle.fill" size={16} color="#22c55e" />
								<Text className="ml-2 text-green-600 dark:text-green-400 text-sm font-medium">
									{t("activities.detail.feedbackSaveSuccess")}
								</Text>
							</View>
						)}

						{error && (
							<View className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex-row items-center justify-center">
								<IconSymbol name="exclamationmark.triangle.fill" size={16} color="#ef4444" />
								<Text className="ml-2 text-red-600 dark:text-red-400 text-sm font-medium">{error}</Text>
							</View>
						)}

						{/* Action Buttons */}
						<View className="flex-row gap-3 pt-1">
							{hasSavedFeedback && (
								<TouchableOpacity
									onPress={() => setIsEditing(false)}
									className={`flex-1 rounded-lg p-2.5 flex-row items-center justify-center border ${
										isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
									}`}
								>
									<Text className="text-muted-foreground font-semibold text-sm">{t("activities.detail.cancel")}</Text>
								</TouchableOpacity>
							)}

							{(feel !== null || rpe !== null) && (
								<TouchableOpacity
									onPress={saveFeedback}
									disabled={saveFeedbackMutation.isPending}
									className={`${
										hasSavedFeedback ? "flex-[2]" : "w-full"
									} bg-primary rounded-lg p-2.5 flex-row items-center justify-center shadow-sm`}
								>
									{saveFeedbackMutation.isPending ? (
										<ActivityIndicator size="small" color="#ffffff" />
									) : (
										<>
											<IconSymbol name="checkmark" size={16} color="#ffffff" />
											<Text className="text-white font-bold text-sm ml-2">
												{hasSavedFeedback
													? t("activities.detail.updateFeedback")
													: t("activities.detail.saveFeedback")}
											</Text>
										</>
									)}
								</TouchableOpacity>
							)}
						</View>
					</View>
				)}
			</CardContent>
		</Card>
	);
});

UserFeedbackSection.displayName = "UserFeedbackSection";

// Performance Charts and Indicators Component with Zoomable Line Charts
const PerformanceChartsSection = React.memo(({activity, records}: {activity: ActivityDetail; records?: ActivityRecord[]}) => {
	const {t} = useTranslation();

	// Extract and convert real performance data from records for ZoomableLineChart
	const extractPerformanceDataForCharts = () => {
		if (!records || records.length === 0) {
			return {speedData: [], hrData: [], powerData: []};
		}

		// Sort records by timestamp
		const sortedRecords = [...records].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		// Extract speed data and convert to DataPoint format
		const speedData: DataPoint[] = sortedRecords
			.filter((r) => r.speed !== null && r.speed !== undefined && r.speed > 0)
			.map((r, index) => ({
				second: index,
				minute: Math.floor(index / 60),
				time: `${Math.floor(index / 60)}:${(index % 60).toString().padStart(2, "0")}`,
				value: r.speed! * 3.6, // Convert m/s to km/h
				altitude: r.altitude || 0, // Include altitude data
			}));

		// Extract heart rate data and convert to DataPoint format
		const hrData: DataPoint[] = sortedRecords
			.filter((r) => r.heart_rate !== null && r.heart_rate !== undefined && r.heart_rate > 30)
			.map((r, index) => ({
				second: index,
				minute: Math.floor(index / 60),
				time: `${Math.floor(index / 60)}:${(index % 60).toString().padStart(2, "0")}`,
				value: r.heart_rate!,
				altitude: r.altitude || 0, // Include altitude data
			}));

		// Extract power data if available and convert to DataPoint format
		const rawPowerData: DataPoint[] = sortedRecords
			.filter((r) => r.power !== null && r.power !== undefined && r.power > 0)
			.map((r, index) => ({
				second: index,
				minute: Math.floor(index / 60),
				time: `${Math.floor(index / 60)}:${(index % 60).toString().padStart(2, "0")}`,
				value: r.power!,
				altitude: r.altitude || 0, // Include altitude data
			}));

		// Apply 30-second moving average to power data for smoother visualization
		const powerData: DataPoint[] = rawPowerData.map((point, index) => {
			// Calculate window: 30 seconds = 30 data points (assuming 1 Hz sampling)
			const windowSize = 30;
			const startIndex = Math.max(0, index - Math.floor(windowSize / 2));
			const endIndex = Math.min(rawPowerData.length, index + Math.ceil(windowSize / 2));

			// Calculate average of values in window
			const windowValues = rawPowerData.slice(startIndex, endIndex).map((p) => p.value);
			const averageValue = windowValues.reduce((sum, val) => sum + val, 0) / windowValues.length;

			return {
				...point,
				value: averageValue,
			};
		});

		return {speedData, hrData, powerData};
	};

	const {speedData, hrData, powerData} = extractPerformanceDataForCharts();

	// Define zones for each metric
	const heartRateZones: Zone[] = [
		{min: 50, max: 100, color: "#22c55e", label: "Recovery"},
		{min: 100, max: 140, color: "#84cc16", label: "Aerobic"},
		{min: 140, max: 160, color: "#eab308", label: "Threshold"},
		{min: 160, max: 180, color: "#f97316", label: "VO2 Max"},
		{min: 180, max: 220, color: "#ef4444", label: "Anaerobic"},
	];

	const powerZones: Zone[] = [
		{min: 0, max: 150, color: "#22c55e", label: "Recovery"},
		{min: 150, max: 200, color: "#84cc16", label: "Endurance"},
		{min: 200, max: 250, color: "#eab308", label: "Tempo"},
		{min: 250, max: 300, color: "#f97316", label: "Threshold"},
		{min: 300, max: 500, color: "#ef4444", label: "VO2 Max"},
	];

	const hasData = speedData.length > 0 || hrData.length > 0 || powerData.length > 0;

	if (!hasData) {
		return (
			<Card className="mx-4 mt-4">
				<CardHeader className="pb-3">
					<CardTitle className="text-lg">{t("activities.detail.performanceCharts")}</CardTitle>
					<CardDescription className="text-sm">{t("activities.detail.noPerformanceData")}</CardDescription>
				</CardHeader>
				<CardContent className="pt-0">
					<Text className="text-center text-muted-foreground py-4">{t("activities.detail.noDetailedData")}</Text>
				</CardContent>
			</Card>
		);
	}

	return (
		<View className="space-y-4">
			{/* Speed Chart */}
			{speedData.length > 0 && (
				<ZoomableLineChart
					data={speedData}
					title={t("activities.detail.speedChart")}
					subtitle={`${t("activities.detail.average")}: ${(speedData.reduce((sum, p) => sum + p.value, 0) / speedData.length).toFixed(1)} km/h`}
					color="#3b82f6"
					unit="km/h"
					zones={[]}
					height={280}
					showZones={false}
					showSmoothnessControl={true}
					showDebugStats={false}
					showAltitudeToggle={true}
					altitudeColor="#10b981"
					attributionText={activity.upload_source === "garmin" ? t("activities.detail.garminAttribution") : undefined}
				/>
			)}

			{/* Heart Rate Chart */}
			{hrData.length > 0 && (
				<ZoomableLineChart
					data={hrData}
					title={t("activities.detail.heartRateChart")}
					subtitle={`${t("activities.detail.average")}: ${Math.round(hrData.reduce((sum, p) => sum + p.value, 0) / hrData.length)} bpm`}
					color="#ef4444"
					unit="bpm"
					zones={heartRateZones}
					height={280}
					showZones={true}
					showSmoothnessControl={true}
					showDebugStats={false}
					showAltitudeToggle={true}
					altitudeColor="#10b981"
					attributionText={activity.upload_source === "garmin" ? t("activities.detail.garminAttribution") : undefined}
				/>
			)}

			{/* Power Chart */}
			{powerData.length > 0 && (
				<ZoomableLineChart
					data={powerData}
					title={t("activities.detail.powerChart")}
					subtitle={`${t("activities.detail.average")}: ${Math.round(powerData.reduce((sum, p) => sum + p.value, 0) / powerData.length)} W`}
					color="#8b5cf6"
					unit="W"
					zones={powerZones}
					height={280}
					showZones={true}
					showSmoothnessControl={true}
					showDebugStats={false}
					showAltitudeToggle={true}
					altitudeColor="#10b981"
					attributionText={activity.upload_source === "garmin" ? t("activities.detail.garminAttribution") : undefined}
				/>
			)}
		</View>
	);
});

PerformanceChartsSection.displayName = "PerformanceChartsSection";

/**
 * Session Detail Screen - Shows details of a single training session
 *
 * IMPORTANT: This screen displays SESSION data, not activity data!
 *
 * Database Structure:
 * - activities: Container table (e.g., one triathlon FIT file)
 * - sessions: Individual training sessions (e.g., swim/bike/run parts of triathlon)
 *
 * The route parameter 'id' is a SESSION ID (not an activity ID).
 * We fetch the session data and display session-specific metrics.
 *
 * OPTIMIZED VERSION: Uses TanStack Query with a single combined endpoint
 * to fetch all data in one request, reducing load time from 2-5s to <1s.
 */
export default function SessionDetailScreen() {
	const {id} = useLocalSearchParams(); // This is a SESSION ID
	const {user} = useAuth();
	const {colorScheme} = useTheme();
	const {t} = useTranslation();
	const navigation = useNavigation();
	const queryClient = useQueryClient();
	const [isDeleting, setIsDeleting] = useState(false);

	// Fetch complete session data in a single optimized request
	const {data: sessionData, isLoading, error} = useSessionComplete(id as string | undefined, true);



	// Convert session data to ActivityDetail format for compatibility with existing components
	const activity = useMemo((): ActivityDetail | null => {
		if (!sessionData?.session) {
			return null;
		}

		const session = sessionData.session;
		// Get title from session_custom_data, fallback to sport
		const title = session.session_custom_data?.title || session.sport.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

		const activityDetail = {
			id: session.id,
			user_id: session.user_id,
			provider_id: "session",
			provider_activity_id: session.activity_id,
			name: title,
			activity_type: session.sport,
			start_date: session.start_time,
			start_date_local: session.start_time,
			distance: session.total_distance,
			duration: session.total_timer_time || session.total_elapsed_time,
			elevation_gain: session.total_elevation_gain,
			calories: session.total_calories,
			average_heartrate: session.avg_heart_rate,
			max_heartrate: session.max_heart_rate,
			average_speed: session.avg_speed,
			max_speed: session.max_speed,
			average_power: undefined,
			max_power: undefined,
			description: session.sub_sport,
			provider_name: "session",
			strava_activity_id: session.strava_activity_id,
			external_id: session.external_id,
			upload_source: session.upload_source,
			device_name: session.device_name,
			manufacturer: session.manufacturer,
			product: session.product,
		} as ActivityDetail;

		console.log('🏃‍♂️ Converted session to activity detail:', activityDetail);
		return activityDetail;
	}, [sessionData]);

	// Memoize converted records to prevent unnecessary recalculations
	const records = useMemo(() => {
		if (!sessionData?.records) return [];
		return convertArrayRecordsToObjects(sessionData.records);
	}, [sessionData?.records]);


	// Handle delete activity
	const handleDelete = async () => {
		if (!activity?.provider_activity_id) return;

		showAlert(t("activities.detail.deleteConfirmTitle"), t("activities.detail.deleteConfirmMessage"), [
			{
				text: t("common.cancel"),
				style: "cancel",
			},
			{
				text: t("common.delete"),
				style: "destructive",
				onPress: async () => {
					setIsDeleting(true);
					try {
						await apiClient.deleteActivity(activity.provider_activity_id!);
						// Invalidate queries to refresh the activity list
						queryClient.invalidateQueries({queryKey: ["sessions"]});
						queryClient.invalidateQueries({queryKey: ["activities"]});
						// Navigate back to activities list
						router.push("/activities");
					} catch (error) {
						console.error("Error deleting activity:", error);
						showAlert(t("common.error"), t("activities.detail.deleteError"));
					} finally {
						setIsDeleting(false);
					}
				},
			},
		]);
	};

	// Handle reprocess file
	const handleReprocess = async () => {
		if (!id) return;

		try {
			await reprocessMutation.mutateAsync();
			showAlert(t("common.success") || "Success", t("activities.detail.reprocessSuccess") || "Session reprocessed successfully");
		} catch (error) {
			console.error("Error reprocessing session:", error);
			showAlert(t("common.error") || "Error", t("activities.detail.reprocessError") || "Failed to reprocess session");
		}
	};

	// Set navigation title when data loads
	React.useEffect(() => {
		if (activity) {
			navigation.setOptions({
				title: t("activities.detail.session"),
				headerStyle: {backgroundColor: colorScheme === "dark" ? "#000000" : "#ffffff"},
				headerTitleStyle: {color: colorScheme === "dark" ? "#ffffff" : "#000000"},
			});
		}
	}, [activity, colorScheme, navigation, t]);

	if (!user) {
		console.log('🚫 Rendering: No user - showing sign in required');
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
				<View className="flex-1 items-center justify-center">
					<Text className="text-base text-muted-foreground">{t("activities.detail.signInRequired")}</Text>
				</View>
			</View>
		);
	}

	if (isLoading) {
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color={colorScheme === "dark" ? "#ffffff" : "#000000"} />
				</View>
			</View>
		);
	}

	if (error || !activity) {
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
				<View className="flex-1 items-center justify-center px-4">
					<Text className="text-base text-muted-foreground mb-2">{t("activities.noActivities")}</Text>
					{error && (
						<Text className="text-sm text-red-500 text-center">
							Error: {error instanceof Error ? error.message : String(error)}
						</Text>
					)}
					{!error && !activity && !isLoading && (
						<Text className="text-sm text-muted-foreground text-center mt-2">
							Session ID: {id}
						</Text>
					)}
					<TouchableOpacity
						onPress={() => router.back()}
						className="mt-4 bg-primary px-4 py-2 rounded-lg"
					>
						<Text className="text-primary-foreground">Go Back</Text>
					</TouchableOpacity>
				</View>
			</View>
		);
	}

	return (
		<View key={`session-${id}`} style={styles.container}>
			<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

			{/* Compact Header */}
			<View className="px-4 py-3 flex-row items-center bg-background border-b border-border">
				<TouchableOpacity onPress={() => router.back()} className="p-2 rounded-full 	">
					<IconSymbol name="chevron.left" size={20} color={colorScheme === "dark" ? "#ffffff" : "#111827"} />
				</TouchableOpacity>

				<View className="ml-3 flex-1">
					<Text className="text-xl font-bold text-foreground">{t(`activityTypes.${activity.activity_type}`, { defaultValue: activity.name })}</Text>
					<Text className="text-sm text-muted-foreground">
						{(() => {
							const start = activity.start_date || (activity as any).start_date_local || "";
							return start ? formatDate(start) : "-";
						})()}
					</Text>
				</View>

				{/* Actions: iOS nutzt ActionSheet, andere Plattformen Dropdown */}
				<View className="justify-center">
					{Platform.OS === 'ios' ? (
						<TouchableOpacity
							className="border border-border bg-background rounded-md h-10 px-3 items-center justify-center"
							onPress={() => {
								const isStravaActivity = activity?.upload_source === "strava" && !!activity?.external_id;
								const options = [
									...(isStravaActivity ? [t("activities.detail.viewOnStrava") as string] : []),
									t("activities.detail.delete") as string,
									t("common.cancel") as string,
								];
								const cancelButtonIndex = options.length - 1;
								const destructiveButtonIndex = options.indexOf(t("activities.detail.delete") as string);
								ActionSheetIOS.showActionSheetWithOptions(
									{
										options,
										cancelButtonIndex,
										destructiveButtonIndex,
									},
									(buttonIndex) => {
										if (buttonIndex === cancelButtonIndex) return;
										let cursor = 0;
										if (isStravaActivity) {
											if (buttonIndex === cursor) {
												const stravaUrl = `https://www.strava.com/activities/${activity!.external_id}`;
												Linking.openURL(stravaUrl).catch((err) => {
													console.error("Error opening Strava URL:", err);
													showAlert(t("common.error"), t("activities.detail.couldNotOpenStrava"));
												});
												return;
											}
											cursor += 1;
										}
										if (buttonIndex === cursor) {
											handleReprocess();
											return;
										}
										if (buttonIndex === cursor + 1) {
											handleDelete();
										}
									}
								);
							}}
						>
							<Text className="text-foreground text-xl">…</Text>
						</TouchableOpacity>
					) : (
						<DropdownMenu>
							<DropdownMenuTrigger
								className="border border-border bg-background rounded-md h-10 px-3 items-center justify-center"
							>
								<Text className="text-foreground text-xl">…</Text>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								portalHost="root"
								sideOffset={2}
								align="end"
							>
							{activity?.strava_activity_id && (
								<>
									<DropdownMenuItem
										onPress={() => {
											const stravaUrl = `https://www.strava.com/activities/${activity.strava_activity_id}`;
											Linking.openURL(stravaUrl).catch((err) => {
												console.error("Error opening Strava URL:", err);
												showAlert(t("common.error"), t("activities.detail.couldNotOpenStrava"));
											});
										}}
									>
										<Text>{t("activities.detail.viewOnStrava")}</Text>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem onPress={handleDelete} variant="destructive" disabled={isDeleting}>
								<Text>{isDeleting ? t("activities.detail.deleting") : t("activities.detail.delete")}</Text>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>)
					}
				</View>
			</View>

			<ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} className="bg-background">
				{/* Enhanced Dense Metrics Grid - Session Overview */}
				<EnhancedMetricsGrid activity={activity} colorScheme={colorScheme} recordsResponse={sessionData?.records} />
				
				{/* Trainer Feedback */}
				<TrainerFeedback feedback={sessionData?.trainer_feedback || null} />
				{/* User Feedback Section */}
				<UserFeedbackSection sessionId={id as string} initialUserFeedback={sessionData?.user_feedback} />
				{/* Performance Charts and Trends */}
				<View className="mx-4 mt-4">
					<PerformanceChartsSection activity={activity} records={records} />
				</View>
				{/* Social Media Overlays Section */}
				<SocialMediaOverlaysSection activity={activity} records={records} feedback={sessionData?.trainer_feedback || null} />

				{/* Bottom padding */}
				<View style={{height: 40}} />
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	scrollView: {
		flex: 1,
	},
});
