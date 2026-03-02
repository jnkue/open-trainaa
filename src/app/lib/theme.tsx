import React from "react";
import {Appearance} from "react-native";
import {COLORS as BaseColors, NAV_THEME as BaseNavTheme} from "./colors";

export type ThemeName = "light" | "dark";

export interface Theme {
	name: ThemeName;
	colors: typeof BaseColors.light;
	navTheme: typeof BaseNavTheme.light;
}

export const lightTheme: Theme = {
	name: "light",
	colors: BaseColors.light,
	navTheme: BaseNavTheme.light,
};

export const darkTheme: Theme = {
	name: "dark",
	colors: BaseColors.dark,
	navTheme: BaseNavTheme.dark,
};

export const useThemeName = () => {
	const colorScheme = Appearance.getColorScheme();
	return (colorScheme === "dark" ? "dark" : "light") as ThemeName;
};

export const ThemeContext = React.createContext<Theme>(lightTheme);

export function ThemeProvider({children, initial}: {children: React.ReactNode; initial?: ThemeName}) {
	const defaultName = initial ?? (Appearance.getColorScheme() === "dark" ? "dark" : "light");
	const theme = defaultName === "dark" ? darkTheme : lightTheme;
	return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => React.useContext(ThemeContext);
