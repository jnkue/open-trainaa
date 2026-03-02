import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useCreateWorkout } from "@/hooks/useWorkouts";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import { Colors } from "@/constants/Colors";
import { showAlert } from "@/utils/alert";
import { WorkoutForm, WorkoutFormData } from "@/components/WorkoutForm";

export default function CreateWorkoutScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const createWorkoutMutation = useCreateWorkout();

  // Form data state
  const [formData, setFormData] = useState<WorkoutFormData>({
    name: "",
    description: "",
    sport: "Running",
    workoutText: "",
  });

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/workouts");
    }
  };

  const handleFormChange = useCallback((data: WorkoutFormData) => {
    setFormData(data);
  }, []);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showAlert(t('common.error'), t('workouts.nameRequired', 'Please enter a workout name'));
      return;
    }

    try {
      await createWorkoutMutation.mutateAsync({
        name: formData.name,
        description: formData.description,
        workout_text: formData.workoutText,
        sport: formData.sport as any,
        workout_minutes: 0,
        is_public: false,
      });
      showAlert(t('common.success'), t('workouts.createSuccess', 'Workout created successfully'));
      router.replace("/workouts");
    } catch (error) {
      console.error("Error creating workout:", error);
      showAlert(t('common.error'), t('workouts.createError', 'Failed to create workout'));
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? Colors.dark.background : Colors.light.background} />

      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>
          {t('workouts.createTitle', 'Create Workout')}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.headerEditButton, { opacity: createWorkoutMutation.isPending ? 0.5 : 1 }]}
          disabled={createWorkoutMutation.isPending}
        >
          <Text style={[styles.headerEditButtonText, isDark && styles.headerEditButtonTextDark]}>
            {t('common.save', 'Save')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <WorkoutForm
          onValuesChange={handleFormChange}
        />
      </ScrollView>

      {createWorkoutMutation.isPending && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  containerDark: {
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.light.border,
  },
  headerDark: {
    backgroundColor: Colors.dark.background,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.light.text,
  },
  headerTitleDark: {
    color: Colors.dark.text,
  },
  backButton: {
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: "500",
  },
  backButtonTextDark: {
    color: Colors.dark.text,
  },
  headerEditButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  headerEditButtonText: {
    fontSize: 16,
    color: Colors.light.tint,
    fontWeight: "600",
  },
  headerEditButtonTextDark: {
    color: Colors.dark.tint,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
});
