import React, {useCallback} from "react";
import {View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Dimensions} from "react-native";
import {StatusBar} from "expo-status-bar";
import {router} from "expo-router";
import {useTheme} from "@/contexts/ThemeContext";
import {apiClient, Session} from "@/services/api";
import {formatDistance, formatTime, formatDateShort, getSportTranslation, formatVelocity} from "@/utils/formatters";
import {FitFileUploadButton} from "@/components/FitFileUploadButton";
import {useInfiniteQuery} from "@tanstack/react-query";
import {useTranslation} from "react-i18next";
import { ListFilters } from "@/components/ListFilters";
import { ListHeader, ColumnDefinition } from "@/components/ListHeader";

type SortColumn = "sport" | "start_time" | "distance" | "duration" | "average_speed" | "elevation_gain" | "average_heartrate";
type SortDirection = "asc" | "desc";

const ITEMS_PER_PAGE = 20;

/**
 * Activities Screen - Displays a list of training sessions
 *
 * IMPORTANT: Despite being called "activities" in the UI, this screen displays SESSIONS.
 *
 * Database Structure:
 * - activities: Container for one or more sessions (e.g., a triathlon FIT file)
 * - sessions: Individual sports within an activity (e.g., swim, bike, run)
 *
 * Example: One triathlon FIT file creates:
 * - 1 activity (parent container)
 * - 3 sessions (swimming, cycling, running)
 *
 * This screen lists all SESSIONS, not activities, because users want to see
 * individual training sessions (e.g., "Morning Run") not activity containers.
 */
