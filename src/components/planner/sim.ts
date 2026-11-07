// Town simulation: one tick = one month. Pure functions so the state can be saved with the plan.
import { computeMeters, type Meter } from "./capacity";
import { CATALOG_BY_TYPE, RATES_PER_DWELLING, type ItemType } from "./catalog";
import type { Placed } from "./geometry";

export type EventKey = "drought" | "bushfire" | "heatwave" | "boom" | "grant" | "festival" | "flood" | "storm";

export interface SimEvent { key: EventKey; until: number }
export interface LogEntry { t: number; text: string; tone: "good" | "bad" | "info" }
export interface SimState {
  t: number; // months since founding
  pop: number;
  funds: number; // council bank balance ($)
  debt: number;
  loanPayment: number; // per month
  happiness: number; // 0..100
  history: { t: number; pop: number; funds: number; happy: number }[];
  log: LogEntry[];
  events: SimEvent[];
  done: string[]; // achieved challenge ids
  everNegative: boolean;
  droughtsSurvived: number;
  droughtFailed: boolean;
  yearNet: number; // running council net for the current year
  lastYearNet: number | null;
  startBudget: number;
}

export interface SimContext {
  placed: Placed[];
  councilUpkeep: number; // per year (roads, parks, council utilities...)
  hotDays: number; // from the site's climate
  rainMm: number;
}

const AMENITIES: ItemType[] = ["park", "playground", "pub", "cafe", "bakery", "pool", "oval", "skatepark", "church", "garden", "bigthing", "townhall", "childcare"];
const GRANT_PER_PERSON = 450; // state & federal grants to councils, per resident per year
const COMMERCIAL_RATES = 9_000; // per commercial / industrial building per year
export const LOAN_SIZE = 10_000_000;
const LOAN_RATE = 0.06;
const LOAN_MONTHS = 240;

export const monthName = (t: number) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t % 12];
export const yearOf = (t: number) => 1 + Math.floor(t / 12);

export function newSim(startBudget: number): SimState {
  return {
    t: 0, pop: 0, funds: startBudget, debt: 0, loanPayment: 0, happiness: 60,
    history: [], log: [{ t: 0, text: "The town is founded. The first families are on their way.", tone: "info" }],
    events: [], done: [], everNegative: false, droughtsSurvived: 0, droughtFailed: false, yearNet: 0, lastYearNet: null, startBudget,
  };
}

export function takeLoan(s: SimState): SimState {
  const r = LOAN_RATE / 12;
  const payment = (LOAN_SIZE * r) / (1 - Math.pow(1 + r, -LOAN_MONTHS));
  return {
    ...s, funds: s.funds + LOAN_SIZE, debt: s.debt + LOAN_SIZE, loanPayment: s.loanPayment + payment,
    log: [...s.log, { t: s.t, text: `Borrowed ${fmt(LOAN_SIZE)} over 20 years at 6%.`, tone: "info" as const }].slice(-60),
  };
}

