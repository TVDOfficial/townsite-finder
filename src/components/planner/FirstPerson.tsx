"use client";

// three.js objects (camera, scene, lights) are mutable by design in react-three-fiber.
/* eslint-disable react-hooks/immutability */

import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import type { TerrainData } from "./terrain";

const EYE = 1.7;
const GRAVITY = 24;

interface Props {
  terrain: TerrainData;
  collide: (x: number, z: number, r: number) => [number, number];
  focus: React.RefObject<THREE.Vector3>;
  onExit: () => void;
  onState: (s: { flying: boolean; speed: number; alt: number; locked: boolean }) => void;
  onPause: () => void;
}

/** Walk around the town, or press F to fly like a superhero. */
export default function FirstPerson({ terrain: t, collide, focus, onState, onPause }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  const controls = useRef<PointerLockControlsImpl>(null);
  const keys = useRef<Record<string, boolean>>({});
  const vel = useRef(new THREE.Vector3());
  const vy = useRef(0);
  const flying = useRef(false);
  const grounded = useRef(true);
  const lastReport = useRef(0);
  const locked = useRef(false);

  useEffect(() => {
    const f = focus.current ?? new THREE.Vector3();
    camera.position.set(f.x, t.heightAt(f.x, f.z) + EYE, f.z + 30);
    camera.rotation.set(0, 0, 0, "YXZ");
    camera.lookAt(f.x, t.heightAt(f.x, f.z) + EYE, f.z);
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === "KeyF") {
        flying.current = !flying.current;
        vy.current = 0;
        if (flying.current) vel.current.y = 8; // little hop into the air
      }
      if (e.code === "Space") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    // Fallback when pointer lock isn't available: click-and-drag to look around.
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const drag = (e: PointerEvent) => {
      if (locked.current || !(e.buttons & 1)) return;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= e.movementX * 0.004;
      euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.004, -1.5, 1.5);
      camera.quaternion.setFromEuler(euler);
    };
    dom.addEventListener("pointermove", drag);
    // Lock the pointer straight away (the "Walk around" click counts as the user gesture).
    const id = setTimeout(() => { try { controls.current?.lock(); } catch {} }, 50);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      dom.removeEventListener("pointermove", drag);
      camera.fov = 50;
      camera.updateProjectionMatrix();
    };
  }, [camera, t, focus, dom]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;
    const boost = k.ShiftLeft || k.ShiftRight;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const inputF = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const inputR = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const pos = camera.position;
    const ground = t.heightAt(pos.x, pos.z);

    if (flying.current) {
      const speed = boost ? 320 : 45;
      const want = new THREE.Vector3()
        .addScaledVector(fwd, inputF)
        .addScaledVector(right, inputR)
        .addScaledVector(camera.up, (k.Space ? 1 : 0) - (k.KeyC || k.ControlLeft || k.KeyQ ? 1 : 0));
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
      vel.current.lerp(want, 1 - Math.exp(-dt * (boost ? 2.2 : 4)));
      pos.addScaledVector(vel.current, dt);
      pos.y = Math.max(pos.y, t.heightAt(pos.x, pos.z) + 1.5);
    } else {
      const speed = boost ? 11 : 5;
      const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      const want = new THREE.Vector3().addScaledVector(flat, inputF).addScaledVector(right, inputR);
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
      vel.current.lerp(new THREE.Vector3(want.x, 0, want.z), 1 - Math.exp(-dt * 10));
      pos.x += vel.current.x * dt;
      pos.z += vel.current.z * dt;
      const [cx, cz] = collide(pos.x, pos.z, 0.5);
      pos.x = cx; pos.z = cz;
      if (k.Space && grounded.current) { vy.current = 7.5; grounded.current = false; }
      vy.current -= GRAVITY * dt;
      pos.y += vy.current * dt;
      const floor = t.heightAt(pos.x, pos.z) + EYE;
      if (pos.y <= floor) { pos.y = floor; vy.current = 0; grounded.current = true; }
    }

    // Stay inside the loaded terrain.
    const half = t.size / 2 - 30;
    pos.x = THREE.MathUtils.clamp(pos.x, t.center[0] - half, t.center[0] + half);
    pos.z = THREE.MathUtils.clamp(pos.z, t.center[1] - half, t.center[1] + half);

    // Superhero FOV kick when going fast.
    const sp = vel.current.length();
    const targetFov = flying.current ? 65 + Math.min(30, sp / 10) : boost && sp > 6 ? 76 : 70;
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();

    focus.current?.copy(pos);
    const now = performance.now();
    if (now - lastReport.current > 120) {
      lastReport.current = now;
      onState({ flying: flying.current, speed: sp, alt: pos.y - ground, locked: locked.current });
    }
  });

  return (
    <PointerLockControls
      ref={controls}
      selector="#walk-resume"
      onLock={() => { locked.current = true; }}
      onUnlock={() => { locked.current = false; onPause(); }}
    />
  );
}
