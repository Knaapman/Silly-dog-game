import { expect, test } from '@playwright/test';
import { Game } from './game';

// No gaps to get wedged in. Two solid things standing a little less than an animal's width apart (a
// counter with a board behind it, a slide's rail beside a tree trunk) make a slot an animal can be
// knocked down into and held in on both sides: no ground under it (only the gap), so no jump, and
// nothing to walk on. Whether a particular landing sticks is down to chance, so this looks at the
// park's colliders themselves: no such gap anywhere. (The stuck hop still gets an animal out of one
// after a few seconds: rescue.spec.ts.) Gaps narrower than 0.3 m are cracks nothing gets into; two
// round things (the sky course's stumps) leave room to roll out sideways, so those are fine too.

/** An animal is 1 m across: a gap from here... */
const NARROW = 0.3;
/** ...to here can hold one. */
const WIDE = 1.05;

type Solid = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; round: boolean };

const slots = (game: Game) =>
  game.page.evaluate(
    ([NARROW, WIDE]) => {
      const s = (window as any).__silly;
      const turn = (q: { x: number; y: number; z: number; w: number }, [vx, vy, vz]: number[]) => {
        const ix = q.w * vx + q.y * vz - q.z * vy;
        const iy = q.w * vy + q.z * vx - q.x * vz;
        const iz = q.w * vz + q.x * vy - q.y * vx;
        const iw = -q.x * vx - q.y * vy - q.z * vz;
        return [ix * q.w - iw * q.x - iy * q.z + iz * q.y, iy * q.w - iw * q.y - iz * q.x + ix * q.z, iz * q.w - iw * q.z - ix * q.y + iy * q.x];
      };
      const solids: Solid[] = [];
      s.world.forEachCollider((c: any) => {
        const body = c.parent();
        if ((body && !body.isFixed()) || c.isSensor()) return;
        const sh = c.shape;
        if (sh.type === 7) return; // the ground itself
        // the shape's corners (or the corners of a box round it), turned and moved to where it is
        let pts: number[][] = [];
        let e: number[] | null = null;
        const round = sh.halfExtents == null && sh.vertices == null;
        if (sh.halfExtents) e = [sh.halfExtents.x, sh.halfExtents.y, sh.halfExtents.z];
        else if (sh.halfHeight != null && sh.radius != null) e = [sh.radius, sh.halfHeight + (sh.type === 2 ? sh.radius : 0), sh.radius];
        else if (sh.radius != null) e = [sh.radius, sh.radius, sh.radius];
        if (e) for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) pts.push([a * e[0], b * e[1], d * e[2]]);
        else if (sh.vertices) for (let i = 0; i < sh.vertices.length; i += 3) pts.push([sh.vertices[i], sh.vertices[i + 1], sh.vertices[i + 2]]);
        if (!pts.length) return;
        const t = c.translation();
        const q = c.rotation();
        pts = pts.map((p) => turn(q, p));
        const lo = (k: number) => Math.min(...pts.map((p) => p[k]));
        const hi = (k: number) => Math.max(...pts.map((p) => p[k]));
        const b: Solid = { x0: t.x + lo(0), x1: t.x + hi(0), y0: t.y + lo(1), y1: t.y + hi(1), z0: t.z + lo(2), z1: t.z + hi(2), round };
        if (b.x1 - b.x0 > 60 || b.z1 - b.z0 > 60) return; // the park's walls and floor
        const g = s.terrain.groundHeight((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
        if (b.y1 - g < 0.7 || b.y0 - g > 1.2) return; // low enough to step over, or high enough to walk under
        solids.push(b);
      });
      const found: string[] = [];
      for (let i = 0; i < solids.length; i += 1)
        for (let j = i + 1; j < solids.length; j += 1) {
          const [A, B] = [solids[i], solids[j]];
          if (A.round && B.round) continue;
          const alongZ = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
          const alongX = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
          const gapX = Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1);
          const gapZ = Math.max(A.z0, B.z0) - Math.min(A.z1, B.z1);
          if (alongZ > 0.6 && gapX > NARROW && gapX < WIDE) found.push(`${gapX.toFixed(2)} m wide at (${((Math.min(A.x1, B.x1) + Math.max(A.x0, B.x0)) / 2).toFixed(1)}, ${((Math.max(A.z0, B.z0) + Math.min(A.z1, B.z1)) / 2).toFixed(1)})`);
          if (alongX > 0.6 && gapZ > NARROW && gapZ < WIDE) found.push(`${gapZ.toFixed(2)} m wide at (${((Math.max(A.x0, B.x0) + Math.min(A.x1, B.x1)) / 2).toFixed(1)}, ${((Math.min(A.z1, B.z1) + Math.max(A.z0, B.z0)) / 2).toFixed(1)})`);
        }
      return { solids: solids.length, found };
    },
    [NARROW, WIDE] as const
  );

test('no gap in the park an animal could get wedged in (narrower than an animal, between things that stand)', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds', 'chickens'] });
  await game.start();
  const { solids, found } = await slots(game);
  expect(solids).toBeGreaterThan(200); // (it really is looking at the park's things)
  expect(found).toEqual([]);
  game.expectNoErrors();
});