const fmt = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}k`);

export function capacityOf(placed: Placed[]) {
  return placed.reduce((s, p) => s + (CATALOG_BY_TYPE[p.type].people ?? 0), 0);
}

function active(s: SimState, k: EventKey) { return s.events.some((e) => e.key === k && e.until > s.t); }

/** Happiness inputs: how well each service keeps up, plus amenities. */
export function satisfaction(meters: Meter[]) {
  const weight: Record<string, number> = { water: 1.6, power: 1.5, sewage: 1.3, health: 1.2, primary: 1, secondary: 0.6, food: 1, safety: 0.8, comms: 0.7, jobs: 1.1 };
  let sum = 0, wsum = 0;
  const parts: Record<string, number> = {};
  for (const m of meters) {
    const w = weight[m.key] ?? 1;
    const v = m.demand < 0.01 ? 1 : Math.min(1, m.supply / m.demand);
    parts[m.key] = v;
    sum += v * w; wsum += w;
  }
  return { score: sum / wsum, parts };
}

/** Advance one month. Returns the new state plus headlines worth showing. */
export function step(s: SimState, ctx: SimContext, rand: () => number = Math.random): { state: SimState; news: LogEntry[] } {
  const t = s.t + 1;
  const news: LogEntry[] = [];
  const say = (text: string, tone: LogEntry["tone"]) => news.push({ t, text, tone });
  const events = s.events.filter((e) => e.until > t);
  let funds = s.funds;
  const has = (type: ItemType) => ctx.placed.some((p) => p.type === type);

  // ---- Random events (odds depend on the real climate) ----
  const roll = (p: number) => rand() < p;
  const start = (key: EventKey, months: number) => events.push({ key, until: t + months });
  if (!active(s, "drought") && roll(ctx.rainMm < 400 ? 0.012 : 0.006)) { start("drought", 8); say("Drought declared. Dams and bores are running low for the next 8 months.", "bad"); }
  if (!active(s, "heatwave") && [11, 0, 1].includes(t % 12) && roll(ctx.hotDays > 15 ? 0.12 : 0.05)) { start("heatwave", 1); say("Heatwave! Air conditioners push power demand up 30%.", "bad"); }
  if ([10, 11, 0, 1, 2].includes(t % 12) && roll(ctx.hotDays > 10 ? 0.025 : 0.01)) {
    const cost = has("fire") ? 400_000 : 3_000_000 + rand() * 2_000_000;
    funds -= cost;
    start("bushfire", 3);
    say(has("fire") ? `Bushfire nearby. Your fire station kept it out of town (${fmt(cost)} clean-up).` : `Bushfire swept through the outskirts with no fire station to stop it: ${fmt(cost)} in damage.`, "bad");
  }
  if (ctx.rainMm > 650 && roll(0.008)) { const cost = 1_000_000 + rand() * 2_000_000; funds -= cost; say(`Flooding washed out roads: ${fmt(cost)} in repairs.`, "bad"); }
  if (roll(0.006)) { const cost = 200_000 + rand() * 500_000; funds -= cost; say(`A big storm brought down trees and power lines: ${fmt(cost)} to fix.`, "bad"); }
  if (!active(s, "boom") && s.pop > 200 && roll(0.006)) { start("boom", 18); say("A mining company opens nearby. Jobs and new arrivals pour in for 18 months!", "good"); }
  if (roll(0.012)) { const g = 1_000_000 + Math.round(rand() * 6) * 1_000_000; funds += g; say(`The state government awarded a ${fmt(g)} infrastructure grant.`, "good"); }
  if (!active(s, "festival") && (has("bigthing") || (has("pub") && has("oval"))) && t % 12 === 3 && roll(0.6)) {
    start("festival", 2); funds += 300_000; say(has("bigthing") ? "Tourists flock to see the Big Kangaroo festival (+$300k)." : "The annual show and footy carnival is a hit (+$300k).", "good");
  }

  // ---- Services at the current population ----
  const capacity = capacityOf(ctx.placed);
  const isActive = (k: EventKey) => events.some((e) => e.key === k && e.until > t);
  const meters = computeMeters(ctx.placed, Math.max(1, s.pop), {
    waterSupply: isActive("drought") ? (has("watertreat") ? 0.75 : 0.45) : 1,
    powerDemand: isActive("heatwave") ? 1.3 : 1,
  });
  const sat = satisfaction(meters);
  const amenity = Math.min(1, new Set(ctx.placed.filter((p) => AMENITIES.includes(p.type)).map((p) => p.type)).size / 6);

  // ---- Money (council only: rates, grants, commercial rates vs council upkeep and loans) ----
  const dwellings = ctx.placed.reduce((sum, p) => sum + (CATALOG_BY_TYPE[p.type].dwellings ?? 0), 0);
  const occupancy = capacity ? s.pop / capacity : 0;
  const commercial = ctx.placed.filter((p) => ["Commercial", "Industry"].includes(CATALOG_BY_TYPE[p.type].category)).length;
  const income = (dwellings * occupancy * RATES_PER_DWELLING + s.pop * GRANT_PER_PERSON + commercial * COMMERCIAL_RATES) / 12;
  const expense = ctx.councilUpkeep / 12 + s.loanPayment;
  funds += income - expense;
  let debt = s.debt;
  let loanPayment = s.loanPayment;
  if (debt > 0) {
    debt = Math.max(0, debt - (s.loanPayment - debt * (LOAN_RATE / 12)));
    if (debt < 1000) { debt = 0; loanPayment = 0; say("Loans paid off!", "good"); }
  }

  // ---- Happiness and population ----
  const shortages = Object.entries(sat.parts).filter(([k, v]) => v < 0.9 && ["water", "power", "sewage"].includes(k)).map(([k]) => k);
  // Core services get a town to the high 70s; amenities, healthy finances and "big town" extras
  // (hospital, high school, pool) are what push it towards 100.
  const extras = (["hospital", "highschool", "pool"] as ItemType[]).filter(has).length / 3;
  let target = 8 + 64 * sat.score + 14 * amenity + 6 * (funds >= 0 ? 1 : 0) + 8 * extras;
  if (isActive("bushfire")) target -= 12;
  if (isActive("festival")) target += 6;
  if (isActive("boom")) target += 4;
  target = Math.max(0, Math.min(100, target));
  const happiness = s.happiness + (target - s.happiness) * 0.15;

  let pop = s.pop;
  const attract = happiness / 100;
  if (capacity > 0) {
    if (attract > 0.45) {
      const rate = 0.035 * (attract - 0.3) * (isActive("boom") ? 2.2 : 1);
      pop += Math.max(Math.min(4, capacity - pop), (capacity - pop) * rate);
    } else {
      pop -= pop * 0.012 * (0.45 - attract) * 5;
    }
  }
  pop = Math.max(0, Math.min(capacity, pop));
  if (shortages.length && t % 3 === 0 && s.pop > 20) say(`Residents are complaining about ${shortages.join(" and ")} shortages.`, "bad");

  // ---- Year end ----
  let yearNet = s.yearNet + income - expense;
  let lastYearNet = s.lastYearNet;
  if (t % 12 === 0) {
    lastYearNet = yearNet;
    say(`Year ${yearOf(t - 1)} done: ${Math.round(pop).toLocaleString()} residents, council ${yearNet >= 0 ? "surplus" : "deficit"} of ${fmt(Math.abs(yearNet))}.`, yearNet >= 0 ? "good" : "info");
    yearNet = 0;
  }
  if (funds < 0 && s.funds >= 0) say("The council is in the red! Take a loan or cut spending.", "bad");

  // Drought challenge: survive a whole drought without a water shortage.
  const wasDrought = active(s, "drought"), nowDrought = isActive("drought");
  let droughtFailed = !wasDrought && nowDrought ? false : s.droughtFailed;
  if (nowDrought && (sat.parts.water ?? 1) < 0.99) droughtFailed = true;
  let droughtsSurvived = s.droughtsSurvived;
  if (wasDrought && !nowDrought) {
    if (!droughtFailed && s.pop > 50) { droughtsSurvived++; say("The drought has broken, and the town never ran short of water.", "good"); }
    else say("The drought has broken.", "info");
    droughtFailed = false;
  }

  const state: SimState = {
    ...s, t, pop, funds, debt, loanPayment, happiness, events, droughtsSurvived, droughtFailed, yearNet, lastYearNet,
    everNegative: s.everNegative || funds < 0,
    history: t % 3 === 0 ? [...s.history, { t, pop: Math.round(pop), funds: Math.round(funds), happy: Math.round(happiness) }].slice(-240) : s.history,
    log: [...s.log, ...news].slice(-60),
  };

  // ---- Challenges ----
  for (const c of CHALLENGES) {
    if (!state.done.includes(c.id) && c.check(state, ctx, meters)) {
      state.done = [...state.done, c.id];
      const e = { t, text: `🏆 Challenge complete: ${c.name}`, tone: "good" as const };
      news.push(e);
      state.log = [...state.log, e].slice(-60);
    }
  }
  return { state, news };
}

export interface Challenge { id: string; name: string; desc: string; emoji: string; check: (s: SimState, ctx: SimContext, m: Meter[]) => boolean }

export const CHALLENGES: Challenge[] = [
  { id: "first100", emoji: "🏡", name: "First families", desc: "Reach 100 residents", check: (s) => s.pop >= 100 },
  { id: "thousand", emoji: "🏘️", name: "Proper town", desc: "Reach 1,000 residents", check: (s) => s.pop >= 1000 },
  { id: "fivek", emoji: "🌆", name: "Regional centre", desc: "Reach 5,000 residents", check: (s) => s.pop >= 5000 },
  { id: "happy80", emoji: "😀", name: "Best place to live", desc: "Happiness over 80% with 500+ residents", check: (s) => s.happiness >= 80 && s.pop >= 500 },
  { id: "full", emoji: "🔑", name: "No vacancy", desc: "Fill 95% of homes (at least 200)", check: (s, ctx) => { const c = capacityOf(ctx.placed); return c >= 200 && s.pop >= c * 0.95; } },
  { id: "surplus", emoji: "💰", name: "In the black", desc: "Finish a year with a council surplus", check: (s) => s.lastYearNet != null && s.lastYearNet > 0 && s.t % 12 === 0 },
  { id: "nodebt10", emoji: "🧾", name: "Careful council", desc: "10 years without going into the red", check: (s) => s.t >= 120 && !s.everNegative },
  { id: "drought", emoji: "💧", name: "Drought-proof", desc: "Get through a drought with no water shortage", check: (s) => s.droughtsSurvived > 0 },
  { id: "offgrid", emoji: "☀️", name: "Off the grid", desc: "300+ residents on solar/wind only, no power shortage", check: (s, ctx, m) => s.pop >= 300 && !ctx.placed.some((p) => p.type === "substation") && (m.find((x) => x.key === "power")!.supply >= m.find((x) => x.key === "power")!.demand) },
  { id: "decade", emoji: "🎂", name: "Ten years on", desc: "Run the town for 10 years", check: (s) => s.t >= 120 },
];
