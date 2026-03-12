import { create } from 'zustand';
import * as THREE from 'three';
import { playStarSound } from './audio';

const zoneSpawnAnchors = {
  bezoekerscentrum: { x: 0, z: -40, radius: 10 },
  agility: { x: -16, z: -24, radius: 10 },
  graafduinen: { x: 37, z: -23, radius: 10 },
  wandeling: { x: 37, z: 0, radius: 9 },
  innovatie: { x: 37, z: 23, radius: 10 },
  snuffeltuin: { x: 10, z: 38, radius: 9 },
  gezondheid: { x: 33, z: 42, radius: 10 },
  centralePlaza: { x: 0, z: 10, radius: 12 }
} as const;

type SpawnZone = keyof typeof zoneSpawnAnchors;
type ObjectiveEvent = 'jump' | 'sniff' | 'drink' | 'dig' | 'eat' | 'trash';

type SpawnProfile = {
  foodCount: number;
  digSpotCount: number;
  trashCanCount: number;
};

type MovementTuning = {
  walkSpeedMultiplier: number;
  sprintSpeedMultiplier: number;
  sniffSpeedMultiplier: number;
  jumpImpulseMultiplier: number;
  digDurationMultiplier: number;
};

type LevelModifier = {
  type: 'base' | 'spawn' | 'bonus' | 'perk';
  label: string;
  description: string;
  tradeoff?: string;
  spawnProfile: SpawnProfile;
  movement: MovementTuning;
};

type ObjectiveRequirementDefinition = {
  event: ObjectiveEvent;
  count: number;
  label: string;
};

type ObjectiveDefinition = {
  id: string;
  title: string;
  description: string;
  zone: string;
  requirements: ObjectiveRequirementDefinition[];
};

type ObjectiveRequirementState = ObjectiveRequirementDefinition & {
  progress: number;
};

type BonusObjectiveState = {
  event: ObjectiveEvent;
  label: string;
  progress: number;
  target: number;
  expiresAt: number;
  rewardStars: number;
  completed: boolean;
  expired: boolean;
};

type ObjectiveState = {
  loopIndex: number;
  id: string;
  title: string;
  description: string;
  zone: string;
  requirements: ObjectiveRequirementState[];
  startedAt: number;
  completed: boolean;
  completedAt: number | null;
  bonus: BonusObjectiveState | null;
};

type LevelBeatState = {
  phase: 'outro' | 'intro';
  level: number;
  title: string;
  subtitle: string;
  objectiveTitle: string;
  objectiveDescription: string;
  modifierLabel: string;
  modifierDescription: string;
  startedAt: number;
  endsAt: number;
};

export type UiActionType =
  | 'bark'
  | 'dig'
  | 'lieDown'
  | 'poop'
  | 'interact'
  | 'eat'
  | 'jump'
  | 'sit'
  | 'roll'
  | 'sniff';

export type InputFeedbackSource = 'touch' | 'gamepad';

type UiActionEvent = {
  action: UiActionType;
  time: number;
  playerIndex: number;
  source: InputFeedbackSource | 'keyboard';
};

type InputFeedbackEvent = {
  action: UiActionType;
  time: number;
  playerIndex: number;
  source: InputFeedbackSource;
};

const BASE_SPAWN_PROFILE: SpawnProfile = {
  foodCount: 6,
  digSpotCount: 8,
  trashCanCount: 4
};

const BASE_MOVEMENT_TUNING: MovementTuning = {
  walkSpeedMultiplier: 1,
  sprintSpeedMultiplier: 1,
  sniffSpeedMultiplier: 1,
  jumpImpulseMultiplier: 1,
  digDurationMultiplier: 1
};

