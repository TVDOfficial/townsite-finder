"use client";

/* eslint-disable react-hooks/set-state-in-effect -- URL and saved plan are read once on mount */
/* eslint-disable @next/next/no-location-assign-relative-destination -- opening a town elsewhere needs a full reload */

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, FileText, Footprints, Grid3x3, Spline, Minus, Moon, Pause, Play, Plane, Route as RouteIcon, Save, Sparkles, Sun, Undo2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { estimatePrice, estimateTenure, SIZES, type SizeKey } from "@/lib/analysis";
import type { NearbyDetails, SpotDetails } from "@/lib/types";
import { money } from "../ui";
import { computeMeters, itemCapacity } from "./capacity";
import {
  CATALOG, CATALOG_BY_TYPE, CATEGORIES, EARTHWORKS_PER_M3, JUNCTIONS, RATES_PER_DWELLING, ROADS, streetName, townName,
  type Category, type ItemType, type Payer, type RoadType,
} from "./catalog";
import {
  addRoadToNetwork, closestOnSegment, corners, findJunctions, JUNCTION_COST, overlaps, placementCost, roadStats, roadUpkeep,
  siteWorks, snapItem, snapToGrid, smoothPath, insideBoundary, dragCorner, boundaryAreaHa,
  type Boundary, type JunctionType, type Placed, type Road,
} from "./geometry";
import Report from "./Report";
import { BudgetPanel, ItemCard, JunctionCard, PaletteCard, RoadCard, TownsMenu, type Period, type Totals } from "./Panels";
import Scene, { type Tool } from "./Scene";
import { deleteTown, exportFile, findTownAt, importFile, listTowns, loadTown, newId, readShareHash, saveTown, shareLink, type PlanData, type TownMeta } from "./storage";
import { loadTerrain, type TerrainData } from "./terrain";

const LOAD_LINES = ["Downloading elevation data…", "Stitching satellite photos…", "Shaping the hills…", "Pouring the bitumen…"];
type Selection = { kind: "item"; id: number } | { kind: "road"; id: number } | { kind: "junction"; key: string } | null;
type Snapshot = { placed: Placed[]; roads: Road[]; junctionTypes: Record<string, JunctionType> };

