// Very rough 2025-ish Australian regional costs. For fun, not quotes.
// cost = to build; upkeep = running cost per year (maintenance, staff, energy, insurance).

export type Category = "Housing" | "Community" | "Commercial" | "Industry" | "Utilities" | "Transport" | "Nature";
export type Payer = "council" | "state" | "private";
export type ItemType =
  | "house" | "townhouses" | "apartments" | "agedcare"
  | "clinic" | "hospital" | "school" | "highschool" | "childcare" | "police" | "fire" | "townhall" | "church" | "park" | "playground" | "skatepark" | "pool" | "oval" | "garden"
  | "shop" | "cafe" | "bakery" | "supermarket" | "pub" | "motel" | "caravan" | "servo" | "hardware" | "bigthing"
  | "warehouse" | "workshop" | "silos"
  | "watertower" | "watertreat" | "sewage" | "solar" | "wind" | "battery" | "substation" | "telecom" | "windmill"
  | "busstop" | "carpark" | "station" | "airstrip"
  | "trees";

export interface CatalogItem {
  type: ItemType;
  name: string;
  category: Category;
  w: number; // footprint width (m, x)
  d: number; // footprint depth (m, z)
  cost: number;
  upkeep: number; // per year
  payer: Payer;
  people?: number; // housing capacity
  dwellings?: number; // for council rates
  jobs?: number;
  provides?: Need[];
  emoji: string;
  blurb: string;
}

export type Need = "water" | "power" | "sewage" | "health" | "school" | "food" | "safety" | "comms" | "transport" | "jobs";

export const NEEDS: { key: Need; label: string }[] = [
  { key: "water", label: "Water supply" },
  { key: "power", label: "Power" },
  { key: "sewage", label: "Sewage" },
  { key: "health", label: "Healthcare" },
  { key: "school", label: "School" },
  { key: "food", label: "Groceries" },
  { key: "safety", label: "Police & fire" },
  { key: "comms", label: "Phone & internet" },
  { key: "transport", label: "Transport link" },
  { key: "jobs", label: "Local jobs" },
];

const k = 1_000, M = 1_000_000;

