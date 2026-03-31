import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (type: 'feature_request' | 'bug_report' | 'general_feedback' | 'feeling_feedback', text: string) => void;
  initialType?: 'feature_request' | 'bug_report' | 'general_feedback' | 'feeling_feedback';
}

export function FeedbackDialog({ open, onOpenChange, onSubmit, initialType = 'feature_request' }: FeedbackDialogProps) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [feedbackType, setFeedbackType] = useState<'feature_request' | 'bug_report' | 'general_feedback' | 'feeling_feedback'>(initialType);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (feedbackText.trim().length < 10) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(feedbackType, feedbackText.trim());
      // Reset form
      setFeedbackText('');
      setFeedbackType(initialType);
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFeedbackText('');
    setFeedbackType(initialType);
    onOpenChange(false);
  };

  const typeLabels = {
    feature_request: 'Feature vorschlagen',
    bug_report: 'Bug melden',
    general_feedback: 'Allgemeines Feedback',
    feeling_feedback: 'Gefühl/Stimmung mitteilen',
  };

  const typePlaceholders = {
    feature_request: 'Beschreibe deine Idee für ein neues Feature. Was soll es tun? Wie würde es dir helfen?',
    bug_report: 'Beschreibe den Bug so detailliert wie möglich. Was ist passiert? Was hast du erwartet?',
    general_feedback: 'Teile deine Gedanken, Verbesserungsvorschläge oder allgemeines Feedback mit uns.',
    feeling_feedback: 'Teile mit uns, wie du dich heute fühlst oder was deine aktuelle Stimmung beeinflusst.',
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <TouchableOpacity
            style={{ flex: 1, minHeight: 60 }}
            onPress={() => onOpenChange(false)}
            activeOpacity={1}
          />
          <View
            style={{
              backgroundColor: isDark ? '#1f1f23' : '#ffffff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderTopColor: isDark ? '#333333' : '#e5e7eb',
              maxHeight: '95%',
              minHeight: '70%',
            }}
          >
          <View className="p-6" style={{ flex: 1, flexDirection: 'column' }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-semibold text-foreground">Feedback senden</Text>
              <TouchableOpacity onPress={() => onOpenChange(false)} className="p-2">
                <Text className="text-xl text-muted-foreground">✕</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-muted-foreground mb-6">
              Hilf uns dabei, die App zu verbessern. Dein Feedback ist uns wichtig!
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* Feedback Type Selection */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-foreground mb-3">Art des Feedbacks</Text>
                <View className="gap-2">
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setFeedbackType(value as typeof feedbackType)}
                      className={`flex-row items-center p-3 rounded-lg border ${
                        feedbackType === value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-muted/30'
                      }`}
                    >
                      <View
                        className={`w-4 h-4 rounded-full border-2 mr-3 items-center justify-center ${
                          feedbackType === value ? 'border-primary' : 'border-muted-foreground'
                        }`}
                      >
                        {feedbackType === value && (
                          <View className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </View>
                      <Text className={`text-sm ${feedbackType === value ? 'text-primary font-medium' : 'text-foreground'}`}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Feedback Text */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-foreground mb-2">
                  {typeLabels[feedbackType]}
                </Text>
                <TextInput
                  placeholder={typePlaceholders[feedbackType]}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  multiline
                  numberOfLines={6}
                  maxLength={2000}
                  className="border border-border rounded-md p-3 text-foreground bg-background min-h-[120px]"
                  style={{ textAlignVertical: 'top' }}
                  placeholderTextColor="#6B7280"
                />
                <View className="flex-row justify-between mt-1">
                  <Text className="text-xs text-muted-foreground">
                    Mindestens 10 Zeichen erforderlich
                  </Text>
                  <Text className={`text-xs ${feedbackText.length < 10 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {feedbackText.length}/2000
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View className="flex-row gap-3 mt-4" style={{ paddingTop: 12, paddingBottom: insets.bottom }}>
              <TouchableOpacity
                onPress={handleCancel}
                disabled={isSubmitting}
                className="flex-1 border border-border rounded-md p-3 items-center justify-center"
              >
                <Text className="text-sm font-medium text-foreground">Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={feedbackText.trim().length < 10 || isSubmitting}
                className={`flex-1 rounded-md p-3 items-center justify-center ${
                  feedbackText.trim().length < 10 || isSubmitting
                    ? 'bg-muted opacity-50'
                    : 'bg-primary'
                }`}
              >
                <Text className="text-sm font-medium text-primary-foreground">
                  {isSubmitting ? 'Wird gesendet...' : 'Senden'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default FeedbackDialog;