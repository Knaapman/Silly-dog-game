import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoing, playFireBreath } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { makeCourse } from '../course';
import { emit } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { BALLOON, distXZ } from '../layout';
import { lambert } from '../materials';
import { canBoard, debugInfo, players, rider } from '../runtime';
import { earnSticker } from '../stickers';
import { groundHeight } from '../terrain';
import { useHint } from './common';
import { buddyMay } from '../settings';

// The hot air balloon on the grass by the T-rex. Climb into the basket (there's room for
// four); a moment later the burner roars and up it goes, high over the park, floating slowly
// round a big loop over the playground, the beach and the lagoon, then back down onto its pad,
// where everyone steps out. Jump to climb out on the way (down you drop: into the lagoon, onto
// the bouncy castle...); an empty balloon finishes its loop and comes home by itself. Playing
// alone, the buddy hops in with you.

/** Seconds after the first animal climbs in, before it lifts off (time for friends to climb in). */
const BOARD_WAIT = 3;
/** Seconds to go up, and to come down. */
const RISE = 7;
const LAND = 7;
/** Speed round the loop (m/s). */
const SPEED = 3.5;
/** Seconds on the pad after landing before anyone can climb in again. */
const REST = 3;
const REACH = 1.1;
/** How long (ms) the buddy's hop into the basket gets before it tries again. */
const BUDDY_RETRY = 1200;
/** The four places in the basket (from its middle). */
const SPOTS: [number, number][] = [
  [-0.42, -0.42],
  [0.42, -0.42],
  [-0.42, 0.42],
  [0.42, 0.42]
];
const STRIPES = ['#ef4444', '#ffd23f', '#3b82f6', '#22c55e', '#f97316', '#a855f7'];

type Mode = 'wait' | 'boarding' | 'rise' | 'fly' | 'land' | 'rest';

const ease = (t: number) => t * t * (3 - 2 * t);

