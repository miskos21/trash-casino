import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Avatar } from '@raccoon-royale/shared-schemas/types';

const palettes: Record<Avatar, { fur: string; light: string; mask: string }> = {
  RACCOON: { fur: '#8b8d83', light: '#dad5bd', mask: '#30342f' },
  FOX: { fur: '#bf7746', light: '#f0dcb7', mask: '#613f2c' },
  BEAR: { fur: '#80604a', light: '#bd9671', mask: '#43382e' },
  OWL: { fur: '#9b8864', light: '#e3d0a0', mask: '#5d503a' },
};

export function AnimalAvatar({ animal = 'RACCOON' }: { animal?: Avatar }) {
  const group = useRef<Group>(null);
  const colors = palettes[animal];
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.z = Math.sin(clock.elapsedTime * 1.4) * 0.025;
  });
  return <group ref={group}>
    <mesh position={[0, 0.55, 0]} castShadow scale={[0.43, 0.58, 0.35]}>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={colors.fur} flatShading />
    </mesh>
    <mesh position={[0, 1.18, 0]} castShadow scale={[0.48, 0.42, 0.4]}>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={colors.fur} flatShading />
    </mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * 0.32, 1.51, 0]} rotation={[0, 0, side * -0.25]} castShadow>
        {animal === 'BEAR' ? <sphereGeometry args={[0.16, 6, 4]} /> : <coneGeometry args={[0.18, 0.37, 4]} />}
        <meshStandardMaterial color={colors.fur} flatShading />
      </mesh>
      <mesh position={[side * 0.19, 1.24, 0.34]} scale={[0.21, 0.14, 0.08]}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={animal === 'OWL' ? colors.light : colors.mask} />
      </mesh>
      <mesh position={[side * 0.18, 1.26, 0.413]}>
        <sphereGeometry args={[0.045, 8, 6]} /><meshStandardMaterial color="#121b18" roughness={0.25} />
      </mesh>
      <mesh position={[side * 0.36, 0.65, 0.28]} rotation={[0.5, 0, side * -0.4]} castShadow>
        <capsuleGeometry args={[0.12, 0.35, 3, 6]} /><meshStandardMaterial color={colors.fur} />
      </mesh>
    </group>)}
    <mesh position={[0, 1.08, 0.39]} scale={[0.23, 0.16, 0.18]}>
      <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color={colors.light} flatShading />
    </mesh>
    <mesh position={[0, 1.16, 0.55]}><sphereGeometry args={[0.065, 6, 4]} /><meshStandardMaterial color={colors.mask} /></mesh>
  </group>;
}
