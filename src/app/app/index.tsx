import React, {useEffect} from "react";
import {View, ActivityIndicator} from "react-native";
import {router, useSegments} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {useRevenueCat} from "@/contexts/RevenueCatContext";
import {useOnboardingStatus} from "@/hooks/useOnboardingStatus";

export default function IndexScreen() {
	const {user, loading: authLoading} = useAuth();
	const {loading: subscriptionLoading} = useRevenueCat();
	const {onboardingCompleted, loading: onboardingLoading} = useOnboardingStatus();
	const segments = useSegments();

	useEffect(() => {
		if (authLoading) return;

		const inAuthGroup = segments[0] === "(auth)";
		const inTabsGroup = segments[0] === "(tabs)";
		const inOnboardingGroup = segments[0] === "(onboarding)";

		if (!user && !inAuthGroup) {
			// User is not signed in and not already in auth group, redirect to login
			console.log("Redirecting to login because user is not signed in");
			router.replace("/(auth)/login");
		} else if (user && !inTabsGroup && !inOnboardingGroup) {
			// User is signed in — wait until onboarding status is known
			if (onboardingLoading) return;

			if (onboardingCompleted) {
				// Onboarding done, go to tabs
				console.log("Redirecting to tabs because onboarding is completed");
				router.replace("/(tabs)");
			} else {
				// Onboarding not done, go to onboarding flow
				console.log("Redirecting to onboarding because onboarding is not completed");
				router.replace("/(onboarding)/welcome");
			}
		}
	}, [user, authLoading, onboardingCompleted, onboardingLoading, segments]);

	if (authLoading || subscriptionLoading) {
		return (
			<View className="flex-1 justify-center items-center bg-background">
				<ActivityIndicator size="large" />
			</View>
		);
	}

	// Show loading while navigation is happening
	return (
		<View className="flex-1 justify-center items-center bg-background">
			<ActivityIndicator size="large" />
		</View>
	);
}
