import React from "react";
import {View, Text, StyleSheet} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {useVersionCheck} from "@/contexts/VersionCheckContext";
import {useTranslation} from "react-i18next";
import {showAlert} from "@/utils/alert";

export default function UpdateRequiredScreen() {
	const {versionInfo} = useVersionCheck();
	const {t} = useTranslation();

	const handleUpdatePress = async () => {
		try {
			// TODO For iOS, redirect to App Store
			// TODO For Android, redirect to Play Store
			// For now, we'll show an alert since we don't have the store URLs
			showAlert(t("status.updateRequired"), "Please visit the App Store (iOS) or Play Store (Android) to update the app.", [{text: t("common.ok")}]);
		} catch (error) {
			console.error("Error opening store:", error);
		}
	};

	if (!versionInfo) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.content}>
					<Text>{t("common.loading")}</Text>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.content}>
				<Card style={styles.card}>
					<CardHeader>
						<CardTitle style={styles.title}>{t("status.updateRequired")}</CardTitle>
					</CardHeader>
					<CardContent style={styles.cardContent}>
						<Text style={styles.message}>{versionInfo.message}</Text>

						<View style={styles.versionInfo}>
							<Text style={styles.versionText}>Current Version: {versionInfo.currentVersion}</Text>
							<Text style={styles.versionText}>Latest Version: {versionInfo.latestVersion}</Text>
						</View>

						<Text style={styles.description}>{t("status.updateDescription")}</Text>

						<Button onPress={handleUpdatePress} style={styles.updateButton}>
							<Text style={styles.updateButtonText}>{t("status.updateNow")}</Text>
						</Button>
					</CardContent>
				</Card>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f5f5f5",
	},
	content: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	card: {
		width: "100%",
		maxWidth: 400,
		backgroundColor: "white",
		borderRadius: 12,
		boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
		elevation: 5,
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		textAlign: "center",
		color: "#333",
		marginBottom: 10,
	},
	cardContent: {
		padding: 20,
	},
	message: {
		fontSize: 16,
		textAlign: "center",
		color: "#666",
		marginBottom: 20,
	},
	versionInfo: {
		backgroundColor: "#f8f9fa",
		padding: 15,
		borderRadius: 8,
		marginBottom: 20,
	},
	versionText: {
		fontSize: 14,
		color: "#555",
		marginBottom: 5,
	},
	description: {
		fontSize: 14,
		textAlign: "center",
		color: "#777",
		marginBottom: 30,
		lineHeight: 20,
	},
	updateButton: {
		borderRadius: 8,
		paddingVertical: 15,
	},
	updateButtonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "bold",
		textAlign: "center",
	},
});
