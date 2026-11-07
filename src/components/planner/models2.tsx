"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { ItemType } from "./catalog";
import { mats } from "./materials";
import { FunModel } from "./models3";
import { B, Car, Cyl, Gum, Pad, Posts, rng, Roof, Sign, Tank, Windows } from "./models";

function AgedCare() {
  const M = mats();
  const wall = useMemo(() => M.brick("#c9a27e"), [M]);
  return (
    <group>
      <Pad w={44} d={30} m={M.grass} />
      {[[-11, -6, 20, 9], [11, -6, 20, 9], [0, 7, 12, 10]].map(([x, z, w, d], i) => (
        <group key={i} position={[x, 0, z]}>
          <B s={[w, 3.6, d]} p={[0, 1.8, 0]} m={wall} />
          <Windows w={w} d={d} floors={1} floorH={3.6} gap={3} ww={1.6} />
          <Roof kind="hip" w={w} d={d} h={2} p={[0, 3.6, 0]} m={M.roofs.paperbark} o={0.6} />
        </group>
      ))}
      <Roof kind="skillion" w={22} d={3} h={0.3} p={[0, 3, -0.2]} m={M.roofs.zinc} o={0} />
      <Gum p={[-17, 0, 10]} seed={21} s={0.8} /><Gum p={[17, 0, 10]} seed={22} s={0.8} />
      {[-6, 6].map((x) => <B key={x} s={[2, 0.5, 0.6]} p={[x, 0.45, 12]} m={M.timber} />)}
    </group>
  );
}

function HighSchool() {
  const M = mats();
  const brick = useMemo(() => M.brick("#a8634a"), [M]);
  return (
    <group>
      <Pad w={90} d={60} m={M.grass} />
      <B s={[50, 7.2, 12]} p={[-14, 3.6, -20]} m={brick} />
      <Windows w={50} d={12} floors={2} floorH={3.6} gap={3} ww={2.2} />
      <Roof kind="hip" w={50} d={12} h={2.2} p={[-14, 7.2, -20]} m={M.roofs.surfmist} o={0.5} />
      <group position={[25, 0, -9]}>
        <B s={[12, 7.2, 30]} p={[0, 3.6, 0]} m={brick} />
        <Windows w={12} d={30} floors={2} floorH={3.6} gap={3} ww={2.2} />
        <Roof kind="hip" w={12} d={30} h={2.2} p={[0, 7.2, 0]} m={M.roofs.surfmist} o={0.5} />
      </group>
      <B s={[26, 9, 18]} p={[-24, 4.5, 8]} m={M.plain("#d7dbdd", 0.5, 0.3)} />
      <Roof kind="gable" w={26} d={18} h={2.5} p={[-24, 9, 8]} m={M.roofs.deepocean} o={0.3} r={[0, Math.PI / 2, 0]} />
      <B s={[30, 0.06, 16]} p={[14, 0.03, 18]} m={M.plain("#2f6f8f")} />
      <B s={[0.15, 0.07, 16]} p={[14, 0.04, 18]} m={M.white} />
      <Roof kind="skillion" w={36} d={3} h={0.3} p={[-10, 3, -12.5]} m={M.roofs.zinc} o={0} />
      <Gum p={[40, 0, 25]} seed={31} /><Gum p={[-42, 0, 25]} seed={32} /><Gum p={[42, 0, -26]} seed={33} s={0.9} />
    </group>
  );
}

function Childcare() {
  const M = mats();
  const wall = useMemo(() => M.weatherboard("#f4e7c8"), [M]);
  const sail = useMemo(() => M.plain("#e8743b", 0.8), [M]);
  return (
    <group>
      <Pad w={22} d={18} m={M.grass} />
      <B s={[14, 3.4, 8]} p={[-2, 1.7, -4]} m={wall} />
      <Windows w={14} d={8} floors={1} floorH={3.4} gap={2.6} />
      <Roof kind="gable" w={14} d={8} h={1.8} p={[-2, 3.4, -4]} m={M.roofs.manor} o={0.4} r={[0, Math.PI / 2, 0]} />
      <B s={[8, 0.05, 6]} p={[3, 3.2, 4]} m={sail} r={[0.15, 0.4, 0]} />
      {[[0, 2], [6, 6]].map(([x, z], i) => <Cyl key={i} r={0.08} h={3.2} p={[x, 1.6, z]} m={M.metal} seg={8} />)}
      <B s={[1.6, 1.6, 1.6]} p={[5, 0.8, 4]} m={M.yellow} />
      <B s={[2.5, 0.2, 2.5]} p={[-5, 0.15, 4.5]} m={M.plain("#e8d9a8")} />
    </group>
  );
}

