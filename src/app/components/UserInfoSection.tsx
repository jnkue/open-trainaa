import React, {useState, useMemo} from "react";
import {View, Text, TouchableOpacity, Modal, FlatList, TextInput, SafeAreaView} from "react-native";
import {useAuth} from "@/contexts/AuthContext";
import {useTranslation} from "react-i18next";
import {useLanguage} from "@/contexts/LanguageContext";
import {apiClient} from "@/services/api";

import {ChangePasswordModal} from "./ChangePasswordModal";
import {SettingsSection} from "@/components/settings/SettingsSection";
import {Switch} from "@/components/ui/switch";
import {IconSymbol} from "@/components/ui/IconSymbol";
import {useNotificationPreferences} from "@/hooks/useNotificationPreferences";
import {useUserAttributes} from "@/hooks/useUserAttributes";

const TIMEZONES = [
	"Africa/Abidjan", "Africa/Accra", "Africa/Algiers", "Africa/Cairo", "Africa/Casablanca",
	"Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi", "Africa/Tunis",
	"America/Anchorage", "America/Argentina/Buenos_Aires", "America/Bogota", "America/Chicago",
	"America/Denver", "America/Edmonton", "America/Halifax", "America/Havana",
	"America/Los_Angeles", "America/Manaus", "America/Mexico_City", "America/New_York",
	"America/Phoenix", "America/Santiago", "America/Sao_Paulo", "America/St_Johns",
	"America/Toronto", "America/Vancouver", "America/Winnipeg",
	"Asia/Almaty", "Asia/Baghdad", "Asia/Bangkok", "Asia/Beirut", "Asia/Colombo",
	"Asia/Dhaka", "Asia/Dubai", "Asia/Ho_Chi_Minh", "Asia/Hong_Kong", "Asia/Istanbul",
	"Asia/Jakarta", "Asia/Jerusalem", "Asia/Karachi", "Asia/Kathmandu", "Asia/Kolkata",
	"Asia/Kuala_Lumpur", "Asia/Manila", "Asia/Riyadh", "Asia/Seoul", "Asia/Shanghai",
	"Asia/Singapore", "Asia/Taipei", "Asia/Tehran", "Asia/Tokyo", "Asia/Vladivostok",
	"Atlantic/Azores", "Atlantic/Reykjavik",
	"Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin", "Australia/Hobart",
	"Australia/Melbourne", "Australia/Perth", "Australia/Sydney",
	"Europe/Amsterdam", "Europe/Athens", "Europe/Belgrade", "Europe/Berlin", "Europe/Brussels",
	"Europe/Bucharest", "Europe/Budapest", "Europe/Copenhagen", "Europe/Dublin", "Europe/Helsinki",
	"Europe/Kyiv", "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Milan",
	"Europe/Moscow", "Europe/Oslo", "Europe/Paris", "Europe/Prague", "Europe/Rome",
	"Europe/Stockholm", "Europe/Vienna", "Europe/Warsaw", "Europe/Zurich",
	"Indian/Maldives", "Indian/Mauritius",
	"Pacific/Auckland", "Pacific/Fiji", "Pacific/Guam", "Pacific/Honolulu",
	"Pacific/Noumea", "Pacific/Tongatapu",
	"UTC",
];

function SettingsRow({label, value, onPress, rightElement}: {
	label: string;
	value?: string;
	onPress?: () => void;
	rightElement?: React.ReactNode;
}) {
	const content = (
		<View className="flex-row items-center justify-between py-3">
			<Text className="text-base text-foreground">{label}</Text>
			{rightElement ?? (
				<View className="flex-row items-center">
					{value && <Text className="text-sm text-muted-foreground mr-1">{value}</Text>}
					{onPress && <IconSymbol name="chevron.right" size={16} color="#9CA3AF" />}
				</View>
			)}
		</View>
	);

	if (onPress) {
		return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
	}
	return content;
}

function Divider() {
	return <View className="border-t border-border/50" />;
}

