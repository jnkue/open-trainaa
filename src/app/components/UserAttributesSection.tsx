import React from "react";
import {View, Text, TextInput, ActivityIndicator, TouchableOpacity} from "react-native";
import {useUserAttributes} from "../hooks/useUserAttributes";
import {useAuth} from "../contexts/AuthContext";
import {AIToolsService} from "../services/aiTools";
import {Switch} from "@/components/ui/switch";
import {useTranslation} from "react-i18next";
import {TrainingZones} from "./TrainingZones";
import {apiClient} from "../services/api";
import {showAlert} from "@/utils/alert";
import {SettingsSection} from "@/components/settings/SettingsSection";

interface AttributeField {
	key: string;
	labelKey: string;
	keyboard: "numeric" | "default";
	category?: "performance" | "basic";
	unitKey?: string;
	placeholderKey?: string;
	hasAICalculation?: boolean;
}

const USER_ATTRIBUTE_FIELDS: AttributeField[] = [
	{
		key: "max_heart_rate",
		labelKey: "userAttributes.maxHeartRate",
		keyboard: "numeric",
		category: "performance",
		unitKey: "userAttributes.bpm",
		placeholderKey: "userAttributes.placeholders.maxHeartRate",
		hasAICalculation: true,
	},
	{
		key: "functional_threshold_power",
		labelKey: "userAttributes.functionalThresholdPower",
		keyboard: "numeric",
		category: "performance",
		unitKey: "userAttributes.watt",
		placeholderKey: "userAttributes.placeholders.functionalThresholdPower",
		hasAICalculation: true,
	},
];

