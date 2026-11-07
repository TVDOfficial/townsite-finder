"use client";

// three.js objects (camera, scene, lights) are mutable by design in react-three-fiber.
/* eslint-disable react-hooks/immutability, react-hooks/purity */

import { Bvh, MapControls, Sky, Stars } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { CATALOG_BY_TYPE, ROADS, type ItemType, type RoadType } from "./catalog";
import FirstPerson from "./FirstPerson";
import { ribbon, type Placed, type Road } from "./geometry";
import { mats, setNight } from "./materials";
import { boxGeo, Model } from "./models";
import type { TerrainData } from "./terrain";

export type Tool = { kind: "item"; type: ItemType } | { kind: "road"; type: RoadType } | null;

export interface SceneProps {
  terrain: TerrainData;
  placed: Placed[];
  roads: Road[];
  draftRoad: [number, number][];
  tool: Tool;
  rot: number;
  selectedId: number | null;
  hour: number;
  quality: boolean;
  mode: "build" | "walk";
  validate: (type: ItemType, x: number, z: number, rot: number) => { ok: boolean; base: number; reason?: string };
  collide: (x: number, z: number, r: number) => [number, number];
  onPlace: (x: number, z: number) => void;
  onRoadPoint: (x: number, z: number) => void;
  onFinishRoad: () => void;
  onSelect: (id: number | null) => void;
  onHoverInfo: (info: { reason?: string; ok: boolean } | null) => void;
  onExitWalk: () => void;
  onWalkState: (s: { flying: boolean; speed: number; alt: number; locked: boolean }) => void;
  onWalkPause: () => void;
}

function sunDir(hour: number) {
  const e = Math.sin(((hour - 6) / 12) * Math.PI) * THREE.MathUtils.degToRad(68);
  const az = ((12 - hour) / 6) * (Math.PI / 2);
  return new THREE.Vector3(Math.cos(e) * Math.sin(az), Math.sin(e), -Math.cos(e) * Math.cos(az) * 0.7 - 0.3).normalize();
}

// ---------- Terrain ----------
function TerrainMesh({ t, onPointerMove, onClick, onDoubleClick, onContextMenu, onPointerLeave }: {
  t: TerrainData;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
  onPointerLeave: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const { geometry, material, outer } = useMemo(() => {
    const seg = 383;
    const g = new THREE.PlaneGeometry(t.size, t.size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    let min = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const h = t.heightAt(pos.getX(i) + t.center[0], pos.getZ(i) + t.center[1]);
      pos.setY(i, h);
      min = Math.min(min, h);
    }
    g.computeVertexNormals();
    const tex = new THREE.CanvasTexture(t.image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    // Average colour of the imagery, for the ground beyond the edges.
    const c = t.image.getContext("2d")!.getImageData(0, 0, t.image.width, t.image.height).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < c.length; i += 4 * 997) { r += c[i]; gg += c[i + 1]; b += c[i + 2]; n++; }
    return {
      geometry: g,
      material: new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
      outer: { min, color: new THREE.Color(`rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`) },
    };
  }, [t, gl]);

  return (
    <>
      <Bvh firstHitOnly>
        <mesh
          geometry={geometry} material={material} position={[t.center[0], 0, t.center[1]]} receiveShadow
          onPointerMove={onPointerMove} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} onPointerLeave={onPointerLeave}
        />
      </Bvh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[t.center[0], outer.min - 3, t.center[1]]}>
        <planeGeometry args={[80000, 80000]} />
        <meshStandardMaterial color={outer.color} roughness={1} />
      </mesh>
    </>
  );
}

// ---------- Placed buildings ----------
const PlacedItem = memo(function PlacedItem({ p, selected, onSelect, interactive }: { p: Placed; selected: boolean; onSelect: (id: number) => void; interactive: boolean }) {
  const g = useRef<THREE.Group>(null);
  const born = useRef(performance.now());
  const { w, d } = CATALOG_BY_TYPE[p.type];
  useFrame(() => {
    if (!g.current) return;
    const t = Math.min(1, (performance.now() - born.current) / 650);
    // Elastic drop-in
    const s = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 4.5);
    g.current.scale.setScalar(Math.max(0.001, s));
    g.current.position.y = p.base + (1 - Math.min(1, t * 1.6)) * 12;
  });
  const plinth = p.base - p.minH;
  const M = mats();
  return (
    <group
      ref={g} position={[p.x, p.base, p.z]} rotation={[0, p.rot, 0]}
      onClick={interactive ? (e) => { if (e.delta > 5) return; e.stopPropagation(); onSelect(p.id); } : undefined}
    >
      {plinth > 0.15 && <mesh geometry={boxGeo(w, plinth + 0.3, d)} position={[0, -(plinth + 0.3) / 2, 0]} material={M.concrete} castShadow receiveShadow />}
      <Model type={p.type} seed={p.id} />
      {selected && (
        <mesh geometry={boxGeo(w + 1.5, 0.4, d + 1.5)} position={[0, 0.2, 0]} material={M.selected} />
      )}
    </group>
  );
});

