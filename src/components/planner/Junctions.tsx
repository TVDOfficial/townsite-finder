"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Junction, JunctionType, Leg } from "./geometry";
import { mats } from "./materials";
import type { TerrainData } from "./terrain";

const PAD_LIFT = 0.62; // just above the road ribbons, so junctions never look like overlapping roads

type JM = {
  asphalt: THREE.MeshStandardMaterial; marking: THREE.MeshStandardMaterial; island: THREE.MeshStandardMaterial;
  pole: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial; halo: THREE.MeshBasicMaterial; sel: THREE.MeshBasicMaterial;
  stop: THREE.MeshStandardMaterial; giveway: THREE.MeshStandardMaterial; signBack: THREE.MeshStandardMaterial;
};
let shared: JM | null = null;

function signTexture(kind: "stop" | "giveway") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  if (kind === "stop") {
    // Octagon geometry fills the canvas; paint red with a white border and STOP.
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#c8102e";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118);
    }
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = "bold 74px system-ui, Arial, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("STOP", 128, 132);
  } else {
    // Downward-pointing triangle: red border, white middle, GIVE WAY.
    const tri = (r: number) => {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
        g.lineTo(128 + Math.cos(a) * r, 128 - Math.sin(a) * r * -1);
      }
      g.closePath();
    };
    g.fillStyle = "#c8102e"; tri(124); g.fill();
    g.fillStyle = "#ffffff"; tri(84); g.fill();
    g.fillStyle = "#c8102e";
    g.font = "bold 26px system-ui, Arial, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("GIVE", 128, 100); g.fillText("WAY", 128, 126);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function jm(): JM {
  return (shared ??= {
    asphalt: new THREE.MeshStandardMaterial({ color: "#3a3b3d", roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    marking: new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    island: new THREE.MeshStandardMaterial({ color: "#5d8f3a", roughness: 1 }),
    pole: new THREE.MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.7, roughness: 0.35 }),
    head: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.6 }),
    halo: new THREE.MeshBasicMaterial({ color: "#2ccf93", transparent: true, opacity: 0.6, depthWrite: false }),
    sel: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }),
    stop: new THREE.MeshStandardMaterial({ map: signTexture("stop"), roughness: 0.4 }),
    giveway: new THREE.MeshStandardMaterial({ map: signTexture("giveway"), roughness: 0.4 }),
    signBack: new THREE.MeshStandardMaterial({ color: "#8c9196", metalness: 0.6, roughness: 0.4 }),
  });
}

