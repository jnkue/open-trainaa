import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to protect routes that require authentication.
 * Redirects to login if user is not authenticated.
 * Returns loading state and user data.
 */
export function useAuthGuard() {
  const { user, session, loading } = useAuth();

  useEffect(() => {
    console.log('useAuthGuard - Auth state:', { user: !!user, session: !!session, loading });

    // Don't redirect while still loading
    if (loading) return;

    // If no user or session, redirect to login
    if (!user || !session) {
      console.log('useAuthGuard - Redirecting to login');
      router.replace('/(auth)/login');
    }
  }, [user, session, loading]);

  const isAuthenticated = !!(user && session);

  console.log('useAuthGuard - Returning:', {
    hasUser: !!user,
    hasSession: !!session,
    loading,
    isAuthenticated
  });

  return {
    user,
    session,
    loading,
    isAuthenticated
  };
}