import {useEffect} from "react";
import Animated, {useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming} from "react-native-reanimated";

import {Text} from "@/components/ui";

export function HelloWave() {
	const rotationAnimation = useSharedValue(0);

	useEffect(() => {
		rotationAnimation.value = withRepeat(
			withSequence(withTiming(25, {duration: 150}), withTiming(0, {duration: 150})),
			4 // Run the animation 4 times
		);
	}, [rotationAnimation]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{rotate: `${rotationAnimation.value}deg`}],
	}));

	return (
		<Animated.View style={animatedStyle}>
			<Text className="text-3xl leading-8 -mt-1.5">👋</Text>
		</Animated.View>
	);
}
