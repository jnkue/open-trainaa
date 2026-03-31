import React, {useState, useEffect, useRef, useCallback} from "react";
import {View, TouchableOpacity, ScrollView, Modal, TextInput, Image, KeyboardAvoidingView, Platform, ActivityIndicator} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {IconSymbol} from "@/components/ui/IconSymbol";
import {apiClient} from "@/services/api";
import {Text, Spinner} from "@/components/ui";
import {useTheme} from "@/contexts/ThemeContext";
import {useTranslation} from "react-i18next";
import Markdown from "react-native-markdown-display";
import {parseAgentAction, emitAgentAction} from "@/hooks/useAgentActionListener";
import {getSportTranslation} from "@/utils/formatters";
import {router} from "expo-router";
import {useRevenueCat} from "@/contexts/RevenueCatContext";
import {showAlert} from "@/utils/alert";

interface Message {
	id?: string;
	role: "user" | "assistant" | "system" | "action";
	content: string;
	isStreaming?: boolean;
	metadata?: Record<string, any>;
	created_at?: string;
}

interface Thread {
	id: string;
	trainer: string;
	trainerName: string;
	createdAt: Date;
}

interface ChatInterfaceProps {
	userId: string;
	accessToken: string;
}

interface Trainer {
	id: string;
	name: string;
	description: string;
}

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

const TRAINERS: Trainer[] = [
	{id: "Simon", name: "Simon", description: "Ausdauertraining"},
	{id: "Isabella", name: "Isabella", description: "Krafttraining"},
	{id: "David", name: "David", description: "Ernährung"},
];

// WebSocket connection states
enum WebSocketReadyState {
	CONNECTING = 0,
	OPEN = 1,
	CLOSING = 2,
	CLOSED = 3,
}

const generateUUID = () => {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0,
			v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
};

