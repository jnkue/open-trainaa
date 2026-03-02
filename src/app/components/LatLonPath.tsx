import React, {useMemo} from "react";
import {View, ViewStyle} from "react-native";
import Svg, {Path, G, Circle} from "react-native-svg";
import {useTheme} from "@/contexts/ThemeContext";

/**
 * Enhanced React Native component that converts an array of { lat, lon }
 * coordinates into an SVG path representing a GPS route.
 *
 * Features:
 * - Proper GPS route visualization
 * - Start/End markers
 * - Route simplification for better performance
 * - Automatic bounds calculation and centering
 *
 * Props:
 *  - coords: Array<{ lat:number, lon:number }>
 *  - width, height: size of the SVG viewport (numbers)
 *  - stroke, strokeWidth, fill
 *  - padding: space in px to keep from the edges
 *  - showMarkers: show start/end markers
 *  - simplify: reduce points for better performance
 *
 * Usage example:
 *  <LatLonPath
 *    coords={[{lat:48.137154, lon:11.576124}, {lat:48.14, lon:11.58}]}
 *    width={360}
 *    height={240}
 *    stroke="blue"
 *    strokeWidth={2}
 *    showMarkers={true}
 *  />
 */

interface Coordinate {
	lat: number;
	lon: number;
}

interface MercatorPoint {
	x: number;
	y: number;
}

interface LatLonPathProps {
	coords: Coordinate[];
	width?: number;
	height?: number;
	padding?: number;
	stroke?: string;
	strokeWidth?: number;
	fill?: string;
	closePath?: boolean;
	showMarkers?: boolean;
	simplify?: boolean;
	style?: ViewStyle;
}

// Simplify route using Douglas-Peucker algorithm
function simplifyRoute(coords: Coordinate[], tolerance = 0.0001): Coordinate[] {
	if (coords.length <= 2) return coords;

	// Find the point with the maximum distance from line between start and end
	let maxDistance = 0;
	let maxIndex = 0;

	const start = coords[0];
	const end = coords[coords.length - 1];

	for (let i = 1; i < coords.length - 1; i++) {
		const distance = pointToLineDistance(coords[i], start, end);
		if (distance > maxDistance) {
			maxDistance = distance;
			maxIndex = i;
		}
	}

	// If max distance is greater than tolerance, recursively simplify
	if (maxDistance > tolerance) {
		const left = simplifyRoute(coords.slice(0, maxIndex + 1), tolerance);
		const right = simplifyRoute(coords.slice(maxIndex), tolerance);
		return [...left.slice(0, -1), ...right];
	}

	return [start, end];
}

// Calculate perpendicular distance from point to line
function pointToLineDistance(point: Coordinate, lineStart: Coordinate, lineEnd: Coordinate): number {
	const A = point.lat - lineStart.lat;
	const B = point.lon - lineStart.lon;
	const C = lineEnd.lat - lineStart.lat;
	const D = lineEnd.lon - lineStart.lon;

	const dot = A * C + B * D;
	const lenSq = C * C + D * D;

	if (lenSq === 0) return Math.sqrt(A * A + B * B);

	const param = dot / lenSq;
	let xx: number, yy: number;

	if (param < 0) {
		xx = lineStart.lat;
		yy = lineStart.lon;
	} else if (param > 1) {
		xx = lineEnd.lat;
		yy = lineEnd.lon;
	} else {
		xx = lineStart.lat + param * C;
		yy = lineStart.lon + param * D;
	}

	const dx = point.lat - xx;
	const dy = point.lon - yy;
	return Math.sqrt(dx * dx + dy * dy);
}

function lonLatToMercator(lon: number, lat: number): MercatorPoint {
	// Convert degrees -> WebMercator
	const x = (lon * Math.PI) / 180;
	const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
	return {x, y};
}

