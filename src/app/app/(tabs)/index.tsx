import React, {useState} from "react";
import {View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Platform, KeyboardAvoidingView} from "react-native";
import {router} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {StatusBar} from "expo-status-bar";
import {useTheme} from "@/contexts/ThemeContext";
import {LinearGradient} from "expo-linear-gradient";
import {FeedbackDialog} from "@/components/FeedbackDialog";
import {userFeedbackService} from "@/services/userFeedback";
import {showAlert} from "@/utils/alert";
import {useCurrentTrainingStatus, useTrainingStatusHistory} from "@/hooks/useTraining";
import {usePlannedWorkouts} from "@/hooks/useWorkouts";
import {useAgentActionListener} from "@/hooks/useAgentActionListener";
import {useQuery} from "@tanstack/react-query";
import {apiClient, CalendarSession} from "@/services/api";
import {
	Svg,
	Circle,
	Path,
	G,
	Text as SvgText,
	Line,
	Defs,
	LinearGradient as SvgLinearGradient,
	Stop,
} from "react-native-svg";
import {TrainingStatus} from "@/services/trainingStatus";
import {RECENT_FEATURES, ROADMAP_ITEMS} from "@/constants/featuresAndRoadmap";
import {useTranslation} from "react-i18next";
import {ProviderIntegrationsSection} from "@/components/ProviderIntegrationsSection";
import {TrainingOverview} from "@/components/training-overview";

