import "../polyfills";
import "../global.css";
import React, {useEffect} from "react";
import {DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider} from "@react-navigation/native";
import {PostHogProvider} from "posthog-react-native";
import {useFonts} from "expo-font";
import {Stack, useRouter, useSegments} from "expo-router";
import {StatusBar} from "expo-status-bar";
import {Platform} from "react-native";
import "react-native-reanimated";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {useColorScheme} from "nativewind";
import {GestureHandlerRootView} from "react-native-gesture-handler";

import {PortalHost} from "@rn-primitives/portal";

import {ThemeProvider, useTheme} from "@/contexts/ThemeContext";
import {AuthProvider, useAuth} from "@/contexts/AuthContext";
import {RevenueCatProvider, useRevenueCat} from "@/contexts/RevenueCatContext";
import {VersionCheckProvider, useVersionCheck} from "@/contexts/VersionCheckContext";
import {LanguageProvider} from "@/contexts/LanguageContext";
import {AlertProvider} from "@/contexts/AlertContext";
import UpdateRequiredScreen from "./update-required";
import "@/i18n";


import * as Sentry from '@sentry/react-native';
import {analyticsConsentStorage} from '@/utils/analyticsConsent';
import {AnalyticsConsentModal} from '@/components/AnalyticsConsentModal';
import {useAnalyticsConsent} from '@/hooks/useAnalyticsConsent';

const ENVIRONMENT = process.env.EXPO_PUBLIC_ENVIRONMENT;

if (!ENVIRONMENT) {
  throw new Error("No ENVIRONMENT set in .env - please set EXPO_PUBLIC_ENVIRONMENT to one of 'development', 'staging' or 'production'");
}

if (ENVIRONMENT !== 'development') {
	Sentry.init({
		dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
		environment: ENVIRONMENT,

		// Adds more context data to events (IP address, cookies, user, etc.)
		// For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
		sendDefaultPii: true,

		// Enable Logs
		enableLogs: true,

		// Configure Session Replay
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1,
		integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

		// Only send events when user has consented to analytics
		beforeSend(event) {
			if (analyticsConsentStorage.getSync() !== true) {
				return null;
			}
			return event;
		},

		beforeSendTransaction(transaction) {
			if (analyticsConsentStorage.getSync() !== true) {
				return null;
			}
			return transaction;
		},

		// uncomment the line below to enable Spotlight (https://spotlightjs.com)
		// spotlight: __DEV__,
	});
}
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 2,
			staleTime: 5 * 60 * 1000, // 5 minutes
		},
	},
});

/**
 * NavigationGuard monitors auth state and subscription status to enforce access control.
 * This prevents users from accessing protected routes by typing URLs directly.
 *
 * Based on Supabase official Expo Router auth pattern:
 * https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth
 */
function NavigationGuard({children}: {children: React.ReactNode}) {
	const {user, loading: authLoading, initialized} = useAuth();
	const {isProSubscriber, loading: subscriptionLoading} = useRevenueCat();
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		// Don't navigate while auth or subscription is initializing
		if (!initialized || authLoading || subscriptionLoading) {
			return;
		}

		const inAuthGroup = segments[0] === "(auth)";
		const inTabsGroup = segments[0] === "(tabs)";
		const isResetPasswordRoute = segments[1] === "reset-password";

		console.log("🔒 NavigationGuard:", {
			user: !!user,
			isProSubscriber,
			segments: segments.join("/"),
			inAuthGroup,
			inTabsGroup,
			isResetPasswordRoute,
		});

		// Redirect to login if trying to access protected routes without authentication
		if (!user && inTabsGroup) {
			console.log("🚫 Unauthorized access to protected route, redirecting to login");
			// Use setTimeout to ensure navigation happens in next tick (works better on web)
			setTimeout(() => router.replace("/(auth)/login"), 0);
		}
		// Redirect to tabs if already logged in and trying to access auth routes
		// EXCEPT for reset-password route which should be accessible even when logged in
		else if (user && inAuthGroup && !isResetPasswordRoute) {
			console.log("✅ User logged in, redirecting from auth to tabs");
			// Use setTimeout to ensure navigation happens in next tick (works better on web)
			// On mobile, redirect to chat. On web, redirect to index
			if (Platform.OS === "web") {
				setTimeout(() => router.replace("/(tabs)"), 0);
			} else {
				setTimeout(() => router.replace("/(tabs)/chat"), 0);
			}
		}
	}, [user, isProSubscriber, authLoading, subscriptionLoading, initialized, segments, router]);

	return <>{children}</>;
}

function AnalyticsConsentWrapper() {
	const {user} = useAuth();
	const {showModal, saveConsent} = useAnalyticsConsent();

	if (!user) return null;

	return <AnalyticsConsentModal open={showModal} onConsent={saveConsent} />;
}

function AppContent() {
	const {colorScheme} = useTheme();
	const {setColorScheme} = useColorScheme();
	const {isVersionSupported, isChecking, versionInfo} = useVersionCheck();

	// Update NativeWind color scheme when theme changes
	React.useEffect(() => {
		setColorScheme(colorScheme);
	}, [colorScheme, setColorScheme]);

	console.log("🔧 AppContent render - isChecking:", isChecking, "isVersionSupported:", isVersionSupported, "versionInfo:", versionInfo);

	// If version is not supported, show update screen instead of normal navigation
	if (!isChecking && !isVersionSupported && versionInfo) {
		console.log("🚫 Rendering UpdateRequiredScreen because version not supported");
		return <UpdateRequiredScreen />;
	}

	return (
		<GestureHandlerRootView style={{flex: 1}}>
			<SafeAreaProvider>
				<QueryClientProvider client={queryClient}>
					<AuthProvider>
						<RevenueCatProvider>
							<NavigationGuard>
								<NavigationThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
									<Stack>
										<Stack.Screen name="index" options={{headerShown: false}} />
										<Stack.Screen name="(auth)" options={{headerShown: false}} />
										<Stack.Screen name="(tabs)" options={{headerShown: false}} />
										<Stack.Screen name="+not-found" />
									</Stack>

									<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

								</NavigationThemeProvider>
							</NavigationGuard>
						</RevenueCatProvider>
						<AnalyticsConsentWrapper />
					</AuthProvider>
				</QueryClientProvider>
			</SafeAreaProvider>
			<PortalHost name="root" />
		</GestureHandlerRootView>
	);
}

export default Sentry.wrap(function RootLayout() {
	const [loaded] = useFonts({
		SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
	});

	if (!loaded) {
		// Async font loading only occurs in development.
		return null;
	}

	const content = (
		<ThemeProvider>
			<AlertProvider>
				<LanguageProvider>
					<VersionCheckProvider>
						<AppContent />
					</VersionCheckProvider>
				</LanguageProvider>
			</AlertProvider>
		</ThemeProvider>
	);

	// Only use PostHog on native platforms, not web
	if (Platform.OS === "web") {
		return content;
	}

	return (
		<PostHogProvider
			apiKey={process.env.EXPO_PUBLIC_POSTHOG_API_KEY!}
			options={{
				host: "https://eu.i.posthog.com",
			}}
		>
			{content}
		</PostHogProvider>
	);
});