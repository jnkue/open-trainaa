import { Stack } from "expo-router";
import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OnboardingState, INITIAL_ONBOARDING_STATE } from "@/types/onboarding";

const STORAGE_KEY = "onboarding_progress";

interface OnboardingContextValue {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}

export default function OnboardingLayout() {
  const [state, setState] = useState<OnboardingState>(INITIAL_ONBOARDING_STATE);
  const [loaded, setLoaded] = useState(false);

  // Load persisted onboarding progress on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const saved: Partial<OnboardingState> = JSON.parse(raw);
            setState((prev) => ({ ...prev, ...saved }));
          } catch (e) {
            console.warn("Failed to parse onboarding progress:", e);
          }
        }
      })
      .catch((e) => {
        console.warn("Failed to load onboarding progress:", e);
      })
      .finally(() => {
        setLoaded(true);
      });
  }, []);

  // Persist state to AsyncStorage after each change (skip until initial load completes)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) => {
      console.warn("Failed to persist onboarding progress:", e);
    });
  }, [state, loaded]);

  if (!loaded) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <OnboardingContext.Provider value={{ state, setState }}>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingContext.Provider>
  );
}

export { STORAGE_KEY };
