import AsyncStorage from "@react-native-async-storage/async-storage";

const CONSENT_STORAGE_KEY = "@trainaa_analytics_consent";

export type AnalyticsConsent = boolean | null;

let _cachedConsent: AnalyticsConsent = null;

export const analyticsConsentStorage = {
	async get(): Promise<AnalyticsConsent> {
		try {
			const value = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
			if (value === null) return null;
			return value === "true";
		} catch {
			return null;
		}
	},

	async set(consent: boolean): Promise<void> {
		await AsyncStorage.setItem(CONSENT_STORAGE_KEY, String(consent));
		_cachedConsent = consent;
	},

	getSync(): AnalyticsConsent {
		return _cachedConsent;
	},

	updateCache(consent: AnalyticsConsent): void {
		_cachedConsent = consent;
	},
};

// Load cached value on module import
analyticsConsentStorage.get().then((consent) => {
	_cachedConsent = consent;
});
