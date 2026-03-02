import React from "react";
import {useWindowDimensions} from "react-native";
import ChatInterface from "../../components/ChatInterface";
import {useAuth} from "../../contexts/AuthContext";

export default function ChatScreen() {
	const {user, session} = useAuth();
	const {width} = useWindowDimensions();
	const isLarge = width >= 768;

	if (isLarge) {
		return null;
	}

	if (!user || !session) {
		return null; // Auth context will handle redirect
	}

	return <ChatInterface userId={user.id} accessToken={session.access_token} />;
}
