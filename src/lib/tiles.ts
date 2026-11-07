import "server-only";
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import powerData from "@/data/power-lines.json";
import { distToSegment, haversineKm } from "./geo";
import { USER_AGENT } from "./overpass";
import type { LngLat, NearbyDetails, NearFeature } from "./types";

// OpenFreeMap serves free OpenMapTiles-schema vector tiles from a CDN (no key needed).
let tileTemplate: Promise<string> | null = null;
function getTemplate(): Promise<string> {
  tileTemplate ??= fetch("https://tiles.openfreemap.org/planet", { headers: { "User-Agent": USER_AGENT }, next: { revalidate: 86400 } })
    .then((r) => r.json())
    .then((j: { tiles: string[] }) => j.tiles[0])
    .catch((e) => { tileTemplate = null; throw e; });
  return tileTemplate;
}

async function getTile(z: number, x: number, y: number): Promise<VectorTile | null> {
  const url = (await getTemplate()).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000), next: { revalidate: 604800 } });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`tiles ${res.status}`);
  return new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
}

function tileOf(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
}

async function tilesAround(lng: number, lat: number, z: number, radius = 1) {
  const { x, y } = tileOf(lng, lat, z);
  const jobs: Promise<{ tile: VectorTile | null; x: number; y: number }>[] = [];
  for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++)
      jobs.push(getTile(z, x + dx, y + dy).then((tile) => ({ tile, x: x + dx, y: y + dy })));
  return Promise.all(jobs);
}

type Geom = { type: string; coordinates: unknown };
function nearestOnGeometry(p: LngLat, g: Geom): { km: number; point: LngLat } | null {
  let best: { km: number; point: LngLat } | null = null;
  const visitLine = (line: LngLat[]) => {
    if (line.length === 1) {
      const km = haversineKm(p, line[0]);
      if (!best || km < best.km) best = { km, point: line[0] };
    }
    for (let i = 1; i < line.length; i++) {
      const d = distToSegment(p, line[i - 1], line[i]);
      if (!best || d.km < best.km) best = d;
    }
  };
  const c = g.coordinates as never;
  switch (g.type) {
    case "Point": visitLine([c]); break;
    case "MultiPoint": case "LineString": visitLine(c); break;
    case "MultiLineString": case "Polygon": (c as LngLat[][]).forEach(visitLine); break;
    case "MultiPolygon": (c as LngLat[][][]).forEach((poly) => poly.forEach(visitLine)); break;
  }
  return best;
}

interface Hit { km: number; point: LngLat; props: Record<string, unknown>; layer: string }

function scan(
  tiles: { tile: VectorTile | null; x: number; y: number }[],
  z: number,
  p: LngLat,
  layers: string[],
  onHit: (h: Hit) => void,
) {
  for (const { tile, x, y } of tiles) {
    if (!tile) continue;
    for (const name of layers) {
      const layer = tile.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f: VectorTileFeature = layer.feature(i);
        const near = nearestOnGeometry(p, f.toGeoJSON(x, y, z).geometry as Geom);
        if (near) onHit({ ...near, props: f.properties, layer: name });
      }
    }
  }
}

// ---------- Power lines (bundled from OpenStreetMap) ----------
const POWER = powerData as unknown as number[][];
const powerBoxes = POWER.map((l) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 1; i < l.length; i += 2) {
    if (l[i] < minX) minX = l[i]; if (l[i] > maxX) maxX = l[i];
    if (l[i + 1] < minY) minY = l[i + 1]; if (l[i + 1] > maxY) maxY = l[i + 1];
  }
  return [minX, minY, maxX, maxY];
});

export function nearestPowerLine(p: LngLat): NearFeature | undefined {
  if (!POWER.length) return undefined;
  let best: { km: number; point: LngLat; kv: number } | null = null;
  POWER.forEach((l, idx) => {
    const b = powerBoxes[idx];
    // Cheap reject: bbox more than ~1.5° away and we already have something closer than that
    if (best && best.km < 150 && (p[0] < b[0] - 1.5 || p[0] > b[2] + 1.5 || p[1] < b[1] - 1.5 || p[1] > b[3] + 1.5)) return;
    for (let i = 3; i < l.length; i += 2) {
      const d = distToSegment(p, [l[i - 2], l[i - 1]], [l[i], l[i + 1]]);
      if (!best || d.km < best.km) best = { ...d, kv: l[0] };
    }
  });
  if (!best) return undefined;
  const b = best as { km: number; point: LngLat; kv: number };
  return { km: b.km, lng: b.point[0], lat: b.point[1], kind: "Power line", name: b.kv ? `${b.kv} kV line` : "Power line", detail: b.kv ? `${b.kv} kV` : undefined };
}

// ---------- Everything near the spot ----------
const MAJOR = new Set(["motorway", "trunk", "primary", "secondary"]);
const LOCAL = new Set(["tertiary", "minor", "track", "service"]);

