// Rough, rule-based estimates. Everything here is a guide only, not advice.
import type { NearbyDetails, SpotDetails, StateCode } from "./types";

// ---------- Town sizes ----------
export type SizeKey = "eco" | "small" | "large";
export interface TownSize {
  key: SizeKey;
  label: string;
  people: number;
  peopleRange: string;
  landHa: number;
  waterMLPerYear: number;
  blurb: string;
}
const LITRES_PER_PERSON_DAY = 300;
const mk = (key: SizeKey, label: string, people: number, peopleRange: string, landHa: number, blurb: string): TownSize => ({
  key, label, people, peopleRange, landHa, blurb,
  waterMLPerYear: Math.round((people * LITRES_PER_PERSON_DAY * 365) / 1e6),
});
export const SIZES: Record<SizeKey, TownSize> = {
  eco: mk("eco", "Eco-village", 150, "50–300 people", 120, "A tight-knit community, mostly off-grid."),
  small: mk("small", "Small town", 3000, "1,000–5,000 people", 1000, "A proper country town with shops, a school and a clinic."),
  large: mk("large", "Larger town", 15000, "10,000+ people", 4000, "A regional centre with a hospital and industry."),
};

// ---------- Land tenure estimate ----------
export type TenureKey = "freehold" | "pastoral" | "crown" | "aboriginal" | "protected" | "act-lease";
export interface Tenure {
  key: TenureKey;
  label: string;
  confidence: "low" | "medium" | "high";
  why: string;
  blocked: boolean;
}

export function estimateTenure(d: SpotDetails, n: NearbyDetails | null): Tenure {
  const rain = d.climate?.annualRainMm ?? 400;
  const pa = d.protectedArea;
  if (pa?.indigenous)
    return { key: "aboriginal", label: "Indigenous Protected Area", confidence: "high", blocked: true, why: `Inside ${pa.name}, managed by Traditional Owners.` };
  if (pa) return { key: "protected", label: "Protected area", confidence: "high", blocked: true, why: `Inside ${pa.name} (${pa.type}).` };
  if (n?.area?.aboriginalLand)
    return { key: "aboriginal", label: "Aboriginal land", confidence: "medium", blocked: true, why: `Mapped as ${n.area.aboriginalLand}.` };
  if (d.nativeTitle?.determination && /exclusive\)?$/i.test(d.nativeTitle.determination.outcome) && !/non-exclusive/i.test(d.nativeTitle.determination.outcome))
    return { key: "aboriginal", label: "Exclusive native title", confidence: "high", blocked: true, why: `Exclusive native title held by ${d.nativeTitle.determination.name}.` };

  const s = d.state;
  const pastoral = (why: string): Tenure => ({ key: "pastoral", label: "Pastoral lease (likely)", confidence: "medium", blocked: false, why });
  const freehold = (why: string): Tenure => ({ key: "freehold", label: "Freehold farmland (likely)", confidence: "medium", blocked: false, why });
  const crown = (why: string): Tenure => ({ key: "crown", label: "Unallocated Crown land (possible)", confidence: "low", blocked: false, why });

  switch (s) {
    case "ACT":
      return { key: "act-lease", label: "ACT Crown lease", confidence: "high", blocked: false, why: "All land in the ACT is leased from the government; there is no freehold." };
    case "WA":
      if (rain < 220) return crown("Very dry inland WA is mostly unallocated Crown land or Aboriginal reserves.");
      if (rain < 380 || d.lat > -28.5) return pastoral("Most of WA outside the wheatbelt and south-west is pastoral lease.");
      return freehold("The WA wheatbelt and south-west are mostly freehold farms.");
    case "NT":
      if (rain < 250) return crown("Dry central NT is split between pastoral leases, Aboriginal freehold and Crown land.");
      return pastoral("Outside towns, NT land is mostly pastoral lease or Aboriginal freehold.");
    case "SA":
      if (rain < 170) return crown("The far north of SA is mostly Crown land, reserves and Aboriginal lands.");
      if (rain < 280) return pastoral("North of Goyder's Line, SA land is mostly pastoral lease.");
      return freehold("Southern SA farming country is mostly freehold.");
    case "QLD":
      if (rain < 550) return { ...pastoral("Around two-thirds of Queensland is state leasehold, mostly in the west."), label: "State leasehold (likely)" };
      return freehold("Eastern Queensland farming land is mostly freehold.");
    case "NSW":
      if (d.lng < 146 && rain < 400) return { ...pastoral("This looks like the NSW Western Division, which is mostly Western Lands leases."), label: "Western Lands lease (likely)" };
      return freehold("Most NSW land east of the Western Division is freehold.");
    case "VIC":
      return freehold("Most Victorian rural land is freehold; forests and parks are Crown land.");
    case "TAS":
      return freehold("Farmland in Tasmania is mostly freehold; much of the west is Crown reserve.");
    default:
      return freehold("Defaulting to freehold.");
  }
}

