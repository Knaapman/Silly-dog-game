import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playSlideWhistle, playWhoosh } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PLAYER_COLORS } from '../config';
import { emit } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { ZIPLINE } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, rider } from '../runtime';
import { earnSticker } from '../stickers';
import { groundHeight } from '../terrain';
import { StaticBox, StaticCylinder, useHint } from './common';
import { randomStream } from '../rng';

const random = randomStream('zipline');

// The zipline: step onto the platform on the mountain's south rim and grab a handle, and off
// you go, whizzing over the whole park, faster and faster, down to the lagoon, where you let go
// with a splash. Jump to let go sooner (wherever you are!). An empty handle slides back up by
// itself. There's a handle for every child, so friends can go one after the other in a line.

/** How far under the cable a rider hangs. */
const HANG = 1.35;
const START_SPEED = 3;
const MAX_SPEED = 13;
const ACCEL = 3.5;
/** Seconds for an empty handle to slide back up to the top (from the bottom). */
const RETURN_TIME = 5;
/** One handle for each child. */
const HANDLES = 4;
/** Seconds between one rider setting off and the next (so they don't bump into each other). */
const GAP = 0.8;
/** Seconds after letting go before you can grab a handle again (a jump off at the top lands you back on the platform). */
const REGRAB = 1.5;
/** Waiting handles hang one behind the other at the top, this far apart. */
const QUEUE_STEP = 0.3;
/** The cable runs back this far past where rides start, to the frame. */
const BACK = 1.1;

type Mode = 'wait' | 'ride' | 'return';
type Handle = { mode: Mode; t: number; v: number; rider: number | null };

