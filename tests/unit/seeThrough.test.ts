import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { players, type PlayerRuntime } from '../../src/game/runtime';
import { inFrontOfAnimal } from '../../src/game/world/seeThrough';

const animal = (slot: number, x: number, z: number, asleep = false) => ({ slot, position: new THREE.Vector3(x, 1, z), asleep }) as unknown as PlayerRuntime;

afterEach(() => players.clear());

describe('see-through set pieces', () => {
  it('fade when standing between the camera (south) and an animal', () => {
    players.set(0, animal(0, 27, 9));
    expect(inFrontOfAnimal(27, 14, 3.5)).toBe(true); // just south of the animal: in front
    expect(inFrontOfAnimal(27, 4, 3.5)).toBe(false); // north of it: behind, doesn't hide it
    expect(inFrontOfAnimal(45, 14, 3.5)).toBe(false); // well off to the side
    expect(inFrontOfAnimal(27, 9.2, 3.5)).toBe(false); // standing on it / beside it
  });

  it('a napping animal (controller unplugged) does not count', () => {
    players.set(0, animal(0, 27, 9, true));
    expect(inFrontOfAnimal(27, 14, 3.5)).toBe(false);
  });
});
