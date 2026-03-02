import { useState, useEffect } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/services/api";
import { useTranslation } from "react-i18next";
import { showAlert } from "@/utils/alert";

interface WahooStatus {
	success: boolean;
	data?: {
		connected: boolean;
		athlete_id?: string;
		expires_at?: string;
		is_expired?: boolean;
		upload_workouts_enabled?: boolean;
		download_activities_enabled?: boolean;
		has_workouts_write?: boolean;
		has_plans_write?: boolean;
		has_workouts_read?: boolean;
		needs_reauth?: boolean;
	};
}

export function useWahooIntegration() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const [wahooStatus, setWahooStatus] = useState<WahooStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);

	const loadWahooStatus = async () => {
		try {
			setError(null);
			const status = await apiClient.getWahooStatus();
			setWahooStatus(status);
		} catch (error) {
			console.error("Error loading Wahoo status:", error);
			setError(error instanceof Error ? error.message : String(error));
			setWahooStatus({ success: false });
		} finally {
			setLoading(false);
		}
	};

	const prefetchWahooAuthUrl = async () => {
		try {
			const redirectUri = Linking.createURL("connect-wahoo");
			const authResp = await apiClient.getWahooAuthUrl(redirectUri);
			const url = (authResp as any).authorize_url || (authResp as any).authorization_url;
			if (url) setAuthorizeUrl(url);
		} catch (error) {
			console.warn("Could not prefetch Wahoo auth url", error);
		}
	};

	const handleConnectWahoo = async () => {
		if (connecting) return;

		setConnecting(true);
		try {
			// Use prefetched URL to avoid popup being blocked by browser
			if (!authorizeUrl) {
				// fallback: try to fetch, but this may cause popup-block on some browsers
				const redirectUri = Linking.createURL("connect-wahoo");
				const authResp = await apiClient.getWahooAuthUrl(redirectUri);
				const fetched = (authResp as any).authorize_url || (authResp as any).authorization_url;
				if (fetched) setAuthorizeUrl(fetched);
				if (!fetched) throw new Error("No authorization URL received from backend");
			}

			const redirectUri = Linking.createURL("connect-wahoo");
			const result = await WebBrowser.openAuthSessionAsync(authorizeUrl || "", redirectUri);

			// On success or dismiss, refresh status
			if (result.type === "success" || result.type === "dismiss") {
				await loadWahooStatus();
			}
		} catch (error) {
			console.error("Error connecting to Wahoo:", error);
			showAlert("Error", "Failed to connect to Wahoo.");
		} finally {
			setConnecting(false);
		}
	};

	const handleDisconnectWahoo = async () => {
		if (Platform.OS === "web") {
			const confirmed = window.confirm(t("integrations.wahoo.disconnectMessage") || "Are you sure you want to disconnect Wahoo?");
			if (!confirmed) return;

			try {
				await apiClient.disconnectWahoo();
				showAlert(t("integrations.wahoo.disconnectSuccess") || "Wahoo connection has been disconnected.");
				await loadWahooStatus();
			} catch (error) {
				console.error("Error disconnecting Wahoo:", error);
				showAlert(t("integrations.wahoo.disconnectError") || "Failed to disconnect Wahoo.");
			}
		} else {
			showAlert(
				t("integrations.wahoo.disconnectTitle") || "Disconnect Wahoo",
				t("integrations.wahoo.disconnectMessage") || "Are you sure you want to disconnect Wahoo?",
				[
					{ text: t("integrations.wahoo.cancel") || "Cancel", style: "cancel" },
					{
						text: t("integrations.wahoo.disconnect") || "Disconnect",
						style: "destructive",
						onPress: async () => {
							try {
								await apiClient.disconnectWahoo();
								showAlert(t("common.ok") || "Success", t("integrations.wahoo.disconnectSuccess") || "Wahoo connection has been disconnected.");
								await loadWahooStatus();
							} catch (error) {
								console.error("Error disconnecting Wahoo:", error);
								showAlert(t("common.error") || "Error", t("integrations.wahoo.disconnectError") || "Failed to disconnect Wahoo.");
							}
						},
					},
				]
			);
		}
	};

	const updateWahooSettings = async (uploadEnabled: boolean, downloadEnabled: boolean) => {
		try {
			await apiClient.updateWahooSettings({
				upload_workouts_enabled: uploadEnabled,
				download_activities_enabled: downloadEnabled,
			});
			await loadWahooStatus();
		} catch (error) {
			console.error("Error updating Wahoo settings:", error);
			showAlert("Error", "Failed to update Wahoo settings.");
			throw error;
		}
	};

	const syncWorkouts = async () => {
		try {
			const result = await apiClient.syncWahooWorkouts();

			showAlert(
				"Sync completed",
				`Operations processed: ${result.operations_processed}\n` +
				`Succeeded: ${result.succeeded}\n` +
				`Failed: ${result.failed}`
			);

			return result;
		} catch (error) {
			console.error("Error syncing Wahoo workouts:", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			showAlert("Error", `Failed to sync workouts: ${errorMessage}`);
			throw error;
		}
	};

	useEffect(() => {
		if (user) {
			loadWahooStatus();
			prefetchWahooAuthUrl();
		}
	}, [user]);

	return {
		wahooStatus,
		loading,
		error,
		connecting,
		handleConnectWahoo,
		handleDisconnectWahoo,
		updateWahooSettings,
		syncWorkouts,
	};
}
