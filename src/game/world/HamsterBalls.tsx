import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoing, playPoof } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { HAMSTER_GROUPS } from '../collision';
import { emit, poof } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { HAMSTER } from '../layout';
import { lambert } from '../materials';
import { RADIUS } from '../player/constants';
import { allocPropId, debugInfo, players, registerProp, rider, type PlayerRuntime, type PropEntry } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { useHint } from './common';

// Hamster balls: four giant clear balls in a row at the top of the bowling lane. Walk into one and
// you're inside; push the stick and it rolls (down the lane into the pins!). Roll into a friend
// on foot and they get bonked; roll into a friend's ball and you both bounce off with a boing.
// Jump to climb out. It floats in the water, a headbutt sends it rolling, and an empty one left
// somewhere rolls itself home (well: pops back) after a while. Playing alone, the buddy gets in
// the next ball and rolls after you.

const R = HAMSTER.radius;
/** The stick's push (m/s²), up to this speed (m/s); downhill it goes faster by itself. */
const DRIVE = 10;
const TOP = 8;
/** Only a ball rolling slower than this can be climbed into (m/s). */
const BOARD_SPEED = 3;
/** Seconds after climbing out before you can climb back in (you might land in it again). */
const REBOARD = 1.2;
/** A ball rolling faster than this bonks animals on foot (m/s); two balls meeting faster than BUMP_SPEED boing. */
const KNOCK_SPEED = 4;
const BUMP_SPEED = 2.5;
/** Seconds empty, away from its place in the row, before it pops home. */
const HOME_AFTER = 25;
/** Rolled this far in a ball (m): a sticker. */
const STICKER_ROLL = 15;
const RING_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#ffd23f'];

type BallState = { rider: number | null; home: THREE.Vector3; emptySince: number; rolled: number; facing: number; knocked: Map<number, number>; body: () => RapierRigidBody | null };

/** All the balls, for each other (bumps, who's in which) and for tests. */
export const hamster = { balls: [] as BallState[], offAt: new Map<number, number>(), rides: 0, bumps: 0, friendBumps: 0, knocks: 0, homes: 0, pairBump: new Map<string, number>() };

const inABall = (slot: number) => hamster.balls.some((b) => b.rider === slot);
const kidInABall = () => hamster.balls.some((b) => b.rider != null && !rider(b.rider)?.bot);

