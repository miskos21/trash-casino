import { useState } from 'react';
import type { Avatar, GameType } from '@raccoon-royale/shared-schemas/types';
import type { GameConnection } from '../services/useGameConnection';
import { GameRules } from './GameRules';

const gameOptions: { id: GameType; name: string }[] = [
  { id: 'BLACKJACK', name: 'Blackjack' }, { id: 'LIARS_DICE', name: 'Liar’s Dice' },
];
const agentOptions = [{ count: 0, name: 'None' }, { count: 1, name: 'Don' }, { count: 2, name: 'Don + Foxy' }];

export function RoomLobby({ connection: c, avatar, onStarted }: { connection: GameConnection; avatar: Avatar; onStarted: () => void }) {
  const [name, setName] = useState('Player');
  const [code, setCode] = useState('');
  const [game, setGame] = useState<GameType>('BLACKJACK');
  const [agents, setAgents] = useState(1);
  const room = c.room;
  const disabled = c.socket !== 'online' || c.pending;
  if (!room) return <section className="room-lobby">
    <h2>Play for free · up to 4 seats</h2>
    <div className="game-picker" role="group" aria-label="Game">
      {gameOptions.map((option) => <button key={option.id} aria-pressed={game === option.id}
        className={game === option.id ? 'selected' : ''} onClick={() => setGame(option.id)}>{option.name}</button>)}
    </div>
    <div className="game-picker agent-picker" role="group" aria-label="Agents at the table">
      {agentOptions.map((option) => <button key={option.count} aria-pressed={agents === option.count} aria-label={option.count + (option.count === 1 ? ' agent' : ' agents')}
        className={agents === option.count ? 'selected' : ''} onClick={() => setAgents(option.count)}>
        <strong>{option.count}</strong><small>{option.name}</small></button>)}
    </div>
    <p className="free-play-note">No buy-in. No token rewards. {game === 'BLACKJACK'
      ? 'The house deals. Beat the dealer without going over 21.' : 'Win by being the last player with dice.'}
      {' '}Agents are rule-based NPC players and take seats from the four available.
      {game === 'LIARS_DICE' && agents === 0 ? ' Liar’s Dice needs a second player to start.' : ''}</p>
    <GameRules game={game} />
    <label>Your name<input aria-label="Player name" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>
    <button className="resume-button" disabled={disabled || !name.trim()} onClick={() => c.send({
      protocolVersion: 1, type: 'ROOM_CREATE', requestId: null, payload: { displayName: name.trim(), avatar, game, agents },
    })}>Create room</button>
    <form className="join-row" onSubmit={(event) => {
      event.preventDefault();
      if (code.length === 6 && name.trim()) c.send({ protocolVersion: 1, type: 'ROOM_JOIN', requestId: null,
        payload: { roomCode: code, displayName: name.trim(), avatar } });
    }}>
      <input aria-label="Room code to join" placeholder="ROOM CODE" value={code} maxLength={6} autoComplete="off"
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      <button className="secondary-button" disabled={disabled || code.length !== 6 || !name.trim()}>Join room</button>
    </form>
    {c.error && <p className="room-error" role="alert">{c.error}</p>}
  </section>;
  const me = room.participants.find((p) => p.playerId === room.youId)!;
  const allReady = room.participants.every((p) => p.ready && p.connected);
  const needsPlayer = room.game === 'LIARS_DICE' && room.participants.length < 2;
  return <section className="room-lobby">
    <div className="room-code-line"><span>ROOM CODE</span><output aria-label="Room code">{room.roomCode}</output><small>Free play · {gameOptions.find((option) => option.id === room.game)!.name}</small></div>
    <ul className="lobby-seats">{room.participants.map((p) => <li key={p.playerId}>
      <span>{p.displayName}{p.playerId === room.youId ? ' (you)' : ''}</span>
      <small>{p.npc ? 'Agent · rule-based' : !p.connected ? 'Reconnecting' : p.ready ? 'Ready' : 'Not ready'}</small>
    </li>)}</ul>
    {room.phase !== 'IN_PROGRESS' ? <div className="lobby-buttons">
      <button className="secondary-button" disabled={disabled} onClick={() => c.send({
        protocolVersion: 1, type: 'ROOM_READY', requestId: null, payload: { roomId: room.roomId, ready: !me.ready },
      })}>{me.ready ? 'Not ready' : 'Ready'}</button>
      {room.hostId === room.youId && <button className="resume-button" disabled={disabled || !allReady || needsPlayer} onClick={() => {
        c.send({ protocolVersion: 1, type: 'ROOM_START', requestId: null, payload: { roomId: room.roomId } }); onStarted();
      }}>{room.phase === 'FINISHED' ? 'Play again' : 'Start match'}</button>}
    </div> : <button className="resume-button" onClick={onStarted}>Return to match</button>}
    {needsPlayer && <p className="free-play-note">Waiting for a second player. Share the room code.</p>}
    {c.error && <p className="room-error" role="alert">{c.error}</p>}
    <button className="leave-button" disabled={c.socket !== 'online'} onClick={c.leave}>Leave room</button>
  </section>;
}
