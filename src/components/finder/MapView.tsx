"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap, Marker, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import statesData from "@/data/au-states.json";
import type { NearbyDetails, RejectedPoint, SpotDetails } from "@/lib/types";
import { permanentWater, type TownSize } from "@/lib/analysis";

const AUSTRALIA = { center: [134.2, -27.5] as [number, number], zoom: 3.4 };

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    labels: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
    },
    terrain: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 14,
      attribution: "Terrain: Mapzen / AWS Open Data",
    },
    states: { type: "geojson", data: statesData as GeoJSON.FeatureCollection },
    rejected: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    land: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    links: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    parcel: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    buildings: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-saturation": 0.05, "raster-contrast": 0.05 } },
    { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.85 } },
    { id: "states", type: "line", source: "states", paint: { "line-color": "#ffffff", "line-opacity": 0.45, "line-width": 1.2, "line-dasharray": [3, 2] } },
    { id: "parcel-fill", type: "fill", source: "parcel", paint: { "fill-color": "#fb923c", "fill-opacity": 0.08 } },
    { id: "parcel-line", type: "line", source: "parcel", paint: { "line-color": "#fb923c", "line-width": 2.5 } },
    {
      id: "buildings", type: "circle", source: "buildings",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 6],
        "circle-color": ["case", ["get", "likelyFalse"], "rgba(255,255,255,0)", "#ffffff"],
        "circle-stroke-color": ["case", ["get", "likelyFalse"], "rgba(255,255,255,0.55)", "#111"],
        "circle-stroke-width": 1.5,
      },
    },
    { id: "land-fill", type: "fill", source: "land", paint: { "fill-color": "#2ccf93", "fill-opacity": 0.14 } },
    { id: "land-line", type: "line", source: "land", paint: { "line-color": "#2ccf93", "line-width": 2.5, "line-dasharray": [2, 1.5] } },
    { id: "links", type: "line", source: "links", layout: { "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-dasharray": [1, 2] } },
    {
      id: "links-end", type: "circle", source: "links", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 6, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
    },
    {
      id: "rejected-glow", type: "circle", source: "rejected",
      paint: { "circle-radius": ["*", ["get", "t"], 16], "circle-color": ["get", "color"], "circle-opacity": ["*", ["-", 1, ["get", "t"]], 0.5], "circle-blur": 0.6 },
    },
    {
      id: "rejected", type: "circle", source: "rejected",
      paint: { "circle-radius": 3.5, "circle-color": ["get", "color"], "circle-opacity": 0.9, "circle-stroke-color": "rgba(0,0,0,0.35)", "circle-stroke-width": 1 },
    },
  ],
};

const REASON_COLOR: Record<RejectedPoint["reason"], string> = {
  "near-town": "#ef4444",
  protected: "#f59e0b",
  aboriginal: "#a855f7",
  military: "#64748b",
  water: "#3b82f6",
  residential: "#ef4444",
  harder: "#fb923c",
  alternative: "#22c55e",
  building: "#e879f9",
};

