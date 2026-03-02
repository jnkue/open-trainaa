import { useState, useEffect } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type GarminStatus } from "@/services/api";
import { useTranslation } from "react-i18next";
import { showAlert } from "@/utils/alert";

export function useGarminIntegration() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const [garminStatus, setGarminStatus] = useState<GarminStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);

	const loadGarminStatus = async () => {
		try {
			setError(null);
			const status = await apiClient.getGarminStatus();
			setGarminStatus(status);
		} catch (error) {
			console.error("Error loading Garmin status:", error);
			setError(error instanceof Error ? error.message : String(error));
			setGarminStatus({ success: false });
		} finally {
			setLoading(false);
		}
	};

	const prefetchGarminAuthUrl = async () => {
		try {
			const redirectUri = Linking.createURL("connect-garmin");
			const authResp = await apiClient.getGarminAuthUrl(redirectUri);
			const url = (authResp as any).authorize_url || (authResp as any).authorization_url;
			if (url) setAuthorizeUrl(url);
		} catch (error) {
			console.warn("Could not prefetch Garmin auth url", error);
		}
	};

	const handleConnectGarmin = async () => {
		if (connecting) return;

		setConnecting(true);
		try {
			// Use prefetched URL to avoid popup being blocked by browser
			if (!authorizeUrl) {
				// fallback: try to fetch, but this may cause popup-block on some browsers
				const redirectUri = Linking.createURL("connect-garmin");
				const authResp = await apiClient.getGarminAuthUrl(redirectUri);
				const fetched = (authResp as any).authorize_url || (authResp as any).authorization_url;
				if (fetched) setAuthorizeUrl(fetched);
				if (!fetched) throw new Error("No authorization URL received from backend");
			}

			const redirectUri = Linking.createURL("connect-garmin");
			const result = await WebBrowser.openAuthSessionAsync(authorizeUrl || "", redirectUri);

			// On success or dismiss, refresh status
			if (result.type === "success" || result.type === "dismiss") {
				await loadGarminStatus();
			}
		} catch (error) {
			console.error("Error connecting to Garmin:", error);
			showAlert("Error", "Failed to connect to Garmin.");
		} finally {
			setConnecting(false);
		}
	};

	const handleDisconnectGarmin = async () => {
		if (Platform.OS === "web") {
			const confirmed = window.confirm(t("integrations.garmin.disconnectMessage") || "Are you sure you want to disconnect Garmin?");
			if (!confirmed) return;

			try {
				await apiClient.disconnectGarmin();
				showAlert(t("integrations.garmin.disconnectSuccess") || "Garmin connection has been disconnected.");
				await loadGarminStatus();
			} catch (error) {
				console.error("Error disconnecting Garmin:", error);
				showAlert(t("integrations.garmin.disconnectError") || "Failed to disconnect Garmin.");
			}
		} else {
			showAlert(
				t("integrations.garmin.disconnectTitle") || "Disconnect Garmin",
				t("integrations.garmin.disconnectMessage") || "Are you sure you want to disconnect Garmin?",
				[
					{ text: t("integrations.garmin.cancel") || "Cancel", style: "cancel" },
					{
						text: t("integrations.garmin.disconnect") || "Disconnect",
						style: "destructive",
						onPress: async () => {
							try {
								await apiClient.disconnectGarmin();
								showAlert(t("common.ok") || "Success", t("integrations.garmin.disconnectSuccess") || "Garmin connection has been disconnected.");
								await loadGarminStatus();
							} catch (error) {
								console.error("Error disconnecting Garmin:", error);
								showAlert(t("common.error") || "Error", t("integrations.garmin.disconnectError") || "Failed to disconnect Garmin.");
							}
						},
					},
				]
			);
		}
	};

	const updateGarminSettings = async (uploadEnabled: boolean, downloadEnabled: boolean) => {
		try {
			await apiClient.updateGarminSettings({
				upload_workouts_enabled: uploadEnabled,
				download_activities_enabled: downloadEnabled,
			});
			await loadGarminStatus();
		} catch (error: any) {
			console.error("Error updating Garmin settings:", error);

			// Check if this is a permission error from the backend
			const errorMessage = error?.response?.data?.detail || error?.message || "Failed to update Garmin settings.";

			showAlert(
				t("common.error") || "Error",
				errorMessage
			);
			throw error;
		}
	};

	const syncWorkouts = async () => {
		try {
			const result = await apiClient.syncGarminWorkouts();

			showAlert(
				"Sync completed",
				`Workouts synced: ${result.workouts_synced}\n` +
				`Scheduled synced: ${result.scheduled_synced}\n` +
				`Failed: ${result.failed}`
			);

			return result;
		} catch (error) {
			console.error("Error syncing Garmin workouts:", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			showAlert("Error", `Failed to sync workouts: ${errorMessage}`);
			throw error;
		}
	};

	useEffect(() => {
		if (user) {
			loadGarminStatus();
			prefetchGarminAuthUrl();
		}
	}, [user]);

	return {
		garminStatus,
		loading,
		error,
		connecting,
		handleConnectGarmin,
		handleDisconnectGarmin,
		updateGarminSettings,
		syncWorkouts,
	};
}
