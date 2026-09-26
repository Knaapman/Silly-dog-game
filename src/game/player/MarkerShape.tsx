import { useMemo } from 'react';
import * as THREE from 'three';
import type { PlayerShape } from '../config';
import { lambert } from '../materials';
import { getStarGeometry } from '../world/Stars';

const triangleGeometry = (() => {
  const t = new THREE.Shape();
  t.moveTo(-0.6, 0.45);
  t.lineTo(0.6, 0.45);
  t.lineTo(0, -0.6);
  t.closePath();
  const g = new THREE.ExtrudeGeometry(t, { depth: 0.2, bevelEnabled: false });
  g.center();
  return g;
})();

/** The little shape floating over an animal in co-op: a colour *and* a shape per player. */
export function MarkerShape({ shape, color }: { shape: PlayerShape; color: string }) {
  const outline = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide }), []);
  const mat = lambert(color);
  switch (shape) {
    case 'triangle':
      return (
        <group scale={0.42} rotation={[-Math.PI / 2 + 0.35, 0, 0]}>
          <mesh material={mat} geometry={triangleGeometry} />
          <mesh material={outline} geometry={triangleGeometry} scale={1.2} />
        </group>
      );
    case 'circle':
      return (
        <group>
          <mesh material={mat}>
            <sphereGeometry args={[0.2, 16, 12]} />
          </mesh>
          <mesh material={outline} scale={1.18}>
            <sphereGeometry args={[0.2, 16, 12]} />
          </mesh>
        </group>
      );
    case 'diamond':
      return (
        <group rotation={[0, 0, Math.PI / 4]}>
          <mesh material={mat}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
          </mesh>
          <mesh material={outline} scale={1.18}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
          </mesh>
        </group>
      );
    case 'star':
      return (
        // lying flat: the camera looks down, so this is how a star reads best
        <group scale={0.42} rotation={[-Math.PI / 2 + 0.35, 0, 0]}>
          <mesh material={mat} geometry={getStarGeometry()} />
          <mesh material={outline} geometry={getStarGeometry()} scale={1.18} />
        </group>
      );
  }
}
