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

function spawnNear(zone: keyof typeof zoneSpawnAnchors, y = 0): [number, number, number] {
  const anchor = zoneSpawnAnchors[zone];
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * anchor.radius;
  return [
    anchor.x + Math.cos(angle) * distance,
    y,
    anchor.z + Math.sin(angle) * distance
  ];
}

function createFoodSpawns() {
  const route: (keyof typeof zoneSpawnAnchors)[] = [
    'bezoekerscentrum',
    'agility',
    'graafduinen',
    'wandeling',
    'snuffeltuin',
    'gezondheid',
    'centralePlaza'
  ];
  return route.slice(0, 6).map((zone, i) => ({
    id: i,
    pos: spawnNear(zone, 0)
  }));
}

function createDigSpots() {
  const route: (keyof typeof zoneSpawnAnchors)[] = [
    'agility',
    'graafduinen',
    'snuffeltuin',
    'wandeling',
    'innovatie',
    'gezondheid',
    'bezoekerscentrum',
    'centralePlaza'
  ];
  return route.map((zone, i) => ({
    id: i,
    pos: spawnNear(zone, 0),
    active: true
  }));
}

function createTrashCanSpawns() {
  const route: (keyof typeof zoneSpawnAnchors)[] = ['bezoekerscentrum', 'wandeling', 'snuffeltuin', 'gezondheid'];
  return route.map((zone, i) => ({
    id: i,
    pos: spawnNear(zone, 0),
    knocked: false
  }));
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

  uiAction: { action: string, time: number, playerIndex: number } | null;
  triggerUiAction: (action: string, playerIndex?: number) => void;

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

export const useGameStore = create<GameState>((set) => ({
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
    const recentBarks = state.barks.filter(b => now - b.time < 2000);
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
    const recentEvents = state.throwEvents.filter(e => now - e.time < 2000);
    return { throwEvents: [...recentEvents, { type, id, time: now, dogIndex }] };
  }),

  foods: createFoodSpawns(),
  poops: [],
  addPoop: (pos) => set((state) => {
    const newPoops = [...state.poops, { id: Date.now(), pos }];
    if (newPoops.length > 5) {
      newPoops.shift(); // Remove oldest
    }
    return { poops: newPoops };
  }),
  removeFood: (id) => set((state) => ({
    foods: state.foods.filter(f => f.id !== id)
  })),
  resetFood: () => set(() => ({ foods: createFoodSpawns() })),

  digSpots: createDigSpots(),
  digSpot: (id) => set((state) => ({
    digSpots: state.digSpots.map(s => s.id === id ? { ...s, active: false } : s)
  })),

  trashCans: createTrashCanSpawns(),
  knockTrashCan: (id) => set((state) => ({
    trashCans: state.trashCans.map(t => t.id === id ? { ...t, knocked: true } : t)
  })),

  stars: 0,
  addStar: () => set((state) => {
    playStarSound();
    return { stars: state.stars + 1 };
  }),
  resetEnvironment: () => set((state) => ({ 
    digSpots: createDigSpots(),
    trashCans: createTrashCanSpawns(),
    foods: createFoodSpawns().map((food, i) => ({ ...food, id: Date.now() + i }))
  })),

  uiAction: null,
  triggerUiAction: (action, playerIndex = 0) => set({ uiAction: { action, time: Date.now(), playerIndex } }),

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
      newBones.shift(); // Remove oldest
    }
    return { bones: newBones };
  }),
  removeBone: (id) => set((state) => ({
    bones: state.bones.filter(b => b.id !== id)
  }))
}));
