import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import type { Avatar, RoomState, PlayerGameState, DICE_REVEAL } from '@raccoon-royale/shared-schemas/types';
import { CasinoTable } from '../components/three/CasinoTable';
import { PlayerSeat } from '../components/three/PlayerSeat';
import { DiceCup } from '../components/three/DiceCup';
import { CameraController, type CameraView } from '../components/three/CameraController';
import { TableEnvironment } from '../components/three/TableEnvironment';
import { Dice } from '../components/three/Dice';

export type { CameraView } from '../components/three/CameraController';

export function TableScene({ avatar, room, game, reveal, cameraView, cameraRevision }: {
  avatar: Avatar; room: RoomState | null; game: PlayerGameState | null;
  reveal: DICE_REVEAL['payload'] | null; cameraView: CameraView; cameraRevision: number;
}) {
  const seats = room?.participants ?? [
    { playerId: 'you', displayName: 'You', avatar, npc: false },
    { playerId: 'don', displayName: 'Don Raccoone', avatar: 'RACCOON' as Avatar, npc: true },
  ];
  const ownIndex = room ? seats.findIndex((p) => p.playerId === room.youId) : 0;
  const positions: [number, number, number][] = seats.length === 2 ? [[0, 0, 2.6], [0, 0, -2.6]]
    : seats.length === 3 ? [[0, 0, 2.6], [-3.25, 0, -1.2], [3.25, 0, -1.2]]
      : [[0, 0, 2.6], [-3.4, 0, 0], [0, 0, -2.6], [3.4, 0, 0]];
  const publicReveal = reveal?.matchId === game?.publicState.matchId && (!game?.publicState.lastBid || game.publicState.phase === 'FINISHED');
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
    {seats.map((seat, index) => {
      const relative = (index - ownIndex + seats.length) % seats.length;
      const [x, , z] = positions[relative];
      const values = publicReveal ? reveal?.dice.find((p) => p.playerId === seat.playerId)?.dice
        : relative === 0 ? game?.ownDice : undefined;
      return <group key={seat.playerId}>
        <PlayerSeat position={[x, 0, z]} rotation={Math.atan2(-x, -z)} animal={seat.avatar} />
        <DiceCup position={[x * 0.65 + 0.45, 1.45, z * 0.65]} />
        {values?.map((value, i) => <Dice key={i} value={value} position={[x * 0.65 - 0.45 + i * 0.22, 1.34, z * 0.65 - 0.1]} />)}
      </group>;
    })}
    <CameraController view={cameraView} revision={cameraRevision} />
  </Canvas>;
}
