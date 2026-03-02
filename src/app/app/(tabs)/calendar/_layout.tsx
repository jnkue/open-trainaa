import {Stack} from "expo-router";

export default function CalendarLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
			}}
		>
			<Stack.Screen name="index" />
			<Stack.Screen name="[date]" />
		</Stack>
	);
}