const OBJECTIVE_LOOP: ObjectiveDefinition[] = [
  {
    id: 'agility-sprint',
    title: 'Agility Sprint',
    description: 'Hop through the agility route and keep the pace up.',
    zone: 'Agility Course',
    requirements: [{ event: 'jump', count: 3, label: 'Clean jumps' }]
  },
  {
    id: 'hot-trail',
    title: 'Hot Trail',
    description: 'Sniff out the warm trail, then dig where it peaks.',
    zone: 'Snuffeltuin',
    requirements: [
      { event: 'sniff', count: 2, label: 'Tracking sniffs' },
      { event: 'dig', count: 1, label: 'Treasure digs' }
    ]
  },
  {
    id: 'cooldown-lap',
    title: 'Cooldown Lap',
    description: 'Visit the lake for a quick reset before the next dash.',
    zone: 'Zwemmeer',
    requirements: [{ event: 'drink', count: 1, label: 'Shoreline drinks' }]
  },
  {
    id: 'cleanup-chaos',
    title: 'Cleanup Chaos',
    description: 'Cause just enough trouble to shake loose a new route.',
    zone: 'Park paths',
    requirements: [{ event: 'trash', count: 1, label: 'Trash cans toppled' }]
  },
  {
    id: 'snack-finish',
    title: 'Snack Finish',
    description: 'Wrap the lap by finding a treat and chowing down.',
    zone: 'Food stations',
    requirements: [{ event: 'eat', count: 2, label: 'Treats eaten' }]
  }
];

function spawnNear(zone: SpawnZone, y = 0): [number, number, number] {
  const anchor = zoneSpawnAnchors[zone];
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * anchor.radius;
  return [
    anchor.x + Math.cos(angle) * distance,
    y,
    anchor.z + Math.sin(angle) * distance
  ];
}

function createSpawnList<T>(route: SpawnZone[], count: number, factory: (zone: SpawnZone, index: number) => T) {
  return Array.from({ length: count }).map((_, index) => factory(route[index % route.length], index));
}

function createFoodSpawns(profile: SpawnProfile) {
  const route: SpawnZone[] = [
    'bezoekerscentrum',
    'agility',
    'graafduinen',
    'wandeling',
    'snuffeltuin',
    'gezondheid',
    'centralePlaza'
  ];
  return createSpawnList(route, profile.foodCount, (zone, index) => ({
    id: index,
    pos: spawnNear(zone, 0)
  }));
}

function createDigSpots(profile: SpawnProfile) {
  const route: SpawnZone[] = [
    'agility',
    'graafduinen',
    'snuffeltuin',
    'wandeling',
    'innovatie',
    'gezondheid',
    'bezoekerscentrum',
    'centralePlaza'
  ];
  return createSpawnList(route, profile.digSpotCount, (zone, index) => ({
    id: index,
    pos: spawnNear(zone, 0),
    active: true
  }));
}

function createTrashCanSpawns(profile: SpawnProfile) {
  const route: SpawnZone[] = ['bezoekerscentrum', 'wandeling', 'snuffeltuin', 'gezondheid', 'agility'];
  return createSpawnList(route, profile.trashCanCount, (zone, index) => ({
    id: index,
    pos: spawnNear(zone, 0),
    knocked: false
  }));
}

function getLevel(stars: number) {
  return Math.floor(stars / 10) + 1;
}

