import * as THREE from 'three';

export function ParkPath() {
  return (
    <group position={[0, 0.01, 0]}>
      {/* Central ring around the pond */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[8.8, 16, 32]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
      
      {/* Paths leading out N, S, E, W */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 58]} receiveShadow>
        <planeGeometry args={[6, 84]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -58]} receiveShadow>
        <planeGeometry args={[6, 84]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[58, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 84]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[-58, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 84]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
      
      {/* Outer ring path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[80, 86, 64]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
    </group>
  );
}
