import "server-only";
import { difficulty, estimateTenure, SIZES, type SizeKey } from "./analysis";
import { protectedAreaAt, nativeTitleAt } from "./arcgis";
import { nearestHospital, nearestMajorCity, nearestPlaces, offsetMeters, randomPointIn, settlementWithin } from "./geo";
import { USER_AGENT } from "./overpass";
import { nearbyFromTiles, nearestPowerLine } from "./tiles";
import { hasBuildingWithin } from "./buildings";
import type { LngLat, NearbyDetails, PickResult, RejectedPoint, SpotDetails, StateCode } from "./types";

const CANDIDATES = 40; // random spots that pass the distance rule
const SHORTLIST = 14; // checked against rainfall, slope and parks
const FINALISTS = 6; // checked against water, roads and native title

const band = (v: number, steps: [number, number][], last: number) => {
  for (const [limit, score] of steps) if (v < limit) return score;
  return last;
};

async function getJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<T>;
}

/** Rainfall + hot days for many points in one request (3 years of daily data). */
async function climateMany(points: LngLat[]) {
  type Row = { daily: { precipitation_sum: (number | null)[]; temperature_2m_max: (number | null)[] } };
  const lat = points.map((p) => p[1].toFixed(3)).join(","), lng = points.map((p) => p[0].toFixed(3)).join(",");
  const data = await getJson<Row | Row[]>(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=2022-01-01&end_date=2024-12-31&daily=precipitation_sum,temperature_2m_max&timezone=GMT`,
  );
  return (Array.isArray(data) ? data : [data]).map((r) => ({
    rain: Math.round(r.daily.precipitation_sum.reduce<number>((s, v) => s + (v ?? 0), 0) / 3),
    hot: Math.round(r.daily.temperature_2m_max.filter((v) => v != null && v > 40).length / 3),
  }));
}

/** Rough slope from a centre point and four points 300 m away. */
async function slopeMany(points: LngLat[]) {
  const lats: string[] = [], lngs: string[] = [];
  for (const [x, y] of points)
    for (const [e, n] of [[0, 0], [300, 0], [-300, 0], [0, 300], [0, -300]]) {
      const [a, b] = offsetMeters(x, y, e, n);
      lats.push(b.toFixed(5)); lngs.push(a.toFixed(5));
    }
  const out: { elevation: number; slope: number }[] = [];
  for (let i = 0; i < lats.length; i += 100) {
    const d = await getJson<{ elevation: number[] }>(`https://api.open-meteo.com/v1/elevation?latitude=${lats.slice(i, i + 100).join(",")}&longitude=${lngs.slice(i, i + 100).join(",")}`);
    for (let k = 0; k < d.elevation.length; k += 5) {
      const [c, e, w, n, s] = d.elevation.slice(k, k + 5);
      out.push({ elevation: c, slope: (Math.hypot(e - w, n - s) / 600) * 100 + (Math.abs(e + w - 2 * c) + Math.abs(n + s - 2 * c)) / 6 });
    }
  }
  return out;
}

function partialDetails(p: LngLat, state: StateCode, extra: Partial<SpotDetails>): SpotDetails {
  return {
    lng: p[0], lat: p[1], state,
    protectedArea: null, nativeTitle: null, parcel: null, terrain: null, climate: null,
    places: [], nearestTown: null, nearestCity: nearestMajorCity(p), hospital: nearestHospital(p),
    photos: [], errors: [],
    ...extra,
  };
}