function Church() {
  const M = mats();
  const wall = useMemo(() => M.weatherboard("#f6f3ea"), [M]);
  return (
    <group>
      <Pad w={16} d={26} m={M.grass} />
      <B s={[9, 5, 16]} p={[0, 2.5, -2]} m={wall} />
      <Roof kind="gable" w={9} d={16} h={4.5} p={[0, 5, -2]} m={M.roofs.manor} o={0.4} />
      {[-4, 0, 4].map((z) => [4.55, -4.55].map((x) => <B key={`${x}${z}`} s={[0.08, 2.6, 1]} p={[x, 2.8, z - 2]} m={M.glass} />))}
      <B s={[3.4, 9, 3.4]} p={[0, 4.5, 7.4]} m={wall} />
      <mesh position={[0, 12, 7.4]} rotation={[0, Math.PI / 4, 0]} material={M.roofs.manor} castShadow><coneGeometry args={[2.6, 6, 4]} /></mesh>
      <B s={[0.15, 1.8, 0.15]} p={[0, 15.8, 7.4]} m={M.metal} />
      <B s={[1, 0.15, 0.15]} p={[0, 16.2, 7.4]} m={M.metal} />
      <B s={[1.4, 2.6, 0.1]} p={[0, 1.3, 9.15]} m={M.timber} />
      <Gum p={[-6, 0, -9]} seed={41} s={0.8} />
    </group>
  );
}

function Playground() {
  const M = mats();
  const sails = useMemo(() => [M.plain("#e8743b", 0.8), M.plain("#2f9fd8", 0.8)], [M]);
  return (
    <group>
      <Pad w={22} d={22} m={M.plain("#b8865a", 1)} y={0.08} />
      <B s={[4, 2.8, 4]} p={[-4, 1.4, -3]} m={M.red} />
      <Roof kind="hip" w={4} d={4} h={1.2} p={[-4, 2.8, -3]} m={M.roofs.deepocean} o={0.2} />
      <B s={[1, 0.15, 5]} p={[-4, 1.4, 1.2]} m={M.yellow} r={[-0.5, 0, 0]} />
      <group position={[5, 0, -2]}>
        {[-2, 2].map((x) => <B key={x} s={[0.15, 3, 0.15]} p={[x, 1.5, 0]} m={M.blue} />)}
        <B s={[4.3, 0.15, 0.15]} p={[0, 3, 0]} m={M.blue} />
        {[-1, 1].map((x) => <B key={x} s={[0.6, 0.08, 0.3]} p={[x, 0.7, 0]} m={M.darkMetal} />)}
      </group>
      <B s={[10, 0.05, 8]} p={[0, 5, 0]} m={sails[0]} r={[0.15, 0.3, 0.1]} />
      <B s={[8, 0.05, 7]} p={[2, 4.6, 4]} m={sails[1]} r={[-0.1, -0.2, 0.08]} />
      {[[-6, -5], [6, -5], [-6, 6], [7, 7]].map(([x, z], i) => <Cyl key={i} r={0.1} h={5.2} p={[x, 2.6, z]} m={M.metal} seg={8} />)}
    </group>
  );
}

