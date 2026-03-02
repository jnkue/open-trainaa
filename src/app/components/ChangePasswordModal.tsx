import React, {useState} from "react";
import {View, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Modal, TouchableOpacity} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useAuth} from "@/contexts/AuthContext";
import {Button, Input, Text} from "@/components/ui";
import {useTranslation} from "react-i18next";
import {X} from "lucide-react-native";
import {useTheme} from "@/contexts/ThemeContext";
import {apiClient} from "@/services/api";

interface ChangePasswordModalProps {
	visible: boolean;
	onClose: () => void;
}

export function ChangePasswordModal({visible, onClose}: ChangePasswordModalProps) {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [errors, setErrors] = useState<{
		currentPassword?: string;
		newPassword?: string;
		confirmPassword?: string;
		general?: string;
	}>({});
	const [success, setSuccess] = useState(false);

	const {user} = useAuth();
	const {t} = useTranslation();
	const {isDark} = useTheme();

	const handleClose = () => {
		// Reset form
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setErrors({});
		setSuccess(false);
		onClose();
	};

	const handleChangePassword = async () => {
		setErrors({});

		// Validate inputs
		const newErrors: {
			currentPassword?: string;
			newPassword?: string;
			confirmPassword?: string;
		} = {};

		if (!currentPassword) {
			newErrors.currentPassword = t("auth.currentPasswordRequired");
		}

		if (!newPassword) {
			newErrors.newPassword = t("auth.passwordRequired");
		} else if (newPassword.length < 6) {
			newErrors.newPassword = t("auth.passwordTooShort");
		}

		if (!confirmPassword) {
			newErrors.confirmPassword = t("auth.confirmPasswordRequired");
		} else if (newPassword !== confirmPassword) {
			newErrors.confirmPassword = t("auth.passwordsDoNotMatch");
		}

		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		}

		setLoading(true);
		try {
			// Verify current password by trying to sign in
			if (!user?.email) {
				throw new Error("User email not found");
			}

			const {error: signInError} = await apiClient.signIn(user.email, currentPassword);

			if (signInError) {
				setErrors({currentPassword: t("auth.currentPasswordIncorrect")});
				setLoading(false);
				return;
			}

			// Update to new password
			const {error: updateError} = await apiClient.updatePassword(newPassword);

			if (updateError) {
				throw updateError;
			}

			// Success
			setLoading(false);
			setSuccess(true);

			// Close modal after 2 seconds
			setTimeout(() => {
				handleClose();
			}, 2000);
		} catch (error: any) {
			console.error("Password change error:", error);
			setErrors({general: error?.message || t("auth.passwordUpdateError")});
			setLoading(false);
		}
	};

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
			<View className="flex-1 bg-black/50">
				<SafeAreaView style={{flex: 1}} edges={['bottom']}>
					<KeyboardAvoidingView
						behavior={Platform.OS === "ios" ? "padding" : "height"}
						className="flex-1"
						keyboardVerticalOffset={0}
					>
						<TouchableOpacity activeOpacity={1} onPress={handleClose} className="flex-1 justify-end">
							<TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
								<View className="bg-background rounded-t-3xl">
									{/* Header */}
									<View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
										<Text className="text-xl font-bold text-foreground">{t("auth.changePassword")}</Text>
										<TouchableOpacity onPress={handleClose} className="p-2">
											<X size={24} color={isDark ? "#e5e7eb" : "#1f2937"} />
										</TouchableOpacity>
									</View>

									<ScrollView
										style={{maxHeight: 600}}
										className="px-6 py-6"
										showsVerticalScrollIndicator={false}
										keyboardShouldPersistTaps="handled"
									>
								{success ? (
									<View className="bg-primary/10 border border-primary rounded-lg p-6">
										<Text className="text-lg font-bold text-foreground mb-2 text-center">
											{t("auth.passwordChangeSuccess")}
										</Text>
										<Text className="text-base text-muted-foreground text-center">
											{t("auth.passwordChangeSuccessDescription")}
										</Text>
									</View>
								) : (
									<View className="space-y-4">
										{errors.general && (
											<View className="bg-destructive/10 border border-destructive rounded-lg p-3">
												<Text className="text-destructive text-sm">{errors.general}</Text>
											</View>
										)}

										{/* Current Password */}
										<View>
											<Text className="text-base font-semibold text-foreground mb-2">
												{t("auth.currentPassword")}
											</Text>
											<Input
												placeholder={t("auth.enterCurrentPassword")}
												value={currentPassword}
												onChangeText={(text) => {
													setCurrentPassword(text);
													if (errors.currentPassword) setErrors({...errors, currentPassword: undefined});
												}}
												secureTextEntry
												autoCapitalize="none"
												autoCorrect={false}
												autoComplete="password"
												className={`text-base h-12 ${errors.currentPassword ? "border-destructive" : ""}`}
											/>
											{errors.currentPassword && (
												<Text className="text-destructive text-sm mt-1">{errors.currentPassword}</Text>
											)}
										</View>

										{/* New Password */}
										<View>
											<Text className="text-base font-semibold text-foreground mb-2">
												{t("auth.newPassword")}
											</Text>
											<Input
												placeholder={t("auth.enterNewPassword")}
												value={newPassword}
												onChangeText={(text) => {
													setNewPassword(text);
													if (errors.newPassword) setErrors({...errors, newPassword: undefined});
												}}
												secureTextEntry
												autoCapitalize="none"
												autoCorrect={false}
												autoComplete="password"
												className={`text-base h-12 ${errors.newPassword ? "border-destructive" : ""}`}
											/>
											{errors.newPassword && (
												<Text className="text-destructive text-sm mt-1">{errors.newPassword}</Text>
											)}
										</View>

										{/* Confirm New Password */}
										<View>
											<Text className="text-base font-semibold text-foreground mb-2">
												{t("auth.confirmNewPassword")}
											</Text>
											<Input
												placeholder={t("auth.confirmNewPasswordPlaceholder")}
												value={confirmPassword}
												onChangeText={(text) => {
													setConfirmPassword(text);
													if (errors.confirmPassword) setErrors({...errors, confirmPassword: undefined});
												}}
												secureTextEntry
												autoCapitalize="none"
												autoCorrect={false}
												autoComplete="password"
												className={`text-base h-12 ${errors.confirmPassword ? "border-destructive" : ""}`}
											/>
											{errors.confirmPassword && (
												<Text className="text-destructive text-sm mt-1">{errors.confirmPassword}</Text>
											)}
										</View>

										{/* Buttons */}
										<View className="space-y-3 mt-6">
											<Button onPress={handleChangePassword} disabled={loading} className="h-12">
												{loading ? (
													<ActivityIndicator color="white" />
												) : (
													<Text className="text-primary-foreground">{t("auth.updatePassword")}</Text>
												)}
											</Button>

											<Button variant="ghost" onPress={handleClose} disabled={loading} className="h-12">
												<Text className="text-base text-muted-foreground font-medium">{t("common.cancel")}</Text>
											</Button>
										</View>
									</View>
								)}
									</ScrollView>
								</View>
							</TouchableOpacity>
						</TouchableOpacity>
					</KeyboardAvoidingView>
				</SafeAreaView>
			</View>
		</Modal>
	);
}
