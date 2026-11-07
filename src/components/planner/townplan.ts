// District-based town layout, closer to how real Australian country towns are planned:
// the highway becomes Main Street with a shopping strip and a town square, a civic precinct
// (police, fire, clinic, aged care) and a school + sports precinct at one end, curving
// residential neighbourhoods with pocket parks and cul-de-sacs, an industrial estate out
// past a green buffer, and a utilities district beyond that (sewage works furthest out).
import type { SizeKey } from "@/lib/analysis";
import { computeMeters } from "./capacity";
import { CATALOG_BY_TYPE, ROADS, type ItemType, type RoadType } from "./catalog";
import { closestOnSegment, insideBoundary, smoothPath, type Boundary, type Placed } from "./geometry";
import { fits, frameOf, toLocal, toWorld, type Frame, type Layout, type PlannedItem, type PlannedRoad } from "./layout";
import type { TerrainData } from "./terrain";

type P = [number, number];
interface Rect { u0: number; u1: number; v0: number; v1: number }
const hits = (a: Rect, b: Rect) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;

const HALF: Record<RoadType, number> = { gravel: ROADS.gravel.width / 2, sealed: ROADS.sealed.width / 2, main: ROADS.main.width / 2 + 2 };
const LOT: Partial<Record<ItemType, { frontage: number; depth: number; setback: number }>> = {
  house: { frontage: 20, depth: 32, setback: 6 },
  townhouses: { frontage: 34, depth: 26, setback: 4 },
  apartments: { frontage: 40, depth: 30, setback: 5 },
};
const TREES = ["Banksia", "Grevillea", "Jacaranda", "Waratah", "Acacia", "Kurrajong", "Bottlebrush", "Ironbark", "Myrtle", "Wilga", "Coolabah", "Paperbark", "Boronia", "Casuarina", "Quandong", "Melaleuca", "Saltbush", "Wattle", "Bloodwood", "Yarran"];

/** The model's front faces local +z; this rotation turns it to face world direction (fx, fz). */
const faceTo = (fx: number, fz: number) => Math.atan2(fx, fz);

/** Small seeded random generator, so the default starter town is the same every time. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spatial index of road centrelines, to keep buildings off roads and find the nearest street. */
class RoadIndex {
  private cells = new Map<string, { x: number; z: number; r: number }[]>();
  add(pts: P[], type: RoadType) {
    const r = HALF[type];
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
        const key = `${Math.floor(x / 25)},${Math.floor(z / 25)}`;
        const cell = this.cells.get(key);
        if (cell) cell.push({ x, z, r }); else this.cells.set(key, [{ x, z, r }]);
      }
    }
  }
  private around(x: number, z: number, reach: number, fn: (p: { x: number; z: number; r: number }) => boolean | void) {
    const cx0 = Math.floor((x - reach) / 25), cx1 = Math.floor((x + reach) / 25);
    const cz0 = Math.floor((z - reach) / 25), cz1 = Math.floor((z + reach) / 25);
    for (let gx = cx0; gx <= cx1; gx++)
      for (let gz = cz0; gz <= cz1; gz++)
        for (const p of this.cells.get(`${gx},${gz}`) ?? []) if (fn(p) === false) return false;
    return true;
  }
  /** True if the footprint (plus a 1.5 m verge) is clear of every road. */
  clear(it: PlannedItem) {
    const { w, d } = CATALOG_BY_TYPE[it.type];
    const c = Math.cos(it.rot), s = Math.sin(it.rot);
    return this.around(it.x, it.z, Math.hypot(w, d) / 2 + 12, (p) => {
      const dx = p.x - it.x, dz = p.z - it.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < w / 2 + p.r + 1.5 && Math.abs(lz) < d / 2 + p.r + 1.5) return false;
    });
  }
  /** Nearest road centreline point within maxR, or null. */
  nearest(x: number, z: number, maxR: number): P | null {
    let best: P | null = null, bd = maxR;
    this.around(x, z, maxR, (p) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = [p.x, p.z]; }
    });
    return best;
  }
}

/** Walk along a polyline by distance. */
function sampler(pts: P[]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  let i = 0;
  const at = (s: number): { p: P; t: P } => {
    s = Math.max(0, Math.min(len, s));
    if (s < cum[i]) i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const a = pts[i], b = pts[i + 1] ?? pts[i];
    const seg = cum[i + 1] - cum[i] || 1;
    const k = (s - cum[i]) / seg;
    const dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
    return { p: [a[0] + dx * k, a[1] + dz * k], t: [dx / dl, dz / dl] };
  };
  return { len, at };
}