export const CATALOG: CatalogItem[] = [
  { type: "house", name: "House", category: "Housing", w: 16, d: 14, cost: 480 * k, upkeep: 8 * k, payer: "private", people: 3, dwellings: 1, emoji: "🏡", blurb: "A 4-bedroom home with a wraparound verandah." },
  { type: "townhouses", name: "Townhouses ×4", category: "Housing", w: 30, d: 13, cost: 1.9 * M, upkeep: 26 * k, payer: "private", people: 10, dwellings: 4, emoji: "🏘️", blurb: "Four two-storey townhouses in a row." },
  { type: "apartments", name: "Apartments ×24", category: "Housing", w: 32, d: 18, cost: 9.5 * M, upkeep: 130 * k, payer: "private", people: 48, dwellings: 24, emoji: "🏢", blurb: "A four-storey block with balconies." },
  { type: "agedcare", name: "Aged care home", category: "Housing", w: 44, d: 30, cost: 22 * M, upkeep: 6 * M, payer: "private", people: 60, jobs: 70, emoji: "🧓", blurb: "60 beds with gardens and a dining hall." },

  { type: "clinic", name: "Medical clinic", category: "Community", w: 24, d: 18, cost: 3.5 * M, upkeep: 1.2 * M, payer: "private", jobs: 12, provides: ["health"], emoji: "🩺", blurb: "GP clinic with a few treatment rooms." },
  { type: "hospital", name: "Small hospital", category: "Community", w: 62, d: 42, cost: 85 * M, upkeep: 30 * M, payer: "state", jobs: 180, provides: ["health", "jobs"], emoji: "🏥", blurb: "30-bed rural hospital with emergency and a helipad." },
  { type: "childcare", name: "Childcare centre", category: "Community", w: 22, d: 18, cost: 3 * M, upkeep: 900 * k, payer: "private", jobs: 15, emoji: "🧸", blurb: "Long day care for 60 kids." },
  { type: "school", name: "Primary school", category: "Community", w: 64, d: 44, cost: 28 * M, upkeep: 4.5 * M, payer: "state", jobs: 35, provides: ["school"], emoji: "🏫", blurb: "Classrooms, hall and a playground for ~300 kids." },
  { type: "highschool", name: "High school", category: "Community", w: 90, d: 60, cost: 75 * M, upkeep: 9 * M, payer: "state", jobs: 80, provides: ["school", "jobs"], emoji: "🎓", blurb: "Years 7–12 for ~700 students, with a gym and labs." },
  { type: "police", name: "Police station", category: "Community", w: 24, d: 18, cost: 9 * M, upkeep: 2.5 * M, payer: "state", jobs: 14, provides: ["safety"], emoji: "🚓", blurb: "Small country police station." },
  { type: "fire", name: "Fire station", category: "Community", w: 26, d: 20, cost: 7 * M, upkeep: 1.2 * M, payer: "state", jobs: 8, provides: ["safety"], emoji: "🚒", blurb: "Two-bay rural fire and rescue station." },
  { type: "townhall", name: "Town hall", category: "Community", w: 34, d: 24, cost: 15 * M, upkeep: 1.5 * M, payer: "council", jobs: 25, emoji: "🏛️", blurb: "Council chambers, library and a clock tower." },
  { type: "church", name: "Church", category: "Community", w: 16, d: 26, cost: 2.8 * M, upkeep: 60 * k, payer: "private", emoji: "⛪", blurb: "Weatherboard country church with a steeple." },
  { type: "park", name: "Park", category: "Community", w: 40, d: 40, cost: 550 * k, upkeep: 40 * k, payer: "council", emoji: "🌳", blurb: "Lawn, paths, trees and a rotunda." },
  { type: "playground", name: "Playground", category: "Community", w: 22, d: 22, cost: 450 * k, upkeep: 25 * k, payer: "council", emoji: "🛝", blurb: "Slides, swings and shade sails." },
  { type: "skatepark", name: "Skate park", category: "Community", w: 26, d: 18, cost: 700 * k, upkeep: 15 * k, payer: "council", emoji: "🛹", blurb: "Concrete bowl, ramps and rails." },
  { type: "pool", name: "Swimming pool", category: "Community", w: 44, d: 28, cost: 14 * M, upkeep: 900 * k, payer: "council", jobs: 10, emoji: "🏊", blurb: "Outdoor 50 m pool with a kids' pool and kiosk." },
  { type: "oval", name: "Sports oval", category: "Community", w: 130, d: 100, cost: 4.5 * M, upkeep: 180 * k, payer: "council", emoji: "🏉", blurb: "Footy oval with lights and a clubhouse." },
  { type: "garden", name: "Community garden", category: "Community", w: 22, d: 22, cost: 120 * k, upkeep: 8 * k, payer: "council", emoji: "🥕", blurb: "Veggie beds, a shed and a water tank." },

  { type: "shop", name: "General store", category: "Commercial", w: 16, d: 14, cost: 1.3 * M, upkeep: 350 * k, payer: "private", jobs: 5, provides: ["food"], emoji: "🏪", blurb: "Classic country store with an awning." },
  { type: "cafe", name: "Café", category: "Commercial", w: 13, d: 11, cost: 900 * k, upkeep: 250 * k, payer: "private", jobs: 6, emoji: "☕", blurb: "Corner café with outdoor tables." },
  { type: "bakery", name: "Bakery", category: "Commercial", w: 13, d: 11, cost: 1 * M, upkeep: 280 * k, payer: "private", jobs: 6, emoji: "🥧", blurb: "Pies, sausage rolls and vanilla slice." },
  { type: "supermarket", name: "Supermarket", category: "Commercial", w: 54, d: 40, cost: 14 * M, upkeep: 3 * M, payer: "private", jobs: 45, provides: ["food", "jobs"], emoji: "🛒", blurb: "Full-size supermarket with a car park." },
  { type: "pub", name: "Pub", category: "Commercial", w: 26, d: 20, cost: 5 * M, upkeep: 900 * k, payer: "private", jobs: 15, emoji: "🍺", blurb: "Two-storey pub with an iron-lace verandah." },
  { type: "motel", name: "Motel", category: "Commercial", w: 40, d: 18, cost: 6 * M, upkeep: 700 * k, payer: "private", jobs: 8, emoji: "🛏️", blurb: "20 rooms and a neon sign." },
  { type: "caravan", name: "Caravan park", category: "Commercial", w: 64, d: 44, cost: 3.5 * M, upkeep: 400 * k, payer: "private", jobs: 5, emoji: "🚐", blurb: "Powered sites, cabins and an amenities block." },
  { type: "servo", name: "Service station", category: "Commercial", w: 32, d: 26, cost: 3.5 * M, upkeep: 600 * k, payer: "private", jobs: 8, emoji: "⛽", blurb: "Fuel, snacks and a big canopy." },
  { type: "hardware", name: "Hardware store", category: "Commercial", w: 44, d: 32, cost: 8 * M, upkeep: 1.4 * M, payer: "private", jobs: 20, emoji: "🔨", blurb: "Timber yard, tools and a sausage sizzle out front." },
  { type: "bigthing", name: "Big Kangaroo", category: "Commercial", w: 14, d: 14, cost: 1.2 * M, upkeep: 30 * k, payer: "council", emoji: "🦘", blurb: "Every country town needs a Big Thing. Great for tourists." },

  { type: "warehouse", name: "Warehouse", category: "Industry", w: 44, d: 26, cost: 6 * M, upkeep: 250 * k, payer: "private", jobs: 25, provides: ["jobs"], emoji: "🏭", blurb: "Steel-frame warehouse with loading docks." },
  { type: "workshop", name: "Workshop shed", category: "Industry", w: 22, d: 16, cost: 900 * k, upkeep: 60 * k, payer: "private", jobs: 6, provides: ["jobs"], emoji: "🔧", blurb: "Mechanic or fabrication shed." },
  { type: "silos", name: "Grain silos", category: "Industry", w: 26, d: 14, cost: 4 * M, upkeep: 120 * k, payer: "private", jobs: 6, provides: ["jobs"], emoji: "🌾", blurb: "Iconic silos for the local harvest." },

  { type: "watertower", name: "Water tower", category: "Utilities", w: 14, d: 14, cost: 3 * M, upkeep: 60 * k, payer: "council", provides: ["water"], emoji: "🗼", blurb: "Elevated tank that keeps water pressure up." },
  { type: "watertreat", name: "Water treatment", category: "Utilities", w: 44, d: 32, cost: 25 * M, upkeep: 1.8 * M, payer: "council", jobs: 6, provides: ["water"], emoji: "💧", blurb: "Filters river, dam or bore water." },
  { type: "windmill", name: "Bore & windmill", category: "Utilities", w: 10, d: 10, cost: 180 * k, upkeep: 6 * k, payer: "council", provides: ["water"], emoji: "🪁", blurb: "Classic Southern Cross windmill pumping groundwater." },
  { type: "sewage", name: "Sewage treatment", category: "Utilities", w: 54, d: 38, cost: 30 * M, upkeep: 2.2 * M, payer: "council", jobs: 6, provides: ["sewage"], emoji: "♻️", blurb: "Treats wastewater for reuse on parks and ovals." },
  { type: "solar", name: "Solar farm 5 MW", category: "Utilities", w: 120, d: 80, cost: 9 * M, upkeep: 150 * k, payer: "private", provides: ["power"], emoji: "☀️", blurb: "Powers roughly 1,500 homes on a sunny day." },
  { type: "wind", name: "Wind turbine 3 MW", category: "Utilities", w: 18, d: 18, cost: 6 * M, upkeep: 120 * k, payer: "private", provides: ["power"], emoji: "🌬️", blurb: "A 100 m tall turbine." },
  { type: "battery", name: "Battery 10 MWh", category: "Utilities", w: 30, d: 16, cost: 7 * M, upkeep: 90 * k, payer: "private", provides: ["power"], emoji: "🔋", blurb: "Keeps the lights on after sunset." },
  { type: "substation", name: "Substation", category: "Utilities", w: 26, d: 22, cost: 12 * M, upkeep: 250 * k, payer: "state", provides: ["power"], emoji: "⚡", blurb: "Connects the town to the grid." },
  { type: "telecom", name: "Telecom tower", category: "Utilities", w: 8, d: 8, cost: 650 * k, upkeep: 40 * k, payer: "private", provides: ["comms"], emoji: "📡", blurb: "Mobile and fixed-wireless internet." },

  { type: "busstop", name: "Bus stop", category: "Transport", w: 8, d: 4, cost: 45 * k, upkeep: 2 * k, payer: "council", provides: ["transport"], emoji: "🚏", blurb: "Shelter, bench and timetable." },
  { type: "carpark", name: "Car park", category: "Transport", w: 32, d: 22, cost: 600 * k, upkeep: 15 * k, payer: "council", emoji: "🅿️", blurb: "40 spaces with lighting." },
  { type: "station", name: "Train station", category: "Transport", w: 60, d: 14, cost: 18 * M, upkeep: 600 * k, payer: "state", jobs: 6, provides: ["transport"], emoji: "🚉", blurb: "Platform, shelter and a heritage station building." },
  { type: "airstrip", name: "Airstrip", category: "Transport", w: 900, d: 40, cost: 9 * M, upkeep: 150 * k, payer: "council", provides: ["transport"], emoji: "🛬", blurb: "900 m sealed strip for the flying doctor and light planes." },

  { type: "trees", name: "Trees", category: "Nature", w: 14, d: 14, cost: 9 * k, upkeep: 300, payer: "council", emoji: "🌲", blurb: "A small stand of gum trees." },
];

