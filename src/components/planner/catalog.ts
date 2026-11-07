// Very rough 2025-ish Australian regional build costs. For fun, not quotes.

export type Category = "Housing" | "Community" | "Commercial" | "Utilities" | "Nature";
export type ItemType =
  | "house" | "townhouses" | "apartments"
  | "clinic" | "hospital" | "school" | "police" | "fire" | "townhall" | "park" | "oval"
  | "shop" | "cafe" | "supermarket" | "pub" | "servo"
  | "watertower" | "watertreat" | "sewage" | "solar" | "wind" | "substation" | "telecom"
  | "trees";

export interface CatalogItem {
  type: ItemType;
  name: string;
  category: Category;
  w: number; // footprint width (m, x)
  d: number; // footprint depth (m, z)
  cost: number;
  people?: number; // housing capacity
  provides?: Need[];
  emoji: string;
  blurb: string;
}

export type Need = "water" | "power" | "sewage" | "health" | "school" | "food" | "safety" | "comms";

export const NEEDS: { key: Need; label: string }[] = [
  { key: "water", label: "Water supply" },
  { key: "power", label: "Power" },
  { key: "sewage", label: "Sewage" },
  { key: "health", label: "Healthcare" },
  { key: "school", label: "School" },
  { key: "food", label: "Groceries" },
  { key: "safety", label: "Police & fire" },
  { key: "comms", label: "Phone & internet" },
];

export const CATALOG: CatalogItem[] = [
  { type: "house", name: "House", category: "Housing", w: 16, d: 14, cost: 480_000, people: 3, emoji: "🏡", blurb: "A 4-bedroom home with a wraparound verandah." },
  { type: "townhouses", name: "Townhouses ×4", category: "Housing", w: 30, d: 13, cost: 1_900_000, people: 10, emoji: "🏘️", blurb: "Four two-storey townhouses in a row." },
  { type: "apartments", name: "Apartments ×24", category: "Housing", w: 32, d: 18, cost: 9_500_000, people: 48, emoji: "🏢", blurb: "A four-storey block with balconies." },

  { type: "clinic", name: "Medical clinic", category: "Community", w: 24, d: 18, cost: 3_500_000, provides: ["health"], emoji: "🩺", blurb: "GP clinic with a few treatment rooms." },
  { type: "hospital", name: "Small hospital", category: "Community", w: 62, d: 42, cost: 85_000_000, provides: ["health"], emoji: "🏥", blurb: "30-bed rural hospital with emergency and a helipad." },
  { type: "school", name: "Primary school", category: "Community", w: 64, d: 44, cost: 28_000_000, provides: ["school"], emoji: "🏫", blurb: "Classrooms, hall and a playground for ~300 kids." },
  { type: "police", name: "Police station", category: "Community", w: 24, d: 18, cost: 9_000_000, provides: ["safety"], emoji: "🚓", blurb: "Small country police station." },
  { type: "fire", name: "Fire station", category: "Community", w: 26, d: 20, cost: 7_000_000, provides: ["safety"], emoji: "🚒", blurb: "Two-bay rural fire and rescue station." },
  { type: "townhall", name: "Town hall", category: "Community", w: 34, d: 24, cost: 15_000_000, emoji: "🏛️", blurb: "Council chambers, library and a clock tower." },
  { type: "park", name: "Park", category: "Community", w: 40, d: 40, cost: 550_000, emoji: "🌳", blurb: "Lawn, paths, trees and a rotunda." },
  { type: "oval", name: "Sports oval", category: "Community", w: 130, d: 100, cost: 4_500_000, emoji: "🏉", blurb: "Footy oval with lights and a clubhouse." },

  { type: "shop", name: "General store", category: "Commercial", w: 16, d: 14, cost: 1_300_000, provides: ["food"], emoji: "🏪", blurb: "Classic country store with an awning." },
  { type: "cafe", name: "Café", category: "Commercial", w: 13, d: 11, cost: 900_000, emoji: "☕", blurb: "Corner café with outdoor tables." },
  { type: "supermarket", name: "Supermarket", category: "Commercial", w: 54, d: 40, cost: 14_000_000, provides: ["food"], emoji: "🛒", blurb: "Full-size supermarket with a car park." },
  { type: "pub", name: "Pub", category: "Commercial", w: 26, d: 20, cost: 5_000_000, emoji: "🍺", blurb: "Two-storey pub with an iron-lace verandah." },
  { type: "servo", name: "Service station", category: "Commercial", w: 32, d: 26, cost: 3_500_000, emoji: "⛽", blurb: "Fuel, snacks and a big canopy." },

  { type: "watertower", name: "Water tower", category: "Utilities", w: 14, d: 14, cost: 3_000_000, provides: ["water"], emoji: "🗼", blurb: "Elevated tank that keeps water pressure up." },
  { type: "watertreat", name: "Water treatment", category: "Utilities", w: 44, d: 32, cost: 25_000_000, provides: ["water"], emoji: "💧", blurb: "Filters river, dam or bore water." },
  { type: "sewage", name: "Sewage treatment", category: "Utilities", w: 54, d: 38, cost: 30_000_000, provides: ["sewage"], emoji: "♻️", blurb: "Treats wastewater for reuse on parks and ovals." },
  { type: "solar", name: "Solar farm 5 MW", category: "Utilities", w: 120, d: 80, cost: 9_000_000, provides: ["power"], emoji: "☀️", blurb: "Powers roughly 1,500 homes on a sunny day." },
  { type: "wind", name: "Wind turbine 3 MW", category: "Utilities", w: 18, d: 18, cost: 6_000_000, provides: ["power"], emoji: "🌬️", blurb: "A 100 m tall turbine." },
  { type: "substation", name: "Substation", category: "Utilities", w: 26, d: 22, cost: 12_000_000, provides: ["power"], emoji: "⚡", blurb: "Connects the town to the grid." },
  { type: "telecom", name: "Telecom tower", category: "Utilities", w: 8, d: 8, cost: 650_000, provides: ["comms"], emoji: "📡", blurb: "Mobile and fixed-wireless internet." },

  { type: "trees", name: "Trees", category: "Nature", w: 14, d: 14, cost: 9_000, emoji: "🌲", blurb: "A small stand of gum trees." },
];

export const CATALOG_BY_TYPE = Object.fromEntries(CATALOG.map((c) => [c.type, c])) as Record<ItemType, CatalogItem>;
export const CATEGORIES: Category[] = ["Housing", "Community", "Commercial", "Utilities", "Nature"];

export type RoadType = "gravel" | "sealed" | "main";
export const ROADS: Record<RoadType, { name: string; width: number; perKm: number; emoji: string; blurb: string }> = {
  gravel: { name: "Gravel road", width: 6, perKm: 300_000, emoji: "🟫", blurb: "Cheap, dusty, fine for low traffic." },
  sealed: { name: "Sealed road", width: 8, perKm: 1_600_000, emoji: "🛣️", blurb: "Two-lane bitumen with kerbs." },
  main: { name: "Main street", width: 14, perKm: 5_000_000, emoji: "🚦", blurb: "Wide street with footpaths, parking and lights." },
};

/** Earthworks for levelling a site: ~$45 per m³ of cut/fill. */
export const EARTHWORKS_PER_M3 = 45;
/** Road cost goes up with grade. */
export const roadGradeFactor = (gradePct: number) => 1 + Math.max(0, gradePct - 3) * 0.08;
