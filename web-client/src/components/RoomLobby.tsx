import { useState } from 'react';
import type { Avatar, GameType } from '@raccoon-royale/shared-schemas/types';
import type { GameConnection } from '../services/useGameConnection';
import type { Wallet } from '../wallet/useWallet';
import { formatTrash } from '../wallet/trash';
import { GameRules } from './GameRules';
import { LeaveRoomButton } from './LeaveRoomButton';
import { SeatPresence } from './SeatPresence';

const gameOptions: { id: GameType; name: string }[] = [
  { id: 'BLACKJACK', name: 'Blackjack' }, { id: 'LIARS_DICE', name: 'Liar’s Dice' },
];
const agentOptions = [{ count: 0, name: 'None' }, { count: 1, name: 'Don' }, { count: 2, name: 'Don + Foxy' }];

export function RoomLobby({ connection: c, wallet, avatar, onStarted }: { connection: GameConnection; wallet: Wallet; avatar: Avatar; onStarted: () => void }) {
  const [name, setName] = useState('Player');
  const [code, setCode] = useState('');
  const [game, setGame] = useState<GameType>('BLACKJACK');
  const [agents, setAgents] = useState(1);
  const [stake, setStake] = useState<'free' | 'paid'>('free');
  const room = c.room;
  const disabled = c.socket !== 'online' || c.pending;
  const paid = stake === 'paid' && game === 'LIARS_DICE';
  const sessionToken = wallet.session?.sessionToken;
  const buyIn = wallet.config ? formatTrash(wallet.config.buyIn) : '10';
  if (!room) return <section className="room-lobby">
    <h2>{paid ? `Play for ${buyIn} TRASH` : 'Play for free'} · up to 4 seats</h2>
    <div className="game-picker" role="group" aria-label="Game">
      {gameOptions.map((option) => <button key={option.id} aria-pressed={game === option.id}
        className={game === option.id ? 'selected' : ''} onClick={() => setGame(option.id)}>{option.name}</button>)}
    </div>
    {wallet.enabled && game === 'LIARS_DICE' && <div className="game-picker" role="group" aria-label="Stake">
      <button aria-pressed={stake === 'free'} className={stake === 'free' ? 'selected' : ''} onClick={() => setStake('free')}>Free</button>
      <button aria-pressed={stake === 'paid'} className={stake === 'paid' ? 'selected' : ''} onClick={() => setStake('paid')}>{buyIn} TRASH buy-in</button>
    </div>}
    <div className="game-picker agent-picker" role="group" aria-label="Agents at the table">
      {agentOptions.map((option) => <button key={option.count} aria-pressed={agents === option.count} aria-label={option.count + (option.count === 1 ? ' agent' : ' agents')}
        className={agents === option.count ? 'selected' : ''} onClick={() => setAgents(option.count)}>
        <strong>{option.count}</strong><small>{option.name}</small></button>)}
    </div>
    <p className="free-play-note">{paid
      ? `Everyone pays ${buyIn} TRASH from their casino balance into an on-chain escrow. The winner takes the pot. Agents play with house money.`
      : 'No buy-in. No token rewards.'} {game === 'BLACKJACK'
      ? 'The house deals. Beat the dealer without going over 21.' : 'Everyone keeps 5 dice; a lost challenge costs one chip. Most chips wins.'}
      {' '}Agents are rule-based NPC players and take seats from the four available.
      {game === 'LIARS_DICE' && agents === 0 ? ' Liar’s Dice needs a second player to start.' : ''}</p>
    {paid && !sessionToken && <p className="room-error">Connect your wallet below first.</p>}
    <GameRules game={game} />
    <label>Your name<input aria-label="Player name" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>
    <button className="resume-button" disabled={disabled || !name.trim() || (paid && !sessionToken)} onClick={() => c.send({
      protocolVersion: 1, type: 'ROOM_CREATE', requestId: null, payload: {
        displayName: name.trim(), avatar, game, agents, ...(paid ? { paid: true } : {}), ...(sessionToken ? { sessionToken } : {}),
      },
    })}>Create room</button>
    <form className="join-row" onSubmit={(event) => {
      event.preventDefault();
      if (code.length === 6 && name.trim()) c.send({ protocolVersion: 1, type: 'ROOM_JOIN', requestId: null,
        payload: { roomCode: code, displayName: name.trim(), avatar, ...(sessionToken ? { sessionToken } : {}) } });
    }}>
      <input aria-label="Room code to join" placeholder="ROOM CODE" value={code} maxLength={6} autoComplete="off"
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      <button className="secondary-button" disabled={disabled || code.length !== 6 || !name.trim()}>Join room</button>
    </form>
    {c.error && <p className="room-error" role="alert">{c.error}</p>}
  </section>;
  const me = room.participants.find((p) => p.playerId === room.youId)!;
  const allReady = room.participants.filter((p) => p.presence !== 'LEFT').every((p) => p.ready && p.connected);
  const needsPlayer = room.game === 'LIARS_DICE' && room.participants.filter((p) => p.presence !== 'LEFT').length < 2;
  return <section className="room-lobby">
    <div className="room-code-line"><span>ROOM CODE</span><output aria-label="Room code">{room.roomCode}</output><small>{room.economy
      ? `${formatTrash(room.economy.buyIn)} TRASH buy-in` : 'Free play'} · {gameOptions.find((option) => option.id === room.game)!.name}</small></div>
    <ul className="lobby-seats">{room.participants.map((p) => <li key={p.playerId}>
      <span>{p.displayName}{p.playerId === room.youId ? ' (you)' : ''}{p.accountId && <small className="seat-account">{p.accountId}</small>}</span>
      {p.presence !== 'ONLINE' ? <SeatPresence seat={p} /> : <small>{p.npc ? 'Agent · rule-based' : p.ready ? 'Ready' : 'Not ready'}</small>}
    </li>)}</ul>
    {room.economy && !sessionToken && <p className="room-error">This is a paid room. Connect your wallet below.</p>}
    {room.phase === 'FUNDING' ? <button className="resume-button" onClick={onStarted}>Pay the buy-in</button>
    : room.phase !== 'IN_PROGRESS' ? <div className="lobby-buttons">
      <button className="secondary-button" disabled={disabled} onClick={() => c.send({
        protocolVersion: 1, type: 'ROOM_READY', requestId: null, payload: { roomId: room.roomId, ready: !me.ready },
      })}>{me.ready ? 'Not ready' : 'Ready'}</button>
      {room.hostId === room.youId && <button className="resume-button" disabled={disabled || !allReady || needsPlayer} onClick={() => {
        c.send({ protocolVersion: 1, type: 'ROOM_START', requestId: null, payload: { roomId: room.roomId } }); onStarted();
      }}>{room.phase === 'FINISHED' ? 'Play again' : 'Start match'}</button>}
    </div> : <button className="resume-button" onClick={onStarted}>Return to match</button>}
    {needsPlayer && <p className="free-play-note">Waiting for a second player. Share the room code.</p>}
    {c.error && <p className="room-error" role="alert">{c.error}</p>}
    <LeaveRoomButton connection={c} />
  </section>;
}
