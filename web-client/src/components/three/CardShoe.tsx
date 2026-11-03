import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { PlayingCard3D } from './PlayingCard3D';

function CardStack({ height }: { height: number }) {
  if (height <= 0) return null;
  return <group>
    <mesh position={[0, height / 2, 0]} castShadow><boxGeometry args={[0.446, height, 0.633]} />
      <meshStandardMaterial color="#f1ecdf" roughness={0.9} /></mesh>
    {Array.from({ length: Math.min(12, Math.floor(height / 0.012)) }, (_, i) =>
      <mesh key={i} position={[0, (i + 1) * 0.012, 0.317]}>
        <boxGeometry args={[0.43, 0.001, 0.001]} /><meshStandardMaterial color="#b2ab9b" /></mesh>)}
    <PlayingCard3D card={null} position={[0, height + 0.001, 0]} />
  </group>;
}

/** Presentation only: the paper stack heights follow server counts. The holder has no game authority. */
export function CardShoe({ remaining, size, shuffling }: { remaining: number; size: number; shuffling: boolean }) {
  const left = useRef<Group>(null), right = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!shuffling || !left.current || !right.current) return;
    const t = clock.elapsedTime * 5;
    left.current.position.y = Math.max(0, Math.sin(t)) * 0.045;
    right.current.position.y = Math.max(0, -Math.sin(t)) * 0.045;
  });
  const full = 0.24, inShoe = full * remaining / size, discarded = full - inShoe;
  return <group position={[0, 1.25, -2.8]}>
    {shuffling ? <>
      <group ref={left} position={[-0.3, 0, 0]} rotation={[0, 0.12, 0]}><CardStack height={full / 2} /></group>
      <group ref={right} position={[0.3, 0, 0]} rotation={[0, -0.12, 0]}><CardStack height={full / 2} /></group>
    </> : <>
      <group position={[1.65, 0, 0]} rotation={[0, -0.3, 0]}>
        <mesh position={[0, 0.022, 0]} castShadow><boxGeometry args={[0.58, 0.044, 0.82]} />
          <meshStandardMaterial color="#283c39" roughness={0.45} metalness={0.2} /></mesh>
        <group position={[0, 0.05, -0.02]}><CardStack height={inShoe} /></group>
        {[-1, 1].map((side) => <group key={side}>
          <mesh position={[side * 0.276, 0.17, 0]}>
            <boxGeometry args={[0.016, 0.27, 0.78]} /><meshStandardMaterial color="#b9d2cc" transparent opacity={0.3} roughness={0.2} depthWrite={false} /></mesh>
          <mesh position={[side * 0.276, 0.31, 0]} castShadow>
            <boxGeometry args={[0.022, 0.012, 0.8]} /><meshStandardMaterial color="#b99b60" metalness={0.7} roughness={0.35} /></mesh>
        </group>)}
        <mesh position={[0, 0.11, -0.4]}><boxGeometry args={[0.57, 0.17, 0.018]} /><meshStandardMaterial color="#294440" /></mesh>
        <mesh position={[0, 0.07, 0.38]}><boxGeometry args={[0.3, 0.05, 0.022]} /><meshStandardMaterial color="#b99b60" metalness={0.6} roughness={0.4} /></mesh>
      </group>
      <group position={[-1.65, 0, -0.05]} rotation={[0, 0.15, 0]}>
        <mesh position={[0, 0.01, 0]} castShadow><boxGeometry args={[0.54, 0.02, 0.74]} /><meshStandardMaterial color="#283c39" /></mesh>
        <group position={[0, 0.02, 0]}><CardStack height={discarded} /></group>
        {[-1, 1].map((side) => <mesh key={side} position={[side * 0.265, 0.035, 0]}>
          <boxGeometry args={[0.012, 0.05, 0.74]} /><meshStandardMaterial color="#b99b60" metalness={0.6} roughness={0.4} /></mesh>)}
      </group>
    </>}
  </group>;
}
