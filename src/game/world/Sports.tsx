import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playCheer, playClack, playPoof, playStrike } from '../audio';
import { PARTY_POINTS } from '../config';
import { burstConfetti, poof, ring } from '../fx';
import { at3, BOWLING, CONES, CRATE_TOWER, SOCCER, ZONES, type Vec3 } from '../layout';
import { lambert } from '../materials';
import { props, shakeCamera, type PropEntry } from '../runtime';
import { useGame } from '../store';
import { Prop } from './Prop';
import { Dominoes } from './Dominoes';
import { hamster } from './HamsterBalls';
import { after, gameClock, gameNow, useGameFrame } from '../clock';
import { earnSticker } from '../stickers';

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

export function Soccer() {
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

  useGameFrame((_, delta) => {
    wobble.current = Math.max(0, wobble.current - delta * 1.5);
    if (net.current) net.current.position.z = Math.sin(gameClock.time * 30) * 0.12 * wobble.current;
    const now = gameNow();
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
        earnSticker('goal');
        after(1.8, () => {
          setBallKey((k) => k + 1);
          poof(SOCCER.kickoff, '#ffffff', 16);
          playPoof(SOCCER.kickoff);
        });
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

/** A ball rolling into the pins at least this fast (m/s) knocks them all down. */
const SCATTER_SPEED = 2.5;

export function Bowling() {
  const [rackKey, setRackKey] = useState(0);
  const state = useRef({ fallen: new Set<number>(), resetAt: 0, strike: false, scattered: false });
  // where the pins stand (front pin nearest the ball, back row furthest)
  const deck = useMemo(() => {
    const zs = BOWLING.pins.map(([, pz]) => pz);
    return { near: Math.max(...zs) + 0.8, far: Math.min(...zs) - 0.6 };
  }, []);
  const laneLen = BOWLING.laneTo - BOWLING.laneFrom;
  const laneZ = (BOWLING.laneTo + BOWLING.laneFrom) / 2;
  const x = BOWLING.laneX;

  useGameFrame(() => {
    const s = state.current;
    const now = gameNow();
    const pins = findProps('pin');
    // A ball rolling into the pins hard enough knocks them all over. Real pins barely wobble for
    // a child's headbutt (a dead-centre hit toppled one in six), so the pins help: each standing
    // one gets a shove away from the ball and tips over, the nearest first.
    if (!s.scattered) {
      const balls = [...findProps('bowling').map((p) => p.getBody()), ...hamster.balls.map((b) => b?.body())];
      for (const ball of balls) {
        if (!ball) continue;
        const t = ball.translation();
        const v = ball.linvel();
        const speed = Math.hypot(v.x, v.z);
        if (speed < SCATTER_SPEED || Math.abs(t.x - x) > 1.6 || t.z > deck.near || t.z < deck.far) continue;
        s.scattered = true;
        const from = { x: t.x, z: t.z };
        const dir = { x: v.x / speed, z: v.z / speed };
        pins.forEach((pin) => {
          const pt = pin.getBody()?.translation();
          if (!pt || s.fallen.has(pin.id)) return;
          after(Math.min(0.35, Math.hypot(pt.x - from.x, pt.z - from.z) * 0.12), () => {
            const pb = pin.getBody();
            if (!pb) return;
            const p = pb.translation();
            const n = Math.hypot(p.x - from.x, p.z - from.z) || 1;
            const px = ((p.x - from.x) / n) * 2.5 + dir.x * 3;
            const pz = ((p.z - from.z) / n) * 2.5 + dir.z * 3;
            pb.setLinvel({ x: px, y: 2.5, z: pz }, true);
            // tip it over the way it's shoved (a spin round the line across the shove)
            pb.setAngvel({ x: pz * 2.5, y: 0, z: -px * 2.5 }, true);
          });
        });
        break;
      }
    }
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
      earnSticker('strike');
    }
    if (s.resetAt > 0 && now > s.resetAt) {
      s.fallen.clear();
      s.resetAt = 0;
      s.strike = false;
      s.scattered = false;
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

export function CrateTower() {
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


export function Sports() {
  return (
    <>
      <Soccer />
      <Bowling />
      <CrateTower />
      <Dominoes />
      {CONES.map((p, i) => (
        <Prop key={i} kind="cone" position={p} />
      ))}
      <Prop kind="ball" position={at3(ZONES.sports, -5, 0.5, 6)} color="#ff4d5e" />
      <Prop kind="beachball" position={at3(ZONES.sports, -12, 1, 6)} />
    </>
  );
}
