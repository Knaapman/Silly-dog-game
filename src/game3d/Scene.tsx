import { Physics, RigidBody } from '@react-three/rapier';
import { Sky } from '@react-three/drei';
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

export function Scene() {
  // Generate random positions for entities
  const trees = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 180;
      const z = (Math.random() - 0.5) * 180;
      if (Math.abs(x) < 8 || Math.abs(z) < 8 || Math.sqrt(x*x + z*z) < 20) continue;
      arr.push({ id: i, pos: [x, 0, z] as [number, number, number] });
    }
    return arr;
  }, []);

  const bushes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() - 0.5) * 180;
      const z = (Math.random() - 0.5) * 180;
      if (Math.abs(x) < 6 || Math.abs(z) < 6 || Math.sqrt(x*x + z*z) < 18) continue;
      arr.push({ id: i, pos: [x, 0, z] as [number, number, number] });
    }
    return arr;
  }, []);

  const rocks = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 20; i++) {
      const x = (Math.random() - 0.5) * 180;
      const z = (Math.random() - 0.5) * 180;
      if (Math.abs(x) < 5 || Math.abs(z) < 5 || Math.sqrt(x*x + z*z) < 15) continue;
      arr.push({ id: i, pos: [x, 0, z] as [number, number, number], scale: Math.random() * 1.5 + 0.5 });
    }
    return arr;
  }, []);
  
  const cats = useMemo(() => Array.from({ length: 20 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 160, 2, (Math.random() - 0.5) * 160] as [number, number, number],
    color: ['#ff9900', '#333333', '#ffffff'][Math.floor(Math.random() * 3)]
  })), []);
  
  const birds = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 160, 0.5, (Math.random() - 0.5) * 160] as [number, number, number]
  })), []);
  
  const balls = useMemo(() => Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 80, 2, (Math.random() - 0.5) * 80] as [number, number, number],
    color: ['#adff2f', '#ff4500', '#1e90ff'][Math.floor(Math.random() * 3)]
  })), []);

  const frisbees = useMemo(() => Array.from({ length: 4 }).map((_, i) => ({
    id: i,
    pos: [(Math.random() - 0.5) * 60, 2, (Math.random() - 0.5) * 60] as [number, number, number],
    color: ['#ff00ff', '#00ffff', '#ffff00'][Math.floor(Math.random() * 3)]
  })), []);

  const foods = useGameStore(s => s.foods);
  const poops = useGameStore(s => s.poops);
  const bones = useGameStore(s => s.bones);
  const digSpots = useGameStore(s => s.digSpots);
  const trashCans = useGameStore(s => s.trashCans);
  const isTwoPlayer = useGameStore(s => s.isTwoPlayer);

  const benches = useMemo(() => [
    { pos: [10, 0, 10], rot: Math.PI / 4 },
    { pos: [-10, 0, 10], rot: -Math.PI / 4 },
    { pos: [10, 0, -10], rot: 3 * Math.PI / 4 },
    { pos: [-10, 0, -10], rot: -3 * Math.PI / 4 },
    { pos: [0, 0, 15], rot: 0 },
    { pos: [0, 0, -15], rot: Math.PI },
  ] as { pos: [number, number, number], rot: number }[], []);

  return (
    <>
      <Lighting />

      <CameraController />

      <Physics>
        {/* Ground */}
        <RigidBody type="fixed" friction={1}>
          <mesh receiveShadow position={[0, -0.5, 0]}>
            <boxGeometry args={[200, 1, 200]} />
            <meshStandardMaterial color="#689f38" />
          </mesh>
        </RigidBody>

        {/* Walls */}
        <RigidBody type="fixed" position={[0, 5, -100]}>
          <mesh><boxGeometry args={[200, 10, 1]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>
        <RigidBody type="fixed" position={[0, 5, 100]}>
          <mesh><boxGeometry args={[200, 10, 1]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>
        <RigidBody type="fixed" position={[-100, 5, 0]}>
          <mesh><boxGeometry args={[1, 10, 200]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>
        <RigidBody type="fixed" position={[100, 5, 0]}>
          <mesh><boxGeometry args={[1, 10, 200]} /><meshStandardMaterial visible={false} /></mesh>
        </RigidBody>

        {/* Hedges (Visible Borders) */}
        <Hedge position={[0, 0, -99]} rotation={0} length={200} />
        <Hedge position={[0, 0, 99]} rotation={0} length={200} />
        <Hedge position={[-99, 0, 0]} rotation={Math.PI / 2} length={200} />
        <Hedge position={[99, 0, 0]} rotation={Math.PI / 2} length={200} />

        {/* Park Elements */}
        <ParkPath />
        <Zwemmeer position={[0, 0, 0]} />
        <AgilityCourse position={[-40, 0, -40]} />
        <Graafduinen position={[40, 0, -40]} />
        <Bezoekerscentrum position={[0, 0, -60]} />
        <WereldwijdeWandeling position={[50, 0, 0]} />
        <InnovatiePark position={[50, 0, 40]} />
        <GezondheidsCentrum position={[20, 0, 60]} />
        <Snuffeltuin position={[-30, 0, 60]} />
        <EntranceGate position={[0, 0, 80]} />
        
        {benches.map((b, i) => <Bench key={`bench-${i}`} position={b.pos} rotation={b.rot} />)}
        
        <Butterflies />

        {/* Players */}
        <Dog playerIndex={0} color="#ff4444" position={[-5, 2, 20]} />
        {isTwoPlayer && <Dog playerIndex={1} color="#4444ff" position={[5, 2, 20]} />}

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
