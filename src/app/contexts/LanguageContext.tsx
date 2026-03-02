import React, {createContext, useContext, useState, useEffect} from "react";
import {useTranslation} from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {apiClient} from "@/services/api";

type LanguageContextType = {
	currentLanguage: string;
	availableLanguages: {code: string; name: string}[];
	changeLanguage: (languageCode: string) => Promise<void>;
	isLoading: boolean;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({children}: {children: React.ReactNode}) {
	const {i18n} = useTranslation();
	const [isLoading, setIsLoading] = useState(true);

	const availableLanguages = [
		{code: "en", name: "English"},
		{code: "de", name: "Deutsch"},
		{code: "es", name: "Español"},
		{code: "fr", name: "Français"},
	];

	const changeLanguage = async (languageCode: string) => {
		try {
			// Change the UI language
			await i18n.changeLanguage(languageCode);
			await AsyncStorage.setItem("language", languageCode);

			// Save to database if user is logged in
			// Get current user from Supabase directly (not from context)
			const {
				data: {user},
			} = await apiClient.supabase.auth.getUser();

			if (user?.id) {
				try {
					// Check if user_infos record exists
					const {data: existingRecord} = await apiClient.supabase.from("user_infos").select("id").eq("user_id", user.id).maybeSingle();

					if (existingRecord) {
						// Update existing record
						await apiClient.supabase.from("user_infos").update({language: languageCode}).eq("user_id", user.id);
					} else {
						// Insert new record
						await apiClient.supabase.from("user_infos").insert([{user_id: user.id, language: languageCode}]);
					}
					console.log(`✅ Language saved to database: ${languageCode}`);
				} catch (dbError) {
					console.error("Failed to save language to database:", dbError);
					// Don't throw - UI language change was successful
				}
			}
		} catch (error) {
			console.error("Failed to change language:", error);
		}
	};

	useEffect(() => {
		// Wait for i18n to be initialized
		if (i18n.isInitialized) {
			setIsLoading(false);
		} else {
			i18n.on("initialized", () => {
				setIsLoading(false);
			});
		}

		return () => {
			i18n.off("initialized");
		};
	}, [i18n]);

	// Load language from database when user logs in
	useEffect(() => {
		const loadLanguageFromDatabase = async () => {
			if (!i18n.isInitialized) return;

			try {
				// Get current user from Supabase directly
				const {
					data: {user},
				} = await apiClient.supabase.auth.getUser();

				if (user?.id) {
					const {data} = await apiClient.supabase.from("user_infos").select("language").eq("user_id", user.id).maybeSingle();

					if (data?.language && data.language !== i18n.language) {
						console.log(`📥 Loading language from database: ${data.language}`);
						await i18n.changeLanguage(data.language);
						await AsyncStorage.setItem("language", data.language);
					}
				}
			} catch (error) {
				console.error("Failed to load language from database:", error);
			}
		};

		loadLanguageFromDatabase();

		// Listen for auth state changes
		const {
			data: {subscription},
		} = apiClient.supabase.auth.onAuthStateChange((event, session) => {
			if (event === "SIGNED_IN" && session?.user) {
				loadLanguageFromDatabase();
			}
		});

		return () => {
			subscription.unsubscribe();
		};
	}, [i18n]);

	const value: LanguageContextType = {
		currentLanguage: i18n.language,
		availableLanguages,
		changeLanguage,
		isLoading,
	};

	return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
	const context = useContext(LanguageContext);
	if (context === undefined) {
		throw new Error("useLanguage must be used within a LanguageProvider");
	}
	return context;
}
