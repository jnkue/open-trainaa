import React, {useCallback, useState} from "react";
import {View, Text, ScrollView, RefreshControl} from "react-native";
import {UserInfoSection} from "@/components/UserInfoSection";
import {ProviderIntegrationsSection} from "@/components/ProviderIntegrationsSection";

import {AccountSection} from "@/components/AccountSection";
import {SubscriptionSection} from "@/components/SubscriptionSection";
import {AnalyticsSettingsSection} from "@/components/settings/AnalyticsSettingsSection";
import {ApiKeySection} from "@/components/settings/ApiKeySection";

import {useTranslation} from "react-i18next";
import {useRevenueCat} from "@/contexts/RevenueCatContext";
import {useTheme} from "@/contexts/ThemeContext";

function SectionGroupHeader({title}: {title: string}) {
	return (
		<Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2 mt-6">
			{title}
		</Text>
	);
}

export default function SettingsScreen() {
	const {t} = useTranslation();
	const {refreshCustomerInfo} = useRevenueCat();
	const {colorScheme} = useTheme();
	const [refreshing, setRefreshing] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await refreshCustomerInfo();
			setRefreshKey((k) => k + 1);
		} finally {
			setRefreshing(false);
		}
	}, [refreshCustomerInfo]);

	return (
		<View className="flex-1 bg-background">
			{/* Header for large screens */}
			<View className="hidden md:flex px-6 py-4 bg-card border-b border-border">
				<View className="max-w-3xl xl:max-w-7xl mx-auto w-full">
					<Text className="text-2xl font-bold text-foreground">{t("settings.title")}</Text>
				</View>
			</View>

			<ScrollView
				className="flex-1"
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={colorScheme === "dark" ? "#ECEDEE" : "#11181C"}
					/>
				}
			>
				<View key={refreshKey} className="max-w-3xl xl:max-w-7xl mx-auto w-full p-4 md:p-6">

					{/* Account */}
					<SectionGroupHeader title={t("settings.sectionAccount")} />
					<UserInfoSection />

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
