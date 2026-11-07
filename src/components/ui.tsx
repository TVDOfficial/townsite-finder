"use client";

import { animate, motion, useMotionValue, useTransform, type Variants } from "motion/react";
import { useEffect, type ReactNode } from "react";

export const money = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
export const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : n < 10 ? `${n.toFixed(1)} km` : `${Math.round(n)} km`);

/** Number that counts up when it first appears or changes. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), duration = 1.1 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, duration, mv]);
  return <motion.span>{text}</motion.span>;
}

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
export const rise: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 260, damping: 26 } },
};

export function Card({ title, icon, children, right, className = "" }: { title?: string; icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <motion.section variants={rise} className={`rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.08)] ${className}`}>
      {title && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
            {icon}
            {title}
          </h3>
          {right}
        </header>
      )}
      {children}
    </motion.section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

const TONE: Record<string, string> = { good: "#0f9f6e", ok: "#d9a406", hard: "#e8742c", extreme: "#dc2626" };

/** Animated ring gauge for the difficulty score. */
export function ScoreRing({ score, tone, label }: { score: number; tone: string; label: string }) {
  const r = 52, c = 2 * Math.PI * r;
  const color = TONE[tone] ?? TONE.ok;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <motion.circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>
          <CountUp value={score} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

export function Bar({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(3, value)}%` }}
        transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

export function scoreColor(s: number) {
  return s < 35 ? TONE.good : s < 55 ? TONE.ok : s < 72 ? TONE.hard : TONE.extreme;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  const cls = {
    neutral: "bg-surface-2 text-muted",
    good: "bg-accent-soft text-accent-strong",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bad: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}
