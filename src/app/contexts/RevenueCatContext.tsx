import React, {createContext, useContext, useEffect, useState} from "react";
import {Platform, Linking} from "react-native";
// iOS SDK
import Purchases, {
	CustomerInfo as CustomerInfoiOS,
	PurchasesOfferings as PurchasesOfferingsiOS,
	PurchasesOffering,
	LOG_LEVEL,
} from "react-native-purchases";
import RevenueCatUI, {PAYWALL_RESULT} from "react-native-purchases-ui";
// Web SDK - no longer used, subscriptions handled via backend API
import {useAuth} from "./AuthContext";
import {apiClient} from "../services/api";

interface RevenueCatContextType {
	isProSubscriber: boolean;
	hasByokKey: boolean;
	loading: boolean;
	customerInfo: any | null;
	offerings: any | null;
	subscriptionStore: string | null;
	restorePurchases: () => Promise<void>;
	showPaywall: (offering?: PurchasesOffering) => Promise<boolean>;
	refreshCustomerInfo: () => Promise<void>;
	cancelSubscription: () => Promise<{success: boolean; store: 'stripe' | 'app_store' | 'play_store' | 'none'}>;
	purchasePackage: (packageToPurchase: any) => Promise<{customerInfo: any}>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(
	undefined
);

export const useRevenueCat = () => {
	const context = useContext(RevenueCatContext);
	if (context === undefined) {
		throw new Error(
			"useRevenueCat must be used within a RevenueCatProvider"
		);
	}
	return context;
};

interface RevenueCatProviderProps {
	children: React.ReactNode;
}

const ENTITLEMENT_ID = "PRO";

export const RevenueCatProvider: React.FC<RevenueCatProviderProps> = ({
	children,
}) => {
	const {user} = useAuth();
	const [isProSubscriber, setIsProSubscriber] = useState(false);
	const [hasByokKey, setHasByokKey] = useState(false);
	const [loading, setLoading] = useState(true);
	const [customerInfo, setCustomerInfo] = useState<any | null>(null);
	const [offerings, setOfferings] = useState<any | null>(null);
	const [subscriptionStore, setSubscriptionStore] = useState<string | null>(null);

	useEffect(() => {
		const initializeRevenueCat = async () => {
			try {
				// Web Platform - Skip RevenueCat SDK, use backend API
				if (Platform.OS === "web") {
					console.log("Web platform: Skipping RevenueCat SDK initialization");
					console.log("Subscriptions handled via direct Stripe Checkout");

					if (!user) {
						console.log("Waiting for user authentication...");
						setLoading(false);
						return;
					}

					// Check subscription status via backend API
					try {
						const response = await apiClient.getSubscriptionStatus();
						setIsProSubscriber(response.is_pro_subscriber);
						setHasByokKey(response.has_byok_key);
						setSubscriptionStore(response.subscription_store);
						// Don't set customerInfo on web - it has different structure (V2 API) than iOS SDK
						setCustomerInfo(null);
						console.log("Web: Subscription status from backend:", response.is_pro_subscriber, "byok:", response.has_byok_key, "store:", response.subscription_store);
					} catch (error) {
						console.error("Error checking subscription status:", error);
						setIsProSubscriber(false);
						setHasByokKey(false);
						setSubscriptionStore(null);
						setCustomerInfo(null);
					}

					setOfferings(null); // No offerings needed for web

					// Check for Stripe checkout success/cancel in URL
					if (typeof window !== 'undefined') {
						const urlParams = new URLSearchParams(window.location.search);
						if (urlParams.get('checkout') === 'success') {
							console.log("Stripe checkout successful, polling for subscription status...");
							// Remove query param
							window.history.replaceState({}, '', window.location.pathname);

							// Poll with exponential backoff until subscription is active
							// Webhook chain (Stripe → RevenueCat → Backend) can take 5-15 seconds
							const pollForSubscription = async () => {
								const delays = [2000, 4000, 8000];
								for (let i = 0; i < delays.length; i++) {
									await new Promise(resolve => setTimeout(resolve, delays[i]));
									try {
										const response = await apiClient.getSubscriptionStatus();
										console.log(`Web: Poll ${i + 1}/${delays.length}, Pro status:`, response.is_pro_subscriber);
										if (response.is_pro_subscriber) {
											setIsProSubscriber(true);
											setHasByokKey(response.has_byok_key);
											setSubscriptionStore(response.subscription_store);
											setCustomerInfo(null);
											console.log("Web: Subscription confirmed active, store:", response.subscription_store);
											return;
										}
									} catch (error) {
										console.error(`Error polling subscription status (attempt ${i + 1}):`, error);
									}
								}
								console.warn("Web: Subscription not yet active after polling. User may need to manually refresh.");
							};
							pollForSubscription();
						} else if (urlParams.get('checkout') === 'cancelled') {
							console.log("Stripe checkout cancelled");
							// Remove query param
							window.history.replaceState({}, '', window.location.pathname);
						}
					}
				}
				// iOS and Android Platforms
				else if (Platform.OS === "ios" || Platform.OS === "android") {
					const platformName = Platform.OS === "ios" ? "iOS" : "Android";
					console.log(`Initializing RevenueCat for ${platformName}`);

					const apiKey = Platform.OS === "ios"
						? process.env.EXPO_PUBLIC_REVENUE_CAT_APPLE_API_KEY
						: process.env.EXPO_PUBLIC_REVENUE_CAT_GOOGLE_API_KEY;

					if (!apiKey) {
						console.error(`RevenueCat ${platformName} API key not found`);
						setLoading(false);
						setIsProSubscriber(false);
						return;
					}

					// Wait for user to be loaded
					if (!user) {
						console.log("Waiting for user authentication...");
						setLoading(false);
						return;
					}

					// Configure iOS SDK with user UUID
					Purchases.setLogLevel(LOG_LEVEL.DEBUG);
					await Purchases.configure({
						apiKey,
						appUserID: user.id, // Supabase UUID
					});

					// Get initial customer info with retry logic
					let retries = 3;
					let info = null;

					while (retries > 0 && !info) {
						try {
							info = await Purchases.getCustomerInfo();
							setCustomerInfo(info);
							const hasProEntitlement = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
							setIsProSubscriber(hasProEntitlement);
							// Extract store from entitlement
							const store = hasProEntitlement ? info.entitlements.active[ENTITLEMENT_ID]?.store?.toLowerCase() : null;
							setSubscriptionStore(store);
							console.log(`${platformName}: Pro subscriber status:`, hasProEntitlement, "store:", store);
							break;
						} catch (error: any) {
							retries--;
							console.warn(`Error getting customer info (${retries} retries left):`, error);

							if (retries > 0 && (error.code === "504" || error.message?.includes("504"))) {
								await new Promise(resolve => setTimeout(resolve, 1000));
							} else if (retries === 0) {
								console.error(`RevenueCat ${platformName} initialization failed, trying backend fallback...`);
								// Fallback: Check subscription status from backend database
								try {
									const response = await apiClient.getSubscriptionStatus();
									setIsProSubscriber(response.is_pro_subscriber);
									console.log(`${platformName}: Using backend fallback, Pro status:`, response.is_pro_subscriber);
								} catch (backendError) {
									console.error("Backend fallback also failed:", backendError);
									setIsProSubscriber(false);
								}
								return;
							}
						}
					}

					// Get available offerings (non-blocking)
					try {
						const offers = await Purchases.getOfferings();
						setOfferings(offers);
					} catch (error) {
						console.warn(`Error getting ${platformName} offerings:`, error);
					}

					// Set up listener for customer info updates
					Purchases.addCustomerInfoUpdateListener((info) => {
						console.log(`${platformName}: Customer info updated`);
						setCustomerInfo(info);
						const hasProEntitlement = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
						setIsProSubscriber(hasProEntitlement);
						const store = hasProEntitlement ? info.entitlements.active[ENTITLEMENT_ID]?.store?.toLowerCase() : null;
						setSubscriptionStore(store);
					});
				}
				// Other platforms (Android, etc.)
				else {
					console.log("RevenueCat not supported on this platform, not granting Pro access");
					setLoading(false);
					setIsProSubscriber(false);
					return;
				}
			} catch (error) {
				console.error("Error initializing RevenueCat:", error);
				// On error, don't grant Pro access
				setIsProSubscriber(false);
			} finally {
				setLoading(false);
			}
		};

		initializeRevenueCat();
	}, [user]);

	const restorePurchases = async () => {
		try {
			setLoading(true);

			if (Platform.OS === "web") {
				// On web, refresh subscription status via backend
				const response = await apiClient.getSubscriptionStatus();
				setIsProSubscriber(response.is_pro_subscriber);
				setHasByokKey(response.has_byok_key);
				setSubscriptionStore(response.subscription_store);
				setCustomerInfo(null); // Don't use V2 API structure on web
			} else if (Platform.OS === "ios" || Platform.OS === "android") {
				const info = await Purchases.restorePurchases();
				setCustomerInfo(info);
				const hasProEntitlement = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
				setIsProSubscriber(hasProEntitlement);
				const store = hasProEntitlement ? info.entitlements.active[ENTITLEMENT_ID]?.store?.toLowerCase() : null;
				setSubscriptionStore(store);
			}
		} catch (error) {
			console.error("Error restoring purchases:", error);
			throw error;
		} finally {
			setLoading(false);
		}
	};

	const refreshCustomerInfo = async () => {
		try {
			if (Platform.OS === "web") {
				const response = await apiClient.getSubscriptionStatus();
				setIsProSubscriber(response.is_pro_subscriber);
				setHasByokKey(response.has_byok_key);
				setSubscriptionStore(response.subscription_store);
				setCustomerInfo(null); // Don't use V2 API structure on web
				console.log("Customer info refreshed, Pro status:", response.is_pro_subscriber, "byok:", response.has_byok_key, "store:", response.subscription_store);
			} else if (Platform.OS === "ios" || Platform.OS === "android") {
				const info = await Purchases.getCustomerInfo();
				setCustomerInfo(info);
				const hasProEntitlement = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
				setIsProSubscriber(hasProEntitlement);
				const store = hasProEntitlement ? info.entitlements.active[ENTITLEMENT_ID]?.store?.toLowerCase() : null;
				setSubscriptionStore(store);
				console.log("Customer info refreshed, Pro status:", hasProEntitlement, "store:", store);
			}
		} catch (error) {
			console.error("Error refreshing customer info:", error);
			throw error;
		}
	};

	const showPaywall = async (offering?: PurchasesOffering): Promise<boolean> => {
		try {
			if (Platform.OS === "web") {
				// Web: Use Stripe checkout redirect
				const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
				const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
				const successUrl = `${baseUrl}${currentPath}?checkout=success`;
				const cancelUrl = `${baseUrl}${currentPath}?checkout=cancelled`;
				const {url} = await apiClient.createStripeCheckoutSession(successUrl, cancelUrl);
				if (typeof window !== 'undefined') {
					window.location.href = url;
				}
				return false; // User will be redirected
			}

			// iOS/Android: Use RevenueCat paywall
			const paywallResult = offering
				? await RevenueCatUI.presentPaywall({offering})
				: await RevenueCatUI.presentPaywall();

			return paywallResult === PAYWALL_RESULT.PURCHASED ||
				paywallResult === PAYWALL_RESULT.RESTORED;
		} catch (error) {
			console.error("Error showing paywall:", error);
			throw error;
		}
	};

	const cancelSubscription = async (): Promise<{success: boolean; store: 'stripe' | 'app_store' | 'play_store' | 'none'}> => {
		try {
			const storeLower = subscriptionStore?.toLowerCase();

			if (!storeLower) {
				console.log("No subscription store found");
				return {success: false, store: 'none'};
			}

			// Stripe subscriptions - always open Customer Portal
			if (storeLower === 'stripe' || storeLower === 'rc_billing') {
				console.log("Stripe subscription - opening Customer Portal");
				try {
					const {url} = await apiClient.createStripePortalSession();
					if (Platform.OS === "web") {
						if (typeof window !== 'undefined') {
							window.open(url, '_blank');
						}
					} else {
						// On native, open in browser using Linking
						await Linking.openURL(url);
					}
					return {success: true, store: 'stripe'};
				} catch (error) {
					console.error("Error opening Stripe portal:", error);
					return {success: false, store: 'stripe'};
				}
			}

			// App Store subscriptions - return store type, caller decides action
			if (storeLower === 'app_store') {
				console.log("App Store subscription detected");
				return {success: false, store: 'app_store'};
			}

			// Play Store subscriptions - return store type, caller decides action
			if (storeLower === 'play_store') {
				console.log("Play Store subscription detected");
				return {success: false, store: 'play_store'};
			}

			console.warn("Unknown store type:", storeLower);
			return {success: false, store: 'none'};
		} catch (error) {
			console.error("Error in cancelSubscription:", error);
			throw error;
		}
	};

	const purchasePackage = async (packageToPurchase: any): Promise<{customerInfo: any}> => {
		try {
			console.log("=== purchasePackage called ===");
			console.log("Platform:", Platform.OS);

			if (Platform.OS === "web") {
				// Web platform - use Stripe Checkout directly
				console.log("Web: Creating Stripe checkout session...");

				// Generate success and cancel URLs based on current location
			const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
			const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
			const successUrl = `${baseUrl}${currentPath}?checkout=success`;
			const cancelUrl = `${baseUrl}${currentPath}?checkout=cancelled`;

			console.log("Web: Success URL:", successUrl);
			console.log("Web: Cancel URL:", cancelUrl);

			const {url} = await apiClient.createStripeCheckoutSession(successUrl, cancelUrl);
				console.log("Web: Stripe checkout URL created:", url);

				// Open Stripe Checkout in current window
				if (typeof window !== 'undefined') {
					window.location.href = url;
				}

				// Note: The purchase flow continues on Stripe's checkout page
				// After successful payment, Stripe will webhook RevenueCat
				// RevenueCat will webhook our backend to sync the subscription
				// User will return to the app and we'll refresh customer info

				// Return current customer info (will be updated after Stripe checkout completes)
				return {customerInfo};
			} else if (Platform.OS === "ios") {
				// iOS platform - use native SDK (unchanged)
				console.log("iOS: Starting purchase with package:", packageToPurchase);
				const purchaseResult = await Purchases.purchasePackage(packageToPurchase);
				console.log("iOS: Purchase result:", JSON.stringify(purchaseResult, null, 2));

				// Update local state
				const newCustomerInfo = purchaseResult.customerInfo;
				setCustomerInfo(newCustomerInfo);
				const hasProEntitlement = newCustomerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
				setIsProSubscriber(hasProEntitlement);

				return {customerInfo: newCustomerInfo};
			} else {
				console.error("Platform not supported:", Platform.OS);
				throw new Error("Platform not supported for purchases");
			}
		} catch (error: any) {
			console.error("=== Error purchasing package ===");
			console.error("Error:", error);
			console.error("Error message:", error?.message);
			console.error("Error stack:", error?.stack);
			throw error;
		}
	};

	const value: RevenueCatContextType = {
		isProSubscriber,
		hasByokKey,
		loading,
		customerInfo,
		offerings,
		subscriptionStore,
		restorePurchases,
		showPaywall,
		refreshCustomerInfo,
		cancelSubscription,
		purchasePackage,
	};

	return (
		<RevenueCatContext.Provider value={value}>
			{children}
		</RevenueCatContext.Provider>
	);
};
