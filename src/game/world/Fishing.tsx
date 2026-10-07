import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBounce, playChomp, playPoof, playSplash, playSplat } from '../audio';
import { gameNow, seededRandom, useGameFrame } from '../clock';
import { GRAVITY } from '../config';
import { emit, poof, ring } from '../fx';
import { FISHING_SPOT } from '../layout';
import { lambert } from '../materials';
import { allocPropId, debugInfo, players, registerProp, spawners, type PropEntry } from '../runtime';
import { earnSticker } from '../stickers';
import { groundHeight, isInWater, waterLevelAt } from '../terrain';
import { useHint } from './common';
import { liftIfUnder } from './ground';

// Fishing with your tongue: lick the water from the shore (the lagoon, the sea, the river, even
// the fountain) and now and then a fish leaps out, up over your head and onto the bank behind
// you, where it flops about. Pick it up with your tongue and throw it: at a friend (SLAP!), or
// back into the water, where it swims off with a splash. One left flopping on the grass for a
// while flops off home by itself (poof).

const POOL = 6;
const R = 0.22;
/** Chance a lick brings up a fish: the first lick, the second; the third always does. */
const BITE = [0.35, 0.65, 1];
/** Licks more than this far apart (ms) start counting again. */
const BITE_WINDOW = 6000;
/** Seconds flopping on land before it goes home; in the water, how soon it swims off. */
const LAND_TIME = 25;
const SWIM_OFF = 0.4;
/** A thrown fish moving faster than this (m/s) slaps whoever it hits. */
const SLAP_SPEED = 5;
const COLORS = ['#f97316', '#38bdf8', '#a3e635', '#f472b6', '#facc15'];
const G = -GRAVITY;

type Fish = { active: boolean; since: number; wetFor: number; flopAt: number; thrower: number | null; slapped: Set<number>; color: number };

/** Each fish's leap out of the water, from `from` to land at `to` (set by the fish itself). */
const leaps: ((from: THREE.Vector3, to: THREE.Vector3) => void)[] = [];
/** Each fish's body and prop entry, and how it goes away (eaten by a cat, say). */
const bodies: (() => RapierRigidBody | null)[] = [];
const entries: (PropEntry | null)[] = [];
const goAway: (() => void)[] = [];

/**
 * The nearest fish about on dry land (not held, not in the water) within `max` m of (x, z).
 * `landed`: only one lying on the ground (not one flying past overhead, just thrown or leaping out
 * of the water); otherwise one in a little flop counts too (`landed` in the answer says which).
 */
export function nearestFish(x: number, z: number, max: number, landed = true) {
  let best: { index: number; x: number; z: number; landed: boolean } | null = null;
  let bestD = max;
  fishing.fish.forEach((f, i) => {
    const e = entries[i];
    const rb = bodies[i]?.();
    if (!f || !f.active || !e || e.heldBy != null || !rb) return;
    const t = rb.translation();
    if (isInWater(t.x, t.z)) return;
    const v = rb.linvel();
    const down = t.y - groundHeight(t.x, t.z) < R + 0.35 && Math.hypot(v.x, v.y, v.z) < 4;
    const low = t.y - groundHeight(t.x, t.z) < R + 1.2;
    if (landed ? !down : !low) return;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < bestD) {
      bestD = d;
      best = { index: i, x: t.x, z: t.z, landed: down };
    }
  });
  return best as { index: number; x: number; z: number; landed: boolean } | null;
}

/** A cat eats fish `index`: munch, hearts, gone. */
export function eatFish(index: number) {
  const rb = bodies[index]?.();
  if (!rb || !fishing.fish[index]?.active) return;
  const t = rb.translation();
  emit('heart', [t.x, t.y + 0.6, t.z], { count: 8, color: ['#ff4d8d', '#ff8fb5'], speed: 2, up: 2.5 });
  playChomp([t.x, t.y, t.z]);
  fishing.eaten += 1;
  goAway[index]?.();
}

/** The fish (for tests): who has caught how many, slaps, and the pool. */
export const fishing = { fish: [] as Fish[], bites: 0, licks: 0, slaps: 0, swamOff: 0, wentHome: 0, eaten: 0, tries: new Map<number, { n: number; at: number }>() };