export function UserAttributesSection() {
	const {attributes, attrLoading, handleChangeAttr, handleSaveAttr, getAttributeValue, isFieldSaving} = useUserAttributes();
	const {session, user} = useAuth();
	const {t} = useTranslation();
	const [isCalculatingAI, setIsCalculatingAI] = React.useState<{[key: string]: boolean}>({});
	const [isSwitchLoading, setIsSwitchLoading] = React.useState(false);

	// Get automatic mode from attributes, default to true
	const isAutomaticMode = attributes?.automatic_calculation_mode ?? true;

	const performanceSectionEnabled = !!session?.access_token;
	const performanceFields = USER_ATTRIBUTE_FIELDS.filter((field) => field.category === "performance");

	const handleAICalculation = React.useCallback(
		async (fieldKey: string) => {
			if (!session?.access_token || !user?.id) {
				showAlert(t("userAttributes.alerts.notAvailable"), t("userAttributes.alerts.aiCalculationsRequireAuth"));
				return;
			}

			if (!AIToolsService.isSupportedField(fieldKey)) {
				showAlert(t("userAttributes.alerts.notSupported"), t("userAttributes.alerts.aiCalculationNotAvailable"));
				return;
			}

			setIsCalculatingAI((prev) => ({...prev, [fieldKey]: true}));
			try {
				const result = await AIToolsService.calculateAttribute({
					user_id: user.id,
					field_type: fieldKey as "max_heart_rate" | "functional_threshold_power" | "threshold_heart_rate" | "run_threshold_pace",
				});

				if (result && result.calculated_value) {
					handleChangeAttr(fieldKey, result.calculated_value.toString());
					handleSaveAttr(fieldKey);
				} else {
					showAlert(t("userAttributes.alerts.insufficientData"), t("userAttributes.alerts.moreDataRequired"));
				}
			} catch (error) {
				console.error("AI calculation error:", error);
				showAlert(t("userAttributes.alerts.error"), t("userAttributes.alerts.calculationFailed"));
			} finally {
				setIsCalculatingAI((prev) => ({...prev, [fieldKey]: false}));
			}
		},
		[session?.access_token, user?.id, handleChangeAttr, handleSaveAttr, t]
	);

	const setIsAutomaticMode = React.useCallback(
		async (value: boolean) => {
			handleChangeAttr("automatic_calculation_mode", value);

			// If turning on automatic mode, clear manual values and trigger AI calculations
			if (value && performanceSectionEnabled && user?.id) {
				setIsSwitchLoading(true);
				try {
					// First, clear all manual values by setting them to null directly in DB
					const fieldsToCalculate = performanceFields.filter(field => field.hasAICalculation);

					// Build update object with all fields set to null
					const updateData: Record<string, null> = {};
					for (const field of fieldsToCalculate) {
						updateData[field.key] = null;
						handleChangeAttr(field.key, "");
					}

					// Clear the values in the database
					const { error } = await apiClient.supabase
						.from("user_infos")
						.update(updateData)
						.eq("user_id", user.id);

					if (error) {
						console.error("Error clearing values:", error);
						throw error;
					}

					// Wait a moment for the update to propagate
					await new Promise(resolve => setTimeout(resolve, 500));

					// Then trigger all AI calculations in parallel
					const calculations = fieldsToCalculate.map(field => handleAICalculation(field.key));
					await Promise.all(calculations);
				} catch (error) {
					console.error('Error in setIsAutomaticMode:', error);
				} finally {
					setIsSwitchLoading(false);
				}
			}
		},
		[handleChangeAttr, performanceSectionEnabled, performanceFields, handleAICalculation, user?.id]
	);

	const renderField = (field: AttributeField) => {
		const value = getAttributeValue(field.key);
		const isSaving = isFieldSaving(field.key);

		return (
			<View key={field.key} className="m-0 p-0">
				<View className="border border-border rounded-xl p-4 mb-4">
					<View className="flex-row items-center mb-2">
						<View className="flex-1">
							<Text className="text-base font-semibold text-foreground">{t(field.labelKey)}</Text>
						</View>
					</View>

					<View className="items-start">
						{isAutomaticMode && field.hasAICalculation && performanceSectionEnabled ? (
							<>
								{isCalculatingAI[field.key] ? (
									<View className="flex-row items-center space-x-2">
										<ActivityIndicator size="small" color="#ffffff" />
										<Text className="text-sm text-muted-foreground">{t("userAttributes.calculating")}</Text>
									</View>
								) : value ? (
									<View className="flex-col space-y-1">
										<View className="flex-row items-center space-x-2">
											<Text className="text-base font-medium text-foreground">
												{value}{field.unitKey ? ` ${t(field.unitKey)}` : ""}
											</Text>
											<Text className="text-sm text-green-600">{t("userAttributes.automaticallyCalculated")}</Text>
										</View>

										<TouchableOpacity
											className="bg-primary rounded-lg px-3 py-2 mt-2 self-start"
											onPress={() => handleAICalculation(field.key)}
											disabled={isCalculatingAI[field.key] || isSaving}
										>
											<Text className="text-primary-foreground font-medium text-sm">{t("userAttributes.recalculate")}</Text>
										</TouchableOpacity>
									</View>
								) : (
									<TouchableOpacity
										className="bg-primary rounded-lg px-3 py-2"
										onPress={() => handleAICalculation(field.key)}
										disabled={isCalculatingAI[field.key] || isSaving}
									>
										<Text className="text-primary-foreground font-medium text-sm">{t("userAttributes.calculateAutomatically")}</Text>
									</TouchableOpacity>
								)}
							</>
						) : (
							<View className="flex-row items-center w-full">
								<TextInput
									className="bg-input border border-border rounded-lg px-3 py-2 text-foreground text-base max-w-[200px]"
									placeholderTextColor="#9CA3AF"
									value={value}
									onChangeText={(text) => handleChangeAttr(field.key, text)}
									onBlur={() => handleSaveAttr(field.key)}
									placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
									keyboardType={field.keyboard}
									returnKeyType="done"
									editable={!isSaving && !isCalculatingAI[field.key]}
								/>
								{isSaving && (
									<View className="ml-2 flex-row items-center">
										<ActivityIndicator size="small" className="text-primary mr-1" />
										<Text className="text-sm text-muted-foreground">{t("userAttributes.saving")}</Text>
									</View>
								)}
							</View>
						)}
					</View>

					{/* Show Heart Rate Zones immediately after Max Heart Rate field */}
					{field.key === "max_heart_rate" && getAttributeValue("max_heart_rate") && (
						<TrainingZones type="heartRate" maxValue={parseInt(getAttributeValue("max_heart_rate") || "0")} showPreview={true} showOnlyBar={true} />
					)}

					{/* Show Power Zones immediately after FTP field */}
					{field.key === "functional_threshold_power" && getAttributeValue("functional_threshold_power") && (
						<TrainingZones
							type="power"
							maxValue={parseInt(getAttributeValue("functional_threshold_power") || "0")}
							showPreview={true}
							showOnlyBar={true}
						/>
					)}
				</View>
			</View>
		);
	};

	const renderFieldGroup = (title: string, fields: AttributeField[]) => {
		if (fields.length === 0) return null;

		return <View>{fields.map(renderField)}</View>;
	};

	if (attrLoading) {
		return (
			<SettingsSection title={t("userAttributes.title")}>
				<View className="flex-row items-center justify-center py-8">
					<ActivityIndicator size="small" className="text-foreground" />
					<Text className="text-base text-muted-foreground ml-3">{t("userAttributes.loadingAttributes")}</Text>
				</View>
			</SettingsSection>
		);
	}

	return (
		<SettingsSection
			title={t("userAttributes.title")}
			description={t("userAttributes.description")}
			rightElement={performanceSectionEnabled ? (
				<View className="flex-row items-center">
					{isSwitchLoading && (
						<ActivityIndicator size="small" className="text-primary mr-2" />
					)}
					<Text className="text-sm text-muted-foreground mr-2">
						{isAutomaticMode ? t("userAttributes.automatic") : t("userAttributes.manual")}
					</Text>
					<Switch checked={isAutomaticMode} onCheckedChange={setIsAutomaticMode} disabled={isSwitchLoading} />
				</View>
			) : undefined}
		>
			{performanceSectionEnabled ? (
				<>{renderFieldGroup("Performance-Parameter", performanceFields)}</>
			) : (
				<Text className="text-lg text-muted-foreground text-center py-8">{t("userAttributes.signInRequired")}</Text>
			)}
		</SettingsSection>
	);
}
