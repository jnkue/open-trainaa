import React, {useState} from "react";
import {View, Text, TouchableOpacity, StyleSheet} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useTranslation} from "react-i18next";

const ENVIRONMENT = process.env.EXPO_PUBLIC_ENVIRONMENT;

/**
 * Shows a small floating banner when the app is not running in production.
 * Uses absolute positioning so it does not affect layout of any other UI elements.
 */
export function EnvironmentBanner() {
	const {t} = useTranslation();
	const insets = useSafeAreaInsets();
	const [dismissed, setDismissed] = useState(false);

	if (ENVIRONMENT === "production" || dismissed) {
		return null;
	}

	return (
		<View
			style={[
				styles.container,
				{top: insets.top + 4},
			]}
			pointerEvents="box-none"
		>
			<TouchableOpacity
				style={[
					styles.badge,
					ENVIRONMENT === "development" ? styles.development : styles.staging,
				]}
				onPress={() => setDismissed(true)}
				activeOpacity={0.7}
			>
				<Text style={styles.text}>
					{t("common.environmentBanner", {environment: ENVIRONMENT?.toUpperCase()})}
				</Text>
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		left: 0,
		right: 0,
		zIndex: 9999,
		alignItems: "center",
		pointerEvents: "box-none",
	},
	badge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 4,
		opacity: 0.85,
	},
	development: {
		backgroundColor: "#f59e0b",
	},
	staging: {
		backgroundColor: "#3b82f6",
	},
	text: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 0.5,
	},
});
