"use client";

import { memo, useMemo } from "react";
import * as THREE from "three";
import { ROADS } from "./catalog";
import type { Road } from "./geometry";
import { mats } from "./materials";
import type { TerrainData } from "./terrain";

const texCache = new Map<string, THREE.CanvasTexture>();
function signTexture(name: string) {
  let t = texCache.get(name);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0f6b3a";
    g.beginPath(); g.roundRect(0, 0, 512, 96, 14); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = 5;
    g.beginPath(); g.roundRect(7, 7, 498, 82, 10); g.stroke();
    g.fillStyle = "#ffffff";
    g.font = "bold 50px system-ui, Arial, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(name.toUpperCase(), 256, 52, 470);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache.set(name, t);
  }
  return t;
}

function SignPost({ t, x, z, angle, name }: { t: TerrainData; x: number; z: number; angle: number; name: string }) {
  const M = mats();
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: signTexture(name), roughness: 0.5, side: THREE.DoubleSide }), [name]);
  const y = t.heightAt(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1.6, 0]} material={M.metal} castShadow><cylinderGeometry args={[0.05, 0.05, 3.2, 8]} /></mesh>
      <mesh position={[0, 3.05, 0]} rotation={[0, angle, 0]} material={mat} castShadow>
        <planeGeometry args={[2.6, 0.5]} />
      </mesh>
    </group>
  );
}

/** A street sign at each end of every named road (and in the middle of long ones). */
export default memo(function StreetSigns({ t, roads }: { t: TerrainData; roads: Road[] }) {
  const signs = useMemo(() => {
    const out: { key: string; x: number; z: number; angle: number; name: string }[] = [];
    for (const r of roads) {
      if (!r.name || r.pts.length < 2) continue;
      const off = ROADS[r.type].width / 2 + (r.type === "main" ? 3.2 : 1.6);
      const place = (i: number, j: number, tag: string) => {
        const [x0, z0] = r.pts[i], [x1, z1] = r.pts[j];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 8) return;
        const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
        const along = Math.min(10, len / 3);
        out.push({ key: `${r.id}${tag}`, x: x0 + dx * along - dz * off, z: z0 + dz * along + dx * off, angle: Math.atan2(-dz, dx), name: r.name });
      };
      place(0, 1, "a");
      place(r.pts.length - 1, r.pts.length - 2, "b");
    }
    return out;
  }, [roads]);
  return <>{signs.map((s) => <SignPost key={s.key} t={t} x={s.x} z={s.z} angle={s.angle} name={s.name} />)}</>;
});
