export type StateCode = "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "NT" | "ACT";
export type LngLat = [number, number];

export const STATE_NAMES: Record<StateCode, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
  NT: "Northern Territory",
  ACT: "Australian Capital Territory",
};

export interface RejectedPoint {
  lng: number;
  lat: number;
  reason: "near-town" | "protected" | "aboriginal" | "military" | "water" | "residential";
  label?: string;
}

export interface PickResult {
  lng: number;
  lat: number;
  state: StateCode;
  rejected: RejectedPoint[];
  tried: number;
  warning?: string;
}

export interface AreaInfo {
  state?: string;
  lga?: string;
  locality?: string;
  protectedArea?: string;
  aboriginalLand?: string;
  military?: string;
  water?: string;
  residential?: boolean;
  landuse: string[];
}

export interface ProtectedArea {
  name: string;
  type: string;
  indigenous: boolean;
}

export interface NativeTitle {
  determination?: { name: string; outcome: string; id: string };
  claim?: { name: string; id: string };
}

export interface NearFeature {
  name: string;
  kind: string;
  km: number;
  lng: number;
  lat: number;
  intermittent?: boolean;
  salt?: boolean;
  detail?: string;
}

export interface Place {
  name: string;
  type: "city" | "town" | "village" | "hamlet";
  population: number;
  km: number;
  lng: number;
  lat: number;
}

export interface Photo {
  thumb: string;
  full: string;
  page: string;
  title: string;
  credit: string;
  km: number;
  source: "Wikimedia Commons" | "Mapillary";
}

export interface Terrain {
  elevation: number;
  min: number;
  max: number;
  meanSlope: number; // percent
  maxSlope: number; // percent
  flatShare: number; // 0..1 share of cells under 5% slope
  gridSize: number;
  spacingM: number;
  slopes: number[]; // row-major slope % for heatmap
}

export interface Climate {
  annualRainMm: number;
  monthlyRainMm: number[];
  monthlyMaxC: number[];
  monthlyMinC: number[];
  hotDaysPerYear: number; // > 40°C
  frostDaysPerYear: number; // < 0°C
  wettestMonth: number;
  years: string;
}

export interface SpotDetails {
  lng: number;
  lat: number;
  state: StateCode | null;
  protectedArea: ProtectedArea | null;
  nativeTitle: NativeTitle | null;
  terrain: Terrain | null;
  climate: Climate | null;
  places: Place[];
  nearestTown: Place | null;
  nearestCity: { name: string; km: number; lng: number; lat: number };
  hospital: { name: string; km: number; lng: number; lat: number } | null;
  photos: Photo[];
  errors: string[];
}

export interface NearbyDetails {
  area: AreaInfo | null;
  water: NearFeature[] | null;
  infrastructure: {
    majorRoad?: NearFeature;
    localRoad?: NearFeature;
    powerLine?: NearFeature;
    substation?: NearFeature;
    railway?: NearFeature;
    airport?: NearFeature;
  } | null;
  errors: string[];
}
