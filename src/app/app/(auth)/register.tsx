import React, {useState} from "react";
import {View, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, TouchableOpacity} from "react-native";
import {Link} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {useTheme} from "@/contexts/ThemeContext";
import {useLanguage} from "@/contexts/LanguageContext";
import {SafeAreaView} from "react-native-safe-area-context";
import {StatusBar} from "expo-status-bar";
import {Button, Input, Text} from "@/components/ui";
import {Checkbox} from "@/components/ui/checkbox";
import {useTranslation} from "react-i18next";
import {Eye, EyeOff, Languages, Moon, Sun} from "lucide-react-native";
import {apiClient} from "@/services/api";
import {GoogleIcon} from "@/components/icons/GoogleIcon";
import {AppleIcon} from "@/components/icons/AppleIcon";

export default function RegisterScreen() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [newsletterOptIn, setNewsletterOptIn] = useState(false);
	const [loading, setLoading] = useState(false);
	const [passwordFocused, setPasswordFocused] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [appleLoading, setAppleLoading] = useState(false);
	const [errors, setErrors] = useState<{email?: string; password?: string; confirmPassword?: string; general?: string}>({});
	const {signUp, signInWithGoogle, signInWithApple} = useAuth();
	const {isDark, theme, setTheme} = useTheme();
	const {currentLanguage, availableLanguages, changeLanguage} = useLanguage();
	const {t} = useTranslation();

	const logoWhite = require("../../assets/images/logo-white.png");
	const logoBlack = require("../../assets/images/logo-black.png");

	const toggleTheme = () => {
		if (theme === "light") {
			setTheme("dark");
		} else {
			setTheme("light");
		}
	};

	const toggleLanguage = () => {
		const currentIndex = availableLanguages.findIndex((lang) => lang.code === currentLanguage);
		const nextIndex = (currentIndex + 1) % availableLanguages.length;
		changeLanguage(availableLanguages[nextIndex].code);
	};

	const validateEmail = (email: string): boolean => {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	};

	const getPasswordRequirements = (password: string) => {
		return {
			minLength: password.length >= 8,
			hasUppercase: /[A-Z]/.test(password),
			hasLowercase: /[a-z]/.test(password),
			hasDigit: /[0-9]/.test(password),
		};
	};

	const isPasswordValid = (password: string): boolean => {
		const requirements = getPasswordRequirements(password);
		return requirements.minLength && requirements.hasUppercase && requirements.hasLowercase && requirements.hasDigit;
	};

	const getSupabaseErrorMessage = (error: any): string => {
		// Handle Supabase auth errors
		if (error?.message) {
			const message = error.message.toLowerCase();

			// User already exists
			if (message.includes("user already registered") || message.includes("already registered")) {
				return t("auth.emailAlreadyRegistered");
			}

			// Password too weak
			if (message.includes("password") && (message.includes("weak") || message.includes("strength"))) {
				return t("auth.passwordTooWeak");
			}

			// Invalid email format (server-side)
			if (message.includes("invalid email")) {
				return t("auth.invalidEmail");
			}

			// Too many requests
			if (message.includes("too many requests")) {
				return t("auth.tooManyAttempts");
			}

			// Network errors
			if (message.includes("network") || message.includes("fetch")) {
				return t("auth.networkError");
			}
		}

		// Default error message
		return error?.message || t("common.retry");
	};

	const handleGoogleSignUp = async () => {
		setErrors({});
		setGoogleLoading(true);
		try {
			await signInWithGoogle();
		} catch (error: any) {
			if (error.code === "CANCELLED") return;
			if (error?.code === "PLAY_SERVICES_UNAVAILABLE") {
				setErrors({general: t("auth.googlePlayServicesUnavailable")});
			} else {
				setErrors({general: t("auth.googleSignInError")});
			}
		} finally {
			setGoogleLoading(false);
		}
	};

	const handleAppleSignUp = async () => {
		setErrors({});
		setAppleLoading(true);
		try {
			await signInWithApple();
		} catch (error: any) {
			if (error.code === "CANCELLED") return;
			if (error.code === "UNAVAILABLE") {
				setErrors({general: t("auth.appleSignInUnavailable")});
			} else {
				setErrors({general: t("auth.appleSignInError")});
			}
		} finally {
			setAppleLoading(false);
		}
	};

	const handleRegister = async () => {
		// Clear previous errors
		setErrors({});

		// Validate inputs
		const newErrors: {email?: string; password?: string; confirmPassword?: string} = {};

		if (!email.trim()) {
			newErrors.email = t("auth.emailRequired");
		} else if (!validateEmail(email)) {
			newErrors.email = t("auth.invalidEmail");
		}

		if (!password) {
			newErrors.password = t("auth.passwordRequired");
		} else if (!isPasswordValid(password)) {
			newErrors.password = t("auth.passwordRequirements");
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
			await signUp(email, password);

			// Create user_info entry with default values and language set to currentLanguage
			try {
				const {data: {user}} = await apiClient.supabase.auth.getUser();

				if (user?.id) {
					await apiClient.supabase.from("user_infos").insert([
						{
							user_id: user.id,
							language: currentLanguage,
							timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
							automatic_calculation_mode: true,
							preferred_units: "metric",
							post_feedback_to_strava: false,
							newsletter_opt_in: newsletterOptIn,
						},
					]);
					console.log(`User info created with language: ${currentLanguage}, newsletter: ${newsletterOptIn}`);
				}
			} catch (dbError) {
				console.error("Failed to create user info:", dbError);
				// Don't throw - registration was successful, user info is optional
			}
		} catch (error: any) {
			console.error("Registration error:", error);
			setErrors({general: getSupabaseErrorMessage(error)});
		} finally {
			setLoading(false);
		}
	};

	return (
		<View className="flex-1 bg-background">
			<StatusBar style={isDark ? "light" : "dark"} />
			<SafeAreaView className="flex-1">
				<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
					{/* Responsive container for large screens */}
					<View className="flex-1 items-center">
						<View className="w-full max-w-md px-6 flex-1">
							<ScrollView
								contentContainerStyle={{paddingVertical: 20}}
								keyboardShouldPersistTaps="handled"
								showsVerticalScrollIndicator={false}
							>
								{/* Header */}
								<View className="items-center mb-12 mt-8">
									<View className="items-center mb-6">
										<Image
											source={isDark ? logoWhite : logoBlack}
											className="w-40 h-12"
											style={{
												resizeMode: "contain",
												width: 250,
											}}
										/>
									</View>
									<Text className="text-3xl font-bold text-foreground text-center mb-2">{t("auth.createAccount")}</Text>
								</View>

								{/* Form */}
								<View className="space-y-6">
									{errors.general && (
										<View className="bg-destructive/10 border border-destructive rounded-lg p-3">
											<Text className="text-destructive text-sm">{errors.general}</Text>
										</View>
									)}

									<View className="gap-3">
										{/* Google Sign-Up */}
										<Button
											variant="outline"
											onPress={handleGoogleSignUp}
											disabled={googleLoading || appleLoading || loading}
											className="h-12 flex-row items-center justify-center gap-3"
										>
											{googleLoading ? (
												<ActivityIndicator color={isDark ? "#ffffff" : "#000000"} />
											) : (
												<View className="flex-row items-center justify-center gap-3">
													<GoogleIcon size={20} />
													<Text className="text-foreground font-medium">{t("auth.continueWithGoogle")}</Text>
												</View>
											)}
										</Button>

										{/* Apple Sign-Up (iOS only) */}
										{Platform.OS !== "android" && (
											<Button
												variant="outline"
												onPress={handleAppleSignUp}
												disabled={appleLoading || googleLoading || loading}
												className="h-12 flex-row items-center justify-center gap-3"
											>
												{appleLoading ? (
													<ActivityIndicator color={isDark ? "#ffffff" : "#000000"} />
												) : (
													<View className="flex-row items-center justify-center gap-3">
														<AppleIcon size={20} color={isDark ? "#ffffff" : "#000000"} />
														<Text className="text-foreground font-medium">{t("auth.continueWithApple")}</Text>
													</View>
												)}
											</Button>
										)}
									</View>

									{/* Divider */}
									<View className="flex-row items-center">
										<View className="flex-1 h-[1px] bg-border" />
										<Text className="text-muted-foreground text-sm mx-4">{t("auth.orDivider")}</Text>
										<View className="flex-1 h-[1px] bg-border" />
									</View>

									<View>
										<Text className="text-base font-semibold text-foreground mb-3">{t("auth.email")}</Text>
										<Input
											placeholder={t("auth.enterEmail")}
											value={email}
											onChangeText={(text) => {
												setEmail(text);
												if (errors.email) setErrors({...errors, email: undefined});
											}}
											keyboardType="email-address"
											autoCapitalize="none"
											autoCorrect={false}
											autoComplete="email"
											className={`text-base h-12 ${errors.email ? "border-destructive" : ""}`}
										/>
										{errors.email && <Text className="text-destructive text-sm mt-1">{errors.email}</Text>}
									</View>

									<View>
										<Text className="text-base font-semibold text-foreground mb-3">{t("auth.password")}</Text>
										<View className="relative">
											<Input
												placeholder={t("auth.enterPassword")}
												value={password}
												onChangeText={(text) => {
													setPassword(text);
													if (errors.password) setErrors({...errors, password: undefined});
												}}
												onFocus={() => setPasswordFocused(true)}
												onBlur={() => setPasswordFocused(false)}
												secureTextEntry={!showPassword}
												autoCapitalize="none"
												autoCorrect={false}
												autoComplete="new-password"
												className={`text-base h-12 pr-12 ${errors.password ? "border-destructive" : ""}`}
											/>
											<TouchableOpacity
												onPress={() => setShowPassword(!showPassword)}
												className="absolute right-3 top-0 bottom-0 justify-center"
												accessibilityLabel={showPassword ? "Hide password" : "Show password"}
											>
												{showPassword ? (
													<EyeOff size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
												) : (
													<Eye size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
												)}
											</TouchableOpacity>
										</View>
										{errors.password && <Text className="text-destructive text-sm mt-1">{errors.password}</Text>}

										{/* Password Requirements - Show when focused or has content */}
										{(passwordFocused || password) && (
											<View className="mt-2 space-y-1">
												{(() => {
													const reqs = getPasswordRequirements(password);
													return (
														<>
															<Text className={`text-xs ${reqs.minLength ? "text-green-500" : "text-muted-foreground"}`}>
																{reqs.minLength ? "✓" : "○"} {t("auth.passwordMinLength")}
															</Text>
															<Text className={`text-xs ${reqs.hasUppercase ? "text-green-500" : "text-muted-foreground"}`}>
																{reqs.hasUppercase ? "✓" : "○"} {t("auth.passwordUppercase")}
															</Text>
															<Text className={`text-xs ${reqs.hasLowercase ? "text-green-500" : "text-muted-foreground"}`}>
																{reqs.hasLowercase ? "✓" : "○"} {t("auth.passwordLowercase")}
															</Text>
															<Text className={`text-xs ${reqs.hasDigit ? "text-green-500" : "text-muted-foreground"}`}>
																{reqs.hasDigit ? "✓" : "○"} {t("auth.passwordDigit")}
															</Text>
														</>
													);
												})()}
											</View>
										)}
									</View>

									<View>
										<Text className="text-base font-semibold text-foreground mb-3">{t("auth.confirmPassword")}</Text>
										<View className="relative">
											<Input
												placeholder={t("auth.confirmPasswordPlaceholder")}
												value={confirmPassword}
												onChangeText={(text) => {
													setConfirmPassword(text);
													if (errors.confirmPassword) setErrors({...errors, confirmPassword: undefined});
												}}
												secureTextEntry={!showConfirmPassword}
												autoCapitalize="none"
												autoCorrect={false}
												autoComplete="new-password"
												className={`text-base h-12 pr-12 ${errors.confirmPassword ? "border-destructive" : ""}`}
											/>
											<TouchableOpacity
												onPress={() => setShowConfirmPassword(!showConfirmPassword)}
												className="absolute right-3 top-0 bottom-0 justify-center"
												accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
											>
												{showConfirmPassword ? (
													<EyeOff size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
												) : (
													<Eye size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
												)}
											</TouchableOpacity>
										</View>
										{errors.confirmPassword && <Text className="text-destructive text-sm mt-1">{errors.confirmPassword}</Text>}
									</View>

									{/* Newsletter Opt-in */}
									<View className="flex-row items-start gap-3 mt-4">
										<View className="pt-1">
											<Checkbox
												checked={newsletterOptIn}
												onCheckedChange={(checked) => setNewsletterOptIn(checked === true)}
											/>
										</View>
										<View className="flex-1">
											<Text className="text-sm text-foreground">
												{t("auth.newsletterOptIn")}
											</Text>
										</View>
									</View>

									{/* Terms Agreement */}
									<View className="mt-4">
										<Text className="text-xs text-muted-foreground text-center">
											{t("auth.termsAgreementPrefix")}{" "}
											<Link href="https://trainaa.com/privacy" target="_blank">
												<Text className="text-xs text-foreground underline">{t("auth.privacyPolicy")}</Text>
											</Link>
											{" "}{t("auth.and")}{" "}
											<Link href="https://trainaa.com/terms" target="_blank">
												<Text className="text-xs text-foreground underline">{t("auth.termsConditions")}</Text>
											</Link>
										</Text>
									</View>

									<View className="space-y-4 mt-8">
										<Button onPress={handleRegister} disabled={loading} className="h-12">
											{loading ? <ActivityIndicator color="white" /> : <Text className="text-primary-foreground">{t("auth.createAccount")}</Text>}
										</Button>
									</View>
								</View>

								{/* Footer */}
								<View className="flex-row justify-center items-center mt-12 pt-6 border-t border-border">
									<Text className="text-base text-muted-foreground">{t("auth.alreadyHaveAccount")} </Text>
									<Link href="/(auth)/login">
										<Text className="text-base text-foreground font-semibold ml-1">{t("auth.signIn")}</Text>
									</Link>
								</View>

								{/* Privacy, Terms and Imprint Links */}
								<View className="flex-row justify-center items-center gap-2 mt-8">
									<Link href="https://trainaa.com/privacy" target="_blank">
										<Text className="text-xs text-muted-foreground">{t("auth.privacy")}</Text>
									</Link>
									<Text className="text-xs text-muted-foreground">•</Text>
									<Link href="https://trainaa.com/terms" target="_blank">
										<Text className="text-xs text-muted-foreground">{t("auth.terms")}</Text>
									</Link>
									<Text className="text-xs text-muted-foreground">•</Text>
									<Link href="https://trainaa.com/imprint" target="_blank">
										<Text className="text-xs text-muted-foreground">{t("auth.imprint")}</Text>
									</Link>
								</View>

								{/* Theme and Language Switch Buttons */}
								<View className="flex-row justify-center gap-3 mt-4">
									<TouchableOpacity
										onPress={toggleLanguage}
										className="w-7 h-7 items-center justify-center opacity-60"
										accessibilityLabel="Switch language"
									>
										<Languages size={14} color={isDark ? "#9ca3af" : "#6b7280"} />
									</TouchableOpacity>
									<TouchableOpacity onPress={toggleTheme} className="w-7 h-7 items-center justify-center opacity-60" accessibilityLabel="Toggle theme">
										{isDark ? <Sun size={14} color="#9ca3af" /> : <Moon size={14} color="#6b7280" />}
									</TouchableOpacity>
								</View>
							</ScrollView>
						</View>
					</View>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</View>
	);
}
