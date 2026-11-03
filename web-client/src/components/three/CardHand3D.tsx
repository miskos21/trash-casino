import type { Card } from '@raccoon-royale/shared-schemas/types';
import { CARD_HEIGHT, CARD_WIDTH, PlayingCard3D } from './PlayingCard3D';

/** Every card keeps its physical size. The larger table reserves a four-column grid for each hand. */
export function CardHand3D({ cards, position, rotation = Math.PI }: {
  cards: readonly (Card | null)[]; position: [number, number, number]; rotation?: number;
}) {
  if (!cards.length) return null;
  const columns = Math.min(4, cards.length), rows = Math.ceil(cards.length / columns);
  const gap = 0.08;
  return <group position={position} rotation={[0, rotation, 0]}>
    {cards.map((card, index) => {
      const row = Math.floor(index / columns), column = index % columns;
      const inRow = Math.min(columns, cards.length - row * columns);
      return <PlayingCard3D key={index} card={card} position={[
        (column - (inRow - 1) / 2) * (CARD_WIDTH + gap),
        0,
        (row - (rows - 1) / 2) * (CARD_HEIGHT + gap),
      ]} />;
    })}
  </group>;
}
