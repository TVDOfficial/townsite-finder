import "server-only";
import { USER_AGENT } from "./overpass";
import type { NativeTitle, ProtectedArea } from "./types";

const CAPAD = "https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/CAPAD/MapServer/0";
const NNTT = "https://services2.arcgis.com/rzk7fNEt0xoEp3cX/arcgis/rest/services/NNTT_Custodial_AGOL/FeatureServer";

async function pointQuery<T>(layer: string, lng: number, lat: number, fields: string, timeoutMs: number): Promise<T[]> {
  const q = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: fields,
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${layer}/query?${q}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${new URL(layer).host} ${res.status}`);
  const json = (await res.json()) as { features?: { attributes: T }[]; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return (json.features ?? []).map((f) => f.attributes);
}

/** Protected area (national park, reserve, Indigenous Protected Area…) containing the point. */
export async function protectedAreaAt(lng: number, lat: number, timeoutMs = 8000): Promise<ProtectedArea | null> {
  const rows = await pointQuery<{ NAME: string; TYPE: string; GOVERNANCE: string }>(CAPAD, lng, lat, "NAME,TYPE,GOVERNANCE", timeoutMs);
  if (!rows.length) return null;
  const r = rows[0];
  // Governance "TO" = managed by Traditional Owners (Indigenous Protected Areas)
  return { name: r.NAME, type: r.TYPE, indigenous: r.GOVERNANCE === "TO" || /indigenous/i.test(r.TYPE) };
}

/** Native title determinations and open claims covering the point. */
export async function nativeTitleAt(lng: number, lat: number, timeoutMs = 10000): Promise<NativeTitle> {
  const [outcomes, claims] = await Promise.all([
    pointQuery<{ Name: string; Determined_Outcome: string; Tribunal_ID: string }>(`${NNTT}/5`, lng, lat, "Name,Determined_Outcome,Tribunal_ID", timeoutMs),
    pointQuery<{ Name: string; Tribunal_ID: string; Status?: string }>(`${NNTT}/7`, lng, lat, "Name,Tribunal_ID", timeoutMs),
  ]);
  const o = outcomes[0];
  const c = claims[0];
  return {
    determination: o ? { name: o.Name, outcome: o.Determined_Outcome, id: o.Tribunal_ID } : undefined,
    claim: c ? { name: c.Name, id: c.Tribunal_ID } : undefined,
  };
}
