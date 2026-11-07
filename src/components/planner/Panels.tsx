"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Copy, Dices, Download, FolderOpen, Move, Plus, RotateCcw, RotateCw, Trash2, Upload, X, Check, Zap, Droplets, Waves, GraduationCap, HeartPulse, Shield, ShoppingCart, Wifi, Briefcase, School } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { CountUp, money } from "../ui";
import type { Meter, Resource } from "./capacity";
import { CATALOG_BY_TYPE, JUNCTIONS, ROADS, type CatalogItem, type Payer, type RoadType } from "./catalog";
import type { Junction, JunctionType, Placed, Road } from "./geometry";
import type { TownMeta } from "./storage";
import { SIZES, type SizeKey } from "@/lib/analysis";

export type Period = "year" | "month";
export const per = (n: number, p: Period) => (p === "year" ? n : n / 12);
const PAYER_LABEL: Record<Payer, string> = { council: "Council", state: "State government", private: "Private owner" };
const PAYER_TONE: Record<Payer, string> = { council: "bg-emerald-500/25 text-emerald-200", state: "bg-sky-500/25 text-sky-200", private: "bg-white/10 text-white/70" };

export function PaletteCard({ emoji, name, cost, blurb, active, onClick, i }: { emoji: string; name: string; cost: string; blurb: string; active: boolean; onClick: () => void; i: number }) {
  return (
    <motion.button
      onClick={onClick} title={blurb}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
      whileHover={{ y: -3, scale: 1.03 }} whileTap={{ scale: 0.95 }}
      className={`relative rounded-xl p-2.5 text-left transition-colors ${active ? "bg-emerald-500/30 ring-2 ring-emerald-400" : "bg-white/5 hover:bg-white/10"}`}
    >
      <motion.div className="text-2xl" animate={active ? { rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.5 }}>{emoji}</motion.div>
      <div className="mt-1 text-xs font-semibold leading-tight">{name}</div>
      <div className="text-[11px] tabular-nums text-emerald-300">{cost}</div>
    </motion.button>
  );
}

// ---------- Capacity meters ----------
const METER_ICON: Record<Resource, ReactNode> = {
  power: <Zap size={13} />, water: <Droplets size={13} />, sewage: <Waves size={13} />, primary: <School size={13} />, secondary: <GraduationCap size={13} />,
  health: <HeartPulse size={13} />, safety: <Shield size={13} />, food: <ShoppingCart size={13} />, comms: <Wifi size={13} />, jobs: <Briefcase size={13} />,
};
const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(n < 10 ? 1 : 0));

