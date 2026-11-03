import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { BlackjackState, Card } from '@raccoon-royale/shared-schemas/types';
import { dealtOrder, verifyShoe, witness } from './shoeVerify';

const ranks: Card['rank'][] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const suits: Card['suit'][] = ['S', 'H', 'D', 'C'];
type ShoeOrder = NonNullable<BlackjackState['shoe']['reveal']>['order'];
const order = Array.from({ length: 6 }, () => suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })))).flat() as ShoeOrder;
const salt = 'ab'.repeat(16);
const text = (cards: Card[]) => salt + ':' + cards.map((c) => c.rank + c.suit).join(',');
const commitment = createHash('sha256').update(text(order)).digest('hex');
const at = (i: number) => order[i];
const tally = { wins: 0, losses: 1, pushes: 0, blackjacks: 0 };

// Hand dealt from position 1 (after the burn): p1, p2, dealer, p1, p2, dealer, then p2 hits once, dealer draws once.
const result: BlackjackState = {
  matchId: 'm', phase: 'FINISHED', hand: 1, handPhase: 'RESULT', cardsRemaining: 0, nextHandAtEpochMillis: 0,
  currentPlayerId: null, revision: 3, deadlineEpochMillis: 0,
  players: [
    { playerId: 'p1', displayName: 'P1', avatar: 'CAT', npc: false, cards: [at(1), at(4)], total: 5, status: 'STOOD', outcome: 'LOSE', tally },
    { playerId: 'p2', displayName: 'P2', avatar: 'FOX', npc: true, cards: [at(2), at(5), at(7)], total: 12, status: 'STOOD', outcome: 'LOSE', tally },
  ],
  dealer: { cards: [at(3), at(6), at(8)], hiddenCards: 0, total: 20 },
  shoe: { decks: 6, size: 312, burned: 1, handStart: 1, commitment, reveal: { salt, order } },
};

describe('casino shoe verification', () => {
  it('rebuilds the casino deal order of a settled hand', () => {
    expect(dealtOrder(result)).toEqual(order.slice(1, 9));
    expect(witness({ ...result, handPhase: 'PLAYING' })).toBeNull();
  });

  it('accepts a shoe whose reveal matches the commitment and every witnessed hand', async () => {
    expect(await verifyShoe(result.shoe, [witness(result)!])).toEqual({ fingerprint: true, completeDecks: true, handsChecked: 1, handsMatch: true });
  });

  it('detects a changed order, an extra card, and a hand that did not come from the shoe', async () => {
    const swapped = [order[1], order[0], ...order.slice(2)] as ShoeOrder;
    expect((await verifyShoe({ ...result.shoe, reveal: { salt, order: swapped } }, []))!.fingerprint).toBe(false);
    const extraAce = order.map((card, i) => i === order.length - 1 ? { rank: 'A', suit: 'S' } as Card : card) as ShoeOrder;
    expect((await verifyShoe({ ...result.shoe, reveal: { salt, order: extraAce } }, []))!.completeDecks).toBe(false);
    const forged = { ...witness(result)!, cards: [{ rank: 'A', suit: 'H' } as Card, ...witness(result)!.cards.slice(1)] };
    expect((await verifyShoe(result.shoe, [forged]))!.handsMatch).toBe(false);
    expect(await verifyShoe({ ...result.shoe, reveal: null }, [])).toBeNull();
  });
});