function FishBody({ index }: { index: number }) {
  const body = useRef<RapierRigidBody>(null);
  const id = useMemo(() => allocPropId(), []);
  const state = useMemo<Fish>(() => ({ active: false, since: 0, wetFor: 0, flopAt: 0, thrower: null, slapped: new Set(), color: index % COLORS.length }), [index]);
  const entry = useRef<PropEntry | null>(null);
  const rand = useMemo(() => seededRandom(0xf15 + index * 7919), [index]);
  const away = useMemo(() => new THREE.Vector3(0, -60 - index * 2, 0), [index]);

  useEffect(() => {
    fishing.fish[index] = state;
    const e: PropEntry = {
      id,
      kind: 'fish',
      getBody: () => body.current,
      radius: R + 0.08,
      launch: 9,
      heavy: false,
      grabbable: true,
      enabled: false,
      heldBy: null,
      onGrab: (slot) => {
        state.thrower = slot;
        state.slapped.clear();
        playBounce(body.current?.translation(), 0.9);
      }
    };
    entry.current = e;
    entries[index] = e;
    bodies[index] = () => body.current;
    // (a fish waiting in the pool is switched off: no falling forever under the park)
    body.current?.setEnabled(false);
    return registerProp(e);
  }, [id, index, state]);

  const putAway = () => {
    const rb = body.current;
    state.active = false;
    if (entry.current) {
      entry.current.enabled = false;
      entry.current.heldBy = null;
    }
    if (rb) {
      rb.setTranslation(away, false);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
      rb.setEnabled(false);
    }
  };

  goAway[index] = putAway;

  // the fishing hands this fish out: leap from the water at `from` to land at `to`
  useEffect(() => {
    leaps[index] = (from, to) => {
      const rb = body.current;
      const e = entry.current;
      if (!rb || !e) return;
      state.active = true;
      state.since = gameNow();
      state.wetFor = 0;
      state.flopAt = gameNow() + 1500;
      state.thrower = null;
      state.slapped.clear();
      e.enabled = true;
      e.heldBy = null;
      // up over the licker's head and down on the bank
      rb.setEnabled(true);
      const apex = Math.max(from.y, to.y) + 2.6;
      const up = Math.sqrt(2 * G * (apex - from.y));
      const t = up / G + Math.sqrt((2 * (apex - to.y)) / G);
      rb.setTranslation(from, true);
      rb.setLinvel({ x: (to.x - from.x) / t, y: up, z: (to.z - from.z) / t }, true);
      rb.setAngvel({ x: (rand() - 0.5) * 14, y: (rand() - 0.5) * 6, z: (rand() - 0.5) * 14 }, true);
      emit('drop', [from.x, from.y + 0.1, from.z], { count: 12, color: ['#7fd3ff', '#ffffff'], speed: 2.5, up: 4, size: 0.12 });
      playSplash(from, false);
    };
  }, [state, rand, index]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    const e = entry.current;
    if (!rb || !e || !state.active) return;
    if (e.heldBy == null) liftIfUnder(rb, R);
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    const t = rb.translation();
    const v = rb.linvel();
    if (e.heldBy != null) {
      state.since = now;
      return;
    }

    // back in the water: off it swims
    const wet = isInWater(t.x, t.z) && t.y < waterLevelAt(t.x, t.z) + 0.3;
    state.wetFor = wet ? state.wetFor + dt : 0;
    if (state.wetFor > SWIM_OFF) {
      const level = waterLevelAt(t.x, t.z);
      emit('drop', [t.x, level + 0.1, t.z], { count: 10, color: ['#7fd3ff', '#ffffff'], speed: 2, up: 3, size: 0.1 });
      ring([t.x, level + 0.04, t.z], { color: '#e0f6ff', radius: 0.8, duration: 0.5 });
      playSplash([t.x, t.y, t.z], false);
      fishing.swamOff += 1;
      putAway();
      return;
    }

    // thrown at a friend: SLAP
    const speed = Math.hypot(v.x, v.y, v.z);
    if (state.thrower != null && speed > SLAP_SPEED) {
      for (const p of players.values()) {
        // (a generous body-sized cylinder: a thrown fish is on a high arc)
        if (p.slot === state.thrower || state.slapped.has(p.slot) || Math.hypot(p.position.x - t.x, p.position.z - t.z) > 0.8 || t.y < p.position.y - 0.6 || t.y > p.position.y + 1.1) continue;
        state.slapped.add(p.slot);
        fishing.slaps += 1;
        p.bump(new THREE.Vector3(v.x, 0, v.z).normalize());
        playSplat(p.position);
        emit('star', [p.position.x, p.position.y + 0.7, p.position.z], { count: 10, color: ['#ffd23f', '#ffffff', COLORS[state.color]], speed: 3, up: 2 });
        const thrower = players.get(state.thrower);
        if (thrower && !thrower.bot && !p.bot) earnSticker('fishslap');
      }
    }
    if (speed < 2) state.thrower = null;

    // flopping about on the ground
    const low = t.y - groundHeight(t.x, t.z) < R + 0.2;
    if (low && !wet && speed < 1.5 && now >= state.flopAt) {
      state.flopAt = now + 450 + rand() * 600;
      // a random way, but uphill on a slope (so a fish on the beach doesn't just roll back in)
      const gx = groundHeight(t.x + 0.5, t.z) - groundHeight(t.x - 0.5, t.z);
      const gz = groundHeight(t.x, t.z + 0.5) - groundHeight(t.x, t.z - 0.5);
      const a = rand() * Math.PI * 2;
      const up = Math.hypot(gx, gz) > 0.02 ? 1.2 / Math.hypot(gx, gz) : 0;
      rb.setLinvel({ x: Math.sin(a) * 1.4 + gx * up, y: 3 + rand() * 1.2, z: Math.cos(a) * 1.4 + gz * up }, true);
      rb.setAngvel({ x: (rand() - 0.5) * 16, y: (rand() - 0.5) * 8, z: (rand() - 0.5) * 16 }, true);
      playBounce([t.x, t.y, t.z], 0.95);
    }
    // been flopping about long enough (or fallen out of the park): home it goes
    if (now - state.since > LAND_TIME * 1000 || t.y < -10) {
      poof([t.x, t.y, t.z], COLORS[state.color], 8);
      playPoof([t.x, t.y, t.z]);
      fishing.wentHome += 1;
      putAway();
    }
  });

  const c = COLORS[state.color];
  return (
    <RigidBody ref={body} colliders={false} position={away} linearDamping={0.1} angularDamping={2.5} ccd>
      <BallCollider args={[R]} density={0.6} friction={0.6} restitution={0.4} />
      <group scale={0.95}>
        <mesh castShadow scale={[0.55, 0.75, 1.25]} material={lambert(c)}>
          <sphereGeometry args={[R, 12, 9]} />
        </mesh>
        <mesh position={[0, 0, -R * 1.45]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.25, 1, 1]} material={lambert(c)}>
          <coneGeometry args={[R * 0.8, R * 0.9, 4]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * R * 0.42, R * 0.25, R * 0.75]} material={lambert('#111111')}>
            <sphereGeometry args={[R * 0.12, 6, 5]} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  );
}