export const CATALOG_BY_TYPE = Object.fromEntries(CATALOG.map((c) => [c.type, c])) as Record<ItemType, CatalogItem>;
export const CATEGORIES: Category[] = ["Housing", "Community", "Commercial", "Industry", "Utilities", "Transport", "Nature"];

export type RoadType = "gravel" | "sealed" | "main";
export const ROADS: Record<RoadType, { name: string; width: number; perKm: number; upkeepPerKm: number; emoji: string; blurb: string }> = {
  gravel: { name: "Gravel road", width: 6, perKm: 300 * k, upkeepPerKm: 12 * k, emoji: "🟫", blurb: "Cheap, dusty, fine for low traffic." },
  sealed: { name: "Sealed road", width: 8, perKm: 1.6 * M, upkeepPerKm: 25 * k, emoji: "🛣️", blurb: "Two-lane bitumen with kerbs." },
  main: { name: "Main street", width: 14, perKm: 5 * M, upkeepPerKm: 60 * k, emoji: "🏙️", blurb: "Wide street with footpaths, parking and lights." },
};

export const JUNCTIONS = {
  roundabout: { name: "Roundabout", cost: 2.5 * M, upkeep: 15 * k, emoji: "🔄", blurb: "Click a junction to add a roundabout with a planted island." },
  lights: { name: "Traffic lights", cost: 650 * k, upkeep: 12 * k, emoji: "🚦", blurb: "Click a junction to add working traffic signals." },
} as const;

