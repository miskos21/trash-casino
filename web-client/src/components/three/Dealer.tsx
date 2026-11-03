import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Color, Float32BufferAttribute, Quaternion, Shape, TubeGeometry, Vector3, type Group } from 'three';
import { AnimalAvatar } from './AnimalAvatar';

const shirt = new Shape();
shirt.moveTo(-0.17, 1.01); shirt.lineTo(0.17, 1.01); shirt.lineTo(0.1, 0.49); shirt.lineTo(-0.1, 0.49); shirt.closePath();
const lapel = new Shape();
lapel.moveTo(0.16, 1.02); lapel.lineTo(0.33, 0.89); lapel.lineTo(0.23, 0.75);
lapel.lineTo(0.28, 0.69); lapel.lineTo(0.025, 0.43); lapel.closePath();

// One continuous brush emerges from the pelvis under the jacket, with rings printed on the fur.
const tailCurve = new CatmullRomCurve3([
  new Vector3(0, 1.03, -0.19), new Vector3(0.04, 0.97, -0.43), new Vector3(0.19, 0.83, -0.7),
  new Vector3(0.38, 0.63, -0.94), new Vector3(0.53, 0.44, -1.14), new Vector3(0.55, 0.33, -1.3),
]);
const tailGeometry = new TubeGeometry(tailCurve, 40, 1, 10, false);
const tailPositions = tailGeometry.getAttribute('position'), tailColors: number[] = [];
const lightFur = new Color('#a3a69b'), darkFur = new Color('#343b3b');
for (let i = 0; i < tailPositions.count; i++) {
  const progress = Math.floor(i / 11) / 40;
  const center = tailCurve.getPointAt(progress);
  const radius = (0.12 + 0.08 * Math.sin(Math.PI * progress)) * (1 - 0.9 * progress ** 5);
  const point = new Vector3().fromBufferAttribute(tailPositions, i).sub(center).multiplyScalar(radius).add(center);
  tailPositions.setXYZ(i, point.x, point.y, point.z);
  const color = Math.min(7, Math.floor(progress * 8)) % 2 ? darkFur : lightFur;
  tailColors.push(color.r, color.g, color.b);
}
tailGeometry.setAttribute('color', new Float32BufferAttribute(tailColors, 3));
tailGeometry.computeVertexNormals();

function sleevePose(from: Vector3, to: Vector3) {
  return {
    position: from.clone().add(to).multiplyScalar(0.5),
    quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize()),
    length: from.distanceTo(to),
  };
}
const armPoses = [-1, 1].map((side) => {
  const shoulder = new Vector3(side * 0.32, 0.86, 0.02);
  const elbow = new Vector3(side * 0.5, 0.66, 0.15);
  const wrist = new Vector3(side * 0.44, 0.55, 0.55);
  const palm = wrist.clone().add(wrist.clone().sub(elbow).normalize().multiplyScalar(0.095));
  return { side, elbow, wrist, palm, upper: sleevePose(shoulder, elbow), forearm: sleevePose(elbow, wrist) };
});

function DealerArms() {
  return <group position={[0, 0.8, 0]}>
    {armPoses.map(({ side, elbow, wrist, palm, upper, forearm }) => <group key={side}>
      <mesh position={upper.position} quaternion={upper.quaternion} castShadow>
        <capsuleGeometry args={[0.11, upper.length, 4, 8]} /><meshStandardMaterial color="#202a36" roughness={0.8} />
      </mesh>
      <mesh position={elbow} castShadow><sphereGeometry args={[0.112, 8, 6]} /><meshStandardMaterial color="#202a36" roughness={0.8} /></mesh>
      <mesh position={forearm.position} quaternion={forearm.quaternion} castShadow>
        <cylinderGeometry args={[0.095, 0.112, forearm.length, 8]} /><meshStandardMaterial color="#202a36" roughness={0.8} />
      </mesh>
      <mesh position={wrist} quaternion={forearm.quaternion} castShadow>
        <cylinderGeometry args={[0.099, 0.101, 0.065, 8]} /><meshStandardMaterial color="#eee9dc" roughness={0.9} />
      </mesh>
      {/* Palms stay flat on the felt; cuffs overlap the sleeve and glove at the actual wrist. */}
      <group position={palm} rotation={[0, side * 0.06, 0]}>
        <mesh scale={[0.115, 0.075, 0.155]} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#f4f0e5" roughness={0.85} />
        </mesh>
        <mesh position={[-side * 0.088, -0.01, 0.015]} scale={[0.05, 0.05, 0.09]} castShadow>
          <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#f4f0e5" roughness={0.85} />
        </mesh>
      </group>
    </group>)}
  </group>;
}

/** Visual house dealer only. It never occupies a player seat or decides game outcomes. */
export function Dealer({ tableSize = 1 }: { tableSize?: number }) {
  const upper = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (upper.current) upper.current.rotation.z = Math.sin(clock.elapsedTime * 0.9) * 0.012;
  });
  return <group position={[0, 0, -(2 * tableSize + 0.3)]} name="house-dealer">
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * 0.19, 0.47, 0]} castShadow><capsuleGeometry args={[0.14, 0.56, 3, 8]} />
        <meshStandardMaterial color="#202a36" roughness={0.8} /></mesh>
      <mesh position={[side * 0.19, 0.105, 0.09]} scale={[0.17, 0.11, 0.27]} castShadow>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#151c24" roughness={0.32} /></mesh>
    </group>)}
    <mesh geometry={tailGeometry} castShadow receiveShadow dispose={null}>
      <meshStandardMaterial vertexColors flatShading roughness={0.9} />
    </mesh>
    <DealerArms />
    <group position={[0, 0.8, 0]} ref={upper}>
      <AnimalAvatar animal="RACCOON" animated={false} formal showArms={false} />
      <mesh position={[0, 0, 0.365]}><shapeGeometry args={[shirt]} />
        <meshStandardMaterial color="#f6f0df" roughness={0.85} /></mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[0, 0, 0.394]} scale={[side, 1, 1]}>
        <shapeGeometry args={[lapel]} /><meshStandardMaterial color="#364450" side={2} roughness={0.45} />
      </mesh>)}
      <mesh position={[0, 0.93, 0.42]}><sphereGeometry args={[0.045, 8, 6]} /><meshStandardMaterial color="#7b2939" /></mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.075, 0.93, 0.414]} rotation={[0, 0, side * Math.PI / 2]}>
        <coneGeometry args={[0.067, 0.13, 4]} /><meshStandardMaterial color="#942f42" roughness={0.6} />
      </mesh>)}
      {[0.72, 0.61, 0.49].map((y) => <mesh key={y} position={[0, y, 0.406]}>
        <sphereGeometry args={[0.014, 7, 5]} /><meshStandardMaterial color="#292e35" /></mesh>)}
      <mesh position={[0.245, 0.8, 0.407]} rotation={[0, 0, -0.14]}>
        <boxGeometry args={[0.12, 0.045, 0.008]} /><meshStandardMaterial color="#d0b36e" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0.24, 0.7, 0.393]}><boxGeometry args={[0.14, 0.014, 0.009]} /><meshStandardMaterial color="#82909a" /></mesh>
    </group>
  </group>;
}
