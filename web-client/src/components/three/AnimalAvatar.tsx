import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Avatar } from '@raccoon-royale/shared-schemas/types';

const palettes: Record<Avatar, { fur: string; light: string; mask: string }> = {
  RACCOON: { fur: '#8b8d83', light: '#dad5bd', mask: '#30342f' },
  FOX: { fur: '#bf7746', light: '#f0dcb7', mask: '#613f2c' },
  BEAR: { fur: '#80604a', light: '#bd9671', mask: '#43382e' },
  OWL: { fur: '#9b8864', light: '#e3d0a0', mask: '#5d503a' },
  CAPYBARA: { fur: '#8f6440', light: '#7d5536', mask: '#2e2119' },
};

export function AnimalAvatar({ animal = 'RACCOON', animated = true }: { animal?: Avatar; animated?: boolean }) {
  const group = useRef<Group>(null);
  const colors = palettes[animal];
  const capybara = animal === 'CAPYBARA';
  useFrame(({ clock }) => {
    if (animated && group.current) group.current.rotation.z = Math.sin(clock.elapsedTime * 1.4) * 0.025;
  });
  return <group ref={group}>
    <mesh position={[0, 0.55, 0]} castShadow scale={[0.43, 0.58, 0.35]}>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={colors.fur} flatShading />
    </mesh>
    <mesh position={[0, 1.18, 0]} castShadow scale={capybara ? [0.37, 0.43, 0.46] : [0.48, 0.42, 0.4]}>
      <icosahedronGeometry args={[1, capybara ? 0 : 1]} /><meshStandardMaterial color={colors.fur} flatShading />
    </mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={capybara ? [side * 0.2, 1.5, -0.12] : [side * 0.32, 1.51, 0]} rotation={[0, 0, side * -0.25]} castShadow>
        {capybara ? <sphereGeometry args={[0.085, 6, 4]} /> : animal === 'BEAR' ? <sphereGeometry args={[0.16, 6, 4]} /> : <coneGeometry args={[0.18, 0.37, 4]} />}
        <meshStandardMaterial color={colors.fur} flatShading />
      </mesh>
      {!capybara && <mesh position={[side * 0.19, 1.24, 0.34]} scale={[0.21, 0.14, 0.08]}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={animal === 'OWL' ? colors.light : colors.mask} />
      </mesh>}
      <mesh position={capybara ? [side * 0.17, 1.33, 0.3] : [side * 0.18, 1.26, 0.413]}>
        <sphereGeometry args={[0.045, 8, 6]} /><meshStandardMaterial color="#121b18" roughness={0.25} />
      </mesh>
      <mesh position={[side * 0.36, 0.65, 0.28]} rotation={[0.5, 0, side * -0.4]} castShadow>
        <capsuleGeometry args={[0.12, 0.35, 3, 6]} /><meshStandardMaterial color={colors.fur} />
      </mesh>
    </group>)}
    {capybara ? <>
      <mesh position={[0, 1.08, 0.37]} rotation={[0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.4, 0.25, 0.4]} /><meshStandardMaterial color={colors.light} flatShading />
      </mesh>
      <mesh position={[0, 1.13, 0.575]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.2, 0.07, 0.02]} /><meshStandardMaterial color="#5b3f2a" />
      </mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.06, 1.13, 0.59]}>
        <sphereGeometry args={[0.028, 6, 4]} /><meshStandardMaterial color={colors.mask} />
      </mesh>)}
    </> : <>
      <mesh position={[0, 1.08, 0.39]} scale={[0.23, 0.16, 0.18]}>
        <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color={colors.light} flatShading />
      </mesh>
      <mesh position={[0, 1.16, 0.55]}><sphereGeometry args={[0.065, 6, 4]} /><meshStandardMaterial color={colors.mask} /></mesh>
    </>}
  </group>;
}
