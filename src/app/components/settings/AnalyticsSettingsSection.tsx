import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "./SettingsSection";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";

export function AnalyticsSettingsSection() {
	const { t } = useTranslation();
	const { consent, isLoading, saveConsent } = useAnalyticsConsent();

	if (isLoading) return null;

	return (
		<SettingsSection title={t("analytics.settingsTitle")}>
			<View className="flex-row items-center justify-between">
				<View className="flex-1 mr-4">
					<Text className="text-base text-foreground font-medium">
						{t("analytics.settingsLabel")}
					</Text>
					<Text className="text-sm text-muted-foreground mt-1">
						{t("analytics.settingsDescription")}
					</Text>
				</View>
				<Switch
					checked={consent === true}
					onCheckedChange={saveConsent}
				/>
			</View>
		</SettingsSection>
	);
}
