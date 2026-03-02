import React from "react";
import {View, Text, ScrollView} from "react-native";
import {UserInfoSection} from "@/components/UserInfoSection";
import {ProviderIntegrationsSection} from "@/components/ProviderIntegrationsSection";
import {UserAttributesSection} from "@/components/UserAttributesSection";
import {AccountSection} from "@/components/AccountSection";
import {SubscriptionSection} from "@/components/SubscriptionSection";
import {AnalyticsSettingsSection} from "@/components/settings/AnalyticsSettingsSection";
import {ApiKeySection} from "@/components/settings/ApiKeySection";

import {useTranslation} from "react-i18next";

export default function SettingsScreen() {
	const {t} = useTranslation();

	return (
		<View className="flex-1 bg-background">
			{/* Header for large screens */}
			<View className="hidden md:flex px-6 py-4 bg-card border-b border-border">
				<View className="max-w-3xl xl:max-w-7xl mx-auto w-full">
					<Text className="text-2xl font-bold text-foreground">{t("settings.title")}</Text>
				</View>
			</View>

			<ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
				<View className="max-w-3xl xl:max-w-7xl mx-auto w-full p-4 md:p-6">

					{/* Profile & Subscriptions */}
					<UserInfoSection />
					<SubscriptionSection />
					<ApiKeySection />

					{/* Integrations & Data */}
					<ProviderIntegrationsSection />
					<UserAttributesSection />
					<AnalyticsSettingsSection />

					{/* Account Management */}
					<AccountSection />
				</View>
			</ScrollView>
		</View>
	);
}
