import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Color, Float32BufferAttribute, TubeGeometry, Vector3, type Group, type Mesh } from 'three';
import type { Avatar } from '@raccoon-royale/shared-schemas/types';

const palettes: Record<Avatar, { fur: string; light: string; mask: string }> = {
  RACCOON: { fur: '#8b8d83', light: '#dad5bd', mask: '#30342f' },
  FOX: { fur: '#bf7746', light: '#f0dcb7', mask: '#613f2c' },
  BEAR: { fur: '#80604a', light: '#bd9671', mask: '#43382e' },
  CAT: { fur: '#b88b58', light: '#f1dec0', mask: '#b86870' },
  CAPYBARA: { fur: '#8f6440', light: '#7d5536', mask: '#2e2119' },
  FROG: { fur: '#6f8a3a', light: '#d9d29a', mask: '#22301a' },
};

// A tapered, curved brush with a cream tip; shared geometry keeps the low-poly tail inexpensive.
const foxTailCurve = new CatmullRomCurve3([
  new Vector3(0, 0.26, -0.22), new Vector3(0.08, 0.26, -0.45), new Vector3(0.3, 0.32, -0.73),
  new Vector3(0.48, 0.5, -0.99), new Vector3(0.49, 0.75, -1.13), new Vector3(0.36, 0.96, -1.16),
]);
const foxTail = new TubeGeometry(foxTailCurve, 24, 1, 8, false);
const tailPoints = foxTail.getAttribute('position'), tailColors: number[] = [];
const fur = new Color(palettes.FOX.fur), tip = new Color('#fff0d5');
for (let i = 0; i < tailPoints.count; i++) {
  const progress = Math.floor(i / 9) / 24;
  const center = foxTailCurve.getPointAt(progress);
  const radius = Math.max(0.012, (0.085 + 0.24 * Math.sin(Math.PI * progress) ** 0.8) * (1 - progress ** 8));
  const point = new Vector3().fromBufferAttribute(tailPoints, i).sub(center).multiplyScalar(radius).add(center);
  tailPoints.setXYZ(i, point.x, point.y, point.z);
  const color = progress >= 0.72 ? tip : fur;
  tailColors.push(color.r, color.g, color.b);
}
foxTail.setAttribute('color', new Float32BufferAttribute(tailColors, 3));
foxTail.computeVertexNormals();

