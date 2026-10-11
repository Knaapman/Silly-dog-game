import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildParts } from '../../src/game/world/Trees';

describe('trees', () => {
  it("a palm's trunk is one piece: each part starts where the one below ends (no floating logs)", () => {
    const trunk = buildParts('palm').filter((p) => !p.canopy);
    expect(trunk.length).toBeGreaterThan(1);
    // the ends of each trunk part (a cylinder along its own y), in the tree's space
    const ends = trunk.map((p) => {
      p.geometry.computeBoundingBox();
      const h = p.geometry.boundingBox!.max.y;
      return [new THREE.Vector3(0, -h, 0).applyMatrix4(p.matrix), new THREE.Vector3(0, h, 0).applyMatrix4(p.matrix)];
    });
    expect(ends[0][0].y).toBeLessThan(0.1);
    for (let i = 1; i < ends.length; i += 1) expect(ends[i][0].distanceTo(ends[i - 1][1])).toBeLessThan(0.15);
  });
});
