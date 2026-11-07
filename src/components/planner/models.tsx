"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { ItemType } from "./catalog";
import { mats } from "./materials";
import { ExtraModel } from "./models2";

type V3 = [number, number, number];

// ---------- Geometry helpers (UVs in metres so textures tile at real scale) ----------
const geoCache = new Map<string, THREE.BufferGeometry>();

function boxGeo(w: number, h: number, d: number) {
  const key = `b${w.toFixed(2)},${h.toFixed(2)},${d.toFixed(2)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
    }
    geoCache.set(key, g);
  }
  return g;
}

/** Geometry from flat polygons, with UVs projected onto each face (u horizontal, v down the slope). */
function polyGeo(polys: V3[][]) {
  const pos: number[] = [], uvs: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const poly of polys) {
    const [a, b, c] = poly.map((p) => new THREE.Vector3(...p));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    let t = new THREE.Vector3().crossVectors(up, n);
    if (t.lengthSq() < 1e-6) t = new THREE.Vector3(1, 0, 0);
    t.normalize();
    const bt = new THREE.Vector3().crossVectors(n, t);
    for (let i = 1; i < poly.length - 1; i++)
      for (const p of [poly[0], poly[i], poly[i + 1]]) {
        pos.push(...p);
        const v = new THREE.Vector3(...p);
        uvs.push(v.dot(t), v.dot(bt));
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

function roofGeo(kind: "gable" | "hip" | "skillion", w: number, d: number, h: number, o = 0.6) {
  const key = `r${kind}${w},${d},${h},${o}`;
  let g = geoCache.get(key);
  if (g) return g;
  const W = w / 2 + o, D = d / 2 + o;
  if (kind === "gable") {
    g = polyGeo([
      [[-W, 0, D], [W, 0, D], [0, h, D]],
      [[W, 0, -D], [-W, 0, -D], [0, h, -D]],
      [[W, 0, D], [W, 0, -D], [0, h, -D], [0, h, D]],
      [[-W, 0, -D], [-W, 0, D], [0, h, D], [0, h, -D]],
    ]);
  } else if (kind === "skillion") {
    g = polyGeo([
      [[-W, h, -D], [W, h, -D], [W, 0, D], [-W, 0, D]],
      [[-W, 0, D], [W, 0, D], [W, -0.15, D], [-W, -0.15, D]],
    ]);
  } else {
    // hip: ridge along the longer side
    const alongZ = D >= W;
    const r = Math.abs(D - W);
    g = alongZ
      ? polyGeo([
          [[-W, 0, D], [W, 0, D], [0, h, r]],
          [[W, 0, -D], [-W, 0, -D], [0, h, -r]],
          [[W, 0, D], [W, 0, -D], [0, h, -r], [0, h, r]],
          [[-W, 0, -D], [-W, 0, D], [0, h, r], [0, h, -r]],
        ])
      : polyGeo([
          [[W, 0, D], [W, 0, -D], [r, h, 0]],
          [[-W, 0, -D], [-W, 0, D], [-r, h, 0]],
          [[-W, 0, D], [W, 0, D], [r, h, 0], [-r, h, 0]],
          [[W, 0, -D], [-W, 0, -D], [-r, h, 0], [r, h, 0]],
        ]);
  }
  geoCache.set(key, g);
  return g;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Primitive components ----------
function B({ s, p, m, r }: { s: V3; p: V3; m: THREE.Material; r?: V3 }) {
  return <mesh geometry={boxGeo(...s)} position={p} rotation={r} material={m} castShadow receiveShadow />;
}
function Cyl({ r, rb, h, p, m, seg = 20, rot }: { r: number; rb?: number; h: number; p: V3; m: THREE.Material; seg?: number; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[r, rb ?? r, h, seg]} />
    </mesh>
  );
}
function Roof({ kind, w, d, h, p, m, o, r }: { kind: "gable" | "hip" | "skillion"; w: number; d: number; h: number; p: V3; m: THREE.Material; o?: number; r?: V3 }) {
  return <mesh geometry={roofGeo(kind, w, d, h, o)} position={p} rotation={r} material={m} castShadow receiveShadow />;
}

/** Windows on all four walls, as one instanced mesh. */
function Windows({ w, d, floors, floorH, y0 = 0, gap = 3.2, ww = 1.3, wh = 1.4, sides = [true, true, true, true] }: {
  w: number; d: number; floors: number; floorH: number; y0?: number; gap?: number; ww?: number; wh?: number; sides?: [boolean, boolean, boolean, boolean];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrices = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const faces: { len: number; place: (t: number) => [number, number, number]; rotY: number }[] = [
      { len: w, place: (t) => [t, 0, d / 2 + 0.03], rotY: 0 },
      { len: w, place: (t) => [t, 0, -d / 2 - 0.03], rotY: Math.PI },
      { len: d, place: (t) => [w / 2 + 0.03, 0, t], rotY: Math.PI / 2 },
      { len: d, place: (t) => [-w / 2 - 0.03, 0, t], rotY: -Math.PI / 2 },
    ];
    faces.forEach((f, i) => {
      if (!sides[i]) return;
      const n = Math.max(1, Math.floor((f.len - 1.5) / gap));
      for (let fl = 0; fl < floors; fl++)
        for (let k = 0; k < n; k++) {
          const t = -((n - 1) * gap) / 2 + k * gap;
          const [x, , z] = f.place(t);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.rotY);
          out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y0 + fl * floorH + floorH * 0.55, z), q, s));
        }
    });
    return out;
  }, [w, d, floors, floorH, y0, gap, sides]);
  useLayoutEffect(() => {
    matrices.forEach((m, i) => ref.current?.setMatrixAt(i, m));
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);
  return (
    <instancedMesh ref={ref} args={[boxGeo(ww, wh, 0.08), mats().glass, matrices.length]} key={matrices.length} castShadow>
    </instancedMesh>
  );
}

function Posts({ w, d, h, every = 2.6, m }: { w: number; d: number; h: number; every?: number; m: THREE.Material }) {
  const pts: V3[] = [];
  const nx = Math.max(1, Math.round(w / every)), nz = Math.max(1, Math.round(d / every));
  for (let i = 0; i <= nx; i++) { pts.push([-w / 2 + (i * w) / nx, h / 2, d / 2]); pts.push([-w / 2 + (i * w) / nx, h / 2, -d / 2]); }
  for (let i = 1; i < nz; i++) { pts.push([w / 2, h / 2, -d / 2 + (i * d) / nz]); pts.push([-w / 2, h / 2, -d / 2 + (i * d) / nz]); }
  return <>{pts.map((p, i) => <B key={i} s={[0.14, h, 0.14]} p={p} m={m} />)}</>;
}

function Car({ p, color, r = 0 }: { p: V3; color: string; r?: number }) {
  const body = useMemo(() => new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1 }), [color]);
  const M = mats();
  return (
    <group position={p} rotation={[0, r, 0]}>
      <B s={[1.8, 0.7, 4.4]} p={[0, 0.65, 0]} m={body} />
      <B s={[1.6, 0.55, 2.2]} p={[0, 1.25, -0.2]} m={M.glass} />
      {[[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].map(([x, z], i) => (
        <Cyl key={i} r={0.34} h={0.25} p={[x, 0.34, z]} rot={[0, 0, Math.PI / 2]} m={M.darkMetal} seg={14} />
      ))}
    </group>
  );
}

function Gum({ p, s = 1, seed = 1 }: { p: V3; s?: number; seed?: number }) {
  const M = mats();
  const r = rng(seed);
  const clumps = useMemo(() => Array.from({ length: 6 }, () => [(r() - 0.5) * 4, 5 + r() * 3.5, (r() - 0.5) * 4, 1.6 + r() * 1.4] as const), [r]);
  return (
    <group position={p} scale={s}>
      <Cyl r={0.18} rb={0.32} h={6} p={[0, 3, 0]} m={M.bark} seg={8} />
      <Cyl r={0.08} rb={0.14} h={3} p={[0.7, 5.3, 0]} rot={[0, 0, -0.5]} m={M.bark} seg={6} />
      {clumps.map(([x, y, z, rr], i) => (
        <mesh key={i} position={[x, y, z]} material={M.foliage[i % 3]} castShadow>
          <icosahedronGeometry args={[rr, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function Tank({ p, r = 1.6, h = 2.2 }: { p: V3; r?: number; h?: number }) {
  const M = mats();
  return (
    <group position={p}>
      <Cyl r={r} h={h} p={[0, h / 2, 0]} m={M.roofs.paperbark} seg={28} />
      <Cyl r={r * 1.02} rb={r * 1.02} h={0.12} p={[0, h, 0]} m={M.roofs.woodland} seg={28} />
    </group>
  );
}

function Pad({ w, d, m, y = 0.06 }: { w: number; d: number; m: THREE.Material; y?: number }) {
  return <mesh geometry={boxGeo(w, 0.12, d)} position={[0, y - 0.06, 0]} material={m} receiveShadow />;
}

function Sign({ p, w, h, m, r }: { p: V3; w: number; h: number; m: THREE.Material; r?: V3 }) {
  return <B s={[w, h, 0.2]} p={p} m={m} r={r} />;
}

function Cross({ p, s = 1, m }: { p: V3; s?: number; m: THREE.Material }) {
  return (
    <group position={p} scale={s}>
      <B s={[0.5, 1.6, 0.15]} p={[0, 0, 0]} m={m} />
      <B s={[1.6, 0.5, 0.15]} p={[0, 0, 0]} m={m} />
    </group>
  );
}

// ---------- Buildings ----------
const HOUSE_WALLS = ["#f3efe4", "#e8e2d0", "#dfe7e4", "#efe6d6", "#e9ece6", "#f1e9df"];
const ROOFS = ["monument", "woodland", "surfmist", "manor", "deepocean"] as const;

function House({ seed }: { seed: number }) {
  const M = mats();
  const r = rng(seed);
  const wall = useMemo(() => M.weatherboard(HOUSE_WALLS[Math.floor(r() * HOUSE_WALLS.length)]), [M, r]);
  const roof = M.roofs[ROOFS[Math.floor(r() * ROOFS.length)]];
  const w = 11, d = 9, h = 3.1;
  return (
    <group>
      <Pad w={16} d={14} m={M.grass} />
      <B s={[w, 0.6, d]} p={[0, 0.3, 0]} m={M.brick("#9b6b4f")} />
      <B s={[w, h, d]} p={[0, 0.6 + h / 2, 0]} m={wall} />
      <Windows w={w} d={d} floors={1} floorH={h} y0={0.6} gap={3} />
      <B s={[1.1, 2.2, 0.1]} p={[0, 0.6 + 1.1, d / 2 + 0.05]} m={M.timber} />
      <Roof kind="hip" w={w} d={d} h={2.6} p={[0, 0.6 + h, 0]} m={roof} o={0.4} />
      {/* wraparound verandah */}
      <Roof kind="skillion" w={w + 2.6} d={2.2} h={0.5} p={[0, 0.6 + h - 0.45, d / 2 + 1.1]} m={roof} o={0.1} />
      <group position={[0, 0.6, d / 2 + 1.1]}><Posts w={w + 2.4} d={0.01} h={h - 0.5} every={2.4} m={M.white} /></group>
      <B s={[w + 2.6, 0.15, 2.4]} p={[0, 0.55, d / 2 + 1.2]} m={M.timber} />
      <B s={[0.8, 1.6, 0.8]} p={[w / 2 - 2, 0.6 + h + 2, -1.5]} m={M.brick("#8d5a42")} />
      <Tank p={[w / 2 + 1.6, 0, -d / 2 + 1.5]} />
      <B s={[3.2, 0.08, 7]} p={[-w / 2 + 0.5, 0.04, d / 2 + 3]} m={M.concrete} />
      <Gum p={[-6.5, 0, -5]} s={0.8} seed={seed + 3} />
    </group>
  );
}

function Townhouses({ seed }: { seed: number }) {
  const M = mats();
  const units = [0, 1, 2, 3];
  const colors = ["#e8e0d2", "#d9dfe2", "#efe7da", "#dde3da"];
  return (
    <group>
      <Pad w={30} d={13} m={M.concrete} />
      {units.map((i) => {
        const x = -10.5 + i * 7;
        const wall = M.render(colors[(i + seed) % 4]);
        return (
          <group key={i} position={[x, 0, 0]}>
            <B s={[6.8, 6.2, 9]} p={[0, 3.1, 0]} m={wall} />
            <Windows w={6.8} d={9} floors={2} floorH={3.1} gap={2.6} sides={[true, true, false, false]} />
            <Roof kind="gable" w={6.8} d={9} h={2.4} p={[0, 6.2, 0]} m={i % 2 ? M.roofs.monument : M.roofs.woodland} o={0.3} r={[0, Math.PI / 2, 0]} />
            <B s={[5.5, 0.15, 1.4]} p={[0, 3.1, 5.2]} m={M.white} />
            <B s={[5.5, 1, 0.05]} p={[0, 3.7, 5.9]} m={M.clearGlass} />
            <B s={[1, 2.2, 0.1]} p={[-1.8, 1.1, 4.55]} m={M.timber} />
          </group>
        );
      })}
    </group>
  );
}

function Apartments() {
  const M = mats();
  const w = 28, d = 14, fh = 3.2, floors = 4;
  const wall = useMemo(() => M.render("#ece8df"), [M]);
  return (
    <group>
      <Pad w={32} d={18} m={M.concrete} />
      <B s={[w, fh * floors, d]} p={[0, (fh * floors) / 2, 0]} m={wall} />
      <B s={[w + 0.4, 0.9, d + 0.4]} p={[0, fh * floors + 0.45, 0]} m={M.plain("#d8d2c6")} />
      <Windows w={w} d={d} floors={floors} floorH={fh} gap={3.4} ww={2} wh={1.8} />
      {Array.from({ length: floors - 1 }, (_, f) =>
        [-9, -3, 3, 9].map((x) => (
          <group key={`${f}${x}`} position={[x, fh * (f + 1), d / 2 + 0.8]}>
            <B s={[4.2, 0.18, 1.6]} p={[0, 0, 0]} m={M.white} />
            <B s={[4.2, 1, 0.05]} p={[0, 0.55, 0.78]} m={M.clearGlass} />
          </group>
        )),
      )}
      <B s={[4, 1.4, 3]} p={[-8, fh * floors + 1.6, 0]} m={M.metal} />
      <B s={[5, 3, 0.15]} p={[0, 1.5, d / 2 + 0.1]} m={M.glass} />
      <Roof kind="skillion" w={6} d={2} h={0.3} p={[0, 3.4, d / 2 + 1]} m={M.roofs.monument} o={0} />
    </group>
  );
}

function Clinic() {
  const M = mats();
  const wall = useMemo(() => M.render("#f7f6f2"), [M]);
  return (
    <group>
      <Pad w={24} d={18} m={M.concrete} />
      <B s={[18, 4, 12]} p={[0, 2, -1]} m={wall} />
      <B s={[18.4, 0.7, 12.4]} p={[0, 4.35, -1]} m={M.plain("#cfd8dc")} />
      <Windows w={18} d={12} floors={1} floorH={4} gap={2.8} ww={1.8} />
      <Roof kind="skillion" w={7} d={3.5} h={0.4} p={[0, 3.4, 6.5]} m={M.roofs.zinc} o={0} />
      <group position={[0, 0, 8.1]}><Posts w={6.6} d={0.01} h={3.3} every={3.3} m={M.metal} /></group>
      <B s={[3, 2.6, 0.12]} p={[0, 1.3, 5.05]} m={M.glass} />
      <Sign p={[-5.5, 3.2, 5.1]} w={4} h={1} m={M.green} />
      <Cross p={[5.5, 3.2, 5.12]} s={0.7} m={M.green} />
      <Car p={[-8, 0, 6.5]} color="#e8e8e8" r={Math.PI / 2} />
    </group>
  );
}

function Hospital() {
  const M = mats();
  const wall = useMemo(() => M.render("#f5f4f0"), [M]);
  return (
    <group>
      <Pad w={62} d={42} m={M.carpark} />
      {/* main block */}
      <B s={[34, 12, 18]} p={[0, 6, -6]} m={wall} />
      <B s={[34.4, 0.8, 18.4]} p={[0, 12.4, -6]} m={M.plain("#d5dbe0")} />
      <Windows w={34} d={18} floors={3} floorH={4} gap={3} ww={2.2} wh={1.6} />
      {/* wings */}
      <B s={[14, 8, 26]} p={[-22, 4, -4]} m={wall} />
      <Windows w={14} d={26} floors={2} floorH={4} gap={3} ww={2} sides={[true, false, false, true]} />
      <B s={[14, 8, 22]} p={[22, 4, -6]} m={wall} />
      {/* glass atrium entrance */}
      <B s={[12, 7, 6]} p={[0, 3.5, 6]} m={M.glass} />
      <B s={[13, 0.4, 7]} p={[0, 7.2, 6]} m={M.white} />
      {/* ambulance canopy */}
      <B s={[10, 0.4, 7]} p={[20, 4.2, 9]} m={M.plain("#c62828")} />
      <group position={[20, 0, 9]}><Posts w={9} d={6} h={4} every={4.5} m={M.metal} /></group>
      <Cross p={[0, 10, 3.2]} s={2} m={M.red} />
      <Sign p={[0, 8.2, 3.12]} w={9} h={1.4} m={M.red} />
      {/* rooftop helipad */}
      <Cyl r={6} h={0.3} p={[6, 12.95, -6]} m={M.plain("#3d3e40")} seg={40} />
      <Cyl r={5.3} h={0.32} p={[6, 12.96, -6]} m={M.yellow} seg={40} />
      <Cyl r={5} h={0.34} p={[6, 12.97, -6]} m={M.plain("#3d3e40")} seg={40} />
      <B s={[0.6, 0.36, 4]} p={[4.8, 13, -6]} m={M.white} />
      <B s={[0.6, 0.36, 4]} p={[7.2, 13, -6]} m={M.white} />
      <B s={[3, 0.36, 0.6]} p={[6, 13, -6]} m={M.white} />
      <B s={[5, 2, 4]} p={[-10, 13.6, -8]} m={M.metal} />
      <Car p={[18, 0, 9]} color="#ffffff" />
      {[-24, -20, -16, 10, 14].map((x, i) => <Car key={x} p={[x, 0, 16]} color={["#9aa5b1", "#2c3e50", "#c0392b", "#ecf0f1", "#34495e"][i]} />)}
    </group>
  );
}

function School() {
  const M = mats();
  const brick = useMemo(() => M.brick("#b5694a"), [M]);
  return (
    <group>
      <Pad w={64} d={44} m={M.grass} />
      <B s={[40, 0.1, 10]} p={[-8, 0.05, -15]} m={M.concrete} />
      {/* classroom wings */}
      <B s={[36, 3.6, 9]} p={[-10, 1.8, -15]} m={brick} />
      <Windows w={36} d={9} floors={1} floorH={3.6} gap={3} ww={2.2} sides={[true, true, false, false]} />
      <Roof kind="gable" w={36} d={9} h={2} p={[-10, 3.6, -15]} m={M.roofs.surfmist} r={[0, Math.PI / 2, 0]} o={0.5} />
      <group position={[16, 0, -4]}>
        <B s={[9, 3.6, 26]} p={[0, 1.8, 0]} m={brick} />
        <Windows w={9} d={26} floors={1} floorH={3.6} gap={3} ww={2.2} sides={[false, false, true, true]} />
        <Roof kind="gable" w={9} d={26} h={2} p={[0, 3.6, 0]} m={M.roofs.surfmist} o={0.5} />
      </group>
      {/* hall */}
      <B s={[16, 7, 12]} p={[-20, 3.5, 6]} m={brick} />
      <Roof kind="gable" w={16} d={12} h={3} p={[-20, 7, 6]} m={M.roofs.deepocean} o={0.5} />
      {/* covered walkway */}
      <Roof kind="skillion" w={30} d={3} h={0.3} p={[-6, 2.9, -8.8]} m={M.roofs.zinc} o={0} />
      {/* basketball court + playground */}
      <B s={[15, 0.06, 26]} p={[2, 0.03, 8]} m={M.plain("#3b7a57")} />
      <B s={[13, 0.07, 0.2]} p={[2, 0.04, 8]} m={M.white} />
      <Cyl r={0.08} h={3} p={[2, 1.5, -4.5]} m={M.metal} /><Cyl r={0.08} h={3} p={[2, 1.5, 20.5]} m={M.metal} />
      <B s={[2, 2.4, 2]} p={[-6, 1.2, 16]} m={M.red} />
      <B s={[0.8, 0.15, 4]} p={[-6, 1.2, 19]} m={M.yellow} r={[-0.5, 0, 0]} />
      <B s={[5, 0.12, 0.12]} p={[-12, 2.4, 16]} m={M.blue} />
      <Cyl r={0.06} h={8} p={[-28, 4, 18]} m={M.metal} />
      <B s={[1.6, 1, 0.04]} p={[-27.2, 7.4, 18]} m={M.blue} />
      <Gum p={[26, 0, 18]} seed={4} /><Gum p={[-28, 0, -10]} seed={9} /><Gum p={[28, 0, -20]} seed={2} s={0.9} />
    </group>
  );
}

function Police() {
  const M = mats();
  const wall = useMemo(() => M.render("#eef1f5"), [M]);
  return (
    <group>
      <Pad w={24} d={18} m={M.carpark} />
      <B s={[16, 4, 10]} p={[0, 2, -2]} m={wall} />
      <B s={[16.4, 0.8, 10.4]} p={[0, 4.4, -2]} m={M.blue} />
      <Windows w={16} d={10} floors={1} floorH={4} gap={2.8} />
      <B s={[2.4, 2.4, 0.1]} p={[0, 1.2, 3.05]} m={M.glass} />
      <B s={[4, 0.8, 0.3]} p={[0, 3.3, 3.2]} m={M.blue} />
      <B s={[0.9, 0.6, 0.9]} p={[3, 3.2, 3.3]} m={M.lamp} />
      <Car p={[-6, 0, 6]} color="#ffffff" r={Math.PI / 2} />
      <Car p={[6, 0, 6]} color="#1e4fa3" r={Math.PI / 2} />
    </group>
  );
}

function Fire() {
  const M = mats();
  const brick = useMemo(() => M.brick("#a85740"), [M]);
  return (
    <group>
      <Pad w={26} d={20} m={M.concrete} />
      <B s={[18, 6, 12]} p={[0, 3, -2]} m={brick} />
      <Roof kind="gable" w={18} d={12} h={2.4} p={[0, 6, -2]} m={M.roofs.manor} o={0.4} r={[0, Math.PI / 2, 0]} />
      {[-4.5, 4.5].map((x) => <B key={x} s={[6.5, 4.6, 0.15]} p={[x, 2.3, 4.05]} m={M.red} />)}
      <B s={[4, 11, 4]} p={[-11, 5.5, -5]} m={brick} />
      <Roof kind="hip" w={4} d={4} h={2} p={[-11, 11, -5]} m={M.roofs.manor} o={0.3} />
      <group position={[4.5, 0, 8]}>
        <B s={[2.5, 2.4, 7.5]} p={[0, 1.6, 0]} m={M.red} />
        <B s={[2.4, 1, 2]} p={[0, 2.5, 2.6]} m={M.glass} />
        <B s={[1.2, 0.5, 0.4]} p={[0, 3.05, 2.6]} m={M.lamp} />
      </group>
    </group>
  );
}

function TownHall() {
  const M = mats();
  const stone = useMemo(() => M.render("#d9c49a"), [M]);
  return (
    <group>
      <Pad w={34} d={24} m={M.concrete} />
      <B s={[28, 8, 16]} p={[0, 4, -2]} m={stone} />
      <B s={[28.6, 1, 16.6]} p={[0, 8.5, -2]} m={M.plain("#c9b488")} />
      <Windows w={28} d={16} floors={2} floorH={4} gap={3.2} ww={1.4} wh={2.2} />
      <Roof kind="hip" w={28} d={16} h={3} p={[0, 9, -2]} m={M.roofs.woodland} o={0.2} />
      {/* portico */}
      <B s={[12, 0.6, 5]} p={[0, 0.3, 8.5]} m={stone} />
      {[-5, -2.5, 0, 2.5, 5].map((x) => <Cyl key={x} r={0.45} h={7} p={[x, 4.1, 9.8]} m={M.white} seg={16} />)}
      <Roof kind="gable" w={12} d={5} h={2} p={[0, 7.6, 8.5]} m={stone} o={0.3} />
      {/* clock tower */}
      <B s={[5, 18, 5]} p={[0, 9, -2]} m={stone} />
      <Cyl r={1.4} h={0.2} p={[0, 15, 0.55]} rot={[Math.PI / 2, 0, 0]} m={M.white} seg={32} />
      <Roof kind="hip" w={5} d={5} h={4} p={[0, 18, -2]} m={M.roofs.manor} o={0.4} />
      <Cyl r={0.05} h={4} p={[0, 24, -2]} m={M.metal} />
      <B s={[1.8, 1.1, 0.04]} p={[0.9, 25.3, -2]} m={M.blue} />
      <Gum p={[-14, 0, 9]} seed={11} s={0.9} /><Gum p={[14, 0, 9]} seed={13} s={0.9} />
    </group>
  );
}

function Park({ seed }: { seed: number }) {
  const M = mats();
  return (
    <group>
      <Pad w={40} d={40} m={M.grass} y={0.08} />
      <B s={[40, 0.1, 2.2]} p={[0, 0.12, 0]} m={M.gravel} />
      <B s={[2.2, 0.1, 40]} p={[0, 0.12, 0]} m={M.gravel} />
      {/* rotunda */}
      <Cyl r={4} h={0.6} p={[0, 0.3, 0]} m={M.white} seg={8} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <Cyl key={i} r={0.12} h={3} p={[Math.cos(a) * 3.6, 2.1, Math.sin(a) * 3.6]} m={M.white} seg={8} />;
      })}
      <mesh position={[0, 4.4, 0]} material={M.roofs.manor} castShadow>
        <coneGeometry args={[4.8, 2.2, 8]} />
      </mesh>
      {[[-12, -12], [12, -14], [-14, 12], [13, 11], [-6, 15], [16, -3]].map(([x, z], i) => <Gum key={i} p={[x, 0, z]} seed={seed + i} s={0.9 + (i % 3) * 0.1} />)}
      {[[-6, 3], [6, -3]].map(([x, z], i) => <B key={i} s={[2, 0.5, 0.6]} p={[x, 0.45, z]} m={M.timber} />)}
    </group>
  );
}

let ovalRing: THREE.ShapeGeometry | null = null;
function ovalRingGeo() {
  if (!ovalRing) {
    const s = new THREE.Shape();
    s.absellipse(0, 0, 62, 46, 0, Math.PI * 2, false, 0);
    const h = new THREE.Path();
    h.absellipse(0, 0, 61.4, 45.4, 0, Math.PI * 2, true, 0);
    s.holes.push(h);
    ovalRing = new THREE.ShapeGeometry(s, 64);
  }
  return ovalRing;
}

function Oval() {
  const M = mats();
  const ring = ovalRingGeo();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} material={M.grass} receiveShadow>
        <boxGeometry args={[130, 100, 0.12]} />
      </mesh>
      <mesh geometry={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]} material={M.white} />
      {[-62, 62].map((x) =>
        [-3.2, 3.2].map((z) => <Cyl key={`${x}${z}`} r={0.12} h={10} p={[x, 5, z]} m={M.white} seg={8} />),
      )}
      {[[-55, -45], [55, -45], [-55, 45], [55, 45]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl r={0.35} rb={0.5} h={30} p={[0, 15, 0]} m={M.metal} seg={10} />
          <B s={[4, 2, 0.6]} p={[0, 30, 0]} m={M.lamp} r={[0.4, Math.atan2(-x, -z), 0]} />
        </group>
      ))}
      <group position={[0, 0, -54]}>
        <B s={[24, 4, 8]} p={[0, 2, 0]} m={M.brick("#b07155")} />
        <Windows w={24} d={8} floors={1} floorH={4} gap={3} ww={2.4} sides={[true, false, false, false]} />
        <Roof kind="skillion" w={26} d={10} h={1.2} p={[0, 4, 0]} m={M.roofs.deepocean} o={0} r={[0, Math.PI, 0]} />
      </group>
    </group>
  );
}

const SHOP_COLORS = ["#c94f3d", "#2f6f8f", "#3f7d4f", "#b8892e"];
function Shop({ seed }: { seed: number }) {
  const M = mats();
  const accent = useMemo(() => M.plain(SHOP_COLORS[seed % 4], 0.6), [M, seed]);
  const wall = useMemo(() => M.render("#efe6d2"), [M]);
  return (
    <group>
      <Pad w={16} d={14} m={M.concrete} />
      <B s={[12, 4.2, 10]} p={[0, 2.1, -1.5]} m={wall} />
      <B s={[12, 2, 0.4]} p={[0, 5.1, 3.5]} m={wall} />
      <Sign p={[0, 5, 3.75]} w={8} h={1.1} m={accent} />
      <B s={[9, 2.6, 0.1]} p={[0, 1.4, 3.55]} m={M.glass} />
      <Roof kind="skillion" w={12} d={0.1} h={0.01} p={[0, 3.6, -1.5]} m={M.roofs.zinc} o={0} />
      <Roof kind="skillion" w={12.4} d={3} h={0.5} p={[0, 3.3, 5.1]} m={M.roofs.zinc} o={0} />
      <group position={[0, 0, 6.5]}><Posts w={12} d={0.01} h={3.2} every={3} m={M.white} /></group>
      <Roof kind="gable" w={12} d={10} h={1.5} p={[0, 4.2, -1.5]} m={M.roofs.zinc} o={0.2} r={[0, Math.PI / 2, 0]} />
    </group>
  );
}

function Cafe() {
  const M = mats();
  const wall = useMemo(() => M.render("#f3ece0"), [M]);
  const umbrella = useMemo(() => M.plain("#e8743b", 0.8), [M]);
  return (
    <group>
      <Pad w={13} d={11} m={M.concrete} />
      <B s={[9, 3.6, 6.5]} p={[-1, 1.8, -1.8]} m={wall} />
      <B s={[7, 2.4, 0.1]} p={[-1, 1.4, 1.4]} m={M.glass} />
      <Roof kind="skillion" w={9.4} d={2.4} h={0.4} p={[-1, 3.3, 2.6]} m={M.roofs.monument} o={0} />
      <Roof kind="skillion" w={9} d={6.5} h={0.6} p={[-1, 3.6, -1.8]} m={M.roofs.monument} o={0.2} r={[0, Math.PI, 0]} />
      {[[-3.5, 4], [0.5, 4], [4, 1]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl r={0.5} h={0.06} p={[0, 0.75, 0]} m={M.white} seg={16} />
          <Cyl r={0.04} h={2.4} p={[0, 1.2, 0]} m={M.metal} seg={6} />
          <mesh position={[0, 2.4, 0]} material={umbrella} castShadow><coneGeometry args={[1.4, 0.6, 8]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Supermarket() {
  const M = mats();
  const wall = useMemo(() => M.render("#e9e6df"), [M]);
  return (
    <group>
      <Pad w={54} d={40} m={M.carpark} />
      <B s={[40, 7, 22]} p={[0, 3.5, -8]} m={wall} />
      <B s={[40.4, 1.6, 22.4]} p={[0, 7.8, -8]} m={M.green} />
      <B s={[14, 3.2, 0.1]} p={[0, 1.6, 3.05]} m={M.glass} />
      <B s={[18, 0.4, 4]} p={[0, 3.6, 5]} m={M.white} />
      <Sign p={[0, 6, 3.2]} w={14} h={1.8} m={M.green} />
      {[[-20, 12], [-15, 12], [-10, 12], [10, 12], [15, 12], [-20, 17], [5, 17], [20, 12]].map(([x, z], i) => (
        <Car key={i} p={[x, 0, z]} color={["#d0d3d4", "#7f8c8d", "#2c3e50", "#c0392b", "#f1f1f1", "#16a085", "#34495e", "#e67e22"][i]} />
      ))}
      <Gum p={[24, 0, 18]} seed={7} s={0.8} /><Gum p={[-25, 0, 18]} seed={8} s={0.8} />
    </group>
  );
}

function Pub() {
  const M = mats();
  const wall = useMemo(() => M.brick("#c98a5e"), [M]);
  const w = 20, d = 14, fh = 3.8;
  return (
    <group>
      <Pad w={26} d={20} m={M.concrete} />
      <B s={[w, fh * 2, d]} p={[0, fh, 0]} m={wall} />
      <Windows w={w} d={d} floors={2} floorH={fh} gap={3} ww={1.2} wh={2} />
      <Roof kind="hip" w={w} d={d} h={3} p={[0, fh * 2, 0]} m={M.roofs.manor} o={0.3} />
      {/* two-level verandah with iron lace balustrade */}
      {[0, 1].map((lvl) => (
        <group key={lvl}>
          <Roof kind="skillion" w={w + 3} d={2.8} h={0.5} p={[0, fh * (lvl + 1) - 0.1, d / 2 + 1.4]} m={M.roofs.zinc} o={0} />
          <group position={[0, fh * lvl, d / 2 + 2.6]}><Posts w={w + 2.6} d={0.01} h={fh - 0.3} every={2.5} m={M.darkMetal} /></group>
          {lvl === 1 && <B s={[w + 2.6, 1, 0.06]} p={[0, fh + 0.5, d / 2 + 2.6]} m={M.darkMetal} />}
        </group>
      ))}
      <B s={[w + 3, 0.2, 2.8]} p={[0, fh, d / 2 + 1.4]} m={M.timber} />
      <Sign p={[0, fh * 2 + 0.2, d / 2 + 0.3]} w={8} h={1} m={M.plain("#1f3b2c")} />
    </group>
  );
}

function Servo() {
  const M = mats();
  const wall = useMemo(() => M.render("#f2f2f2"), [M]);
  return (
    <group>
      <Pad w={32} d={26} m={M.carpark} />
      <B s={[18, 0.9, 10]} p={[0, 5.5, 4]} m={M.white} />
      <B s={[18.2, 0.3, 10.2]} p={[0, 5.05, 4]} m={M.lamp} />
      {[[-6, 1], [6, 1], [-6, 7], [6, 7]].map(([x, z], i) => <B key={i} s={[0.5, 5, 0.5]} p={[x, 2.5, z]} m={M.white} />)}
      {[-3, 3].map((x) => [1.5, 6.5].map((z) => <B key={`${x}${z}`} s={[0.8, 1.6, 0.6]} p={[x, 0.8, z]} m={M.red} />))}
      <B s={[14, 4, 7]} p={[0, 2, -8]} m={wall} />
      <B s={[10, 2.6, 0.1]} p={[0, 1.4, -4.45]} m={M.glass} />
      <B s={[14.2, 0.8, 7.2]} p={[0, 4.3, -8]} m={M.red} />
      <B s={[0.4, 8, 0.4]} p={[13, 4, 10]} m={M.white} />
      <B s={[3, 4, 0.4]} p={[13, 9, 10]} m={M.red} />
      <Car p={[-3, 0, 4]} color="#2980b9" />
    </group>
  );
}

function WaterTower() {
  const M = mats();
  return (
    <group>
      <Pad w={14} d={14} m={M.gravel} />
      {[[-3, -3], [3, -3], [-3, 3], [3, 3]].map(([x, z], i) => (
        <B key={i} s={[0.5, 20, 0.5]} p={[x * 0.85, 10, z * 0.85]} m={M.metal} r={[z * -0.012, 0, x * 0.012]} />
      ))}
      <Cyl r={0.8} h={20} p={[0, 10, 0]} m={M.metal} seg={12} />
      <Cyl r={5} h={7} p={[0, 23.5, 0]} m={M.white} seg={40} />
      <mesh position={[0, 28, 0]} material={M.white} castShadow><coneGeometry args={[5.1, 2, 40]} /></mesh>
      <Cyl r={5.05} h={1.1} p={[0, 22, 0]} m={M.blue} seg={40} />
    </group>
  );
}

function WaterTreatment() {
  const M = mats();
  return (
    <group>
      <Pad w={44} d={32} m={M.concrete} />
      {[[-12, -6], [0, -6]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl r={5.5} h={3} p={[0, 1.5, 0]} m={M.plain("#bfc3c7")} seg={40} />
          <Cyl r={5.1} h={0.1} p={[0, 2.9, 0]} m={M.water} seg={40} />
          <B s={[10.5, 0.3, 0.6]} p={[0, 3.2, 0]} m={M.yellow} />
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[-15 + i * 5.5, 0, 9]}>
          <B s={[5, 2, 8]} p={[0, 1, 0]} m={M.plain("#bfc3c7")} />
          <B s={[4.4, 0.1, 7.4]} p={[0, 1.95, 0]} m={M.water} />
        </group>
      ))}
      <B s={[12, 6, 10]} p={[14, 3, 0]} m={M.render("#e4e7ea")} />
      <Roof kind="gable" w={12} d={10} h={2} p={[14, 6, 0]} m={M.roofs.deepocean} o={0.3} />
      <Windows w={12} d={10} floors={1} floorH={6} gap={3} />
    </group>
  );
}

function Sewage() {
  const M = mats();
  const arm = useRef<THREE.Group>(null);
  const arm2 = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (arm.current) arm.current.rotation.y += dt * 0.25; if (arm2.current) arm2.current.rotation.y -= dt * 0.2; });
  const sludge = useMemo(() => M.plain("#5d6b4a", 0.3), [M]);
  return (
    <group>
      <Pad w={54} d={38} m={M.concrete} />
      {[[-14, -6, arm], [6, -6, arm2]].map(([x, z, ref], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <Cyl r={8} h={3} p={[0, 1.5, 0]} m={M.plain("#bdbdb5")} seg={48} />
          <Cyl r={7.6} h={0.1} p={[0, 2.95, 0]} m={sludge} seg={48} />
          <group ref={ref as React.RefObject<THREE.Group>}><B s={[15.5, 0.4, 0.8]} p={[0, 3.3, 0]} m={M.yellow} /></group>
          <Cyl r={0.8} h={1.5} p={[0, 3.6, 0]} m={M.metal} />
        </group>
      ))}
      <B s={[44, 1, 10]} p={[-4, 0.5, 11]} m={M.plain("#bdbdb5")} />
      <B s={[43, 0.1, 9]} p={[-4, 0.98, 11]} m={M.water} />
      <B s={[10, 5, 8]} p={[20, 2.5, -8]} m={M.render("#e2e2dc")} />
      <Roof kind="skillion" w={10} d={8} h={1} p={[20, 5, -8]} m={M.roofs.woodland} o={0.3} />
    </group>
  );
}

function SolarFarm() {
  const M = mats();
  const ref = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const rows = 9, cols = 10;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0));
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -50 + c * 11.2, z = -32 + r * 8;
      ref.current?.setMatrixAt(i, m.compose(new THREE.Vector3(x, 1.6, z), q, new THREE.Vector3(1, 1, 1)));
      legs.current?.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.7, z));
      i++;
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (legs.current) legs.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <Pad w={120} d={80} m={M.gravel} y={0.04} />
      <instancedMesh ref={ref} args={[boxGeo(10.5, 0.08, 4), M.solar, rows * cols]} castShadow receiveShadow />
      <instancedMesh ref={legs} args={[boxGeo(0.15, 1.4, 0.15), M.metal, rows * cols]} />
      <B s={[4, 2.6, 3]} p={[56, 1.3, 36]} m={M.white} />
      <B s={[120, 2, 0.05]} p={[0, 1, 40]} m={M.metal} />
      <B s={[120, 2, 0.05]} p={[0, 1, -40]} m={M.metal} />
    </group>
  );
}

function WindTurbine({ seed }: { seed: number }) {
  const M = mats();
  const rotor = useRef<THREE.Group>(null);
  const speed = 0.9 + (seed % 5) * 0.08;
  useFrame((_, dt) => { if (rotor.current) rotor.current.rotation.z += dt * speed; });
  return (
    <group>
      <Pad w={18} d={18} m={M.gravel} />
      <Cyl r={1.2} rb={2.4} h={80} p={[0, 40, 0]} m={M.white} seg={24} />
      <B s={[3, 3, 10]} p={[0, 81, -1]} m={M.white} />
      <group ref={rotor} position={[0, 81, 4.4]}>
        <mesh material={M.white} rotation={[Math.PI / 2, 0, 0]} castShadow><coneGeometry args={[1.5, 3, 16]} /></mesh>
        {[0, 1, 2].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
            <mesh position={[0, 21, 0]} material={M.white} castShadow>
              <boxGeometry args={[2.4, 40, 0.35]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Substation() {
  const M = mats();
  return (
    <group>
      <Pad w={26} d={22} m={M.gravel} />
      {[-6, 0, 6].map((x) => (
        <group key={x} position={[x, 0, -2]}>
          <B s={[3.4, 3.4, 2.6]} p={[0, 1.7, 0]} m={M.plain("#8a9199", 0.5, 0.4)} />
          {[-1, 0, 1].map((k) => <Cyl key={k} r={0.18} h={1.6} p={[k, 4.2, 0]} m={M.plain("#6b4b3b")} seg={8} />)}
        </group>
      ))}
      {[-10, 10].map((x) => (
        <group key={x}>
          <B s={[0.4, 10, 0.4]} p={[x, 5, -7]} m={M.metal} /><B s={[0.4, 10, 0.4]} p={[x, 5, 4]} m={M.metal} />
          <B s={[0.4, 0.4, 11]} p={[x, 10, -1.5]} m={M.metal} />
        </group>
      ))}
      <B s={[20.4, 0.3, 0.3]} p={[0, 10, -7]} m={M.metal} />
      <B s={[26, 2.2, 0.05]} p={[0, 1.1, 11]} m={M.metal} />
      <B s={[26, 2.2, 0.05]} p={[0, 1.1, -11]} m={M.metal} />
    </group>
  );
}

function Telecom() {
  const M = mats();
  return (
    <group>
      <Pad w={8} d={8} m={M.gravel} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <Cyl key={i} r={0.08} rb={0.14} h={40} p={[x * 0.75, 20, z * 0.75]} rot={[z * -0.03, 0, x * 0.03]} m={M.metal} seg={6} />
      ))}
      {Array.from({ length: 10 }, (_, i) => <B key={i} s={[2.4 - i * 0.16, 0.1, 0.1]} p={[0, 3 + i * 3.8, 0.75 - i * 0.02]} m={M.metal} r={[0, 0, i % 2 ? 0.6 : -0.6]} />)}
      {[0, 1, 2].map((i) => <B key={i} s={[0.4, 2.4, 0.2]} p={[Math.cos((i * 2 * Math.PI) / 3) * 0.8, 38, Math.sin((i * 2 * Math.PI) / 3) * 0.8]} m={M.white} r={[0, -(i * 2 * Math.PI) / 3, 0]} />)}
      <B s={[0.5, 0.5, 0.5]} p={[0, 40.4, 0]} m={M.red} />
      <B s={[3, 2.6, 2.4]} p={[2.2, 1.3, 2.2]} m={M.plain("#d7dbdd")} />
    </group>
  );
}

function Trees({ seed }: { seed: number }) {
  const r = rng(seed);
  const pts = Array.from({ length: 5 }, () => [(r() - 0.5) * 11, (r() - 0.5) * 11, 0.8 + r() * 0.5] as const);
  return <group>{pts.map(([x, z, s], i) => <Gum key={i} p={[x, 0, z]} s={s} seed={seed * 7 + i} />)}</group>;
}

// ---------- Registry ----------
export function Model({ type, seed }: { type: ItemType; seed: number }): ReactNode {
  switch (type) {
    case "house": return <House seed={seed} />;
    case "townhouses": return <Townhouses seed={seed} />;
    case "apartments": return <Apartments />;
    case "clinic": return <Clinic />;
    case "hospital": return <Hospital />;
    case "school": return <School />;
    case "police": return <Police />;
    case "fire": return <Fire />;
    case "townhall": return <TownHall />;
    case "park": return <Park seed={seed} />;
    case "oval": return <Oval />;
    case "shop": return <Shop seed={seed} />;
    case "cafe": return <Cafe />;
    case "supermarket": return <Supermarket />;
    case "pub": return <Pub />;
    case "servo": return <Servo />;
    case "watertower": return <WaterTower />;
    case "watertreat": return <WaterTreatment />;
    case "sewage": return <Sewage />;
    case "solar": return <SolarFarm />;
    case "wind": return <WindTurbine seed={seed} />;
    case "substation": return <Substation />;
    case "telecom": return <Telecom />;
    case "trees": return <Trees seed={seed} />;
    default: return <ExtraModel type={type} seed={seed} />;
  }
}

export { boxGeo, B, Cyl, Roof, Windows, Posts, Car, Gum, Tank, Pad, Sign, rng };
