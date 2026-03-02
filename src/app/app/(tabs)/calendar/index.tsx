import React, {useState, useMemo, useCallback} from "react";
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from "react-native";
import {useRouter, useLocalSearchParams} from "expo-router";
import {usePlannedWorkouts} from "@/hooks/useWorkouts";
import {useTheme} from "@/contexts/ThemeContext";
import {format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, addWeeks, subWeeks, isToday, isPast, parseISO} from "date-fns";
import {de} from "date-fns/locale";
import {apiClient, CalendarSession} from "@/services/api";
import {Colors} from "@/constants/Colors";
import {useTranslation} from "react-i18next";
import {normalizeSportName, getSportTranslation} from "@/utils/formatters";
import {showAlert} from "@/utils/alert";

type ViewMode = "month" | "week";

interface WorkoutsByDate {
	[key: string]: {
		id: string;
		scheduled_time: string;
		workout?: {
			id: string;
			name: string;
			sport: string;
			workout_minutes: number;
			estimated_heart_rate_load?: number;
			description?: string;
		};
		completed_activity_id?: string;
		completion_status?: "completed" | "partial" | "skipped";
	}[];
}

// const SCREEN_WIDTH = Dimensions.get("window").width; // Unused

/**
 * Color mapping for different sport types.
 * Keys use lowercase backend format (e.g., "cycling", "running").
 * Falls back to a default color if sport is not in the map.
 */
const SPORT_COLORS = {
	light: {
		cycling: "#2563eb",
		running: "#dc2626",
		swimming: "#0891b2",
		training: "#7c3aed",
		walking: "#059669",
		hiking: "#16a34a",
		rowing: "#0369a1",
		e_biking: "#3b82f6",
		default: "#64748b", // Neutral gray for unknown sports
	},
	dark: {
		cycling: "#3b82f6",
		running: "#ef4444",
		swimming: "#06b6d4",
		training: "#8b5cf6",
		walking: "#10b981",
		hiking: "#22c55e",
		rowing: "#0284c7",
		e_biking: "#60a5fa",
		default: "#94a3b8", // Lighter neutral gray for dark mode
	},
};

/**
 * Get the color for a sport type based on the current color scheme.
 * Automatically handles sport name normalization and fallback.
 *
 * @param sport - The sport type (e.g., "cycling", "Running", "cross_country_skiing")
 * @param isDark - Whether dark mode is active
 * @returns The hex color for the sport
 */
const getSportColor = (sport: string | undefined, isDark: boolean): string => {
	if (!sport) return SPORT_COLORS[isDark ? "dark" : "light"].default;

	const colorScheme = isDark ? "dark" : "light";
	const sportColors = SPORT_COLORS[colorScheme];

	// Normalize the sport name to lowercase for consistent lookup
	const normalizedSport = sport.toLowerCase().trim();

	// Try direct lookup first
	if (normalizedSport in sportColors) {
		return sportColors[normalizedSport as keyof typeof sportColors];
	}

	// Fall back to default color
	return sportColors.default;
};

const STATUS_COLORS = {
	light: {
		completed: "#059669",
		partial: "#f59e0b",
		skipped: "#ef4444",
		planned: Colors.light.icon,
	},
	dark: {
		completed: "#10b981",
		partial: "#fbbf24",
		skipped: "#ef4444",
		planned: Colors.dark.icon,
	},
};

