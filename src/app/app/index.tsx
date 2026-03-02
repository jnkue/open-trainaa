import React, {useEffect} from "react";
import {View, ActivityIndicator} from "react-native";
import {router, useSegments} from "expo-router";
import {useAuth} from "@/contexts/AuthContext";
import {useRevenueCat} from "@/contexts/RevenueCatContext";

export default function IndexScreen() {
	const {user, loading: authLoading} = useAuth();
	const {loading: subscriptionLoading} = useRevenueCat();
	const segments = useSegments();

	useEffect(() => {
		if (authLoading) return;

		const inAuthGroup = segments[0] === "(auth)";
		const inTabsGroup = segments[0] === "(tabs)";

		if (user && !inTabsGroup) {
			// User is signed in, redirect to tabs
			console.log("Redirecting to tabs because user is signed in");
			router.replace("/(tabs)");
		} else if (!user && !inAuthGroup) {
			// User is not signed in and not already in auth group, redirect to login
			console.log("Redirecting to login because user is not signed in");
			router.replace("/(auth)/login");
		}
	}, [user, authLoading, segments]);

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
