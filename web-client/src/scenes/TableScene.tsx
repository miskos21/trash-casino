import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Avatar } from '@raccoon-royale/shared-schemas/types';
import { CasinoTable } from '../components/three/CasinoTable';
import { PlayerSeat } from '../components/three/PlayerSeat';
import { DiceCup } from '../components/three/DiceCup';

export function TableScene({ avatar }: { avatar: Avatar }) {
  return <Canvas shadows camera={{ position: [6, 5.5, 7], fov: 43 }} dpr={[1, 1.5]}
    fallback={<p className="scene-fallback">This table needs WebGL. Please enable hardware acceleration in your browser.</p>}>
    <color attach="background" args={['#222c26']} />
    <fog attach="fog" args={['#222c26', 10, 23]} />
    <ambientLight intensity={0.8} />
    <hemisphereLight args={['#ffe7b5', '#343d30', 1.6]} />
    <directionalLight position={[2, 7, 3]} color="#ffdc9c" intensity={2.5} castShadow shadow-mapSize={[1024, 1024]} />
    <CasinoTable />
    <PlayerSeat position={[0, 0, 2.6]} rotation={Math.PI} animal={avatar} />
    <PlayerSeat position={[0, 0, -2.6]} rotation={0} animal="RACCOON" />
    <DiceCup position={[-0.5, 1.45, 1.2]} />
    <DiceCup position={[0.5, 1.45, -1.2]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} /><meshStandardMaterial color="#303a30" />
    </mesh>
    <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={7} maxDistance={12}
      minPolarAngle={0.6} maxPolarAngle={1.25} minAzimuthAngle={-0.9} maxAzimuthAngle={0.9} />
  </Canvas>;
}