export function HotAirBalloon() {
  const [px, pz] = BALLOON.pad;
  const g = groundHeight(px, pz);
  const course = useMemo(() => makeCourse(BALLOON.route), []);
  const st = useRef({
    mode: 'wait' as Mode,
    t: 0,
    s: 0,
    riders: [null, null, null, null] as (number | null)[],
    pos: new THREE.Vector3(px, g, pz),
    flights: 0,
    together: 0,
    jumps: 0,
    nextBurn: 0,
    buddyAt: -1e9
  });
  debugInfo.balloon = st.current;
  const group = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const burning = useRef(0);
  const tmp = useMemo(() => ({ seat: new THREE.Vector3(), out: new THREE.Vector3(), p: { x: 0, z: 0, dx: 0, dz: 1 } }), []);
  useHint([px, g + 1, pz], 'walk', 4);

  // a striped envelope: each face takes the colour of the stripe it's in
  const envelope = useMemo(() => {
    const geo = new THREE.SphereGeometry(3.3, 18, 14).toNonIndexed();
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const stripe = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 12) % STRIPES.length;
      c.set(STRIPES[stripe]);
      for (let k = 0; k < 3; k += 1) colors.set([c.r, c.g, c.b], (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geo, mat: new THREE.MeshLambertMaterial({ vertexColors: true }) };
  }, []);
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffb703', transparent: true, opacity: 0.9 }), []);

  const burn = (now: number) => {
    burning.current = 0.8;
    st.current.nextBurn = now + 2500 + ((now / 7) % 1500);
    playFireBreath([st.current.pos.x, st.current.pos.y + 2.5, st.current.pos.z]);
  };

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const z = st.current;
    const now = gameNow();
    z.t += dt;
    const aboard = () => z.riders.map((r) => rider(r)).filter((p) => !!p);
    const kidsAboard = () => aboard().filter((p) => !p.bot).length;

    // climb in (on the pad)
    if (z.mode === 'wait' || z.mode === 'boarding') {
      for (const p of players.values()) {
        if (z.riders.includes(p.slot) || !canBoard(p)) continue;
        if (p.bot && kidsAboard() === 0) continue;
        if (distXZ(p.position.x, p.position.z, px, pz) > REACH || p.position.y < g - 0.3 || p.position.y > g + 2) continue;
        const free = z.riders.indexOf(null);
        if (free < 0) break;
        z.riders[free] = p.slot;
        playBoing(p.position, 0.9);
        rumble(p.source as SourceId, 0.3, 0.3, 120);
        if (z.mode === 'wait') {
          z.mode = 'boarding';
          z.t = 0;
        }
      }
      // playing alone: the buddy hops in too (and tries again if it was busy mid-jump or missed)
      if (z.mode === 'boarding' && kidsAboard() > 0 && z.riders.includes(null) && now - z.buddyAt > BUDDY_RETRY && buddyMay('join')) {
        for (const b of players.values()) {
          if (!b.bot || z.riders.includes(b.slot) || b.isLaunched() || b.ridingOn != null || b.grabbedBy != null || distXZ(b.position.x, b.position.z, px, pz) > 30) continue;
          z.buddyAt = now;
          b.launchTo(new THREE.Vector3(px + 0.3, g, pz + 0.3), g + 3.5);
        }
      }
    }

    // where the basket is
    if (z.mode === 'boarding' && z.t >= BOARD_WAIT) {
      z.mode = 'rise';
      z.t = 0;
      z.flights += 1;
      if (kidsAboard() >= 2) {
        z.together += 1;
        earnSticker('hotairfriends');
      }
      burn(now);
    } else if (z.mode === 'rise' && z.t >= RISE) {
      z.mode = 'fly';
      z.t = 0;
      z.s = 0;
      if (kidsAboard() > 0) earnSticker('hotair');
    } else if (z.mode === 'fly' && z.s >= course.length) {
      z.mode = 'land';
      z.t = 0;
    } else if (z.mode === 'land' && z.t >= LAND) {
      z.mode = 'rest';
      z.t = 0;
      playBoing(z.pos, 0.6);
      emit('puff', [px, g + 0.1, pz], { count: 10, color: '#e8e0d0', speed: 2, up: 0.5, size: 0.4 });
      // everyone steps out
      z.riders.forEach((r, i) => {
        const p = rider(r);
        z.riders[i] = null;
        if (!p) return;
        p.hold(null);
        const [sx, sz] = SPOTS[i];
        p.launchTo(new THREE.Vector3(px + sx * 5, groundHeight(px + sx * 5, pz + sz * 5), pz + sz * 5), g + 1.6);
      });
    } else if (z.mode === 'rest' && z.t >= REST) {
      z.mode = 'wait';
      z.t = 0;
    }
    if (z.mode === 'fly') {
      z.s = Math.min(course.length, z.s + SPEED * dt);
      course.at(z.s, tmp.p);
      z.pos.set(tmp.p.x, BALLOON.height, tmp.p.z);
    } else if (z.mode === 'rise') z.pos.set(px, g + (BALLOON.height - g) * ease(Math.min(1, z.t / RISE)), pz);
    else if (z.mode === 'land') z.pos.set(px, BALLOON.height - (BALLOON.height - g) * ease(Math.min(1, z.t / LAND)), pz);
    else z.pos.set(px, g, pz);
    if ((z.mode === 'rise' || z.mode === 'fly') && now >= z.nextBurn) burn(now);

    // the riders: in their places; jump to climb out, on the way or still on the pad (an animal on
    // its own lets the buddy out too)
    const kids = kidsAboard();
    z.riders.forEach((r, i) => {
      if (r == null) return;
      const p = rider(r);
      if (!p) {
        z.riders[i] = null;
        return;
      }
      const [sx, sz] = SPOTS[i];
      tmp.seat.set(z.pos.x + sx, z.pos.y + 0.65, z.pos.z + sz);
      const flying = z.mode === 'rise' || z.mode === 'fly' || z.mode === 'land';
      const wantsOut = (flying || z.mode === 'boarding') && (p.bot ? kids === 0 : getInput(p.source as SourceId).pressed.jump);
      if (!wantsOut) {
        p.hold(tmp.seat, false, Math.atan2(sx, sz));
        return;
      }
      z.riders[i] = null;
      if (flying) z.jumps += 1;
      p.hold(null);
      tmp.out.set(z.pos.x + sx * 6, 0, z.pos.z + sz * 6);
      tmp.out.y = groundHeight(tmp.out.x, tmp.out.z);
      p.launchTo(tmp.out.clone(), z.pos.y + 1.5);
    });
    // everybody climbed back out before it took off: it waits for the next lot
    if (z.mode === 'boarding' && z.riders.every((r) => r == null)) {
      z.mode = 'wait';
      z.t = 0;
    }

    // the picture: the basket where it is, a gentle bob and turn in the air, the burner's flame
    const gr = group.current;
    if (gr) {
      const up = z.pos.y - g > 0.5;
      gr.position.set(z.pos.x, z.pos.y + (up ? Math.sin(now / 900) * 0.15 : 0), z.pos.z);
      gr.rotation.y = up ? Math.sin(now / 5000) * 0.4 : 0;
    }
    burning.current = Math.max(0, burning.current - dt);
    if (flame.current) {
      const f = burning.current > 0 ? 1 + Math.sin(now / 30) * 0.2 : 0.25;
      flame.current.scale.set(f, f * (burning.current > 0 ? 1.6 : 1), f);
    }
  });

  const walls: [number, number, number, number][] = [
    [0, -0.8, 1.7, 0.08],
    [0, 0.8, 1.7, 0.08],
    [-0.8, 0, 0.08, 1.7],
    [0.8, 0, 0.08, 1.7]
  ];
  return (
    <group ref={group} position={[px, g, pz]}>
      {/* the wicker basket */}
      <mesh castShadow receiveShadow position={[0, 0.05, 0]} material={lambert('#8b5a2b')}>
        <boxGeometry args={[1.7, 0.1, 1.7]} />
      </mesh>
      {walls.map(([x, z, w, d], i) => (
        <mesh key={i} castShadow position={[x, 0.5, z]} material={lambert('#b7793f')}>
          <boxGeometry args={[w, 0.9, d]} />
        </mesh>
      ))}
      {walls.map(([x, z, w, d], i) => (
        <mesh key={`rim${i}`} position={[x, 0.97, z]} material={lambert('#8b5a2b')}>
          <boxGeometry args={[w + 0.06, 0.08, d + 0.06]} />
        </mesh>
      ))}
      {/* ropes up to the envelope, the burner and its flame */}
      {SPOTS.map(([x, z], i) => (
        <mesh key={`rope${i}`} position={[x * 1.9, 1.8, z * 1.9]} material={lambert('#5b4636')}>
          <cylinderGeometry args={[0.025, 0.025, 1.65, 4]} />
        </mesh>
      ))}
      <mesh position={[0, 2.1, 0]} material={lambert('#475569')}>
        <cylinderGeometry args={[0.22, 0.28, 0.3, 10]} />
      </mesh>
      <mesh ref={flame} position={[0, 2.5, 0]} material={flameMat}>
        <coneGeometry args={[0.2, 0.6, 8]} />
      </mesh>
      {/* the envelope, with its skirt */}
      <mesh position={[0, 3, 0]} material={lambert(STRIPES[0])}>
        <cylinderGeometry args={[1.5, 0.95, 0.8, 16, 1, true]} />
      </mesh>
      <mesh castShadow position={[0, 6.8, 0]} scale={[1, 1.18, 1]} geometry={envelope.geo} material={envelope.mat} />
    </group>
  );
}
