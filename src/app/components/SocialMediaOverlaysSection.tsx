import React, {useRef, useState} from "react";
import {View, ScrollView, ActivityIndicator, Platform, StyleSheet} from "react-native";
import {Card, CardHeader, CardTitle, CardContent, Text} from "@/components/ui";
import {Button} from "@/components/ui/button";
import {useTheme} from "@/contexts/ThemeContext";
import {useTranslation} from "react-i18next";
import {ActivityDetail, ActivityRecord} from "@/services/api";
import {SocialMediaOverlay} from "./SocialMediaOverlay";
import ViewShot, {captureRef} from "react-native-view-shot";
import * as MediaLibrary from 'expo-media-library';
import {showAlert} from "@/utils/alert";
import {toBlob} from "html-to-image";
import ColorPicker, {Panel1, HueSlider} from "reanimated-color-picker";

interface SocialMediaOverlaysSectionProps {
	activity: ActivityDetail;
	records?: ActivityRecord[];
	feedback?: string | null;
}

type OverlayTemplate = "route" | "stats" | "feedback" | "heartrate" | "elevation" | "power";

interface OverlayConfig {
	id: OverlayTemplate;
	title: string;
	description: string;
	icon: string;
	requiresGPS?: boolean;
	requiresHR?: boolean;
	requiresElevation?: boolean;
	requiresPower?: boolean;
	requiresFeedback?: boolean;
}

