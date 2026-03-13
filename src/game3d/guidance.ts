import * as THREE from 'three';

export type GuidePoint = [number, number, number];

export type ObjectiveRequirementLike = {
  event: 'jump' | 'sniff' | 'drink' | 'dig' | 'eat' | 'trash';
  count: number;
  label: string;
  progress: number;
};

export type ObjectiveLike = {
  id: string;
  title: string;
  description: string;
  zone: string;
  requirements: ObjectiveRequirementLike[];
  loopIndex: number;
};

export type FoodLike = { id: number; pos: GuidePoint };
export type DigSpotLike = { id: number; pos: GuidePoint; active: boolean };
export type TrashCanLike = { id: number; pos: GuidePoint; knocked: boolean };

export type LiveObjectiveGuide = {
  title: string;
  zoneLabel: string;
  targetLabel: string;
  actionLabel: string;
  completionLabel: string;
  statusLabel: string;
  distance: number;
  targetPosition: THREE.Vector3 | null;
  trailPoints: THREE.Vector3[];
  hintText: string | null;
  immediateAction: boolean;
};

export const ZONE_GUIDES = [
  { label: 'Rustzone', world: [-48, 0, -4] as GuidePoint, labelPos: [-48, 5.5, -4] as GuidePoint },
  { label: 'Onderhoudsdepot', world: [-28, 0, -36] as GuidePoint, labelPos: [-28, 5.5, -36] as GuidePoint },
  { label: 'Bezoekerscentrum', world: [0, 0, -38] as GuidePoint, labelPos: [0, 6, -38] as GuidePoint },
  { label: 'Agilityparcours', world: [-12, 0, -22] as GuidePoint, labelPos: [-12, 5.5, -22] as GuidePoint },
  { label: 'Graafduinen', world: [36, 0, -22] as GuidePoint, labelPos: [36, 5.5, -22] as GuidePoint },
  { label: 'Wereldwijde Wandeling', world: [35, 0, 0] as GuidePoint, labelPos: [35, 5.5, 0] as GuidePoint },
  { label: 'Innovatiepark', world: [33, 0, 22] as GuidePoint, labelPos: [33, 5.5, 22] as GuidePoint },
  { label: 'Snuffeltuin', world: [10, 0, 37] as GuidePoint, labelPos: [10, 4.5, 37] as GuidePoint },
  { label: 'Gezondheidscentrum', world: [31, 0, 41] as GuidePoint, labelPos: [31, 5, 41] as GuidePoint },
  { label: 'Zwemmeer', world: [0, 0, 8] as GuidePoint, labelPos: [0, 4.5, 8] as GuidePoint },
  { label: 'Parkpaden', world: [0, 0, 50] as GuidePoint, labelPos: [0, 5.2, 50] as GuidePoint },
  { label: 'Voerplekken', world: [0, 0, 10] as GuidePoint, labelPos: [0, 5.2, 10] as GuidePoint }
] as const;

export const PARK_PATH_CONNECTORS = [
  { pos: [-16, 0, -28] as GuidePoint, rot: Math.PI / 10, len: 28 },
  { pos: [0, 0, -34] as GuidePoint, rot: 0, len: 24 },
  { pos: [20, 0, -24] as GuidePoint, rot: -Math.PI / 8, len: 24 },
  { pos: [30, 0, -2] as GuidePoint, rot: Math.PI / 2, len: 22 },
  { pos: [30, 0, 20] as GuidePoint, rot: Math.PI / 2.3, len: 20 },
  { pos: [17, 0, 40] as GuidePoint, rot: Math.PI / 2.7, len: 24 },
  { pos: [0, 0, 50] as GuidePoint, rot: Math.PI / 2, len: 20 },
  { pos: [-12, 0, 36] as GuidePoint, rot: -Math.PI / 3.2, len: 20 },
  { pos: [-25, 0, 18] as GuidePoint, rot: -Math.PI / 2.9, len: 24 },
  { pos: [-26, 0, -4] as GuidePoint, rot: -Math.PI / 2.2, len: 26 }
] as const;

const GUIDE_NODE_POSITIONS = {
  entrance: [0, 0, 58] as GuidePoint,
  southHub: [0, 0, 50] as GuidePoint,
  westSouth: [-12, 0, 36] as GuidePoint,
  westMid: [-25, 0, 18] as GuidePoint,
  westNorth: [-26, 0, -4] as GuidePoint,
  agilityGate: [-16, 0, -28] as GuidePoint,
  visitorGate: [0, 0, -34] as GuidePoint,
  eastNorth: [20, 0, -24] as GuidePoint,
  eastMid: [30, 0, -2] as GuidePoint,
  eastSouth: [30, 0, 20] as GuidePoint,
  southEast: [17, 0, 40] as GuidePoint
} as const;