export default function Planner() {
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [terrain, setTerrain] = useState<TerrainData | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftRoad, setDraftRoad] = useState<[number, number][]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [rot, setRot] = useState(0);
  const [sel, setSel] = useState<Selection>(null);
  const [hour, setHour] = useState(15.5);
  const [quality, setQuality] = useState(true);
  const [grid, setGrid] = useState(false);
  const [alive, setAlive] = useState(false);
  const [mode, setMode] = useState<"build" | "walk">("build");
  const [tab, setTab] = useState<Category | "Roads">("Housing");
  const [period, setPeriod] = useState<Period>("year");
  const [hoverInfo, setHoverInfo] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [walk, setWalk] = useState({ flying: false, speed: 0, alt: 0, locked: false });
  const [walkPaused, setWalkPaused] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tone: "bad" | "good" } | null>(null);
  const [showTowns, setShowTowns] = useState(false);
  const [towns, setTowns] = useState<TownMeta[]>([]);
  const [saved, setSaved] = useState(false);
  const history = useRef<Snapshot[]>([]);
  const [curvy, setCurvy] = useState(true);
  const [editBoundary, setEditBoundary] = useState(false);
  const [boundaryDrag, setBoundaryDrag] = useState<{ kind: number | "move"; ox: number; oz: number } | null>(null);
  const [site, setSite] = useState<SpotDetails | null>(null);
  const [nearby, setNearby] = useState<NearbyDetails | null>(null);
  const [report, setReport] = useState<string | null | false>(false); // false = closed; otherwise the 3D snapshot (or null)
  const capture = useRef<(() => string) | null>(null);
  const onCapture = useCallback((fn: () => string) => { capture.current = fn; }, []);

  const placed = useMemo(() => plan?.placed ?? [], [plan?.placed]);
  const roads = useMemo(() => plan?.roads ?? [], [plan?.roads]);
  const junctionTypes = useMemo(() => plan?.junctionTypes ?? {}, [plan?.junctionTypes]);

  const flash = (msg: string, tone: "bad" | "good" = "bad") => {
    setToast({ msg, tone });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 1800);
  };

  // ---------- Load: share link → saved town → town at this spot → new town ----------
  useEffect(() => {
    (async () => {
      const sp = new URLSearchParams(window.location.search);
      const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
      const size = ((sp.get("size") as SizeKey) in SIZES ? sp.get("size") : "small") as SizeKey;
      const shared = window.location.hash ? await readShareHash(window.location.hash) : null;
      if (shared) {
        setPlan({ ...shared, id: newId(), name: `${shared.name || "Shared town"}` });
        flash("Opened a shared town. It's saved in your towns now.", "good");
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        return;
      }
      const town = sp.get("town") ? loadTown(sp.get("town")!) : null;
      if (town) { setPlan(town); return; }
      if (!sp.get("lat") || !Number.isFinite(lat) || !Number.isFinite(lng)) { setLoadError("No location given. Pick a spot first."); return; }
      const existing = findTownAt(lat, lng);
      setPlan(existing ?? { v: 2, id: newId(), name: townName(), lat, lng, size, placed: [], roads: [], junctionTypes: {}, nextId: 1, savedAt: Date.now() });
    })();
  }, []);

  // Load terrain for the plan's location
  const location = plan ? `${plan.lat},${plan.lng}` : null;
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    loadTerrain(plan.lng, plan.lat, (p) => !cancelled && setProgress(p))
      .then((t) => { if (!cancelled) setTerrain(t); })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Couldn't load the terrain"));
    return () => { cancelled = true; };
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Site details for land price and the report
  useEffect(() => {
    if (!plan) return;
    const q = `lat=${plan.lat.toFixed(4)}&lng=${plan.lng.toFixed(4)}`;
    fetch(`/api/spot?${q}`).then((r) => r.json()).then((d) => !d.error && setSite(d)).catch(() => {});
    fetch(`/api/nearby?${q}`).then((r) => r.json()).then((d) => !d.error && setNearby(d)).catch(() => {});
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default town boundary: a square big enough for the chosen town size
  useEffect(() => {
    if (!terrain || !plan || plan.boundary) return;
    const side = Math.min(Math.sqrt(SIZES[plan.size].landHa * 10000), terrain.size - 300);
    setPlan((p) => p && { ...p, boundary: { cx: 0, cz: 0, w: Math.round(side), d: Math.round(side), rot: 0 } });
  }, [terrain, plan]);

  // Dragging the boundary handles
  useEffect(() => {
    if (!boundaryDrag) return;
    const up = () => setBoundaryDrag(null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [boundaryDrag]);
  const onBoundaryDrag = useCallback((x: number, z: number) => {
    if (!boundaryDrag) return;
    setPlan((p) => {
      if (!p?.boundary) return p;
      const b = p.boundary;
      const nb: Boundary = boundaryDrag.kind === "move" ? { ...b, cx: x - boundaryDrag.ox, cz: z - boundaryDrag.oz } : dragCorner(b, boundaryDrag.kind, x, z);
      return { ...p, boundary: nb };
    });
  }, [boundaryDrag]);

  // Autosave (debounced) + keep ?town= in the URL so a refresh reopens this town
  useEffect(() => {
    if (!plan) return;
    const id = setTimeout(() => {
      if (saveTown(plan)) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
        const url = `/plan?lat=${plan.lat}&lng=${plan.lng}&size=${plan.size}&town=${plan.id}`;
        if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
      }
    }, 600);
    return () => clearTimeout(id);
  }, [plan]);

  // ---------- Editing helpers (with undo) ----------
  const commit = useCallback((fn: (p: PlanData) => PlanData) => {
    setPlan((p) => {
      if (!p) return p;
      history.current = [...history.current.slice(-49), { placed: p.placed, roads: p.roads, junctionTypes: p.junctionTypes }];
      return fn(p);
    });
  }, []);
  const takeId = (p: PlanData) => p.nextId;

  const undo = useCallback(() => {
    const last = history.current.pop();
    if (last) { setPlan((p) => (p ? { ...p, ...last } : p)); setSel(null); }
  }, []);

  // ---------- Rules ----------
  const boundary = plan?.boundary;
  const validateAt = useCallback((type: ItemType, x: number, z: number, r: number, ignore?: number) => {
    if (!terrain) return { ok: false, base: 0 };
    const sw = siteWorks(terrain, type, x, z, r);
    const poly = corners(type, x, z, r);
    if (!poly.every(([px, pz]) => terrain.inBounds(px, pz, 25))) return { ok: false, base: sw.base, reason: "Too close to the edge of the map" };
    if (sw.maxH - sw.minH > (type === "airstrip" ? 30 : 16)) return { ok: false, base: sw.base, reason: "Too steep to build here" };
    for (const p of placed) {
      if (p.id === ignore) continue;
      const reach = Math.max(CATALOG_BY_TYPE[p.type].w, CATALOG_BY_TYPE[p.type].d) + Math.max(CATALOG_BY_TYPE[type].w, CATALOG_BY_TYPE[type].d);
      if (Math.hypot(p.x - x, p.z - z) > reach) continue;
      if (overlaps(poly, corners(p.type, p.x, p.z, p.rot))) return { ok: false, base: sw.base, reason: `Overlaps the ${CATALOG_BY_TYPE[p.type].name.toLowerCase()}` };
    }
    if (boundary && !insideBoundary(boundary, x, z)) return { ok: true, base: sw.base, reason: "Outside the town boundary" };
    return { ok: true, base: sw.base, reason: sw.maxH - sw.minH > 3 ? `Sloping site: +${money(sw.earthM3 * EARTHWORKS_PER_M3)} earthworks` : undefined };
  }, [terrain, placed, boundary]);

  const validate = useCallback((type: ItemType, x: number, z: number, r: number) =>
    validateAt(type, x, z, r, tool?.kind === "move" ? tool.id : undefined), [validateAt, tool]);

  const collide = useCallback((x: number, z: number, r: number): [number, number] => {
    for (const p of placed) {
      const { w, d } = CATALOG_BY_TYPE[p.type];
      if (p.type === "airstrip" || p.type === "oval" || p.type === "park") continue; // walkable
      if (Math.hypot(p.x - x, p.z - z) > Math.max(w, d)) continue;
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const dx = x - p.x, dz = z - p.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const hx = w / 2 + r, hz = d / 2 + r;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
        const nlx = px < pz ? Math.sign(lx) * hx : lx;
        const nlz = px < pz ? lz : Math.sign(lz) * hz;
        return [p.x + nlx * c + nlz * s, p.z - nlx * s + nlz * c];
      }
    }
    return [x, z];
  }, [placed]);

  // ---------- Snapping ----------
  const snapItemPos = useCallback((type: ItemType, x: number, z: number): [number, number] => {
    if (!grid) return [x, z];
    const s = snapItem(type, x, z, rot);
    return [s.x, s.z];
  }, [grid, rot]);

  const snapRoadPos = useCallback((x: number, z: number): [number, number] => {
    let best: [number, number] | null = null, bd = 15;
    const verts = [...roads.flatMap((r) => r.pts), ...draftRoad.slice(0, -1)];
    for (const p of verts) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = p; } }
    if (best) return best;
    // Snap onto the middle of an existing road (makes a T-junction)
    let seg: [number, number] | null = null, sd = 10;
    for (const r of roads) for (let i = 1; i < r.pts.length; i++) {
      const c = closestOnSegment([x, z], r.pts[i - 1], r.pts[i]);
      if (c.dist < sd) { sd = c.dist; seg = c.pt; }
    }
    if (seg) return seg;
    return grid ? snapToGrid(x, z) : [x, z];
  }, [roads, draftRoad, grid]);

  // ---------- Actions ----------
  const onPlace = (x: number, z: number) => {
    if (!terrain || !tool || (tool.kind !== "item" && tool.kind !== "move")) return;
    const v = validate(tool.type, x, z, rot);
    if (!v.ok) { flash(v.reason ?? "Can't build here"); return; }
    const sw = siteWorks(terrain, tool.type, x, z, rot);
    if (tool.kind === "move") {
      const id = tool.id;
      commit((p) => ({ ...p, placed: p.placed.map((it) => (it.id === id ? { ...it, x, z, rot, base: sw.base, minH: sw.minH, earthM3: sw.earthM3 } : it)) }));
      setTool(null);
      setSel({ kind: "item", id });
      return;
    }
    const type = tool.type;
    commit((p) => ({ ...p, nextId: takeId(p) + 1, placed: [...p.placed, { id: takeId(p), type, x, z, rot, base: sw.base, minH: sw.minH, earthM3: sw.earthM3 }] }));
  };

  const onRoadPoint = (x: number, z: number) => setDraftRoad((d) => [...d, [x, z]]);
  const finishRoad = useCallback(() => {
    if (draftRoad.length >= 2 && tool?.kind === "road") {
      const type = tool.type;
      const pts = curvy ? smoothPath(draftRoad) : draftRoad;
      commit((p) => {
        const road: Road = { id: takeId(p), type, name: streetName(type, p.roads.map((r) => r.name)), pts };
        return { ...p, nextId: takeId(p) + 1, roads: addRoadToNetwork(p.roads, road) };
      });
    }
    setDraftRoad([]);
  }, [draftRoad, tool, commit, curvy]);

  const removeItem = useCallback((id: number) => { commit((p) => ({ ...p, placed: p.placed.filter((x) => x.id !== id) })); setSel(null); }, [commit]);
  const removeRoad = useCallback((id: number) => { commit((p) => ({ ...p, roads: p.roads.filter((x) => x.id !== id) })); setSel(null); }, [commit]);

  const rotateItem = useCallback((id: number, dir: 1 | -1) => {
    const it = placed.find((p) => p.id === id);
    if (!it || !terrain) return;
    const step = grid ? Math.PI / 2 : Math.PI / 12;
    let r = it.rot + dir * step;
    let x = it.x, z = it.z;
    if (grid) { const s = snapItem(it.type, x, z, r); x = s.x; z = s.z; r = s.rot; }
    const v = validateAt(it.type, x, z, r, id);
    if (!v.ok) { flash(v.reason ?? "No room to rotate here"); return; }
    const sw = siteWorks(terrain, it.type, x, z, r);
    commit((p) => ({ ...p, placed: p.placed.map((q) => (q.id === id ? { ...q, x, z, rot: r, base: sw.base, minH: sw.minH, earthM3: sw.earthM3 } : q)) }));
  }, [placed, terrain, grid, validateAt, commit]);

  const startMove = useCallback((id: number) => {
    const it = placed.find((p) => p.id === id);
    if (!it) return;
    setRot(it.rot);
    setTool({ kind: "move", type: it.type, id });
    setSel(null);
  }, [placed]);

  const setJunction = useCallback((key: string, t: JunctionType) => {
    commit((p) => ({ ...p, junctionTypes: { ...p.junctionTypes, [key]: t } }));
  }, [commit]);

  const onJunctionClick = (key: string) => {
    if (tool?.kind === "junction") {
      const cur = junctionTypes[key] ?? "plain";
      setJunction(key, cur === tool.type ? "plain" : tool.type);
    } else setSel({ kind: "junction", key });
  };

  const pickTool = (t: Tool) => {
    setSel(null);
    setDraftRoad([]);
    setTool((cur) => (JSON.stringify(cur) === JSON.stringify(t) ? null : t));
  };

  // Grid on → quarter-turn rotations
  useEffect(() => { if (grid) setRot((r) => Math.round(r / (Math.PI / 2)) * (Math.PI / 2)); }, [grid]);

  // Esc pauses walk mode (pointer lock also releases on Esc)
  useEffect(() => {
    if (mode !== "walk") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setWalkPaused(true); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  // Keyboard shortcuts
  useEffect(() => {
    if (mode !== "build") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "r") {
        if (sel?.kind === "item") rotateItem(sel.id, e.shiftKey ? -1 : 1);
        else setRot((r) => r + (e.shiftKey ? -1 : 1) * (grid ? Math.PI / 2 : Math.PI / 12));
      }
      if (k === "g") setGrid((g) => !g);
      if (k === "c" && tool?.kind === "road") setCurvy((c) => !c);
      if (k === "m" && sel?.kind === "item") startMove(sel.id);
      if (e.key === "Escape") { if (draftRoad.length) setDraftRoad([]); else if (tool) setTool(null); else setSel(null); }
      if (e.key === "Enter") finishRoad();
      if (e.key === "Delete" || e.key === "Backspace") {
        if (sel?.kind === "item") removeItem(sel.id);
        else if (sel?.kind === "road") removeRoad(sel.id);
        else if (sel?.kind === "junction") setJunction(sel.key, "plain");
      }
      if ((e.ctrlKey || e.metaKey) && k === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Derived data ----------
  const junctions = useMemo(() => findJunctions(roads), [roads]);
  const roadInfo = useMemo(() => {
    const m = new Map<number, { len: number; build: number; upkeep: number; grade: number }>();
    if (terrain) for (const r of roads) { const s = roadStats(terrain, r); m.set(r.id, { len: s.len, build: s.cost, upkeep: roadUpkeep(s.len, r.type), grade: s.grade }); }
    return m;
  }, [roads, terrain]);

  const totals = useMemo<Totals>(() => {
    const byCat: Totals["byCat"] = {};
    const byPayer: Record<Payer, number> = { council: 0, state: 0, private: 0 };
    const itemised = new Map<ItemType, { count: number; build: number; upkeep: number }>();
    let earth = 0, people = 0, dwellings = 0;
    for (const p of placed) {
      const c = CATALOG_BY_TYPE[p.type];
      const e = p.earthM3 * EARTHWORKS_PER_M3;
      byCat[c.category] ??= { build: 0, upkeep: 0, count: 0 };
      byCat[c.category].build += c.cost;
      byCat[c.category].upkeep += c.upkeep;
      byCat[c.category].count++;
      byPayer[c.payer] += c.upkeep;
      earth += e;
      people += c.people ?? 0;
      dwellings += c.dwellings ?? 0;
      const row = itemised.get(p.type) ?? { count: 0, build: 0, upkeep: 0 };
      row.count++; row.build += c.cost + e; row.upkeep += c.upkeep;
      itemised.set(p.type, row);
    }
    let roadKm = 0, roadBuild = 0, roadUp = 0;
    for (const r of roadInfo.values()) { roadKm += r.len / 1000; roadBuild += r.build; roadUp += r.upkeep; }
    let junctionBuild = 0, junctionUpkeep = 0;
    for (const j of junctions) {
      const t = junctionTypes[j.key] ?? "plain";
      junctionBuild += JUNCTION_COST[t];
      if (t !== "plain") junctionUpkeep += JUNCTIONS[t].upkeep;
    }
    byPayer.council += roadUp + junctionUpkeep;
    const build = Object.values(byCat).reduce((s, v) => s + v.build, 0) + earth + roadBuild + junctionBuild;
    const upkeep = byPayer.council + byPayer.state + byPayer.private;
    return {
      build, upkeep, byCat, byPayer, earth, roadKm, roadBuild, roadUpkeep: roadUp, junctionBuild, junctionUpkeep, people, dwellings,
      rates: dwellings * RATES_PER_DWELLING,
      itemised: [...itemised.entries()].map(([t, v]) => ({ item: CATALOG_BY_TYPE[t], ...v })).sort((a, b) => b.build - a.build),
    };
  }, [placed, roadInfo, junctions, junctionTypes]);

  const meters = useMemo(() => computeMeters(placed), [placed]);
  const landPrice = useMemo(() => {
    if (!site || !plan) return null;
    const p = estimatePrice(site, estimateTenure(site, nearby), SIZES[plan.size]);
    return p.available ? { low: p.perHaLow, high: p.perHaHigh } : null;
  }, [site, nearby, plan]);
  const draftStats = useMemo(() => (terrain && draftRoad.length >= 2 && tool?.kind === "road" ? roadStats(terrain, { id: 0, type: tool.type, name: "", pts: draftRoad }) : null), [terrain, draftRoad, tool]);
  const selItem = sel?.kind === "item" ? placed.find((p) => p.id === sel.id) : undefined;
  const selRoad = sel?.kind === "road" ? roads.find((r) => r.id === sel.id) : undefined;
  const selJunction = sel?.kind === "junction" ? junctions.find((j) => j.key === sel.key) : undefined;
  const goal = plan ? SIZES[plan.size] : SIZES.small;
  const night = hour < 6.3 || hour > 18.3;

  // ---------- Towns ----------
  const openTowns = () => { setTowns(listTowns()); setShowTowns((s) => !s); };
  const openTown = (t: TownMeta) => {
    if (Math.abs(t.lat - plan!.lat) < 1e-6 && Math.abs(t.lng - plan!.lng) < 1e-6) {
      const p = loadTown(t.id);
      if (p) { setPlan(p); history.current = []; setSel(null); setShowTowns(false); }
    } else {
      // Full reload: a different location needs new terrain and a fresh scene.
      window.location.href = `/plan?lat=${t.lat}&lng=${t.lng}&size=${t.size}&town=${t.id}`;
    }
  };
  const newTown = () => {
    setPlan((p) => p && { v: 2, id: newId(), name: townName(), lat: p.lat, lng: p.lng, size: p.size, placed: [], roads: [], junctionTypes: {}, nextId: 1, savedAt: Date.now() });
    history.current = []; setSel(null); setShowTowns(false);
  };
  const onImport = async (f: File) => {
    const p = await importFile(f);
    if (!p) { flash("That file isn't a Townsite town"); return; }
    const imported = { ...p, id: newId() };
    saveTown(imported);
    setShowTowns(false);
    if (Math.abs(p.lat - plan!.lat) < 1e-6 && Math.abs(p.lng - plan!.lng) < 1e-6) { setPlan(imported); flash(`Imported ${p.name || "town"}`, "good"); }
    else window.location.href = `/plan?lat=${p.lat}&lng=${p.lng}&size=${p.size}&town=${imported.id}`;
  };
  const onShare = async () => {
    try {
      const url = await shareLink(plan!);
      await navigator.clipboard.writeText(url);
      if (url.length > 8000) flash("Link copied, but it's very long. Export a file for big towns.", "good");
      return true;
    } catch { flash("Couldn't copy the link"); return false; }
  };

  // ---------- Render ----------
  if (loadError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6 text-center">
        <div>
          <p className="text-lg font-semibold">{loadError}</p>
          <Link href="/" className="mt-4 inline-block rounded-xl bg-accent px-4 py-2 font-semibold text-white">Back to the finder</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-white select-none">
      {terrain && plan && (
        <Scene
          terrain={terrain} placed={placed} roads={roads} draftRoad={draftRoad} tool={mode === "build" ? tool : null} rot={rot}
          selectedId={sel?.kind === "item" ? sel.id : null} hour={hour} quality={quality} mode={mode}
          validate={validate} collide={collide} onPlace={onPlace} onRoadPoint={onRoadPoint} onFinishRoad={finishRoad}
          onSelect={(id) => setSel(id == null ? null : { kind: "item", id })} onHoverInfo={setHoverInfo}
          onExitWalk={() => setMode("build")} onWalkState={setWalk} onWalkPause={() => setWalkPaused(true)}
          junctions={junctions} junctionTypes={junctionTypes} selectedJunction={sel?.kind === "junction" ? sel.key : null} onJunctionClick={onJunctionClick}
          grid={grid} snapItemPos={snapItemPos} snapRoadPos={snapRoadPos}
          selectedRoadId={sel?.kind === "road" ? sel.id : null} onRoadClick={(id) => setSel({ kind: "road", id })}
          alive={alive} people={totals.people} curvy={curvy}
          boundary={plan.boundary ?? null} editBoundary={editBoundary} boundaryDragging={!!boundaryDrag}
          onBoundaryDragStart={(kind, x, z) => setBoundaryDrag({ kind, ox: x - (plan.boundary?.cx ?? 0), oz: z - (plan.boundary?.cz ?? 0) })}
          onBoundaryDrag={onBoundaryDrag} onCapture={onCapture}
        />
      )}

      {/* ---------- Loading ---------- */}
      <AnimatePresence>
        {!terrain && (
          <motion.div exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.8 }} className="absolute inset-0 z-50 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#12352a,#05090a)]">
            <div className="w-80 text-center">
              <motion.div className="mx-auto mb-6 h-20 w-20 rounded-full border-4 border-emerald-400/30 border-t-emerald-400" animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }} />
              <AnimatePresence mode="wait">
                <motion.p key={Math.min(3, Math.floor(progress * 4))} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-sm text-white/80">
                  {LOAD_LINES[Math.min(3, Math.floor(progress * 4))]}
                </motion.p>
              </AnimatePresence>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400" animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ ease: "easeOut" }} />
              </div>
              <p className="mt-2 text-xs tabular-nums text-white/50">{Math.round(progress * 100)}% · ~7 × 7 km of real terrain</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {terrain && plan && mode === "build" && (
        <>
          {/* ---------- Top bar ---------- */}
          <motion.header initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 24 }}
            className="absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-2">
            <Link href={`/?lat=${plan.lat}&lng=${plan.lng}&size=${plan.size}`} className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/20">
              <ArrowLeft size={16} /> Back
            </Link>
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-1.5">
              <div>
                <input
                  value={plan.name} onChange={(e) => setPlan((p) => p && { ...p, name: e.target.value })} placeholder="Name your town" maxLength={40}
                  className="w-36 bg-transparent text-sm font-semibold outline-none placeholder:text-white/40"
                />
                <div className="font-mono text-[10px] text-white/55">{plan.lat.toFixed(4)}, {plan.lng.toFixed(4)} · {Math.round(terrain.baseElevation)} m</div>
              </div>
              <AnimatePresence>
                {saved && <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[11px] text-emerald-300"><Check size={12} /> Saved</motion.span>}
              </AnimatePresence>
            </div>
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
              {night ? <Moon size={15} className="text-sky-300" /> : <Sun size={15} className="text-amber-300" />}
              <input type="range" min={5} max={21} step={0.1} value={hour} onChange={(e) => setHour(+e.target.value)} className="w-20 accent-amber-300" />
              <span className="w-10 text-xs tabular-nums text-white/70">{String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60) % 60).padStart(2, "0")}</span>
            </div>
            <TopToggle on={grid} onClick={() => setGrid((g) => !g)} title="Grid snapping (G)"><Grid3x3 size={14} /> Grid</TopToggle>
            <TopToggle on={quality} onClick={() => setQuality((q) => !q)} title="Shadows and full resolution"><Sparkles size={14} /> {quality ? "HQ" : "Fast"}</TopToggle>
            <div className="flex-1" />
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setAlive((a) => !a)}
              title="Simulate people and traffic" className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-lg ${alive ? "bg-amber-500 shadow-amber-900/40" : "glass"}`}>
              {alive ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Alive</>}
            </motion.button>
            <TopToggle on={false} onClick={() => { setSel(null); setTool(null); setTimeout(() => setReport(capture.current?.() ?? null), 60); }} title="Generate a printable town plan report"><FileText size={14} /> Report</TopToggle>
            <TopToggle on={showTowns} onClick={openTowns} title="Save, load, export, share"><Save size={14} /> Towns</TopToggle>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => { setTool(null); setWalkPaused(true); setMode("walk"); }}
              title="Walk or fly around in first person" className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 px-3 py-2 text-sm font-semibold shadow-lg shadow-emerald-900/40">
              <Footprints size={16} /> Walk
            </motion.button>
          </motion.header>

          <AnimatePresence>
            {showTowns && (
              <TownsMenu
                towns={towns} currentId={plan.id} onOpen={openTown}
                onDelete={(t) => { if (confirm(`Delete "${t.name || "Unnamed town"}"? This can't be undone.`)) { deleteTown(t.id); setTowns(listTowns()); if (t.id === plan.id) newTown(); } }}
                onNew={newTown} onExport={() => exportFile(plan)} onImport={onImport} onShare={onShare} onClose={() => setShowTowns(false)}
              />
            )}
          </AnimatePresence>

          {/* ---------- Palette ---------- */}
          <motion.aside initial={{ x: -320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.8, type: "spring", stiffness: 180, damping: 24 }}
            className="glass absolute bottom-3 left-3 top-20 z-20 flex w-72 flex-col overflow-hidden rounded-2xl">
            <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
              {[...CATEGORIES, "Roads" as const].map((c) => (
                <button key={c} onClick={() => setTab(c)} className="relative rounded-lg px-2 py-1 text-xs font-semibold">
                  {tab === c && <motion.span layoutId="tab" className="absolute inset-0 rounded-lg bg-white/20" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                  <span className="relative">{c}</span>
                </button>
              ))}
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto p-2">
              <AnimatePresence mode="popLayout">
                <motion.div key={tab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid grid-cols-2 gap-2">
                  {tab === "Roads" ? (
                    <>
                      {(Object.keys(ROADS) as RoadType[]).map((k, i) => (
                        <PaletteCard key={k} i={i} emoji={ROADS[k].emoji} name={ROADS[k].name} cost={`${money(ROADS[k].perKm)}/km`} blurb={ROADS[k].blurb}
                          active={tool?.kind === "road" && tool.type === k} onClick={() => pickTool({ kind: "road", type: k })} />
                      ))}
                      {(["roundabout", "lights"] as const).map((k, i) => (
                        <PaletteCard key={k} i={i + 3} emoji={JUNCTIONS[k].emoji} name={JUNCTIONS[k].name} cost={money(JUNCTIONS[k].cost)} blurb={JUNCTIONS[k].blurb}
                          active={tool?.kind === "junction" && tool.type === k} onClick={() => pickTool({ kind: "junction", type: k })} />
                      ))}
                    </>
                  ) : CATALOG.filter((c) => c.category === tab).map((c, i) => (
                    <PaletteCard key={c.type} i={i} emoji={c.emoji} name={c.name} cost={money(c.cost)} blurb={`${c.blurb} Runs ${money(c.upkeep)}/yr.`}
                      active={tool?.kind === "item" && tool.type === c.type} onClick={() => pickTool({ kind: "item", type: c.type })} />
                  ))}
                </motion.div>
              </AnimatePresence>
              {tab === "Roads" && (
                <p className="mt-3 px-1 text-[11px] leading-relaxed text-white/55">
                  Roads that cross or meet become junctions automatically. Pick Roundabout or Traffic lights, then click a glowing junction. Click a road to rename it.
                </p>
              )}
            </div>
            <div className="border-t border-white/10 p-2 text-[11px] leading-relaxed text-white/55">
              Left-drag pan · right-drag rotate · scroll zoom · click things to select · <b className="text-white/80">G</b> grid · <b className="text-white/80">Ctrl+Z</b> undo
            </div>
          </motion.aside>

          {/* ---------- Budget ---------- */}
          <motion.aside initial={{ x: 340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.9, type: "spring", stiffness: 180, damping: 24 }}
            className="glass scroll-thin absolute bottom-3 right-3 top-20 z-20 hidden w-80 flex-col gap-3 overflow-y-auto rounded-2xl p-4 md:flex">
            <BudgetPanel totals={totals} meters={meters} period={period} setPeriod={setPeriod} goalPeople={goal.people} goalLabel={`a ${goal.label.toLowerCase()} (${goal.peopleRange})`} />
            {plan.boundary && (
              <BoundaryPanel
                b={plan.boundary} max={terrain.size - 200} editing={editBoundary} setEditing={setEditBoundary}
                perHa={landPrice} needHa={goal.landHa} outside={placed.filter((p) => !insideBoundary(plan.boundary!, p.x, p.z)).length}
                onChange={(b) => setPlan((p) => p && { ...p, boundary: b })}
                onReset={() => { const side = Math.min(Math.sqrt(goal.landHa * 10000), terrain.size - 300); setPlan((p) => p && { ...p, boundary: { cx: 0, cz: 0, w: Math.round(side), d: Math.round(side), rot: 0 } }); }}
              />
            )}
            <div className="mt-auto flex gap-2">
              <button onClick={undo} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-xs font-medium hover:bg-white/20"><Undo2 size={14} /> Undo</button>
              <button onClick={() => { if (confirm("Clear everything in this town?")) commit((p) => ({ ...p, placed: [], roads: [], junctionTypes: {} })); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-xs font-medium hover:bg-red-500/40"><Trash2 size={14} /> Clear</button>
            </div>
          </motion.aside>

          {/* ---------- Selection / tool hint ---------- */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-80">
            <AnimatePresence mode="wait">
              {selItem ? (
                <Slide k={`i${selItem.id}`}>
                  <ItemCard p={selItem} period={period} capacity={itemCapacity(selItem.type)} buildCost={placementCost(selItem)}
                    onRotate={(d) => rotateItem(selItem.id, d)} onMove={() => startMove(selItem.id)} onDelete={() => removeItem(selItem.id)} onClose={() => setSel(null)} />
                </Slide>
              ) : selRoad ? (
                <Slide k={`r${selRoad.id}`}>
                  <RoadCard road={selRoad} len={roadInfo.get(selRoad.id)?.len ?? 0} build={roadInfo.get(selRoad.id)?.build ?? 0} upkeep={roadInfo.get(selRoad.id)?.upkeep ?? 0} period={period}
                    onRename={(n) => setPlan((p) => p && { ...p, roads: p.roads.map((r) => (r.id === selRoad.id ? { ...r, name: n } : r)) })}
                    onRandomName={() => commit((p) => ({ ...p, roads: p.roads.map((r) => (r.id === selRoad.id ? { ...r, name: streetName(r.type, p.roads.map((x) => x.name)) } : r)) }))}
                    onType={(t) => commit((p) => ({ ...p, roads: p.roads.map((r) => (r.id === selRoad.id ? { ...r, type: t } : r)) }))}
                    onDelete={() => removeRoad(selRoad.id)} onClose={() => setSel(null)} />
                </Slide>
              ) : selJunction ? (
                <Slide k={`j${selJunction.key}`}>
                  <JunctionCard j={selJunction} type={junctionTypes[selJunction.key] ?? "plain"} onType={(t) => setJunction(selJunction.key, t)} onClose={() => setSel(null)} />
                </Slide>
              ) : tool ? (
                <Slide k={`t${JSON.stringify(tool)}`}>
                  <div className="glass flex flex-wrap items-center justify-center gap-3 rounded-full px-4 py-2 text-xs">
                    {tool.kind === "item" || tool.kind === "move" ? (
                      <>
                        <span className="font-semibold">{CATALOG_BY_TYPE[tool.type].emoji} {tool.kind === "move" ? "Moving" : ""} {CATALOG_BY_TYPE[tool.type].name}</span>
                        <span className="text-white/60">Click to {tool.kind === "move" ? "drop" : "build"} · R to rotate · Esc to cancel{grid ? " · snapping to grid" : ""}</span>
                        {hoverInfo?.reason && <span className={hoverInfo.ok ? "text-amber-300" : "text-red-300"}>{hoverInfo.reason}</span>}
                      </>
                    ) : tool.kind === "road" ? (
                      <>
                        <span className="font-semibold"><RouteIcon size={12} className="inline" /> {ROADS[tool.type].name}</span>
                        <button onClick={() => setCurvy((c) => !c)} className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-semibold hover:bg-white/25">
                          {curvy ? <><Spline size={12} /> Curved</> : <><Minus size={12} /> Straight</>} <span className="text-white/50">(C)</span>
                        </button>
                        <span className="text-white/60">Click to add points · double-click, right-click or Enter to finish · snaps to other roads</span>
                        {draftStats && <span className="text-emerald-300">{(draftStats.len / 1000).toFixed(2)} km · {money(draftStats.cost)} · {draftStats.grade.toFixed(1)}% grade</span>}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{JUNCTIONS[tool.type].emoji} {JUNCTIONS[tool.type].name}</span>
                        <span className="text-white/60">{junctions.length ? "Click a glowing junction to add it (click again to remove)" : "Draw roads that cross or meet first"}</span>
                      </>
                    )}
                  </div>
                </Slide>
              ) : null}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {toast && (
              <motion.div initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                className={`absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg ${toast.tone === "bad" ? "bg-red-500/90" : "bg-emerald-600/90"}`}>
                {toast.msg}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <AnimatePresence>
        {report !== false && plan && plan.boundary && (
          <Report plan={plan} totals={totals} meters={meters} roadInfo={roadInfo} junctions={junctions} junctionTypes={junctionTypes}
            boundary={plan.boundary} site={site} nearby={nearby} snapshot={report} onClose={() => setReport(false)} />
        )}
      </AnimatePresence>

      {/* ---------- Walk / fly HUD ---------- */}
      {terrain && mode === "walk" && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/80" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/80" />
          </div>
          <AnimatePresence>
            {walk.flying && walk.speed > 80 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: Math.min(0.9, walk.speed / 300) }} exit={{ opacity: 0 }} className="speed-lines pointer-events-none absolute inset-0 z-10" />
            )}
          </AnimatePresence>
          <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-4 rounded-2xl px-4 py-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              {walk.flying ? <><Plane size={15} className="text-sky-300" /> Flying</> : <><Footprints size={15} className="text-emerald-300" /> Walking</>}
            </span>
            <span className="tabular-nums text-white/70">{Math.round(walk.speed * 3.6)} km/h</span>
            {walk.flying && <span className="tabular-nums text-white/70">{Math.round(walk.alt)} m up</span>}
            <button onClick={() => setAlive((a) => !a)} className="pointer-events-auto rounded-lg bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">{alive ? "Pause life" : "Bring to life"}</button>
          </motion.div>
          <div className="glass absolute bottom-4 left-4 z-20 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-white/70">
            <b className="text-white">WASD</b> move · <b className="text-white">Mouse</b> look · <b className="text-white">Shift</b> {walk.flying ? "super speed" : "run"} · <b className="text-white">F</b> {walk.flying ? "land" : "fly"}
            {walk.flying ? <> · <b className="text-white">Space/C</b> up/down</> : <> · <b className="text-white">Space</b> jump</>} · <b className="text-white">Esc</b> pause
          </div>
          <AnimatePresence>
            {walkPaused && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} className="glass w-80 rounded-2xl p-5 text-center">
                  <div className="text-lg font-semibold">Explore {plan?.name || "your town"}</div>
                  <p className="mt-1 text-sm text-white/60">Walk the streets, or press F to fly. Hold Shift for super speed.</p>
                  <button id="walk-resume" onClick={() => setWalkPaused(false)} className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 py-2.5 text-sm font-semibold">Click to start</button>
                  <button onClick={() => setMode("build")} className="mt-2 w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium hover:bg-white/20">Back to planning</button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

function TopToggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={`glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${on ? "text-emerald-300 ring-1 ring-emerald-400/60" : "text-white/70"}`}>
      {children}
    </button>
  );
}

function Slide({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <motion.div key={k} initial={{ y: 30, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
      {children}
    </motion.div>
  );
}

function BoundaryPanel({ b, max, editing, setEditing, perHa, needHa, outside, onChange, onReset }: {
  b: Boundary; max: number; editing: boolean; setEditing: (v: boolean) => void; perHa: { low: number; high: number } | null; needHa: number; outside: number;
  onChange: (b: Boundary) => void; onReset: () => void;
}) {
  const ha = boundaryAreaHa(b);
  const slider = (label: string, value: number, min: number, maxV: number, step: number, fmt: (v: number) => string, set: (v: number) => void) => (
    <label className="block text-xs">
      <span className="flex justify-between text-white/70"><span>{label}</span><span className="tabular-nums text-white">{fmt(value)}</span></span>
      <input type="range" min={min} max={maxV} step={step} value={value} onChange={(e) => set(+e.target.value)} className="mt-1 w-full accent-yellow-400" />
    </label>
  );
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-yellow-400" /> Town boundary</span>
        <button onClick={() => setEditing(!editing)} className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${editing ? "bg-yellow-400 text-black" : "bg-white/10 hover:bg-white/20"}`}>
          {editing ? "Done" : "Drag to edit"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><div className="text-white/50">Area</div><div className="text-base font-semibold tabular-nums">{Math.round(ha).toLocaleString()} ha</div><div className={ha >= needHa ? "text-emerald-300" : "text-amber-300"}>{ha >= needHa ? "Enough for your town" : `Need ~${needHa.toLocaleString()} ha`}</div></div>
        <div><div className="text-white/50">Land cost (est.)</div><div className="text-base font-semibold tabular-nums">{perHa ? `${money(perHa.low * ha)}–${money(perHa.high * ha)}` : "—"}</div><div className="text-white/50">{perHa ? `${money(perHa.low)}–${money(perHa.high)}/ha` : "Loading or not for sale"}</div></div>
      </div>
      <div className="mt-2 space-y-2">
        {slider("Width (east–west)", b.w, 100, max, 50, (v) => `${(v / 1000).toFixed(2)} km`, (w) => onChange({ ...b, w }))}
        {slider("Depth (north–south)", b.d, 100, max, 50, (v) => `${(v / 1000).toFixed(2)} km`, (d) => onChange({ ...b, d }))}
        {slider("Rotation", Math.round((b.rot * 180) / Math.PI), -45, 45, 1, (v) => `${v}°`, (r) => onChange({ ...b, rot: (r * Math.PI) / 180 }))}
      </div>
      {editing && <p className="mt-2 text-[11px] text-yellow-200">Drag the yellow corner balls to resize, or the white diamond in the middle to move it.</p>}
      {outside > 0 && <p className="mt-1 text-[11px] text-amber-300">{outside} item{outside > 1 ? "s are" : " is"} outside the boundary.</p>}
      <button onClick={onReset} className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-xs hover:bg-white/20">Reset to town size</button>
    </div>
  );
}
