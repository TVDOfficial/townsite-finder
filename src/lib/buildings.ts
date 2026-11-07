import "server-only";
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { haversineKm } from "./geo";
import type { BuildingPoint, Buildings, LngLat } from "./types";

// Overture Maps building footprints (includes Microsoft's ML-detected buildings, which cover
// rural homesteads and sheds that OpenStreetMap often misses). Read straight from S3 by range request.
const BUCKET = "https://overturemaps-extras-us-west-2.s3.amazonaws.com";
const FALLBACK_RELEASE = "2026-10-21.0";
/** Footprints smaller than this are mostly water tanks, troughs or detection noise. */
const MIN_AREA_M2 = 20;
/** Full-detail tiles are used out to this distance; beyond it, zoom-13 tiles (which drop some small sheds). */
const DETAIL_KM = 4;

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

// ---------- Footprints ----------
interface Footprint { c: LngLat; areaM2: number; kind: string; source: string }

/** A best guess at what a footprint is, from its tags (when mapped by people) or its size. */
function classify(areaM2: number, props: Record<string, unknown>): string {
  const tag = String(props.class ?? props.subtype ?? "").toLowerCase();
  if (/house|residential|detached|homestead|farmhouse|bungalow/.test(tag)) return "House";
  if (/shed|barn|farm_auxiliary|agricultural|stable|greenhouse|silo/.test(tag)) return "Farm shed";
  if (/industrial|warehouse|commercial|retail/.test(tag)) return "Industrial or commercial building";
  if (/garage|carport/.test(tag)) return "Garage or carport";
  if (areaM2 < 60) return "Small shed, carport or water tank";
  if (areaM2 < 250) return "House or shed";
  if (areaM2 < 1000) return "Large shed or homestead";
  return "Very large shed (e.g. poultry, machinery or industrial)";
}

function footprintOf(f: VectorTileFeature, x: number, y: number, z: number): Footprint | null {
  const g = f.toGeoJSON(x, y, z).geometry;
  const ring = (g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null) as LngLat[] | null;
  if (!ring || ring.length < 3) return null;
  const c: LngLat = [ring.reduce((s, q) => s + q[0], 0) / ring.length, ring.reduce((s, q) => s + q[1], 0) / ring.length];
  const kx = 111320 * Math.cos((c[1] * Math.PI) / 180), ky = 110574;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - c[0]) * kx * (ring[i][1] - c[1]) * ky - (ring[i][0] - c[0]) * kx * (ring[j][1] - c[1]) * ky;
  const areaM2 = Math.abs(a / 2);
  const src = String(f.properties["@geometry_source"] ?? "");
  return {
    c, areaM2, kind: classify(areaM2, f.properties),
    source: /microsoft/i.test(src) ? "Detected by Microsoft AI from satellite imagery" : src ? `Mapped by ${src}` : "Overture Maps",
  };
}

async function footprintsInTile(pm: PMTiles, z: number, x: number, y: number): Promise<Footprint[]> {
  const tile = await pm.getZxy(z, x, y, AbortSignal.timeout(8000));
  if (!tile) return [];
  const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.building;
  if (!layer) return [];
  const out: Footprint[] = [];
  for (let k = 0; k < layer.length; k++) {
    const fp = footprintOf(layer.feature(k), x, y, z);
    if (fp && fp.areaM2 >= MIN_AREA_M2) out.push(fp);
  }
  return out;
}

function tileGrid(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return {
    cx: Math.floor(((lng + 180) / 360) * n),
    cy: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
    tileKm: (40075 * Math.cos(r)) / n,
  };
}

/** Search outward ring by ring at one zoom level; returns the nearest building within maxKm, if any. */
async function searchRings(pm: PMTiles, p: LngLat, z: number, fromKm: number, maxKm: number): Promise<number | null> {
  const { cx, cy, tileKm } = tileGrid(p[0], p[1], z);
  const first = Math.max(0, Math.floor(fromKm / tileKm) - 1);
  const last = Math.ceil(maxKm / tileKm);
  for (let ring = first; ring <= last; ring++) {
    const cells: [number, number][] = [];
    for (let dx = -ring; dx <= ring; dx++)
      for (let dy = -ring; dy <= ring; dy++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cells.push([cx + dx, cy + dy]);
    let nearest = Infinity;
    for (let i = 0; i < cells.length; i += 100) {
      const lists = await Promise.all(cells.slice(i, i + 100).map(([x, y]) => footprintsInTile(pm, z, x, y)));
      for (const fp of lists.flat()) nearest = Math.min(nearest, haversineKm(p, fp.c));
    }
    if (nearest <= maxKm) return nearest;
  }
  return null;
}

/**
 * Is there any building within `km` of the point? Always uses full-detail tiles for the
 * nearest 4 km, then coarser tiles further out. Stops at the first hit, so busy farmland
 * is rejected quickly.
 */
export async function hasBuildingWithin(lng: number, lat: number, km: number): Promise<{ found: boolean; km?: number }> {
  const pm = await getSource();
  const p: LngLat = [lng, lat];
  const near = await searchRings(pm, p, 14, 0, Math.min(km, DETAIL_KM));
  if (near != null) return { found: true, km: near };
  if (km > DETAIL_KM) {
    const far = await searchRings(pm, p, 13, DETAIL_KM, km);
    if (far != null) return { found: true, km: far };
  }
  return { found: false };
}

/** Buildings within ~3 km of a point, with a guess at what each one is. */
export async function buildingsNear(lng: number, lat: number, radiusKm = 3): Promise<Buildings> {
  const pm = await getSource();
  const { cx, cy } = tileGrid(lng, lat, 14);
  const p: LngLat = [lng, lat];
  const lists = await Promise.all([-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => footprintsInTile(pm, 14, cx + dx, cy + dy))));
  const found = lists.flat()
    .map((fp) => ({ ...fp, km: haversineKm(p, fp.c) }))
    .filter((fp) => fp.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
  const point = (fp: (typeof found)[number]): BuildingPoint => ({
    lng: +fp.c[0].toFixed(5), lat: +fp.c[1].toFixed(5), km: +fp.km.toFixed(2), areaM2: Math.round(fp.areaM2), kind: fp.kind, source: fp.source,
  });
  return {
    within1km: found.filter((b) => b.km <= 1).length,
    within3km: found.length,
    nearest: found[0] ? point(found[0]) : null,
    points: found.slice(0, 200).map(point),
  };
}