const GUIDE_GRAPH: Record<keyof typeof GUIDE_NODE_POSITIONS, Array<keyof typeof GUIDE_NODE_POSITIONS>> = {
  entrance: ['southHub'],
  southHub: ['entrance', 'westSouth', 'southEast'],
  westSouth: ['southHub', 'westMid'],
  westMid: ['westSouth', 'westNorth'],
  westNorth: ['westMid', 'agilityGate', 'visitorGate'],
  agilityGate: ['westNorth'],
  visitorGate: ['westNorth', 'eastNorth'],
  eastNorth: ['visitorGate', 'eastMid'],
  eastMid: ['eastNorth', 'eastSouth'],
  eastSouth: ['eastMid', 'southEast'],
  southEast: ['eastSouth', 'southHub']
};

function toVector3(point: GuidePoint): THREE.Vector3 {
  return new THREE.Vector3(point[0], point[1], point[2]);
}

function getZoneCenter(label: string): THREE.Vector3 {
  const zone = ZONE_GUIDES.find((entry) => entry.label === label);
  return zone ? toVector3(zone.world) : new THREE.Vector3();
}

function getNearestRequirement(requirements: ObjectiveRequirementLike[]) {
  return requirements.find((requirement) => requirement.progress < requirement.count) ?? requirements[requirements.length - 1];
}

function getNearestVector<T>(
  origin: THREE.Vector3,
  entries: T[],
  getPosition: (entry: T) => THREE.Vector3
): { entry: T; position: THREE.Vector3; distance: number } | null {
  let best: { entry: T; position: THREE.Vector3; distance: number } | null = null;
  for (const entry of entries) {
    const position = getPosition(entry);
    const distance = origin.distanceTo(position);
    if (!best || distance < best.distance) {
      best = { entry, position, distance };
    }
  }
  return best;
}

function getNearestGuideNode(point: THREE.Vector3) {
  let bestKey: keyof typeof GUIDE_NODE_POSITIONS = 'southHub';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [key, value] of Object.entries(GUIDE_NODE_POSITIONS) as Array<[keyof typeof GUIDE_NODE_POSITIONS, GuidePoint]>) {
    const distance = point.distanceTo(toVector3(value));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  }
  return bestKey;
}

function buildGuideNodePath(start: keyof typeof GUIDE_NODE_POSITIONS, goal: keyof typeof GUIDE_NODE_POSITIONS) {
  if (start === goal) return [start];
  const queue: Array<keyof typeof GUIDE_NODE_POSITIONS> = [start];
  const visited = new Set<keyof typeof GUIDE_NODE_POSITIONS>([start]);
  const parent = new Map<keyof typeof GUIDE_NODE_POSITIONS, keyof typeof GUIDE_NODE_POSITIONS>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const next of GUIDE_GRAPH[current]) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === goal) {
        const path: Array<keyof typeof GUIDE_NODE_POSITIONS> = [goal];
        let step: keyof typeof GUIDE_NODE_POSITIONS | undefined = goal;
        while (step && step !== start) {
          step = parent.get(step);
          if (step) path.unshift(step);
        }
        return path;
      }
      queue.push(next);
    }
  }

  return [start, goal];
}

function sampleSegment(start: THREE.Vector3, end: THREE.Vector3, step = 6) {
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length < step) return [];
  const direction = delta.normalize();
  const samples: THREE.Vector3[] = [];
  for (let distance = step; distance < length; distance += step) {
    samples.push(start.clone().add(direction.clone().multiplyScalar(distance)));
  }
  return samples;
}

function buildTrailPoints(origin: THREE.Vector3, target: THREE.Vector3) {
  const startNode = getNearestGuideNode(origin);
  const goalNode = getNearestGuideNode(target);
  const nodePath = buildGuideNodePath(startNode, goalNode);
  const nodes = nodePath.map((key) => toVector3(GUIDE_NODE_POSITIONS[key]));
  const anchors = [origin.clone(), ...nodes, target.clone()];
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    points.push(...sampleSegment(anchors[index], anchors[index + 1]));
  }
  return points.filter((point) => origin.distanceTo(point) > 5 && target.distanceTo(point) > 4).slice(0, 16);
}

function formatCompletionLabel(requirement: ObjectiveRequirementLike) {
  const remaining = Math.max(0, requirement.count - requirement.progress);
  if (remaining <= 0) return `${requirement.label} voltooid`;
  if (remaining === 1) return `${requirement.label}: nog 1`;
  return `${requirement.label}: nog ${remaining}`;
}

type GuideParams = {
  objective: ObjectiveLike;
  dogPosition: THREE.Vector3;
  foods: FoodLike[];
  digSpots: DigSpotLike[];
  trashCans: TrashCanLike[];
  bonePositions: Record<number, THREE.Vector3>;
  heldBoneId: number | null | undefined;
  idleOrStuck: boolean;
};

