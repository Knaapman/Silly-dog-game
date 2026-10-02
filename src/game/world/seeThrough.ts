import { useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useGameFrame } from '../clock';
import { players } from '../runtime';

// Big things (the T-rex, the brontosaurus, the barn...) turn see-through while they stand
// between the camera and an animal, like the trees do, so nobody loses sight of their animal.
// The camera always looks at the park from the south (+z), a little above.

/** Is something `radius` wide at (x, z) in front of an animal, as the camera sees it? */
export function inFrontOfAnimal(x: number, z: number, radius: number) {
  for (const p of players.values()) {
    if (p.asleep) continue;
    const dz = z - p.position.z;
    if (dz > 0.5 && dz < 16 + radius && Math.abs(x - p.position.x) < radius * 0.8 + 1 + dz * 0.15) return true;
  }
  return false;
}

/** Fade the object under `ref` to see-through while it hides an animal. */
export function useSeeThrough(ref: RefObject<THREE.Object3D | null>, x: number, z: number, radius: number, faded = 0.25) {
  const mats = useRef<THREE.Material[] | null>(null);
  const fade = useRef(1);
  useGameFrame((_, dt) => {
    const root = ref.current;
    if (!root) return;
    const want = inFrontOfAnimal(x, z, radius) ? faded : 1;
    if (Math.abs(fade.current - want) < 0.001) return;
    if (!mats.current) {
      // our own copies: the game shares one material per colour, and only this object fades
      const list: THREE.Material[] = [];
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const copy = (mesh.material as THREE.Material).clone();
        mesh.material = copy;
        list.push(copy);
      });
      mats.current = list;
    }
    fade.current = THREE.MathUtils.clamp(fade.current + Math.sign(want - fade.current) * dt * 3, faded, 1);
    const see = fade.current < 0.999;
    for (const m of mats.current) {
      // (switching `transparent` needs a shader rebuild: an opaque shader ignores the opacity)
      if (m.transparent !== see) m.needsUpdate = true;
      m.transparent = see;
      m.opacity = fade.current;
      m.depthWrite = !see;
    }
  });
}
