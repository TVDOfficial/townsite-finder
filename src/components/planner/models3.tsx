"use client";

// Fun & tourism attractions: water park, wave park, theme park, Ferris wheel, harbour, wildlife park,
// drive-in, go-karts, mini golf and golf course. Most have something moving.
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { ItemType } from "./catalog";
import { mats } from "./materials";
import { B, Car, Cyl, Gum, Pad, Posts, rng, Roof, Sign, Windows } from "./models";

type V3 = [number, number, number];
const once = <T,>(f: () => T) => { let v: T | undefined; return () => (v ??= f()); };
const v3 = (p: V3) => new THREE.Vector3(...p);

const colorMats = new Map<string, THREE.Material>();
/** Shared plain material by colour. */
const pm = (color: string, rough = 0.6) => {
  const key = `${color}${rough}`;
  let m = colorMats.get(key);
  if (!m) { m = mats().plain(color, rough); colorMats.set(key, m); }
  return m;
};

const fun = once(() => ({
  pool: new THREE.MeshPhysicalMaterial({ color: "#3fb8e0", roughness: 0.05, clearcoat: 1 }),
  lagoon: new THREE.MeshPhysicalMaterial({ color: "#2aa3c4", roughness: 0.06, clearcoat: 1 }),
  sea: new THREE.MeshPhysicalMaterial({ color: "#256a85", roughness: 0.08, metalness: 0.1, clearcoat: 1 }),
  swell: new THREE.MeshPhysicalMaterial({ color: "#58c4dc", roughness: 0.05, clearcoat: 1 }),
  foam: new THREE.MeshStandardMaterial({ color: "#f4fbff", roughness: 0.35 }),
  screen: new THREE.MeshStandardMaterial({ color: "#eef2f6", emissive: new THREE.Color("#8fb8ff"), emissiveIntensity: 0.45, roughness: 0.6 }),
}));

const SAND = "#e6d3a3", FAIRWAY = "#7cb342", GREEN = "#92d66e", FELT = "#3e9b4f", ROCK = "#8a8580";
const BRIGHT = ["#ec5f9c", "#f2b705", "#2f9fd8", "#e8743b", "#7b4bc4", "#1f8f4e", "#d63b2f", "#17a2a2"];

/** A flat strip following a curve (go-kart tracks, paths). */
function ribbonGeo(curve: THREE.Curve<THREE.Vector3>, width: number, n: number, y: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) % 1;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const l = Math.hypot(t.x, t.z) || 1, nx = -t.z / l, nz = t.x / l;
    const lx = p.x + (nx * width) / 2, lz = p.z + (nz * width) / 2, rx = p.x - (nx * width) / 2, rz = p.z - (nz * width) / 2;
    pos.push(lx, y, lz, rx, y, rz);
    uv.push(lx, lz, rx, rz);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tubeGeo(pts: V3[], r: number, seg = 120, closed = false) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v3), closed, "centripetal"), seg, r, 8, closed);
}

/** Many copies of one mesh in a single draw call. */
function Instances({ geo, m, matrices }: { geo: THREE.BufferGeometry; m: THREE.Material; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    matrices.forEach((mx, i) => ref.current?.setMatrixAt(i, mx));
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);
  return <instancedMesh ref={ref} args={[geo, m, matrices.length]} key={matrices.length} castShadow receiveShadow />;
}

function Umbrella({ p, color }: { p: V3; color: string }) {
  const M = mats();
  return (
    <group position={p}>
      <Cyl r={0.05} h={2.4} p={[0, 1.2, 0]} m={M.metal} seg={6} />
      <mesh position={[0, 2.5, 0]} material={pm(color, 0.8)} castShadow><coneGeometry args={[1.8, 0.7, 8]} /></mesh>
    </group>
  );
}

function Fence({ w, d, p, h = 1.3 }: { w: number; d: number; p: V3; h?: number }) {
  const M = mats();
  return (
    <group position={p}>
      {[h * 0.45, h * 0.9].map((y) => (
        <group key={y}>
          <B s={[w, 0.08, 0.08]} p={[0, y, d / 2]} m={M.timber} />
          <B s={[w, 0.08, 0.08]} p={[0, y, -d / 2]} m={M.timber} />
          <B s={[0.08, 0.08, d]} p={[w / 2, y, 0]} m={M.timber} />
          <B s={[0.08, 0.08, d]} p={[-w / 2, y, 0]} m={M.timber} />
        </group>
      ))}
      <Posts w={w} d={d} h={h} every={4} m={M.timber} />
    </group>
  );
}

// ---------- Water park ----------
const SLIDES = once(() => {
  const spiral: V3[] = [[25, 14, -17.5], [27.5, 13.8, -19]];
  for (let k = 0; k <= 30; k++) {
    const th = (k / 30) * 2.5 * Math.PI * 2 + Math.PI;
    spiral.push([34 + 5 * Math.cos(th), 13.5 - (k / 30) * 12.6, -22 + 5 * Math.sin(th)]);
  }
  spiral.push([40, 0.7, -16], [39, 0.5, -11]);
  return [
    { g: tubeGeo(spiral, 0.8, 260), c: "#f2b705" },
    { g: tubeGeo([[22.5, 13.6, -18], [21, 11, -10], [27, 8, -2], [21, 5, 6], [25, 2, 13], [25, 0.6, 17]], 0.8, 160), c: "#d63b2f" },
    { g: tubeGeo([[23, 13.6, -22.5], [23, 11, -27], [23, 3, -31], [23, 0.6, -33.5]], 0.75, 60), c: "#2f9fd8" },
  ];
});

