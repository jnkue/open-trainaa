import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

export type SortDirection = "asc" | "desc";

export interface ColumnDefinition<T extends string> {
  id: T;
  label: string; // Translation key or direct string
  width?: string; // Tailwind width class e.g. "w-20"
  hideOnSmallScreen?: boolean;
  align?: "left" | "center" | "right";
}

interface ListHeaderProps<T extends string> {
  columns: ColumnDefinition<T>[];
  sortColumn: T;
  sortDirection: SortDirection;
  onSort: (column: T) => void;
  screenWidth: number;
}

export function ListHeader<T extends string>({
  columns,
  sortColumn,
  sortDirection,
  onSort,
  screenWidth,
}: ListHeaderProps<T>) {
  const isSmallScreen = screenWidth < 768;

  return (
    <View className="bg-muted border-b border-border">
      <View className="flex-row px-2 py-3">
        {columns.map((column) => {
          if (isSmallScreen && column.hideOnSmallScreen) {
            return null;
          }

          const alignClass =
            column.align === "center"
              ? "justify-center"
              : column.align === "right"
              ? "justify-end"
              : "justify-start";

          return (
            <TouchableOpacity
              key={column.id}
              className={`px-1 ${column.width || "flex-1"}`}
              onPress={() => onSort(column.id)}
            >
              <View className={`flex-row items-center ${alignClass}`}>
                <Text
                  className="text-xs font-bold text-foreground uppercase tracking-wide"
                  numberOfLines={1}
                >
                  {column.label}
                </Text>
                {sortColumn === column.id && (
                  <Text className="ml-1 text-primary">
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
