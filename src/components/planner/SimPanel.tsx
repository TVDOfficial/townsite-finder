"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Landmark, Pause, Play, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CountUp, money } from "../ui";
import { CHALLENGES, LOAN_SIZE, monthName, yearOf, type EventKey, type SimState } from "./sim";

const EVENT_LABEL: Record<EventKey, string> = {
  drought: "🌵 Drought", bushfire: "🔥 Bushfire recovery", heatwave: "🌡️ Heatwave", boom: "⛏️ Mining boom",
  grant: "🎁 Grant", festival: "🎉 Festival", flood: "🌊 Flood", storm: "⛈️ Storm",
};

function Spark({ values, color, label, format }: { values: number[]; color: string; label: string; format: (n: number) => string }) {
  const w = 150, h = 40;
  if (values.length < 2) return <div className="flex h-[58px] items-center justify-center rounded-lg bg-white/5 text-[10px] text-white/40">{label}: not enough data yet</div>;
  const min = Math.min(...values, 0), max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <div className="flex justify-between text-[10px] text-white/55"><span>{label}</span><span className="tabular-nums text-white/80">{format(values[values.length - 1])}</span></div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-10 w-full" preserveAspectRatio="none">
        {min < 0 && <line x1={0} x2={w} y1={h - ((0 - min) / (max - min)) * h} y2={h - ((0 - min) / (max - min)) * h} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />}
        <motion.polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
      </svg>
    </div>
  );
}