interface Hood {
  rect: Rect;
  roadsFrom: number;
  streets: { pts: P[]; type: RoadType }[]; // world points; lots go along these
  parks: P[]; // world
  culs: { c: P; out: P }[]; // cul-de-sac bulb centre + outward direction (world)
  kinds: ItemType[];
  eco: boolean;
}

export function townPlan(t: TerrainData, b: Boundary | null | undefined, size: SizeKey, existing: Placed[] = [], random?: () => number): Layout {
  const varied = !!random;
  const rnd = random ?? seeded(1788);
  const R = (a: number, c: number) => a + rnd() * (c - a);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const names = [...TREES].sort(() => rnd() - 0.5);
  const nameOf = (suffix: string) => `${names.pop() ?? pick(TREES)} ${suffix}`;

  const base = frameOf(b);
  const f: Frame = { cx: base.cx, cz: base.cz, rot: base.rot + (varied ? (rnd() - 0.5) * 0.5 + Math.floor(rnd() * 4) * (Math.PI / 2) : 0) };
  const W = (u: number, v: number): P => toWorld(f, u, v);
  const N: 1 | -1 = varied && rnd() < 0.5 ? -1 : 1; // which side of Main Street the school precinct is on
  const vr = (a: number, c: number, side: number) => (side > 0 ? { v0: a, v1: c } : { v0: -c, v1: -a });

  const eco = size === "eco";
  const g = eco ? 0.5 : 1; // district spacing scale
  const L = { eco: 160, small: 380, large: 600 }[size]; // length of the Main Street shopping strip
  const Ls = L / 2 - 12; // side streets at each end of the strip
  const lane = 44; // rear service lanes behind the shops
  const street: RoadType = eco ? "gravel" : "sealed";
  const reach = Math.max(L, Math.min(t.size / 2 - 120, { eco: 900, small: 1600, large: 2400 }[size]));
  const target = { eco: 150, small: 3000, large: 6000 }[size];

  const roads: PlannedRoad[] = [];
  const items: PlannedItem[] = [];
  const all: { type: ItemType; x: number; z: number; rot: number }[] = [...existing];
  const lots: P[][] = [];
  const idx = new RoadIndex();
  let skipped = 0;

  const addRoadW = (type: RoadType, pts: P[], name?: string): PlannedRoad => {
    const r: PlannedRoad = { type, pts, name };
    roads.push(r);
    idx.add(pts, type);
    return r;
  };
  const addRoad = (type: RoadType, local: P[], name?: string) => addRoadW(type, local.map(([u, v]) => W(u, v)), name);
  const tryAdd = (it: PlannedItem, count = true) => {
    if (idx.clear(it) && fits(t, all, it)) { items.push(it); all.push(it); return true; }
    if (count) skipped++;
    return false;
  };
  /** Place at local (u, v), facing local direction (fu, fv). */
  const put = (type: ItemType, u: number, v: number, fu = 0, fv = 1, count = true) => {
    const [x, z] = W(u, v);
    const [ax, az] = W(u + fu, v + fv);
    return tryAdd({ type, x, z, rot: faceTo(ax - x, az - z) }, count);
  };
  /** Search outwards from local (u, v) for a free spot next to a street, facing it. */
  const putNear = (type: ItemType, u: number, v: number, maxR = 360) => {
    const fp = CATALOG_BY_TYPE[type];
    const reachRoad = Math.max(fp.w, fp.d) / 2 + 22;
    for (let r = 0; r <= maxR; r += 14) {
      const steps = r === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * r) / 20));
      const a0 = rnd() * Math.PI * 2;
      for (let k = 0; k < steps; k++) {
        const a = a0 + (k / steps) * Math.PI * 2;
        const [x, z] = W(u + r * Math.cos(a), v + r * Math.sin(a));
        const near = idx.nearest(x, z, reachRoad);
        if (!near) continue;
        if (tryAdd({ type, x, z, rot: faceTo(near[0] - x, near[1] - z) }, false)) return true;
      }
    }
    skipped++;
    return false;
  };
  /** A row of buildings along one side of a straight road (local coords), facing it. */
  const strip = (o: P, d: P, side: 1 | -1, roadHalf: number, setback: number, limit: number, gap = 6) => {
    const n: P = [-d[1] * side, d[0] * side];
    const s = {
      cur: 0, limit,
      add(type: ItemType, count = true) {
        const fp = CATALOG_BY_TYPE[type];
        for (let k = 0; k < 40; k++) {
          if (s.cur + fp.w > limit) break;
          const along = s.cur + fp.w / 2, off = roadHalf + setback + fp.d / 2;
          if (put(type, o[0] + d[0] * along + n[0] * off, o[1] + d[1] * along + n[1] * off, -n[0], -n[1], false)) { s.cur += fp.w + gap; return true; }
          s.cur += 6;
        }
        if (count) skipped++;
        return false;
      },
    };
    return s;
  };
  type Strip = ReturnType<typeof strip>;
  /** Add to whichever strip has the most room left. */
  const addToStrips = (strips: Strip[], type: ItemType) => {
    const order = [...strips].sort((a, c) => a.cur / a.limit - c.cur / c.limit);
    for (const s of order) if (s.add(type, false)) return true;
    skipped++;
    return false;
  };
  /** Homes on lots down both sides of a street. */
  const lotsAlong = (pts: P[], type: RoadType, kinds: ItemType[], skip?: (x: number, z: number) => boolean) => {
    const S = sampler(pts);
    const ends = 14;
    for (let s = ends, k = 0; ; k++) {
      const kind = kinds[k % kinds.length];
      const lot = LOT[kind]!;
      if (s + lot.frontage > S.len - ends) break;
      const { p, t: tg } = S.at(s + lot.frontage / 2);
      const fp = CATALOG_BY_TYPE[kind];
      for (const side of [-1, 1] as const) {
        const nx = -tg[1] * side, nz = tg[0] * side;
        const off = HALF[type] + 1.5;
        const dist = off + lot.setback + fp.d / 2;
        const cx = p[0] + nx * dist, cz = p[1] + nz * dist;
        if (skip?.(cx, cz)) continue;
        if (!tryAdd({ type: kind, x: cx, z: cz, rot: faceTo(-nx, -nz) }, false)) continue;
        const a0 = -lot.frontage / 2, a1 = lot.frontage / 2, b0 = off, b1 = off + lot.depth;
        lots.push([[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, bb]) => [p[0] + tg[0] * a + nx * bb, p[1] + tg[1] * a + nz * bb] as P));
      }
      s += lot.frontage;
    }
  };
  const housed = () => items.reduce((sum, it) => sum + (CATALOG_BY_TYPE[it.type].people ?? 0), 0);

  // =====================================================================
  // Phase A: all the roads first, so buildings can be fitted around them.
  // =====================================================================

  // Highway in from one side, through town as Main Street, out the other side past industry.
  const bendW = L / 2 + 320 * g;
  const civicU = -L / 2 - 100;
  const indU0 = L / 2 + 230 * g; // industrial estate starts here
  const indU = indU0 + 160 * g; // Enterprise Drive
  const utilU = indU + 300 * g; // Utilities Road
  const indHalf = { eco: 95, small: 200, large: 340 }[size]; // half-length of Enterprise Drive
  const bendE = Math.max(utilU + 160 * g, L / 2 + 400 * g);
  /** Straight at u0, easing sideways by h at u1. */
  const curve = (u0: number, u1: number, h: number): P[] => {
    const out: P[] = [];
    const n = Math.max(2, Math.ceil(Math.abs(u1 - u0) / 20));
    for (let k = 0; k <= n; k++) { const s = k / n; out.push([u0 + (u1 - u0) * s, (h * (1 - Math.cos(Math.PI * s))) / 2]); }
    return out;
  };
  const hwName = `${pick(["Wattle", "Brolga", "Mulga", "Gidgee", "Mitchell", "Sturt", "Kidman", "Cobb"])} Highway`;
  addRoad("sealed", reach > bendW ? [...curve(-bendW, -reach, varied ? R(-160, 160) : 90).reverse(), [-L / 2, 0]] : [[-reach, 0], [-L / 2, 0]], hwName);
  addRoad("main", [[-L / 2, 0], [L / 2, 0]], "Main Street");
  addRoad("sealed", reach > bendE ? [[L / 2, 0], ...curve(bendE, reach, varied ? R(-160, 160) : -110)] : [[L / 2, 0], [reach, 0]], "Industrial Road");

  const lanes: PlannedRoad[] = [];
  if (!eco) {
    // Rear service lanes and side streets around the shopping strip
    lanes.push(addRoad(street, [[-Ls, -lane], [Ls, -lane]]), addRoad(street, [[-Ls, lane], [Ls, lane]]));
    addRoad(street, [[Ls, -lane], [Ls, lane]]);
    addRoad(street, [[-Ls, -N * lane], [-Ls, N * (lane + 300)]], "School Road");
    addRoad(street, [[civicU, 0], [civicU, -N * 240]], "Civic Drive");
  }
  if (!eco) addRoad(street, [[indU, -indHalf], [indU, indHalf]], "Enterprise Drive");
  const Vd: 1 | -1 = varied ? (rnd() < 0.5 ? 1 : -1) : (-N as 1 | -1);
  const utilRoad = addRoad("gravel", [[utilU, 0], [utilU, Vd * 1000 * g]], "Utilities Road");

  // ---------- Districts that homes stay out of ----------
  const reserved: Rect[] = [
    { u0: -reach - 100, u1: reach + 100, v0: -50, v1: 50 }, // highway corridor
    { u0: -L / 2 - 20, u1: L / 2 + 20, v0: -(lane + 90), v1: lane + 90 }, // town centre
    { u0: L / 2 + 110 * g, u1: 1e5, v0: -(indHalf + 220 * g), v1: indHalf + 220 * g }, // green buffer + industrial estate
    { u0: L / 2 + 110 * g, u1: utilU + 320 * g, ...vr(0, 1100 * g, Vd) }, // utilities district
    { u0: utilU - 320 * g, u1: 1e5, v0: -1e5, v1: 1e5 }, // nothing beyond the utilities
  ];
  if (!eco) {
    reserved.push({ u0: civicU - 80, u1: -L / 2, ...vr(0, 250, -N) }); // civic precinct
    reserved.push({ u0: -Ls - 190, u1: -Ls + 110, ...vr(0, lane + 320, N) }); // school + sports
    reserved.push({ u0: civicU - 250, u1: civicU - 40, ...vr(0, 90, -N) }); // motel + caravan park on the highway
  }

  // ---------- Residential neighbourhoods ----------
  const rectOk = (r: Rect) => {
    const pts: P[] = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1], [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2]];
    return pts.every(([u, v]) => {
      const [x, z] = W(u, v);
      return t.inBounds(x, z, 40) && (!b || insideBoundary(b, x, z));
    });
  };
  const kindsFor = (i: number): ItemType[] => {
    const houses: ItemType[] = ["house", "house", "house", "house", "house", "house", "townhouses"];
    if (eco) return ["house"];
    if (size === "large") return i === 0 ? ["apartments", "townhouses"] : i === 1 ? ["townhouses", "house"] : i === 2 ? ["house", "house", "townhouses"] : houses;
    return i === 0 ? ["townhouses", "house"] : i === 1 ? ["house", "house", "townhouses"] : houses;
  };
  const perMetre = (kinds: ItemType[]) =>
    kinds.reduce((s, k) => s + (CATALOG_BY_TYPE[k].people ?? 0), 0) / kinds.reduce((s, k) => s + LOT[k]!.frontage, 0);

  type Shape = { kind: "rows" | "loop"; hw: number; hh: number; hr: number; rows: number; bb: number; amp: number; wave: number; phase: number; length: number };
  const shapeAt = (i: number): Shape => {
    const loop = eco || (varied ? rnd() < 0.45 : i % 2 === 1);
    const hr = (rnd() - 0.5) * 0.35 + (varied && rnd() < 0.3 ? Math.PI / 2 : 0);
    const amp = R(10, 26), wave = R(180, 280), phase = R(0, Math.PI * 2);
    if (loop) {
      const hw = eco ? R(130, 160) : R(170, 270), bb = eco ? R(70, 85) : 82;
      const perim = 2 * Math.PI * Math.sqrt((hw * hw + bb * bb) / 2);
      return { kind: "loop", hw, hh: bb, hr, rows: 0, bb, amp, wave, phase, length: perim + (eco ? 0 : 2 * hw) };
    }
    const hw = R(180, 280), rows = pick([3, 4, 4, 5]);
    return { kind: "rows", hw, hh: ((rows - 1) * 78) / 2 + amp, hr, rows, bb: 0, amp, wave, phase, length: rows * 2 * hw };
  };
  const rectOf = (s: Shape, cu: number, cv: number): Rect => {
    const ew = s.hw + 34, eh = s.hh + 38; // include the lots (and a cul-de-sac on one side)
    const c = Math.abs(Math.cos(s.hr)), sn = Math.abs(Math.sin(s.hr));
    const du = ew * c + eh * sn, dv = ew * sn + eh * c;
    return { u0: cu - du, u1: cu + du, v0: cv - dv, v1: cv + dv };
  };

  const cands: { u: number; v: number; j: number }[] = [];
  for (let u = -reach; u <= reach; u += 40)
    for (let v = -reach; v <= reach; v += 40) cands.push({ u, v, j: rnd() * 50 });
  const grow = (r: Rect, m: number): Rect => ({ u0: r.u0 - m, u1: r.u1 + m, v0: r.v0 - m, v1: r.v1 + m });
  // How far the neighbourhood's nearest edge is from the town centre (keeps the town compact)
  const edgeDist = (r: Rect) => Math.hypot(Math.max(r.u0, 0, -r.u1) * 1.15, Math.max(r.v0, 0, -r.v1));

  const hoods: Hood[] = [];
  let est = eco ? 0 : L * 2 * perMetre(size === "large" ? ["apartments", "townhouses"] : ["townhouses"]) * 0.5;
  let shape = shapeAt(0);
  for (let misses = 0; est < target * 1.15 && misses < 6; ) {
    const sh = shape;
    const found = cands
      .map((c) => ({ c, r: rectOf(sh, c.u, c.v) }))
      .map((o) => ({ ...o, s: edgeDist(o.r) + 0.25 * Math.hypot(o.c.u, o.c.v) + o.c.j }))
      .sort((a, c) => a.s - c.s)
      .find(({ r }) => !reserved.some((q) => hits(q, r)) && !hoods.some((h) => hits(grow(h.rect, 16), r)) && rectOk(r));
    if (!found) { misses++; shape = shapeAt(hoods.length + misses); continue; }
    const { c, r: rect } = found;
    const kinds = kindsFor(hoods.length);
    const hood: Hood = { rect, roadsFrom: roads.length, streets: [], parks: [], culs: [], kinds, eco };
    const { hw, hr, amp, wave, phase } = shape;
    const cos = Math.cos(hr), sin = Math.sin(hr);
    const HW = (a: number, bb: number): P => W(c.u + a * cos - bb * sin, c.v + a * sin + bb * cos);
    // Which hood-local b direction points away from the town centre
    const outward = (() => {
      const [x0, z0] = HW(0, -10), [x1, z1] = HW(0, 10), [ox, oz] = W(0, 0);
      return Math.hypot(x1 - ox, z1 - oz) > Math.hypot(x0 - ox, z0 - oz) ? 1 : -1;
    })();
    const courtAt = (a0: number, sb: number) => {
      const cb = sb + outward * 73;
      const stem = [HW(a0, sb), HW(a0, sb + outward * 62)];
      addRoadW(street, stem, nameOf(pick(["Court", "Close", "Place"])));
      hood.streets.push({ pts: stem, type: street });
      for (const dir of [1, -1]) {
        const ring: P[] = [];
        for (let k = 0; k <= 8; k++) { const q = (dir * k * Math.PI) / 8; ring.push(HW(a0 + 11 * Math.sin(q), cb - outward * 11 * Math.cos(q))); }
        addRoadW(street, ring);
      }
      const cw = HW(a0, cb), co = HW(a0, cb + outward);
      hood.culs.push({ c: cw, out: [co[0] - cw[0], co[1] - cw[1]] });
    };
    const starts: P[] = [];

    if (shape.kind === "rows") {
      const rows = shape.rows, b0 = -((rows - 1) * 78) / 2;
      const rowB = (j: number, a: number) => b0 + j * 78 + amp * Math.sin((a / wave) * Math.PI * 2 + phase + j * 0.9);
      const rowName = nameOf(pick(["Street", "Avenue", "Way", "Parade"]));
      for (let j = 0; j < rows; j++) {
        const pts: P[] = [];
        for (let a = -hw; a < hw; a += 12) pts.push(HW(a, rowB(j, a)));
        pts.push(HW(hw, rowB(j, hw)));
        addRoadW(street, pts, j === 0 ? rowName : undefined);
        hood.streets.push({ pts, type: street });
      }
      // Gently curved links between the rows at each end, and one straight through the middle
      for (const end of [-hw, hw])
        for (let j = 0; j < rows - 1; j++) {
          const p0 = HW(end, rowB(j, end)), p1 = HW(end, rowB(j + 1, end));
          addRoadW(street, smoothPath([p0, HW(end + Math.sign(end) * 12, (rowB(j, end) + rowB(j + 1, end)) / 2), p1]));
        }
      const am = R(-hw * 0.4, hw * 0.4);
      for (let j = 0; j < rows - 1; j++) addRoadW(street, [HW(am, rowB(j, am)), HW(am, rowB(j + 1, am))]);
      // A cul-de-sac off the outer row
      const jo = outward > 0 ? rows - 1 : 0;
      let ac = R(-hw * 0.6, hw * 0.6);
      if (Math.abs(ac - am) < 60) ac = am + (am > 0 ? -90 : 90);
      courtAt(ac, rowB(jo, ac));
      // Pocket park between two rows
      const pa = R(-hw * 0.5, hw * 0.5), pj = Math.floor(rnd() * (rows - 1));
      hood.parks.push(HW(pa, (rowB(pj, pa) + rowB(pj + 1, pa)) / 2));
      // Links back into town from both ends of the row nearest the centre
      const jn = jo === 0 ? rows - 1 : 0;
      starts.push(HW(-hw, rowB(jn, -hw)), HW(hw, rowB(jn, hw)));
    } else {
      const bb = shape.bb;
      const ell = (ph: number): P => [hw * (1 + 0.07 * Math.sin(3 * ph + phase)) * Math.cos(ph), bb * Math.sin(ph) * (1 + 0.05 * Math.cos(2 * ph + phase))];
      const loopName = nameOf(pick(["Crescent", "Circuit", "Loop"]));
      const halves: P[][] = [];
      for (const [p0, p1] of [[0, Math.PI], [Math.PI, Math.PI * 2]]) {
        const pts: P[] = [];
        for (let k = 0; k <= 28; k++) { const [a, bv] = ell(p0 + ((p1 - p0) * k) / 28); pts.push(HW(a, bv)); }
        halves.push(pts);
        addRoadW(street, pts, halves.length === 1 ? loopName : undefined);
        hood.streets.push({ pts, type: street });
      }
      if (!eco) {
        // A gently bowed street through the middle of the loop
        const aE = ell(0)[0], aW = ell(Math.PI)[0], bow = R(-1, 1) * amp;
        const pts: P[] = [];
        for (let k = 0; k <= 30; k++) { const s = k / 30; pts.push(HW(aW + (aE - aW) * s, bow * Math.sin(Math.PI * s))); }
        addRoadW(street, pts);
        hood.streets.push({ pts, type: street });
        const side = rnd() < 0.5 ? -1 : 1;
        hood.parks.push(HW(R(-hw * 0.4, hw * 0.4), side * (bb / 2 + bow * 0.3)));
      } else {
        hood.parks.push(HW(-30, 0), HW(30, 0)); // village green in the middle
      }
      // Links into town from the side of the loop nearest the centre
      const near = outward > 0 ? halves[1] : halves[0];
      const mid = Math.floor(near.length / 2);
      starts.push(near[Math.max(1, mid - 7)]);
      if (!eco) starts.push(near[Math.min(near.length - 2, mid + 7)]);
      // Sometimes a cul-de-sac off the far side
      if (!eco && rnd() < 0.6) {
        const [a0, sb] = ell((outward > 0 ? Math.PI / 2 : -Math.PI / 2) + R(-0.5, 0.5));
        courtAt(a0, sb);
      }
    }

    // Join the neighbourhood to the streets already there (nearest point on any earlier road)
    const linkName = nameOf(pick(["Road", "Drive", "Street"]));
    starts.forEach((sp, k) => {
      let best = { pt: sp, dist: Infinity };
      for (let r = 0; r < hood.roadsFrom; r++) {
        const pts = roads[r].pts;
        for (let j = 1; j < pts.length; j++) {
          const cc = closestOnSegment(sp, pts[j - 1], pts[j]);
          if (cc.dist < best.dist) best = { pt: cc.pt, dist: cc.dist };
        }
      }
      if (best.dist > 3 && best.dist < 900) addRoadW(street, [sp, best.pt], k === 0 ? linkName : undefined);
    });

    hoods.push(hood);
    est += shape.length * 2 * 0.72 * perMetre(kinds);
    shape = shapeAt(hoods.length);
  }

  // =====================================================================
  // Phase B: buildings, district by district.
  // =====================================================================

  // ---------- Town centre: shops shoulder to shoulder along Main Street, around a town square ----------
  put("park", 0, N * (HALF.main + 2 + 20), 0, -N);
  const strips = ([-1, 1] as const).flatMap((side) =>
    ([-1, 1] as const).map((dir) => {
      const start = side === N ? 23 : 1;
      // A strip heading (dir, 0) has its buildings on side (dir × s) of the street.
      return strip([dir * start, 0], [dir, 0], (side * dir) as 1 | -1, HALF.main, 2, (eco ? L / 2 : Ls - HALF.sealed - 2) - start, 1.5);
    }),
  );
  const shopList = ({
    eco: ["shop", "cafe", "townhall"],
    small: ["townhall", "pub", "shop", "cafe", "bakery", "shop", "clinic", "shop", "cafe", "shop", "bakery", "shop", "pub", "cafe", "shop"],
    large: ["townhall", "pub", "shop", "cafe", "bakery", "shop", "shop", "cafe", "shop", "shop", "bakery", "cafe", "shop", "shop", "pub", "shop", "cafe", "shop", "bakery", "shop", "clinic", "shop", "cafe", "pub"],
  } as Record<SizeKey, ItemType[]>)[size];
  const shops = varied ? [shopList[0], ...shopList.slice(1).sort(() => rnd() - 0.5)] : shopList;
  shops.forEach((type, i) => { if (!strips[i % 4].add(type, false)) addToStrips(strips, type); });

  if (!eco) {
    const back = lane + HALF.sealed + 4;
    const su = R(-L / 4, L / 6);
    if (!put("supermarket", su, -N * (back + 20), 0, N, false)) putNear("supermarket", su, -N * (back + 40));
    put("carpark", su + 27 + 16 + 5, -N * (back + 11), 0, N);
    if (size === "large") put("supermarket", su - 70, -N * (back + 20), 0, N);
    put("church", -Ls + 26, N * (back + 13), 0, -N);
    put("childcare", Ls - 26, N * (back + 9), 0, -N);
    // Townhouses / apartments along the outer side of the rear lanes
    const dense: ItemType[] = size === "large" ? ["apartments", "townhouses"] : ["townhouses"];
    for (const r of lanes) lotsAlong(r.pts, street, dense, (x, z) => Math.abs(toLocal(f, x, z)[1]) < lane);
  }

  // ---------- Civic precinct ----------
  if (!eco) {
    const o: P = [civicU, -N * (HALF.sealed + 6)], d: P = [0, -N];
    const west = strip(o, d, (-N) as 1 | -1, HALF.sealed, 5, 230);
    const east = strip(o, d, N, HALF.sealed, 5, 230);
    west.add("police");
    west.add("fire");
    east.add(size === "large" ? "hospital" : "clinic");
    east.add("agedcare");
    // Motel and caravan park on the highway, past the civic precinct
    const hwStrip = strip([civicU - 50, 0], [-1, 0], N, HALF.sealed, 8, 190, 12);
    hwStrip.add("motel");
    hwStrip.add("caravan");
  }

  // ---------- School + sports precinct ----------
  if (!eco) {
    const westS = strip([-Ls, N * (lane + HALF.sealed + 6)], [0, N], N, HALF.sealed, 5, 290, 8);
    westS.add("school");
    westS.add("pool");
    westS.add("skatepark");
    westS.add("playground");
    put("oval", -Ls - HALF.sealed - 60 - 58, N * (lane + 110), 1, 0);
    const eastS = strip([-Ls, N * (lane + 95)], [0, N], (-N) as 1 | -1, HALF.sealed, 6, 200, 8);
    eastS.add(size === "large" ? "highschool" : "carpark");
    put("bigthing", -bendW + 40, N * (HALF.sealed + 14), 0, -N, false);
  }

  // ---------- Water tower + telecom on the highest ground near town ----------
  const spots: { u: number; v: number; h: number }[] = [];
  for (let u = -700 * g; u <= 700 * g; u += 50)
    for (let v = -700 * g; v <= 700 * g; v += 50) {
      const [x, z] = W(u, v);
      if (t.inBounds(x, z, 60)) spots.push({ u, v, h: t.heightAt(x, z) });
    }
  spots.sort((a, c) => c.h - a.h);
  const towerAt = spots.find((s) => put(eco ? "telecom" : "watertower", s.u, s.v, 0, 1, false));
  if (towerAt && !eco) put("telecom", towerAt.u + 18, towerAt.v + 10, 0, 1, false);

  // ---------- Homes, neighbourhood by neighbourhood (closest to town first) ----------
  let used = 0;
  for (const h of hoods) {
    if (housed() >= target) break;
    used++;
    h.parks.forEach((p, i) => {
      tryAdd({ type: h.eco && i > 0 ? "garden" : "park", x: p[0], z: p[1], rot: f.rot }, false);
      if (i === 0) tryAdd({ type: "playground", x: p[0] + 26 * Math.cos(f.rot), z: p[1] - 26 * Math.sin(f.rot), rot: f.rot }, false);
    });
    for (const s of h.streets) lotsAlong(s.pts, s.type, h.kinds);
    // Houses around each cul-de-sac bulb, facing in
    for (const cul of h.culs) {
      const ol = Math.hypot(cul.out[0], cul.out[1]) || 1;
      const ox = cul.out[0] / ol, oz = cul.out[1] / ol;
      const rr = 11 + HALF[street] + 1.5 + 6 + 7;
      for (const ang of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) {
        const dx = ox * Math.cos(ang) - oz * Math.sin(ang), dz = ox * Math.sin(ang) + oz * Math.cos(ang);
        tryAdd({ type: "house", x: cul.c[0] + dx * rr, z: cul.c[1] + dz * rr, rot: faceTo(-dx, -dz) }, false);
      }
    }
  }
  if (used < hoods.length) roads.length = hoods[used].roadsFrom; // drop neighbourhoods we didn't need

  // ---------- Green buffer + service station at the edge of town ----------
  put("servo", L / 2 + 55 * g, -N * (HALF.sealed + 6 + 13), 0, N, false);
  for (let u = L / 2 + 120 * g; u <= L / 2 + 200 * g; u += 32)
    for (let v = 24; v <= 280 * g; v += 30) {
      put("trees", u + R(-8, 8), v + R(-5, 5), 0, 1, false);
      put("trees", u + R(-8, 8), -v + R(-5, 5), 0, 1, false);
    }

  // ---------- Industrial estate ----------
  const indStrips: Strip[] = eco ? [
    strip([indU0, 0], [1, 0], 1, HALF.sealed, 8, utilU - indU0 - 40, 10),
    strip([indU0, 0], [1, 0], -1, HALF.sealed, 8, utilU - indU0 - 40, 10),
  ] : [
    strip([indU0, 0], [1, 0], 1, HALF.sealed, 8, indU - indU0 - 16, 10),
    strip([indU0, 0], [1, 0], -1, HALF.sealed, 8, indU - indU0 - 16, 10),
    ...([-1, 1] as const).flatMap((dv) => ([-1, 1] as const).map((side) => strip([indU, dv * (HALF.sealed + 8)], [0, dv], side, HALF.sealed, 8, indHalf - 20, 10))),
    strip([indU + 14, 0], [1, 0], 1, HALF.sealed, 8, utilU - indU - 40, 10),
    strip([indU + 14, 0], [1, 0], -1, HALF.sealed, 8, utilU - indU - 40, 10),
  ];
  const industry: ItemType[] = eco ? ["workshop", "workshop"] : size === "small" ? ["hardware", "warehouse", "workshop", "silos", "workshop", "warehouse"] : ["hardware", "warehouse", "warehouse", "workshop", "workshop", "silos", "silos", "warehouse", "workshop"];
  industry.forEach((type) => addToStrips(indStrips, type));

  // ---------- Size services and utilities to what the town needs ----------
  const asPlaced = () => [...existing, ...items.map((i, k) => ({ id: -k - 1, ...i, base: 0, minH: 0, earthM3: 0 }))] as Placed[];
  const short = (key: string) => { const m = computeMeters(asPlaced()).find((mm) => mm.key === key)!; return m.supply < m.demand; };
  const until = (key: string, max: number, add: () => boolean) => { for (let i = 0; i < max && short(key); i++) if (!add()) return; };

  until("jobs", eco ? 3 : 45, () => addToStrips(indStrips, eco ? "workshop" : "warehouse") || putNear(eco ? "workshop" : "warehouse", indU, 0, 500));
  let svc = 0;
  const hoodPark = (): P => { const h = hoods[svc++ % Math.max(1, used)]; return h ? toLocal(f, h.parks[0][0], h.parks[0][1]) : [0, N * 200]; };
  until("health", 3, () => putNear("clinic", civicU, -N * 150));
  until("safety", 2, () => putNear("police", civicU, -N * 180));
  if (!eco) until("food", 2, () => putNear("supermarket", 0, -N * (lane + 60)));
  until("food", 4, () => { const [u, v] = hoodPark(); return putNear("shop", u, v); }); // corner shops in the neighbourhoods
  until("primary", 3, () => { const [u, v] = hoodPark(); return putNear("school", u, v); });
  if (!eco) until("secondary", 2, () => putNear("highschool", -Ls - 60, N * (lane + 260)));

  // Utilities district: water treatment nearest, solar + batteries, sewage works furthest out.
  const utilStrips = ([-1, 1] as const).map((side) => strip([utilU, Vd * (HALF.sealed + 10)], [0, Vd], side, HALF.gravel, 10, 1000 * g - 20, 16));
  const util = (type: ItemType) => () => addToStrips(utilStrips, type);
  until("water", eco ? 20 : 12, util(eco ? "windmill" : "watertreat"));
  until("power", 12, util("solar"));
  util("battery")();
  until("sewage", 8, util("sewage"));
  until("comms", 3, () => (towerAt ? putNear("telecom", towerAt.u, towerAt.v) : util("telecom")()));
  until("power", 6, util("solar")); // the services above use power too
  until("water", 4, util(eco ? "windmill" : "watertreat"));
  const far = Math.max(...utilStrips.map((s) => s.cur)) + 30;
  utilRoad.pts = [W(utilU, 0), W(utilU, Vd * Math.min(1000 * g, far))];

  return {
    roads, items, lots, people: housed(), skipped,
    note: size === "large" ? "Laid out stage 1 (about 6,000 people). Add more with the Block of lots tool to grow it." : undefined,
  };
}
