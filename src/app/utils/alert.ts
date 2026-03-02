import { Alert, Platform } from "react-native";
import { getGlobalShowAlert } from "@/contexts/AlertContext";

/**
 * Platform-aware alert function that works consistently across web and mobile
 * @param title - Alert title
 * @param message - Alert message (optional)
 * @param buttons - Alert buttons configuration (optional)
 * @param options - Additional alert options (optional, mobile only)
 */
export const showAlert = (
	title: string,
	message?: string,
	buttons?: Array<{
		text?: string;
		onPress?: () => void;
		style?: "default" | "cancel" | "destructive";
	}>,
	options?: { cancelable?: boolean; onDismiss?: () => void }
) => {
	if (Platform.OS === "web") {
		// On web, use custom AlertDialog component via AlertContext
		const globalAlert = getGlobalShowAlert();
		if (globalAlert) {
			globalAlert(title, message, buttons);
		} else {
			// Fallback to window.alert if AlertProvider is not mounted yet
			console.warn("AlertProvider not mounted, falling back to window.alert");
			window.alert(message ? `${title}\n\n${message}` : title);
		}
	} else {
		// On mobile, use React Native Alert
		Alert.alert(title, message, buttons, options);
	}
};
