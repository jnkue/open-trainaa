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

function SectionGroupHeader({title}: {title: string}) {
	return (
		<Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2 mt-6">
			{title}
		</Text>
	);
}

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

					{/* Account */}
					<SectionGroupHeader title={t("settings.sectionAccount")} />
					<UserInfoSection />

					{/* Training */}
					<SectionGroupHeader title={t("settings.sectionTraining")} />
					<UserAttributesSection />

					{/* Integrations */}
					<SectionGroupHeader title={t("settings.sectionIntegrations")} />
					<ProviderIntegrationsSection />

					{/* Subscription */}
					<SectionGroupHeader title={t("settings.sectionSubscription")} />
					<SubscriptionSection />

					{/* Advanced */}
					<SectionGroupHeader title={t("settings.sectionAdvanced")} />
					<ApiKeySection />

					{/* Privacy */}
					<SectionGroupHeader title={t("settings.sectionPrivacy")} />
					<AnalyticsSettingsSection />

					{/* About & Account Management */}
					<AccountSection />
				</View>
			</ScrollView>
		</View>
	);
}
