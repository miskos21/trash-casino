import { useEffect, useState } from 'react';
import type { GameConnection } from '../services/useGameConnection';
import { avatars } from '../avatars';
import { useMatchNow } from '../game/MatchClock';
import { isRevealVisible, visibleDiceForSeat } from '../game/presentation';
import { DieFace } from './DieFace';
import { GameRules } from './GameRules';
import { TableActivity } from './TableActivity';

export function MatchHud({ connection: c, onMenu }: { connection: GameConnection; onMenu: () => void }) {
  const state = c.game?.publicState;
  const now = useMatchNow();
  const [quantity, setQuantity] = useState(1);
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (!state) return;
    const last = state.lastBid;
    setQuantity(last ? last.quantity + (last.face === 6 ? 1 : 0) : 1);
    setFace(last && last.face < 6 ? last.face + 1 : 1);
  }, [state?.revision, state?.matchId]);
  if (!c.room || !state) return null;
  const name = (id: string | null) => state.participants.find((p) => p.playerId === id)?.displayName ?? 'Player';
  const finished = state.phase === 'FINISHED';
  const revealing = isRevealVisible(c.game, c.reveal, now);
  const paused = !finished && now < state.resumeAtEpochMillis;
  const yourTurn = state.currentPlayerId === c.room.youId && !finished && !paused;
  const total = state.participants.reduce((sum, p) => sum + p.diceCount, 0);
  const bidValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= total && (!state.lastBid || quantity > state.lastBid.quantity
    || quantity === state.lastBid.quantity && face > state.lastBid.face);
  const enabled = yourTurn && c.socket === 'online' && !c.pending;
  const hasHigherClaim = !state.lastBid || state.lastBid.quantity < total || state.lastBid.face < 6;
  const shownDice = visibleDiceForSeat(c.game, c.reveal, c.room.youId, c.room.youId, now) ?? [];
  const round = revealing ? c.reveal!.round : paused ? Math.max(1, state.round - 1) : state.round;
  const seconds = Math.max(0, Math.ceil(((paused ? state.resumeAtEpochMillis : state.deadlineEpochMillis) - now) / 1000));
  const title = finished ? name(state.winnerId) + ' wins!' : paused ? 'Round ' + round + ' revealed'
    : yourTurn ? 'Your turn' : name(state.currentPlayerId) + '’s turn';
  const send = (type: 'PLAYER_BID' | 'CALL_BLUFF') => {
    if (type === 'PLAYER_BID') c.send({ protocolVersion: 1, type, requestId: null,
      payload: { matchId: state.matchId, expectedRevision: state.revision, bid: { quantity, face } } });
    else c.send({ protocolVersion: 1, type, requestId: null,
      payload: { matchId: state.matchId, expectedRevision: state.revision } });
  };
  return <>
    <section className={'match-heading ' + (yourTurn ? 'is-your-turn' : '')} aria-live="polite">
      <small>ROOM {c.room.roomCode} · ROUND {round}</small>
      <h2>{title}</h2>
      <p>{finished ? 'Last player with dice' : paused ? c.reveal?.matchId === state.matchId ? name(c.reveal.loserId) + ' loses one die' : 'Revealing the completed round'
        : yourTurn ? 'Make a claim or challenge the last claim' : 'Watch the table — your dice stay private'}</p>
    </section>
    <aside className="match-seats" aria-label="Match participants">
      {state.participants.map((p) => {
        const last = state.history?.filter((event) => event.type === 'BID' && event.actorId === p.playerId && event.round === round).at(-1);
        const playing = !paused && !finished && p.playerId === state.currentPlayerId;
        return <div key={p.playerId} className={'player-card ' + (playing ? 'active-seat' : '')}>
          <img src={avatars.find((a) => a.id === p.avatar)?.portrait} alt="" />
          <div><strong>{p.displayName}{p.playerId === c.room!.youId ? ' (you)' : ''}</strong>
            <small>{!p.diceCount ? 'Eliminated' : p.diceCount + ' dice remaining'}{p.npc ? ' · NPC' : ''}</small>
            {last?.bid && <span className="player-last-claim">Claimed {last.bid.quantity} × <DieFace value={last.bid.face} small /></span>}
          </div>
          {playing && <span className="playing-badge">Playing</span>}
        </div>;
      })}
    </aside>
    <TableActivity state={state} reveal={c.reveal} revealActive={revealing} />
    <section className={'match-actions ' + (yourTurn ? 'is-your-turn' : '') + (finished ? 'is-finished' : '')}
      aria-label="Game actions" data-turn={finished ? 'finished' : paused ? 'reveal' : yourTurn ? 'yours' : 'waiting'}>
      <div className="action-turn-line">
        <strong>{finished ? 'MATCH COMPLETE' : c.socket !== 'online' ? 'RECONNECTING' : c.pending ? 'SENDING YOUR MOVE' : paused ? 'ROUND RESULT' : yourTurn ? 'YOUR TURN' : 'WAITING FOR ' + name(state.currentPlayerId).toUpperCase()}</strong>
        {!finished && <span className={seconds <= 8 && !paused ? 'urgent-clock' : ''}>{seconds}s {paused ? 'until next round' : 'left'}</span>}
      </div>
      <div className="current-claim" aria-label="Current claim">
        {state.lastBid && !paused && !finished ? <><div><small>CURRENT CLAIM · {name(state.lastBidderId)}</small>
          <strong>At least {state.lastBid.quantity} × <DieFace value={state.lastBid.face} small /></strong></div><span>across all {total} dice</span></>
          : <p>{finished ? 'No buy-in. No tokens spent or awarded.' : paused ? 'Count the revealed dice in Table activity.' : 'No claim yet. Start with a quantity and a face.'}</p>}
      </div>
      <div className="private-dice"><small>{revealing ? 'Your revealed dice · round ' + round : 'Your private dice · round ' + round}</small>
        <div aria-label="Your private dice">{shownDice.map((value, i) => <DieFace key={i} value={value} />)}
          {!shownDice.length && <span className="eliminated-label">Eliminated · watching the match</span>}</div>
      </div>
      {finished ? <button className="resume-button" onClick={onMenu}>Back to lobby</button> : <>
        <div className="bid-controls">
          <label>How many dice?<input aria-label="Claim quantity" type="number" min={1} max={total} value={quantity}
            disabled={!enabled} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
          <label>Showing<select aria-label="Claim face" value={face} disabled={!enabled} onChange={(e) => setFace(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <button className="resume-button" disabled={!enabled || !bidValid} onClick={() => send('PLAYER_BID')}>Make claim</button>
          <button className="secondary-button" disabled={!enabled || !state.lastBid} onClick={() => send('CALL_BLUFF')}>Call bluff</button>
        </div>
        <p className="claim-explanation">{c.pending ? 'Waiting for server confirmation.' : paused ? 'Next roll stays hidden until this reveal ends.'
          : yourTurn ? !hasHigherClaim ? 'Highest possible claim. Call bluff to resolve this round.' : bidValid ? 'Your claim: at least ' + quantity + ' dice show ' + face + '. Ones are not wild.' : 'Choose a legal claim higher than the current one.'
            : 'Controls unlock on your turn. A claim is about dice, not money.'}</p>
      </>}
      {c.error && <p className="room-error" role="alert">{c.error}</p>}
      <div className="match-mode-footer"><span>FREE MATCH · NO BUY-IN · NO TOKEN REWARD</span><GameRules /></div>
    </section>
  </>;
}
