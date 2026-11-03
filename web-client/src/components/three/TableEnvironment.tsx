import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

function WallLamp({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const fixture = useRef<Group>(null);
  useFrame(({ camera }) => {
    // Like the inward-facing walls, hide fixtures when the wider camera moves outside their wall.
    if (fixture.current) fixture.current.visible = camera.position.z * Math.sign(position[2]) < Math.abs(position[2]);
  });
  return <group ref={fixture} position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, -0.13, 0]}><boxGeometry args={[0.12, 0.55, 0.16]} /><meshStandardMaterial color="#99804e" metalness={0.5} roughness={0.5} /></mesh>
    <mesh position={[0, 0.16, 0.16]}><cylinderGeometry args={[0.2, 0.31, 0.4, 8]} /><meshStandardMaterial color="#dec592" emissive="#dfad5c" emissiveIntensity={0.4} /></mesh>
    <pointLight position={[0, 0.1, 0.5]} color="#ffd08b" intensity={5} distance={7} decay={2} />
  </group>;
}

function Plant({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.42, 0.3, 0.6, 8]} /><meshStandardMaterial color="#9c694b" /></mesh>
    {[0, 1, 2, 3, 4].map((leaf) => <mesh key={leaf} position={[Math.sin(leaf * 2.1) * 0.25, 0.9 + leaf * 0.12, Math.cos(leaf * 2.1) * 0.25]}
      scale={[0.34, 0.65, 0.25]} rotation={[0.2, leaf, 0.5]} castShadow><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color={leaf % 2 ? '#536b42' : '#6c7c4b'} flatShading /></mesh>)}
  </group>;
}

export function TableEnvironment({ tableSize = 1 }: { tableSize?: number }) {
  const shade = useRef<Group>(null);
  useFrame(({ camera }) => {
    // Keep overhead views of the playing surface clear; the light remains on.
    if (shade.current) shade.current.visible = camera.position.y < 4.8;
  });
  return <group>
    {/* One modest room keeps a full orbit meaningful without adding game authority. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#574534" roughness={1} /></mesh>
    {Array.from({ length: 19 }, (_, i) => <mesh key={i} position={[-8.55 + i * 0.95, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[0.92, 20]} /><meshStandardMaterial color={['#66503b', '#604a37', '#6b533d'][i % 3]} roughness={1} />
    </mesh>)}
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[8.3 * (tableSize > 1 ? 1.65 : 1), 9 * (tableSize > 1 ? 1.35 : 1)]} /><meshStandardMaterial color="#6d4938" roughness={1} /></mesh>
    <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[7.9 * (tableSize > 1 ? 1.65 : 1), 8.6 * (tableSize > 1 ? 1.35 : 1)]} /><meshStandardMaterial color="#3e5040" roughness={1} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      {/* Inward-facing walls never hide the table when the camera zooms outside the room. */}
      <mesh position={[0, 2.5, side * 9]} rotation={[0, side > 0 ? Math.PI : 0, 0]} receiveShadow><planeGeometry args={[18.2, 5]} /><meshStandardMaterial color="#344539" /></mesh>
      <mesh position={[side * 9, 2.5, 0]} rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]} receiveShadow><planeGeometry args={[18, 5]} /><meshStandardMaterial color="#3b493a" /></mesh>
      <mesh position={[0, 0.7, side * 8.85]}><boxGeometry args={[18, 1.4, 0.2]} /><meshStandardMaterial color="#4d3b2b" /></mesh>
      <mesh position={[side * 8.85, 0.7, 0]}><boxGeometry args={[0.2, 1.4, 18]} /><meshStandardMaterial color="#4d3b2b" /></mesh>
      <mesh position={[0, 1.45, side * 8.7]}><boxGeometry args={[18, 0.1, 0.16]} /><meshStandardMaterial color="#ac8856" /></mesh>
      <mesh position={[side * 8.7, 1.45, 0]}><boxGeometry args={[0.16, 0.1, 18]} /><meshStandardMaterial color="#ac8856" /></mesh>
      <WallLamp position={[side * 4, 2.9, -8.65]} />
      <WallLamp position={[side * 4, 2.9, 8.65]} rotation={Math.PI} />
      <Plant position={[side * 7.7, 0, -7.7]} />
    </group>)}
    <group position={[0, 0, -7.5]}>
      <mesh position={[0, 0.65, 0]} castShadow><boxGeometry args={[4.7, 1.3, 0.85]} /><meshStandardMaterial color="#47392c" /></mesh>
      <mesh position={[0, 1.33, 0]} castShadow><boxGeometry args={[5, 0.15, 1.05]} /><meshStandardMaterial color="#99764b" /></mesh>
      {[-1.6, -0.8, 0.1, 1.3].map((x, i) => <group key={x} position={[x, 1.42, 0]}>
        <mesh position={[0, 0.21, 0]}><cylinderGeometry args={[0.1, 0.13, 0.42, 6]} /><meshStandardMaterial color={i % 2 ? '#58715b' : '#9b7747'} /></mesh>
        <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.055, 0.055, 0.17, 6]} /><meshStandardMaterial color="#7c8d6e" /></mesh>
      </group>)}
    </group>
    <group position={[0, 3.25, -8.6]}>
      <mesh><boxGeometry args={[2.8, 1.5, 0.12]} /><meshStandardMaterial color="#b28b52" /></mesh>
      <mesh position={[0, 0, 0.08]}><boxGeometry args={[2.6, 1.3, 0.06]} /><meshStandardMaterial color="#202c25" /></mesh>
      <mesh position={[0, 0, 0.13]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.6, 0.6, 0.04]} /><meshStandardMaterial color="#a48955" /></mesh>
    </group>
    <group position={[0, 5.1, 0]}>
      <group ref={shade}>
      <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.025, 0.025, 1.4, 6]} /><meshStandardMaterial color="#292c23" /></mesh>
      {/* This camera-dependent cutaway must not cast a key-light shadow that pops on the felt. */}
      <mesh castShadow={false}><cylinderGeometry args={[0.32, 0.95, 0.5, 12, 1, true]} /><meshStandardMaterial color="#3d5844" side={2} metalness={0.2} roughness={0.6} /></mesh>
      <mesh position={[0, -0.24, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.95, 0.035, 6, 24]} /><meshStandardMaterial color="#b69353" /></mesh>
      <mesh position={[0, -0.22, 0]}><sphereGeometry args={[0.16, 8, 6]} /><meshStandardMaterial color="#ffe6ad" emissive="#ffcf7f" emissiveIntensity={1.5} /></mesh>
      </group>
      <pointLight position={[0, -0.4, 0]} color="#ffd596" intensity={10} distance={10} decay={2} />
    </group>
  </group>;
}
