"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { boundaryCorners, ribbon, type Boundary } from "./geometry";
import type { TerrainData } from "./terrain";

let mats: { line: THREE.MeshBasicMaterial; post: THREE.MeshStandardMaterial; handle: THREE.MeshBasicMaterial; move: THREE.MeshBasicMaterial } | null = null;
const m = () => (mats ??= {
  line: new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }),
  post: new THREE.MeshStandardMaterial({ color: "#facc15", emissive: "#facc15", emissiveIntensity: 0.4 }),
  handle: new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.9 }),
  move: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }),
});

export default function BoundaryMesh({ t, b, editing, onDragStart }: {
  t: TerrainData; b: Boundary; editing: boolean; onDragStart: (kind: number | "move", x: number, z: number) => void;
}) {
  const M = m();
  const corners = useMemo(() => boundaryCorners(b), [b]);
  const line = useMemo(() => ribbon(t, [...corners, corners[0]], editing ? 4 : 2.5, 0, 0.9, 1), [t, corners, editing]);
  useEffect(() => () => line.dispose(), [line]);
  const pulse = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (pulse.current) pulse.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.12); });

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
              <mesh position={[0, 3, 0]} material={M.handle}
                onPointerDown={(e) => { e.stopPropagation(); onDragStart(i, x, z); }}
                onPointerOver={() => { document.body.style.cursor = "nwse-resize"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
                <sphereGeometry args={[Math.max(10, b.w / 60), 20, 16]} />
              </mesh>
            )}
          </group>
        );
      })}
      {editing && (
        <group ref={pulse} position={[b.cx, t.heightAt(b.cx, b.cz) + 4, b.cz]}>
          <mesh material={M.move}
            onPointerDown={(e) => { e.stopPropagation(); onDragStart("move", e.point.x, e.point.z); }}
            onPointerOver={() => { document.body.style.cursor = "move"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
            <octahedronGeometry args={[Math.max(12, b.w / 50), 0]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
