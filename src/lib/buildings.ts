import "server-only";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { haversineKm } from "./geo";
import type { Buildings, LngLat } from "./types";

// Overture Maps building footprints (includes Microsoft's ML-detected buildings, which cover
// rural homesteads and sheds that OpenStreetMap often misses). Read straight from S3 by range request.
const BUCKET = "https://overturemaps-extras-us-west-2.s3.amazonaws.com";
const FALLBACK_RELEASE = "2026-10-21.0";
const Z = 14;

let source: Promise<PMTiles> | null = null;
let sourceAt = 0;

async function latestRelease(): Promise<string> {
  try {
    const res = await fetch(`${BUCKET}/?list-type=2&prefix=tiles/&delimiter=/`, { signal: AbortSignal.timeout(5000) });
    const xml = await res.text();
    const releases = [...xml.matchAll(/<Prefix>tiles\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort();
    return releases.at(-1) ?? FALLBACK_RELEASE;
  } catch {
    return FALLBACK_RELEASE;
  }
}

function getSource() {
  // Re-check for a newer monthly release once a day.
  if (!source || Date.now() - sourceAt > 86_400_000) {
    sourceAt = Date.now();
    source = latestRelease().then((r) => new PMTiles(`${BUCKET}/tiles/${r}/buildings.pmtiles`));
  }
  return source;
}

function tileOf(lng: number, lat: number) {
  const n = 2 ** Z;
  const r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lng + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) };
}

/**
 * Is there any building within `km` of the point? Searches tiles in rings outward from the
 * centre and stops at the first hit, so busy areas are rejected quickly.
 * Beyond 4 km it uses zoom-13 tiles, which drop some very small sheds.
 */
export async function hasBuildingWithin(lng: number, lat: number, km: number): Promise<{ found: boolean; km?: number }> {
  const pm = await getSource();
  const z = km <= 4 ? 14 : 13;
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  const fx = ((lng + 180) / 360) * n, fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const cx = Math.floor(fx), cy = Math.floor(fy);
  const tileKm = (40075 * Math.cos(r)) / n;
  const rings = Math.ceil(km / tileKm);
  const p: LngLat = [lng, lat];
  for (let ring = 0; ring <= rings; ring++) {
    const cells: [number, number][] = [];
    for (let dx = -ring; dx <= ring; dx++)
      for (let dy = -ring; dy <= ring; dy++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cells.push([cx + dx, cy + dy]);
    let nearest = Infinity;
    // Fetch a ring at a time (max ~100 tiles in flight).
    for (let i = 0; i < cells.length; i += 100) {
      await Promise.all(cells.slice(i, i + 100).map(async ([x, y]) => {
        const tile = await pm.getZxy(z, x, y, AbortSignal.timeout(8000));
        if (!tile) return;
        const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.building;
        if (!layer) return;
        for (let k = 0; k < layer.length; k++) {
          const g = layer.feature(k).toGeoJSON(x, y, z).geometry;
          const ring0 = (g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null) as LngLat[] | null;
          if (!ring0?.length) continue;
          const d = haversineKm(p, ring0[0]);
          if (d < nearest) nearest = d;
        }
      }));
    }
    if (nearest <= km) return { found: true, km: nearest };
  }
  return { found: false };
}

/** Buildings within ~3 km of a point. */
export async function buildingsNear(lng: number, lat: number, radiusKm = 3): Promise<Buildings> {
  const pm = await getSource();
  const { x, y } = tileOf(lng, lat);
  const p: LngLat = [lng, lat];
  const found: { km: number; lng: number; lat: number }[] = [];
  await Promise.all(
    [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map(async (dy) => {
      const tile = await pm.getZxy(Z, x + dx, y + dy, AbortSignal.timeout(8000));
      if (!tile) return;
      const vt = new VectorTile(new PbfReader(new Uint8Array(tile.data)));
      const layer = vt.layers.building;
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) {
        const g = layer.feature(i).toGeoJSON(x + dx, y + dy, Z).geometry;
        const ring = (g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null) as LngLat[] | null;
        if (!ring?.length) continue;
        const c: LngLat = [ring.reduce((s, q) => s + q[0], 0) / ring.length, ring.reduce((s, q) => s + q[1], 0) / ring.length];
        const km = haversineKm(p, c);
        if (km <= radiusKm) found.push({ km, lng: c[0], lat: c[1] });
      }
    })),
  );
  found.sort((a, b) => a.km - b.km);
  return {
    within1km: found.filter((b) => b.km <= 1).length,
    within3km: found.length,
    nearest: found[0] ?? null,
    points: found.slice(0, 150).map((b) => [+b.lng.toFixed(5), +b.lat.toFixed(5)] as LngLat),
  };
}
