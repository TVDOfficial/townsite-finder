// Saving towns: autosave to this browser, a list of saved towns, file export/import and share links.
import type { SizeKey } from "@/lib/analysis";
import { streetName, townName } from "./catalog";
import type { Boundary, JunctionType, Placed, Road } from "./geometry";
import type { SimState } from "./sim";

export interface PlanData {
  v: 2;
  id: string;
  name: string;
  lat: number;
  lng: number;
  size: SizeKey;
  placed: Placed[];
  roads: Road[];
  junctionTypes: Record<string, JunctionType>;
  nextId: number;
  savedAt: number;
  boundary?: Boundary;
  lots?: [number, number][][];
  sim?: SimState;
}

export interface TownMeta {
  id: string;
  name: string;
  lat: number;
  lng: number;
  size: SizeKey;
  items: number;
  savedAt: number;
}

const INDEX = "townsite-towns";
const KEY = (id: string) => `townsite-town:${id}`;

const read = <T,>(key: string): T | null => {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export function listTowns(): TownMeta[] {
  return (read<TownMeta[]>(INDEX) ?? []).sort((a, b) => b.savedAt - a.savedAt);
}

export function saveTown(plan: PlanData): boolean {
  const data = { ...plan, savedAt: Date.now() };
  if (!write(KEY(plan.id), data)) return false;
  const meta: TownMeta = { id: plan.id, name: plan.name, lat: plan.lat, lng: plan.lng, size: plan.size, items: plan.placed.length + plan.roads.length, savedAt: data.savedAt };
  write(INDEX, [meta, ...listTowns().filter((t) => t.id !== plan.id)]);
  return true;
}

export function loadTown(id: string): PlanData | null {
  return normalise(read<PlanData>(KEY(id)));
}

export function deleteTown(id: string) {
  try { localStorage.removeItem(KEY(id)); } catch {}
  write(INDEX, listTowns().filter((t) => t.id !== id));
}

/** Most recent town saved at this location, or a plan from the older single-save format. */
export function findTownAt(lat: number, lng: number): PlanData | null {
  const hit = listTowns().find((t) => Math.abs(t.lat - lat) < 1e-3 && Math.abs(t.lng - lng) < 1e-3);
  if (hit) return loadTown(hit.id);
  const legacy = read<{ placed: Placed[]; roads?: Omit<Road, "name">[]; nextId?: number }>(`townsite-plan:${lat.toFixed(3)},${lng.toFixed(3)}`);
  if (legacy?.placed) {
    return normalise({
      v: 2, id: newId(), name: "", lat, lng, size: "small", placed: legacy.placed,
      roads: (legacy.roads ?? []) as Road[], junctionTypes: {}, nextId: legacy.nextId ?? 1000, savedAt: Date.now(),
    });
  }
  return null;
}

/** Fill in anything missing from older saves (e.g. roads without names). */
export function normalise(p: PlanData | null): PlanData | null {
  if (!p || !Array.isArray(p.placed)) return null;
  const names: string[] = [];
  const roads = (p.roads ?? []).map((r) => {
    const name = r.name || streetName(r.type, names);
    names.push(name);
    return { ...r, name };
  });
  return { ...p, v: 2, name: p.name || townName(), roads, junctionTypes: p.junctionTypes ?? {}, nextId: p.nextId ?? 1000 };
}

// ---------- Files ----------
export function exportFile(plan: PlanData) {
  const blob = new Blob([JSON.stringify({ ...plan, savedAt: Date.now() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(plan.name || "my-town").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.townsite.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importFile(file: File): Promise<PlanData | null> {
  try { return normalise(JSON.parse(await file.text())); } catch { return null; }
}

// ---------- Share links (compressed plan in the URL hash) ----------
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function shareLink(plan: PlanData): Promise<string> {
  // Round numbers to keep the link short.
  const slim = {
    ...plan,
    placed: plan.placed.map((p) => ({ ...p, x: +p.x.toFixed(1), z: +p.z.toFixed(1), rot: +p.rot.toFixed(3), base: +p.base.toFixed(2), minH: +p.minH.toFixed(2), earthM3: Math.round(p.earthM3) })),
    roads: plan.roads.map((r) => ({ ...r, pts: r.pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) })),
  };
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(slim)), new CompressionStream("deflate-raw"));
  return `${location.origin}/plan?lat=${plan.lat}&lng=${plan.lng}&size=${plan.size}#plan=${toB64(packed)}`;
}

export async function readShareHash(hash: string): Promise<PlanData | null> {
  const m = hash.match(/plan=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const raw = await pipe(fromB64(m[1]), new DecompressionStream("deflate-raw"));
    return normalise(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    return null;
  }
}