// ---------- Price estimate ----------
const STATE_PRICE_FACTOR: Record<StateCode, number> = { NSW: 1, VIC: 1.3, QLD: 0.9, SA: 0.9, WA: 0.75, TAS: 1.25, NT: 0.6, ACT: 1.5 };

export interface PriceEstimate {
  perHaLow: number;
  perHaHigh: number;
  totalLow: number;
  totalHigh: number;
  extrasLow: number;
  extrasHigh: number;
  note: string;
  available: boolean;
}

export function estimatePrice(d: SpotDetails, tenure: Tenure, size: TownSize): PriceEstimate {
  const rain = d.climate?.annualRainMm ?? 400;
  const cityKm = d.nearestCity.km;
  if (tenure.blocked) {
    return { perHaLow: 0, perHaHigh: 0, totalLow: 0, totalHigh: 0, extrasLow: 0, extrasHigh: 0, available: false, note: "This land isn't normally for sale." };
  }
  let low: number, high: number, note: string;
  if (tenure.key === "pastoral") {
    [low, high] = rain < 200 ? [10, 60] : rain < 350 ? [30, 250] : [150, 900];
    note = "Price to buy the lease (the station). Turning part of it into freehold for a town costs more, and the state has to agree.";
  } else if (tenure.key === "crown") {
    [low, high] = [20, 300];
    note = "There's no market price. The state sets a price by valuation if it agrees to sell, and native title has to be resolved first.";
  } else {
    [low, high] = rain >= 800 ? [8000, 25000] : rain >= 600 ? [5000, 14000] : rain >= 450 ? [2500, 7000] : rain >= 300 ? [800, 3000] : [150, 1000];
    note = "Based on typical rural land values for this rainfall and region. Real prices depend on the property.";
  }
  const f = STATE_PRICE_FACTOR[d.state ?? "NSW"] * (cityKm < 100 ? 2 : cityKm < 250 ? 1.3 : cityKm < 500 ? 1 : 0.75);
  low = Math.round(low * f);
  high = Math.round(high * f);
  const totalLow = low * size.landHa;
  const totalHigh = high * size.landHa;
  // Stamp duty (~4–6%) plus surveys, legal, valuations
  return {
    perHaLow: low, perHaHigh: high, totalLow, totalHigh,
    extrasLow: Math.round(totalLow * 0.04 + 40000),
    extrasHigh: Math.round(totalHigh * 0.06 + 200000),
    note, available: true,
  };
}

