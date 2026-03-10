import React, {createContext, useContext, useEffect, useState} from "react";
import {Session, User} from "@supabase/supabase-js";
import {apiClient} from "../services/api";
import i18n from "@/i18n";

interface AuthContextType {
	user: User | null;
	session: Session | null;
	loading: boolean;
	initialized: boolean;
	isDeveloperMode?: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string) => Promise<void>;
	signInWithGoogle: () => Promise<void>;
	signInWithApple: () => Promise<void>;
	signOut: () => Promise<void>;
	refreshSession: () => Promise<void>;
	resetPassword: (email: string) => Promise<void>;
	updatePassword: (newPassword: string) => Promise<void>;
	deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};

interface AuthProviderProps {
	children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({children}) => {
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const [initialized, setInitialized] = useState(false);
	const [isDeveloperMode, setIsDeveloperMode] = useState(false);

	useEffect(() => {
		// Get initial session from secure storage
		const initializeAuth = async () => {
			try {
				const {
					data: {session},
					error,
				} = await apiClient.getSession();

				if (error) {
					console.error("Error getting initial session:", error);
					setSession(null);
					setUser(null);
				} else {
					setSession(session);
					setUser(session?.user ?? null);
				}
			} catch (error) {
				console.error("Error initializing auth:", error);
				setSession(null);
				setUser(null);
			} finally {
				setLoading(false);
				setInitialized(true);
			}
		};

		initializeAuth();

		// Listen for auth state changes
		const {
			data: {subscription},
		} = apiClient.supabase.auth.onAuthStateChange(async (event, session) => {
			console.log("Auth state changed:", event, "user:", session?.user?.email, "session exists:", !!session);

			// Update state based on auth event
			setSession(session);
			setUser(session?.user ?? null);

			// Set loading to false and mark as initialized
			if (!initialized) {
				setInitialized(true);
			}

			// Always set loading to false when auth state changes
			// This ensures the spinner stops after sign in/out
			setLoading(false);
		});

		return () => {
			subscription.unsubscribe();
		};
	}, [initialized]);

	const signIn = async (email: string, password: string) => {
		setLoading(true);
		try {
			const {error} = await apiClient.signIn(email, password);
			if (error) {
				throw error;
			}
			// Session will be updated via the auth state change listener
		} catch (error) {
			setLoading(false);
			throw error;
		}
	};

	const signUp = async (email: string, password: string) => {
		setLoading(true);
		try {
			const {error} = await apiClient.signUp(email, password);
			if (error) {
				throw error;
			}
			// Session will be updated via the auth state change listener
		} catch (error) {
			setLoading(false);
			throw error;
		}
	};

	const ensureUserInfoExists = async (userId: string) => {
		try {
			const {data: existingInfo} = await apiClient.supabase
				.from("user_infos")
				.select("user_id")
				.eq("user_id", userId)
				.single();

			if (!existingInfo) {
				await apiClient.supabase.from("user_infos").insert([
					{
						user_id: userId,
						language: i18n.language ?? "en",
						automatic_calculation_mode: true,
						preferred_units: "metric",
						post_feedback_to_strava: false,
						newsletter_opt_in: false,
					},
				]);
			}
		} catch (dbError) {
			console.error("Failed to ensure user info exists:", dbError);
		}
	};

	const signInWithGoogle = async () => {
		setLoading(true);
		try {
			const result = await apiClient.signInWithGoogle();
			if (result?.error) {
				throw result.error;
			}
			if (result?.data?.user) {
				await ensureUserInfoExists(result.data.user.id);
			}
			// Session will be updated via the auth state change listener
		} catch (error) {
			setLoading(false);
			throw error;
		}
	};

	const signInWithApple = async () => {
		setLoading(true);
		try {
			const result = await apiClient.signInWithApple();
			if (result?.error) {
				throw result.error;
			}
			if (result?.data?.user) {
				await ensureUserInfoExists(result.data.user.id);
			}
		} catch (error) {
			setLoading(false);
			throw error;
		}
	};

	const signOut = async () => {
		setLoading(true);
		try {
			console.log("AuthContext.signOut: calling apiClient.signOut");
			const {error} = await apiClient.signOut();
			console.log("AuthContext.signOut: apiClient.signOut returned", {error});

			// If there's an error but it's just a session missing error, that's ok - we're already logged out
			if (error && error.message !== 'Auth session missing!') {
				console.error("Sign out error (not session missing):", error);
				throw error;
			}

			// Manually clear session state immediately
			// (auth state change listener will also fire, but this ensures immediate update)
			console.log("AuthContext.signOut: clearing session and user state");
			setSession(null);
			setUser(null);
			setLoading(false);
		} catch (error) {
			console.error("AuthContext.signOut: caught error", error);
			// Even if sign out fails, clear local state to ensure user is logged out
			setSession(null);
			setUser(null);
			setLoading(false);
			throw error;
		}
	};

	const refreshSession = async () => {
		try {
			const {
				data: {session},
				error,
			} = await apiClient.getSession();
			if (error) {
				throw error;
			}
			setSession(session);
			setUser(session?.user ?? null);
		} catch (error) {
			throw error;
		}
	};

	const resetPassword = async (email: string) => {
		try {
			const {error} = await apiClient.resetPassword(email);
			if (error) {
				throw error;
			}
		} catch (error) {
			throw error;
		}
	};

	const updatePassword = async (newPassword: string) => {
		try {
			const {error} = await apiClient.updatePassword(newPassword);
			if (error) {
				throw error;
			}
		} catch (error) {
			throw error;
		}
	};

	const deleteAccount = async () => {
		try {
			setLoading(true);
			console.log("AuthContext.deleteAccount: deleting user account");

			// Delete the user account via Supabase Admin API
			// Note: This requires RLS policies to allow users to delete their own account
			// or a backend endpoint that handles the deletion
			const { error } = await apiClient.supabase.rpc('delete_user');

			if (error) {
				console.error("Delete account error:", error);
				throw error;
			}

			// After successful deletion, sign out
			console.log("AuthContext.deleteAccount: account deleted, signing out");
			await signOut();
		} catch (error) {
			console.error("AuthContext.deleteAccount: caught error", error);
			setLoading(false);
			throw error;
		}
	};

	const value: AuthContextType = {
		user,
		session,
		loading,
		initialized,
		isDeveloperMode,
		signIn,
		signUp,
		signInWithGoogle,
		signInWithApple,
		signOut,
		refreshSession,
		resetPassword,
		updatePassword,
		deleteAccount,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