export function Zipline() {
  const [ax, az] = ZIPLINE.from;
  const [bx, bz] = ZIPLINE.to;
  const deck = groundHeight(ax, az) + ZIPLINE.platform;
  const a = useMemo(() => new THREE.Vector3(ax, deck + ZIPLINE.cable, az), [ax, az, deck]);
  const b = useMemo(() => new THREE.Vector3(bx, ZIPLINE.endHeight, bz), [bx, bz]);
  const length = a.distanceTo(b);
  const dir = useMemo(() => b.clone().sub(a).normalize(), [a, b]);
  const facing = Math.atan2(dir.x, dir.z);
  const st = useRef({ handles: Array.from({ length: HANDLES }, (): Handle => ({ mode: 'wait', t: 0, v: 0, rider: null })), lastStart: -1e9, letGoAt: new Map<number, number>(), rides: 0, together: 0 });
  debugInfo.zipline = st.current;
  const handles = useRef<(THREE.Group | null)[]>([]);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), seat: new THREE.Vector3() }), []);
  useHint([ax, deck + 0.6, az], 'walk', 3);

  // the cable: one long thin cylinder from the frame (just behind a, where the handles wait) to b
  const cable = useMemo(() => {
    const top = a.clone().addScaledVector(dir, -BACK);
    const mid = top.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { mid, q, length: top.distanceTo(b) };
  }, [a, b, dir]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const z = st.current;
    const now = gameNow();
    const riding = (slot: number) => z.handles.some((h) => h.mode === 'ride' && h.rider === slot);

    // step up to a handle and grab it (one child at a time, a moment apart)
    if (now - z.lastStart >= GAP * 1000) {
      for (const p of players.values()) {
        const free = z.handles.find((h) => h.mode === 'wait');
        if (!free) break;
        if (p.bot || p.isLaunched() || p.flopped || p.ridingOn != null || p.grabbedBy != null || riding(p.slot)) continue;
        if (now - (z.letGoAt.get(p.slot) ?? -1e9) < REGRAB * 1000) continue;
        if (Math.hypot(p.position.x - a.x, p.position.z - a.z) > 1.2 || p.position.y < deck || p.position.y > deck + 2.2) continue;
        free.mode = 'ride';
        free.rider = p.slot;
        free.t = 0;
        free.v = START_SPEED;
        z.lastStart = now;
        z.rides += 1;
        if (z.handles.filter((h) => h.mode === 'ride').length >= 2) z.together += 1;
        playSlideWhistle('down', p.position);
        rumble(p.source as SourceId, 0.4, 0.4, 200);
        break;
      }
    }

    let queued = 0;
    z.handles.forEach((h, i) => {
      if (h.mode === 'ride') {
        const p = rider(h.rider);
        const letGo = (hop: number) => {
          if (p) {
            p.hold(null);
            p.hop(hop);
            z.letGoAt.set(p.slot, now);
          }
          h.mode = 'return';
          h.rider = null;
        };
        if (!p) letGo(0);
        else {
          h.v = Math.min(MAX_SPEED, h.v + ACCEL * dt);
          h.t = Math.min(1, h.t + (h.v * dt) / length);
          tmp.p.copy(a).lerp(b, h.t);
          tmp.seat.copy(tmp.p);
          tmp.seat.y -= HANG;
          p.hold(tmp.seat, false, facing);
          if (random() < dt * 6) emit('star', [tmp.p.x, tmp.p.y, tmp.p.z], { count: 1, color: ['#ffd23f', '#ffffff'], speed: 1, up: 0.5, size: 0.12, life: 0.6 });
          if (h.t >= 1) {
            // the end, over the lagoon: let go, splash
            earnSticker('zipline');
            playWhoosh(p.position);
            letGo(4);
          } else if (getInput(p.source as SourceId).pressed.jump) {
            if (h.t > 0.5) earnSticker('zipline');
            letGo(5);
          }
        }
      } else if (h.mode === 'return') {
        h.t = Math.max(0, h.t - dt / RETURN_TIME);
        if (h.t <= 0) h.mode = 'wait';
      }
      const g = handles.current[i];
      if (g) {
        // a waiting handle hangs in the line at the top; the next one to go is at the front
        const back = h.mode === 'wait' ? queued++ * QUEUE_STEP : 0;
        g.position.copy(a).lerp(b, h.t).addScaledVector(dir, -back);
        g.rotation.set(0, facing, 0);
      }
    });
  });

  const g = groundHeight(ax, az);
  const endFloor = -0.8;
  return (
    <>
      {/* the platform on the rim, a step up, with a frame holding the cable */}
      <StaticBox position={[ax, g + ZIPLINE.platform / 2 - 0.2, az]} size={[3, ZIPLINE.platform + 0.4, 3]} color="#b7793f" />
      {[-1, 1].map((s) => (
        <StaticCylinder key={s} position={[ax + s * 1.2, deck + ZIPLINE.cable / 2 + 0.3, az - 1.1]} radius={0.14} height={ZIPLINE.cable + 0.6} color="#8d5a36" segments={8} />
      ))}
      <mesh position={[ax, deck + ZIPLINE.cable + 0.3, az - 1.1]} rotation={[0, 0, Math.PI / 2]} material={lambert('#8d5a36')}>
        <cylinderGeometry args={[0.12, 0.12, 2.6, 8]} />
      </mesh>
      {/* the pole in the lagoon */}
      <StaticCylinder position={[bx, (endFloor + ZIPLINE.endHeight + 0.4) / 2, bz]} radius={0.22} height={ZIPLINE.endHeight + 0.4 - endFloor} color="#8d5a36" segments={10} />
      {/* the cable */}
      <mesh position={cable.mid} quaternion={cable.q} material={lambert('#475569')}>
        <cylinderGeometry args={[0.035, 0.035, cable.length, 5]} />
      </mesh>
      {/* the handles: a little pulley and a bar to hang on, each in a child's colour */}
      {PLAYER_COLORS.slice(0, HANDLES).map((color, i) => (
        <group
          key={i}
          ref={(g) => {
            handles.current[i] = g;
          }}
          position={a}
        >
          <mesh material={lambert('#ffd23f')}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
          <mesh position={[0, -0.55, 0]} material={lambert('#94a3b8')}>
            <cylinderGeometry args={[0.03, 0.03, 1, 5]} />
          </mesh>
          <mesh position={[0, -1.05, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert(color)}>
            <cylinderGeometry args={[0.06, 0.06, 0.8, 8]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
