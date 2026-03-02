import React, {useState, useMemo, useEffect, useCallback} from "react";
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Platform, Alert, Modal} from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import {useLocalSearchParams, useRouter} from "expo-router";
import {SafeAreaView} from "react-native-safe-area-context";
import {useWorkout, usePlannedWorkouts, useDeletePlannedWorkout, useScheduleWorkout, useUpdateWorkout} from "@/hooks/useWorkouts";
import {useTheme} from "@/contexts/ThemeContext";
import {useTranslation} from "react-i18next";
import {getSportTranslation} from "@/utils/formatters";
import {Colors} from "@/constants/Colors";
import {showAlert} from "@/utils/alert";
import {format} from "date-fns";
import {de} from "date-fns/locale";
import {IconSymbol} from "@/components/ui/IconSymbol";
import {WorkoutBuilder} from "@/components/WorkoutBuilder";
import {WorkoutForm, WorkoutFormData} from "@/components/WorkoutForm";

export default function TrainingDetailScreen() {
	const router = useRouter();
	const {id, returnTo} = useLocalSearchParams();
	const {isDark} = useTheme();
	const {t} = useTranslation();

	const {data: workout, isLoading, isError, error} = useWorkout(id as string);
	const {data: allPlannedWorkouts = []} = usePlannedWorkouts();
	const deleteWorkoutMutation = useDeletePlannedWorkout();
	const scheduleWorkoutMutation = useScheduleWorkout();
	const updateWorkoutMutation = useUpdateWorkout();

	// State for schedule modal
	const [showScheduleModal, setShowScheduleModal] = useState(false);
	const [editingInstance, setEditingInstance] = useState<{id: string, scheduledTime: string} | null>(null);
	const [selectedDate, setSelectedDate] = useState<Date>(new Date());

	// Edit mode state
	const [isEditing, setIsEditing] = useState(false);
	const [formData, setFormData] = useState<WorkoutFormData>({
		name: '',
		description: '',
		sport: '',
		workoutText: '',
	});

	// View mode state (visual vs text)
	const [viewMode, setViewMode] = useState<'visual' | 'text'>('visual');

	// Initialize form values when workout loads
	useEffect(() => {
		if (workout) {
			setFormData({
				name: workout.name,
				description: workout.description || '',
				sport: workout.sport,
				workoutText: workout.workout_text,
			});
		}
	}, [workout]);

	// Filter planned workouts for this specific workout
	const scheduledInstances = useMemo(() => {
		return allPlannedWorkouts.filter(pw => pw.workout_id === id);
	}, [allPlannedWorkouts, id]);

	const handleBack = () => {
		if (returnTo) {
			const returnPath = Array.isArray(returnTo) ? returnTo[0] : returnTo;
			router.replace(returnPath);
		} else if (router.canGoBack()) {
			router.back();
		} else {
			router.replace("/calendar");
		}
	};

	const handleDeleteScheduledWorkout = (plannedWorkoutId: string, scheduledDate: string) => {
		if (Platform.OS === 'web') {
			const confirmed = window.confirm(
				`${t('training.deleteScheduledConfirm', 'Are you sure you want to delete this scheduled workout?')}\n${format(new Date(scheduledDate), 'PPP p', {locale: de})}`
			);
			if (confirmed) {
				deleteScheduledWorkout(plannedWorkoutId);
			}
		} else {
			Alert.alert(
				t('training.deleteScheduled', 'Delete Scheduled Workout'),
				`${t('training.deleteScheduledConfirm', 'Are you sure you want to delete this scheduled workout?')}\n${format(new Date(scheduledDate), 'PPP p', {locale: de})}`,
				[
					{text: t('common.cancel', 'Cancel'), style: 'cancel'},
					{text: t('common.delete', 'Delete'), style: 'destructive', onPress: () => deleteScheduledWorkout(plannedWorkoutId)},
				]
			);
		}
	};

	const deleteScheduledWorkout = async (plannedWorkoutId: string) => {
		try {
			await deleteWorkoutMutation.mutateAsync(plannedWorkoutId);
			showAlert(t('common.success', 'Success'), t('training.workoutDeleted', 'Scheduled workout deleted successfully'));
		} catch (error) {
			console.error('Error deleting scheduled workout:', error);
			showAlert(t('common.error', 'Error'), t('training.deleteFailed', 'Failed to delete scheduled workout. Please try again.'));
		}
	};

	const handleAddScheduledTime = () => {
		setEditingInstance(null);
		setSelectedDate(new Date());
		setShowScheduleModal(true);
	};

	const handleEditScheduledTime = (instance: {id: string, scheduled_time: string}) => {
		setEditingInstance({id: instance.id, scheduledTime: instance.scheduled_time});
		setSelectedDate(new Date(instance.scheduled_time));
		setShowScheduleModal(true);
	};

	const handleSaveScheduledTime = async () => {
		try {
			if (editingInstance) {
				await deleteWorkoutMutation.mutateAsync(editingInstance.id);
			}
			await scheduleWorkoutMutation.mutateAsync({
				workoutId: id as string,
				scheduledTime: selectedDate.toISOString(),
			});
			setShowScheduleModal(false);
			setEditingInstance(null);
			showAlert(
				t('common.success', 'Success'),
				editingInstance
					? t('training.workoutUpdated', 'Scheduled time updated successfully')
					: t('training.workoutScheduled', 'Workout scheduled successfully')
			);
		} catch (error) {
			console.error('Error saving scheduled time:', error);
			showAlert(t('common.error', 'Error'), t('training.scheduleFailed', 'Failed to schedule workout. Please try again.'));
		}
	};

	const handleCancelScheduleModal = () => {
		setShowScheduleModal(false);
		setEditingInstance(null);
	};

	const handleFormChange = useCallback((data: WorkoutFormData) => {
		setFormData(data);
	}, []);

	const handleSaveChanges = async () => {
		try {
			await updateWorkoutMutation.mutateAsync({
				workoutId: id as string,
				updates: {
					name: formData.name,
					description: formData.description,
					workout_text: formData.workoutText,
					sport: formData.sport as any,
				},
			});
			setIsEditing(false);
			showAlert(t('common.success', 'Success'), t('workouts.updateSuccess', 'Workout updated successfully'));
		} catch (error) {
			console.error('Error updating workout:', error);
			showAlert(t('common.error', 'Error'), t('workouts.updateError', 'Failed to update workout. Please try again.'));
		}
	};

	if (isLoading) {
		return (
			<SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
				<StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? Colors.dark.background : Colors.light.background} />
				<View style={[styles.header, isDark && styles.headerDark]}>
					<TouchableOpacity onPress={handleBack} style={styles.backButton}>
						<IconSymbol name="chevron.left" size={28} color={isDark ? Colors.dark.text : Colors.light.text} />
					</TouchableOpacity>
					<Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>{t('workouts.detail', 'Workout Details')}</Text>
					<View style={styles.placeholder} />
				</View>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color={isDark ? Colors.dark.text : Colors.light.text} />
				</View>
			</SafeAreaView>
		);
	}

	if (isError || !workout) {
		return (
			<View style={[styles.container, isDark && styles.containerDark]}>
				<StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? Colors.dark.background : Colors.light.background} />
				<View style={[styles.header, isDark && styles.headerDark]}>
					<TouchableOpacity onPress={handleBack} style={styles.backButton}>
						<IconSymbol name="chevron.left" size={28} color={isDark ? Colors.dark.text : Colors.light.text} />
					</TouchableOpacity>
					<Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>{t('workouts.detail', 'Workout Details')}</Text>
					<View style={styles.placeholder} />
				</View>
				<View style={styles.errorContainer}>
					<Text style={[styles.errorTitle, isDark && styles.errorTitleDark]}>{t('workouts.notFound', 'Workout not found')}</Text>
					<Text style={[styles.errorMessage, isDark && styles.errorMessageDark]}>{error?.message || t('workouts.loadError', 'Could not load workout.')}</Text>
				</View>
			</View>
		);
	}

	return (
		<View style={[styles.container, isDark && styles.containerDark]}>
			<StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? Colors.dark.background : Colors.light.background} />

			{/* Header */}
			<View style={[styles.header, isDark && styles.headerDark]}>
				<TouchableOpacity onPress={handleBack} style={styles.backButton}>
					<IconSymbol name="chevron.left" size={28} color={isDark ? Colors.dark.text : Colors.light.text} />
				</TouchableOpacity>
				<Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>{t('workouts.detail', 'Workout Details')}</Text>
				{/* <TouchableOpacity onPress={handleToggleEdit} style={styles.headerEditButton}>
					<Text style={[styles.headerEditButtonText, isDark && styles.headerEditButtonTextDark]}>
						{isEditing ? t('common.cancel', 'Cancel') : t('common.edit', 'Edit')}
					</Text>
				</TouchableOpacity> */}
				<View style={styles.placeholder} />
			</View>

			<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
				{isEditing ? (
					/* Edit Mode - Use WorkoutForm */
					<>
						<WorkoutForm
							initialValues={formData}
							onValuesChange={handleFormChange}
							showDuration={true}
							duration={workout.workout_minutes}
						/>

						{/* Save Button */}
						<TouchableOpacity
							style={[styles.saveButton, isDark && styles.saveButtonDark]}
							onPress={handleSaveChanges}
							disabled={updateWorkoutMutation.isPending}
						>
							{updateWorkoutMutation.isPending ? (
								<ActivityIndicator size="small" color="#ffffff" />
							) : (
								<Text style={styles.saveButtonText}>{t('common.save', 'Save')}</Text>
							)}
						</TouchableOpacity>
					</>
				) : (
					/* View Mode */
					<>
						{/* Training Info Card */}
						<View style={[styles.infoCard, isDark && styles.infoCardDark]}>
							<Text style={[styles.trainingName, isDark && styles.trainingNameDark]}>{workout.name}</Text>

							{workout.description && (
								<Text style={[styles.description, isDark && styles.descriptionDark]}>
									{(() => {
										const lines = workout.description.split('\n');
										const withoutFirst = lines.length > 1 ? lines.slice(1) : lines;
										const firstContentIndex = withoutFirst.findIndex(line => line.trim().length > 0);
										return firstContentIndex >= 0
											? withoutFirst.slice(firstContentIndex).join('\n')
											: workout.description;
									})()}
								</Text>
							)}

							<View style={styles.metaInfo}>
								<View style={styles.metaItem}>
									<Text style={[styles.metaValue, isDark && styles.metaValueDark]}>
										{getSportTranslation(workout.sport, t)}
									</Text>
									<Text style={[styles.metaLabel, isDark && styles.metaLabelDark]}>{t('workouts.sport', 'Sport')}</Text>
								</View>
								<View style={styles.metaDivider} />
								<View style={styles.metaItem}>
									<Text style={[styles.metaValue, isDark && styles.metaValueDark]}>{workout.workout_minutes} min</Text>
									<Text style={[styles.metaLabel, isDark && styles.metaLabelDark]}>{t('workouts.duration', 'Duration')}</Text>
								</View>
							</View>
						</View>

						{/* Workout Builder (View Only) */}
						<View style={[styles.builderCard, isDark && styles.builderCardDark]}>
							<View style={styles.builderHeader}>
								<Text style={[styles.builderTitle, isDark && styles.builderTitleDark]}>
									{viewMode === 'visual' ? t('workouts.visualPreview', 'Visual Preview') : t('workouts.textPreview', 'Text Preview')}
								</Text>
								<View style={[styles.toggleContainer, isDark && styles.toggleContainerDark]}>
									<TouchableOpacity
										style={[
											styles.toggleButton,
											viewMode === 'visual' && styles.toggleButtonActive,
											viewMode === 'visual' && isDark && styles.toggleButtonActiveDark,
										]}
										onPress={() => setViewMode('visual')}
									>
										<IconSymbol
											name="chart.bar.fill"
											size={16}
											color={
												viewMode === 'visual'
													? '#ffffff'
													: isDark ? Colors.dark.icon : Colors.light.icon
											}
										/>
									</TouchableOpacity>
									<TouchableOpacity
										style={[
											styles.toggleButton,
											viewMode === 'text' && styles.toggleButtonActive,
											viewMode === 'text' && isDark && styles.toggleButtonActiveDark,
										]}
										onPress={() => setViewMode('text')}
									>
										<IconSymbol
											name="text.alignleft"
											size={16}
											color={
												viewMode === 'text'
													? '#ffffff'
													: isDark ? Colors.dark.icon : Colors.light.icon
											}
										/>
									</TouchableOpacity>
								</View>
							</View>

							{viewMode === 'visual' ? (
								<WorkoutBuilder
									workoutText={workout.workout_text}
									sport={workout.sport}
									workoutName={workout.name}
									onWorkoutChange={() => {}}
									isEditing={false}
									height={140}
								/>
							) : (
								<View style={[styles.textPreviewContainer, isDark && styles.textPreviewContainerDark]}>
									<Text style={[styles.textPreview, isDark && styles.textPreviewDark]}>
										{workout.workout_text.split('\n').slice(1).join('\n')}
									</Text>
								</View>
							)}
						</View>
					</>
				)}

				{/* Scheduled Instances */}
				<View style={[styles.scheduledCard, isDark && styles.scheduledCardDark]}>
					<View style={styles.scheduledHeader}>
						<Text style={[styles.scheduledTitle, isDark && styles.scheduledTitleDark]}>
							{t('training.schedule', 'Schedule')}
						</Text>
						<TouchableOpacity
							style={[styles.addTimeButtonSmall, isDark && styles.addTimeButtonSmallDark]}
							onPress={handleAddScheduledTime}
						>
							<Text style={[styles.addTimeButtonSmallText, isDark && styles.addTimeButtonSmallTextDark]}>
								+ {t('common.add', 'Add')}
							</Text>
						</TouchableOpacity>
					</View>

					{scheduledInstances.length === 0 ? (
						<View style={styles.emptyScheduleContainer}>
							<Text style={[styles.emptyScheduleText, isDark && styles.emptyScheduleTextDark]}>
								{t('training.noScheduledTimes', 'No scheduled times yet')}
							</Text>
							<TouchableOpacity
								style={[styles.addTimeButton, isDark && styles.addTimeButtonDark]}
								onPress={handleAddScheduledTime}
							>
								<Text style={[styles.addTimeButtonText, isDark && styles.addTimeButtonTextDark]}>
									{t('training.scheduleNow', 'Schedule Now')}
								</Text>
							</TouchableOpacity>
						</View>
					) : (
						<View style={styles.scheduleList}>
							{scheduledInstances.map((instance) => (
								<View key={instance.id} style={[styles.scheduledItem, isDark && styles.scheduledItemDark]}>
									<View style={styles.scheduledDateContainer}>
										<Text style={[styles.scheduledDay, isDark && styles.scheduledDayDark]}>
											{format(new Date(instance.scheduled_time), 'd', {locale: de})}
										</Text>
										<Text style={[styles.scheduledMonth, isDark && styles.scheduledMonthDark]}>
											{format(new Date(instance.scheduled_time), 'MMM', {locale: de})}
										</Text>
									</View>
									<View style={styles.scheduledInfo}>
										<Text style={[styles.scheduledWeekday, isDark && styles.scheduledWeekdayDark]}>
											{format(new Date(instance.scheduled_time), 'EEEE', {locale: de})}
										</Text>
										<Text style={[styles.scheduledTime, isDark && styles.scheduledTimeDark]}>
											{format(new Date(instance.scheduled_time), 'p', {locale: de})}
										</Text>
									</View>
									<View style={styles.scheduledActions}>
										<TouchableOpacity
											style={[styles.actionButton, isDark && styles.actionButtonDark]}
											onPress={() => handleEditScheduledTime(instance)}
										>
											<Text style={[styles.actionButtonText, isDark && styles.actionButtonTextDark]}>✎</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={[styles.actionButton, styles.deleteActionButton, isDark && styles.deleteActionButtonDark]}
											onPress={() => handleDeleteScheduledWorkout(instance.id, instance.scheduled_time)}
										>
											<Text style={[styles.actionButtonText, styles.deleteActionButtonText]}>×</Text>
										</TouchableOpacity>
									</View>
								</View>
							))}
						</View>
					)}
				</View>
			</ScrollView>

			{/* Schedule Time Modal */}
			<Modal
				visible={showScheduleModal}
				transparent={true}
				animationType="fade"
				onRequestClose={handleCancelScheduleModal}
			>
				<View style={styles.modalOverlay}>
					<View style={[styles.modalContent, isDark && styles.modalContentDark]}>
						<Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
							{editingInstance
								? t('training.editScheduledTime', 'Edit Scheduled Time')
								: t('training.addScheduledTime', 'Add Scheduled Time')}
						</Text>

						<View style={styles.dateTimePickerContainer}>
							{Platform.OS === 'web' ? (
								<>
									<View style={styles.webPickerRow}>
										<View style={styles.webPickerGroup}>
											<Text style={[styles.dateLabel, isDark && styles.dateLabelDark]}>
												{t('calendar.date', 'Date')}
											</Text>
											<input
												type="date"
												style={{
													width: '100%',
													padding: '12px 16px',
													borderRadius: '8px',
													border: `1px solid ${isDark ? Colors.dark.border : Colors.light.border}`,
													backgroundColor: isDark ? Colors.dark.card : Colors.light.background,
													color: isDark ? Colors.dark.text : Colors.light.text,
													fontSize: '16px',
													textAlign: 'center',
													outline: 'none',
												}}
												value={selectedDate.toISOString().slice(0, 10)}
												onChange={(e) => {
													const newDate = new Date(selectedDate);
													const [year, month, day] = (e.target as HTMLInputElement).value.split('-').map(Number);
													newDate.setFullYear(year);
													newDate.setMonth(month - 1);
													newDate.setDate(day);
													setSelectedDate(newDate);
												}}
											/>
										</View>
										<View style={styles.webPickerGroup}>
											<Text style={[styles.dateLabel, isDark && styles.dateLabelDark]}>
												{t('calendar.time', 'Time')}
											</Text>
											<input
												type="time"
												style={{
													width: '100%',
													padding: '12px 16px',
													borderRadius: '8px',
													border: `1px solid ${isDark ? Colors.dark.border : Colors.light.border}`,
													backgroundColor: isDark ? Colors.dark.card : Colors.light.background,
													color: isDark ? Colors.dark.text : Colors.light.text,
													fontSize: '16px',
													textAlign: 'center',
													outline: 'none',
												}}
												value={selectedDate.toTimeString().slice(0, 5)}
												onChange={(e) => {
													const newDate = new Date(selectedDate);
													const [hours, minutes] = (e.target as HTMLInputElement).value.split(':').map(Number);
													newDate.setHours(hours);
													newDate.setMinutes(minutes);
													setSelectedDate(newDate);
												}}
											/>
										</View>
									</View>
									<Text style={[styles.datePreview, isDark && styles.datePreviewDark]}>
										{format(selectedDate, 'PPP p', {locale: de})}
									</Text>
								</>
							) : (
								<DateTimePicker
									value={selectedDate}
									mode="datetime"
									display={Platform.OS === 'ios' ? 'spinner' : 'default'}
									onChange={(event, date) => {
										if (date) {
											setSelectedDate(date);
										}
									}}
									themeVariant={isDark ? 'dark' : 'light'}
								/>
							)}
						</View>

						<View style={styles.modalButtons}>
							<TouchableOpacity
								style={[styles.modalButton, styles.modalButtonCancel, isDark && styles.modalButtonCancelDark]}
								onPress={handleCancelScheduleModal}
							>
								<Text style={[styles.modalButtonText, isDark && styles.modalButtonTextDark]}>
									{t('common.cancel', 'Cancel')}
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.modalButton, styles.modalButtonSave, isDark && styles.modalButtonSaveDark]}
								onPress={handleSaveScheduledTime}
							>
								<Text style={[styles.modalButtonSaveText, isDark && styles.modalButtonSaveTextDark]}>
									{t('common.save', 'Save')}
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
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
		fontSize: 18,
		color: Colors.light.text,
		fontWeight: "500",
	},
	backButtonTextDark: {
		color: Colors.dark.text,
	},
	placeholder: {
		width: 60,
	},
	headerEditButton: {
		paddingVertical: 6,
		paddingHorizontal: 4,
	},
	headerEditButtonText: {
		fontSize: 16,
		color: Colors.light.tint,
		fontWeight: "500",
	},
	headerEditButtonTextDark: {
		color: Colors.dark.tint,
	},
	content: {
		flex: 1,
		paddingHorizontal: 16,
		paddingTop: 16,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	errorContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
	},
	errorTitle: {
		fontSize: 20,
		fontWeight: "600",
		color: Colors.light.text,
		marginBottom: 8,
		textAlign: "center",
	},
	errorTitleDark: {
		color: Colors.dark.text,
	},
	errorMessage: {
		fontSize: 16,
		color: Colors.light.icon,
		textAlign: "center",
		lineHeight: 22,
	},
	errorMessageDark: {
		color: Colors.dark.icon,
	},
	infoCard: {
		backgroundColor: Colors.light.background,
		borderRadius: 16,
		padding: 16,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: Colors.light.border,
	},
	infoCardDark: {
		backgroundColor: Colors.dark.card,
		borderColor: Colors.dark.border,
	},
	trainingName: {
		fontSize: 20,
		fontWeight: "700",
		color: Colors.light.text,
		marginBottom: 8,
	},
	trainingNameDark: {
		color: Colors.dark.text,
	},
	description: {
		fontSize: 14,
		color: Colors.light.icon,
		lineHeight: 20,
		marginBottom: 12,
	},
	descriptionDark: {
		color: Colors.dark.icon,
	},
	metaInfo: {
		flexDirection: "row",
		alignItems: "center",
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: Colors.light.border,
	},
	metaItem: {
		flex: 1,
		alignItems: "center",
	},
	metaDivider: {
		width: 1,
		height: 32,
		backgroundColor: Colors.light.border,
	},
	metaLabel: {
		fontSize: 12,
		fontWeight: "500",
		color: Colors.light.icon,
		marginTop: 2,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	metaLabelDark: {
		color: Colors.dark.icon,
	},
	metaValue: {
		fontSize: 16,
		fontWeight: "600",
		color: Colors.light.text,
	},
	metaValueDark: {
		color: Colors.dark.text,
	},
	builderCard: {
		backgroundColor: Colors.light.background,
		borderRadius: 16,
		padding: 16,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: Colors.light.border,
	},
	builderCardDark: {
		backgroundColor: Colors.dark.card,
		borderColor: Colors.dark.border,
	},
	builderHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	builderTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: Colors.light.text,
	},
	builderTitleDark: {
		color: Colors.dark.text,
	},
	toggleContainer: {
		flexDirection: 'row',
		backgroundColor: Colors.light.muted,
		borderRadius: 8,
		padding: 2,
	},
	toggleContainerDark: {
		backgroundColor: Colors.dark.muted,
	},
	toggleButton: {
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 6,
	},
	toggleButtonActive: {
		backgroundColor: Colors.light.tint,
	},
	toggleButtonActiveDark: {
		backgroundColor: Colors.dark.tint,
	},
	textPreviewContainer: {
		backgroundColor: Colors.light.muted,
		borderRadius: 12,
		padding: 12,
		minHeight: 140,
	},
	textPreviewContainerDark: {
		backgroundColor: Colors.dark.muted,
	},
	textPreview: {
		fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
		fontSize: 12,
		color: Colors.light.text,
		lineHeight: 18,
	},
	textPreviewDark: {
		color: Colors.dark.text,
	},
	saveButton: {
		backgroundColor: Colors.light.tint,
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 12,
		marginBottom: 16,
	},
	saveButtonDark: {
		backgroundColor: Colors.dark.tint,
	},
	saveButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "600",
	},
	scheduledCard: {
		backgroundColor: Colors.light.background,
		borderRadius: 16,
		padding: 16,
		marginBottom: 32,
		borderWidth: 1,
		borderColor: Colors.light.border,
	},
	scheduledCardDark: {
		backgroundColor: Colors.dark.card,
		borderColor: Colors.dark.border,
	},
	scheduledHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	scheduledTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: Colors.light.text,
	},
	scheduledTitleDark: {
		color: Colors.dark.text,
	},
	addTimeButtonSmall: {
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 16,
		backgroundColor: Colors.light.tint + '20',
	},
	addTimeButtonSmallDark: {
		backgroundColor: Colors.dark.tint + '30',
	},
	addTimeButtonSmallText: {
		fontSize: 14,
		fontWeight: "600",
		color: Colors.light.tint,
	},
	addTimeButtonSmallTextDark: {
		color: Colors.dark.tint,
	},
	emptyScheduleContainer: {
		alignItems: "center",
		paddingVertical: 16,
	},
	emptyScheduleText: {
		fontSize: 14,
		color: Colors.light.icon,
		fontStyle: "italic",
		textAlign: "center",
		marginBottom: 12,
	},
	emptyScheduleTextDark: {
		color: Colors.dark.icon,
	},
	addTimeButton: {
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 10,
		backgroundColor: Colors.light.tint,
	},
	addTimeButtonDark: {
		backgroundColor: Colors.dark.tint,
	},
	addTimeButtonText: {
		fontSize: 14,
		fontWeight: "600",
		color: "#ffffff",
	},
	addTimeButtonTextDark: {
		color: "#ffffff",
	},
	scheduleList: {
		gap: 10,
	},
	scheduledItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		backgroundColor: Colors.light.muted,
		borderRadius: 12,
	},
	scheduledItemDark: {
		backgroundColor: Colors.dark.muted,
	},
	scheduledDateContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingRight: 12,
		borderRightWidth: 1,
		borderRightColor: Colors.light.border,
		minWidth: 50,
	},
	scheduledDay: {
		fontSize: 20,
		fontWeight: "700",
		color: Colors.light.text,
		lineHeight: 24,
	},
	scheduledDayDark: {
		color: Colors.dark.text,
	},
	scheduledMonth: {
		fontSize: 12,
		fontWeight: "600",
		color: Colors.light.tint,
		textTransform: "uppercase",
	},
	scheduledMonthDark: {
		color: Colors.dark.tint,
	},
	scheduledInfo: {
		flex: 1,
		paddingLeft: 12,
	},
	scheduledWeekday: {
		fontSize: 14,
		fontWeight: "600",
		color: Colors.light.text,
		marginBottom: 2,
	},
	scheduledWeekdayDark: {
		color: Colors.dark.text,
	},
	scheduledTime: {
		fontSize: 13,
		color: Colors.light.icon,
	},
	scheduledTimeDark: {
		color: Colors.dark.icon,
	},
	scheduledActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	actionButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: Colors.light.background,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: Colors.light.border,
	},
	actionButtonDark: {
		backgroundColor: Colors.dark.card,
	},
	actionButtonText: {
		fontSize: 14,
		color: Colors.light.text,
	},
	actionButtonTextDark: {
		color: Colors.dark.text,
	},
	deleteActionButton: {
		backgroundColor: '#fee2e2',
	},
	deleteActionButtonDark: {
		backgroundColor: '#450a0a',
	},
	deleteActionButtonText: {
		color: '#ef4444',
		fontSize: 18,
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
	},
	modalContentDark: {
		backgroundColor: Colors.dark.background,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: Colors.light.text,
		marginBottom: 20,
		textAlign: "center",
	},
	modalTitleDark: {
		color: Colors.dark.text,
	},
	dateTimePickerContainer: {
		alignItems: "center",
		marginBottom: 24,
		width: "100%",
	},
	webPickerRow: {
		flexDirection: "row",
		gap: 12,
		width: "100%",
		marginBottom: 12,
	},
	webPickerGroup: {
		flex: 1,
	},
	dateLabel: {
		fontSize: 14,
		fontWeight: "500",
		color: Colors.light.text,
		marginBottom: 8,
		textAlign: "center",
	},
	dateLabelDark: {
		color: Colors.dark.text,
	},
	datePreview: {
		fontSize: 14,
		color: Colors.light.icon,
		textAlign: "center",
		marginTop: 8,
	},
	datePreviewDark: {
		color: Colors.dark.icon,
	},
	modalButtons: {
		flexDirection: "row",
		gap: 12,
	},
	modalButton: {
		flex: 1,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: "center",
	},
	modalButtonCancel: {
		backgroundColor: Colors.light.muted,
		borderWidth: 1,
		borderColor: Colors.light.border,
	},
	modalButtonCancelDark: {
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
	modalButtonSave: {
		backgroundColor: Colors.light.tint,
	},
	modalButtonSaveDark: {
		backgroundColor: Colors.dark.tint,
	},
	modalButtonSaveText: {
		fontSize: 15,
		fontWeight: "600",
		color: "#ffffff",
	},
	modalButtonSaveTextDark: {
		color: "#ffffff",
	},
});
