// Supply vs demand for the town. Rough real-world averages:
// - an Australian home uses ~17 kWh/day (≈0.7 kW average), ~0.25 kW per person
// - ~300 L of water per person per day; ~250 L of that comes back as sewage
// - a 3 MW wind turbine averages ~35% of capacity, a 5 MW solar farm ~22%
import { CATALOG_BY_TYPE, type ItemType } from "./catalog";
import type { Placed } from "./geometry";

export type Resource = "power" | "water" | "sewage" | "primary" | "secondary" | "health" | "safety" | "food" | "comms" | "jobs";

// Non-housing demand per building: kW (average) and kL/day of water.
const DEMAND: Partial<Record<ItemType, { power?: number; water?: number }>> = {
  agedcare: { power: 60, water: 25 }, clinic: { power: 15, water: 2 }, hospital: { power: 600, water: 45 }, childcare: { power: 20, water: 3 },
  school: { power: 60, water: 10 }, highschool: { power: 180, water: 25 }, police: { power: 20, water: 1 }, fire: { power: 15, water: 2 },
  townhall: { power: 50, water: 2 }, church: { power: 3, water: 0.3 }, park: { power: 1, water: 15 }, playground: { water: 0.5 },
  skatepark: { power: 1 }, pool: { power: 120, water: 60 }, oval: { power: 40, water: 150 }, garden: { water: 3 },
  shop: { power: 15, water: 1 }, cafe: { power: 12, water: 2 }, bakery: { power: 25, water: 3 }, supermarket: { power: 250, water: 8 },
  pub: { power: 40, water: 5 }, motel: { power: 35, water: 10 }, caravan: { power: 40, water: 15 }, servo: { power: 30, water: 2 },
  hardware: { power: 60, water: 2 }, bigthing: { power: 2 }, warehouse: { power: 80, water: 2 }, workshop: { power: 20, water: 1 },
  silos: { power: 60, water: 0.5 }, watertower: { power: 5 }, watertreat: { power: 150, water: 0 }, sewage: { power: 200 },
  telecom: { power: 3 }, busstop: { power: 0.2 }, carpark: { power: 2 }, station: { power: 20, water: 2 }, airstrip: { power: 10, water: 0.5 },
};
// Water used outdoors (doesn't come back as sewage)
const IRRIGATION: ItemType[] = ["park", "oval", "garden", "playground"];

// What each building supplies. power kW avg, water/sewage kL/day, others = people served or places.
const SUPPLY: Partial<Record<ItemType, Partial<Record<Resource, number>>>> = {
  solar: { power: 1100 }, wind: { power: 1050 }, battery: { power: 250 }, substation: { power: 15000 },
  watertreat: { water: 3000 }, windmill: { water: 25 },
  sewage: { sewage: 2500 },
  school: { primary: 300 }, highschool: { secondary: 700 },
  clinic: { health: 2500 }, hospital: { health: 20000 },
  police: { safety: 4000 }, fire: { safety: 6000 },
  shop: { food: 600 }, supermarket: { food: 8000 }, bakery: { food: 200 },
  telecom: { comms: 5000 },
};

export interface Meter {
  key: Resource;
  label: string;
  unit: string;
  demand: number;
  supply: number;
  note?: string;
}

const PER_PERSON = { power: 0.25, water: 0.3, sewage: 0.25 };

/**
 * Supply vs demand. `residents` overrides the number of people (the simulation uses the current
 * population instead of full housing capacity); `mod` lets events change supply/demand.
 */
export function computeMeters(placed: Placed[], residents?: number, mod?: { waterSupply?: number; powerDemand?: number }): Meter[] {
  let people = 0, jobs = 0;
  const demand: Record<Resource, number> = { power: 0, water: 0, sewage: 0, primary: 0, secondary: 0, health: 0, safety: 0, food: 0, comms: 0, jobs: 0 };
  const supply: Record<Resource, number> = { ...demand };
  const has = new Set<ItemType>();

  for (const p of placed) {
    const c = CATALOG_BY_TYPE[p.type];
    has.add(p.type);
    people += c.people ?? 0;
    jobs += c.jobs ?? 0;
    const d = DEMAND[p.type];
    if (d?.power) demand.power += d.power;
    if (d?.water) {
      demand.water += d.water;
      if (!IRRIGATION.includes(p.type)) demand.sewage += d.water * 0.8;
    }
    const s = SUPPLY[p.type];
    if (s) for (const [k, v] of Object.entries(s)) supply[k as Resource] += v!;
  }
  if (residents != null) people = residents;
  demand.power += people * PER_PERSON.power;
  demand.water += people * PER_PERSON.water;
  demand.sewage += people * PER_PERSON.sewage;
  if (mod?.waterSupply != null) supply.water *= mod.waterSupply;
  if (mod?.powerDemand != null) demand.power *= mod.powerDemand;
  demand.primary = people * 0.09; // ~9% of people are primary-school age
  demand.secondary = people * 0.08;
  demand.health = demand.safety = demand.food = demand.comms = people;
  // About half of people work, but in country towns many of them work on surrounding farms and
  // mines, so roughly a quarter of residents need a job in town itself.
  demand.jobs = people * 0.25;
  supply.jobs = jobs;

  const renewOnly = (has.has("solar") || has.has("wind")) && !has.has("battery") && !has.has("substation");
  const storage = has.has("watertower") ? undefined : supply.water > 0 ? "Add a water tower for storage and pressure." : undefined;

  return [
    { key: "power", label: "Power", unit: "kW", demand: demand.power, supply: supply.power, note: renewOnly ? "Solar and wind only: add a battery or substation for nights and calm days." : undefined },
    { key: "water", label: "Water", unit: "kL/day", demand: demand.water, supply: supply.water, note: storage },
    { key: "sewage", label: "Sewage", unit: "kL/day", demand: demand.sewage, supply: supply.sewage },
    { key: "primary", label: "Primary school places", unit: "kids", demand: demand.primary, supply: supply.primary },
    { key: "secondary", label: "High school places", unit: "teens", demand: demand.secondary, supply: supply.secondary },
    { key: "health", label: "Healthcare", unit: "people", demand: demand.health, supply: supply.health },
    { key: "safety", label: "Police & fire", unit: "people", demand: demand.safety, supply: supply.safety },
    { key: "food", label: "Groceries", unit: "people", demand: demand.food, supply: supply.food },
    { key: "comms", label: "Phone & internet", unit: "people", demand: demand.comms, supply: supply.comms },
    { key: "jobs", label: "Jobs in town", unit: "jobs", demand: demand.jobs, supply: supply.jobs },
  ];
}

export function itemCapacity(type: ItemType): string | null {
  const s = SUPPLY[type];
  if (!s) return null;
  const [k, v] = Object.entries(s)[0];
  const units: Record<string, string> = { power: "kW average", water: "kL/day", sewage: "kL/day", primary: "students", secondary: "students", health: "people", safety: "people", food: "people", comms: "people" };
  return `Supplies ${v!.toLocaleString()} ${units[k]}`;
}
