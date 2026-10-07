import { interactionGroups } from '@react-three/rapier';

// Everything collides with everything (Rapier's default), except: animals walk straight
// through poops, and climb straight into hamster balls. Running over one is handled by the poop itself (a slip), and a solid
// poop would just be a speed bump.

/** Animals: members of group 1 only, collide with anything. */
export const ANIMAL_GROUPS = interactionGroups(1);
/** Poops: group 2, collide with everything except animals. */
export const POOP_GROUPS = interactionGroups(2, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
/** Hamster balls: group 3, collide with everything except animals (who climb in through the side). */
export const HAMSTER_GROUPS = interactionGroups(3, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

/**
 * Solver groups for something that should pass through things for a while (a carried block, an
 * animal hopping out of a gap it got wedged in): it pushes nothing and nothing pushes it, but its
 * contacts are still kept, so it stands on the ground again as soon as it's solid. (Not a sensor:
 * a body made a sensor while asleep can lose its contact with the ground for good.)
 */
export const GHOST_SOLVER = 0;
export const SOLID_SOLVER = 0xffffffff;
