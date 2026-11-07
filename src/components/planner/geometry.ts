import * as THREE from "three";
import { CATALOG_BY_TYPE, EARTHWORKS_PER_M3, ROADS, roadGradeFactor, type ItemType, type RoadType } from "./catalog";
import type { TerrainData } from "./terrain";

export interface Placed {
  id: number;
  type: ItemType;
  x: number;
  z: number;
  rot: number;
  base: number; // height the building sits at
  minH: number; // lowest terrain under the footprint
  earthM3: number;
}

export interface Road {
  id: number;
  type: RoadType;
  name: string;
  pts: [number, number][];
}

/** Footprint corners in world XZ. */
export function corners(type: ItemType, x: number, z: number, rot: number): [number, number][] {
  const { w, d } = CATALOG_BY_TYPE[type];
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
}

/** Heights under a footprint → where to sit the building and how much earth to move. */
export function siteWorks(t: TerrainData, type: ItemType, x: number, z: number, rot: number) {
  const { w, d } = CATALOG_BY_TYPE[type];
  const c = Math.cos(rot), s = Math.sin(rot);
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const lx = (i / 4 - 0.5) * w, lz = (j / 4 - 0.5) * d;
      const h = t.heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
      min = Math.min(min, h); max = Math.max(max, h); sum += h; n++;
    }
  const avg = sum / n;
  // Sit the building on a level pad at the highest point and fill underneath.
  const earthM3 = w * d * (max - avg);
  return { base: max, minH: min, maxH: max, earthM3 };
}

function project(poly: [number, number][], ax: [number, number]) {
  let lo = Infinity, hi = -Infinity;
  for (const p of poly) { const v = p[0] * ax[0] + p[1] * ax[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return [lo, hi];
}

/** Separating-axis test for two convex quads. */
export function overlaps(a: [number, number][], b: [number, number][]) {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const ax: [number, number] = [-(p2[1] - p1[1]), p2[0] - p1[0]];
      const [a0, a1] = project(a, ax), [b0, b1] = project(b, ax);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  return true;
}

export function placementCost(p: Placed) {
  return CATALOG_BY_TYPE[p.type].cost + p.earthM3 * EARTHWORKS_PER_M3;
}

export function roadUpkeep(lenM: number, type: RoadType) {
  return (lenM / 1000) * ROADS[type].upkeepPerKm;
}

export function roadStats(t: TerrainData, road: Road) {
  let len = 0, climb = 0, horiz = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const [x0, z0] = road.pts[i - 1], [x1, z1] = road.pts[i];
    const h = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(h / 10));
    for (let k = 0; k < steps; k++) {
      const ax = x0 + ((x1 - x0) * k) / steps, az = z0 + ((z1 - z0) * k) / steps;
      const bx = x0 + ((x1 - x0) * (k + 1)) / steps, bz = z0 + ((z1 - z0) * (k + 1)) / steps;
      const dy = t.heightAt(bx, bz) - t.heightAt(ax, az);
      const dh = h / steps;
      len += Math.hypot(dh, dy); climb += Math.abs(dy); horiz += dh;
    }
  }
  const grade = horiz ? (climb / horiz) * 100 : 0;
  const cost = (len / 1000) * ROADS[road.type].perKm * roadGradeFactor(grade);
  return { len, grade, cost };
}

/** A ribbon mesh that hugs the terrain along a polyline. */
export function ribbon(t: TerrainData, pts: [number, number][], width: number, offset = 0, lift = 0.3, vScale = 12, uMetres = false) {
  const samples: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) samples.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    if (i > 0) dist += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
    for (const side of [-1, 1]) {
      const o = offset + (side * width) / 2;
      const x = samples[i][0] + nx * o, z = samples[i][1] + nz * o;
      const y = Math.max(t.heightAt(x, z), t.heightAt(samples[i][0], samples[i][1])) + lift;
      pos.push(x, y, z);
      uv.push(uMetres ? (side * width) / 2 : side < 0 ? 0 : 1, dist / vScale);
    }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Road network: junctions ----------

type P = [number, number];
export type JunctionType = "plain" | "roundabout" | "lights";

export interface Junction {
  key: string;
  x: number;
  z: number;
  arms: number;
  width: number; // widest road meeting here
}

export const pointKey = (p: P) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

