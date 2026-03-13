import { Physics, RigidBody } from '@react-three/rapier';
import { Sky } from '@react-three/drei';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Dog } from './Dog';
import { Cat } from './Cat';
import { Bird } from './Bird';
import { Ball } from './Ball';
import { Tree } from './Tree';
import { Bench } from './Bench';
import { Zwemmeer, AgilityCourse, Graafduinen, Snuffeltuin, GezondheidsCentrum, WereldwijdeWandeling, InnovatiePark, Bezoekerscentrum, EntranceGate } from './MapZones';
import { Food } from './Food';
import { Poop } from './Poop';
import { Bone } from './Bone';
import { Frisbee } from './Frisbee';
import { Hedge } from './Hedge';
import { Bush } from './Bush';
import { Rock } from './Rock';
import { ParkPath } from './ParkPath';
import { DigSpot } from './DigSpot';
import { TrashCan } from './TrashCan';
import { useGameStore } from './store';
import { useFeedbackStore } from './feedbackStore';
import { resolveLiveObjectiveGuide, ZONE_GUIDES } from './guidance';
import { syncZoneAmbience, updateAudioListener } from './audio';
import * as THREE from 'three';
import { useMemo, useRef, useState } from 'react';

type ActiveFeedback = {
  id: number;
  sourceTime: number;
  createdAt: number;
  duration: number;
  type: string;
  position: [number, number, number];
  icon?: string;
  text?: string;
  major?: boolean;
};

function Lighting() {
  const isNight = useGameStore(s => s.isNight);
  
  const dirLight = useRef<THREE.DirectionalLight>(null);
  const hemiLight = useRef<THREE.HemisphereLight>(null);
  const ambientLight = useRef<THREE.AmbientLight>(null);
  const skyRef = useRef<any>(null);

  const targetSunPos = isNight ? new THREE.Vector3(100, -20, 100) : new THREE.Vector3(100, 20, 100);
  const currentSunPos = useRef(new THREE.Vector3(100, 20, 100));

  useFrame((_, delta) => {
    // Lerp sun position
    currentSunPos.current.lerp(targetSunPos, delta * 2);
    
    if (skyRef.current) {
      skyRef.current.material.uniforms.sunPosition.value.copy(currentSunPos.current);
      skyRef.current.material.uniforms.rayleigh.value = THREE.MathUtils.lerp(skyRef.current.material.uniforms.rayleigh.value, isNight ? 0.1 : 2, delta * 2);
      skyRef.current.material.uniforms.turbidity.value = THREE.MathUtils.lerp(skyRef.current.material.uniforms.turbidity.value, isNight ? 0.1 : 10, delta * 2);
    }

    if (dirLight.current) {
      dirLight.current.intensity = THREE.MathUtils.lerp(dirLight.current.intensity, isNight ? 0.2 : 1.2, delta * 2);
      const targetColor = new THREE.Color(isNight ? "#88aaff" : "#ffffff");
      dirLight.current.color.lerp(targetColor, delta * 2);
    }

    if (hemiLight.current) {
      hemiLight.current.intensity = THREE.MathUtils.lerp(hemiLight.current.intensity, isNight ? 0.1 : 0.6, delta * 2);
      const targetSkyColor = new THREE.Color(isNight ? "#111133" : "#ffffff");
      const targetGroundColor = new THREE.Color(isNight ? "#000000" : "#444444");
      hemiLight.current.color.lerp(targetSkyColor, delta * 2);
      hemiLight.current.groundColor.lerp(targetGroundColor, delta * 2);
    }

    if (ambientLight.current) {
      ambientLight.current.intensity = THREE.MathUtils.lerp(ambientLight.current.intensity, isNight ? 0.2 : 0.4, delta * 2);
    }
  });

  return (
    <>
      <Sky ref={skyRef} sunPosition={[100, 20, 100]} turbidity={10} rayleigh={2} />
      <ambientLight ref={ambientLight} intensity={0.4} />
      <hemisphereLight ref={hemiLight} args={["#ffffff", "#444444", 0.6]} />
      <directionalLight 
        ref={dirLight}
        castShadow 
        position={[20, 30, 10]} 
        intensity={1.2} 
        color="#ffffff"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
    </>
  );
}

