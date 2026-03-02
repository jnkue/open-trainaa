// Feature IDs - titles and descriptions are in locale files (features.{id}.title, features.{id}.description)
export interface Feature {
	id: string;
}

// Roadmap item IDs and color schemes - titles, descriptions, and timelines are in locale files
export interface RoadmapItem {
	id: string;
	colorScheme: {
		bg: string;
		border: string;
		text: string;
	};
}

export const RECENT_FEATURES: Feature[] = [
	{id: "trainer-improvments"},
	{id: "wahoo-integration"},
	{id: "session-feedback"},
];

export const ROADMAP_ITEMS: RoadmapItem[] = [
	{
		id: "integrations",
		colorScheme: {
			bg: "bg-green-500/10",
			border: "border-green-500/20",
			text: "text-green-600",
		},
	},
	{
		id: "ai-trainer",
		colorScheme: {
			bg: "bg-blue-500/10",
			border: "border-blue-500/20",
			text: "text-blue-600",
		},
	},
	{
		id: "nutrition",
		colorScheme: {
			bg: "bg-purple-500/10",
			border: "border-purple-500/20",
			text: "text-purple-600",
		},
	},
	{
		id: "social",
		colorScheme: {
			bg: "bg-pink-500/10",
			border: "border-pink-500/20",
			text: "text-pink-600",
		},
	},
];