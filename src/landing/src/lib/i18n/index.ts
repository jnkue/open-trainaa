import { browser } from '$app/environment';
import { init, register } from 'svelte-i18n';

const defaultLocale = 'de';
const supportedLocales = ['de', 'en', 'fr', 'es', 'it'];

// Function to detect browser language
function detectBrowserLanguage(): string {
	if (!browser) return defaultLocale;
	
	// Check localStorage first
	const storedLocale = localStorage.getItem('locale');
	if (storedLocale && supportedLocales.includes(storedLocale)) {
		return storedLocale;
	}
	
	// Check browser languages in order of preference
	const browserLanguages = navigator.languages || [navigator.language];
	
	for (const lang of browserLanguages) {
		const code = lang.split('-')[0].toLowerCase();
		if (supportedLocales.includes(code)) {
			return code;
		}
	}
	
	return defaultLocale;
}

register('en', () => import('./locales/en.json'));
register('de', () => import('./locales/de.json'));
register('fr', () => import('./locales/fr.json'));
register('es', () => import('./locales/es.json'));
register('it', () => import('./locales/it.json'));

init({
	fallbackLocale: defaultLocale,
	initialLocale: detectBrowserLanguage(),
});

// Export supported locales for use in components
export { supportedLocales };

// Import stores to set up localStorage persistence
import './stores';
