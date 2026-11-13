import { useState } from 'react';
import type { Avatar, GameType } from '@raccoon-royale/shared-schemas/types';
import type { GameConnection } from '../services/useGameConnection';
import type { Wallet } from '../wallet/useWallet';
import { rememberedBet } from '../game/blackjackBet';
import { formatTrash } from '../wallet/trash';
import { usePlayerStore } from '../stores/playerStore';
import { DieFace } from './DieFace';
import { GameRules } from './GameRules';
import { LeaveRoomButton } from './LeaveRoomButton';
import { PlayingCard } from './PlayingCard';
import { SeatPresence } from './SeatPresence';

const gameOptions: { id: GameType; name: string; blurb: string }[] = [
  { id: 'LIARS_DICE', name: 'Liar’s Dice', blurb: 'Bluff about the dice under every cup.' },
  { id: 'BLACKJACK', name: 'Blackjack', blurb: 'Beat the house dealer without going over 21.' },
];
const agentOptions = [{ count: 0, name: 'None' }, { count: 1, name: 'Don' }, { count: 2, name: 'Don + Foxy' }];

/** Decorative pictures for the game tiles; the tile itself carries the accessible name. */
function GamePicture({ game }: { game: GameType }) {
  return <span className="game-tile-picture" aria-hidden="true">
    {game === 'LIARS_DICE'
      ? [5, 3, 6].map((value) => <DieFace key={value} value={value} />)
      : <><PlayingCard card={{ rank: 'A', suit: 'S' }} /><PlayingCard card={{ rank: 'K', suit: 'H' }} /></>}
  </span>;
}

/**
 * The Play window, top to bottom: game, agents, create (or join) a room, then Ready and Start.
 * Before a room exists Ready and Start are visible but disabled; inside a room the choices are locked.
 */
