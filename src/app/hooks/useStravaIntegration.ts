import { useState, useEffect } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, StravaStatus } from "@/services/api";
import { showAlert } from "@/utils/alert";

export function useStravaIntegration() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);

	const loadStravaStatus = async () => {
		try {
			setError(null);
			const status = await apiClient.getStravaStatus();
			setStravaStatus(status);
		} catch (error) {
			console.error("Error loading Strava status:", error);
			setError(error instanceof Error ? error.message : String(error));
			setStravaStatus({ success: false });
		} finally {
			setLoading(false);
		}
	};

	const prefetchStravaAuthUrl = async () => {
		try {
			const redirectUri = Linking.createURL("connect-strava");
			const authResp = await apiClient.getStravaAuthUrl(redirectUri);
			const url = (authResp as any).authorize_url || (authResp as any).authorization_url;
			if (url) setAuthorizeUrl(url);
		} catch (error) {
			console.warn("Could not prefetch Strava auth url", error);
		}
	};

	const handleConnectStrava = async () => {
		if (connecting) return;

		setConnecting(true);
		try {
			// Use prefetched URL to avoid popup being blocked by browser
			if (!authorizeUrl) {
				// fallback: try to fetch, but this may cause popup-block on some browsers
				const redirectUri = Linking.createURL("connect-strava");
				const authResp = await apiClient.getStravaAuthUrl(redirectUri);
				const fetched = (authResp as any).authorize_url || (authResp as any).authorization_url;
				if (fetched) setAuthorizeUrl(fetched);
				if (!fetched) throw new Error("Keine Autorisierungs-URL von Backend erhalten");
			}

			const redirectUri = Linking.createURL("connect-strava");
			const result = await WebBrowser.openAuthSessionAsync(authorizeUrl || "", redirectUri);

			// On success or dismiss, refresh status
			if (result.type === "success" || result.type === "dismiss") {
				await loadStravaStatus();
			}
		} catch (error) {
			console.error("Error connecting to Strava:", error);
			showAlert(t("common.error"), t("integrations.strava.connectError"));
		} finally {
			setConnecting(false);
		}
	};

	const handleDisconnectStrava = async () => {
		if (Platform.OS === "web") {
			const confirmed = window.confirm(t("integrations.strava.disconnectMessage"));
			if (!confirmed) return;

			try {
				await apiClient.disconnectStrava();
				showAlert(t("integrations.strava.disconnectSuccess"));
				await loadStravaStatus();
			} catch (error) {
				console.error("Error disconnecting Strava:", error);
				showAlert(t("integrations.strava.disconnectError"));
			}
		} else {
			showAlert(
				t("integrations.strava.disconnectTitle"),
				t("integrations.strava.disconnectMessage"),
				[
					{ text: t("integrations.strava.cancel"), style: "cancel" },
					{
						text: t("integrations.strava.disconnect"),
						style: "destructive",
						onPress: async () => {
							try {
								await apiClient.disconnectStrava();
								showAlert(t("common.ok"), t("integrations.strava.disconnectSuccess"));
								await loadStravaStatus();
							} catch (error) {
								console.error("Error disconnecting Strava:", error);
								showAlert(t("common.error"), t("integrations.strava.disconnectError"));
							}
						},
					},
				]
			);
		}
	};

	useEffect(() => {
		if (user) {
			loadStravaStatus();
			prefetchStravaAuthUrl();
		}
	}, [user]);

	return {
		stravaStatus,
		loading,
		error,
		connecting,
		handleConnectStrava,
		handleDisconnectStrava,
	};
}
