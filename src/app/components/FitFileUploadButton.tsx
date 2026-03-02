import React from "react";
import {Pressable, Platform} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import {useTheme} from "@/contexts/ThemeContext";
import {useAuth} from "@/contexts/AuthContext";
import {showAlert} from "@/utils/alert";

interface FitFileUploadButtonProps {
	size?: number;
	onUploadSuccess?: () => void;
}

export function FitFileUploadButton({size = 20, onUploadSuccess}: FitFileUploadButtonProps) {
	const {isDark} = useTheme();
	const {session} = useAuth();
	const [isUploading, setIsUploading] = React.useState(false);

	const handleUpload = async () => {
		try {
			setIsUploading(true);

			// Pick a FIT file
			const pickerResult = await DocumentPicker.getDocumentAsync({
				type: ["*/*"], // Accept all file types since .fit might not be recognized
				copyToCacheDirectory: true,
			});

			if (pickerResult.canceled) {
				setIsUploading(false);
				return;
			}

			const file = pickerResult.assets[0];

			// Validate file extension
			if (!file.name.toLowerCase().endsWith(".fit")) {
				showAlert("Ungültiger Dateityp", "Bitte wählen Sie eine .fit Datei aus.");
				setIsUploading(false);
				return;
			}

			// Create FormData for upload
			const formData = new FormData();

			if (Platform.OS === "web") {
				// On web, we can use the file directly
				const fileResponse = await fetch(file.uri);
				const blob = await fileResponse.blob();
				const fileObject = new File([blob], file.name, {type: file.mimeType || "application/octet-stream"});
				formData.append("file", fileObject);
			} else {
				// On mobile (iOS/Android), use the URI directly
				// @ts-ignore - React Native's FormData accepts this format
				formData.append("file", {
					uri: file.uri,
					name: file.name,
					type: file.mimeType || "application/octet-stream",
				});
			}

			// Get backend URL from environment
			const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
			if (!BACKEND_BASE_URL) {
				throw new Error("Backend URL not configured");
			}

			// Upload the file directly using fetch
			const headers: Record<string, string> = {};
			if (session?.access_token) {
				headers["Authorization"] = `Bearer ${session.access_token}`;
			}

			console.log("Uploading FIT file:", file.name, "Size:", file.size);

			const uploadResponse = await fetch(`${BACKEND_BASE_URL}/v1/activities/upload-fit`, {
				method: "POST",
				headers,
				body: formData,
			});

			console.log("Upload response status:", uploadResponse.status);

			if (!uploadResponse.ok) {
				const errorText = await uploadResponse.text();
				console.error("Upload error:", uploadResponse.status, errorText);
				throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
			}

			const uploadResult = await uploadResponse.json();
			console.log("Upload successful:", uploadResult);

			showAlert("Erfolg", "FIT-Datei wurde erfolgreich hochgeladen!");
			onUploadSuccess?.();
		} catch (error) {
			console.error("Error uploading FIT file:", error);
			const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
			showAlert("Fehler", `Fehler beim Hochladen der FIT-Datei:\n${errorMessage}`);
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<Pressable
			onPress={handleUpload}
			disabled={isUploading}
			className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
			accessibilityRole="button"
			accessibilityLabel="FIT-Datei hochladen"
		>
			<Ionicons
				name={isUploading ? "hourglass-outline" : "cloud-upload-outline"}
				size={size}
				color={isDark ? "#ffffff" : "#000000"}
			/>
		</Pressable>
	);
}
