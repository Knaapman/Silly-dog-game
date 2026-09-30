import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playSlideWhistle, playWhoosh } from '../audio';
import { useGameFrame } from '../clock';
import { emit } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { ZIPLINE } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players } from '../runtime';
import { earnSticker } from '../stickers';
import { groundHeight } from '../terrain';
import { StaticBox, StaticCylinder, useHint } from './common';

// The zipline: step onto the platform on the mountain's south rim and grab the handle, and off
// you go, whizzing over the whole park, faster and faster, down to the lagoon, where you let go
// with a splash. Jump to let go sooner (wherever you are!). The handle slides back up by itself.

/** How far under the cable a rider hangs. */
const HANG = 1.35;
const START_SPEED = 3;
const MAX_SPEED = 13;
const ACCEL = 3.5;
/** Seconds for the empty handle to slide back up to the top. */
const RETURN_TIME = 5;

type Mode = 'wait' | 'ride' | 'return';
type ZipState = { mode: Mode; t: number; v: number; rider: number | null };

export function Zipline() {
  const [ax, az] = ZIPLINE.from;
  const [bx, bz] = ZIPLINE.to;
  const deck = groundHeight(ax, az) + ZIPLINE.platform;
  const a = useMemo(() => new THREE.Vector3(ax, deck + ZIPLINE.cable, az), [ax, az, deck]);
  const b = useMemo(() => new THREE.Vector3(bx, ZIPLINE.endHeight, bz), [bx, bz]);
  const length = a.distanceTo(b);
  const dir = useMemo(() => b.clone().sub(a).normalize(), [a, b]);
  const facing = Math.atan2(dir.x, dir.z);
  const st = useRef<ZipState>({ mode: 'wait', t: 0, v: 0, rider: null });
  debugInfo.zipline = st.current;
  const handle = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), seat: new THREE.Vector3() }), []);
  useHint([ax, deck + 0.6, az], 'walk', 3);

  // the cable: one long thin cylinder from a to b
  const cable = useMemo(() => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { mid, q };
  }, [a, b, dir]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    if (s.mode === 'wait') {
      // step up to the handle and grab it
      players.forEach((p) => {
        if (s.mode !== 'wait' || p.bot || p.isLaunched() || p.flopped || p.ridingOn != null || p.grabbedBy != null) return;
        if (Math.hypot(p.position.x - a.x, p.position.z - a.z) > 1.2 || p.position.y < deck || p.position.y > deck + 2.2) return;
        s.mode = 'ride';
        s.rider = p.slot;
        s.t = 0;
        s.v = START_SPEED;
        playSlideWhistle('down', p.position);
        rumble(p.source as SourceId, 0.4, 0.4, 200);
      });
    } else if (s.mode === 'ride') {
      const p = s.rider != null ? players.get(s.rider) : undefined;
      const letGo = (hop: number) => {
        p?.hold(null);
        if (p) p.hop(hop);
        s.mode = 'return';
        s.rider = null;
      };
      if (!p) {
        letGo(0);
      } else {
        s.v = Math.min(MAX_SPEED, s.v + ACCEL * dt);
        s.t = Math.min(1, s.t + (s.v * dt) / length);
        tmp.p.copy(a).lerp(b, s.t);
        tmp.seat.copy(tmp.p);
        tmp.seat.y -= HANG;
        p.hold(tmp.seat, false, facing);
        if (Math.random() < dt * 6) emit('star', [tmp.p.x, tmp.p.y, tmp.p.z], { count: 1, color: ['#ffd23f', '#ffffff'], speed: 1, up: 0.5, size: 0.12, life: 0.6 });
        if (s.t >= 1) {
          // the end, over the lagoon: let go, splash
          earnSticker('zipline');
          playWhoosh(p.position);
          letGo(4);
        } else if (getInput(p.source as SourceId).pressed.jump) {
          if (s.t > 0.5) earnSticker('zipline');
          letGo(5);
        }
      }
    } else {
      s.t = Math.max(0, s.t - dt / RETURN_TIME);
      if (s.t <= 0) s.mode = 'wait';
    }
    const h = handle.current;
    if (h) {
      h.position.copy(a).lerp(b, s.t);
      h.rotation.set(0, facing, 0);
    }
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
        <cylinderGeometry args={[0.035, 0.035, length, 5]} />
      </mesh>
      {/* the handle: a little pulley and a bar to hang on */}
      <group ref={handle} position={a}>
        <mesh material={lambert('#ffd23f')}>
          <sphereGeometry args={[0.16, 10, 8]} />
        </mesh>
        <mesh position={[0, -0.55, 0]} material={lambert('#94a3b8')}>
          <cylinderGeometry args={[0.03, 0.03, 1, 5]} />
        </mesh>
        <mesh position={[0, -1.05, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#ff4d5e')}>
          <cylinderGeometry args={[0.06, 0.06, 0.8, 8]} />
        </mesh>
      </group>
    </>
  );
}
