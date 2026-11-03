import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import type { Avatar, BlackjackState, RoomState, PlayerGameState, DICE_REVEAL } from '@raccoon-royale/shared-schemas/types';
import { CasinoTable } from '../components/three/CasinoTable';
import { PlayerSeat } from '../components/three/PlayerSeat';
import { DiceCup } from '../components/three/DiceCup';
import { CameraController, type CameraView } from '../components/three/CameraController';
import { TableEnvironment } from '../components/three/TableEnvironment';
import { Dice } from '../components/three/Dice';
import { CardHand3D } from '../components/three/CardHand3D';
import { CardShoe } from '../components/three/CardShoe';
import { Dealer } from '../components/three/Dealer';
import { isRevealVisible, visibleDiceForSeat } from '../game/presentation';
import { useMatchNow } from '../game/MatchClock';

export type { CameraView } from '../components/three/CameraController';

export function TableScene({ avatar, room, game, blackjack, reveal, cameraView, cameraRevision }: {
  avatar: Avatar; room: RoomState | null; game: PlayerGameState | null; blackjack: BlackjackState | null;
  reveal: DICE_REVEAL['payload'] | null; cameraView: CameraView; cameraRevision: number;
}) {
  const now = useMatchNow();
  const seats = room?.participants ?? [
    { playerId: 'you', displayName: 'You', avatar, npc: false, presence: 'ONLINE' },
  ];
  const ownIndex = room ? seats.findIndex((p) => p.playerId === room.youId) : 0;
  const cards = room?.game === 'BLACKJACK';
  const tableSize = cards ? 2 : 1;
  const positions: [number, number, number][] = cards
    ? [[0, 0, 4.6], [-6.15, 0, -0.8], [6.15, 0, -0.8], [-3.6, 0, 3.6]]
    : seats.length === 2 ? [[0, 0, 2.6], [0, 0, -2.6]]
    : seats.length === 3 ? [[0, 0, 2.6], [-3.25, 0, -1.2], [3.25, 0, -1.2]]
      : [[0, 0, 2.6], [-3.4, 0, 0], [0, 0, -2.6], [3.4, 0, 0]];
  const publicReveal = isRevealVisible(game, reveal, now);
  // Each tray fits twelve full-size cards (4 columns × 3 rows) without touching another hand.
  const cardTrays: { position: [number, number, number]; rotation: number }[] = [
    { position: [0, 1.258, 1.9], rotation: Math.PI },
    { position: [-3.1, 1.258, -0.8], rotation: Math.PI / 2 },
    { position: [3.1, 1.258, -0.8], rotation: -Math.PI / 2 },
    { position: [-2.35, 1.258, 1.6], rotation: Math.PI },
  ];
  return <Canvas shadows={{ type: PCFShadowMap }} camera={{ position: [5.4, 4.7, 6.4], fov: 48, near: 0.1, far: 60 }} dpr={[1, 1.5]}
    fallback={<p className="scene-fallback">Enable WebGL to enter the table.</p>}>
    <color attach="background" args={['#1c241e']} />
    <fog attach="fog" args={['#1c241e', cards ? 22 : 14, cards ? 42 : 29]} />
    <ambientLight intensity={0.45} />
    <hemisphereLight args={['#ffecd0', '#26362e', 1.2]} />
    <directionalLight position={[1, 7, 3]} color="#ffdb9e" intensity={2.4} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-0.0005} />
    <TableEnvironment tableSize={tableSize} />
    <CasinoTable size={tableSize} />
    {cards && <Dealer tableSize={tableSize} />}
    {seats.map((seat, index) => {
      const relative = (index - ownIndex + seats.length) % seats.length;
      const [x, , z] = positions[relative];
      const values = cards ? null : visibleDiceForSeat(game, reveal, seat.playerId, room?.youId ?? 'you', now);
      const active = cards ? blackjack?.phase === 'IN_PROGRESS' && blackjack.currentPlayerId === seat.playerId
        : !publicReveal && game?.publicState.phase === 'IN_PROGRESS' && now >= game.publicState.resumeAtEpochMillis && game.publicState.currentPlayerId === seat.playerId;
      const hand = blackjack?.players.find((p) => p.playerId === seat.playerId)?.cards ?? [];
      const occupied = seat.presence === 'ONLINE';
      return <group key={seat.playerId} name={'seat-' + seat.playerId} userData={{ presence: seat.presence }}>
        <PlayerSeat position={[x, 0, z]} rotation={Math.atan2(-x, -z)} animal={seat.avatar} occupied={occupied} />
        {active && occupied && <mesh position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.66, 32]} /><meshStandardMaterial color="#e5bf6b" emissive="#a87926" emissiveIntensity={0.35} />
        </mesh>}
        {/* Each seat has a local tray facing the center. The cup sits outside the five-die row. */}
        <group position={[x * 0.54, 0, z * 0.54]} rotation={[0, Math.atan2(-x, -z), 0]}>
          {!cards && occupied && <DiceCup position={[-0.92, 1.45, 0.03]} />}
          {values?.map((value, i) => <Dice key={i} value={value} position={[(i - (values.length - 1) / 2) * 0.23, 1.34, 0.03]} />)}
        </group>
        {cards && <CardHand3D cards={hand} {...cardTrays[relative]} />}
      </group>;
    })}
    {/* The house dealer is a visual character, separate from the four player seats. */}
    {blackjack && <CardShoe remaining={blackjack.cardsRemaining} size={blackjack.shoe.size} shuffling={blackjack.handPhase === 'SHUFFLING'} />}
    {blackjack && <CardHand3D cards={[...blackjack.dealer.cards, ...Array<null>(blackjack.dealer.hiddenCards).fill(null)]}
      position={[0, 1.258, -1.45]} />}
    <CameraController view={cameraView} revision={cameraRevision} tableSize={tableSize} />
  </Canvas>;
}