function WaterPark() {
  const M = mats(), F = fun();
  const tubes = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (tubes.current) tubes.current.rotation.y += dt * 0.08; });
  return (
    <group>
      <Pad w={90} d={70} m={M.concrete} y={0.1} />
      <B s={[30, 0.1, 18]} p={[-28, 0.12, 18]} m={M.grass} />
      {/* Lazy river around the wave pool */}
      <mesh position={[-22, 0.22, -10]} rotation={[-Math.PI / 2, 0, 0]} material={F.pool} receiveShadow><ringGeometry args={[17.5, 21.5, 56]} /></mesh>
      <Cyl r={14} h={0.25} p={[-22, 0.12, -10]} m={F.pool} seg={48} />
      <group ref={tubes} position={[-22, 0.3, -10]}>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2;
          return <mesh key={i} position={[Math.cos(a) * 19.5, 0, Math.sin(a) * 19.5]} rotation={[Math.PI / 2, 0, 0]} material={pm(BRIGHT[i % BRIGHT.length], 0.4)}><torusGeometry args={[0.7, 0.28, 8, 16]} /></mesh>;
        })}
      </group>
      {/* Slide tower and slides */}
      <group position={[25, 0, -20]}>
        {[[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]].map(([x, z], i) => <Cyl key={i} r={0.3} h={14} p={[x, 7, z]} m={M.metal} seg={8} />)}
        {[4.5, 9, 13.5].map((y) => <B key={y} s={[5.6, 0.3, 5.6]} p={[0, y, 0]} m={M.timber} />)}
        <Roof kind="hip" w={6} d={6} h={1.6} p={[0, 16.2, 0]} m={pm("#17a2a2", 0.5)} o={0.3} />
        {[[-2.6, -2.6], [2.6, 2.6]].map(([x, z], i) => <Cyl key={`r${i}`} r={0.1} h={2.4} p={[x, 15, z]} m={M.metal} seg={6} />)}
      </group>
      {SLIDES().map((s, i) => <mesh key={i} geometry={s.g} material={pm(s.c, 0.35)} castShadow />)}
      <B s={[10, 0.3, 8]} p={[38, 0.15, -10]} m={F.pool} />
      <B s={[8, 0.3, 7]} p={[25, 0.15, 19]} m={F.pool} />
      <B s={[3.5, 0.3, 4]} p={[23, 0.15, -33]} m={F.pool} />
      {/* Splash pad */}
      <group position={[-4, 0, 22]}>
        <Cyl r={0.35} h={3} p={[0, 1.5, 0]} m={pm("#f2b705")} seg={10} />
        <mesh position={[0, 3.2, 0]} material={pm("#ec5f9c")} castShadow><coneGeometry args={[2.2, 1, 16]} /></mesh>
        {[[-3, 1], [3, -1], [1, 3]].map(([x, z], i) => <Cyl key={i} r={0.25} h={1.6} p={[x, 0.8, z]} m={pm(BRIGHT[i + 2])} seg={8} />)}
      </group>
      {/* Change rooms and kiosk */}
      <B s={[16, 3.5, 7]} p={[-28, 1.75, 30]} m={M.render("#f4efe3")} />
      <Roof kind="skillion" w={16} d={7} h={0.6} p={[-28, 3.5, 30]} m={pm("#17a2a2", 0.5)} o={0.4} />
      <Sign p={[-28, 4.6, 33.6]} w={9} h={1.4} m={pm("#2f9fd8")} />
      {[[-40, 15], [-34, 18], [-20, 17], [-14, 22], [6, 10], [10, -30], [-4, -32], [40, 10]].map(([x, z], i) => <Umbrella key={i} p={[x, 0, z]} color={BRIGHT[i % BRIGHT.length]} />)}
      <Gum p={[40, 0, 30]} seed={51} s={0.8} /><Gum p={[-42, 0, -32]} seed={52} s={0.8} />
    </group>
  );
}

// ---------- Wave park ----------
function Surfer({ color }: { color: string }) {
  const M = mats();
  return (
    <group>
      <B s={[0.5, 0.06, 1.9]} p={[0, 0.03, 0]} m={M.white} />
      <B s={[0.35, 0.8, 0.25]} p={[0, 0.55, 0]} m={pm(color)} r={[0, 0, 0.2]} />
      <mesh position={[0, 1.1, 0]} material={pm("#c68b59")}><sphereGeometry args={[0.15, 8, 6]} /></mesh>
    </group>
  );
}

function WavePark() {
  const M = mats(), F = fun();
  const waves = useRef<(THREE.Group | null)[]>([]);
  const foil = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const T = 14, t = (clock.elapsedTime % T) / T;
    const x = -64 + t * 128;
    const rise = Math.min(1, t * 8, (1 - t) * 8);
    if (foil.current) foil.current.position.x = x;
    waves.current.forEach((g, i) => {
      if (!g) return;
      g.position.x = x - 4;
      g.position.y = -1.6 * (1 - rise);
      const surfer = g.children[g.children.length - 1];
      surfer.position.z = (i ? -1 : 1) * (12 + Math.sin(clock.elapsedTime * 0.7 + i) * 8);
    });
  });
  return (
    <group>
      <Pad w={170} d={90} m={M.grass} y={0.08} />
      <B s={[156, 0.3, 66]} p={[0, 0.15, -8]} m={M.concrete} />
      <B s={[150, 0.34, 60]} p={[0, 0.17, -8]} m={F.lagoon} />
      {[-1, 1].map((s) => <B key={s} s={[10, 0.4, 60]} p={[s * 70, 0.2, -8]} m={pm(SAND, 1)} />)}
      {/* Central pier with the wave machine running along it */}
      <B s={[140, 1.6, 3]} p={[0, 0.8, -8]} m={M.concrete} />
      <B s={[140, 0.9, 0.06]} p={[0, 2.05, -6.6]} m={M.metal} />
      <B s={[140, 0.9, 0.06]} p={[0, 2.05, -9.4]} m={M.metal} />
      <group ref={foil} position={[0, 0, -8]}>
        <B s={[6, 2.6, 3.4]} p={[0, 2.9, 0]} m={M.darkMetal} />
        <B s={[6.2, 0.4, 3.6]} p={[0, 4.4, 0]} m={pm("#f2b705")} />
      </group>
      {[1, -1].map((side, i) => (
        <group key={side} ref={(el) => { waves.current[i] = el; }} position={[0, 0, -8]}>
          <group rotation={[0, side * 0.35, 0]} position={[0, 0, side * 15]}>
            <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.6, 1, 0.6]} material={F.swell} castShadow><cylinderGeometry args={[2.2, 2.2, 27, 16]} /></mesh>
            <mesh position={[1.4, 1.35, 0]} rotation={[Math.PI / 2, 0, 0]} material={F.foam}><cylinderGeometry args={[0.55, 0.55, 22, 10]} /></mesh>
          </group>
          <group position={[3.5, 0.8, side * 12]} rotation={[0, Math.PI / 2, 0]}><Surfer color={side > 0 ? "#d63b2f" : "#1e4fa3"} /></group>
        </group>
      ))}
      {/* Surf club */}
      <group position={[0, 0, 35]}>
        <B s={[40, 7, 10]} p={[0, 3.5, 0]} m={M.render("#f4efe6")} />
        <Windows w={40} d={10} floors={2} floorH={3.5} gap={3} ww={2.4} sides={[true, true, false, false]} />
        <Roof kind="skillion" w={42} d={12} h={0.8} p={[0, 7, 0]} m={M.roofs.surfmist} o={0.2} r={[0, Math.PI, 0]} />
        <B s={[40, 0.3, 4]} p={[0, 3.5, -7]} m={M.timber} />
        <Sign p={[0, 8.2, 5.2]} w={14} h={1.4} m={pm("#17a2a2")} />
      </group>
      {[-55, -42, 42, 55].map((x, i) => <Umbrella key={x} p={[x, 0, 32]} color={BRIGHT[i]} />)}
      {[-75, 75].map((x, i) => <Gum key={x} p={[x, 0, 36]} seed={60 + i} s={0.9} />)}
    </group>
  );
}

