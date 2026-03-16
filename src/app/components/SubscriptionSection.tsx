import React, {useState} from "react";
import {View, Text, TouchableOpacity, ActivityIndicator, Platform, Linking} from "react-native";
import {useRevenueCat} from "@/contexts/RevenueCatContext";
import {useTranslation} from "react-i18next";
import {format} from "date-fns";
import Purchases from "react-native-purchases";
import {showAlert} from "@/utils/alert";
import {SettingsSection} from "@/components/settings/SettingsSection";

export function SubscriptionSection() {
	const {isProSubscriber, customerInfo, purchasePackage, showPaywall, cancelSubscription, loading} = useRevenueCat();
	const {t} = useTranslation();
	const [purchasing, setPurchasing] = useState(false);

	const handleSubscribe = async () => {
		console.log("=== handleSubscribe called ===");
		console.log("Platform.OS:", Platform.OS);

		try {
			setPurchasing(true);

			if (Platform.OS === "web") {
				// Web platform: Use Stripe Checkout directly (no offerings needed)
				console.log("Web: Initiating Stripe Checkout...");

				// Call purchasePackage with null - it will handle Stripe redirect
				await purchasePackage(null);

				// Note: User will be redirected to Stripe Checkout
				// After payment, they'll return and entitlement will sync automatically
				console.log("Web: User redirected to Stripe Checkout");
			} else {
				// iOS/Android: Show RevenueCat paywall (uses default offering)
				console.log("iOS/Android: Showing RevenueCat paywall");
				const purchased = await showPaywall();

				if (purchased) {
					showAlert(
						t("subscription.title"),
						t("subscription.restoreSuccessMessage")
					);
				}
			}
		} catch (error: any) {
			console.error("Error during subscription purchase:", error);
			console.error("Error details:", JSON.stringify(error, null, 2));

			// Check if user cancelled
			if (error.userCancelled) {
				console.log("User cancelled purchase");
				return;
			}

			showAlert(
				t("common.error"),
				error.message || t("subscription.manageSubscriptionError")
			);
		} finally {
			console.log("Setting purchasing to false");
			setPurchasing(false);
		}
	};

	const handleManageSubscription = async () => {
		console.log("=== handleManageSubscription called ===");
		console.log("Platform.OS:", Platform.OS);

		try {
			const result = await cancelSubscription();

			// Stripe subscription - portal already opened by cancelSubscription
			if (result.store === 'stripe') {
				if (result.success) {
					console.log("Stripe Customer Portal opened successfully");
				} else {
					showAlert(t("common.error"), t("subscription.manageSubscriptionError"));
				}
				return;
			}

			// App Store subscription
			if (result.store === 'app_store') {
				if (Platform.OS === 'ios') {
					// On iOS, use native subscription management
					console.log("iOS: Opening native subscription management");
					await Purchases.showManageSubscriptions();
				} else {
					// On other platforms, show message to manage on iOS
					showAlert(
						t("subscription.manageSubscription"),
						t("settings.manageSubscriptionAppStore")
					);
				}
				return;
			}

			// Play Store subscription
			if (result.store === 'play_store') {
				if (Platform.OS === 'android') {
					// On Android, use native subscription management
					await Linking.openURL("https://play.google.com/store/account/subscriptions?package=com.pacerchat.app");
				} else {
					// On other platforms, show message to manage on Android
					showAlert(
						t("subscription.manageSubscription"),
						t("settings.manageSubscriptionPlayStore")
					);
				}
				return;
			}

			// No subscription found
			showAlert(
				t("subscription.manageSubscription"),
				t("subscription.noActiveSubscription")
			);
		} catch (error) {
			console.error("Error managing subscription:", error);
			showAlert(t("common.error"), t("subscription.manageSubscriptionError"));
		}
	};

	if (loading) {
		return (
			<SettingsSection>
				<ActivityIndicator size="small" />
			</SettingsSection>
		);
	}

	const proEntitlement = customerInfo?.entitlements.active["PRO"];
	const expirationDate = proEntitlement?.expirationDate;
	const willRenew = proEntitlement?.willRenew;

	return (
		<SettingsSection title={t("subscription.proMembershipName")}>
			{/* PRO Membership Description (for non-subscribers) */}
			{!isProSubscriber && (
				<View className="mb-4 p-3 rounded-lg bg-muted/30">
					<Text className="text-sm text-foreground">
						{t("subscription.proMembershipBenefit")}
					</Text>
				</View>
			)}

			{/* Subscription Status */}
			<View className="mb-4">
				<View className="flex-row items-center justify-between p-3 rounded-lg bg-muted/30 mb-2">
					<Text className="text-base text-foreground">
						{t("subscription.status")}
					</Text>
					<View
						className={`px-3 py-1 rounded-full ${
							isProSubscriber ? "bg-green-500/20" : "bg-muted"
						}`}
					>
						<Text
							className={`text-sm font-semibold ${
								isProSubscriber ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
							}`}
						>
							{isProSubscriber ? t("subscription.active") : t("subscription.inactive")}
						</Text>
					</View>
				</View>

				{isProSubscriber && expirationDate && (
					<View className="flex-row items-center justify-between p-3 rounded-lg bg-muted/30">
						<Text className="text-base text-foreground">
							{willRenew ? t("subscription.renewsOn") : t("subscription.expiresOn")}
						</Text>
						<Text className="text-base text-foreground font-medium">
							{format(new Date(expirationDate), "MMM dd, yyyy")}
						</Text>
					</View>
				)}
			</View>

			{/* Action Buttons */}
			<View className="space-y-2">
				<TouchableOpacity
					onPress={isProSubscriber ? handleManageSubscription : handleSubscribe}
					disabled={purchasing}
					className="bg-primary rounded-lg py-3 px-4 active:opacity-80"
				>
					{purchasing ? (
						<ActivityIndicator size="small" color="#ffffff" />
					) : (
						<Text className="text-primary-foreground font-medium text-center">
							{isProSubscriber
								? t("subscription.manageSubscription")
								: t("subscription.subscribe")}
						</Text>
					)}
				</TouchableOpacity>
			</View>
		</SettingsSection>
	);
}
