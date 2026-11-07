import "server-only";
import { USER_AGENT } from "./overpass";
import type { LngLat, NativeTitle, Parcel, ProtectedArea, StateCode } from "./types";

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

// ---------- Land parcels (state cadastre) ----------
const QLD_PARCELS = "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4";
const NSW_LOTS = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9";

async function parcelQuery(layer: string, lng: number, lat: number, fields: string, timeoutMs: number) {
  const q = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: fields, returnGeometry: "true", outSR: "4326", geometryPrecision: "5", maxAllowableOffset: "0.0002", f: "json",
  });
  const res = await fetch(`${layer}/query?${q}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(layer).host} ${res.status}`);
  const json = (await res.json()) as { features?: { attributes: Record<string, unknown>; geometry?: { rings: LngLat[][] } }[]; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.features?.[0] ?? null;
}

/** Area of lon/lat rings in hectares (outer ring minus holes, local flat projection). */
function ringsAreaHa(rings: LngLat[][]) {
  if (!rings.length) return 0;
  const lat0 = (rings[0][0][1] * Math.PI) / 180;
  const kx = 111320 * Math.cos(lat0), ky = 110574;
  let total = 0;
  for (const r of rings) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
    total += a / 2; // ArcGIS: outer rings clockwise, holes counter-clockwise
  }
  return Math.abs(total) / 10000;
}

/** The surveyed land parcel at a point. Queensland and NSW publish this openly. */
export async function parcelAt(lng: number, lat: number, state: StateCode | null, timeoutMs = 10000): Promise<Parcel | null> {
  if (state === "QLD") {
    const f = await parcelQuery(QLD_PARCELS, lng, lat, "lot,plan,tenure,lot_area,locality,shire_name,smis_map", timeoutMs);
    if (!f) return null;
    const a = f.attributes;
    const rings = f.geometry?.rings ?? [];
    return {
      state, id: `Lot ${a.lot} on ${a.plan}`, tenure: (a.tenure as string) || undefined,
      areaHa: a.lot_area ? Number(a.lot_area) / 10000 : ringsAreaHa(rings),
      lga: (a.shire_name as string) || undefined, locality: (a.locality as string) || undefined, link: (a.smis_map as string) || undefined,
      outline: rings,
    };
  }
  if (state === "NSW") {
    const f = await parcelQuery(NSW_LOTS, lng, lat, "lotidstring,lotnumber,planlabel,planlotarea", timeoutMs);
    if (!f) return null;
    const a = f.attributes;
    const rings = f.geometry?.rings ?? [];
    return {
      state, id: `Lot ${a.lotnumber} ${a.planlabel}`,
      areaHa: a.planlotarea ? Number(a.planlotarea) / 10000 : ringsAreaHa(rings),
      outline: rings,
    };
  }
  return null;
}