/** quick = low-zoom tiles only (rivers, lakes, main roads) for screening many spots. */
export async function nearbyFromTiles(lng: number, lat: number, quick = false): Promise<Omit<NearbyDetails, "area" | "errors" | "buildings">> {
  const p: LngLat = [lng, lat];
  const [t9, t12, t13] = await Promise.all([
    tilesAround(lng, lat, 9),
    quick ? Promise.resolve([]) : tilesAround(lng, lat, 12),
    quick ? Promise.resolve([]) : tilesAround(lng, lat, 13),
  ]);

  const best: Record<string, Hit> = {};
  const keep = (key: string, h: Hit) => { if (!best[key] || h.km < best[key].km) best[key] = h; };
  const waters: NearFeature[] = [];
  const waterNames: Hit[] = [];

  const onHit = (h: Hit) => {
    const cls = String(h.props.class ?? "");
    const name = (h.props["name:latin"] ?? h.props.name ?? h.props["name:en"]) as string | undefined;
    const intermittent = h.props.intermittent === 1 || h.props.intermittent === true;
    const base = { km: h.km, lng: h.point[0], lat: h.point[1] };
    if (h.layer === "waterway" && ["river", "stream", "canal"].includes(cls)) {
      const kind = cls === "river" ? "River" : cls === "stream" ? "Creek" : "Channel";
      waters.push({ ...base, kind, name: name ?? `Unnamed ${kind.toLowerCase()}`, intermittent });
    } else if (h.layer === "water" && cls !== "swimming_pool") {
      const kind = cls === "ocean" ? "Ocean" : cls === "river" ? "River" : "Lake / dam";
      waters.push({ ...base, kind, name: "", intermittent, salt: cls === "ocean" });
    } else if (h.layer === "water_name") {
      waterNames.push(h);
    } else if (h.layer === "transportation") {
      if (MAJOR.has(cls)) keep("majorRoad", h);
      else if (LOCAL.has(cls)) keep("localRoad", h);
      else if (cls === "rail") keep("railway", h);
    } else if (h.layer === "transportation_name") {
      waterNames.push({ ...h, layer: "road_name" });
    } else if (h.layer === "aerodrome_label") {
      keep("airport", h);
    }
  };

  scan(t9, 9, p, ["waterway", "water", "water_name", "transportation", "transportation_name", "aerodrome_label"], onHit);
  scan(t12, 12, p, ["waterway", "water", "water_name", "transportation", "transportation_name"], onHit);
  scan(t13, 13, p, ["waterway", "water", "water_name", "transportation"], onHit);

  // Give unnamed lakes a name from the nearest water label.
  for (const w of waters) {
    if (w.name) continue;
    const label = waterNames.filter((n) => n.layer === "water_name").map((n) => ({ n, d: haversineKm([w.lng, w.lat], n.point) })).sort((a, b) => a.d - b.d)[0];
    w.name = label && label.d < 3 ? String(label.n.props.name) : w.kind === "Lake / dam" ? "Unnamed lake or dam" : w.kind;
    if (label && label.d < 3 && /salt/i.test(w.name)) w.salt = true;
  }

  const roadName = (h: Hit) => {
    const label = waterNames.filter((n) => n.layer === "road_name").map((n) => ({ n, d: haversineKm(h.point, n.point) })).sort((a, b) => a.d - b.d)[0];
    const cls = String(h.props.class);
    if (label && label.d < 2) return String(label.n.props.name ?? label.n.props.ref ?? cls);
    return cls === "track" ? "Dirt track" : `${cls[0].toUpperCase()}${cls.slice(1)} road`;
  };
  const toFeature = (h: Hit | undefined, kind: string, name: string): NearFeature | undefined =>
    h && { km: h.km, lng: h.point[0], lat: h.point[1], kind, name, detail: h.props.surface ? String(h.props.surface) : undefined };

  // Closest of each water body (dedupe by name + kind)
  const seen = new Map<string, NearFeature>();
  for (const w of waters.sort((a, b) => a.km - b.km)) {
    const key = `${w.kind}|${w.name}`;
    if (!seen.has(key)) seen.set(key, w);
  }

  return {
    water: [...seen.values()].filter((w) => w.kind !== "Ocean" || w.km < 30).slice(0, 8),
    infrastructure: {
      majorRoad: toFeature(best.majorRoad, String(best.majorRoad?.props.class ?? ""), best.majorRoad ? roadName(best.majorRoad) : ""),
      localRoad: toFeature(best.localRoad, String(best.localRoad?.props.class ?? ""), best.localRoad ? roadName(best.localRoad) : ""),
      railway: toFeature(best.railway, "Railway", "Railway line"),
      airport: toFeature(best.airport, "Airfield", String(best.airport?.props.name ?? "Airstrip")),
      powerLine: nearestPowerLine(p),
    },
  };
}
