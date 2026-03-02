/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useColorScheme } from './useColorScheme';
import { COLORS } from '../lib/colors';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof COLORS.light & keyof typeof COLORS.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) return colorFromProps;
  if (COLORS && COLORS[theme] && colorName in COLORS[theme]) {
    return (COLORS as any)[theme][colorName];
  }

  // Final fallback
  return theme === 'dark' ? '#000000' : '#ffffff';
}
