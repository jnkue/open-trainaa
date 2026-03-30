// src/app/hooks/useRaceEvents.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import {
  createRaceEvent,
  deleteRaceEvent,
  getRaceEvents,
} from "@/services/raceEvents";
import { showAlert } from "@/utils/alert";
import type { RaceEvent } from "@/types/onboarding";

export function useRaceEvents() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["race-events", user?.id];

  const { data: raceEvents = [], isLoading } = useQuery({
    queryKey,
    queryFn: getRaceEvents,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createRaceEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => {
      console.error("Error creating race event:", error);
      showAlert(t("common.error"), t("raceEvents.createError"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRaceEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => {
      console.error("Error deleting race event:", error);
      showAlert(t("common.error"), t("raceEvents.deleteError"));
    },
  });

  return {
    raceEvents,
    isLoading,
    createRaceEvent: createMutation.mutateAsync,
    deleteRaceEvent: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
