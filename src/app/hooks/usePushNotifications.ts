import { useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowAlert: true,
		shouldPlaySound: true,
		shouldSetBadge: false,
		shouldShowBanner: true,
		shouldShowList: true,
	}),
});

export function usePushNotifications() {
	const { user, session } = useAuth();
	const router = useRouter();
	const notificationListener = useRef<Notifications.EventSubscription>();
	const lastHandledId = useRef<string | null>(null);

	// Handle cold start + background tap via the recommended hook
	const lastResponse = Notifications.useLastNotificationResponse();

	useEffect(() => {
		if (!lastResponse || !user?.id) return;

		const responseId = lastResponse.notification.request.identifier;
		if (lastHandledId.current === responseId) return;
		lastHandledId.current = responseId;

		const data = lastResponse.notification.request.content.data;

		if (
			lastResponse.actionIdentifier ===
			Notifications.DEFAULT_ACTION_IDENTIFIER
		) {
			if (data?.type === "feedback" && data?.session_id) {
				router.push(`/activities/${data.session_id}` as any);
			} else if (data?.type === "daily_overview") {
				router.push("/" as any);
			}
		}
	}, [lastResponse, user?.id, router]);

	const registerForPushNotifications = useCallback(async () => {
		if (!Device.isDevice) {
			console.log("Push notifications require a physical device");
			return null;
		}

		const { status: existingStatus } =
			await Notifications.getPermissionsAsync();
		let finalStatus = existingStatus;

		if (existingStatus !== "granted") {
			const { status } = await Notifications.requestPermissionsAsync();
			finalStatus = status;
		}

		if (finalStatus !== "granted") {
			console.log("Push notification permission not granted");
			return null;
		}

		const tokenData = await Notifications.getExpoPushTokenAsync({
			projectId: "96d10c90-5cd3-42da-84d9-aaa688560941",
		});

		if (Platform.OS === "android") {
			await Notifications.setNotificationChannelAsync("default", {
				name: "Default",
				importance: Notifications.AndroidImportance.MAX,
				vibrationPattern: [0, 250, 250, 250],
			});
		}

		return tokenData.data;
	}, []);

	const registerTokenWithBackend = useCallback(
		async (token: string) => {
			if (!user?.id || !session?.access_token) return;

			try {
				const response = await fetch(
					`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/v1/push-tokens/register`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${session.access_token}`,
						},
						body: JSON.stringify({
							expo_push_token: token,
							device_name: Device.modelName || undefined,
							platform: Platform.OS,
						}),
					}
				);

				if (response.ok) {
					console.log("Push token registered with backend");
				} else {
					console.error(
						"Failed to register push token:",
						response.status
					);
				}
			} catch (error) {
				console.error("Error registering push token:", error);
			}
		},
		[user?.id, session?.access_token]
	);

	useEffect(() => {
		if (!user?.id) return;

		registerForPushNotifications().then((token) => {
			if (token) {
				registerTokenWithBackend(token);
			}
		});

		notificationListener.current =
			Notifications.addNotificationReceivedListener((notification) => {
				console.log("Notification received:", notification);
			});

		return () => {
			notificationListener.current?.remove();
		};
	}, [
		user?.id,
		registerForPushNotifications,
		registerTokenWithBackend,
	]);
}
