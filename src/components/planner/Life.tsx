"use client";

 

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CATALOG_BY_TYPE, type ItemType } from "./catalog";
import { pointKey, type JunctionType, type Placed, type Road } from "./geometry";
import type { TerrainData } from "./terrain";

type P = [number, number];
const CAR_COLORS = ["#ecf0f1", "#2c3e50", "#c0392b", "#7f8c8d", "#16a085", "#2980b9", "#e67e22", "#bdc3c7", "#1f1f1f", "#8e44ad"];
const SHIRTS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#ecf0f1", "#34495e"];
const DESTINATIONS: ItemType[] = ["park", "playground", "shop", "cafe", "bakery", "supermarket", "pub", "school", "highschool", "townhall", "church", "pool", "oval", "skatepark", "garden", "clinic", "hardware", "bigthing", "station", "busstop"];
const HOMES: ItemType[] = ["house", "townhouses", "apartments", "agedcare", "motel", "caravan"];

/** Front door of a building: just outside the front edge. */
function door(p: Placed): P {
  const { d } = CATALOG_BY_TYPE[p.type];
  const off = d / 2 + 2;
  return [p.x + Math.sin(p.rot) * off, p.z + Math.cos(p.rot) * off];
}

// ---------- Cars on the road network ----------
interface Graph { nodes: Map<string, P>; edges: Map<string, string[]> }
function buildGraph(roads: Road[]): Graph {
  const nodes = new Map<string, P>(), edges = new Map<string, string[]>();
  const link = (a: string, b: string) => { const l = edges.get(a) ?? []; if (!l.includes(b)) l.push(b); edges.set(a, l); };
  for (const r of roads)
    for (let i = 0; i < r.pts.length; i++) {
      const k = pointKey(r.pts[i]);
      nodes.set(k, r.pts[i]);
      if (i > 0) { const pk = pointKey(r.pts[i - 1]); link(k, pk); link(pk, k); }
    }
  return { nodes, edges };
}

interface Car { from: string; to: string; prev: string; t: number; speed: number; wait: number }

function Cars({ t, roads, junctionTypes, count }: { t: TerrainData; roads: Road[]; junctionTypes: Record<string, JunctionType>; count: number }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const graph = useMemo(() => buildGraph(roads), [roads]);
  const cars = useRef<Car[]>([]);

  useLayoutEffect(() => {
    const keys = [...graph.edges.keys()];
    cars.current = keys.length
      ? Array.from({ length: count }, () => {
          const from = keys[Math.floor(Math.random() * keys.length)];
          const nb = graph.edges.get(from)!;
          return { from, to: nb[Math.floor(Math.random() * nb.length)], prev: from, t: Math.random(), speed: 11 + Math.random() * 6, wait: 0 };
        })
      : [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(CAR_COLORS[i % CAR_COLORS.length]);
      body.current?.setColorAt(i, c);
    }
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [graph, count]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    cars.current.forEach((car, i) => {
      const a = graph.nodes.get(car.from), b = graph.nodes.get(car.to);
      if (!a || !b) return;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (car.wait > 0) car.wait -= dt;
      else car.t += (car.speed * dt) / len;
      if (car.t >= 1) {
        // Arrived at a node: pick the next road, avoiding U-turns unless it's a dead end.
        const nb = graph.edges.get(car.to) ?? [];
        const options = nb.filter((n) => n !== car.from);
        const next = (options.length ? options : nb)[Math.floor(Math.random() * (options.length || nb.length))] ?? car.from;
        car.prev = car.from; car.from = car.to; car.to = next; car.t = 0;
        const jt = junctionTypes[car.from];
        if (jt === "lights" && Math.random() < 0.5) car.wait = 1 + Math.random() * 4; // stopped at a red light
        else if (jt === "roundabout") car.wait = Math.random() * 0.6;
      }
      const x = a[0] + (b[0] - a[0]) * car.t, z = a[1] + (b[1] - a[1]) * car.t;
      const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      // Keep left (Australia): offset to the left of the direction of travel.
      const lx = x + dz * 1.9, lz = z - dx * 1.9;
      const y = t.heightAt(lx, lz) + 0.62;
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      m.compose(v.set(lx, y + 0.65, lz), q, one);
      body.current?.setMatrixAt(i, m);
      m.compose(v.set(lx - dx * 0.2, y + 1.25, lz - dz * 0.2), q, one);
      cabin.current?.setMatrixAt(i, m);
    });
    if (body.current) body.current.instanceMatrix.needsUpdate = true;
    if (cabin.current) cabin.current.instanceMatrix.needsUpdate = true;
  });

  const geo = useMemo(() => ({ body: new THREE.BoxGeometry(1.8, 0.8, 4.4), cabin: new THREE.BoxGeometry(1.6, 0.55, 2.2) }), []);
  const mats = useMemo(() => ({
    body: new THREE.MeshPhysicalMaterial({ metalness: 0.6, roughness: 0.3, clearcoat: 1 }),
    cabin: new THREE.MeshPhysicalMaterial({ color: "#1d2b38", metalness: 0.2, roughness: 0.06, clearcoat: 1 }),
  }), []);
  return (
    <>
      <instancedMesh key={`b${count}`} ref={body} args={[geo.body, mats.body, count]} castShadow />
      <instancedMesh key={`c${count}`} ref={cabin} args={[geo.cabin, mats.cabin, count]} castShadow />
    </>
  );
}

