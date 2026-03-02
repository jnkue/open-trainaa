import React, {useState} from "react";
import {View, Text, Pressable, Platform, Alert} from "react-native";
import {Link} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {useRevenueCat} from "@/contexts/RevenueCatContext";
import {useTranslation} from "react-i18next";
import {showAlert} from "@/utils/alert";
import {APP_VERSION} from "@/constants/version";
import {SettingsSection} from "@/components/settings/SettingsSection";

export function AccountSection() {
	const {signOut, deleteAccount} = useAuth();
	const {isProSubscriber, subscriptionStore} = useRevenueCat();
	const {t} = useTranslation();
	const [isDeleting, setIsDeleting] = useState(false);

	// Helper to get the subscription store type (normalized)
	const getSubscriptionStore = (): 'web' | 'app_store' | 'play_store' | 'none' => {
		if (!subscriptionStore) return 'none';
		// Normalize store names: stripe/rc_billing -> web
		const storeLower = subscriptionStore.toLowerCase();
		if (storeLower === 'stripe' || storeLower === 'rc_billing') return 'web';
		if (storeLower === 'app_store') return 'app_store';
		if (storeLower === 'play_store') return 'play_store';
		return 'none';
	};

	const handleSignOut = async () => {
		console.log("handleSignOut called - performing immediate signOut");
		try {
			await signOut();
			console.log("signOut completed successfully");
			// Don't manually redirect - let the auth state change handler in index.tsx handle it
			// This ensures the user state is properly cleared before navigation
		} catch (error) {
			console.error("Error signing out:", error);
			showAlert(t("errors.error"), t("settings.signOutError"));
		}
	};

	const handleDeleteAccount = async () => {
		try {
			// Build the confirmation message based on subscription status
			let message = t("settings.deleteAccountMessage");

			// Check subscription store type to show appropriate warning
			if (isProSubscriber) {
				// Use the helper function to get store type without triggering cancellation
				const storeType = getSubscriptionStore();

				// Show appropriate warning based on store type
				if (storeType === 'web') {
					message += "\n\n" + t("settings.deleteAccountWithSubscriptionWeb");
				} else if (storeType === 'app_store') {
					message += "\n\n" + t("settings.deleteAccountWithSubscriptionAppStore");
				} else if (storeType === 'play_store') {
					message += "\n\n" + t("settings.deleteAccountWithSubscriptionPlayStore");
				}
			}

			// Show platform-specific confirmation dialog
			if (Platform.OS === "web") {
				const confirmed = window.confirm(
					t("settings.deleteAccountTitle") + "\n\n" + message
				);
				if (!confirmed) return;
			} else {
				// Use React Native Alert for mobile
				await new Promise<void>((resolve, reject) => {
					Alert.alert(
						t("settings.deleteAccountTitle"),
						message,
						[
							{
								text: t("common.cancel"),
								style: "cancel",
								onPress: () => reject(new Error("User cancelled")),
							},
							{
								text: t("settings.deleteAccount"),
								style: "destructive",
								onPress: () => resolve(),
							},
						],
						{ cancelable: true, onDismiss: () => reject(new Error("User cancelled")) }
					);
				});
			}

			setIsDeleting(true);

			// Note: Stripe subscription cancellation is handled by the backend during account deletion
			// We don't need to manually cancel it here or open the Customer Portal

			// Delete the account (backend will handle subscription cancellation)
			await deleteAccount();

			// Show success message (though the user will likely be redirected)
			showAlert(
				t("settings.deleteAccountSuccess"),
				t("settings.deleteAccountSuccessMessage")
			);
		} catch (error: any) {
			console.error("Error deleting account:", error);

			// Don't show error if user cancelled
			if (error?.message === "User cancelled") {
				return;
			}

			setIsDeleting(false);
			showAlert(t("errors.error"), t("settings.deleteAccountError"));
		}
	};

	return (
		<>
			{/* Sign Out Section */}
			<SettingsSection>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("settings.signOut")}
					className="bg-destructive rounded-lg py-3 px-4 active:opacity-80"
					onPress={handleSignOut}
				>
					<Text className="text-destructive-foreground font-medium text-center">{t("settings.signOut")}</Text>
				</Pressable>


			</SettingsSection>

			{/* Danger Zone - Delete Account */}
			<SettingsSection title={t("settings.dangerZone")} className="border-destructive/30">
					<Text className="text-sm text-muted-foreground mb-4 leading-5">
						{t("settings.dangerZoneWarning")}
					</Text>

					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("settings.deleteAccount")}
						className="border-2 border-destructive/50 rounded-lg py-3 px-4 active:bg-destructive/10"
						onPress={handleDeleteAccount}
						disabled={isDeleting}
					>
						<Text className="text-destructive font-medium text-center">
							{isDeleting ? t("settings.deleting") : t("settings.deleteAccount")}
						</Text>
				</Pressable>
				
								{/* App Store Subscription Warning - shown regardless of current platform */}
				{isProSubscriber && getSubscriptionStore() === 'app_store' && (
					<View className="mt-3 p-3 bg-muted rounded-lg">
						<Text className="text-xs text-muted-foreground leading-5">
							{t("settings.manageSubscriptionAppStore")}
						</Text>
					</View>
				)}

				{/* Play Store Subscription Warning - shown regardless of current platform */}
				{isProSubscriber && getSubscriptionStore() === 'play_store' && (
					<View className="mt-3 p-3 bg-muted rounded-lg">
						<Text className="text-xs text-muted-foreground leading-5">
							{t("settings.manageSubscriptionPlayStore")}
						</Text>
					</View>
				)}
			</SettingsSection>

			{/* App Info */}
			<SettingsSection title={t("settings.aboutTrainaa")}>
				{/* Privacy, Terms, Imprint and License Links */}
				<View className="flex-row flex-wrap justify-between items-start gap-y-2 mb-4">
					<Link href="https://trainaa.com/privacy" target="_blank">
						<Text className="text-s text-foreground">{t("auth.privacy")}</Text>
					</Link>

					<Link href="https://trainaa.com/terms" target="_blank">
						<Text className="text-s text-foreground">{t("auth.terms")}</Text>
					</Link>

					<Link href="https://trainaa.com/imprint" target="_blank">
						<Text className="text-s text-foreground">{t("auth.imprint")}</Text>
					</Link>

					<Link href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank">
						<Text className="text-s text-foreground">{t("auth.licenseAgreement")}</Text>
					</Link>
				</View>

				<Text className="text-xs text-muted-foreground ">
					{t("settings.version")} {APP_VERSION}
					{"\n"}{t("settings.allRightsReserved")}
				</Text>
			</SettingsSection>
		</>
	);
}
