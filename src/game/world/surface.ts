import type { RapierCollider } from '@react-three/rapier';
import { useEffect, type RefObject } from 'react';
import { registerSurface, type Surface } from '../runtime';

/** Registers a collider (after rapier created it) as a special surface. */
export function useSurface(ref: RefObject<RapierCollider | null>, surface: Surface) {
  useEffect(() => {
    const collider = ref.current;
    if (!collider) return;
    return registerSurface(collider.handle, surface);
  }, [ref, surface]);
}
