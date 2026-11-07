// Automatic layout: subdivide a block into lots, or lay out a whole starter town.
import type { SizeKey } from "@/lib/analysis";
import { computeMeters } from "./capacity";
import { CATALOG_BY_TYPE, ROADS, type ItemType, type RoadType } from "./catalog";
import { corners, overlaps, siteWorks, type Boundary, type Placed } from "./geometry";
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

// ---------- Whole starter town ----------
const BW0 = 120, BD0 = 84; // default block size (m)

const PLAN: Record<SizeKey, { houses: number; townhouses: number; apartments: number; street: RoadType; note?: string }> = {
  eco: { houses: 50, townhouses: 0, apartments: 0, street: "gravel" },
  small: { houses: 230, townhouses: 60, apartments: 36, street: "sealed" },
  large: { houses: 300, townhouses: 120, apartments: 80, street: "sealed", note: "Laid out stage 1 (about 6,000 people). Add more blocks with the Block of lots tool to grow it." },
};

const CENTRE: Record<SizeKey, ItemType[]> = {
  eco: ["townhall", "shop", "cafe", "park", "garden", "playground"],
  small: ["townhall", "supermarket", "shop", "shop", "cafe", "bakery", "pub", "clinic", "police", "fire", "park", "playground", "childcare", "church"],
  large: ["townhall", "supermarket", "supermarket", "shop", "shop", "shop", "cafe", "cafe", "bakery", "pub", "pub", "hospital", "clinic", "police", "fire", "park", "park", "playground", "childcare", "childcare", "church", "pool", "skatepark", "motel"],
};

/**
 * Lay out a starter town. Pass `random` (a 0..1 generator) for a different town every time:
 * block sizes, street direction, housing mix, town-centre order and which side industry goes all vary.
 */
