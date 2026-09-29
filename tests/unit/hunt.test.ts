import { describe, expect, it } from 'vitest';
import { WORLD_HALF_X, WORLD_HALF_Z } from '../../src/game/config';
import { distXZ, isInFountain, TREASURE_HIGH_SPOTS, TREASURE_SPOTS, ZONES } from '../../src/game/layout';
import { isInWater } from '../../src/game/terrain';
import { trackNearest } from '../../src/game/track';
import { roundSpots, TREASURES } from '../../src/game/hunt';
import { STICKERS } from '../../src/game/stickers';

describe('treasure hunt', () => {
  it('hides each round in five different areas, the same way every time', () => {
    for (let round = 0; round < 50; round += 1) {
      const spots = roundSpots(round);
      expect(spots).toHaveLength(TREASURES);
      const ground = spots.filter((s) => s.length === 2);
      const zones = ground.map((at) => TREASURE_SPOTS.find((s) => s.at === at)!.zone);
      expect(new Set(zones).size).toBe(ground.length);
      expect(roundSpots(round)).toEqual(spots);
      // every other round, one of them is up high (or across the water), away from the others
      const high = spots.filter((s) => s.length === 3);
      expect(high).toHaveLength(round % 2);
      for (const h of high) for (const g of ground) expect(distXZ(h[0], h[1], g[0], g[1])).toBeGreaterThan(8);
    }
  });

  it('moves the treasures from round to round, and uses every hiding place sooner or later', () => {
    let same = 0;
    const used = new Set<string>();
    for (let round = 0; round < 200; round += 1) {
      const a = roundSpots(round);
      if (JSON.stringify(a) === JSON.stringify(roundSpots(round + 1))) same += 1;
      a.forEach((s) => used.add(s.slice(0, 2).join(',')));
    }
    expect(same).toBe(0);
    expect(used.size).toBe(TREASURE_SPOTS.length + TREASURE_HIGH_SPOTS.length);
  });

  it('hides treasure in every area, inside the hedge, out of the water and off the railway', () => {
    expect(new Set(TREASURE_SPOTS.map((s) => s.zone))).toEqual(new Set(Object.keys(ZONES)));
    for (const { at: [x, z] } of TREASURE_SPOTS) {
      expect(Math.abs(x)).toBeLessThan(WORLD_HALF_X - 3);
      expect(Math.abs(z)).toBeLessThan(WORLD_HALF_Z - 3);
      expect(isInWater(x, z) || isInFountain(x, z)).toBe(false);
      expect(trackNearest(x, z).d).toBeGreaterThan(3.5);
    }
    // not two in the same place
    for (const a of TREASURE_SPOTS) for (const b of TREASURE_SPOTS) if (a !== b) expect(distXZ(a.at[0], a.at[1], b.at[0], b.at[1])).toBeGreaterThan(4);
  });

  it('every sticker has its own id', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
  });
});
