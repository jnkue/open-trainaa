import React, {createContext, useContext, useEffect, useState} from "react";
import {useColorScheme as useSystemColorScheme} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
	theme: Theme;
	colorScheme: "light" | "dark";
	setTheme: (theme: Theme) => void;
	isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "@trainaa_theme";

export function ThemeProvider({children}: {children: React.ReactNode}) {
	const systemColorScheme = useSystemColorScheme();
	const [theme, setTheme] = useState<Theme>("system");
	const [isLoaded, setIsLoaded] = useState(false);

	// Calculate the actual color scheme based on theme setting
	const colorScheme = theme === "system" ? systemColorScheme || "light" : theme === "dark" ? "dark" : "light";

	const isDark = colorScheme === "dark";

	// Load theme from storage on mount
	useEffect(() => {
		const loadTheme = async () => {
			try {
				const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
				if (savedTheme && ["light", "dark", "system"].includes(savedTheme)) {
					setTheme(savedTheme as Theme);
				}
			} catch (error) {
				console.error("Failed to load theme from storage:", error);
			} finally {
				setIsLoaded(true);
			}
		};

		loadTheme();
	}, []);

	// Save theme to storage when it changes
	const handleSetTheme = async (newTheme: Theme) => {
		try {
			await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
			setTheme(newTheme);
		} catch (error) {
			console.error("Failed to save theme to storage:", error);
			setTheme(newTheme); // Still update the state even if storage fails
		}
	};

	// Don't render until theme is loaded
	if (!isLoaded) {
		return null;
	}

	return (
		<ThemeContext.Provider
			value={{
				theme,
				colorScheme,
				setTheme: handleSetTheme,
				isDark,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
