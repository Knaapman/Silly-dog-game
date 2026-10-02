import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoing, playWhoosh } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { emit } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { distXZ, SWINGS } from '../layout';
import { lambert } from '../materials';
import { RADIUS } from '../player/constants';
import { debugInfo, players, registerStatic, rider, type PlayerRuntime } from '../runtime';
import { earnSticker } from '../stickers';
import { amplitude, fling, pushSwing, seatOffset, seatSpeed, stepSwing, SWING_LENGTH, SWING_PIVOT, type Swing } from '../swing';
import { groundHeight } from '../terrain';
import { StaticBox, useHint } from './common';

// The swings, on the playground's east side: a seat for each child. Walk into one and sit;
// push the stick (any way) and it swings higher and higher. A friend can headbutt the seat for
// a big push (so can a snowball). Jump and you fly off the way the seat is going: at the top of
// a big forwards swing, a long way. A seat swinging hard bonks anyone standing in its way.
// Playing alone, the buddy comes round behind you and gives you pushes (with a little hop).

/** The rider sits this far below the beam (the seat, less half an animal). */
const SIT = SWING_LENGTH - RADIUS - 0.08;
/** Close enough to a seat to sit on it (m), and only when it's swinging slower than this (m/s). */
const BOARD_REACH = 0.8;
const BOARD_SPEED = 2.5;
/** Seconds after jumping off before you can sit again (you might land back on it). */
const REBOARD = 1.2;
/** A seat swinging faster than this (m/s) bonks someone standing in its way, this close. */
const KNOCK_SPEED = 3.5;
const KNOCK_REACH = 0.9;
/** Jumping off swinging at least this high (rad) earns the sticker. */
const STICKER_SWING = (40 * Math.PI) / 180;
/** The buddy pushes until the swing goes this high (rad), each push this strong (rad/s). */
const BUDDY_MAX = (50 * Math.PI) / 180;
const BUDDY_PUSH = 1.2;
/** Seconds sitting before the buddy comes to push, and how long it may take to get there. */
const BUDDY_AFTER = 0.6;
const BUDDY_GIVE_UP = 8;
const SEAT_COLORS = ['#ff4d5e', '#3b82f6', '#22c55e', '#ffd23f'];

type Seat = Swing & { rider: number | null; since: number; prev: number; knocked: Map<number, number>; lastWhoosh: number };

/** The buddy pushing a child on a swing: where to stand (read by the buddy's brain). */
export const swingHelp = { slot: null as number | null, seat: -1, spot: new THREE.Vector3(), since: 0, nextTry: 0, pushes: 0 };