function getLevelModifier(level: number): LevelModifier {
  if (level <= 1) {
    return {
      type: 'base',
      label: 'Park Warmup',
      description: 'Balanced spawns and no extra twists while the route settles in.',
      spawnProfile: BASE_SPAWN_PROFILE,
      movement: BASE_MOVEMENT_TUNING
    };
  }

  const tier = (level - 2) % 3;
  const cycle = Math.floor((level - 2) / 3);

  if (tier === 0) {
    const profiles = [
      {
        label: 'Snack Surge',
        description: 'More food bowls appear, but fewer dig spots stay active.',
        tradeoff: 'Easier snack runs, thinner treasure trail.',
        spawnProfile: { foodCount: 8, digSpotCount: 6, trashCanCount: 3 }
      },
      {
        label: 'Dig Day',
        description: 'Extra dig spots pop up while food bowls thin out.',
        tradeoff: 'Treasure is easier to find, snacks take longer to spot.',
        spawnProfile: { foodCount: 4, digSpotCount: 10, trashCanCount: 4 }
      },
      {
        label: 'Trash Parade',
        description: 'More trash cans clutter the paths and food stations get tighter.',
        tradeoff: 'Cleanup laps are juicier, snack runs get lean.',
        spawnProfile: { foodCount: 5, digSpotCount: 7, trashCanCount: 6 }
      }
    ];
    const profile = profiles[cycle % profiles.length];
    return {
      type: 'spawn',
      label: profile.label,
      description: profile.description,
      tradeoff: profile.tradeoff,
      spawnProfile: profile.spawnProfile,
      movement: BASE_MOVEMENT_TUNING
    };
  }

  if (tier === 1) {
    return {
      type: 'bonus',
      label: 'Bonus Window',
      description: 'Each loop starts a short side objective that can award an extra star.',
      tradeoff: 'Miss the timer and you only get the main route credit.',
      spawnProfile: BASE_SPAWN_PROFILE,
      movement: BASE_MOVEMENT_TUNING
    };
  }

  const perks = [
    {
      label: 'Sprinter Paws',
      description: 'Run speed climbs so agility routes feel snappier.',
      tradeoff: 'Jump height dips a little, so timing matters more.',
      movement: {
        walkSpeedMultiplier: 1,
        sprintSpeedMultiplier: 1.15,
        sniffSpeedMultiplier: 1,
        jumpImpulseMultiplier: 0.92,
        digDurationMultiplier: 1
      }
    },
    {
      label: 'Deep Snout',
      description: 'Sniffing keeps more momentum, helping treasure routes flow.',
      tradeoff: 'Top sprint speed softens a touch outside sniff mode.',
      movement: {
        walkSpeedMultiplier: 1,
        sprintSpeedMultiplier: 0.94,
        sniffSpeedMultiplier: 1.2,
        jumpImpulseMultiplier: 1,
        digDurationMultiplier: 1
      }
    },
    {
      label: 'Spring Paws',
      description: 'Jumps get a little more lift for playful route shortcuts.',
      tradeoff: 'Digging takes longer while those legs stay bouncy.',
      movement: {
        walkSpeedMultiplier: 1,
        sprintSpeedMultiplier: 1,
        sniffSpeedMultiplier: 1,
        jumpImpulseMultiplier: 1.12,
        digDurationMultiplier: 1.2
      }
    }
  ];
  const perk = perks[cycle % perks.length];

  return {
    type: 'perk',
    label: perk.label,
    description: perk.description,
    tradeoff: perk.tradeoff,
    spawnProfile: BASE_SPAWN_PROFILE,
    movement: perk.movement
  };
}

function createBonusObjective(loopIndex: number, modifier: LevelModifier, now: number): BonusObjectiveState | null {
  if (modifier.type !== 'bonus') return null;

  const bonusByLoop: BonusObjectiveState[] = [
    { event: 'jump', label: 'Bonus: land 2 extra jumps fast', progress: 0, target: 2, expiresAt: now + 20000, rewardStars: 1, completed: false, expired: false },
    { event: 'sniff', label: 'Bonus: chain 2 more sniffs', progress: 0, target: 2, expiresAt: now + 18000, rewardStars: 1, completed: false, expired: false },
    { event: 'drink', label: 'Bonus: sneak in 1 more drink', progress: 0, target: 1, expiresAt: now + 15000, rewardStars: 1, completed: false, expired: false },
    { event: 'trash', label: 'Bonus: tip a second can', progress: 0, target: 1, expiresAt: now + 22000, rewardStars: 1, completed: false, expired: false },
    { event: 'eat', label: 'Bonus: scarf 1 extra snack', progress: 0, target: 1, expiresAt: now + 18000, rewardStars: 1, completed: false, expired: false }
  ];

  return { ...bonusByLoop[loopIndex % bonusByLoop.length] };
}

function createObjectiveState(loopIndex: number, modifier: LevelModifier, now = Date.now()): ObjectiveState {
  const definition = OBJECTIVE_LOOP[loopIndex % OBJECTIVE_LOOP.length];
  return {
    loopIndex,
    id: definition.id,
    title: definition.title,
    description: definition.description,
    zone: definition.zone,
    requirements: definition.requirements.map((requirement) => ({
      ...requirement,
      progress: 0
    })),
    startedAt: now,
    completed: false,
    completedAt: null,
    bonus: createBonusObjective(loopIndex, modifier, now)
  };
}

function refreshObjectiveForModifier(objective: ObjectiveState, modifier: LevelModifier, now = Date.now()): ObjectiveState {
  const refreshed = createObjectiveState(objective.loopIndex, modifier, now);
  return {
    ...refreshed,
    requirements: refreshed.requirements.map((requirement) => ({
      ...requirement,
      progress: objective.requirements.find((current) => current.event === requirement.event)?.progress ?? 0
    }))
  };
}

interface GameState {
  dogPositions: [THREE.Vector3, THREE.Vector3];
  dogRotations: [number, number];
  setDogPosition: (index: number, pos: THREE.Vector3, rot: number) => void;

