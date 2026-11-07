import "server-only";
import { haversineKm, nearestHospital, nearestMajorCity, nearestPlaces, offsetMeters, stateAt } from "./geo";
import { areasAt, USER_AGENT } from "./overpass";
import { nativeTitleAt, protectedAreaAt } from "./arcgis";
import { nearbyFromTiles } from "./tiles";
import type { Climate, LngLat, NearbyDetails, Photo, SpotDetails, Terrain } from "./types";

const GRID = 9;
const SPACING = 250; // metres between elevation samples (2 km square)

async function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------- Terrain ----------
async function terrain(lng: number, lat: number): Promise<Terrain> {
  const lats: number[] = [], lngs: number[] = [];
  const half = (GRID - 1) / 2;
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) {
      const [x, y] = offsetMeters(lng, lat, (c - half) * SPACING, (half - r) * SPACING);
      lats.push(+y.toFixed(5)); lngs.push(+x.toFixed(5));
    }
  const data = await getJson<{ elevation: number[] }>(
    `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lngs.join(",")}`,
  );
  const e = data.elevation;
  const at = (r: number, c: number) => e[Math.max(0, Math.min(GRID - 1, r)) * GRID + Math.max(0, Math.min(GRID - 1, c))];
  const slopes: number[] = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) {
      const dx = (at(r, c + 1) - at(r, c - 1)) / ((c === 0 || c === GRID - 1 ? 1 : 2) * SPACING);
      const dy = (at(r + 1, c) - at(r - 1, c)) / ((r === 0 || r === GRID - 1 ? 1 : 2) * SPACING);
      slopes.push(Math.hypot(dx, dy) * 100);
    }
  return {
    elevation: Math.round(at(half, half)),
    min: Math.round(Math.min(...e)),
    max: Math.round(Math.max(...e)),
    meanSlope: slopes.reduce((a, b) => a + b, 0) / slopes.length,
    maxSlope: Math.max(...slopes),
    flatShare: slopes.filter((s) => s < 5).length / slopes.length,
    gridSize: GRID,
    spacingM: SPACING,
    slopes: slopes.map((s) => +s.toFixed(1)),
  };
}