export default function SimPanel({ sim, capacity, playing, setPlaying, speed, setSpeed, onLoan, onEnd }: {
  sim: SimState; capacity: number; playing: boolean; setPlaying: (v: boolean) => void; speed: number; setSpeed: (v: number) => void;
  onLoan: () => void; onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const seen = useRef(sim.done.length);
  useEffect(() => {
    if (sim.done.length > seen.current) {
      const id = sim.done[sim.done.length - 1];
      setCelebrate(id);
      const timer = setTimeout(() => setCelebrate(null), 3800);
      seen.current = sim.done.length;
      return () => clearTimeout(timer);
    }
    seen.current = sim.done.length;
  }, [sim.done]);

  const face = sim.happiness >= 75 ? "😀" : sim.happiness >= 55 ? "🙂" : sim.happiness >= 40 ? "😐" : "😟";
  const activeEvents = sim.events.filter((e) => e.until > sim.t);
  const won = CHALLENGES.find((c) => c.id === celebrate);

  return (
    <>
      <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}
        className="glass absolute left-1/2 top-[4.6rem] z-30 w-[min(44rem,calc(100%-40rem))] min-w-[30rem] -translate-x-1/2 rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPlaying(!playing)} title={playing ? "Pause (Space)" : "Play (Space)"}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${playing ? "bg-amber-500" : "bg-emerald-500"}`}>
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </motion.button>
          <div className="flex rounded-lg bg-white/10 p-0.5 text-[11px] font-semibold">
            {[1, 3, 12].map((v) => (
              <button key={v} onClick={() => setSpeed(v)} className="relative z-10 rounded-md px-2 py-1" title={`${v} month${v > 1 ? "s" : ""} per second`}>
                {speed === v && <motion.span layoutId="sim-speed" className="absolute inset-0 -z-10 rounded-md bg-white/25" />}
                {v === 1 ? "1×" : v === 3 ? "3×" : "12×"}
              </button>
            ))}
          </div>
          <div className="text-sm font-semibold tabular-nums">Year {yearOf(sim.t)} · {monthName(sim.t)}</div>
          <div className="flex items-center gap-1.5 text-sm tabular-nums" title="Residents / homes available">
            <Users size={14} className="text-sky-300" /><CountUp value={sim.pop} duration={0.5} /><span className="text-white/40">/ {capacity.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 text-sm tabular-nums" title="Happiness">
            <motion.span key={face} initial={{ scale: 1.6 }} animate={{ scale: 1 }}>{face}</motion.span>{Math.round(sim.happiness)}%
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-semibold tabular-nums ${sim.funds < 0 ? "text-red-300" : "text-emerald-300"}`} title="Council funds">
            <Landmark size={14} /><CountUp value={sim.funds} format={money} duration={0.5} />
          </div>
          <div className="flex-1" />
          <button onClick={onLoan} title={`Borrow ${money(LOAN_SIZE)} over 20 years at 6%`} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold hover:bg-white/20">+ Loan</button>
          <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1 hover:bg-white/10" title="Details">
            <motion.span animate={{ rotate: open ? 180 : 0 }} className="block"><ChevronDown size={16} /></motion.span>
          </button>
          <button onClick={onEnd} className="rounded-lg p-1 hover:bg-white/10" title="End simulation"><X size={16} /></button>
        </div>

        <AnimatePresence initial={false}>
          {activeEvents.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex flex-wrap gap-1.5 overflow-hidden px-3 pb-2">
              {activeEvents.map((e) => (
                <motion.span key={e.key} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
                  {EVENT_LABEL[e.key]} · {e.until - sim.t} mo left
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-3 gap-2 border-t border-white/10 px-3 pt-3">
                <Spark values={sim.history.map((h) => h.pop)} color="#7dd3fc" label="Population" format={(n) => Math.round(n).toLocaleString()} />
                <Spark values={sim.history.map((h) => h.funds)} color="#6ee7b7" label="Council funds" format={money} />
                <Spark values={sim.history.map((h) => h.happy)} color="#fcd34d" label="Happiness" format={(n) => `${Math.round(n)}%`} />
              </div>
              <div className="grid grid-cols-2 gap-3 p-3">
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">Challenges · {sim.done.length}/{CHALLENGES.length}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CHALLENGES.map((c) => {
                      const ok = sim.done.includes(c.id);
                      return (
                        <motion.div key={c.id} layout title={c.desc}
                          animate={ok ? { scale: [1, 1.08, 1] } : {}}
                          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] ${ok ? "bg-amber-400/25 text-amber-100 ring-1 ring-amber-300/50" : "bg-white/5 text-white/50"}`}>
                          <span className={ok ? "" : "grayscale"}>{c.emoji}</span>
                          <span className="truncate">{c.name}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">Town news</div>
                  <ul className="scroll-thin max-h-40 space-y-1 overflow-y-auto pr-1 text-[11px]">
                    {[...sim.log].reverse().slice(0, 14).map((l, i) => (
                      <motion.li key={`${l.t}-${i}-${l.text}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                        className={l.tone === "bad" ? "text-red-200" : l.tone === "good" ? "text-emerald-200" : "text-white/70"}>
                        <span className="text-white/35">Y{yearOf(l.t)} {monthName(l.t)} · </span>{l.text}
                      </motion.li>
                    ))}
                  </ul>
                  {sim.debt > 0 && <div className="mt-2 text-[11px] text-white/55">Debt {money(sim.debt)} · repaying {money(sim.loanPayment)}/month</div>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Challenge celebration */}
      <AnimatePresence>
        {won && (
          <motion.div initial={{ opacity: 0, scale: 0.6, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="pointer-events-none absolute left-1/2 top-1/3 z-50 -translate-x-1/2 text-center">
            <div className="relative rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 px-8 py-5 shadow-2xl shadow-amber-900/50">
              {Array.from({ length: 18 }, (_, i) => (
                <motion.span key={i} className="absolute left-1/2 top-1/2 text-xl"
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: Math.cos((i / 18) * Math.PI * 2) * (120 + (i % 3) * 30), y: Math.sin((i / 18) * Math.PI * 2) * (90 + (i % 3) * 25), opacity: 0, rotate: 360 }}
                  transition={{ duration: 1.6, ease: "easeOut" }}>
                  {["🎉", "✨", "⭐", "🎊"][i % 4]}
                </motion.span>
              ))}
              <div className="text-4xl">{won.emoji}</div>
              <div className="text-xs font-semibold uppercase tracking-widest text-amber-950/80">Challenge complete</div>
              <div className="text-xl font-bold text-amber-950">{won.name}</div>
              <div className="text-sm text-amber-950/80">{won.desc}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
