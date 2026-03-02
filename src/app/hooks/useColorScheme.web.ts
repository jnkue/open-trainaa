import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const { colorScheme } = useTheme();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  if (hasHydrated) {
    return { colorScheme, isDark: colorScheme === 'dark' };
  }

  return { colorScheme: 'light', isDark: false };
}