// ---------- Theme park ----------
const COASTER = once(() => {
  const loop: V3[] = [];
  for (let k = 0; k <= 8; k++) {
    const f = (k / 8) * Math.PI * 2;
    loop.push([-40 - 8 * Math.sin(f), 12 - 8 * Math.cos(f), -33 - (k / 8) * 4]);
  }
  const ctrl: V3[] = [
    [-60, 2.5, 18], [-45, 2.5, 18], [-30, 12, 18], [-18, 24, 18], [-10, 26, 17], [0, 7, 10], [2, 3.5, 0], [0, 8, -14], [-10, 15, -24],
    [-22, 10, -30], [-29, 4.5, -32.6], ...loop, [-52, 4.5, -37.5], [-66, 6, -32], [-74, 9, -18], [-73, 7, -2], [-70, 4, 10], [-67, 2.8, 16],
  ];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(v3), true, "centripetal");
  const N = 900;
  const pts = curve.getSpacedPoints(N);
  const tans = pts.map((_, i) => curve.getTangentAt((i % N) / N));
  // "Up" carried along the track so cars stay upright on hills and roll through the loop.
  const ups: THREE.Vector3[] = [];
  let up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) { up = up.clone().addScaledVector(tans[i], -up.dot(tans[i])).normalize(); ups.push(up); }
  // Spread the small twist left over after one lap evenly, so cars don't snap at the station.
  const twist = Math.atan2(tans[N].dot(new THREE.Vector3().crossVectors(ups[N], ups[0])), ups[N].dot(ups[0]));
  for (let i = 0; i <= N; i++) ups[i] = ups[i].clone().applyAxisAngle(tans[i], (twist * i) / N);
  let iTop = 0;
  for (let i = 0; i < N / 2; i++) if (pts[i].y > pts[iTop].y) iTop = i;
  const supports: THREE.Matrix4[] = [];
  for (let i = 0; i < N; i += 10) {
    const p = pts[i];
    if (p.y < 2.2) continue;
    if (p.x < -31 && p.x > -49 && p.z < -31 && p.z > -39 && p.y > 5) continue; // keep the loop clear
    supports.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, (p.y - 0.4) / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.y - 0.4, 1)));
  }
  return {
    pts, tans, ups, iTop, N, len: curve.getLength(), supports,
    rail: new THREE.TubeGeometry(curve, 800, 0.45, 6, true),
    post: new THREE.CylinderGeometry(0.22, 0.3, 1, 6),
  };
});

function CoasterTrain({ seed }: { seed: number }) {
  const C = COASTER();
  const cars = useRef<(THREE.Group | null)[]>([]);
  const ref = useRef<{ u: number; m: THREE.Matrix4; x: THREE.Vector3 } | null>(null);
  useFrame((_, dt) => {
    const state = (ref.current ??= { u: (seed * 0.137) % 1, m: new THREE.Matrix4(), x: new THREE.Vector3() });
    const yTop = C.pts[C.iTop].y;
    const i0 = Math.floor(state.u * C.N) % C.N;
    // Slow up the lift hill, then gravity takes over.
    const v = i0 <= C.iTop ? 4 : Math.max(4, 0.85 * Math.sqrt(16 + 2 * 9.8 * (yTop - C.pts[i0].y)));
    state.u = (state.u + (v * Math.min(dt, 0.1)) / C.len) % 1;
    cars.current.forEach((g, k) => {
      if (!g) return;
      let uk = state.u - (k * 3) / C.len;
      uk -= Math.floor(uk);
      const i = Math.floor(uk * C.N) % C.N;
      const up = C.ups[i], t = C.tans[i];
      state.x.crossVectors(up, t);
      state.m.makeBasis(state.x, up, t);
      g.quaternion.setFromRotationMatrix(state.m);
      g.position.copy(C.pts[i]).addScaledVector(up, 0.75);
    });
  });
  const M = mats();
  return (
    <>
      {Array.from({ length: 5 }, (_, k) => (
        <group key={k} ref={(el) => { cars.current[k] = el; }}>
          <B s={[1.7, 0.8, 2.6]} p={[0, 0, 0]} m={pm(k === 0 ? "#f2b705" : "#d63b2f", 0.4)} />
          {[-0.4, 0.4].map((x) => <mesh key={x} position={[x, 0.65, -0.2]} material={pm("#c68b59")}><sphereGeometry args={[0.2, 8, 6]} /></mesh>)}
          <B s={[1.6, 0.5, 0.15]} p={[0, 0.55, 0.6]} m={M.darkMetal} />
        </group>
      ))}
    </>
  );
}

function Carousel() {
  const M = mats();
  const spin = useRef<THREE.Group>(null);
  const horses = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.6;
    horses.current.forEach((h, i) => { if (h) h.position.y = 1.4 + Math.sin(clock.elapsedTime * 2 + i * 1.3) * 0.35; });
  });
  return (
    <group>
      <Cyl r={7} h={0.6} p={[0, 0.3, 0]} m={pm("#7b4bc4", 0.5)} seg={24} />
      <group ref={spin}>
        <Cyl r={0.6} h={6} p={[0, 3, 0]} m={pm("#f2b705", 0.4)} seg={12} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(a) * 5, 0, Math.sin(a) * 5]} rotation={[0, -a, 0]}>
              <Cyl r={0.06} h={5} p={[0, 3, 0]} m={M.metal} seg={6} />
              <group ref={(el) => { horses.current[i] = el; }}>
                <B s={[0.5, 0.7, 1.6]} p={[0, 0, 0]} m={pm(i % 2 ? "#f4f2ec" : "#e8b4c8", 0.4)} />
                <B s={[0.35, 0.7, 0.4]} p={[0, 0.5, 0.75]} m={pm(i % 2 ? "#f4f2ec" : "#e8b4c8", 0.4)} />
              </group>
            </group>
          );
        })}
        <Cyl r={7.4} h={0.8} p={[0, 5.9, 0]} m={pm("#d63b2f", 0.5)} seg={24} />
        <mesh position={[0, 7.4, 0]} material={pm("#f4f2ec", 0.5)} castShadow><coneGeometry args={[7.6, 2.4, 24]} /></mesh>
        <B s={[0.8, 1, 0.8]} p={[0, 8.9, 0]} m={pm("#f2b705", 0.4)} />
      </group>
    </group>
  );
}

function DropTower() {
  const M = mats();
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = clock.elapsedTime % 15;
    // Slow climb, pause at the top, sudden drop, pause at the bottom.
    const y = t < 8 ? (t / 8) * 32 : t < 10 ? 32 : t < 11.2 ? 32 * (1 - ((t - 10) / 1.2) ** 2) : 0;
    ring.current.position.y = 2 + y;
  });
  return (
    <group>
      <B s={[2.2, 40, 2.2]} p={[0, 20, 0]} m={M.metal} />
      <Cyl r={1.6} h={2} p={[0, 41, 0]} m={pm("#d63b2f", 0.4)} seg={16} />
      <group ref={ring}>
        <Cyl r={3} h={1.4} p={[0, 0.7, 0]} m={pm("#f2b705", 0.4)} seg={20} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <mesh key={i} position={[Math.cos(a) * 3.2, 1.2, Math.sin(a) * 3.2]} material={pm("#c68b59")}><sphereGeometry args={[0.22, 8, 6]} /></mesh>;
        })}
      </group>
      <Cyl r={5} h={0.3} p={[0, 0.15, 0]} m={M.concrete} seg={20} />
    </group>
  );
}