export function UserInfoSection() {
	const {t} = useTranslation();
	const {currentLanguage, availableLanguages, changeLanguage} = useLanguage();
	const {user} = useAuth();
	const [showChangePassword, setShowChangePassword] = useState(false);
	const [showLanguageModal, setShowLanguageModal] = useState(false);
	const [showTimezoneModal, setShowTimezoneModal] = useState(false);
	const [timezoneSearch, setTimezoneSearch] = useState("");
	const [isEditingName, setIsEditingName] = useState(false);
	const [nameInput, setNameInput] = useState("");
	const [nameSaving, setNameSaving] = useState(false);

	const isApplePrivateRelay = user?.email?.endsWith("@privaterelay.appleid.com") ?? false;

	const provider = user?.app_metadata?.provider as string | undefined;
	const isOAuthUser = provider === "google" || provider === "apple";

	const displayName = useMemo(() => {
		const metaName = user?.user_metadata?.full_name;
		if (metaName) return metaName;
		if (user?.email) return user.email.split("@")[0];
		return "";
	}, [user?.user_metadata?.full_name, user?.email]);

	const showEmail = !isApplePrivateRelay && !!user?.email;

	const handleStartEditName = () => {
		setNameInput(displayName);
		setIsEditingName(true);
	};

	const handleSaveName = async () => {
		const trimmed = nameInput.trim();
		if (!trimmed || trimmed === displayName) {
			setIsEditingName(false);
			return;
		}
		setNameSaving(true);
		try {
			await apiClient.supabase.auth.updateUser({
				data: { full_name: trimmed },
			});
			setIsEditingName(false);
		} catch (error) {
			console.error("Failed to update name:", error);
		} finally {
			setNameSaving(false);
		}
	};

	const {
		feedbackEnabled,
		dailyOverviewEnabled,
		isLoading: notifLoading,
		saveFeedbackPreference,
		saveDailyOverviewPreference,
	} = useNotificationPreferences();

	const {attributes, handleChangeAttr} = useUserAttributes();

	const currentTimezone = attributes?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

	const filteredTimezones = useMemo(() => {
		if (!timezoneSearch.trim()) return TIMEZONES;
		const lower = timezoneSearch.toLowerCase();
		return TIMEZONES.filter((tz) => tz.toLowerCase().includes(lower));
	}, [timezoneSearch]);

	const handleTimezoneSelect = (tz: string) => {
		handleChangeAttr("timezone", tz);
		setShowTimezoneModal(false);
		setTimezoneSearch("");
	};

	if (!user) return null;

	return (
		<>
			<SettingsSection>
				{/* User Info */}
				<View className="flex-row items-center py-1">
					<View className="w-12 h-12 rounded-full bg-primary items-center justify-center mr-3">
						<Text className="text-lg font-semibold text-primary-foreground">{displayName[0]?.toUpperCase() || "U"}</Text>
					</View>
					<View className="flex-1">
						{isEditingName ? (
							<View className="flex-row items-center gap-2">
								<TextInput
									className="flex-1 text-base text-foreground bg-muted rounded-lg px-3 py-2"
									value={nameInput}
									onChangeText={setNameInput}
									autoFocus
									onSubmitEditing={handleSaveName}
									returnKeyType="done"
									editable={!nameSaving}
								/>
								<TouchableOpacity onPress={handleSaveName} disabled={nameSaving}>
									<IconSymbol name="checkmark" size={20} color="#22C55E" />
								</TouchableOpacity>
								<TouchableOpacity onPress={() => setIsEditingName(false)} disabled={nameSaving}>
									<IconSymbol name="xmark" size={20} color="#9CA3AF" />
								</TouchableOpacity>
							</View>
						) : (
							<TouchableOpacity onPress={handleStartEditName}>
								<View className="flex-row items-center gap-1">
									<Text className="text-base font-semibold text-foreground">{displayName}</Text>
									<IconSymbol name="pencil" size={14} color="#9CA3AF" />
								</View>
							</TouchableOpacity>
						)}
						{showEmail && (
							<Text className="text-sm text-muted-foreground">{user.email}</Text>
						)}
					</View>
				</View>

				<Divider />

				{isOAuthUser && (
					<>
						<SettingsRow
							label={t("settings.signedInWith")}
							value={provider === "google" ? t("settings.providerGoogle") : t("settings.providerApple")}
						/>
						<Divider />
					</>
				)}

				{!isOAuthUser && (
					<>
						<SettingsRow
							label={t("auth.changePassword")}
							onPress={() => setShowChangePassword(true)}
						/>
						<Divider />
					</>
				)}

				<SettingsRow
					label={t("settings.language")}
					value={t(`languages.${currentLanguage}`)}
					onPress={() => setShowLanguageModal(true)}
				/>

				<Divider />

				<SettingsRow
					label={t("settings.timezoneLabel")}
					value={currentTimezone.replace(/_/g, " ")}
					onPress={() => setShowTimezoneModal(true)}
				/>

				</SettingsSection>

			{/* Notifications */}
			{!notifLoading && (
				<SettingsSection title={t("settings.sectionNotifications")}>
					<SettingsRow
						label={t("notifications.feedbackLabel")}
						rightElement={
							<Switch
								checked={feedbackEnabled}
								onCheckedChange={saveFeedbackPreference}
							/>
						}
					/>

					<Divider />

					<SettingsRow
						label={t("notifications.dailyOverviewLabel")}
						rightElement={
							<Switch
								checked={dailyOverviewEnabled}
								onCheckedChange={saveDailyOverviewPreference}
							/>
						}
					/>
				</SettingsSection>
			)}

			{/* Change Password Modal */}
			<ChangePasswordModal
				visible={showChangePassword}
				onClose={() => setShowChangePassword(false)}
			/>

			{/* Language Modal */}
			<Modal
				visible={showLanguageModal}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => setShowLanguageModal(false)}
			>
				<SafeAreaView className="flex-1 bg-background">
					<View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
						<Text className="text-lg font-semibold text-foreground">
							{t("settings.language")}
						</Text>
						<TouchableOpacity onPress={() => setShowLanguageModal(false)}>
							<IconSymbol name="xmark" size={20} color="#9CA3AF" />
						</TouchableOpacity>
					</View>

					{availableLanguages.map((language, index) => (
						<TouchableOpacity
							key={language.code}
							onPress={() => {
								changeLanguage(language.code);
								setShowLanguageModal(false);
							}}
							className={`px-4 py-3 ${index < availableLanguages.length - 1 ? "border-b border-border/50" : ""}`}
						>
							<View className="flex-row items-center justify-between">
								<Text className="text-base text-foreground">
									{t(`languages.${language.code}`)}
								</Text>
								{currentLanguage === language.code && (
									<IconSymbol name="checkmark" size={18} color="#22C55E" />
								)}
							</View>
						</TouchableOpacity>
					))}
				</SafeAreaView>
			</Modal>

			{/* Timezone Modal */}
			<Modal
				visible={showTimezoneModal}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => {
					setShowTimezoneModal(false);
					setTimezoneSearch("");
				}}
			>
				<SafeAreaView className="flex-1 bg-background">
					<View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
						<Text className="text-lg font-semibold text-foreground">
							{t("settings.timezoneLabel")}
						</Text>
						<TouchableOpacity onPress={() => {
							setShowTimezoneModal(false);
							setTimezoneSearch("");
						}}>
							<IconSymbol name="xmark" size={20} color="#9CA3AF" />
						</TouchableOpacity>
					</View>

					<View className="px-4 py-2">
						<TextInput
							className="bg-muted rounded-lg px-4 py-3 text-foreground"
							placeholder={t("settings.timezoneSearchPlaceholder")}
							placeholderTextColor="#9CA3AF"
							value={timezoneSearch}
							onChangeText={setTimezoneSearch}
							autoFocus
						/>
					</View>

					<FlatList
						data={filteredTimezones}
						keyExtractor={(item) => item}
						renderItem={({item}) => (
							<TouchableOpacity
								className="px-4 py-3 border-b border-border/50"
								onPress={() => handleTimezoneSelect(item)}
							>
								<View className="flex-row items-center justify-between">
									<Text className="text-base text-foreground">
										{item.replace(/_/g, " ")}
									</Text>
									{item === currentTimezone && (
										<IconSymbol name="checkmark" size={18} color="#22C55E" />
									)}
								</View>
							</TouchableOpacity>
						)}
						keyboardShouldPersistTaps="handled"
					/>
				</SafeAreaView>
			</Modal>
		</>
	);
}
