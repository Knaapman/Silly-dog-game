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
import * as THREE from 'three';
import { useMemo, useRef } from 'react';

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
  const lookAtTarget = useRef(new THREE.Vector3());
  
  useFrame((state, delta) => {
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

    // Smooth camera movement
    const targetPos = new THREE.Vector3(midX, zoom, midZ + zoom * 0.8);
    const lerpFactor = 1 - Math.exp(-5 * delta);
    state.camera.position.lerp(targetPos, lerpFactor);
    
    const targetLookAt = new THREE.Vector3(midX, 0, midZ);
    lookAtTarget.current.lerp(targetLookAt, lerpFactor);
    state.camera.lookAt(lookAtTarget.current);
  });
  return null;
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
  const zones = [
    { label: 'Rustzone', pos: [-48, 5.5, -4] as [number, number, number] },
    { label: 'Onderhoudsdepot', pos: [-28, 5.5, -36] as [number, number, number] },
    { label: 'Bezoekerscentrum', pos: [0, 6, -38] as [number, number, number] },
    { label: 'Agility Course', pos: [-12, 5.5, -22] as [number, number, number] },
    { label: 'Graafduinen', pos: [36, 5.5, -22] as [number, number, number] },
    { label: 'Wereldwijde Wandeling', pos: [35, 5.5, 0] as [number, number, number] },
    { label: 'Innovatiepark', pos: [33, 5.5, 22] as [number, number, number] },
    { label: 'Snuffeltuin', pos: [10, 4.5, 37] as [number, number, number] },
    { label: 'Gezondheidscentrum', pos: [31, 5, 41] as [number, number, number] },
    { label: 'Zwemmeer', pos: [0, 4.5, 8] as [number, number, number] }
  ];

  return (
    <group>
      {zones.map((zone) => (
        <Text
          key={zone.label}
          position={zone.pos}
          fontSize={1.7}
          color="#ffffff"
          outlineColor="#1f2937"
          outlineWidth={0.12}
          anchorX="center"
          anchorY="middle"
        >
          {zone.label}
        </Text>
      ))}
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
      </Physics>
    </>
  );
}