// Responsive Training Chart with Container Query approach
const ResponsiveTrainingChart = ({data, isDark = false}: {data: TrainingStatus[]; isDark?: boolean}) => {
	const {t} = useTranslation();
	const [containerWidth, setContainerWidth] = useState(300);
	const [timeRange, setTimeRange] = useState<"1month" | "3months" | "1year">("1month");

	// Filter data based on selected time range and fill missing days with 0 values
	const filteredData = React.useMemo(() => {
		const now = new Date();
		const cutoffDate = new Date();

		if (timeRange === "1month") {
			cutoffDate.setMonth(now.getMonth() - 1);
		} else if (timeRange === "3months") {
			cutoffDate.setMonth(now.getMonth() - 3);
		} else {
			cutoffDate.setFullYear(now.getFullYear() - 1);
		}

		// Create a map of existing data by date
		const dataMap = new Map<string, TrainingStatus>();
		data.forEach((item) => {
			const dateKey = new Date(item.date).toISOString().split("T")[0];
			dataMap.set(dateKey, item);
		});

		// Generate complete date range with 0 values for missing days
		const filledData: TrainingStatus[] = [];
		const currentDate = new Date(cutoffDate);

		while (currentDate <= now) {
			const dateKey = currentDate.toISOString().split("T")[0];
			const existingData = dataMap.get(dateKey);

			if (existingData) {
				filledData.push(existingData);
			} else {
				// Create 0-value entry for missing day
				filledData.push({
					date: dateKey,
					fitness: 0,
					fatigue: 0,
					form: 0,
				});
			}

			currentDate.setDate(currentDate.getDate() + 1);
		}

		return filledData;
	}, [data, timeRange]);

	if (!data || data.length === 0) {
		return (
			<View style={{backgroundColor: isDark ? "#1E293B" : "#FFFFFF", borderRadius: 23, padding: 16}}>
				<Text style={{color: isDark ? "#E2E8F0" : "#2D3748", textAlign: "center"}}>{t("home.noTrainingData")}</Text>
			</View>
		);
	}

	if (!filteredData || filteredData.length === 0) {
		return (
			<View style={{backgroundColor: isDark ? "#1E293B" : "#FFFFFF", borderRadius: 23, padding: 16}}>
				<Text style={{color: isDark ? "#E2E8F0" : "#2D3748", textAlign: "center"}}>{t("home.noDataForTimeRange")}</Text>
			</View>
		);
	}

	const padding = 16;
	const headerHeight = 60; // Space for buttons
	const bottomPadding = 40; // Space for X-axis
	const height = 320 + headerHeight + bottomPadding;
	const chartWidth = Math.max(containerWidth - padding * 2, 200);
	const chartHeight = 260; // Fixed chart area height

	// Calculate data ranges (with 0 values included)
	const fitnessValues = filteredData.map((d) => d.fitness);
	const fatigueValues = filteredData.map((d) => d.fatigue);

	// Only use non-zero values for min/max calculation to avoid chart being dominated by 0-line
	const nonZeroFitness = fitnessValues.filter((v) => v > 0);
	const nonZeroFatigue = fatigueValues.filter((v) => v > 0);
	const nonZeroValues = [...nonZeroFitness, ...nonZeroFatigue];

	let dataMin, dataMax;
	if (nonZeroValues.length > 0) {
		dataMin = 0;
		dataMax = Math.max(...nonZeroValues);
	} else {
		// Fallback if all values are 0
		dataMin = 0;
		dataMax = 100;
	}

	const valueRange = dataMax - dataMin || 1;
	const minValue = Math.max(0, dataMin - valueRange * 0.1); // Don't go below 0
	const maxValue = dataMax + valueRange * 0.1;
	const totalRange = maxValue - minValue;

	// Create paths
	const createPath = (values: number[]) => {
		if (values.length < 2) return "";

		const points = values.map((value, index) => ({
			x: padding + (index / (values.length - 1)) * chartWidth,
			y: headerHeight + padding + ((maxValue - value) / totalRange) * chartHeight,
		}));

		let path = `M ${points[0].x} ${points[0].y}`;
		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1];
			const curr = points[i];
			const cp1x = prev.x + (curr.x - prev.x) * 0.5;
			const cp1y = prev.y;
			const cp2x = prev.x + (curr.x - prev.x) * 0.5;
			const cp2y = curr.y;
			path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
		}
		return path;
	};

	// Create area paths (line + fill to bottom)
	const createAreaPath = (values: number[]) => {
		const linePath = createPath(values);
		if (values.length < 2) return "";

		const firstX = padding;
		const lastX = padding + chartWidth;
		const bottomY = headerHeight + padding + chartHeight;

		return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
	};

	const fitnessPath = createPath(fitnessValues);
	const fatiguePath = createPath(fatigueValues);

	const fitnessAreaPath = createAreaPath(fitnessValues);
	const fatigueAreaPath = createAreaPath(fatigueValues);

	const theme = {
		text: isDark ? "#E2E8F0" : "#2D3748",
		textSecondary: isDark ? "#A0AEC0" : "#64748B",
		grid: isDark ? "rgba(148, 163, 184, 0.1)" : "rgba(148, 163, 184, 0.2)",
	};

	const onContainerLayout = (event: any) => {
		const {width} = event.nativeEvent.layout;
		if (width > 0) {
			setContainerWidth(width);
		}
	};

	return (
		<View className="mb-6">
			{/* Header */}
			<View style={{marginBottom: 16}}>
				{/* Time range toggle buttons */}
				<View style={{alignItems: "center"}}>
					<View className="flex-row bg-muted rounded-xl p-1">
						<TouchableOpacity
							style={{
								paddingHorizontal: 12,
								paddingVertical: 6,
								borderRadius: 8,
							}}
							className={timeRange === "1month" ? "bg-primary" : ""}
							onPress={() => setTimeRange("1month")}
						>
							<Text
								className={timeRange === "1month" ? "text-primary-foreground font-semibold" : "text-foreground font-medium"}
								style={{fontSize: 12}}
							>
								{t("home.chart.oneMonth")}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={{
								paddingHorizontal: 12,
								paddingVertical: 6,
								borderRadius: 8,
							}}
							className={timeRange === "3months" ? "bg-primary" : ""}
							onPress={() => setTimeRange("3months")}
						>
							<Text
								className={timeRange === "3months" ? "text-primary-foreground font-semibold" : "text-foreground font-medium"}
								style={{fontSize: 12}}
							>
								{t("home.chart.threeMonths")}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={{
								paddingHorizontal: 12,
								paddingVertical: 6,
								borderRadius: 8,
							}}
							className={timeRange === "1year" ? "bg-primary" : ""}
							onPress={() => setTimeRange("1year")}
						>
							<Text
								className={timeRange === "1year" ? "text-primary-foreground font-semibold" : "text-foreground font-medium"}
								style={{fontSize: 12}}
							>
								{t("home.chart.oneYear")}
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>

			{/* Chart Container */}
			<View style={{width: "100%", alignItems: "center"}} onLayout={onContainerLayout} key={`chart-${timeRange}-${filteredData.length}`}>
				<Svg width={containerWidth} height={height} style={{backgroundColor: "transparent"}} key={`svg-${timeRange}`}>
					<Defs>
						{/* Chart line gradients */}
						<SvgLinearGradient id="fitnessGradient" x1="0%" y1="0%" x2="100%" y2="0%">
							<Stop offset="0%" stopColor="#059669" />
							<Stop offset="100%" stopColor="#34D399" />
						</SvgLinearGradient>
						<SvgLinearGradient id="fatigueGradient" x1="0%" y1="0%" x2="100%" y2="0%">
							<Stop offset="0%" stopColor="#DC2626" />
							<Stop offset="100%" stopColor="#F87171" />
						</SvgLinearGradient>

						{/* Area fill gradients */}
						<SvgLinearGradient id="fitnessAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
							<Stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
							<Stop offset="70%" stopColor="#10B981" stopOpacity="0.1" />
							<Stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
						</SvgLinearGradient>
						<SvgLinearGradient id="fatigueAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
							<Stop offset="0%" stopColor="#EF4444" stopOpacity="0.3" />
							<Stop offset="70%" stopColor="#EF4444" stopOpacity="0.1" />
							<Stop offset="100%" stopColor="#EF4444" stopOpacity="0.02" />
						</SvgLinearGradient>
					</Defs>

					{/* Grid lines */}
					{Array.from({length: 5}, (_, i) => {
						const y = headerHeight + padding + (i / 4) * chartHeight;
						return (
							<Line
								key={`grid-${i}`}
								x1={padding}
								y1={y}
								x2={padding + chartWidth}
								y2={y}
								stroke={theme.grid}
								strokeWidth={1}
								strokeDasharray="3,3"
							/>
						);
					})}

					{/* Area fills */}
					<Path d={fatigueAreaPath} fill="url(#fatigueAreaGradient)" />
					<Path d={fitnessAreaPath} fill="url(#fitnessAreaGradient)" />

					{/* Chart lines (without form) */}
					<Path
						key={`fitness-line-${timeRange}`}
						d={fitnessPath}
						fill="none"
						stroke="url(#fitnessGradient)"
						strokeWidth={3}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<Path
						key={`fatigue-line-${timeRange}`}
						d={fatiguePath}
						fill="none"
						stroke="url(#fatigueGradient)"
						strokeWidth={3}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>

					{/* Data points for latest values */}
					{filteredData.length > 0 &&
						(() => {
							const lastIndex = filteredData.length - 1;
							const x = padding + (lastIndex / Math.max(filteredData.length - 1, 1)) * chartWidth;
							const fitnessY = headerHeight + padding + ((maxValue - fitnessValues[lastIndex]) / totalRange) * chartHeight;
							const fatigueY = headerHeight + padding + ((maxValue - fatigueValues[lastIndex]) / totalRange) * chartHeight;

							return (
								<G key={`datapoints-${timeRange}-${lastIndex}`}>
									<Circle cx={x} cy={fitnessY} r={5} fill="#10B981" stroke="#fff" strokeWidth={2} />
									<Circle cx={x} cy={fatigueY} r={5} fill="#EF4444" stroke="#fff" strokeWidth={2} />
								</G>
							);
						})()}

					{/* X-axis labels */}
					{Array.from({length: timeRange === "1month" ? 4 : timeRange === "3months" ? 4 : 6}, (_, i) => {
						const stepSize = Math.floor(filteredData.length / (timeRange === "1month" ? 3 : timeRange === "3months" ? 3 : 5));
						const dataIndex = Math.min(i * stepSize, filteredData.length - 1);
						const x = padding + (dataIndex / Math.max(filteredData.length - 1, 1)) * chartWidth;
						const date = new Date(filteredData[dataIndex]?.date);
						const label =
							timeRange === "1month" || timeRange === "3months"
								? date.toLocaleDateString("de-DE", {day: "2-digit", month: "short"})
								: date.toLocaleDateString("de-DE", {month: "short", year: "2-digit"});

						return (
							<SvgText
								key={`x-label-${timeRange}-${i}`}
								x={x}
								y={headerHeight + padding + chartHeight + 40}
								fontSize="11"
								fill={theme.textSecondary}
								textAnchor="middle"
								fontWeight="500"
							>
								{label}
							</SvgText>
						);
					})}

					{/* Legend (without form) */}
					<G>
						<Circle cx={padding + 20} cy={height - 25} r={4} fill="#10B981" />
						<SvgText x={padding + 30} y={height - 20} fontSize="12" fill={theme.text}>
							{t("training.fitness")}
						</SvgText>

						<Circle cx={padding + 90} cy={height - 25} r={4} fill="#EF4444" />
						<SvgText x={padding + 100} y={height - 20} fontSize="12" fill={theme.text}>
							{t("training.fatigue")}
						</SvgText>
					</G>
				</Svg>
			</View>

			{/* Metrics Summary (without form) */}
			<View style={{flexDirection: "row", justifyContent: "space-around", marginTop: 16, paddingHorizontal: 16}}>
				{[
					{
						label: t("training.fitness"),
						value: fitnessValues[fitnessValues.length - 1]?.toFixed(1) || "0",
						color: "#10B981",
					},
					{
						label: t("training.fatigue"),
						value: fatigueValues[fatigueValues.length - 1]?.toFixed(1) || "0",
						color: "#EF4444",
					},
				].map((metric) => (
					<View key={metric.label} style={{alignItems: "center"}}>
						<Text style={{fontSize: 12, color: theme.textSecondary, marginBottom: 4}}>{metric.label.toUpperCase()}</Text>
						<Text style={{fontSize: 20, fontWeight: "700", color: metric.color}}>{metric.value}</Text>
					</View>
				))}
			</View>
		</View>
	);
};

