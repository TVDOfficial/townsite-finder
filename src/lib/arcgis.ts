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
// Every state except South Australia publishes parcel boundaries openly (SA's cadastre isn't open data).
const QLD_PARCELS = "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4";
const NSW_LOTS = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9";
const VIC = "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services";
const VIC_PARCELS = `${VIC}/Vicmap_Parcel/FeatureServer/0`;
const VIC_CROWN = `${VIC}/Vicmap_Crown_Land_Tenure/FeatureServer/1`;
const TAS_PARCELS = "https://services.thelist.tas.gov.au/arcgis/rest/services/Public/CadastreParcels/MapServer/0";
const WA = "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer";
const WA_CADASTRE = `${WA}/2`;
const WA_PASTORAL = `${WA}/122`;
const ACT_BLOCKS = "https://services1.arcgis.com/E5n4f1VY84i0xSjy/ArcGIS/rest/services/ACTGOV_BLOCKS/FeatureServer/0";
const NT_WMS = "http://wms1.ntlis.nt.gov.au/ilismap";

type Feature = { attributes: Record<string, unknown>; geometry?: { rings: LngLat[][] } };

async function parcelQueryAll(layer: string, lng: number, lat: number, fields: string, timeoutMs: number, geometry = true): Promise<Feature[]> {
  const q = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: fields, returnGeometry: String(geometry), outSR: "4326", geometryPrecision: "5", maxAllowableOffset: "0.0002", f: "json",
  });
  const res = await fetch(`${layer}/query?${q}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(layer).host} ${res.status}`);
  const json = (await res.json()) as { features?: Feature[]; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.features ?? [];
}
const parcelQuery = async (layer: string, lng: number, lat: number, fields: string, timeoutMs: number, geometry = true) =>
  (await parcelQueryAll(layer, lng, lat, fields, timeoutMs, geometry))[0] ?? null;

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