export default function CalendarScreen() {
	const router = useRouter();
	const {isDark} = useTheme();
	const {t} = useTranslation();
	const params = useLocalSearchParams();

	// Read query parameters for initial date and view mode
	const today = new Date();
	const initialDate = params.date ? parseISO(Array.isArray(params.date) ? params.date[0] : params.date) : today;
	const initialViewMode = (params.view === "week" || params.view === "month") ? params.view : "month";

	const [currentDate, setCurrentDate] = useState(initialDate);
	const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
	const [completedActivities, setCompletedActivities] = useState<CalendarSession[]>([]);

	const {data: plannedWorkouts = [], isLoading, error, refetch} = usePlannedWorkouts();

	// Fetch completed activities for the current period
	React.useEffect(() => {
		fetchCompletedActivities();
	}, [currentDate, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

	const fetchCompletedActivities = async () => {
		try {
			// Calculate date range for current view
			const start = viewMode === "month" ? startOfMonth(currentDate) : startOfWeek(currentDate, {weekStartsOn: 1});
			const end = viewMode === "month" ? endOfMonth(currentDate) : addWeeks(start, 1);

			const startDate = format(start, "yyyy-MM-dd");
			const endDate = format(end, "yyyy-MM-dd");

			// Try to use the new calendar API first, with fallback to existing method
			let sessionsData;
			try {
				sessionsData = await apiClient.getSessionsByDateRange(startDate, endDate);
			} catch {
				sessionsData = await apiClient.getSessionsByDateRangeFallback(startDate, endDate);
			}

			setCompletedActivities(sessionsData.sessions);
		} catch (error) {
			console.error("Error fetching completed activities:", error);
			setCompletedActivities([]);
		}
	};

	const formatActivitySummary = useCallback((activity: CalendarSession): string => {
		const parts = [];

		// Always show duration - prefer total_timer_time over total_elapsed_time
		const duration = activity.total_timer_time || activity.total_elapsed_time || activity.duration;
		if (duration && duration > 0) {
			const hours = Math.floor(duration / 3600);
			const minutes = Math.floor((duration % 3600) / 60);
			const seconds = Math.floor(duration % 60);

			if (hours > 0) {
				parts.push(`${hours}h ${minutes}m`);
			} else if (minutes > 0) {
				parts.push(`${minutes}m ${seconds}s`);
			} else {
				parts.push(`${seconds}s`);
			}
		}

		// Distance - try both distance and total_distance
		const distance = activity.distance || activity.total_distance;
		if (distance && distance > 0) {
			if (distance >= 1000) {
				parts.push(`${(distance / 1000).toFixed(1)}km`);
			} else {
				parts.push(`${Math.round(distance)}m`);
			}
		}

		// Heart rate - try both average_heartrate and avg_heart_rate
		const heartRate = activity.average_heartrate || activity.avg_heart_rate;
		if (heartRate && heartRate > 0) {
			parts.push(`${heartRate} bpm`);
		}

		// Calories - try both calories and total_calories
		const calories = activity.calories || activity.total_calories;
		if (calories && calories > 0) {
			parts.push(`${calories} kcal`);
		}

		return parts.length > 0 ? parts.join(" • ") : t("calendar.completedSession");
	}, [t]);

	// Group workouts by date and match with completed activities
	const workoutsByDate: WorkoutsByDate = useMemo(() => {
		const grouped: WorkoutsByDate = {};

		// Add planned workouts
		plannedWorkouts.forEach((workout) => {
			if (workout.scheduled_time) {
				const dateKey = format(new Date(workout.scheduled_time), "yyyy-MM-dd");
				if (!grouped[dateKey]) {
					grouped[dateKey] = [];
				}

				// Try to match with completed activity
				const scheduledDate = new Date(workout.scheduled_time);
				const matchingActivity = completedActivities.find((activity) => {
					const activityDate = new Date(activity.start_time);
					const normalizedActivitySport = normalizeSportName(activity.sport);
					const normalizedWorkoutSport = normalizeSportName(workout.workout?.sport || "");

					// Sport matching using normalized names
					const sportsMatch = normalizedActivitySport === normalizedWorkoutSport;

					return isSameDay(activityDate, scheduledDate) && sportsMatch;
				});

				let completion_status: "completed" | "partial" | "skipped" | undefined;
				if (isPast(scheduledDate) && !isToday(scheduledDate)) {
					if (matchingActivity) {
						const plannedDuration = (workout.workout?.workout_minutes || 0) * 60;
						const actualDuration = matchingActivity.total_timer_time || matchingActivity.total_elapsed_time || matchingActivity.duration || 0;
						completion_status = actualDuration >= plannedDuration * 0.8 ? "completed" : "partial";
					} else {
						completion_status = "skipped";
					}
				}

				grouped[dateKey].push({
					...workout,
					completed_activity_id: matchingActivity?.id,
					completion_status,
				});
			}
		});

		// Add standalone completed activities (not matching any planned workout)
		completedActivities.forEach((activity) => {
			const dateKey = format(new Date(activity.start_time), "yyyy-MM-dd");
			const hasMatchingPlanned = grouped[dateKey]?.some((w) => w.completed_activity_id === activity.id);

			if (!hasMatchingPlanned) {
				if (!grouped[dateKey]) {
					grouped[dateKey] = [];
				}

				// Normalize sport name to match the format expected by the app
				const normalizedSport = normalizeSportName(activity.sport);

				grouped[dateKey].push({
					id: `activity-${activity.id}`,
					scheduled_time: activity.start_time,
					workout: {
						id: activity.id,
						name: `${normalizedSport} Session`,
						sport: normalizedSport,
						workout_minutes: Math.round((activity.total_timer_time || activity.total_elapsed_time || activity.duration || 0) / 60),
						description: formatActivitySummary(activity),
					},
					completed_activity_id: activity.id,
					completion_status: "completed",
				});
			}
		});

		return grouped;
	}, [plannedWorkouts, completedActivities, formatActivitySummary]);

	// Generate calendar days based on view mode
	const calendarDays = useMemo(() => {
		if (viewMode === "month") {
			const start = startOfMonth(currentDate);
			const end = endOfMonth(currentDate);
			const startWeek = startOfWeek(start, {weekStartsOn: 1}); // Monday
			const endWeek = startOfWeek(end, {weekStartsOn: 1});

			// Include full weeks to fill the grid
			const gridStart = startWeek;
			const gridEnd = new Date(endWeek);
			gridEnd.setDate(gridEnd.getDate() + 6);

			return eachDayOfInterval({start: gridStart, end: gridEnd});
		} else {
			const start = startOfWeek(currentDate, {weekStartsOn: 1});
			const end = new Date(start);
			end.setDate(end.getDate() + 6);
			return eachDayOfInterval({start, end});
		}
	}, [currentDate, viewMode]);

	const navigatePrev = () => {
		if (viewMode === "month") {
			setCurrentDate((prev) => subMonths(prev, 1));
		} else {
			setCurrentDate((prev) => subWeeks(prev, 1));
		}
	};

	const navigateNext = () => {
		if (viewMode === "month") {
			setCurrentDate((prev) => addMonths(prev, 1));
		} else {
			setCurrentDate((prev) => addWeeks(prev, 1));
		}
	};

	const onSelectDay = (date: Date) => {
		const iso = format(date, "yyyy-MM-dd");
		router.push(`/calendar/${iso}` as any);
	};

	const getWorkoutsForDate = (date: Date) => {
		const dateKey = format(date, "yyyy-MM-dd");
		return workoutsByDate[dateKey] || [];
	};

	const markWorkoutComplete = async (_workoutId: string, status: "completed" | "skipped") => {
		try {
			// Here you would implement the API call to mark workout as complete
			// For now, we'll just show an alert and refetch data
			showAlert(t("calendar.statusUpdated"), `${t("calendar.workoutMarked")} ${status}`, [{text: t("common.ok"), onPress: () => refetch()}]);
		} catch (error) {
			console.error("Error updating workout status:", error);
			showAlert(t("calendar.error"), t("calendar.failedToUpdate"));
		}
	};

	const getStatusIcon = (status?: string) => {
		switch (status) {
			case "completed":
				return "✅";
			case "partial":
				return "⚠️";
			case "skipped":
				return "❌";
			default:
				return "";
		}
	};

	const renderWorkoutIndicators = (workouts: any[]) => {
		if (workouts.length === 0) return null;

		const maxDots = 4;
		const visibleWorkouts = workouts.slice(0, maxDots);
		const hasMore = workouts.length > maxDots;

		return (
			<View style={styles.workoutIndicators}>
				{visibleWorkouts.map((workout, index) => {
					const sportColor = getSportColor(workout.workout?.sport, isDark);
					const colorScheme = isDark ? "dark" : "light";
					const statusColor = workout.completion_status
						? STATUS_COLORS[colorScheme][workout.completion_status as keyof typeof STATUS_COLORS.light]
						: STATUS_COLORS[colorScheme].planned;

					return (
						<View key={workout.id || index} style={styles.workoutIndicatorContainer}>
							<View style={[styles.workoutDot, {backgroundColor: sportColor}]} />
							{workout.completion_status && <View style={[styles.statusDot, {backgroundColor: statusColor}]} />}
						</View>
					);
				})}
				{hasMore && <Text style={[styles.moreIndicator, isDark && styles.moreIndicatorDark]}>+{workouts.length - maxDots}</Text>}
			</View>
		);
	};

	const renderDayCell = (date: Date, isCurrentMonth: boolean = true) => {
		const isTodayDate = isToday(date);
		const workouts = getWorkoutsForDate(date);
		const hasWorkouts = workouts.length > 0;
		const completedCount = workouts.filter((w) => w.completion_status === "completed").length;
		const totalCount = workouts.length;

		return (
			<TouchableOpacity
				onPress={() => onSelectDay(date)}
				style={[styles.dayCell, viewMode === "week" && styles.weekDayCell, isDark && styles.dayCellDark]}
				accessibilityLabel={`${format(date, "d. MMMM", {locale: de})}${hasWorkouts ? `, ${workouts.length} Training${workouts.length > 1 ? "s" : ""}` : ""}`}
			>
				<View style={[styles.dayInner, isTodayDate && (isDark ? styles.todayDark : styles.today), !isCurrentMonth && styles.otherMonth]}>
					<Text style={[styles.dayNumber, !isCurrentMonth && styles.otherMonthNumber, isDark && styles.dayNumberDark]}>{format(date, "d")}</Text>
					{hasWorkouts && viewMode === "month" && (
						<View style={styles.monthInfoContainer}>
							<Text style={[styles.workoutCount, isDark && styles.workoutCountDark]}>
								{completedCount}/{totalCount}
							</Text>
							{workouts.length > 0 && (
								<Text style={[styles.workoutTime, isDark && styles.workoutTimeDark]}>
									{(() => {
										const totalDuration = workouts.reduce((sum, w) => {
											// Get duration from workout_minutes in seconds
											const duration = w.workout?.workout_minutes
												? w.workout.workout_minutes * 60 // Convert minutes to seconds
												: 0;
											return sum + duration;
										}, 0);

										if (totalDuration > 0) {
											const hours = Math.floor(totalDuration / 3600);
											const minutes = Math.floor((totalDuration % 3600) / 60);
											return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
										}
										return "";
									})()}
								</Text>
							)}
						</View>
					)}
					{renderWorkoutIndicators(workouts)}
				</View>
				{viewMode === "week" && workouts.length > 0 && (
					<View style={[styles.weekWorkoutsList, isDark && styles.weekWorkoutsListDark]}>
						{workouts.slice(0, 4).map((workout, index) => (
							<View key={workout.id || index} style={styles.weekWorkoutItem}>
								<View style={styles.weekWorkoutHeader}>
									<View
										style={[
											styles.weekWorkoutDot,
											{
												backgroundColor: getSportColor(workout.workout?.sport, isDark),
											},
										]}
									/>
									<View style={styles.weekWorkoutMainInfo}>
										<Text style={[styles.weekWorkoutText, isDark && styles.weekWorkoutTextDark]} numberOfLines={1}>
											{getStatusIcon(workout.completion_status)} {workout.workout?.name || t("calendar.training")}
										</Text>
										{index === 0 && (
											<Text style={[styles.weekWorkoutTime, isDark && styles.weekWorkoutTimeDark]}>
												{(() => {
													const totalDuration = workouts.reduce((sum, w) => {
														// Get duration from workout_minutes in seconds
														const duration = w.workout?.workout_minutes
															? w.workout.workout_minutes * 60 // Convert minutes to seconds
															: 0;
														return sum + duration;
													}, 0);

													if (totalDuration > 0) {
														const hours = Math.floor(totalDuration / 3600);
														const minutes = Math.floor((totalDuration % 3600) / 60);
														return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
													}
													return "";
												})()}
											</Text>
										)}
									</View>
								</View>
								<View style={styles.weekWorkoutDetailsContainer}>
									{!!workout.workout?.workout_minutes && (
										<Text style={[styles.weekWorkoutDetails, isDark && styles.weekWorkoutDetailsDark]}>
											⏱ {workout.workout.workout_minutes}min
										</Text>
									)}
									{workout.workout?.description && (
										<Text style={[styles.weekWorkoutDetails, isDark && styles.weekWorkoutDetailsDark]} numberOfLines={2}>
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
								</View>
								{isPast(new Date(workout.scheduled_time)) && !workout.completion_status && (
									<View style={styles.workoutActions}>
										<TouchableOpacity
											onPress={() => markWorkoutComplete(workout.id, "completed")}
											style={[styles.actionButton, styles.completeButton]}
										>
											<Text style={styles.actionButtonText}>✓ Done</Text>
										</TouchableOpacity>
										<TouchableOpacity
											onPress={() => markWorkoutComplete(workout.id, "skipped")}
											style={[styles.actionButton, styles.skipButton]}
										>
											<Text style={styles.actionButtonText}>Skip</Text>
										</TouchableOpacity>
									</View>
								)}
							</View>
						))}
						{workouts.length > 4 && <Text style={[styles.weekMoreText, isDark && styles.weekMoreTextDark]}>+{workouts.length - 4} mehr</Text>}
					</View>
				)}
			</TouchableOpacity>
		);
	};

	const renderMonthView = () => {
		const weeks: Date[][] = [];
		for (let i = 0; i < calendarDays.length; i += 7) {
			weeks.push(calendarDays.slice(i, i + 7));
		}

		return (
			<View style={styles.monthGrid}>
				{weeks.map((week, weekIndex) => (
					<View key={weekIndex} style={styles.weekRow}>
						{week.map((date) => {
							const isCurrentMonth = date.getMonth() === currentDate.getMonth();
							return (
								<View key={date.toISOString()} style={styles.monthDayContainer}>
									{renderDayCell(date, isCurrentMonth)}
								</View>
							);
						})}
					</View>
				))}
			</View>
		);
	};

	const renderWeekView = () => {
		return (
			<View style={styles.weekGrid}>
				{calendarDays.map((date) => {
					const workouts = getWorkoutsForDate(date);
					const hasWorkouts = workouts.length > 0;
					const isTodayDate = isToday(date);

					// Calculate daily statistics
					const totalDuration = workouts.reduce((sum, w) => {
						const duration = w.workout?.workout_minutes ? w.workout.workout_minutes * 60 : 0;
						return sum + duration;
					}, 0);

					const completedCount = workouts.filter((w) => w.completion_status === "completed").length;
					const totalCount = workouts.length;
					const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

					// Group by sport
					const sportGroups = workouts.reduce(
						(groups, workout) => {
							const sport = workout.workout?.sport || t("calendar.training");
							if (!groups[sport]) {
								groups[sport] = [];
							}
							groups[sport].push(workout);
							return groups;
						},
						{} as Record<string, typeof workouts>
					);

					return (
						<TouchableOpacity
							key={date.toISOString()}
							style={[styles.newWeekDayContainer, isDark && styles.newWeekDayContainerDark]}
							onPress={() => onSelectDay(date)}
						>
							{/* Day Header */}
							<View style={[styles.newWeekDayHeader, isTodayDate && styles.newWeekDayHeaderToday, isDark && styles.newWeekDayHeaderDark]}>
								<View style={styles.newWeekDayHeaderLeft}>
									<Text
										style={[
											styles.newWeekDayNumber,
											isTodayDate && styles.newWeekDayNumberToday,
											isDark && styles.newWeekDayNumberDark,
										]}
									>
										{format(date, "d")}
									</Text>
									<Text style={[styles.newWeekDayName, isDark && styles.newWeekDayNameDark]}>{format(date, "EEEE", {locale: de})}</Text>
				
								</View>

								{hasWorkouts && (
									<View style={styles.newWeekDayStats}>
										<View style={styles.newWeekStatItem}>
											<Text style={[styles.newWeekStatValue, isDark && styles.newWeekStatValueDark]}>{totalCount}</Text>
											<Text style={[styles.newWeekStatLabel, isDark && styles.newWeekStatLabelDark]}>Sessions</Text>
										</View>

										{totalDuration > 0 && (
											<View style={styles.newWeekStatItem}>
												<Text style={[styles.newWeekStatValue, isDark && styles.newWeekStatValueDark]}>
													{(() => {
														const hours = Math.floor(totalDuration / 3600);
														const minutes = Math.floor((totalDuration % 3600) / 60);
														return hours > 0 ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}` : `${minutes}m`;
													})()}
												</Text>
												<Text style={[styles.newWeekStatLabel, isDark && styles.newWeekStatLabelDark]}>Total</Text>
											</View>
										)}

										{totalCount > 0 && (
											<View style={styles.newWeekStatItem}>
												<Text style={[styles.newWeekStatValue, isDark && styles.newWeekStatValueDark]}>
													{Math.round(completionRate)}%
												</Text>
												<Text style={[styles.newWeekStatLabel, isDark && styles.newWeekStatLabelDark]}>Done</Text>
											</View>
										)}
									</View>
								)}
							</View>

							{/* Sessions List */}
							{hasWorkouts ? (
								<View style={styles.newWeekSessionsList}>
									{Object.entries(sportGroups).map(([sport, sportWorkouts]) => {
										const sportColor = getSportColor(sport, isDark);

										const sportDuration = sportWorkouts.reduce((sum, w) => {
											const duration = w.workout?.workout_minutes ? w.workout.workout_minutes * 60 : 0;
											return sum + duration;
										}, 0);

										const sportCompleted = sportWorkouts.filter((w) => w.completion_status === "completed").length;

										return (
											<View key={sport} style={styles.newWeekSportGroup}>
												<View style={styles.newWeekSportHeader}>
													<View style={[styles.newWeekSportIndicator, {backgroundColor: sportColor}]} />
													<Text style={[styles.newWeekSportName, isDark && styles.newWeekSportNameDark]}>{getSportTranslation(sport, t)}</Text>
													<View style={styles.newWeekSportMeta}>
														<Text style={[styles.newWeekSportCount, isDark && styles.newWeekSportCountDark]}>
															{sportCompleted}/{sportWorkouts.length}
														</Text>
														{sportDuration > 0 && (
															<Text style={[styles.newWeekSportDuration, isDark && styles.newWeekSportDurationDark]}>
																{(() => {
																	const hours = Math.floor(sportDuration / 3600);
																	const minutes = Math.floor((sportDuration % 3600) / 60);
																	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
																})()}
															</Text>
														)}
													</View>
												</View>

												<View style={styles.newWeekSessionsContainer}>
													{sportWorkouts.slice(0, 3).map((workout, index) => (
														<View
															key={workout.id || index}
															style={[styles.newWeekSessionItem, isDark && styles.newWeekSessionItemDark]}
														>
															<View style={styles.newWeekSessionMain}>
																<Text
																	style={[styles.newWeekSessionName, isDark && styles.newWeekSessionNameDark]}
																	numberOfLines={1}
																>
																	{workout.workout?.name || t("calendar.training")}
																</Text>
																<Text style={[styles.newWeekSessionTime, isDark && styles.newWeekSessionTimeDark]}>
																	{format(new Date(workout.scheduled_time), "HH:mm")}
																</Text>
															</View>

															{workout.workout?.description && (
																<Text
																	style={[styles.newWeekSessionDesc, isDark && styles.newWeekSessionDescDark]}
																	numberOfLines={2}
																>
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

															<View style={styles.newWeekSessionDetails}>
																{!!workout.workout?.workout_minutes && (
																	<Text style={[styles.newWeekSessionDetail, isDark && styles.newWeekSessionDetailDark]}>
																		{workout.workout.workout_minutes}min
																	</Text>
																)}
																{!!workout.workout?.estimated_heart_rate_load && (
																	<Text style={[styles.newWeekSessionDetail, isDark && styles.newWeekSessionDetailDark]}>
																		HR: {workout.workout.estimated_heart_rate_load}
																	</Text>
																)}
															</View>
														</View>
													))}

													{sportWorkouts.length > 3 && (
														<Text style={[styles.newWeekMoreSessions, isDark && styles.newWeekMoreSessionsDark]}>
															{t("calendar.moreSessions", {count: sportWorkouts.length - 3})}
														</Text>
													)}
												</View>
											</View>
										);
									})}
								</View>
							) : (
								<View style={styles.newWeekEmptyDay}>
									<Text style={[styles.newWeekEmptyText, isDark && styles.newWeekEmptyTextDark]}>{t("calendar.noSessions")}</Text>
								</View>
							)}
						</TouchableOpacity>
					);
				})}
			</View>
		);
	};

	const renderLegend = () => {
		const sportItems = [
			{color: getSportColor("cycling", isDark), label: t("calendar.cycling")},
			{color: getSportColor("running", isDark), label: t("calendar.running")},
			{color: getSportColor("swimming", isDark), label: t("calendar.swimming")},
			{color: getSportColor("training", isDark), label: t("calendar.training")},
		];

		return (
			<View style={[styles.legendContainer, isDark && styles.legendContainerDark]}>
				<View style={styles.legendSportItems}>
					{sportItems.map((item, index) => (
						<View key={index} style={styles.legendItem}>
							<View style={[styles.legendDot, {backgroundColor: item.color}]} />
							<Text style={[styles.legendLabel, isDark && styles.legendLabelDark]}>{item.label}</Text>
						</View>
					))}
				</View>
			</View>
		);
	};

	if (error) {
		return (
			<View style={[styles.container, isDark && styles.containerDark]}>
				<View style={styles.errorContainer}>
					<Text style={[styles.errorText, isDark && styles.errorTextDark]}>Fehler beim Laden der Trainings</Text>
				</View>
			</View>
		);
	}

	return (
		<View style={[styles.container, isDark && styles.containerDark]}>
			{/* Header with navigation and view toggle */}
			<View style={[styles.header, isDark && styles.headerDark]}>
				<TouchableOpacity onPress={navigatePrev} style={[styles.navButton, isDark && styles.navButtonDark]} accessibilityLabel={t("calendar.back")}>
					<Text style={[styles.navText, isDark && styles.navTextDark]}>‹</Text>
				</TouchableOpacity>

				<View style={styles.titleContainer}>
					<Text style={[styles.title, isDark && styles.titleDark]}>
						{viewMode === "month"
							? format(currentDate, "MMMM yyyy", {locale: de})
							: format(calendarDays[0], "d.", {locale: de}) + " - " + format(calendarDays[6], "d. MMM yyyy", {locale: de})}
					</Text>
					{isLoading && <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>Lade...</Text>}
				</View>

				<TouchableOpacity onPress={navigateNext} style={[styles.navButton, isDark && styles.navButtonDark]} accessibilityLabel={t("calendar.forward")}>
					<Text style={[styles.navText, isDark && styles.navTextDark]}>›</Text>
				</TouchableOpacity>
			</View>

			{/* View mode toggle */}
			<View style={[styles.viewToggle, isDark && styles.viewToggleDark]}>
				<TouchableOpacity
					onPress={() => setViewMode("month")}
					style={[styles.viewToggleButton, viewMode === "month" && (isDark ? styles.viewToggleButtonActiveDark : styles.viewToggleButtonActive)]}
				>
					<Text style={[styles.viewToggleText, viewMode === "month" && styles.viewToggleTextActive, isDark && styles.viewToggleTextDark]}>{t("calendar.month")}</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => setViewMode("week")}
					style={[styles.viewToggleButton, viewMode === "week" && (isDark ? styles.viewToggleButtonActiveDark : styles.viewToggleButtonActive)]}
				>
					<Text style={[styles.viewToggleText, viewMode === "week" && styles.viewToggleTextActive, isDark && styles.viewToggleTextDark]}>{t("calendar.week")}</Text>
				</TouchableOpacity>
			</View>

			<ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
				{/* Weekday headers */}
				{viewMode === "month" && (
					<View style={[styles.weekdaysRow, isDark && styles.weekdaysRowDark]}>
						{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
							<Text key={day} style={[styles.weekdayText, isDark && styles.weekdayTextDark]}>
								{day}
							</Text>
						))}
					</View>
				)}

				{/* Calendar content */}
				{viewMode === "month" ? renderMonthView() : renderWeekView()}
			</ScrollView>

			{/* Legend - fixed at bottom */}
			{renderLegend()}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: Colors.light.background,
	},
	containerDark: {
		backgroundColor: Colors.dark.background,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: Colors.light.border,
		backgroundColor: Colors.light.background,
	},
	headerDark: {
		borderBottomColor: Colors.dark.border,
		backgroundColor: Colors.dark.background,
	},
	titleContainer: {
		alignItems: "center",
		flex: 1,
	},
	title: {
		fontSize: 18,
		fontWeight: "700",
		color: Colors.light.text,
		textAlign: "center",
		letterSpacing: -0.5,
	},
	titleDark: {
		color: Colors.dark.text,
	},
	loadingText: {
		fontSize: 11,
		color: Colors.light.icon,
		marginTop: 2,
	},
	loadingTextDark: {
		color: Colors.dark.icon,
	},
	navButton: {
		padding: 10,
		minWidth: 42,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
		backgroundColor: Colors.light.muted,
	},
	navButtonDark: {
		backgroundColor: Colors.dark.muted,
	},
	navText: {
		fontSize: 22,
		color: Colors.light.text,
		fontWeight: "600",
	},
	navTextDark: {
		color: Colors.dark.text,
	},
	viewToggle: {
		flexDirection: "row",
		marginHorizontal: 16,
		marginBottom: 10,
		backgroundColor: Colors.light.muted,
		borderRadius: 10,
		padding: 4,
		marginTop: 6,
	},
	viewToggleDark: {
		backgroundColor: Colors.dark.muted,
	},
	viewToggleButton: {
		flex: 1,
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 7,
		alignItems: "center",
	},
	viewToggleButtonActive: {
		backgroundColor: Colors.light.background,
		boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
		elevation: 3,
	},
	viewToggleButtonActiveDark: {
		backgroundColor: Colors.dark.background,
	},
	viewToggleText: {
		fontSize: 13,
		fontWeight: "500",
		color: Colors.light.icon,
	},
	viewToggleTextDark: {
		color: Colors.dark.icon,
	},
	viewToggleTextActive: {
		color: "#000000",
		fontWeight: "600",
	},
	scrollContainer: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
	},
	weekdaysRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderBottomWidth: 1,
		borderBottomColor: Colors.light.border,
	},
	weekdaysRowDark: {
		backgroundColor: Colors.dark.background,
		borderBottomColor: Colors.dark.border,
	},
	weekdayText: {
		width: `${100 / 7}%`,
		textAlign: "center",
		color: Colors.light.icon,
		fontWeight: "600",
		fontSize: 11,
	},
	weekdayTextDark: {
		color: Colors.dark.icon,
	},
	// Month view styles
	monthGrid: {
		paddingHorizontal: 8,
		paddingBottom: 8,
	},
	weekRow: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	monthDayContainer: {
		width: `${100 / 7}%`,
		alignItems: "center",
		paddingVertical: 4,
	},
	dayCell: {
		alignItems: "center",
		justifyContent: "flex-start",
		minHeight: 70,
		width: "100%",
		paddingVertical: 5,
		borderRadius: 10,
		marginVertical: 2,
		backgroundColor: "transparent",
	},
	dayCellDark: {
		backgroundColor: "transparent",
	},
	weekDayCell: {
		minHeight: 110,
		paddingVertical: 7,
		backgroundColor: Colors.light.muted,
		marginHorizontal: 4,
		marginVertical: 4,
		borderRadius: 12,
	},
	dayInner: {
		width: 56,
		height: 56,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	dayNumber: {
		color: Colors.light.text,
		fontWeight: "600",
		fontSize: 15,
	},
	dayNumberDark: {
		color: Colors.dark.text,
	},
	monthInfoContainer: {
		alignItems: "center",
		marginTop: 2,
	},
	workoutCount: {
		fontSize: 9,
		color: Colors.light.icon,
		fontWeight: "600",
		marginBottom: 1,
	},
	workoutCountDark: {
		color: Colors.dark.icon,
	},
	workoutTime: {
		fontSize: 8,
		color: Colors.light.icon,
		fontWeight: "500",
	},
	workoutTimeDark: {
		color: Colors.dark.icon,
	},
	today: {
		borderColor: Colors.light.icon,
		borderWidth: 1,
	},
	todayDark: {
		borderColor: Colors.dark.icon,
		borderWidth: 1,
	},
	todayNumber: {
		color: "#ffffff",
	},
	todayNumberDark: {
		color: "#ffffff",
	},
	selected: {
		backgroundColor: "transparent",
		borderWidth: 0,
		borderColor: "transparent",
	},
	selectedDark: {
		backgroundColor: "transparent",
		borderWidth: 0,
		borderColor: "transparent",
	},
	selectedNumber: {
		color: "#374151",
		fontWeight: "700",
	},
	selectedNumberDark: {
		color: "#f3f4f6",
		fontWeight: "700",
	},
	otherMonth: {
		opacity: 0.3,
	},
	otherMonthNumber: {
		color: "#9ca3af",
	},
	// Workout indicators
	workoutIndicators: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		flexWrap: "wrap",
		marginTop: 2,
		minHeight: 11,
	},
	workoutIndicatorContainer: {
		position: "relative",
		marginHorizontal: 1,
	},
	workoutDot: {
		width: 9,
		height: 9,
		borderRadius: 4.5,
		boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
		elevation: 2,
	},
	statusDot: {
		position: "absolute",
		top: -2,
		right: -2,
		width: 7,
		height: 7,
		borderRadius: 3.5,
		borderWidth: 1,
		borderColor: "#ffffff",
	},
	moreIndicator: {
		fontSize: 8,
		color: "#666666",
		fontWeight: "600",
		marginLeft: 2,
	},
	moreIndicatorDark: {
		color: "#9ca3af",
	},
	// Week view styles
	weekContainer: {
		paddingBottom: 20,
	},
	weekGrid: {
		paddingHorizontal: 8,
		paddingBottom: 20,
	},
	weekDayContainer: {
		marginBottom: 6,
		backgroundColor: Colors.light.background,
		borderRadius: 12,
		padding: 8,
		marginHorizontal: 4,
	},
	weekDayContainerDark: {
		backgroundColor: Colors.dark.background,
	},
	weekDayLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: Colors.light.text,
		marginBottom: 4,
		textAlign: "center",
	},
	weekDayLabelDark: {
		color: Colors.dark.text,
	},
	weekWorkoutsList: {
		marginTop: 4,
		width: "100%",
		backgroundColor: Colors.light.background,
		borderRadius: 8,
		padding: 12,
		minHeight: 80,
	},
	weekWorkoutsListDark: {
		backgroundColor: Colors.dark.background,
	},
	weekWorkoutItem: {
		marginBottom: 12,
		paddingVertical: 8,
		paddingHorizontal: 4,
		borderBottomWidth: 1,
		borderBottomColor: "#f0f0f0",
		borderRadius: 6,
	},
	weekWorkoutHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 6,
	},
	weekWorkoutDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginRight: 10,
		boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
		elevation: 1,
	},
	weekWorkoutMainInfo: {
		flex: 1,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	weekWorkoutText: {
		flex: 1,
		fontSize: 14,
		color: Colors.light.text,
		fontWeight: "600",
		marginRight: 8,
	},
	weekWorkoutTextDark: {
		color: Colors.dark.text,
	},
	weekWorkoutTime: {
		fontSize: 12,
		color: Colors.light.icon,
		fontWeight: "500",
	},
	weekWorkoutTimeDark: {
		color: Colors.dark.icon,
	},
	weekWorkoutDetailsContainer: {
		marginLeft: 22,
		marginBottom: 4,
	},
	weekWorkoutDetails: {
		fontSize: 11,
		color: Colors.light.icon,
		marginBottom: 3,
		lineHeight: 16,
	},
	weekWorkoutDetailsDark: {
		color: Colors.dark.icon,
	},
	weekMoreText: {
		fontSize: 11,
		color: Colors.light.icon,
		fontStyle: "italic",
		marginTop: 4,
		textAlign: "center",
	},
	weekMoreTextDark: {
		color: Colors.dark.icon,
	},
	workoutActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginTop: 8,
		gap: 8,
	},
	actionButton: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
		minWidth: 60,
		alignItems: "center",
	},
	completeButton: {
		backgroundColor: "#059669",
	},
	skipButton: {
		backgroundColor: "#ef4444",
	},
	actionButtonText: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: "600",
	},
	// New Week View Styles
	newWeekDayContainer: {
		marginBottom: 12,
		backgroundColor: Colors.light.background,
		borderRadius: 16,
		marginHorizontal: 8,
		boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
		elevation: 2,
		overflow: "hidden",
	},
	newWeekDayContainerDark: {
		backgroundColor: Colors.dark.background,
		boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
	},
	newWeekDayHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 10,
		backgroundColor: Colors.light.muted,
		borderBottomWidth: 1,
		borderBottomColor: Colors.light.border,
	},
	newWeekDayHeaderDark: {
		backgroundColor: Colors.dark.muted,
		borderBottomColor: Colors.dark.border,
	},
	newWeekDayHeaderToday: {
		backgroundColor: Colors.light.border,
		borderBottomColor: Colors.light.icon,
	},
	newWeekDayHeaderLeft: {
		flexDirection: "row",
		alignItems: "center",
	},
	newWeekDayName: {
		fontSize: 13,
		fontWeight: "500",
		color: Colors.light.text,
		marginRight: 9,
	},
	newWeekDayNameDark: {
		color: Colors.dark.text,
	},
	newWeekDayNumber: {
		fontSize: 17,
		fontWeight: "600",
		color: Colors.light.text,
		backgroundColor: Colors.light.border,
		width: 30,
		height: 30,
		borderRadius: 15,
		textAlign: "center",
		lineHeight: 30,
		marginRight: 5,
	},
	newWeekDayNumberDark: {
		color: Colors.dark.text,
		backgroundColor: Colors.dark.border,
	},
	newWeekDayNumberToday: {
		backgroundColor: Colors.light.icon,
		color: "#ffffff",
	},
	newWeekDayStats: {
		flexDirection: "row",
		gap: 14,
	},
	newWeekStatItem: {
		alignItems: "center",
	},
	newWeekStatValue: {
		fontSize: 12,
		fontWeight: "600",
		color: Colors.light.text,
		lineHeight: 14,
	},
	newWeekStatValueDark: {
		color: Colors.dark.text,
	},
	newWeekStatLabel: {
		fontSize: 9,
		color: Colors.light.icon,
		marginTop: 1,
	},
	newWeekStatLabelDark: {
		color: Colors.dark.icon,
	},
	newWeekSessionsList: {
		padding: 18,
	},
	newWeekSportGroup: {
		marginBottom: 16,
	},
	newWeekSportHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
	},
	newWeekSportIndicator: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginRight: 8,
	},
	newWeekSportName: {
		fontSize: 16,
		fontWeight: "700",
		color: Colors.light.text,
		flex: 1,
	},
	newWeekSportNameDark: {
		color: Colors.dark.text,
	},
	newWeekSportMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	newWeekSportCount: {
		fontSize: 13,
		fontWeight: "700",
		color: Colors.light.icon,
	},
	newWeekSportCountDark: {
		color: Colors.dark.icon,
	},
	newWeekSportDuration: {
		fontSize: 13,
		fontWeight: "600",
		color: Colors.light.icon,
	},
	newWeekSportDurationDark: {
		color: Colors.dark.icon,
	},
	newWeekSessionsContainer: {
		marginLeft: 20,
	},
	newWeekSessionItem: {
		marginBottom: 14,
		padding: 16,
		backgroundColor: Colors.light.muted,
		borderRadius: 10,
		borderLeftWidth: 4,
		borderLeftColor: Colors.light.border,
	},
	newWeekSessionItemDark: {
		backgroundColor: Colors.dark.muted,
		borderLeftColor: Colors.dark.icon,
	},
	newWeekSessionMain: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 4,
	},
	newWeekSessionName: {
		fontSize: 15,
		fontWeight: "700",
		color: Colors.light.text,
		flex: 1,
		marginRight: 10,
	},
	newWeekSessionNameDark: {
		color: Colors.dark.text,
	},
	newWeekSessionTime: {
		fontSize: 14,
		fontWeight: "600",
		color: Colors.light.icon,
	},
	newWeekSessionTimeDark: {
		color: Colors.dark.icon,
	},
	newWeekSessionDesc: {
		fontSize: 13,
		color: Colors.light.icon,
		lineHeight: 18,
		marginBottom: 8,
	},
	newWeekSessionDescDark: {
		color: Colors.dark.icon,
	},
	newWeekSessionDetails: {
		flexDirection: "row",
		gap: 12,
	},
	newWeekSessionDetail: {
		fontSize: 12,
		color: Colors.light.icon,
		fontWeight: "600",
	},
	newWeekSessionDetailDark: {
		color: Colors.dark.icon,
	},
	newWeekMoreSessions: {
		fontSize: 11,
		color: Colors.light.icon,
		fontStyle: "italic",
		textAlign: "center",
		marginTop: 8,
	},
	newWeekMoreSessionsDark: {
		color: Colors.dark.icon,
	},
	newWeekEmptyDay: {
		padding: 20,
		alignItems: "center",
	},
	newWeekEmptyText: {
		fontSize: 13,
		color: Colors.light.icon,
		fontStyle: "italic",
	},
	newWeekEmptyTextDark: {
		color: Colors.dark.icon,
	},

	// Legend styles
	legendContainer: {
		backgroundColor: Colors.light.background,
		borderTopWidth: 1,
		borderTopColor: Colors.light.border,
		padding: 12,
		paddingBottom: 16,
	},
	legendContainerDark: {
		backgroundColor: Colors.dark.background,
		borderTopColor: Colors.dark.border,
	},
	legendTitle: {
		fontSize: 15,
		fontWeight: "700",
		color: Colors.light.text,
		marginBottom: 10,
		textAlign: "center",
	},
	legendTitleDark: {
		color: Colors.dark.text,
	},
	legendSportItems: {
		flexDirection: "row",
		justifyContent: "space-around",
		flexWrap: "wrap",
		gap: 7,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5,
	},
	legendDot: {
		width: 11,
		height: 11,
		borderRadius: 5.5,
		marginRight: 7,
		boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
		elevation: 2,
	},
	legendLabel: {
		fontSize: 12,
		color: Colors.light.text,
	},
	legendLabelDark: {
		color: Colors.dark.text,
	},

	// Error state
	errorContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	errorText: {
		fontSize: 16,
		color: "#dc2626",
		textAlign: "center",
	},
	errorTextDark: {
		color: "#ef4444",
	},
});
