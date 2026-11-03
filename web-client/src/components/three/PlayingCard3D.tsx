import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Card } from '@raccoon-royale/shared-schemas/types';
import { suitSymbols } from '../PlayingCard';

// Faces are drawn locally on a canvas: no font or image downloads. One texture per distinct card.
const textures = new Map<string, CanvasTexture>();
function cardTexture(card: Card | null) {
  const key = card ? card.rank + card.suit : 'back';
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 180;
  const g = canvas.getContext('2d')!;
  g.fillStyle = card ? '#f4ecd8' : '#7c2f2a';
  g.fillRect(0, 0, 128, 180);
  g.strokeStyle = card ? '#cdbf9c' : '#d8b16a';
  g.lineWidth = 6; g.strokeRect(6, 6, 116, 168);
  if (card) {
    g.fillStyle = card.suit === 'H' || card.suit === 'D' ? '#b2342b' : '#1e2a22';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 34px Georgia, serif'; g.fillText(card.rank, 30, 32);
    g.font = '64px Georgia, serif'; g.fillText(suitSymbols[card.suit], 64, 104);
  } else {
    g.strokeStyle = '#b5554b'; g.lineWidth = 3;
    for (let i = -180; i < 180; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 180, 180); g.stroke(); }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  textures.set(key, texture);
  return texture;
}

/** Presentation only: a null card is the dealer's face-down hole card, whose value the client never receives. */
export function PlayingCard3D({ card, position, turn = 0 }: { card: Card | null; position: [number, number, number]; turn?: number }) {
  // Flat on the felt; the top edge points away from whoever the card is dealt to.
  return <mesh position={position} rotation={[-Math.PI / 2, 0, Math.PI + turn]} receiveShadow>
    <planeGeometry args={[0.38, 0.53]} /><meshStandardMaterial map={cardTexture(card)} roughness={0.65} />
  </mesh>;
}