  barks: { id: number, pos: THREE.Vector3, time: number }[];
  addBark: (pos: THREE.Vector3) => void;

  ballPositions: Record<number, THREE.Vector3>;
  setBallPosition: (id: number, pos: THREE.Vector3) => void;

  catPositions: Record<number, THREE.Vector3>;
  setCatPosition: (id: number, pos: THREE.Vector3) => void;

  birdPositions: Record<number, THREE.Vector3>;
  setBirdPosition: (id: number, pos: THREE.Vector3) => void;

  heldBalls: Record<number, number | null>;
  grabBall: (dogIndex: number, ballId: number) => void;
  dropBall: (dogIndex: number) => void;

  heldBones: Record<number, number | null>;
  grabBone: (dogIndex: number, boneId: number) => void;
  dropBone: (dogIndex: number) => void;
  bonePositions: Record<number, THREE.Vector3>;
  setBonePosition: (id: number, pos: THREE.Vector3) => void;

  heldFrisbees: Record<number, number | null>;
  grabFrisbee: (dogIndex: number, frisbeeId: number) => void;
  dropFrisbee: (dogIndex: number) => void;
  frisbeePositions: Record<number, THREE.Vector3>;
  setFrisbeePosition: (id: number, pos: THREE.Vector3) => void;

  throwEvents: { type: 'ball' | 'bone' | 'frisbee', id: number, time: number, dogIndex: number }[];
  triggerThrow: (dogIndex: number, type: 'ball' | 'bone' | 'frisbee', id: number) => void;

  foods: { id: number, pos: [number, number, number] }[];
  poops: { id: number, pos: [number, number, number] }[];
  addPoop: (pos: [number, number, number]) => void;
  removeFood: (id: number) => void;
  resetFood: () => void;

  digSpots: { id: number, pos: [number, number, number], active: boolean }[];
  digSpot: (id: number) => void;

  trashCans: { id: number, pos: [number, number, number], knocked: boolean }[];
  knockTrashCan: (id: number) => void;

  stars: number;
  addStar: () => void;
  resetEnvironment: () => void;

  currentLevel: number;
  levelModifier: LevelModifier;
  currentObjective: ObjectiveState;
  completedObjectives: number;
  controlsLockedUntil: number;
  levelBeat: LevelBeatState | null;
  recordObjectiveEvent: (event: ObjectiveEvent) => void;

  uiAction: UiActionEvent | null;
  triggerUiAction: (action: UiActionType, playerIndex?: number) => void;
  inputFeedback: InputFeedbackEvent | null;
  triggerInputFeedback: (action: UiActionType, source: InputFeedbackSource, playerIndex?: number) => void;

  joystick: { x: number, y: number, active: boolean };
  setJoystick: (x: number, y: number, active: boolean) => void;

  isTwoPlayer: boolean;
  setTwoPlayer: (isTwoPlayer: boolean) => void;

  isNight: boolean;
  toggleNight: () => void;

  bones: { id: number, pos: [number, number, number] }[];
  addBone: (pos: [number, number, number]) => void;
  removeBone: (id: number) => void;
}

