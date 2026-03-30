// src/app/services/raceEvents.ts
import { apiClient } from "./api";
import type { RaceEvent } from "../types/onboarding";

export async function getRaceEvents(): Promise<RaceEvent[]> {
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
  const { data, error } = await apiClient.supabase
    .from("race_events")
    .select("*")
    .gte("event_date", today)
    .order("event_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createRaceEvent(payload: {
  name: string;
  event_date: string;
  event_type?: string;
}): Promise<RaceEvent> {
  const { data: { user } } = await apiClient.supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await apiClient.supabase
    .from("race_events")
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRaceEvent(id: string): Promise<void> {
  const { error } = await apiClient.supabase
    .from("race_events")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
