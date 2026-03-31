import {Dimensions, View, KeyboardAvoidingView, TouchableOpacity, Text, Modal, Image, Animated, Platform} from "react-native";
import {SafeAreaView, useSafeAreaInsets} from "react-native-safe-area-context";
import {useAuth} from "../../contexts/AuthContext";
import {ThemeToggleIcon} from "../../components/ThemeSwitch";
import {useTheme} from "../../contexts/ThemeContext";
import React, {useState, useEffect} from "react";
import {Tabs, router} from "expo-router";
import {useTranslation} from "react-i18next";
import {AppSidebar} from "../../components/navigation/AppSidebar";

export default function TabLayout() {
	const [screenWidth, setScreenWidth] = useState(Dimensions.get("window").width);
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuTranslateY] = useState(new Animated.Value(-Dimensions.get("window").height)); // Initial position off-screen top
	const {user, session} = useAuth();
	const {colorScheme, isDark} = useTheme();
	const insets = useSafeAreaInsets();
	const {t} = useTranslation();

	useEffect(() => {
		const subscription = Dimensions.addEventListener("change", ({window}) => {
			setScreenWidth(window.width);
		});
		return () => subscription?.remove();
	}, [screenWidth]);

	useEffect(() => {
		if (menuOpen) {
			Animated.timing(menuTranslateY, {
				toValue: 0,
				duration: 300, // Adjust duration as needed
				useNativeDriver: true,
			}).start();
		} else {
			Animated.timing(menuTranslateY, {
				toValue: -Dimensions.get("window").height, // Animate back off-screen top
				duration: 300, // Adjust duration as needed
				useNativeDriver: true,
			}).start();
		}
	}, [menuOpen, menuTranslateY]);

	const isSmallScreen = screenWidth < 768;
	const logoWhite = require("../../assets/images/logo-white.png");
	const logoBlack = require("../../assets/images/logo-black.png");
	const logoSource = colorScheme === "dark" ? logoWhite : logoBlack;

	const menuItems: {name: string; title: string; icon: string; path: string}[] = [
		{name: "index", title: t("navigation.home"), icon: "house.fill", path: "/"},
		{name: "chat", title: t("navigation.chat"), icon: "message.fill", path: "/chat"},
		{name: "activities", title: t("navigation.activities"), icon: "figure.run", path: "/activities"},
		{name: "goals-and-races", title: t("navigation.goalsAndRaces"), icon: "target", path: "/goals-and-races"},
		{name: "analytics", title: t("navigation.analytics"), icon: "chart.bar.fill", path: "/analytics"},
		{name: "calendar", title: t("navigation.calendar"), icon: "calendar", path: "/calendar"},
		{name: "settings", title: t("navigation.settings"), icon: "gear", path: "/settings"},
	];

	const visibleMenuItems = isSmallScreen ? menuItems : menuItems.filter((i) => i.name !== "chat");

	// Safety check - should never happen due to NavigationGuard, but prevents crashes
	if (!user || !session) {
		return null;
	}

	if (isSmallScreen) {
		return (
			<KeyboardAvoidingView style={{flex: 1, backgroundColor: isDark ? "#000000" : "#ffffff"}} behavior={Platform.OS === "ios" ? "padding" : "height"}>

				<SafeAreaView className="flex-1 bg-background">
					<View className="flex-row items-center justify-between px-4 py-1 bg-card border-b border-border">
						<TouchableOpacity onPress={() => setMenuOpen(true)} className="p-2">
							<Text className="text-xl text-foreground">☰</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={() => router.push("/chat")} accessibilityRole="button" accessibilityLabel={t("navigation.openChat")}>
							<Image
								source={logoSource}
								className="ml-4"
								style={{
									resizeMode: "contain",
									width: 180,
									height: 53,
								}}
							/>
						</TouchableOpacity>
						<View className="flex-row items-center gap-2">
							<ThemeToggleIcon size={20} />
						</View>
					</View>
					<Tabs
						key={isSmallScreen ? "tabs-small" : "tabs-large"}
						screenOptions={{
							headerShown: false,
							tabBarStyle: {display: "none"},
						}}
					>
						<Tabs.Screen name="index" />
						<Tabs.Screen name="chat" />
						<Tabs.Screen name="activities" options={{href: "/activities"}} />
						<Tabs.Screen name="goals-and-races" options={{href: "/goals-and-races"}} />
						<Tabs.Screen name="analytics" options={{href: "/analytics"}} />
						<Tabs.Screen name="calendar" options={{href: "/calendar"}} />
						<Tabs.Screen name="settings" />
						<Tabs.Screen name="workouts" options={{href: null}} />
						<Tabs.Screen name="connect-strava" options={{href: null}} />
						<Tabs.Screen name="connect-wahoo" options={{href: null}} />
						<Tabs.Screen name="connect-garmin" options={{href: null}} />
					</Tabs>

					<Modal visible={menuOpen} animationType="none" >
							<View className="bg-card h-screen px-6" style={{ paddingTop: Math.max(insets.top, 16), paddingBottom: insets.bottom }}>
								<TouchableOpacity onPress={() => setMenuOpen(false)} className=" mt-3">
									<Text className="text-xl text-foreground">✕</Text>
								</TouchableOpacity>
								{menuItems.map((item) => (
									<TouchableOpacity
										key={item.name}
										className="flex-row items-center py-4 border-b border-border/30"
										onPress={() => {
											setMenuOpen(false);
											router.push(item.path as any);
										}}
									>
										<Text className="text-lg text-foreground ml-4">{item.title}</Text>
									</TouchableOpacity>
								))}
							</View>
					</Modal>
			
				</SafeAreaView>
			</KeyboardAvoidingView>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-background">
			{/* Tab-Bar über die volle Breite */}
			<View className="bg-card border-b border-border">
				<View className="flex-row items-center px-4 py-3">
					{/* Left logo for large screens */}
					{!isSmallScreen && (
						<TouchableOpacity onPress={() => router.push("/")} accessibilityRole="button" accessibilityLabel={t("navigation.openHome")}>
							<Image
								source={logoSource}
								className=" mr-4"
								style={{
									resizeMode: "contain",
									width: 180,
									height: 53,
								}}
							/>
						</TouchableOpacity>
					)}

					{/* Tab-Bar Items - nur für große Screens sichtbar */}
					{!isSmallScreen && (
						<View className="flex-row flex-1">
							{visibleMenuItems.map((item, index) => (
								<TouchableOpacity key={item.name} className="px-4 py-2 mr-2" onPress={() => router.push(item.path as any)}>
									<Text className="text-base font-medium text-foreground">{item.title}</Text>
								</TouchableOpacity>
							))}
						</View>
					)}

					{/* Theme Switch für große Bildschirme */}
					{!isSmallScreen && (
						<View className="flex-row items-center gap-2">
							<ThemeToggleIcon size={20} />
						</View>
					)}
				</View>
			</View>

			{/* Content-Bereich mit Sidebar und Tabs nebeneinander */}
			<View className="flex-1 flex-row bg-background">
				{/* Left chat sidebar only on large screens */}
				{!isSmallScreen && (
					<AppSidebar userId={user.id} accessToken={session.access_token} />
				)}

				{/* Main content area - Tabs füllen den restlichen Bereich aus */}
				<View className="flex-1">
					<Tabs
						key={isSmallScreen ? "tabs-small" : "tabs-large"}
						tabBar={() => null}
						screenOptions={{
							headerShown: false,
						}}
					>
						<Tabs.Screen
							name="index"
							options={{
								title: t("navigation.home"),
							}}
						/>
						<Tabs.Screen
							name="chat"
							options={{
								title: t("navigation.chat"),
							}}
						/>
						<Tabs.Screen
							name="activities"
							options={{
								title: t("navigation.activities"),
								href: "/activities",
							}}
						/>
						<Tabs.Screen
							name="goals-and-races"
							options={{
								title: t("navigation.goalsAndRaces"),
								href: "/goals-and-races",
							}}
						/>
						<Tabs.Screen
							name="analytics"
							options={{
								title: t("navigation.analytics"),
								href: "/analytics",
							}}
						/>
						<Tabs.Screen
							name="calendar"
							options={{
								title: t("navigation.calendar"),
								href: "/calendar",
							}}
						/>
						<Tabs.Screen
							name="settings"
							options={{
								title: t("navigation.settings"),
							}}
						/>
						<Tabs.Screen name="workouts" options={{href: null}} />
						<Tabs.Screen name="connect-strava" options={{href: null}} />
						<Tabs.Screen name="connect-wahoo" options={{href: null}} />
						<Tabs.Screen name="connect-garmin" options={{href: null}} />
					</Tabs>
				</View>
			</View>
		</SafeAreaView>
	);
}
