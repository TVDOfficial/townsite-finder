import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import statesData from "@/data/au-states.json";
import settlementsData from "@/data/settlements.json";
import hospitalsData from "@/data/hospitals.json";
import type { LngLat, Place, StateCode } from "./types";

type StateFeature = Feature<Polygon | MultiPolygon, { code: StateCode; name: string }>;
// [lon, lat, type (0 city,1 town,2 village,3 hamlet), name, population]
type SettlementRow = [number, number, number, string, number];

const STATES = (statesData as unknown as { features: StateFeature[] }).features;
const SETTLEMENTS = settlementsData as unknown as SettlementRow[];
const HOSPITALS = hospitalsData as unknown as [number, number, string][];
const PLACE_TYPES = ["city", "town", "village", "hamlet"] as const;

// Big cities and regional centres, used for "distance to a major city" and land price.
export const MAJOR_CITIES: { name: string; lng: number; lat: number }[] = [
  { name: "Sydney", lng: 151.209, lat: -33.868 },
  { name: "Melbourne", lng: 144.963, lat: -37.814 },
  { name: "Brisbane", lng: 153.026, lat: -27.47 },
  { name: "Perth", lng: 115.861, lat: -31.952 },
  { name: "Adelaide", lng: 138.601, lat: -34.929 },
  { name: "Hobart", lng: 147.325, lat: -42.882 },
  { name: "Darwin", lng: 130.845, lat: -12.463 },
  { name: "Canberra", lng: 149.13, lat: -35.281 },
  { name: "Gold Coast", lng: 153.4, lat: -28.017 },
  { name: "Newcastle", lng: 151.78, lat: -32.928 },
  { name: "Townsville", lng: 146.817, lat: -19.259 },
  { name: "Cairns", lng: 145.771, lat: -16.92 },
  { name: "Toowoomba", lng: 151.952, lat: -27.561 },
  { name: "Geelong", lng: 144.361, lat: -38.149 },
  { name: "Ballarat", lng: 143.85, lat: -37.562 },
  { name: "Bendigo", lng: 144.28, lat: -36.757 },
  { name: "Launceston", lng: 147.138, lat: -41.434 },
  { name: "Mackay", lng: 149.186, lat: -21.141 },
  { name: "Rockhampton", lng: 150.51, lat: -23.378 },
  { name: "Bunbury", lng: 115.637, lat: -33.327 },
  { name: "Wagga Wagga", lng: 147.369, lat: -35.118 },
  { name: "Albury", lng: 146.916, lat: -36.08 },
  { name: "Dubbo", lng: 148.601, lat: -32.249 },
  { name: "Tamworth", lng: 150.931, lat: -31.09 },
  { name: "Mildura", lng: 142.158, lat: -34.206 },
  { name: "Alice Springs", lng: 133.881, lat: -23.698 },
  { name: "Kalgoorlie", lng: 121.466, lat: -30.749 },
  { name: "Geraldton", lng: 114.615, lat: -28.774 },
  { name: "Mount Isa", lng: 139.492, lat: -20.725 },
  { name: "Broken Hill", lng: 141.467, lat: -31.953 },
];

export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from p to segment a-b in km, plus the closest point (local flat projection). */
export function distToSegment(p: LngLat, a: LngLat, b: LngLat): { km: number; point: LngLat } {
  const kx = 111.32 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110.57;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { km: Math.hypot(cx, cy), point: [p[0] + cx / kx, p[1] + cy / ky] };
}

// ---- States ----
const bboxes = STATES.map((f) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY] as const;
});

export function stateAt(lng: number, lat: number): StateCode | null {
  for (let i = 0; i < STATES.length; i++) {
    const [a, b, c, d] = bboxes[i];
    if (lng < a || lng > c || lat < b || lat > d) continue;
    if (booleanPointInPolygon([lng, lat], STATES[i])) return STATES[i].properties.code;
  }
  return null;
}

/** Random point on land inside a state, or anywhere in Australia. */
export function randomPointIn(state: StateCode | "ALL"): { p: LngLat; state: StateCode } | null {
  const idx = state === "ALL" ? -1 : STATES.findIndex((f) => f.properties.code === state);
  const box = idx === -1 ? [112.9, -43.7, 153.7, -10.6] : bboxes[idx];
  for (let i = 0; i < 200; i++) {
    const p: LngLat = [box[0] + Math.random() * (box[2] - box[0]), box[1] + Math.random() * (box[3] - box[1])];
    if (idx === -1) {
      const s = stateAt(p[0], p[1]);
      if (s) return { p, state: s };
    } else if (booleanPointInPolygon(p, STATES[idx])) {
      return { p, state: STATES[idx].properties.code };
    }
  }
  return null;
}

// ---- Settlements: 1° grid index for fast "anything within X km" lookups ----
const grid = new Map<string, SettlementRow[]>();
for (const s of SETTLEMENTS) {
  const key = `${Math.floor(s[0])},${Math.floor(s[1])}`;
  const cell = grid.get(key);
  if (cell) cell.push(s); else grid.set(key, [s]);
}

function forEachNear(p: LngLat, km: number, cb: (s: SettlementRow) => void) {
  const dLat = Math.ceil(km / 110) + 0;
  const dLng = Math.ceil(km / (111 * Math.cos((p[1] * Math.PI) / 180)));
  const cx = Math.floor(p[0]), cy = Math.floor(p[1]);
  for (let x = cx - dLng; x <= cx + dLng; x++)
    for (let y = cy - dLat; y <= cy + dLat; y++) grid.get(`${x},${y}`)?.forEach(cb);
}

/** First settlement (of type <= maxType) within km, or null if the spot is clear. */
export function settlementWithin(p: LngLat, km: number, maxType: number): string | null {
  let found: string | null = null;
  forEachNear(p, km, (s) => {
    if (found || s[2] > maxType) return;
    if (haversineKm(p, [s[0], s[1]]) < km) found = s[3];
  });
  return found;
}

function toPlace(s: SettlementRow, p: LngLat): Place {
  return { name: s[3], type: PLACE_TYPES[s[2]], population: s[4], km: haversineKm(p, [s[0], s[1]]), lng: s[0], lat: s[1] };
}

export function nearestPlaces(p: LngLat, limit = 6, maxType = 3): Place[] {
  for (const radius of [60, 150, 400, 1200]) {
    const out: Place[] = [];
    forEachNear(p, radius, (s) => { if (s[2] <= maxType) out.push(toPlace(s, p)); });
    // OSM sometimes has a town twice (node + boundary); keep the closest of each name.
    const seen = new Set<string>();
    const within = out
      .filter((x) => x.km <= radius)
      .sort((a, b) => a.km - b.km)
      .filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)));
    if (within.length >= limit || radius === 1200) return within.slice(0, limit);
  }
  return [];
}

export function nearestHospital(p: LngLat) {
  let best: { name: string; km: number; lng: number; lat: number } | null = null;
  for (const [lng, lat, name] of HOSPITALS) {
    const km = haversineKm(p, [lng, lat]);
    if (!best || km < best.km) best = { name, km, lng, lat };
  }
  return best;
}

export function nearestMajorCity(p: LngLat) {
  let best = { ...MAJOR_CITIES[0], km: Infinity };
  for (const c of MAJOR_CITIES) {
    const km = haversineKm(p, [c.lng, c.lat]);
    if (km < best.km) best = { ...c, km };
  }
  return best;
}

/** Offset a point by metres east / north. */
export function offsetMeters(lng: number, lat: number, east: number, north: number): LngLat {
  return [lng + east / (111320 * Math.cos((lat * Math.PI) / 180)), lat + north / 111320];
}
