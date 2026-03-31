// src/app/hooks/useOnboardingStatus.ts
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/services/api";

export function useOnboardingStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-status", user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("No user ID");
      const { data, error } = await apiClient.supabase
        .from("user_infos")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      // Null row = legacy account before user_infos existed → treat as not completed
      return data?.onboarding_completed ?? false;
    },
    enabled: !!user?.id,
    staleTime: Infinity,  // Once true, it never changes back
  });

  const markCompleted = useCallback(async () => {
    if (!user?.id) return;
    // Optimistically update the cache so NavigationGuard redirects immediately
    queryClient.setQueryData(["onboarding-status", user.id], true);
    // Persist to the database so the state survives app restarts
    const { error } = await apiClient.supabase
      .from("user_infos")
      .upsert(
        { user_id: user.id, onboarding_completed: true },
        { onConflict: "user_id" },
      );
    if (error) {
      console.error("Failed to persist onboarding completion:", error);
      // Revert optimistic update on failure
      queryClient.setQueryData(["onboarding-status", user.id], false);
    }
  }, [queryClient, user?.id]);

  return {
    onboardingCompleted: isLoading ? null : (data ?? false),
    loading: isLoading,
    markCompleted,
  };
}
