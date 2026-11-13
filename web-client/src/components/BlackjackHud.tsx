import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BlackjackHand } from '@raccoon-royale/shared-schemas/types';
import type { GameConnection } from '../services/useGameConnection';
import { avatars } from '../avatars';
import { MAX_BET, MIN_BET, clampBet, rememberBet, rememberedBet } from '../game/blackjackBet';
import { useMatchNow } from '../game/MatchClock';
import { useTurnKeys } from '../game/useTurnKeys';
import { PlayingCard } from './PlayingCard';
import { SeatPresence } from './SeatPresence';

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

const YOCTO_PER_TRASH = 10n ** 24n;

/**
 * `casino` is your casino balance in yoctoTRASH (paid rooms), used only to warn before a bet you cannot cover;
 * the contract is what actually refuses it.
 */
export function BlackjackHud({ connection: c, onMenu, trash, casino, status }: {
  connection: GameConnection; onMenu: () => void; trash?: string | null; casino?: string | null; status?: ReactNode;
}) {
  const state = c.blackjack;
  const now = useMatchNow();
  const hitButton = useRef<HTMLButtonElement>(null), standButton = useRef<HTMLButtonElement>(null), nextButton = useRef<HTMLButtonElement>(null);
  const keysActive = !!c.room && !!state && state.handPhase === 'PLAYING' && state.currentPlayerId === c.room.youId && c.socket === 'online' && !c.pending;
  useTurnKeys(keysActive, state?.revision, [hitButton, standButton]);
  // After a hand: the next one is dealt when you ask for it (Enter works too).
  const dealtIn = !!c.room && !!state && state.players.some((p) => p.playerId === c.room!.youId);
  const readyIds: readonly string[] = state?.nextHandReady ?? [];
  const asked = !!c.room && readyIds.includes(c.room.youId);
  // Paid shoes also wait before hand 1, so everyone (including players who joined the room) picks a bet first.
  const canAskNext = !!state && state.phase !== 'FINISHED' && dealtIn && !asked
    && (state.handPhase === 'RESULT' || (state.handPhase === 'SHUFFLING' && !!c.room?.economy));
  useTurnKeys(canAskNext && c.socket === 'online' && !c.pending, state?.hand, [nextButton]);
  // Paid rooms: your bet for the coming hand, chosen in the result card and sent with Next hand.
  const serverBet = c.room?.economy && state ? Number(BigInt(c.room.economy.buyIn) / YOCTO_PER_TRASH) : null;
  const [bet, setBet] = useState(() => serverBet ?? rememberedBet());
  useEffect(() => { if (serverBet) setBet(serverBet); }, [state?.hand, serverBet]);
  if (!c.room || !state) return null;
  const finished = state.phase === 'FINISHED';
  const shuffling = state.handPhase === 'SHUFFLING';
  const result = state.handPhase === 'RESULT' || shuffling;
  const yourTurn = !result && state.currentPlayerId === c.room.youId;
  const enabled = yourTurn && c.socket === 'online' && !c.pending;
  const me = state.players.find((p) => p.playerId === c.room!.youId);
  const current = state.players.find((p) => p.playerId === state.currentPlayerId);
  const dealAt = result ? state.nextHandAtEpochMillis : state.deadlineEpochMillis;
  const seconds = Math.max(0, Math.ceil((dealAt - now) / 1000));
  // Humans still to ask for the next hand; agents never hold up the deal.
  const waitingFor = state.players.filter((p) => !p.npc && !readyIds.includes(p.playerId)
    && c.room!.participants.some((s) => s.playerId === p.playerId && s.presence !== 'LEFT'));
  const standings = [...state.players].sort((a, b) => score(b) - score(a));
  const outcomeTitle = me?.outcome === 'BLACKJACK' ? 'Blackjack!' : me?.outcome === 'WIN' ? 'You win!'
    : me?.outcome === 'PUSH' ? 'Push' : 'Dealer wins';
  const title = finished ? 'Session finished' : shuffling ? (c.room.economy ? 'Place your bet' : 'Shuffling…') : result ? outcomeTitle : yourTurn ? 'Your turn' : (current?.displayName ?? 'Player') + '’s turn';
  const send = (type: 'BLACKJACK_HIT' | 'BLACKJACK_STAND') => c.send({ protocolVersion: 1, type, requestId: null,
    payload: { matchId: state.matchId, expectedRevision: state.revision } });
  const paid = !!c.room.economy;
  const cantCover = paid && casino != null && BigInt(bet) * YOCTO_PER_TRASH > BigInt(casino);
  const changeBet = (value: number) => setBet(clampBet(value));
  const askNext = () => {
    if (paid) rememberBet(bet);
    c.send({ protocolVersion: 1, type: 'BLACKJACK_NEXT_HAND', requestId: null,
      payload: { matchId: state.matchId, hand: state.hand, ...(paid ? { betTrash: bet } : {}) } });
  };
  const resultReady = result && !finished && (!shuffling || paid);
  return <>
    <section className={'match-heading ' + (yourTurn ? 'is-your-turn' : '')} aria-live="polite">
      <small>BLACKJACK{!shuffling && ' · HAND ' + state.hand}</small>
      <h2>{title}</h2>
      {status}
      {resultReady && dealtIn && <div className="heading-actions">
        {paid && <div className="bet-picker" role="group" aria-label="Bet for the next hand">
          <span>Bet</span>
          <button className="secondary-button" aria-label="Lower the bet" disabled={asked || bet <= MIN_BET} onClick={() => changeBet(bet - 1)}>−</button>
          <input aria-label="Bet in TRASH" inputMode="numeric" value={bet} disabled={asked}
            onChange={(e) => changeBet(Number(e.target.value.replace(/[^0-9]/g, '')))} />
          <button className="secondary-button" aria-label="Raise the bet" disabled={asked || bet >= MAX_BET} onClick={() => changeBet(bet + 1)}>+</button>
          <span>TRASH</span>
          {[1, 5, 10, 25, 50].map((preset) => <button key={preset} className={'bet-preset ' + (bet === preset ? 'selected' : '')}
            disabled={asked} aria-pressed={bet === preset} onClick={() => changeBet(preset)}>{preset}</button>)}
        </div>}
        {cantCover && !asked && <p className="room-error">Not enough TRASH in the casino for {bet}. Lower the bet or deposit more.</p>}
        <button ref={nextButton} className="resume-button" disabled={asked || cantCover || c.socket !== 'online' || c.pending} onClick={askNext}>
          {asked ? 'Waiting for ' + (waitingFor.map((p) => p.displayName).join(', ') || 'the deal') + '…' : paid ? (shuffling ? 'Deal · bet ' : 'Next hand · bet ') + bet : 'Next hand'}</button>
        {state.nextHandAtEpochMillis > 0 && <small>Next deal in {seconds} s</small>}
      </div>}
    </section>
    <aside className="match-seats" aria-label="Blackjack hands">
      {state.players.filter((hand) => hand.playerId !== c.room!.youId).map((hand) => {
        const seat = c.room!.participants.find((s) => s.playerId === hand.playerId);
        const playing = !result && hand.playerId === state.currentPlayerId;
        return <div key={hand.playerId} data-presence={seat?.presence} className={'player-card ' + (playing ? 'active-seat' : '')}>
          <img src={avatars.find((a) => a.id === hand.avatar)?.portrait} alt="" />
          <div><strong>{hand.displayName}{hand.playerId === c.room!.youId ? ' (you)' : hand.npc ? ' · agent' : ''}</strong>
            <small>{handLabel(hand, playing)}</small>
            {/* Opponents' face-up cards, so their hits and busts are readable without looking at the felt. */}
            {hand.cards.length > 0 && <span className="seat-cards">{hand.cards.map((card, i) => <PlayingCard key={i} card={card} small />)}</span>}
            <SeatPresence seat={seat} />
          </div>
          {playing && seat?.presence === 'ONLINE' && <span className="playing-badge">Playing</span>}
        </div>;
      })}
    </aside>
    <section className={'match-actions blackjack-actions ' + (yourTurn ? 'is-your-turn' : '') + (finished ? 'is-finished' : '')}
      aria-label="Blackjack actions" data-turn={finished ? 'finished' : shuffling ? 'shuffling' : result ? 'result' : yourTurn ? 'yours' : 'waiting'}>
      <div className="action-turn-line">
        {!finished && (!result || dealAt > 0) && <span className={'turn-timer ' + (seconds <= 5 && !result ? 'urgent-clock' : '')} aria-label={seconds + ' seconds ' + (result ? 'until the deal' : 'left')}>
          <strong>{seconds}</strong><small>{result ? 'next deal' : yourTurn ? 'your turn' : 'seconds'}</small></span>}
        {c.socket !== 'online' ? <em>Reconnecting…</em> : c.pending ? <em>Sending…</em> : null}
      </div>
      {!shuffling && <><div className="card-row" aria-label="Dealer hand">
        <small>Dealer · {state.dealer.total}</small>
        <div>{state.dealer.cards.map((card, i) => <PlayingCard key={i} card={card} />)}
          {Array.from({ length: state.dealer.hiddenCards }, (_, i) => <PlayingCard key={'hidden-' + i} />)}</div>
      </div>
      <div className="card-row" aria-label="Your hand">
        <small>{me ? 'You · ' + me.total : 'Watching'}</small>
        <div>{me?.cards.map((card, i) => <PlayingCard key={i} card={card} />)}</div>
      </div>
      </>}
      {finished ? <>
        <ol className="shoe-standings" aria-label="Shoe standings">
          {standings.map((hand) => <li key={hand.playerId}><span>{hand.displayName}{hand.playerId === c.room!.youId ? ' (you)' : ''}</span>
            <strong>{tallyLabel(hand)}</strong><small>{hand.tally.blackjacks} blackjacks</small></li>)}
        </ol>
        <button className="resume-button" onClick={onMenu}>Back to lobby</button>
      </> : !result && <>
        <div className="blackjack-controls">
          <button ref={hitButton} className="resume-button" disabled={!enabled} onClick={() => send('BLACKJACK_HIT')}>Hit</button>
          <button ref={standButton} className="secondary-button" disabled={!enabled} onClick={() => send('BLACKJACK_STAND')}>Stand</button>
        </div>
      </>}
      {c.error && <p className="room-error" role="alert">{c.error}</p>}
      {c.room.economy && trash && <div className="strip-trash"><span className="trash-coin" aria-hidden="true" /><strong>{trash}</strong><small>TRASH in casino</small></div>}
    </section>
  </>;
}
