import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Markdown from "react-native-markdown-display";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/ThemeContext";
import { useOnboarding, STORAGE_KEY } from "./_layout";
import { saveOnboardingData } from "@/services/onboarding";
import { createRaceEvent } from "@/services/raceEvents";
import { apiClient } from "@/services/api";

const isWeb = Platform.OS === "web";
const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

function buildStrategyPrompt(state: ReturnType<typeof useOnboarding>["state"], language: string): string {
  const allSports = [...state.sports.map(s => s), ...(state.customSports ? [state.customSports] : [])].join(", ");

  const raceBlock =
    state.hasRace && state.race
      ? `They have a race coming up: ${state.race.name} on ${state.race.date}${state.race.eventType ? ` (${state.race.eventType})` : ""}. Factor this into the plan — outline a rough periodization leading up to it.`
      : "";

  return `You MUST respond in the language "${language}". This is non-negotiable.

You are their new coach. First conversation. Be direct, warm, no filler. No "Great news!", no "I'm excited". Talk like a coach who texts their athletes.

New athlete: ${state.name}
Sports: ${allSports}
Goals: ${state.goals.join(", ")}
${state.trainingDaysPerWeek} days/week, ${state.weeklyTrainingHours}h total
${state.trainingExperienceYears} years of training experience
${raceBlock} 

Greet them by name, do NOT summarize all the information.

Give infromation how you want to approach the training plan building based on the info they gave you. For example, if they have low experience, you might want to start with a base building phase. If they have a race coming up, you might want to talk about periodization. If they have multiple sports, you might want to talk about how to balance them.

Then give them a concrete weekly training structure. Be specific to their sports and goals — not generic fitness advice. For example: which days for what, how to split intensity (easy vs hard), when to rest. If they do multiple sports, show how to balance them across the week.

Then give a short time estimate for the training plan periodization.

Then ask 1 short follow-up questions to refine the plan. Focus on things you actually need to know as a coach.

Important:
End by telling them they can answer now or anytime in the chat.

Style: Keep it short and simple. Keep it conversational.`;
}

