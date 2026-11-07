"use client";

import { AnimatePresence, motion } from "motion/react";
import { Dices, Layers3, MapPin, RotateCcw, Radar } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { SIZES, type SizeKey } from "@/lib/analysis";
import { STATE_NAMES, type NearbyDetails, type PickResult, type RejectedPoint, type SpotDetails, type StateCode } from "@/lib/types";
import DetailsPanel from "./DetailsPanel";
import { CountUp, Skeleton } from "../ui";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 shimmer" /> });

type Phase = "idle" | "searching" | "flying" | "done" | "error";
const STATE_OPTIONS: (StateCode | "ALL")[] = ["ALL", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
const SCAN_LINES = ["Rolling the dice on the map…", "Checking distance to every town…", "Avoiding national parks…", "Skipping reserves and Aboriginal land…", "Nearly there…"];

export default function Finder() {
  const [state, setState] = useState<StateCode | "ALL">("ALL");
  const [minKm, setMinKm] = useState(25);
  const [hamlets, setHamlets] = useState(false);
  const [sizeKey, setSizeKey] = useState<SizeKey>("small");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedPoint[]>([]);
  const [pick, setPick] = useState<PickResult | null>(null);
  const [spot, setSpot] = useState<{ lng: number; lat: number } | null>(null);
  const [details, setDetails] = useState<SpotDetails | null>(null);
  const [nearby, setNearby] = useState<NearbyDetails | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [terrain3d, setTerrain3d] = useState(true);
  const [scanLine, setScanLine] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const pickRef = useRef<PickResult | null>(null);

  const loadSpot = useCallback(async (lng: number, lat: number) => {
    const id = ++reqId.current;
    setDetails(null);
    setNearby(null);
    setNearbyLoading(true);
    const q = `lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`;
    fetch(`/api/nearby?${q}`)
      .then((r) => r.json())
      .then((n: NearbyDetails) => { if (id === reqId.current) setNearby(n); })
      .catch(() => {})
      .finally(() => { if (id === reqId.current) setNearbyLoading(false); });
    try {
      const r = await fetch(`/api/spot?${q}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't load this spot");
      if (id === reqId.current) setDetails(j);
    } catch (e) {
      if (id === reqId.current) { setError(e instanceof Error ? e.message : "Couldn't load this spot"); setPhase("error"); }
    }
  }, []);

  // Open a shared link (?lat=…&lng=…&size=…). Reads the URL after hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
    const size = sp.get("size") as SizeKey | null;
    if (size && size in SIZES) setSizeKey(size);
    if (Number.isFinite(lat) && Number.isFinite(lng) && sp.get("lat")) {
      setSpot({ lng, lat });
      setPhase("done");
      loadSpot(lng, lat);
    }
  }, [loadSpot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keep the URL shareable
  useEffect(() => {
    if (!spot) return;
    const url = `${window.location.pathname}?lat=${spot.lat.toFixed(4)}&lng=${spot.lng.toFixed(4)}&size=${sizeKey}`;
    window.history.replaceState(null, "", url);
  }, [spot, sizeKey]);

  useEffect(() => {
    if (phase !== "searching") return;
    const t = setInterval(() => setScanLine((n) => (n + 1) % SCAN_LINES.length), 900);
    return () => clearInterval(t);
  }, [phase]);

  const find = async () => {
    setPhase("searching");
    setError(null);
    setSpot(null);
    setDetails(null);
    setNearby(null);
    setPick(null);
    pickRef.current = null;
    setRejected([]);
    panelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const r = await fetch(`/api/pick?state=${state}&minKm=${minKm}&hamlets=${hamlets ? 1 : 0}`);
      const j = await r.json();
      if (!r.ok) { setRejected(j.rejected ?? []); throw new Error(j.error ?? "Search failed"); }
      pickRef.current = j;
      setPick(j);
      setRejected(j.rejected);
      setPhase("flying");
      loadSpot(j.lng, j.lat); // start loading details while the animation plays
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setPhase("error");
    }
  };

  // Once the rejected dots have animated in, fly to the winner.
  const onRejectedShown = useCallback(() => {
    const p = pickRef.current;
    if (p) { setSpot({ lng: p.lng, lat: p.lat }); setPhase("done"); }
  }, []);

  const reset = () => {
    reqId.current++;
    setPhase("idle"); setSpot(null); setDetails(null); setNearby(null); setRejected([]); setPick(null); pickRef.current = null;
    window.history.replaceState(null, "", window.location.pathname);
  };

  const busy = phase === "searching" || phase === "flying";

  return (
    <main className="flex h-dvh flex-col-reverse overflow-hidden lg:flex-row">
      {/* ---------- Side panel ---------- */}
      <aside ref={panelRef} className="scroll-thin relative z-10 h-[58dvh] w-full shrink-0 overflow-y-auto border-border bg-background lg:h-full lg:w-[460px] lg:border-r">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl">
          <motion.div className="flex items-center gap-2" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
            <motion.div
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white"
              animate={{ rotate: busy ? 360 : 0 }}
              transition={busy ? { duration: 1.2, repeat: Infinity, ease: "linear" } : { duration: 0.4 }}
            >
              <MapPin size={17} />
            </motion.div>
            <div>
              <div className="text-[15px] font-bold leading-none tracking-tight">Townsite</div>
              <div className="text-[11px] text-muted">Find a place to start your own town</div>
            </div>
          </motion.div>
          {phase !== "idle" && (
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} onClick={reset}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2">
              <RotateCcw size={13} /> Start over
            </motion.button>
          )}
        </div>

        <div className="space-y-3 p-3">
          {/* ---------- Controls ---------- */}
          <motion.section layout className="rounded-2xl border border-border bg-surface p-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
            <AnimatePresence initial={false}>
              {phase === "idle" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <h1 className="text-2xl font-bold leading-tight tracking-tight">
                    Where would <span className="bg-gradient-to-r from-emerald-500 to-sky-500 bg-clip-text text-transparent">your town</span> go?
                  </h1>
                  <p className="mb-4 mt-1 text-sm text-muted">
                    We&apos;ll pick a random spot in Australia that&apos;s well away from existing towns, then show you its water,
                    terrain, land type, rough price and how hard it would be to build there.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Where</label>
            <div className="mt-1.5 grid grid-cols-5 gap-1">
              {STATE_OPTIONS.map((s) => (
                <button key={s} onClick={() => setState(s)} disabled={busy} title={s === "ALL" ? "All of Australia" : STATE_NAMES[s]}
                  className={`relative rounded-lg px-1 py-1.5 text-xs font-semibold transition-colors ${s === "ALL" ? "col-span-1" : ""} ${state === s ? "text-white" : "bg-surface-2 text-foreground hover:bg-border"}`}>
                  {state === s && <motion.span layoutId="state-pill" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                  <span className="relative">{s === "ALL" ? "All" : s}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">At least this far from any town</label>
              <motion.span key={minKm} initial={{ scale: 1.3, color: "var(--accent)" }} animate={{ scale: 1, color: "var(--foreground)" }} className="text-sm font-bold tabular-nums">
                {minKm} km
              </motion.span>
            </div>
            <input type="range" min={5} max={100} step={5} value={minKm} disabled={busy} onChange={(e) => setMinKm(+e.target.value)}
              className="slider mt-2 w-full" style={{ ["--fill" as string]: `${((minKm - 5) / 95) * 100}%` }} />
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={hamlets} onChange={(e) => setHamlets(e.target.checked)} disabled={busy} className="accent-[var(--accent)]" />
              Count tiny hamlets as towns too
            </label>

            <motion.button
              onClick={find} disabled={busy}
              whileHover={busy ? {} : { scale: 1.02, boxShadow: "0 14px 30px -10px rgba(15,159,110,0.65)" }}
              whileTap={busy ? {} : { scale: 0.97 }}
              className="relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-white disabled:opacity-90"
            >
              {busy && (
                <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  initial={{ x: "-100%" }} animate={{ x: "100%" }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
              )}
              <motion.span animate={busy ? { rotate: [0, 90, 180, 270, 360] } : { rotate: 0 }} transition={busy ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}>
                {busy ? <Radar size={20} /> : <Dices size={20} />}
              </motion.span>
              {busy ? "Searching…" : phase === "idle" ? "Find me a spot" : "Find another spot"}
            </motion.button>
          </motion.section>

          {/* ---------- Search progress / errors / results ---------- */}
          <AnimatePresence mode="wait">
            {busy && (
              <motion.div key="scan" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10">
                    <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
                    <span className="absolute inset-2 rounded-full bg-accent" />
                  </div>
                  <div className="min-w-0">
                    <AnimatePresence mode="wait">
                      <motion.div key={scanLine} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-sm font-medium">
                        {phase === "flying" ? "Found one! Flying there…" : SCAN_LINES[scanLine]}
                      </motion.div>
                    </AnimatePresence>
                    {pick && (
                      <div className="text-xs text-muted">
                        Checked <CountUp value={pick.tried} /> random points · red dots were too close to a town
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {phase === "error" && error && (
              <motion.div key="err" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </motion.div>
            )}

            {phase === "done" && !details && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <Skeleton className="h-40 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
              </motion.div>
            )}

            {phase === "done" && details && (
              <motion.div key={`${details.lat},${details.lng}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {pick?.warning && (
                  <div className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{pick.warning}</div>
                )}
                <DetailsPanel details={details} nearby={nearby} nearbyLoading={nearbyLoading} sizeKey={sizeKey} onSize={setSizeKey} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* ---------- Map ---------- */}
      <section className="relative min-h-0 flex-1">
        <MapView rejected={rejected} spot={spot} details={details} nearby={nearby} size={SIZES[sizeKey]} terrain3d={terrain3d} onRejectedShown={onRejectedShown} />
        <AnimatePresence>
          {spot && (
            <motion.button initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              onClick={() => setTerrain3d((v) => !v)}
              className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md hover:bg-black/75">
              <Layers3 size={14} /> {terrain3d ? "3D terrain on" : "3D terrain off"}
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {phase === "idle" && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ delay: 0.4 }}
              className="pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center lg:flex">
              <div className="rounded-full bg-black/55 px-4 py-2 text-sm text-white backdrop-blur-md">
                Pick a state and distance, then hit <b>Find me a spot</b>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}
