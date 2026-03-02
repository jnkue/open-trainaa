import React, {Suspense, useEffect, useState} from "react";
import {View, StyleSheet, ActivityIndicator} from "react-native";

// Lazy load the Leaflet component so it's not imported on the server
const LeafletMap = React.lazy(() => import("./ActivityMapLeaflet.web"));

interface Coordinate {
	lat: number;
	lon: number;
}

interface ActivityMapProps {
	coords: Coordinate[];
	height?: number;
	style?: any;
}

export default function ActivityMap(props: ActivityMapProps) {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	if (!isClient) {
		return (
			<View style={[styles.container, {height: props.height || 250}, props.style]}>
				<ActivityIndicator />
			</View>
		);
	}

	return (
		<Suspense
			fallback={
				<View style={[styles.container, {height: props.height || 250}, props.style]}>
					<ActivityIndicator />
				</View>
			}
		>
			<LeafletMap {...props} />
		</Suspense>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		overflow: "hidden",
		borderRadius: 12,
		backgroundColor: "#e5e5e5",
		justifyContent: "center",
		alignItems: "center",
	},
});
