import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import type { Avatar, BlackjackState, RoomState, PlayerGameState, DICE_REVEAL } from '@raccoon-royale/shared-schemas/types';
import { CasinoTable } from '../components/three/CasinoTable';
import { PlayerSeat } from '../components/three/PlayerSeat';
import { DiceCup } from '../components/three/DiceCup';
import { CameraController, type CameraView } from '../components/three/CameraController';
import { TableEnvironment } from '../components/three/TableEnvironment';
import { Dice } from '../components/three/Dice';
import { PlayingCard3D } from '../components/three/PlayingCard3D';
import { isRevealVisible, visibleDiceForSeat } from '../game/presentation';
import { useMatchNow } from '../game/MatchClock';

export type { CameraView } from '../components/three/CameraController';

export function TableScene({ avatar, room, game, blackjack, reveal, cameraView, cameraRevision }: {
  avatar: Avatar; room: RoomState | null; game: PlayerGameState | null; blackjack: BlackjackState | null;
  reveal: DICE_REVEAL['payload'] | null; cameraView: CameraView; cameraRevision: number;
}) {
  const now = useMatchNow();
  const seats = room?.participants ?? [
    { playerId: 'you', displayName: 'You', avatar, npc: false },
    { playerId: 'don', displayName: 'Don Raccoone', avatar: 'RACCOON' as Avatar, npc: true },
  ];
  const ownIndex = room ? seats.findIndex((p) => p.playerId === room.youId) : 0;
  const positions: [number, number, number][] = seats.length === 2 ? [[0, 0, 2.6], [0, 0, -2.6]]
    : seats.length === 3 ? [[0, 0, 2.6], [-3.25, 0, -1.2], [3.25, 0, -1.2]]
      : [[0, 0, 2.6], [-3.4, 0, 0], [0, 0, -2.6], [3.4, 0, 0]];
  const publicReveal = isRevealVisible(game, reveal, now);
  const cards = room?.game === 'BLACKJACK';
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
      const values = cards ? null : visibleDiceForSeat(game, reveal, seat.playerId, room?.youId ?? 'you', now);
      const active = cards ? blackjack?.phase === 'IN_PROGRESS' && blackjack.currentPlayerId === seat.playerId
        : !publicReveal && game?.publicState.phase === 'IN_PROGRESS' && now >= game.publicState.resumeAtEpochMillis && game.publicState.currentPlayerId === seat.playerId;
      const hand = blackjack?.players.find((p) => p.playerId === seat.playerId)?.cards ?? [];
      return <group key={seat.playerId}>
        <PlayerSeat position={[x, 0, z]} rotation={Math.atan2(-x, -z)} animal={seat.avatar} />
        {active && <mesh position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.66, 32]} /><meshStandardMaterial color="#e5bf6b" emissive="#a87926" emissiveIntensity={0.35} />
        </mesh>}
        {/* Each seat has a local tray facing the center. The cup sits outside the five-die row. */}
        <group position={[x * 0.54, 0, z * 0.54]} rotation={[0, Math.atan2(-x, -z), 0]}>
          {!cards && <DiceCup position={[-0.92, 1.45, 0.03]} />}
          {values?.map((value, i) => <Dice key={i} value={value} position={[(i - (values.length - 1) / 2) * 0.23, 1.34, 0.03]} />)}
          {/* Overlapping fan facing the seat that holds it. */}
          {hand.map((card, i) => <PlayingCard3D key={i} card={card}
            position={[(i - (hand.length - 1) / 2) * 0.25, 1.252 + i * 0.002, 0.03]} />)}
        </group>
      </group>;
    })}
    {/* The house dealer has no seat: its cards sit mid-table, readable from your seat. */}
    {blackjack && [...blackjack.dealer.cards, ...Array<null>(blackjack.dealer.hiddenCards).fill(null)].map((card, i, dealt) =>
      <PlayingCard3D key={'dealer-' + i} card={card} turn={Math.PI} position={[(i - (dealt.length - 1) / 2) * 0.25, 1.252 + i * 0.002, -0.35]} />)}
    <CameraController view={cameraView} revision={cameraRevision} />
  </Canvas>;
}
