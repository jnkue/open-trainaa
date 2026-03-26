import React from "react";
import {View} from "react-native";
import Svg, {Path, G, Circle, Text as SvgText, TSpan} from "react-native-svg";
import {useTheme} from "@/contexts/ThemeContext";
import {ActivityDetail, ActivityRecord} from "@/services/api";
import {formatVelocity} from "@/utils/formatters";

// Trainaa Logo SVG Component
const TrainaaLogo: React.FC<{color: string; x: number; y: number; scale?: number}> = ({color, x, y, scale = 1}) => {
	const baseWidth = 564;
	const baseHeight = 138;
	const width = baseWidth * scale;
	const height = baseHeight * scale;

	return (
		<G transform={`translate(${x - width / 2}, ${y - height / 2}) scale(${scale})`}>
			<Path
				d="M35.6868 53.1289L8.80078 53.1289L8.80078 33.5061L87.2004 33.5061L87.2004 53.1289L60.4365 53.1289L60.4365 121L35.6868 121L35.6868 53.1289ZM123.685 97.7456L110.196 97.7456L110.196 121L85.446 121L85.446 33.5061L125.424 33.5061C133.359 33.5061 140.235 34.8184 146.054 37.4429C151.893 40.0674 156.389 43.821 159.543 48.7039C162.717 53.5663 164.303 59.2935 164.303 65.8853C164.303 72.2126 162.818 77.7363 159.848 82.4563C156.898 87.156 152.676 90.8385 147.183 93.5037L166.073 121L139.554 121L123.685 97.7456ZM139.31 65.8853C139.31 61.7959 138.018 58.6322 135.434 56.3943C132.85 54.136 129.015 53.0068 123.929 53.0068L110.196 53.0068L110.196 78.6111L123.929 78.6111C129.015 78.6111 132.85 77.5125 135.434 75.3152C138.018 73.0976 139.31 69.9543 139.31 65.8853ZM225.57 104.002L188.552 104.002L181.686 121L156.448 121L195.053 33.5061L219.436 33.5061L258.194 121L232.437 121L225.57 104.002ZM218.307 85.7522L207.077 57.7371L195.816 85.7522L218.307 85.7522ZM254.196 33.5061L278.946 33.5061L278.946 121L254.196 121L254.196 33.5061ZM368.823 33.5061L368.823 121L348.437 121L309.802 74.3691L309.802 121L285.571 121L285.571 33.5061L305.926 33.5061L344.562 80.137L344.562 33.5061L368.823 33.5061ZM433.945 104.002L396.927 104.002L390.061 121L364.823 121L403.428 33.5061L427.811 33.5061L466.569 121L440.812 121L433.945 104.002ZM426.682 85.7522L415.452 57.7371L404.191 85.7522L426.682 85.7522ZM524.82 104.002L487.802 104.002L480.936 121L455.698 121L494.303 33.5061L518.686 33.5061L557.444 121L531.687 121L524.82 104.002ZM517.557 85.7522L506.327 57.7371L495.066 85.7522L517.557 85.7522Z"
				fill={color}
				fillRule="nonzero"
			/>
		</G>
	);
};

/**
 * SocialMediaOverlay Component
 *
 * Generates Instagram story overlays (1080x1920) with transparent backgrounds
 * Templates:
 * 1. Route map + trainaa logo
 * 2. Route map + stats + trainaa logo
 * 3. Feedback + trainaa logo
 * 4. Heart rate graph + trainaa logo
 * 5. Elevation profile + trainaa logo
 */

interface Coordinate {
	lat: number;
	lon: number;
}

interface MercatorPoint {
	x: number;
	y: number;
}

interface SocialMediaOverlayProps {
	activity: ActivityDetail;
	records?: ActivityRecord[];
	feedback?: string | null;
	template: "route" | "stats" | "feedback" | "heartrate" | "elevation" | "power";
	customColor?: string;
}

// Constants for Instagram Story dimensions
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const PADDING = 80;

// Convert lat/lon to Web Mercator projection
function lonLatToMercator(lon: number, lat: number): MercatorPoint {
	const x = (lon * Math.PI) / 180;
	const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
	return {x, y};
}

