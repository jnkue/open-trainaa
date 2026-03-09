import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/services/api";
import { showAlert } from "@/utils/alert";

export function useUserAttributes() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [editingAttributes, setEditingAttributes] = useState<Record<string, any>>({});
	const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
	const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

	// Query for user attributes
	const {
		data: attributes = {},
		isLoading: attrLoading,
	} = useQuery({
		queryKey: ["user-attributes", user?.id],
		queryFn: async () => {
			if (!user?.id) throw new Error("No user ID");

			const { data, error } = await apiClient.supabase
				.from("user_infos")
				.select("max_heart_rate, threshold_heart_rate, functional_threshold_power, run_threshold_pace, weight_kg, height_cm, automatic_calculation_mode, language, post_feedback_to_strava, push_notification_feedback, push_notification_daily_overview")
				.eq("user_id", user.id)
				.maybeSingle();

			if (error) throw error;

			const attrs: Record<string, any> = {};
			if (data) {
				attrs.max_heart_rate = data.max_heart_rate;
				attrs.threshold_heart_rate = data.threshold_heart_rate;
				attrs.functional_threshold_power = data.functional_threshold_power;
				attrs.run_threshold_pace = data.run_threshold_pace;
				attrs.weight_kg = data.weight_kg;
				attrs.height_cm = data.height_cm;
				attrs.automatic_calculation_mode = data.automatic_calculation_mode ?? true; // default to true
				attrs.language = data.language ?? "en"; // default to English
				attrs.post_feedback_to_strava = data.post_feedback_to_strava ?? false; // default to false
				attrs.push_notification_feedback = data.push_notification_feedback ?? false;
				attrs.push_notification_daily_overview = data.push_notification_daily_overview ?? false;
			}
			return attrs;
		},
		enabled: !!user?.id,
	});

	// Mutation for saving user attributes
	const saveAttributeMutation = useMutation({
		mutationFn: async ({ key, value }: { key: string; value: any }) => {
			if (!user?.id) throw new Error("No user ID");

			// Convert string values to appropriate types for numeric fields
			let processedValue = value;
			if (["max_heart_rate", "threshold_heart_rate", "functional_threshold_power", "weight_kg", "height_cm"].includes(key)) {
				processedValue = value ? Number(value) : null;
			} else if (key === "automatic_calculation_mode" || key === "post_feedback_to_strava" || key === "push_notification_feedback" || key === "push_notification_daily_overview") {
				processedValue = Boolean(value);
			}

			// Check if record exists
			const { data: existingRecord } = await apiClient.supabase
				.from("user_infos")
				.select("id")
				.eq("user_id", user.id)
				.maybeSingle();

			if (existingRecord) {
				// Update existing record
				const { error } = await apiClient.supabase
					.from("user_infos")
					.update({ [key]: processedValue })
					.eq("user_id", user.id);
				if (error) throw error;
			} else {
				// Insert new record
				const payload = {
					user_id: user.id,
					[key]: processedValue,
				};
				const { error } = await apiClient.supabase
					.from("user_infos")
					.insert([payload]);
				if (error) throw error;
			}

			return { key, value: processedValue };
		},
		onMutate: ({ key }) => {
			setSavingFields(prev => new Set(prev).add(key));
		},
		onSuccess: ({ key }) => {
			setSavingFields(prev => {
				const newSet = new Set(prev);
				newSet.delete(key);
				return newSet;
			});
			queryClient.invalidateQueries({ queryKey: ["user-attributes", user?.id] });
		},
		onError: (error, { key }) => {
			setSavingFields(prev => {
				const newSet = new Set(prev);
				newSet.delete(key);
				return newSet;
			});
			console.error("Error saving attribute:", error);
			showAlert("Fehler", "Speichern des Attributs fehlgeschlagen.");
		},
	});

	// Auto-save with debouncing
	const debouncedSave = useCallback((key: string, value: any) => {
		// Clear existing timer
		if (debounceTimers.current[key]) {
			clearTimeout(debounceTimers.current[key]);
		}

		// Set new timer
		debounceTimers.current[key] = setTimeout(() => {
			saveAttributeMutation.mutate({ key, value });
			delete debounceTimers.current[key];
		}, 1000); // 1 second debounce
	}, [saveAttributeMutation]);

	// Clean up timers on unmount
	useEffect(() => {
		const timers = debounceTimers.current;
		return () => {
			Object.values(timers).forEach(timer => clearTimeout(timer));
		};
	}, []);

	const handleChangeAttr = useCallback((key: string, value: any) => {
		setEditingAttributes((prev) => ({ ...prev, [key]: value }));
		
		// Auto-save with debouncing
		debouncedSave(key, value);
	}, [debouncedSave]);

	const handleSaveAttr = (key: string) => {
		const value = editingAttributes[key] !== undefined ? editingAttributes[key] : attributes[key];
		saveAttributeMutation.mutate({ key, value });
	};

	const getAttributeValue = (key: string) => {
		return editingAttributes[key] !== undefined 
			? String(editingAttributes[key]) 
			: (attributes?.[key] ? String(attributes[key]) : "");
	};

	const isFieldSaving = (key: string) => {
		return savingFields.has(key);
	};

	return {
		attributes,
		attrLoading,
		editingAttributes,
		isSaving: saveAttributeMutation.isPending,
		handleChangeAttr,
		handleSaveAttr,
		getAttributeValue,
		isFieldSaving,
	};
}