export function resolveLiveObjectiveGuide({
  objective,
  dogPosition,
  foods,
  digSpots,
  trashCans,
  bonePositions,
  heldBoneId,
  idleOrStuck
}: GuideParams): LiveObjectiveGuide {
  const pending = getNearestRequirement(objective.requirements);
  const looseBones = Object.entries(bonePositions).map(([id, position]) => ({ id: Number(id), position }));
  let targetPosition: THREE.Vector3 | null = null;
  let targetLabel = objective.zone;
  let actionLabel = objective.description;
  let immediateAction = false;

  if (objective.id === 'agility-sprint') {
    targetPosition = getZoneCenter('Agilityparcours');
    targetLabel = 'Agilityhelling';
    actionLabel = 'Ga naar het parcours en spring netjes';
  } else if (objective.id === 'hot-trail') {
    if (pending.event === 'dig') {
      const activeSpot = getNearestVector(
        dogPosition,
        digSpots.filter((spot) => spot.active),
        (spot) => toVector3(spot.pos)
      );
      if (activeSpot) {
        targetPosition = activeSpot.position;
        targetLabel = 'Warme graafplek';
        actionLabel = 'Snuffel in de buurt en graaf op de hotspot';
      } else {
        targetPosition = getZoneCenter('Snuffeltuin');
        targetLabel = 'Snuffeltuin';
        actionLabel = 'Volg het geurspoor naar de tuin';
      }
    } else {
      targetPosition = getZoneCenter('Snuffeltuin');
      targetLabel = 'Snuffeltuin';
      actionLabel = 'Ga naar de snuffeltuin en snuffel twee keer';
    }
  } else if (objective.id === 'cooldown-lap') {
    targetPosition = new THREE.Vector3(0, 0, 7.2);
    targetLabel = 'Waterkant';
    actionLabel = 'Loop naar de oever en drink';
  } else if (objective.id === 'cleanup-chaos') {
    const targetCan = getNearestVector(
      dogPosition,
      trashCans.filter((trashCan) => !trashCan.knocked),
      (trashCan) => toVector3(trashCan.pos)
    );
    if (targetCan) {
      targetPosition = targetCan.position;
      targetLabel = 'Staande prullenbak';
      actionLabel = 'Kom dichtbij en tik een bak om';
    } else {
      targetPosition = getZoneCenter('Parkpaden');
      targetLabel = 'Hoofdpad';
      actionLabel = 'Zoek op de paden naar een rechtopstaande bak';
    }
  } else if (objective.id === 'snack-finish') {
    if (heldBoneId != null) {
      immediateAction = true;
      targetPosition = null;
      targetLabel = 'Bot in bek';
      actionLabel = 'Kauw op het bot dat je draagt';
    } else {
      const snackTarget = getNearestVector(
        dogPosition,
        [
          ...foods.map((food) => ({ type: 'food' as const, position: toVector3(food.pos) })),
          ...looseBones.map((bone) => ({ type: 'bone' as const, position: bone.position }))
        ],
        (entry) => entry.position
      );
      if (snackTarget) {
        targetPosition = snackTarget.position;
        targetLabel = snackTarget.entry.type === 'bone' ? 'Los bot' : 'Voerbak';
        actionLabel = snackTarget.entry.type === 'bone'
          ? 'Pak of kauw op het bot in de buurt'
          : 'Ga naar de dichtstbijzijnde snack en eet';
      } else {
        targetPosition = getZoneCenter('Voerplekken');
        targetLabel = 'Voerroute';
        actionLabel = 'Doorzoek het park naar overgebleven snacks';
      }
    }
  }

  if (!targetPosition && !immediateAction) {
    targetPosition = getZoneCenter(objective.zone);
  }

  const distance = targetPosition ? dogPosition.distanceTo(targetPosition) : 0;
  const trailPoints = targetPosition && distance > 12 ? buildTrailPoints(dogPosition, targetPosition) : [];

  let hintText: string | null = null;
  if (idleOrStuck) {
    if (immediateAction) hintText = 'Je kunt dit hier meteen afronden.';
    else if (objective.id === 'agility-sprint') hintText = 'De marker leidt naar de sprongen. Maak vaart en spring.';
    else if (objective.id === 'hot-trail') hintText = pending.event === 'dig'
      ? 'Een warme marker betekent graafafstand. Snuffel opnieuw als je hem kwijt bent.'
      : 'Ga naar de snuffeltuin en gebruik snuffelen om de hotspot te vinden.';
    else if (objective.id === 'cooldown-lap') hintText = 'Ga op de rand van het water staan en drink dan.';
    else if (objective.id === 'cleanup-chaos') hintText = 'Volg de stippen naar de dichtstbijzijnde rechtopstaande bak.';
    else if (objective.id === 'snack-finish') hintText = 'Volg de marker naar eten, of kauw op een bot als je er een oppakt.';
  }

  const statusBits = [`${pending.progress}/${pending.count}`];
  if (!immediateAction) statusBits.unshift(`${Math.round(distance)} m afstand`);

  return {
    title: objective.title,
    zoneLabel: objective.zone,
    targetLabel,
    actionLabel,
    completionLabel: formatCompletionLabel(pending),
    statusLabel: statusBits.join('  •  '),
    distance,
    targetPosition,
    trailPoints,
    hintText,
    immediateAction
  };
}
