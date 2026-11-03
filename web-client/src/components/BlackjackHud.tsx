import { useEffect, useState } from 'react';
import type { BlackjackHand } from '@raccoon-royale/shared-schemas/types';
import type { GameConnection } from '../services/useGameConnection';
import { verifyShoe, type ShoeCheck } from '../game/shoeVerify';
import { avatars } from '../avatars';
import { useMatchNow } from '../game/MatchClock';
import { GameRules } from './GameRules';
import { PlayingCard } from './PlayingCard';

const outcomeLabels: Record<NonNullable<BlackjackHand['outcome']>, string> = {
  BLACKJACK: 'Blackjack · wins', WIN: 'Wins', PUSH: 'Push · tie', LOSE: 'Loses',
};
function handLabel(hand: BlackjackHand, current: boolean) {
  if (!hand.cards.length) return 'Waiting for the deal';
  if (hand.status === 'BUST') return hand.total + ' · Bust';
  if (hand.outcome) return hand.total + ' · ' + outcomeLabels[hand.outcome];
  if (hand.status === 'BLACKJACK') return 'Blackjack';
  if (hand.status === 'STOOD') return 'Stands on ' + hand.total;
  return hand.total + (current ? ' · deciding' : ' · waiting');
}
const tallyLabel = ({ tally: t }: BlackjackHand) => t.wins + 'W ' + t.losses + 'L ' + t.pushes + 'P';
/** Free-play ranking only: wins minus losses over the shoe, then blackjacks. */
const score = ({ tally: t }: BlackjackHand) => (t.wins - t.losses) * 100 + t.blackjacks;

