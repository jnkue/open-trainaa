import React from "react";
import {View, Text} from "react-native";
import {useTranslation} from "react-i18next";
//import {StravaIntegration} from "./integrations/StravaIntegration";
import { WahooIntegration } from "./integrations/WahooIntegration";
import { GarminIntegration } from "./integrations/GarminIntegration";
import {SettingsSection} from "@/components/settings/SettingsSection";

export function ProviderIntegrationsSection() {
	const {t} = useTranslation();

	return (
		<SettingsSection 
			title={t("settings.integrations")} 
			description="Sync your activities and workouts"
		>
			{/* Strava */}
			{/*<StravaIntegration /> */}

			{/* Wahoo */}
			<WahooIntegration />

			{/* Garmin */}
			<GarminIntegration />

			{/* More integrations coming soon */}
			<View className="mt-3 pt-5 border-t border-border">
				<View className="flex-row items-center justify-center py-6">
					<Text className="text-base text-muted-foreground italic">{t("settings.moreIntegrationsComingSoon")}</Text>
				</View>
			</View>
		</SettingsSection>
	);
}