function CameraController() {
  const dogs = useGameStore(s => s.dogPositions);
  const isTwoPlayer = useGameStore(s => s.isTwoPlayer);
  const levelBeat = useGameStore(s => s.levelBeat);
  const feedbackEvents = useFeedbackStore(s => s.events);
  const lookAtTarget = useRef(new THREE.Vector3());
  const lastKickEventTime = useRef(0);
  const cameraKick = useRef(0);
  
  useFrame((state, delta) => {
    for (const event of feedbackEvents) {
      if (event.major && event.time > lastKickEventTime.current) {
        lastKickEventTime.current = event.time;
        cameraKick.current = 0.45;
      }
    }

    cameraKick.current = Math.max(0, cameraKick.current - delta * 2.2);

    let midX, midZ, zoom;

    if (isTwoPlayer) {
      // Calculate midpoint
      midX = (dogs[0].x + dogs[1].x) / 2;
      midZ = (dogs[0].z + dogs[1].z) / 2;
      
      // Calculate distance between dogs to adjust zoom
      const dist = dogs[0].distanceTo(dogs[1]);
      zoom = Math.max(15, dist * 0.8 + 10);
    } else {
      midX = dogs[0].x;
      midZ = dogs[0].z;
      zoom = 15;
    }

    const activeBeat = levelBeat && levelBeat.endsAt > Date.now() ? levelBeat : null;
    const beatLift = activeBeat ? (activeBeat.phase === 'outro' ? 4.5 : 3) : 0;
    const beatZoom = activeBeat ? (activeBeat.phase === 'outro' ? 5 : 3.5) : 0;

    // Smooth camera movement
    const targetPos = new THREE.Vector3(midX, zoom + beatLift, midZ + (zoom + beatZoom) * 0.8);
    if (cameraKick.current > 0) {
      targetPos.x += (Math.random() - 0.5) * cameraKick.current;
      targetPos.y += (Math.random() - 0.5) * cameraKick.current * 0.7;
      targetPos.z += (Math.random() - 0.5) * cameraKick.current;
    }
    const lerpFactor = 1 - Math.exp(-(activeBeat ? 3.2 : 5) * delta);
    state.camera.position.lerp(targetPos, lerpFactor);
    
    const targetLookAt = new THREE.Vector3(midX, activeBeat ? 1.4 : 0, midZ);
    lookAtTarget.current.lerp(targetLookAt, lerpFactor);
    state.camera.lookAt(lookAtTarget.current);
  });
  return null;
}

