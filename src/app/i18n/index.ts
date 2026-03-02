import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

const LANGUAGE_DETECTOR = {
  type: 'languageDetector' as const,
  async: true,
  detect: async (callback: (lng: string) => void) => {
    try {
      // Try to get saved language from AsyncStorage
      const savedLanguage = await AsyncStorage.getItem('language');
      if (savedLanguage) {
        callback(savedLanguage);
        return;
      }

      // Fall back to device locale
      const deviceLocale = Localization.getLocales()[0];
      const languageCode = deviceLocale?.languageCode || 'en';

      // Map device language to supported languages
      const supportedLanguages = ['en', 'de', 'es', 'fr'];
      const supportedLanguage = supportedLanguages.includes(languageCode) ? languageCode : 'en';
      callback(supportedLanguage);
    } catch (error) {
      callback('en');
    }
  },
  init: () => {},
  cacheUserLanguage: async (lng: string) => {
    try {
      await AsyncStorage.setItem('language', lng);
    } catch (error) {
      // Handle error silently
    }
  },
};

i18n
  .use(LANGUAGE_DETECTOR)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: __DEV__,
    resources: {
      en: {
        translation: en,
      },
      de: {
        translation: de,
      },
      es: {
        translation: es,
      },
      fr: {
        translation: fr,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;