function normalizePoints(points: MercatorPoint[], width: number, height: number, padding: number = 8) {
	if (!points.length) return [];

	let minX = Infinity,
		maxX = -Infinity,
		minY = Infinity,
		maxY = -Infinity;

	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}

	// Handle degenerate case (all equal)
	if (minX === maxX) {
		minX -= 1e-6;
		maxX += 1e-6;
	}
	if (minY === maxY) {
		minY -= 1e-6;
		maxY += 1e-6;
	}

	const availableW = Math.max(0, width - padding * 2);
	const availableH = Math.max(0, height - padding * 2);

	// Preserve aspect ratio so lat/lon distortion doesn't stretch weirdly
	const scaleX = availableW / (maxX - minX);
	const scaleY = availableH / (maxY - minY);
	const scale = Math.min(scaleX, scaleY);

	const xOffset = padding + (availableW - (maxX - minX) * scale) / 2;
	const yOffset = padding + (availableH - (maxY - minY) * scale) / 2;

	// Note: SVG Y grows downward, but Mercator Y grows upward with latitude.
	// To match geographic north pointing up, we invert Y mapping.
	return points.map((p) => ({
		x: xOffset + (p.x - minX) * scale,
		y: yOffset + (maxY - p.y) * scale,
	}));
}

function pointsToPathString(points: {x: number; y: number}[], closePath: boolean = false): string {
	if (!points || points.length === 0) return "";

	const parts: string[] = [];
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		const cmd = i === 0 ? "M" : "L";
		parts.push(`${cmd}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
	}
	if (closePath) parts.push("Z");
	return parts.join(" ");
}

export default function LatLonPath({
	coords = [],
	width = 300,
	height = 200,
	padding = 8,
	stroke = "black",
	strokeWidth = 1,
	fill = "none",
	closePath = false,
	showMarkers = false,
	simplify = true,
	style,
}: LatLonPathProps) {
	const {colorScheme} = useTheme();
	// Process coordinates
	const processedCoords = useMemo(() => {
		if (!coords || coords.length === 0) return [];

		// Filter out invalid coordinates
		const validCoords = coords.filter(
			(coord) =>
				coord.lat !== null &&
				coord.lat !== undefined &&
				coord.lon !== null &&
				coord.lon !== undefined &&
				Math.abs(coord.lat) <= 90 &&
				Math.abs(coord.lon) <= 180
		);

		if (validCoords.length === 0) return [];

		// Simplify route if requested and we have enough points
		if (simplify && validCoords.length > 10) {
			return simplifyRoute(validCoords, 0.0001);
		}

		return validCoords;
	}, [coords, simplify]);

	// Convert lat/lon -> mercator points
	const mercatorPoints = useMemo(() => {
		return processedCoords.map(({lat, lon}) => lonLatToMercator(lon, lat));
	}, [processedCoords]);

	// Normalize to viewport
	const svgPoints = useMemo(() => normalizePoints(mercatorPoints, width, height, padding), [mercatorPoints, width, height, padding]);

	const pathData = useMemo(() => pointsToPathString(svgPoints, closePath), [svgPoints, closePath]);

	// If no valid points, return empty view
	if (!processedCoords.length || !svgPoints.length) {
		return <View style={[{width, height}, style]} />;
	}

	const startPoint = svgPoints[0];
	const endPoint = svgPoints[svgPoints.length - 1];

	return (
		<View style={style}>
			<Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
				<G>
					{/* Main route path */}
					<Path d={pathData} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />

					{/* Start and end markers */}
					{showMarkers && svgPoints.length > 1 && (
						<>
							{/* Start marker (green) */}
							<Circle cx={startPoint.x} cy={startPoint.y} r={strokeWidth + 1} fill={colorScheme === "dark" ? "white" : "black"} strokeWidth={1} />

							{/* End marker (red) - only if different from start */}
							{svgPoints.length > 1 && (
								<Circle cx={endPoint.x} cy={endPoint.y} r={strokeWidth + 1} fill={colorScheme === "dark" ? "white" : "black"} strokeWidth={1} />
							)}
						</>
					)}
				</G>
			</Svg>
		</View>
	);
}