function HamsterBall({ index }: { index: number }) {
  const body = useRef<RapierRigidBody>(null);
  const id = useMemo(() => allocPropId(), []);
  const home = useMemo(() => {
    const [x, z] = HAMSTER.homes[index];
    return new THREE.Vector3(x, groundHeight(x, z) + R + 0.02, z);
  }, [index]);
  const state = useMemo<BallState>(() => ({ rider: null, home, emptySince: 0, rolled: 0, facing: 0, knocked: new Map(), body: () => body.current }), [home]);
  const resetToken = useGame((s) => s.resetToken);
  const tmp = useMemo(() => ({ seat: new THREE.Vector3(), out: new THREE.Vector3() }), []);

  useEffect(() => {
    hamster.balls[index] = state;
    const entry: PropEntry = { id, kind: 'hamsterball', getBody: () => body.current, radius: R, launch: 7, heavy: false, grabbable: false, enabled: true, heldBy: null, onBonk: () => playBoing(body.current?.translation(), 0.7) };
    return registerProp(entry);
  }, [id, index, state]);

  const goHome = () => {
    const rb = body.current;
    if (!rb) return;
    const t = rb.translation();
    poof([t.x, t.y, t.z], '#ffffff', 12);
    rb.setTranslation(home, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    poof(home, '#ffffff', 12);
    playPoof(home);
    hamster.homes += 1;
  };

  const climbOut = (p: PlayerRuntime, t: { x: number; y: number; z: number }, now: number) => {
    state.rider = null;
    state.emptySince = now;
    hamster.offAt.set(p.slot, now);
    p.hold(null);
    const a = state.facing + Math.PI / 2;
    tmp.out.set(t.x + Math.sin(a) * (R + 0.9), 0, t.z + Math.cos(a) * (R + 0.9));
    tmp.out.y = groundHeight(tmp.out.x, tmp.out.z);
    p.launchTo(tmp.out.clone(), Math.max(t.y, tmp.out.y) + R + 0.8);
  };

  // the red button puts the park back: everyone out, and the balls home
  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    const p = rider(state.rider);
    if (p) p.hold(null);
    state.rider = null;
    goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    if (!rb) return;
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    const t = rb.translation();
    const v = rb.linvel();
    const speed = Math.hypot(v.x, v.z);

    // climb in: walk into one that's (nearly) still
    if (state.rider == null && speed < BOARD_SPEED) {
      for (const p of players.values()) {
        if (inABall(p.slot) || p.isLaunched() || p.flopped || p.ridingOn != null || p.grabbedBy != null) continue;
        if (p.bot && !kidInABall()) continue;
        if (now - (hamster.offAt.get(p.slot) ?? -1e9) < REBOARD * 1000) continue;
        if (Math.hypot(p.position.x - t.x, p.position.z - t.z) > R - 0.2 || Math.abs(p.position.y - t.y) > R) continue;
        state.rider = p.slot;
        state.rolled = 0;
        hamster.rides += 1;
        playBoing([t.x, t.y, t.z], 1.1);
        rumble(p.source as SourceId, 0.3, 0.3, 120);
        // playing alone: the buddy gets in the next free ball
        if (!p.bot) {
          const free = hamster.balls.find((b) => b && b !== state && b.rider == null);
          const fb = free?.body();
          if (free && fb) {
            const ft = fb.translation();
            for (const b of players.values()) {
              if (!b.bot || inABall(b.slot) || b.isLaunched() || b.ridingOn != null || Math.hypot(b.position.x - ft.x, b.position.z - ft.z) > 30) continue;
              b.launchTo(new THREE.Vector3(ft.x, groundHeight(ft.x, ft.z), ft.z), ft.y + R + 1.5);
            }
          }
        }
        break;
      }
    }

    const p = rider(state.rider);
    if (state.rider != null && !p) {
      state.rider = null;
      state.emptySince = now;
    }
    if (p) {
      const input = getInput(p.source as SourceId);
      const out = input.pressed.jump || (p.bot && !kidInABall());
      if (out) climbOut(p, t, now);
      else {
        // roll where the stick pushes (a little help turning, so it goes where it's told)
        const mag = Math.min(1, Math.hypot(input.x, input.z));
        if (mag > 0.15) {
          const dx = input.x / Math.max(mag, 1e-6);
          const dz = input.z / Math.max(mag, 1e-6);
          const along = v.x * dx + v.z * dz;
          const push = along < TOP * mag ? DRIVE * mag * dt : 0;
          const side = 1 - Math.min(1, 1.5 * dt);
          const px = v.x - along * dx;
          const pz = v.z - along * dz;
          rb.wakeUp();
          rb.setLinvel({ x: (along + push) * dx + px * side, y: v.y, z: (along + push) * dz + pz * side }, true);
        }
        if (speed > 0.6) state.facing = Math.atan2(v.x, v.z);
        state.rolled += speed * dt;
        if (!p.bot && state.rolled > STICKER_ROLL) earnSticker('hamster');
        tmp.seat.set(t.x, t.y - R + RADIUS + 0.06, t.z);
        p.hold(tmp.seat, false, state.facing);
      }
    }

    // rolling fast into someone on foot: bonk
    if (speed > KNOCK_SPEED) {
      tmp.out.set(t.x, t.y, t.z);
      for (const o of players.values()) {
        if (o.slot === state.rider || inABall(o.slot) || o.isLaunched() || now < (state.knocked.get(o.slot) ?? 0)) continue;
        if (o.position.distanceTo(tmp.out) > R + RADIUS + 0.1) continue;
        state.knocked.set(o.slot, now + 1000);
        hamster.knocks += 1;
        o.bump(new THREE.Vector3(v.x / speed, 0, v.z / speed));
        emit('star', [o.position.x, o.position.y + 0.6, o.position.z], { count: 8, color: ['#ffd23f', '#ffffff'], speed: 3, up: 2 });
      }
    }

    // two balls meeting: boing (the physics does the bouncing)
    hamster.balls.forEach((other, j) => {
      if (!other || j <= index) return;
      const ob = other.body();
      if (!ob) return;
      const o = ob.translation();
      const dx = o.x - t.x;
      const dy = o.y - t.y;
      const dz = o.z - t.z;
      const d = Math.hypot(dx, dy, dz);
      // (caught just before they touch: by the time this runs after a hit, they're already bouncing apart)
      if (d > 2 * R + 0.35 || d < 0.01) return;
      const ov = ob.linvel();
      const closing = ((v.x - ov.x) * dx + (v.y - ov.y) * dy + (v.z - ov.z) * dz) / d;
      const key = `${index}-${j}`;
      if (closing < BUMP_SPEED || now < (hamster.pairBump.get(key) ?? 0)) return;
      hamster.pairBump.set(key, now + 600);
      hamster.bumps += 1;
      const mid: [number, number, number] = [(t.x + o.x) / 2, (t.y + o.y) / 2, (t.z + o.z) / 2];
      playBoing(mid, 0.9);
      emit('star', mid, { count: 10, color: ['#ffd23f', '#ffffff', RING_COLORS[index % 4]], speed: 4, up: 2 });
      const a = rider(state.rider);
      const b = rider(other.rider);
      if (a && b && !a.bot && !b.bot) {
        hamster.friendBumps += 1;
        earnSticker('hamsterbump');
      }
    });

    // left somewhere empty for a while (or fallen out of the park): home it pops
    const away = Math.hypot(t.x - home.x, t.z - home.z);
    if (state.rider == null) {
      // (an empty ball that has all but stopped stays put: no creeping off down a slope you can't even see)
      if (speed < 0.2 && Math.abs(v.y) < 0.2 && !rb.isSleeping()) rb.sleep();
      if (away < 0.8) state.emptySince = now;
      const clear = ![...players.values()].some((o) => Math.hypot(o.position.x - home.x, o.position.z - home.z) < R + 0.6);
      if ((t.y < -8 || now - state.emptySince > HOME_AFTER * 1000) && clear) {
        goHome();
        state.emptySince = now;
      }
    }
  });

  const color = RING_COLORS[index % RING_COLORS.length];
  return (
    <RigidBody ref={body} colliders={false} position={home} linearDamping={0.35} angularDamping={0.6} ccd>
      <BallCollider args={[R]} density={0.4} friction={1.2} restitution={0.55} collisionGroups={HAMSTER_GROUPS} />
      {/* see-through shell, with two coloured hoops round it so you can see it roll */}
      <mesh renderOrder={2} material={SHELL}>
        <sphereGeometry args={[R, 24, 16]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={lambert(color)}>
        <torusGeometry args={[R, 0.05, 6, 32]} />
      </mesh>
      <mesh material={lambert(color)}>
        <torusGeometry args={[R, 0.05, 6, 32]} />
      </mesh>
    </RigidBody>
  );
}

const SHELL = new THREE.MeshLambertMaterial({ color: '#e0f4ff', transparent: true, opacity: 0.28, depthWrite: false });

export function HamsterBalls() {
  debugInfo.hamster = hamster;
  const [hx, hz] = HAMSTER.homes[0];
  useHint([hx - 2, groundHeight(hx, hz) + 1, hz], 'walk', 5);
  return (
    <>
      {HAMSTER.homes.map((_, i) => (
        <HamsterBall key={i} index={i} />
      ))}
    </>
  );
}
