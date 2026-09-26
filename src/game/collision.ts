import { interactionGroups } from '@react-three/rapier';

// Everything collides with everything (Rapier's default), except: animals walk straight
// through poops. Running over one is handled by the poop itself (a slip), and a solid
// poop would just be a speed bump.

/** Animals: members of group 1 only, collide with anything. */
export const ANIMAL_GROUPS = interactionGroups(1);
/** Poops: group 2, collide with everything except animals. */
export const POOP_GROUPS = interactionGroups(2, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
