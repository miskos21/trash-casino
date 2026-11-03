import { useEffect, useState } from 'react';
import type { GameConnection } from '../services/useGameConnection';

const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export function MatchHud({ connection: c, onMenu }: { connection: GameConnection; onMenu: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [quantity, setQuantity] = useState(1);
  const [face, setFace] = useState(1);
  const state = c.game?.publicState;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!state) return;
    const last = state.lastBid;
    setQuantity(last ? last.quantity + (last.face === 6 ? 1 : 0) : 1);
    setFace(last && last.face < 6 ? last.face + 1 : 1);
  }, [state?.revision, state?.matchId]);
  if (!c.room || !state) return null;
  const name = (id: string | null) => state.participants.find((p) => p.playerId === id)?.displayName ?? 'Player';
  const revealing = state.phase !== 'FINISHED' && now < state.resumeAtEpochMillis;
  const yourTurn = state.currentPlayerId === c.room.youId && state.phase === 'IN_PROGRESS' && !revealing;
  const total = state.participants.reduce((sum, p) => sum + p.diceCount, 0);
  const bidValid = quantity >= 1 && quantity <= total && (!state.lastBid || quantity > state.lastBid.quantity
    || quantity === state.lastBid.quantity && face > state.lastBid.face);
  const enabled = yourTurn && c.socket === 'online' && !c.pending;
  const send = (type: 'PLAYER_BID' | 'CALL_BLUFF') => {
    if (type === 'PLAYER_BID') c.send({ protocolVersion: 1, type, requestId: null,
      payload: { matchId: state.matchId, expectedRevision: state.revision, bid: { quantity, face } } });
    else c.send({ protocolVersion: 1, type, requestId: null,
      payload: { matchId: state.matchId, expectedRevision: state.revision } });
  };
  return <>
    <section className="match-heading" aria-live="polite">
      <small>ROOM {c.room.roomCode} · ROUND {state.round} · FREE PLAY</small>
      <h2>{state.phase === 'FINISHED' ? name(state.winnerId) + ' wins!' : revealing ? 'Dice revealed'
        : yourTurn ? 'Your turn' : name(state.currentPlayerId) + '’s turn'}</h2>
      <p>{state.lastBid ? name(state.lastBidderId) + ' bids ' + state.lastBid.quantity + ' × ' + state.lastBid.face : 'No bid yet'}</p>
    </section>
    <aside className="match-seats" aria-label="Match participants">
      {state.participants.map((p) => <div key={p.playerId} className={p.playerId === state.currentPlayerId ? 'active-seat' : ''}>
        <span>{p.displayName}{p.npc ? ' · NPC' : ''}</span><strong>{p.diceCount ? p.diceCount + ' dice' : 'Out'}</strong>
      </div>)}
    </aside>
    <section className="match-actions" aria-label="Game actions">
      <div className="private-dice"><small>Your dice</small><div aria-label="Your private dice">
        {c.game!.ownDice.map((value, i) => <span key={i} className="die-face" aria-label={'Die ' + value}>{faces[value - 1]}</span>)}
        {!c.game!.ownDice.length && <span>Eliminated · watching the match</span>}
      </div></div>
      {state.phase === 'FINISHED' ? <button className="resume-button" onClick={onMenu}>Back to lobby</button> : <>
        <div className="bid-controls">
          <label>Quantity<input aria-label="Bid quantity" type="number" min={1} max={total} value={quantity}
            disabled={!enabled} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
          <label>Face<select aria-label="Bid face" value={face} disabled={!enabled} onChange={(e) => setFace(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <button className="resume-button" disabled={!enabled || !bidValid} onClick={() => send('PLAYER_BID')}>Bid</button>
          <button className="secondary-button" disabled={!enabled || !state.lastBid} onClick={() => send('CALL_BLUFF')}>Call bluff</button>
        </div>
        <p className="turn-clock">{revealing ? 'Next round in ' + Math.max(0, Math.ceil((state.resumeAtEpochMillis - now) / 1000)) + 's'
          : 'Turn timer: ' + Math.max(0, Math.ceil((state.deadlineEpochMillis - now) / 1000)) + 's'}</p>
      </>}
      {c.error && <p className="room-error" role="alert">{c.error}</p>}
    </section>
    {c.reveal && <details className="round-reveal" key={c.reveal.matchId + '-' + c.reveal.round} open={revealing || state.phase === 'FINISHED'}>
      <summary>Round {c.reveal.round}: {name(c.reveal.loserId)} lost a die · {c.reveal.actualCount} matching</summary>
      {c.reveal.dice.map((p) => <div key={p.playerId}><span>{name(p.playerId)}</span><span>{p.dice.map((n) => faces[n - 1]).join(' ') || 'Out'}</span></div>)}
    </details>}
  </>;
}