export function Fishing() {
  debugInfo.fishing = fishing;
  useHint([FISHING_SPOT[0], groundHeight(FISHING_SPOT[0], FISHING_SPOT[1]) + 0.8, FISHING_SPOT[1] + 1.2], 'lick', 4);
  useEffect(() => {
    const rand = seededRandom(0xf1);
    spawners.fishLick = (slot, at, fwd) => {
      fishing.licks += 1;
      const now = gameNow();
      const prev = fishing.tries.get(slot);
      const n = prev && now - prev.at < BITE_WINDOW ? prev.n : 0;
      if (rand() >= BITE[Math.min(n, BITE.length - 1)]) {
        fishing.tries.set(slot, { n: n + 1, at: now });
        emit('drop', [at.x, at.y + 0.05, at.z], { count: 4, color: ['#7fd3ff', '#ffffff'], speed: 1, up: 1.5, size: 0.08 });
        return;
      }
      fishing.tries.delete(slot);
      // a free fish (or the one that's been out longest)
      let free = fishing.fish.findIndex((f) => f && !f.active);
      if (free < 0) free = fishing.fish.reduce((best, f, i) => (f && f.since < fishing.fish[best].since ? i : best), 0);
      const p = players.get(slot);
      if (!leaps[free] || !p) return;
      // up over the licker's head and down on the bank just behind them
      const to = new THREE.Vector3(p.position.x - fwd.x * 2.6, 0, p.position.z - fwd.z * 2.6);
      to.y = groundHeight(to.x, to.z) + R;
      leaps[free](new THREE.Vector3(at.x, at.y + 0.1, at.z), to);
      fishing.bites += 1;
      if (!p.bot) earnSticker('fish');
    };
    return () => {
      spawners.fishLick = () => {};
    };
  }, []);
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <FishBody key={i} index={i} />
      ))}
    </>
  );
}