function PirateShip() {
  const M = mats();
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (arm.current) arm.current.rotation.z = Math.sin(clock.elapsedTime * 0.9) * 1.0; });
  const leg = Math.atan(6 / 12);
  return (
    <group>
      {[-3.5, 3.5].map((z) => [-1, 1].map((s) => (
        <B key={`${z}${s}`} s={[0.7, 13.4, 0.7]} p={[s * 3, 6.2, z]} m={pm("#7b4bc4", 0.5)} r={[0, 0, s * leg]} />
      )))}
      <B s={[0.4, 0.4, 7.4]} p={[0, 12.2, 0]} m={M.metal} />
      <group ref={arm} position={[0, 12.2, 0]}>
        {[-2.5, 2.5].map((x) => <B key={x} s={[0.3, 9, 0.3]} p={[x * 0.6, -4.5, 0]} m={M.metal} r={[0, 0, x * -0.08]} />)}
        <B s={[13, 2.2, 3.6]} p={[0, -9.6, 0]} m={pm("#7a4a22", 0.8)} />
        <B s={[3, 2, 3.4]} p={[-6, -8.4, 0]} m={pm("#7a4a22", 0.8)} />
        <B s={[3, 2, 3.4]} p={[6, -8.4, 0]} m={pm("#7a4a22", 0.8)} />
        <Cyl r={0.15} h={6} p={[0, -5.5, 0]} m={M.timber} seg={6} />
        <B s={[0.05, 3, 3]} p={[0, -5, 0]} m={M.white} />
      </group>
    </group>
  );
}

function Stall({ p, color }: { p: V3; color: string }) {
  const M = mats();
  return (
    <group position={p}>
      <B s={[4, 2.6, 3]} p={[0, 1.3, 0]} m={M.white} />
      <B s={[4.4, 0.1, 1.8]} p={[0, 2.5, 2.2]} m={pm(color, 0.7)} r={[0.3, 0, 0]} />
      <Roof kind="gable" w={4} d={3} h={1} p={[0, 2.6, 0]} m={pm(color, 0.7)} o={0.2} r={[0, Math.PI / 2, 0]} />
    </group>
  );
}

function ThemePark({ seed }: { seed: number }) {
  const M = mats(), C = COASTER();
  return (
    <group>
      <Pad w={160} d={110} m={M.concrete} y={0.1} />
      <B s={[84, 0.1, 64]} p={[-37, 0.12, -11]} m={M.grass} />
      <mesh geometry={C.rail} material={pm("#d63b2f", 0.4)} castShadow />
      <Instances geo={C.post} m={pm("#f4f2ec", 0.5)} matrices={C.supports} />
      <CoasterTrain seed={seed} />
      {/* Coaster station */}
      <group position={[-53, 0, 21]}>
        <B s={[20, 1.6, 4]} p={[0, 0.8, 0]} m={M.concrete} />
        <Posts w={19} d={3} h={5} every={4.75} m={M.darkMetal} />
        <Roof kind="gable" w={20} d={7} h={1.4} p={[0, 5, -1.5]} m={pm("#7b4bc4", 0.5)} o={0.3} r={[0, Math.PI / 2, 0]} />
      </group>
      <group position={[30, 0, 22]}><Carousel /></group>
      <group position={[64, 0, -40]}><DropTower /></group>
      <group position={[36, 0, -22]}><PirateShip /></group>
      {/* Dodgem pavilion */}
      <group position={[62, 0, 12]}>
        <B s={[18, 0.3, 14]} p={[0, 0.15, 0]} m={M.darkMetal} />
        <Posts w={18} d={14} h={4.5} every={6} m={M.metal} />
        <Roof kind="hip" w={18} d={14} h={2} p={[0, 4.5, 0]} m={pm("#2f9fd8", 0.5)} o={0.4} />
        {[[-5, -3], [2, -4], [6, 2], [-2, 3], [-6, 4]].map(([x, z], i) => <B key={i} s={[1.4, 0.7, 2]} p={[x, 0.65, z]} m={pm(BRIGHT[i], 0.4)} r={[0, i * 1.1, 0]} />)}
      </group>
      {[[10, 44], [20, 44], [44, 44], [54, 44]].map(([x, z], i) => <Stall key={i} p={[x, 0, z]} color={BRIGHT[i + 1]} />)}
      {/* Entry gate */}
      <group position={[-10, 0, 52]}>
        {[-7, 7].map((x) => <B key={x} s={[2, 9, 2]} p={[x, 4.5, 0]} m={pm("#ec5f9c", 0.5)} />)}
        <B s={[16, 2.4, 1]} p={[0, 9, 0]} m={pm("#7b4bc4", 0.5)} />
        <Sign p={[0, 9, 0.6]} w={11} h={1.6} m={pm("#f2b705", 0.4)} />
      </group>
      {[[-74, 48], [74, 48], [74, -50], [8, -50], [-6, 40]].map(([x, z], i) => <Gum key={i} p={[x, 0, z]} seed={70 + i} s={0.9} />)}
    </group>
  );
}

// ---------- Ferris wheel ----------
function FerrisWheel() {
  const M = mats();
  const wheel = useRef<THREE.Group>(null);
  const cabins = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, dt) => {
    if (!wheel.current) return;
    wheel.current.rotation.z += dt * 0.12;
    cabins.current.forEach((c) => { if (c) c.rotation.z = -wheel.current!.rotation.z; });
  });
  const R = 18, H = 22.5, leg = Math.atan(10 / H), legLen = Math.hypot(10, H);
  return (
    <group>
      <Pad w={40} d={24} m={M.concrete} y={0.1} />
      {[-3.2, 3.2].map((z) => [-1, 1].map((s) => (
        <B key={`${z}${s}`} s={[0.9, legLen, 0.9]} p={[s * 5, H / 2, z]} m={M.white} r={[0, 0, s * leg]} />
      )))}
      <Cyl r={0.6} h={7} p={[0, H, 0]} rot={[Math.PI / 2, 0, 0]} m={M.darkMetal} seg={12} />
      <group ref={wheel} position={[0, H, 0]}>
        {[-1.4, 1.4].map((z) => (
          <mesh key={z} position={[0, 0, z]} material={M.white} castShadow><torusGeometry args={[R, 0.28, 6, 72]} /></mesh>
        ))}
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <group key={i}>
              {[-1.4, 1.4].map((z) => <B key={z} s={[0.18, R, 0.18]} p={[(Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, z]} m={M.white} r={[0, 0, a - Math.PI / 2]} />)}
              <B s={[0.5, 0.5, 0.5]} p={[Math.cos(a + 0.2) * R, Math.sin(a + 0.2) * R, 1.6]} m={M.lamp} />
              <group position={[Math.cos(a) * R, Math.sin(a) * R, 0]} ref={(el) => { cabins.current[i] = el; }}>
                <B s={[0.12, 1.4, 0.12]} p={[0, -0.7, 0]} m={M.metal} />
                <B s={[2, 1.8, 2]} p={[0, -2.1, 0]} m={pm(BRIGHT[i % BRIGHT.length], 0.4)} />
                <B s={[2.04, 0.7, 2.04]} p={[0, -1.8, 0]} m={M.clearGlass} />
              </group>
            </group>
          );
        })}
      </group>
      <B s={[5, 2.8, 3]} p={[12, 1.4, 8]} m={pm("#ec5f9c", 0.5)} />
      <Roof kind="hip" w={5} d={3} h={1} p={[12, 2.8, 8]} m={pm("#f2b705", 0.5)} o={0.3} />
      <B s={[10, 0.06, 0.06]} p={[3, 1, 9]} m={M.metal} />
      <B s={[10, 0.06, 0.06]} p={[3, 1, 7]} m={M.metal} />
    </group>
  );
}

