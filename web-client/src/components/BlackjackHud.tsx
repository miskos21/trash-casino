import type { BlackjackHand } from '@raccoon-royale/shared-schemas/types';
import type { GameConnection } from '../services/useGameConnection';
import { avatars } from '../avatars';
import { useMatchNow } from '../game/MatchClock';
import { GameRules } from './GameRules';
import { PlayingCard } from './PlayingCard';

const outcomeLabels: Record<NonNullable<BlackjackHand['outcome']>, string> = {
  BLACKJACK: 'Blackjack · wins', WIN: 'Wins', PUSH: 'Push · tie', LOSE: 'Loses',
};
function handLabel(hand: BlackjackHand, current: boolean) {
  if (hand.status === 'BUST') return hand.total + ' · Bust';
  if (hand.outcome) return hand.total + ' · ' + outcomeLabels[hand.outcome];
  if (hand.status === 'BLACKJACK') return 'Blackjack';
  if (hand.status === 'STOOD') return 'Stands on ' + hand.total;
  return hand.total + (current ? ' · deciding' : ' · waiting');
}

export function BlackjackHud({ connection: c, onMenu }: { connection: GameConnection; onMenu: () => void }) {
  const state = c.blackjack;
  const now = useMatchNow();
  if (!c.room || !state) return null;
  const finished = state.phase === 'FINISHED';
  const yourTurn = !finished && state.currentPlayerId === c.room.youId;
  const enabled = yourTurn && c.socket === 'online' && !c.pending;
  const me = state.players.find((p) => p.playerId === c.room!.youId);
  const current = state.players.find((p) => p.playerId === state.currentPlayerId);
  const seconds = Math.max(0, Math.ceil((state.deadlineEpochMillis - now) / 1000));
  const title = finished ? me?.outcome === 'BLACKJACK' ? 'Blackjack!' : me?.outcome === 'WIN' ? 'You win!'
    : me?.outcome === 'PUSH' ? 'Push' : 'Dealer wins' : yourTurn ? 'Your turn' : (current?.displayName ?? 'Player') + '’s turn';
  const subtitle = finished ? 'Dealer finished on ' + state.dealer.total + (state.dealer.total > 21 ? ' · bust' : '')
    : yourTurn ? 'Hit for another card or stand on ' + me?.total : 'Beat the dealer without going over 21';
  const send = (type: 'BLACKJACK_HIT' | 'BLACKJACK_STAND') => c.send({ protocolVersion: 1, type, requestId: null,
    payload: { matchId: state.matchId, expectedRevision: state.revision } });
  return <>
    <section className={'match-heading ' + (yourTurn ? 'is-your-turn' : '')} aria-live="polite">
      <small>ROOM {c.room.roomCode} · BLACKJACK</small>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </section>
    <aside className="match-seats" aria-label="Blackjack hands">
      <div className="player-card dealer-card">
        <span className="dealer-mark" aria-hidden="true">♠</span>
        <div><strong>House dealer</strong>
          <small>Dealer · {state.dealer.hiddenCards ? 'showing ' + state.dealer.total : state.dealer.total + (state.dealer.total > 21 ? ' · bust' : '')}</small></div>
      </div>
      {state.players.map((hand) => {
        const playing = !finished && hand.playerId === state.currentPlayerId;
        return <div key={hand.playerId} className={'player-card ' + (playing ? 'active-seat' : '')}>
          <img src={avatars.find((a) => a.id === hand.avatar)?.portrait} alt="" />
          <div><strong>{hand.displayName}{hand.playerId === c.room!.youId ? ' (you)' : hand.npc ? ' · agent' : ''}</strong>
            <small>{handLabel(hand, playing)}</small>
            <span className="seat-cards">{hand.cards.map((card, i) => <PlayingCard key={i} card={card} small />)}</span>
          </div>
          {playing && <span className="playing-badge">Playing</span>}
        </div>;
      })}
    </aside>
    <section className={'match-actions blackjack-actions ' + (yourTurn ? 'is-your-turn' : '') + (finished ? 'is-finished' : '')}
      aria-label="Blackjack actions" data-turn={finished ? 'finished' : yourTurn ? 'yours' : 'waiting'}>
      <div className="action-turn-line">
        <strong>{finished ? 'HAND COMPLETE' : c.socket !== 'online' ? 'RECONNECTING' : c.pending ? 'SENDING YOUR MOVE' : yourTurn ? 'YOUR TURN' : 'WAITING FOR ' + (current?.displayName ?? 'PLAYER').toUpperCase()}</strong>
        {!finished && <span className={seconds <= 8 ? 'urgent-clock' : ''}>{seconds}s left</span>}
      </div>
      <div className="card-row" aria-label="Dealer hand">
        <small>DEALER · {state.dealer.hiddenCards ? 'showing ' + state.dealer.total : state.dealer.total}</small>
        <div>{state.dealer.cards.map((card, i) => <PlayingCard key={i} card={card} />)}
          {Array.from({ length: state.dealer.hiddenCards }, (_, i) => <PlayingCard key={'hidden-' + i} />)}</div>
      </div>
      <div className="card-row" aria-label="Your hand">
        <small>{me ? 'YOUR HAND · ' + handLabel(me, yourTurn).toUpperCase() : 'WATCHING'}</small>
        <div>{me?.cards.map((card, i) => <PlayingCard key={i} card={card} />)}</div>
      </div>
      {finished ? <button className="resume-button" onClick={onMenu}>Back to lobby</button> : <>
        <div className="blackjack-controls">
          <button className="resume-button" disabled={!enabled} onClick={() => send('BLACKJACK_HIT')}>Hit</button>
          <button className="secondary-button" disabled={!enabled} onClick={() => send('BLACKJACK_STAND')}>Stand</button>
        </div>
        <p className="claim-explanation">{c.pending ? 'Waiting for server confirmation.' : yourTurn
          ? 'Hit takes one card. Over 21 busts. Stand keeps your total and passes the turn.'
          : 'Controls unlock on your turn. If the timer runs out you stand automatically.'}</p>
      </>}
      {c.error && <p className="room-error" role="alert">{c.error}</p>}
      <div className="match-mode-footer"><span>FREE MATCH · NO BUY-IN · NO TOKEN REWARD</span><GameRules game="BLACKJACK" /></div>
    </section>
  </>;
}
