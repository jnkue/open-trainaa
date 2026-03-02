import * as React from "react";
import {ActivityIndicator, View} from "react-native";
import {Text} from "./text";

interface SpinnerProps {
	color?: string;
	size?: "small" | "large" | number;
	text?: string;
	style?: any;
}

const Spinner = React.forwardRef<React.ElementRef<typeof View>, SpinnerProps>(({color = "#000000", size = "large", text, style, ...props}, ref) => {
	if (text) {
		return (
			<View 
				ref={ref} 
				style={[
					{
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 8
					},
					style
				]} 
				{...props}
			>
				<ActivityIndicator size={size} color={color} />
				<Text style={{fontSize: 14, color: '#6b7280'}}>{text}</Text>
			</View>
		);
	}

	return (
		<View 
			ref={ref} 
			style={[
				{
					alignItems: 'center',
					justifyContent: 'center'
				},
				style
			]} 
			{...props}
		>
			<ActivityIndicator size={size} color={color} />
		</View>
	);
});

Spinner.displayName = "Spinner";

export {Spinner};
export type {SpinnerProps};