const SocialMediaOverlaysSection: React.FC<SocialMediaOverlaysSectionProps> = ({activity, records, feedback}) => {
	const {t} = useTranslation();
	const {colorScheme} = useTheme();
	const [downloadingOverlay, setDownloadingOverlay] = useState<string | null>(null);
	const [customColor, setCustomColor] = useState<string>("");

	console.log("[OVERLAY_SECTION] Component rendering");
	console.log(`[OVERLAY_SECTION] Activity ID: ${activity.id}, Records count: ${records?.length || 0}`);

	// Refs for each overlay (ViewShot for mobile, View for web)
	const routeRef = useRef<any>(null);
	const statsRef = useRef<any>(null);
	const feedbackRef = useRef<any>(null);
	const heartrateRef = useRef<any>(null);
	const elevationRef = useRef<any>(null);
	const powerRef = useRef<any>(null);

	// Check if we have required data
	const hasGPSData = records && records.some((r) => r.latitude && r.longitude);
	const hasHRData = records && records.some((r) => r.heart_rate && r.heart_rate > 30);
	const hasElevationData = records && records.some((r) => r.altitude !== null && r.altitude !== undefined);
	const hasPowerData = records && records.some((r) => r.power !== null && r.power !== undefined && r.power > 0);
	const hasFeedback = !!feedback;

	console.log(`[OVERLAY_SECTION] Data availability: GPS=${hasGPSData}, HR=${hasHRData}, Elevation=${hasElevationData}, Power=${hasPowerData}, Feedback=${hasFeedback}`);

	const overlayConfigs: OverlayConfig[] = [
		{
			id: "route",
			title: t("activities.overlays.routeTitle"),
			description: t("activities.overlays.routeDescription"),
			icon: "map",
			requiresGPS: true,
		},
		{
			id: "stats",
			title: t("activities.overlays.statsTitle"),
			description: t("activities.overlays.statsDescription"),
			icon: "chart.bar",
			requiresGPS: true,
		},
		{
			id: "heartrate",
			title: t("activities.overlays.heartrateTitle"),
			description: t("activities.overlays.heartrateDescription"),
			icon: "heart.fill",
			requiresHR: true,
		},
		{
			id: "elevation",
			title: t("activities.overlays.elevationTitle"),
			description: t("activities.overlays.elevationDescription"),
			icon: "mountain.2",
			requiresElevation: true,
		},
		{
			id: "power",
			title: t("activities.overlays.powerTitle"),
			description: t("activities.overlays.powerDescription"),
			icon: "bolt.fill",
			requiresPower: true,
		},
	];

	// Check if overlay is available
	const isOverlayAvailable = (config: OverlayConfig): boolean => {
		if (config.requiresGPS && !hasGPSData) return false;
		if (config.requiresHR && !hasHRData) return false;
		if (config.requiresElevation && !hasElevationData) return false;
		if (config.requiresPower && !hasPowerData) return false;
		if (config.requiresFeedback && !hasFeedback) return false;
		return true;
	};

	// Get ref for overlay
	const getRefForOverlay = (id: OverlayTemplate) => {
		switch (id) {
			case "route":
				return routeRef;
			case "stats":
				return statsRef;
			case "feedback":
				return feedbackRef;
			case "heartrate":
				return heartrateRef;
			case "elevation":
				return elevationRef;
			case "power":
				return powerRef;
			default:
				return null;
		}
	};

	// Handle download
	const handleDownload = async (overlayId: OverlayTemplate) => {
		setDownloadingOverlay(overlayId);

		try {
			const ref = getRefForOverlay(overlayId);

			if (!ref || !ref.current) {
				showAlert(t("common.error"), "Unable to capture overlay");
				setDownloadingOverlay(null);
				return;
			}

			// Wait a bit for the view to fully render (especially important on physical devices)
			await new Promise(resolve => setTimeout(resolve, 300));

			if (Platform.OS === "web") {
				// Web implementation: download as file using html-to-image
				const blob = await toBlob(ref.current, {
					quality: 1,
					pixelRatio: 2,
				});

				if (!blob) {
					throw new Error("Failed to generate image blob");
				}

				// Create download link
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				const timestamp = new Date().getTime();
				const safeActivityName = activity.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
				link.href = url;
				link.download = `trainaa-${safeActivityName}-${overlayId}-${timestamp}.png`;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(url);

				showAlert(t("common.success"), t("activities.overlays.savedToLibrary"));
			} else {
				// Mobile implementation: save to camera roll
				const { status } = await MediaLibrary.requestPermissionsAsync();
				if (status !== "granted") {
					showAlert(t("common.error"), "Permission to access camera roll is required");
					setDownloadingOverlay(null);
					return;
				}

				const uri = await captureRef(ref.current, {
					format: "png",
					quality: 1,
					result: "tmpfile",
				});

				// Save to camera roll
				await MediaLibrary.saveToLibraryAsync(uri);
				showAlert(t("common.success"), t("activities.overlays.savedToLibrary"));
			}
		} catch (error) {
			console.error("Error saving overlay:", error);
			showAlert(t("common.error"), t("activities.overlays.downloadError"));
		} finally {
			setDownloadingOverlay(null);
		}
	};

	// Filter available overlays
	const availableOverlays = overlayConfigs.filter(isOverlayAvailable);

	console.log(`[OVERLAY_SECTION] Available overlays: ${availableOverlays.map(o => o.id).join(', ')}`);

	if (availableOverlays.length === 0) {
		console.log("[OVERLAY_SECTION] No available overlays, returning null");
		return null;
	}

	const isDark = colorScheme === "dark";
	const pickerBackgroundColor = isDark ? "#1f1f1f" : "#f5f5f5";
	const borderColor = isDark ? "#333333" : "#dddddd";

	return (
		<Card className="mx-4 mt-4">
			<CardHeader className="pb-3">
				<CardTitle className="flex-row items-center text-lg">
					<Text className="ml-2">{t("activities.overlays.title")}</Text>
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0">
				{/* Color Picker Section */}


				<ScrollView horizontal showsHorizontalScrollIndicator={false} className="space-x-4">
					{availableOverlays.map((config) => {
						console.log(`[OVERLAY_SECTION] Rendering overlay: ${config.id}`);
						return (
							<View key={config.id} className="mr-4" style={{width: 200}}>
								{/* Preview thumbnail container with checkered background */}
								<View
									className="rounded-lg overflow-hidden relative"
									style={{
										height: 356,
										backgroundColor: colorScheme === "dark" ? "#1a1a1a" : "#f5f5f5",
									}}
								>
									{/* Actual overlay to be captured - wrapped in ViewShot for mobile, plain View for web */}
									{Platform.OS === "web" ? (
										<View
											ref={getRefForOverlay(config.id)}
											style={{
												width: 200,
												height: 356,
												backgroundColor: "transparent",
											}}
										>
											{(() => {
												try {
													console.log(`[OVERLAY_SECTION] Creating SocialMediaOverlay component for ${config.id}`);
													return <SocialMediaOverlay activity={activity} records={records} feedback={feedback} template={config.id} customColor={customColor} />;
												} catch (error) {
													console.error(`[OVERLAY_SECTION] ERROR rendering ${config.id}:`, error);
													return <View style={{width: 200, height: 356, backgroundColor: 'red'}} />;
												}
											})()}
										</View>
									) : (
										<ViewShot
											ref={getRefForOverlay(config.id) as React.RefObject<ViewShot>}
											style={{
												width: 200,
												height: 356,
												backgroundColor: "transparent",
											}}
											options={{
												format: "png",
												quality: 1,
												result: "tmpfile",
											}}
										>
											{(() => {
												try {
													console.log(`[OVERLAY_SECTION] Creating SocialMediaOverlay component for ${config.id}`);
													return <SocialMediaOverlay activity={activity} records={records} feedback={feedback} template={config.id} customColor={customColor} />;
												} catch (error) {
													console.error(`[OVERLAY_SECTION] ERROR rendering ${config.id}:`, error);
													return <View style={{width: 200, height: 356, backgroundColor: 'red'}} />;
												}
											})()}
										</ViewShot>
									)}

								{/* Loading overlay */}
								{downloadingOverlay === config.id && (
									<View
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											right: 0,
											bottom: 0,
											backgroundColor: "rgba(0, 0, 0, 0.5)",
											justifyContent: "center",
											alignItems: "center",
										}}
									>
										<ActivityIndicator size="large" color="#ffffff" />
									</View>
								)}
							</View>

							{/* Save Button */}
							<Button onPress={() => handleDownload(config.id)} disabled={downloadingOverlay === config.id} className="mt-2 w-full" size="sm">
								<Text>{downloadingOverlay === config.id ? t("common.loading") : t("common.save")}</Text>
							</Button>
						</View>
					);
					})}
				</ScrollView>


				<View className="mt-4">
					<View style={[styles.colorPickerContainer, {backgroundColor: pickerBackgroundColor, borderColor}]}>
						<ColorPicker
							value={customColor || "#08c8ff"}
							onCompleteJS={(selectedColor) => setCustomColor(selectedColor.hex)}
							thumbSize={15}
							thumbShape="circle"
							sliderThickness={10}
							style={styles.colorPicker}
						>
							<View style={styles.pickerControls}>
								<Panel1 style={styles.panel} />
								<HueSlider style={styles.slider} />
							</View>
						</ColorPicker>
					</View>
				</View>


				{/* Font color tip */}
				<View className="mt-4 ">
					<Text className="text-xs text-muted-foreground text-center">
						{colorScheme === "dark"
							? t("activities.overlays.fontColorTipDark")
							: t("activities.overlays.fontColorTipLight")
						}
					</Text>
				</View>

			
			</CardContent>
		</Card>
	);
};

const styles = StyleSheet.create({
	heading: {
		fontSize: 18,
		fontWeight: "600",
		marginBottom: 12,
	},
	colorPickerContainer: {
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
	},
	colorPicker: {
		width: "100%",
	},
	pickerControls: {
		gap: 8,
	},
	panel: {
		height: 100,
		borderRadius: 6,
	},
	slider: {
		height: 10,
		borderRadius: 10,
	},
});

export default SocialMediaOverlaysSection;
