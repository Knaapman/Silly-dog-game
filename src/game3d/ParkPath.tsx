import * as THREE from 'three';

export function ParkPath() {
  const connectors = [
    { pos: [-16, 0, -28], rot: Math.PI / 10, len: 28 },
    { pos: [0, 0, -34], rot: 0, len: 24 },
    { pos: [20, 0, -24], rot: -Math.PI / 8, len: 24 },
    { pos: [30, 0, -2], rot: Math.PI / 2, len: 22 },
    { pos: [30, 0, 20], rot: Math.PI / 2.3, len: 20 },
    { pos: [17, 0, 40], rot: Math.PI / 2.7, len: 24 },
    { pos: [0, 0, 50], rot: Math.PI / 2, len: 20 },
    { pos: [-12, 0, 36], rot: -Math.PI / 3.2, len: 20 },
    { pos: [-25, 0, 18], rot: -Math.PI / 2.9, len: 24 },
    { pos: [-26, 0, -4], rot: -Math.PI / 2.2, len: 26 },
  ] as const;

  return (
    <group position={[0, 0.01, 0]}>
      {/* Main pond ring walk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[19.5, 27, 64]} />
        <meshStandardMaterial color="#d7c09a" roughness={0.95} />
      </mesh>

      {/* Park perimeter loop */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[52, 59, 96]} />
        <meshStandardMaterial color="#d7c09a" roughness={0.95} />
      </mesh>

      {/* South entrance path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 58]} receiveShadow>
        <planeGeometry args={[8, 28]} />
        <meshStandardMaterial color="#d7c09a" roughness={1} />
      </mesh>

      {/* Local connectors to each zone */}
      {connectors.map((c, i) => (
        <mesh key={`connector-${i}`} rotation={[-Math.PI / 2, 0, c.rot]} position={c.pos} receiveShadow>
          <planeGeometry args={[5.5, c.len]} />
          <meshStandardMaterial color="#d7c09a" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
