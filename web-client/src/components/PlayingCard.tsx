import type { Card } from '@raccoon-royale/shared-schemas/types';

export const suitSymbols: Record<Card['suit'], string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const suitNames: Record<Card['suit'], string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const rankNames: Partial<Record<Card['rank'], string>> = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

/** Presentation only: cards arrive from the server snapshot. A missing card renders the face-down hole card. */
export function PlayingCard({ card, small = false }: { card?: Card; small?: boolean }) {
  const size = small ? ' small-card' : '';
  if (!card) return <span className={'playing-card card-back' + size} role="img" aria-label="Face-down card" />;
  const red = card.suit === 'H' || card.suit === 'D';
  return <span className={'playing-card' + size + (red ? ' red-suit' : '')} role="img"
    aria-label={(rankNames[card.rank] ?? card.rank) + ' of ' + suitNames[card.suit]}>
    <span aria-hidden="true">{card.rank}</span><span aria-hidden="true">{suitSymbols[card.suit]}</span>
  </span>;
}
