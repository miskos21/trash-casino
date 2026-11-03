import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

const deckHeight = 0.07; // Visual height of one deck; six decks fill the shoe.

/** Presentation only: stack heights follow the server's remaining and dealt counts. */
export function CardShoe({ remaining, size, shuffling }: { remaining: number; size: number; shuffling: boolean }) {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!shuffling || !left.current || !right.current) return;
    const t = clock.elapsedTime * 5;
    left.current.position.y = Math.max(0, Math.sin(t)) * 0.08;
    right.current.position.y = Math.max(0, -Math.sin(t)) * 0.08;
  });
  const full = deckHeight * size / 52;
  const inShoe = full * remaining / size;
  const discarded = full - inShoe;
  return <group position={[0, 1.248, -1.05]}>
    {shuffling ? <>
      {/* Two half-shoes riffled together before the first deal. */}
      <group ref={left} position={[-0.25, 0, 0]}><mesh position={[0, full / 4, 0]} castShadow>
        <boxGeometry args={[0.3, full / 2, 0.42]} /><meshStandardMaterial color="#e9e0c8" /></mesh></group>
      <group ref={right} position={[0.25, 0, 0]}><mesh position={[0, full / 4, 0]} castShadow>
        <boxGeometry args={[0.3, full / 2, 0.42]} /><meshStandardMaterial color="#e9e0c8" /></mesh></group>
    </> : <>
      {/* The shoe: a dark open box with the remaining cards inside. */}
      <group position={[0.85, 0, 0]} rotation={[0, -0.25, 0]}>
        <mesh position={[0, 0.11, 0]} castShadow><boxGeometry args={[0.42, 0.22, 0.56]} /><meshStandardMaterial color="#3a2a1e" roughness={0.8} /></mesh>
        {inShoe > 0 && <mesh position={[0, 0.23 + inShoe / 2, -0.02]}><boxGeometry args={[0.32, inShoe, 0.44]} /><meshStandardMaterial color="#7c2f2a" /></mesh>}
      </group>
      {/* Discard tray: dealt cards pile up face down. */}
      {discarded > 0 && <mesh position={[-0.85, discarded / 2, 0]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.32, discarded, 0.44]} /><meshStandardMaterial color="#7c2f2a" /></mesh>}
    </>}
  </group>;
}
