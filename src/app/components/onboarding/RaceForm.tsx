import React, { useState } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import type { RaceInfo } from "@/types/onboarding";

interface RaceFormProps {
  value: RaceInfo;
  onChange: (value: RaceInfo) => void;
}

function WebDateInput({ value, onChange, minimumDate }: {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate: Date;
}) {
  const minStr = minimumDate.toISOString().split("T")[0];
  const valStr = value.toISOString().split("T")[0];

  return (
    <input
      type="date"
      value={valStr}
      min={minStr}
      onChange={(e) => {
        const d = new Date(e.target.value + "T00:00:00");
        if (!isNaN(d.getTime())) onChange(d);
      }}
      style={{
        fontSize: 16,
        padding: "12px",
        borderRadius: 8,
        border: "1px solid var(--border, #e5e7eb)",
        backgroundColor: "transparent",
        color: "inherit",
        width: "100%",
        boxSizing: "border-box" as const,
      }}
    />
  );
}

export function RaceForm({ value, onChange }: RaceFormProps) {
  const { t } = useTranslation();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const selectedDate = value.date ? new Date(value.date + "T00:00:00") : new Date();
  const today = new Date();

  const handleDateChange = (date: Date) => {
    onChange({ ...value, date: date.toISOString().split("T")[0] });
  };

  return (
    <View className="gap-4">
      {/* Race name */}
      <View>
        <Text className="text-sm font-medium text-foreground mb-1.5">
          {t("onboarding.race.nameLabel")}
        </Text>
        <Input
          value={value.name}
          onChangeText={(text) => onChange({ ...value, name: text })}
          placeholder={t("onboarding.race.namePlaceholder")}
        />
      </View>

      {/* Race date */}
      <View>
        <Text className="text-sm font-medium text-foreground mb-1.5">
          {t("onboarding.race.dateLabel")}
        </Text>
        {Platform.OS === "web" ? (
          <WebDateInput
            value={selectedDate}
            onChange={handleDateChange}
            minimumDate={today}
          />
        ) : Platform.OS === "ios" ? (
          <NativeDatePicker
            value={selectedDate}
            onChange={handleDateChange}
            minimumDate={today}
            display="compact"
          />
        ) : (
          <>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="border border-border rounded-lg px-3 py-3 bg-card"
            >
              <Text className="text-foreground">
                {value.date || t("onboarding.race.datePlaceholder")}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <NativeDatePicker
                value={selectedDate}
                onChange={(date) => {
                  setShowDatePicker(false);
                  handleDateChange(date);
                }}
                minimumDate={today}
                display="default"
              />
            )}
          </>
        )}
      </View>

      {/* Event type */}
      <View>
        <Text className="text-sm font-medium text-foreground mb-1.5">
          {t("onboarding.race.eventTypeLabel")}
        </Text>
        <Input
          value={value.eventType}
          onChangeText={(text) => onChange({ ...value, eventType: text })}
          placeholder={t("onboarding.race.eventTypePlaceholder")}
        />
      </View>
    </View>
  );
}

// Wrapper to avoid importing DateTimePicker on web where it doesn't exist
function NativeDatePicker({ value, onChange, minimumDate, display }: {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate: Date;
  display: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DateTimePicker = require("@react-native-community/datetimepicker").default;
  return (
    <DateTimePicker
      value={value}
      mode="date"
      display={display}
      minimumDate={minimumDate}
      onChange={(_: unknown, date?: Date) => {
        if (date) onChange(date);
      }}
      style={display === "compact" ? { alignSelf: "flex-start" } : undefined}
    />
  );
}