async function generateStrategy(
  state: ReturnType<typeof useOnboarding>["state"],
  language: string,
  onPhase: (phase: number) => void,
): Promise<{ text: string; threadId: string }> {
  const session = await apiClient.supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("No access token");

  const thread = await apiClient.createChatThread({ trainer: "Simon" });
  const threadId = thread.thread_id;

  onPhase(2);

  return new Promise<{ text: string; threadId: string }>((resolve, reject) => {
    if (!BACKEND_BASE_URL) throw new Error("BACKEND_BASE_URL is not configured");
    const wsUrl = `${BACKEND_BASE_URL.replace("http", "ws")}/chat/${threadId}?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);
    let response = "";
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        if (response.trim()) {
          resolve({ text: response.trim(), threadId });
        } else {
          reject(new Error("Strategy generation timed out"));
        }
      }
    }, 30000);

    ws.onopen = () => {
      const prompt = buildStrategyPrompt(state, language);
      ws.send(
        JSON.stringify({
          type: "user_message",
          message: prompt,
          content: prompt,
          trainer: "Simon",
          hide_from_history: true,
        }),
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "chunk" || data.type === "stream") {
          if (!response) {
            onPhase(3);
          }
          response += data.content;
        } else if (data.type === "ENDOF_STREAM" || data.type === "end") {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            ws.close();
            resolve({ text: response.trim(), threadId });
          }
        }
      } catch {
        // Ignore parse errors for individual messages
      }
    };

    ws.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (response.trim()) {
          resolve({ text: response.trim(), threadId });
        } else {
          reject(new Error("WebSocket error"));
        }
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (response.trim()) {
          resolve({ text: response.trim(), threadId });
        } else {
          reject(new Error("WebSocket closed unexpectedly"));
        }
      }
    };
  });
}

export default function BuildingScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { state, setState } = useOnboarding();

  const [phase, setPhase] = useState(1);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const saveErrorRef = useRef(false);
  const strategyThreadIdRef = useRef<string | null>(null);

  const mdStyles = {
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: isDark ? "#e5e7eb" : "#1f2937",
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
    },
    strong: {
      fontWeight: "bold" as const,
      color: isDark ? "#ffffff" : "#111827",
    },
    em: {
      fontStyle: "italic" as const,
    },
    list_item: {
      marginBottom: 4,
    },
    bullet_list: {
      marginBottom: 8,
    },
  };

  useEffect(() => {
    let cancelled = false;
    // Reset state for retries
    saveErrorRef.current = false;
    setPhase(1);
    setStrategy(null);

    const savePromise = (async () => {
      await saveOnboardingData(state);
      // Dedup race events: only create if no matching event exists
      if (state.hasRace && state.race) {
        const { data: existing } = await apiClient.supabase
          .from("race_events")
          .select("id")
          .eq("name", state.race.name)
          .eq("event_date", state.race.date)
          .limit(1);
        if (!existing || existing.length === 0) {
          await createRaceEvent({
            name: state.race.name,
            event_date: state.race.date,
            event_type: state.race.eventType || undefined,
          });
        }
      }
    })().catch((err) => {
      console.error("Save failed:", err);
      saveErrorRef.current = true;
    });

    const strategyPromise = generateStrategy(state, i18n.language || "en", (p) => {
      if (!cancelled) setPhase(p);
    }).catch((err) => {
      console.error("Strategy generation failed:", err);
      return null;
    });

    const minTimerPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, 200),
    );

    Promise.all([savePromise, strategyPromise, minTimerPromise]).then(
      ([, result]) => {
        if (cancelled) return;

        if (saveErrorRef.current) {
          if (isWeb) {
            window.alert(t("onboarding.building.saveError"));
            setRetryCount((c) => c + 1);
          } else {
            Alert.alert(t("common.error"), t("onboarding.building.saveError"), [
              {
                text: t("common.retry"),
                onPress: () => setRetryCount((c) => c + 1),
              },
            ]);
          }
          return;
        }

        if (result) {
          strategyThreadIdRef.current = result.threadId;
          setState((prev) => ({ ...prev, trainingStrategy: result.text }));
          setStrategy(result.text);

          // Persist strategy to DB
          apiClient.supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
              apiClient.supabase
                .from("user_infos")
                .update({ training_strategy: result.text })
                .eq("user_id", user.id)
                .then(() => {});
            }
          });
        }

        AsyncStorage.removeItem(STORAGE_KEY).catch((e) => {
          console.warn("Failed to clear onboarding progress:", e);
        });

        // Show strategy view (even without strategy, user can still proceed)
        setStrategy(result?.text || "");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleContinue = async () => {
    // Send user feedback as a follow-up message on the strategy thread
    if (comment.trim() && strategyThreadIdRef.current) {
      try {
        const session = await apiClient.supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;
        if (accessToken && BACKEND_BASE_URL) {
          const threadId = strategyThreadIdRef.current;
          const wsUrl = `${BACKEND_BASE_URL.replace("http", "ws")}/chat/${threadId}?token=${accessToken}`;
          const ws = new WebSocket(wsUrl);
          await new Promise<void>((resolve) => {
            ws.onopen = () => {
              ws.send(JSON.stringify({
                type: "user_message",
                message: comment.trim(),
                content: comment.trim(),
                trainer: "Simon",
              }));
              // Give it a moment to send, then close
              setTimeout(() => { ws.close(); resolve(); }, 500);
            };
            ws.onerror = () => resolve();
          });
        }
      } catch (err) {
        console.warn("Failed to send onboarding feedback:", err);
      }
    }
    router.replace("/(onboarding)/trial");
  };

  // ── Strategy result view (shown once generation completes, even on failure) ──
  if (strategy !== null) {
    return (
      <View
        className="flex-1 bg-background"
        style={[
          { paddingTop: insets.top },
          isWeb && { alignItems: "center" as const },
        ]}
      >
        <View
          style={isWeb ? { width: "100%", maxWidth: 480, flex: 1 } : { flex: 1 }}
        >
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-6 pt-6 pb-6"
            contentContainerStyle={isWeb ? { flexGrow: 0 } : undefined}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {strategy.length > 0 && (
              <Animated.View entering={FadeInDown.duration(40)}>
                <View className="bg-card rounded-xl border border-border px-5 py-4 mb-6">
                  <Markdown style={mdStyles}>{strategy}</Markdown>
                </View>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(20).duration(40)} className="gap-4">
              <Button onPress={handleContinue} className="w-full">
                <Text>{t("onboarding.building.soundsPerfect")}</Text>
              </Button>

              {!showComment && strategy.length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowComment(true)}
                  className="items-center py-2"
                >
                  <Text className="text-sm text-primary font-medium">
                    {t("onboarding.building.addNotes")}
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>

            {showComment && (
              <Animated.View entering={FadeInDown.duration(30)} className="mt-6">
                <Text className="text-sm font-medium text-foreground mb-1.5 mt-2">
                  {t("onboarding.building.commentLabel")}
                </Text>
                <Input
                  value={comment}
                  onChangeText={setComment}
                  placeholder={t("onboarding.building.commentPlaceholder")}
                  multiline
                  numberOfLines={3}
                  className="min-h-[72px]"
                  textAlignVertical="top"
                  autoFocus
                />
                <Text className="text-xs text-muted-foreground mt-1.5">
                  {t("onboarding.building.notesLaterHint")}
                </Text>

                {comment.trim().length > 0 && (
                  <Button onPress={handleContinue} className="w-full mt-4">
                    <Text>{t("onboarding.building.sendAndContinue")}</Text>
                  </Button>
                )}
              </Animated.View>
            )}

            {isWeb && <View className="h-8" />}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Loading / generating view ─────────────────────────────────────────
  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={[
        { paddingTop: insets.top + 32 },
        isWeb && { alignItems: "center" },
      ]}
    >
      <View style={isWeb ? { width: "100%", maxWidth: 480 } : undefined}>
        <Text className="text-3xl font-bold text-foreground mb-3">
          {t("onboarding.building.title")}
        </Text>

        <View className="gap-4 mb-8">
          <Animated.View entering={FadeIn.duration(40)}>
            <Text className="text-base text-muted-foreground">
              {t("onboarding.building.line1")}
            </Text>
          </Animated.View>

          {phase >= 2 && (
            <Animated.View entering={FadeIn.duration(40)}>
              <Text className="text-base text-muted-foreground">
                {t("onboarding.building.line2")}
              </Text>
            </Animated.View>
          )}

          {phase >= 3 && (
            <Animated.View entering={FadeIn.duration(40)}>
              <Text className="text-base text-primary font-semibold">
                {t("onboarding.building.line3")}
              </Text>
            </Animated.View>
          )}
        </View>

        <ActivityIndicator size="small" />
      </View>
    </View>
  );
}