// ---------- Difficulty score ----------
export interface ScorePart {
  key: string;
  label: string;
  score: number; // 0 easy … 100 very hard
  weight: number;
  summary: string;
}
export interface Difficulty {
  total: number;
  label: string;
  tone: "good" | "ok" | "hard" | "extreme";
  parts: ScorePart[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const band = (v: number, steps: [number, number][], last: number) => {
  for (const [limit, score] of steps) if (v < limit) return score;
  return last;
};

export function permanentWater(n: NearbyDetails | null) {
  return n?.water?.find((w) => !w.intermittent && !w.salt && w.kind !== "Bore / well" && w.kind !== "Water tank");
}

export function difficulty(d: SpotDetails, n: NearbyDetails | null, tenure: Tenure, size: TownSize): Difficulty {
  const parts: ScorePart[] = [];
  const t = d.terrain;
  const c = d.climate;
  const big = size.key === "large" ? 1 : size.key === "small" ? 0.5 : 0;

  // Land
  const landScore = { freehold: 30, "act-lease": 70, pastoral: 62, crown: 82, aboriginal: 100, protected: 100 }[tenure.key];
  parts.push({ key: "land", label: "Getting the land", weight: 20, score: landScore, summary: tenure.blocked ? "Not normally for sale" : tenure.label });

  // Water
  const pw = permanentWater(n);
  const rain = c?.annualRainMm ?? 400;
  let water = pw ? band(pw.km, [[2, 15], [8, 32], [20, 55], [40, 72]], 85) : n?.water ? 90 : 60;
  water += rain > 900 ? -20 : rain > 600 ? -8 : rain < 250 ? 12 : 0;
  if (size.key === "eco" && rain > 450) water -= 20; // rainwater tanks can carry a small village
  water += big * 10;
  parts.push({ key: "water", label: "Water supply", weight: 20, score: clamp(water), summary: pw ? `${pw.kind} ${pw.km.toFixed(1)} km away · ${rain} mm rain/yr` : `${rain} mm rain/yr${n ? ", no permanent water nearby" : ""}` });

  // Approvals
  let approvals = 35 + big * 30;
  if (d.nativeTitle?.determination && !/extinguished|does not exist/i.test(d.nativeTitle.determination.outcome)) approvals += 15;
  if (d.nativeTitle?.claim) approvals += 10;
  if (tenure.key !== "freehold") approvals += 10;
  parts.push({ key: "approvals", label: "Approvals & rezoning", weight: 15, score: clamp(approvals), summary: d.nativeTitle?.claim ? "Open native title claim" : d.nativeTitle?.determination ? d.nativeTitle.determination.outcome : "Rezoning + subdivision needed" });

  // Access
  const road = n?.infrastructure?.majorRoad;
  const hosp = d.hospital?.km ?? 200;
  const access = (road ? band(road.km, [[3, 8], [10, 25], [25, 45], [50, 65]], 85) : n?.infrastructure ? 90 : 55) * 0.7 + band(hosp, [[30, 10], [80, 35], [150, 60], [300, 80]], 95) * 0.3;
  parts.push({ key: "access", label: "Roads & services", weight: 15, score: clamp(access), summary: road ? `${road.name} ${road.km.toFixed(0)} km · hospital ${hosp.toFixed(0)} km` : `Hospital ${hosp.toFixed(0)} km away` });

  // Power
  const line = n?.infrastructure?.powerLine;
  let power = line ? band(line.km, [[3, 10], [10, 30], [30, 55], [60, 72]], 82) : n?.infrastructure ? 85 : 55;
  if (size.key === "eco") power *= 0.5; // solar + batteries works well at this scale
  parts.push({ key: "power", label: "Power", weight: 10, score: clamp(power), summary: line ? `${line.name} ${line.km.toFixed(0)} km away` : "No grid nearby: solar + batteries" });

  // Terrain
  const terrain = t ? (t.meanSlope - 1.5) * 7 + (1 - t.flatShare) * 50 : 50;
  parts.push({ key: "terrain", label: "Terrain", weight: 10, score: clamp(terrain), summary: t ? `${Math.round(t.flatShare * 100)}% gentle ground · avg slope ${t.meanSlope.toFixed(1)}%` : "Unknown" });

  // Climate
  const hot = c?.hotDaysPerYear ?? 5;
  const climate = 15 + hot * 1.4 + (c && c.frostDaysPerYear > 20 ? 10 : 0) + (rain < 250 ? 15 : 0) + (rain > 1800 ? 15 : 0);
  parts.push({ key: "climate", label: "Climate & hazards", weight: 10, score: clamp(climate), summary: c ? `${hot} days over 40°C a year · bushfire risk ${rain < 600 && hot > 5 ? "high" : "moderate"}` : "Unknown" });

  const total = clamp(parts.reduce((s, p) => s + p.score * p.weight, 0) / parts.reduce((s, p) => s + p.weight, 0));
  const [label, tone] = tenure.blocked
    ? (["Off limits", "extreme"] as const)
    : total < 35 ? (["Achievable", "good"] as const) : total < 55 ? (["Challenging", "ok"] as const) : total < 72 ? (["Hard", "hard"] as const) : (["Extreme", "extreme"] as const);
  return { total: tenure.blocked ? Math.max(total, 90) : total, label, tone, parts };
}
