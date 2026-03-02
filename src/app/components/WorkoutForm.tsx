import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import { getSportTranslation } from "@/utils/formatters";
import { Colors } from "@/constants/Colors";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";
import { StepEditModal } from "@/components/StepEditModal";
import {
  EditableWorkoutStep,
  parseWorkout,
  getEditableSteps,
  stepsToWorkoutText,
  createDefaultStep,
} from "@/utils/workoutParser";

export interface WorkoutFormData {
  name: string;
  description: string;
  sport: string;
  workoutText: string;
}

interface WorkoutFormProps {
  initialValues?: Partial<WorkoutFormData>;
  onValuesChange: (data: WorkoutFormData) => void;
  showDuration?: boolean;
  duration?: number;
}

const AVAILABLE_SPORTS = ['Running', 'Cycling'];

export function WorkoutForm({
  initialValues,
  onValuesChange,
  showDuration = false,
  duration = 0,
}: WorkoutFormProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();

  // Form State
  const [name, setName] = useState(initialValues?.name || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [workoutText, setWorkoutText] = useState(initialValues?.workoutText || "");
  const [sport, setSport] = useState(initialValues?.sport || "Running");

  // Modals
  const [showSportModal, setShowSportModal] = useState(false);
  const [showStepModal, setShowStepModal] = useState(false);

  // Step Editing
  const [selectedStep, setSelectedStep] = useState<EditableWorkoutStep | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(-1);

  // Update parent whenever values change
  useEffect(() => {
    onValuesChange({ name, description, sport, workoutText });
  }, [name, description, sport, workoutText, onValuesChange]);

  // Sync with initial values when they change (for edit mode)
  useEffect(() => {
    if (initialValues?.name !== undefined && initialValues.name !== name) {
      setName(initialValues.name);
    }
    if (initialValues?.description !== undefined && initialValues.description !== description) {
      setDescription(initialValues.description);
    }
    if (initialValues?.workoutText !== undefined && initialValues.workoutText !== workoutText) {
      setWorkoutText(initialValues.workoutText);
    }
    if (initialValues?.sport !== undefined && initialValues.sport !== sport) {
      setSport(initialValues.sport);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues?.name, initialValues?.description, initialValues?.workoutText, initialValues?.sport]);

  // Handle step press in WorkoutBuilder
  const handleStepPress = useCallback((step: EditableWorkoutStep, index: number) => {
    setSelectedStep(step);
    setSelectedStepIndex(index);
    setShowStepModal(true);
  }, []);

  // Handle step save from modal
  const handleStepSave = useCallback((updatedStep: EditableWorkoutStep) => {
    try {
      const parsed = parseWorkout(workoutText);
      const steps = getEditableSteps(parsed);

      if (selectedStepIndex >= 0 && selectedStepIndex < steps.length) {
        steps[selectedStepIndex] = updatedStep;
        const newText = stepsToWorkoutText(sport, name, steps);
        setWorkoutText(newText);
      }

      setShowStepModal(false);
      setSelectedStep(null);
      setSelectedStepIndex(-1);
    } catch (error) {
      console.error('Error saving step:', error);
    }
  }, [workoutText, selectedStepIndex, sport, name]);

  // Handle step delete from modal
  const handleStepDelete = useCallback(() => {
    try {
      const parsed = parseWorkout(workoutText);
      const steps = getEditableSteps(parsed);

      if (selectedStepIndex >= 0 && selectedStepIndex < steps.length) {
        steps.splice(selectedStepIndex, 1);
        const newText = stepsToWorkoutText(sport, name, steps);
        setWorkoutText(newText);
      }

      setShowStepModal(false);
      setSelectedStep(null);
      setSelectedStepIndex(-1);
    } catch (error) {
      console.error('Error deleting step:', error);
    }
  }, [workoutText, selectedStepIndex, sport, name]);

  const handleSportChange = useCallback((newSport: string) => {
    setSport(newSport);
    setShowSportModal(false);

    try {
      if (workoutText) {
        const parsed = parseWorkout(workoutText);
        const steps = getEditableSteps(parsed);
        const newText = stepsToWorkoutText(newSport, name, steps);
        setWorkoutText(newText);
      }
    } catch (error) {
      console.error('Error updating sport in text:', error);
    }
  }, [workoutText, name]);

  // Handle add step
  const handleAddStep = useCallback(() => {
    try {
      let steps: EditableWorkoutStep[] = [];
      try {
        const parsed = parseWorkout(workoutText);
        steps = getEditableSteps(parsed);
      } catch {
        // Empty workout, start fresh
      }

      const lastStep = steps[steps.length - 1];
      const newStep = createDefaultStep(lastStep?.setName);
      steps.push(newStep);

      const newText = stepsToWorkoutText(sport, name, steps);
      setWorkoutText(newText);
    } catch (error) {
      console.error('Error adding step:', error);
    }
  }, [workoutText, sport, name]);

  return (
    <View style={styles.formContainer}>
      {/* Compact Info Card */}
      <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
        {/* Name Input */}
        <TextInput
          style={[styles.nameInput, isDark && styles.nameInputDark]}
          value={name}
          onChangeText={setName}
          placeholder={t('workouts.namePlaceholder', 'Workout name')}
          placeholderTextColor={isDark ? Colors.dark.icon : Colors.light.icon}
        />

        {/* Description Input */}
        <TextInput
          style={[styles.descriptionInput, isDark && styles.descriptionInputDark]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('workouts.descriptionPlaceholder', 'Description (optional)')}
          placeholderTextColor={isDark ? Colors.dark.icon : Colors.light.icon}
          multiline
          numberOfLines={2}
        />

        {/* Sport and Duration Row */}
        <View style={styles.metaRow}>
          <TouchableOpacity
            style={[styles.sportSelector, isDark && styles.sportSelectorDark]}
            onPress={() => setShowSportModal(true)}
          >
            <Text style={[styles.sportText, isDark && styles.sportTextDark]}>
              {getSportTranslation(sport, t)}
            </Text>
            <Text style={[styles.dropdownIcon, isDark && styles.dropdownIconDark]}>▾</Text>
          </TouchableOpacity>

          {showDuration && (
            <View style={[styles.durationDisplay, isDark && styles.durationDisplayDark]}>
              <Text style={[styles.durationText, isDark && styles.durationTextDark]}>
                {duration} min
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Workout Builder - No heading */}
      <View style={[styles.builderCard, isDark && styles.builderCardDark]}>
        <WorkoutBuilder
          workoutText={workoutText}
          sport={sport}
          workoutName={name}
          onWorkoutChange={setWorkoutText}
          isEditing={true}
          onStepPress={handleStepPress}
          height={140}
        />

        {/* Add Step Button */}
        <TouchableOpacity
          style={[styles.addStepButton, isDark && styles.addStepButtonDark]}
          onPress={handleAddStep}
        >
          <Text style={[styles.addStepButtonText, isDark && styles.addStepButtonTextDark]}>
            + {t('workouts.addStep', 'Add Step')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Step Edit Modal */}
      <StepEditModal
        step={selectedStep}
        visible={showStepModal}
        onSave={handleStepSave}
        onDelete={handleStepDelete}
        onClose={() => {
          setShowStepModal(false);
          setSelectedStep(null);
          setSelectedStepIndex(-1);
        }}
      />

      {/* Sport Selection Modal */}
      <Modal
        visible={showSportModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
              {t('workouts.selectSport', 'Select Sport')}
            </Text>
            <FlatList
              data={AVAILABLE_SPORTS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.sportOption,
                    isDark && styles.sportOptionDark,
                    sport === item && (isDark ? styles.sportOptionSelectedDark : styles.sportOptionSelected)
                  ]}
                  onPress={() => handleSportChange(item)}
                >
                  <Text style={[
                    styles.sportOptionText,
                    isDark && styles.sportOptionTextDark,
                    sport === item && styles.sportOptionTextSelected
                  ]}>
                    {getSportTranslation(item, t)}
                  </Text>
                  {sport === item && (
                    <Text style={[styles.checkIcon, isDark && styles.checkIconDark]}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={[styles.modalButton, isDark && styles.modalButtonDark]}
              onPress={() => setShowSportModal(false)}
            >
              <Text style={[styles.modalButtonText, isDark && styles.modalButtonTextDark]}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    gap: 12,
  },
  infoCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 10,
  },
  infoCardDark: {
    backgroundColor: Colors.dark.card,
    borderColor: Colors.dark.border,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  nameInputDark: {
    color: Colors.dark.text,
    backgroundColor: Colors.dark.muted,
    borderColor: Colors.dark.border,
  },
  descriptionInput: {
    fontSize: 14,
    color: Colors.light.text,
    lineHeight: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minHeight: 50,
  },
  descriptionInputDark: {
    color: Colors.dark.text,
    backgroundColor: Colors.dark.muted,
    borderColor: Colors.dark.border,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sportSelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 6,
  },
  sportSelectorDark: {
    backgroundColor: Colors.dark.muted,
    borderColor: Colors.dark.border,
  },
  sportText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.tint,
  },
  sportTextDark: {
    color: Colors.dark.tint,
  },
  dropdownIcon: {
    fontSize: 12,
    color: Colors.light.tint,
  },
  dropdownIconDark: {
    color: Colors.dark.tint,
  },
  durationDisplay: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
  },
  durationDisplayDark: {
    backgroundColor: Colors.dark.muted,
  },
  durationText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.text,
  },
  durationTextDark: {
    color: Colors.dark.text,
  },
  builderCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  builderCardDark: {
    backgroundColor: Colors.dark.card,
    borderColor: Colors.dark.border,
  },
  addStepButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    alignItems: "center",
    backgroundColor: Colors.light.tint + '10',
  },
  addStepButtonDark: {
    borderColor: Colors.dark.tint,
    backgroundColor: Colors.dark.tint + '20',
  },
  addStepButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.tint,
  },
  addStepButtonTextDark: {
    color: Colors.dark.tint,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "60%",
  },
  modalContentDark: {
    backgroundColor: Colors.dark.background,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.text,
    marginBottom: 16,
    textAlign: "center",
  },
  modalTitleDark: {
    color: Colors.dark.text,
  },
  modalButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: Colors.light.muted,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  modalButtonDark: {
    backgroundColor: Colors.dark.muted,
    borderColor: Colors.dark.border,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.light.text,
  },
  modalButtonTextDark: {
    color: Colors.dark.text,
  },
  sportOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  sportOptionDark: {
    borderBottomColor: Colors.dark.border,
  },
  sportOptionSelected: {
    backgroundColor: Colors.light.muted,
  },
  sportOptionSelectedDark: {
    backgroundColor: Colors.dark.muted,
  },
  sportOptionText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  sportOptionTextDark: {
    color: Colors.dark.text,
  },
  sportOptionTextSelected: {
    fontWeight: '600',
    color: Colors.light.tint,
  },
  checkIcon: {
    fontSize: 16,
    color: Colors.light.tint,
    fontWeight: 'bold',
  },
  checkIconDark: {
    color: Colors.dark.tint,
  },
});

export default WorkoutForm;