export function AnimalAvatar({ animal = 'RACCOON', animated = true, formal = false, showArms = true }: { animal?: Avatar; animated?: boolean; formal?: boolean; showArms?: boolean }) {
  const group = useRef<Group>(null);
  const tail = useRef<Mesh>(null);
  const colors = palettes[animal];
  const capybara = animal === 'CAPYBARA';
  const cat = animal === 'CAT';
  const frog = animal === 'FROG';
  useFrame(({ clock }) => {
    if (animated && group.current) group.current.rotation.z = Math.sin(clock.elapsedTime * 1.4) * 0.025;
    if (animated && tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 1.8) * 0.12;
  });
  return <group ref={group}>
    {animal === 'FOX' && <mesh ref={tail} geometry={foxTail} castShadow receiveShadow dispose={null}>
      <meshStandardMaterial vertexColors flatShading roughness={0.9} />
    </mesh>}
    <mesh position={[0, frog ? 0.5 : 0.55, 0]} castShadow scale={frog ? [0.5, 0.5, 0.38] : [0.43, 0.58, 0.35]}>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={formal ? '#202a36' : colors.fur} flatShading />
    </mesh>
    <mesh position={[0, frog ? 1.12 : 1.18, 0]} castShadow scale={capybara ? [0.37, 0.43, 0.46] : frog ? [0.52, 0.34, 0.42] : [0.48, 0.42, 0.4]}>
      <icosahedronGeometry args={[1, capybara ? 0 : 1]} /><meshStandardMaterial color={colors.fur} flatShading />
    </mesh>
    {[-1, 1].map((side) => <group key={side}>
      {frog ? <>
        {/* Bulging eyes sit on top of the wide head. */}
        <mesh position={[side * 0.25, 1.4, 0.14]} castShadow>
          <sphereGeometry args={[0.14, 7, 5]} /><meshStandardMaterial color={colors.fur} flatShading />
        </mesh>
        <mesh position={[side * 0.25, 1.43, 0.21]}>
          <sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color="#d9a531" roughness={0.3} />
        </mesh>
        <mesh position={[side * 0.25, 1.43, 0.305]} scale={[1.3, 0.6, 0.5]}>
          <sphereGeometry args={[0.045, 8, 6]} /><meshStandardMaterial color="#121b18" roughness={0.25} />
        </mesh>
        <mesh position={[side * 0.07, 1.16, 0.41]}>
          <sphereGeometry args={[0.022, 6, 4]} /><meshStandardMaterial color={colors.mask} />
        </mesh>
      </> : <>
        <mesh position={capybara ? [side * 0.2, 1.5, -0.12] : [side * 0.32, 1.51, 0]} rotation={[0, 0, side * -0.25]} castShadow>
          {capybara ? <sphereGeometry args={[0.085, 6, 4]} /> : animal === 'BEAR' ? <sphereGeometry args={[0.16, 6, 4]} /> : <coneGeometry args={[0.18, 0.37, 4]} />}
          <meshStandardMaterial color={colors.fur} flatShading />
        </mesh>
        {!capybara && <mesh position={[side * 0.19, 1.24, 0.34]} scale={[0.21, 0.14, 0.08]}>
          <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={cat ? colors.light : colors.mask} />
        </mesh>}
        {cat ? <>
          <mesh position={[side * 0.18, 1.26, 0.413]} scale={[0.075, 0.09, 0.04]}>
            <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color="#d3ac49" roughness={0.3} />
          </mesh>
          <mesh position={[side * 0.18, 1.26, 0.452]} scale={[0.022, 0.065, 0.018]}>
            <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color="#18211b" />
          </mesh>
          {[-1, 1].map((angle) => <mesh key={angle} position={[side * 0.27, 1.09 + angle * 0.035, 0.48]} rotation={[0, 0, side * angle * 0.15]}>
            <boxGeometry args={[0.24, 0.012, 0.012]} /><meshStandardMaterial color="#f5e6cd" />
          </mesh>)}
        </> : <mesh position={capybara ? [side * 0.17, 1.33, 0.3] : [side * 0.18, 1.26, 0.413]}>
          <sphereGeometry args={[0.045, 8, 6]} /><meshStandardMaterial color="#121b18" roughness={0.25} />
        </mesh>}
      </>}
      {showArms && <><mesh position={[side * 0.36, 0.65, 0.28]} rotation={[formal ? -0.75 : 0.5, 0, side * -0.4]} castShadow>
        <capsuleGeometry args={[0.12, 0.35, 3, 6]} /><meshStandardMaterial color={formal ? '#202a36' : colors.fur} />
      </mesh>
      {formal && <mesh position={[side * 0.43, 0.49, 0.5]} scale={[0.12, 0.08, 0.16]} castShadow>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#f4f0e5" roughness={0.85} />
      </mesh>}
      </>}
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
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.04, 0.96, 0.595]} castShadow>
        <boxGeometry args={[0.065, 0.15, 0.05]} /><meshStandardMaterial color="#fffdf5" roughness={0.35} />
      </mesh>)}
    </> : frog ? <>
      {/* Tilted open front half-cylinder just outside the head reads as a wide smile. */}
      <mesh position={[0, 1.07, 0]} rotation={[0.15, 0, 0]} scale={[0.515, 0.03, 0.435]}>
        <cylinderGeometry args={[1, 1, 1, 14, 1, true, -Math.PI / 2, Math.PI]} /><meshStandardMaterial color={colors.mask} flatShading />
      </mesh>
      <mesh position={[0, 0.9, 0.1]} scale={[0.36, 0.11, 0.26]}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={colors.light} flatShading />
      </mesh>
      <mesh position={[0, 0.52, 0.2]} scale={[0.34, 0.38, 0.22]}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={colors.light} flatShading />
      </mesh>
    </> : <>
      <mesh position={[0, 1.08, 0.39]} scale={[0.23, 0.16, 0.18]}>
        <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color={colors.light} flatShading />
      </mesh>
      <mesh position={[0, 1.16, 0.55]}><sphereGeometry args={[0.065, 6, 4]} /><meshStandardMaterial color={colors.mask} /></mesh>
    </>}
  </group>;
}
