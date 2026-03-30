import React, { useState, useCallback } from "react";
import {
	View,
	ScrollView,
	TouchableOpacity,
	Modal,
	FlatList,
	ActivityIndicator,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useRaceEvents } from "@/hooks/useRaceEvents";
import { GoalCard } from "@/components/onboarding/GoalCard";
import { SportCard } from "@/components/onboarding/SportCard";
import { RaceForm } from "@/components/onboarding/RaceForm";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { apiClient } from "@/services/api";
import { showAlert } from "@/utils/alert";
import type { GoalSlug, SportSlug, RaceInfo } from "@/types/onboarding";

const GOALS: GoalSlug[] = [
	"breakPR",
	"buildConsistency",
	"weightManagement",
	"trainForRace",
	"stayHealthy",
	"reduceStress",
];

const SPORTS: SportSlug[] = [
	"running",
	"trailrunning",
	"cycling",
	"gym",
	"swimming",
	"triathlon",
	"yoga",
];

const EMPTY_RACE: RaceInfo = { name: "", date: "", eventType: "" };

function SectionHeader({ title, first }: { title: string; first?: boolean }) {
	return (
		<Text className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2 ${first ? "" : "mt-4"}`}>
			{title}
		</Text>
	);
}

export default function GoalsAndRacesScreen() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const { isDark } = useTheme();
	const queryClient = useQueryClient();

	const iconColor = isDark ? "#9CA3AF" : "#6B7280";

	// ── Modal visibility state ──────────────────────────────────────────────
	const [goalModalOpen, setGoalModalOpen] = useState(false);
	const [sportsModalOpen, setSportsModalOpen] = useState(false);
	const [raceModalOpen, setRaceModalOpen] = useState(false);

	// ── Local edit state ────────────────────────────────────────────────────
	const [selectedGoals, setSelectedGoals] = useState<GoalSlug[]>([]);
	const [selectedSports, setSelectedSports] = useState<SportSlug[]>([]);
	const [raceForm, setRaceForm] = useState<RaceInfo>(EMPTY_RACE);

	// ── Fetch current user_infos ────────────────────────────────────────────
	const { data: userInfos, isLoading: userInfosLoading } = useQuery({
		queryKey: ["user-infos-goals", user?.id],
		queryFn: async () => {
			if (!user?.id) throw new Error("No user ID");
			const { data, error } = await apiClient.supabase
				.from("user_infos")
				.select("goals, sports")
				.eq("user_id", user.id)
				.maybeSingle();
			if (error) throw error;
			return data as { goals: string[] | null; sports: string[] | null } | null;
		},
		enabled: !!user?.id,
	});

	// ── Mutation: update goals ──────────────────────────────────────────────
	const updateGoalsMutation = useMutation({
		mutationFn: async (goals: GoalSlug[]) => {
			if (!user?.id) throw new Error("No user ID");
			const { error } = await apiClient.supabase
				.from("user_infos")
				.update({ goals })
				.eq("user_id", user.id);
			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["user-infos-goals", user?.id] });
			setGoalModalOpen(false);
		},
		onError: () => {
			showAlert(t("common.error"), t("errors.somethingWentWrong"));
		},
	});

	// ── Mutation: update sports ─────────────────────────────────────────────
	const updateSportsMutation = useMutation({
		mutationFn: async (sports: SportSlug[]) => {
			if (!user?.id) throw new Error("No user ID");
			const { error } = await apiClient.supabase
				.from("user_infos")
				.update({ sports })
				.eq("user_id", user.id);
			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["user-infos-goals", user?.id] });
			setSportsModalOpen(false);
		},
		onError: () => {
			showAlert(t("common.error"), t("errors.somethingWentWrong"));
		},
	});

	// ── Race events ─────────────────────────────────────────────────────────
	const { raceEvents, isLoading: racesLoading, createRaceEvent, deleteRaceEvent, isCreating } = useRaceEvents();

	// ── Handlers ────────────────────────────────────────────────────────────
	const openGoalModal = useCallback(() => {
		setSelectedGoals((userInfos?.goals as GoalSlug[]) ?? []);
		setGoalModalOpen(true);
	}, [userInfos]);

	const openSportsModal = useCallback(() => {
		setSelectedSports((userInfos?.sports as SportSlug[]) ?? []);
		setSportsModalOpen(true);
	}, [userInfos]);

	const openRaceModal = useCallback(() => {
		setRaceForm(EMPTY_RACE);
		setRaceModalOpen(true);
	}, []);

	const toggleGoal = useCallback((goal: GoalSlug) => {
		setSelectedGoals((prev) =>
			prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
		);
	}, []);

	const toggleSport = useCallback((sport: SportSlug) => {
		setSelectedSports((prev) =>
			prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
		);
	}, []);

	const handleSaveGoals = useCallback(() => {
		updateGoalsMutation.mutate(selectedGoals);
	}, [selectedGoals, updateGoalsMutation]);

	const handleSaveSports = useCallback(() => {
		updateSportsMutation.mutate(selectedSports);
	}, [selectedSports, updateSportsMutation]);

	const handleAddRace = useCallback(async () => {
		if (!raceForm.name || !raceForm.date) return;
		await createRaceEvent({
			name: raceForm.name,
			event_date: raceForm.date,
			event_type: raceForm.eventType || undefined,
		});
		setRaceModalOpen(false);
	}, [raceForm, createRaceEvent]);

	const handleDeleteRace = useCallback(
		(id: string) => {
			showAlert(
				t("common.delete"),
				t("goalsAndRaces.deleteRaceConfirm"),
				[
					{ text: t("common.cancel"), style: "cancel" },
					{ text: t("common.delete"), style: "destructive", onPress: () => deleteRaceEvent(id) },
				]
			);
		},
		[deleteRaceEvent, t]
	);

	// ── Derived display values ───────────────────────────────────────────────
	const currentGoalsLabel =
		userInfos?.goals && userInfos.goals.length > 0
			? (userInfos.goals as GoalSlug[])
				.map((g) => t(`onboarding.goal.${g}`))
				.join(", ")
			: "—";

	const currentSportsLabel =
		userInfos?.sports && userInfos.sports.length > 0
			? (userInfos.sports as SportSlug[])
				.map((s) => t(`onboarding.sports.${s}`))
				.join(", ")
			: "—";

	return (
		<>
			<ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
				<View className="max-w-3xl xl:max-w-7xl mx-auto w-full p-4 md:p-6">

					{/* Section 1: Upcoming Races */}
					<SectionHeader title={t("goalsAndRaces.racesSection")} first />
					<View className="bg-card rounded-xl border border-border overflow-hidden mb-2">
						{racesLoading ? (
							<View className="p-4 items-center">
								<ActivityIndicator size="small" />
							</View>
						) : raceEvents.length === 0 ? (
							<View className="p-4">
								<Text className="text-base text-muted-foreground">{t("goalsAndRaces.noRaces")}</Text>
							</View>
						) : (
							<FlatList
								data={raceEvents}
								scrollEnabled={false}
								keyExtractor={(item) => item.id}
								ItemSeparatorComponent={() => <View className="h-px bg-border mx-4" />}
								renderItem={({ item }) => (
									<View className="flex-row items-center justify-between px-4 py-3">
										<View className="flex-1 mr-3">
											<Text className="text-base text-foreground">{item.name}</Text>
											<Text className="text-sm text-muted-foreground mt-0.5">
												{item.event_date}{item.event_type ? ` · ${item.event_type}` : ""}
											</Text>
										</View>
										<TouchableOpacity onPress={() => handleDeleteRace(item.id)} hitSlop={8}>
											<IconSymbol name="trash" size={18} color={iconColor} />
										</TouchableOpacity>
									</View>
								)}
							/>
						)}
						<View className="border-t border-border">
							<TouchableOpacity onPress={openRaceModal} className="px-4 py-3">
								<Text className="text-sm text-primary font-medium">{t("goalsAndRaces.addRace")}</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Section 2: Goals */}
					<SectionHeader title={t("goalsAndRaces.goalSection")} />
					<View className="bg-card rounded-xl border border-border overflow-hidden mb-2">
						<View className="flex-row items-center justify-between px-4 py-4">
							{userInfosLoading ? (
								<ActivityIndicator size="small" />
							) : (
								<Text className="text-base text-foreground flex-1 mr-3">{currentGoalsLabel}</Text>
							)}
							<TouchableOpacity onPress={openGoalModal}>
								<Text className="text-sm text-primary font-medium">{t("goalsAndRaces.editGoal")}</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Section 3: My Sports */}
					<SectionHeader title={t("goalsAndRaces.sportsSection")} />
					<View className="bg-card rounded-xl border border-border overflow-hidden mb-2">
						<View className="flex-row items-center justify-between px-4 py-4">
							{userInfosLoading ? (
								<ActivityIndicator size="small" />
							) : (
								<Text className="text-base text-foreground flex-1 mr-3">{currentSportsLabel}</Text>
							)}
							<TouchableOpacity onPress={openSportsModal}>
								<Text className="text-sm text-primary font-medium">{t("goalsAndRaces.editSports")}</Text>
							</TouchableOpacity>
						</View>
					</View>

				</View>
			</ScrollView>

			{/* ── Goals Modal ───────────────────────────────────────────── */}
			<Modal visible={goalModalOpen} animationType="slide" presentationStyle="pageSheet">
				<View className="flex-1 bg-background">
					<View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
						<TouchableOpacity onPress={() => setGoalModalOpen(false)}>
							<Text className="text-base text-muted-foreground">{t("common.cancel")}</Text>
						</TouchableOpacity>
						<Text className="text-base font-semibold text-foreground">{t("goalsAndRaces.goalSection")}</Text>
						<TouchableOpacity onPress={handleSaveGoals} disabled={updateGoalsMutation.isPending}>
							{updateGoalsMutation.isPending ? (
								<ActivityIndicator size="small" />
							) : (
								<Text className="text-base text-primary font-semibold">{t("goalsAndRaces.saveChanges")}</Text>
							)}
						</TouchableOpacity>
					</View>
					<ScrollView className="flex-1 p-4">
						<View className="gap-3">
							{GOALS.map((goal, i) => (
								<GoalCard
									key={goal}
									slug={goal}
									label={t(`onboarding.goal.${goal}`)}
									selected={selectedGoals.includes(goal)}
									onPress={() => toggleGoal(goal)}
									index={i}
								/>
							))}
						</View>
					</ScrollView>
				</View>
			</Modal>

			{/* ── Sports Modal ──────────────────────────────────────────── */}
			<Modal visible={sportsModalOpen} animationType="slide" presentationStyle="pageSheet">
				<View className="flex-1 bg-background">
					<View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
						<TouchableOpacity onPress={() => setSportsModalOpen(false)}>
							<Text className="text-base text-muted-foreground">{t("common.cancel")}</Text>
						</TouchableOpacity>
						<Text className="text-base font-semibold text-foreground">{t("goalsAndRaces.sportsSection")}</Text>
						<TouchableOpacity onPress={handleSaveSports} disabled={updateSportsMutation.isPending}>
							{updateSportsMutation.isPending ? (
								<ActivityIndicator size="small" />
							) : (
								<Text className="text-base text-primary font-semibold">{t("goalsAndRaces.saveChanges")}</Text>
							)}
						</TouchableOpacity>
					</View>
					<ScrollView className="flex-1 p-4">
						<View className="flex-row flex-wrap gap-3">
							{SPORTS.map((sport) => (
								<SportCard
									key={sport}
									slug={sport}
									label={t(`onboarding.sports.${sport}`)}
									selected={selectedSports.includes(sport)}
									onPress={() => toggleSport(sport)}
								/>
							))}
						</View>
					</ScrollView>
				</View>
			</Modal>

			{/* ── Add Race Modal ────────────────────────────────────────── */}
			<Modal visible={raceModalOpen} animationType="slide" presentationStyle="pageSheet">
				<View className="flex-1 bg-background">
					<View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
						<TouchableOpacity onPress={() => setRaceModalOpen(false)}>
							<Text className="text-base text-muted-foreground">{t("common.cancel")}</Text>
						</TouchableOpacity>
						<Text className="text-base font-semibold text-foreground">{t("goalsAndRaces.addRace")}</Text>
						<TouchableOpacity onPress={handleAddRace} disabled={isCreating || !raceForm.name || !raceForm.date}>
							{isCreating ? (
								<ActivityIndicator size="small" />
							) : (
								<Text className={`text-base font-semibold ${raceForm.name && raceForm.date ? "text-primary" : "text-muted-foreground"}`}>
									{t("goalsAndRaces.saveChanges")}
								</Text>
							)}
						</TouchableOpacity>
					</View>
					<ScrollView className="flex-1 p-4">
						<RaceForm value={raceForm} onChange={setRaceForm} />
					</ScrollView>
				</View>
			</Modal>
		</>
	);
}
