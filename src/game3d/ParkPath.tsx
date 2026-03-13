import { PARK_PATH_CONNECTORS } from './guidance';

export function ParkPath() {
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
      {PARK_PATH_CONNECTORS.map((c, i) => (
        <mesh key={`connector-${i}`} rotation={[-Math.PI / 2, 0, c.rot]} position={c.pos} receiveShadow>
          <planeGeometry args={[5.5, c.len]} />
          <meshStandardMaterial color="#d7c09a" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
