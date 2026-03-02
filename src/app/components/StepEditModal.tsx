import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  EditableWorkoutStep,
  updateStepDuration,
  updateStepIntensityZone,
  updateStepIntensityPercent,
} from '@/utils/workoutParser';
import { getColorForIntensity, ZONE_DESCRIPTIONS } from '@/constants/WorkoutColors';
import { Colors } from '@/constants/Colors';

interface StepEditModalProps {
  step: EditableWorkoutStep | null;
  visible: boolean;
  onSave: (step: EditableWorkoutStep) => void;
  onDelete: () => void;
  onClose: () => void;
}

const ZONE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const DURATION_PRESETS = [
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '15m', seconds: 900 },
  { label: '20m', seconds: 1200 },
  { label: '30m', seconds: 1800 },
];

export function StepEditModal({
  step,
  visible,
  onSave,
  onDelete,
  onClose,
}: StepEditModalProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();

  // Local state for editing
  const [editedStep, setEditedStep] = useState<EditableWorkoutStep | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('0');
  const [durationSeconds, setDurationSeconds] = useState('0');
  const [intensityMode, setIntensityMode] = useState<'zone' | 'percent'>('zone');
  const [selectedZone, setSelectedZone] = useState(2);
  const [percentValue, setPercentValue] = useState('70');
  const [percentType, setPercentType] = useState<'power' | 'heartRate' | 'speed' | 'strength'>('power');
  const [comment, setComment] = useState('');

  // Initialize state when step changes
  useEffect(() => {
    if (step) {
      setEditedStep(step);

      // Parse duration
      const mins = Math.floor(step.durationSeconds / 60);
      const secs = step.durationSeconds % 60;
      setDurationMinutes(mins.toString());
      setDurationSeconds(secs.toString());

      // Parse intensity
      if (step.intensityType === 'zone') {
        setIntensityMode('zone');
        setSelectedZone(step.intensityValue);
      } else {
        setIntensityMode('percent');
        setPercentType(step.intensityType as 'power' | 'heartRate' | 'speed' | 'strength');
        setPercentValue(step.intensityValue.toString());
      }

      setComment(step.comment || '');
    }
  }, [step]);

  const handleSave = () => {
    if (!editedStep) return;

    // Calculate new duration
    const totalSeconds = parseInt(durationMinutes || '0') * 60 + parseInt(durationSeconds || '0');
    if (totalSeconds <= 0) {
      Alert.alert(t('common.error', 'Error'), t('workoutBuilder.invalidDuration', 'Please enter a valid duration'));
      return;
    }

    let updatedStep = updateStepDuration(editedStep, totalSeconds);

    // Update intensity
    if (intensityMode === 'zone') {
      updatedStep = updateStepIntensityZone(updatedStep, selectedZone);
    } else {
      const pct = parseInt(percentValue || '0');
      if (pct <= 0 || pct > 200) {
        Alert.alert(t('common.error', 'Error'), t('workoutBuilder.invalidIntensity', 'Please enter a valid intensity'));
        return;
      }
      updatedStep = updateStepIntensityPercent(updatedStep, percentType, pct);
    }

    // Update comment
    updatedStep = { ...updatedStep, comment: comment.trim() || undefined };

    onSave(updatedStep);
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('workoutBuilder.deleteStepConfirm', 'Are you sure you want to delete this step?'))) {
        onDelete();
      }
    } else {
      Alert.alert(
        t('workoutBuilder.deleteStep', 'Delete Step'),
        t('workoutBuilder.deleteStepConfirm', 'Are you sure you want to delete this step?'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: t('common.delete', 'Delete'), style: 'destructive', onPress: onDelete },
        ]
      );
    }
  };

  const handleDurationPreset = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    setDurationMinutes(mins.toString());
    setDurationSeconds(secs.toString());
  };

  if (!step) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, isDark && styles.contentDark]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, isDark && styles.titleDark]}>
                {t('workoutBuilder.editStep', 'Edit Step')}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={[styles.closeButtonText, isDark && styles.closeButtonTextDark]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Duration Section */}
            <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>
              {t('workoutBuilder.duration', 'Duration')}
            </Text>
            <View style={styles.durationRow}>
              <View style={styles.durationInput}>
                <TextInput
                  style={[styles.numberInput, isDark && styles.numberInputDark]}
                  value={durationMinutes}
                  onChangeText={setDurationMinutes}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="0"
                  placeholderTextColor={isDark ? Colors.dark.icon : Colors.light.icon}
                />
                <Text style={[styles.unitLabel, isDark && styles.unitLabelDark]}>
                  {t('workoutBuilder.minutes', 'min')}
                </Text>
              </View>
              <View style={styles.durationInput}>
                <TextInput
                  style={[styles.numberInput, isDark && styles.numberInputDark]}
                  value={durationSeconds}
                  onChangeText={setDurationSeconds}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                  placeholderTextColor={isDark ? Colors.dark.icon : Colors.light.icon}
                />
                <Text style={[styles.unitLabel, isDark && styles.unitLabelDark]}>
                  {t('workoutBuilder.seconds', 'sec')}
                </Text>
              </View>
            </View>

            {/* Duration Presets */}
            <View style={styles.presetsRow}>
              {DURATION_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.seconds}
                  style={[
                    styles.presetButton,
                    isDark && styles.presetButtonDark,
                    parseInt(durationMinutes) * 60 + parseInt(durationSeconds) === preset.seconds &&
                      styles.presetButtonActive,
                  ]}
                  onPress={() => handleDurationPreset(preset.seconds)}
                >
                  <Text
                    style={[
                      styles.presetButtonText,
                      isDark && styles.presetButtonTextDark,
                      parseInt(durationMinutes) * 60 + parseInt(durationSeconds) === preset.seconds &&
                        styles.presetButtonTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Intensity Mode Toggle */}
            <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>
              {t('workoutBuilder.intensity', 'Intensity')}
            </Text>
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  isDark && styles.modeButtonDark,
                  intensityMode === 'zone' && styles.modeButtonActive,
                ]}
                onPress={() => setIntensityMode('zone')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    isDark && styles.modeButtonTextDark,
                    intensityMode === 'zone' && styles.modeButtonTextActive,
                  ]}
                >
                  {t('workoutBuilder.zone', 'Zone')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  isDark && styles.modeButtonDark,
                  intensityMode === 'percent' && styles.modeButtonActive,
                ]}
                onPress={() => setIntensityMode('percent')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    isDark && styles.modeButtonTextDark,
                    intensityMode === 'percent' && styles.modeButtonTextActive,
                  ]}
                >
                  %
                </Text>
              </TouchableOpacity>
            </View>

            {/* Zone Selection */}
            {intensityMode === 'zone' && (
              <View style={styles.zoneGrid}>
                {ZONE_OPTIONS.map((zone) => {
                  const color = getColorForIntensity(
                    { 1: 15, 2: 30, 3: 45, 4: 60, 5: 75, 6: 85, 7: 100 }[zone] || 50,
                    isDark
                  );
                  const description = ZONE_DESCRIPTIONS[`Z${zone}`] || '';
                  return (
                    <TouchableOpacity
                      key={zone}
                      style={[
                        styles.zoneButton,
                        { backgroundColor: color },
                        selectedZone === zone && styles.zoneButtonSelected,
                      ]}
                      onPress={() => setSelectedZone(zone)}
                    >
                      <Text style={styles.zoneButtonText}>Z{zone}</Text>
                      <Text style={styles.zoneDescText}>{description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Percent Input */}
            {intensityMode === 'percent' && (
              <View>
                <View style={styles.percentTypeRow}>
                  {(['power', 'heartRate', 'speed', 'strength'] as const).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.percentTypeButton,
                        isDark && styles.percentTypeButtonDark,
                        percentType === type && styles.percentTypeButtonActive,
                      ]}
                      onPress={() => setPercentType(type)}
                    >
                      <Text
                        style={[
                          styles.percentTypeButtonText,
                          isDark && styles.percentTypeButtonTextDark,
                          percentType === type && styles.percentTypeButtonTextActive,
                        ]}
                      >
                        {{ power: '%FTP', heartRate: '%HR', speed: '%Speed', strength: 'Str' }[type]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.percentInputRow}>
                  <TextInput
                    style={[styles.percentInput, isDark && styles.percentInputDark]}
                    value={percentValue}
                    onChangeText={setPercentValue}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="70"
                    placeholderTextColor={isDark ? Colors.dark.icon : Colors.light.icon}
                  />
                  <Text style={[styles.percentSign, isDark && styles.percentSignDark]}>%</Text>
                </View>
              </View>
            )}

            {/* Comment */}
            <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>
              {t('workoutBuilder.comment', 'Comment')} ({t('forms.optional', 'optional')})
            </Text>
            <TextInput
              style={[styles.commentInput, isDark && styles.commentInputDark]}
              value={comment}
              onChangeText={setComment}
              placeholder={t('workoutBuilder.commentPlaceholder', 'e.g., focus on breathing')}
              placeholderTextColor={isDark ? Colors.dark.icon : Colors.light.icon}
              maxLength={100}
            />

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.deleteButton, isDark && styles.deleteButtonDark]}
                onPress={handleDelete}
              >
                <Text style={styles.deleteButtonText}>{t('common.delete', 'Delete')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isDark && styles.saveButtonDark]}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>{t('common.save', 'Save')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: Colors.light.background,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  contentDark: {
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  titleDark: {
    color: Colors.dark.text,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: Colors.light.icon,
  },
  closeButtonTextDark: {
    color: Colors.dark.icon,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
    marginTop: 16,
  },
  sectionLabelDark: {
    color: Colors.dark.text,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 16,
  },
  durationInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  numberInput: {
    flex: 1,
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  numberInputDark: {
    backgroundColor: Colors.dark.muted,
    color: Colors.dark.text,
    borderColor: Colors.dark.border,
  },
  unitLabel: {
    fontSize: 14,
    color: Colors.light.icon,
  },
  unitLabelDark: {
    color: Colors.dark.icon,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.light.muted,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  presetButtonDark: {
    backgroundColor: Colors.dark.muted,
    borderColor: Colors.dark.border,
  },
  presetButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  presetButtonText: {
    fontSize: 12,
    color: Colors.light.text,
  },
  presetButtonTextDark: {
    color: Colors.dark.text,
  },
  presetButtonTextActive: {
    color: '#ffffff',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeButtonDark: {},
  modeButtonActive: {
    backgroundColor: Colors.light.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.icon,
  },
  modeButtonTextDark: {
    color: Colors.dark.icon,
  },
  modeButtonTextActive: {
    color: Colors.light.text,
  },
  zoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  zoneButton: {
    width: '30%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  zoneButtonSelected: {
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  zoneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  zoneDescText: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  percentTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  percentTypeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.light.muted,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  percentTypeButtonDark: {
    backgroundColor: Colors.dark.muted,
    borderColor: Colors.dark.border,
  },
  percentTypeButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  percentTypeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.light.text,
  },
  percentTypeButtonTextDark: {
    color: Colors.dark.text,
  },
  percentTypeButtonTextActive: {
    color: '#ffffff',
  },
  percentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  percentInput: {
    flex: 1,
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  percentInputDark: {
    backgroundColor: Colors.dark.muted,
    color: Colors.dark.text,
    borderColor: Colors.dark.border,
  },
  percentSign: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.light.text,
  },
  percentSignDark: {
    color: Colors.dark.text,
  },
  commentInput: {
    backgroundColor: Colors.light.muted,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  commentInputDark: {
    backgroundColor: Colors.dark.muted,
    color: Colors.dark.text,
    borderColor: Colors.dark.border,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#ef4444',
  },
  deleteButtonDark: {
    backgroundColor: '#dc2626',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.light.tint,
  },
  saveButtonDark: {
    backgroundColor: Colors.dark.tint,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default StepEditModal;
