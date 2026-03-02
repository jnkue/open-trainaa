import React from "react";
import {Text, Pressable} from "react-native";
import {useTheme} from "@/contexts/ThemeContext";
import {Ionicons} from "@expo/vector-icons";

interface ThemeSwitchProps {
	size?: "sm" | "md" | "lg";
	showLabel?: boolean;
}

export function ThemeSwitch({size = "md", showLabel = true}: ThemeSwitchProps) {
	const {theme, setTheme, isDark} = useTheme();

	const iconSizes = {
		sm: 16,
		md: 20,
		lg: 24,
	};

	const containerSizes = {
		sm: "h-8 px-2",
		md: "h-10 px-3",
		lg: "h-12 px-4",
	};

	const textSizes = {
		sm: "text-xs",
		md: "text-sm",
		lg: "text-base",
	};

	const cycleTheme = () => {
		const themes: ("light" | "dark" | "system")[] = ["light", "dark", "system"];
		const currentIndex = themes.indexOf(theme);
		const nextIndex = (currentIndex + 1) % themes.length;
		setTheme(themes[nextIndex]);
	};

	const getIcon = () => {
		switch (theme) {
			case "light":
				return "sunny-outline";
			case "dark":
				return "moon-outline";
			case "system":
				return "phone-portrait-outline";
			default:
				return "sunny-outline";
		}
	};

	const getLabel = () => {
		switch (theme) {
			case "light":
				return "Hell";
			case "dark":
				return "Dunkel";
			case "system":
				return "System";
			default:
				return "Hell";
		}
	};

	return (
		<Pressable
			onPress={cycleTheme}
			className={`${containerSizes[size]} flex-row items-center justify-center rounded-lg border border-border bg-background active:bg-muted`}
			accessibilityRole="button"
			accessibilityLabel={`Aktuelles Theme: ${getLabel()}. Tippen zum Wechseln.`}
		>
			<Ionicons name={getIcon() as any} size={iconSizes[size]} className="text-foreground" color={isDark ? "#ffffff" : "#000000"} />
			{showLabel && <Text className={`${textSizes[size]} ml-2 font-medium text-foreground`}>{getLabel()}</Text>}
		</Pressable>
	);
}

// Alternative component for just an icon button
export function ThemeToggleIcon({size = 20}: {size?: number}) {
	const {setTheme, isDark} = useTheme();

	const toggleTheme = () => {
		setTheme(isDark ? "light" : "dark");
	};

	return (
		<Pressable
			onPress={toggleTheme}
			className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
			accessibilityRole="button"
			accessibilityLabel={`Zu ${isDark ? "hellem" : "dunklem"} Theme wechseln`}
		>
			<Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={size} color={isDark ? "#ffffff" : "#000000"} />
		</Pressable>
	);
}