// ---------- Harbour & marina ----------
function Boat({ p, r, kind, color, phase }: { p: V3; r: number; kind: "yacht" | "motor"; color: string; phase: number }) {
  const M = mats();
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.elapsedTime + phase;
    g.current.position.y = p[1] + Math.sin(t * 1.3) * 0.08;
    g.current.rotation.z = Math.sin(t * 0.9) * 0.05;
  });
  return (
    <group position={p} rotation={[0, r, 0]}>
      <group ref={g}>
        <B s={[2.4, 1, 6.5]} p={[0, 0.25, -0.4]} m={M.white} />
        <B s={[1.7, 1, 1.7]} p={[0, 0.25, 2.9]} m={M.white} r={[0, Math.PI / 4, 0]} />
        <B s={[2.44, 0.22, 6.54]} p={[0, 0.55, -0.4]} m={pm(color, 0.5)} />
        {kind === "yacht" ? (
          <>
            <Cyl r={0.08} h={10} p={[0, 5.7, 0.6]} m={M.metal} seg={6} />
            <B s={[0.1, 0.1, 3.6]} p={[0, 1.9, -1.2]} m={M.metal} />
            <B s={[1.4, 0.6, 2]} p={[0, 1.05, -1]} m={M.white} />
          </>
        ) : (
          <>
            <B s={[1.9, 1, 2.6]} p={[0, 1.2, -0.6]} m={M.white} />
            <B s={[1.92, 0.5, 1.2]} p={[0, 1.35, 0.5]} m={M.glass} r={[-0.4, 0, 0]} />
          </>
        )}
      </group>
    </group>
  );
}

function CruisingBoat() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const th = clock.elapsedTime * 0.08;
    g.current.position.set(Math.cos(th) * 50, 0.1, -33 + Math.sin(th) * 4.2);
    g.current.rotation.y = Math.atan2(-50 * Math.sin(th), 4.2 * Math.cos(th));
  });
  return <group ref={g}><Boat p={[0, 0, 0]} r={0} kind="motor" color="#d63b2f" phase={1} /></group>;
}

function Harbour({ seed }: { seed: number }) {
  const M = mats(), F = fun();
  const boats = useMemo(() => {
    const r = rng(seed + 11);
    const out: { p: V3; r: number; kind: "yacht" | "motor"; color: string; phase: number }[] = [];
    for (const jx of [-40, -5, 30])
      for (const z of [10, 2, -6, -14, -22])
        for (const s of [-1, 1])
          if (r() < 0.72) out.push({ p: [jx + s * 5.4, 0.1, z + 2.6], r: s * Math.PI / 2, kind: r() < 0.55 ? "yacht" : "motor", color: ["#1e4fa3", "#17a2a2", "#2c3e50", "#d63b2f", "#1f8f4e"][Math.floor(r() * 5)], phase: r() * 10 });
    return out;
  }, [seed]);
  const rocks = useMemo(() => {
    const r = rng(seed + 3);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mx: THREE.Matrix4[] = [];
    const add = (x: number, z: number) => mx.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.6 + r() * 0.8, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, 0)), new THREE.Vector3().setScalar(1 + r() * 1.1)));
    for (let z = 15; z > -42; z -= 3) { add(-67 + (r() - 0.5) * 2, z); add(67 + (r() - 0.5) * 2, z); }
    for (let x = -67; x < -12; x += 3) add(x, -42 + (r() - 0.5) * 2);
    for (let x = 12; x < 67; x += 3) add(x, -42 + (r() - 0.5) * 2);
    return { geo, mx };
  }, [seed]);
  return (
    <group>
      {/* Quay and water */}
      <B s={[140, 1.2, 28]} p={[0, 0.6, 31]} m={M.concrete} />
      <B s={[140, 0.2, 62]} p={[0, 0, -14]} m={F.sea} />
      {/* Breakwaters */}
      {[-67, 67].map((x) => <B key={x} s={[3.6, 3.6, 58]} p={[x, 0, -13]} m={pm(ROCK, 1)} r={[0, 0, Math.PI / 4]} />)}
      <B s={[3.6, 3.6, 55]} p={[-39.5, 0, -42]} m={pm(ROCK, 1)} r={[Math.PI / 4, Math.PI / 2, 0]} />
      <B s={[3.6, 3.6, 55]} p={[39.5, 0, -42]} m={pm(ROCK, 1)} r={[Math.PI / 4, Math.PI / 2, 0]} />
      <Instances geo={rocks.geo} m={pm(ROCK, 1)} matrices={rocks.mx} />
      {/* Lighthouse on the end of the breakwater */}
      <group position={[14, 1.8, -42]}>
        <Cyl r={1.2} rb={1.7} h={12} p={[0, 6, 0]} m={M.white} seg={16} />
        <Cyl r={1.32} rb={1.42} h={1.6} p={[0, 8, 0]} m={M.red} seg={16} />
        <Cyl r={1.1} h={1.4} p={[0, 12.7, 0]} m={M.lamp} seg={12} />
        <mesh position={[0, 14, 0]} material={M.red} castShadow><coneGeometry args={[1.4, 1.4, 12]} /></mesh>
      </group>
      {/* Jetties with finger piers */}
      {[-40, -5, 30].map((jx) => (
        <group key={jx} position={[jx, 0, 0]}>
          <B s={[3, 0.4, 44]} p={[0, 0.45, -5]} m={M.timber} />
          {[10, 2, -6, -14, -22].map((z) => [-1, 1].map((s) => <B key={`${z}${s}`} s={[7, 0.3, 1.2]} p={[s * 5, 0.4, z]} m={M.timber} />))}
        </group>
      ))}
      {boats.map((b, i) => <Boat key={i} {...b} />)}
      <CruisingBoat />
      {/* Boat ramp */}
      <B s={[7, 0.3, 15]} p={[55, 0.45, 17]} m={M.concrete} r={[0.11, 0, 0]} />
      <group position={[55, 1.2, 33]}>
        <Car p={[0, 0, 0]} color="#ecf0f1" r={Math.PI} />
        <B s={[2, 0.3, 5]} p={[0, 0.5, -5]} m={M.darkMetal} />
        <B s={[2, 0.9, 5]} p={[0, 1.1, -5]} m={M.white} />
      </group>
      {/* Harbourmaster, fish & chips, boat shed */}
      <group position={[-48, 1.2, 33]}>
        <B s={[16, 6.4, 9]} p={[0, 3.2, 0]} m={M.render("#f4f2ec")} />
        <Windows w={16} d={9} floors={2} floorH={3.2} gap={3} />
        <Roof kind="hip" w={16} d={9} h={2} p={[0, 6.4, 0]} m={M.roofs.deepocean} o={0.5} />
      </group>
      <group position={[-22, 1.2, 36]}>
        <B s={[10, 3.4, 7]} p={[0, 1.7, 0]} m={M.weatherboard("#cfe6f0")} />
        <Roof kind="skillion" w={10} d={7} h={0.6} p={[0, 3.4, 0]} m={M.roofs.zinc} o={0.6} />
        <Sign p={[0, 4, 3.7]} w={6} h={0.9} m={pm("#1e4fa3")} />
        {[-3, 0, 3].map((x) => <B key={x} s={[1.6, 0.8, 1]} p={[x, 0.75, -5]} m={M.timber} />)}
      </group>
      <group position={[20, 1.2, 33]}>
        <B s={[22, 8, 14]} p={[0, 4, 0]} m={pm("#c7ccd1", 0.5)} />
        <Roof kind="gable" w={22} d={14} h={1.8} p={[0, 8, 0]} m={M.roofs.zinc} o={0.3} r={[0, Math.PI / 2, 0]} />
        <B s={[8, 6, 0.1]} p={[0, 3, -7.05]} m={M.darkMetal} />
      </group>
      {[-6, 0, 38, 44].map((x, i) => <Car key={x} p={[x, 1.2, 38]} color={["#7f8c8d", "#2c3e50", "#c0392b", "#bdc3c7"][i]} />)}
    </group>
  );
}