export default function ActivitiesScreen() {
	const {colorScheme} = useTheme();
	const {t} = useTranslation();
	const [sortColumn, setSortColumn] = React.useState<SortColumn>("start_time");
	const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
	const [sportFilter, setSportFilter] = React.useState<string>("all");
	const [dateFilter, setDateFilter] = React.useState<string>("all");
	const [screenWidth, setScreenWidth] = React.useState(Dimensions.get("window").width);

	React.useEffect(() => {
		const subscription = Dimensions.addEventListener("change", ({window}) => {
			setScreenWidth(window.width);
		});
		return () => subscription?.remove();
	}, []);

	// Fetch sessions (not activities) - each row represents one training session
	// The backend endpoint is /activities/sessions but returns individual training sessions
	const {data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isFetching, isLoading} = useInfiniteQuery({
		queryKey: ["sessions"],
		queryFn: ({pageParam}) => apiClient.getSessions(pageParam, ITEMS_PER_PAGE),
		getNextPageParam: (lastPage, allPages) => {
			const totalLoaded = allPages.reduce((acc, page) => acc + page.items.length, 0);
			return totalLoaded < lastPage.total ? allPages.length + 1 : undefined;
		},
		initialPageParam: 1,
		enabled: true,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	// Flatten all pages into a single array
	const allSessions = React.useMemo(() => data?.pages.flatMap((page) => page.items) || [], [data?.pages]);
	const total = data?.pages[0]?.total || 0;

	// Get unique sports for filter
	const uniqueSports = React.useMemo(() => {
		const sports = [...new Set(allSessions.map((session) => session.sport))];
		return sports.sort();
	}, [allSessions]);

	// Apply filters
	const filteredSessions = React.useMemo(() => {
		let filtered = allSessions;

		// Apply sport filter
		if (sportFilter !== "all") {
			filtered = filtered.filter((session) => session.sport === sportFilter);
		}

		// Apply date filter
		if (dateFilter !== "all") {
			const now = new Date();
			const filterDate = new Date();

			switch (dateFilter) {
				case "week":
					filterDate.setDate(now.getDate() - 7);
					break;
				case "month":
					filterDate.setMonth(now.getMonth() - 1);
					break;
				case "3months":
					filterDate.setMonth(now.getMonth() - 3);
					break;
				case "year":
					filterDate.setFullYear(now.getFullYear() - 1);
					break;
			}

			if (dateFilter !== "all") {
				filtered = filtered.filter((session) => new Date(session.start_time) >= filterDate);
			}
		}

		return filtered;
	}, [allSessions, sportFilter, dateFilter]);

	const sortSessions = (sessionList: Session[]): Session[] => {
		return [...sessionList].sort((a, b) => {
			let aVal: any, bVal: any;

			switch (sortColumn) {
				case "sport":
					aVal = a.sport.toLowerCase();
					bVal = b.sport.toLowerCase();
					break;
				case "start_time":
					aVal = new Date(a.start_time).getTime();
					bVal = new Date(b.start_time).getTime();
					break;
				case "distance":
					aVal = a.distance || 0;
					bVal = b.distance || 0;
					break;
				case "duration":
					aVal = a.total_timer_time || a.total_elapsed_time || a.duration || 0;
					bVal = b.total_timer_time || b.total_elapsed_time || b.duration || 0;
					break;
				case "average_speed":
					aVal = a.average_speed || 0;
					bVal = b.average_speed || 0;
					break;
				case "elevation_gain":
					aVal = a.elevation_gain || 0;
					bVal = b.elevation_gain || 0;
					break;
				default:
					return 0;
			}

			if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
			if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
			return 0;
		});
	};

	const handleSort = useCallback((column: SortColumn) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc");
		} else {
			setSortColumn(column);
			setSortDirection("asc");
		}
	}, [sortColumn, sortDirection]);

	const handleRefresh = useCallback(async () => {
		await refetch();
	}, [refetch]);

	const handleLoadMore = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const isSmallScreen = screenWidth < 768;

  const columns = React.useMemo((): ColumnDefinition<SortColumn>[] => [
    { 
      id: "start_time", 
      label: isSmallScreen ? "DATE" : t("activities.date"), 
      width: isSmallScreen ? "w-20" : "w-24", 
      align: "center" 
    },
    { 
      id: "sport", 
      label: isSmallScreen ? "TITLE" : "Title", 
      width: isSmallScreen ? "w-24" : "flex-1", 
      align: "left" 
    },
    { 
      id: "distance", 
      label: isSmallScreen ? "KM" : t("activities.km"), 
      width: isSmallScreen ? "w-16" : "w-20", 
      align: "center" 
    },
    { 
      id: "duration", 
      label: isSmallScreen ? "TIME" : t("activities.time"), 
      width: isSmallScreen ? "w-16" : "w-20", 
      align: "center" 
    },
    { 
      id: "average_speed", 
      label: isSmallScreen ? "PACE" : t("activities.speed"), 
      width: isSmallScreen ? "w-16" : "w-20", 
      align: "center" 
    },
    { 
      id: "elevation_gain", 
      label: isSmallScreen ? "ELEV" : t("activities.height"), 
      width: isSmallScreen ? "w-16" : "w-20", 
      align: "center" 
    },
    { 
      id: "average_heartrate", 
      label: t("activities.avgHeartRate") || "AVG HR", 
      width: "w-24", 
      align: "center", 
      hideOnSmallScreen: true 
    },
  ], [isSmallScreen, t]);

	const renderListHeader = useCallback(() => (
    <ListHeader
      columns={columns}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      onSort={handleSort}
      screenWidth={screenWidth}
    />
  ), [columns, sortColumn, sortDirection, handleSort, screenWidth]);

	// Render a single session row
	// Note: We navigate to the session detail page using the session's ID
	// The detail page will show this specific session's data
	const renderSessionItem = ({item}: {item: Session}) => (
		<TouchableOpacity className="bg-card border-b border-border active:bg-muted" onPress={() => router.push(`/activities/${item.id}`)}>
			<View className="flex-row px-2 py-3 items-center">
				<View className={isSmallScreen ? "w-20" : "w-24"}>
					<Text className="text-xs text-muted-foreground text-center">{formatDateShort(item.start_time)}</Text>
				</View>
				<View className={`px-1 ${isSmallScreen ? "w-24" : "flex-1"}`}>
					<Text className="text-sm font-medium text-foreground" numberOfLines={1}>
						{item.title || getSportTranslation(item.sport, t)}
					</Text>
				</View>
				<View className={isSmallScreen ? "w-16" : "w-20"}>
					<Text className="text-xs text-foreground text-center font-medium">{item.distance ? formatDistance(item.distance) : "-"}</Text>
				</View>
				<View className={isSmallScreen ? "w-16" : "w-20"}>
					<Text className="text-xs text-foreground text-center">{(item.total_timer_time || item.total_elapsed_time || item.duration) ? formatTime(item.total_timer_time || item.total_elapsed_time || item.duration || 0) : "-"}</Text>
				</View>
				<View className={isSmallScreen ? "w-16" : "w-20"}>
					<Text className="text-xs text-foreground text-center">
						{(() => {
							const velocity = formatVelocity(item.average_speed, item.sport);
							return `${velocity.value} ${velocity.unit}`;
						})()}
					</Text>
				</View>
				<View className={isSmallScreen ? "w-16" : "w-20"}>
					<Text className="text-xs text-foreground text-center">{item.elevation_gain ? `${Math.round(item.elevation_gain)}m` : "-"}</Text>
				</View>
				{!isSmallScreen && (
					<View className="w-24">
						<Text className="text-xs text-foreground text-center">
							{item.average_heartrate ? `${Math.round(item.average_heartrate)} bpm` : "-"}
						</Text>
					</View>
				)}
			</View>
		</TouchableOpacity>
	);

	const renderFooter = () => {
		if (!isFetchingNextPage || filteredSessions.length === 0) return null;

		return (
			<View className="py-6 items-center">
				<ActivityIndicator size="small" color={colorScheme === "dark" ? "#ECEDEE" : "#11181C"} />
				<Text className="text-sm text-muted-foreground mt-2">{t("activities.furtherActivitiesLoading")}</Text>
			</View>
		);
	};

	const renderEmpty = () => {
		if (isLoading) {
			return (
				<View className="flex-1 items-center justify-center px-8 py-16">
					<ActivityIndicator size="large" color={colorScheme === "dark" ? "#ECEDEE" : "#11181C"} />
					<Text className="text-base text-muted-foreground mt-4">{t("activities.loadingActivities")}</Text>
				</View>
			);
		}

		return (
			<View className="flex-1 items-center justify-center px-8 py-16">
				<Text className="text-xl font-bold text-foreground mb-3">{t("activities.noActivities")}</Text>
				<Text className="text-base text-muted-foreground text-center leading-relaxed">{t("activities.noActivitiesDescription")}</Text>
			</View>
		);
	};

	return (
		<View className="flex-1 bg-background">
			<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

			{/* Only show header on large screens */}
			{!isSmallScreen && (
				<View className="bg-card border-b border-border">
					<View className="flex-row items-center justify-between px-6 py-4">
						<View>
							<Text className="text-2xl font-bold text-foreground">{t("activities.title")}</Text>
							{total > 0 && (
								<Text className="text-sm text-muted-foreground mt-1">
									{`${filteredSessions.length} von ${total} Aktivitäten`}
									{(sportFilter !== "all" || dateFilter !== "all") && ` ${t("activities.filtered")}`}
								</Text>
							)}
						</View>
						<View className="flex-row items-center">
							<FitFileUploadButton size={20} onUploadSuccess={handleRefresh} />
						</View>
					</View>
				</View>
			)}

			<ListFilters
        sportFilter={sportFilter}
        onSportFilterChange={setSportFilter}
        uniqueSports={uniqueSports}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        showDateFilter={true}
      />

			<FlatList
				data={sortSessions(filteredSessions)}
				keyExtractor={(item) => item.id}
				renderItem={renderSessionItem}
				ListHeaderComponent={renderListHeader}
				onEndReached={handleLoadMore}
				onEndReachedThreshold={0.5}
				refreshControl={<RefreshControl refreshing={isFetching} onRefresh={handleRefresh} tintColor={colorScheme === "dark" ? "#ffffff" : "#000000"} />}
				ListFooterComponent={renderFooter}
				ListEmptyComponent={renderEmpty}
				contentContainerStyle={filteredSessions.length === 0 ? {flex: 1} : {paddingBottom: 100}}
				showsVerticalScrollIndicator={false}
			/>
		</View>
	);
}
