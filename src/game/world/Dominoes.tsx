import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBell, playBoing, playCheer, playClack, playTwinkle } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { GRAVITY, PARTY_POINTS } from '../config';
import { makeCourse } from '../course';
import { burstConfetti, emit, ring } from '../fx';
import { DOMINOES } from '../layout';
import { lambert } from '../materials';
import { RADIUS } from '../player/constants';
import { debugInfo, players, props, registerStatic, shakeCamera } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { StaticCylinder, useHint } from './common';

// Giant dominoes on the grass by the soccer field: a long winding row of tall rainbow ones. Bump
// into one, headbutt it (or hit it with a ball or a snowball) and over it goes, away from you,
// knocking the next one, and the next... all the way along. At the far end the last one rings a
// bell: a cheer and a party (and a sticker). Knock one over the other way and the chain runs back
// towards the start. A domino falling onto an animal bonks it. When it's all gone quiet, the
// fallen ones stand back up again one after the other, ready for another go.

const H = DOMINOES.height;
const W = 1;
const T = 0.22;
/** Leaning this far (rad), its top reaches the next one. */
const HIT = Math.asin((DOMINOES.spacing - T) / H);
/** Fallen onto the next one (rad); the last one in a run lies flat. */
const REST = 1.2;
const FLAT = Math.PI / 2 - 0.03;
/** The last one lands on the big button past the end of the row (this far along, m), lying on it. */
const BUTTON_AT = 1.35;
const ON_BUTTON = 1.42;
/** A tall block tipping over its edge: θ'' = K sin θ. */
const K = (3 * -GRAVITY) / (2 * H);
/** A push (rad/s), and how much of its speed a falling domino passes on to the next. */
const NUDGE = 1.4;
const PASS_ON = 0.8;
/** Seconds of nothing falling before the fallen ones stand back up, one every RISE_GAP s. */
const RISE_AFTER = 6;
const RISE_GAP = 0.07;
const RISE_TIME = 0.35;
/** After standing up, a moment before it can be knocked again (ms). */
const STEADY = 600;
/** The bell hangs this far past the button, along the row (m). */
const BELL_PAST = 0.95;
/** A ball or a snowball knocks one over when it's moving at least this fast (m/s). */
const PROP_SPEED = 1.5;

type Mode = 'up' | 'fall' | 'down' | 'rise';
type Domino = { x: number; z: number; tx: number; tz: number; g: number; mode: Mode; theta: number; omega: number; dir: number; passed: boolean; bumped: Set<number>; readyAt: number; riseAt: number; rest: number };

