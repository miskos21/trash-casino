import type { Avatar } from '@raccoon-royale/shared-schemas/types';
import { AnimalAvatar } from './AnimalAvatar';

export function PlayerSeat({ position, rotation, animal, occupied = true }: { position: [number, number, number]; rotation: number; animal: Avatar; occupied?: boolean }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    {occupied && <group position={[0, 0.35, 0]}><AnimalAvatar animal={animal} /></group>}
    <mesh position={[0, 0.48, 0]} castShadow>
      <cylinderGeometry args={[0.52, 0.48, 0.18, 8]} /><meshStandardMaterial color="#785039" />
    </mesh>
    <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.12, 0.22, 0.4, 8]} /><meshStandardMaterial color="#39382c" /></mesh>
  </group>;
}
