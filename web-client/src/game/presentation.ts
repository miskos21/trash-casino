import type { PlayerGameState, DICE_REVEAL } from '@raccoon-royale/shared-schemas/types';

export function isRevealVisible(game: PlayerGameState | null, reveal: DICE_REVEAL['payload'] | null, now: number) {
  return !!game && !!reveal && reveal.matchId === game.publicState.matchId
    && (game.publicState.phase === 'FINISHED' || now < game.publicState.resumeAtEpochMillis);
}

/** A past reveal may be displayed publicly; the next roll remains recipient-only. */
export function visibleDiceForSeat(game: PlayerGameState | null, reveal: DICE_REVEAL['payload'] | null,
  seatId: string, ownId: string, now: number): readonly number[] | undefined {
  if (!game) return undefined;
  if (isRevealVisible(game, reveal, now)) return reveal?.dice.find((p) => p.playerId === seatId)?.dice;
  if (game.publicState.phase === 'IN_PROGRESS' && now < game.publicState.resumeAtEpochMillis) return undefined;
  return seatId === ownId ? game.ownDice : undefined;
}
