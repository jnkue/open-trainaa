import React, {useState, useEffect} from "react";
import {View, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, Linking} from "react-native";
import {useRouter} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {useTheme} from "@/contexts/ThemeContext";
import {SafeAreaView} from "react-native-safe-area-context";
import {StatusBar} from "expo-status-bar";
import {Button, Input, Text} from "@/components/ui";
import {useTranslation} from "react-i18next";
import {apiClient} from "@/services/api";

export default function ResetPasswordScreen() {
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const [errors, setErrors] = useState<{password?: string; confirmPassword?: string; general?: string}>({});
	const {updatePassword} = useAuth();
	const {isDark} = useTheme();
	const {t} = useTranslation();
	const router = useRouter();

	const logoWhite = require("../../assets/images/logo-white.png");
	const logoBlack = require("../../assets/images/logo-black.png");

	// Handle deep link authentication for password reset
	useEffect(() => {
		const handleDeepLink = async (event: {url: string}) => {
			const url = event.url;
			console.log("Reset password - received deep link:", url);

			// Check for error in URL (expired link, etc.)
			if (url.includes('error=') || url.includes('error_description=')) {
				const urlParams = new URLSearchParams(url.split('?')[1] || url.split('#')[1]);
				const error = urlParams.get('error');
				const errorDescription = urlParams.get('error_description');

				console.error("Reset password - error in URL:", { error, errorDescription });

				// Show user-friendly error message
				if (error === 'access_denied' || errorDescription?.includes('expired')) {
					setErrors({general: t("auth.resetLinkExpired")});
				} else {
					setErrors({general: errorDescription || t("auth.passwordResetError")});
				}
				setIsReady(false);
				return;
			}

			// Extract the hash fragment which contains access_token and type
			if (url.includes('#')) {
				const hash = url.split('#')[1];
				const params = new URLSearchParams(hash);
				const accessToken = params.get('access_token');
				const type = params.get('type');
				const refreshToken = params.get('refresh_token');
				const error = params.get('error');
				const errorDescription = params.get('error_description');

				console.log("Reset password - parsed params:", {
					type,
					hasAccessToken: !!accessToken,
					hasRefreshToken: !!refreshToken,
					error,
					errorDescription
				});

				// Check for errors in hash params
				if (error || errorDescription) {
					console.error("Reset password - error in hash params:", { error, errorDescription });
					if (error === 'access_denied' || errorDescription?.includes('expired')) {
						setErrors({general: t("auth.resetLinkExpired")});
					} else {
						setErrors({general: errorDescription || t("auth.passwordResetError")});
					}
					setIsReady(false);
					return;
				}

				if (type === 'recovery' && accessToken && refreshToken) {
					try {
						// Set the session with the tokens from the email link
						const { data, error } = await apiClient.supabase.auth.setSession({
							access_token: accessToken,
							refresh_token: refreshToken,
						});

						if (error) {
							console.error("Error setting session:", error);

							// Check if error is due to expired token
							if (error.message?.includes('expired') || error.message?.includes('invalid')) {
								setErrors({general: t("auth.resetLinkExpired")});
							} else {
								setErrors({general: error.message || t("auth.passwordResetError")});
							}
							setIsReady(false);
						} else if (!data.session) {
							console.error("No session returned after setSession");
							setErrors({general: t("auth.resetLinkExpired")});
							setIsReady(false);
						} else {
							console.log("Session set successfully, user can now reset password");
							setIsReady(true);
						}
					} catch (error: any) {
						console.error("Error handling deep link:", error);
						setErrors({general: error?.message || t("auth.passwordResetError")});
						setIsReady(false);
					}
				} else {
					// Missing required params
					console.error("Missing required params for password reset");
					setErrors({general: t("auth.resetLinkInvalid")});
					setIsReady(false);
				}
			}
		};

		// Handle initial URL if app was opened from a deep link
		Linking.getInitialURL().then((url) => {
			if (url) {
				handleDeepLink({url});
			} else {
				// On web, the URL params are handled differently
				if (Platform.OS === 'web') {
					setIsReady(true);
				}
			}
		});

		// Listen for deep link events while app is running
		const subscription = Linking.addEventListener('url', handleDeepLink);

		return () => {
			subscription.remove();
		};
	}, [t]);

	const handleResetPassword = async () => {
		setErrors({});

		// Validate inputs
		const newErrors: {password?: string; confirmPassword?: string} = {};

		if (!password) {
			newErrors.password = t("auth.passwordRequired");
		} else if (password.length < 6) {
			newErrors.password = t("auth.passwordTooShort");
		}

		if (!confirmPassword) {
			newErrors.confirmPassword = t("auth.confirmPasswordRequired");
		} else if (password !== confirmPassword) {
			newErrors.confirmPassword = t("auth.passwordsDoNotMatch");
		}

		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		}

		setLoading(true);
		try {
			// Get current user email before updating password
			const { data: { user } } = await apiClient.getCurrentUser();
			const userEmail = user?.email;

			if (!userEmail) {
				throw new Error("User email not found");
			}

			// Update the password
			await updatePassword(password);

			// After password update, Supabase clears the session
			// We need to sign the user back in with the new password
			console.log("Password updated successfully, signing in with new password...");

			// Sign out first to clear any lingering session
			await apiClient.signOut();

			// Sign in with new credentials
			const { error: signInError } = await apiClient.signIn(userEmail, password);

			// Stop loading and show success
			setLoading(false);
			setSuccess(true);

			if (signInError) {
				console.error("Error signing in after password reset:", signInError);
				// Still show success, just redirect to login
				setTimeout(() => {
					router.push("/(auth)/login");
				}, 2000);
			} else {
				// Successfully signed in, show success and redirect to home
				setTimeout(() => {
					router.replace("/(tabs)");
				}, 2000);
			}
		} catch (error: any) {
			console.error("Password update error:", error);
			setErrors({general: error?.message || t("auth.passwordUpdateError")});
			setLoading(false);
		}
	};

	// Show loading state while processing deep link
	if (!isReady && Platform.OS !== 'web' && !errors.general) {
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={isDark ? "light" : "dark"} />
				<SafeAreaView className="flex-1">
					<View className="flex-1 items-center justify-center px-6">
						<View className="w-full max-w-md items-center">
							<Image
								source={isDark ? logoWhite : logoBlack}
								style={{
									resizeMode: "contain",
									width: 200,
									marginBottom: 32,
								}}
							/>
							<ActivityIndicator size="large" />
							<Text className="text-base text-muted-foreground mt-4 text-center">
								{t("auth.processingResetLink") || "Processing reset link..."}
							</Text>
						</View>
					</View>
				</SafeAreaView>
			</View>
		);
	}

	// Show error state if link is expired or invalid
	if (!isReady && errors.general) {
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={isDark ? "light" : "dark"} />
				<SafeAreaView className="flex-1">
					<View className="flex-1 items-center justify-center px-6">
						<View className="w-full max-w-md">
							<View className="items-center mb-8">
								<Image
									source={isDark ? logoWhite : logoBlack}
									style={{
										resizeMode: "contain",
										width: 200,
									}}
								/>
							</View>

							<View className="bg-destructive/10 border border-destructive rounded-lg p-6 mb-6">
								<Text className="text-xl font-bold text-destructive mb-3 text-center">
									{t("auth.resetLinkExpiredTitle")}
								</Text>
								<Text className="text-base text-foreground text-center">
									{errors.general}
								</Text>
							</View>

							<Button onPress={() => router.push("/(auth)/forgot-password")} className="h-12 mb-3">
								<Text className="text-primary-foreground">{t("auth.requestNewLink")}</Text>
							</Button>

							<Button variant="ghost" onPress={() => router.push("/(auth)/login")} className="h-12">
								<Text className="text-base text-muted-foreground font-medium">{t("auth.backToLogin")}</Text>
							</Button>
						</View>
					</View>
				</SafeAreaView>
			</View>
		);
	}

	if (success) {
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={isDark ? "light" : "dark"} />
				<SafeAreaView className="flex-1">
					<View className="flex-1 items-center justify-center px-6">
						<View className="w-full max-w-md">
							<View className="items-center mb-8">
								<Image
									source={isDark ? logoWhite : logoBlack}
									style={{
										resizeMode: "contain",
										width: 200,
									}}
								/>
							</View>

							<View className="bg-primary/10 border border-primary rounded-lg p-6 mb-6">
								<Text className="text-xl font-bold text-foreground mb-3 text-center">
									{t("auth.passwordResetSuccess")}
								</Text>
								<Text className="text-base text-muted-foreground text-center">
									{t("auth.passwordResetSuccessDescription")}
								</Text>
							</View>
						</View>
					</View>
				</SafeAreaView>
			</View>
		);
	}

	return (
		<View className="flex-1 bg-background">
			<StatusBar style={isDark ? "light" : "dark"} />
			<SafeAreaView className="flex-1">
				<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
					<View className="flex-1 items-center justify-center">
						<View className="w-full max-w-md px-6">
							<ScrollView
								contentContainerStyle={{flexGrow: 1, paddingVertical: 20}}
								keyboardShouldPersistTaps="handled"
								showsVerticalScrollIndicator={false}
							>
								{/* Header */}
								<View className="items-center mb-12 mt-8">
									<View className="items-center mb-6">
										<Image
											source={isDark ? logoWhite : logoBlack}
											style={{
												resizeMode: "contain",
												width: 250,
											}}
										/>
									</View>
									<Text className="text-3xl font-bold text-foreground text-center mb-2">
										{t("auth.resetPasswordTitle")}
									</Text>
									<Text className="text-lg text-muted-foreground text-center">
										{t("auth.resetPasswordDescription")}
									</Text>
								</View>

								{/* Form */}
								<View className="space-y-6">
									{errors.general && (
										<View className="bg-destructive/10 border border-destructive rounded-lg p-3">
											<Text className="text-destructive text-sm">{errors.general}</Text>
										</View>
									)}

									<View>
										<Text className="text-base font-semibold text-foreground mb-3">
											{t("auth.newPassword")}
										</Text>
										<Input
											placeholder={t("auth.enterNewPassword")}
											value={password}
											onChangeText={(text) => {
												setPassword(text);
												if (errors.password) setErrors({...errors, password: undefined});
											}}
											secureTextEntry
											autoCapitalize="none"
											autoCorrect={false}
											autoComplete="password"
											className={`text-base h-12 ${errors.password ? "border-destructive" : ""}`}
										/>
										{errors.password && <Text className="text-destructive text-sm mt-1">{errors.password}</Text>}
									</View>

									<View>
										<Text className="text-base font-semibold text-foreground mb-3">
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

									<View className="space-y-4 mt-8">
										<Button onPress={handleResetPassword} disabled={loading} className="h-12">
											{loading ? (
												<ActivityIndicator color="white" />
											) : (
												<Text className="text-primary-foreground">{t("auth.updatePassword")}</Text>
											)}
										</Button>
									</View>
								</View>
							</ScrollView>
						</View>
					</View>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</View>
	);
}
