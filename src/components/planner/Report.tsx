"use client";

import { motion } from "motion/react";
import { Printer, X } from "lucide-react";
import { useMemo } from "react";
import { difficulty, estimatePrice, estimateTenure, permanentWater, SIZES } from "@/lib/analysis";
import { acquisitionSteps, buildSteps, STATE_INFO } from "@/lib/guide";
import { STATE_NAMES, type NearbyDetails, type SpotDetails } from "@/lib/types";
import { km, money } from "../ui";
import type { Meter } from "./capacity";
import { CATALOG_BY_TYPE, JUNCTIONS, ROADS, type Category } from "./catalog";
import { boundaryAreaHa, boundaryCorners, corners, insideBoundary, type Boundary, type Junction, type JunctionType } from "./geometry";
import type { Totals } from "./Panels";
import type { PlanData } from "./storage";
import { LogoMark, PORTFOLIO_URL } from "../Logo";

const CAT_COLOR: Record<Category, string> = {
  Housing: "#e8a33d", Community: "#2f80ed", Commercial: "#c94f3d", Industry: "#7f8c8d", Utilities: "#16a085", Transport: "#8e44ad", Nature: "#27ae60",
};

interface Props {
  plan: PlanData;
  totals: Totals;
  meters: Meter[];
  roadInfo: Map<number, { len: number; build: number; upkeep: number; grade: number }>;
  junctions: Junction[];
  junctionTypes: Record<string, JunctionType>;
  boundary: Boundary;
  site: SpotDetails | null;
  nearby: NearbyDetails | null;
  snapshot: string | null;
  onClose: () => void;
}

