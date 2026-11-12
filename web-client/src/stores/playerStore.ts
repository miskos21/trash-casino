import { create } from 'zustand';

const storageKey = 'trashnino-player-name';
export const MAX_NAME = 32;

function savedName() {
  try { return localStorage.getItem(storageKey)?.slice(0, MAX_NAME) || 'Player'; } catch { return 'Player'; }
}

/** The display name used to create or join rooms. Remembered per browser as a convenience only. */
export const usePlayerStore = create<{ name: string; setName: (name: string) => void }>((set) => ({
  name: savedName(),
  setName: (name) => {
    const value = name.slice(0, MAX_NAME);
    try { localStorage.setItem(storageKey, value); } catch { /* Not remembered; still works for this visit. */ }
    set({ name: value });
  },
}));
