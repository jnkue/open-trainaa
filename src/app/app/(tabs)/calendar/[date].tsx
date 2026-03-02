import React, {useEffect, useState} from "react";
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator} from "react-native";
import {useLocalSearchParams, useRouter} from "expo-router";
import {apiClient, CalendarDayData, CalendarSession} from "@/services/api";
import {useTheme} from "@/contexts/ThemeContext";
import {usePlannedWorkouts} from "@/hooks/useWorkouts";
import {type PlannedWorkout} from "@/services/training";
import {format, isSameDay} from "date-fns";
import {de} from "date-fns/locale";
import {useTranslation} from "react-i18next";
import {getSportTranslation} from "@/utils/formatters";
import {IconSymbol} from "@/components/ui/IconSymbol";

export default function CalendarDay() {
	const {date} = useLocalSearchParams();
	const router = useRouter();
	const {isDark} = useTheme();
	const {t} = useTranslation();
	const [dayData, setDayData] = useState<CalendarDayData | null>(null);
	const [sessions, setSessions] = useState<CalendarSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch planned workouts
	const {data: plannedWorkouts = []} = usePlannedWorkouts();

	const dateString = Array.isArray(date) ? date[0] : date;
	const selectedDate = dateString ? new Date(dateString) : new Date();

	// Filter workouts for the selected date
	const workoutsForDay = plannedWorkouts.filter((workout) => {
		if (!workout.scheduled_time) return false;
		return isSameDay(new Date(workout.scheduled_time), selectedDate);
	});

	useEffect(() => {
		if (dateString) {
			fetchDayData();
		}
	}, [dateString]); // eslint-disable-line react-hooks/exhaustive-deps

	const fetchDayData = async () => {
		try {
			setLoading(true);
			setError(null);

			console.log("Fetching sessions for date:", dateString);

			// Use the getSessions endpoint directly and filter by date
			let allSessions: any[] = [];
			let page = 1;
			const perPage = 50;
			let hasMore = true;

			// Fetch all sessions and filter by date
			while (hasMore && page <= 5) {
				const response = await apiClient.getSessions(page, perPage);
				console.log(`Page ${page} returned ${response.items.length} sessions`);

				const sessionsForDate = response.items.filter(session => {
					const sessionDate = session.start_time.split('T')[0];
					const matches = sessionDate === dateString;
					if (matches) {
						console.log(`Session matches date: ${sessionDate}`, session);
					}
					return matches;
				});

				allSessions = [...allSessions, ...sessionsForDate];

				if (response.items.length < perPage) {
					hasMore = false;
				} else {
					page++;
				}
			}

			console.log("Found sessions:", allSessions.length, allSessions);

			// Convert to CalendarSession format
			const sessionsForDay = allSessions.map(session => ({
				id: session.id,
				activity_id: session.activity_id,
				sport: session.sport,
				sub_sport: session.sub_sport,
				start_time: session.start_time,
				duration: session.duration,
				distance: session.distance,
				calories: session.calories,
				elevation_gain: session.elevation_gain,
				average_heartrate: session.average_heartrate,
				average_speed: session.average_speed,
				total_timer_time: session.total_timer_time,
				total_elapsed_time: session.total_elapsed_time || session.duration,
				total_distance: session.distance,
				avg_heart_rate: session.average_heartrate,
				total_calories: session.calories,
			}));

			// Create CalendarDayData from sessions
			const dayData: CalendarDayData = {
				date: dateString,
				sessions: sessionsForDay,
				totalSessions: sessionsForDay.length,
				totalDuration: sessionsForDay.reduce((sum, s) => sum + (s.total_timer_time || s.total_elapsed_time || s.duration || 0), 0),
				totalDistance: sessionsForDay.reduce((sum, s) => sum + (s.distance || 0), 0),
				totalCalories: sessionsForDay.reduce((sum, s) => sum + (s.calories || 0), 0),
				sports: [...new Set(sessionsForDay.map((s) => s.sport))],
			};

			setDayData(dayData);
			setSessions(sessionsForDay);
		} catch (error) {
			console.error("Error fetching day data:", error);
			setError(t("calendar.errorLoadingData"));
		} finally {
			setLoading(false);
		}
	};

	const formatDuration = (seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		return `${minutes}m`;
	};

	const formatDistance = (meters: number): string => {
		if (meters >= 1000) {
			return `${(meters / 1000).toFixed(1)}km`;
		}
		return `${Math.round(meters)}m`;
	};

	const formatDate = (dateStr: string): string => {
		try {
			const date = new Date(dateStr);
			return format(date, "EEEE, d. MMMM yyyy", {locale: de});
		} catch {
			return dateStr;
		}
	};

	const renderWorkoutCard = (workout: PlannedWorkout) => (
		<TouchableOpacity
			key={workout.id}
			style={[styles.workoutCard, isDark && styles.workoutCardDark]}
			onPress={() => router.push(`/workouts/${workout.workout?.id}?returnTo=/calendar/${dateString}`)}
			activeOpacity={0.7}
		>
			<View style={styles.workoutHeader}>
				<View style={[styles.sportIndicator, {backgroundColor: getSportColor(workout.workout?.sport || "Unknown")}]} />
				<Text style={[styles.workoutSport, isDark && styles.workoutSportDark]}>{getSportTranslation(workout.workout?.sport || "Training", t)}</Text>
				<Text style={[styles.workoutTime, isDark && styles.workoutTimeDark]}>{format(new Date(workout.scheduled_time), "HH:mm")}</Text>
			</View>
			<View style={styles.workoutContent}>
				<Text style={[styles.workoutName, isDark && styles.workoutNameDark]}>{workout.workout?.name || t("calendar.training")}</Text>
				{workout.workout?.description && (
					<Text style={[styles.workoutDescription, isDark && styles.workoutDescriptionDark]}>
						{(() => {
							// Remove first line (sport name) and trim empty lines until content starts
							const lines = workout.workout.description.split('\n');
							const withoutFirst = lines.length > 1 ? lines.slice(1) : lines;

							// Find the first non-empty line
							const firstContentIndex = withoutFirst.findIndex(line => line.trim().length > 0);

							// If found, slice from that index, otherwise return the description as is
							return firstContentIndex >= 0
								? withoutFirst.slice(firstContentIndex).join('\n')
								: workout.workout.description;
						})()}
					</Text>
				)}
				<View style={styles.workoutDetails}>
					{workout.workout?.workout_minutes && (
						<View style={styles.statItem}>
							<Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("calendar.plannedDuration")}</Text>
							<Text style={[styles.statValue, isDark && styles.statValueDark]}>{workout.workout.workout_minutes}min</Text>
						</View>
					)}
				</View>
			</View>
		</TouchableOpacity>
	);

	const renderSessionCard = (session: CalendarSession) => (
		<TouchableOpacity
			key={session.id}
			style={[styles.sessionCard, isDark && styles.sessionCardDark]}
			onPress={() => router.push(`/activities/${session.id}`)}
			activeOpacity={0.7}
		>
			<View style={styles.sessionHeader}>
				<View style={[styles.sportIndicator, {backgroundColor: getSportColor(session.sport)}]} />
				<Text style={[styles.sessionSport, isDark && styles.sessionSportDark]}>{getSportTranslation(session.sport, t)}</Text>
				<Text style={[styles.sessionTime, isDark && styles.sessionTimeDark]}>{format(new Date(session.start_time), "HH:mm")}</Text>
			</View>

			<View style={styles.sessionStats}>
				{!!(session.total_timer_time || session.total_elapsed_time || session.duration) && (
					<View style={styles.statItem}>
						<Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("calendar.duration")}</Text>
						<Text style={[styles.statValue, isDark && styles.statValueDark]}>{formatDuration(session.total_timer_time || session.total_elapsed_time || session.duration || 0)}</Text>
					</View>
				)}

				{!!session.distance && (
					<View style={styles.statItem}>
						<Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("calendar.distance")}</Text>
						<Text style={[styles.statValue, isDark && styles.statValueDark]}>{formatDistance(session.distance)}</Text>
					</View>
				)}

				{!!session.calories && (
					<View style={styles.statItem}>
						<Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("calendar.calories")}</Text>
						<Text style={[styles.statValue, isDark && styles.statValueDark]}>{session.calories} kcal</Text>
					</View>
				)}

				{!!session.average_heartrate && (
					<View style={styles.statItem}>
						<Text style={[styles.statLabel, isDark && styles.statLabelDark]}>♥ Ø</Text>
						<Text style={[styles.statValue, isDark && styles.statValueDark]}>{session.average_heartrate} bpm</Text>
					</View>
				)}
			</View>
		</TouchableOpacity>
	);

	const getSportColor = (sport: string): string => {
		const colors: {[key: string]: string} = {
			running: "#dc2626",
			cycling: "#2563eb",
			swimming: "#0891b2",
			strength: "#7c3aed",
			yoga: "#059669",
		};
		return colors[sport.toLowerCase()] || "#6b7280";
	};

	const renderSummary = () => {
		if (!dayData || dayData.totalSessions === 0) return null;

		return (
			<View style={[styles.summaryCard, isDark && styles.summaryCardDark]}>
				<Text style={[styles.summaryTitle, isDark && styles.summaryTitleDark]}>{t("calendar.daySummary")}</Text>
				<View style={styles.summaryStats}>
					<View style={styles.summaryStatItem}>
						<Text style={[styles.summaryStatValue, isDark && styles.summaryStatValueDark]}>{dayData.totalSessions}</Text>
						<Text style={[styles.summaryStatLabel, isDark && styles.summaryStatLabelDark]}>{t("calendar.sessions")}</Text>
					</View>

					{dayData.totalDuration > 0 && (
						<View style={styles.summaryStatItem}>
							<Text style={[styles.summaryStatValue, isDark && styles.summaryStatValueDark]}>{formatDuration(dayData.totalDuration)}</Text>
							<Text style={[styles.summaryStatLabel, isDark && styles.summaryStatLabelDark]}>{t("calendar.totalTime")}</Text>
						</View>
					)}

					{dayData.totalDistance > 0 && (
						<View style={styles.summaryStatItem}>
							<Text style={[styles.summaryStatValue, isDark && styles.summaryStatValueDark]}>{formatDistance(dayData.totalDistance)}</Text>
							<Text style={[styles.summaryStatLabel, isDark && styles.summaryStatLabelDark]}>{t("calendar.distance")}</Text>
						</View>
					)}

					{dayData.totalCalories > 0 && (
						<View style={styles.summaryStatItem}>
							<Text style={[styles.summaryStatValue, isDark && styles.summaryStatValueDark]}>{dayData.totalCalories}</Text>
							<Text style={[styles.summaryStatLabel, isDark && styles.summaryStatLabelDark]}>{t("calendar.calories")}</Text>
						</View>
					)}
				</View>
			</View>
		);
	};

	const handleBack = () => {
		// Go back in the calendar stack
		router.back();
	};

	return (
		<View style={[styles.container, isDark && styles.containerDark]}>
			<View style={[styles.header, isDark && styles.headerDark]}>
				<TouchableOpacity onPress={handleBack} style={styles.backButton}>
					<IconSymbol name="chevron.left" size={28} color={isDark ? "#ffffff" : "#000000"} />
				</TouchableOpacity>
				<Text style={[styles.title, isDark && styles.titleDark]}>{formatDate(dateString)}</Text>
			</View>

			<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
				{loading && (
					<View style={styles.loadingContainer}>
						<ActivityIndicator size="large" color={isDark ? "#ffffff" : "#000000"} />
						<Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>{t("calendar.loadingDayData")}</Text>
					</View>
				)}

				{error && (
					<View style={styles.errorContainer}>
						<Text style={[styles.errorText, isDark && styles.errorTextDark]}>{error}</Text>
					</View>
				)}

				{!loading && !error && (
					<>
						{renderSummary()}

						{/* Geplante Trainings */}
						{workoutsForDay.length > 0 && (
							<>
								<Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t("calendar.plannedTrainings")}</Text>
								{workoutsForDay.map(renderWorkoutCard)}
							</>
						)}

						{/* Abgeschlossene Aktivitäten */}
						{sessions.length > 0 && (
							<>
								<Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t("calendar.completedActivities")}</Text>
								{sessions.map(renderSessionCard)}
							</>
						)}

						{/* Empty state - only show if no workouts and no sessions */}
						{workoutsForDay.length === 0 && sessions.length === 0 && (
							<View style={styles.emptyContainer}>
								<Text style={[styles.emptyTitle, isDark && styles.emptyTitleDark]}>{t("calendar.noActivities")}</Text>
								<Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
									{t("calendar.noTrainingOrPlannedFound")}
								</Text>
							</View>
						)}
					</>
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#ffffff",
	},
	containerDark: {
		backgroundColor: "#000000",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#f0f0f0",
	},
	headerDark: {
		backgroundColor: "#1f1f23",
		borderBottomColor: "#333333",
	},
	backButton: {
		paddingRight: 12,
	},
	backText: {
		color: "#000000",
		fontSize: 16,
	},
	backTextDark: {
		color: "#a1a1aa",
	},
	title: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000000",
		flex: 1,
	},
	titleDark: {
		color: "#ffffff",
	},
	content: {
		flex: 1,
		padding: 16,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 50,
	},
	loadingText: {
		marginTop: 16,
		fontSize: 16,
		color: "#666666",
	},
	loadingTextDark: {
		color: "#a1a1aa",
	},
	errorContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 50,
	},
	errorText: {
		fontSize: 16,
		color: "#dc2626",
		textAlign: "center",
	},
	errorTextDark: {
		color: "#ef4444",
	},
	summaryCard: {
		backgroundColor: "#f8fafc",
		padding: 20,
		borderRadius: 16,
		marginBottom: 24,
		borderWidth: 1,
		borderColor: "#e2e8f0",
		boxShadow: "0 1px 4px rgba(0, 0, 0, 0.05)",
		elevation: 1,
	},
	summaryCardDark: {
		backgroundColor: "#1f1f23",
		borderColor: "#333333",
	},
	summaryTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000000",
		marginBottom: 16,
		textAlign: "center",
	},
	summaryTitleDark: {
		color: "#ffffff",
	},
	summaryStats: {
		flexDirection: "row",
		justifyContent: "space-around",
		flexWrap: "wrap",
	},
	summaryStatItem: {
		alignItems: "center",
		minWidth: "22%",
		marginVertical: 8,
	},
	summaryStatValue: {
		fontSize: 20,
		fontWeight: "700",
		color: "#000000",
		marginBottom: 4,
	},
	summaryStatValueDark: {
		color: "#ffffff",
	},
	summaryStatLabel: {
		fontSize: 12,
		color: "#666666",
		textAlign: "center",
	},
	summaryStatLabelDark: {
		color: "#a1a1aa",
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: "600",
		color: "#000000",
		marginBottom: 16,
	},
	sectionTitleDark: {
		color: "#ffffff",
	},
	sessionCard: {
		backgroundColor: "#ffffff",
		borderRadius: 16,
		padding: 20,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: "#e5e7eb",
		boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
		elevation: 2,
	},
	sessionCardDark: {
		backgroundColor: "#1f1f23",
		borderColor: "#333333",
		boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
	},
	sessionHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	sportIndicator: {
		width: 16,
		height: 16,
		borderRadius: 8,
		marginRight: 12,
		boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
		elevation: 2,
	},
	sessionSport: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000000",
		flex: 1,
	},
	sessionSportDark: {
		color: "#ffffff",
	},
	sessionTime: {
		fontSize: 14,
		color: "#666666",
		fontWeight: "500",
	},
	sessionTimeDark: {
		color: "#a1a1aa",
	},
	sessionStats: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
	},
	statItem: {
		minWidth: "48%",
		marginBottom: 8,
	},
	statLabel: {
		fontSize: 12,
		color: "#666666",
		marginBottom: 2,
	},
	statLabelDark: {
		color: "#a1a1aa",
	},
	statValue: {
		fontSize: 14,
		fontWeight: "600",
		color: "#000000",
	},
	statValueDark: {
		color: "#ffffff",
	},
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 50,
	},
	emptyEmoji: {
		fontSize: 48,
		marginBottom: 16,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: "600",
		color: "#000000",
		marginBottom: 8,
	},
	emptyTitleDark: {
		color: "#ffffff",
	},
	emptyText: {
		fontSize: 16,
		color: "#666666",
		textAlign: "center",
		lineHeight: 24,
	},
	emptyTextDark: {
		color: "#a1a1aa",
	},
	// Workout Card Styles
	workoutCard: {
		backgroundColor: "#ffffff",
		borderRadius: 16,
		padding: 20,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: "#e5e7eb",
	
		boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
		elevation: 2,
	},
	workoutCardDark: {
		backgroundColor: "#1f1f23",
		borderColor: "#333333",
		boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
	},
	workoutHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	workoutSport: {
		fontSize: 16,
		fontWeight: "600",
		color: "#005287",
		flex: 1,
	},
	workoutSportDark: {
		color: "#005287",
	},
	workoutTime: {
		fontSize: 14,
		color: "#6b7280",
		fontWeight: "600",
	},
	workoutTimeDark: {
		color: "#a1a1aa",
	},
	workoutContent: {
		marginLeft: 28,
	},
	workoutName: {
		fontSize: 18,
		fontWeight: "700",
		color: "#000000",
		marginBottom: 8,
	},
	workoutNameDark: {
		color: "#ffffff",
	},
	workoutDescription: {
		fontSize: 14,
		color: "#374151",
		lineHeight: 20,
		marginBottom: 12,
	},
	workoutDescriptionDark: {
		color: "#a1a1aa",
	},
	workoutDetails: {
		flexDirection: "row",
		flexWrap: "wrap",
	},
});
