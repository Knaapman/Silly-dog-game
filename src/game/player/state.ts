import * as THREE from 'three';
import type { PowerKind } from '../runtime';

export type Flip = { axis: 'x' | 'y' | 'z'; t: number; dur: number; dir: number };
type Pupil = { x: number; y: number; vx: number; vy: number };

/** Everything an animal remembers between frames. */
export function createState(spawn: THREE.Vector3) {
  return {
    pos: spawn.clone(),
    vel: new THREE.Vector3(),
    prevVel: new THREE.Vector3(),
    facing: 0,
    targetFacing: 0,
    grounded: false,
    airTime: 0,
    coyote: 0,
    jumpBuffer: 0,
    jumps: 0,
    lastVy: 0,
    groundY: 0,
    flopped: false,
    flopTime: 0,
    bonkTime: 0,
    bonkCooldown: 0,
    dashTime: 0,
    bonkHits: new Set<number>(),
    held: null as number | null,
    /** A friend on the end of the tongue, and for how long. */
    heldFriend: null as number | null,
    friendHoldTime: 0,
    lickMiss: 0,
    noiseTime: 0,
    /** The animal picker, as this animal last saw it: open, for how long, idle for how long, which way the stick leans. */
    picking: false,
    pickAge: 0,
    pickIdle: 0,
    pickDir: 0,
    launched: 0,
    padCooldown: 0,
    launchAirborne: false,
    bounceCooldown: 0,
    stunned: 0,
    /** Seconds the "I'm stuck" chord has been held (-1: done, until it's let go). */
    rescueHold: 0,
    /** Seconds spent pushing the stick without getting anywhere, and where that started. */
    stuckFor: 0,
    stuckFrom: new THREE.Vector3(),
    pendingBump: null as THREE.Vector3 | null,
    pendingHop: 0,
    /** Seconds left passing through things, after the stuck hop (out of a gap it was wedged in). */
    ghostFor: 0,
    /** Small upward nudge without a flip (the toot hop). */
    pendingNudge: 0,
    pendingLaunch: null as { target: THREE.Vector3; apex: number } | null,
    holdAt: null as THREE.Vector3 | null,
    hidden: false,
    platformVel: new THREE.Vector3(),
    sliding: false,
    stepTimer: 0,
    gravityOff: false,
    grip: false,
    // tummy: bites eaten, the squat while pooping, chewing, and the belly's wobbly size
    belly: 0,
    chew: 0,
    poopTime: 0,
    poopCooldown: 0,
    /** Presses waiting for the current squat to finish: mashing = a row of poops. */
    poopPresses: 0,
    poopQueued: null as { size: number; golden: boolean } | null,
    fartedInAir: false,
    bellyScale: 0.8,
    bellyVel: 0,
    // magic food
    power: null as PowerKind | null,
    powerTime: 0,
    powerFx: 0,
    rocketCooldown: 0,
    pendingRocket: false,
    size: 1,
    sizeVel: 0,
    colliderSize: 1,
    stompTimer: 0,
    // piggyback
    ridingOn: null as number | null,
    rideCooldown: 0,
    jumpedAt: 0,
    noiseAt: 0,
    poopAt: 0,
    flip: null as Flip | null,
    squash: 0,
    squashVel: 0,
    mud: 0,
    /** Paint on the coat (0..1), its colour (PAINT_COLORS), every colour since the last wash, and the paw-print stride. */
    paint: 0,
    paintColor: 0,
    paintColors: [] as number[],
    pawStride: 0,
    pawSide: 1,
    swimming: false,
    inMud: false,
    rippleTimer: 0,
    walkPhase: 0,
    idleTime: 0,
    // tricks: the duck's glide, the cat's climb (tree index, time, where from, where it holds us)
    gliding: false,
    glideTime: 0,
    climbTree: -1,
    climbT: 0,
    climbPush: 0,
    climbArmed: false,
    climbFrom: new THREE.Vector3(),
    climbHold: new THREE.Vector3(),
    pupils: [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 0, y: 0, vx: 0, vy: 0 }
    ] as Pupil[]
  };
}

export type PlayerState = ReturnType<typeof createState>;
