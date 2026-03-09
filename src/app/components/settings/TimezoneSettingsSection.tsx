import React, { useState, useMemo } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	Modal,
	FlatList,
	TextInput,
	SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "./SettingsSection";
import { useUserAttributes } from "@/hooks/useUserAttributes";
import { IconSymbol } from "@/components/ui/IconSymbol";

// Intl.supportedValuesOf is not available in Hermes, so we use a static IANA timezone list
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

export function TimezoneSettingsSection() {
	const { t } = useTranslation();
	const { attributes, attrLoading, handleChangeAttr } = useUserAttributes();
	const [modalVisible, setModalVisible] = useState(false);
	const [search, setSearch] = useState("");

	const currentTimezone =
		attributes?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

	const filteredTimezones = useMemo(() => {
		if (!search.trim()) return TIMEZONES;
		const lower = search.toLowerCase();
		return TIMEZONES.filter((tz) => tz.toLowerCase().includes(lower));
	}, [search]);

	const handleSelect = (tz: string) => {
		handleChangeAttr("timezone", tz);
		setModalVisible(false);
		setSearch("");
	};

	if (attrLoading) return null;

	return (
		<>
			<SettingsSection>
				<TouchableOpacity
					className="flex-row items-center justify-between"
					onPress={() => setModalVisible(true)}
				>
					<View className="flex-1 mr-4">
						<Text className="text-base text-foreground font-medium">
							{t("settings.timezoneLabel")}
						</Text>
						<Text className="text-sm text-muted-foreground mt-1">
							{t("settings.timezoneDescription")}
						</Text>
					</View>
					<View className="flex-row items-center">
						<Text className="text-sm text-muted-foreground mr-1">
							{currentTimezone.replace(/_/g, " ")}
						</Text>
						<IconSymbol name="chevron.right" size={16} color="#9CA3AF" />
					</View>
				</TouchableOpacity>
			</SettingsSection>

			<Modal
				visible={modalVisible}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => {
					setModalVisible(false);
					setSearch("");
				}}
			>
				<SafeAreaView className="flex-1 bg-background">
					<View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
						<Text className="text-lg font-semibold text-foreground">
							{t("settings.timezoneLabel")}
						</Text>
						<TouchableOpacity onPress={() => {
							setModalVisible(false);
							setSearch("");
						}}>
							<IconSymbol name="xmark" size={20} color="#9CA3AF" />
						</TouchableOpacity>
					</View>

					<View className="px-4 py-2">
						<TextInput
							className="bg-muted rounded-lg px-4 py-3 text-foreground"
							placeholder={t("settings.timezoneSearchPlaceholder")}
							placeholderTextColor="#9CA3AF"
							value={search}
							onChangeText={setSearch}
							autoFocus
						/>
					</View>

					<FlatList
						data={filteredTimezones}
						keyExtractor={(item) => item}
						renderItem={({ item }) => (
							<TouchableOpacity
								className="px-4 py-3 border-b border-border/50"
								onPress={() => handleSelect(item)}
							>
								<View className="flex-row items-center justify-between">
									<Text className="text-base text-foreground">
										{item.replace(/_/g, " ")}
									</Text>
									{item === currentTimezone && (
										<IconSymbol
											name="checkmark"
											size={18}
											color="#22C55E"
										/>
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
