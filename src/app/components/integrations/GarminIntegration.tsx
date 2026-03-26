import React from "react";
import {View, Text, TouchableOpacity, ActivityIndicator, Image, Platform} from "react-native";
import {useGarminIntegration} from "@/hooks/useGarminIntegration";
import {useTranslation} from "react-i18next";
import {Switch} from "@/components/ui/switch";
import {showAlert} from "@/utils/alert";
import {apiClient} from "@/services/api";

export function GarminIntegration() {
	const {
		garminStatus,
		loading: garminLoading,
		error: garminError,
		connecting: garminConnecting,
		handleConnectGarmin,
		handleDisconnectGarmin,
		updateGarminSettings,
	} = useGarminIntegration();
	const {t} = useTranslation();

/* 	const handleSyncGarminWorkouts = async () => {
		setGarminSyncing(true);
		try {
			await syncGarminWorkouts();
		} finally {
			setGarminSyncing(false);
		}
	};
 */
	const handleUploadToggle = async (value: boolean) => {
		const hasPermission = garminStatus?.data?.has_workout_import_permission ?? false;

		if (value && !hasPermission) {
			// Show alert with reconnect option when user tries to enable without permission
			const message = t("integrations.garmin.workoutImportPermissionMissing");

			const reconnectGarmin = async () => {
				try {
					// Disconnect old token first
					await apiClient.disconnectGarmin();
					// Then reconnect with new permissions
					await handleConnectGarmin();
				} catch (error) {
					console.error("Error reconnecting Garmin:", error);
					showAlert(t("common.error"), "Failed to reconnect Garmin account.");
				}
			};

			if (Platform.OS === "web") {
				const confirmed = window.confirm(message);
				if (confirmed) {
					await reconnectGarmin();
				}
			} else {
				showAlert(
					t("integrations.garmin.permissionRequired"),
					message,
					[
						{text: t("common.cancel"), style: "cancel"},
						{
							text: t("integrations.garmin.reconnect"),
							onPress: reconnectGarmin,
						},
					]
				);
			}
			return;
		}

		await updateGarminSettings(value, garminStatus?.data?.download_activities_enabled ?? true);
	};

	const handleDownloadToggle = async (value: boolean) => {
		const hasPermission = garminStatus?.data?.has_activity_export_permission ?? false;

		if (value && !hasPermission) {
			// Show alert with reconnect option when user tries to enable without permission
			const message = t("integrations.garmin.activityExportPermissionMissing");

			const reconnectGarmin = async () => {
				try {
					// Disconnect old token first
					await apiClient.disconnectGarmin();
					// Then reconnect with new permissions
					await handleConnectGarmin();
				} catch (error) {
					console.error("Error reconnecting Garmin:", error);
					showAlert(t("common.error"), "Failed to reconnect Garmin account.");
				}
			};

			if (Platform.OS === "web") {
				const confirmed = window.confirm(message);
				if (confirmed) {
					await reconnectGarmin();
				}
			} else {
				showAlert(
					t("integrations.garmin.permissionRequired"),
					message,
					[
						{text: t("common.cancel"), style: "cancel"},
						{
							text: t("integrations.garmin.reconnect"),
							onPress: reconnectGarmin,
						},
					]
				);
			}
			return;
		}

		await updateGarminSettings(garminStatus?.data?.upload_workouts_enabled ?? false, value);
	};

	return (
		<View className="pt-5 border-border mb-3">
			{garminLoading ? (
				<ActivityIndicator size="small" className="text-foreground" />
			) : garminError ? (
				<View className="border border-destructive/50 bg-destructive/10 rounded-lg p-3">
					<View className="flex-row items-center gap-2 mb-1">
						<View className="w-2 h-2 rounded-full bg-destructive" />
						<Text className="text-sm font-medium text-destructive">Garmin</Text>
					</View>
					<Text className="text-xs text-destructive/80 ml-4">Error loading status: {garminError}</Text>
				</View>
			) : garminStatus?.success && garminStatus?.data?.connected ? (
				<>
					<View className="flex-row items-center justify-between mb-3">
						<View className="flex-row items-center gap-2">
							<View className="w-2 h-2 rounded-full bg-green-500" />
							<Image
								source={require("@/assets/images/garmin/garmin_connect.png")}
								style={{width: 20, height: 20, borderRadius: 4}}
								resizeMode="contain"
							/>
							<Text className="text-base font-medium text-foreground">Garmin</Text>
						</View>
						<TouchableOpacity className="bg-secondary rounded-lg px-3 py-1.5" onPress={handleDisconnectGarmin}>
							<Text className="text-secondary-foreground text-xs font-medium">{t("settings.disconnect")}</Text>
						</TouchableOpacity>
					</View>

					<View className="w-full space-y-3 mt-4 bg-secondary/30 rounded-lg p-3">
						<View className="flex-row items-center justify-between">
							<Text className="text-sm text-foreground">{t("integrations.garmin.uploadWorkouts")}</Text>
							<Switch
								checked={garminStatus.data.upload_workouts_enabled || false}
								onCheckedChange={handleUploadToggle}
							/>
						</View>
						<View className="flex-row items-center justify-between mt-3">
							<Text className="text-sm text-foreground">{t("integrations.garmin.downloadActivities")}</Text>
							<Switch
								checked={garminStatus.data.download_activities_enabled ?? true}
								onCheckedChange={handleDownloadToggle}
							/>
						</View>
					</View>
				</>
			) : (
				<TouchableOpacity
					className={`border border-border rounded-xl px-4 py-3 ${garminConnecting ? "opacity-50" : "active:opacity-70"}`}
					onPress={handleConnectGarmin}
					disabled={garminConnecting}
				>
					{garminConnecting ? (
						<View className="flex-row items-center justify-center gap-2">
							<ActivityIndicator size="small" />
							<Text className="text-foreground font-medium">{t("settings.connecting")}</Text>
						</View>
					) : (
						<View className="flex-row items-center justify-between">
							<View className="flex-1 flex-row items-center gap-3">
								<Image
									source={require("@/assets/images/garmin/garmin_connect.png")}
									style={{width: 28, height: 28}}
									resizeMode="contain"
								/>
								<View className="flex-1">
									<Text className="text-base font-medium text-foreground">Garmin</Text>
									<Text className="text-xs text-muted-foreground" numberOfLines={3}>{t("integrations.garmin.syncDescription")}</Text>
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