function Skatepark() {
  const M = mats();
  return (
    <group>
      <Pad w={26} d={18} m={M.concrete} y={0.1} />
      <mesh position={[-6, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.concrete} receiveShadow castShadow>
        <torusGeometry args={[4, 1.2, 10, 24, Math.PI]} />
      </mesh>
      <B s={[5, 2, 6]} p={[6, 1, -3]} m={M.concrete} r={[0, 0, 0.35]} />
      <B s={[5, 2, 6]} p={[9, 1, -3]} m={M.concrete} r={[0, 0, -0.35]} />
      <B s={[6, 0.1, 0.1]} p={[5, 0.6, 5]} m={M.metal} />
      <B s={[2, 0.6, 2]} p={[-2, 0.4, 6]} m={M.concrete} />
    </group>
  );
}

let poolWater: THREE.MeshPhysicalMaterial | null = null;
function Pool() {
  const M = mats();
  const water = (poolWater ??= new THREE.MeshPhysicalMaterial({ color: "#3fb8e0", roughness: 0.05, clearcoat: 1 }));
  return (
    <group>
      <Pad w={44} d={28} m={M.concrete} y={0.1} />
      <B s={[25, 0.2, 12]} p={[-4, 0.15, -2]} m={water} />
      <B s={[25, 0.05, 0.08]} p={[-4, 0.27, 1]} m={M.white} />
      <B s={[25, 0.05, 0.08]} p={[-4, 0.27, -5]} m={M.white} />
      <B s={[8, 0.2, 6]} p={[14, 0.15, 6]} m={water} />
      <B s={[12, 3.4, 6]} p={[12, 1.7, -9]} m={M.render("#f2efe6")} />
      <Roof kind="skillion" w={12} d={6} h={0.6} p={[12, 3.4, -9]} m={M.roofs.deepocean} o={0.3} />
      <B s={[10, 0.05, 6]} p={[-14, 4, 9]} m={M.plain("#f2b705", 0.8)} r={[0.1, 0, 0]} />
      {[-4, 4].map((x) => <B key={x} s={[0.6, 0.4, 1.8]} p={[x, 0.3, 8]} m={M.white} />)}
    </group>
  );
}

function Garden() {
  const M = mats();
  const soil = useMemo(() => M.plain("#5a3d27", 1), [M]);
  return (
    <group>
      <Pad w={22} d={22} m={M.gravel} y={0.06} />
      {[-6, 0, 6].map((x) => [-5, 3].map((z) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <B s={[4, 0.6, 5]} p={[0, 0.3, 0]} m={M.timber} />
          <B s={[3.7, 0.1, 4.7]} p={[0, 0.62, 0]} m={soil} />
          {[-1, 0, 1].map((k) => <mesh key={k} position={[k, 0.95, 0]} material={M.foliage[(k + 3) % 3]}><icosahedronGeometry args={[0.45, 0]} /></mesh>)}
        </group>
      )))}
      <B s={[3, 2.4, 2.4]} p={[8, 1.2, -9]} m={M.plain("#5c6157")} />
      <Tank p={[4.5, 0, -9]} r={1} h={1.8} />
    </group>
  );
}

function Bakery() {
  const M = mats();
  const wall = useMemo(() => M.brick("#d9a066"), [M]);
  const awning = useMemo(() => M.plain("#b93a32", 0.7), [M]);
  return (
    <group>
      <Pad w={13} d={11} m={M.concrete} />
      <B s={[10, 4, 7]} p={[0, 2, -1.5]} m={wall} />
      <B s={[10, 1.4, 0.3]} p={[0, 4.5, 2]} m={wall} />
      <B s={[7, 2.4, 0.1]} p={[0, 1.3, 2.05]} m={M.glass} />
      <B s={[10.2, 0.08, 2.2]} p={[0, 3.1, 3.1]} m={awning} r={[0.3, 0, 0]} />
      <Sign p={[0, 4.6, 2.2]} w={6} h={0.9} m={M.plain("#3b2a1a")} />
      <B s={[0.8, 2, 0.8]} p={[3.5, 5, -3]} m={M.brick("#8d5a42")} />
    </group>
  );
}