// ---------- Roads ----------
const RoadMesh = memo(function RoadMesh({ t, road, draft }: { t: TerrainData; road: Road; draft?: boolean }) {
  const M = mats();
  const parts = useMemo(() => {
    if (road.pts.length < 2) return [];
    const spec = ROADS[road.type];
    const lift = 0.3 + (road.id % 7) * 0.015;
    if (road.type === "gravel") return [{ g: ribbon(t, road.pts, spec.width, 0, lift, 1, true), m: M.gravel }];
    if (road.type === "sealed") return [{ g: ribbon(t, road.pts, spec.width, 0, lift), m: M.asphalt }];
    return [
      { g: ribbon(t, road.pts, 10, 0, lift), m: M.asphalt },
      { g: ribbon(t, road.pts, 2, 6, lift + 0.15, 1, true), m: M.concrete },
      { g: ribbon(t, road.pts, 2, -6, lift + 0.15, 1, true), m: M.concrete },
    ];
  }, [t, road, M]);
  useEffect(() => () => parts.forEach((p) => p.g.dispose()), [parts]);
  return <>{parts.map((p, i) => <mesh key={i} geometry={p.g} material={draft ? M.ghostOk : p.m} receiveShadow />)}</>;
});

// ---------- Ghost preview ----------
function Ghost({ type, x, z, rot, base, ok }: { type: ItemType; x: number; z: number; rot: number; base: number; ok: boolean }) {
  const g = useRef<THREE.Group>(null);
  const { w, d } = CATALOG_BY_TYPE[type];
  useFrame(({ clock }) => { if (g.current) g.current.position.y = 1.2 + Math.sin(clock.elapsedTime * 3) * 0.5; });
  const M = mats();
  return (
    <group position={[x, base, z]} rotation={[0, rot, 0]}>
      <mesh geometry={boxGeo(w, 0.25, d)} position={[0, 0.2, 0]} material={ok ? M.ghostOk : M.ghostBad} />
      <group ref={g} position={[0, 1.2, 0]}>
        <Model type={type} seed={7} />
      </group>
    </group>
  );
}

// ---------- Sun, sky, lights ----------
function Lighting({ hour, focus }: { hour: number; focus: React.RefObject<THREE.Vector3> }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const dir = useMemo(() => sunDir(hour), [hour]);
  const day = THREE.MathUtils.clamp(dir.y * 3, 0, 1);
  const night = 1 - THREE.MathUtils.clamp((dir.y + 0.08) * 6, 0, 1);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  // Soft studio reflections for glass and metal (built into three, no download).
  useEffect(() => {
    try {
      const pm = new THREE.PMREMGenerator(gl);
      const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = env;
      scene.environmentIntensity = 0.35;
      pm.dispose();
      return () => { env.dispose(); scene.environment = null; };
    } catch {
      return;
    }
  }, [gl, scene]);
  useEffect(() => {
    setNight(night);
    const fogCol = new THREE.Color().lerpColors(new THREE.Color("#0b1020"), new THREE.Color("#c9d6e3"), day);
    scene.fog = new THREE.Fog(fogCol, 2500, 12000);
  }, [night, day, scene]);
  useFrame(() => {
    if (!light.current || !focus.current) return;
    light.current.position.copy(focus.current).addScaledVector(dir, 900);
    light.current.target.position.copy(focus.current);
    light.current.target.updateMatrixWorld();
  });
  return (
    <>
      <Sky sunPosition={dir.clone().multiplyScalar(1000).toArray()} turbidity={day > 0.2 ? 2.5 : 8} rayleigh={day > 0.2 ? 0.7 : 3} mieCoefficient={0.004} mieDirectionalG={0.85} distance={45000} />
      {night > 0.3 && <Stars radius={20000} depth={100} count={6000} factor={200} fade speed={0.4} />}
      <hemisphereLight args={["#cfe3ff", "#6b5a40", 0.25 + day * 0.55]} />
      <ambientLight intensity={0.08 + night * 0.12} color={night > 0.5 ? "#6a7fb8" : "#ffffff"} />
      <directionalLight
        ref={light} castShadow intensity={day * 3.2} color={dir.y < 0.25 ? "#ffc58a" : "#fff6e8"}
        shadow-mapSize={[4096, 4096]} shadow-bias={-0.0004} shadow-normalBias={0.6}
        shadow-camera-left={-260} shadow-camera-right={260} shadow-camera-top={260} shadow-camera-bottom={-260}
        shadow-camera-near={10} shadow-camera-far={2500}
      />
    </>
  );
}