export default function Report({ plan, totals, meters, roadInfo, junctions, junctionTypes, boundary, site, nearby, snapshot, onClose }: Props) {
  const size = SIZES[plan.size];
  const analysis = useMemo(() => {
    if (!site) return null;
    const tenure = estimateTenure(site, nearby);
    return { tenure, price: estimatePrice(site, tenure, size), diff: difficulty(site, nearby, tenure, size) };
  }, [site, nearby, size]);
  const areaHa = boundaryAreaHa(boundary);
  const landLow = analysis?.price.available ? analysis.price.perHaLow * areaHa : 0;
  const landHigh = analysis?.price.available ? analysis.price.perHaHigh * areaHa : 0;
  const outside = plan.placed.filter((p) => !insideBoundary(boundary, p.x, p.z)).length;
  const state = site?.state ?? "NSW";
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const short = meters.filter((m) => m.demand > 0.01 && m.supply < m.demand);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="report-root fixed inset-0 z-[100] overflow-y-auto bg-neutral-200 text-neutral-900">
      <div className="report-toolbar sticky top-0 z-10 flex items-center justify-between bg-neutral-900 px-4 py-2 text-white">
        <span className="text-sm font-semibold">Town plan report · {plan.name}</span>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold"><Printer size={15} /> Print / Save as PDF</button>
          <button onClick={onClose} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm"><X size={15} /> Close</button>
        </div>
      </div>

      <div className="report mx-auto my-6 max-w-[860px] bg-white px-12 py-10 shadow-xl print:my-0 print:shadow-none">
        {/* ---------- Cover ---------- */}
        <section className="report-page">
          <div className="flex items-center gap-2"><LogoMark size={28} /><div className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Townsite · Town plan report</div></div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">{plan.name || "Unnamed town"}</h1>
          <p className="mt-1 text-neutral-600">
            Proposed {size.label.toLowerCase()} · {site?.places[0] ? `${km(site.places[0].km)} from ${site.places[0].name}, ` : ""}{STATE_NAMES[state]}
          </p>
          <p className="text-sm text-neutral-500">{plan.lat.toFixed(5)}, {plan.lng.toFixed(5)}{nearby?.area?.lga ? ` · ${nearby.area.lga}` : ""} · Prepared {today}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {snapshot && <img src={snapshot} alt="3D view of the planned town" className="mt-6 w-full rounded-lg border border-neutral-200" />}

          <h2 className="report-h2">Executive summary</h2>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Planned population" value={totals.people.toLocaleString()} sub={`target ${size.peopleRange}`} />
            <Kpi label="Dwellings" value={totals.dwellings.toLocaleString()} />
            <Kpi label="Buildings & facilities" value={plan.placed.length.toLocaleString()} />
            <Kpi label="Capital cost (build)" value={money(totals.build)} />
            <Kpi label="Running costs" value={`${money(totals.upkeep)}/yr`} sub={`${money(totals.upkeep / 12)}/month`} />
            <Kpi label="Town area" value={`${Math.round(areaHa).toLocaleString()} ha`} sub={`${(boundary.w / 1000).toFixed(2)} × ${(boundary.d / 1000).toFixed(2)} km`} />
            <Kpi label="Land purchase (est.)" value={analysis?.price.available ? `${money(landLow)}–${money(landHigh)}` : "Not for sale"} />
            <Kpi label="Roads" value={`${totals.roadKm.toFixed(2)} km`} sub={`${plan.roads.length} streets`} />
            <Kpi label="Site difficulty" value={analysis ? `${analysis.diff.total}/100` : "—"} sub={analysis?.diff.label} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-neutral-700">
            This report sets out a concept plan for a new {size.label.toLowerCase()} named {plan.name || "the town"} on {Math.round(areaHa).toLocaleString()} ha
            {site?.nearestTown ? `, ${km(site.nearestTown.km)} from ${site.nearestTown.name}` : ""}. The plan provides housing for about {totals.people.toLocaleString()} people
            with an estimated capital cost of {money(totals.build)} (excluding land) and running costs of about {money(totals.upkeep)} a year.
            {short.length ? ` ${short.length} service${short.length > 1 ? "s are" : " is"} under capacity and will need more infrastructure (see Services & utilities).` : " All modelled services meet demand."}
            {outside ? ` ${outside} item${outside > 1 ? "s sit" : " sits"} outside the proposed town boundary.` : ""}
          </p>
        </section>

        {/* ---------- Site ---------- */}
        <section className="report-page">
          <h2 className="report-h2">Site assessment</h2>
          {site ? (
            <table className="report-table">
              <tbody>
                <Row k="Location" v={`${plan.lat.toFixed(5)}, ${plan.lng.toFixed(5)} · ${STATE_NAMES[state]}${nearby?.area?.lga ? ` · ${nearby.area.lga}` : ""}`} />
                <Row k="Nearest town / city" v={`${site.nearestTown ? `${site.nearestTown.name} (${km(site.nearestTown.km)})` : "—"} · ${site.nearestCity.name} (${km(site.nearestCity.km)})`} />
                <Row k="Nearest hospital" v={site.hospital ? `${site.hospital.name} (${km(site.hospital.km)})` : "—"} />
                <Row k="Terrain" v={site.terrain ? `${site.terrain.elevation} m elevation · average slope ${site.terrain.meanSlope.toFixed(1)}% · ${Math.round(site.terrain.flatShare * 100)}% gentle ground` : "—"} />
                <Row k="Climate" v={site.climate ? `${site.climate.annualRainMm} mm rain/yr · summer highs ${Math.max(...site.climate.monthlyMaxC).toFixed(0)}°C · ${site.climate.hotDaysPerYear} days over 40°C/yr` : "—"} />
                <Row k="Water" v={(() => { const w = permanentWater(nearby) ?? nearby?.water?.[0]; return w ? `${w.name} (${w.kind.toLowerCase()}, ${km(w.km)})` : "No mapped surface water nearby"; })()} />
                <Row k="Main road" v={nearby?.infrastructure?.majorRoad ? `${nearby.infrastructure.majorRoad.name} (${km(nearby.infrastructure.majorRoad.km)})` : "—"} />
                <Row k="Power" v={nearby?.infrastructure?.powerLine ? `${nearby.infrastructure.powerLine.name} (${km(nearby.infrastructure.powerLine.km)})` : "No grid line nearby"} />
                <Row k="Land type (estimated)" v={analysis ? `${analysis.tenure.label} — ${analysis.tenure.why}` : "—"} />
                <Row k="Native title" v={site.nativeTitle?.determination ? `${site.nativeTitle.determination.outcome} (${site.nativeTitle.determination.name})` : "No determination recorded"} />
                <Row k="Protected areas" v={site.protectedArea ? `${site.protectedArea.name} (${site.protectedArea.type})` : "None at this point"} />
              </tbody>
            </table>
          ) : <p className="text-sm text-neutral-500">Site data unavailable.</p>}
          {analysis && (
            <>
              <h3 className="report-h3">Difficulty breakdown</h3>
              <table className="report-table">
                <thead><tr><th>Factor</th><th>Score</th><th>Notes</th></tr></thead>
                <tbody>{analysis.diff.parts.map((p) => <tr key={p.key}><td>{p.label}</td><td>{p.score}</td><td>{p.summary}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </section>

        {/* ---------- Site plan ---------- */}
        <section className="report-page">
          <h2 className="report-h2">Site plan</h2>
          <SitePlan plan={plan} boundary={boundary} junctions={junctions} junctionTypes={junctionTypes} />
          <p className="mt-2 text-xs text-neutral-500">Town boundary {Math.round(areaHa).toLocaleString()} ha ({(boundary.w / 1000).toFixed(2)} km × {(boundary.d / 1000).toFixed(2)} km). Colours show building categories.</p>
        </section>

        {/* ---------- Schedules ---------- */}
        <section className="report-page">
          <h2 className="report-h2">Building schedule</h2>
          <table className="report-table">
            <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Build</th><th>Running /yr</th><th>Paid by</th></tr></thead>
            <tbody>
              {totals.itemised.map((r) => (
                <tr key={r.item.type}><td>{r.item.name}</td><td>{r.item.category}</td><td>{r.count}</td><td>{money(r.build)}</td><td>{money(r.upkeep)}</td><td className="capitalize">{r.item.payer}</td></tr>
              ))}
              {!totals.itemised.length && <tr><td colSpan={6}>No buildings placed yet.</td></tr>}
            </tbody>
          </table>

          <h2 className="report-h2">Street schedule</h2>
          <table className="report-table">
            <thead><tr><th>Street</th><th>Type</th><th>Length</th><th>Grade</th><th>Build</th><th>Running /yr</th></tr></thead>
            <tbody>
              {plan.roads.map((r) => {
                const i = roadInfo.get(r.id);
                return <tr key={r.id}><td>{r.name}</td><td>{ROADS[r.type].name}</td><td>{i ? km(i.len / 1000) : "—"}</td><td>{i ? `${i.grade.toFixed(1)}%` : "—"}</td><td>{i ? money(i.build) : "—"}</td><td>{i ? money(i.upkeep) : "—"}</td></tr>;
              })}
              {!plan.roads.length && <tr><td colSpan={6}>No roads drawn yet.</td></tr>}
            </tbody>
          </table>
          {junctions.length > 0 && (
            <p className="mt-2 text-sm text-neutral-600">
              Intersections: {junctions.length} total — {junctions.filter((j) => junctionTypes[j.key] === "roundabout").length} roundabouts ({money(JUNCTIONS.roundabout.cost)} each),{" "}
              {junctions.filter((j) => junctionTypes[j.key] === "lights").length} with traffic lights ({money(JUNCTIONS.lights.cost)} each).
            </p>
          )}
        </section>

        {/* ---------- Services ---------- */}
        <section className="report-page">
          <h2 className="report-h2">Services & utilities</h2>
          <table className="report-table">
            <thead><tr><th>Service</th><th>Demand</th><th>Capacity</th><th>Status</th></tr></thead>
            <tbody>
              {meters.map((m) => {
                const none = m.demand < 0.01;
                const ok = none || m.supply >= m.demand;
                return (
                  <tr key={m.key}>
                    <td>{m.label}</td><td>{none ? "—" : `${Math.ceil(m.demand).toLocaleString()} ${m.unit}`}</td><td>{Math.round(m.supply).toLocaleString()} {m.unit}</td>
                    <td className={ok ? "text-emerald-700" : "text-red-700"}>{none ? "Not needed yet" : ok ? "Meets demand" : `Short by ${Math.ceil(m.demand - m.supply).toLocaleString()}`}{m.note ? ` · ${m.note}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2 className="report-h2">Operating budget</h2>
          <table className="report-table">
            <tbody>
              <Row k="Council running costs" v={`${money(totals.byPayer.council)}/yr`} />
              <Row k="State government running costs" v={`${money(totals.byPayer.state)}/yr`} />
              <Row k="Private owners' running costs" v={`${money(totals.byPayer.private)}/yr`} />
              <Row k="Council rates income" v={`${money(totals.rates)}/yr (${totals.dwellings} dwellings)`} />
              <Row k="Council position" v={`${totals.rates - totals.byPayer.council >= 0 ? "Surplus" : "Shortfall"} of ${money(Math.abs(totals.rates - totals.byPayer.council))}/yr before grants`} />
            </tbody>
          </table>

          <h2 className="report-h2">Capital cost summary</h2>
          <table className="report-table">
            <tbody>
              {Object.entries(totals.byCat).map(([c, v]) => <Row key={c} k={c} v={money(v.build)} />)}
              <Row k="Roads" v={money(totals.roadBuild)} />
              <Row k="Intersections" v={money(totals.junctionBuild)} />
              <Row k="Earthworks" v={money(totals.earth)} />
              <Row k="Total (excluding land)" v={money(totals.build)} strong />
              {analysis?.price.available && <Row k={`Land, ${Math.round(areaHa).toLocaleString()} ha (est.)`} v={`${money(landLow)}–${money(landHigh)}`} />}
            </tbody>
          </table>
        </section>

        {/* ---------- Pathway ---------- */}
        <section className="report-page">
          <h2 className="report-h2">Approvals pathway</h2>
          <h3 className="report-h3">Securing the land</h3>
          <ol className="report-list">{acquisitionSteps(analysis?.tenure.key ?? "freehold", state).map((s) => <li key={s.title}><b>{s.title}</b> ({s.time}). {s.body}</li>)}</ol>
          <h3 className="report-h3">Building the town</h3>
          <ol className="report-list">{buildSteps(state, size, nearby?.area?.lga).map((s) => <li key={s.title}><b>{s.title}</b> ({s.time}). {s.body}</li>)}</ol>
          <p className="mt-3 text-sm">Check the actual land parcel on {STATE_INFO[state].viewer.label}: {STATE_INFO[state].viewer.url}</p>

          <h2 className="report-h2">Notes</h2>
          <p className="text-xs leading-relaxed text-neutral-500">
            This is a concept-level plan generated with Townsite, created by Mathew Pittard ({PORTFOLIO_URL}). Costs are rough 2025 Australian regional estimates and capacity figures use typical averages
            (about 300 L of water and 0.25 kW of power per person). Land type and price are estimated from location and rainfall. Confirm all figures with
            the state government, local council, utilities and qualified professionals before relying on them. Data sources: OpenStreetMap, OpenFreeMap,
            Open-Meteo, Esri World Imagery, AWS Terrain Tiles, CAPAD 2024, National Native Title Tribunal.
          </p>
        </section>
      </div>
    </motion.div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <tr className={strong ? "font-bold" : ""}><td className="w-56 text-neutral-500">{k}</td><td>{v}</td></tr>;
}

function SitePlan({ plan, boundary, junctions, junctionTypes }: { plan: PlanData; boundary: Boundary; junctions: Junction[]; junctionTypes: Record<string, JunctionType> }) {
  const W = 760, H = 560, PAD = 30;
  const bc = boundaryCorners(boundary);
  const xs = [...bc.map((p) => p[0]), ...plan.placed.map((p) => p.x), ...plan.roads.flatMap((r) => r.pts.map((p) => p[0]))];
  const zs = [...bc.map((p) => p[1]), ...plan.placed.map((p) => p.z), ...plan.roads.flatMap((r) => r.pts.map((p) => p[1]))];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const s = Math.min((W - PAD * 2) / (maxX - minX || 1), (H - PAD * 2) / (maxZ - minZ || 1));
  const X = (x: number) => PAD + (x - minX) * s + ((W - PAD * 2) - (maxX - minX) * s) / 2;
  const Y = (z: number) => PAD + (z - minZ) * s + ((H - PAD * 2) - (maxZ - minZ) * s) / 2;
  const scaleM = [50, 100, 200, 500, 1000, 2000].find((m) => m * s > 80) ?? 2000;
  const cats = [...new Set(plan.placed.map((p) => CATALOG_BY_TYPE[p.type].category))];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-neutral-200 bg-[#f6f4ee]">
      <polygon points={bc.map(([x, z]) => `${X(x)},${Y(z)}`).join(" ")} fill="#fffbe8" stroke="#d4a106" strokeWidth={2} strokeDasharray="8 5" />
      {plan.roads.map((r) => (
        <polyline key={r.id} points={r.pts.map(([x, z]) => `${X(x)},${Y(z)}`).join(" ")} fill="none" stroke={r.type === "gravel" ? "#b08b5a" : "#6b6b6b"} strokeWidth={Math.max(2, ROADS[r.type].width * s)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {junctions.filter((j) => (junctionTypes[j.key] ?? "plain") !== "plain").map((j) => (
        <circle key={j.key} cx={X(j.x)} cy={Y(j.z)} r={Math.max(4, 14 * s)} fill={junctionTypes[j.key] === "roundabout" ? "#7cb36b" : "#e8a33d"} stroke="#555" strokeWidth={1} />
      ))}
      {plan.placed.map((p) => (
        <polygon key={p.id} points={corners(p.type, p.x, p.z, p.rot).map(([x, z]) => `${X(x)},${Y(z)}`).join(" ")} fill={CAT_COLOR[CATALOG_BY_TYPE[p.type].category]} fillOpacity={0.85} stroke="#333" strokeWidth={0.6} />
      ))}
      {plan.roads.map((r) => {
        const m = r.pts[Math.floor(r.pts.length / 2)];
        return <text key={`t${r.id}`} x={X(m[0])} y={Y(m[1]) - 6} fontSize={10} textAnchor="middle" fill="#333" stroke="#f6f4ee" strokeWidth={3} paintOrder="stroke">{r.name}</text>;
      })}
      {/* north arrow */}
      <g transform={`translate(${W - 40},44)`}>
        <polygon points="0,-22 8,6 0,0 -8,6" fill="#333" />
        <text y={20} fontSize={11} textAnchor="middle" fontWeight="bold" fill="#333">N</text>
      </g>
      {/* scale bar */}
      <g transform={`translate(${PAD},${H - 16})`}>
        <rect width={scaleM * s} height={5} fill="#333" />
        <text y={-4} fontSize={10} fill="#333">{scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`}</text>
      </g>
      {/* legend */}
      <g transform={`translate(${W - 130},${H - 14 - cats.length * 14})`}>
        {cats.map((c, i) => (
          <g key={c} transform={`translate(0,${i * 14})`}>
            <rect width={10} height={10} fill={CAT_COLOR[c]} /><text x={14} y={9} fontSize={10} fill="#333">{c}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