// ---------- People walking between places ----------
interface Person { x: number; z: number; tx: number; tz: number; speed: number; idle: number; phase: number }

function People({ t, placed, count }: { t: TerrainData; placed: Placed[]; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const homes = placed.filter((p) => HOMES.includes(p.type)).map(door);
    const dests = placed.filter((p) => DESTINATIONS.includes(p.type)).map(door);
    const any = placed.map(door);
    return { homes: homes.length ? homes : any, dests: dests.length ? dests : any };
  }, [placed]);
  const people = useRef<Person[]>([]);

  useLayoutEffect(() => {
    const pick = (l: P[]) => l[Math.floor(Math.random() * l.length)];
    people.current = spots.homes.length
      ? Array.from({ length: count }, () => {
          const [x, z] = pick(spots.homes);
          const [tx, tz] = pick(spots.dests);
          return { x: x + (Math.random() - 0.5) * 6, z: z + (Math.random() - 0.5) * 6, tx, tz, speed: 1.1 + Math.random() * 0.6, idle: Math.random() * 3, phase: Math.random() * 10 };
        })
      : [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) { c.set(SHIRTS[i % SHIRTS.length]); ref.current?.setColorAt(i, c); }
    if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [spots, count]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const pick = (l: P[]) => l[Math.floor(Math.random() * l.length)];
    people.current.forEach((p, i) => {
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      let walking = false;
      if (p.idle > 0) p.idle -= dt;
      else if (d < 1.5) {
        // Arrived: hang around a while, then head somewhere else (often home).
        p.idle = 3 + Math.random() * 10;
        const [tx, tz] = Math.random() < 0.4 ? pick(spots.homes) : pick(spots.dests);
        p.tx = tx + (Math.random() - 0.5) * 8; p.tz = tz + (Math.random() - 0.5) * 8;
      } else {
        // Time-lapse speed so walks don't take forever.
        const step = Math.min(d, p.speed * 6 * dt);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        walking = true;
      }
      const bob = walking ? Math.abs(Math.sin(clock.elapsedTime * 9 + p.phase)) * 0.12 : 0;
      const y = t.heightAt(p.x, p.z);
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      m.compose(v.set(p.x, y + 0.75 + bob, p.z), q, s);
      ref.current?.setMatrixAt(i, m);
      m.compose(v.set(p.x, y + 1.65 + bob, p.z), q, s);
      heads.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true;
  });

  const geo = useMemo(() => ({ body: new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), head: new THREE.SphereGeometry(0.2, 10, 8) }), []);
  const mats = useMemo(() => ({ body: new THREE.MeshStandardMaterial({ roughness: 0.8 }), head: new THREE.MeshStandardMaterial({ color: "#e0b48f", roughness: 0.7 }) }), []);
  return (
    <>
      <instancedMesh key={`p${count}`} ref={ref} args={[geo.body, mats.body, count]} castShadow />
      <instancedMesh key={`h${count}`} ref={heads} args={[geo.head, mats.head, count]} castShadow />
    </>
  );
}

export default function Life({ t, placed, roads, junctionTypes, people, hour }: {
  t: TerrainData; placed: Placed[]; roads: Road[]; junctionTypes: Record<string, JunctionType>; people: number; hour: number;
}) {
  // Quieter at night.
  const activity = hour < 6 || hour > 21 ? 0.15 : hour < 7.5 || hour > 19 ? 0.5 : 1;
  const carCount = roads.length ? Math.max(4, Math.min(80, Math.round((people / 6 + 4) * activity))) : 0;
  const walkers = placed.length ? Math.max(6, Math.min(160, Math.round((people / 3 + 6) * activity))) : 0;
  return (
    <>
      {carCount > 0 && <Cars t={t} roads={roads} junctionTypes={junctionTypes} count={carCount} />}
      {walkers > 0 && <People t={t} placed={placed} count={walkers} />}
    </>
  );
}