function segIntersect(a: P, b: P, c: P, d: P): P | null {
  const r: P = [b[0] - a[0], b[1] - a[1]], s: P = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

/** Closest point on segment a-b to p, with the segment parameter t. */
export function closestOnSegment(p: P, a: P, b: P): { pt: P; t: number; dist: number } {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  const pt: P = [a[0] + t * dx, a[1] + t * dz];
  return { pt, t, dist: Math.hypot(pt[0] - p[0], pt[1] - p[1]) };
}

/**
 * Adds a new road to the network: wherever it crosses another road, or one road ends on
 * another, both get a shared vertex there so it becomes a proper junction.
 */
export function addRoadToNetwork(roads: Road[], road: Road): Road[] {
  const all = [...roads.map((r) => ({ ...r, pts: r.pts.map((p) => [...p] as P) })), { ...road, pts: road.pts.map((p) => [...p] as P) }];
  const nw = all[all.length - 1];

  for (const other of all.slice(0, -1)) {
    // 1. Crossings
    for (let guard = 0; guard < 100; guard++) {
      let hit: { i: number; j: number; p: P } | null = null;
      outer: for (let i = 1; i < nw.pts.length; i++)
        for (let j = 1; j < other.pts.length; j++) {
          const p = segIntersect(nw.pts[i - 1], nw.pts[i], other.pts[j - 1], other.pts[j]);
          if (p) { hit = { i, j, p }; break outer; }
        }
      if (!hit) break;
      nw.pts.splice(hit.i, 0, hit.p);
      other.pts.splice(hit.j, 0, [...hit.p] as P);
    }
    // 2. T-junctions: an end of one road lying on the middle of the other
    const tee = (a: { pts: P[] }, b: { pts: P[] }) => {
      for (const endIdx of [0, a.pts.length - 1]) {
        const e = a.pts[endIdx];
        if (b.pts.some((v) => Math.hypot(v[0] - e[0], v[1] - e[1]) < 0.5)) continue;
        for (let j = 1; j < b.pts.length; j++) {
          const c = closestOnSegment(e, b.pts[j - 1], b.pts[j]);
          if (c.dist < 1.5 && c.t > 0.01 && c.t < 0.99) {
            b.pts.splice(j, 0, [...c.pt] as P);
            a.pts[endIdx] = [...c.pt] as P;
            break;
          }
        }
      }
    };
    tee(nw, other);
    tee(other, nw);
  }
  return all;
}

/** Points where three or more road arms meet. */
export function findJunctions(roads: Road[]): Junction[] {
  const map = new Map<string, Junction>();
  for (const r of roads) {
    const w = ROADS[r.type].width + (r.type === "main" ? 4 : 0);
    r.pts.forEach((p, i) => {
      const arms = i === 0 || i === r.pts.length - 1 ? 1 : 2;
      const k = pointKey(p);
      const j = map.get(k);
      if (j) { j.arms += arms; j.width = Math.max(j.width, w); }
      else map.set(k, { key: k, x: p[0], z: p[1], arms, width: w });
    });
  }
  return [...map.values()].filter((j) => j.arms >= 3);
}

export const JUNCTION_COST: Record<JunctionType, number> = { plain: 0, roundabout: 2_500_000, lights: 650_000 };

/** Grid snapping: building edges line up with grid lines; quarter-turn rotations only. */
export const GRID = 5;
export function snapItem(type: ItemType, x: number, z: number, rot: number) {
  const q = Math.round(rot / (Math.PI / 2));
  const { w, d } = CATALOG_BY_TYPE[type];
  const [ew, ed] = q % 2 === 0 ? [w, d] : [d, w];
  return {
    x: Math.round((x - ew / 2) / GRID) * GRID + ew / 2,
    z: Math.round((z - ed / 2) / GRID) * GRID + ed / 2,
    rot: q * (Math.PI / 2),
  };
}
export const snapToGrid = (x: number, z: number): P => [Math.round(x / GRID) * GRID, Math.round(z / GRID) * GRID];

// ---------- Curved roads ----------
/** Smooth a polyline through its points (Catmull-Rom), sampled about every 6 m. */
export function smoothPath(pts: P[]): P[] {
  if (pts.length < 3) return pts;
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const n = Math.max(8, Math.ceil(curve.getLength() / 6));
  const out = curve.getSpacedPoints(n).map((v) => [v.x, v.z] as P);
  out[0] = pts[0];
  out[out.length - 1] = pts[pts.length - 1]; // keep exact ends so they still snap to other roads
  return out;
}

// ---------- Town boundary ----------
export interface Boundary { cx: number; cz: number; w: number; d: number; rot: number }

export function boundaryCorners(b: Boundary): P[] {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, b.d / 2]].map(([x, z]) => [b.cx + x * c + z * s, b.cz - x * s + z * c]);
}

export function insideBoundary(b: Boundary, x: number, z: number) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const dx = x - b.cx, dz = z - b.cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= b.w / 2 && Math.abs(lz) <= b.d / 2;
}

/** Drag one corner, keeping the opposite corner fixed. */
export function dragCorner(b: Boundary, corner: number, x: number, z: number): Boundary {
  const opp = boundaryCorners(b)[(corner + 2) % 4];
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const dx = x - opp[0], dz = z - opp[1];
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const w = Math.max(100, Math.abs(lx)), d = Math.max(100, Math.abs(lz));
  const hx = (Math.sign(lx) || 1) * w / 2, hz = (Math.sign(lz) || 1) * d / 2;
  return { ...b, w, d, cx: opp[0] + hx * c + hz * s, cz: opp[1] - hx * s + hz * c };
}

export const boundaryAreaHa = (b: Boundary) => (b.w * b.d) / 10000;