// ---------- Camera intro + build controls ----------
let introPlayed = false;
function BuildCamera({ focus, enabled }: { focus: React.RefObject<THREE.Vector3>; enabled: boolean }) {
  const controls = useRef<MapControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const intro = useRef({ start: performance.now(), done: introPlayed });
  // Coming back from walk mode: hover above where the walker was.
  useEffect(() => {
    if (!introPlayed || !controls.current || !focus.current) return;
    const f = focus.current;
    controls.current.target.copy(f);
    camera.position.set(f.x - 120, f.y + 160, f.z + 200);
    controls.current.update();
  }, [camera, focus]);
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    if (!intro.current.done) {
      const t = Math.min(1, (performance.now() - intro.current.start) / 3800);
      const e = 1 - Math.pow(1 - t, 4);
      const from = new THREE.Vector3(-2500, 4200, 3800), to = new THREE.Vector3(-110, 120, 190);
      camera.position.lerpVectors(from, to, e);
      c.target.set(0, 0, 0);
      if (t === 1) intro.current.done = introPlayed = true;
    }
    focus.current?.copy(c.target);
  });
  return (
    <MapControls
      ref={controls} enabled={enabled} makeDefault enableDamping dampingFactor={0.08}
      minDistance={15} maxDistance={7000} maxPolarAngle={Math.PI / 2.08} screenSpacePanning={false}
      zoomSpeed={1.4} zoomToCursor
    />
  );
}

function InteractionLayer(props: SceneProps) {
  const { terrain: t, tool, rot, validate, onPlace, onRoadPoint, onFinishRoad, onSelect, onHoverInfo, draftRoad, mode } = props;
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const v = tool?.kind === "item" && hover ? validate(tool.type, hover.x, hover.z, rot) : null;
  useEffect(() => { onHoverInfo(v ? { ok: v.ok, reason: v.reason } : null); }, [v?.ok, v?.reason]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = useMemo<Road | null>(() => {
    if (tool?.kind !== "road" || !draftRoad.length) return null;
    return { id: -1, type: tool.type, pts: hover ? [...draftRoad, [hover.x, hover.z]] : draftRoad };
  }, [tool, draftRoad, hover]);

  return (
    <>
      <TerrainMesh
        t={t}
        onPointerMove={(e) => { if (mode === "build" && tool) setHover({ x: e.point.x, z: e.point.z }); }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          if (mode !== "build" || e.delta > 5) return;
          if (tool?.kind === "item") onPlace(e.point.x, e.point.z);
          else if (tool?.kind === "road") onRoadPoint(e.point.x, e.point.z);
          else onSelect(null);
        }}
        onDoubleClick={() => { if (tool?.kind === "road") onFinishRoad(); }}
        onContextMenu={(e) => { e.nativeEvent.preventDefault(); if (tool?.kind === "road") onFinishRoad(); }}
      />
      {tool?.kind === "item" && hover && v && mode === "build" && <Ghost type={tool.type} x={hover.x} z={hover.z} rot={rot} base={v.base} ok={v.ok} />}
      {draft && draft.pts.length >= 2 && <RoadMesh t={t} road={draft} draft />}
      {tool?.kind === "road" && hover && (
        <mesh position={[hover.x, t.heightAt(hover.x, hover.z) + 1, hover.z]}>
          <sphereGeometry args={[2.5, 16, 16]} />
          <meshBasicMaterial color="#2ccf93" transparent opacity={0.7} />
        </mesh>
      )}
    </>
  );
}

function World(props: SceneProps) {
  const { terrain: t, placed, roads, selectedId, onSelect, hour, mode, tool } = props;
  const focus = useRef(new THREE.Vector3());
  return (
    <>
      <Lighting hour={hour} focus={focus} />
      <InteractionLayer {...props} />
      {roads.map((r) => <RoadMesh key={r.id} t={t} road={r} />)}
      {placed.map((p) => <PlacedItem key={p.id} p={p} selected={p.id === selectedId} onSelect={onSelect} interactive={mode === "build" && !tool} />)}
      {mode === "build" ? (
        <BuildCamera focus={focus} enabled />
      ) : (
        <FirstPerson terrain={t} collide={props.collide} focus={focus} onExit={props.onExitWalk} onState={props.onWalkState} onPause={props.onWalkPause} />
      )}
    </>
  );
}

export default function Scene(props: SceneProps) {
  return (
    <Canvas
      key={props.quality ? "hq" : "fast"}
      shadows={props.quality ? "soft" : false}
      dpr={props.quality ? [1, 2] : 1}
      camera={{ position: [-2500, 4200, 3800], fov: 50, near: 0.5, far: 60000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: props.tool ? "crosshair" : "grab" }}
    >
      <Suspense fallback={null}>
        <World {...props} />
      </Suspense>
    </Canvas>
  );
}
