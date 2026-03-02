import React from "react";
import {View, Text} from "react-native";
import {useTranslation} from "react-i18next";

interface TrainingZonesProps {
	type: "power" | "heartRate";
	maxValue?: number; // FTP for power, Max HR for heart rate
	showPreview?: boolean; // Show zone distribution preview
	currentValue?: number; // Current power/HR value for preview calculation
	showOnlyBar?: boolean; // Show only the horizontal bar with numbers
	className?: string;
}

interface Zone {
	name: string;
	nameKey: string;
	minPercent: number;
	maxPercent: number;
	color: string;
}

const POWER_ZONES: Zone[] = [
	{name: "Recovery", nameKey: "zones.recovery", minPercent: 50, maxPercent: 60, color: "#22c55e"},
	{name: "Aerobic Base", nameKey: "zones.aerobicBase", minPercent: 60, maxPercent: 70, color: "#84cc16"},
	{name: "Tempo", nameKey: "zones.tempo", minPercent: 70, maxPercent: 80, color: "#eab308"},
	{name: "Threshold", nameKey: "zones.threshold", minPercent: 80, maxPercent: 90, color: "#f97316"},
	{name: "VO2 Max", nameKey: "zones.vo2Max", minPercent: 90, maxPercent: 105, color: "#ef4444"},
	{name: "Anaerobic", nameKey: "zones.anaerobic", minPercent: 105, maxPercent: 120, color: "#dc2626"},
	{name: "Neuromuscular", nameKey: "zones.neuromuscular", minPercent: 120, maxPercent: 150, color: "#991b1b"},
];

const HEART_RATE_ZONES: Zone[] = [
	{name: "Active Recovery", nameKey: "zones.activeRecovery", minPercent: 50, maxPercent: 60, color: "#22c55e"},
	{name: "Aerobic Base / Fat Burn", nameKey: "zones.aerobicBaseFatBurn", minPercent: 60, maxPercent: 70, color: "#84cc16"},
	{name: "Tempo / Aerobic Power", nameKey: "zones.tempoAerobicPower", minPercent: 70, maxPercent: 80, color: "#eab308"},
	{name: "Threshold", nameKey: "zones.threshold", minPercent: 80, maxPercent: 90, color: "#f97316"},
	{name: "VO₂ Max", nameKey: "zones.vo2Max", minPercent: 90, maxPercent: 100, color: "#ef4444"},
];

export function TrainingZones({type, maxValue, showPreview = false, currentValue, showOnlyBar = false, className}: TrainingZonesProps) {
	const {t} = useTranslation();
	const zones = type === "power" ? POWER_ZONES : HEART_RATE_ZONES;
	const unit = type === "power" ? t("zones.watt") : t("zones.bpm");
	const title = type === "power" ? t("zones.powerBasedTitle") : t("zones.heartRateTitle");

	const calculateZoneValues = (zone: Zone) => {
		if (!maxValue) return {min: 0, max: 0};
		const min = Math.round((maxValue * zone.minPercent) / 100);
		const max = Math.round((maxValue * zone.maxPercent) / 100);
		return {min, max};
	};

	const calculateZoneDistribution = () => {
		if (!currentValue || !maxValue) return zones.map(() => 14); // Equal distribution if no data

		const currentPercent = (currentValue / maxValue) * 100;

		return zones.map((zone) => {
			if (currentPercent >= zone.minPercent && currentPercent <= zone.maxPercent) {
				return 40; // Highlight the active zone
			} else if (Math.abs(currentPercent - (zone.minPercent + zone.maxPercent) / 2) < 20) {
				return 20; // Adjacent zones get some width
			} else {
				return 5; // Minimal width for other zones
			}
		});
	};

	// If showOnlyBar is true, just show the horizontal bar with zone values
	if (showOnlyBar && maxValue) {
		return (
			<View className={`my-4 p-0 ${className || ""}`}>
				{/* Horizontal Zone Bar with Numbers */}
				<View className="relative">
					<View className="flex-row h-4 rounded-full overflow-hidden">
						{zones.map((zone, i) => (
							<View
								key={i}
								style={{
									flex: 1,
									backgroundColor: zone.color,
								}}
							/>
						))}
					</View>

					{/* Zone Value Labels */}
					<View className="flex-row justify-between mt-2">
						{zones.map((zone, index) => {
							const {min, max} = calculateZoneValues(zone);
							return (
								<View key={index} className="items-center" style={{flex: 1}}>
									<Text className="text-xs font-medium text-foreground text-center">{t(zone.nameKey)}</Text>
									<Text className="text-xs text-muted-foreground text-center">
										{min}-{max}
									</Text>
								</View>
							);
						})}
					</View>
				</View>
			</View>
		);
	}

	return (
		<View className={`border border-border rounded-xl p-4 ${className || ""}`}>
			<View className="mb-4">
				<Text className="text-base font-semibold text-foreground">{title}</Text>
				{maxValue && (
					<Text className="text-sm text-muted-foreground">
						{type === "power" ? t("zones.basedOnFTP") : t("zones.basedOnMaxHR")}: {maxValue} {unit}
					</Text>
				)}
			</View>

			{/* Zone Distribution Preview */}
			{showPreview && (
				<View className="mb-4">
					<View className="flex-row h-3 rounded-full overflow-hidden">
						{calculateZoneDistribution().map((width, i) => (
							<View
								key={i}
								style={{
									flex: width,
									backgroundColor: zones[i].color,
								}}
							/>
						))}
					</View>
					<Text className="text-sm text-muted-foreground mt-2 text-center">{t("zones.currentDistribution")}</Text>
				</View>
			)}

			{/* Zones Table */}
			<View>
				{zones.map((zone, index) => {
					const {min, max} = calculateZoneValues(zone);
					const isActive =
						currentValue && maxValue && currentValue >= (maxValue * zone.minPercent) / 100 && currentValue <= (maxValue * zone.maxPercent) / 100;

					return (
						<View key={index} className={`flex-row items-center justify-between py-2 px-3 mb-1 rounded-lg ${isActive ? "bg-muted" : ""}`}>
							<View className="flex-row items-center flex-1">
								<View
									style={{
										width: 12,
										height: 12,
										backgroundColor: zone.color,
										borderRadius: 6,
										marginRight: 8,
									}}
								/>
								<View className="flex-1">
									<Text className="text-sm font-medium text-foreground">
										{type === "power" ? `${t("zones.zone")} ${index + 1}` : `${t("zones.zone")} ${index + 1}`} - {t(zone.nameKey)}
									</Text>
								</View>
							</View>
							<View className="items-end">
								<Text className="text-sm font-medium text-foreground">
									{zone.minPercent}% - {zone.maxPercent}%
								</Text>
								{maxValue && (
									<Text className="text-sm text-muted-foreground">
										{min} - {max} {unit}
									</Text>
								)}
							</View>
						</View>
					);
				})}
			</View>
		</View>
	);
}