export default function ChatInterface({userId, accessToken}: ChatInterfaceProps) {
	const {colorScheme, isDark} = useTheme();
	const {t} = useTranslation();
	const insets = useSafeAreaInsets();
	const [messages, setMessages] = useState<Message[]>([]);
	const [inputMessage, setInputMessage] = useState("");
	const [inputHeight, setInputHeight] = useState(36);
	const [selectedTrainer, setSelectedTrainer] = useState<Trainer>(TRAINERS[0]);
	const [selectedThread, setSelectedThread] = useState<string>("");
	const [threads, setThreads] = useState<Thread[]>([]);
	const [ws, setWs] = useState<WebSocket | null>(null);
	const [isConnected, setIsConnected] = useState<WebSocketReadyState>(WebSocketReadyState.CLOSED);
	const [isAIResponding, setIsAIResponding] = useState(false);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [_reconnectAttempts, setReconnectAttempts] = useState(0);
	const [isConnecting, setIsConnecting] = useState(false);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [hasUserInteracted, setHasUserInteracted] = useState(false);
	const [isTrainerSelectionVisible, setIsTrainerSelectionVisible] = useState(false);
	const [isThreadPickerVisible, setIsThreadPickerVisible] = useState(false);
	const [currentStatus, setCurrentStatus] = useState<string>("");
	const [currentProgress, setCurrentProgress] = useState<string>("");
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [conversationActive, setConversationActive] = useState(false);
	const [messageLimitReached, setMessageLimitReached] = useState(false);
	const [isPurchasing, setIsPurchasing] = useState(false);
	const {presentPaywall} = useRevenueCat();
	const conversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const aiRespondingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const scrollViewRef = useRef<ScrollView>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const hasUserInteractedRef = useRef(false);
	const isConnectingRef = useRef(false);
	const wsRef = useRef<WebSocket | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [lastTrainerId, setLastTrainerId] = useState<string>("");
	const [isThreadChanging, setIsThreadChanging] = useState(false);

	// Load threads from backend ONLY ONCE on mount
	useEffect(() => {
		const loadThreadsFromBackend = async () => {
			try {
				const backendThreads = await apiClient.getChatThreads();

				if (backendThreads && backendThreads.length > 0) {
					// Convert backend threads to local format
					const loadedThreads: Thread[] = backendThreads.map((threadInfo) => ({
						id: threadInfo.thread_id,
						trainer: threadInfo.trainer || selectedTrainer.id,
						trainerName:
							threadInfo.trainer === "Simon"
								? "Simon"
								: threadInfo.trainer === "Isabella"
									? "Isabella"
									: threadInfo.trainer === "David"
										? "David"
										: selectedTrainer.name,
						createdAt: new Date(threadInfo.created_at),
					}));

					// Sort threads by creation date (newest first)
					loadedThreads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

					setThreads(loadedThreads);

					// Select the newest thread (first in sorted array)
					if (!selectedThread && loadedThreads.length > 0) {
						console.log("🔗 [DEBUG] Connecting to newest thread:", loadedThreads[0].id);
						setSelectedThread(loadedThreads[0].id);
						// Set the trainer to match the newest thread's trainer
						const newestThreadTrainer = TRAINERS.find((t) => t.id === loadedThreads[0].trainer);
						if (newestThreadTrainer) {
							setSelectedTrainer(newestThreadTrainer);
							setLastTrainerId(newestThreadTrainer.id);
						}
						// Mark initial load as complete AFTER setting everything
						setIsInitialLoad(false);
					}
				} else {
					// Create initial thread if no threads exist
					console.log("📝 [DEBUG] No threads exist, creating initial thread");
					await createNewThread();
					// Mark initial load as complete
					setIsInitialLoad(false);
				}
			} catch (error) {
				console.error("Error loading threads from backend:", error);
				// Fallback to creating initial thread
				if (!selectedThread) {
					console.log("⚠️ [DEBUG] Error loading threads, creating fallback thread");
					await createNewThread();
				}
				// Mark initial load as complete even on error
				setIsInitialLoad(false);
			}
		};

		loadThreadsFromBackend();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Empty deps - only run once on mount

	// Use useRef for currentResponse to persist across renders
	const currentResponseRef = useRef("");

	// WebSocket message handler - defined before connectWebSocket to avoid dependency issues
	const handleWebSocketMessage = useCallback((event: MessageEvent) => {
		try {
			const data = JSON.parse(event.data);
			console.log("[DEBUG] 🔥 WebSocket message received:", data);

			if (data.type === "stream") {
				console.log("[DEBUG] 🔥 Stream content received:", data.content);
				currentResponseRef.current += data.content;
				setMessages((prev) => {
					console.log("[DEBUG] 🔥 Current messages before update:", prev.length);
					const updated = [...prev];
					const lastMessage = updated[updated.length - 1];
					console.log("[DEBUG] 🔥 Last message:", lastMessage);

					if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
						console.log("[DEBUG] 🔥 Updating existing streaming message");
						updated[updated.length - 1] = {
							...lastMessage,
							content: currentResponseRef.current,
							id: lastMessage.id || generateUUID(), // Ensure ID exists for iOS rendering
						};
					} else {
						console.log("[DEBUG] 🔥 Creating NEW assistant message");
						const newMessage = {
							id: generateUUID(),
							role: "assistant" as const,
							content: currentResponseRef.current,
							isStreaming: true,
						};
						console.log("[DEBUG] 🔥 NEW assistant message:", newMessage);
						updated.push(newMessage);
						setIsAIResponding(true);
					}
					console.log("[DEBUG] 🔥 Updated messages count after stream:", updated.length);
					console.log("[DEBUG] 🔥 All messages after update:", updated);
					return updated;
				});
			} else if (data.type === "chunk") {
				// Handle LangGraph streaming content
				currentResponseRef.current += data.content;
				setMessages((prev) => {
					const updated = [...prev];
					const lastMessage = updated[updated.length - 1];

					if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
						updated[updated.length - 1] = {
							...lastMessage,
							content: currentResponseRef.current,
							id: lastMessage.id || generateUUID(), // Ensure ID exists for iOS rendering
						};
					} else {
						updated.push({
							id: generateUUID(),
							role: "assistant",
							content: currentResponseRef.current,
							isStreaming: true,
						});
						setIsAIResponding(true);
					}
					return updated;
				});
			} else if (data.type === "status") {
				// Handle status updates with emoji
				setCurrentStatus(data.content);
				setConversationActive(true); // Status means conversation is ongoing
				setIsAIResponding(true); // AI is actively working

				// Clear timeout since we have activity
				if (conversationTimeoutRef.current) {
					clearTimeout(conversationTimeoutRef.current);
					conversationTimeoutRef.current = null;
				}

				// Safety reset: If status indicates new thinking phase after content, reset ref
				// This is a defensive measure to prevent concatenation from different response phases
				if (currentResponseRef.current && data.content.toLowerCase().includes("thinking")) {
					console.log("💭 New thinking phase detected - safety reset of response ref");
					currentResponseRef.current = "";
				}

				console.log("🔄 Status:", data.content);
			} else if (data.type === "progress") {
				// Handle progress updates
				setCurrentProgress(data.content);
				setConversationActive(true); // Progress means conversation is ongoing

				// Clear timeout since we have activity
				if (conversationTimeoutRef.current) {
					clearTimeout(conversationTimeoutRef.current);
					conversationTimeoutRef.current = null;
				}

				console.log("📊 Progress:", data.content);
			} else if (data.type === "error") {
				// Handle error messages
				setCurrentStatus("Error: " + data.content);
				console.log("Error:", data.content);
				// Error ends the conversation
				setConversationActive(false);
				setIsAIResponding(false);

				// Clear timeouts since conversation is ending
				if (conversationTimeoutRef.current) {
					clearTimeout(conversationTimeoutRef.current);
					conversationTimeoutRef.current = null;
				}
				if (aiRespondingTimeoutRef.current) {
					clearTimeout(aiRespondingTimeoutRef.current);
					aiRespondingTimeoutRef.current = null;
				}
			} else if (data.type === "info") {
				// Handle info messages (like "Calling tools...")
				setCurrentStatus(data.content);
				setConversationActive(true); // Info means conversation is ongoing
				setIsAIResponding(true); // AI is actively working (e.g., calling tools)

				// Clear timeout since we have activity
				if (conversationTimeoutRef.current) {
					clearTimeout(conversationTimeoutRef.current);
					conversationTimeoutRef.current = null;
				}

				// Safety reset: If info indicates tool execution, ensure response ref is clean
				// This prevents concatenation bugs if backend didn't send ENDOF_STREAM
				if (data.content.toLowerCase().includes("tool")) {
					console.log("🔧 Info indicates tool execution - safety reset of response ref");
					currentResponseRef.current = "";
				}

				console.log("ℹ️ Info:", data.content);
			} else if (data.type === "action") {
				// Handle action messages (e.g., workout created)
				console.log("🎯 Action:", data.content);

				// Parse action data and add as a message
				try {
					const actionData = JSON.parse(data.content);
					setMessages((prev) => [
						...prev,
						{
							id: generateUUID(),
							role: "action",
							content: data.content,
							metadata: actionData,
						},
					]);

					// Emit agent action event to trigger cache invalidation
					const parsedAction = parseAgentAction(data.content);
					if (parsedAction) {
						console.log("♻️ Emitting agent action for cache invalidation:", parsedAction.type);
						emitAgentAction(parsedAction);
					}
				} catch (e) {
					console.error("Failed to parse action data:", e);
					// Still add as action message with raw content
					setMessages((prev) => [
						...prev,
						{
							id: generateUUID(),
							role: "action",
							content: data.content,
						},
					]);
				}
			} else if (data.type === "limit_reached") {
				// Handle message limit reached
				console.log("Message limit reached:", data);
				setMessageLimitReached(true);

				// Add system message about limit
				setMessages((prev) => [
					...prev,
					{
						id: generateUUID(),
						role: "system",
						content: t("chat.limitReached"),
					},
				]);

				// Show paywall on all platforms
				presentPaywall().then((purchased) => {
					if (purchased) {
						setMessageLimitReached(false);
					}
				});
			} else if (data.type === "message_count") {
				// Handle message count update
				console.log("📊 Message count update:", data);

				// If remaining is 0, set limit reached
				if (data.remaining === 0) {
					setMessageLimitReached(true);
				}
			} else if (data.type === "error_message") {
				// Atomic handler for error messages — creates a complete, non-streaming
				// assistant message in one shot, bypassing the chunk→ENDOF_STREAM flow
				// which has timing issues in React Native.
				console.log("⚠️ [DEBUG] error_message received:", data.content);
				setMessages((prev) => [
					...prev,
					{
						id: generateUUID(),
						role: "assistant" as const,
						content: data.content,
						isStreaming: false,
					},
				]);
				currentResponseRef.current = "";
				setCurrentStatus("");
				setCurrentProgress("");
				setIsAIResponding(false);
				setConversationActive(false);
				if (conversationTimeoutRef.current) {
					clearTimeout(conversationTimeoutRef.current);
					conversationTimeoutRef.current = null;
				}
				if (aiRespondingTimeoutRef.current) {
					clearTimeout(aiRespondingTimeoutRef.current);
					aiRespondingTimeoutRef.current = null;
				}
			} else if (data.type === "ENDOF_STREAM") {
				console.log("🏁 [DEBUG] 🔥 ENDOF_STREAM received:", data);
				setMessages((prev) => {
					console.log("🏁 [DEBUG] 🔥 Messages before ENDOF_STREAM:", prev.length);
					const updated = [...prev];
					const lastMessage = updated[updated.length - 1];
					console.log("🏁 [DEBUG] 🔥 Last message before finalizing:", lastMessage);

					// CRITICAL FIX FOR iOS: Use currentResponseRef.current instead of lastMessage.content
					// to avoid race condition with async state updates

					// Priority order for content sources:
					// 1. Backend-provided string content (authoritative from server)
					// 2. Accumulated ref content (most up-to-date on frontend, updated synchronously)
					// 3. Last message state content (fallback, but may be stale due to batching)
					let finalContent = currentResponseRef.current;

					console.log("🏁 [DEBUG] ENDOF_STREAM - currentRef length:", currentResponseRef.current?.length || 0);
					console.log("🏁 [DEBUG] ENDOF_STREAM - lastMessage length:", lastMessage?.content?.length || 0);
					console.log("🏁 [DEBUG] ENDOF_STREAM - data.content type:", typeof data.content);

					// If backend provides complete content, use that as source of truth
					if (data.content) {
						if (typeof data.content === "string" && data.content.trim()) {
							console.log("📝 [DEBUG] Using backend-provided string content (length:", data.content.length, ")");
							finalContent = data.content;
						} else if (typeof data.content === "object" && data.content.content) {
							console.log("📝 [DEBUG] Using serialized AIMessage content");
							finalContent = data.content.content;
						}
					}

					// Fallback to last message state if ref is empty (shouldn't normally happen)
					if (!finalContent && lastMessage?.content) {
						console.log("⚠️ [DEBUG] Fallback to lastMessage.content");
						finalContent = lastMessage.content;
					}

					if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
						console.log("🏁 [DEBUG] 🔥 Finalizing assistant message");
						updated[updated.length - 1] = {
							...lastMessage,
							content: finalContent,
							isStreaming: false,
						};
						console.log("🏁 [DEBUG] 🔥 Finalized message content length:", finalContent?.length || 0);
					} else if (lastMessage?.role === "assistant") {
						// Safety: If message exists but isStreaming already false,
						// still update content to ensure we have the latest (defensive programming)
						console.log("⚠️ [DEBUG] Message already finalized, ensuring content is current");
						updated[updated.length - 1] = {
							...lastMessage,
							content: finalContent,
						};
					}
					console.log("🏁 [DEBUG] 🔥 Final messages after ENDOF_STREAM:", updated.length);
					return updated;
				});

				// For the new agent: Reset current response for potential next message
				currentResponseRef.current = "";

				// Clear any existing conversation timeout
				if (conversationTimeoutRef.current) {
					clearTimeout(conversationTimeoutRef.current);
					conversationTimeoutRef.current = null;
				}

				// Clear AI responding safety timeout
				if (aiRespondingTimeoutRef.current) {
					clearTimeout(aiRespondingTimeoutRef.current);
					aiRespondingTimeoutRef.current = null;
				}

				// IMMEDIATELY clear status indicators for better UX
				// If tool calls are about to happen, the "info" message will set them again
				console.log("🏁 [DEBUG] Clearing status indicators immediately");
				setCurrentStatus("");
				setCurrentProgress("");
				setIsAIResponding(false);

				// Keep a short safety timeout to ensure conversation state is cleared
				// This handles edge cases where no more messages arrive
				conversationTimeoutRef.current = setTimeout(() => {
					console.log("🏁 [DEBUG] Safety timeout - ensuring conversation ended");
					setConversationActive(false);
					conversationTimeoutRef.current = null;
				}, 500) as any; // Short 500ms safety timeout
			} else {
				console.log("📨 Unhandled message type:", data.type, "Data:", data);
			}
		} catch (error) {
			console.error("Error parsing WebSocket message:", error);
		}
	}, [presentPaywall, t]);

	// WebSocket connection management with useCallback to prevent dependency issues
	const connectWebSocket = useCallback(
		(threadId: string) => {
			if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
				console.log("🔄 [DEBUG] WebSocket already connecting or connected, skipping...");
				return;
			}

			console.log(`🚀 [DEBUG] Initiating WebSocket connection for thread: ${threadId}`);
			setIsConnecting(true);
			isConnectingRef.current = true;
			setConnectionError(null);

			const wsUrl = `${BACKEND_BASE_URL?.replace("http", "ws")}/chat/${threadId}?token=${accessToken}`;
			console.log(`🌐 [DEBUG] WebSocket URL: ${wsUrl}`);

			try {
				const newWs = new WebSocket(wsUrl);
				wsRef.current = newWs;

				const connectionTimeout = setTimeout(() => {
					if (newWs.readyState === WebSocket.CONNECTING) {
						console.log("⏰ [DEBUG] WebSocket connection timeout, closing...");
						newWs.close();
						setConnectionError(t("chat.connectionTimeout"));
						setIsConnecting(false);
						isConnectingRef.current = false;
					}
				}, 10000); // 10 second timeout

				newWs.onopen = () => {
					console.log("✅ [DEBUG] WebSocket connection established successfully");
					clearTimeout(connectionTimeout);
					setWs(newWs);
					wsRef.current = newWs;
					setIsConnected(WebSocketReadyState.OPEN);
					setReconnectAttempts(0);
					reconnectAttemptsRef.current = 0;
					setIsConnecting(false);
					isConnectingRef.current = false;
					setConnectionError(null);
				};

				newWs.onerror = (error) => {
					console.error("❌ [DEBUG] WebSocket error:", error);
					clearTimeout(connectionTimeout);
					setConnectionError(t("chat.connectionError"));
					setIsConnecting(false);
					isConnectingRef.current = false;
				};

				newWs.onclose = (event) => {
					console.log(`🔌 [DEBUG] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
					clearTimeout(connectionTimeout);
					setIsConnected(WebSocketReadyState.CLOSED);
					setIsConnecting(false);
					isConnectingRef.current = false;
					setWs(null);
					wsRef.current = null;

					// Auto-reconnect logic
					if (event.code !== 1000 && reconnectAttemptsRef.current < 5 && hasUserInteractedRef.current) {
						const nextAttempt = reconnectAttemptsRef.current + 1;
						const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // Exponential backoff
						console.log(`🔄 [DEBUG] Attempting reconnect ${nextAttempt}/5 in ${delay}ms...`);

						setReconnectAttempts(nextAttempt);
						reconnectAttemptsRef.current = nextAttempt;
						reconnectTimeoutRef.current = setTimeout(() => {
							connectWebSocket(threadId);
						}, delay) as any;
					}
				};

				newWs.onmessage = handleWebSocketMessage;
			} catch (error) {
				console.error("💥 [DEBUG] Failed to create WebSocket:", error);
				setConnectionError(t("chat.connectionFailed"));
				setIsConnecting(false);
				isConnectingRef.current = false;
			}
		},
		[accessToken, handleWebSocketMessage, t]
	);

	const disconnectWebSocket = useCallback(() => {
		console.log("🔌 [DEBUG] Manually disconnecting WebSocket");

		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}

		if (wsRef.current) {
			wsRef.current.close(1000, "Manual disconnect"); // Normal closure
			setWs(null);
			wsRef.current = null;
		}

		setIsConnected(WebSocketReadyState.CLOSED);
		setIsConnecting(false);
		isConnectingRef.current = false;
		setReconnectAttempts(0);
		reconnectAttemptsRef.current = 0;
		setConnectionError(null);
	}, []);

	const sendMessage = async () => {
		if (!inputMessage.trim()) {
			console.log("📝 [DEBUG] Empty message, not sending");
			return;
		}

		// Check if message limit is reached
		if (messageLimitReached) {
			console.log("🚫 [DEBUG] Message limit reached, not sending");
			return;
		}

		// Mark that user has interacted
		if (!hasUserInteracted) {
			console.log("👤 [DEBUG] First user interaction detected");
			setHasUserInteracted(true);
			hasUserInteractedRef.current = true;
		}

		// Ensure WebSocket connection
		if ((isConnected as WebSocketReadyState) !== WebSocketReadyState.OPEN) {
			console.log("🔄 [DEBUG] WebSocket not connected, attempting to connect...");
			if (selectedThread && !isConnecting) {
				connectWebSocket(selectedThread);
			}

			// Wait a moment for connection
			await new Promise((resolve) => setTimeout(resolve, 1000));

			if ((isConnected as WebSocketReadyState) !== WebSocketReadyState.OPEN) {
				console.log("❌ [DEBUG] Could not establish WebSocket connection for sending message");
				setConnectionError(t("chat.cannotSendNoConnection"));
				return;
			}
		}

		const userMessage: Message = {
			id: generateUUID(),
			role: "user",
			content: inputMessage.trim(),
			isStreaming: false,
		};

		console.log(`📤 [DEBUG] Sending message: "${inputMessage.trim().substring(0, 50)}..."`, userMessage);
		setMessages((prev) => {
			const updated = [...prev, userMessage];
			console.log("[DEBUG] Messages after adding user message:", updated.length);
			return updated;
		});

		// Start conversation tracking
		setConversationActive(true);
		setIsAIResponding(true);

		// Safety timeout: Reset AI responding state after 60 seconds if no response
		if (aiRespondingTimeoutRef.current) {
			clearTimeout(aiRespondingTimeoutRef.current);
		}
		aiRespondingTimeoutRef.current = setTimeout(() => {
			console.log("⚠️ [DEBUG] AI responding timeout - resetting state");
			setIsAIResponding(false);
			setCurrentStatus("");
			setCurrentProgress("");
			setConversationActive(false);
			aiRespondingTimeoutRef.current = null;
		}, 60000) as any; // 60 second timeout

		// Send via WebSocket
		if (ws && ws.readyState === WebSocket.OPEN) {
			try {
				const wsMessage = {
					type: "user_message",
					message: inputMessage.trim(), // Backend expects 'message' field
					content: inputMessage.trim(), // Keep for compatibility
					thread_id: selectedThread,
					trainer: selectedTrainer.id,
					theme: colorScheme, // Send current theme to backend
				};

				ws.send(JSON.stringify(wsMessage));
				console.log("✅ [DEBUG] Message sent via WebSocket successfully");
				setConnectionError(null);
			} catch (error) {
				console.error("❌ [DEBUG] Failed to send WebSocket message:", error);
				setConnectionError(t("chat.messageCouldNotSend"));
				setConversationActive(false);
				setIsAIResponding(false);
			}
		} else {
			console.log("❌ [DEBUG] WebSocket not available for sending message");
			setConnectionError(t("chat.noActiveConnection"));
			setConversationActive(false);
			setIsAIResponding(false);
		}

		setInputMessage("");
		setInputHeight(36); // Reset height to original size
	};

	// Handle input focus to initiate connection
	const handleInputFocus = () => {
		console.log("📝 [DEBUG] Input field focused - initiating connection if needed");

		if (!hasUserInteracted) {
			setHasUserInteracted(true);
			hasUserInteractedRef.current = true;
		}

		if (selectedThread && isConnected !== WebSocketReadyState.OPEN && !isConnectingRef.current) {
			console.log("🔄 [DEBUG] Starting WebSocket connection on input focus");
			connectWebSocket(selectedThread);
		}
	};

	const handleUpgradeToPro = async () => {
		console.log("=== handleUpgradeToPro called ===");
		console.log("Platform.OS:", Platform.OS);

		try {
			setIsPurchasing(true);

			if (Platform.OS === "web") {
				// Web platform: Use Stripe Checkout directly (no offerings needed)
				console.log("Web: Initiating Stripe Checkout...");

				// Call purchasePackage with null - it will handle Stripe redirect
				await purchasePackage(null);

				// Note: User will be redirected to Stripe Checkout
				// After payment, they'll return and entitlement will sync automatically
				console.log("Web: User redirected to Stripe Checkout");
			} else {
				// iOS/other platforms: Use RevenueCat offerings
				console.log("iOS: Using RevenueCat offerings");

				// Check if offerings are available
				if (!offerings || !offerings.current || !offerings.current.availablePackages || offerings.current.availablePackages.length === 0) {
					console.error("No offerings available!");
					showAlert(
						t("subscription.title"),
						t("subscription.noOfferings")
					);
					setIsPurchasing(false);
					return;
				}

				// Get the first available package
				const packageToPurchase = offerings.current.availablePackages[0];
				console.log("Package to purchase:", packageToPurchase);

				// Use the unified purchase method from context
				const purchaseResult = await purchasePackage(packageToPurchase);
				console.log("Purchase result:", purchaseResult);

				// Check if purchase was successful
				const newCustomerInfo = purchaseResult.customerInfo;
				const hasProEntitlement = newCustomerInfo.entitlements.active["PRO"] !== undefined;

				if (hasProEntitlement) {
					showAlert(
						t("subscription.title"),
						t("subscription.restoreSuccessMessage")
					);
					// Reset the message limit
					setMessageLimitReached(false);
				}
			}
		} catch (error: any) {
			console.error("Error during subscription purchase:", error);

			// Check if user cancelled
			if (error.userCancelled) {
				console.log("User cancelled purchase");
				return;
			}

			showAlert(
				t("common.error"),
				error.message || t("subscription.manageSubscriptionError")
			);
		} finally {
			console.log("Setting isPurchasing to false");
			setIsPurchasing(false);
		}
	};

	const handleInputChange = (text: string) => {
		setInputMessage(text);

		// Clear connection errors when user starts typing
		if (connectionError && text.trim()) {
			setConnectionError(null);
		}
	};

	const createNewThread = useCallback(async () => {
		console.log("🆕 [DEBUG] Creating new thread");

		try {
			// Call API to create thread
			const createdThread = await apiClient.createChatThread({
				trainer: selectedTrainer.id,
			});

			const newThread: Thread = {
				id: createdThread.thread_id,
				trainer: createdThread.trainer,
				trainerName: selectedTrainer.name,
				createdAt: new Date(createdThread.created_at),
			};

			// Close existing WebSocket
			if (ws) {
				console.log("🔌 [DEBUG] Closing existing WebSocket for new thread");
				ws.close();
				setWs(null);
			}

			// Clear connection errors
			setConnectionError(null);
			setReconnectAttempts(0);

			// Update state
			setSelectedThread(createdThread.thread_id);
			setThreads((prev) => [newThread, ...prev]);
			setMessages([
				{
					id: generateUUID(),
					role: "system",
					content: t("chat.newThreadStarted"),
					isStreaming: false,
				},
			]);

			console.log("✅ [DEBUG] New thread created with API, WebSocket will connect when user starts typing");
		} catch (error) {
			console.error("❌ [DEBUG] Failed to create thread via API:", error);
			// Fallback to local thread creation
			const newThreadId = generateUUID();
			const newThread: Thread = {
				id: newThreadId,
				trainer: selectedTrainer.id,
				trainerName: selectedTrainer.name,
				createdAt: new Date(),
			};

			if (ws) {
				ws.close();
				setWs(null);
			}

			setConnectionError(null);
			setReconnectAttempts(0);
			setSelectedThread(newThreadId);
			setThreads((prev) => [newThread, ...prev]);
			setMessages([
				{
					id: generateUUID(),
					role: "system",
					content: t("chat.newThreadStartedOffline"),
					isStreaming: false,
				},
			]);
		}
	}, [selectedTrainer.id, selectedTrainer.name, ws, t]);

	// Load messages for a specific thread
	const loadThreadMessages = async (threadId: string) => {
		console.log("💬 [DEBUG] Loading messages for thread:", threadId);

		// CRITICAL: Don't reload messages during active streaming/conversation
		// This prevents race conditions where we reload from DB before save completes
		if (isThreadChanging) {
			console.log("⚠️ [DEBUG] Skipping message load - thread change already in progress");
			return;
		}

		if (isAIResponding) {
			console.log("⚠️ [DEBUG] Skipping message load - AI is responding");
			return;
		}

		setIsThreadChanging(true);

		try {
			const response = await apiClient.getChatMessages(threadId);
			console.log("💬 [DEBUG] Thread messages response:", response);

			if (response.messages && response.messages.length > 0) {
				// Convert backend messages to local format with proper validation
				const loadedMessages: Message[] = response.messages
					.filter((msg) => msg && msg.content && msg.role) // Filter out invalid messages
					.map((msg) => ({
						id: generateUUID(), // Always generate new UUID for loaded messages
						role: msg.role as "user" | "assistant" | "system",
						content: msg.content,
						isStreaming: false,
					}));

				console.log("💬 [DEBUG] Loaded messages:", loadedMessages);
				console.log("💬 [DEBUG] Setting", loadedMessages.length, "messages");
				setMessages(loadedMessages);
			} else {
				console.log("💬 [DEBUG] No messages found for thread, starting with system message");
				setMessages([
					{
						id: generateUUID(),
						role: "system",
						content: t("chat.threadLoaded"),
						isStreaming: false,
					},
				]);
			}
		} catch (error) {
			console.error("Error loading thread messages:", error);
			setMessages([
				{
					id: generateUUID(),
					role: "system",
					content: t("chat.errorLoadingMessages"),
					isStreaming: false,
				},
			]);
		} finally {
			setIsThreadChanging(false);
		}
	};

	// Initialize WebSocket connection and load messages when thread changes
	useEffect(() => {
		if (selectedThread && !isInitialLoad) {
			console.log("🔄 [DEBUG] Thread changed, loading messages and connecting WebSocket");
			loadThreadMessages(selectedThread);

			// Disconnect existing WebSocket cleanly
			disconnectWebSocket();

			// Only connect if user has interacted
			if (hasUserInteracted) {
				connectWebSocket(selectedThread);
			}
		}

		return () => {
			console.log("🧹 [DEBUG] Cleaning up WebSocket connection on unmount");
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			// Only close WebSocket if component is actually unmounting
			// Don't close during re-renders or minor state changes
		};
		// CRITICAL: Only depend on selectedThread and isInitialLoad to prevent unnecessary reloads
		// connectWebSocket and disconnectWebSocket are intentionally called inside the effect
		// without being in dependencies to avoid triggering reloads when callbacks update
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedThread, isInitialLoad]);

	// Handle trainer change
	useEffect(() => {
		if (isInitialLoad || selectedTrainer.id === lastTrainerId || isThreadChanging) {
			return;
		}

		console.log("Trainer changed, creating new thread");
		setLastTrainerId(selectedTrainer.id);

		// Reset connection state
		setReconnectAttempts(0);
		setIsConnecting(false);
		setIsAIResponding(false);

		// Close WebSocket
		if (ws) {
			ws.close();
			setWs(null);
		}

		// Clear pending reconnect
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}

		// Create new thread
		createNewThread();
	}, [selectedTrainer.id, isInitialLoad, isThreadChanging, lastTrainerId, ws, createNewThread]);

	// Cleanup WebSocket connection on component unmount
	useEffect(() => {
		return () => {
			console.log("🧹 [DEBUG] Component unmounting - closing WebSocket");
			if (wsRef.current) {
				wsRef.current.close(1000, "Component unmount");
				wsRef.current = null;
			}
			// Clear all timeouts
			if (conversationTimeoutRef.current) {
				clearTimeout(conversationTimeoutRef.current);
				conversationTimeoutRef.current = null;
			}
			if (aiRespondingTimeoutRef.current) {
				clearTimeout(aiRespondingTimeoutRef.current);
				aiRespondingTimeoutRef.current = null;
			}
		};
	}, []); // Empty dependency array means this only runs on unmount


	const formatActionMessage = (message: Message): string => {
		try {
			const actionData = message.metadata || JSON.parse(message.content);

			switch (actionData.type) {
				case "workout_creation":
					// Use workout_name if available, otherwise fall back to translated sport type
					const workoutName = actionData.workout_name ||
						(actionData.workout_type ? getSportTranslation(actionData.workout_type, t) : t("training.training"));

					const creationParams: {name: string; id: string; date?: string} = {
						name: workoutName,
						id: actionData.id?.slice(0, 8) || "",
					};
					if (actionData.scheduled_date) {
						creationParams.date = new Date(actionData.scheduled_date).toLocaleDateString();
					}
					return t(actionData.scheduled_date ? "chat.actions.workoutCreatedWithDate" : "chat.actions.workoutCreated", creationParams);
				case "workout_modification":
				case "workout_scheduled_modification":
					return t("chat.actions.workoutModified");
				case "workout_deletion":
				case "workout_scheduled_deletion":
					return t("chat.actions.workoutDeleted");
				case "workouts_deleted_by_date":
					return t("chat.actions.workoutsDeletedByDate", {
						date: actionData.date || "",
						count: actionData.count || 0,
					});
				case "workouts_modified_by_date":
					return t("chat.actions.workoutsModifiedByDate", {
						date: actionData.date || "",
						count: actionData.deleted_count || 0,
					});
				default:
					// Fallback for unknown action types
					return actionData.type || t("chat.actions.actionPerformed");
			}
		} catch (e) {
			console.error("Failed to format action message:", e);
			return t("chat.actions.actionPerformed");
		}
	};

	const renderMessage = (message: Message, index: number) => {
		const isUser = message.role === "user";
		const safeContent = message.content || "";
		const messageKey = message.id || `${selectedThread}-${index}-${message.role}`;

		if (message.role === "system") {
			return (
				<View key={messageKey} style={{alignItems: "center", marginBottom: 16, paddingHorizontal: 16}}>
					<View
						style={{
							paddingHorizontal: 12,
							paddingVertical: 4,
							borderRadius: 12,
							backgroundColor: isDark ? "#333333" : "#f3f4f6",
						}}
					>
						<Text
							style={{
								fontSize: 12,
								textAlign: "center",
								color: isDark ? "#a1a1aa" : "#6b7280",
							}}
						>
							{safeContent}
						</Text>
					</View>
				</View>
			);
		}

		if (message.role === "action") {
			// Render action messages in the center - subtle and less prominent
			const handleActionPress = () => {
				try {
					const actionData = message.metadata || JSON.parse(message.content);
					if (actionData.type === "workout_creation" && actionData.scheduled_date) {
						// Extract date directly from ISO string to avoid timezone conversion
						const dateStr = actionData.scheduled_date.split("T")[0];
						router.push(`/calendar/${dateStr}` as any);
					}
				} catch (e) {
					console.error("Failed to handle action press:", e);
				}
			};

			const actionData = message.metadata || (message.content ? JSON.parse(message.content) : {});
			const isClickable = actionData.type === "workout_creation" && actionData.scheduled_date;

			return (
				<View key={messageKey} style={{alignItems: "center", marginBottom: 8, paddingHorizontal: 16}}>
					<TouchableOpacity
						onPress={isClickable ? handleActionPress : undefined}
						disabled={!isClickable}
						style={{
							flexDirection: "row",
							alignItems: "center",
							paddingHorizontal: 10,
							paddingVertical: 4,
							borderRadius: 12,
							backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
						}}
					>
						<IconSymbol
							name="checkmark.circle"
							size={14}
							color={isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)"}
							style={{marginRight: 6}}
						/>
						<Text
							style={{
								fontSize: 12,
								color: isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.5)",
								fontWeight: "400",
							}}
						>
							{formatActionMessage(message)}
						</Text>
						{isClickable && (
							<IconSymbol
								name="chevron.right"
								size={12}
								color={isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)"}
								style={{marginLeft: 4}}
							/>
						)}
					</TouchableOpacity>
				</View>
			);
		}

		// Simplified message rendering for iOS compatibility
		return (
			<View
				key={messageKey}
				style={{
					marginBottom: 12,
					paddingHorizontal: 16,
					alignItems: isUser ? "flex-end" : "flex-start",
				}}
			>
				<View
					style={{
						backgroundColor: isUser ? "#005287" : isDark ? "#1f1f23" : "#ffffff",
						borderWidth: isUser ? 0 : 1,
						borderColor: isUser ? "transparent" : isDark ? "#333333" : "#e5e7eb",
						borderRadius: 16,
						paddingHorizontal: 12,
						paddingVertical: 8,
						maxWidth: "75%",
						minHeight: 40,
					}}
				>
					{isUser ? (
						<Text
							style={{
								fontSize: 16,
								lineHeight: 20,
								color: "#ffffff",
							}}
						>
							{safeContent}
						</Text>
					) : (
						<Markdown
							style={{
								body: {
									fontSize: 16,
									lineHeight: 20,
									color: isDark ? "#ffffff" : "#000000",
									margin: 0,
									padding: 0,
								},
								paragraph: {
									marginTop: 0,
									marginBottom: 8,
									color: isDark ? "#ffffff" : "#000000",
								},
								strong: {
									fontWeight: "bold",
									color: isDark ? "#ffffff" : "#000000",
								},
								em: {
									fontStyle: "italic",
									color: isDark ? "#ffffff" : "#000000",
								},
								code_inline: {
									backgroundColor: isDark ? "#333333" : "#f3f4f6",
									color: isDark ? "#a1a1aa" : "#6b7280",
									paddingHorizontal: 4,
									paddingVertical: 2,
									borderRadius: 4,
									fontSize: 14,
								},
								code_block: {
									backgroundColor: isDark ? "#333333" : "#f3f4f6",
									color: isDark ? "#a1a1aa" : "#6b7280",
									padding: 8,
									borderRadius: 8,
									fontSize: 14,
									marginVertical: 4,
								},
								fence: {
									backgroundColor: isDark ? "#333333" : "#f3f4f6",
									color: isDark ? "#a1a1aa" : "#6b7280",
									padding: 8,
									borderRadius: 8,
									fontSize: 14,
									marginVertical: 4,
								},
								blockquote: {
									backgroundColor: isDark ? "#2a2a2a" : "#f9fafb",
									borderLeftWidth: 4,
									borderLeftColor: "#005287",
									paddingLeft: 12,
									paddingVertical: 8,
									marginVertical: 4,
								},
								list_item: {
									color: isDark ? "#ffffff" : "#000000",
									marginBottom: 4,
								},
							}}
						>
							{safeContent}
						</Markdown>
					)}
					{message.isStreaming && (
						<Text
							style={{
								fontSize: 12,
								marginTop: 4,
								color: isUser ? "#e5e7eb" : isDark ? "#a1a1aa" : "#71717a",
							}}
						>
							{t("chat.typing")}
						</Text>
					)}
				</View>
			</View>
		);
	};

	return (
		<KeyboardAvoidingView
			style={{flex: 1, backgroundColor: isDark ? "#000000" : "#ffffff"}}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			keyboardVerticalOffset={Platform.OS === "ios" ? -insets.bottom : 0}
		>
			{/* Header */}
			<View
				style={{
					paddingHorizontal: 16,
					paddingVertical: 12,
					borderBottomWidth: 1,
					backgroundColor: isDark ? "#1f1f23" : "#ffffff",
					borderBottomColor: isDark ? "#333333" : "#e5e7eb",
				}}
			>
				<View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
					<View style={{flexDirection: "row", alignItems: "center", flex: 1}}>
						<View style={{flexDirection: "row", alignItems: "center", flex: 1}}>
							<View
								style={{
									width: 32,
									height: 32,
									borderRadius: 16,
									marginRight: 12,
									overflow: "hidden",
								}}
							>
								<Image
									source={require("@/assets/images/pp_simon.png")}
									style={{
										width: 32,
										height: 32,
									}}
									resizeMode="cover"
								/>
							</View>
							<View style={{flex: 1}}>
								<Text
									style={{
										fontSize: 18,
										fontWeight: "600",
										color: isDark ? "#ffffff" : "#000000",
									}}
								>
									Simon
								</Text>
							</View>
						</View>
					</View>

					<View style={{flexDirection: "row", alignItems: "center"}}>
						{/* Connection Status Indicator */}
						<View
							style={{
								width: 8,
								height: 8,
								borderRadius: 4,
								marginRight: 12,
								backgroundColor:
									isConnected === WebSocketReadyState.OPEN
										? "#10b981" // green
										: isConnecting
											? "#f59e0b" // amber
											: connectionError
												? "#ef4444" // red
												: hasUserInteracted
													? "#6b7280"
													: "transparent", // gray or transparent
							}}
						/>

						
	
{/* 						<TouchableOpacity
							onPress={createNewThread}
							style={{
								padding: 8,
								borderRadius: 16,
								marginRight: 8,
								backgroundColor: isDark ? "#333333" : "#f3f4f6",
							}}
						>
							<IconSymbol name="plus" size={16} color={isDark ? "#a1a1aa" : "#71717a"} />
						</TouchableOpacity>

						<TouchableOpacity
							onPress={() => setIsThreadPickerVisible(true)}
							style={{
								padding: 8,
								borderRadius: 16,
								backgroundColor: isDark ? "#333333" : "#f3f4f6",
							}}
						>
							<IconSymbol name="text.alignleft" size={16} color={isDark ? "#a1a1aa" : "#71717a"} />
						</TouchableOpacity>  */}
						
						
						
					</View>
				</View>
			</View>

			{/* Messages */}
			<ScrollView
				ref={scrollViewRef}
				style={{flex: 1}}
				contentContainerStyle={{paddingBottom: 16}}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="interactive"
				onContentSizeChange={() => {
					setTimeout(() => {
						scrollViewRef.current?.scrollToEnd({animated: true});
					}, 100);
				}}
			>
				<View style={{paddingTop: 16}}>
					{messages.length > 0 ? (
						messages.map((message, index) => {
							if (!message || !message.content || !message.role) {
								return null;
							}
							return renderMessage(message, index);
						})
					) : (
						<View
							style={{
								paddingHorizontal: 16,
								paddingVertical: 32,
								alignItems: "center",
								justifyContent: "center",
								minHeight: 200,
							}}
						>
							<Text
								style={{
									fontSize: 16,
									color: isDark ? "#a1a1aa" : "#6b7280",
									textAlign: "center",
								}}
							>
								{t("chat.startConversation")}
							</Text>
						</View>
					)}
				</View>
			</ScrollView>

			{/* Status Display */}
			{(currentStatus || currentProgress) && (
				<View
					style={{
						paddingHorizontal: 16,
						paddingVertical: 8,
						borderTopWidth: 1,
						backgroundColor: isDark ? "rgba(51, 51, 51, 0.5)" : "rgba(243, 244, 246, 0.5)",
						borderTopColor: isDark ? "#333333" : "#e5e7eb",
					}}
				>
					<View style={{flexDirection: "row", alignItems: "center"}}>
						<View style={{marginRight: 8}}>
							<Spinner size="small" />
						</View>
						<View style={{flex: 1}}>
							{currentStatus && (
								<Text
									style={{
										fontSize: 14,
										fontWeight: "500",
										color: isDark ? "#ffffff" : "#000000",
									}}
								>
									{currentStatus}
								</Text>
							)}
							{currentProgress && (
								<Text
									style={{
										fontSize: 12,
										color: isDark ? "#a1a1aa" : "#6b7280",
									}}
								>
									{currentProgress}
								</Text>
							)}
						</View>
					</View>
				</View>
			)}

			{/* Input Area */}
			<View
				style={{
					paddingHorizontal: 16,
					paddingVertical: 12,
					borderTopWidth: 1,
					backgroundColor: isDark ? "#1f1f23" : "#ffffff",
					borderTopColor: isDark ? "#333333" : "#e5e7eb",
				}}
			>
				{/* Limit reached upgrade prompt - only shown on web, native uses paywall */}
				{messageLimitReached && Platform.OS === "web" && (
					<View
						style={{
							paddingBottom: 16,
							paddingHorizontal: 12,
							zIndex: 10,
						}}
						pointerEvents="box-none"
					>
						<View
							style={{
								backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
								borderRadius: 16,
								padding: 20,
								borderWidth: 1,
								borderColor: isDark ? "#333333" : "#e5e7eb",
								shadowColor: "#000000",
								shadowOffset: {width: 0, height: 2},
								shadowOpacity: 0.1,
								shadowRadius: 8,
								elevation: 4,
							}}
							pointerEvents="auto"
						>
							

							{/* Title */}
							<Text
								style={{
									fontSize: 18,
									fontWeight: "700",
									color: isDark ? "#ffffff" : "#000000",
									textAlign: "center",
									marginBottom: 8,
									letterSpacing: -0.5,
								}}
							>
								{t("chat.limitReachedTitle")}
							</Text>

							{/* Description */}
							<Text
								style={{
									fontSize: 14,
									color: isDark ? "#a1a1aa" : "#6b7280",
									textAlign: "center",
									marginBottom: 16,
									lineHeight: 20,
								}}
							>
								{t("chat.limitReached")}
							</Text>

							{/* Benefits List */}
							<View style={{marginBottom: 20, gap: 10}}>
								<View style={{flexDirection: "row", alignItems: "center"}}>
									<View
										style={{
											width: 20,
											height: 20,
											borderRadius: 10,
											backgroundColor: "rgba(34, 197, 94, 0.15)",
											alignItems: "center",
											justifyContent: "center",
											marginRight: 10,
										}}
									>
										<IconSymbol name="checkmark" size={12} color="#22c55e" />
									</View>
									<Text
										style={{
											fontSize: 14,
											color: isDark ? "#e5e7eb" : "#374151",
											flex: 1,
											fontWeight: "500",
										}}
									>
										{t("chat.proFeatureUnlimited")}
									</Text>
								</View>
																<View style={{flexDirection: "row", alignItems: "center"}}>
									<View
										style={{
											width: 20,
											height: 20,
											borderRadius: 10,
											backgroundColor: "rgba(34, 197, 94, 0.15)",
											alignItems: "center",
											justifyContent: "center",
											marginRight: 10,
										}}
									>
										<IconSymbol name="checkmark" size={12} color="#22c55e" />
									</View>
									<Text
										style={{
											fontSize: 14,
											color: isDark ? "#e5e7eb" : "#374151",
											flex: 1,
											fontWeight: "500",
										}}
									>
										{t("chat.proFeatureSupport")}
									</Text>
								</View>
								
								<View style={{flexDirection: "row", alignItems: "center"}}>
									<View
										style={{
											width: 20,
											height: 20,
											borderRadius: 10,
											backgroundColor: "rgba(34, 197, 94, 0.15)",
											alignItems: "center",
											justifyContent: "center",
											marginRight: 10,
										}}
									>
										<IconSymbol name="checkmark" size={12} color="#22c55e" />
									</View>
									<Text
										style={{
											fontSize: 14,
											color: isDark ? "#e5e7eb" : "#374151",
											flex: 1,
											fontWeight: "500",
										}}
									>
										{t("chat.proFeaturePriority")}
									</Text>
								</View>

							</View>

							{/* CTA Button */}
							<TouchableOpacity
								testID="upgrade-to-pro-button"
								accessibilityRole="button"
								accessibilityLabel="Upgrade to Pro"
								onPress={handleUpgradeToPro}
								disabled={isPurchasing}
								style={{
									backgroundColor: isPurchasing ? "rgba(40, 105, 147, 0.6)" : "#005287",
									paddingHorizontal: 24,
									paddingVertical: 14,
									borderRadius: 12,
									alignItems: "center",
									justifyContent: "center",
									shadowOpacity: 0.3,
									elevation: 6,
									zIndex: 20,
									minHeight: 50,
								}}
								activeOpacity={0.7}
								hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
							>
								{isPurchasing ? (
									<ActivityIndicator size="small" color="#ffffff" />
								) : (
									<Text
										style={{
											color: "#ffffff",
											fontSize: 16,
											fontWeight: "700",
											letterSpacing: 0.5,
										}}
									>
										{t("chat.upgradeToPro")}
									</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>
				)}

				<View
					style={{
						flexDirection: "row",
						alignItems: "flex-end",
						backgroundColor: isDark ? "#333333" : "#f3f4f6",
						borderRadius: 24,
						paddingHorizontal: 6,
						paddingVertical: 6,
						opacity: messageLimitReached ? 0.5 : 1,
					}}
				>
					<View style={{flex: 1, paddingHorizontal: 12, paddingVertical: 2}}>
						<TextInput
							placeholder={messageLimitReached ? t("chat.limitReached") : t("chat.typeMessage")}
							value={inputMessage}
							onChangeText={handleInputChange}
							onFocus={handleInputFocus}
							multiline={true}
							editable={!messageLimitReached}
							onContentSizeChange={(event) => {
								const newHeight = Math.max(36, Math.min(120, event.nativeEvent.contentSize.height));
								setInputHeight(newHeight);
							}}
							style={{
								height: inputHeight,
								color: isDark ? "#ffffff" : "#000000",
								fontSize: 16,
								lineHeight: 20,
								textAlignVertical: "top",
								paddingVertical: 8,
							}}
							placeholderTextColor={isDark ? "#a1a1aa" : "#71717a"}
						/>
					</View>
					<TouchableOpacity
						onPress={sendMessage}
						disabled={!inputMessage.trim() || isAIResponding || messageLimitReached}
						style={{
							width: 40,
							height: 40,
							borderRadius: 20,
							backgroundColor: !inputMessage.trim() || isAIResponding || messageLimitReached ? (isDark ? "#555555" : "#d1d5db") : "#005287",
							alignItems: "center",
							justifyContent: "center",
							marginLeft: 6,
							marginBottom: 2,
						}}
					>
						<IconSymbol
							name="paperplane.fill"
							size={16}
							color={!inputMessage.trim() || isAIResponding || messageLimitReached ? (isDark ? "#888888" : "#9ca3af") : "#ffffff"}
						/>
					</TouchableOpacity>
				</View>
			</View>

			{/* Connection Status - Only show when there's an actual error or when connecting */}
			{(connectionError || (isConnecting && hasUserInteracted)) && (
				<View
					style={{
						position: "absolute",
						top: 80,
						left: 16,
						right: 16,
						paddingHorizontal: 12,
						paddingVertical: 8,
						borderRadius: 8,
						backgroundColor: isDark ? "#1f1f23" : "#ffffff",
						borderWidth: 1,
						borderColor: connectionError ? "#ef4444" : "#f59e0b",
					}}
				>
					<Text
						style={{
							textAlign: "center",
							fontSize: 14,
							color: connectionError ? "#ef4444" : "#f59e0b",
						}}
					>
						{connectionError || t("chat.connecting")}
					</Text>
				</View>
			)}

			{/* Trainer Selection Modal */}
			<Modal visible={isTrainerSelectionVisible} transparent animationType="slide" onRequestClose={() => setIsTrainerSelectionVisible(false)}>
				<View style={{flex: 1, justifyContent: "flex-end"}}>
					<TouchableOpacity style={{flex: 1}} onPress={() => setIsTrainerSelectionVisible(false)} />
					<View
						style={{
							borderTopLeftRadius: 24,
							borderTopRightRadius: 24,
							padding: 24,
							paddingBottom: Math.max(insets.bottom, 24),
							maxHeight: 384,
							backgroundColor: isDark ? "#1f1f23" : "#ffffff",
						}}
					>
						<View style={{alignItems: "center", marginBottom: 16}}>
							<View
								style={{
									width: 48,
									height: 4,
									borderRadius: 2,
									backgroundColor: isDark ? "#333333" : "#f3f4f6",
								}}
							/>
						</View>
						<Text
							style={{
								fontSize: 20,
								fontWeight: "bold",
								marginBottom: 16,
								color: isDark ? "#ffffff" : "#000000",
							}}
						>
							{t("chat.selectTrainer")}
						</Text>
						<ScrollView showsVerticalScrollIndicator={false}>
							{TRAINERS.map((trainer) => (
								<TouchableOpacity
									key={trainer.id}
									onPress={() => {
										setSelectedTrainer(trainer);
										setIsTrainerSelectionVisible(false);
									}}
									style={{
										flexDirection: "row",
										alignItems: "center",
										paddingVertical: 12,
										paddingHorizontal: 16,
										borderRadius: 12,
										marginBottom: 8,
										backgroundColor:
											selectedTrainer.id === trainer.id
												? isDark
													? "rgba(40, 105, 147, 0.1)"
													: "rgba(40, 105, 147, 0.1)"
												: isDark
													? "#333333"
													: "#f3f4f6",
									}}
								>
									<View
										style={{
											width: 40,
											height: 40,
											borderRadius: 20,
											marginRight: 12,
											alignItems: "center",
											justifyContent: "center",
											backgroundColor: "#005287",
										}}
									>
										<Text style={{color: "#ffffff", fontWeight: "bold"}}>{trainer.name.charAt(0)}</Text>
									</View>
									<View style={{flex: 1}}>
										<Text
											style={{
												fontWeight: "600",
												fontSize: 16,
												color: isDark ? "#ffffff" : "#000000",
											}}
										>
											{trainer.name}
										</Text>
										<Text
											style={{
												fontSize: 14,
												color: isDark ? "#a1a1aa" : "#6b7280",
											}}
										>
											{trainer.description}
										</Text>
									</View>
								</TouchableOpacity>
							))}
						</ScrollView>
					</View>
				</View>
			</Modal>

			{/* Thread Picker Modal */}
			<Modal visible={isThreadPickerVisible} transparent animationType="slide" onRequestClose={() => setIsThreadPickerVisible(false)}>
				<View style={{flex: 1, justifyContent: "flex-end"}}>
					<TouchableOpacity style={{flex: 1}} onPress={() => setIsThreadPickerVisible(false)} />
					<View
						style={{
							borderTopLeftRadius: 24,
							borderTopRightRadius: 24,
							padding: 24,
							paddingBottom: Math.max(insets.bottom, 24),
							maxHeight: 384,
							backgroundColor: isDark ? "#1f1f23" : "#ffffff",
						}}
					>
						<View style={{alignItems: "center", marginBottom: 16}}>
							<View
								style={{
									width: 48,
									height: 4,
									borderRadius: 2,
									backgroundColor: isDark ? "#333333" : "#f3f4f6",
								}}
							/>
						</View>
						<Text
							style={{
								fontSize: 20,
								fontWeight: "bold",
								marginBottom: 16,
								color: isDark ? "#ffffff" : "#000000",
							}}
						>
							{t("chat.selectConversation")}
						</Text>
						<Text
							style={{
								fontSize: 14,
								color: isDark ? "#a1a1aa" : "#6b7280",
								marginBottom: 8,
							}}
						>
							{t(`chat.conversationsAvailable_${threads.length === 1 ? "one" : "other"}`, {count: threads.length})}
						</Text>
						<ScrollView showsVerticalScrollIndicator={false}>
							{threads.map((thread, index) => {
								// Calculate thread number: oldest thread is #1, newest has highest number
								// Since threads are sorted newest first, we reverse the numbering
								const threadNumber = threads.length - index;

								return (
									<View
										key={thread.id}
										style={{
											paddingVertical: 12,
											paddingHorizontal: 16,
											borderRadius: 12,
											marginBottom: 8,
											backgroundColor:
												selectedThread === thread.id
													? isDark
														? "rgba(40, 105, 147, 0.1)"
														: "rgba(40, 105, 147, 0.1)"
													: isDark
														? "#333333"
														: "#f3f4f6",
										}}
									>
					 					<TouchableOpacity
											onPress={() => {
							
												setSelectedThread(thread.id);
												setIsThreadPickerVisible(false);
											}}
											style={{flex: 1}}
										>
											<View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
												<View style={{flex: 1}}>
													<Text
														style={{
															fontWeight: "600",
															color: isDark ? "#ffffff" : "#000000",
														}}
													>
														{t(`chat.conversationNumber_${threadNumber === 1 ? "one" : "other"}`, {number: threadNumber})}
													</Text>
													<Text
														style={{
															fontSize: 12,
															color: isDark ? "#a1a1aa" : "#6b7280",
														}}
													>
														{thread.createdAt.toLocaleDateString("de-DE")}{" "}
														{thread.createdAt.toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"})}
														{selectedThread === thread.id ? " • " + t("chat.active") : ""}
													</Text>
													<Text
														style={{
															fontSize: 10,
															color: isDark ? "#71717a" : "#9ca3af",
															marginTop: 2,
														}}
													>
														{t("chat.trainer")}: {thread.trainerName}
													</Text>
												</View>
												{threads.length > 1 && (
													<TouchableOpacity
														onPress={async (e) => {
															e.stopPropagation();
															try {
																const confirmDelete = async () => {
																	await apiClient.deleteChatThread(thread.id);
																	setThreads((prev) => prev.filter((t) => t.id !== thread.id));
																	if (selectedThread === thread.id && threads.length > 1) {
																		const remainingThreads = threads.filter((t) => t.id !== thread.id);
																		setSelectedThread(remainingThreads[0].id);
																	}
																};
																confirmDelete();
															} catch (error) {
																console.error("Error deleting thread:", error);
															}
														}}
														style={{
															padding: 8,
															borderRadius: 8,
															backgroundColor: isDark ? "#555555" : "#e5e7eb",
															marginLeft: 8,
														}}
													>
														<IconSymbol name="trash" size={16} color={isDark ? "#ef4444" : "#dc2626"} />
													</TouchableOpacity>
												)}
											</View>
										</TouchableOpacity> 
									</View>
								);
							})}
						</ScrollView>
					</View>
				</View>
			</Modal>
		</KeyboardAvoidingView>
	);
}
