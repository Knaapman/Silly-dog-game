import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playCheer, playClack, playPoof, playStrike } from '../audio';
import { PARTY_POINTS } from '../config';
import { burstConfetti, poof, ring } from '../fx';
import { BOWLING, CRATE_TOWER, MELON_PATCH, SOCCER, type Vec3 } from '../layout';
import { lambert } from '../materials';
import { props, shakeCamera, type PropEntry } from '../runtime';
import { useGame } from '../store';
import { Prop } from './Prop';

function findProps(kind: PropEntry['kind']) {
  const out: PropEntry[] = [];
  props.forEach((p) => {
    if (p.kind === kind) out.push(p);
  });
  return out;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Line({ from, to, width = 0.18 }: { from: [number, number]; to: [number, number]; width?: number }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, -angle]} position={[(from[0] + to[0]) / 2, 0.02, (from[1] + to[1]) / 2]} material={lambert('#ffffff')}>
      <planeGeometry args={[len + width, width]} />
    </mesh>
  );
}

function Soccer() {
  const [ballKey, setBallKey] = useState(0);
  const cooldown = useRef(0);
  const net = useRef<THREE.Group>(null);
  const wobble = useRef(0);
  const [gx, , gz] = SOCCER.goalCenter;
  const w = SOCCER.goalWidth;
  const h = SOCCER.goalHeight;
  const d = SOCCER.goalDepth;
  const mouthZ = gz + d / 2;
  const backZ = gz - d / 2;
  const netMaterial = useMemo(() => {
    const tex = netTexture();
    tex.repeat.set(8, 3);
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  }, []);
  const sideNet = useMemo(() => {
    const m = netMaterial.clone();
    m.map = netMaterial.map!.clone();
    m.map.repeat.set(2.5, 3);
    return m;
  }, [netMaterial]);

  useFrame(({ clock }, delta) => {
    wobble.current = Math.max(0, wobble.current - delta * 1.5);
    if (net.current) net.current.position.z = Math.sin(clock.elapsedTime * 30) * 0.12 * wobble.current;
    const now = performance.now();
    if (now < cooldown.current) return;
    for (const ball of findProps('soccer')) {
      const b = ball.getBody();
      if (!b) continue;
      const p = b.translation();
      if (Math.abs(p.x - gx) < w / 2 - 0.35 && p.z < mouthZ - 0.4 && p.z > backZ - 0.2 && p.y < h) {
        cooldown.current = now + 3000;
        wobble.current = 1;
        [-w / 3, 0, w / 3].forEach((dx) => burstConfetti([gx + dx, h, mouthZ], 45, 8));
        ring([gx, 0.1, mouthZ], { color: '#ffd23f', radius: 6, duration: 0.8 });
        playCheer();
        shakeCamera(0.3);
        useGame.getState().addParty(PARTY_POINTS.goal);
        window.setTimeout(() => {
          setBallKey((k) => k + 1);
          poof(SOCCER.kickoff, '#ffffff', 16);
          playPoof(SOCCER.kickoff);
        }, 1800);
      }
    }
  });

  const [fx, fz] = SOCCER.field.center;
  const [fw, fd] = SOCCER.field.size;
  const x0 = fx - fw / 2;
  const x1 = fx + fw / 2;
  const z0 = fz - fd / 2;
  const z1 = fz + fd / 2;

  return (
    <group>
      <Line from={[x0, z0]} to={[x1, z0]} />
      <Line from={[x0, z1]} to={[x1, z1]} />
      <Line from={[x0, z0]} to={[x0, z1]} />
      <Line from={[x1, z0]} to={[x1, z1]} />
      <Line from={[gx - 5, z0]} to={[gx - 5, z0 + 4]} />
      <Line from={[gx + 5, z0]} to={[gx + 5, z0 + 4]} />
      <Line from={[gx - 5, z0 + 4]} to={[gx + 5, z0 + 4]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[fx, 0.02, fz + 3]} material={lambert('#ffffff')}>
        <ringGeometry args={[2.2, 2.4, 40]} />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        {[-1, 1].map((s) => (
          <CylinderCollider key={s} args={[h / 2, 0.14]} position={[gx + (s * w) / 2, h / 2, mouthZ]} />
        ))}
        <CuboidCollider args={[w / 2, 0.14, 0.14]} position={[gx, h, mouthZ]} />
        <CuboidCollider args={[w / 2, h / 2, 0.08]} position={[gx, h / 2, backZ]} />
        {[-1, 1].map((s) => (
          <CuboidCollider key={`side${s}`} args={[0.08, h / 2, d / 2]} position={[gx + (s * w) / 2, h / 2, gz]} />
        ))}
        <CuboidCollider args={[w / 2, 0.06, d / 2]} position={[gx, h, gz]} />
      </RigidBody>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[gx + (s * w) / 2, h / 2, mouthZ]} material={lambert('#ffffff')}>
          <cylinderGeometry args={[0.14, 0.14, h, 12]} />
        </mesh>
      ))}
      <mesh castShadow position={[gx, h, mouthZ]} rotation={[0, 0, Math.PI / 2]} material={lambert('#ffffff')}>
        <cylinderGeometry args={[0.14, 0.14, w + 0.28, 12]} />
      </mesh>
      <group ref={net}>
        <mesh position={[gx, h / 2, backZ]} material={netMaterial}>
          <planeGeometry args={[w, h]} />
        </mesh>
        <mesh position={[gx, h, gz]} rotation={[Math.PI / 2, 0, 0]} material={netMaterial}>
          <planeGeometry args={[w, d]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[gx + (s * w) / 2, h / 2, gz]} rotation={[0, Math.PI / 2, 0]} material={sideNet}>
            <planeGeometry args={[d, h]} />
          </mesh>
        ))}
      </group>
      <Prop kind="soccer" position={SOCCER.kickoff} resetKey={ballKey} />
    </group>
  );
}

