import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

type InterpolationValue = string | number | boolean | Date | null | undefined;

/**
 * Get a translation synchronously (for use in non-reactive contexts)
 * @param key - Translation key
 * @param values - Values for interpolation
 * @returns Translated string
 */
export function t(key: string, values?: Record<string, InterpolationValue>): string {
	return get(_)(key, { values });
}

/**
 * Format a date according to the current locale
 * @param date - Date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
	// Get current locale from svelte-i18n
	const locale = get(_);
	const currentLocale = locale('__locale__') || 'de';
	
	return new Intl.DateTimeFormat(currentLocale, options).format(date);
}

/**
 * Format a number according to the current locale
 * @param number - Number to format
 * @param options - Intl.NumberFormatOptions
 * @returns Formatted number string
 */
export function formatNumber(number: number, options?: Intl.NumberFormatOptions): string {
	const locale = get(_);
	const currentLocale = locale('__locale__') || 'de';
	
	return new Intl.NumberFormat(currentLocale, options).format(number);
}