function Motel() {
  const M = mats();
  const wall = useMemo(() => M.brick("#b88a6a"), [M]);
  const doors = useMemo(() => ["#2f6f8f", "#c94f3d", "#3f7d4f"].map((c) => M.plain(c)), [M]);
  return (
    <group>
      <Pad w={40} d={18} m={M.carpark} />
      <B s={[32, 3.2, 8]} p={[-2, 1.6, -4]} m={wall} />
      {Array.from({ length: 10 }, (_, i) => (
        <group key={i} position={[-16.5 + i * 3.2, 0, 0.05]}>
          <B s={[0.9, 2.1, 0.1]} p={[0, 1.05, 0]} m={doors[i % 3]} />
          <B s={[1.2, 1, 0.08]} p={[1.2, 1.6, 0]} m={M.glass} />
        </group>
      ))}
      <Roof kind="skillion" w={33} d={10} h={0.8} p={[-2, 3.2, -3]} m={M.roofs.zinc} o={0.2} r={[0, Math.PI, 0]} />
      <B s={[0.3, 7, 0.3]} p={[17, 3.5, 6]} m={M.metal} />
      <B s={[3.6, 2.2, 0.4]} p={[17, 7.5, 6]} m={M.lamp} />
      <B s={[3.8, 0.3, 0.5]} p={[17, 8.7, 6]} m={M.red} />
      {[-12, -6, 0, 6].map((x, i) => <Car key={x} p={[x, 0, 5.5]} color={["#7f8c8d", "#c0392b", "#ecf0f1", "#2c3e50"][i]} />)}
    </group>
  );
}

function Caravan({ seed }: { seed: number }) {
  const M = mats();
  const vans = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 10 }, (_, i) => ({ x: -26 + (i % 5) * 12, z: i < 5 ? -10 : 10, rot: (r() - 0.5) * 0.3, c: ["#f4f2ec", "#e8e0d2", "#dfe7e4"][i % 3] }));
  }, [seed]);
  const bodies = useMemo(() => ["#f4f2ec", "#e8e0d2", "#dfe7e4"].map((c) => M.plain(c, 0.5)), [M]);
  return (
    <group>
      <Pad w={64} d={44} m={M.grass} y={0.08} />
      <B s={[64, 0.1, 6]} p={[0, 0.12, 0]} m={M.gravel} />
      {vans.map((v, i) => (
        <group key={i} position={[v.x, 0, v.z]} rotation={[0, v.rot, 0]}>
          <B s={[2.4, 2.4, 6]} p={[0, 1.6, 0]} m={bodies[i % 3]} />
          <B s={[2.42, 0.4, 6.02]} p={[0, 1.6, 0]} m={M.blue} />
          <B s={[2.42, 0.6, 1.5]} p={[0, 2, 2.2]} m={M.glass} />
          {[-1.25, 1.25].map((x) => <Cyl key={x} r={0.35} h={0.25} p={[x, 0.35, 0]} rot={[0, 0, Math.PI / 2]} m={M.darkMetal} seg={12} />)}
        </group>
      ))}
      <B s={[10, 3.2, 5]} p={[24, 1.6, 0]} m={M.render("#efe9dd")} />
      <Roof kind="skillion" w={10} d={5} h={0.5} p={[24, 3.2, 0]} m={M.roofs.woodland} o={0.3} />
      <Gum p={[-30, 0, 18]} seed={seed + 1} s={0.8} /><Gum p={[30, 0, -18]} seed={seed + 2} s={0.8} />
    </group>
  );
}

function Hardware() {
  const M = mats();
  return (
    <group>
      <Pad w={44} d={32} m={M.carpark} />
      <B s={[30, 7, 18]} p={[-5, 3.5, -6]} m={M.plain("#d7dbdd", 0.5, 0.3)} />
      <B s={[30.4, 1.8, 18.4]} p={[-5, 7.9, -6]} m={M.plain("#d35400", 0.6)} />
      <B s={[8, 3.5, 0.1]} p={[-5, 1.75, 3.05]} m={M.glass} />
      <Roof kind="skillion" w={10} d={18} h={0.5} p={[16, 5, -6]} m={M.roofs.zinc} o={0} />
      <group position={[16, 0, -6]}><Posts w={9} d={17} h={5} every={4.5} m={M.metal} /></group>
      {[0, 1, 2].map((i) => <B key={i} s={[6, 0.8, 1.2]} p={[16, 0.4 + i * 0.8, -12]} m={M.timber} />)}
      {[-14, -8, 2, 8].map((x, i) => <Car key={x} p={[x, 0, 11]} color={["#ecf0f1", "#7f8c8d", "#c0392b", "#2c3e50"][i]} />)}
    </group>
  );
}

