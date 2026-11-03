import { ExtrudeGeometry, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { Card } from '@raccoon-royale/shared-schemas/types';
import { cardArtwork } from '../../game/cardArtwork';

export const CARD_WIDTH = 0.46, CARD_HEIGHT = 0.647;
const width = CARD_WIDTH, height = CARD_HEIGHT, radius = 0.025;
const outline = new Shape();
outline.moveTo(-width / 2 + radius, -height / 2);
outline.lineTo(width / 2 - radius, -height / 2);
outline.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
outline.lineTo(width / 2, height / 2 - radius);
outline.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
outline.lineTo(-width / 2 + radius, height / 2);
outline.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
outline.lineTo(-width / 2, -height / 2 + radius);
outline.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);
const surface = new ShapeGeometry(outline, 5);
const points = surface.getAttribute('position'), uv = surface.getAttribute('uv');
for (let i = 0; i < points.count; i++) uv.setXY(i, (points.getX(i) + width / 2) / width, (points.getY(i) + height / 2) / height);
const edge = new ExtrudeGeometry(outline, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, steps: 1, curveSegments: 5 });
const textures = new Map<string, Texture>();
function textureFor(card: Card | null) {
  const key = card ? card.rank + card.suit : 'back';
  let texture = textures.get(key);
  if (!texture) {
    texture = new TextureLoader().load(cardArtwork(card));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    textures.set(key, texture);
  }
  return texture;
}

/** Rounded paper geometry and the same vector print as the HUD. A hidden card never has a face texture. */
export function PlayingCard3D({ card, position, turn = 0 }: { card: Card | null; position: [number, number, number]; turn?: number }) {
  return <group position={position} rotation={[-Math.PI / 2, 0, Math.PI + turn]} dispose={null}>
    <mesh geometry={edge} castShadow receiveShadow><meshStandardMaterial color="#eee8db" roughness={0.85} /></mesh>
    <mesh geometry={surface} position={[0, 0, 0.0075]} receiveShadow>
      <meshStandardMaterial map={textureFor(card)} roughness={0.8} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
    <mesh geometry={surface} position={[0, 0, -0.0015]} rotation={[0, Math.PI, 0]}>
      <meshStandardMaterial map={textureFor(null)} roughness={0.8} />
    </mesh>
  </group>;
}