export function BlackjackHud({ connection: c, onMenu }: { connection: GameConnection; onMenu: () => void }) {
  const state = c.blackjack;
  const now = useMatchNow();
  const [check, setCheck] = useState<ShoeCheck | null>(null);
  const reveal = state?.shoe.reveal;
  useEffect(() => {
    let active = true;
    setCheck(null);
    if (state?.shoe.reveal) verifyShoe(state.shoe, c.witnessed).then((outcome) => { if (active) setCheck(outcome); });
    return () => { active = false; };
  }, [reveal, state?.matchId, c.witnessed.length]);
  if (!c.room || !state) return null;
  const finished = state.phase === 'FINISHED';
  const shuffling = state.handPhase === 'SHUFFLING';
  const result = state.handPhase === 'RESULT' || shuffling;
  const yourTurn = !result && state.currentPlayerId === c.room.youId;
  const enabled = yourTurn && c.socket === 'online' && !c.pending;
  const me = state.players.find((p) => p.playerId === c.room!.youId);
  const current = state.players.find((p) => p.playerId === state.currentPlayerId);
  const seconds = Math.max(0, Math.ceil(((result ? state.nextHandAtEpochMillis : state.deadlineEpochMillis) - now) / 1000));
  const standings = [...state.players].sort((a, b) => score(b) - score(a));
  const outcomeTitle = me?.outcome === 'BLACKJACK' ? 'Blackjack!' : me?.outcome === 'WIN' ? 'You win!'
    : me?.outcome === 'PUSH' ? 'Push' : 'Dealer wins';
  const title = finished ? 'Shoe finished' : shuffling ? 'Shuffling the shoe' : result ? outcomeTitle : yourTurn ? 'Your turn' : (current?.displayName ?? 'Player') + '’s turn';
  const dealerResult = 'Dealer finished on ' + state.dealer.total + (state.dealer.total > 21 ? ' · bust' : '');
  const subtitle = finished ? 'Best record: ' + standings[0].displayName + ' · ' + tallyLabel(standings[0])
    : shuffling ? state.shoe.decks + ' decks shuffled · ' + state.shoe.burned + ' card burned face down' : result ? dealerResult : yourTurn ? 'Hit for another card or stand on ' + me?.total : 'Beat the dealer without going over 21';
  const send = (type: 'BLACKJACK_HIT' | 'BLACKJACK_STAND') => c.send({ protocolVersion: 1, type, requestId: null,
    payload: { matchId: state.matchId, expectedRevision: state.revision } });
  return <>
    <section className={'match-heading ' + (yourTurn ? 'is-your-turn' : '')} aria-live="polite">
      <small>ROOM {c.room.roomCode} · BLACKJACK · {shuffling ? 'NEW SHOE' : 'HAND ' + state.hand} · {state.cardsRemaining} CARDS LEFT</small>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </section>
    <aside className="match-seats" aria-label="Blackjack hands">
      <div className="player-card dealer-card">
        <span className="dealer-mark" aria-hidden="true">♠</span>
        <div><strong>House dealer</strong>
          <small>Dealer · {shuffling ? 'shuffling' : state.dealer.hiddenCards ? 'showing ' + state.dealer.total : state.dealer.total + (state.dealer.total > 21 ? ' · bust' : '')}</small></div>
      </div>
      {state.players.map((hand) => {
        const playing = !result && hand.playerId === state.currentPlayerId;
        return <div key={hand.playerId} className={'player-card ' + (playing ? 'active-seat' : '')}>
          <img src={avatars.find((a) => a.id === hand.avatar)?.portrait} alt="" />
          <div><strong>{hand.displayName}{hand.playerId === c.room!.youId ? ' (you)' : hand.npc ? ' · agent' : ''}</strong>
            <small>{handLabel(hand, playing)}</small>
            <small className="hand-tally">{tallyLabel(hand)}</small>
            <span className="seat-cards">{hand.cards.map((card, i) => <PlayingCard key={i} card={card} small />)}</span>
          </div>
          {playing && <span className="playing-badge">Playing</span>}
        </div>;
      })}
    </aside>
    <section className={'match-actions blackjack-actions ' + (yourTurn ? 'is-your-turn' : '') + (finished ? 'is-finished' : '')}
      aria-label="Blackjack actions" data-turn={finished ? 'finished' : shuffling ? 'shuffling' : result ? 'result' : yourTurn ? 'yours' : 'waiting'}>
      <div className="action-turn-line">
        <strong>{finished ? 'SHOE COMPLETE' : c.socket !== 'online' ? 'RECONNECTING' : c.pending ? 'SENDING YOUR MOVE'
          : shuffling ? 'THE DEALER IS SHUFFLING' : result ? 'HAND ' + state.hand + ' RESULT' : yourTurn ? 'YOUR TURN' : 'WAITING FOR ' + (current?.displayName ?? 'PLAYER').toUpperCase()}</strong>
        {!finished && <span className={seconds <= 8 && !result ? 'urgent-clock' : ''}>{shuffling ? 'First deal in ' + seconds + 's' : result ? 'Next hand in ' + seconds + 's' : seconds + 's left'}</span>}
      </div>
      <div className="card-row" aria-label="Dealer hand">
        <small>DEALER · {shuffling ? 'SHUFFLING 6 DECKS' : state.dealer.hiddenCards ? 'showing ' + state.dealer.total : state.dealer.total}</small>
        <div>{state.dealer.cards.map((card, i) => <PlayingCard key={i} card={card} />)}
          {Array.from({ length: state.dealer.hiddenCards }, (_, i) => <PlayingCard key={'hidden-' + i} />)}</div>
      </div>
      <div className="card-row" aria-label="Your hand">
        <small>{me ? 'YOUR HAND · ' + handLabel(me, yourTurn).toUpperCase() : 'WATCHING'}</small>
        <div>{me?.cards.map((card, i) => <PlayingCard key={i} card={card} />)}</div>
      </div>
      <p className="shoe-fingerprint" title={state.shoe.commitment}>
        Shoe fingerprint <code>{state.shoe.commitment.slice(0, 8)}…{state.shoe.commitment.slice(-8)}</code>
        {finished ? ' · revealed below' : ' · fixed before the first card, revealed when the shoe ends'}
      </p>
      {finished ? <>
        <ShoeVerdict check={check} />
        <ol className="shoe-standings" aria-label="Shoe standings">
          {standings.map((hand) => <li key={hand.playerId}><span>{hand.displayName}{hand.playerId === c.room!.youId ? ' (you)' : ''}</span>
            <strong>{tallyLabel(hand)}</strong><small>{hand.tally.blackjacks} blackjacks</small></li>)}
        </ol>
        <button className="resume-button" onClick={onMenu}>Back to lobby</button>
      </> : <>
        <div className="blackjack-controls">
          <button className="resume-button" disabled={!enabled} onClick={() => send('BLACKJACK_HIT')}>Hit</button>
          <button className="secondary-button" disabled={!enabled} onClick={() => send('BLACKJACK_STAND')}>Stand</button>
        </div>
        <p className="claim-explanation">{c.pending ? 'Waiting for server confirmation.' : shuffling
          ? 'Like a casino shoe: one shuffle, one burned card, then every hand comes off the top until the cut card.' : result
          ? 'Same shoe, next deal. The shoe ends when the cut card comes out (' + state.cardsRemaining + ' cards left).'
          : yourTurn ? 'Hit takes one card. Over 21 busts. Stand keeps your total and passes the turn.'
            : 'Controls unlock on your turn. If the timer runs out you stand automatically.'}</p>
      </>}
      {c.error && <p className="room-error" role="alert">{c.error}</p>}
      <div className="match-mode-footer"><span>FREE MATCH · NO BUY-IN · NO TOKEN REWARD</span><GameRules game="BLACKJACK" /></div>
    </section>
  </>;
}

function ShoeVerdict({ check }: { check: ShoeCheck | null }) {
  if (!check) return <p className="shoe-verdict" role="status">Checking the revealed shoe in your browser…</p>;
  const ok = check.fingerprint !== false && check.completeDecks && check.handsMatch;
  return <div className={'shoe-verdict ' + (ok ? 'verified' : 'mismatch')} role="status" aria-label="Shoe check">
    <strong>{ok ? '✓ Shoe checked in your browser' : '✗ Shoe check failed'}</strong>
    <ul>
      <li>{check.fingerprint === null ? 'Fingerprint not checked: this page needs https or localhost.'
        : check.fingerprint ? 'Revealed order matches the fingerprint shown before the first card.' : 'Revealed order does NOT match the fingerprint.'}</li>
      <li>{check.completeDecks ? 'Exactly six complete decks: every card appears six times.' : 'The shoe is NOT six complete decks.'}</li>
      <li>{check.handsMatch ? 'All ' + check.handsChecked + ' hands you saw came off the shoe in that order.' : 'A hand you saw does NOT match the shoe order.'}</li>
    </ul>
    <small>This proves the order was fixed before play. The server still chose the shuffle; it is not provably fair randomness.</small>
  </div>;
}
