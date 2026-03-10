import React from "react";
import {View, Text} from "react-native";
import {useTranslation} from "react-i18next";
import {Switch} from "@/components/ui/switch";
import {SettingsSection} from "./SettingsSection";
import {useNotificationPreferences} from "@/hooks/useNotificationPreferences";

export function NotificationSettingsSection() {
	const {t} = useTranslation();
	const {
		feedbackEnabled,
		dailyOverviewEnabled,
		isLoading,
		saveFeedbackPreference,
		saveDailyOverviewPreference,
	} = useNotificationPreferences();

	if (isLoading) return null;

	return (
		<SettingsSection>
			<View className="flex-row items-center justify-between mb-4">
				<View className="flex-1 mr-4">
					<Text className="text-base text-foreground font-medium">
						{t("notifications.feedbackLabel")}
					</Text>
					<Text className="text-sm text-muted-foreground mt-1">
						{t("notifications.feedbackDescription")}
					</Text>
				</View>
				<Switch
					checked={feedbackEnabled}
					onCheckedChange={saveFeedbackPreference}
				/>
			</View>

			<View className="border-t border-border/50 my-2" />

			<View className="flex-row items-center justify-between mt-2">
				<View className="flex-1 mr-4">
					<Text className="text-base text-foreground font-medium">
						{t("notifications.dailyOverviewLabel")}
					</Text>
					<Text className="text-sm text-muted-foreground mt-1">
						{t("notifications.dailyOverviewDescription")}
					</Text>
				</View>
				<Switch
					checked={dailyOverviewEnabled}
					onCheckedChange={saveDailyOverviewPreference}
				/>
			</View>
		</SettingsSection>
	);
}
