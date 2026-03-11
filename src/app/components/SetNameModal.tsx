import React, {useState} from "react";
import {View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform} from "react-native";
import {useTheme} from "@/contexts/ThemeContext";
import {useTranslation} from "react-i18next";

interface SetNameModalProps {
	open: boolean;
	onSave: (name: string) => Promise<void>;
}

export function SetNameModal({open, onSave}: SetNameModalProps) {
	const {isDark} = useTheme();
	const {t} = useTranslation();
	const [name, setName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const {width} = useWindowDimensions();
	const isLargeScreen = width >= 768;

	const handleSave = async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setIsSubmitting(true);
		try {
			await onSave(trimmed);
		} catch (error) {
			console.error("Error saving name:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const cardStyle = {
		backgroundColor: isDark ? "#1f1f23" : "#ffffff",
		borderTopColor: isDark ? "#333333" : "#e5e7eb",
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
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={{
					flex: 1,
					backgroundColor: "rgba(0, 0, 0, 0.5)",
					...(isLargeScreen
						? {justifyContent: "center", alignItems: "center"}
						: {justifyContent: "flex-end"}),
				}}
			>
				<View style={cardStyle}>
					<View className="p-6">
						<Text className="text-xl font-bold text-foreground mb-4">
							{t("setName.title")}
						</Text>

						<TextInput
							className="text-base text-foreground bg-muted rounded-lg px-4 py-3 mb-4"
							placeholder={t("setName.placeholder")}
							placeholderTextColor="#9CA3AF"
							value={name}
							onChangeText={setName}
							autoFocus
							onSubmitEditing={handleSave}
							returnKeyType="done"
							editable={!isSubmitting}
						/>

						<TouchableOpacity
							onPress={handleSave}
							disabled={isSubmitting || !name.trim()}
							className="rounded-lg p-4 bg-primary"
							style={{opacity: isSubmitting || !name.trim() ? 0.6 : 1}}
						>
							{isSubmitting ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text className="text-base font-semibold text-primary-foreground text-center">
									{t("setName.continue")}
								</Text>
							)}
						</TouchableOpacity>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}
