import React, {useState} from "react";
import {View, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, TouchableOpacity} from "react-native";
import {Link, useRouter} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {useTheme} from "@/contexts/ThemeContext";
import {useLanguage} from "@/contexts/LanguageContext";
import {StatusBar} from "expo-status-bar";
import {Button, Input, Text} from "@/components/ui";
import {useTranslation} from "react-i18next";
import {Eye, EyeOff, Languages, Moon, Sun} from "lucide-react-native";

export default function LoginScreen() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [errors, setErrors] = useState<{email?: string; password?: string; general?: string}>({});
	const {signIn} = useAuth();
	const {isDark, theme, setTheme} = useTheme();
	const {currentLanguage, availableLanguages, changeLanguage} = useLanguage();
	const {t} = useTranslation();
	const router = useRouter();

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

	const getSupabaseErrorMessage = (error: any): string => {
		// Handle Supabase auth errors
		if (error?.message) {
			const message = error.message.toLowerCase();

			// Invalid login credentials
			if (message.includes("invalid login credentials") || message.includes("invalid email or password")) {
				return t("auth.invalidCredentials");
			}

			// Email not confirmed
			if (message.includes("email not confirmed")) {
				return t("auth.emailNotConfirmed");
			}

			// User not found
			if (message.includes("user not found")) {
				return t("auth.userNotFound");
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
		return error?.message || t("auth.checkCredentials");
	};

	const handleLogin = async () => {
		// Clear previous errors
		setErrors({});

		// Validate inputs
		const newErrors: {email?: string; password?: string} = {};

		if (!email.trim()) {
			newErrors.email = t("auth.emailRequired");
		} else if (!validateEmail(email)) {
			newErrors.email = t("auth.invalidEmail");
		}

		if (!password) {
			newErrors.password = t("auth.passwordRequired");
		}

		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		}

		setLoading(true);
		try {
			await signIn(email, password);
			// On web, redirect to index. On mobile, redirect to chat
			if (Platform.OS === "web") {
				router.push("/");
			} else {
				router.push("/chat");
			}
		} catch (error: any) {
			console.error("Login error:", error);
			setErrors({general: getSupabaseErrorMessage(error)});
		} finally {
			setLoading(false);
		}
	};

	return (
		<View className="flex-1 bg-background">
			<StatusBar style={isDark ? "light" : "dark"} />
			
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
									<View className="items-center mb-6 ">
										<Image
											source={isDark ? logoWhite : logoBlack}
											style={{
												resizeMode: "contain",
												width: 250,
											}}
										/>
									</View>
									<Text className="text-3xl font-bold text-foreground text-center mb-2">{t("auth.welcomeBack")}</Text>
									<Text className="text-lg text-muted-foreground text-center">{t("auth.signInToAccount")}</Text>
								</View>

								{/* Form */}
								<View className="space-y-6">
									{errors.general && (
										<View className="bg-destructive/10 border border-destructive rounded-lg p-3">
											<Text className="text-destructive text-sm">{errors.general}</Text>
										</View>
									)}

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
												secureTextEntry={!showPassword}
												autoCapitalize="none"
												autoCorrect={false}
												autoComplete="password"
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
									</View>

									<View className="space-y-4 mt-8">
										<Button onPress={handleLogin} disabled={loading} className="h-12">
											{loading ? <ActivityIndicator color="white" /> : <Text className="text-primary-foreground">{t("auth.signIn")}</Text>}
										</Button>

										<Button variant="ghost" onPress={() => router.push("/(auth)/forgot-password")} className="h-12">
											<Text className="text-base text-muted-foreground font-medium">{t("auth.forgotPassword")}</Text>
										</Button>
									</View>
								</View>

								{/* Footer */}
								<View className="flex-row justify-center items-center mt-12 pt-6 border-t border-border">
									<Text className="text-base text-muted-foreground">{t("auth.dontHaveAccount")} </Text>
									<Link href="/(auth)/register">
										<Text className="text-base text-foreground font-semibold ml-1">{t("auth.signUp")}</Text>
									</Link>
								</View>

								{/* Privacy, Terms, Imprint and License Links */}
								<View className="flex-row justify-center items-center gap-2 mt-8 flex-wrap">
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
									<Text className="text-xs text-muted-foreground">•</Text>
									<Link href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank">
										<Text className="text-xs text-muted-foreground">{t("auth.licenseAgreement")}</Text>
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
									<TouchableOpacity
										onPress={toggleTheme}
										className="w-7 h-7 items-center justify-center opacity-60"
										accessibilityLabel="Toggle theme"
									>
										{isDark ? <Sun size={14} color="#9ca3af" /> : <Moon size={14} color="#6b7280" />}
									</TouchableOpacity>

								</View>
							</ScrollView>
						</View>
					</View>
				</KeyboardAvoidingView>
	
		</View>
	);
}
