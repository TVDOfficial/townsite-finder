"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { boundaryCorners, ribbon, type Boundary } from "./geometry";
import type { TerrainData } from "./terrain";

export type BoundaryHandle = number | "move" | "e0" | "e1" | "e2" | "e3";

let mats: { line: THREE.MeshBasicMaterial; post: THREE.MeshStandardMaterial; handle: THREE.MeshBasicMaterial; edge: THREE.MeshBasicMaterial; move: THREE.MeshBasicMaterial } | null = null;
const m = () => (mats ??= {
  line: new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }),
  post: new THREE.MeshStandardMaterial({ color: "#facc15", emissive: "#facc15", emissiveIntensity: 0.4 }),
  handle: new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.95 }),
  edge: new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.95 }),
  move: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }),
});

const label = { background: "rgba(20,16,4,.82)", color: "#fde68a", padding: "3px 9px", borderRadius: 999, font: "600 12px system-ui", whiteSpace: "nowrap" as const, pointerEvents: "none" as const };
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

export default function BoundaryMesh({ t, b, editing, onDragStart }: {
  t: TerrainData; b: Boundary; editing: boolean; onDragStart: (kind: BoundaryHandle, x: number, z: number) => void;
}) {
  const M = m();
  const corners = useMemo(() => boundaryCorners(b), [b]);
  const line = useMemo(() => ribbon(t, [...corners, corners[0]], editing ? 5 : 2.5, 0, 0.9, 1), [t, corners, editing]);
  useEffect(() => () => line.dispose(), [line]);
  const pulse = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (pulse.current) pulse.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.12); });

  // Handles scale with the boundary so they're easy to grab at any zoom.
  const r = Math.max(16, Math.min(b.w, b.d) / 45);
  const cursor = (c: string) => ({ onPointerOver: () => { document.body.style.cursor = c; }, onPointerOut: () => { document.body.style.cursor = ""; } });
  // Midpoints of each side: top (0), right (1), bottom (2), left (3).
  const mids = corners.map((p, i) => {
    const q = corners[(i + 1) % 4];
    return { i, x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2, len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });

  return (
    <group>
      <mesh geometry={line} material={M.line} />
      {corners.map(([x, z], i) => {
        const y = t.heightAt(x, z);
        return (
          <group key={i} position={[x, y, z]}>
            <mesh position={[0, 4, 0]} material={M.post} castShadow><cylinderGeometry args={[0.35, 0.35, 8, 8]} /></mesh>
            <mesh position={[1.2, 7.2, 0]} material={M.post}><boxGeometry args={[2.2, 1.4, 0.08]} /></mesh>
            {editing && (
              <mesh position={[0, r * 0.6, 0]} material={M.handle} onPointerDown={(e) => { e.stopPropagation(); onDragStart(i, x, z); }} {...cursor("nwse-resize")}>
                <sphereGeometry args={[r, 20, 16]} />
              </mesh>
            )}
          </group>
        );
      })}
      {editing && mids.map((mp) => (
        <group key={`e${mp.i}`} position={[mp.x, t.heightAt(mp.x, mp.z), mp.z]}>
          <mesh position={[0, r * 0.5, 0]} material={M.edge}
            onPointerDown={(e) => { e.stopPropagation(); onDragStart(`e${mp.i}` as BoundaryHandle, mp.x, mp.z); }} {...cursor(mp.i % 2 ? "ew-resize" : "ns-resize")}>
            <boxGeometry args={[r * 1.4, r * 0.9, r * 1.4]} />
          </mesh>
          <Html position={[0, r * 2.4, 0]} center style={label}>{km(mp.len)}</Html>
        </group>
      ))}
      {editing && (
        <group position={[b.cx, t.heightAt(b.cx, b.cz) + 4, b.cz]}>
          <group ref={pulse}>
            <mesh material={M.move} onPointerDown={(e) => { e.stopPropagation(); onDragStart("move", e.point.x, e.point.z); }} {...cursor("move")}>
              <octahedronGeometry args={[r * 1.2, 0]} />
            </mesh>
          </group>
          <Html position={[0, r * 3, 0]} center style={label}>{Math.round((b.w * b.d) / 10000).toLocaleString()} ha · drag to move</Html>
        </group>
      )}
    </group>
  );
}
