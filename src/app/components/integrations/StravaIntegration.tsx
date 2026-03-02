import React from "react";
import {View, Text, TouchableOpacity, ActivityIndicator, Image, Platform} from "react-native";
import {useStravaIntegration} from "@/hooks/useStravaIntegration";
import {useUserAttributes} from "@/hooks/useUserAttributes";
import {useTranslation} from "react-i18next";
import {Switch} from "@/components/ui/switch";
import {showAlert} from "@/utils/alert";

export function StravaIntegration() {
	const {stravaStatus, loading, error: stravaError, connecting, handleConnectStrava, handleDisconnectStrava} = useStravaIntegration();
	const {attributes, handleChangeAttr} = useUserAttributes();
	const {t} = useTranslation();

	const handlePostFeedbackToggle = async (value: boolean) => {
		if (value && !stravaStatus?.data?.has_activity_write) {
			// Need to re-authorize with activity:write scope
			const message = t("integrations.strava.needWritePermission");

			if (Platform.OS === "web") {
				const confirmed = window.confirm(message);
				if (confirmed) {
					await handleConnectStrava();
				}
			} else {
				showAlert(
					t("integrations.strava.reconnectRequired"),
					message,
					[
						{text: t("common.cancel"), style: "cancel"},
						{
							text: t("integrations.strava.reconnect"),
							onPress: async () => {
								await handleConnectStrava();
							},
						},
					]
				);
			}
		} else {
			// Scope is sufficient, update the attribute
			handleChangeAttr("post_feedback_to_strava", value);
		}
	};

	return (
		<View className="mb-5">
			{loading ? (
				<ActivityIndicator size="small" className="text-foreground" />
			) : stravaError ? (
				<View className="border border-destructive/50 bg-destructive/10 rounded-lg p-3">
					<View className="flex-row items-center gap-2 mb-1">
						<View className="w-2 h-2 rounded-full bg-destructive" />
						<Text className="text-sm font-medium text-destructive">Strava</Text>
					</View>
					<Text className="text-xs text-destructive/80 ml-4">Error loading status: {stravaError}</Text>
				</View>
			) : stravaStatus?.success && stravaStatus?.data ? (
				<View>
					<View className="flex-row items-center justify-between mb-3">
						<View className="flex-row items-center gap-2">
							<View className="w-2 h-2 rounded-full bg-green-500" />
							<Text className="text-base font-medium text-foreground">Strava</Text>
						</View>
						<TouchableOpacity className="bg-secondary rounded-lg px-3 py-1.5" onPress={handleDisconnectStrava}>
							<Text className="text-secondary-foreground text-xs font-medium">{t("settings.disconnect")}</Text>
						</TouchableOpacity>
					</View>
					<Text className="text-xs text-muted-foreground ml-4 mb-3">Activities syncing automatically</Text>

					<View className="w-full mt-3 bg-secondary/30 rounded-lg p-3">
						<View className="flex-row items-center justify-between">
							<View className="flex-1 mr-3">
								<Text className="text-sm font-medium text-foreground">Post feedback to Strava</Text>
								<Text className="text-xs text-muted-foreground mt-1">Automatically add AI coaching feedback to your Strava activity descriptions</Text>
							</View>
							<Switch
								checked={attributes?.post_feedback_to_strava ?? false}
								onCheckedChange={handlePostFeedbackToggle}
							/>
						</View>
					</View>
				</View>
			) : (
				<TouchableOpacity
					className={`border-2 border-dashed border-border rounded-xl p-4 ${connecting ? "opacity-50" : "active:opacity-70"}`}
					onPress={handleConnectStrava}
					disabled={connecting}
				>
					{connecting ? (
						<View className="flex-row items-center justify-center gap-2">
							<ActivityIndicator size="small" />
							<Text className="text-foreground font-medium">{t("settings.connecting")}</Text>
						</View>
					) : (
						<View className="items-center">
							<Image
								source={require("@/assets/images/strava_buttons/btn_strava_connect_with_orange_x2.png")}
								style={{width: 193, height: 48}}
								resizeMode="contain"
							/>
						</View>
					)}
				</TouchableOpacity>
			)}
		</View>
	);
}
