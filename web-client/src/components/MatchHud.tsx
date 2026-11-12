import { useEffect, useRef, useState } from 'react';
import type { GameConnection } from '../services/useGameConnection';
import { avatars } from '../avatars';
import { useMatchNow } from '../game/MatchClock';
import { isRevealVisible, visibleDiceForSeat } from '../game/presentation';
import { useTurnKeys } from '../game/useTurnKeys';
import { DieFace } from './DieFace';
import { TableActivity } from './TableActivity';
import { SeatPresence } from './SeatPresence';

export function MatchHud({ connection: c, onMenu, trash }: { connection: GameConnection; onMenu: () => void; trash?: string | null }) {
  const state = c.game?.publicState;
  const now = useMatchNow();
  const [quantity, setQuantity] = useState(1);
  const [face, setFace] = useState(1);
  // Keyboard bids: digits alternate between the number of dice and the face (4, 5 → 4 × fives; then 2 → 2 × fives).
  const nextFieldRef = useRef<'quantity' | 'face'>('quantity');
  const [nextField, setNextField] = useState<'quantity' | 'face'>('quantity');
  const totalRef = useRef(0);
  const claimButton = useRef<HTMLButtonElement>(null), bluffButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state) return;
    const last = state.lastBid;
    setQuantity(last ? last.quantity + (last.face === 6 ? 1 : 0) : 1);
    setFace(last && last.face < 6 ? last.face + 1 : 1);
    nextFieldRef.current = 'quantity'; setNextField('quantity');
  }, [state?.revision, state?.matchId]);
  const keysActive = !!c.room && !!state && state.phase !== 'FINISHED' && state.currentPlayerId === c.room.youId
    && now >= state.resumeAtEpochMillis && c.socket === 'online' && !c.pending;
  useTurnKeys(keysActive, state?.revision, [claimButton, bluffButton], (digit) => {
    if (nextFieldRef.current === 'quantity') {
      if (digit < 1 || digit > totalRef.current) return;
      setQuantity(digit); nextFieldRef.current = 'face';
    } else {
      if (digit < 1 || digit > 6) return;
      setFace(digit); nextFieldRef.current = 'quantity';
    }
    setNextField(nextFieldRef.current);
  });
  if (!c.room || !state) return null;
  const name = (id: string | null) => state.participants.find((p) => p.playerId === id)?.displayName ?? 'Player';
  const finished = state.phase === 'FINISHED';
  const revealing = isRevealVisible(c.game, c.reveal, now);
  const paused = !finished && now < state.resumeAtEpochMillis;
  const yourTurn = state.currentPlayerId === c.room.youId && !finished && !paused;
  const total = state.participants.reduce((sum, p) => sum + p.diceCount, 0);
  totalRef.current = total;
  const bidValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= total && (!state.lastBid || quantity > state.lastBid.quantity
    || quantity === state.lastBid.quantity && face > state.lastBid.face);
  const enabled = yourTurn && c.socket === 'online' && !c.pending;
  const shownDice = visibleDiceForSeat(c.game, c.reveal, c.room.youId, c.room.youId, now) ?? [];
  const round = revealing ? c.reveal!.round : paused ? Math.max(1, state.round - 1) : state.round;
  const seconds = Math.max(0, Math.ceil(((paused ? state.resumeAtEpochMillis : state.deadlineEpochMillis) - now) / 1000));
  const leader = state.participants.find((p) => p.playerId === state.winnerId);
  const title = finished ? leader ? leader.displayName + ' wins with ' + leader.chips + ' chips' : 'Tie on chips' : paused ? 'Round ' + round + ' revealed'
    : yourTurn ? 'Your turn' : name(state.currentPlayerId) + '’s turn';
  const send = (type: 'PLAYER_BID' | 'CALL_BLUFF') => {
    if (type === 'PLAYER_BID') c.send({ protocolVersion: 1, type, requestId: null,
      payload: { matchId: state.matchId, expectedRevision: state.revision, bid: { quantity, face } } });
    else c.send({ protocolVersion: 1, type, requestId: null,
      payload: { matchId: state.matchId, expectedRevision: state.revision } });
  };
  return <>
    <section className={'match-heading ' + (yourTurn ? 'is-your-turn' : '')} aria-live="polite">
      <small>LIAR’S DICE · ROUND {round}</small>
      <h2>{title}</h2>
      {paused && c.reveal?.matchId === state.matchId && <p>{name(c.reveal.loserId)} pays 1 chip to {name(c.reveal.winnerId)}</p>}
      {finished && <p>Final chips: {[...state.participants].sort((a, b) => b.chips - a.chips).map((p) => p.displayName + ' ' + p.chips).join(' · ')}</p>}
    </section>
    <aside className="match-seats" aria-label="Match participants">
      {state.participants.map((p) => {
        const seat = c.room!.participants.find((s) => s.playerId === p.playerId);
        const last = state.history?.filter((event) => event.type === 'BID' && event.actorId === p.playerId && event.round === round).at(-1);
        const playing = !paused && !finished && p.playerId === state.currentPlayerId;
        return <div key={p.playerId} data-presence={seat?.presence} className={'player-card ' + (playing ? 'active-seat' : '')}>
          <img src={avatars.find((a) => a.id === p.avatar)?.portrait} alt="" />
          <div><strong>{p.displayName}{p.playerId === c.room!.youId ? ' (you)' : ''}</strong>
            <small className="seat-chips"><span className="chip-icon" aria-hidden="true" />{p.chips} {p.chips === 1 ? 'chip' : 'chips'}
              {!p.chips ? ' · out' : !p.diceCount ? ' · left' : ''}{p.npc ? ' · agent' : ''}</small>
            <SeatPresence seat={seat} />
            {last?.bid && <span className="player-last-claim">Claimed {last.bid.quantity} × <DieFace value={last.bid.face} small /></span>}
          </div>
          {playing && seat?.presence === 'ONLINE' && <span className="playing-badge">Playing</span>}
        </div>;
      })}
      <TableActivity state={state} reveal={c.reveal} revealActive={revealing} />
    </aside>
    <section className={'match-actions ' + (yourTurn ? 'is-your-turn' : '') + (finished ? 'is-finished' : '')}
      aria-label="Game actions" data-turn={finished ? 'finished' : paused ? 'reveal' : yourTurn ? 'yours' : 'waiting'}>
      <div className="action-turn-line">
        {!finished && <span className={'turn-timer ' + (seconds <= 5 && !paused ? 'urgent-clock' : '')} aria-label={seconds + ' seconds ' + (paused ? 'until the next round' : 'left')}>
          <strong>{seconds}</strong><small>{paused ? 'next round' : yourTurn ? 'your turn' : 'seconds'}</small></span>}
        {c.socket !== 'online' ? <em>Reconnecting…</em> : c.pending ? <em>Sending…</em> : null}
      </div>
      <div className="current-claim" aria-label="Current claim">
        {state.lastBid && !paused && !finished ? <><div><small>CURRENT CLAIM · {name(state.lastBidderId)}</small>
          <strong>At least {state.lastBid.quantity} × <DieFace value={state.lastBid.face} small /></strong></div></>
          : !finished && <p>{paused ? 'Round revealed' : 'No claim yet'}</p>}
      </div>
      <div className="private-dice"><small>{revealing ? 'Revealed dice' : 'Your dice'}</small>
        <div aria-label="Your private dice">{shownDice.map((value, i) => <DieFace key={i} value={value} />)}
          {!shownDice.length && <span className="eliminated-label">Out of chips · watching the match</span>}</div>
      </div>
      {finished ? <button className="resume-button" onClick={onMenu}>Back to lobby</button> : <>
        <div className="bid-controls">
          <label className={enabled && nextField === 'quantity' ? 'next-key' : ''}>How many dice?<input aria-label="Claim quantity" type="number" min={1} max={total} value={quantity}
            disabled={!enabled} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
          <label className={enabled && nextField === 'face' ? 'next-key' : ''}>Showing<select aria-label="Claim face" value={face} disabled={!enabled} onChange={(e) => setFace(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <div className="action-stack">
            <button ref={claimButton} className="resume-button" disabled={!enabled || !bidValid} onClick={() => send('PLAYER_BID')}>Make claim</button>
            <button ref={bluffButton} className="secondary-button" disabled={!enabled || !state.lastBid} onClick={() => send('CALL_BLUFF')}>Call bluff</button>
          </div>
          {enabled && <small className="key-hint">Keys: dice, face · Tab · Enter</small>}
        </div>
      </>}
      {c.error && <p className="room-error" role="alert">{c.error}</p>}
      {c.room.economy && trash && <div className="strip-trash"><span className="trash-coin" aria-hidden="true" /><strong>{trash}</strong><small>TRASH in casino</small></div>}
    </section>
  </>;
}