// ---------- Wildlife park ----------
function Roo() {
  const fur = pm("#b5733f", 0.85);
  return (
    <group>
      <mesh position={[0, 0.95, 0]} rotation={[-0.4, 0, 0]} scale={[0.75, 1.1, 0.9]} material={fur} castShadow><sphereGeometry args={[0.5, 12, 10]} /></mesh>
      <mesh position={[0, 1.65, 0.3]} material={fur} castShadow><sphereGeometry args={[0.22, 10, 8]} /></mesh>
      {[-0.1, 0.1].map((x) => <mesh key={x} position={[x, 1.92, 0.25]} material={fur}><coneGeometry args={[0.06, 0.22, 6]} /></mesh>)}
      <mesh position={[0, 0.45, -0.65]} rotation={[-1.9, 0, 0]} material={fur}><coneGeometry args={[0.15, 1.2, 8]} /></mesh>
      {[-0.25, 0.25].map((x) => <mesh key={x} position={[x, 0.3, 0.1]} scale={[0.35, 0.3, 0.75]} material={fur}><sphereGeometry args={[0.5, 8, 6]} /></mesh>)}
    </group>
  );
}

function Emu() {
  const body = pm("#4a3b30", 1);
  const M = mats();
  return (
    <group>
      <mesh position={[0, 1.3, 0]} scale={[0.75, 0.7, 1.1]} material={body} castShadow><sphereGeometry args={[0.55, 12, 10]} /></mesh>
      <Cyl r={0.06} h={0.9} p={[0, 1.9, 0.4]} rot={[0.3, 0, 0]} m={body} seg={6} />
      <mesh position={[0, 2.35, 0.55]} material={body}><sphereGeometry args={[0.11, 8, 6]} /></mesh>
      {[-0.15, 0.15].map((x) => <Cyl key={x} r={0.04} h={1.1} p={[x, 0.55, 0]} m={M.darkMetal} seg={5} />)}
    </group>
  );
}

/** Animals wandering in circles inside a paddock. */
function Herd({ center, radius, n, hop, seed, children }: { center: [number, number]; radius: number; n: number; hop: number; seed: number; children: ReactNode }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const herd = useMemo(() => { const r = rng(seed); return Array.from({ length: n }, () => ({ ph: r() * 6.3, rr: radius * (0.4 + r() * 0.6), w: (r() < 0.5 ? -1 : 1) * (0.08 + r() * 0.1) })); }, [n, radius, seed]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    herd.forEach((a, i) => {
      const g = refs.current[i];
      if (!g) return;
      const ang = a.ph + t * a.w;
      g.position.set(center[0] + Math.cos(ang) * a.rr, hop ? Math.abs(Math.sin(t * 4 + a.ph)) * hop : 0, center[1] + Math.sin(ang) * a.rr);
      g.rotation.y = Math.atan2(-Math.sin(ang) * a.w, Math.cos(ang) * a.w);
    });
  });
  return <>{herd.map((_, i) => <group key={i} ref={(el) => { refs.current[i] = el; }}>{children}</group>)}</>;
}

function Zoo() {
  const M = mats(), F = fun();
  const koala = pm("#9aa0a3", 0.9);
  return (
    <group>
      <Pad w={110} d={80} m={M.grass} y={0.08} />
      <B s={[4, 0.12, 52]} p={[0, 0.12, 8]} m={M.gravel} />
      <B s={[96, 0.12, 4]} p={[0, 0.12, 4]} m={M.gravel} />
      {/* Kangaroos */}
      <Fence w={34} d={26} p={[-30, 0, -14]} />
      <Herd center={[-30, -14]} radius={10} n={7} hop={0.5} seed={81}><Roo /></Herd>
      <Gum p={[-40, 0, -22]} seed={82} s={0.8} />
      {/* Emus */}
      <Fence w={28} d={20} p={[30, 0, -18]} />
      <Herd center={[30, -18]} radius={7} n={4} hop={0} seed={83}><Emu /></Herd>
      {/* Koala grove */}
      <Fence w={18} d={14} p={[0, 0, -28]} h={1.8} />
      {[[-5, -30], [3, -26], [5, -32]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Gum p={[0, 0, 0]} seed={90 + i} s={0.9} />
          <mesh position={[0.4, 4.9, 0.2]} material={koala} castShadow><sphereGeometry args={[0.3, 10, 8]} /></mesh>
          <mesh position={[0.45, 5.3, 0.35]} material={koala}><sphereGeometry args={[0.2, 10, 8]} /></mesh>
        </group>
      ))}
      {/* Croc pond */}
      <Fence w={24} d={18} p={[30, 0, 20]} h={1.6} />
      <mesh position={[30, 0.14, 20]} scale={[1.2, 1, 0.8]} material={F.sea}><cylinderGeometry args={[9, 9, 0.2, 32]} /></mesh>
      {[[26, 18, 0.4], [33, 22, 2.2], [37, 15, -1]].map(([x, z, r], i) => (
        <group key={i} position={[x, 0.2, z]} rotation={[0, r, 0]}>
          <B s={[0.8, 0.3, 3]} p={[0, 0, 0]} m={pm("#4b5d2e", 0.9)} />
          <B s={[0.55, 0.25, 1]} p={[0, 0, 1.9]} m={pm("#4b5d2e", 0.9)} />
          <B s={[0.3, 0.2, 1.6]} p={[0, 0, -2.2]} m={pm("#4b5d2e", 0.9)} />
        </group>
      ))}
      {/* Visitor centre */}
      <group position={[-22, 0, 30]}>
        <B s={[24, 4, 9]} p={[0, 2, 0]} m={M.weatherboard("#e8dcc0")} />
        <Windows w={24} d={9} floors={1} floorH={4} gap={3} ww={1.6} />
        <Roof kind="gable" w={24} d={9} h={2.4} p={[0, 4, 0]} m={M.roofs.woodland} o={0.6} r={[0, Math.PI / 2, 0]} />
        <Sign p={[0, 3.6, 4.7]} w={9} h={1} m={pm("#1f8f4e")} />
      </group>
      {[[16, 32], [22, 32], [28, 32]].map(([x, z], i) => <B key={i} s={[2, 0.8, 1.2]} p={[x, 0.45, z]} m={M.timber} />)}
      {[[-50, 34], [50, 34], [50, -34], [-50, -34]].map(([x, z], i) => <Gum key={i} p={[x, 0, z]} seed={95 + i} />)}
    </group>
  );
}

