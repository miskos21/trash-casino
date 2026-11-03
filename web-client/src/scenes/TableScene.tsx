import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { PCFShadowMap } from 'three';
import type { Avatar } from '@raccoon-royale/shared-schemas/types';
import { CasinoTable } from '../components/three/CasinoTable';
import { PlayerSeat } from '../components/three/PlayerSeat';
import { DiceCup } from '../components/three/DiceCup';
import { CameraController, type CameraView } from '../components/three/CameraController';
import { TableEnvironment } from '../components/three/TableEnvironment';

export type { CameraView } from '../components/three/CameraController';

export function TableScene({ avatar, cameraView, cameraRevision }: { avatar: Avatar; cameraView: CameraView; cameraRevision: number }) {
  return <Canvas shadows={{ type: PCFShadowMap }} camera={{ position: [5.4, 4.7, 6.4], fov: 48, near: 0.1, far: 60 }} dpr={[1, 1.5]}
    fallback={<p className="scene-fallback">Enable WebGL to enter the table.</p>}>
    <color attach="background" args={['#1c241e']} />
    <fog attach="fog" args={['#1c241e', 14, 29]} />
    <ambientLight intensity={0.45} />
    <hemisphereLight args={['#ffecd0', '#26362e', 1.2]} />
    <directionalLight position={[1, 7, 3]} color="#ffdb9e" intensity={2.4} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-0.0005} />
    <TableEnvironment />
    <CasinoTable />
    <PlayerSeat position={[0, 0, 2.6]} rotation={Math.PI} animal={avatar} />
    <PlayerSeat position={[0, 0, -2.6]} rotation={0} animal="RACCOON" />
    <Html position={[0, 2.35, -2.6]} center zIndexRange={[4, 0]} className="seat-nameplate"><span>DON RACCOONE</span></Html>
    <Html position={[0, 2.35, 2.6]} center zIndexRange={[4, 0]} className="seat-nameplate"><span className="your-nameplate">YOU</span></Html>
    <DiceCup position={[-0.5, 1.45, 1.2]} />
    <DiceCup position={[0.5, 1.45, -1.2]} />
    <CameraController view={cameraView} revision={cameraRevision} />
  </Canvas>;
}
