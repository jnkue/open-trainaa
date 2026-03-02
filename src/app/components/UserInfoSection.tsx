import React, {useState} from "react";
import {View, Text, TouchableOpacity} from "react-native";
import {useAuth} from "@/contexts/AuthContext";
import {useTranslation} from "react-i18next";
import {useLanguage} from "@/contexts/LanguageContext";
import {ChevronDown, Check} from "lucide-react-native";
import {useTheme} from "@/contexts/ThemeContext";
import {ChangePasswordModal} from "./ChangePasswordModal";
import {SettingsSection} from "@/components/settings/SettingsSection";

export function UserInfoSection() {
	const {t} = useTranslation();
	const {currentLanguage, availableLanguages, changeLanguage} = useLanguage();
	const {user} = useAuth();
	const {isDark} = useTheme();
	const [showChangePassword, setShowChangePassword] = useState(false);
	const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);

	const currentLanguageLabel = t(`languages.${currentLanguage}`);

	if (!user) return null;

	return (
		<>
			{/* User Info Card */}
			<SettingsSection>
				<View className="flex-row items-center mb-4">
					<View className="w-15 h-15 rounded-full bg-primary items-center justify-center mr-4">
						<Text className="text-2xl font-semibold text-primary-foreground">{user.email?.[0]?.toUpperCase() || "U"}</Text>
					</View>
					<View className="flex-1">
						<Text className="text-lg font-semibold text-foreground mb-1">{t("settings.user")}</Text>
						<Text className="text-base text-muted-foreground">{user.email}</Text>
					</View>
				</View>

				{/* Change Password Button */}
				<TouchableOpacity
					onPress={() => setShowChangePassword(true)}
					className="flex-row items-center p-3 rounded-lg bg-muted/30 mt-2"
				>
					<Text className="text-base text-foreground ml-3">{t("auth.changePassword")}</Text>
				</TouchableOpacity>
			</SettingsSection>

			{/* Language Selection */}
			<SettingsSection
				title={t("settings.language")}
				style={showLanguageDropdown ? {zIndex: 100} : undefined}
				cardStyle={showLanguageDropdown ? {overflow: "visible"} : undefined}
			>
				<View>
					<TouchableOpacity
						onPress={() => setShowLanguageDropdown(!showLanguageDropdown)}
						className="flex-row items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
					>
						<Text className="text-base text-foreground">{currentLanguageLabel}</Text>
						<ChevronDown size={20} color={isDark ? "#a1a1aa" : "#71717a"} />
					</TouchableOpacity>

					{showLanguageDropdown && (
						<View
							className="absolute top-14 left-0 right-0 bg-card border border-border rounded-lg shadow-lg"
							style={{zIndex: 1000, elevation: 10}}
						>
							{availableLanguages.map((language) => (
								<TouchableOpacity
									key={language.code}
									onPress={() => {
										changeLanguage(language.code);
										setShowLanguageDropdown(false);
									}}
									className={`flex-row items-center justify-between p-3 ${
										language.code !== availableLanguages[availableLanguages.length - 1].code ? "border-b border-border" : ""
									}`}
								>
									<Text
										className={`text-base ${currentLanguage === language.code ? "text-primary font-semibold" : "text-foreground"}`}
									>
										{t(`languages.${language.code}`)}
									</Text>
									{currentLanguage === language.code && <Check size={18} color={isDark ? "#22c55e" : "#16a34a"} />}
								</TouchableOpacity>
							))}
						</View>
					)}
				</View>
			</SettingsSection>

			{/* Change Password Modal */}
			<ChangePasswordModal visible={showChangePassword} onClose={() => setShowChangePassword(false)} />
		</>
	);
}
