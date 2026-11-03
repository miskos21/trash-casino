import type { Avatar } from '@raccoon-royale/shared-schemas/types';

export type AvatarOption = { id: Avatar; name: string; portrait: string };
export const avatars: AvatarOption[] = [
  { id: 'RACCOON', name: 'Raccoon', portrait: '/portraits/raccoon.png' },
  { id: 'FOX', name: 'Fox', portrait: '/portraits/fox.png' },
  { id: 'BEAR', name: 'Bear', portrait: '/portraits/bear.png' },
  { id: 'CAT', name: 'Cat', portrait: '/portraits/cat.png' },
  { id: 'CAPYBARA', name: 'Capybara', portrait: '/portraits/capybara.png' },
  { id: 'FROG', name: 'Frog', portrait: '/portraits/frog.png' },
];
