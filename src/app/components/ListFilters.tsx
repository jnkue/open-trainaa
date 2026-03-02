import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { getSportTranslation } from "@/utils/formatters";

export interface FilterOption {
  key: string;
  label: string;
}

interface ListFiltersProps {
  sportFilter: string;
  onSportFilterChange: (sport: string) => void;
  uniqueSports: string[];
  dateFilter?: string;
  onDateFilterChange?: (date: string) => void;
  showDateFilter?: boolean;
}

export const ListFilters = ({
  sportFilter,
  onSportFilterChange,
  uniqueSports,
  dateFilter,
  onDateFilterChange,
  showDateFilter = false,
}: ListFiltersProps) => {
  const { t } = useTranslation();

  const dateOptions: FilterOption[] = [
    { key: "all", label: t("activities.all") },
    { key: "week", label: t("activities.days7") },
    { key: "month", label: t("activities.days30") },
    { key: "3months", label: t("activities.months3") },
  ];

  return (
    <View className="bg-card border-b border-border px-4 py-3">
      <View className="flex-row space-x-4">
        <View className="flex-1">
          <Text className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            {t("activities.sport")}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              <TouchableOpacity
                className={`px-3 py-1.5 rounded-full border ${
                  sportFilter === "all"
                    ? "bg-primary border-primary"
                    : "bg-background border-border"
                }`}
                onPress={() => onSportFilterChange("all")}
              >
                <Text
                  className={`text-xs font-medium ${
                    sportFilter === "all"
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {t("activities.all")}
                </Text>
              </TouchableOpacity>
              {uniqueSports.map((sport) => (
                <TouchableOpacity
                  key={sport}
                  className={`px-3 py-1.5 rounded-full border ${
                    sportFilter === sport
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  }`}
                  onPress={() => onSportFilterChange(sport)}
                >
                  <Text
                    className={`text-xs font-medium ${
                      sportFilter === sport
                        ? "text-primary-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {getSportTranslation(sport, t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {showDateFilter && dateFilter && onDateFilterChange && (
          <View className="flex-1">
            <Text className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              {t("activities.timeRange")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {dateOptions.map((period) => (
                  <TouchableOpacity
                    key={period.key}
                    className={`px-3 py-1.5 rounded-full border ${
                      dateFilter === period.key
                        ? "bg-primary border-primary"
                        : "bg-background border-border"
                    }`}
                    onPress={() => onDateFilterChange(period.key)}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        dateFilter === period.key
                          ? "text-primary-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {period.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
};