// Normalize points to fit within bounds
function normalizePoints(points: MercatorPoint[], width: number, height: number, padding: number = PADDING): MercatorPoint[] {
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

	const scaleX = availableW / (maxX - minX);
	const scaleY = availableH / (maxY - minY);
	const scale = Math.min(scaleX, scaleY);

	const xOffset = padding + (availableW - (maxX - minX) * scale) / 2;
	const yOffset = padding + (availableH - (maxY - minY) * scale) / 2;

	return points.map((p) => ({
		x: xOffset + (p.x - minX) * scale,
		y: yOffset + (maxY - p.y) * scale,
	}));
}

// Generate SVG path from points
function pointsToPath(points: MercatorPoint[]): string {
	if (!points || points.length === 0) return "";

	const parts: string[] = [];
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		const cmd = i === 0 ? "M" : "L";
		parts.push(`${cmd}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
	}
	return parts.join(" ");
}

// Downsample data points to reduce SVG path complexity
// Uses Largest Triangle Three Buckets (LTTB) algorithm for smart downsampling
function downsampleData(data: {time: number; value: number}[], targetPoints: number = 500): {time: number; value: number}[] {
	if (data.length <= targetPoints) {
		return data;
	}

	const bucketSize = (data.length - 2) / (targetPoints - 2);
	const sampled: {time: number; value: number}[] = [data[0]]; // Always include first point

	for (let i = 0; i < targetPoints - 2; i++) {
		const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
		const avgRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length);
		const avgRangeLength = avgRangeEnd - avgRangeStart;

		let avgX = 0;
		let avgY = 0;

		for (let j = avgRangeStart; j < avgRangeEnd; j++) {
			avgX += data[j].time;
			avgY += data[j].value;
		}
		avgX /= avgRangeLength;
		avgY /= avgRangeLength;

		const rangeStart = Math.floor(i * bucketSize) + 1;
		const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length);

		const pointA = sampled[sampled.length - 1];
		let maxArea = -1;
		let maxAreaPoint = data[rangeStart];

		for (let j = rangeStart; j < rangeEnd; j++) {
			const area = Math.abs(
				(pointA.time - avgX) * (data[j].value - pointA.value) -
				(pointA.time - data[j].time) * (avgY - pointA.value)
			) * 0.5;

			if (area > maxArea) {
				maxArea = area;
				maxAreaPoint = data[j];
			}
		}

		sampled.push(maxAreaPoint);
	}

	sampled.push(data[data.length - 1]); // Always include last point
	return sampled;
}

// Generate smooth SVG path using cubic bezier curves (Catmull-Rom spline)
function pointsToSmoothPath(points: MercatorPoint[]): string {
	if (!points || points.length === 0) return "";
	if (points.length === 1) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
	if (points.length === 2) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;

	const parts: string[] = [`M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];

	for (let i = 0; i < points.length - 1; i++) {
		const p0 = i > 0 ? points[i - 1] : points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = i < points.length - 2 ? points[i + 2] : p2;

		// Catmull-Rom to Bezier conversion
		const cp1x = p1.x + (p2.x - p0.x) / 6;
		const cp1y = p1.y + (p2.y - p0.y) / 6;
		const cp2x = p2.x - (p3.x - p1.x) / 6;
		const cp2y = p2.y - (p3.y - p1.y) / 6;

		parts.push(`C${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
	}

	return parts.join(" ");
}

// Simplify route using Douglas-Peucker algorithm
function simplifyRoute(coords: Coordinate[], tolerance = 0.0001): Coordinate[] {
	if (coords.length <= 2) return coords;

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

	if (maxDistance > tolerance) {
		const left = simplifyRoute(coords.slice(0, maxIndex + 1), tolerance);
		const right = simplifyRoute(coords.slice(maxIndex), tolerance);
		return [...left.slice(0, -1), ...right];
	}

	return [start, end];
}

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

export const SocialMediaOverlay: React.FC<SocialMediaOverlayProps> = ({activity, records, feedback, template, customColor}) => {
	const {colorScheme} = useTheme();

	// Helper function to get default color based on template
	const getDefaultColor = (): string => {
		switch (template) {
			case "route":
			case "stats":
				return "#08c8ff";
			case "heartrate":
				return "#ef4444";
			case "elevation":
				return "#8b5cf6";
			case "power":
				return "#f59e0b";
			default:
				return "#08c8ff";
		}
	};

	// Use custom color if provided, otherwise use default (applies to both graph and logo dot)
	const color = customColor || getDefaultColor();
	const graphColor = color;

	// Process GPS coordinates
	const processGPSCoords = (): Coordinate[] => {
		if (!records || records.length === 0) return [];

		const coords = records
			.filter((r) => r.latitude && r.longitude && r.latitude !== 0 && r.longitude !== 0)
			.map((r) => ({lat: r.latitude!, lon: r.longitude!}));

		return simplifyRoute(coords, 0.0001);
	};

	// Process heart rate data
	const processHeartRateData = (): {time: number; value: number}[] => {
		if (!records || records.length === 0) {
			return [];
		}

		const hrData = records
			.filter((r) => r.heart_rate && r.heart_rate > 30)
			.map((r, index) => ({
				time: index,
				value: r.heart_rate!,
			}));

		// Downsample to reduce path complexity for iOS
		return downsampleData(hrData, 300);
	};

	// Process elevation data
	const processElevationData = (): {time: number; value: number}[] => {
		if (!records || records.length === 0) {
			return [];
		}

		const elevData = records
			.filter((r) => r.altitude !== null && r.altitude !== undefined)
			.map((r, index) => ({
				time: index,
				value: r.altitude!,
			}));

		// Downsample to reduce path complexity for iOS
		return downsampleData(elevData, 300);
	};

	// Process power data
	const processPowerData = (): {time: number; value: number}[] => {
		if (!records || records.length === 0) {
			return [];
		}

		const powerData = records
			.filter((r) => r.power !== null && r.power !== undefined && r.power > 0)
			.map((r, index) => ({
				time: index,
				value: r.power!,
			}));

		// Downsample to reduce path complexity for iOS
		return downsampleData(powerData, 300);
	};

	// Format stats
	const distance = activity.distance ? (activity.distance / 1000).toFixed(2) : "0";
	const duration = activity.duration ? Math.floor(activity.duration / 60) : 0;
	const velocity = formatVelocity(activity.average_speed, activity.activity_type || "Run");
	// Format velocity display: pace (e.g., "5:42/km") has no space, speed (e.g., "29.9 km/h") has space
	const velocityDisplay = velocity.unit.startsWith("/")
		? `${velocity.value}${velocity.unit}`
		: `${velocity.value} ${velocity.unit}`;
	const hr = activity.average_heartrate ? Math.round(activity.average_heartrate) : 0;
	const elevation = activity.elevation_gain ? Math.round(activity.elevation_gain) : 0;

	const textColor = colorScheme === "dark" ? "#ffffff" : "#000000";

	// Render route map overlay
	const renderRouteOverlay = () => {
		const coords = processGPSCoords();
		if (coords.length === 0) return null;

		const topOffset = activity.device_name ? 200 : PADDING; // Extra space if device name exists
		const mapHeight = activity.device_name ? 1600 : 1700; // Reduce height if device name exists

		const mercatorPoints = coords.map(({lat, lon}) => lonLatToMercator(lon, lat));
		// Use custom normalize with adjusted top offset
		const normalizedPoints = normalizePoints(mercatorPoints, STORY_WIDTH, mapHeight, PADDING).map(p => ({
			x: p.x,
			y: p.y + (topOffset - PADDING) // Shift map down
		}));
		const pathData = pointsToPath(normalizedPoints);

		return (
			<G>
				{/* Device name at top */}
				{activity.device_name && (
					<SvgText x={STORY_WIDTH / 2} y={140} fontSize="32" fill={textColor} opacity={0.7} textAnchor="middle" fontWeight="500">
						{activity.device_name}
					</SvgText>
				)}

				{/* Route path with shadow */}
				<Path d={pathData} stroke="rgba(0,0,0,0.15)" strokeWidth={18} fill="none" strokeLinecap="round" strokeLinejoin="round" />
				<Path d={pathData} stroke={graphColor} strokeWidth={16} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Start marker with glow */}
				{normalizedPoints.length > 0 && (
					<>
						<Circle cx={normalizedPoints[0].x} cy={normalizedPoints[0].y} r={22} fill={graphColor} opacity={0.25} />
						<Circle cx={normalizedPoints[0].x} cy={normalizedPoints[0].y} r={14} fill={textColor} />
					</>
				)}

				{/* End marker with glow */}
				{normalizedPoints.length > 1 && (
					<>
						<Circle
							cx={normalizedPoints[normalizedPoints.length - 1].x}
							cy={normalizedPoints[normalizedPoints.length - 1].y}
							r={22}
							fill={graphColor}
							opacity={0.25}
						/>
						<Circle
							cx={normalizedPoints[normalizedPoints.length - 1].x}
							cy={normalizedPoints[normalizedPoints.length - 1].y}
							r={14}
							fill={textColor}
						/>
					</>
				)}

				{/* Logo positioned closer */}
				<TrainaaLogo color={textColor} x={STORY_WIDTH / 2} y={STORY_HEIGHT - 120} scale={0.9} />

			</G>
		);
	};

	// Render stats overlay
	const renderStatsOverlay = () => {
		const coords = processGPSCoords();
		if (coords.length === 0) return null;

		const topOffset = activity.device_name ? 200 : PADDING; // Extra space if device name exists
		const mapHeight = activity.device_name ? 1200 : 1300; // Reduce height if device name exists

		const mercatorPoints = coords.map(({lat, lon}) => lonLatToMercator(lon, lat));
		// Use custom normalize with adjusted top offset
		const normalizedPoints = normalizePoints(mercatorPoints, STORY_WIDTH, mapHeight, PADDING).map(p => ({
			x: p.x,
			y: p.y + (topOffset - PADDING) // Shift map down
		}));
		const pathData = pointsToPath(normalizedPoints);

		return (
			<G>
				{/* Device name at top */}
				{activity.device_name && (
					<SvgText x={STORY_WIDTH / 2} y={140} fontSize="32" fill={textColor} opacity={0.7} textAnchor="middle" fontWeight="500">
						{activity.device_name}
					</SvgText>
				)}

				{/* Route path with shadow */}
				<Path d={pathData} stroke="rgba(0,0,0,0.15)" strokeWidth={16} fill="none" strokeLinecap="round" strokeLinejoin="round" />
				<Path d={pathData} stroke={graphColor} strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Stats box with better typography */}
				<G>
					<SvgText x={STORY_WIDTH / 2} y={1400} fontSize="52" fill={textColor} fontWeight="700" textAnchor="middle">
						<TSpan x={STORY_WIDTH / 2} dy="0">
							{String(distance) + " km"}
						</TSpan>
					</SvgText>
					<SvgText x={STORY_WIDTH / 2} y={1450} fontSize="32" fill={textColor} opacity={0.8} textAnchor="middle">
						<TSpan x={STORY_WIDTH / 2} dy="0">
							DISTANCE
						</TSpan>
					</SvgText>

					<SvgText x={STORY_WIDTH / 2} y={1600} fontSize="38" fill={textColor} fontWeight="600" textAnchor="middle">
						<TSpan x={STORY_WIDTH / 2} dy="0">
							{String(duration) + " min" }
						</TSpan>
					</SvgText>

					<SvgText x={STORY_WIDTH / 2} y={1535} fontSize="38" fill={textColor} fontWeight="600" textAnchor="middle">
						<TSpan x={STORY_WIDTH / 2} dy="0">
							{velocityDisplay}
						</TSpan>
					</SvgText>

					{(hr > 0 || elevation > 0) && (
						<SvgText x={STORY_WIDTH / 2} y={1670} fontSize="38" fill={textColor} fontWeight="500" textAnchor="middle">
							<TSpan x={STORY_WIDTH / 2} dy="0">
								{elevation > 0 && `${elevation}m ↑`}
							</TSpan>
						</SvgText>
					)}
				</G>

				{/* Logo positioned closer */}
				<TrainaaLogo color={textColor} x={STORY_WIDTH / 2} y={STORY_HEIGHT - 120} scale={0.9} />

			</G>
		);
	};

	// Render feedback overlay
	const renderFeedbackOverlay = () => {
		if (!feedback) return null;

		const maxCharsPerLine = 35;
		const words = feedback.split(" ");
		const lines: string[] = [];
		let currentLine = "";

		for (const word of words) {
			if ((currentLine + " " + word).length > maxCharsPerLine) {
				lines.push(currentLine);
				currentLine = word;
			} else {
				currentLine = currentLine ? currentLine + " " + word : word;
			}
		}
		if (currentLine) lines.push(currentLine);

		const contentHeight = lines.length * 70 + 200;

		return (
			<G>
				{/* Device name at top */}
				{activity.device_name && (
					<SvgText x={STORY_WIDTH / 2} y={140} fontSize="32" fill={textColor} opacity={0.7} textAnchor="middle" fontWeight="500">
						{activity.device_name}
					</SvgText>
				)}

				{/* Title */}
				{/* 		<SvgText x={STORY_WIDTH / 2} y={250} fontSize="40" fill={textColor} fontWeight="700" textAnchor="middle" opacity={0.5}>
					AI FEEDBACK
				</SvgText> */}

				{/* Feedback text with better line height */}
				<SvgText x={STORY_WIDTH / 2} y={580} fontSize="36" fill={textColor} fontWeight="400" textAnchor="middle">
					{lines.map((line, index) => (
						<TSpan key={index} x={STORY_WIDTH / 2} dy={index === 0 ? 0 : 70}>
							{line}
						</TSpan>
					))}
				</SvgText>

				{/* Logo positioned dynamically based on content */}
				<TrainaaLogo color={textColor} x={STORY_WIDTH / 2} y={Math.max(contentHeight + 200, STORY_HEIGHT - 120)} scale={0.9} />

			</G>
		);
	};

	// Render heart rate graph overlay
	const renderHeartRateOverlay = () => {
		const hrData = processHeartRateData();
		if (hrData.length === 0) {
			return null;
		}

		// Normalize HR data with padding to prevent overstretching
		const minHR = Math.min(...hrData.map((d) => d.value));
		const maxHR = Math.max(...hrData.map((d) => d.value));
		const range = maxHR - minHR;
		const padding = Math.max(range * 0.2, 10); // 20% padding or minimum 10 bpm
		const displayMinHR = minHR - padding;
		const displayMaxHR = maxHR + padding;
		const graphWidth = STORY_WIDTH - PADDING * 2;
		const graphHeight = 600;
		const graphTop = 550;

		const normalizedData = hrData.map((d, index) => {
			const x = PADDING + (hrData.length === 1 ? graphWidth / 2 : (index / (hrData.length - 1)) * graphWidth);
			const y = graphTop + graphHeight - ((d.value - displayMinHR) / (displayMaxHR - displayMinHR)) * graphHeight;
			return {x, y};
		});

		const pathData = pointsToSmoothPath(normalizedData);

		// Create gradient fill area path
		const areaPath = pathData + ` L${PADDING + graphWidth},${graphTop + graphHeight} L${PADDING},${graphTop + graphHeight} Z`;

		return (
			<G>
				{/* Device name at top */}
				{activity.device_name && (
					<SvgText x={STORY_WIDTH / 2} y={140} fontSize="32" fill={textColor} opacity={0.7} textAnchor="middle" fontWeight="500">
						{activity.device_name}
					</SvgText>
				)}

				{/* Title */}
				{/* 	<SvgText x={STORY_WIDTH / 2} y={600} fontSize="50" fontWeight="700" fill={textColor} textAnchor="middle">
					HEART RATE
				</SvgText> */}

				{/* Grid lines */}
				<Path d={`M${PADDING},${graphTop} L${STORY_WIDTH - PADDING},${graphTop}`} stroke={textColor} strokeWidth={1} opacity={0.1} />
				<Path
					d={`M${PADDING},${graphTop + graphHeight / 2} L${STORY_WIDTH - PADDING},${graphTop + graphHeight / 2}`}
					stroke={textColor}
					strokeWidth={1}
					opacity={0.1}
				/>
				<Path
					d={`M${PADDING},${graphTop + graphHeight} L${STORY_WIDTH - PADDING},${graphTop + graphHeight}`}
					stroke={textColor}
					strokeWidth={1}
					opacity={0.1}
				/>

				{/* Area fill with gradient effect */}
				<Path d={areaPath} fill={graphColor} opacity={0.15} />

				{/* Graph shadow */}
				<Path d={pathData} stroke="rgba(0,0,0,0.15)" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Main graph line */}
				<Path d={pathData} stroke={graphColor} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Stats box */}
				<G>
					<SvgText x={STORY_WIDTH / 2} y={1450} fontSize="52" fill={textColor} fontWeight="700" textAnchor="middle">
						{Math.round(activity.average_heartrate || 0)}
					</SvgText>
					<SvgText x={STORY_WIDTH / 2} y={1490} fontSize="28" fill={textColor} opacity={0.6} textAnchor="middle">
						AVG BPM
					</SvgText>

					<SvgText x={STORY_WIDTH / 2} y={1585} fontSize="42" fill={textColor} fontWeight="500" textAnchor="middle">
						{`Max: ${Math.round(activity.max_heartrate || 0)} bpm`}
					</SvgText>
				</G>

				{/* Logo */}
				<TrainaaLogo color={textColor} x={STORY_WIDTH / 2} y={STORY_HEIGHT - 120} scale={0.9} />

			</G>
		);
	};

	// Render elevation profile overlay
	const renderElevationOverlay = () => {
		const elevationData = processElevationData();
		if (elevationData.length === 0) {
			return null;
		}

		// Normalize elevation data with padding to prevent overstretching
		const minElev = Math.min(...elevationData.map((d) => d.value));
		const maxElev = Math.max(...elevationData.map((d) => d.value));
		const range = maxElev - minElev;
		const padding = Math.max(range * 0.15, 5); // 15% padding or minimum 5m
		const displayMinElev = minElev - padding;
		const displayMaxElev = maxElev + padding;
		const graphWidth = STORY_WIDTH - PADDING * 2;
		const graphHeight = 600;
		const graphTop = 550;

		const normalizedData = elevationData.map((d, index) => {
			const x = PADDING + (elevationData.length === 1 ? graphWidth / 2 : (index / (elevationData.length - 1)) * graphWidth);
			const y = graphTop + graphHeight - ((d.value - displayMinElev) / (displayMaxElev - displayMinElev)) * graphHeight;
			return {x, y};
		});

		const pathData = pointsToPath(normalizedData);

		// Create area fill path
		const areaPath = pathData + ` L${PADDING + graphWidth},${graphTop + graphHeight} L${PADDING},${graphTop + graphHeight} Z`;

		return (
			<G>
				{/* Device name at top */}
				{activity.device_name && (
					<SvgText x={STORY_WIDTH / 2} y={140} fontSize="32" fill={textColor} opacity={0.7} textAnchor="middle" fontWeight="500">
						{activity.device_name}
					</SvgText>
				)}

				{/* Title */}
				{/* 			<SvgText x={STORY_WIDTH / 2} y={600} fontSize="50" fontWeight="700" fill={textColor} textAnchor="middle">
					ELEVATION
				</SvgText> */}

				{/* Grid lines */}
				<Path d={`M${PADDING},${graphTop} L${STORY_WIDTH - PADDING},${graphTop}`} stroke={textColor} strokeWidth={1} opacity={0.1} />
				<Path
					d={`M${PADDING},${graphTop + graphHeight / 2} L${STORY_WIDTH - PADDING},${graphTop + graphHeight / 2}`}
					stroke={textColor}
					strokeWidth={1}
					opacity={0.1}
				/>
				<Path
					d={`M${PADDING},${graphTop + graphHeight} L${STORY_WIDTH - PADDING},${graphTop + graphHeight}`}
					stroke={textColor}
					strokeWidth={1}
					opacity={0.1}
				/>

				{/* Area fill */}
				<Path d={areaPath} fill={graphColor} opacity={0.15} />

				{/* Graph shadow */}
				<Path d={pathData} stroke="rgba(0,0,0,0.15)" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Main graph line */}
				<Path d={pathData} stroke={graphColor} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Stats box */}
				<G>
					<SvgText x={STORY_WIDTH / 2} y={1450} fontSize="52" fill={textColor} fontWeight="700" textAnchor="middle">
						{`${Math.round(activity.elevation_gain || 0)}m`}
					</SvgText>
					<SvgText x={STORY_WIDTH / 2} y={1490} fontSize="28" fill={textColor} opacity={0.6} textAnchor="middle">
						ELEVATION GAIN
					</SvgText>

					<SvgText x={STORY_WIDTH / 2} y={1585} fontSize="42" fill={textColor} fontWeight="500" textAnchor="middle">
						{`Range: ${Math.round(maxElev - minElev)}m`}
					</SvgText>
				</G>

				{/* Logo */}
				<TrainaaLogo color={textColor} x={STORY_WIDTH / 2} y={STORY_HEIGHT - 120} scale={0.9} />

			</G>
		);
	};

	// Render power/watts overlay
	const renderPowerOverlay = () => {
		const powerData = processPowerData();
		if (powerData.length === 0) {
			return null;
		}

		// Normalize power data with padding to prevent overstretching
		const minPower = Math.min(...powerData.map((d) => d.value));
		const maxPower = Math.max(...powerData.map((d) => d.value));
		const avgPower = powerData.reduce((sum, d) => sum + d.value, 0) / powerData.length;
		const range = maxPower - minPower;
		const padding = Math.max(range * 0.2, 20); // 20% padding or minimum 20W
		const displayMinPower = Math.max(0, minPower - padding); // Don't go below 0 watts
		const displayMaxPower = maxPower + padding;
		const graphWidth = STORY_WIDTH - PADDING * 2;
		const graphHeight = 600;
		const graphTop = 550;

		const normalizedData = powerData.map((d, index) => {
			const x = PADDING + (powerData.length === 1 ? graphWidth / 2 : (index / (powerData.length - 1)) * graphWidth);
			const y = graphTop + graphHeight - ((d.value - displayMinPower) / (displayMaxPower - displayMinPower)) * graphHeight;
			return {x, y};
		});

		const pathData = pointsToSmoothPath(normalizedData);

		// Create area fill path
		const areaPath = pathData + ` L${PADDING + graphWidth},${graphTop + graphHeight} L${PADDING},${graphTop + graphHeight} Z`;

		return (
			<G>
				{/* Device name at top */}
				{activity.device_name && (
					<SvgText x={STORY_WIDTH / 2} y={140} fontSize="32" fill={textColor} opacity={0.7} textAnchor="middle" fontWeight="500">
						{activity.device_name}
					</SvgText>
				)}

				{/* Title */}
				{/* 			<SvgText x={STORY_WIDTH / 2} y={600} fontSize="50" fontWeight="700" fill={textColor} textAnchor="middle">
					POWER
				</SvgText> */}

				{/* Grid lines */}
				<Path d={`M${PADDING},${graphTop} L${STORY_WIDTH - PADDING},${graphTop}`} stroke={textColor} strokeWidth={1} opacity={0.1} />
				<Path
					d={`M${PADDING},${graphTop + graphHeight / 2} L${STORY_WIDTH - PADDING},${graphTop + graphHeight / 2}`}
					stroke={textColor}
					strokeWidth={1}
					opacity={0.1}
				/>
				<Path
					d={`M${PADDING},${graphTop + graphHeight} L${STORY_WIDTH - PADDING},${graphTop + graphHeight}`}
					stroke={textColor}
					strokeWidth={1}
					opacity={0.1}
				/>

				{/* Area fill */}
				<Path d={areaPath} fill={graphColor} opacity={0.15} />

				{/* Graph shadow */}
				<Path d={pathData} stroke="rgba(0,0,0,0.15)" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Main graph line */}
				<Path d={pathData} stroke={graphColor} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />

				{/* Stats box */}
				<G>
					<SvgText x={STORY_WIDTH / 2} y={1450} fontSize="52" fill={textColor} fontWeight="700" textAnchor="middle">
						{`${Math.round(avgPower)}W`}
					</SvgText>
					<SvgText x={STORY_WIDTH / 2} y={1490} fontSize="28" fill={textColor} opacity={0.6} textAnchor="middle">
						AVG POWER
					</SvgText>

					<SvgText x={STORY_WIDTH / 2} y={1585} fontSize="42" fill={textColor} fontWeight="500" textAnchor="middle">
						{`Max: ${Math.round(maxPower)}W`}
					</SvgText>
				</G>

				{/* Logo */}
				<TrainaaLogo color={textColor} x={STORY_WIDTH / 2} y={STORY_HEIGHT - 120} scale={0.9} />

			</G>
		);
	};

	// Render appropriate template
	const renderOverlay = () => {
		switch (template) {
			case "route":
				return renderRouteOverlay();
			case "stats":
				return renderStatsOverlay();
			case "feedback":
				return renderFeedbackOverlay();
			case "heartrate":
				return renderHeartRateOverlay();
			case "elevation":
				return renderElevationOverlay();
			case "power":
				return renderPowerOverlay();
			default:
				return null;
		}
	};

	// Scale factor for preview (we want to show full content in smaller preview)
	const previewScale = 0.185; // 200px width from 1080px
	const previewWidth = STORY_WIDTH * previewScale;
	const previewHeight = STORY_HEIGHT * previewScale;

	return (
		<View style={{width: previewWidth, height: previewHeight, backgroundColor: "transparent"}}>
			<Svg width={previewWidth} height={previewHeight} viewBox={`0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`} style={{backgroundColor: "transparent"}}>
				{renderOverlay()}
			</Svg>
		</View>
	);
};

export default SocialMediaOverlay;
