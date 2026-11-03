import { create } from 'zustand';
import type { Avatar } from '@raccoon-royale/shared-schemas/types';

export const useAvatarStore = create<{ avatar: Avatar; select: (avatar: Avatar) => void }>((set) => ({
  avatar: 'RACCOON',
  select: (avatar) => set({ avatar }),
}));
