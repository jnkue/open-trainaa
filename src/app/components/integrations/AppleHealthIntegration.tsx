import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useAppleHealthIntegration } from "@/hooks/useAppleHealthIntegration";

const appleHealthIcon = require("@/assets/images/apple_health.png");

export function AppleHealthIntegration() {
  const { t } = useTranslation();
  const {
    isAvailable,
    authorized,
    loading,
    error,
    isSyncing,
    connecting,
    lastSyncCount,
    lastSyncTime,
    handleConnect,
    handleDisconnect,
  } = useAppleHealthIntegration();

  if (Platform.OS !== "ios" || !isAvailable) return null;

  if (loading) {
    return (
      <View className="pt-5 border-border mb-3">
        <ActivityIndicator size="small" className="text-foreground" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="pt-5 border-border mb-3">
        <View className="border border-destructive/50 bg-destructive/10 rounded-lg p-3">
          <View className="flex-row items-center gap-2 mb-1">
            <Image source={appleHealthIcon} style={{ width: 18, height: 18 }} resizeMode="contain" />
            <Text className="text-sm font-medium text-destructive">
              Apple Health
            </Text>
          </View>
          <Text className="text-xs text-destructive/80 ml-7">{error}</Text>
        </View>
      </View>
    );
  }

  if (authorized) {
    return (
      <View className="pt-5 border-border mb-3">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full bg-green-500" />
            <Image source={appleHealthIcon} style={{ width: 20, height: 20 }} resizeMode="contain" />
            <Text className="text-base font-medium text-foreground">
              Apple Health
            </Text>
            {isSyncing && (
              <ActivityIndicator size="small" className="text-foreground ml-1" />
            )}
          </View>
          <TouchableOpacity
            className="bg-secondary rounded-lg px-3 py-1.5"
            onPress={handleDisconnect}
          >
            <Text className="text-secondary-foreground text-xs font-medium">
              {t("settings.disconnect")}
            </Text>
          </TouchableOpacity>
        </View>

        {isSyncing && (
          <Text className="text-xs text-muted-foreground">
            {t("integrations.appleHealth.importing")}
          </Text>
        )}

        {!isSyncing && lastSyncCount !== null && lastSyncCount > 0 && (
          <Text className="text-xs text-muted-foreground">
            {t("integrations.appleHealth.importSuccess", { count: lastSyncCount })}
          </Text>
        )}

        {!isSyncing && lastSyncCount === 0 && (
          <Text className="text-xs text-muted-foreground">
            {t("integrations.appleHealth.noWorkoutsFound")}
          </Text>
        )}

        {!isSyncing && lastSyncTime && (
          <Text className="text-xs text-muted-foreground mt-1">
            {t("integrations.appleHealth.lastSynced", { time: lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="pt-5 border-border mb-3">
      <TouchableOpacity
        className={`border border-border rounded-xl px-4 py-3 ${connecting ? "opacity-50" : "active:opacity-70"}`}
        onPress={handleConnect}
        disabled={connecting}
      >
        {connecting ? (
          <View className="flex-row items-center justify-center gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-foreground font-medium">{t("settings.connecting")}</Text>
          </View>
        ) : (
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-3">
              <Image source={appleHealthIcon} style={{ width: 28, height: 28 }} resizeMode="contain" />
              <View className="flex-1">
                <Text className="text-base font-medium text-foreground">Apple Health</Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={3}>{t("integrations.appleHealth.syncDescription")}</Text>
              </View>
            </View>
            <Text className="text-xs font-medium text-primary ml-3 shrink-0">{t("settings.connect")}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
