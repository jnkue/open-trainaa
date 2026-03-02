import React from "react";
import {Text, type TextProps} from "@/components/ui";
import {useThemeColor} from "@/hooks/useThemeColor";

export type ThemedTextProps = TextProps & {
	lightColor?: string;
	darkColor?: string;
	type?: "default" | "title" | "defaultSemiBold" | "subtitle" | "link";
};

export function ThemedText({className, lightColor, darkColor, type = "default", style, ...rest}: ThemedTextProps) {
	const color = useThemeColor({light: lightColor, dark: darkColor}, "foreground");

	const getTypeClassName = () => {
		switch (type) {
			case "title":
				return "text-3xl font-bold leading-8";
			case "defaultSemiBold":
				return "text-base font-semibold leading-6";
			case "subtitle":
				return "text-xl font-bold";
			case "link":
				return "text-base leading-7 text-blue-600";
			default:
				return "text-base leading-6";
		}
	};

	return <Text className={`${getTypeClassName()} ${className || ""}`} style={[{color}, style]} {...rest} />;
}