export async function findEasiest(state: StateCode | "ALL", minKm: number, maxType: number, sizeKey: SizeKey, buildingKm = 2): Promise<PickResult | null> {
  const avoidBuildings = buildingKm > 0;
  const size = SIZES[sizeKey];
  const rejected: RejectedPoint[] = [];
  const started = Date.now();
  let tried = 0;

  // 1. Random spots far enough from towns, pre-ranked by things we already know locally.
  type Cand = { p: LngLat; state: StateCode; pre: number; power?: ReturnType<typeof nearestPowerLine> };
  const gen = (n: number, budgetMs: number): Cand[] => {
    const out: Cand[] = [];
    const until = Date.now() + budgetMs;
    while (out.length < n && tried < 200000 && Date.now() < until) {
      tried++;
      const r = randomPointIn(state);
      if (!r) break;
      const near = settlementWithin(r.p, minKm, maxType);
      if (near) {
        if (rejected.length < 50 && tried % 3 === 0) rejected.push({ lng: r.p[0], lat: r.p[1], reason: "near-town", label: near });
        continue;
      }
      const power = nearestPowerLine(r.p);
      const pre =
        band(power?.km ?? 200, [[5, 5], [15, 20], [40, 45], [80, 70]], 90) +
        band(nearestHospital(r.p)?.km ?? 300, [[40, 5], [80, 25], [150, 50]], 80) +
        band(nearestMajorCity(r.p).km, [[150, 0], [300, 20], [600, 40]], 60);
      out.push({ p: r.p, state: r.state, pre, power });
    }
    return out.sort((a, b) => a.pre - b.pre);
  };

  const pool = gen(CANDIDATES, 12000);
  if (!pool.length) return null;
  let shortlist: Cand[];

  if (!avoidBuildings) {
    shortlist = pool.slice(0, SHORTLIST);
    pool.slice(SHORTLIST).forEach((c) => rejected.push({ lng: c.p[0], lat: c.p[1], reason: "harder", label: "Far from services" }));
  } else {
    // Only spots with no building inside the chosen distance go any further. Check the most
    // promising first, in small parallel batches, and fetch more candidates if we run out.
    shortlist = [];
    let queue = [...pool];
    while (shortlist.length < SHORTLIST && Date.now() - started < 38000) {
      if (!queue.length) {
        const more = gen(CANDIDATES, 4000);
        if (!more.length) break;
        pool.push(...more);
        queue = more;
      }
      const batch = queue.splice(0, 8);
      const results = await Promise.all(batch.map((c) => hasBuildingWithin(c.p[0], c.p[1], buildingKm).catch(() => ({ found: true, km: undefined }))));
      batch.forEach((c, i) => {
        const r = results[i];
        if (r.found) rejected.push({ lng: c.p[0], lat: c.p[1], reason: "building", label: r.km != null ? `Building ${r.km.toFixed(1)} km away` : "Couldn't check for buildings" });
        else shortlist.push(c);
      });
    }
    queue.forEach((c) => rejected.push({ lng: c.p[0], lat: c.p[1], reason: "harder", label: "Not checked" }));
    if (!shortlist.length) return null;
  }

  // 2. Rainfall, slope and parks for the shortlist.
  const pts = shortlist.map((c) => c.p);
  const [climate, slopes, parks] = await Promise.all([
    climateMany(pts).catch(() => null),
    slopeMany(pts).catch(() => null),
    Promise.all(pts.map((p) => protectedAreaAt(p[0], p[1]).catch(() => null))),
  ]);

  const scored = shortlist.map((c, i) => {
    const cl = climate?.[i], sl = slopes?.[i];
    const d = partialDetails(c.p, c.state, {
      protectedArea: parks[i],
      climate: cl ? { annualRainMm: cl.rain, hotDaysPerYear: cl.hot, frostDaysPerYear: 0, monthlyRainMm: [], monthlyMaxC: [], monthlyMinC: [], wettestMonth: 0, years: "2022–2024" } : null,
      terrain: sl ? { elevation: sl.elevation, min: sl.elevation, max: sl.elevation, meanSlope: sl.slope, maxSlope: sl.slope, flatShare: sl.slope < 3 ? 0.95 : sl.slope < 6 ? 0.7 : sl.slope < 12 ? 0.4 : 0.15, gridSize: 0, spacingM: 300, slopes: [] } : null,
    });
    const nearby: NearbyDetails = { area: null, buildings: null, water: null, infrastructure: { powerLine: c.power }, errors: [] };
    return { c, d, nearby, score: difficulty(d, nearby, estimateTenure(d, nearby), size).total };
  });
  scored.sort((a, b) => a.score - b.score);

  // 3. Water, main roads and native title for the finalists, then the full difficulty score.
  const finalists = scored.filter((s) => !s.d.protectedArea).slice(0, FINALISTS);
  scored.filter((s) => !finalists.includes(s)).forEach((s) =>
    rejected.push({ lng: s.c.p[0], lat: s.c.p[1], reason: s.d.protectedArea ? (s.d.protectedArea.indigenous ? "aboriginal" : "protected") : "harder", label: s.d.protectedArea?.name ?? `Score ${s.score}` }),
  );
  if (!finalists.length) return null;

  await Promise.all(finalists.map(async (f) => {
    const [tiles, title] = await Promise.all([
      nearbyFromTiles(f.c.p[0], f.c.p[1], true).catch(() => null),
      nativeTitleAt(f.c.p[0], f.c.p[1]).catch(() => null),
    ]);
    if (tiles) f.nearby = { ...f.nearby, water: tiles.water, infrastructure: { ...tiles.infrastructure, powerLine: f.c.power } };
    f.d.nativeTitle = title;
    f.score = difficulty(f.d, f.nearby, estimateTenure(f.d, f.nearby), size).total;
  }));
  finalists.sort((a, b) => a.score - b.score);
  const [best, ...rest] = finalists;
  rest.forEach((s) => rejected.push({ lng: s.c.p[0], lat: s.c.p[1], reason: "alternative", label: `Score ${s.score}` }));
  const nearName = (p: LngLat) => nearestPlaces(p, 1)[0]?.name ?? "the outback";

  return {
    lng: best.c.p[0], lat: best.c.p[1], state: best.c.state, rejected, tried,
    easy: {
      checked: pool.length,
      score: best.score,
      alternatives: rest.slice(0, 4).map((s) => ({ lng: s.c.p[0], lat: s.c.p[1], score: s.score, near: nearName(s.c.p) })),
    },
  };
}
