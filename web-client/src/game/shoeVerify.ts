import type { BlackjackState, Card } from '@raccoon-royale/shared-schemas/types';

export type WitnessedHand = { hand: number; start: number; cards: Card[] };
export type ShoeCheck = { fingerprint: boolean | null; completeDecks: boolean; handsChecked: number; handsMatch: boolean };
const key = (card: Card) => card.rank + card.suit;

/**
 * Rebuilds the casino deal order of a settled hand from its public RESULT snapshot: each player then the
 * dealer, twice; then each player's hits in seat order (players act in seat order); then the dealer's draws.
 */
export function dealtOrder(state: BlackjackState): Card[] {
  const dealer = state.dealer.cards;
  const order: Card[] = [];
  for (let round = 0; round < 2; round++) {
    for (const player of state.players) order.push(player.cards[round]);
    order.push(dealer[round]);
  }
  for (const player of state.players) order.push(...player.cards.slice(2));
  order.push(...dealer.slice(2));
  return order;
}

export function witness(state: BlackjackState): WitnessedHand | null {
  return state.handPhase === 'RESULT' ? { hand: state.hand, start: state.shoe.handStart, cards: dealtOrder(state) } : null;
}

async function sha256(text: string) {
  if (!globalThis.crypto?.subtle) return null; // Needs a secure context (https or localhost).
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Checks the revealed shoe in this browser against the commitment shown before the first card. */
export async function verifyShoe(shoe: BlackjackState['shoe'], witnessed: WitnessedHand[]): Promise<ShoeCheck | null> {
  if (!shoe.reveal) return null;
  const { salt, order } = shoe.reveal;
  const hash = await sha256(salt + ':' + order.map(key).join(','));
  const counts = new Map<string, number>();
  for (const card of order) counts.set(key(card), (counts.get(key(card)) ?? 0) + 1);
  return {
    fingerprint: hash === null ? null : hash === shoe.commitment,
    completeDecks: order.length === shoe.size && counts.size === 52 && [...counts.values()].every((n) => n === shoe.decks),
    handsChecked: witnessed.length,
    handsMatch: witnessed.every((hand) => hand.cards.every((card, i) => order[hand.start + i] && key(order[hand.start + i]) === key(card))),
  };
}
