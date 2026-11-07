"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, Check, Footprints, Moon, RotateCw, Sparkles, Sun, Trash2, Undo2, Users, X, Route as RouteIcon, Plane,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SIZES, type SizeKey } from "@/lib/analysis";
import { CountUp, money } from "../ui";
import { CATALOG, CATALOG_BY_TYPE, CATEGORIES, NEEDS, ROADS, type Category, type ItemType, type RoadType } from "./catalog";
import { corners, overlaps, placementCost, roadStats, siteWorks, type Placed, type Road } from "./geometry";
import Scene, { type Tool } from "./Scene";
import { loadTerrain, type TerrainData } from "./terrain";

const LOAD_LINES = ["Downloading elevation data…", "Stitching satellite photos…", "Shaping the hills…", "Pouring the bitumen…"];

/* eslint-disable react-hooks/set-state-in-effect -- URL and saved plan are read once on mount */
export default function Planner() {
  const [params, setParams] = useState<{ lat: number; lng: number; size: SizeKey } | null>(null);
  const [terrain, setTerrain] = useState<TerrainData | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [roads, setRoads] = useState<Road[]>([]);
  const [draftRoad, setDraftRoad] = useState<[number, number][]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [rot, setRot] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hour, setHour] = useState(15.5);
  const [quality, setQuality] = useState(true);
  const [mode, setMode] = useState<"build" | "walk">("build");
  const [tab, setTab] = useState<Category | "Roads">("Housing");
  const [hoverInfo, setHoverInfo] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [walk, setWalk] = useState({ flying: false, speed: 0, alt: 0, locked: false });
  const [toast, setToast] = useState<string | null>(null);
  const [walkPaused, setWalkPaused] = useState(true);
  const nextId = useRef(1);
  const storageKey = params ? `townsite-plan:${params.lat.toFixed(3)},${params.lng.toFixed(3)}` : null;

  // Read ?lat&lng&size
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
    const size = (sp.get("size") as SizeKey) in SIZES ? (sp.get("size") as SizeKey) : "small";
    if (!sp.get("lat") || !Number.isFinite(lat) || !Number.isFinite(lng)) { setLoadError("No location given. Pick a spot first."); return; }
    setParams({ lat, lng, size });
  }, []);

  // Load terrain + imagery
  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    loadTerrain(params.lng, params.lat, (p) => !cancelled && setProgress(p))
      .then((t) => { if (!cancelled) setTerrain(t); })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Couldn't load the terrain"));
    return () => { cancelled = true; };
  }, [params]);

  // Restore / save the plan in this browser
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved?.placed) { setPlaced(saved.placed); setRoads(saved.roads ?? []); nextId.current = saved.nextId ?? 1000; }
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ placed, roads, nextId: nextId.current })); } catch {}
  }, [placed, roads, storageKey]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? null : t)), 1600); };

  // ---------- Rules ----------
  const validate = useCallback((type: ItemType, x: number, z: number, r: number) => {
    if (!terrain) return { ok: false, base: 0 };
    const sw = siteWorks(terrain, type, x, z, r);
    const poly = corners(type, x, z, r);
    if (!poly.every(([px, pz]) => terrain.inBounds(px, pz, 25))) return { ok: false, base: sw.base, reason: "Too close to the edge of the map" };
    if (sw.maxH - sw.minH > 16) return { ok: false, base: sw.base, reason: "Too steep to build here" };
    for (const p of placed) {
      if (Math.hypot(p.x - x, p.z - z) > 200) continue;
      if (overlaps(poly, corners(p.type, p.x, p.z, p.rot))) return { ok: false, base: sw.base, reason: `Overlaps the ${CATALOG_BY_TYPE[p.type].name.toLowerCase()}` };
    }
    return { ok: true, base: sw.base, reason: sw.maxH - sw.minH > 3 ? `Sloping site: +${money(sw.earthM3 * 45)} earthworks` : undefined };
  }, [terrain, placed]);

  const collide = useCallback((x: number, z: number, r: number): [number, number] => {
    for (const p of placed) {
      const { w, d } = CATALOG_BY_TYPE[p.type];
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

  // ---------- Actions ----------
  const onPlace = (x: number, z: number) => {
    if (!terrain || tool?.kind !== "item") return;
    const v = validate(tool.type, x, z, rot);
    if (!v.ok) { flash(v.reason ?? "Can't build here"); return; }
    const sw = siteWorks(terrain, tool.type, x, z, rot);
    setPlaced((ps) => [...ps, { id: nextId.current++, type: tool.type, x, z, rot, base: sw.base, minH: sw.minH, earthM3: sw.earthM3 }]);
  };

  const snap = (x: number, z: number): [number, number] => {
    let best: [number, number] = [x, z], bd = 15;
    for (const r of roads) for (const p of r.pts) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = p; } }
    for (const p of draftRoad.slice(0, -1)) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const onRoadPoint = (x: number, z: number) => setDraftRoad((d) => [...d, snap(x, z)]);
  const finishRoad = useCallback(() => {
    setDraftRoad((d) => {
      if (d.length >= 2 && tool?.kind === "road") setRoads((rs) => [...rs, { id: nextId.current++, type: tool.type, pts: d }]);
      return [];
    });
  }, [tool]);

  const remove = useCallback((id: number) => {
    setPlaced((ps) => ps.filter((p) => p.id !== id));
    setSelectedId(null);
  }, []);

  const undo = () => {
    // Remove whichever was added last (item or road)
    const lastItem = placed.at(-1), lastRoad = roads.at(-1);
    if (!lastItem && !lastRoad) return;
    if (!lastRoad || (lastItem && lastItem.id > lastRoad.id)) setPlaced((ps) => ps.slice(0, -1));
    else setRoads((rs) => rs.slice(0, -1));
  };

  const pickTool = (t: Tool) => {
    setSelectedId(null);
    setDraftRoad([]);
    setTool((cur) => (JSON.stringify(cur) === JSON.stringify(t) ? null : t));
  };

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
      if (e.key === "r" || e.key === "R") setRot((r) => r + (e.shiftKey ? -1 : 1) * (Math.PI / 12));
      if (e.key === "Escape") { if (draftRoad.length) setDraftRoad([]); else if (tool) setTool(null); else setSelectedId(null); }
      if (e.key === "Enter") finishRoad();
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId != null) remove(selectedId);
      if ((e.ctrlKey || e.metaKey) && e.key === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Totals ----------
  const totals = useMemo(() => {
    const byCat: Record<string, { cost: number; count: number }> = {};
    let earth = 0, people = 0;
    const met = new Set<string>();
    for (const p of placed) {
      const c = CATALOG_BY_TYPE[p.type];
      byCat[c.category] ??= { cost: 0, count: 0 };
      byCat[c.category].cost += c.cost;
      byCat[c.category].count++;
      earth += p.earthM3 * 45;
      people += c.people ?? 0;
      c.provides?.forEach((n) => met.add(n));
    }
    let roadKm = 0, roadCost = 0;
    if (terrain) for (const r of roads) { const s = roadStats(terrain, r); roadKm += s.len / 1000; roadCost += s.cost; }
    if (roads.length) met.add("roads");
    const total = Object.values(byCat).reduce((s, v) => s + v.cost, 0) + earth + roadCost;
    return { byCat, earth, roadKm, roadCost, total, people, met };
  }, [placed, roads, terrain]);

  const draftStats = useMemo(() => (terrain && draftRoad.length >= 2 && tool?.kind === "road" ? roadStats(terrain, { id: 0, type: tool.type, pts: draftRoad }) : null), [terrain, draftRoad, tool]);
  const selected = placed.find((p) => p.id === selectedId);
  const goal = params ? SIZES[params.size] : SIZES.small;
  const needsMet = NEEDS.filter((n) => totals.met.has(n.key)).length;
  const night = hour < 6.3 || hour > 18.3;

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
      {terrain && params && (
        <Scene
          terrain={terrain} placed={placed} roads={roads} draftRoad={draftRoad} tool={mode === "build" ? tool : null} rot={rot}
          selectedId={selectedId} hour={hour} quality={quality} mode={mode}
          validate={validate} collide={collide} onPlace={onPlace} onRoadPoint={onRoadPoint} onFinishRoad={finishRoad}
          onSelect={(id) => { setSelectedId(id); }} onHoverInfo={setHoverInfo}
          onExitWalk={() => setMode("build")} onWalkState={setWalk} onWalkPause={() => setWalkPaused(true)}
        />
      )}

      {/* ---------- Loading ---------- */}
      <AnimatePresence>
        {!terrain && (
          <motion.div exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.8 }} className="absolute inset-0 z-50 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#12352a,#05090a)]">
            <div className="w-80 text-center">
              <motion.div className="mx-auto mb-6 h-20 w-20 rounded-full border-4 border-emerald-400/30 border-t-emerald-400" animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }} />
              <AnimatePresence mode="wait">
                <motion.p key={Math.floor(progress * 3.99)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-sm text-white/80">
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

      {terrain && mode === "build" && (
        <>
          {/* ---------- Top bar ---------- */}
          <motion.header initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 24 }}
            className="absolute inset-x-3 top-3 z-20 flex flex-wrap items-center gap-2">
            <Link href={`/?lat=${params!.lat}&lng=${params!.lng}&size=${params!.size}`} className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/20">
              <ArrowLeft size={16} /> Back
            </Link>
            <div className="glass rounded-xl px-3 py-1.5">
              <div className="text-sm font-semibold leading-tight">Town planner</div>
              <div className="font-mono text-[10px] text-white/60">{params!.lat.toFixed(4)}, {params!.lng.toFixed(4)} · {Math.round(terrain.baseElevation)} m above sea level</div>
            </div>
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
              {night ? <Moon size={15} className="text-sky-300" /> : <Sun size={15} className="text-amber-300" />}
              <input type="range" min={5} max={21} step={0.1} value={hour} onChange={(e) => setHour(+e.target.value)} className="w-28 accent-amber-300" />
              <span className="w-11 text-xs tabular-nums text-white/70">{String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60)).padStart(2, "0")}</span>
            </div>
            <button onClick={() => setQuality((q) => !q)} className={`glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${quality ? "text-emerald-300" : "text-white/60"}`}>
              <Sparkles size={14} /> {quality ? "High quality" : "Fast mode"}
            </button>
            <div className="flex-1" />
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => { setTool(null); setWalkPaused(true); setMode("walk"); }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 px-4 py-2 text-sm font-semibold shadow-lg shadow-emerald-900/40">
              <Footprints size={16} /> Walk around
            </motion.button>
          </motion.header>

          {/* ---------- Palette ---------- */}
          <motion.aside initial={{ x: -320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.8, type: "spring", stiffness: 180, damping: 24 }}
            className="glass absolute bottom-3 left-3 top-20 z-20 flex w-72 flex-col overflow-hidden rounded-2xl">
            <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
              {[...CATEGORIES, "Roads" as const].map((c) => (
                <button key={c} onClick={() => setTab(c)} className="relative rounded-lg px-2.5 py-1 text-xs font-semibold">
                  {tab === c && <motion.span layoutId="tab" className="absolute inset-0 rounded-lg bg-white/20" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                  <span className="relative">{c}</span>
                </button>
              ))}
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto p-2">
              <AnimatePresence mode="popLayout">
                <motion.div key={tab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid grid-cols-2 gap-2">
                  {tab === "Roads"
                    ? (Object.keys(ROADS) as RoadType[]).map((k, i) => (
                        <PaletteCard key={k} i={i} emoji={ROADS[k].emoji} name={ROADS[k].name} cost={`${money(ROADS[k].perKm)}/km`} blurb={ROADS[k].blurb}
                          active={tool?.kind === "road" && tool.type === k} onClick={() => pickTool({ kind: "road", type: k })} />
                      ))
                    : CATALOG.filter((c) => c.category === tab).map((c, i) => (
                        <PaletteCard key={c.type} i={i} emoji={c.emoji} name={c.name} cost={money(c.cost)} blurb={c.blurb}
                          active={tool?.kind === "item" && tool.type === c.type} onClick={() => pickTool({ kind: "item", type: c.type })} />
                      ))}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="border-t border-white/10 p-2 text-[11px] leading-relaxed text-white/55">
              Left-drag to pan · right-drag to rotate · scroll to zoom
            </div>
          </motion.aside>

          {/* ---------- Costs ---------- */}
          <motion.aside initial={{ x: 340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.9, type: "spring", stiffness: 180, damping: 24 }}
            className="glass scroll-thin absolute bottom-3 right-3 top-20 z-20 hidden w-80 flex-col gap-3 overflow-y-auto rounded-2xl p-4 md:flex">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55">Estimated build cost</div>
              <div className="text-4xl font-bold tabular-nums tracking-tight">
                <CountUp value={totals.total} format={(n) => money(n)} duration={0.6} />
              </div>
              <div className="text-xs text-white/50">Very rough. Land, design and fees are extra.</div>
            </div>

            <div className="rounded-xl bg-white/5 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium"><Users size={14} /> Housing for</span>
                <span className="tabular-nums"><CountUp value={totals.people} /> / {goal.people.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (totals.people / goal.people) * 100)}%` }} transition={{ type: "spring", stiffness: 80, damping: 16 }} />
              </div>
              <div className="mt-1 text-[11px] text-white/50">Goal: a {goal.label.toLowerCase()} ({goal.peopleRange})</div>
            </div>

            <div className="rounded-xl bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>Town needs</span><span className="tabular-nums text-white/60">{needsMet}/{NEEDS.length}</span>
              </div>
              <ul className="grid grid-cols-2 gap-1.5">
                {NEEDS.map((n) => {
                  const ok = totals.met.has(n.key);
                  return (
                    <li key={n.key} className="flex items-center gap-1.5 text-xs">
                      <motion.span animate={{ scale: ok ? [1, 1.4, 1] : 1, backgroundColor: ok ? "#10b981" : "rgba(255,255,255,0.1)" }}
                        className="flex h-4 w-4 items-center justify-center rounded-full">
                        {ok && <Check size={10} strokeWidth={4} />}
                      </motion.span>
                      <span className={ok ? "" : "text-white/50"}>{n.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="space-y-1.5 text-sm">
              {CATEGORIES.filter((c) => totals.byCat[c]).map((c) => (
                <motion.div layout key={c} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex justify-between">
                  <span className="text-white/70">{c} <span className="text-white/40">×{totals.byCat[c].count}</span></span>
                  <span className="tabular-nums">{money(totals.byCat[c].cost)}</span>
                </motion.div>
              ))}
              {totals.roadKm > 0 && (
                <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between">
                  <span className="text-white/70">Roads <span className="text-white/40">{totals.roadKm.toFixed(2)} km</span></span>
                  <span className="tabular-nums">{money(totals.roadCost)}</span>
                </motion.div>
              )}
              {totals.earth > 1000 && (
                <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between">
                  <span className="text-white/70">Earthworks</span><span className="tabular-nums">{money(totals.earth)}</span>
                </motion.div>
              )}
              {!placed.length && !roads.length && <p className="text-xs text-white/50">Pick something from the left and click on the map to build it.</p>}
            </div>

            <div className="mt-auto flex gap-2">
              <button onClick={undo} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-xs font-medium hover:bg-white/20"><Undo2 size={14} /> Undo</button>
              <button onClick={() => { if (confirm("Clear the whole plan?")) { setPlaced([]); setRoads([]); } }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-xs font-medium hover:bg-red-500/40"><Trash2 size={14} /> Clear</button>
            </div>
          </motion.aside>

          {/* ---------- Context hint / selection ---------- */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div key={`sel${selected.id}`} initial={{ y: 30, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
                  className="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2.5">
                  <span className="text-2xl">{CATALOG_BY_TYPE[selected.type].emoji}</span>
                  <div>
                    <div className="text-sm font-semibold">{CATALOG_BY_TYPE[selected.type].name}</div>
                    <div className="text-xs text-white/60">{money(placementCost(selected))}{selected.earthM3 > 20 ? " incl. earthworks" : ""}</div>
                  </div>
                  <button onClick={() => remove(selected.id)} className="flex items-center gap-1 rounded-lg bg-red-500/80 px-2.5 py-1.5 text-xs font-semibold hover:bg-red-500"><Trash2 size={13} /> Remove</button>
                  <button onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 hover:bg-white/10"><X size={14} /></button>
                </motion.div>
              ) : tool ? (
                <motion.div key={`tool${JSON.stringify(tool)}`} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
                  className="glass flex items-center gap-3 rounded-full px-4 py-2 text-xs">
                  {tool.kind === "item" ? (
                    <>
                      <span className="font-semibold">{CATALOG_BY_TYPE[tool.type].emoji} {CATALOG_BY_TYPE[tool.type].name}</span>
                      <span className="text-white/60">Click to build · <RotateCw size={11} className="inline" /> R to rotate · Esc to cancel</span>
                      {hoverInfo?.reason && <span className={hoverInfo.ok ? "text-amber-300" : "text-red-300"}>{hoverInfo.reason}</span>}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold"><RouteIcon size={12} className="inline" /> {ROADS[tool.type].name}</span>
                      <span className="text-white/60">Click to add points · double-click, right-click or Enter to finish · snaps to other roads</span>
                      {draftStats && <span className="text-emerald-300">{(draftStats.len / 1000).toFixed(2)} km · {money(draftStats.cost)} · {draftStats.grade.toFixed(1)}% grade</span>}
                    </>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {toast && (
              <motion.div initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                className="absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-full bg-red-500/90 px-4 py-2 text-sm font-medium shadow-lg">
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

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
          </motion.div>
          <div className="glass absolute bottom-4 left-4 z-20 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-white/70">
            <b className="text-white">WASD</b> move · <b className="text-white">Mouse</b> look · <b className="text-white">Shift</b> {walk.flying ? "super speed" : "run"} · <b className="text-white">F</b> {walk.flying ? "land" : "fly"}
            {walk.flying ? <> · <b className="text-white">Space/C</b> up/down</> : <> · <b className="text-white">Space</b> jump</>} · <b className="text-white">Esc</b> pause
          </div>
          <AnimatePresence>
            {walkPaused && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} className="glass w-80 rounded-2xl p-5 text-center">
                  <div className="text-lg font-semibold">Explore your town</div>
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

function PaletteCard({ emoji, name, cost, blurb, active, onClick, i }: { emoji: string; name: string; cost: string; blurb: string; active: boolean; onClick: () => void; i: number }) {
  return (
    <motion.button
      onClick={onClick} title={blurb}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
      whileHover={{ y: -3, scale: 1.03 }} whileTap={{ scale: 0.95 }}
      className={`relative rounded-xl p-2.5 text-left transition-colors ${active ? "bg-emerald-500/30 ring-2 ring-emerald-400" : "bg-white/5 hover:bg-white/10"}`}
    >
      <motion.div className="text-2xl" animate={active ? { rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.5 }}>{emoji}</motion.div>
      <div className="mt-1 text-xs font-semibold leading-tight">{name}</div>
      <div className="text-[11px] tabular-nums text-emerald-300">{cost}</div>
    </motion.button>
  );
}
