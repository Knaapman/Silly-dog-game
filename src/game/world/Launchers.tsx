import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoom, playGeyser, playWhoosh } from '../audio';
import { emit, poof, ring } from '../fx';
import { distXZ, type LaunchPadDef, type Vec2, type Vec3 } from '../layout';
import { lambert } from '../materials';
import { players, props, propPosition, shakeCamera } from '../runtime';
import { useHint } from './common';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { earnSticker } from '../stickers';

let chevronCache: THREE.Shape | null = null;
function chevronShape() {
  if (chevronCache) return chevronCache;
  const s = new THREE.Shape();
  s.moveTo(-0.6, 0.1);
  s.lineTo(0, -0.35);
  s.lineTo(0.6, 0.1);
  s.lineTo(0.6, 0.35);
  s.lineTo(0, -0.1);
  s.lineTo(-0.6, 0.35);
  s.lineTo(-0.6, 0.1);
  chevronCache = s;
  return s;
}

/** Glowing arrow pad: step on it and fly to a fun spot. */
export function LaunchPad({ pad }: { pad: LaunchPadDef }) {
  const chevrons = useRef<THREE.Group>(null);
  const angle = Math.atan2(pad.target[0] - pad.position[0], pad.target[2] - pad.position[2]);
  const sparkle = useRef(Math.random());
  const cooldown = useRef(new Map<number, number>());
  const target = useMemo(() => new THREE.Vector3(...pad.target), [pad]);
  useHint([pad.position[0], 0.5, pad.position[2]], 'walk', 5);

  useGameFrame((_, delta) => {
    chevrons.current?.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      const phase = (gameClock.time * 2.5 - i * 0.35) % 1;
      m.color.setHSL(0.13, 1, 0.5 + Math.max(0, Math.sin(phase * Math.PI)) * 0.4);
    });
    sparkle.current -= delta;
    if (sparkle.current <= 0) {
      sparkle.current = 0.25;
      emit('star', [pad.position[0] + (Math.random() - 0.5) * 1.6, 0.2, pad.position[2] + (Math.random() - 0.5) * 1.6], {
        count: 1,
        color: ['#fff3a8', '#ffffff'],
        speed: 0.3,
        up: 3,
        gravity: -1,
        size: 0.12,
        life: 1
      });
    }
    const now = gameNow();
    players.forEach((p) => {
      if ((cooldown.current.get(p.slot) ?? 0) > now || p.isLaunched() || p.flopped) return;
      if (distXZ(p.position.x, p.position.z, pad.position[0], pad.position[2]) > 1.3 || p.position.y > 1.6) return;
      cooldown.current.set(p.slot, now + 2500);
      p.launchTo(target, pad.apex);
      earnSticker('pad');
      playWhoosh(p.position);
      shakeCamera(0.2);
    });
  });

  return (
    <group position={[pad.position[0], 0.03, pad.position[2]]} rotation={[0, angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={lambert('#ff8a1f')}>
        <circleGeometry args={[1.35, 32]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} material={lambert('#ffd23f')}>
        <ringGeometry args={[1.05, 1.35, 32]} />
      </mesh>
      <group ref={chevrons}>
        {[-0.55, 0, 0.55].map((z, i) => (
          <mesh key={i} position={[0, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[chevronShape()]} />
            <meshBasicMaterial color="#fff3a8" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A water jet in the ground that erupts every few seconds and throws you onto a target. */
export function Geyser({ at, target, apex, period = 5, offset = 0 }: { at: Vec2; target: Vec3; apex: number; period?: number; offset?: number }) {
  const column = useRef<THREE.Mesh>(null);
  const lastPhase = useRef(0);
  const tgt = useMemo(() => new THREE.Vector3(...target), [target]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useHint([at[0], 0.5, at[1]], 'walk', 4);

  useGameFrame(() => {
    const t = (gameClock.time + offset) % period;
    const erupting = t < 1.4;
    const warming = !erupting && t > period - 0.8;
    const c = column.current;
    if (c) {
      const h = erupting ? Math.min(1, t / 0.2) * (1 - Math.max(0, (t - 1.1) / 0.3)) : 0;
      c.visible = h > 0.01;
      c.scale.set(1, Math.max(0.01, h * 7), 1);
      c.position.y = (h * 7) / 2;
    }
    if (warming && Math.random() < 0.3) emit('drop', [at[0], 0.2, at[1]], { count: 1, color: '#bfe9ff', speed: 0.6, up: 2, size: 0.1 });
    if (erupting && lastPhase.current >= 1.4) {
      playGeyser([at[0], 1, at[1]]);
      ring([at[0], 0.08, at[1]], { color: '#d9f3ff', radius: 2.5, duration: 0.5 });
    }
    if (erupting) {
      if (Math.random() < 0.6) emit('drop', [at[0], 1 + Math.random() * 5, at[1]], { count: 2, color: ['#bfe9ff', '#ffffff'], speed: 2.5, up: 3 });
      players.forEach((p) => {
        if (p.isLaunched() || p.flopped) return;
        if (distXZ(p.position.x, p.position.z, at[0], at[1]) > 1.4 || p.position.y > 2) return;
        p.launchTo(tgt, apex);
        earnSticker('geyser');
        emit('drop', p.position, { count: 20, color: ['#bfe9ff', '#ffffff'], speed: 4, up: 8 });
      });
      props.forEach((prop) => {
        if (prop.heldBy != null || !propPosition(prop, tmp)) return;
        if (distXZ(tmp.x, tmp.z, at[0], at[1]) > 1.3 || tmp.y > 2) return;
        prop.getBody()?.setLinvel({ x: (Math.random() - 0.5) * 3, y: 15, z: (Math.random() - 0.5) * 3 }, true);
      });
    }
    lastPhase.current = t;
  });

  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={lambert('#90a4ae')}>
        <circleGeometry args={[1.2, 24]} />
      </mesh>
      {[0.3, 0.6, 0.9].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={lambert('#4fc3f7')}>
          <ringGeometry args={[r - 0.06, r, 24]} />
        </mesh>
      ))}
      <mesh ref={column} visible={false}>
        <cylinderGeometry args={[0.35, 0.6, 1, 14, 1, true]} />
        <meshStandardMaterial color="#bfe9ff" transparent opacity={0.75} roughness={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Walk into the back of the cannon: you get loaded, it wiggles, and BOOM - off you fly. */
export function Cannon({ position, target, apex }: { position: Vec3; target: Vec3; apex: number }) {
  const barrel = useRef<THREE.Group>(null);
  const state = useRef<{ slot: number | null; timer: number; cooldown: Map<number, number>; recoil: number }>({
    slot: null,
    timer: 0,
    cooldown: new Map(),
    recoil: 0
  });
  const dx = target[0] - position[0];
  const dz = target[2] - position[2];
  const yaw = Math.atan2(dx, dz);
  const dir = useMemo(() => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), [yaw]);
  const loadSpot = useMemo(() => new THREE.Vector3(position[0], position[1], position[2]).addScaledVector(dir, -1.5), [position, dir]);
  const inside = useMemo(() => new THREE.Vector3(position[0], position[1] + 1, position[2]), [position]);
  const muzzle = useMemo(() => new THREE.Vector3(position[0], position[1] + 1.4, position[2]).addScaledVector(dir, 1.6), [position, dir]);
  const tgt = useMemo(() => new THREE.Vector3(...target), [target]);
  useHint([loadSpot.x, loadSpot.y + 0.5, loadSpot.z], 'walk', 4);

  useGameFrame((_, delta) => {
    const s = state.current;
    const now = gameNow();
    s.recoil = Math.max(0, s.recoil - delta * 3);
    if (s.slot == null) {
      players.forEach((p) => {
        if (s.slot != null || p.isLaunched() || p.flopped || (s.cooldown.get(p.slot) ?? 0) > now) return;
        if (distXZ(p.position.x, p.position.z, loadSpot.x, loadSpot.z) > 1.1 || Math.abs(p.position.y - (position[1] + 0.5)) > 1.2) return;
        s.slot = p.slot;
        s.timer = 0.9;
        p.hold(inside, true);
        poof(inside, '#ffffff', 8);
      });
    } else {
      s.timer -= delta;
      const p = players.get(s.slot);
      if (!p) {
        s.slot = null;
      } else if (s.timer <= 0) {
        p.hold(null);
        p.getBody()?.setTranslation(muzzle, true);
        p.launchTo(tgt, apex);
        earnSticker('cannon');
        s.cooldown.set(p.slot, now + 3000);
        s.slot = null;
        s.recoil = 1;
        playBoom(muzzle);
        emit('puff', muzzle, { count: 22, color: ['#ffffff', '#cfd8dc', '#90a4ae'], speed: 4, up: 2, size: 0.5, dir: [dir.x * 5, 1, dir.z * 5] });
        emit('confetti', muzzle, { count: 30, speed: 5, up: 6 });
        shakeCamera(0.5);
      } else if (Math.random() < 0.5) {
        emit('star', [muzzle.x - dir.x * 2.2, muzzle.y - 0.6, muzzle.z - dir.z * 2.2], { count: 1, color: ['#ffb020', '#ffe14d'], speed: 1.5, up: 2, size: 0.1 });
      }
    }
    if (barrel.current) {
      const wiggle = s.slot != null ? Math.sin(now * 0.05) * 0.06 : 0;
      barrel.current.rotation.x = -0.55 + wiggle;
      barrel.current.position.z = -s.recoil * 0.4;
    }
  });

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.35, 0.7]} position={[0, 0.35, 0]} />
      </RigidBody>
      <mesh castShadow position={[0, 0.35, 0]} material={lambert('#6d4c41')}>
        <boxGeometry args={[1.2, 0.5, 1.4]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.7, 0.4, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#4e342e')}>
          <cylinderGeometry args={[0.45, 0.45, 0.15, 14]} />
        </mesh>
      ))}
      <group position={[0, 0.8, 0]}>
        <group ref={barrel}>
          <mesh castShadow position={[0, 0, 0.9]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#37474f')}>
            <cylinderGeometry args={[0.42, 0.55, 2.4, 16]} />
          </mesh>
          <mesh position={[0, 0, 2.1]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ffd23f')}>
            <torusGeometry args={[0.44, 0.08, 8, 18]} />
          </mesh>
        </group>
      </group>
      {/* "stand here" target ring behind the cannon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -1.5]} material={lambert('#ffd23f')}>
        <ringGeometry args={[0.55, 0.8, 24]} />
      </mesh>
    </group>
  );
}
