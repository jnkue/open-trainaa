import React, {useMemo} from "react";
import {View, StyleSheet} from "react-native";
import {MapContainer, TileLayer, Polyline} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Coordinate {
	lat: number;
	lon: number;
}

interface ActivityMapProps {
	coords: Coordinate[];
	height?: number;
	style?: any;
}

export default function ActivityMapLeaflet({coords, height = 250, style}: ActivityMapProps) {
	const mapCoords = useMemo(
		() =>
			coords
				.filter((c) => c.lat && c.lon)
				.map((c): [number, number] => [c.lat, c.lon]),
		[coords]
	);

	const bounds = useMemo(() => {
		if (mapCoords.length === 0) return null;
		const latLngBounds = L.latLngBounds(mapCoords);
		return latLngBounds.pad(0.1);
	}, [mapCoords]);

	if (mapCoords.length === 0 || !bounds) {
		return null;
	}

	return (
		<View style={[styles.container, {height}, style]}>
			<MapContainer
				bounds={bounds}
				scrollWheelZoom={true}
				style={{width: "100%", height: "100%", borderRadius: 12}}
				zoomControl={false}
				attributionControl={false}
			>
				<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
				<Polyline positions={mapCoords} pathOptions={{color: "#08c8ff", weight: 4}} />
			</MapContainer>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		overflow: "hidden",
		borderRadius: 12,
		backgroundColor: "#e5e5e5",
	},
});