function BigThing() {
  const M = mats();
  const fur = useMemo(() => M.plain("#b5733f", 0.8), [M]);
  return (
    <group>
      <Pad w={14} d={14} m={M.concrete} />
      <B s={[5, 1, 5]} p={[0, 0.5, 0]} m={M.render("#e2d3b3")} />
      <group position={[0, 1, 0]}>
        <mesh position={[0, 4.5, 0]} scale={[1.6, 2.6, 1.4]} material={fur} castShadow><sphereGeometry args={[1.4, 20, 16]} /></mesh>
        <mesh position={[0, 9, 0.8]} scale={[0.9, 1, 1.2]} material={fur} castShadow><sphereGeometry args={[1.1, 16, 12]} /></mesh>
        {[-0.5, 0.5].map((x) => <mesh key={x} position={[x, 10.4, 0.4]} rotation={[0.2, 0, x * 0.4]} material={fur} castShadow><coneGeometry args={[0.3, 1.4, 8]} /></mesh>)}
        <mesh position={[0, 1.2, -2.6]} rotation={[-1.1, 0, 0]} material={fur} castShadow><coneGeometry args={[0.7, 6, 10]} /></mesh>
        {[-1, 1].map((x) => <mesh key={x} position={[x, 0.6, 0.8]} scale={[0.6, 0.4, 2]} material={fur} castShadow><sphereGeometry args={[1, 12, 10]} /></mesh>)}
      </group>
      <Sign p={[0, 0.6, 2.6]} w={4} h={0.6} m={M.red} />
    </group>
  );
}

function Warehouse() {
  const M = mats();
  const clad = useMemo(() => M.plain("#c7ccd1", 0.45, 0.4), [M]);
  const door = useMemo(() => M.plain("#5c6157", 0.5, 0.4), [M]);
  return (
    <group>
      <Pad w={44} d={26} m={M.concrete} />
      <B s={[36, 9, 18]} p={[-2, 4.5, -2]} m={clad} />
      <Roof kind="gable" w={36} d={18} h={1.6} p={[-2, 9, -2]} m={M.roofs.zinc} o={0.3} r={[0, Math.PI / 2, 0]} />
      {[-12, -4, 4].map((x) => <B key={x} s={[5, 5, 0.12]} p={[x, 2.5, 7.05]} m={door} />)}
      <B s={[9, 1.2, 4]} p={[12, 0.6, 9]} m={M.concrete} />
      <group position={[-12, 0, 11]}>
        <B s={[2.5, 3, 3]} p={[0, 1.8, 3]} m={M.blue} />
        <B s={[2.5, 3.2, 8]} p={[0, 2, -2.5]} m={M.white} />
      </group>
    </group>
  );
}

function Workshop() {
  const M = mats();
  const door = useMemo(() => M.plain("#3b3d40", 0.5, 0.4), [M]);
  return (
    <group>
      <Pad w={22} d={16} m={M.concrete} />
      <B s={[16, 5.5, 10]} p={[0, 2.75, -2]} m={M.roofs.woodland} />
      <Roof kind="gable" w={16} d={10} h={1.6} p={[0, 5.5, -2]} m={M.roofs.woodland} o={0.3} r={[0, Math.PI / 2, 0]} />
      <B s={[5, 4, 0.12]} p={[-3, 2, 3.05]} m={door} />
      <B s={[1, 2.1, 0.1]} p={[4, 1.05, 3.05]} m={M.white} />
      <Car p={[3, 0, 6]} color="#8e6b3e" r={0.2} />
    </group>
  );
}

function Silos() {
  const M = mats();
  const steel = useMemo(() => M.plain("#d8d4c8", 0.6, 0.2), [M]);
  return (
    <group>
      <Pad w={26} d={14} m={M.gravel} />
      {[-9, -3, 3, 9].map((x) => (
        <group key={x} position={[x, 0, -1]}>
          <Cyl r={2.8} h={20} p={[0, 10, 0]} m={steel} seg={28} />
          <mesh position={[0, 21, 0]} material={M.metal} castShadow><coneGeometry args={[2.9, 2, 28]} /></mesh>
        </group>
      ))}
      <B s={[22, 1.2, 1.2]} p={[0, 22.3, -1]} m={M.metal} />
      <B s={[1, 24, 1]} p={[12, 12, -1]} m={M.metal} />
      <B s={[1.2, 0.3, 12]} p={[12, 1.5, -4]} m={M.metal} r={[0.12, 0, 0]} />
    </group>
  );
}