function FeedbackRenderer() {
  const feedbackEvents = useFeedbackStore(s => s.events);
  const [activeFeedback, setActiveFeedback] = useState<ActiveFeedback[]>([]);
  const lastEventTime = useRef(0);

  useFrame(() => {
    const now = Date.now();
    const newEvents = feedbackEvents
      .filter((event) => event.time > lastEventTime.current)
      .map((event) => ({
        id: event.id,
        sourceTime: event.time,
        createdAt: now,
        duration: event.major ? 1.4 : 1.0,
        type: event.type,
        position: event.position,
        icon: event.icon,
        text: event.text,
        major: event.major
      }));

    if (newEvents.length > 0) {
      lastEventTime.current = Math.max(...newEvents.map((event) => event.sourceTime), lastEventTime.current);
      setActiveFeedback((current) => [...current, ...newEvents]);
    }

    setActiveFeedback((current) =>
      current.filter((event) => now - event.createdAt < event.duration * 1000 + 250)
    );
  });

  return (
    <group>
      {activeFeedback.map((event) => {
        const age = (Date.now() - event.createdAt) / 1000;
        const progress = Math.min(1, age / event.duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const pulseScale = 0.4 + eased * (event.major ? 4.2 : 2.6);
        const pulseOpacity = 1 - eased;
        const yLift = 1.2 + eased * 1.8;
        const label = event.text ? `${event.icon ? `${event.icon} ` : ''}${event.text}` : event.icon ?? '';
        const ringColor = event.type === 'action_fail' || event.type === 'empty_dig' ? '#ef5350' : '#7cfc00';

        return (
          <group key={event.id} position={[event.position[0], event.position[1] + 0.08, event.position[2]]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[pulseScale, pulseScale, pulseScale]}>
              <ringGeometry args={[0.35, 0.5, 28]} />
              <meshBasicMaterial color={ringColor} transparent opacity={pulseOpacity * 0.7} depthWrite={false} />
            </mesh>
            {label && (
              <Text
                position={[0, yLift, 0]}
                fontSize={event.major ? 0.55 : 0.42}
                color="#ffffff"
                outlineColor="#1f2937"
                outlineWidth={0.08}
                anchorX="center"
                anchorY="middle"
                material-transparent
                material-opacity={Math.max(0, 1 - progress)}
              >
                {label}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}



function Butterflies() {
  const group = useRef<THREE.Group>(null);
  const butterflies = useMemo(() => {
    return Array.from({ length: 20 }).map(() => ({
      x: Math.random() * 60 - 30,
      y: Math.random() * 3 + 1,
      z: Math.random() * 60 - 30,
      color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
      offset: Math.random() * 100,
      speed: 0.5 + Math.random() * 0.5
    }));
  }, []);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((b, i) => {
      const data = butterflies[i];
      const localT = t * data.speed + data.offset;
      b.position.y = data.y + Math.sin(localT * 2) * 0.5;
      b.position.x = data.x + Math.sin(localT * 0.5) * 2;
      b.position.z = data.z + Math.cos(localT * 0.5) * 2;
      
      const dx = Math.cos(localT * 0.5) * data.speed;
      const dz = -Math.sin(localT * 0.5) * data.speed;
      b.rotation.y = Math.atan2(dx, dz);
      
      if (b.children[0] && b.children[1]) {
        b.children[0].rotation.z = Math.sin(localT * 30) * 0.8 + 0.5;
        b.children[1].rotation.z = -Math.sin(localT * 30) * 0.8 - 0.5;
      }
    });
  });

  return (
    <group ref={group}>
      {butterflies.map((data, i) => (
        <group key={i}>
          <group position={[-0.01, 0, 0]}>
            <mesh position={[-0.05, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[0.1, 0.1]} />
              <meshBasicMaterial color={data.color} side={THREE.DoubleSide} />
            </mesh>
          </group>
          <group position={[0.01, 0, 0]}>
            <mesh position={[0.05, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[0.1, 0.1]} />
              <meshBasicMaterial color={data.color} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

function ZoneBeacons() {
  const dogPosition = useGameStore((state) => state.dogPositions[0]);
  const dogRotation = useGameStore((state) => state.dogRotations[0]);
  const currentObjective = useGameStore((state) => state.currentObjective);
  const foods = useGameStore((state) => state.foods);
  const digSpots = useGameStore((state) => state.digSpots);
  const trashCans = useGameStore((state) => state.trashCans);
  const bonePositions = useGameStore((state) => state.bonePositions);
  const heldBoneId = useGameStore((state) => state.heldBones[0]);
  const labelRefs = useRef<Array<any | null>>([]);
  const forward = useRef(new THREE.Vector3());
  const zoneCenter = useRef(new THREE.Vector3());
  const zoneDirection = useRef(new THREE.Vector3());

  const guide = useMemo(() => resolveLiveObjectiveGuide({
    objective: currentObjective,
    dogPosition,
    foods,
    digSpots,
    trashCans,
    bonePositions,
    heldBoneId,
    idleOrStuck: false
  }), [bonePositions, currentObjective, digSpots, dogPosition, foods, heldBoneId, trashCans]);

  useFrame(({ clock }) => {
    forward.current.set(Math.sin(dogRotation), 0, Math.cos(dogRotation));
    const pulse = 0.92 + Math.sin(clock.elapsedTime * 2.2) * 0.05;

    ZONE_GUIDES.forEach((zone, index) => {
      const label = labelRefs.current[index];
      if (!label) return;

      zoneCenter.current.set(zone.world[0], zone.world[1], zone.world[2]);
      const distance = dogPosition.distanceTo(zoneCenter.current);
      zoneDirection.current.copy(zoneCenter.current).sub(dogPosition);
      const directionLength = Math.max(0.001, zoneDirection.current.length());
      zoneDirection.current.divideScalar(directionLength);

      const los = THREE.MathUtils.clamp((forward.current.dot(zoneDirection.current) - 0.1) / 0.75, 0, 1);
      const nearFade = 1 - THREE.MathUtils.smoothstep(distance, 14, 42);
      const objectiveFade = zone.label === currentObjective.zone
        ? 1 - THREE.MathUtils.smoothstep(distance, 20, 58)
        : 0;
      const targetFade = guide.targetPosition && guide.targetPosition.distanceTo(zoneCenter.current) < 16
        ? 1 - THREE.MathUtils.smoothstep(distance, 18, 54)
        : 0;
      const opacity = THREE.MathUtils.clamp(Math.max(nearFade * los, objectiveFade * 0.9, targetFade * 0.75), 0, 0.96);

      label.visible = opacity > 0.03;
      label.material.opacity = opacity;
      label.scale.setScalar(pulse + opacity * 0.1);
    });
  });

  return (
    <group>
      {ZONE_GUIDES.map((zone, index) => (
        <Text
          key={zone.label}
          ref={(node) => {
            labelRefs.current[index] = node;
          }}
          position={zone.labelPos}
          fontSize={zone.label === currentObjective.zone ? 1.95 : 1.7}
          color="#ffffff"
          outlineColor="#1f2937"
          outlineWidth={0.12}
          anchorX="center"
          anchorY="middle"
          material-transparent
          material-opacity={0}
        >
          {zone.label}
        </Text>
      ))}
    </group>
  );
}

function AudioDirector() {
  const listenerPosition = useGameStore((state) => state.dogPositions[0]);
  const isNight = useGameStore((state) => state.isNight);

  useFrame(() => {
    updateAudioListener(listenerPosition);
    syncZoneAmbience(listenerPosition, isNight);
  });

  return null;
}

function ObjectiveGuidance() {
  const dogPosition = useGameStore((state) => state.dogPositions[0]);
  const currentObjective = useGameStore((state) => state.currentObjective);
  const foods = useGameStore((state) => state.foods);
  const digSpots = useGameStore((state) => state.digSpots);
  const trashCans = useGameStore((state) => state.trashCans);
  const bonePositions = useGameStore((state) => state.bonePositions);
  const heldBoneId = useGameStore((state) => state.heldBones[0]);

  const [idleOrStuck, setIdleOrStuck] = useState(false);
  const previousPosition = useRef(new THREE.Vector3());
  const stillTime = useRef(0);
  const lastProgressValue = useRef(-1);
  const lastProgressAt = useRef(Date.now());
  const bestDistanceSinceProgress = useRef(Number.POSITIVE_INFINITY);
  const markerRef = useRef<THREE.Group>(null);
  const markerLabelRef = useRef<any>(null);
  const hintRef = useRef<any>(null);
  const pipRefs = useRef<Array<THREE.Mesh | null>>([]);

  const progressValue = currentObjective.requirements.reduce((total, requirement) => total + requirement.progress, 0);
  const guide = useMemo(() => resolveLiveObjectiveGuide({
    objective: currentObjective,
    dogPosition,
    foods,
    digSpots,
    trashCans,
    bonePositions,
    heldBoneId,
    idleOrStuck
  }), [bonePositions, currentObjective, digSpots, dogPosition, foods, heldBoneId, idleOrStuck, trashCans]);

  useFrame(({ clock }, delta) => {
    const now = Date.now();
    const moved = previousPosition.current.lengthSq() === 0 ? 0 : previousPosition.current.distanceTo(dogPosition);
    const speed = moved / Math.max(delta, 0.016);

    if (progressValue !== lastProgressValue.current) {
      lastProgressValue.current = progressValue;
      lastProgressAt.current = now;
      bestDistanceSinceProgress.current = guide.distance;
      stillTime.current = 0;
      if (idleOrStuck) setIdleOrStuck(false);
    } else {
      if (!guide.immediateAction && guide.distance < bestDistanceSinceProgress.current - 0.75) {
        bestDistanceSinceProgress.current = guide.distance;
        stillTime.current = 0;
        if (idleOrStuck) setIdleOrStuck(false);
      } else if (speed < 0.75) {
        stillTime.current += delta;
      } else {
        stillTime.current = Math.max(0, stillTime.current - delta * 1.4);
      }

      const staleFor = (now - lastProgressAt.current) / 1000;
      const nextIdle = staleFor > 3.5
        && (
          (guide.immediateAction && stillTime.current > 1.5)
          || (!guide.immediateAction && guide.distance > 6 && stillTime.current > 2.3)
        );
      if (nextIdle !== idleOrStuck) {
        setIdleOrStuck(nextIdle);
      }
    }

    previousPosition.current.copy(dogPosition);

    if (markerRef.current && guide.targetPosition) {
      markerRef.current.position.copy(guide.targetPosition);
      markerRef.current.position.y = 0.4 + Math.sin(clock.elapsedTime * 3) * 0.18;
      markerRef.current.rotation.y += delta * 1.2;
    }

    if (markerLabelRef.current) {
      markerLabelRef.current.material.opacity = guide.distance < 28 ? 0.98 : 0.72;
    }

    if (hintRef.current) {
      hintRef.current.material.opacity = guide.hintText ? 0.95 : 0;
    }

    pipRefs.current.forEach((pip, index) => {
      if (!pip) return;
      const wave = 0.38 + (Math.sin(clock.elapsedTime * 4 - index * 0.55) + 1) * 0.22;
      const material = pip.material as THREE.MeshStandardMaterial;
      material.opacity = wave;
      material.emissiveIntensity = 0.6 + wave;
    });
  });

  return (
    <group>
      {guide.targetPosition && (
        <group ref={markerRef}>
          <mesh position={[0, 0.95, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 2.1, 10]} />
            <meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={1.2} transparent opacity={0.75} depthWrite={false} />
          </mesh>
          <mesh position={[0, 2.3, 0]}>
            <coneGeometry args={[0.4, 0.8, 12]} />
            <meshStandardMaterial color="#f97316" emissive="#fb923c" emissiveIntensity={1.4} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
            <ringGeometry args={[1.15, 1.55, 24]} />
            <meshBasicMaterial color="#fef08a" transparent opacity={0.78} depthWrite={false} />
          </mesh>
          <Text
            ref={markerLabelRef}
            position={[0, 3.35, 0]}
            fontSize={0.62}
            color="#fff7ed"
            outlineColor="#1f2937"
            outlineWidth={0.08}
            anchorX="center"
            anchorY="middle"
            material-transparent
            material-opacity={0.9}
          >
            {guide.targetLabel}
          </Text>
        </group>
      )}

      {guide.trailPoints.map((point, index) => (
        <mesh
          key={`trail-${index}`}
          ref={(node) => {
            pipRefs.current[index] = node;
          }}
          position={[point.x, 0.32, point.z]}
        >
          <sphereGeometry args={[0.24, 12, 12]} />
          <meshStandardMaterial color="#fef08a" emissive="#facc15" emissiveIntensity={0.9} transparent opacity={0.42} depthWrite={false} />
        </mesh>
      ))}

      {guide.hintText && (
        <Text
          ref={hintRef}
          position={[dogPosition.x, 3.4, dogPosition.z]}
          fontSize={0.5}
          maxWidth={8}
          color="#ffffff"
          outlineColor="#111827"
          outlineWidth={0.09}
          anchorX="center"
          anchorY="middle"
          material-transparent
          material-opacity={0.95}
        >
          {guide.hintText}
        </Text>
      )}
    </group>
  );
}

function RestAndDepot() {
  return (
    <group>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-28, 2, -34]} castShadow receiveShadow>
          <boxGeometry args={[14, 4, 8]} />
          <meshStandardMaterial color="#82674c" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-45, 1.2, -2]} castShadow receiveShadow>
          <boxGeometry args={[10, 2.4, 7]} />
          <meshStandardMaterial color="#7f8c62" />
        </mesh>
      </RigidBody>
      <mesh position={[-44, 2.8, -2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 2]} />
        <meshStandardMaterial color="#f5f5dc" />
      </mesh>
    </group>
  );
}

export function Scene() {
  // Generate random positions for entities
  const trees = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 132;
      const z = (Math.random() - 0.5) * 132;
      if (Math.abs(x) < 8 || Math.abs(z) < 8 || Math.sqrt(x*x + z*z) < 20) continue;
      arr.push({ id: i, pos: [x, 0, z] as [number, number, number] });
    }
    return arr;
  }, []);

  const bushes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() - 0.5) * 132;
      const z = (Math.random() - 0.5) * 132;
      if (Math.abs(x) < 6 || Math.abs(z) < 6 || Math.sqrt(x*x + z*z) < 18) continue;
      arr.push({ id: i, pos: [x, 0, z] as [number, number, number] });
    }
    return arr;
  }, []);

  const rocks = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 20; i++) {
      const x = (Math.random() - 0.5) * 132;
      const z = (Math.random() - 0.5) * 132;
      if (Math.abs(x) < 5 || Math.abs(z) < 5 || Math.sqrt(x*x + z*z) < 15) continue;
      arr.push({ id: i, pos: [x, 0, z] as [number, number, number], scale: Math.random() * 1.5 + 0.5 });
    }
    return arr;
  }, []);
  
  const cats = useMemo(() => Array.from({ length: 20 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 124, 2, (Math.random() - 0.5) * 124] as [number, number, number],
    color: ['#ff9900', '#333333', '#ffffff'][Math.floor(Math.random() * 3)]
  })), []);
  
  const birds = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 124, 0.5, (Math.random() - 0.5) * 124] as [number, number, number]
  })), []);
  
  const balls = useMemo(() => Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 96, 2, (Math.random() - 0.5) * 96] as [number, number, number],
    color: ['#adff2f', '#ff4500', '#1e90ff'][Math.floor(Math.random() * 3)]
  })), []);

  const frisbees = useMemo(() => Array.from({ length: 4 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 88, 2, (Math.random() - 0.5) * 88] as [number, number, number],
    color: ['#ff00ff', '#00ffff', '#ffff00'][Math.floor(Math.random() * 3)]
  })), []);

  const foods = useGameStore(s => s.foods);
  const poops = useGameStore(s => s.poops);
  const bones = useGameStore(s => s.bones);
  const digSpots = useGameStore(s => s.digSpots);
  const trashCans = useGameStore(s => s.trashCans);
  const isTwoPlayer = useGameStore(s => s.isTwoPlayer);

  const benches = useMemo(() => [
    { pos: [-44, 0, -6], rot: Math.PI / 3 },
    { pos: [-50, 0, 4], rot: Math.PI / 2.2 },
    { pos: [-41, 0, 14], rot: Math.PI / 2.8 },
    { pos: [18, 0, 49], rot: Math.PI },
    { pos: [-7, 0, 57], rot: Math.PI },
    { pos: [45, 0, 33], rot: -Math.PI / 2 },
  ] as { pos: [number, number, number], rot: number }[], []);

  return (
    <>
      <Lighting />

      <CameraController />
      <AudioDirector />

      <Physics>
        {/* Ground */}
        <RigidBody type="fixed" friction={1}>
          <mesh receiveShadow position={[0, -0.5, 0]}>
            <boxGeometry args={[140, 1, 140]} />
            <meshStandardMaterial color="#689f38" />
          </mesh>
        </RigidBody>

        {/* Walls */}
        <RigidBody type="fixed" position={[0, 5, -70]}>
          <mesh><boxGeometry args={[140, 10, 1]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>
        <RigidBody type="fixed" position={[0, 5, 70]}>
          <mesh><boxGeometry args={[140, 10, 1]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>
        <RigidBody type="fixed" position={[-70, 5, 0]}>
          <mesh><boxGeometry args={[1, 10, 140]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>
        <RigidBody type="fixed" position={[70, 5, 0]}>
          <mesh><boxGeometry args={[1, 10, 140]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>

        {/* Hedges (Visible Borders) */}
        <Hedge position={[0, 0, -69]} rotation={0} length={140} />
        <Hedge position={[0, 0, 69]} rotation={0} length={140} />
        <Hedge position={[-69, 0, 0]} rotation={Math.PI / 2} length={140} />
        <Hedge position={[69, 0, 0]} rotation={Math.PI / 2} length={140} />

        {/* Park Elements */}
        <ParkPath />
        <Zwemmeer position={[0, 0, 0]} />
        <group scale={[0.75, 0.75, 0.75]}><AgilityCourse position={[-16, 0, -24]} /></group>
        <group scale={[0.75, 0.75, 0.75]}><Graafduinen position={[37, 0, -23]} /></group>
        <group scale={[0.85, 0.85, 0.85]}><Bezoekerscentrum position={[0, 0, -40]} /></group>
        <group scale={[0.7, 0.7, 0.7]}><WereldwijdeWandeling position={[37, 0, 0]} /></group>
        <group scale={[0.75, 0.75, 0.75]}><InnovatiePark position={[37, 0, 23]} /></group>
        <group scale={[0.7, 0.7, 0.7]}><GezondheidsCentrum position={[33, 0, 42]} /></group>
        <group scale={[0.6, 0.6, 0.6]}><Snuffeltuin position={[10, 0, 38]} /></group>
        <EntranceGate position={[0, 0, 60]} />
        
        {benches.map((b, i) => <Bench key={`bench-${i}`} position={b.pos} rotation={b.rot} />)}
        <RestAndDepot />
        <ZoneBeacons />
        <ObjectiveGuidance />
        
        <Butterflies />

        {/* Players */}
        <Dog playerIndex={0} color="#ff4444" position={[-3, 2, 55]} />
        {isTwoPlayer && <Dog playerIndex={1} color="#4444ff" position={[3, 2, 55]} />}

        {/* Entities */}
        {trees.map(t => <Tree key={`tree-${t.id}`} position={t.pos} />)}
        {bushes.map(b => <Bush key={`bush-${b.id}`} position={b.pos} />)}
        {rocks.map(r => <Rock key={`rock-${r.id}`} position={r.pos} scale={r.scale} />)}
        {cats.map(c => <Cat key={`cat-${c.id}`} id={c.id} position={c.pos} color={c.color} />)}
        {birds.map(b => <Bird key={`bird-${b.id}`} id={b.id} position={b.pos} />)}
        {balls.map(b => <Ball key={`ball-${b.id}`} id={b.id} position={b.pos} color={b.color} />)}
        {frisbees.map(f => <Frisbee key={`frisbee-${f.id}`} id={f.id} position={f.pos} color={f.color} />)}
        {foods.map(f => <Food key={`food-${f.id}`} id={f.id} position={f.pos} />)}
        {poops.map(p => <Poop key={`poop-${p.id}`} position={p.pos} />)}
        {bones.map(b => <Bone key={`bone-${b.id}`} id={b.id} position={b.pos} />)}
        {digSpots.map(d => <DigSpot key={`digspot-${d.id}`} position={d.pos} active={d.active} />)}
        {trashCans.map(t => <TrashCan key={`trashcan-${t.id}`} id={t.id} position={t.pos} knocked={t.knocked} />)}
        <FeedbackRenderer />
      </Physics>
    </>
  );
}
