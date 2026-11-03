import { createContext, useContext, type ReactNode } from 'react';
import { useMatchClock } from './useMatchClock';

const MatchClock = createContext(Date.now());

/** One presentation clock keeps DOM dice, 3D dice, and the reveal phase aligned. */
export function MatchClockProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const now = useMatchClock(active);
  return <MatchClock.Provider value={now}>{children}</MatchClock.Provider>;
}

export function useMatchNow() { return useContext(MatchClock); }