// ---------- Drive-in ----------
function DriveIn({ seed }: { seed: number }) {
  const M = mats(), F = fun();
  useFrame(({ clock }) => { F.screen.emissive.setHSL((clock.elapsedTime * 0.04) % 1, 0.5, 0.55); });
  const cars = useMemo(() => {
    const r = rng(seed + 5);
    const cols = ["#ecf0f1", "#2c3e50", "#c0392b", "#7f8c8d", "#16a085", "#2980b9", "#e67e22", "#bdc3c7", "#8e44ad"];
    const out: { p: V3; c: string; r: number }[] = [];
    [-12, -3, 6, 15].forEach((z, row) => {
      for (let x = -30; x <= 30; x += 5.5) if (r() < 0.75) out.push({ p: [x, 0, z + Math.abs(x) * 0.08], c: cols[Math.floor(r() * cols.length)], r: Math.PI + x * 0.008 * (row + 1) });
    });
    return out;
  }, [seed]);
  return (
    <group>
      <Pad w={80} d={70} m={M.gravel} y={0.08} />
      {/* Screen */}
      <B s={[34, 15, 0.6]} p={[0, 11.5, -29]} m={F.screen} />
      <B s={[35, 0.8, 1]} p={[0, 4, -29.4]} m={M.darkMetal} />
      {[-15, -5, 5, 15].map((x) => <B key={x} s={[0.6, 19, 0.6]} p={[x, 9.5, -30]} m={M.darkMetal} />)}
      {cars.map((c, i) => <Car key={i} p={c.p} color={c.c} r={c.r} />)}
      {/* Snack bar and projection booth */}
      <group position={[0, 0, 27]}>
        <B s={[12, 3.6, 6]} p={[0, 1.8, 0]} m={M.render("#f6efe0")} />
        <Roof kind="skillion" w={13} d={7} h={0.6} p={[0, 3.6, 0]} m={pm("#d63b2f", 0.5)} o={0.2} r={[0, Math.PI, 0]} />
        <B s={[3, 1.2, 0.1]} p={[0, 2.8, -3.05]} m={M.glass} />
      </group>
      <group position={[34, 0, 32]}>
        <B s={[0.5, 9, 0.5]} p={[0, 4.5, 0]} m={M.darkMetal} />
        <B s={[7, 2.4, 0.5]} p={[0, 8.5, 0]} m={pm("#d63b2f", 0.4)} />
        <B s={[6.4, 0.5, 0.55]} p={[0, 8.5, 0]} m={M.lamp} />
      </group>
    </group>
  );
}

// ---------- Go-karts ----------
const KART = once(() => {
  const curve = new THREE.CatmullRomCurve3(
    ([[-30, 0, 8], [0, 0, 10], [28, 0, 8], [33, 0, -2], [28, 0, -12], [15, 0, -14], [8, 0, -6], [0, 0, -4], [-8, 0, -12], [-20, 0, -18], [-31, 0, -12], [-34, 0, 0]] as V3[]).map(v3),
    true, "centripetal",
  );
  return { curve, len: curve.getLength(), kerb: ribbonGeo(curve, 8.6, 220, 0.13), road: ribbonGeo(curve, 7, 220, 0.16) };
});

function Karts() {
  const K = KART();
  const refs = useRef<(THREE.Group | null)[]>([]);
  const karts = useRef(Array.from({ length: 6 }, (_, i) => ({ u: i / 6, v: 9 + (i % 3) * 1.3, lane: ((i % 3) - 1) * 1.6 })));
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3() }), []);
  useFrame((_, dt) => {
    karts.current.forEach((k, i) => {
      const g = refs.current[i];
      if (!g) return;
      k.u = (k.u + (k.v * Math.min(dt, 0.1)) / K.len) % 1;
      K.curve.getPointAt(k.u, tmp.p);
      K.curve.getTangentAt(k.u, tmp.t);
      g.position.set(tmp.p.x - tmp.t.z * k.lane, 0.16, tmp.p.z + tmp.t.x * k.lane);
      g.rotation.y = Math.atan2(tmp.t.x, tmp.t.z);
    });
  });
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <B s={[1.2, 0.35, 2]} p={[0, 0.3, 0]} m={pm(BRIGHT[i], 0.4)} />
          <mesh position={[0, 0.85, -0.2]} material={pm(BRIGHT[(i + 3) % BRIGHT.length], 0.3)}><sphereGeometry args={[0.24, 8, 6]} /></mesh>
        </group>
      ))}
    </>
  );
}

function KartTrack() {
  const M = mats(), K = KART();
  return (
    <group>
      <Pad w={80} d={50} m={M.grass} y={0.08} />
      <mesh geometry={K.kerb} material={pm("#d63b2f", 0.7)} receiveShadow />
      <mesh geometry={K.road} material={pm("#3a3b3d", 0.95)} receiveShadow />
      <Karts />
      {[[33, 6], [36, -6], [-36, 6], [-35, -8], [14, -18]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          {[0, 1, 2].map((k) => <Cyl key={k} r={0.45} h={0.35} p={[k * 0.9 - 0.9, 0.3, 0]} m={M.darkMetal} seg={10} />)}
        </group>
      ))}
      <group position={[4, 0, 19]}>
        <B s={[22, 3.6, 6]} p={[0, 1.8, 0]} m={M.render("#efe9dd")} />
        <Roof kind="skillion" w={24} d={8} h={0.6} p={[0, 3.6, -1]} m={M.roofs.monument} o={0} r={[0, Math.PI, 0]} />
        <Sign p={[0, 4.5, -3.2]} w={8} h={1} m={pm("#f2b705", 0.4)} />
      </group>
      <group position={[-28, 0, 19]}>
        {[0, 1, 2, 3].map((k) => <B key={k} s={[14, 0.5, 1.2]} p={[0, 0.25 + k * 0.5, k * -1.2 + 1.8]} m={M.concrete} />)}
        <Roof kind="skillion" w={14} d={5} h={0.4} p={[0, 4, 0]} m={M.roofs.zinc} o={0} />
      </group>
    </group>
  );
}

