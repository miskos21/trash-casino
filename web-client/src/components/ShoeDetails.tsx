import { useEffect, useState } from 'react';
import type { GameConnection } from '../services/useGameConnection';
import { verifyShoe, type ShoeCheck } from '../game/shoeVerify';

export function ShoeDetails({ connection: c }: { connection: GameConnection }) {
  const state = c.blackjack;
  const [check, setCheck] = useState<ShoeCheck | null>(null);
  const reveal = state?.shoe.reveal;
  useEffect(() => {
    let active = true;
    setCheck(null);
    if (state?.shoe.reveal) verifyShoe(state.shoe, c.witnessed).then((outcome) => { if (active) setCheck(outcome); });
    return () => { active = false; };
  }, [reveal, state?.matchId, c.witnessed.length]);
  if (!state) return null;
  return <details className="menu-details"><summary>Card verification</summary>
    <p className="shoe-fingerprint" title={state.shoe.commitment}>Shoe fingerprint <code>{state.shoe.commitment}</code></p>
    {reveal ? <ShoeVerdict check={check} /> : <p>The full card order is revealed and checked when this session ends.</p>}
  </details>;
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
