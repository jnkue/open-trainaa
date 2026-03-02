import React, {useEffect, useRef} from "react";
import {StyleSheet, View, Platform} from "react-native";
import MapView, {Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE} from "react-native-maps";
import {useTheme} from "@/contexts/ThemeContext";

interface Coordinate {
	lat: number;
	lon: number;
}

interface ActivityMapProps {
	coords: Coordinate[];
	height?: number;
	style?: any;
}

export default function ActivityMap({coords, height = 250, style}: ActivityMapProps) {
	const mapRef = useRef<MapView>(null);
	const {colorScheme} = useTheme();
	const isDark = colorScheme === "dark";

	const mapCoords = coords
		.filter((c) => c.lat && c.lon)
		.map((c) => ({
			latitude: c.lat,
			longitude: c.lon,
		}));

	useEffect(() => {
		if (mapRef.current && mapCoords.length > 0) {
			// Small timeout to ensure map is ready
			setTimeout(() => {
				mapRef.current?.fitToCoordinates(mapCoords, {
					edgePadding: {top: 50, right: 50, bottom: 50, left: 50},
					animated: false,
				});
			}, 100);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mapCoords.length]); // Only re-run if coords length changes significantly

	if (mapCoords.length === 0) {
		return null;
	}

	// Initial region centered on the first point
	const initialRegion = {
		latitude: mapCoords[0].latitude,
		longitude: mapCoords[0].longitude,
		latitudeDelta: 0.01,
		longitudeDelta: 0.01,
	};

	return (
		<View style={[styles.container, {height}, style]}>
			<MapView
				ref={mapRef}
				style={styles.map}
				provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
				initialRegion={initialRegion}
				scrollEnabled={true}
				zoomEnabled={true}
				pitchEnabled={false}
				rotateEnabled={false}
				userInterfaceStyle={isDark ? "dark" : "light"}
			>
				<Polyline
					coordinates={mapCoords}
					strokeColor="#08c8ff"
					strokeWidth={4}
					zIndex={1}
				/>
			</MapView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		overflow: "hidden",
		borderRadius: 12,
		backgroundColor: "#e5e5e5", // Placeholder color
	},
	map: {
		width: "100%",
		height: "100%",
	},
});