export function Meters({ meters }: { meters: Meter[] }) {
  return (
    <div className="space-y-2.5">
      {meters.map((m) => {
        const none = m.demand < 0.01;
        const ratio = none ? 1 : m.supply / m.demand;
        const color = none ? "#64748b" : ratio >= 1.1 ? "#10b981" : ratio >= 1 ? "#a3e635" : ratio >= 0.7 ? "#f59e0b" : "#ef4444";
        const fill = none ? 0 : Math.min(100, (m.demand / Math.max(m.supply, m.demand)) * 100);
        return (
          <div key={m.key}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium" style={{ color: none ? undefined : color }}>{METER_ICON[m.key]} <span className="text-white">{m.label}</span></span>
              <span className="tabular-nums text-white/60">
                {none ? "not needed yet" : <>{fmt(m.demand)} / {fmt(m.supply)} {m.unit}</>}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${m.supply < m.demand ? 100 : fill}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
            </div>
            {!none && ratio < 1 && <div className="mt-0.5 text-[10px] text-red-300">Short by {fmt(m.demand - m.supply)} {m.unit}</div>}
            {m.note && <div className="mt-0.5 text-[10px] text-amber-300">{m.note}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Budget ----------
export interface Totals {
  build: number;
  upkeep: number;
  byCat: Record<string, { build: number; upkeep: number; count: number }>;
  byPayer: Record<Payer, number>;
  earth: number;
  roadKm: number;
  roadBuild: number;
  roadUpkeep: number;
  junctionBuild: number;
  junctionUpkeep: number;
  people: number;
  dwellings: number;
  rates: number;
  itemised: { item: CatalogItem; count: number; build: number; upkeep: number }[];
}

function Section({ title, right, children, open: defaultOpen = true }: { title: string; right?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5"><motion.span animate={{ rotate: open ? 0 : -90 }}><ChevronDown size={14} /></motion.span>{title}</span>
        {right}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pt-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function BudgetPanel({ totals, meters, period, setPeriod, goalPeople, goalLabel, sizeKey, onSize }: {
  totals: Totals; meters: Meter[]; period: Period; setPeriod: (p: Period) => void; goalPeople: number; goalLabel: string;
  sizeKey: SizeKey; onSize: (s: SizeKey) => void;
}) {
  const unit = period === "year" ? "/yr" : "/mo";
  const councilNet = totals.rates - totals.byPayer.council;
  const short = meters.filter((m) => m.demand > 0.01 && m.supply < m.demand).length;
  return (
    <>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55">Build cost</div>
        <div className="text-4xl font-bold tabular-nums tracking-tight"><CountUp value={totals.build} format={money} duration={0.6} /></div>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55">Running costs</div>
            <div className="text-xl font-semibold tabular-nums text-amber-200"><CountUp value={per(totals.upkeep, period)} format={money} duration={0.6} /><span className="text-sm text-white/50">{unit}</span></div>
          </div>
          <div className="relative grid grid-cols-2 rounded-lg bg-white/10 p-0.5 text-[11px] font-semibold">
            {(["year", "month"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className="relative z-10 rounded-md px-2 py-1">
                {period === p && <motion.span layoutId="period" className="absolute inset-0 -z-10 rounded-md bg-white/20" />}
                {p === "year" ? "Year" : "Month"}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-white/45">Very rough estimates. Land, design and fees are extra.</div>
      </div>

      <div className="rounded-xl bg-white/5 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Housing for</span>
          <span className="tabular-nums"><CountUp value={totals.people} /> / {goalPeople.toLocaleString()} people</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (totals.people / goalPeople) * 100)}%` }} transition={{ type: "spring", stiffness: 80, damping: 16 }} />
        </div>
        <div className="mt-1 text-[11px] text-white/50">Goal: {goalLabel}</div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-0.5 text-[11px] font-semibold">
          {(Object.values(SIZES)).map((s) => (
            <button key={s.key} onClick={() => onSize(s.key)} className="relative z-10 rounded-md px-1 py-1" title={`${s.label}: ${s.peopleRange}`}>
              {sizeKey === s.key && <motion.span layoutId="town-size" className="absolute inset-0 -z-10 rounded-md bg-emerald-500/40" />}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Section title="Services & utilities" right={<span className={`text-xs ${short ? "text-red-300" : "text-emerald-300"}`}>{short ? `${short} short` : "all good"}</span>}>
        <Meters meters={meters} />
      </Section>

      <Section title="Who pays the running costs" right={<span className="text-xs text-white/50">{unit}</span>}>
        <div className="space-y-1.5 text-xs">
          {(Object.keys(totals.byPayer) as Payer[]).map((p) => (
            <div key={p} className="flex justify-between"><span className="text-white/70">{PAYER_LABEL[p]}</span><span className="tabular-nums">{money(per(totals.byPayer[p], period))}</span></div>
          ))}
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="flex justify-between"><span className="text-white/70">Council rates income <span className="text-white/40">({totals.dwellings} homes)</span></span><span className="tabular-nums text-emerald-300">+{money(per(totals.rates, period))}</span></div>
            <div className="flex justify-between font-semibold">
              <span>Council {councilNet >= 0 ? "surplus" : "shortfall"}</span>
              <span className={`tabular-nums ${councilNet >= 0 ? "text-emerald-300" : "text-red-300"}`}>{councilNet >= 0 ? "+" : "−"}{money(Math.abs(per(councilNet, period)))}</span>
            </div>
            <p className="mt-1 text-[10px] text-white/40">Councils also get state and federal grants, so a small shortfall is normal for a new town.</p>
          </div>
        </div>
      </Section>

      <Section title="Cost breakdown" right={<span className="text-xs text-white/50">build · run{unit}</span>}>
        <div className="space-y-1 text-xs">
          {Object.entries(totals.byCat).map(([c, v]) => (
            <div key={c} className="grid grid-cols-[1fr_auto_auto] gap-3">
              <span className="text-white/70">{c} <span className="text-white/40">×{v.count}</span></span>
              <span className="tabular-nums">{money(v.build)}</span>
              <span className="w-14 text-right tabular-nums text-amber-200">{money(per(v.upkeep, period))}</span>
            </div>
          ))}
          {totals.roadKm > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-3"><span className="text-white/70">Roads <span className="text-white/40">{totals.roadKm.toFixed(2)} km</span></span><span className="tabular-nums">{money(totals.roadBuild)}</span><span className="w-14 text-right tabular-nums text-amber-200">{money(per(totals.roadUpkeep, period))}</span></div>
          )}
          {totals.junctionBuild > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-3"><span className="text-white/70">Intersections</span><span className="tabular-nums">{money(totals.junctionBuild)}</span><span className="w-14 text-right tabular-nums text-amber-200">{money(per(totals.junctionUpkeep, period))}</span></div>
          )}
          {totals.earth > 1000 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-3"><span className="text-white/70">Earthworks</span><span className="tabular-nums">{money(totals.earth)}</span><span className="w-14 text-right text-white/30">—</span></div>
          )}
          {!totals.itemised.length && !totals.roadKm && <p className="text-white/50">Nothing built yet.</p>}
        </div>
      </Section>

      {totals.itemised.length > 0 && (
        <Section title="Every item" open={false} right={<span className="text-xs text-white/50">{totals.itemised.reduce((s, i) => s + i.count, 0)} built</span>}>
          <div className="space-y-1 text-xs">
            {totals.itemised.map((r) => (
              <div key={r.item.type} className="grid grid-cols-[1fr_auto_auto] gap-3">
                <span className="truncate text-white/70">{r.item.emoji} {r.item.name} <span className="text-white/40">×{r.count}</span></span>
                <span className="tabular-nums">{money(r.build)}</span>
                <span className="w-14 text-right tabular-nums text-amber-200">{money(per(r.upkeep, period))}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ---------- Selection ----------
export function ItemCard({ p, period, capacity, onRotate, onMove, onDelete, onClose, buildCost }: {
  p: Placed; period: Period; capacity: string | null; buildCost: number;
  onRotate: (dir: 1 | -1) => void; onMove: () => void; onDelete: () => void; onClose: () => void;
}) {
  const c = CATALOG_BY_TYPE[p.type];
  return (
    <div className="glass pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2.5">
      <span className="text-3xl">{c.emoji}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">{c.name}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${PAYER_TONE[c.payer]}`}>{PAYER_LABEL[c.payer]}</span></div>
        <div className="text-xs text-white/60">
          Build {money(buildCost)} · Runs {money(per(c.upkeep, period))}{period === "year" ? "/yr" : "/mo"}
          {c.people ? ` · ${c.people} people` : ""}{c.jobs ? ` · ${c.jobs} jobs` : ""}
        </div>
        {capacity && <div className="text-[11px] text-emerald-300">{capacity}</div>}
      </div>
      <div className="flex items-center gap-1">
        <IconBtn title="Rotate left (Shift+R)" onClick={() => onRotate(-1)}><RotateCcw size={15} /></IconBtn>
        <IconBtn title="Rotate right (R)" onClick={() => onRotate(1)}><RotateCw size={15} /></IconBtn>
        <IconBtn title="Move (M)" onClick={onMove}><Move size={15} /></IconBtn>
        <IconBtn title="Remove (Delete)" onClick={onDelete} danger><Trash2 size={15} /></IconBtn>
        <IconBtn title="Close (Esc)" onClick={onClose}><X size={15} /></IconBtn>
      </div>
    </div>
  );
}

export function RoadCard({ road, len, build, upkeep, period, onRename, onRandomName, onType, onDelete, onClose }: {
  road: Road; len: number; build: number; upkeep: number; period: Period;
  onRename: (n: string) => void; onRandomName: () => void; onType: (t: RoadType) => void; onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className="glass pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2.5">
      <span className="text-3xl">🪧</span>
      <div>
        <div className="flex items-center gap-1">
          <input value={road.name} onChange={(e) => onRename(e.target.value)} maxLength={40}
            className="w-44 rounded-lg bg-white/10 px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-400" />
          <IconBtn title="Random name" onClick={onRandomName}><Dices size={15} /></IconBtn>
        </div>
        <div className="mt-1 text-xs text-white/60">{(len / 1000).toFixed(2)} km · Build {money(build)} · Runs {money(per(upkeep, period))}{period === "year" ? "/yr" : "/mo"}</div>
      </div>
      <div className="flex gap-1">
        {(Object.keys(ROADS) as RoadType[]).map((t) => (
          <button key={t} onClick={() => onType(t)} title={ROADS[t].name}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${road.type === t ? "bg-emerald-500/40 ring-1 ring-emerald-300" : "bg-white/10 hover:bg-white/20"}`}>
            {ROADS[t].emoji} {ROADS[t].name.split(" ")[0]}
          </button>
        ))}
      </div>
      <IconBtn title="Remove road" onClick={onDelete} danger><Trash2 size={15} /></IconBtn>
      <IconBtn title="Close" onClick={onClose}><X size={15} /></IconBtn>
    </div>
  );
}

export function JunctionCard({ j, type, onType, onClose }: { j: Junction; type: JunctionType; onType: (t: JunctionType) => void; onClose: () => void }) {
  const opts: { t: JunctionType; label: string; emoji: string; cost: number }[] = [
    { t: "plain", label: "No signs", emoji: "✚", cost: 0 },
    { t: "giveway", label: "Give way", emoji: JUNCTIONS.giveway.emoji, cost: JUNCTIONS.giveway.cost },
    { t: "stop", label: "Stop signs", emoji: JUNCTIONS.stop.emoji, cost: JUNCTIONS.stop.cost },
    { t: "roundabout", label: JUNCTIONS.roundabout.name, emoji: JUNCTIONS.roundabout.emoji, cost: JUNCTIONS.roundabout.cost },
    { t: "lights", label: JUNCTIONS.lights.name, emoji: JUNCTIONS.lights.emoji, cost: JUNCTIONS.lights.cost },
  ];
  return (
    <div className="glass pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2.5">
      <div>
        <div className="text-sm font-semibold">{j.arms === 3 ? "T-intersection" : `${j.arms}-way crossroads`}</div>
        <div className="text-xs text-white/60">Choose how traffic gets through</div>
      </div>
      {opts.map((o) => (
        <motion.button key={o.t} whileTap={{ scale: 0.95 }} onClick={() => onType(o.t)}
          className={`rounded-xl px-3 py-1.5 text-left text-xs font-semibold ${type === o.t ? "bg-emerald-500/40 ring-1 ring-emerald-300" : "bg-white/10 hover:bg-white/20"}`}>
          <div>{o.emoji} {o.label}</div>
          <div className="text-[10px] font-normal text-white/60">{o.cost ? money(o.cost) : "Free"}</div>
        </motion.button>
      ))}
      <IconBtn title="Close" onClick={onClose}><X size={15} /></IconBtn>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} title={title} onClick={onClick}
      className={`rounded-lg p-1.5 ${danger ? "bg-red-500/70 hover:bg-red-500" : "bg-white/10 hover:bg-white/20"}`}>
      {children}
    </motion.button>
  );
}

// ---------- My towns ----------
export function TownsMenu({ towns, currentId, onOpen, onDelete, onNew, onExport, onImport, onShare, onClose }: {
  towns: TownMeta[]; currentId: string;
  onOpen: (t: TownMeta) => void; onDelete: (t: TownMeta) => void; onNew: () => void; onExport: () => void; onImport: (f: File) => void; onShare: () => Promise<boolean>; onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }}
      className="glass absolute right-3 top-16 z-40 w-96 rounded-2xl p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold">My towns</div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/10"><X size={15} /></button>
      </div>
      <p className="mb-3 text-[11px] text-white/55">Towns save automatically in this browser as you build. Export a file to keep a backup or move it to another computer, or share a link.</p>
      <div className="grid grid-cols-2 gap-2">
        <MenuBtn onClick={onNew}><Plus size={14} /> New town here</MenuBtn>
        <MenuBtn onClick={async () => { if (await onShare()) { setCopied(true); setTimeout(() => setCopied(false), 1800); } }}>
          {copied ? <><Check size={14} /> Link copied</> : <><Copy size={14} /> Copy share link</>}
        </MenuBtn>
        <MenuBtn onClick={onExport}><Download size={14} /> Export file</MenuBtn>
        <MenuBtn onClick={() => file.current?.click()}><Upload size={14} /> Import file</MenuBtn>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
      </div>
      <div className="scroll-thin mt-3 max-h-72 space-y-1.5 overflow-y-auto">
        {towns.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${t.id === currentId ? "bg-emerald-500/20 ring-1 ring-emerald-400/50" : "bg-white/5"}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.name || "Unnamed town"}</div>
              <div className="text-[11px] text-white/50">{t.items} items · {new Date(t.savedAt).toLocaleString()} · {t.lat.toFixed(2)}, {t.lng.toFixed(2)}</div>
            </div>
            {t.id !== currentId && <IconBtn title="Open" onClick={() => onOpen(t)}><FolderOpen size={14} /></IconBtn>}
            <IconBtn title="Delete" onClick={() => onDelete(t)} danger><Trash2 size={14} /></IconBtn>
          </div>
        ))}
        {!towns.length && <p className="text-xs text-white/50">No saved towns yet.</p>}
      </div>
    </motion.div>
  );
}

function MenuBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">
      {children}
    </motion.button>
  );
}
