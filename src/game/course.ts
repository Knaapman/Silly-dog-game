import type { Vec2 } from './layout';

// A smooth line through some points (a Catmull-Rom curve), measured along its length, so a ride
// can move along it at a steady speed: `at(s)` is the point `s` metres from the start and the
// direction it runs there.

export type CoursePoint = { x: number; z: number; dx: number; dz: number };

export function makeCourse(points: Vec2[], step = 0.25) {
  const P = [points[0], ...points, points[points.length - 1]];
  const raw: Vec2[] = [];
  for (let i = 1; i < P.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k += 1) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  raw.push(points[points.length - 1]);
  const s = [0];
  for (let i = 1; i < raw.length; i += 1) s.push(s[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const length = s[s.length - 1];

  /** The index of the last sample at or before distance `d`. */
  const find = (d: number) => {
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= d) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  return {
    length,
    at(d: number, out: CoursePoint = { x: 0, z: 0, dx: 0, dz: 1 }) {
      const c = Math.max(0, Math.min(length, d));
      const i = Math.min(find(c), raw.length - 2);
      const seg = s[i + 1] - s[i] || 1;
      const t = (c - s[i]) / seg;
      const [a, b] = [raw[i], raw[i + 1]];
      out.x = a[0] + (b[0] - a[0]) * t;
      out.z = a[1] + (b[1] - a[1]) * t;
      out.dx = (b[0] - a[0]) / seg;
      out.dz = (b[1] - a[1]) / seg;
      return out;
    },
    /** How far along the course it first reaches this z (the courses here run south, +z). */
    sAtZ(z: number) {
      for (let i = 1; i < raw.length; i += 1) if (raw[i][1] >= z) return s[i - 1] + ((z - raw[i - 1][1]) / (raw[i][1] - raw[i - 1][1] || 1)) * (s[i] - s[i - 1]);
      return length;
    }
  };
}
