/** Paid Blackjack bet per hand in whole TRASH. The server and contract enforce the real limits. */
export const MIN_BET = 1;
export const MAX_BET = 50;
const storageKey = 'trashnino-blackjack-bet';

export const clampBet = (value: number) => Math.min(MAX_BET, Math.max(MIN_BET, Math.round(value) || MIN_BET));

/** The last bet this browser used, as a convenience; 1 TRASH when unknown. */
export function rememberedBet() {
  try { return clampBet(Number(localStorage.getItem(storageKey) ?? MIN_BET)); } catch { return MIN_BET; }
}

export function rememberBet(value: number) {
  try { localStorage.setItem(storageKey, String(clampBet(value))); } catch { /* Not remembered; still used for this hand. */ }
}