function circlePolygon(lng: number, lat: number, radiusM: number): GeoJSON.Feature {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    pts.push([lng + (Math.cos(a) * radiusM) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (Math.sin(a) * radiusM) / 110574]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

interface Props {
  rejected: RejectedPoint[];
  spot: { lng: number; lat: number } | null;
  details: SpotDetails | null;
  nearby: NearbyDetails | null;
  size: TownSize;
  terrain3d: boolean;
  onRejectedShown?: () => void;
}

export default function MapView({ rejected, spot, details, nearby, size, terrain3d, onRejectedShown }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef<Promise<MlMap> | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const labelMarkers = useRef<Marker[]>([]);
  const spinRef = useRef<number | null>(null);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    readyRef.current = (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      if (cancelled || !el.current) throw new Error("unmounted");
      const map = new ml.Map({
        container: el.current,
        style: STYLE,
        center: AUSTRALIA.center,
        zoom: AUSTRALIA.zoom,
        maxPitch: 80,
        attributionControl: { compact: true },
      });
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-right");
      mapRef.current = map;
      // Stop the slow orbit as soon as the user grabs the map.
      const stopSpin = () => { if (spinRef.current) cancelAnimationFrame(spinRef.current); spinRef.current = null; };
      map.on("mousedown", stopSpin);
      map.on("touchstart", stopSpin);
      map.on("wheel", stopSpin);
      await new Promise<void>((r) => (map.loaded() ? r() : map.once("load", () => r())));
      // Hover a building dot to see what it probably is.
      const tip = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "building-tip" });
      map.on("mouseenter", "buildings", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const pr = f.properties as { kind: string; area: number; km: number; source: string; likelyFalse: boolean | string };
        const km = pr.km < 1 ? `${Math.round(pr.km * 1000)} m` : `${pr.km.toFixed(1)} km`;
        const fake = pr.likelyFalse === true || pr.likelyFalse === "true";
        tip.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(fake
            ? `<b>Possible false detection</b><br/>A lone AI detection with no other buildings within 300 m.<br/>Often rocks, shadows or a creek bed, so it isn't counted.<br/><span style="opacity:.65">${km} from the spot</span>`
            : `<b>${pr.kind}</b><br/>Roof area about ${Math.round(pr.area).toLocaleString()} m² · ${km} from the spot<br/><span style="opacity:.65">${pr.source}</span>`)
          .addTo(map);
      });
      map.on("mouseleave", "buildings", () => { map.getCanvas().style.cursor = ""; tip.remove(); });
      return map;
    })();
    return () => {
      cancelled = true;
      if (spinRef.current) cancelAnimationFrame(spinRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Animate rejected points popping onto the map, one after another.
  useEffect(() => {
    let raf = 0;
    readyRef.current?.then((map) => {
      const src = map.getSource("rejected") as GeoJSONSource;
      if (!rejected.length) { src.setData({ type: "FeatureCollection", features: [] }); onRejectedShown?.(); return; }
      const start = performance.now();
      const per = Math.min(28, 1800 / rejected.length);
      const tick = (now: number) => {
        const elapsed = now - start;
        const features = rejected
          .map((r, i) => ({ r, age: elapsed - i * per }))
          .filter(({ age }) => age > 0)
          .map(({ r, age }) => ({
            type: "Feature" as const,
            properties: { color: REASON_COLOR[r.reason], t: Math.min(1, age / 700) },
            geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
          }));
        src.setData({ type: "FeatureCollection", features });
        if (elapsed < rejected.length * per + 700) raf = requestAnimationFrame(tick);
        else onRejectedShown?.();
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => {});
    return () => cancelAnimationFrame(raf);
  }, [rejected, onRejectedShown]);

  // Fly to the chosen spot.
  useEffect(() => {
    readyRef.current?.then(async (map) => {
      const ml = await import("maplibre-gl");
      markerRef.current?.remove();
      if (spinRef.current) cancelAnimationFrame(spinRef.current);
      if (!spot) {
        map.setTerrain(null);
        map.flyTo({ ...AUSTRALIA, pitch: 0, bearing: 0, duration: 2000 });
        return;
      }
      const node = document.createElement("div");
      node.className = "spot-marker";
      node.innerHTML = '<span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="dot"></span>';
      markerRef.current = new ml.Marker({ element: node }).setLngLat([spot.lng, spot.lat]).addTo(map);
      map.flyTo({ center: [spot.lng, spot.lat], zoom: 12.4, pitch: 58, bearing: -20, duration: 5200, curve: 1.7, essential: true });
      map.once("moveend", () => {
        // Slow cinematic orbit until the user touches the map.
        let last = performance.now();
        const spin = (now: number) => {
          const dt = now - last; last = now;
          map.setBearing(map.getBearing() + dt * 0.004);
          spinRef.current = requestAnimationFrame(spin);
        };
        spinRef.current = requestAnimationFrame(spin);
      });
    }).catch(() => {});
  }, [spot]);

  // 3D terrain toggle.
  useEffect(() => {
    readyRef.current?.then((map) => map.setTerrain(terrain3d && spot ? { source: "terrain", exaggeration: 1.5 } : null)).catch(() => {});
  }, [terrain3d, spot]);

  // Land footprint circle for the chosen town size.
  useEffect(() => {
    readyRef.current?.then((map) => {
      const src = map.getSource("land") as GeoJSONSource;
      if (!spot) { src.setData({ type: "FeatureCollection", features: [] }); return; }
      const r = Math.sqrt((size.landHa * 10000) / Math.PI);
      src.setData({ type: "FeatureCollection", features: [circlePolygon(spot.lng, spot.lat, r)] });
    }).catch(() => {});
  }, [spot, size]);

  // The property parcel the spot sits in, and nearby buildings.
  useEffect(() => {
    readyRef.current?.then((map) => {
      const empty = { type: "FeatureCollection" as const, features: [] };
      const parcel = details?.parcel;
      (map.getSource("parcel") as GeoJSONSource).setData(
        spot && parcel?.outline.length ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: parcel.outline } } : empty,
      );
      const pts = nearby?.buildings?.points ?? [];
      (map.getSource("buildings") as GeoJSONSource).setData(
        spot
          ? {
              type: "FeatureCollection",
              features: pts.map((b) => ({
                type: "Feature" as const,
                properties: { kind: b.kind, area: b.areaM2, km: b.km, source: b.source, likelyFalse: !!b.likelyFalse },
                geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
              })),
            }
          : empty,
      );
    }).catch(() => {});
  }, [spot, details, nearby]);

  // Lines from the spot to the nearest water, road, power, town and hospital.
  useEffect(() => {
    readyRef.current?.then(async (map) => {
      const ml = await import("maplibre-gl");
      labelMarkers.current.forEach((m) => m.remove());
      labelMarkers.current = [];
      const src = map.getSource("links") as GeoJSONSource;
      if (!spot || !details) { src.setData({ type: "FeatureCollection", features: [] }); return; }
      const targets: { lng: number; lat: number; color: string; label: string }[] = [];
      const w = permanentWater(nearby) ?? nearby?.water?.[0];
      if (w) targets.push({ ...w, color: "#2f80ed", label: `💧 ${w.name} · ${w.km.toFixed(1)} km` });
      const road = nearby?.infrastructure?.majorRoad;
      if (road) targets.push({ ...road, color: "#e8a33d", label: `🛣️ ${road.name} · ${road.km.toFixed(1)} km` });
      const power = nearby?.infrastructure?.powerLine;
      if (power && power.km < 80) targets.push({ ...power, color: "#f2c94c", label: `⚡ ${power.name} · ${power.km.toFixed(1)} km` });
      if (details.nearestTown) targets.push({ ...details.nearestTown, color: "#ffffff", label: `🏘️ ${details.nearestTown.name} · ${details.nearestTown.km.toFixed(0)} km` });
      const features: GeoJSON.Feature[] = [];
      for (const t of targets) {
        features.push({ type: "Feature", properties: { color: t.color }, geometry: { type: "LineString", coordinates: [[spot.lng, spot.lat], [t.lng, t.lat]] } });
        features.push({ type: "Feature", properties: { color: t.color }, geometry: { type: "Point", coordinates: [t.lng, t.lat] } });
        const node = document.createElement("div");
        node.className = "map-label";
        node.style.background = t.color === "#ffffff" ? "rgba(20,20,20,0.85)" : t.color;
        node.style.color = t.color === "#f2c94c" || t.color === "#ffffff" ? (t.color === "#ffffff" ? "#fff" : "#1c1b18") : "#fff";
        node.textContent = t.label;
        labelMarkers.current.push(new ml.Marker({ element: node, anchor: "bottom", offset: [0, -10] }).setLngLat([t.lng, t.lat]).addTo(map));
      }
      src.setData({ type: "FeatureCollection", features });
    }).catch(() => {});
  }, [spot, details, nearby]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
