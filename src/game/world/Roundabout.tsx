import { CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playSpin, playWhoosh } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit } from '../fx';
import { distXZ, ROUNDABOUT } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, registerStatic, type Surface } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { StaticCylinder, useHint } from './common';
import { useSurface } from './surface';

// The roundabout in the playground: a big round deck that turns on a post. Run round beside it
// (or headbutt its edge) to push it, and hop on to ride: it carries you round. When it really
// whizzes, anyone out near the edge flies off (wheee!): a sticker, and a friend sticker when a
// friend was doing the pushing. It slows down by itself. Playing alone, the buddy runs round
// pushing while you ride.

/** Fastest it turns (rad/s), how quickly it slows down (a fraction a second), and a headbutt's push. */
const MAX_SPIN = 4.2;
const SLOW = 0.12;
const BONK_SPIN = 0.9;
/** Running round beside it pushes it up to a little more than your own speed. */
const PUSH_GAIN = 1.2;
/** Turning at least this fast (rad/s), riders out past FLING_R (m from the middle) fly off. */
export const FLING_SPIN = 2.5;
const FLING_R = 1.1;
/** How high the deck's top is above the ground (m), and how thick it is. */
const DECK_TOP = 0.32;
const DECK = 0.2;
const COLORS = ['#ef4444', '#ffd23f', '#3b82f6', '#22c55e', '#f97316', '#a855f7'];

/** For the buddy and the tests. */
export const roundabout = { spin: 0, angle: 0, flings: 0, pushes: 0, bonks: 0, lastPusher: -1, lastPushAt: -1e9, riders: [] as number[] };