function Bowling() {
  const [rackKey, setRackKey] = useState(0);
  const state = useRef({ fallen: new Set<number>(), resetAt: 0, strike: false });
  const laneLen = BOWLING.laneTo - BOWLING.laneFrom;
  const laneZ = (BOWLING.laneTo + BOWLING.laneFrom) / 2;
  const x = BOWLING.laneX;

  useFrame(() => {
    const s = state.current;
    const now = performance.now();
    const pins = findProps('pin');
    pins.forEach((pin) => {
      const b = pin.getBody();
      if (!b || s.fallen.has(pin.id)) return;
      const q = b.rotation();
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (upY < 0.6) {
        s.fallen.add(pin.id);
        playClack(b.translation(), 0.8);
      }
    });
    if (s.fallen.size > 0 && s.resetAt === 0) s.resetAt = now + 6500;
    if (!s.strike && pins.length > 0 && s.fallen.size >= pins.length) {
      s.strike = true;
      s.resetAt = now + 3500;
      playStrike();
      burstConfetti([x, 1.5, BOWLING.pins[0][1] - 1], 80, 8);
      shakeCamera(0.3);
      useGame.getState().addParty(PARTY_POINTS.strike);
    }
    if (s.resetAt > 0 && now > s.resetAt) {
      s.fallen.clear();
      s.resetAt = 0;
      s.strike = false;
      setRackKey((k) => k + 1);
      poof([x, 0.6, BOWLING.pins[0][1] - 0.7], '#ffffff', 16);
    }
  });

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.015, laneZ - 1]} material={lambert('#f0c987')}>
        <planeGeometry args={[3, laneLen + 2]} />
      </mesh>
      {[-0.9, 0, 0.9].map((dx, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x + dx, 0.03, BOWLING.laneTo - 5 - Math.abs(dx)]} material={lambert('#e05a47')}>
          <coneGeometry args={[0.18, 0.5, 3]} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false}>
        {[-1, 1].map((s) => (
          <CuboidCollider key={s} args={[0.12, 0.25, (laneLen + 2) / 2]} position={[x + s * 1.6, 0.25, laneZ - 1]} />
        ))}
        <CuboidCollider args={[1.9, 0.8, 0.2]} position={[x, 0.8, BOWLING.laneFrom - 1.2]} />
      </RigidBody>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[x + s * 1.6, 0.25, laneZ - 1]} material={lambert(s < 0 ? '#3b82f6' : '#ff4d5e')}>
          <boxGeometry args={[0.24, 0.5, laneLen + 2]} />
        </mesh>
      ))}
      <mesh castShadow position={[x, 0.8, BOWLING.laneFrom - 1.2]} material={lambert('#5b6770')}>
        <boxGeometry args={[3.8, 1.6, 0.4]} />
      </mesh>
      {BOWLING.pins.map(([px, pz], i) => (
        <Prop key={`pin-${i}`} kind="pin" position={[px, 0.39, pz]} resetKey={rackKey} />
      ))}
      <Prop kind="bowling" position={BOWLING.ballStart} resetKey={rackKey} />
    </group>
  );
}