export default function HomeScreen() {
	const {user, loading} = useAuth();
	const {colorScheme, isDark} = useTheme();
	const {t} = useTranslation();
	const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
	const [feedbackDialogType, setFeedbackDialogType] = useState<"feature_request" | "bug_report" | "general_feedback">("feature_request");

	// Enable automatic cache invalidation when agent performs actions
	useAgentActionListener();

	// Fetch training data using TanStack Query hooks
	// All queries run in parallel for optimal performance
	const {
		data: trainingStatus,
		refetch: refetchStatus,
	} = useCurrentTrainingStatus({
		enabled: !!user && !loading,
	});

	const {
		data: weekData = [],
		refetch: refetchWeek,
	} = useTrainingStatusHistory(7, {
		enabled: !!user && !loading,
	});

	const {
		data: monthData = [],
		refetch: refetchMonth,
	} = useTrainingStatusHistory(30, {
		enabled: !!user && !loading,
	});

	const {
		data: plannedWorkouts = [],
		refetch: refetchWorkouts,
	} = usePlannedWorkouts({
		enabled: !!user && !loading,
	});

	// Fetch sessions for the last 7 days to show sport names
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
	const {
		data: weekSessionsData,
		refetch: refetchWeekSessions,
	} = useQuery({
		queryKey: ["sessions", "week"],
		queryFn: () => apiClient.getSessionsByDateRange(
			sevenDaysAgo.toISOString().split("T")[0],
			new Date().toISOString().split("T")[0]
		),
		enabled: !!user && !loading,
	});

	// Create a map of sessions by date for quick lookup
	const sessionsByDate = React.useMemo(() => {
		const map: Record<string, CalendarSession[]> = {};
		if (weekSessionsData?.sessionsByDate) {
			Object.assign(map, weekSessionsData.sessionsByDate);
		}
		return map;
	}, [weekSessionsData]);

	// Check if user has any meaningful training data
	const hasTrainingData = monthData.length > 0 && monthData.some((day) => day.daily_hr_load > 0 || day.daily_training_time > 0);

	// Pull-to-refresh handler - refetches all queries in parallel
	const [refreshing, setRefreshing] = useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		try {
			// Refetch all queries in parallel
			await Promise.all([
				refetchStatus(),
				refetchWeek(),
				refetchMonth(),
				refetchWorkouts(),
				refetchWeekSessions(),
			]);
		} catch (error) {
			console.error("Error refreshing training status:", error);
		} finally {
			setRefreshing(false);
		}
	};

	const handleFeedbackSubmit = async (type: "feature_request" | "bug_report" | "general_feedback", text: string) => {
		try {
			await userFeedbackService.submitFeedbackWithMetadata(type, text);
			showAlert(t("feedback.sent"), t("feedback.thankYou"), [{text: t("common.ok")}]);
		} catch (error) {
			console.error("Error submitting feedback:", error);
			showAlert(t("feedback.error"), t("feedback.couldNotSend"), [{text: t("common.ok")}]);
		}
	};

	const openFeedbackDialog = (type: "feature_request" | "bug_report" | "general_feedback") => {
		setFeedbackDialogType(type);
		setFeedbackDialogOpen(true);
	};

	const getFormStatus = (form: number) => {
		// Basierend auf der Dokumentation:
		// > 5: Sehr frisch - optimal für Wettkämpfe
		// 0 bis 5: Frisch - bereit für harte Trainings
		// -10 bis 0: Leicht ermüdet - moderate Belastung
		// -20 bis -10: Ermüdet - Erholung empfohlen
		// < -20: Stark ermüdet - Ruhetag nötig
		if (form > 5) return {text: t("training.veryFresh"), color: "#10B981"};
		if (form > 0) return {text: t("training.fresh"), color: "#059669"};
		if (form > -10) return {text: t("training.slightlyTired"), color: "#F59E0B"};
		if (form > -20) return {text: t("training.tired"), color: "#EF4444"};
		return {text: t("training.veryTired"), color: "#DC2626"};
	};

	const getFitnessLevel = (fitness: number) => {
		// Basierend auf der Dokumentation:
		// < 15: Niedriges Fitness-Level
		// 15-30: Moderates Fitness-Level
		// 30-50: Hohes Fitness-Level
		// > 50: Sehr hohes Fitness-Level
		if (fitness > 50) return {text: t("training.veryHigh"), color: "#10B981"};
		if (fitness > 30) return {text: t("training.high"), color: "#059669"};
		if (fitness > 15) return {text: t("training.moderate"), color: "#F59E0B"};
		return {text: t("training.low"), color: "#EF4444"};
	};

	const getFatigueLevel = (fatigue: number) => {
		// Basierend auf der Dokumentation:
		// < 10: Geringe Ermüdung
		// 10-25: Moderate Ermüdung
		// 25-40: Hohe Ermüdung
		// > 40: Sehr hohe Ermüdung
		if (fatigue > 40) return {text: t("training.veryHigh"), color: "#DC2626"};
		if (fatigue > 25) return {text: t("training.high"), color: "#EF4444"};
		if (fatigue > 10) return {text: t("training.moderate"), color: "#F59E0B"};
		return {text: t("training.low"), color: "#10B981"};
	};

	if (loading || !user) {
		return (
			<View className="flex-1 bg-background items-center justify-center">
				<ActivityIndicator size="large" />
				<Text className="text-foreground mt-4">{t("home.loadingTrainingStatus")}</Text>
			</View>
		);
	}

	// Show provider integration if user has no training data
	if (!hasTrainingData) {
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
				<ScrollView
					className="flex-1"
					showsVerticalScrollIndicator={false}
					refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				>
					{/* Header */}
					<View className="flex-row items-center justify-between px-6 py-4">
						<View className="flex-1">
							<Text className="text-lg text-muted-foreground">{t("home.welcome")}</Text>
							<Text className="text-2xl font-bold text-foreground">{t("home.getStarted")}</Text>
						</View>
						<View className="flex-row items-center space-x-2">
							<TouchableOpacity
								className="w-10 h-10 rounded-full bg-primary items-center justify-center"
								onPress={() => router.push("/settings")}
							>
								<Text className="text-lg font-semibold text-primary-foreground">{user.email?.charAt(0).toUpperCase()}</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Welcome Message */}
					<View className="mx-6 mb-6">
						<View className="bg-card rounded-xl p-6 border border-border">
							<Text className="text-xl font-bold text-foreground mb-4">{t("home.noDataTitle")}</Text>
							<Text className="text-base text-muted-foreground mb-4">{t("home.noDataDescription")}</Text>
						</View>
					</View>

					{/* Provider Integration Section */}
					<View className="px-6">
						<ProviderIntegrationsSection />
					</View>

					{/* Startup Support Section */}
					<View className="px-6 mb-6 mt-4">
						<View className="bg-card rounded-xl p-6 border border-border">
							<Text className="text-lg font-semibold text-foreground mb-4">{t("home.visionStatement")}</Text>
							<Text className="text-sm text-muted-foreground mb-4 leading-relaxed">
								{t("home.startupMessage")}
							</Text>

							<View className="mb-4">
								<View className="flex-row items-center justify-between mb-2">
									<Text className="text-sm font-medium text-foreground">{t("home.recentlyAdded")}</Text>
									<Text className="text-xs text-muted-foreground">{t("home.swipeHint")}</Text>
								</View>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" style={{maxHeight: 120}}>
									<View className="flex-row space-x-3">
										{RECENT_FEATURES.map((feature) => (
											<View key={feature.id} className="bg-muted rounded-lg p-3 mx-2">
												<Text className="text-xs font-medium text-foreground mb-1">{t(`features.${feature.id}.title`)}</Text>
												<Text className="text-xs text-muted-foreground">{t(`features.${feature.id}.description`)}</Text>
											</View>
										))}
									</View>
								</ScrollView>
							</View>

							<View className="mb-4">
								<View className="flex-row items-center justify-between mb-2">
									<Text className="text-sm font-medium text-foreground">{t("home.roadmap")}</Text>
									<Text className="text-xs text-muted-foreground">{t("home.swipeHint")}</Text>
								</View>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" style={{maxHeight: 120}}>
									<View className="flex-row space-x-3">
										{ROADMAP_ITEMS.map((item) => {
											// Map color schemes to actual colors
											const colorMap = {
												"text-green-600": "#16A34A",
												"text-blue-600": "#2563EB",
												"text-grey-600": "#4B5563",
												"text-gray-600": "#4B5563",
												"text-purple-600": "#9333EA",
												"text-pink-600": "#DB2777",
												"bg-green-500/10": "rgba(34, 197, 94, 0.1)",
												"bg-blue-500/10": "rgba(59, 130, 246, 0.1)",
												"bg-grey-500/10": "rgba(107, 114, 128, 0.1)",
												"bg-gray-500/10": "rgba(107, 114, 128, 0.1)",
												"bg-purple-500/10": "rgba(168, 85, 247, 0.1)",
												"bg-pink-500/10": "rgba(236, 72, 153, 0.1)",
												"border-green-500/20": "rgba(34, 197, 94, 0.2)",
												"border-blue-500/20": "rgba(59, 130, 246, 0.2)",
												"border-grey-500/20": "rgba(107, 114, 128, 0.2)",
												"border-gray-500/20": "rgba(107, 114, 128, 0.2)",
												"border-purple-500/20": "rgba(168, 85, 247, 0.2)",
												"border-pink-500/20": "rgba(236, 72, 153, 0.2)",
											};

											return (
												<View
													key={item.id}
													style={{
														backgroundColor: colorMap[item.colorScheme.bg],
														borderColor: colorMap[item.colorScheme.border],
														borderWidth: 1,
														borderRadius: 8,
														marginHorizontal: 8,
														padding: 12,
														minWidth: 200,
													}}
												>
													<Text style={{fontSize: 12, fontWeight: "500", color: colorMap[item.colorScheme.text], marginBottom: 4}}>
														{t(`roadmap.${item.id}.title`)}
													</Text>
													<Text className="text-xs text-muted-foreground">{t(`roadmap.${item.id}.description`)}</Text>
													<Text style={{fontSize: 12, color: colorMap[item.colorScheme.text], marginTop: 4, fontWeight: "500"}}>
														{t(`roadmap.${item.id}.timeline`)}
													</Text>
												</View>
											);
										})}
									</View>
								</ScrollView>
							</View>

							<Text className="text-sm text-muted-foreground mb-4">
								{t("home.feedbackPrompt")}
							</Text>

							<View className="flex-row space-x-2">
								<TouchableOpacity
									className="flex-1 bg-muted/30 border border-border rounded-md p-2 flex-row items-center justify-center mr-2"
									onPress={() => openFeedbackDialog("feature_request")}
								>
									<Text className="text-muted-foreground font-normal text-xs">{t("home.suggestFeature")}</Text>
								</TouchableOpacity>

								<TouchableOpacity
									className="flex-1 bg-muted/30 border border-border rounded-md p-2 flex-row items-center justify-center ml-2"
									onPress={() => openFeedbackDialog("bug_report")}
								>
									<Text className="text-muted-foreground font-normal text-xs">{t("home.reportBug")}</Text>
								</TouchableOpacity>
							</View>
						</View>
					</View>
				</ScrollView>

				{/* Feedback Dialog */}
				<FeedbackDialog
					open={feedbackDialogOpen}
					onOpenChange={setFeedbackDialogOpen}
					onSubmit={handleFeedbackSubmit}
					initialType={feedbackDialogType}
				/>
			</View>
		);
	}

	if (!trainingStatus) {
		return (
			<View className="flex-1 bg-background items-center justify-center">
				<ActivityIndicator size="large" />
				<Text className="text-foreground mt-4">{t("home.loadingTrainingStatus")}</Text>
			</View>
		);
	}

	const formStatus = getFormStatus(trainingStatus.form);
	const fitnessLevel = getFitnessLevel(trainingStatus.fitness);
	const fatigueLevel = getFatigueLevel(trainingStatus.fatigue);
	const fitnessProgress = Math.min(trainingStatus.fitness / 50, 1);

	return (
		<KeyboardAvoidingView style={{flex: 1, backgroundColor: isDark ? "#000000" : "#ffffff"}} behavior={Platform.OS === "ios" ? "padding" : "height"}>
			<View className=" flex-1 bg-background">
				<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
				<ScrollView
					className="flex-1"
					showsVerticalScrollIndicator={false}
					refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				>
					{/* Header */}
					<View className="flex-row items-center justify-between px-6 py-4">
						<View className="flex-1">
							<Text className="text-lg text-muted-foreground">{t("home.trainingStatus")}</Text>
							<Text className="text-2xl font-bold text-foreground">{new Date().toLocaleDateString("de-DE", {weekday: "long"})}</Text>
						</View>
						<View className="flex-row items-center space-x-2">
							<TouchableOpacity
								className="w-10 h-10 rounded-full bg-primary items-center justify-center"
								onPress={() => router.push("/settings")}
							>
								<Text className="text-lg font-semibold text-primary-foreground">{user.email?.charAt(0).toUpperCase()}</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Form Status Hero Card */}
					<View className="mx-6 mb-6 rounded-xl border border-border overflow-hidden">
						<LinearGradient colors={[formStatus.color + "20", formStatus.color + "10"]} className="rounded-xl border border-border">
							<View className="flex-row items-center justify-between p-3">
								<View className="flex-1">
									<View className="flex-row items-center mb-2">
										<Text className="text-lg font-semibold text-foreground">{t("training.form")}</Text>
									</View>
									<Text className="text-3xl font-bold text-foreground mb-1">{trainingStatus.form.toFixed(1)}</Text>
									<Text className="text-base font-medium" style={{color: formStatus.color}}>
										{formStatus.text}
									</Text>
								</View>
							</View>
						</LinearGradient>
					</View>

					{/* Key Metrics Grid */}
					<View className="px-6 mb-6">
						{/* 			<Text className="text-xl font-bold text-foreground mb-4">Kernmetriken</Text> */}
						<View className="flex-row space-x-3">
							{/* Fitness Card */}
							<View className="flex-1 bg-card rounded-xl p-4 border border-border mr-2">
								<View className="flex-row items-center justify-between mb-2">
									<Text className="text-sm font-medium text-muted-foreground">{t("training.fitness").toUpperCase()}</Text>
									<View className="w-2 h-2 rounded-full" style={{backgroundColor: fitnessLevel.color}} />
								</View>
								<Text className="text-2xl font-bold text-foreground mb-1">{trainingStatus.fitness.toFixed(1)}</Text>
								<Text className="text-xs text-muted-foreground">{fitnessLevel.text}</Text>
								<View className="mt-2">
									<View className="w-full h-1.5 bg-muted rounded-full">
										<View
											className="h-1.5 rounded-full"
											style={{
												backgroundColor: fitnessLevel.color,
												width: `${fitnessProgress * 100}%`,
											}}
										/>
									</View>
								</View>
							</View>

							{/* Fatigue Card */}
							<View className="flex-1 bg-card rounded-xl p-4 border border-border ml-2">
								<View className="flex-row items-center justify-between mb-2">
									<Text className="text-sm font-medium text-muted-foreground">{t("home.fatigue").toUpperCase()}</Text>
									<View className="w-2 h-2 rounded-full" style={{backgroundColor: fatigueLevel.color}} />
								</View>
								<Text className="text-2xl font-bold text-foreground mb-1">{trainingStatus.fatigue.toFixed(1)}</Text>
								<Text className="text-xs text-muted-foreground">{fatigueLevel.text}</Text>
								<View className="mt-2">
									<View className="w-full h-1.5 bg-muted rounded-full">
										<View
											className="h-1.5 rounded-full"
											style={{
												backgroundColor: fatigueLevel.color,
												width: `${Math.min(trainingStatus.fatigue / 40, 1) * 100}%`,
											}}
										/>
									</View>
								</View>
							</View>
						</View>
					</View>

					{/* Combined Training Overview: Past 7 days + Next 7 days */}
					<TrainingOverview
						weekData={weekData}
						plannedWorkouts={plannedWorkouts}
						sessionsByDate={sessionsByDate}
					/>

					{/* Fitness & Fatigue Chart */}
					<View className="px-6 mb-6">
						<View className="bg-card rounded-xl p-6 border border-border">
							<Text className="text-lg font-semibold text-foreground mb-4">{t("home.fitnessAndFatigue")}</Text>
							<ResponsiveTrainingChart data={monthData} isDark={colorScheme === "dark"} />
						</View>
					</View>

					{/* Form Chart */}
					<View className="px-6 mb-6">
						{/* Trend Analysis */}
						<View className="mt-6">
							<View className="bg-card rounded-xl p-4 border border-border">
								<Text className="text-lg font-semibold text-foreground mb-4">{t("home.trendAnalysis")}</Text>
								<View className="space-y-3">
									<View className="flex-row justify-between items-center p-3 bg-muted/30 rounded-lg">
										<Text className="text-sm text-muted-foreground">{t("home.fitnessTrend7d")}</Text>
										<View className="flex-row items-center">
											<Text
												className={`text-sm font-bold ${
													trainingStatus.fitness_trend_7d > 0
														? "text-green-500"
														: trainingStatus.fitness_trend_7d < 0
															? "text-red-500"
															: "text-yellow-500"
												}`}
											>
												{trainingStatus.fitness_trend_7d > 0 ? "+" : ""}
												{trainingStatus.fitness_trend_7d.toFixed(1)}
											</Text>
										</View>
									</View>
									<View className="flex-row justify-between items-center p-3 bg-muted/30 rounded-lg">
										<Text className="text-sm text-muted-foreground">{t("home.fatigueTrend7d")}</Text>
										<View className="flex-row items-center">
											<Text
												className={`text-sm font-bold ${
													trainingStatus.fatigue_trend_7d > 0
														? "text-red-500"
														: trainingStatus.fatigue_trend_7d < 0
															? "text-green-500"
															: "text-yellow-500"
												}`}
											>
												{trainingStatus.fatigue_trend_7d > 0 ? "+" : ""}
												{trainingStatus.fatigue_trend_7d.toFixed(1)}
											</Text>
										</View>
									</View>
									<View className="flex-row justify-between items-center p-3 bg-muted/30 rounded-lg">
										<Text className="text-sm text-muted-foreground">{t("home.formStatus")}</Text>
										<Text
											className={`text-sm font-bold ${
												trainingStatus.form > 0 ? "text-green-500" : trainingStatus.form < -10 ? "text-red-500" : "text-yellow-500"
											}`}
										>
											{trainingStatus.form > 0
												? t("training.ready")
												: trainingStatus.form < -10
													? t("training.exhausted")
													: t("training.balanced")}
										</Text>
									</View>
								</View>
							</View>
						</View>
					</View>

					{/* Startup Support Section */}
					<View className="px-6 mb-6">
						<View className="bg-card rounded-xl p-6 border border-border">
							<Text className="text-lg font-semibold text-foreground mb-4">{t("home.visionStatement")}</Text>
							<Text className="text-sm text-muted-foreground mb-4 leading-relaxed">
								{t("home.startupMessage")}
							</Text>

							<View className="mb-4">
								<View className="flex-row items-center justify-between mb-2">
									<Text className="text-sm font-medium text-foreground">{t("home.recentlyAdded")}</Text>
									<Text className="text-xs text-muted-foreground">{t("home.swipeHint")}</Text>
								</View>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" style={{maxHeight: 120}}>
									<View className="flex-row space-x-3">
										{RECENT_FEATURES.map((feature) => (
											<View key={feature.id} className="bg-muted rounded-lg p-3  mx-2">
												<Text className="text-xs font-medium text-foreground mb-1">{t(`features.${feature.id}.title`)}</Text>
												<Text className="text-xs text-muted-foreground">{t(`features.${feature.id}.description`)}</Text>
											</View>
										))}
									</View>
								</ScrollView>
							</View>

							<View className="mb-4">
								<View className="flex-row items-center justify-between mb-2">
									<Text className="text-sm font-medium text-foreground">{t("home.roadmap")}</Text>
									<Text className="text-xs text-muted-foreground">{t("home.swipeHint")}</Text>
								</View>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" style={{maxHeight: 120}}>
									<View className="flex-row space-x-3">
										{ROADMAP_ITEMS.map((item) => {
											// Map color schemes to actual colors
											const colorMap = {
												"text-green-600": "#16A34A",
												"text-blue-600": "#2563EB",
												"text-grey-600": "#4B5563",
												"text-gray-600": "#4B5563",
												"text-purple-600": "#9333EA",
												"text-pink-600": "#DB2777",
												"bg-green-500/10": "rgba(34, 197, 94, 0.1)",
												"bg-blue-500/10": "rgba(59, 130, 246, 0.1)",
												"bg-grey-500/10": "rgba(107, 114, 128, 0.1)",
												"bg-gray-500/10": "rgba(107, 114, 128, 0.1)",
												"bg-purple-500/10": "rgba(168, 85, 247, 0.1)",
												"bg-pink-500/10": "rgba(236, 72, 153, 0.1)",
												"border-green-500/20": "rgba(34, 197, 94, 0.2)",
												"border-blue-500/20": "rgba(59, 130, 246, 0.2)",
												"border-grey-500/20": "rgba(107, 114, 128, 0.2)",
												"border-gray-500/20": "rgba(107, 114, 128, 0.2)",
												"border-purple-500/20": "rgba(168, 85, 247, 0.2)",
												"border-pink-500/20": "rgba(236, 72, 153, 0.2)",
											};

											return (
												<View
													key={item.id}
													style={{
														backgroundColor: colorMap[item.colorScheme.bg],
														borderColor: colorMap[item.colorScheme.border],
														borderWidth: 1,
														borderRadius: 8,
														marginHorizontal: 8,
														padding: 12,
														minWidth: 200,
													}}
												>
													<Text style={{fontSize: 12, fontWeight: "500", color: colorMap[item.colorScheme.text], marginBottom: 4}}>
														{t(`roadmap.${item.id}.title`)}
													</Text>
													<Text className="text-xs text-muted-foreground">{t(`roadmap.${item.id}.description`)}</Text>
													<Text style={{fontSize: 12, color: colorMap[item.colorScheme.text], marginTop: 4, fontWeight: "500"}}>
														{t(`roadmap.${item.id}.timeline`)}
													</Text>
												</View>
											);
										})}
									</View>
								</ScrollView>
							</View>

							<Text className="text-sm text-muted-foreground mb-4">
								{t("home.feedbackPrompt")}
							</Text>

							<View className="flex-row space-x-2">
								<TouchableOpacity
									className="flex-1 bg-muted/30 border border-border rounded-md p-2 flex-row items-center justify-center mr-2"
									onPress={() => openFeedbackDialog("feature_request")}
								>
									<Text className="text-muted-foreground font-normal text-xs">{t("home.suggestFeature")}</Text>
								</TouchableOpacity>

								<TouchableOpacity
									className="flex-1 bg-muted/30 border border-border rounded-md p-2 flex-row items-center justify-center ml-2"
									onPress={() => openFeedbackDialog("bug_report")}
								>
									<Text className="text-muted-foreground font-normal text-xs">{t("home.reportBug")}</Text>
								</TouchableOpacity>
							</View>
						</View>
					</View>
				</ScrollView>

				{/* Feedback Dialog */}
 				<FeedbackDialog
					open={feedbackDialogOpen}
					onOpenChange={setFeedbackDialogOpen}
					onSubmit={handleFeedbackSubmit}
					initialType={feedbackDialogType}
				/> 
			</View>
		</KeyboardAvoidingView>
	);
}
