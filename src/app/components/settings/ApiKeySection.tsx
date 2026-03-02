import React, {useState, useEffect} from "react";
import {View, Text, TouchableOpacity, ActivityIndicator} from "react-native";
import {useTranslation} from "react-i18next";
import {useAuth} from "@/contexts/AuthContext";
import {apiClient} from "@/services/api";
import {showAlert} from "@/utils/alert";
import {SettingsSection} from "./SettingsSection";
import {Input} from "@/components/ui/input";
import {Switch} from "@/components/ui/switch";

interface ApiKeyStatus {
	has_api_key: boolean;
	accepted_at: string | null;
}

export function ApiKeySection() {
	const {t} = useTranslation();
	const {user} = useAuth();

	const [expanded, setExpanded] = useState(false);
	const [accepted, setAccepted] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [status, setStatus] = useState<ApiKeyStatus | null>(null);

	useEffect(() => {
		if (user?.id) {
			fetchStatus();
		}
	}, [user?.id]);

	const fetchStatus = async () => {
		try {
			setLoading(true);
			const result = await apiClient.get<ApiKeyStatus>("/v1/user-attributes/api-key");
			setStatus(result);
			if (result.has_api_key) {
				setExpanded(true);
			}
		} catch (error) {
			console.error("Error fetching API key status:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleSave = async () => {
		if (!apiKey.trim()) return;

		try {
			setSaving(true);
			const result = await apiClient.put<ApiKeyStatus>("/v1/user-attributes/api-key", {
				api_key: apiKey.trim(),
				accepted_terms: true,
			});
			setStatus(result);
			setApiKey("");
			showAlert(t("byok.title"), t("byok.keyConfigured"));
		} catch (error: any) {
			const message = error.message?.includes("400")
				? t("byok.invalidKey")
				: error.message?.includes("502")
					? t("byok.validationUnavailable")
					: t("common.error");
			showAlert(t("common.error"), message);
		} finally {
			setSaving(false);
		}
	};

	const handleRemove = async () => {
		try {
			setRemoving(true);
			await apiClient.delete("/v1/user-attributes/api-key");
			setStatus({has_api_key: false, accepted_at: null});
			setAccepted(false);
			showAlert(t("byok.title"), t("byok.keyRemoved"));
		} catch (error) {
			console.error("Error removing API key:", error);
			showAlert(t("common.error"), t("common.error"));
		} finally {
			setRemoving(false);
		}
	};

	if (loading) return null;

	return (
		<SettingsSection>
			{/* Collapsed toggle */}
			<TouchableOpacity
				onPress={() => setExpanded(!expanded)}
				className="flex-row items-center justify-between"
			>
				<Text className="text-sm text-muted-foreground">
					{t("byok.showAdvanced")}
				</Text>
				<Text className="text-sm text-muted-foreground">
					{expanded ? "−" : "+"}
				</Text>
			</TouchableOpacity>

			{expanded && (
				<View className="mt-4">
		

					{/* Description */}
					<Text className="text-sm text-muted-foreground mb-4">
						{t("byok.description")}
					</Text>

					{status?.has_api_key ? (
						/* Key already configured */
						<View>
							<View className="flex-row items-center justify-between p-3 rounded-lg bg-muted/30 mb-3">
								<Text className="text-base text-foreground">
									{t("byok.keyConfigured")}
								</Text>
								<View className="px-3 py-1 rounded-full bg-green-500/20">
									<Text className="text-sm font-semibold text-green-600 dark:text-green-400">
										{t("subscription.active")}
									</Text>
								</View>
							</View>
							<TouchableOpacity
								onPress={handleRemove}
								disabled={removing}
								className="border border-destructive/30 rounded-lg py-2.5 px-4 active:opacity-80"
							>
								{removing ? (
									<ActivityIndicator size="small" />
								) : (
									<Text className="text-destructive font-medium text-center text-sm">
										{t("byok.removeKey")}
									</Text>
								)}
							</TouchableOpacity>
						</View>
					) : (
						/* Key not configured — setup flow */
						<View>
							{/* Warning */}
							<View className="mb-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
								<Text className="text-sm font-semibold text-destructive mb-1">
									{t("byok.warningTitle")}
								</Text>
								<Text className="text-xs text-muted-foreground leading-5">
									{t("byok.warningMessage")}
								</Text>
							</View>

							{/* Accept terms toggle */}
							<View className="flex-row items-center justify-between mb-4">
								<View className="flex-1 mr-4">
									<Text className="text-sm text-foreground">
										{t("byok.acceptTerms")}
									</Text>
								</View>
								<Switch
									checked={accepted}
									onCheckedChange={setAccepted}
								/>
							</View>

							{/* API key input — only shown after acceptance */}
							{accepted && (
								<View>
									<Input
										value={apiKey}
										onChangeText={setApiKey}
										placeholder={t("byok.apiKeyPlaceholder")}
										secureTextEntry
										autoCapitalize="none"
										autoCorrect={false}
										className="mb-3"
									/>
									<TouchableOpacity
										onPress={handleSave}
										disabled={saving || !apiKey.trim()}
										className={`border border-border rounded-lg py-2.5 px-4 active:opacity-80 ${
											!apiKey.trim() ? "opacity-40" : ""
										}`}
									>
										{saving ? (
											<ActivityIndicator size="small" />
										) : (
											<Text className="text-foreground font-medium text-center text-sm">
												{saving ? t("byok.validating") : t("byok.saveKey")}
											</Text>
										)}
									</TouchableOpacity>
								</View>
							)}
						</View>
					)}
				</View>
			)}
		</SettingsSection>
	);
}
