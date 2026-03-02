import { browser } from '$app/environment';
import { locale } from 'svelte-i18n';

// Load saved locale from localStorage on client
if (browser) {
	const savedLocale = localStorage.getItem('locale');
	if (savedLocale) {
		locale.set(savedLocale);
	}
}

// Subscribe to locale changes and save to localStorage
locale.subscribe((value) => {
	if (browser && value) {
		localStorage.setItem('locale', value);
	}
});
