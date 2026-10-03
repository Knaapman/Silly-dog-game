import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playSlideWhistle, playWhoosh } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { emit } from '../fx';
import { rumble, type SourceId } from '../input';
import { distXZ, WATER_LEVEL, WATER_SLIDE } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, rider } from '../runtime';
import { earnSticker } from '../stickers';
import { groundHeight } from '../terrain';
import { Ramp, StaticBox, StaticCylinder } from './common';
import { useSeeThrough } from './seeThrough';
import { randomStream } from '../rng';

const random = randomStream('waterSlide');

// The water slide on the lagoon's east shore: walk up the stairs on the tower's north side,
// step into the red slide or the blue one at the top, and whoosh: round the bends, over the
// bumps, faster and faster, and out over the lagoon with a splash. Two friends can go side by
// side; playing alone, the buddy hops in next to you.

const [TX, TZ] = WATER_SLIDE.tower;
const Y0 = groundHeight(TX, TZ);
const H = WATER_SLIDE.height;
const HALF = 1.6;
/** The slides' half-pipe: how wide (radius), and how far below a rider's middle its bottom is (the animal's underside). */
const R = 0.55;
const BOTTOM = 0.5;
const LANE_COLORS = ['#ff4d5e', '#3b82f6'];

type Lane = { pts: THREE.Vector3[]; tans: THREE.Vector3[]; s: number[]; length: number };