export function RoomLobby({ connection: c, wallet, avatar, onStarted, onOpenWallet }: {
  connection: GameConnection; wallet: Wallet; avatar: Avatar; onStarted: () => void; onOpenWallet: () => void;
}) {
  const name = usePlayerStore((s) => s.name);
  const [code, setCode] = useState('');
  const [game, setGame] = useState<GameType>('BLACKJACK');
  const [agents, setAgents] = useState(1);
  const [stake, setStake] = useState<'free' | 'paid'>('free');
  const room = c.room;
  const disabled = c.socket !== 'online' || c.pending;
  const paid = stake === 'paid';
  const sessionToken = wallet.session?.sessionToken;
  const buyIn = wallet.config ? formatTrash(wallet.config.buyIn) : '10';
  const shownGame = room ? room.game : game;
  const shownAgents = room ? room.participants.filter((p) => p.npc).length : agents;
  const me = room?.participants.find((p) => p.playerId === room.youId);
  const active = room?.participants.filter((p) => p.presence !== 'LEFT') ?? [];
  const allReady = active.every((p) => p.ready && p.connected);
  const needsPlayer = room?.game === 'LIARS_DICE' && active.length < 2;

  return <section className="room-lobby play-window">
    <h3 className="play-step">Choose a game</h3>
    <div className="game-tiles" role="group" aria-label="Game">
      {gameOptions.map((option) => <button key={option.id} className={'game-tile ' + (shownGame === option.id ? 'selected' : '')}
        aria-label={option.name} aria-pressed={shownGame === option.id} disabled={!!room && shownGame !== option.id}
        onClick={() => { if (!room) setGame(option.id); }}>
        <GamePicture game={option.id} />
        <strong>{option.name}</strong><small>{option.blurb}</small>
      </button>)}
    </div>
    {!room && wallet.enabled && <div className="game-picker" role="group" aria-label="Stake">
      <button aria-pressed={stake === 'free'} className={stake === 'free' ? 'selected' : ''} onClick={() => setStake('free')}>Free</button>
      <button aria-pressed={stake === 'paid'} className={stake === 'paid' ? 'selected' : ''} onClick={() => setStake('paid')}>
        {game === 'BLACKJACK' ? 'Bet TRASH' : `${buyIn} TRASH buy-in`}</button>
    </div>}

    <h3 className="play-step">Agents at the table</h3>
    <div className="game-picker agent-picker" role="group" aria-label="Agents at the table">
      {agentOptions.map((option) => <button key={option.count} aria-pressed={shownAgents === option.count} aria-label={option.count + (option.count === 1 ? ' agent' : ' agents')}
        className={shownAgents === option.count ? 'selected' : ''} disabled={!!room && shownAgents !== option.count}
        onClick={() => { if (!room) setAgents(option.count); }}>
        <strong>{option.count}</strong><small>{option.name}</small></button>)}
    </div>
    {!room && <p className="free-play-note">{!paid ? 'Free play: no buy-in, no token rewards.'
      : game === 'BLACKJACK'
        ? `You set your bet (1–50 TRASH) before every hand, at the table. It comes from your casino balance, no wallet popups. Win pays 2×, blackjack 2.5×, push returns the bet. Agents play for show.`
        : `Everyone's ${buyIn} TRASH buy-in comes from their casino balance, no wallet popups. The chip leader takes the pot. Agents play with house money.`}
      {' '}Agents (Don, Foxy) are AI players who chat and take seats from the four available.
      {game === 'LIARS_DICE' && agents === 0 ? ' Liar’s Dice needs a second player to start.' : ''}</p>}
    {!room && <div className="play-rules"><GameRules game={game} /></div>}
    {!room && paid && !sessionToken && <p className="room-error">Connect your wallet first. <button className="link-button" onClick={onOpenWallet}>Open wallet</button></p>}
    {/* TRASH and wallet details live in their own window; this is only the way there. */}
    {!room && <button className="wallet-link" onClick={onOpenWallet}><span className="trash-coin" aria-hidden="true" />
      {wallet.session ? 'Wallet & TRASH balance' : 'Play for TRASH? Connect a wallet'} <span aria-hidden="true">›</span></button>}

    <h3 className="play-step">Room</h3>
    {!room ? <>
      <button className="resume-button create-room-button" disabled={disabled || !name.trim() || (paid && !sessionToken)} onClick={() => c.send({
        protocolVersion: 1, type: 'ROOM_CREATE', requestId: null, payload: {
          displayName: name.trim(), avatar, game, agents, ...(paid ? { paid: true } : {}),
          // The first hand starts at the bet this browser used last; it can be changed after every hand.
          ...(paid && game === 'BLACKJACK' ? { betTrash: rememberedBet() } : {}), ...(sessionToken ? { sessionToken } : {}),
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
    </> : <>
      <div className="room-code-line"><span>ROOM CODE</span><output aria-label="Room code">{room.roomCode}</output><small>{room.economy
        ? `${formatTrash(room.economy.buyIn)} TRASH ${room.game === 'BLACKJACK' ? 'per hand' : 'buy-in'}` : 'Free play'} · {gameOptions.find((option) => option.id === room.game)!.name}</small></div>
      <ul className="lobby-seats">{room.participants.map((p) => <li key={p.playerId}>
        <span>{p.displayName}{p.playerId === room.youId ? ' (you)' : ''}{p.accountId && <small className="seat-account">{p.accountId}</small>}</span>
        {p.presence !== 'ONLINE' ? <SeatPresence seat={p} /> : <small>{p.npc ? 'Agent · AI' : p.ready ? 'Ready' : 'Not ready'}</small>}
      </li>)}</ul>
      {room.economy && !sessionToken && <p className="room-error">This is a paid room. <button className="link-button" onClick={onOpenWallet}>Connect your wallet</button></p>}
    </>}
    {c.error && <p className="room-error" role="alert">{c.error}</p>}

    {room?.phase === 'FUNDING' ? <p className="free-play-note">Taking stakes from casino balances…</p>
      : room?.phase === 'IN_PROGRESS' ? <button className="resume-button" onClick={onStarted}>Return to match</button>
        : <div className="lobby-buttons start-row">
          <button className="secondary-button" disabled={!room || disabled} onClick={() => room && me && c.send({
            protocolVersion: 1, type: 'ROOM_READY', requestId: null, payload: { roomId: room.roomId, ready: !me.ready },
          })}>{me?.ready ? 'Not ready' : 'Ready'}</button>
          {(!room || room.hostId === room.youId) && <button className="resume-button" disabled={!room || disabled || !allReady || needsPlayer} onClick={() => {
            if (!room) return;
            c.send({ protocolVersion: 1, type: 'ROOM_START', requestId: null, payload: { roomId: room.roomId } }); onStarted();
          }}>{room?.phase === 'FINISHED' ? 'Play again' : 'Start match'}</button>}
        </div>}
    {!room && <p className="start-hint">Create a room first, then get ready and start.</p>}
    {room && room.hostId !== room.youId && room.phase !== 'IN_PROGRESS' && <p className="start-hint">The host starts the match when everyone is ready.</p>}
    {needsPlayer && <p className="free-play-note">Waiting for a second player. Share the room code.</p>}
    {room && <LeaveRoomButton connection={c} />}
  </section>;
}
