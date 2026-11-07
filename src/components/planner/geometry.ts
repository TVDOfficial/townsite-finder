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
