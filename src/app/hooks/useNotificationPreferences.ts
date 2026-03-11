import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/services/api";

export function useNotificationPreferences() {
	const { user } = useAuth();
	const [feedbackEnabled, setFeedbackEnabled] = useState(true);
	const [dailyOverviewEnabled, setDailyOverviewEnabled] = useState(true);
	const [isLoading, setIsLoading] = useState(true);

	const fetchPreferences = useCallback(async () => {
		if (!user?.id) {
			setIsLoading(false);
			return;
		}
		try {
			const { data, error } = await apiClient.supabase
				.from("user_infos")
				.select(
					"push_notification_feedback, push_notification_daily_overview"
				)
				.eq("user_id", user.id)
				.maybeSingle();

			if (error) throw error;

			setFeedbackEnabled(
				data?.push_notification_feedback ?? true
			);
			setDailyOverviewEnabled(
				data?.push_notification_daily_overview ?? true
			);
		} catch (error) {
			console.error(
				"Error fetching notification preferences:",
				error
			);
		} finally {
			setIsLoading(false);
		}
	}, [user?.id]);

	const savePreference = useCallback(
		async (key: string, enabled: boolean) => {
			if (!user?.id) return;

			const { data: existing } = await apiClient.supabase
				.from("user_infos")
				.select("id")
				.eq("user_id", user.id)
				.maybeSingle();

			if (existing) {
				await apiClient.supabase
					.from("user_infos")
					.update({ [key]: enabled })
					.eq("user_id", user.id);
			} else {
				await apiClient.supabase
					.from("user_infos")
					.insert([{ user_id: user.id, [key]: enabled }]);
			}
		},
		[user?.id]
	);

	const saveFeedbackPreference = useCallback(
		async (enabled: boolean) => {
			setFeedbackEnabled(enabled);
			await savePreference("push_notification_feedback", enabled);
		},
		[savePreference]
	);

	const saveDailyOverviewPreference = useCallback(
		async (enabled: boolean) => {
			setDailyOverviewEnabled(enabled);
			await savePreference(
				"push_notification_daily_overview",
				enabled
			);
		},
		[savePreference]
	);

	useEffect(() => {
		fetchPreferences();
	}, [fetchPreferences]);

	return {
		feedbackEnabled,
		dailyOverviewEnabled,
		isLoading,
		saveFeedbackPreference,
		saveDailyOverviewPreference,
	};
}
