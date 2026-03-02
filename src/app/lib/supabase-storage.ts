import { Platform } from 'react-native';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

/**
 * Custom storage adapter for Supabase following official Expo + Supabase recommendations.
 *
 * Platform-specific storage:
 * - Web: localStorage (browser's native storage API)
 * - iOS/Android: SecureStore (encrypted native storage)
 *
 * Reference: https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth
 */

export const createSupabaseStorage = () => {
  // Determine platform at runtime
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    // Web storage adapter using localStorage directly
    // This avoids AsyncStorage's window dependency issues
    return {
      getItem: async (key: string): Promise<string | null> => {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const value = window.localStorage.getItem(key);
            console.log('Getting item from localStorage:', key, 'exists:', !!value);
            return value;
          }
        } catch (error) {
          console.error('Error reading from localStorage:', error);
        }
        return null;
      },
      setItem: async (key: string, value: string): Promise<void> => {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
          }
        } catch (error) {
          console.error('Error writing to localStorage:', error);
        }
      },
      removeItem: async (key: string): Promise<void> => {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            console.log('Removing item from localStorage:', key);
            window.localStorage.removeItem(key);
            // Verify removal
            const check = window.localStorage.getItem(key);
            if (check === null) {
              console.log('Successfully removed item from localStorage:', key);
            } else {
              console.warn('Item still exists in localStorage after removal:', key);
            }
          }
        } catch (error) {
          console.error('Error removing from localStorage:', error);
        }
      },
    };
  }

  // Native mobile storage adapter using SecureStore
  return {
    getItem: (key: string) => {
      return getItemAsync(key);
    },
    setItem: (key: string, value: string) => {
      // SecureStore has a 2048 byte limit per item
      if (value.length > 2048) {
        console.warn(
          'Value being stored in SecureStore is larger than 2048 bytes and it may not be stored successfully. In a future SDK version, this call may throw an error.'
        );
      }
      return setItemAsync(key, value);
    },
    removeItem: (key: string) => {
      return deleteItemAsync(key);
    },
  };
};