export function townLayout(t: TerrainData, b: Boundary | null | undefined, size: SizeKey, existing: Placed[], random?: () => number): Layout {
  const rnd = random ?? (() => 0.5);
  const jitter = (base: number, spread: number) => (random ? base * (1 - spread + rnd() * spread * 2) : base);
  const base = frameOf(b);
  const f: Frame = random
    ? {
        cx: base.cx + (rnd() - 0.5) * 0.12 * (b?.w ?? 1000),
        cz: base.cz + (rnd() - 0.5) * 0.12 * (b?.d ?? 1000),
        rot: base.rot + (rnd() < 0.5 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.5,
      }
    : base;
  const BW = Math.round(jitter(BW0, 0.15)), BD = Math.round(jitter(BD0, 0.12));
  const S: 1 | -1 = random && rnd() < 0.5 ? -1 : 1; // which side industry and utilities go
  const p0 = PLAN[size];
  const plan = { ...p0, houses: Math.round(jitter(p0.houses, 0.2)), townhouses: Math.round(jitter(p0.townhouses, 0.35)), apartments: Math.round(jitter(p0.apartments, 0.35)) };
  const centreList = random ? [...CENTRE[size]].sort(() => rnd() - 0.5) : CENTRE[size];
  const items: PlannedItem[] = [];
  const lots: P[][] = [];
  let skipped = 0;
  const taken = [...existing.map((e) => ({ type: e.type, x: e.x, z: e.z, rot: e.rot }))];
  const tryAdd = (it: PlannedItem) => {
    if (fits(t, taken, it)) { items.push(it); taken.push(it); return true; }
    skipped++;
    return false;
  };

  // How many blocks of each kind
  const perBlock = { houses: 10, townhouses: 6, apartments: 6 };
  const need = {
    centre: Math.ceil(centreList.length / 6),
    school: size === "eco" ? 0 : 1,
    apartments: Math.ceil(plan.apartments / perBlock.apartments),
    townhouses: Math.ceil(plan.townhouses / perBlock.townhouses),
    houses: Math.ceil(plan.houses / perBlock.houses),
  };
  const totalBlocks = need.centre + need.school + need.apartments + need.townhouses + need.houses;
  // Grid: 2C columns × 2R rows of blocks around the centre, wider than deep.
  let R = 1, C = 1;
  while (4 * C * R < totalBlocks * 1.35) { if (C <= R * 1.6) C++; else R++; }

  // Streets: every block edge. Main street runs along v = 0.
  const roads: PlannedRoad[] = [];
  const uSpan = C * BW, vSpan = R * BD;
  for (let r = -R; r <= R; r++) roads.push({ type: r === 0 ? "main" : plan.street, name: r === 0 ? "Main Street" : undefined, pts: [toWorld(f, -uSpan, r * BD), toWorld(f, uSpan, r * BD)] });
  for (let c = -C; c <= C; c++) roads.push({ type: plan.street, pts: [toWorld(f, c * BW, -vSpan), toWorld(f, c * BW, vSpan)] });

  // Blocks, nearest the centre first
  const blocks: { u0: number; v0: number; u1: number; v1: number; d: number }[] = [];
  for (let c = -C; c < C; c++) for (let r = -R; r < R; r++) {
    const u0 = c * BW, v0 = r * BD;
    blocks.push({ u0, v0, u1: u0 + BW, v1: v0 + BD, d: Math.hypot(u0 + BW / 2, (v0 + BD / 2) * 1.6) });
  }
  blocks.sort((a, b2) => a.d - b2.d);
  const marginFor = (blk: (typeof blocks)[number]): [number, number, number, number] => {
    const edge = (v: number) => (Math.abs(v) < 1 ? roadHalf("main") : roadHalf(plan.street)) + 2;
    return [edge(blk.v0), edge(blk.v1), roadHalf(plan.street) + 2, roadHalf(plan.street) + 2];
  };

  let bi = 0;
  // Town centre: civic buildings packed along the street fronts of the central blocks.
  const centreQueue = [...centreList];
  for (let k = 0; k < need.centre && bi < blocks.length; k++, bi++) {
    const blk = blocks[bi];
    const [mt, mb, ml, mr] = marginFor(blk);
    for (const side of [-1, 1] as const) {
      let a = blk.u0 + ml;
      while (centreQueue.length) {
        const type = centreQueue[0];
        const fp = CATALOG_BY_TYPE[type];
        if (fp.d > (blk.v1 - blk.v0 - mt - mb) / 2 + 6 || fp.w > BW - ml - mr) { centreQueue.shift(); skipped++; continue; }
        if (a + fp.w > blk.u1 - mr) break;
        const v = side === -1 ? blk.v0 + mt + 3 + fp.d / 2 : blk.v1 - mb - 3 - fp.d / 2;
        const [x, z] = toWorld(f, a + fp.w / 2, v);
        tryAdd({ type, x, z, rot: f.rot + (side === -1 ? Math.PI : 0) });
        centreQueue.shift();
        a += fp.w + 3;
      }
    }
  }
  // Primary school gets a block to itself.
  for (let k = 0; k < need.school && bi < blocks.length; k++, bi++) {
    const blk = blocks[bi];
    const [x, z] = toWorld(f, (blk.u0 + blk.u1) / 2, (blk.v0 + blk.v1) / 2);
    tryAdd({ type: "school", x, z, rot: f.rot });
  }
  // Housing, densest nearest the centre.
  const fillBlocks = (count: number, fill: LotFill) => {
    for (let k = 0; k < count && bi < blocks.length; k++, bi++) {
      const blk = blocks[bi];
      const r = fillBlock(f, blk.u0, blk.v0, blk.u1, blk.v1, fill === "houses" && random && rnd() < 0.2 ? "mixed" : fill, marginFor(blk));
      lots.push(...r.lots);
      r.items.forEach(tryAdd);
    }
  };
  fillBlocks(need.apartments, "apartments");
  fillBlocks(need.townhouses, "townhouses");
  fillBlocks(need.houses, "houses");
  // Some lots get skipped on steep ground; keep adding house blocks until the town is big enough.
  const target = { eco: 150, small: 3000, large: 6000 }[size];
  const housed = () => items.reduce((s, i) => s + (CATALOG_BY_TYPE[i.type].people ?? 0), 0);
  while (housed() < target && bi < blocks.length) fillBlocks(1, "houses");

  // Edge zones outside the grid: sport to the west, industry + utilities to the east.
  const place = (type: ItemType, side: -1 | 1, slot: { u: number; v: number }) => {
    const fp = CATALOG_BY_TYPE[type];
    for (let attempt = 0; attempt < 14; attempt++) {
      const [x, z] = toWorld(f, slot.u + side * fp.w / 2, slot.v + fp.d / 2);
      if (tryAdd({ type, x, z, rot: f.rot })) { slot.v += fp.d + 10; return true; }
      skipped--; // retries don't count as skipped
      slot.v += 25;
    }
    skipped++;
    return false;
  };
  const west = { u: -S * (uSpan + 30), v: -vSpan };
  const east = { u: S * (uSpan + 30), v: -vSpan };
  const W = (-S) as 1 | -1;
  if (size !== "eco") place("oval", W, west);
  if (size === "large") place("highschool", W, west);
  for (const type of (size === "eco" ? ["workshop"] : size === "small" ? ["warehouse", "workshop", "workshop", "hardware", "servo"] : ["warehouse", "warehouse", "workshop", "workshop", "hardware", "servo", "servo", "silos"]) as ItemType[])
    place(type, S, east);

  // Utilities: keep adding until supply meets demand.
  const asPlaced = () => [...existing, ...items.map((i, k) => ({ id: -k - 1, ...i, base: 0, minH: 0, earthM3: 0 }))] as Placed[];
  const meter = (key: string) => computeMeters(asPlaced()).find((m) => m.key === key)!;
  const utilities = { u: S * (uSpan + 200), v: -vSpan };
  const addUntil = (key: string, type: ItemType, max = 12) => {
    for (let i = 0; i < max; i++) {
      const m = meter(key);
      if (m.supply >= m.demand) return;
      if (!place(type, S, utilities)) return;
    }
  };
  // Jobs first (they also use power and water), then size the utilities for everything.
  if (size !== "eco") place("agedcare", W, west);
  addUntil("jobs", size === "eco" ? "workshop" : "warehouse", size === "eco" ? 3 : 20);
  if (size === "eco") addUntil("water", "windmill", 20); else { addUntil("water", "watertreat"); place("watertower", S, utilities); }
  addUntil("sewage", "sewage");
  addUntil("power", "solar");
  place("battery", S, utilities);
  addUntil("comms", "telecom");
  addUntil("health", "clinic");
  addUntil("safety", "police");
  addUntil("food", "shop");
  addUntil("primary", "school");
  if (size !== "eco") addUntil("secondary", "highschool", 2);
  addUntil("power", "solar"); // services added above also use power
  // A road out to the utilities and industry.
  roads.push({ type: plan.street, pts: [toWorld(f, S * uSpan, 0), toWorld(f, S * (uSpan + 330), 0)] });

  const people = items.reduce((s, i) => s + (CATALOG_BY_TYPE[i.type].people ?? 0), 0);
  return { roads, items, lots, people, skipped, note: plan.note };
}