function CrateTower() {
  const crates = useMemo(() => {
    const [bx, , bz] = CRATE_TOWER.base;
    const s = CRATE_TOWER.size;
    const out: Vec3[] = [];
    for (let row = 0; row < CRATE_TOWER.rows; row += 1) {
      const n = CRATE_TOWER.rows - row;
      for (let i = 0; i < n; i += 1) out.push([bx + (i - (n - 1) / 2) * (s + 0.04), s / 2 + row * (s + 0.01), bz]);
    }
    return out;
  }, []);
  return (
    <>
      {crates.map((p, i) => (
        <Prop key={i} kind="crate" position={p} />
      ))}
    </>
  );
}

function MelonPatch() {
  return (
    <group>
      {MELON_PATCH.map(([x, z], i) => (
        <group key={i}>
          <Prop kind="melon" position={[x, 0.5, z]} rotation={[0, i * 0.7, 0]} splatty />
          {[0, 1, 2].map((j) => {
            const a = i * 1.3 + j * 2.1;
            return (
              <mesh key={j} position={[x + Math.cos(a) * 0.9, 0.06, z + Math.sin(a) * 0.9]} rotation={[-Math.PI / 2, 0, a]} scale={[1, 0.6, 1]} material={lambert('#3f9b3a')}>
                <circleGeometry args={[0.4, 8]} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

const SCATTER: { kind: 'beachball' | 'ball' | 'cone' | 'barrel' | 'hay' | 'duck'; position: Vec3; rotation?: Vec3; color?: string }[] = [
  { kind: 'beachball', position: [-6, 1, 0] },
  { kind: 'beachball', position: [-9, 1, 21] },
  { kind: 'beachball', position: [22, 1, -2] },
  { kind: 'ball', position: [4, 0.5, 14], color: '#c6f432' },
  { kind: 'ball', position: [-3, 0.5, 16], color: '#ff4d5e' },
  { kind: 'ball', position: [12, 0.5, 4], color: '#3b82f6' },
  { kind: 'ball', position: [-12, 0.5, -4], color: '#ffd23f' },
  { kind: 'ball', position: [24, 0.5, 16], color: '#a855f7' },
  { kind: 'cone', position: [11, 0.4, -20] },
  { kind: 'cone', position: [25, 0.4, -20] },
  { kind: 'cone', position: [6, 0.4, 9] },
  { kind: 'cone', position: [-6, 0.4, -2] },
  { kind: 'cone', position: [7, 0.4, 10.5] },
  { kind: 'barrel', position: [-21, 0.5, -21.5] },
  { kind: 'barrel', position: [-19.8, 0.5, -22.4], color: '#3b82f6' },
  { kind: 'barrel', position: [-30, 0.5, -20], color: '#22c55e' },
  { kind: 'hay', position: [-23, 0.62, -20], rotation: [0, 0, Math.PI / 2] },
  { kind: 'hay', position: [-25.4, 0.62, -20.3], rotation: [0, 0.3, Math.PI / 2] },
  { kind: 'hay', position: [-19, 0.55, -26] },
  { kind: 'duck', position: [-12, 0.35, 5] },
  { kind: 'duck', position: [-20, 0.35, 12], color: '#ff8fd8' },
  { kind: 'duck', position: [-21, 0.35, 3] }
];

export function Games() {
  return (
    <>
      <Soccer />
      <Bowling />
      <CrateTower />
      <MelonPatch />
      {SCATTER.map((s, i) => (
        <Prop key={i} kind={s.kind} position={s.position} rotation={s.rotation} color={s.color} />
      ))}
    </>
  );
}