export function Roundabout() {
  const [cx, cz] = ROUNDABOUT.center;
  const R = ROUNDABOUT.radius;
  const g = groundHeight(cx, cz);
  const top = g + DECK_TOP;
  const body = useRef<RapierRigidBody>(null);
  const deck = useRef<RapierCollider>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const flungAt = useRef(new Map<number, number>());
  const loud = useRef(false);
  debugInfo.roundabout = roundabout;
  useHint([cx, top + 0.8, cz], 'walk', 3.5);
  // standing on it, it carries you round
  const surface = useMemo<Surface>(() => ({ velocityAt: (p, out) => out.set(roundabout.spin * (p.z - cz), 0, -roundabout.spin * (p.x - cx)) }), [cx, cz]);
  useSurface(deck, surface);

  /** Which way (and how much) a push along `dx, dz` at a point turns it: +1 is along its turning. */
  const along = (px: number, pz: number, dx: number, dz: number) => {
    const rx = px - cx;
    const rz = pz - cz;
    const r = Math.max(0.01, Math.hypot(rx, rz));
    return (dx * rz - dz * rx) / r;
  };

  // a headbutt at its edge gives it a shove
  useEffect(
    () =>
      registerStatic({
        id: 9960,
        position: new THREE.Vector3(cx, top, cz),
        // (a little past the rim: the headbutt reaches from where you stand beside it)
        radius: R + 0.3,
        onBonk: (slot, dir) => {
          const p = players.get(slot);
          if (!p || distXZ(p.position.x, p.position.z, cx, cz) < R - 0.2) return; // (not from on board)
          const d = Math.hypot(dir.x, dir.z) || 1;
          roundabout.spin = THREE.MathUtils.clamp(roundabout.spin + BONK_SPIN * along(p.position.x, p.position.z, dir.x / d, dir.z / d), -MAX_SPIN, MAX_SPIN);
          roundabout.bonks += 1;
          roundabout.lastPusher = slot;
          roundabout.lastPushAt = gameNow();
        }
      }),
    [cx, cz, top, R]
  );

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    const st = roundabout;
    st.riders = [];
    for (const p of players.values()) {
      if (p.asleep) continue;
      const d = distXZ(p.position.x, p.position.z, cx, cz);
      const up = p.position.y - top;
      if (d < R && up > -0.2 && up < 1.3 && !p.isLaunched()) {
        st.riders.push(p.slot);
        continue;
      }
      // running round beside it: a push, up to a bit more than how fast you're running
      if (d < R - 0.1 || d > R + 1.1 || !p.grounded || up > 0.8) continue;
      const v = along(p.position.x, p.position.z, p.velocity.x, p.velocity.z);
      if (Math.abs(v) < 1.5) continue;
      const want = (v / R) * PUSH_GAIN;
      if (Math.sign(want) === Math.sign(st.spin || want) && Math.abs(want) <= Math.abs(st.spin)) continue;
      st.spin += (want - st.spin) * Math.min(1, dt * 1.5);
      st.pushes += 1;
      st.lastPusher = p.slot;
      st.lastPushAt = now;
    }
    st.spin = THREE.MathUtils.clamp(st.spin * Math.max(0, 1 - SLOW * dt), -MAX_SPIN, MAX_SPIN);
    if (Math.abs(st.spin) < 0.02) st.spin = 0;
    st.angle += st.spin * dt;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, st.angle);
    body.current?.setNextKinematicRotation(q);
    // a whirr when it gets going fast
    if (!loud.current && Math.abs(st.spin) > 2) {
      loud.current = true;
      playSpin([cx, top, cz]);
    } else if (loud.current && Math.abs(st.spin) < 1.2) loud.current = false;

    // really whizzing: whoever's out near the edge flies off
    if (Math.abs(st.spin) < FLING_SPIN) return;
    for (const slot of st.riders) {
      const p = players.get(slot);
      if (!p || now - (flungAt.current.get(slot) ?? -1e9) < 1500) continue;
      const rx = p.position.x - cx;
      const rz = p.position.z - cz;
      const r = Math.hypot(rx, rz);
      if (r < FLING_R) continue;
      flungAt.current.set(slot, now);
      st.flings += 1;
      // out and along the way it's turning
      const s = Math.sign(st.spin);
      const tx = p.position.x + (rx / r) * 4.5 + (rz / r) * s * 2;
      const tz = p.position.z + (rz / r) * 4.5 - (rx / r) * s * 2;
      p.launchTo(new THREE.Vector3(tx, groundHeight(tx, tz), tz), p.position.y + 1.8);
      playWhoosh(p.position);
      emit('puff', [p.position.x, top + 0.1, p.position.z], { count: 6, color: '#ffffff', speed: 2, up: 0.5, size: 0.3 });
      useGame.getState().addParty(PARTY_POINTS.launch);
      if (p.bot) continue;
      earnSticker('roundabout');
      const pusher = players.get(st.lastPusher);
      if (pusher && !pusher.bot && pusher.slot !== slot && now - st.lastPushAt < 5000) earnSticker('roundaboutfriends');
    }
  });

  const wedges = useMemo(() => COLORS.map((_, i) => ({ start: (i / COLORS.length) * Math.PI * 2, len: (Math.PI * 2) / COLORS.length })), []);
  return (
    <group>
      {/* the post it turns on */}
      <StaticCylinder position={[cx, g + (DECK_TOP - DECK) / 2, cz]} radius={0.5} height={DECK_TOP - DECK} color="#64748b" segments={12} />
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[cx, top - DECK / 2, cz]}>
        <CylinderCollider ref={deck} args={[DECK / 2, R]} friction={1} />
        <mesh castShadow receiveShadow material={lambert('#94a3b8')}>
          <cylinderGeometry args={[R, R, DECK, 36]} />
        </mesh>
        {/* a coloured slice each, the middle, and four handles to hold */}
        {wedges.map((w, i) => (
          <mesh key={i} position={[0, DECK / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lambert(COLORS[i])}>
            <circleGeometry args={[R - 0.06, 8, w.start, w.len]} />
          </mesh>
        ))}
        <mesh position={[0, DECK / 2 + 0.35, 0]} material={lambert('#e2e8f0')}>
          <cylinderGeometry args={[0.22, 0.28, 0.7, 12]} />
        </mesh>
        {[0, 1, 2, 3].map((k) => {
          const a = (k * Math.PI) / 2 + Math.PI / 4;
          const r = R - 0.35;
          return (
            <group key={k} rotation={[0, a, 0]}>
              <mesh position={[r, DECK / 2 + 0.4, 0]} material={lambert('#e2e8f0')}>
                <cylinderGeometry args={[0.05, 0.05, 0.8, 8]} />
              </mesh>
              <mesh position={[(r + 0.3) / 2, DECK / 2 + 0.78, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#e2e8f0')}>
                <cylinderGeometry args={[0.045, 0.045, r - 0.3, 8]} />
              </mesh>
            </group>
          );
        })}
      </RigidBody>
    </group>
  );
}
