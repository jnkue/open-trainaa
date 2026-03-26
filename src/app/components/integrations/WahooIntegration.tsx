import React, {useState} from "react";
import {View, Text, TouchableOpacity, ActivityIndicator, Image, Platform} from "react-native";
import {useWahooIntegration} from "@/hooks/useWahooIntegration";
import {useTranslation} from "react-i18next";
import {Switch} from "@/components/ui/switch";
import {showAlert} from "@/utils/alert";
import {apiClient} from "@/services/api";
import {useTheme} from "@/contexts/ThemeContext";

export function WahooIntegration() {
	const {
		wahooStatus,
		loading: wahooLoading,
		error: wahooError,
		connecting: wahooConnecting,
		handleConnectWahoo,
		handleDisconnectWahoo,
		updateWahooSettings,
	} = useWahooIntegration();
	const {t} = useTranslation();
	const {isDark} = useTheme();
	const [updatingWahooSettings, setUpdatingWahooSettings] = useState(false);

/* 	const handleSyncWorkouts = async () => {
		setSyncing(true);
		try {
			await syncWorkouts();
		} finally {
			setSyncing(false);
		}
	}; */

	const handleUploadWorkoutsToggle = async (value: boolean) => {
		// Check if user has required permissions: workouts_write AND plans_write
		const hasPermissions = wahooStatus?.data?.has_workouts_write && wahooStatus?.data?.has_plans_write;

		if (value && !hasPermissions) {
			// Need to re-authorize with required scopes
			const message = "To upload workouts, you need to grant 'workouts_write' and 'plans_write' permissions. Would you like to reconnect your Wahoo account?";

			const reconnectWahoo = async () => {
				try {
					// Disconnect old token first
					await apiClient.disconnectWahoo();
					// Then reconnect with new permissions
					await handleConnectWahoo();
				} catch (error) {
					console.error("Error reconnecting Wahoo:", error);
					showAlert("Error", "Failed to reconnect Wahoo account.");
				}
			};

			if (Platform.OS === "web") {
				const confirmed = window.confirm(message);
				if (confirmed) {
					await reconnectWahoo();
				}
			} else {
				showAlert(
					"Reconnect Required",
					message,
					[
						{text: t("common.cancel"), style: "cancel"},
						{
							text: "Reconnect",
							onPress: reconnectWahoo,
						},
					]
				);
			}
		} else {
			// Permissions are sufficient, update the setting
			setUpdatingWahooSettings(true);
			try {
				await updateWahooSettings(value, wahooStatus?.data?.download_activities_enabled || false);
			} finally {
				setUpdatingWahooSettings(false);
			}
		}
	};

	const handleDownloadActivitiesToggle = async (value: boolean) => {
		// Check if user has required permission: workouts_read
		const hasPermission = wahooStatus?.data?.has_workouts_read;

		if (value && !hasPermission) {
			// Need to re-authorize with required scope
			const message = "To download activities, you need to grant 'workouts_read' permission. Would you like to reconnect your Wahoo account?";

			const reconnectWahoo = async () => {
				try {
					// Disconnect old token first
					await apiClient.disconnectWahoo();
					// Then reconnect with new permissions
					await handleConnectWahoo();
				} catch (error) {
					console.error("Error reconnecting Wahoo:", error);
					showAlert("Error", "Failed to reconnect Wahoo account.");
				}
			};

			if (Platform.OS === "web") {
				const confirmed = window.confirm(message);
				if (confirmed) {
					await reconnectWahoo();
				}
			} else {
				showAlert(
					"Reconnect Required",
					message,
					[
						{text: t("common.cancel"), style: "cancel"},
						{
							text: "Reconnect",
							onPress: reconnectWahoo,
						},
					]
				);
			}
		} else {
			// Permission is sufficient, update the setting
			setUpdatingWahooSettings(true);
			try {
				await updateWahooSettings(wahooStatus?.data?.upload_workouts_enabled || false, value);
			} finally {
				setUpdatingWahooSettings(false);
			}
		}
	};

	return (
		<View className="pt-5 border-border mb-3">
			{wahooLoading ? (
				<ActivityIndicator size="small" className="text-foreground" />
			) : wahooError ? (
				<View className="border border-destructive/50 bg-destructive/10 rounded-lg p-3">
					<View className="flex-row items-center gap-2 mb-1">
						<View className="w-2 h-2 rounded-full bg-destructive" />
						<Text className="text-sm font-medium text-destructive">Wahoo</Text>
					</View>
					<Text className="text-xs text-destructive/80 ml-4">Error loading status: {wahooError}</Text>
				</View>
			) : wahooStatus?.success && wahooStatus?.data?.connected ? (
				<>
					{wahooStatus.data.needs_reauth && (
						<View className="border border-destructive/50 bg-destructive/10 rounded-lg p-3 mb-3">
							<Text className="text-sm font-medium text-destructive mb-1">
								{t("integrations.wahoo.reauthRequired")}
							</Text>
							<Text className="text-xs text-destructive/80 mb-2">
								{t("integrations.wahoo.reauthMessage")}
							</Text>
							<TouchableOpacity
								className="bg-destructive rounded-lg px-3 py-1.5 self-start"
								onPress={async () => {
									await handleDisconnectWahoo();
									await handleConnectWahoo();
								}}
							>
								<Text className="text-white text-xs font-medium">
									{t("integrations.wahoo.reconnect")}
								</Text>
							</TouchableOpacity>
						</View>
					)}
					<View className="flex-row items-center justify-between mb-3">
						<View className="flex-row items-center gap-2">
							<View className="w-2 h-2 rounded-full bg-green-500" />
							<Image
								source={require("@/assets/images/wahoo/wahoo_logo_small_black.png")}
								style={{width: 20, height: 20, borderRadius: 4, tintColor: isDark ? "#ffffff" : "#000000"}}
								resizeMode="contain"
							/>
							<Text className="text-base font-medium text-foreground">Wahoo</Text>
						</View>
						<TouchableOpacity className="bg-secondary rounded-lg px-3 py-1.5" onPress={handleDisconnectWahoo}>
							<Text className="text-secondary-foreground text-xs font-medium">{t("settings.disconnect")}</Text>
						</TouchableOpacity>
					</View>

					<View className="w-full space-y-3 mt-4 bg-secondary/30 rounded-lg p-3">
						<View className="flex-row items-center justify-between">
							<Text className="text-sm text-foreground">{t("integrations.wahoo.uploadWorkouts")}</Text>
							<Switch
								checked={wahooStatus.data.upload_workouts_enabled || false}
								onCheckedChange={handleUploadWorkoutsToggle}
								disabled={updatingWahooSettings }
							/>
						</View>
						<View className="flex-row items-center justify-between mt-3">
							<Text className="text-sm text-foreground">{t("integrations.wahoo.downloadActivities")}</Text>
							<Switch
								checked={wahooStatus.data.download_activities_enabled ?? true}
								onCheckedChange={handleDownloadActivitiesToggle}
								disabled={updatingWahooSettings }
							/>
						</View>
					</View>

					{/* Sync button - only show if upload is enabled */}
	{/* 				{wahooStatus.data.upload_workouts_enabled && (
						<TouchableOpacity
							className={`mt-3 bg-primary rounded-lg px-4 py-2.5 ${syncing ? "opacity-50" : "active:opacity-70"}`}
							onPress={handleSyncWorkouts}
							disabled={syncing}
						>
							<View className="flex-row items-center justify-center gap-2">
								{syncing && <ActivityIndicator size="small" color="#fff" />}
								<Text className="text-primary-foreground text-sm font-medium">
									{syncing ? t("integrations.wahoo.syncing") : t("integrations.wahoo.syncWorkoutsNow")}
								</Text>
							</View>
						</TouchableOpacity>
					)} */}
				</>
			) : (
				<TouchableOpacity
					className={`border border-border rounded-xl px-4 py-3 ${wahooConnecting ? "opacity-50" : "active:opacity-70"}`}
					onPress={handleConnectWahoo}
					disabled={wahooConnecting}
				>
					{wahooConnecting ? (
						<View className="flex-row items-center justify-center gap-2">
							<ActivityIndicator size="small" />
							<Text className="text-foreground font-medium">{t("settings.connecting")}</Text>
						</View>
					) : (
						<View className="flex-row items-center justify-between">
							<View className="flex-1 flex-row items-center gap-3">
								<Image
									source={require("@/assets/images/wahoo/wahoo_logo_small_black.png")}
									style={{width: 28, height: 28, tintColor: isDark ? "#ffffff" : "#000000"}}
									resizeMode="contain"
								/>
								<View className="flex-1">
									<Text className="text-base font-medium text-foreground">Wahoo</Text>
									<Text className="text-xs text-muted-foreground" numberOfLines={3}>{t("integrations.wahoo.syncDescription")}</Text>
								</View>
							</View>
							<Text className="text-xs font-medium text-primary ml-3 shrink-0">{t("settings.connect")}</Text>
						</View>
					)}
				</TouchableOpacity>
			)}
		</View>
	);
}