/** Average council rates per dwelling per year. */
export const RATES_PER_DWELLING = 2_100;
/** Earthworks for levelling a site: ~$45 per m³ of cut/fill. */
export const EARTHWORKS_PER_M3 = 45;
/** Road cost goes up with grade. */
export const roadGradeFactor = (gradePct: number) => 1 + Math.max(0, gradePct - 3) * 0.08;

// ---------- Street names ----------
const NAMES = [
  "Wattle", "Banksia", "Acacia", "Waratah", "Bottlebrush", "Jacaranda", "Grevillea", "Kurrajong", "Ironbark", "Boronia",
  "Coolabah", "Bluegum", "Mulga", "Saltbush", "Brolga", "Kookaburra", "Galah", "Lorikeet", "Wombat", "Echidna",
  "Emu", "Magpie", "Currawong", "Spinifex", "Quandong", "Bunya", "Myall", "Gidgee", "Yarran", "Belah",
  "Riverina", "Pioneer", "Federation", "Anzac", "Station", "Railway", "School", "Church", "Mill", "Creek",
  "Paperbark", "Sandalwood", "Lilly Pilly", "Hakea", "Melaleuca", "Callistemon", "Desert Pea", "Brigalow", "Wilga", "Box",
];
const SUFFIX: Record<RoadType, string[]> = {
  main: ["Street"],
  sealed: ["Street", "Road", "Avenue", "Drive", "Crescent", "Way", "Parade", "Close"],
  gravel: ["Road", "Track", "Lane", "Way"],
};
export function streetName(type: RoadType, taken: string[]): string {
  if (type === "main" && !taken.includes("Main Street")) return "Main Street";
  for (let i = 0; i < 40; i++) {
    const n = `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${SUFFIX[type][Math.floor(Math.random() * SUFFIX[type].length)]}`;
    if (!taken.includes(n)) return n;
  }
  return `Road ${taken.length + 1}`;
}

const TOWN_START = ["Wattle", "Emu", "Brolga", "Myall", "Coolabah", "Ironbark", "Saltbush", "Red", "Kangaroo", "Dingo", "Mulga", "Gidgee", "Spinifex", "Quandong"];
const TOWN_END = [" Creek", " Flat", " Springs", " Downs", " Plains", "ville", " Hill", " Crossing", " Well", " Gully", " Ridge", " Bend"];
export const townName = () => `${TOWN_START[Math.floor(Math.random() * TOWN_START.length)]}${TOWN_END[Math.floor(Math.random() * TOWN_END.length)]}`;