export function Swings() {
  const [cx, cz] = SWINGS.center;
  const g = groundHeight(cx, cz);
  const xs = useMemo(() => Array.from({ length: SWINGS.seats }, (_, i) => cx + (i - (SWINGS.seats - 1) / 2) * SWINGS.spacing), [cx]);
  const st = useRef({
    seats: xs.map((): Seat => ({ theta: 0, omega: 0, rider: null, since: 0, prev: 0, knocked: new Map(), lastWhoosh: 0 })),
    offAt: new Map<number, number>(),
    rides: 0,
    flights: 0,
    pushes: 0,
    friendPushes: 0,
    knocks: 0,
    last: null as null | { amp: number; along: number; seat: number }
  });
  debugInfo.swings = st.current;
  debugInfo.swingHelp = swingHelp;
  const arms = useRef<(THREE.Group | null)[]>([]);
  const tmp = useMemo(() => ({ seat: new THREE.Vector3(), target: new THREE.Vector3() }), []);
  const seatAt = (i: number, out: THREE.Vector3, down = SWING_LENGTH) => {
    const [along, up] = seatOffset(st.current.seats[i], down);
    return out.set(xs[i], g + SWING_PIVOT + up, cz + along);
  };
  useHint([cx, g + 1, cz], 'walk', 5);

  // a headbutt (or a snowball) on a seat: a big push, the way it was pushed
  const bonkSpots = useMemo(() => xs.map((x) => new THREE.Vector3(x, g + SWING_PIVOT - SWING_LENGTH, cz)), [xs, g, cz]);
  useEffect(() => {
    const offs = xs.map((_, i) =>
      registerStatic({
        id: 9700 + i,
        position: bonkSpots[i],
        radius: 0.5,
        onBonk: (slot, dir) => {
          const z = st.current;
          const s = z.seats[i];
          const from = players.get(slot);
          const way = Math.abs(dir.z) > 0.3 ? Math.sign(dir.z) : from ? Math.sign(bonkSpots[i].z - from.position.z) || 1 : 1;
          pushSwing(s, way);
          z.pushes += 1;
          const on = rider(s.rider);
          if (on && on.slot !== slot && from && !from.bot && !on.bot) {
            z.friendPushes += 1;
            earnSticker('swingpush');
          }
          playBoing(bonkSpots[i], 1.2);
          emit('star', bonkSpots[i], { count: 8, color: ['#ffd23f', '#ffffff', SEAT_COLORS[i % 4]], speed: 3, up: 2 });
        }
      })
    );
    return () => offs.forEach((off) => off());
  }, [xs, bonkSpots]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const z = st.current;
    const now = gameNow();
    const onASwing = (p: PlayerRuntime) => z.seats.some((s) => s.rider === p.slot);

    z.seats.forEach((s, i) => {
      // sit down: walk into a seat that isn't swinging much
      if (s.rider == null && seatSpeed(s) < BOARD_SPEED) {
        seatAt(i, tmp.seat);
        for (const p of players.values()) {
          if (p.bot || p.isLaunched() || p.flopped || p.ridingOn != null || p.grabbedBy != null || onASwing(p)) continue;
          if (now - (z.offAt.get(p.slot) ?? -1e9) < REBOARD * 1000) continue;
          if (distXZ(p.position.x, p.position.z, tmp.seat.x, tmp.seat.z) > BOARD_REACH) continue;
          if (p.position.y > tmp.seat.y + 1.3 || p.position.y < g - 0.5) continue;
          s.rider = p.slot;
          s.since = now;
          z.rides += 1;
          playBoing(tmp.seat, 0.8);
          rumble(p.source as SourceId, 0.3, 0.3, 120);
          break;
        }
      }

      // swing: pumping while the rider holds the stick
      const p = rider(s.rider);
      if (s.rider != null && !p) s.rider = null;
      const input = p ? getInput(p.source as SourceId) : null;
      const pump = !!input && Math.hypot(input.x, input.z) > 0.35;
      s.prev = s.omega;
      stepSwing(s, dt, pump, !!p, input && Math.abs(input.z) > 0.3 ? Math.sign(input.z) : 1);
      if (Math.abs(s.theta) < 0.15 && Math.abs(s.omega) > 2.6 && now - s.lastWhoosh > 600) {
        s.lastWhoosh = now;
        playWhoosh(bonkSpots[i]);
      }
      seatAt(i, bonkSpots[i]);

      if (p && input) {
        seatAt(i, tmp.seat, SIT);
        if (input.pressed.jump) {
          // off! along the way the seat is going
          const amp = amplitude(s);
          const ground = groundHeight(tmp.seat.x, tmp.seat.z);
          const f = fling(s, tmp.seat.y - ground - RADIUS - 0.1);
          tmp.target.set(tmp.seat.x, 0, tmp.seat.z + f.along);
          tmp.target.y = groundHeight(tmp.target.x, tmp.target.z);
          p.hold(null);
          p.launchTo(tmp.target, ground + f.apex + RADIUS);
          s.rider = null;
          z.offAt.set(p.slot, now);
          z.flights += 1;
          z.last = { amp, along: f.along, seat: i };
          if (amp >= STICKER_SWING) {
            earnSticker('swing');
            emit('confetti', tmp.seat, { count: 18, speed: 4, up: 4 });
          }
        } else {
          p.hold(tmp.seat, false, 0);
          if (amplitude(s) > 1 && Math.random() < dt * 4) emit('star', tmp.seat, { count: 1, color: ['#ffd23f', '#ffffff'], speed: 1, up: 0.5, size: 0.12, life: 0.6 });
        }
      }

      // swinging hard into someone standing in the way: boing!
      if (seatSpeed(s) > KNOCK_SPEED) {
        seatAt(i, tmp.seat, SIT);
        for (const o of players.values()) {
          if (o.slot === s.rider || o.isLaunched() || onASwing(o) || now < (s.knocked.get(o.slot) ?? 0)) continue;
          if (o.position.distanceTo(tmp.seat) > KNOCK_REACH + RADIUS) continue;
          s.knocked.set(o.slot, now + 1000);
          z.knocks += 1;
          o.bump(new THREE.Vector3(0, 0, Math.sign(s.omega)));
          emit('star', [o.position.x, o.position.y + 0.6, o.position.z], { count: 8, color: ['#ffd23f', '#ffffff'], speed: 3, up: 2 });
        }
      }

      const arm = arms.current[i];
      if (arm) arm.rotation.x = -s.theta;
    });

    buddyPushes(z.seats, xs, g, cz, now);
  });

  const legTilt = Math.atan2(1.7, SWING_PIVOT);
  const legLen = Math.hypot(1.7, SWING_PIVOT);
  const ends = [xs[0] - SWINGS.spacing / 2 - 0.2, (xs[0] + xs[xs.length - 1]) / 2, xs[xs.length - 1] + SWINGS.spacing / 2 + 0.2];
  return (
    <group>
      {/* the frame: an A at each end and one in the middle, and the beam along the top */}
      {ends.map((x) =>
        [-1, 1].map((side) => (
          <StaticBox
            key={`${x}${side}`}
            position={[x, g + SWING_PIVOT / 2, cz + (side * 1.7) / 2]}
            size={[0.2, legLen, 0.2]}
            rotation={[-side * legTilt, 0, 0]}
            color="#e11d48"
          />
        ))
      )}
      <mesh castShadow position={[cx, g + SWING_PIVOT, cz]} rotation={[0, 0, Math.PI / 2]} material={lambert('#ffd23f')}>
        <cylinderGeometry args={[0.13, 0.13, ends[2] - ends[0] + 0.4, 10]} />
      </mesh>
      {/* the seats on their chains, each one swinging from the beam */}
      {xs.map((x, i) => (
        <group
          key={i}
          ref={(gr) => {
            arms.current[i] = gr;
          }}
          position={[x, g + SWING_PIVOT, cz]}
        >
          {[-0.42, 0.42].map((dx) => (
            <mesh key={dx} position={[dx, -SWING_LENGTH / 2, 0]} material={lambert('#94a3b8')}>
              <cylinderGeometry args={[0.025, 0.025, SWING_LENGTH, 5]} />
            </mesh>
          ))}
          <mesh castShadow position={[0, -SWING_LENGTH, 0]} material={lambert(SEAT_COLORS[i % SEAT_COLORS.length])}>
            <boxGeometry args={[0.95, 0.09, 0.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Playing alone: when the child sits on a swing, the buddy comes round behind it and pushes
 * each time the seat comes back to it (a hop and a boing), until it's swinging nicely.
 */
function buddyPushes(seats: Seat[], xs: number[], g: number, cz: number, now: number) {
  const h = swingHelp;
  const buddy = h.slot != null ? players.get(h.slot) : undefined;
  const seat = h.seat >= 0 ? seats[h.seat] : undefined;
  const kid = seat ? rider(seat.rider) : undefined;
  if (h.slot != null && (!buddy || !buddy.bot || !kid || kid.bot)) {
    h.slot = null;
    h.seat = -1;
  }
  if (h.slot == null) {
    if (now < h.nextTry) return;
    const i = seats.findIndex((s) => {
      const k = rider(s.rider);
      return k && !k.bot && now - s.since > BUDDY_AFTER * 1000;
    });
    if (i < 0) return;
    for (const p of players.values()) {
      if (!p.bot || p.isLaunched() || p.ridingOn != null || p.grabbedBy != null || p.flopped) continue;
      if (distXZ(p.position.x, p.position.z, xs[i], cz) > 30) continue;
      h.slot = p.slot;
      h.seat = i;
      h.since = now;
      break;
    }
    if (h.slot == null) return;
  }
  const s = seats[h.seat];
  const b = players.get(h.slot!)!;
  // stand just behind where the seat swings back to (further back as it swings higher)
  const amp = amplitude(s);
  h.spot.set(xs[h.seat], g, cz - SWING_LENGTH * Math.sin(Math.min(amp, BUDDY_MAX)) - 1.05);
  const there = distXZ(b.position.x, b.position.z, h.spot.x, h.spot.z) < 0.7 && !b.isLaunched();
  if (!there) {
    if (now - h.since > BUDDY_GIVE_UP * 1000) {
      // can't get there: try again later
      h.slot = null;
      h.seat = -1;
      h.nextTry = now + 10000;
    }
    return;
  }
  h.since = now;
  // the seat has come back to us (it's stopped at the back, or it's hanging still): push!
  const back = s.prev < 0 && s.omega >= 0 && s.theta < 0;
  const still = amp < 0.04;
  if ((back || still) && amp < BUDDY_MAX && b.grounded) {
    pushSwing(s, 1, BUDDY_PUSH);
    h.pushes += 1;
    b.hop(4);
    playBoing(b.position, 1.1);
    emit('star', [b.position.x, b.position.y + 0.6, b.position.z + 0.6], { count: 6, color: ['#ffd23f', '#ffffff'], speed: 2, up: 1.5 });
  }
}