const str = (v: unknown) => (v == null || v === "" ? undefined : String(v));
const titleCase = (v?: string) => v?.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** NT only offers a WMS service, so read the parcel attributes from GetFeatureInfo (no outline). */
async function ntParcel(lng: number, lat: number, timeoutMs: number): Promise<Record<string, string> | null> {
  const d = 0.005;
  const q = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo", LAYERS: "3", QUERY_LAYERS: "3", SRS: "EPSG:4326",
    BBOX: `${lng - d},${lat - d},${lng + d},${lat + d}`, WIDTH: "101", HEIGHT: "101", X: "50", Y: "50", INFO_FORMAT: "text/plain", FEATURE_COUNT: "1", STYLES: "",
  });
  const res = await fetch(`${NT_WMS}?${q}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`ntlis ${res.status}`);
  const lines = (await res.text()).trim().split("\n");
  if (lines.length < 2) return null;
  const cells = (l: string) => [...l.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const keys = cells(lines[0]), vals = cells(lines[1]);
  return Object.fromEntries(keys.map((k, i) => [k, vals[i] ?? ""]));
}

/** The surveyed land parcel at a point, from the state's own land register. */
export async function parcelAt(lng: number, lat: number, state: StateCode | null, timeoutMs = 10000): Promise<Parcel | null> {
  switch (state) {
    case "QLD": {
      const f = await parcelQuery(QLD_PARCELS, lng, lat, "lot,plan,tenure,lot_area,locality,shire_name,smis_map", timeoutMs);
      if (!f) return null;
      const a = f.attributes, rings = f.geometry?.rings ?? [];
      return {
        state, id: `Lot ${a.lot} on ${a.plan}`, tenure: str(a.tenure), source: "Queensland cadastre",
        areaHa: a.lot_area ? Number(a.lot_area) / 10000 : ringsAreaHa(rings),
        lga: str(a.shire_name), locality: str(a.locality), link: str(a.smis_map), outline: rings,
      };
    }
    case "NSW": {
      const f = await parcelQuery(NSW_LOTS, lng, lat, "lotnumber,planlabel,planlotarea", timeoutMs);
      if (!f) return null;
      const a = f.attributes, rings = f.geometry?.rings ?? [];
      return {
        state, id: `Lot ${a.lotnumber} ${a.planlabel}`, source: "NSW Spatial Services cadastre",
        areaHa: a.planlotarea ? Number(a.planlotarea) / 10000 : ringsAreaHa(rings), outline: rings,
      };
    }
    case "VIC": {
      const f = await parcelQuery(VIC_PARCELS, lng, lat, "parcel_spi,parcel_crown_status", timeoutMs);
      if (!f) return null;
      const a = f.attributes, rings = f.geometry?.rings ?? [];
      let tenure = a.parcel_crown_status === "C" ? "Crown land" : "Freehold";
      let name: string | undefined;
      if (a.parcel_crown_status === "C") {
        const c = await parcelQuery(VIC_CROWN, lng, lat, "tenure", timeoutMs, false).catch(() => null);
        if (c?.attributes.tenure) { name = titleCase(str(c.attributes.tenure)); tenure = `Crown land: ${name}`; }
      }
      return { state, id: `Parcel ${a.parcel_spi}`, tenure, name, source: "Vicmap Property", areaHa: ringsAreaHa(rings), outline: rings };
    }
    case "TAS": {
      const f = await parcelQuery(TAS_PARCELS, lng, lat, "PID,VOLUME,FOLIO,TENURE_TY,CAD_TYPE1,CAD_TYPE2,PROP_NAME,COMP_AREA", timeoutMs);
      if (!f) return null;
      const a = f.attributes, rings = f.geometry?.rings ?? [];
      const detail = [str(a.CAD_TYPE1), str(a.CAD_TYPE2)].filter(Boolean).join(", ");
      return {
        state, id: a.VOLUME ? `Title ${a.VOLUME}/${a.FOLIO}` : `PID ${a.PID}`,
        tenure: [str(a.TENURE_TY), detail].filter(Boolean).join(": "), name: titleCase(str(a.PROP_NAME)), source: "Tasmanian LIST cadastre",
        areaHa: a.COMP_AREA ? Number(a.COMP_AREA) / 10000 : ringsAreaHa(rings), outline: rings,
      };
    }
    case "WA": {
      const [lots, station] = await Promise.all([
        parcelQueryAll(WA_CADASTRE, lng, lat, "objectid", timeoutMs),
        parcelQuery(WA_PASTORAL, lng, lat, "stn_name,pl_no", timeoutMs, false).catch(() => null),
      ]);
      // The public layer has the same parcel at several map scales; keep the most detailed (smallest) one.
      const best = lots.map((l) => ({ rings: l.geometry?.rings ?? [], ha: ringsAreaHa(l.geometry?.rings ?? []) })).filter((l) => l.ha > 0).sort((x, y) => x.ha - y.ha)[0];
      if (!best && !station) return null;
      const stn = station ? titleCase(str(station.attributes.stn_name)) : undefined;
      return {
        state, id: station ? `Pastoral lease ${station.attributes.pl_no}` : "Surveyed parcel",
        tenure: station ? `Pastoral lease: ${stn} Station` : undefined, name: stn ? `${stn} Station` : undefined,
        source: "Landgate SLIP (public)", areaHa: best?.ha ?? 0, outline: best?.rings ?? [],
      };
    }
    case "ACT": {
      const f = await parcelQuery(ACT_BLOCKS, lng, lat, "BLOCK_NUMBER,SECTION_NUMBER,DISTRICT_NAME,DIVISION_NAME,TYPE,LAND_USE_POLICY_ZONES,BLOCK_DERIVED_AREA", timeoutMs);
      if (!f) return null;
      const a = f.attributes, rings = f.geometry?.rings ?? [];
      const where = titleCase(str(a.DIVISION_NAME) ?? str(a.DISTRICT_NAME));
      return {
        state, id: `Block ${a.BLOCK_NUMBER}${a.SECTION_NUMBER ? ` Section ${a.SECTION_NUMBER}` : ""}${where ? `, ${where}` : ""}`,
        tenure: `ACT Crown lease${a.TYPE ? ` (${titleCase(str(a.TYPE))})` : ""}`, name: titleCase(str(a.LAND_USE_POLICY_ZONES)), source: "ACTmapi blocks",
        areaHa: a.BLOCK_DERIVED_AREA ? Number(a.BLOCK_DERIVED_AREA) / 10000 : ringsAreaHa(rings), outline: rings,
      };
    }
    case "NT": {
      const a = await ntParcel(lng, lat, timeoutMs);
      if (!a?.PAR_LABEL) return null;
      const value = Number(a.UCV_AMOUNT);
      return {
        state, id: a.PAR_LABEL, tenure: [a.TENREF_DES, a.OWNER_CAT].filter(Boolean).join(": "), owner: a.OWNER_CAT || undefined,
        name: titleCase(a.PROP_NAME || undefined), value: value > 0 ? value : undefined, link: a.ILIS_LINK || undefined, source: "NTLIS cadastre",
        areaHa: Number(a.PAR_AREA_M) / 10000 || 0, locality: titleCase(a.SUBURB || undefined), outline: [],
      };
    }
    default:
      return null;
  }
}
