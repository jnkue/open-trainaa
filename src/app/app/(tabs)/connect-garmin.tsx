import React, {useEffect, useState} from "react";
import {View, Text, ActivityIndicator, TouchableOpacity} from "react-native";
import {useRouter} from "expo-router";
import * as Linking from "expo-linking";
import {SafeAreaView} from "react-native-safe-area-context";
import {apiClient} from "@/services/api";

export default function ConnectGarminScreen() {
	const router = useRouter();
	const [processing, setProcessing] = useState(true);
	const [message, setMessage] = useState<string | null>(null);
	const [isError, setIsError] = useState(false);
	const [athleteId, setAthleteId] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		async function handleInitialUrl() {
			try {
				const url = await Linking.getInitialURL();
				if (!mounted) return;
				if (!url) {
					setMessage("Keine Rückruf-URL empfangen");
					setProcessing(false);
					return;
				}

				// Parse query params
				const parsed = Linking.parse(url);
				const {queryParams} = parsed;
				const success = queryParams?.success;
				const error = queryParams?.error;
				const athlete_id = queryParams?.athlete_id;

				if (success === "garmin_connected") {
					setMessage("Garmin erfolgreich verbunden!");
					setAthleteId(athlete_id as string);

					// Verify connection by checking status
					try {
						const status = await apiClient.getGarminStatus();

						if (status.success) {
							setMessage("Garmin erfolgreich verbunden");
							setAthleteId((athlete_id as string) || status.data?.athlete_id || null);
						} else {
							setMessage("Verbindung empfangen, aber Status konnte nicht bestätigt werden");
							setIsError(true);
						}
					} catch (statusError) {
						console.error("Status check failed:", statusError);
						setMessage("Verbindung empfangen, aber Status-Überprüfung fehlgeschlagen");
						setIsError(true);
					}
				} else if (error) {
					setMessage(`Fehler bei der Verbindung zu Garmin: ${error}`);
					setIsError(true);
				} else {
					setMessage("Überprüfe Verbindung...");

					// Check status even without explicit success parameter
					try {
						const status = await apiClient.getGarminStatus();

						if (status.success) {
							setMessage("Garmin-Verbindung bestätigt");
							setAthleteId(status.data?.athlete_id || null);
						} else {
							setMessage("Callback empfangen, aber keine aktive Verbindung gefunden");
							setIsError(true);
						}
					} catch (statusError) {
						console.error("Status check failed:", statusError);
						setMessage("Callback empfangen, aber Status-Überprüfung fehlgeschlagen");
						setIsError(true);
					}
				}
			} catch (e) {
				setMessage("Fehler beim Verarbeiten der Rückruf-URL");
				setIsError(true);
				console.error(e);
			} finally {
				setProcessing(false);
			}
		}

		handleInitialUrl();

		return () => {
			mounted = false;
		};
	}, []);

	return (
		<View className="flex-1 bg-background">
			<SafeAreaView className="flex-1">
				<View className="flex-1 items-center justify-center px-6">
					{processing ? (
						<View className="items-center">
							<ActivityIndicator size="large" className="text-foreground mb-4" />
							<Text className="text-base text-muted-foreground text-center">Verarbeite Garmin-Verbindung...</Text>
						</View>
					) : (
						<View className="items-center max-w-md w-full">
							{/* Status */}
							<View className="mb-8">
								<Text className={`text-6xl text-center mb-4`}>{isError ? "✕" : "✓"}</Text>
								<Text className="text-2xl font-semibold text-foreground text-center mb-2">
									{isError ? "Verbindung fehlgeschlagen" : "Erfolgreich verbunden"}
								</Text>
								<Text className="text-base text-muted-foreground text-center">{message}</Text>
							</View>

							{/* Athlete ID */}
							{athleteId && !isError && (
								<View className="bg-muted rounded-lg px-4 py-3 mb-8 w-full">
									<Text className="text-sm text-muted-foreground text-center">
										Athlete ID: <Text className="text-foreground font-medium">{athleteId}</Text>
									</Text>
								</View>
							)}

							{/* Info */}
							{!isError && (
								<Text className="text-sm text-muted-foreground text-center mb-8">
									Deine Trainingsaktivitäten werden jetzt automatisch synchronisiert
								</Text>
							)}

							{/* Button */}
							<TouchableOpacity
								onPress={() => router.replace("/(tabs)/settings")}
								className="bg-foreground rounded-lg py-3 px-6 w-full"
								activeOpacity={0.8}
							>
								<Text className="text-background text-center font-medium">Zurück zu Einstellungen</Text>
							</TouchableOpacity>

							{isError && (
								<TouchableOpacity onPress={() => router.replace("/")} className="mt-4" activeOpacity={0.7}>
									<Text className="text-muted-foreground text-center text-sm">Zurück zur Startseite</Text>
								</TouchableOpacity>
							)}
						</View>
					)}
				</View>
			</SafeAreaView>
		</View>
	);
}
