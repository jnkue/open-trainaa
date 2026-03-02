import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/services/api";
import { analyticsConsentStorage } from "@/utils/analyticsConsent";

export function useAnalyticsConsent() {
	const { user } = useAuth();
	const [consent, setConsent] = useState<boolean | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);

	const fetchConsent = useCallback(async () => {
		if (!user?.id) {
			setIsLoading(false);
			return;
		}

		try {
			const { data, error } = await apiClient.supabase
				.from("user_infos")
				.select("analytics_consent")
				.eq("user_id", user.id)
				.maybeSingle();

			if (error) throw error;

			const dbConsent = data?.analytics_consent ?? null;
			setConsent(dbConsent);

			if (dbConsent !== null) {
				await analyticsConsentStorage.set(dbConsent);
			}

			if (dbConsent === null) {
				setShowModal(true);
			}
		} catch (error) {
			console.error("Error fetching analytics consent:", error);
		} finally {
			setIsLoading(false);
		}
	}, [user?.id]);

	const saveConsent = useCallback(
		async (consented: boolean) => {
			if (!user?.id) throw new Error("No user ID");

			const { data: existingRecord } = await apiClient.supabase
				.from("user_infos")
				.select("id")
				.eq("user_id", user.id)
				.maybeSingle();

			if (existingRecord) {
				const { error } = await apiClient.supabase
					.from("user_infos")
					.update({ analytics_consent: consented })
					.eq("user_id", user.id);
				if (error) throw error;
			} else {
				const { error } = await apiClient.supabase
					.from("user_infos")
					.insert([{ user_id: user.id, analytics_consent: consented }]);
				if (error) throw error;
			}

			setConsent(consented);
			setShowModal(false);
			await analyticsConsentStorage.set(consented);
		},
		[user?.id],
	);

	useEffect(() => {
		fetchConsent();
	}, [fetchConsent]);

	return { consent, isLoading, showModal, setShowModal, saveConsent };
}
