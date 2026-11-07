"use client";

// three.js objects (camera, scene, lights) are mutable by design in react-three-fiber.
/* eslint-disable react-hooks/immutability, react-hooks/purity */

import { Bvh, Detailed, Html, MapControls, Sky, Stars } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { CATALOG_BY_TYPE, ROADS, type Category, type ItemType, type RoadType } from "./catalog";
import { blockLayout, toLocal, toWorld, type Frame, type LotFill } from "./layout";
import FirstPerson from "./FirstPerson";
import { GRID, ribbon, smoothPath, type Boundary, type Junction, type JunctionType, type Placed, type Road } from "./geometry";
import BoundaryMesh, { type BoundaryHandle } from "./Boundary";
import Junctions from "./Junctions";
import Life from "./Life";
import StreetSigns from "./StreetSigns";
import { mats, setNight } from "./materials";
import { boxGeo, Model } from "./models";
import type { TerrainData } from "./terrain";

export type Tool =
  | { kind: "item"; type: ItemType }
  | { kind: "move"; type: ItemType; id: number }
  | { kind: "road"; type: RoadType }
  | { kind: "junction"; type: Exclude<JunctionType, "plain"> }
  | { kind: "block"; fill: LotFill; streets: boolean }
  | null;

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
  junctions: Junction[];
  junctionTypes: Record<string, JunctionType>;
  selectedJunction: string | null;
  onJunctionClick: (key: string) => void;
  grid: boolean;
  snapItemPos: (type: ItemType, x: number, z: number) => [number, number];
  snapRoadPos: (x: number, z: number) => [number, number];
  selectedRoadId: number | null;
  onRoadClick: (id: number) => void;
  alive: boolean;
  people: number;
  curvy: boolean;
  boundary: Boundary | null;
  editBoundary: boolean;
  boundaryDragging: boolean;
  onBoundaryDragStart: (kind: BoundaryHandle, x: number, z: number) => void;
  onBoundaryDrag: (x: number, z: number) => void;
  onCapture: (fn: () => string) => void;
  lots: [number, number][][];
  frame: Frame;
  blockStart: [number, number] | null;
  onBlockPoint: (x: number, z: number) => void;
  reveal: { minId: number; cx: number; cz: number } | null;
}

function sunDir(hour: number) {
  const e = Math.sin(((hour - 6) / 12) * Math.PI) * THREE.MathUtils.degToRad(68);
  const az = ((12 - hour) / 6) * (Math.PI / 2);
  return new THREE.Vector3(Math.cos(e) * Math.sin(az), Math.sin(e), -Math.cos(e) * Math.cos(az) * 0.7 - 0.3).normalize();
}

