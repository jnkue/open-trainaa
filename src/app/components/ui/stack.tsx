import * as React from "react";
import {View, ScrollView} from "react-native";
import {cn} from "@/lib/utils";

interface StackProps extends React.ComponentPropsWithoutRef<typeof View> {
	className?: string;
	space?: "xs" | "sm" | "md" | "lg" | "xl";
	direction?: "row" | "column";
}

const getSpaceClass = (space: string = "md", direction: string = "column") => {
	const spaceMap = {
		xs: direction === "column" ? "space-y-1" : "space-x-1",
		sm: direction === "column" ? "space-y-2" : "space-x-2",
		md: direction === "column" ? "space-y-4" : "space-x-4",
		lg: direction === "column" ? "space-y-6" : "space-x-6",
		xl: direction === "column" ? "space-y-8" : "space-x-8",
	};
	return spaceMap[space as keyof typeof spaceMap] || spaceMap.md;
};

const Stack = React.forwardRef<React.ElementRef<typeof View>, StackProps>(({className, space = "md", direction = "column", ...props}, ref) => (
	<View ref={ref} className={cn("flex", direction === "row" ? "flex-row" : "flex-col", getSpaceClass(space, direction), className)} {...props} />
));

Stack.displayName = "Stack";

interface ScrollAreaProps extends React.ComponentPropsWithoutRef<typeof ScrollView> {
	className?: string;
}

const ScrollArea = React.forwardRef<React.ElementRef<typeof ScrollView>, ScrollAreaProps>(({className, ...props}, ref) => (
	<ScrollView ref={ref} className={cn("flex-1", className)} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} {...props} />
));

ScrollArea.displayName = "ScrollArea";

export {Stack, ScrollArea};
export type {StackProps, ScrollAreaProps};