function Windmill() {
  const M = mats();
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (wheel.current) wheel.current.rotation.z += dt * 2.2; });
  return (
    <group>
      <Pad w={10} d={10} m={M.gravel} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <B key={i} s={[0.18, 11, 0.18]} p={[x * 1.1, 5.5, z * 1.1]} m={M.metal} r={[z * -0.09, 0, x * 0.09]} />
      ))}
      {[2, 5, 8].map((y) => <B key={y} s={[2.4 - y * 0.18, 0.08, 0.08]} p={[0, y, 1.1 - y * 0.1]} m={M.metal} />)}
      <group ref={wheel} position={[0, 11.2, 0.7]}>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return <B key={i} s={[0.35, 1.6, 0.04]} p={[Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0]} m={M.metal} r={[0, 0.4, a - Math.PI / 2]} />;
        })}
      </group>
      <B s={[0.08, 0.8, 2.6]} p={[0, 11.2, -1.4]} m={M.metal} />
      <Tank p={[3, 0, 2.5]} r={1.8} h={2.4} />
      <B s={[2.8, 0.6, 0.8]} p={[-2.5, 0.3, 2.5]} m={M.concrete} />
    </group>
  );
}

function Battery() {
  const M = mats();
  return (
    <group>
      <Pad w={30} d={16} m={M.gravel} />
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} position={[-10.5 + i * 3, 0, -1]}>
          <B s={[2.4, 2.6, 6]} p={[0, 1.3, 0]} m={M.white} />
          <B s={[2.42, 0.3, 6.02]} p={[0, 2.3, 0]} m={M.green} />
        </group>
      ))}
      <B s={[3, 2.4, 2.4]} p={[12, 1.2, 4]} m={M.metal} />
      <B s={[30, 2, 0.05]} p={[0, 1, 7.8]} m={M.metal} />
    </group>
  );
}

function BusStop() {
  const M = mats();
  return (
    <group>
      <Pad w={8} d={4} m={M.concrete} />
      <B s={[4, 0.1, 1.8]} p={[0, 2.5, -0.4]} m={M.roofs.deepocean} />
      <B s={[4, 2.3, 0.06]} p={[0, 1.3, -1.25]} m={M.clearGlass} />
      {[-1.9, 1.9].map((x) => <B key={x} s={[0.1, 2.5, 0.1]} p={[x, 1.25, -1.2]} m={M.metal} />)}
      <B s={[3, 0.1, 0.5]} p={[0, 0.5, -0.9]} m={M.timber} />
      <B s={[0.08, 2.6, 0.08]} p={[3, 1.3, 1]} m={M.metal} />
      <B s={[0.5, 0.5, 0.05]} p={[3, 2.6, 1]} m={M.yellow} />
    </group>
  );
}

function CarPark() {
  const M = mats();
  return (
    <group>
      <Pad w={32} d={22} m={M.carpark} y={0.08} />
      {[-12, -7, -2, 6, 11].map((x, i) => <Car key={x} p={[x, 0, -6]} color={["#ecf0f1", "#2c3e50", "#c0392b", "#7f8c8d", "#16a085"][i]} />)}
      {[-9, 4, 13].map((x, i) => <Car key={x} p={[x, 0, 6]} color={["#34495e", "#e67e22", "#bdc3c7"][i]} r={Math.PI} />)}
      {[-15, 15].map((x) => <Cyl key={x} r={0.12} h={7} p={[x, 3.5, 0]} m={M.metal} seg={8} />)}
      {[-15, 15].map((x) => <B key={`l${x}`} s={[1.2, 0.3, 0.5]} p={[x, 7, 0]} m={M.lamp} />)}
    </group>
  );
}

