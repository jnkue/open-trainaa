import { useState, useEffect, useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { showAlert } from "@/utils/alert";
import { apiClient } from "@/services/api";
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  fetchWorkouts,
  fetchHeartRateSamples,
  convertToUploadPayload,
  isConnected,
  setConnected,
  clearAppleHealthData,
  getLastSyncDate,
  setLastSyncDate,
} from "@/services/appleHealth";

export function useAppleHealthIntegration() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isAvailable] = useState(() => isHealthKitAvailable());
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [connecting, setConnecting] = useState(false);
  const hasSynced = useRef(false);
  const isSyncingRef = useRef(false);

  const syncWorkouts = useCallback(async () => {
    if (!isAvailable || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    setError(null);
    let imported = 0;

    try {
      // Always look back 7 days from the last sync, or 6 months on first sync
      const lastSync = await getLastSyncDate();
      const endDate = new Date();
      const startDate = lastSync
        ? new Date(lastSync.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000);

      const workouts = await fetchWorkouts(startDate, endDate);

      for (const workout of workouts) {
        try {
          const hrSamples = await fetchHeartRateSamples(
            workout.startDate,
            workout.endDate,
          );
          const payload = convertToUploadPayload(workout, hrSamples);
          const result = await apiClient.uploadActivityJson(payload);

          if (!result.is_duplicate) {
            imported++;
          }
        } catch (err) {
          console.error(`Error importing workout ${workout.uuid}:`, err);
        }
      }
      const now = new Date();
      await setLastSyncDate(now);
      setLastSyncTime(now);
      setLastSyncCount(imported);
    } catch (err) {
      console.error("Error syncing Apple Health workouts:", err);
      setError(
        t("integrations.appleHealth.importError") ??
          "Failed to sync workouts from Apple Health.",
      );
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [isAvailable, t]);

  // Check auth on mount
  useEffect(() => {
    if (!isAvailable || !user) {
      setLoading(false);
      return;
    }
    const checkAuth = async () => {
      try {
        const connected = await isConnected();
        setAuthorized(connected);
        if (connected) {
          const savedSyncDate = await getLastSyncDate();
          if (savedSyncDate) setLastSyncTime(savedSyncDate);
        }
      } catch {
        setAuthorized(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [isAvailable, user]);

  // Auto-sync on startup when authorized
  useEffect(() => {
    if (authorized && !hasSynced.current && !loading) {
      hasSynced.current = true;
      syncWorkouts();
    }
  }, [authorized, loading, syncWorkouts]);

  // Re-sync when app returns from background
  useEffect(() => {
    if (!isAvailable || !authorized) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncWorkouts();
      }
    });

    return () => subscription.remove();
  }, [isAvailable, authorized, syncWorkouts]);

  const handleConnect = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);
      await requestHealthKitPermissions();

      // Verify permissions by attempting a small fetch
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      try {
        await fetchWorkouts(oneWeekAgo, now);
      } catch {
        // If fetch fails after auth, permissions were likely denied
        setError(
          t("integrations.appleHealth.permissionDenied") ??
            "Apple Health permissions were denied.",
        );
        return;
      }

      await setConnected(true);
      setAuthorized(true);
      // Sync immediately after first connect
      hasSynced.current = false;
    } catch (err) {
      console.error("Error requesting HealthKit permissions:", err);
      setError(
        t("integrations.appleHealth.permissionDenied") ??
          "Failed to request Apple Health permissions.",
      );
    } finally {
      setConnecting(false);
    }
  }, [t]);

  const handleDisconnect = useCallback(async () => {
    showAlert(
      t("integrations.appleHealth.disconnectTitle") ??
        "Disconnect Apple Health",
      t("integrations.appleHealth.disconnectMessage") ??
        "This will stop syncing with Apple Health. To fully revoke permissions, go to iOS Settings > Privacy > Health.",
      [
        { text: t("common.cancel") ?? "Cancel", style: "cancel" },
        {
          text: t("settings.disconnect") ?? "Disconnect",
          style: "destructive",
          onPress: async () => {
            await clearAppleHealthData();
            setAuthorized(false);
            showAlert(
              t("common.ok") ?? "Success",
              t("integrations.appleHealth.disconnectSuccess") ??
                "Apple Health disconnected.",
            );
          },
        },
      ],
    );
  }, [t]);

  return {
    isAvailable,
    authorized,
    loading,
    error,
    isSyncing,
    connecting,
    lastSyncCount,
    lastSyncTime,
    handleConnect,
    handleDisconnect,
    syncWorkouts,
  };
}