/** A flat disc (or ring) that hugs the terrain. */
function terrainDisc(t: TerrainData, cx: number, cz: number, outer: number, inner: number, lift: number) {
  const g = inner > 0 ? new THREE.RingGeometry(inner, outer, 64, 2) : new THREE.CircleGeometry(outer, 64);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    pos.setXYZ(i, x, Math.max(t.heightAt(x, z), t.heightAt(cx, cz)) + lift, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Convex hull (monotone chain) of 2D points. */
function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Flat polygon (fan from its centre) sitting on the terrain. */
function terrainPolygon(t: TerrainData, poly: [number, number][], cx: number, cz: number, lift: number) {
  const y = (x: number, z: number) => Math.max(t.heightAt(x, z), t.heightAt(cx, cz)) + lift;
  const pos: number[] = [cx, y(cx, cz), cz];
  poly.forEach(([x, z]) => pos.push(x, y(x, z), z));
  const idx: number[] = [];
  for (let i = 0; i < poly.length; i++) idx.push(0, ((i + 1) % poly.length) + 1, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A thin painted strip from a to b, `thick` metres wide, on the terrain. */
function stripe(t: TerrainData, a: [number, number], b: [number, number], thick: number, lift: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * (thick / 2), nz = (dx / len) * (thick / 2);
  return terrainPolygon(t, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, lift);
}

function TrafficLight({ x, y, z, face, mats: lamp }: { x: number; y: number; z: number; face: number; mats: THREE.MeshStandardMaterial[] }) {
  const M = jm();
  return (
    <group position={[x, y, z]} rotation={[0, face, 0]}>
      <mesh position={[0, 2.4, 0]} material={M.pole} castShadow><cylinderGeometry args={[0.09, 0.11, 4.8, 10]} /></mesh>
      <mesh position={[0, 4.2, 0.35]} material={M.head} castShadow><boxGeometry args={[0.45, 1.25, 0.35]} /></mesh>
      {lamp.map((m, i) => (
        <mesh key={i} position={[0, 4.6 - i * 0.4, 0.54]} material={m}><sphereGeometry args={[0.14, 12, 12]} /></mesh>
      ))}
    </group>
  );
}

/** A stop or give-way sign on a post, facing traffic approaching along the leg. */
function RoadSign({ x, y, z, face, kind }: { x: number; y: number; z: number; face: number; kind: "stop" | "giveway" }) {
  const M = jm();
  const r = kind === "stop" ? 0.45 : 0.55;
  return (
    <group position={[x, y, z]} rotation={[0, face, 0]}>
      <mesh position={[0, 1.1, 0]} material={M.pole} castShadow><cylinderGeometry args={[0.04, 0.04, 2.2, 8]} /></mesh>
      <group position={[0, kind === "stop" ? 2.3 : 2.25, 0.05]}>
        {/* front face */}
        <mesh material={kind === "stop" ? M.stop : M.giveway} rotation={[0, 0, kind === "stop" ? Math.PI / 8 : -Math.PI / 2]} castShadow>
          <circleGeometry args={[r, kind === "stop" ? 8 : 3]} />
        </mesh>
        {/* metal back */}
        <mesh material={M.signBack} position={[0, 0, -0.02]} rotation={[0, Math.PI, kind === "stop" ? -Math.PI / 8 : Math.PI / 2]}>
          <circleGeometry args={[r, kind === "stop" ? 8 : 3]} />
        </mesh>
      </group>
    </group>
  );
}

const JunctionMesh = memo(function JunctionMesh({ t, j, type, highlight, selected, onClick }: {
  t: TerrainData; j: Junction; type: JunctionType; highlight: boolean; selected: boolean; onClick?: (key: string) => void;
}) {
  const M = jm();
  const base = t.heightAt(j.x, j.z);
  const circular = type === "roundabout" || type === "lights";
  const R = type === "roundabout" ? Math.max(15, j.width * 1.25) : type === "lights" ? j.width * 0.72 + 1.5 : j.width / 2 + 1.5;
  const island = R * 0.45;
  const signed = type === "stop" || type === "giveway";

  const geo = useMemo(() => {
    // Ordinary intersections: an asphalt patch shaped to the roads that meet here (no circle).
    let pad: THREE.BufferGeometry;
    if (circular) pad = terrainDisc(t, j.x, j.z, R, 0, PAD_LIFT);
    else {
      const pts: [number, number][] = [];
      for (const l of j.legs) {
        const nx = -l.dz, nz = l.dx, h = l.width / 2;
        const ex = j.x + l.dx * R, ez = j.z + l.dz * R;
        pts.push([ex + nx * h, ez + nz * h], [ex - nx * h, ez - nz * h]);
      }
      pad = terrainPolygon(t, hull(pts), j.x, j.z, PAD_LIFT);
    }
    // Stop lines (solid) or give-way lines (dashed) across the left lane of each side road.
    const lines: THREE.BufferGeometry[] = [];
    if (signed) {
      for (const l of j.legs.filter((x) => x.minor)) {
        const nx = -l.dz, nz = l.dx; // left side for traffic driving towards the junction
        const h = Math.min(l.width, 8) / 2;
        const sx = j.x + l.dx * (R + 0.4), sz = j.z + l.dz * (R + 0.4);
        if (type === "stop") lines.push(stripe(t, [sx, sz], [sx + nx * h, sz + nz * h], 0.45, PAD_LIFT + 0.03));
        else for (let s = 0.2; s < h - 0.3; s += 1.0) lines.push(stripe(t, [sx + nx * s, sz + nz * s], [sx + nx * (s + 0.6), sz + nz * (s + 0.6)], 0.3, PAD_LIFT + 0.03));
      }
    }
    return {
      pad,
      lines,
      ring: type === "roundabout" ? terrainDisc(t, j.x, j.z, R - 1.0, R - 1.35, PAD_LIFT + 0.02) : null,
      stopRing: type === "lights" ? terrainDisc(t, j.x, j.z, R - 0.2, R - 0.65, PAD_LIFT + 0.02) : null,
    };
  }, [t, j, R, type, circular, signed]);

  // Two signal groups that take turns: green → amber → red.
  const lamps = useMemo(() => [0, 1].map(() => [
    new THREE.MeshStandardMaterial({ color: "#3a0d0d", emissive: "#ff2a2a", emissiveIntensity: 0 }),
    new THREE.MeshStandardMaterial({ color: "#3a2a0d", emissive: "#ffb020", emissiveIntensity: 0 }),
    new THREE.MeshStandardMaterial({ color: "#0d3a1a", emissive: "#2aff6a", emissiveIntensity: 0 }),
  ]), []);
  const halo = useRef<THREE.Mesh>(null);
  const offset = useMemo(() => (j.x * 13 + j.z * 7) % 10, [j.x, j.z]);

  useFrame(({ clock }) => {
    if (type === "lights") {
      const cycle = (clock.elapsedTime + offset) % 14; // 6s green, 1s amber per group
      const phase = cycle < 7 ? 0 : 1;
      const local = cycle % 7;
      lamps.forEach((g, gi) => {
        const go = gi === phase;
        g[0].emissiveIntensity = go ? 0 : 3;
        g[1].emissiveIntensity = go && local >= 6 ? 3 : 0;
        g[2].emissiveIntensity = go && local < 6 ? 3 : 0;
      });
    }
    if (halo.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
      halo.current.scale.set(s, 1, s);
    }
  });

  const poles = type === "lights"
    ? [0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const px = j.x + Math.cos(a) * (R + 0.8), pz = j.z + Math.sin(a) * (R + 0.8);
        return { k, x: px, z: pz, y: t.heightAt(px, pz), face: Math.atan2(j.x - px, j.z - pz) };
      })
    : [];

  // Signs stand on the left verge of each side road, facing oncoming traffic.
  const signs = signed
    ? j.legs.filter((l) => l.minor).map((l: Leg, i) => {
        const nx = -l.dz, nz = l.dx;
        const px = j.x + l.dx * (R + 1.8) + nx * (l.width / 2 + 1.2);
        const pz = j.z + l.dz * (R + 1.8) + nz * (l.width / 2 + 1.2);
        return { i, x: px, z: pz, y: t.heightAt(px, pz), face: Math.atan2(l.dx, l.dz) };
      })
    : [];

  return (
    <group>
      <mesh
        geometry={geo.pad} material={M.asphalt} receiveShadow
        onClick={onClick ? (e) => { if (e.delta > 5) return; e.stopPropagation(); onClick(j.key); } : undefined}
      />
      {geo.lines.map((g, i) => <mesh key={i} geometry={g} material={M.marking} />)}
      {geo.ring && <mesh geometry={geo.ring} material={M.marking} />}
      {geo.stopRing && <mesh geometry={geo.stopRing} material={M.marking} />}
      {type === "roundabout" && (
        <group position={[j.x, base + PAD_LIFT, j.z]}>
          <mesh position={[0, 0.2, 0]} material={mats().concrete} castShadow receiveShadow><cylinderGeometry args={[island, island + 0.3, 0.4, 48]} /></mesh>
          <mesh position={[0, 0.41, 0]} material={M.island} receiveShadow><cylinderGeometry args={[island - 0.4, island - 0.4, 0.04, 48]} /></mesh>
          <mesh position={[0, 3.2, 0]} material={mats().bark} castShadow><cylinderGeometry args={[0.18, 0.3, 5.6, 8]} /></mesh>
          {[[0, 6, 0, 2.2], [1.2, 5.2, 0.6, 1.6], [-1, 5.4, -0.8, 1.7]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} material={mats().foliage[i % 3]} castShadow><icosahedronGeometry args={[r, 1]} /></mesh>
          ))}
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * (island - 1.4), 0.75, Math.sin(a) * (island - 1.4)]} material={mats().foliage[(i + 1) % 3]} castShadow><icosahedronGeometry args={[0.7, 0]} /></mesh>;
          })}
        </group>
      )}
      {poles.map((p) => <TrafficLight key={p.k} x={p.x} y={p.y} z={p.z} face={p.face} mats={lamps[p.k % 2]} />)}
      {signs.map((s) => <RoadSign key={s.i} x={s.x} y={s.y} z={s.z} face={s.face} kind={type === "stop" ? "stop" : "giveway"} />)}
      {(highlight || selected) && (
        <mesh ref={halo} position={[j.x, base + PAD_LIFT + 0.6, j.z]} rotation={[-Math.PI / 2, 0, 0]} material={selected ? M.sel : M.halo}>
          <ringGeometry args={[R + 1, R + 2.6, 48]} />
        </mesh>
      )}
    </group>
  );
});

export default function Junctions({ t, junctions, types, highlight, selected, onClick }: {
  t: TerrainData; junctions: Junction[]; types: Record<string, JunctionType>; highlight: boolean; selected: string | null; onClick?: (key: string) => void;
}) {
  return (
    <>
      {junctions.map((j) => (
        <JunctionMesh key={j.key} t={t} j={j} type={types[j.key]} highlight={highlight} selected={selected === j.key} onClick={onClick} />
      ))}
    </>
  );
}