function Station() {
  const M = mats();
  const brick = useMemo(() => M.brick("#b36a4c"), [M]);
  return (
    <group>
      <Pad w={60} d={14} m={M.gravel} />
      <B s={[60, 0.3, 3]} p={[0, 0.15, 4.5]} m={M.gravel} />
      {[-0.75, 0.75].map((z) => <B key={z} s={[60, 0.15, 0.12]} p={[0, 0.38, 4.5 + z]} m={M.metal} />)}
      <B s={[50, 1.1, 4]} p={[0, 0.55, 0.5]} m={M.concrete} />
      <B s={[50, 0.05, 0.25]} p={[0, 1.12, 2.3]} m={M.yellow} />
      <group position={[0, 1.1, -3.5]}>
        <B s={[16, 4, 5]} p={[0, 2, 0]} m={brick} />
        <Windows w={16} d={5} floors={1} floorH={4} gap={2.6} ww={1.1} wh={2} />
        <Roof kind="hip" w={16} d={5} h={2} p={[0, 4, 0]} m={M.roofs.manor} o={0.4} />
      </group>
      <Roof kind="skillion" w={26} d={3.2} h={0.4} p={[0, 4.6, 0.2]} m={M.roofs.zinc} o={0} r={[0, Math.PI, 0]} />
      <group position={[0, 1.1, 1.6]}><Posts w={25} d={0.01} h={3.5} every={3.2} m={M.darkMetal} /></group>
      <Sign p={[-18, 3, 0.5]} w={5} h={0.9} m={M.green} />
    </group>
  );
}

function Airstrip() {
  const M = mats();
  const tarmac = useMemo(() => M.plain("#3d3e40", 0.95), [M]);
  const sock = useMemo(() => M.plain("#e8743b"), [M]);
  return (
    <group>
      <B s={[900, 0.12, 40]} p={[0, 0.06, 0]} m={M.grass} />
      <B s={[880, 0.14, 18]} p={[0, 0.08, 0]} m={tarmac} />
      {Array.from({ length: 28 }, (_, i) => <B key={i} s={[16, 0.16, 0.6]} p={[-400 + i * 29, 0.1, 0]} m={M.white} />)}
      {[-1, 1].map((s) => Array.from({ length: 6 }, (_, i) => <B key={`${s}${i}`} s={[1.2, 0.16, 16]} p={[s * (430 - i * 3), 0.1, 0]} m={M.white} />))}
      <group position={[-380, 0, -14]}>
        <B s={[24, 7, 14]} p={[0, 3.5, 0]} m={M.metal} />
        <Roof kind="gable" w={24} d={14} h={2} p={[0, 7, 0]} m={M.roofs.zinc} o={0.3} r={[0, Math.PI / 2, 0]} />
        <B s={[0.1, 8, 0.1]} p={[16, 4, 4]} m={M.metal} />
        <mesh position={[16, 7.6, 5]} rotation={[Math.PI / 2, 0, 0]} material={sock}><coneGeometry args={[0.5, 2, 8, 1, true]} /></mesh>
      </group>
      <group position={[-350, 0, -6]} rotation={[0, 0.3, 0]}>
        <B s={[1.4, 1.2, 8]} p={[0, 1.2, 0]} m={M.white} />
        <B s={[11, 0.15, 1.6]} p={[0, 1.8, 0.6]} m={M.white} />
        <B s={[4, 0.1, 1]} p={[0, 1.4, -3.6]} m={M.white} />
        <B s={[0.1, 1.6, 1]} p={[0, 2.2, -3.6]} m={M.red} />
      </group>
    </group>
  );
}

export function ExtraModel({ type, seed }: { type: ItemType; seed: number }): ReactNode {
  switch (type) {
    case "agedcare": return <AgedCare />;
    case "highschool": return <HighSchool />;
    case "childcare": return <Childcare />;
    case "church": return <Church />;
    case "playground": return <Playground />;
    case "skatepark": return <Skatepark />;
    case "pool": return <Pool />;
    case "garden": return <Garden />;
    case "bakery": return <Bakery />;
    case "motel": return <Motel />;
    case "caravan": return <Caravan seed={seed} />;
    case "hardware": return <Hardware />;
    case "bigthing": return <BigThing />;
    case "warehouse": return <Warehouse />;
    case "workshop": return <Workshop />;
    case "silos": return <Silos />;
    case "windmill": return <Windmill />;
    case "battery": return <Battery />;
    case "busstop": return <BusStop />;
    case "carpark": return <CarPark />;
    case "station": return <Station />;
    case "airstrip": return <Airstrip />;
    default: return <FunModel type={type} seed={seed} />;
  }
}