export function Dominoes() {
  const course = useMemo(() => makeCourse(DOMINOES.points), []);
  const st = useRef({
    list: [] as Domino[],
    falls: 0,
    chains: 0,
    bells: 0,
    bumps: 0,
    rises: 0,
    chain: 0,
    lastChain: 0,
    quietSince: 0,
    bellSwing: 0
  });
  const z = st.current;
  if (!z.list.length) {
    const n = Math.floor(course.length / DOMINOES.spacing + 1e-6) + 1;
    for (let i = 0; i < n; i += 1) {
      const p = course.at(i * DOMINOES.spacing);
      z.list.push({ x: p.x, z: p.z, tx: p.dx, tz: p.dz, g: groundHeight(p.x, p.z), mode: 'up', theta: 0, omega: 0, dir: 1, passed: false, bumped: new Set(), readyAt: 0, riseAt: 0, rest: REST });
    }
  }
  debugInfo.dominoes = z;
  const list = z.list;
  const n = list.length;
  const last = list[n - 1];
  // the big button just past the last domino, where it lands, and the bell beside it
  const bell = useMemo(() => new THREE.Vector3(last.x + last.tx * BUTTON_AT, last.g, last.z + last.tz * BUTTON_AT), [last]);
  const bellYaw = Math.atan2(last.tx, last.tz);
  const first = list[0];
  useHint([first.x, first.g + 1, first.z], 'bonk', 4);

  // one instanced mesh for the dominoes, one for the white line across each
  const meshes = useMemo(() => {
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(W, H, T), lambert('#ffffff'), n);
    const line = new THREE.InstancedMesh(new THREE.BoxGeometry(W * 0.8, 0.07, T + 0.03), lambert('#ffffff'), n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i += 1) body.setColorAt(i, c.setHSL(i / n, 0.78, 0.56));
    for (const m of [body, line]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
    return { body, line };
  }, [n]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), a: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3() }), []);
  const place = (i: number) => {
    const d = list[i];
    // stand on the ground, turned along the row, tipped over its leading bottom edge
    tmp.m.makeTranslation(d.x, d.g, d.z);
    tmp.m.multiply(tmp.a.makeRotationY(Math.atan2(d.tx, d.tz)));
    tmp.m.multiply(tmp.a.makeTranslation(0, 0, (d.dir * T) / 2));
    tmp.m.multiply(tmp.a.makeRotationX(d.dir * d.theta));
    tmp.m.multiply(tmp.a.makeTranslation(0, H / 2, (-d.dir * T) / 2));
    meshes.body.setMatrixAt(i, tmp.m);
    meshes.line.setMatrixAt(i, tmp.m);
  };
  useMemo(() => {
    for (let i = 0; i < n; i += 1) place(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshes]);

  const topple = (i: number, dir: number, omega = NUDGE) => {
    const d = list[i];
    if (!d || d.mode !== 'up' || gameNow() < d.readyAt) return false;
    if (!list.some((o) => o.mode === 'fall')) {
      z.chain = 0;
      z.chains += 1;
    }
    d.mode = 'fall';
    d.dir = dir;
    d.omega = omega;
    d.theta = 0.001;
    d.passed = false;
    d.bumped.clear();
    const next = list[i + dir];
    d.rest = next ? REST : i === n - 1 ? ON_BUTTON : FLAT;
    z.falls += 1;
    z.chain += 1;
    playClack([d.x, d.g + 1, d.z], Math.min(1, 0.3 + z.chain * 0.02));
    return true;
  };
  debugInfo.dominoTopple = topple;

  // a headbutt (or a snowball): over it goes, away from whoever hit it
  useEffect(() => {
    const offs = list.map((d, i) =>
      registerStatic({
        id: 9800 + i,
        position: new THREE.Vector3(d.x, d.g + H / 2, d.z),
        radius: 0.5,
        onBonk: (_slot, dir) => {
          topple(i, dir.x * d.tx + dir.z * d.tz >= 0 ? 1 : -1, NUDGE * 1.3);
        }
      })
    );
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const bellGroup = useRef<THREE.Group>(null);
  const button = useRef<THREE.Mesh>(null);
  const box = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const d of list) {
      x0 = Math.min(x0, d.x);
      x1 = Math.max(x1, d.x);
      z0 = Math.min(z0, d.z);
      z1 = Math.max(z1, d.z);
    }
    return { x0: x0 - 2, x1: x1 + 2, z0: z0 - 2, z1: z1 + 2 };
  }, [list]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    let dirty = false;

    // bumping into a standing domino knocks it over, away from you (balls do too)
    const touch = (i: number, px: number, py: number, pz: number, r: number, vx: number, vz: number) => {
      const d = list[i];
      const ax = px - d.x;
      const az = pz - d.z;
      const along = ax * d.tx + az * d.tz;
      const side = -ax * d.tz + az * d.tx;
      if (Math.abs(along) > T / 2 + r || Math.abs(side) > W / 2 + r * 0.7 || py - d.g > H + r || py < d.g - 0.5) return;
      // in front of it or behind it: away from you; hitting it side-on: the way you're going (or on
      // along the row, towards the bell)
      const v = vx * d.tx + vz * d.tz;
      topple(i, Math.abs(along) > T / 2 ? -Math.sign(along) : Math.abs(v) > 0.3 ? Math.sign(v) : 1);
    };
    const moving: { x: number; y: number; z: number; r: number; vx: number; vz: number }[] = [];
    props.forEach((prop) => {
      if (!prop.enabled || prop.heldBy != null) return;
      const b = prop.getBody();
      if (!b) return;
      const t = b.translation();
      if (t.x < box.x0 || t.x > box.x1 || t.z < box.z0 || t.z > box.z1) return;
      const lv = b.linvel();
      if (Math.hypot(lv.x, lv.z) < PROP_SPEED) return;
      moving.push({ x: t.x, y: t.y, z: t.z, r: prop.radius, vx: lv.x, vz: lv.z });
    });
    for (let i = 0; i < n; i += 1) {
      if (list[i].mode !== 'up' || now < list[i].readyAt) continue;
      for (const p of players.values()) {
        if (p.position.x < box.x0 || p.position.x > box.x1 || p.position.z < box.z0 || p.position.z > box.z1) continue;
        touch(i, p.position.x, p.position.y, p.position.z, RADIUS * p.size, p.velocity.x, p.velocity.z);
      }
      for (const m of moving) touch(i, m.x, m.y, m.z, m.r, m.vx, m.vz);
    }

    let falling = false;
    for (let i = 0; i < n; i += 1) {
      const d = list[i];
      let changed = false;
      if (d.mode === 'fall') {
        falling = true;
        changed = true;
        d.omega += K * Math.sin(d.theta) * dt;
        d.theta += d.omega * dt;
        if (!d.passed && d.theta >= HIT) {
          d.passed = true;
          const next = list[i + d.dir];
          // the next one goes (one that's only just stood up again holds this one up, leaning on it)
          if (next && !topple(i + d.dir, d.dir, Math.max(NUDGE, d.omega * PASS_ON)) && (next.mode === 'up' || next.mode === 'rise')) d.rest = HIT + 0.03;
        }
        // the very last one, landing on the big button: DING
        if (i === n - 1 && d.dir === 1 && d.theta > ON_BUTTON - 0.08 && !d.bumped.has(-1)) {
          d.bumped.add(-1);
          ringBell();
        }
        // landing on someone in the way: bonk!
        if (d.theta > 0.35) {
          // (only as far as the next one in the row: it can't fall through that)
          const reach = list[i + d.dir] ? DOMINOES.spacing : H * Math.sin(d.theta);
          const top = H * Math.cos(d.theta);
          for (const p of players.values()) {
            if (d.bumped.has(p.slot) || p.isLaunched()) continue;
            const ax = p.position.x - d.x;
            const az = p.position.z - d.z;
            const along = (ax * d.tx + az * d.tz) * d.dir;
            const side = -ax * d.tz + az * d.tx;
            if (along < T / 2 || along > reach + RADIUS || Math.abs(side) > W / 2 + RADIUS * 0.5 || p.position.y - d.g > top + RADIUS * 2) continue;
            d.bumped.add(p.slot);
            z.bumps += 1;
            p.hop(5);
            playBoing(p.position, 1.2);
            emit('star', [p.position.x, p.position.y + 0.6, p.position.z], { count: 8, color: ['#ffd23f', '#ffffff'], speed: 3, up: 2 });
          }
        }
        if (d.theta >= d.rest) {
          d.theta = d.rest;
          d.mode = 'down';
          if (d.rest === FLAT) emit('puff', [d.x + d.tx * d.dir * H * 0.6, d.g + 0.1, d.z + d.tz * d.dir * H * 0.6], { count: 6, color: '#e8e0d0', speed: 1.5, up: 0.6, size: 0.35 });
        }
      } else if (d.mode === 'rise' && now >= d.riseAt) {
        changed = true;
        d.theta = Math.max(0, d.theta - (REST / RISE_TIME) * dt);
        if (d.theta <= 0) {
          d.mode = 'up';
          d.readyAt = now + STEADY;
          z.rises += 1;
          playTwinkle([d.x, d.g + 1.5, d.z], 0.7 + (i / n) * 0.6);
        }
      }
      if (changed) {
        place(i);
        dirty = true;
      }
    }
    if (falling) z.quietSince = now;
    else if (z.chain) {
      z.lastChain = z.chain;
      z.chain = 0;
    }

    // all quiet for a while: up they get again, one after the other along the row
    if (!falling && now - z.quietSince > RISE_AFTER * 1000 && list.some((d) => d.mode === 'down')) {
      let k = 0;
      for (const d of list) {
        if (d.mode !== 'down') continue;
        // (not with an animal standing on its spot: it waits for the next round)
        const inTheWay = [...players.values()].some((p) => Math.hypot(p.position.x - d.x, p.position.z - d.z) < W / 2 + RADIUS + 0.2);
        if (inTheWay) continue;
        d.mode = 'rise';
        d.riseAt = now + k * RISE_GAP * 1000;
        k += 1;
      }
      z.quietSince = now;
    }

    if (dirty) {
      meshes.body.instanceMatrix.needsUpdate = true;
      meshes.line.instanceMatrix.needsUpdate = true;
    }
    z.bellSwing = Math.max(0, z.bellSwing - dt * 0.8);
    if (bellGroup.current) bellGroup.current.rotation.x = Math.sin(now / 70) * 0.5 * z.bellSwing;
    if (button.current) button.current.scale.y = list[n - 1].mode === 'up' ? 1 : 0.4;
  });

  function ringBell() {
    z.bells += 1;
    z.bellSwing = 1;
    const top: [number, number, number] = [bell.x + last.tx * BELL_PAST, bell.y + 2.3, bell.z + last.tz * BELL_PAST];
    playBell(top);
    playCheer();
    burstConfetti(top, 50, 7);
    ring([bell.x, bell.y + 0.1, bell.z], { color: '#ffd23f', radius: 5, duration: 0.8 });
    shakeCamera(0.25);
    useGame.getState().addParty(PARTY_POINTS.goal);
    earnSticker('dominoes');
  }

  return (
    <group>
      <primitive object={meshes.body} />
      <primitive object={meshes.line} />
      {/* the big button past the end of the row, and the bell on its post beside it */}
      <group position={bell} rotation={[0, bellYaw, 0]}>
        <mesh receiveShadow position={[0, 0.04, 0]} material={lambert('#ffd23f')}>
          <cylinderGeometry args={[0.62, 0.66, 0.08, 20]} />
        </mesh>
        <mesh ref={button} castShadow position={[0, 0.08, 0]} material={lambert('#ef4444')}>
          <cylinderGeometry args={[0.45, 0.45, 0.24, 20]} />
        </mesh>
        <StaticCylinder position={[0, 1.45, BELL_PAST + 0.5]} radius={0.12} height={2.9} color="#8d5a36" segments={8} />
        <mesh position={[0, 2.8, BELL_PAST + 0.25]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#8d5a36')}>
          <cylinderGeometry args={[0.07, 0.07, 0.6, 6]} />
        </mesh>
        <group ref={bellGroup} position={[0, 2.75, BELL_PAST]}>
          <mesh position={[0, -0.35, 0]} castShadow material={lambert('#ffd23f')}>
            <cylinderGeometry args={[0.18, 0.42, 0.6, 14, 1, true]} />
          </mesh>
          <mesh position={[0, -0.05, 0]} material={lambert('#ffd23f')}>
            <sphereGeometry args={[0.2, 12, 8]} />
          </mesh>
          <mesh position={[0, -0.68, 0]} material={lambert('#b45309')}>
            <sphereGeometry args={[0.09, 8, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
