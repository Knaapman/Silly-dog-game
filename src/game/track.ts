import { TRACK_LIFTS, TRAIN } from './layout';

// The train's track: a rounded rectangle round TRAIN.center. `trackAt(s)` gives the point `s`
// metres along it and the way it runs there. The train runs east along the south straight
// (over the water), north up the east straight past the station, west along the north
// straight through the tunnel, and south down the west straight.

const R = TRAIN.cornerRadius;
const CX = TRAIN.halfX - R;
const CZ = TRAIN.halfZ - R;
const [TX, TZ] = TRAIN.center;
const ARC = (Math.PI / 2) * R;
export const TRACK_LENGTH = 4 * CX + 4 * CZ + 4 * ARC;

type Segment = { kind: 'line'; from: [number, number]; dir: [number, number]; len: number; s0: number } | { kind: 'arc'; center: [number, number]; a0: number; len: number; s0: number };

const line = (from: [number, number], dir: [number, number], len: number, s0: number): Segment => ({ kind: 'line', from, dir, len, s0 });
const arc = (center: [number, number], a0: number, s0: number): Segment => ({ kind: 'arc', center, a0, len: ARC, s0 });
const S1 = 2 * CX;
const S2 = S1 + ARC;
const S3 = S2 + 2 * CZ;
const S4 = S3 + ARC;
const S5 = S4 + 2 * CX;
const S6 = S5 + ARC;
const S7 = S6 + 2 * CZ;
const SEGMENTS: Segment[] = [
  line([TX - CX, TZ + TRAIN.halfZ], [1, 0], 2 * CX, 0),
  arc([TX + CX, TZ + CZ], Math.PI / 2, S1),
  line([TX + TRAIN.halfX, TZ + CZ], [0, -1], 2 * CZ, S2),
  arc([TX + CX, TZ - CZ], 0, S3),
  line([TX + CX, TZ - TRAIN.halfZ], [-1, 0], 2 * CX, S4),
  arc([TX - CX, TZ - CZ], -Math.PI / 2, S5),
  line([TX - TRAIN.halfX, TZ - CZ], [0, 1], 2 * CZ, S6),
  arc([TX - CX, TZ + CZ], -Math.PI, S7)
];

export type TrackPoint = { x: number; z: number; dx: number; dz: number };

/** Wrap a distance along the track into 0..TRACK_LENGTH. */
export const wrapS = (s: number) => ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;

export function trackAt(s: number, out: TrackPoint) {
  let u = wrapS(s);
  for (const seg of SEGMENTS) {
    if (u <= seg.len) {
      if (seg.kind === 'line') {
        out.x = seg.from[0] + seg.dir[0] * u;
        out.z = seg.from[1] + seg.dir[1] * u;
        out.dx = seg.dir[0];
        out.dz = seg.dir[1];
      } else {
        const a = seg.a0 - u / R;
        out.x = seg.center[0] + Math.cos(a) * R;
        out.z = seg.center[1] + Math.sin(a) * R;
        out.dx = Math.sin(a);
        out.dz = -Math.cos(a);
      }
      return out;
    }
    u -= seg.len;
  }
  return out;
}

/** Distance from a point to the track's centre line (fast: the rounded rectangle's own formula). */
export function trackDist(x: number, z: number) {
  const ax = Math.abs(x - TX);
  const az = Math.abs(z - TZ);
  if (ax <= CX) return Math.abs(az - TRAIN.halfZ);
  if (az <= CZ) return Math.abs(ax - TRAIN.halfX);
  return Math.abs(Math.hypot(ax - CX, az - CZ) - R);
}

/** The nearest point on the track: how far away it is, and how far along the track. */
export function trackNearest(x: number, z: number, out = { d: 0, s: 0 }) {
  out.d = Infinity;
  for (const seg of SEGMENTS) {
    let d: number;
    let u: number;
    if (seg.kind === 'line') {
      u = Math.max(0, Math.min(seg.len, (x - seg.from[0]) * seg.dir[0] + (z - seg.from[1]) * seg.dir[1]));
      d = Math.hypot(x - (seg.from[0] + seg.dir[0] * u), z - (seg.from[1] + seg.dir[1] * u));
    } else {
      // the arc runs clockwise from a0 through a quarter turn
      let a = Math.atan2(z - seg.center[1], x - seg.center[0]);
      let back = seg.a0 - a;
      while (back < -Math.PI) back += Math.PI * 2;
      while (back > Math.PI) back -= Math.PI * 2;
      back = Math.max(0, Math.min(Math.PI / 2, back));
      a = seg.a0 - back;
      u = back * R;
      d = Math.hypot(x - (seg.center[0] + Math.cos(a) * R), z - (seg.center[1] + Math.sin(a) * R));
    }
    if (d < out.d) {
      out.d = d;
      out.s = seg.s0 + u;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Where the track climbs onto a bridge over water (TRACK_LIFTS): its height along the way.

const nearTmp = { d: 0, s: 0 };
/** Each lift as distances along the track: level from `from` to `to`, ramps either side. */
export const LIFTS = TRACK_LIFTS.bridges.map((b) => {
  const from = trackNearest(b.from[0], b.from[1], nearTmp).s;
  const to = trackNearest(b.to[0], b.to[1], nearTmp).s;
  return { ...b, sFrom: from, sTo: to, span: wrapS(to - from) };
});

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/**
 * How high the track runs at distance `s` (0 on the ground; up on the bridges), and how steeply
 * it climbs there (metres up per metre along, in the direction the train runs).
 */
export function trackLift(s: number, out = { y: 0, grade: 0 }) {
  const { height: H, ramp: L } = TRACK_LIFTS;
  out.y = 0;
  out.grade = 0;
  for (const lift of LIFTS) {
    // how far past the foot of this lift's first ramp we are
    const u = wrapS(s - (lift.sFrom - L));
    if (u >= lift.span + 2 * L) continue;
    if (u < L) {
      const t = u / L;
      out.y = H * smooth(t);
      out.grade = (H * 6 * t * (1 - t)) / L;
    } else if (u <= L + lift.span) {
      out.y = H;
    } else {
      const t = (u - L - lift.span) / L;
      out.y = H * smooth(1 - t);
      out.grade = -(H * 6 * t * (1 - t)) / L;
    }
    return out;
  }
  return out;
}

export const trackHeight = (s: number) => trackLift(s).y;
