import { describe, expect, it } from 'vitest';
import type { PlayerGameState, DICE_REVEAL } from '@raccoon-royale/shared-schemas/types';
import { isRevealVisible, visibleDiceForSeat } from './presentation';

const game: PlayerGameState = {
  publicState: { matchId: 'match', phase: 'IN_PROGRESS', round: 2, revision: 2,
    currentPlayerId: 'me', lastBid: null, lastBidderId: null, winnerId: null,
    deadlineEpochMillis: 35000, resumeAtEpochMillis: 5000,
    participants: [
      { playerId: 'me', displayName: 'Me', avatar: 'CAT', npc: false, diceCount: 5, chips: 4 },
      { playerId: 'other', displayName: 'Other', avatar: 'FROG', npc: true, diceCount: 5, chips: 6 },
    ] }, ownDice: [6, 6, 6, 6],
};
const reveal: DICE_REVEAL['payload'] = {
  matchId: 'match', round: 1, bid: { quantity: 3, face: 2 }, bidderId: 'me', callerId: 'other',
  loserId: 'me', winnerId: 'other', actualCount: 1,
  dice: [{ playerId: 'me', dice: [1, 2, 3, 4, 5] }, { playerId: 'other', dice: [1, 1, 1, 1, 1] }],
};
describe('round presentation and privacy', () => {
  it('keeps the HUD and 3D scene on the same completed roll during a reveal', () => {
    expect(isRevealVisible(game, reveal, 4000)).toBe(true);
    expect(visibleDiceForSeat(game, reveal, 'me', 'me', 4000)).toEqual([1, 2, 3, 4, 5]);
    expect(visibleDiceForSeat(game, reveal, 'other', 'me', 4000)).toEqual([1, 1, 1, 1, 1]);
  });
  it('hides the cached opponent reveal exactly when the next round becomes playable', () => {
    expect(isRevealVisible(game, reveal, 5000)).toBe(false);
    expect(visibleDiceForSeat(game, reveal, 'me', 'me', 5000)).toEqual([6, 6, 6, 6]);
    expect(visibleDiceForSeat(game, reveal, 'other', 'me', 5000)).toBeUndefined();
  });
  it('does not reuse a reveal from another match', () => {
    expect(visibleDiceForSeat(game, { ...reveal, matchId: 'old-match' }, 'me', 'me', 4000)).toBeUndefined();
    expect(visibleDiceForSeat(game, { ...reveal, matchId: 'old-match' }, 'other', 'me', 4000)).toBeUndefined();
    expect(visibleDiceForSeat(game, null, 'me', 'me', 4000)).toBeUndefined();
  });
  it('keeps the final public reveal inspectable without inventing a new roll', () => {
    const finished: PlayerGameState = { ...game, publicState: { ...game.publicState, phase: 'FINISHED', winnerId: 'other', currentPlayerId: null } };
    expect(isRevealVisible(finished, reveal, 9000)).toBe(true);
    expect(visibleDiceForSeat(finished, reveal, 'other', 'me', 9000)).toEqual([1, 1, 1, 1, 1]);
    expect(visibleDiceForSeat(null, reveal, 'me', 'me', 4000)).toBeUndefined();
  });
});
