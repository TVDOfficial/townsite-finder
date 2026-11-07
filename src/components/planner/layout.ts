// Automatic layout: subdivide a block into lots, or lay out a whole starter town.
import { CATALOG_BY_TYPE, ROADS, type ItemType, type RoadType } from "./catalog";
import { corners, overlaps, siteWorks, type Boundary } from "./geometry";
import type { TerrainData } from "./terrain";

type P = [number, number];

/** A rotated local frame (u along the boundary's width, v along its depth). */
export interface Frame { cx: number; cz: number; rot: number }
export const frameOf = (b: Boundary | null | undefined): Frame => ({ cx: b?.cx ?? 0, cz: b?.cz ?? 0, rot: b?.rot ?? 0 });

export function toWorld(f: Frame, u: number, v: number): P {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  return [f.cx + u * c + v * s, f.cz - u * s + v * c];
}
export function toLocal(f: Frame, x: number, z: number): P {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  const dx = x - f.cx, dz = z - f.cz;
  return [dx * c - dz * s, dx * s + dz * c];
}

export interface PlannedItem { type: ItemType; x: number; z: number; rot: number }
export interface PlannedRoad { type: RoadType; pts: P[]; name?: string }
export interface Layout { roads: PlannedRoad[]; items: PlannedItem[]; lots: P[][]; people: number; skipped: number; note?: string }

export type LotFill = "houses" | "townhouses" | "apartments" | "mixed";
const LOT: Record<"house" | "townhouses" | "apartments", { frontage: number; depth: number; setback: number }> = {
  house: { frontage: 20, depth: 34, setback: 6 },
  townhouses: { frontage: 34, depth: 26, setback: 4 },
  apartments: { frontage: 38, depth: 30, setback: 5 },
};

const roadHalf = (t: RoadType) => ROADS[t].width / 2 + (t === "main" ? 2 : 0);

/** Can this go here? (inside the map, not too steep, not overlapping anything already placed) */
export function fits(t: TerrainData, existing: { type: ItemType; x: number; z: number; rot: number }[], it: PlannedItem) {
  const poly = corners(it.type, it.x, it.z, it.rot);
  if (!poly.every(([px, pz]) => t.inBounds(px, pz, 30))) return false;
  const sw = siteWorks(t, it.type, it.x, it.z, it.rot);
  if (sw.maxH - sw.minH > 12) return false;
  const r = Math.max(CATALOG_BY_TYPE[it.type].w, CATALOG_BY_TYPE[it.type].d);
  for (const e of existing) {
    const er = Math.max(CATALOG_BY_TYPE[e.type].w, CATALOG_BY_TYPE[e.type].d);
    if (Math.abs(e.x - it.x) > r + er || Math.abs(e.z - it.z) > r + er) continue;
    if (overlaps(poly, corners(e.type, e.x, e.z, e.rot))) return false;
  }
  return true;
}

/**
 * Lots along both long sides of a block, each with a building facing the street.
 * The block is [u0,u1]×[v0,v1] in the frame; `margins` = how far in from each edge the lots start
 * (half the street width plus a verge), as [top v0, bottom v1, left u0, right u1].
 */
export function fillBlock(f: Frame, u0: number, v0: number, u1: number, v1: number, fill: LotFill, margins: [number, number, number, number]) {
  const items: PlannedItem[] = [];
  const lots: P[][] = [];
  const [mt, mb, ml, mr] = margins;
  const alongU = u1 - u0 >= v1 - v0;
  // Work in a block-aligned frame where "a" runs along the long side and "b" across it.
  const aMin = alongU ? u0 + ml : v0 + mt, aMax = alongU ? u1 - mr : v1 - mb;
  const bMin = alongU ? v0 + mt : u0 + ml, bMax = alongU ? v1 - mb : u1 - mr;
  const inner = bMax - bMin;
  if (aMax - aMin < 18 || inner < 24) return { items, lots };

  const rows: { side: -1 | 1; kind: keyof typeof LOT }[] = [
    { side: -1, kind: fill === "townhouses" ? "townhouses" : fill === "apartments" ? "apartments" : "house" },
    { side: 1, kind: fill === "houses" ? "house" : fill === "mixed" ? "townhouses" : fill === "apartments" ? "apartments" : "townhouses" },
  ];
  const singleRow = inner < 44; // too shallow for back-to-back lots
  for (const row of singleRow ? rows.slice(0, 1) : rows) {
    const spec = LOT[row.kind];
    const depth = singleRow ? inner : Math.min(spec.depth, inner / 2);
    const n = Math.floor((aMax - aMin) / spec.frontage);
    if (n < 1) continue;
    const frontage = (aMax - aMin) / n;
    const type: ItemType = row.kind === "house" ? "house" : row.kind;
    const fp = CATALOG_BY_TYPE[type];
    for (let i = 0; i < n; i++) {
      const a0 = aMin + i * frontage, a1 = a0 + frontage;
      // Lot runs from the street edge (front) inwards.
      const bFront = row.side === -1 ? bMin : bMax;
      const bBack = row.side === -1 ? bMin + depth : bMax - depth;
      const corner = (a: number, b: number): P => (alongU ? toWorld(f, a, b) : toWorld(f, b, a));
      lots.push([corner(a0, bFront), corner(a1, bFront), corner(a1, bBack), corner(a0, bBack)]);
      if (fp.w > frontage - 1 || fp.d + spec.setback > depth) continue;
      const bCentre = row.side === -1 ? bFront + spec.setback + fp.d / 2 : bFront - spec.setback - fp.d / 2;
      const aCentre = (a0 + a1) / 2;
      // The model's front faces local +z; turn it to face the street.
      const faceB = row.side === -1 ? -1 : 1; // street is towards -b or +b
      const localRot = alongU ? (faceB === 1 ? 0 : Math.PI) : (faceB === 1 ? Math.PI / 2 : -Math.PI / 2);
      const [x, z] = alongU ? toWorld(f, aCentre, bCentre) : toWorld(f, bCentre, aCentre);
      items.push({ type, x, z, rot: f.rot + localRot });
    }
  }
  return { items, lots };
}

/** Streets around a block plus its lots and buildings. */
export function blockLayout(f: Frame, u0: number, v0: number, u1: number, v1: number, fill: LotFill, streets: RoadType | null): Layout {
  const roads: PlannedRoad[] = [];
  if (streets) {
    const ring: P[] = [toWorld(f, u0, v0), toWorld(f, u1, v0), toWorld(f, u1, v1), toWorld(f, u0, v1), toWorld(f, u0, v0)];
    roads.push({ type: streets, pts: ring });
  }
  const m = streets ? roadHalf(streets) + 2 : 1;
  const { items, lots } = fillBlock(f, u0, v0, u1, v1, fill, [m, m, m, m]);
  return { roads, items, lots, people: items.reduce((s, i) => s + (CATALOG_BY_TYPE[i.type].people ?? 0), 0), skipped: 0 };
}
