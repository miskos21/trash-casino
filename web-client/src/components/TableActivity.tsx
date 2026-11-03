import { useEffect, useState } from 'react';
import type { PublicGameState, PublicGameEvent, DICE_REVEAL } from '@raccoon-royale/shared-schemas/types';
import { DieFace } from './DieFace';

function useWideLayout() {
  const [wide, setWide] = useState(() => matchMedia('(min-width:1100px)').matches);
  useEffect(() => {
    const query = matchMedia('(min-width:1100px)');
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}
function EventRow({ event, name }: { event: PublicGameEvent; name: (id: string | null) => string }) {
  return <li className={'activity-event event-' + event.type.toLowerCase()} data-event-type={event.type}>
    <span className="event-round">R{event.round}</span>
    <div>
      {event.type === 'BID' && <><strong>{name(event.actorId)}</strong><span className="event-claim">claimed {event.bid?.quantity} × <DieFace value={event.bid!.face} small /></span></>}
      {event.type === 'CALL_BLUFF' && <><strong>{name(event.actorId)}</strong><span>called bluff</span></>}
      {event.type === 'ROUND_RESULT' && <><strong>{name(event.loserId)} lost a die</strong><span>{event.actualCount} matching · claim was {event.bid?.quantity} × {event.bid?.face}</span></>}
      {event.type === 'ROUND_START' && <><strong>Round {event.round}</strong><span>{name(event.actorId)} starts</span></>}
      {event.type === 'GAME_OVER' && <><strong>{name(event.actorId)} wins</strong><span>Last player with dice</span></>}
      {event.cause === 'TIMEOUT' && <small>Automatic · turn timed out</small>}
      {event.cause === 'UNAVAILABLE' && <small>Automatic · player unavailable</small>}
      {event.cause === 'NPC' && event.type !== 'ROUND_RESULT' && <small>NPC move</small>}
    </div>
  </li>;
}

export function TableActivity({ state, reveal, revealActive }: {
  state: PublicGameState; reveal: DICE_REVEAL['payload'] | null; revealActive: boolean;
}) {
  const wide = useWideLayout();
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? wide;
  const name = (id: string | null) => state.participants.find((p) => p.playerId === id)?.displayName ?? 'Player';
  const currentReveal = reveal?.matchId === state.matchId ? reveal : null;
  const history = [...(state.history ?? [])].filter((event) => !(revealActive && currentReveal && event.round > currentReveal.round)).reverse();
  return <aside className="table-activity" aria-label="Public table activity" data-expanded={expanded}>
    <header><h3>Table activity</h3><button className="activity-toggle" aria-expanded={expanded}
      aria-controls="activity-content" onClick={() => setOpen(!expanded)}>{expanded ? 'Hide' : 'Show moves'}</button></header>
    <div id="activity-content" className="activity-content" hidden={!expanded}>
      {currentReveal && <details className="last-reveal" key={currentReveal.matchId + '-' + currentReveal.round} open={revealActive || undefined}>
        <summary>Round {currentReveal.round}: {name(currentReveal.loserId)} lost a die</summary>
        <p>{currentReveal.actualCount} matching dice found. The claim was {currentReveal.bid.quantity} × {currentReveal.bid.face}.</p>
        {currentReveal.dice.map((seat) => <div className="revealed-seat" key={seat.playerId}><strong>{name(seat.playerId)}</strong>
          <div>{seat.dice.map((value, i) => <DieFace key={i} value={value} small highlighted={value === currentReveal.bid.face} />)}{!seat.dice.length && <small>Out</small>}</div>
        </div>)}
      </details>}
      <ol className="activity-list" aria-label="Accepted public moves">
        {history.map((event) => <EventRow key={event.id} event={event} name={name} />)}
      </ol>
      {!history.length && <p className="activity-empty">Accepted claims and bluff results appear here.</p>}
    </div>
  </aside>;
}