export const useGameStore = create<GameState>((set, get) => {
  const applyLevelTransition = (level: number, delayMs = 1100) => {
    const now = Date.now();
    const nextModifier = getLevelModifier(level);
    const previewObjective = refreshObjectiveForModifier(get().currentObjective, nextModifier, now + delayMs);

    set({
      controlsLockedUntil: now + 2200,
      levelBeat: {
        phase: 'outro',
        level,
        title: `Level ${level - 1} complete!`,
        subtitle: `Next up: ${previewObjective.zone}`,
        objectiveTitle: previewObjective.title,
        objectiveDescription: previewObjective.description,
        modifierLabel: nextModifier.label,
        modifierDescription: nextModifier.tradeoff ?? nextModifier.description,
        startedAt: now,
        endsAt: now + 1300
      }
    });

    window.setTimeout(() => {
      const introNow = Date.now();
      const refreshedObjective = refreshObjectiveForModifier(get().currentObjective, nextModifier, introNow);
      set({
        currentLevel: level,
        levelModifier: nextModifier,
        currentObjective: refreshedObjective,
        digSpots: createDigSpots(nextModifier.spawnProfile),
        trashCans: createTrashCanSpawns(nextModifier.spawnProfile),
        foods: createFoodSpawns(nextModifier.spawnProfile).map((food, index) => ({ ...food, id: introNow + index })),
        levelBeat: {
          phase: 'intro',
          level,
          title: `Level ${level}`,
          subtitle: 'Fresh route, same good dog energy.',
          objectiveTitle: refreshedObjective.title,
          objectiveDescription: refreshedObjective.description,
          modifierLabel: nextModifier.label,
          modifierDescription: nextModifier.tradeoff ?? nextModifier.description,
          startedAt: introNow,
          endsAt: introNow + 2100
        }
      });
    }, delayMs);

    window.setTimeout(() => {
      set((state) => (
        state.levelBeat && state.levelBeat.level === level
          ? { levelBeat: null, controlsLockedUntil: 0 }
          : {}
      ));
    }, 3400);
  };

  const queueLevelTransitionIfNeeded = (stars: number) => {
    if (stars > 0 && stars % 10 === 0) {
      applyLevelTransition(getLevel(stars));
    }
  };

  const awardStars = (amount: number) => {
    if (amount <= 0) return;
    for (let i = 0; i < amount; i += 1) {
      playStarSound();
    }
    set((state) => ({ stars: state.stars + amount }));
    queueLevelTransitionIfNeeded(get().stars);
  };

  const initialModifier = getLevelModifier(1);

  return {
    dogPositions: [new THREE.Vector3(), new THREE.Vector3()],
    dogRotations: [0, 0],
    setDogPosition: (index, pos, rot) => set((state) => {
      const newPos = [...state.dogPositions] as [THREE.Vector3, THREE.Vector3];
      const newRot = [...state.dogRotations] as [number, number];
      newPos[index] = pos;
      newRot[index] = rot;
      return { dogPositions: newPos, dogRotations: newRot };
    }),

    barks: [],
    addBark: (pos) => set((state) => {
      const now = Date.now();
      const recentBarks = state.barks.filter((bark) => now - bark.time < 2000);
      return { barks: [...recentBarks, { id: now + Math.random(), pos, time: now }] };
    }),

    ballPositions: {},
    setBallPosition: (id, pos) => set((state) => ({
      ballPositions: { ...state.ballPositions, [id]: pos }
    })),

    catPositions: {},
    setCatPosition: (id, pos) => set((state) => ({
      catPositions: { ...state.catPositions, [id]: pos }
    })),

    birdPositions: {},
    setBirdPosition: (id, pos) => set((state) => ({
      birdPositions: { ...state.birdPositions, [id]: pos }
    })),

    heldBalls: { 0: null, 1: null },
    grabBall: (dogIndex, ballId) => set((state) => ({
      heldBalls: { ...state.heldBalls, [dogIndex]: ballId }
    })),
    dropBall: (dogIndex) => set((state) => ({
      heldBalls: { ...state.heldBalls, [dogIndex]: null }
    })),

    heldBones: { 0: null, 1: null },
    grabBone: (dogIndex, boneId) => set((state) => ({
      heldBones: { ...state.heldBones, [dogIndex]: boneId }
    })),
    dropBone: (dogIndex) => set((state) => ({
      heldBones: { ...state.heldBones, [dogIndex]: null }
    })),

    bonePositions: {},
    setBonePosition: (id, pos) => set((state) => ({
      bonePositions: { ...state.bonePositions, [id]: pos }
    })),

    heldFrisbees: { 0: null, 1: null },
    grabFrisbee: (dogIndex, frisbeeId) => set((state) => ({
      heldFrisbees: { ...state.heldFrisbees, [dogIndex]: frisbeeId }
    })),
    dropFrisbee: (dogIndex) => set((state) => ({
      heldFrisbees: { ...state.heldFrisbees, [dogIndex]: null }
    })),

    frisbeePositions: {},
    setFrisbeePosition: (id, pos) => set((state) => ({
      frisbeePositions: { ...state.frisbeePositions, [id]: pos }
    })),

    throwEvents: [],
    triggerThrow: (dogIndex, type, id) => set((state) => {
      const now = Date.now();
      const recentEvents = state.throwEvents.filter((event) => now - event.time < 2000);
      return { throwEvents: [...recentEvents, { type, id, time: now, dogIndex }] };
    }),

    foods: createFoodSpawns(initialModifier.spawnProfile),
    poops: [],
    addPoop: (pos) => set((state) => {
      const newPoops = [...state.poops, { id: Date.now(), pos }];
      if (newPoops.length > 5) {
        newPoops.shift();
      }
      return { poops: newPoops };
    }),
    removeFood: (id) => set((state) => ({
      foods: state.foods.filter((food) => food.id !== id)
    })),
    resetFood: () => set((state) => ({ foods: createFoodSpawns(state.levelModifier.spawnProfile) })),

    digSpots: createDigSpots(initialModifier.spawnProfile),
    digSpot: (id) => set((state) => ({
      digSpots: state.digSpots.map((spot) => spot.id === id ? { ...spot, active: false } : spot)
    })),

    trashCans: createTrashCanSpawns(initialModifier.spawnProfile),
    knockTrashCan: (id) => set((state) => ({
      trashCans: state.trashCans.map((trashCan) => trashCan.id === id ? { ...trashCan, knocked: true } : trashCan)
    })),

    stars: 0,
    addStar: () => {
      awardStars(1);
    },
    resetEnvironment: () => set((state) => ({
      digSpots: createDigSpots(state.levelModifier.spawnProfile),
      trashCans: createTrashCanSpawns(state.levelModifier.spawnProfile),
      foods: createFoodSpawns(state.levelModifier.spawnProfile).map((food, index) => ({ ...food, id: Date.now() + index }))
    })),

    currentLevel: 1,
    levelModifier: initialModifier,
    currentObjective: createObjectiveState(0, initialModifier),
    completedObjectives: 0,
    controlsLockedUntil: 0,
    levelBeat: null,
    recordObjectiveEvent: (event) => {
      let bonusReward = 0;

      set((state) => {
        const now = Date.now();
        const updatedRequirements = state.currentObjective.requirements.map((requirement) => {
          if (requirement.event !== event) return requirement;
          return {
            ...requirement,
            progress: Math.min(requirement.count, requirement.progress + 1)
          };
        });

        let updatedBonus = state.currentObjective.bonus ? { ...state.currentObjective.bonus } : null;
        if (updatedBonus) {
          if (now > updatedBonus.expiresAt) {
            updatedBonus.expired = true;
          } else if (!updatedBonus.completed && updatedBonus.event === event) {
            updatedBonus.progress = Math.min(updatedBonus.target, updatedBonus.progress + 1);
            if (updatedBonus.progress >= updatedBonus.target) {
              updatedBonus.completed = true;
              bonusReward = updatedBonus.rewardStars;
            }
          }
        }

        const completed = updatedRequirements.every((requirement) => requirement.progress >= requirement.count);
        if (!completed) {
          return {
            currentObjective: {
              ...state.currentObjective,
              requirements: updatedRequirements,
              bonus: updatedBonus
            }
          };
        }

        const nextCompletedObjectives = state.completedObjectives + 1;
        const nextObjective = createObjectiveState(nextCompletedObjectives, state.levelModifier, now);
        return {
          completedObjectives: nextCompletedObjectives,
          currentObjective: nextObjective
        };
      });

      if (bonusReward > 0) {
        awardStars(bonusReward);
      }
    },

    uiAction: null,
    triggerUiAction: (action, playerIndex = 0) => {
      const now = Date.now();
      set({
        uiAction: { action, time: now, playerIndex, source: 'touch' },
        inputFeedback: { action, time: now, playerIndex, source: 'touch' }
      });
    },
    inputFeedback: null,
    triggerInputFeedback: (action, source, playerIndex = 0) => set({
      inputFeedback: { action, time: Date.now(), playerIndex, source }
    }),

    joystick: { x: 0, y: 0, active: false },
    setJoystick: (x, y, active) => set({ joystick: { x, y, active } }),

    isTwoPlayer: false,
    setTwoPlayer: (isTwoPlayer) => set({ isTwoPlayer }),

    isNight: false,
    toggleNight: () => set((state) => ({ isNight: !state.isNight })),

    bones: [],
    addBone: (pos) => set((state) => {
      const newBones = [...state.bones, { id: Date.now() + Math.random(), pos }];
      if (newBones.length > 10) {
        newBones.shift();
      }
      return { bones: newBones };
    }),
    removeBone: (id) => set((state) => ({
      bones: state.bones.filter((bone) => bone.id !== id)
    }))
  };
});
