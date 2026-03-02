import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import { useWorkouts } from "@/hooks/useWorkouts";
import { WorkoutIllustration } from "@/components/WorkoutIllustration";
import { Workout } from "@/services/training";
import { getSportTranslation } from "@/utils/formatters";
import { ListFilters } from "@/components/ListFilters";
import { ListHeader, ColumnDefinition } from "@/components/ListHeader";

type SortColumn = 'name' | 'sport' | 'duration' | 'illustration';

export default function WorkoutsScreen() {
  const { colorScheme } = useTheme();
  const { t } = useTranslation();
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [screenWidth, setScreenWidth] = useState(Dimensions.get("window").width);

  React.useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  const isSmallScreen = screenWidth < 768;

  const { data: workouts = [], isLoading, refetch, isFetching } = useWorkouts();

  // Get unique sports for filter
  const uniqueSports = useMemo(() => {
    const sports = [...new Set(workouts.map((w) => w.sport))];
    return sports.sort();
  }, [workouts]);

  // Apply filters
  const filteredWorkouts = useMemo(() => {
    let filtered = workouts;

    if (sportFilter !== "all") {
      filtered = filtered.filter((w) => w.sport === sportFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'sport':
          comparison = a.sport.localeCompare(b.sport);
          break;
        case 'duration':
          comparison = (a.workout_minutes || 0) - (b.workout_minutes || 0);
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [workouts, sportFilter, sortColumn, sortDirection]);

  const handleSort = useCallback((column: SortColumn) => {
    if (column === 'illustration') return; // Not sortable
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const handleWorkoutPress = useCallback((workoutId: string) => {
    router.push(`/workouts/${workoutId}`);
  }, []);

  const columns = React.useMemo((): ColumnDefinition<SortColumn>[] => [
    { 
      id: 'name', 
      label: t('workouts.name') || 'NAME', 
      width: 'flex-1', 
      align: 'left' 
    },
    { 
      id: 'sport', 
      label: t('workouts.sport') || 'SPORT', 
      width: isSmallScreen ? 'w-24' : 'w-32', 
      align: 'left' 
    },
    { 
      id: 'duration', 
      label: t('workouts.duration') || 'TIME', 
      width: 'w-20', 
      align: 'center' 
    },
    { 
      id: 'illustration', 
      label: t('workouts.structure') || 'STRUCTURE', 
      width: isSmallScreen ? 'w-32' : 'w-48', 
      align: 'right' 
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

  const renderWorkoutItem = useCallback(
    ({ item }: { item: Workout }) => (
      <TouchableOpacity
        className="bg-card border-b border-border active:bg-muted"
        onPress={() => handleWorkoutPress(item.id)}
        activeOpacity={0.7}
      >
        <View className="flex-row px-2 py-3 items-center">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <View className={isSmallScreen ? 'w-24' : 'w-32'}>
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {getSportTranslation(item.sport, t)}
            </Text>
          </View>
          <View className="w-20">
            <Text className="text-sm text-foreground text-center">
              {item.workout_minutes} min
            </Text>
          </View>
          <View className={`${isSmallScreen ? 'w-32' : 'w-48'} justify-end items-end pl-2`}>
            <WorkoutIllustration 
              workoutText={item.workout_text} 
              height={24} 
              style={{ width: '100%', maxWidth: 120, alignSelf: 'flex-end', borderRadius: 4 }}
            />
          </View>
        </View>
      </TouchableOpacity>
    ),
    [handleWorkoutPress, isSmallScreen, t]
  );

  const renderEmptyState = () => (
    <View className="flex-1 justify-center items-center px-8 py-16">
      <Text className="text-lg font-semibold text-foreground mb-2 text-center">
        {t("workouts.noWorkouts")}
      </Text>
      <Text className="text-sm text-muted-foreground text-center leading-5">
        {t("workouts.noWorkoutsDescription")}
      </Text>
    </View>
  );

  const renderFooter = () => {
    if (!isFetching) return null;
    return (
      <View className="p-4 items-center">
        <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#ECEDEE' : '#11181C'} />
      </View>
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={colorScheme === 'dark' ? '#ECEDEE' : '#11181C'} />
          <Text className="text-base text-muted-foreground mt-3">
            {t("workouts.loadingWorkouts")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      
      {!isSmallScreen && (
        <View className="bg-card border-b border-border">
          <View className="flex-row items-center justify-between px-6 py-4">
            <Text className="text-2xl font-bold text-foreground">
              {t("workouts.title")}
            </Text>
            {/* <TouchableOpacity
              onPress={() => router.push("/workouts/create")}
              className="bg-primary px-4 py-2 rounded-lg"
            >
              <Text className="text-primary-foreground font-semibold">
                + {t("common.add") || "Add"}
              </Text>
            </TouchableOpacity> */}
          </View>
        </View>
      )}

      <ListFilters
        sportFilter={sportFilter}
        onSportFilterChange={setSportFilter}
        uniqueSports={uniqueSports}
        // Date filter is not applicable for workouts library usually
      />

      <FlatList
        data={filteredWorkouts}
        renderItem={renderWorkoutItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={colorScheme === "dark" ? "#ECEDEE" : "#11181C"}
          />
        }
      />

      {/* {isSmallScreen && (
        <TouchableOpacity
          onPress={() => router.push("/workouts/create")}
          className="absolute bottom-6 right-6 h-14 w-14 rounded-full bg-primary flex items-center justify-center shadow-lg z-50"
          activeOpacity={0.8}
        >
          <Text className="text-primary-foreground text-3xl font-light pb-1">+</Text>
        </TouchableOpacity>
      )} */}
    </View>
  );
}
