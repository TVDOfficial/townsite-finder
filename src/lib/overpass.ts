import "server-only";
import type { AreaInfo, RejectedPoint } from "./types";

const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
export const USER_AGENT = "townsite-finder/0.1 (+https://github.com/)";

export interface OsmElement {
  type: "node" | "way" | "relation" | "area";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; geometry?: { lat: number; lon: number }[]; lat?: number; lon?: number }[];
  tags?: Record<string, string>;
}

/** Runs a query, falling back to mirror servers, within a total time budget. */
export async function overpass(query: string, budgetMs = 25000): Promise<OsmElement[]> {
  let lastError: unknown;
  const deadline = Date.now() + budgetMs;
  for (const [i, url] of SERVERS.entries()) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    // The main server gets most of the budget; mirrors split what's left.
    const timeout = i === 0 ? Math.round(left * 0.65) : Math.round(left / (SERVERS.length - i));
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(timeout),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[]; remark?: string };
      if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(json.remark);
      return json.elements;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

/** All OSM areas (admin boundaries, parks, land use…) that contain the point. */
export async function areasAt(lat: number, lng: number, timeoutMs = 15000): Promise<AreaInfo> {
  const els = await overpass(`[out:json][timeout:20];is_in(${lat},${lng})->.a;.a out tags;`, timeoutMs);
  const info: AreaInfo = { landuse: [] };
  for (const el of els) {
    const t = el.tags ?? {};
    const name = t.name ?? t["name:en"];
    if (t.boundary === "administrative") {
      if (t.admin_level === "4") info.state = name;
      else if (t.admin_level === "6") info.lga = name;
      else if (t.admin_level === "9" || t.admin_level === "10") info.locality = name;
    }
    const indigenous = t.boundary === "aboriginal_lands" || t.protect_class === "24";
    if (indigenous) info.aboriginalLand = name ?? "Aboriginal land";
    else if (t.boundary === "national_park" || t.boundary === "protected_area" || t.leisure === "nature_reserve")
      info.protectedArea = name ?? "Protected area";
    if (t.landuse === "military" || t.military) info.military = name ?? "Defence land";
    if (t.natural === "water" || t.water || t.natural === "wetland") info.water = name ?? (t.water ?? t.natural);
    if (t.landuse === "residential" || t.place) info.residential = true;
    if (t.landuse) info.landuse.push(t.landuse);
  }
  return info;
}

/** Reason a spot can't be used, or null when it's fine. */
export function blockReason(a: AreaInfo): { reason: RejectedPoint["reason"]; label: string } | null {
  if (a.protectedArea) return { reason: "protected", label: a.protectedArea };
  if (a.aboriginalLand) return { reason: "aboriginal", label: a.aboriginalLand };
  if (a.military) return { reason: "military", label: a.military };
  if (a.water) return { reason: "water", label: a.water };
  if (a.residential) return { reason: "residential", label: "Existing settlement" };
  return null;
}
