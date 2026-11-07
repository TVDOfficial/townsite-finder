"use client";

 

import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Junction, JunctionType } from "./geometry";
import { mats } from "./materials";
import type { TerrainData } from "./terrain";

const PAD_LIFT = 0.62; // just above the road ribbons, so junctions never look like overlapping roads

let shared: { asphalt: THREE.MeshStandardMaterial; marking: THREE.MeshStandardMaterial; island: THREE.MeshStandardMaterial; pole: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial; halo: THREE.MeshBasicMaterial; sel: THREE.MeshBasicMaterial } | null = null;
function jm() {
  return (shared ??= {
    asphalt: new THREE.MeshStandardMaterial({ color: "#3a3b3d", roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    marking: new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    island: new THREE.MeshStandardMaterial({ color: "#5d8f3a", roughness: 1 }),
    pole: new THREE.MeshStandardMaterial({ color: "#2b2e33", metalness: 0.6, roughness: 0.4 }),
    head: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.6 }),
    halo: new THREE.MeshBasicMaterial({ color: "#2ccf93", transparent: true, opacity: 0.6, depthWrite: false }),
    sel: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }),
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

const JunctionMesh = memo(function JunctionMesh({ t, j, type, highlight, selected, onClick }: {
  t: TerrainData; j: Junction; type: JunctionType; highlight: boolean; selected: boolean; onClick?: (key: string) => void;
}) {
  const M = jm();
  const base = t.heightAt(j.x, j.z);
  const R = type === "roundabout" ? Math.max(15, j.width * 1.25) : j.width * 0.72 + 1.5;
  const island = R * 0.45;

  const geo = useMemo(() => ({
    pad: terrainDisc(t, j.x, j.z, R, 0, PAD_LIFT),
    ring: type === "roundabout" ? terrainDisc(t, j.x, j.z, R - 1.0, R - 1.35, PAD_LIFT + 0.02) : null,
    stop: type === "lights" ? terrainDisc(t, j.x, j.z, R - 0.2, R - 0.65, PAD_LIFT + 0.02) : null,
  }), [t, j.x, j.z, R, type]);

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
        g[0].emissiveIntensity = go ? 0 : 3; // red
        g[1].emissiveIntensity = go && local >= 6 ? 3 : 0; // amber
        g[2].emissiveIntensity = go && local < 6 ? 3 : 0; // green
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

  return (
    <group>
      <mesh
        geometry={geo.pad} material={M.asphalt} receiveShadow
        onClick={onClick ? (e) => { if (e.delta > 5) return; e.stopPropagation(); onClick(j.key); } : undefined}
      />
      {geo.ring && <mesh geometry={geo.ring} material={M.marking} />}
      {geo.stop && <mesh geometry={geo.stop} material={M.marking} />}
      {type === "roundabout" && (
        <group position={[j.x, base + PAD_LIFT, j.z]}>
          <mesh position={[0, 0.2, 0]} material={mats().concrete} castShadow receiveShadow><cylinderGeometry args={[island, island + 0.3, 0.4, 48]} /></mesh>
          <mesh position={[0, 0.41, 0]} material={M.island} receiveShadow><cylinderGeometry args={[island - 0.4, island - 0.4, 0.04, 48]} /></mesh>
          {/* a gum tree and some shrubs in the middle */}
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
        <JunctionMesh key={j.key} t={t} j={j} type={types[j.key] ?? "plain"} highlight={highlight} selected={selected === j.key} onClick={onClick} />
      ))}
    </>
  );
}