// ---------- Climate (10 years of daily ERA5 data) ----------
async function climate(lng: number, lat: number): Promise<Climate> {
  const startYear = 2015, endYear = 2024;
  const d = await getJson<{ daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[] } }>(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=GMT`,
    25000,
  );
  const years = endYear - startYear + 1;
  const rain = Array(12).fill(0), maxT = Array(12).fill(0), minT = Array(12).fill(0), n = Array(12).fill(0);
  let hot = 0, frost = 0;
  d.daily.time.forEach((t, i) => {
    const m = Number(t.slice(5, 7)) - 1;
    const tx = d.daily.temperature_2m_max[i], tn = d.daily.temperature_2m_min[i], p = d.daily.precipitation_sum[i];
    if (p != null) rain[m] += p;
    if (tx != null && tn != null) { maxT[m] += tx; minT[m] += tn; n[m]++; }
    if (tx != null && tx > 40) hot++;
    if (tn != null && tn < 0) frost++;
  });
  const monthlyRainMm = rain.map((r) => Math.round(r / years));
  return {
    annualRainMm: monthlyRainMm.reduce((a, b) => a + b, 0),
    monthlyRainMm,
    monthlyMaxC: maxT.map((v, i) => +(v / (n[i] || 1)).toFixed(1)),
    monthlyMinC: minT.map((v, i) => +(v / (n[i] || 1)).toFixed(1)),
    hotDaysPerYear: Math.round(hot / years),
    frostDaysPerYear: Math.round(frost / years),
    wettestMonth: monthlyRainMm.indexOf(Math.max(...monthlyRainMm)),
    years: `${startYear}–${endYear}`,
  };
}

// ---------- Photos ----------
async function wikimediaPhotos(lng: number, lat: number): Promise<Photo[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=geosearch&ggscoord=${lat}%7C${lng}&ggsradius=10000&ggsnamespace=6&ggslimit=20&prop=imageinfo%7Ccoordinates&iiprop=url%7Cextmetadata&iiurlwidth=640&origin=*`;
  const d = await getJson<{ query?: { pages: Record<string, { title: string; coordinates?: { lat: number; lon: number }[]; imageinfo?: { thumburl: string; url: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } }>(url);
  const strip = (s?: string) => (s ?? "").replace(/<[^>]+>/g, "").trim();
  return Object.values(d.query?.pages ?? {})
    .filter((pg) => pg.imageinfo?.[0]?.thumburl && /\.(jpe?g|png|webp)$/i.test(pg.title))
    .map((pg) => {
      const ii = pg.imageinfo![0];
      const c = pg.coordinates?.[0];
      const artist = strip(ii.extmetadata?.Artist?.value) || "Unknown";
      const license = strip(ii.extmetadata?.LicenseShortName?.value);
      return {
        thumb: ii.thumburl, full: ii.url, page: ii.descriptionurl,
        title: pg.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
        credit: license ? `${artist} · ${license}` : artist,
        km: c ? haversineKm([lng, lat], [c.lon, c.lat]) : 0,
        source: "Wikimedia Commons" as const,
      };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, 10);
}

async function mapillaryPhotos(lng: number, lat: number): Promise<Photo[]> {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return [];
  const [w, s] = offsetMeters(lng, lat, -5000, -5000);
  const [e, n] = offsetMeters(lng, lat, 5000, 5000);
  const d = await getJson<{ data: { id: string; thumb_1024_url: string; geometry: { coordinates: LngLat } }[] }>(
    `https://graph.mapillary.com/images?access_token=${token}&fields=id,thumb_1024_url,geometry&bbox=${w},${s},${e},${n}&limit=12`,
  );
  return d.data.map((im) => ({
    thumb: im.thumb_1024_url, full: im.thumb_1024_url, page: `https://www.mapillary.com/app/?pKey=${im.id}`,
    title: "Street-level photo", credit: "Mapillary contributors · CC BY-SA",
    km: haversineKm([lng, lat], im.geometry.coordinates), source: "Mapillary" as const,
  }));
}

// ---------- Fast details (no Overpass) ----------
type Safe = <T>(label: string, fn: () => Promise<T>, fallback: T) => Promise<T>;
function makeSafe(errors: string[]): Safe {
  return async (label, fn, fallback) => {
    try { return await fn(); } catch (e) { errors.push(`${label}: ${e instanceof Error ? e.message : "failed"}`); return fallback; }
  };
}

export async function getSpotDetails(lng: number, lat: number): Promise<SpotDetails> {
  const p: LngLat = [lng, lat];
  const errors: string[] = [];
  const safe = makeSafe(errors);

  const [prot, title, terr, clim, wiki, mapi] = await Promise.all([
    safe("Protected areas", () => protectedAreaAt(lng, lat), null),
    safe("Native title", () => nativeTitleAt(lng, lat), null),
    safe("Terrain", () => terrain(lng, lat), null),
    safe("Climate", () => climate(lng, lat), null),
    safe("Photos", () => wikimediaPhotos(lng, lat), [] as Photo[]),
    safe("Mapillary", () => mapillaryPhotos(lng, lat), [] as Photo[]),
  ]);

  return {
    lng, lat,
    state: stateAt(lng, lat),
    protectedArea: prot,
    nativeTitle: title,
    terrain: terr,
    climate: clim,
    places: nearestPlaces(p, 6),
    nearestTown: nearestPlaces(p, 1, 1)[0] ?? null,
    nearestCity: nearestMajorCity(p),
    hospital: nearestHospital(p),
    photos: [...mapi, ...wiki].slice(0, 12),
    errors,
  };
}

// ---------- Slow details (OpenStreetMap via Overpass) ----------
export async function getNearbyDetails(lng: number, lat: number): Promise<NearbyDetails> {
  const errors: string[] = [];
  const safe = makeSafe(errors);
  const [area, near] = await Promise.all([
    // Council name + Aboriginal land from OSM. Public Overpass servers are often busy, so keep this short.
    safe("Council area", () => areasAt(lat, lng, 6000), null),
    safe("Water & infrastructure", () => nearbyFromTiles(lng, lat), null),
  ]);
  return { area, water: near?.water ?? null, infrastructure: near?.infrastructure ?? null, errors };
}