// ---------- Mini golf ----------
function MiniGolf() {
  const M = mats();
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (blades.current) blades.current.rotation.z += dt * 1.2; });
  const holes: [number, number][] = [[-9.5, -7], [-1, -7], [7.5, -7], [-9.5, 1.5], [-1, 1.5], [7.5, 1.5]];
  return (
    <group>
      <Pad w={30} d={24} m={M.concrete} y={0.1} />
      {holes.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <B s={[7.5, 0.15, 4.5]} p={[0, 0.15, 0]} m={pm(FELT, 1)} />
          <B s={[7.7, 0.35, 0.15]} p={[0, 0.25, 2.3]} m={M.timber} />
          <B s={[7.7, 0.35, 0.15]} p={[0, 0.25, -2.3]} m={M.timber} />
          <Cyl r={0.03} h={1.2} p={[2.8, 0.8, 1.2]} m={M.white} seg={4} />
          <B s={[0.5, 0.35, 0.03]} p={[3.05, 1.25, 1.2]} m={M.red} />
        </group>
      ))}
      {/* Windmill */}
      <group position={[-9.5, 0, -7]}>
        <Cyl r={0.8} rb={1.1} h={3} p={[0, 1.6, -1]} m={M.white} seg={8} />
        <mesh position={[0, 3.6, -1]} material={M.red}><coneGeometry args={[1, 1.2, 8]} /></mesh>
        <group ref={blades} position={[0, 2.8, 0]}>
          {[0, 1, 2, 3].map((k) => <B key={k} s={[0.4, 2.4, 0.05]} p={[Math.cos((k * Math.PI) / 2) * 1.2, Math.sin((k * Math.PI) / 2) * 1.2, 0]} m={M.timber} r={[0, 0, (k * Math.PI) / 2 - Math.PI / 2]} />)}
        </group>
      </group>
      {/* Castle */}
      <group position={[-1, 0, -7.5]}>
        <B s={[2.4, 1.6, 1.2]} p={[0, 1, 0]} m={pm("#c9bfa6", 0.9)} />
        {[-1.2, 1.2].map((x) => <group key={x}><Cyl r={0.45} h={2.2} p={[x, 1.3, 0]} m={pm("#c9bfa6", 0.9)} seg={8} /><mesh position={[x, 2.8, 0]} material={M.blue}><coneGeometry args={[0.55, 0.9, 8]} /></mesh></group>)}
      </group>
      {/* Volcano */}
      <mesh position={[7.5, 1.1, -7]} material={pm("#7a4a22", 0.9)} castShadow><coneGeometry args={[1.6, 2, 10, 1, true]} /></mesh>
      <Cyl r={0.4} h={0.1} p={[7.5, 2.05, -7]} m={pm("#f07c1f", 0.4)} seg={10} />
      {/* Loop and bridge */}
      <mesh position={[-9.5, 1, 1.5]} material={pm("#2f9fd8", 0.4)}><torusGeometry args={[0.8, 0.12, 6, 20]} /></mesh>
      <B s={[2, 0.2, 1.6]} p={[-1, 0.7, 1.5]} m={M.timber} r={[0, 0, 0.0]} />
      <mesh position={[7.5, 0.9, 1.5]} scale={[0.4, 0.4, 0.4]} material={pm("#b5733f", 0.85)}><sphereGeometry args={[1.4, 12, 10]} /></mesh>
      {/* Kiosk */}
      <group position={[9, 0, 9.2]}>
        <B s={[7, 2.8, 4]} p={[0, 1.4, 0]} m={pm("#f4f2ec", 0.6)} />
        <Roof kind="gable" w={7} d={4} h={1} p={[0, 2.8, 0]} m={pm("#1f8f4e", 0.5)} o={0.3} r={[0, Math.PI / 2, 0]} />
      </group>
      <Umbrella p={[-6, 0, 9]} color="#f2b705" />
    </group>
  );
}

// ---------- Golf course ----------
const HOLES: [number, number, number, number][] = [
  [-20, 70, -120, 60], [-135, 40, -130, -60], [-115, -80, -30, -75], [-15, -85, 60, -50], [75, -70, 140, -80],
  [140, -55, 130, 20], [115, 40, 30, 25], [20, 10, -50, -20], [-60, 0, -20, 50],
];

function GolfCourse() {
  const M = mats(), F = fun();
  const trees = useMemo(() => {
    const r = rng(99);
    const near = (x: number, z: number) => HOLES.some(([ax, az, bx, bz]) => {
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - ax - t * dx, z - az - t * dz) < 22;
    });
    const out: [number, number, number][] = [];
    for (let i = 0; i < 400 && out.length < 34; i++) {
      const x = (r() - 0.5) * 300, z = (r() - 0.5) * 185;
      if (near(x, z) || (Math.abs(x) < 40 && z > 60) || (x > 60 && z > 55) || (x < -20 && x > -78 && z > 72) || Math.hypot(x - 70, z + 10) < 24) continue;
      out.push([x, z, 0.8 + r() * 0.5]);
    }
    return out;
  }, []);
  return (
    <group>
      <Pad w={320} d={200} m={M.grass} y={0.08} />
      {HOLES.map(([ax, az, bx, bz], i) => {
        const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az);
        const side = i % 2 ? 1 : -1;
        return (
          <group key={i}>
            <B s={[24, 0.05, len]} p={[(ax + bx) / 2, 0.1, (az + bz) / 2]} m={pm(FAIRWAY, 0.95)} r={[0, rot, 0]} />
            <B s={[6, 0.3, 5]} p={[ax, 0.15, az]} m={pm(GREEN, 0.9)} r={[0, rot, 0]} />
            <Cyl r={10} h={0.1} p={[bx, 0.14, bz]} m={pm(GREEN, 0.9)} seg={24} />
            <Cyl r={4.5} h={0.1} p={[bx + Math.cos(rot) * 12 * side, 0.13, bz - Math.sin(rot) * 12 * side]} m={pm(SAND, 1)} seg={16} />
            <Cyl r={0.05} h={2.6} p={[bx, 1.4, bz]} m={M.white} seg={4} />
            <B s={[0.9, 0.55, 0.04]} p={[bx + 0.45, 2.4, bz]} m={M.red} />
          </group>
        );
      })}
      <mesh position={[70, 0.12, -10]} scale={[1.5, 1, 1]} material={F.sea}><cylinderGeometry args={[14, 14, 0.12, 32]} /></mesh>
      {trees.map(([x, z, s], i) => <Gum key={i} p={[x, 0, z]} s={s} seed={200 + i} />)}
      {/* Clubhouse and car park */}
      <group position={[0, 0, 84]}>
        <B s={[30, 4.2, 12]} p={[0, 2.1, 0]} m={M.brick("#c9a27e")} />
        <Windows w={30} d={12} floors={1} floorH={4.2} gap={3} ww={2} />
        <Roof kind="hip" w={30} d={12} h={2.4} p={[0, 4.2, 0]} m={M.roofs.woodland} o={0.8} />
        <B s={[30, 0.3, 5]} p={[0, 0.3, -8.5]} m={M.timber} />
      </group>
      <B s={[44, 0.12, 18]} p={[-48, 0.1, 88]} m={M.carpark} />
      {[-62, -56, -50, -38].map((x, i) => <Car key={x} p={[x, 0.1, 84]} color={["#ecf0f1", "#2c3e50", "#7f8c8d", "#c0392b"][i]} />)}
      {/* Driving range */}
      <B s={[80, 0.06, 30]} p={[110, 0.1, 78]} m={pm(FAIRWAY, 0.95)} />
      <group position={[72, 0, 78]}>
        <B s={[5, 3, 28]} p={[0, 1.5, 0]} m={pm("#e8e2d0", 0.7)} />
        <Roof kind="skillion" w={5} d={28} h={0.5} p={[0, 3, 0]} m={M.roofs.woodland} o={0.3} r={[0, -Math.PI / 2, 0]} />
      </group>
    </group>
  );
}

export function FunModel({ type, seed }: { type: ItemType; seed: number }): ReactNode {
  switch (type) {
    case "waterpark": return <WaterPark />;
    case "wavepark": return <WavePark />;
    case "themepark": return <ThemePark seed={seed} />;
    case "ferris": return <FerrisWheel />;
    case "harbour": return <Harbour seed={seed} />;
    case "zoo": return <Zoo />;
    case "drivein": return <DriveIn seed={seed} />;
    case "karts": return <KartTrack />;
    case "minigolf": return <MiniGolf />;
    case "golf": return <GolfCourse />;
    default: return null;
  }
}
