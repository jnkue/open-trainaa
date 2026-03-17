import React, {useState} from "react";
import {
	View,
	Text,
	TouchableOpacity,
	Modal,
	ScrollView,
	ActivityIndicator,
	useWindowDimensions,
} from "react-native";
import {useTheme} from "@/contexts/ThemeContext";
import {useTranslation} from "react-i18next";

interface AnalyticsConsentModalProps {
	open: boolean;
	onConsent: (consented: boolean) => Promise<void>;
}

export function AnalyticsConsentModal({
	open,
	onConsent,
}: AnalyticsConsentModalProps) {
	const {isDark} = useTheme();
	const {t} = useTranslation();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const {width} = useWindowDimensions();
	const isLargeScreen = width >= 768;

	const handleChoice = async (consented: boolean) => {
		setIsSubmitting(true);
		try {
			await onConsent(consented);
		} catch (error) {
			console.error("Error saving analytics consent:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const cardStyle = {
		backgroundColor: isDark ? "#1f1f23" : "#ffffff",
		borderTopColor: isDark ? "#333333" : "#e5e7eb",
		maxHeight: "85%" as const,
		...(isLargeScreen
			? {
				borderRadius: 24,
				borderWidth: 1,
				borderColor: isDark ? "#333333" : "#e5e7eb",
				maxWidth: 480,
				width: "100%" as const,
			}
			: {
				borderTopLeftRadius: 24,
				borderTopRightRadius: 24,
				borderTopWidth: 1,
			}),
	};

	return (
		<Modal visible={open} transparent animationType="slide">
			<View style={{
				flex: 1,
				backgroundColor: "rgba(0, 0, 0, 0.5)",
				...(isLargeScreen
					? {justifyContent: "center", alignItems: "center"}
					: {}),
			}}>
				{!isLargeScreen && <View style={{flex: 1, minHeight: 60}} />}
				<View style={cardStyle}>
					<View className="p-6">
						<Text className="text-xl font-bold text-foreground mb-2">
							{t("analytics.consentTitle")}
						</Text>

						<ScrollView
							showsVerticalScrollIndicator={false}
							contentContainerStyle={{paddingBottom: 8}}
						>
							<Text className="text-sm text-muted-foreground mb-4">
								{t("analytics.consentDescription")}
							</Text>

							<Text className="text-sm font-semibold text-foreground mb-2">
								{t("analytics.whatWeCollect")}
							</Text>
							<View className="gap-1 mb-4">
								<Text className="text-sm text-muted-foreground">
									{t("analytics.collectItem1")}
								</Text>
								<Text className="text-sm text-muted-foreground">
									{t("analytics.collectItem2")}
								</Text>
								<Text className="text-sm text-muted-foreground">
									{t("analytics.collectItem3")}
								</Text>
							</View>

							<View
								className="rounded-lg p-3 mb-4"
								style={{
									backgroundColor: isDark
										? "rgba(255,255,255,0.05)"
										: "rgba(0,0,0,0.03)",
								}}
							>
								<Text className="text-xs text-muted-foreground">
									{t("analytics.privacyNote")}
								</Text>
							</View>
						</ScrollView>

						<View className="gap-3 mt-2">
							<TouchableOpacity
								onPress={() => handleChoice(true)}
								disabled={isSubmitting}
								className="rounded-lg p-4 bg-primary"
								style={{opacity: isSubmitting ? 0.6 : 1}}
							>
								{isSubmitting ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text className="text-base font-semibold text-primary-foreground text-center">
										{t("analytics.acceptAndContinue")}
									</Text>
								)}
							</TouchableOpacity>

							<TouchableOpacity
								onPress={() => handleChoice(false)}
								disabled={isSubmitting}
								className="rounded-lg p-4"
								style={{
									borderWidth: 1,
									borderColor: isDark ? "#333333" : "#e5e7eb",
									opacity: isSubmitting ? 0.6 : 1,
								}}
							>
								<Text className="text-base font-medium text-muted-foreground text-center">
									{t("analytics.decline")}
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</View>
		</Modal>
	);
}
