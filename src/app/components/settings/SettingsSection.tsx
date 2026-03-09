import React from "react";
import { View, Text, ViewStyle } from "react-native";

interface SettingsSectionProps {
  title?: string;
  description?: string;
  rightElement?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  cardStyle?: ViewStyle;
}

export function SettingsSection({ title, description, rightElement, children, className, style, cardStyle }: SettingsSectionProps) {
  return (
    <View className={`mb-6 ${className}`} style={style}>
      <View className="bg-card rounded-xl border border-border overflow-hidden" style={cardStyle}>
        {(title || description || rightElement) && (
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/20">
            <View className="flex-1 mr-3">
              {title && <Text className="text-lg font-semibold text-foreground">{title}</Text>}
              {description && <Text className="text-sm text-muted-foreground mt-1">{description}</Text>}
            </View>
            {rightElement}
          </View>
        )}
        <View className="p-6">
          {children}
        </View>
      </View>
    </View>
  );
}