/** One slide: the middle line moved sideways by `offset`, with little bumps, measured along its length. */
function makeLane(offset: number): Lane {
  const middle = new THREE.CatmullRomCurve3(WATER_SLIDE.path.map(([x, y, z]) => new THREE.Vector3(x, Y0 + y, z)));
  const n = Math.ceil(middle.getLength() / 0.2);
  const base = middle.getSpacedPoints(n);
  const pts: THREE.Vector3[] = [];
  const side = new THREE.Vector3();
  base.forEach((p, i) => {
    const t = middle.getTangentAt(i / n);
    side.set(-t.z, 0, t.x).normalize();
    const bump = i > 8 && i < n - 6 ? Math.sin(i * 0.33) * 0.06 : 0;
    pts.push(p.clone().addScaledVector(side, offset).add(new THREE.Vector3(0, bump, 0)));
  });
  const s = [0];
  for (let i = 1; i < pts.length; i += 1) s.push(s[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const tans = pts.map((_, i) => pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
  return { pts, tans, s, length: s[s.length - 1] };
}

/** Where along a lane `d` metres from the top is, and which way it runs there. */
function laneAt(lane: Lane, d: number, pos: THREE.Vector3, tan: THREE.Vector3) {
  const c = Math.max(0, Math.min(lane.length, d));
  let lo = 0;
  let hi = lane.s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lane.s[mid] <= c) lo = mid;
    else hi = mid;
  }
  const k = (c - lane.s[lo]) / (lane.s[hi] - lane.s[lo] || 1);
  pos.copy(lane.pts[lo]).lerp(lane.pts[hi], k);
  tan.copy(lane.tans[lo]).lerp(lane.tans[hi], k).normalize();
}

/** A half-pipe along the lane (`inner`: just the water running down its bottom). */
function channelGeometry(lane: Lane, inner: boolean) {
  const from = inner ? Math.PI * 1.5 - 0.75 : Math.PI - 0.35;
  const to = inner ? Math.PI * 1.5 + 0.75 : Math.PI * 2 + 0.35;
  const steps = inner ? 6 : 14;
  const radius = inner ? R - 0.03 : R;
  const verts: number[] = [];
  const index: number[] = [];
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  lane.pts.forEach((p, i) => {
    const t = lane.tans[i];
    side.set(-t.z, 0, t.x).normalize();
    up.crossVectors(side, t).normalize();
    for (let k = 0; k <= steps; k += 1) {
      const a = from + ((to - from) * k) / steps;
      verts.push(p.x + side.x * Math.cos(a) * radius + up.x * (Math.sin(a) * radius + R), p.y + side.y * Math.cos(a) * radius + up.y * (Math.sin(a) * radius + R) - BOTTOM, p.z + side.z * Math.cos(a) * radius + up.z * (Math.sin(a) * radius + R));
    }
    if (i > 0) {
      const a0 = (i - 1) * (steps + 1);
      const a1 = i * (steps + 1);
      for (let k = 0; k < steps; k += 1) index.push(a0 + k, a1 + k, a0 + k + 1, a0 + k + 1, a1 + k, a1 + k + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

type Ride = { rider: number | null; d: number; v: number; startedAt: number; together: boolean; spray: number };

export function WaterSlide() {
  const lanes = useMemo(() => [makeLane(WATER_SLIDE.lane), makeLane(-WATER_SLIDE.lane)], []);
  const geoms = useMemo(() => lanes.map((l) => ({ outer: channelGeometry(l, false), water: channelGeometry(l, true) })), [lanes]);
  const waterMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.75, emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 0.2 }), []);
  const laneMats = useMemo(() => LANE_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })), []);
  const rides = useRef<Ride[]>(lanes.map(() => ({ rider: null, d: 0, v: 0, startedAt: 0, together: false, spray: 0 })));
  const buddyComing = useRef<{ slot: number; lane: number; at: number } | null>(null);
  const tmp = useMemo(() => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(), seat: new THREE.Vector3(), target: new THREE.Vector3() }), []);
  const roof = useRef<THREE.Group>(null);
  useSeeThrough(roof, TX, TZ + 1.5, 2.5);

  // posts under the slides, every few metres where they're up off the ground
  const stilts = useMemo(() => {
    const out: { x: number; z: number; y0: number; y1: number }[] = [];
    const mid = makeLane(0);
    for (let d = 3; d < mid.length - 1; d += 2.6) {
      laneAt(mid, d, tmp.pos, tmp.tan);
      const ground = Math.min(groundHeight(tmp.pos.x, tmp.pos.z), WATER_LEVEL);
      const top = tmp.pos.y - BOTTOM - 0.05;
      if (top - Math.max(ground, WATER_LEVEL) > 0.5) out.push({ x: tmp.pos.x, z: tmp.pos.z, y0: groundHeight(tmp.pos.x, tmp.pos.z), y1: top });
    }
    return out;
  }, [tmp]);

  useEffect(() => {
    debugInfo.waterslide = { rides: rides.current, lanes: lanes.map((l) => ({ start: l.pts[0].toArray(), end: l.pts[l.pts.length - 1].toArray(), length: l.length })), rides_done: 0 };
  }, [lanes]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    const info = debugInfo.waterslide as { rides_done: number };

    // step into a slide at the top
    players.forEach((p) => {
      if (p.isLaunched() || p.flopped || p.ridingOn != null || p.grabbedBy != null) return;
      if (rides.current.some((r) => r.rider === p.slot)) return;
      lanes.forEach((lane, i) => {
        const r = rides.current[i];
        if (r.rider != null || rides.current.some((o) => o.rider === p.slot)) return;
        const top = lane.pts[0];
        if (distXZ(p.position.x, p.position.z, top.x, top.z) > 0.75 || Math.abs(p.position.y - (top.y + 0.1)) > 0.9) return;
        r.rider = p.slot;
        r.d = 0;
        r.v = 2.5;
        r.startedAt = now;
        r.spray = 0;
        const other = rides.current[1 - i];
        r.together = other.rider != null;
        if (other.rider != null) other.together = true;
        playSlideWhistle('down', p.position);
        if (buddyComing.current?.slot === p.slot) buddyComing.current = null;
        // playing alone? the buddy hops into the other slide
        if (!p.bot && other.rider == null && !buddyComing.current) {
          players.forEach((b) => {
            if (!b.bot || buddyComing.current || b.isLaunched() || b.position.distanceTo(top) > 28) return;
            const ot = lanes[1 - i].pts[0];
            buddyComing.current = { slot: b.slot, lane: 1 - i, at: now };
            b.launchTo(new THREE.Vector3(ot.x + 0.4, ot.y + 0.05, ot.z), ot.y + 2.5);
          });
        }
      });
    });
    // (a buddy that didn't make it in gives up after a while)
    if (buddyComing.current && now - buddyComing.current.at > 4000) buddyComing.current = null;

    // whoosh down
    rides.current.forEach((r, i) => {
      if (r.rider == null) return;
      const p = rider(r.rider);
      const lane = lanes[i];
      if (!p) {
        r.rider = null;
        return;
      }
      laneAt(lane, r.d, tmp.pos, tmp.tan);
      const slope = -tmp.tan.y;
      r.v = THREE.MathUtils.clamp(r.v + (9.8 * slope * 0.9 - 0.5) * dt, 2, 12);
      r.d += r.v * dt;
      laneAt(lane, r.d, tmp.pos, tmp.tan);
      tmp.seat.copy(tmp.pos);
      p.hold(tmp.seat, false, Math.atan2(tmp.tan.x, tmp.tan.z));
      r.spray -= dt;
      if (r.spray <= 0) {
        r.spray = 0.06;
        emit('drop', [tmp.pos.x, tmp.pos.y - 0.2, tmp.pos.z], { count: 2, color: ['#bfe9ff', '#ffffff'], speed: 1.5 + r.v * 0.2, up: 1.5, size: 0.08, life: 0.5 });
      }
      if (random() < dt * 4) rumble(p.source as SourceId, 0.15, 0.3, 60);
      if (r.d >= lane.length) {
        // off the end and out over the lagoon: splash!
        p.hold(null);
        const flat = Math.hypot(tmp.tan.x, tmp.tan.z) || 1;
        const reach = 1.5 + r.v * 0.35;
        tmp.target.set(tmp.pos.x + (tmp.tan.x / flat) * reach, WATER_LEVEL - 0.3, tmp.pos.z + (tmp.tan.z / flat) * reach);
        p.launchTo(tmp.target.clone(), tmp.pos.y + 0.7);
        playWhoosh(tmp.pos);
        earnSticker('waterslide');
        if (r.together) earnSticker('slidetogether');
        info.rides_done += 1;
        r.rider = null;
        r.together = false;
      }
    });
    // the water in the slides shimmers
    waterMat.emissiveIntensity = 0.2 + Math.sin(now / 180) * 0.08;
  });

  const rampTop: [number, number, number] = [TX, Y0 + H, TZ - HALF];
  const rampFoot: [number, number, number] = [TX, Y0, TZ - HALF - WATER_SLIDE.stairs];
  const posts: [number, number][] = [
    [TX - HALF + 0.2, TZ - HALF + 0.2],
    [TX + HALF - 0.2, TZ - HALF + 0.2],
    [TX - HALF + 0.2, TZ + HALF - 0.2],
    [TX + HALF - 0.2, TZ + HALF - 0.2]
  ];
  return (
    <group>
      {/* the tower and its stairs */}
      <StaticBox position={[TX, Y0 + H - 0.15, TZ]} size={[HALF * 2, 0.3, HALF * 2]} color="#fde68a" />
      {posts.map(([x, z], i) => (
        <StaticCylinder key={i} position={[x, Y0 + (H - 0.3) / 2, z]} radius={0.18} height={H - 0.3} color="#ffffff" segments={8} />
      ))}
      <StaticBox position={[TX + HALF - 0.1, Y0 + H + 0.35, TZ]} size={[0.2, 0.7, HALF * 2]} color="#ffffff" />
      <StaticBox position={[TX, Y0 + H + 0.35, TZ + HALF - 0.1]} size={[HALF * 2, 0.7, 0.2]} color="#ffffff" />
      {/* the west side: open where the two slides start, a post between them */}
      {[-1, 0, 1].map((k) => (
        <StaticBox key={k} position={[TX - HALF + 0.1, Y0 + H + 0.35, TZ + k * 1.45]} size={[0.2, 0.7, k === 0 ? 0.16 : 0.3]} color="#ffffff" />
      ))}
      <Ramp from={rampFoot} to={rampTop} width={2} color="#38bdf8" railColor="#ffffff" />
      {/* a roof, so you can see it from all over the beach (it fades when it hides someone on top) */}
      <group ref={roof}>
        <mesh position={[TX, Y0 + H + 2.3, TZ]} castShadow material={lambert('#ff4d5e')}>
          <coneGeometry args={[2.3, 1.2, 8]} />
        </mesh>
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[TX + sx * (HALF - 0.2), Y0 + H + 0.95, TZ + sz * (HALF - 0.2)]} material={lambert('#ffffff')}>
              <cylinderGeometry args={[0.06, 0.06, 1.3, 6]} />
            </mesh>
          ))
        )}
      </group>

      {/* the two slides */}
      {geoms.map((g, i) => (
        <group key={i}>
          <mesh geometry={g.outer} material={laneMats[i]} castShadow receiveShadow />
          <mesh geometry={g.water} material={waterMat} />
        </group>
      ))}
      {stilts.map((s, i) => (
        <StaticCylinder key={`s${i}`} position={[s.x, (s.y0 + s.y1) / 2, s.z]} radius={0.12} height={Math.max(0.2, s.y1 - s.y0)} color="#e5e7eb" segments={8} />
      ))}
    </group>
  );
}
