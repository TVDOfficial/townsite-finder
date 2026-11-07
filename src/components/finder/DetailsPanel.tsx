"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Building2, CloudRain, Compass, Copy, Droplets, ExternalLink, Globe2, Hammer, Hospital, Landmark, Map as MapIcon,
  Mountain, Plane, Route, Scale, ShieldAlert, Sparkles, Sun, TrainFront, Zap, Check, Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { difficulty, estimatePrice, estimateTenure, SIZES, type SizeKey } from "@/lib/analysis";
import { acquisitionSteps, buildSteps, GENERAL_LINKS, STATE_INFO } from "@/lib/guide";
import { STATE_NAMES, type NearbyDetails, type NearFeature, type SpotDetails } from "@/lib/types";
import { Badge, Bar, Card, CountUp, km, money, rise, ScoreRing, scoreColor, Skeleton, Stat, stagger } from "../ui";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

interface Props {
  details: SpotDetails;
  nearby: NearbyDetails | null;
  nearbyLoading: boolean;
  sizeKey: SizeKey;
  onSize: (s: SizeKey) => void;
}

export default function DetailsPanel({ details: d, nearby, nearbyLoading, sizeKey, onSize }: Props) {
  const size = SIZES[sizeKey];
  const tenure = useMemo(() => estimateTenure(d, nearby), [d, nearby]);
  const price = useMemo(() => estimatePrice(d, tenure, size), [d, tenure, size]);
  const diff = useMemo(() => difficulty(d, nearby, tenure, size), [d, nearby, tenure, size]);
  const state = d.state ?? "NSW";
  const [copied, setCopied] = useState(false);

  const title = d.places[0] ? `${km(d.places[0].km)} from ${d.places[0].name}` : "Remote outback";
  const earthUrl = `https://earth.google.com/web/@${d.lat},${d.lng},${d.terrain?.elevation ?? 200}a,2500d,35y,0h,60t,0r`;
  const mapsUrl = `https://www.google.com/maps/@?api=1&map_action=map&center=${d.lat},${d.lng}&zoom=14&basemap=satellite`;
  const planUrl = `/plan?lat=${d.lat}&lng=${d.lng}&size=${sizeKey}`;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3">
      {/* ---------- Header ---------- */}
      <Card className="overflow-hidden !p-0">
        <div className="relative bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-700 p-4 text-white">
          <motion.div
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10"
            animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity }}
          />
          <div className="text-xs font-medium uppercase tracking-wider text-white/75">
            {nearby?.area?.lga ? `${nearby.area.lga} · ` : ""}{STATE_NAMES[state]}
          </div>
          <h2 className="mt-1 text-xl font-semibold leading-tight">{title}</h2>
          <div className="mt-1 font-mono text-xs text-white/75">{d.lat.toFixed(4)}, {d.lng.toFixed(4)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          <motion.a whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} href={earthUrl} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium hover:bg-border">
            <Globe2 size={16} /> Google Earth
          </motion.a>
          <motion.a whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} href={mapsUrl} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium hover:bg-border">
            <MapIcon size={16} /> Google Maps
          </motion.a>
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={share}
            className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium hover:bg-border">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={copied ? "y" : "n"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex items-center gap-2">
                {copied ? <><Check size={16} /> Link copied</> : <><Copy size={16} /> Share link</>}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <Link href={planUrl} className="contents">
            <motion.span whileHover={{ y: -2, boxShadow: "0 10px 24px -8px rgba(15,159,110,0.6)" }} whileTap={{ scale: 0.97 }}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white">
              <Hammer size={16} /> Plan this town
            </motion.span>
          </Link>
        </div>
      </Card>

      {/* ---------- Town size ---------- */}
      <Card title="Town size" icon={<Building2 size={14} />}>
        <div className="relative grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {Object.values(SIZES).map((s) => (
            <button key={s.key} onClick={() => onSize(s.key)} className="relative z-10 rounded-lg px-2 py-2 text-center">
              {sizeKey === s.key && (
                <motion.span layoutId="size-pill" className="absolute inset-0 -z-10 rounded-lg bg-surface shadow-sm" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-[11px] text-muted">{s.peopleRange}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          {size.blurb} Needs about <b className="text-foreground">{size.landHa.toLocaleString()} ha</b> of land and{" "}
          <b className="text-foreground">{size.waterMLPerYear.toLocaleString()} ML</b> of water a year (green circle on the map).
        </p>
      </Card>

      {/* ---------- Difficulty ---------- */}
      <Card title="How hard would it be?" icon={<Sparkles size={14} />} right={nearbyLoading ? <Badge>Updating…</Badge> : undefined}>
        <div className="flex items-center gap-4">
          <ScoreRing score={diff.total} tone={diff.tone} label={diff.label} />
          <p className="text-sm text-muted">
            0 is easy, 100 is close to impossible. Change the town size to see how it shifts.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {diff.parts.map((p, i) => (
            <div key={p.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{p.label}</span>
                <span className="tabular-nums text-muted"><CountUp value={p.score} /></span>
              </div>
              <Bar value={p.score} color={scoreColor(p.score)} delay={0.1 + i * 0.06} />
              <div className="mt-1 text-xs text-muted">{p.summary}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------- Land & price ---------- */}
      <Card title="Land & price" icon={<Landmark size={14} />}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{tenure.label}</span>
          <Badge tone={tenure.blocked ? "bad" : tenure.confidence === "high" ? "good" : "warn"}>
            {tenure.blocked ? "Not for sale" : `${tenure.confidence} confidence`}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{tenure.why}</p>

        {price.available ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Per hectare" value={<>{money(price.perHaLow)}–{money(price.perHaHigh)}</>} />
            <Stat label={`Land for a ${size.label.toLowerCase()}`} value={<>{money(price.totalLow)}–{money(price.totalHigh)}</>} sub={`${size.landHa.toLocaleString()} ha`} />
            <div className="col-span-2">
              <Stat label="Plus duty, surveys & legal" value={<>{money(price.extrasLow)}–{money(price.extrasHigh)}</>} />
            </div>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted">{price.note}</p>

        <div className="mt-3 space-y-2 text-sm">
          {d.protectedArea && (
            <div className="flex gap-2 rounded-xl bg-red-50 p-2.5 text-red-800 dark:bg-red-950/50 dark:text-red-300">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" /> Inside {d.protectedArea.name} ({d.protectedArea.type}).
            </div>
          )}
          <div className="flex gap-2 rounded-xl bg-surface-2 p-2.5">
            <Scale size={16} className="mt-0.5 shrink-0 text-muted" />
            <div>
              <div className="font-medium">Native title</div>
              <div className="text-muted">
                {d.nativeTitle?.determination
                  ? `${d.nativeTitle.determination.outcome} (${d.nativeTitle.determination.name}).`
                  : "No native title determination recorded here."}
                {d.nativeTitle?.claim && ` Open claim: ${d.nativeTitle.claim.name}.`}
                {!d.nativeTitle && " Couldn't check right now."}
              </div>
            </div>
          </div>
          <a href={STATE_INFO[state].viewer.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            Check the actual land parcel on {STATE_INFO[state].viewer.label} <ExternalLink size={13} />
          </a>
        </div>
      </Card>

      {/* ---------- Terrain ---------- */}
      <Card title="Terrain" icon={<Mountain size={14} />}>
        {d.terrain ? (
          <div className="flex gap-3">
            <div className="grid flex-1 grid-cols-2 gap-2">
              <Stat label="Elevation" value={<><CountUp value={d.terrain.elevation} /> m</>} />
              <Stat label="Height range" value={<><CountUp value={d.terrain.max - d.terrain.min} /> m</>} sub="across 2 km" />
              <Stat label="Average slope" value={<><CountUp value={d.terrain.meanSlope} format={(n) => n.toFixed(1)} />%</>} />
              <Stat label="Gentle ground" value={<><CountUp value={d.terrain.flatShare * 100} />%</>} sub="under 5% slope" />
            </div>
            <div className="flex flex-col items-center">
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${d.terrain.gridSize}, 1fr)` }}>
                {d.terrain.slopes.map((s, i) => (
                  <motion.div
                    key={i}
                    className="h-3 w-3 rounded-[3px]"
                    style={{ background: s < 2 ? "#34d399" : s < 5 ? "#a3e635" : s < 10 ? "#facc15" : s < 20 ? "#fb923c" : "#ef4444" }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + (i % d.terrain!.gridSize) * 0.03 + Math.floor(i / d.terrain!.gridSize) * 0.03 }}
                  />
                ))}
              </div>
              <div className="mt-1.5 text-[10px] text-muted">Slope map, 2×2 km</div>
            </div>
          </div>
        ) : <p className="text-sm text-muted">Terrain data didn&apos;t load.</p>}
      </Card>

      {/* ---------- Water ---------- */}
      <Card title="Water" icon={<Droplets size={14} />}>
        {d.climate && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <CloudRain size={16} className="text-water" />
            <span><b><CountUp value={d.climate.annualRainMm} /> mm</b> rain a year</span>
          </div>
        )}
        {nearbyLoading ? <RowsSkeleton /> : nearby?.water?.length ? (
          <ul className="space-y-1.5">
            {nearby.water.map((w, i) => (
              <motion.li key={`${w.name}${i}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{w.name}</span>
                  <span className="text-xs text-muted">{w.kind}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {w.salt && <Badge tone="warn">salt</Badge>}
                  {w.intermittent && <Badge>seasonal</Badge>}
                  <span className="tabular-nums text-muted">{km(w.km)}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{nearby ? "No mapped water within about 40 km. Groundwater bores would be the main option." : "Water data didn't load."}</p>}
      </Card>

      {/* ---------- Access ---------- */}
      <Card title="Access & services" icon={<Compass size={14} />}>
        <ul className="space-y-1.5 text-sm">
          {d.nearestTown && <Row icon={<Building2 size={15} />} label={`${d.nearestTown.name}${d.nearestTown.population ? ` (pop. ${d.nearestTown.population.toLocaleString()})` : ""}`} sub="Nearest town" value={km(d.nearestTown.km)} />}
          <Row icon={<Landmark size={15} />} label={d.nearestCity.name} sub="Nearest city" value={km(d.nearestCity.km)} />
          {d.hospital && <Row icon={<Hospital size={15} />} label={d.hospital.name} sub="Nearest hospital" value={km(d.hospital.km)} />}
          {nearbyLoading ? <RowsSkeleton rows={3} /> : (
            <>
              <FeatureRow icon={<Route size={15} />} f={nearby?.infrastructure?.majorRoad} sub="Nearest highway / main road" none="No main road within 70 km" />
              <FeatureRow icon={<Route size={15} />} f={nearby?.infrastructure?.localRoad} sub="Nearest local road or track" none="No local road within 6 km" />
              <FeatureRow icon={<Zap size={15} />} f={nearby?.infrastructure?.powerLine} sub="Nearest power line" none="Power line data not available" />
              <FeatureRow icon={<TrainFront size={15} />} f={nearby?.infrastructure?.railway} sub="Nearest railway" none="No railway within 70 km" />
              <FeatureRow icon={<Plane size={15} />} f={nearby?.infrastructure?.airport} sub="Nearest airfield" none="No airfield within 70 km" />
            </>
          )}
        </ul>
      </Card>

      {/* ---------- Climate ---------- */}
      {d.climate && (
        <Card title="Climate" icon={<Sun size={14} />} right={<span className="text-[11px] text-muted">{d.climate.years}</span>}>
          <ClimateChart c={d.climate} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Summer high" value={<>{Math.max(...d.climate.monthlyMaxC).toFixed(0)}°</>} />
            <Stat label="Winter low" value={<>{Math.min(...d.climate.monthlyMinC).toFixed(0)}°</>} />
            <Stat label="Days >40°" value={<CountUp value={d.climate.hotDaysPerYear} />} sub="per year" />
          </div>
        </Card>
      )}

      {/* ---------- Photos ---------- */}
      <Card title="Photos nearby" icon={<ImageIcon size={14} />}>
        {d.photos.length ? (
          <div className="scroll-thin -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
            {d.photos.map((p, i) => (
              <motion.a key={p.page} href={p.page} target="_blank" rel="noreferrer"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }}
                whileHover={{ y: -3 }}
                className="group relative w-52 shrink-0 snap-start overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.title} loading="lazy" className="h-36 w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="p-2">
                  <div className="truncate text-xs font-medium">{p.title}</div>
                  <div className="truncate text-[10px] text-muted">{km(p.km)} away · {p.credit}</div>
                </div>
              </motion.a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No public photos within 10 km. That&apos;s normal out here. Open Google Earth to look around.</p>
        )}
      </Card>

      {/* ---------- How to buy ---------- */}
      <Card title="How you could get the land" icon={<Landmark size={14} />}>
        <Steps steps={acquisitionSteps(tenure.key, state)} />
      </Card>

      {/* ---------- How to build ---------- */}
      <Card title={`Building a ${size.label.toLowerCase()}`} icon={<Hammer size={14} />}>
        <Steps steps={buildSteps(state, size, nearby?.area?.lga)} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {[...STATE_INFO[state].links, ...GENERAL_LINKS].map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              {l.label} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      </Card>

      <motion.p variants={rise} className="px-2 pb-6 text-center text-[11px] leading-relaxed text-muted">
        Rough estimates for curiosity only, not legal, financial or planning advice. Land type is estimated from
        location and rainfall; check the real parcel with the state before relying on it. Data: OpenStreetMap,
        OpenFreeMap, Open-Meteo, CAPAD 2024, National Native Title Tribunal, Wikimedia Commons.
      </motion.p>
    </motion.div>
  );
}

function Row({ icon, label, sub, value }: { icon: React.ReactNode; label: string; sub: string; value: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
      <span className="text-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className="text-xs text-muted">{sub}</span>
      </span>
      <span className="tabular-nums text-muted">{value}</span>
    </li>
  );
}

function FeatureRow({ icon, f, sub, none }: { icon: React.ReactNode; f?: NearFeature; sub: string; none: string }) {
  if (!f) return <Row icon={icon} label={none} sub={sub} value="—" />;
  return <Row icon={icon} label={`${f.name}${f.detail && f.kind !== "Power line" ? ` · ${f.detail}` : ""}`} sub={sub} value={km(f.km)} />;
}

function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

function Steps({ steps }: { steps: { title: string; body: string; time: string }[] }) {
  return (
    <ol className="relative space-y-3 border-l-2 border-border pl-5">
      {steps.map((s, i) => (
        <motion.li key={s.title} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="relative">
          <span className="absolute -left-[29px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white ring-4 ring-surface">{i + 1}</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{s.title}</span>
            <span className="shrink-0 text-[11px] text-muted">{s.time}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted">{s.body}</p>
        </motion.li>
      ))}
    </ol>
  );
}

function ClimateChart({ c }: { c: NonNullable<SpotDetails["climate"]> }) {
  const maxRain = Math.max(...c.monthlyRainMm, 1);
  const tMin = Math.min(...c.monthlyMinC), tMax = Math.max(...c.monthlyMaxC);
  const y = (t: number) => 70 - ((t - tMin) / (tMax - tMin || 1)) * 60;
  const line = (arr: number[]) => arr.map((t, i) => `${i ? "L" : "M"}${i * 25 + 12.5},${y(t)}`).join(" ");
  return (
    <div>
      <svg viewBox="0 0 300 100" className="w-full">
        {c.monthlyRainMm.map((r, i) => (
          <motion.rect key={i} x={i * 25 + 5} width={15} rx={3} fill="var(--water)" opacity={0.35}
            initial={{ height: 0, y: 80 }} animate={{ height: (r / maxRain) * 60, y: 80 - (r / maxRain) * 60 }} transition={{ delay: i * 0.04, type: "spring", stiffness: 120, damping: 18 }} />
        ))}
        <motion.path d={line(c.monthlyMaxC)} fill="none" stroke="#f97316" strokeWidth={2.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
        <motion.path d={line(c.monthlyMinC)} fill="none" stroke="#38bdf8" strokeWidth={2.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: 0.2 }} />
        {MONTHS.map((m, i) => <text key={i} x={i * 25 + 12.5} y={95} textAnchor="middle" fontSize={9} fill="var(--muted)">{m}</text>)}
      </svg>
      <div className="flex gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-orange-500" /> Avg high</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-sky-400" /> Avg low</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-water/40" /> Rain</span>
      </div>
    </div>
  );
}