// ---------- Terrain ----------
function TerrainMesh({ t, grid, cursor, onPointerMove, onClick, onDoubleClick, onContextMenu, onPointerLeave }: {
  t: TerrainData;
  grid: boolean;
  cursor: { x: number; z: number } | null;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
  onPointerLeave: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const gridUniforms = useMemo(() => ({ uGrid: { value: 0 }, uCursor: { value: new THREE.Vector2() }, uSize: { value: GRID } }), []);
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
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    // Placement grid drawn in the terrain shader: fine lines every GRID metres, bold every 5,
    // fading out away from the cursor.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uGrid = gridUniforms.uGrid;
      shader.uniforms.uCursor = gridUniforms.uCursor;
      shader.uniforms.uSize = gridUniforms.uSize;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGridPos;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvGridPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGridPos;\nuniform float uGrid;\nuniform vec2 uCursor;\nuniform float uSize;")
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
          if (uGrid > 0.5) {
            vec2 c = vGridPos.xz / uSize;
            vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
            float minor = 1.0 - min(min(g.x, g.y), 1.0);
            vec2 c5 = c / 5.0;
            vec2 g5 = abs(fract(c5 - 0.5) - 0.5) / fwidth(c5);
            float major = 1.0 - min(min(g5.x, g5.y), 1.0);
            float fade = 1.0 - smoothstep(70.0, 320.0, distance(vGridPos.xz, uCursor));
            float a = max(minor * 0.3, major * 0.7) * fade;
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), a);
          }`);
    };
    return {
      geometry: g,
      material,
      outer: { min, color: new THREE.Color(`rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`) },
    };
  }, [t, gl, gridUniforms]);

  gridUniforms.uGrid.value = grid ? 1 : 0;
  if (cursor) gridUniforms.uCursor.value.set(cursor.x, cursor.z);

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
// Simple stand-in boxes for buildings far from the camera (keeps big towns smooth).
// Full models out to this distance; HQ keeps them almost all the way to the max zoom-out (7 km).
const LOD_DIST = { fast: 1400, hq: 6500 };
const NO_LOD = new Set<ItemType>(["wind", "oval", "solar", "airstrip", "park", "trees", "garden", "carpark", "busstop", "playground", "skatepark", "pool", "wavepark", "harbour", "golf", "minigolf", "karts", "drivein", "zoo"]);
const LOD_COLOR: Record<Category, string> = { Housing: "#d9cdb8", Community: "#d6dbe0", Commercial: "#d8c7b0", Industry: "#b9bfc5", Utilities: "#c9d1d3", Transport: "#c4c0b8", Fun: "#e8b4c8", Nature: "#6f7f45" };
const LOD_HEIGHT: Partial<Record<ItemType, number>> = { apartments: 13, townhouses: 8, hospital: 12, highschool: 7, silos: 22, watertower: 26, telecom: 30, warehouse: 9, supermarket: 8, waterpark: 14, themepark: 30, ferris: 40 };
const lodMats = new Map<Category, THREE.MeshStandardMaterial>();
const lodMat = (c: Category) => {
  let m = lodMats.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: LOD_COLOR[c], roughness: 0.85 }); lodMats.set(c, m); }
  return m;
};

const PlacedItem = memo(function PlacedItem({ p, selected, onSelect, interactive, hidden, delay = 0, lod }: { p: Placed; selected: boolean; onSelect: (id: number) => void; interactive: boolean; hidden?: boolean; delay?: number; lod: number }) {
  const g = useRef<THREE.Group>(null);
  const born = useRef(performance.now() + delay);
  const { w, d, category } = CATALOG_BY_TYPE[p.type];
  useFrame(() => {
    if (!g.current) return;
    const t = Math.max(0, Math.min(1, (performance.now() - born.current) / 650));
    // Elastic drop-in
    const s = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 4.5);
    g.current.scale.setScalar(Math.max(0.001, s));
    g.current.position.y = p.base + (1 - Math.min(1, t * 1.6)) * 12;
  });
  const plinth = p.base - p.minH;
  const M = mats();
  return (
    <group
      ref={g} position={[p.x, p.base, p.z]} rotation={[0, p.rot, 0]} visible={!hidden}
      onClick={interactive ? (e) => { if (e.delta > 5) return; e.stopPropagation(); onSelect(p.id); } : undefined}
    >
      {plinth > 0.15 && <mesh geometry={boxGeo(w, plinth + 0.3, d)} position={[0, -(plinth + 0.3) / 2, 0]} material={M.concrete} castShadow receiveShadow />}
      {NO_LOD.has(p.type) ? (
        <Model type={p.type} seed={p.id} />
      ) : (
        <Detailed distances={[0, lod]}>
          <group><Model type={p.type} seed={p.id} /></group>
          <mesh geometry={boxGeo(w * 0.8, LOD_HEIGHT[p.type] ?? 5, d * 0.75)} position={[0, (LOD_HEIGHT[p.type] ?? 5) / 2, 0]} material={lodMat(category)} />
        </Detailed>
      )}
      {selected && (
        <mesh geometry={boxGeo(w + 1.5, 0.4, d + 1.5)} position={[0, 0.2, 0]} material={M.selected} />
      )}
    </group>
  );
});

// ---------- Roads ----------
const RoadMesh = memo(function RoadMesh({ t, road, draft, selected, onClick }: { t: TerrainData; road: Road; draft?: boolean; selected?: boolean; onClick?: (id: number) => void }) {
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
  const highlight = useMemo(
    () => (selected && road.pts.length >= 2 ? ribbon(t, road.pts, ROADS[road.type].width + (road.type === "main" ? 6 : 2), 0, 0.85) : null),
    [selected, t, road],
  );
  const click = onClick ? (e: ThreeEvent<MouseEvent>) => { if (e.delta > 5) return; e.stopPropagation(); onClick(road.id); } : undefined;
  return (
    <>
      {parts.map((p, i) => <mesh key={i} geometry={p.g} material={draft ? M.ghostOk : p.m} receiveShadow onClick={click} />)}
      {highlight && <mesh geometry={highlight} material={M.selected} />}
    </>
  );
});

// ---------- Lot boundaries (one merged mesh for all of them) ----------
let lotMat: THREE.MeshBasicMaterial | null = null;
const LotLines = memo(function LotLines({ t, lots, ghost }: { t: TerrainData; lots: [number, number][][]; ghost?: boolean }) {
  const geo = useMemo(() => {
    if (!lots.length) return null;
    const parts = lots.map((poly) => ribbon(t, [...poly, poly[0]], ghost ? 0.6 : 0.3, 0, 0.45, 1, true));
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    return merged;
  }, [t, lots, ghost]);
  useEffect(() => () => geo?.dispose(), [geo]);
  lotMat ??= new THREE.MeshBasicMaterial({ color: "#f5f1e6", transparent: true, opacity: 0.6, depthWrite: false });
  return geo ? <mesh geometry={geo} material={ghost ? mats().ghostOk : lotMat} /> : null;
});

/** Live preview while dragging out a block of lots. */
function BlockPreview({ t, frame, a, b, fill, streets }: { t: TerrainData; frame: Frame; a: [number, number]; b: [number, number]; fill: LotFill; streets: boolean }) {
  const [u0, v0] = toLocal(frame, a[0], a[1]);
  const [u1, v1] = toLocal(frame, b[0], b[1]);
  const lay = useMemo(
    () => blockLayout(frame, Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1), fill, streets ? "sealed" : null),
    [frame, u0, v0, u1, v1, fill, streets],
  );
  const ring = useMemo(() => {
    const cs = [toWorld(frame, Math.min(u0, u1), Math.min(v0, v1)), toWorld(frame, Math.max(u0, u1), Math.min(v0, v1)), toWorld(frame, Math.max(u0, u1), Math.max(v0, v1)), toWorld(frame, Math.min(u0, u1), Math.max(v0, v1))];
    return ribbon(t, [...cs, cs[0]], streets ? 8 : 1, 0, 0.5, 1, true);
  }, [t, frame, u0, v0, u1, v1, streets]);
  useEffect(() => () => ring.dispose(), [ring]);
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return (
    <>
      <mesh geometry={ring} material={mats().ghostOk} />
      <LotLines t={t} lots={lay.lots} ghost />
      <Html position={[mid[0], t.heightAt(mid[0], mid[1]) + 12, mid[1]]} center style={{ pointerEvents: "none" }}>
        <div style={{ background: "rgba(10,20,15,.85)", color: "white", padding: "4px 10px", borderRadius: 999, font: "600 12px system-ui", whiteSpace: "nowrap" }}>
          {Math.round(Math.abs(u1 - u0))} × {Math.round(Math.abs(v1 - v0))} m · {lay.lots.length} lots · {lay.people} people
        </div>
      </Html>
    </>
  );
}

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
  const { terrain: t, tool, rot, validate, onPlace, onRoadPoint, onFinishRoad, onSelect, onHoverInfo, draftRoad, mode, grid, snapItemPos, snapRoadPos } = props;
  const [raw, setRaw] = useState<{ x: number; z: number } | null>(null);
  // Snap the cursor to the grid / nearby roads before previewing or placing.
  const hover = useMemo(() => {
    if (!raw) return null;
    if (tool?.kind === "item" || tool?.kind === "move") { const [x, z] = snapItemPos(tool.type, raw.x, raw.z); return { x, z }; }
    if (tool?.kind === "road") { const [x, z] = snapRoadPos(raw.x, raw.z); return { x, z }; }
    if (tool?.kind === "block" && grid) { const g = 5; return { x: Math.round(raw.x / g) * g, z: Math.round(raw.z / g) * g }; }
    return raw;
  }, [raw, tool, snapItemPos, snapRoadPos, grid]);
  const placing = tool?.kind === "item" || tool?.kind === "move" ? tool : null;
  const v = placing && hover ? validate(placing.type, hover.x, hover.z, rot) : null;
  useEffect(() => { onHoverInfo(v ? { ok: v.ok, reason: v.reason } : null); }, [v?.ok, v?.reason]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = useMemo<Road | null>(() => {
    if (tool?.kind !== "road" || !draftRoad.length) return null;
    const pts: [number, number][] = hover ? [...draftRoad, [hover.x, hover.z]] : draftRoad;
    return { id: -1, type: tool.type, name: "", pts: props.curvy ? smoothPath(pts) : pts };
  }, [tool, draftRoad, hover, props.curvy]);

  return (
    <>
      <TerrainMesh
        t={t} grid={grid && mode === "build"} cursor={raw}
        onPointerMove={(e) => {
          if (props.boundaryDragging) { props.onBoundaryDrag(e.point.x, e.point.z); return; }
          if (mode === "build" && (tool || grid)) setRaw({ x: e.point.x, z: e.point.z });
        }}
        onPointerLeave={() => setRaw(null)}
        onClick={(e) => {
          if (mode !== "build" || e.delta > 5) return;
          if (placing && hover) onPlace(hover.x, hover.z);
          else if (tool?.kind === "road" && hover) onRoadPoint(hover.x, hover.z);
          else if (tool?.kind === "block" && hover) props.onBlockPoint(hover.x, hover.z);
          else onSelect(null);
        }}
        onDoubleClick={() => { if (tool?.kind === "road") onFinishRoad(); }}
        onContextMenu={(e) => { e.nativeEvent.preventDefault(); if (tool?.kind === "road") onFinishRoad(); }}
      />
      {placing && hover && v && mode === "build" && <Ghost type={placing.type} x={hover.x} z={hover.z} rot={rot} base={v.base} ok={v.ok} />}
      {draft && draft.pts.length >= 2 && <RoadMesh t={t} road={draft} draft />}
      {tool?.kind === "block" && props.blockStart && hover && (
        <BlockPreview t={t} frame={props.frame} a={props.blockStart} b={[hover.x, hover.z]} fill={tool.fill} streets={tool.streets} />
      )}
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
      {roads.map((r) => (
        <RoadMesh key={r.id} t={t} road={r} selected={props.selectedRoadId === r.id} onClick={mode === "build" && !tool ? props.onRoadClick : undefined} />
      ))}
      <StreetSigns t={t} roads={roads} />
      <LotLines t={t} lots={props.lots} />
      {props.boundary && <BoundaryMesh t={t} b={props.boundary} editing={props.editBoundary && mode === "build"} onDragStart={props.onBoundaryDragStart} />}
      <CaptureBridge onCapture={props.onCapture} />
      {props.alive && <Life t={t} placed={placed} roads={roads} junctionTypes={props.junctionTypes} people={props.people} hour={hour} />}
      <Junctions
        t={t} junctions={props.junctions} types={props.junctionTypes}
        highlight={mode === "build" && tool?.kind === "junction"} selected={props.selectedJunction}
        onClick={mode === "build" && (!tool || tool.kind === "junction") ? props.onJunctionClick : undefined}
      />
      {placed.map((p) => (
        <PlacedItem
          key={p.id} p={p} lod={props.quality ? LOD_DIST.hq : LOD_DIST.fast} selected={p.id === selectedId} onSelect={onSelect} interactive={mode === "build" && !tool} hidden={tool?.kind === "move" && tool.id === p.id}
          delay={props.reveal && p.id >= props.reveal.minId ? Math.min(2600, Math.hypot(p.x - props.reveal.cx, p.z - props.reveal.cz) * 2.2) : 0}
        />
      ))}
      {mode === "build" ? (
        <BuildCamera focus={focus} enabled={!props.boundaryDragging} />
      ) : (
        <FirstPerson terrain={t} collide={props.collide} focus={focus} onExit={props.onExitWalk} onState={props.onWalkState} onPause={props.onWalkPause} />
      )}
    </>
  );
}

/** Lets the page grab a screenshot of the 3D view (for the report). */
function CaptureBridge({ onCapture }: { onCapture: (fn: () => string) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onCapture(() => { gl.render(scene, camera); return gl.domElement.toDataURL("image/jpeg", 0.88); });
  }, [gl, scene, camera, onCapture]);
  return null;
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
