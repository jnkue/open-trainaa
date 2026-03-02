import React, {useState} from "react";
import {View, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, TouchableOpacity} from "react-native";
import {useRouter} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {useTheme} from "@/contexts/ThemeContext";
import {SafeAreaView} from "react-native-safe-area-context";
import {StatusBar} from "expo-status-bar";
import {Button, Input, Text} from "@/components/ui";
import {useTranslation} from "react-i18next";
import { Languages, Moon, Sun } from "lucide-react-native";
import { useLanguage } from "@/contexts/LanguageContext";


export default function ForgotPasswordScreen() {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [errors, setErrors] = useState<{email?: string; general?: string}>({});
	const {resetPassword} = useAuth();
	const {isDark, theme,setTheme} = useTheme();
	const {t} = useTranslation();
	const router = useRouter();
		const {currentLanguage, availableLanguages, changeLanguage} = useLanguage();

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

	const handleResetPassword = async () => {
		setErrors({});

		// Validate email
		if (!email.trim()) {
			setErrors({email: t("auth.emailRequired")});
			return;
		}

		if (!validateEmail(email)) {
			setErrors({email: t("auth.invalidEmail")});
			return;
		}

		setLoading(true);
		try {
			await resetPassword(email);
			setEmailSent(true);
		} catch (error: any) {
			console.error("Password reset error:", error);
			setErrors({general: error?.message || t("auth.passwordResetError")});
		} finally {
			setLoading(false);
		}
	};

	if (emailSent) {
		return (
			<View className="flex-1 bg-background">
				<StatusBar style={isDark ? "light" : "dark"} />
				<SafeAreaView className="flex-1">
					<View className="flex-1 items-center justify-center px-6">
						<View className="w-full max-w-md">
							<View className="items-center mb-8"

							>
								<TouchableOpacity onPress={() => router.push("/")} accessibilityRole="button" accessibilityLabel={t("navigation.openLogin")}>


								<Image
									source={isDark ? logoWhite : logoBlack}
									style={{
										resizeMode: "contain",
										width: 200,
									}}
								/>
								</TouchableOpacity>
							</View>

							<View className="   rounded-lg p-6 mb-6">
								<Text className="text-xl font-bold text-foreground mb-3 text-center">
									{t("auth.emailSent")}
								</Text>
								<Text className="text-base text-muted-foreground text-center">
									{t("auth.passwordResetEmailSent")}
								</Text>
							</View>

							<Button onPress={() => router.push("/(auth)/login")} className="h-12">
								<Text className="text-primary-foreground">{t("auth.backToLogin")}</Text>
							</Button>
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
							<TouchableOpacity onPress={() => router.push("/")} accessibilityRole="button" accessibilityLabel={t("navigation.openLogin")}>
											<Image
												source={isDark ? logoWhite : logoBlack}
												style={{
										resizeMode: "contain",
										width: 200,
									}}
								/>
								</TouchableOpacity>
									</View>
									<Text className="text-3xl font-bold text-foreground text-center mb-2">
										{t("auth.forgotPasswordTitle")}
									</Text>
									<Text className="text-lg text-muted-foreground text-center">
										{t("auth.forgotPasswordDescription")}
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

									<View className="space-y-4 mt-8">
										<Button onPress={handleResetPassword} disabled={loading} className="h-12">
											{loading ? (
												<ActivityIndicator color="white" />
											) : (
												<Text className="text-primary-foreground">{t("auth.sendResetLink")}</Text>
											)}
										</Button>

										<Button variant="ghost" onPress={() => router.back()} className="h-12">
											<Text className="text-base text-muted-foreground font-medium">{t("auth.backToLogin")}</Text>
										</Button>
									</View>
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
			</SafeAreaView>
		</View>
	);
}
