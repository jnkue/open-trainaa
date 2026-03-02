/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // Secondary colors for better UI
    muted: '#f3f4f6',
    mutedForeground: '#71717a',
    border: '#e5e7eb',
    card: '#ffffff',
    cardForeground: '#11181C',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // Secondary colors for better UI
    muted: '#1f1f23',
    mutedForeground: '#a1a1aa',
    border: '#2a2a2a',
    card: '#1f1f23',
    cardForeground: '#ECEDEE',
  },
};
