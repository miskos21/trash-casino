import type { Card } from '@raccoon-royale/shared-schemas/types';

// Shared vector print for the HUD and 3D cards. Values always come from the server.
const paths: Record<Card['suit'], string> = {
  H: 'M0 48C-10 32-49 8-49-20C-49-55-15-63 0-35C15-63 49-55 49-20C49 8 10 32 0 48Z',
  D: 'M0-56 38 0 0 56-38 0Z',
  S: 'M0-56C-14-35-48-16-48 9C-48 37-14 43-4 20C-5 36-10 46-22 52H22C10 46 5 36 4 20C14 43 48 37 48 9C48-16 14-35 0-56Z',
  C: 'M-7 15C-27 42-53 25-48 2C-45-13-29-20-18-14C-35-39-13-58 0-54C22-57 35-34 18-14C37-24 54-8 49 11C44 34 18 35 7 15C7 33 12 46 24 52H-24C-12 46-7 33-7 15Z',
};
const cache = new Map<string, string>();
const layouts: Record<string, [number, number][]> = {
  '2': [[256, 194], [256, 526]],
  '3': [[256, 194], [256, 360], [256, 526]],
  '4': [[163, 194], [349, 194], [163, 526], [349, 526]],
  '5': [[163, 194], [349, 194], [256, 360], [163, 526], [349, 526]],
  '6': [[163, 194], [349, 194], [163, 360], [349, 360], [163, 526], [349, 526]],
  '7': [[163, 194], [349, 194], [256, 277], [163, 360], [349, 360], [163, 526], [349, 526]],
  '8': [[163, 194], [349, 194], [256, 277], [163, 360], [349, 360], [256, 443], [163, 526], [349, 526]],
  '9': [[163, 180], [349, 180], [163, 300], [349, 300], [256, 360], [163, 420], [349, 420], [163, 540], [349, 540]],
  '10': [[163, 180], [349, 180], [256, 240], [163, 300], [349, 300], [163, 420], [349, 420], [256, 480], [163, 540], [349, 540]],
};
const pip = (x: number, y: number, size = 0.62, inverted = y > 360) =>
  `<use href="#suit" transform="translate(${x} ${y}) rotate(${inverted ? 180 : 0}) scale(${size})"/>`;

function court(rank: Card['rank'], ink: string) {
  const crown = rank === 'J'
    ? '<path d="M-48-55Q0-100 48-55L42-42H-44Z" fill="#253e48"/><path d="M15-73Q35-113 49-90Q44-66 22-56" fill="#b54539"/>'
    : '<path d="m-45-45-9-38 28 17 26-32 26 32 28-17-9 38Z" fill="#c6a353" stroke="#72552a" stroke-width="3"/><path d="M-43-47H43" stroke="#f2d68a" stroke-width="7"/>';
  const portrait = `<g>
    <path d="M-103 139-89 54-34 24H34L89 54 103 139Z" fill="#25434c" stroke="#182d34" stroke-width="4"/>
    <path d="M-89 58-57 43-31 139H-69ZM89 58 57 43 31 139H69Z" fill="${ink}"/>
    <path d="M-34 28 0 79 34 28 26 139H-26Z" fill="#c5a25a"/>
    <path d="m-11 87 11-12 11 12-11 12Zm0 31 11-12 11 12-11 12Z" fill="#fbf4dc"/>
    <path d="M-24 9V36L0 55 24 36V9" fill="#e3c393" stroke="#8e6746" stroke-width="3"/>
    <path d="M-42-43Q-48-18-34 10L-13 27 13 27 34 10Q48-18 42-43Z" fill="#f1dbb2" stroke="#8e6746" stroke-width="3"/>
    <path d="M-42-43Q-56-20-38 3L-28-18-29-40M42-43Q55-18 38 3L29-18 29-40" fill="#493c32"/>
    <path d="M-27-18h15M12-18h15" stroke="#44382c" stroke-width="4" stroke-linecap="round"/>
    <path d="m0-17-5 18 10 2M-10 12Q0 17 10 12" fill="none" stroke="#a57456" stroke-width="3"/>
    ${rank === 'K' ? '<path d="M-25 9Q0-5 25 9L13 16 0 11-13 16Z" fill="#493c32"/><path d="M-24 20 0 45 24 20 14 31H-14Z" fill="#493c32"/>' : ''}
    ${rank === 'Q' ? '<path d="M-45-32-52 33-32 44-29 4M45-32 52 33 32 44 29 4" fill="#a37638"/><circle cx="-35" cy="12" r="6" fill="#c6a353"/><circle cx="35" cy="12" r="6" fill="#c6a353"/>' : ''}
    ${crown}
    <path d="M-81 78-61 72M-85 93-57 84M61 72 81 78M57 84 85 93" stroke="#d5b96e" stroke-width="5"/>
  </g>`;
  return `<rect x="128" y="140" width="256" height="440" rx="5" fill="#f6efd9" stroke="${ink}" stroke-width="5"/>
    <rect x="138" y="150" width="236" height="420" fill="none" stroke="#c6a353" stroke-width="2"/>
    <g transform="translate(256 220)">${portrait}</g><g transform="translate(256 500) rotate(180)">${portrait}</g>
    <path d="m138 374 236-46v24l-236 46Z" fill="#c6a353" stroke="#f6efd9" stroke-width="3"/>${pip(256, 360, 0.43, false)}`;
}

export function cardArtwork(card: Card | null): string {
  const key = card ? card.rank + card.suit : 'back';
  const existing = cache.get(key);
  if (existing) return existing;
  const ink = card?.suit === 'H' || card?.suit === 'D' ? '#b12e38' : '#192d39';
  let print: string;
  if (card) {
    const corner = `<text x="59" y="101" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="${card.rank === '10' ? 69 : 84}" fill="${ink}">${card.rank}</text>${pip(59, 147, 0.42, false)}`;
    print = `<defs><path id="suit" d="${paths[card.suit]}" fill="${ink}"/></defs>${corner}<g transform="rotate(180 256 360)">${corner}</g>`;
    if (card.rank === 'A') print += `${pip(256, 340, 1.85, false)}<path d="M158 501h62m72 0h62" stroke="#b9a16c" stroke-width="2"/><text x="256" y="552" text-anchor="middle" font-family="Georgia,serif" font-size="18" letter-spacing="5" fill="#8b7954">TRASHNINO</text>`;
    else if (layouts[card.rank]) print += layouts[card.rank].map(([x, y]) => pip(x, y)).join('');
    else print += court(card.rank, ink);
  } else print = `<defs><pattern id="weave" width="32" height="32" patternUnits="userSpaceOnUse"><path d="m16 0 16 16-16 16L0 16Z" fill="none" stroke="#6d9390" stroke-width="1.8"/><circle cx="16" cy="16" r="2" fill="#cbb37b"/></pattern></defs>
    <rect x="21" y="21" width="470" height="678" rx="17" fill="#173d46"/>
    <rect x="31" y="31" width="450" height="658" rx="12" fill="url(#weave)" stroke="#cbb37b" stroke-width="3"/>
    <rect x="46" y="46" width="420" height="628" rx="9" fill="none" stroke="#e8d7a9" stroke-width="2"/>
    <path d="M68 120V68h52M392 68h52v52M444 600v52h-52M120 652H68v-52" fill="none" stroke="#cbb37b" stroke-width="5"/>
    <path d="M256 204 374 360 256 516 138 360Z" fill="#173d46" stroke="#cbb37b" stroke-width="5"/>
    <path d="M256 224 355 360 256 496 157 360Z" fill="none" stroke="#769994" stroke-width="2"/>
    <circle cx="256" cy="360" r="65" fill="#14323b" stroke="#e0c58a" stroke-width="3"/>
    <text x="256" y="389" text-anchor="middle" font-family="Georgia,serif" font-size="88" fill="#e0c58a">T</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="720" viewBox="0 0 512 720"><defs><linearGradient id="paper" x2="0.6" y2="1"><stop stop-color="#fffef9"/><stop offset="1" stop-color="#f1ecdf"/></linearGradient></defs><rect x="2" y="2" width="508" height="716" rx="28" fill="url(#paper)" stroke="#d8d0bd" stroke-width="3"/>${print}</svg>`;
  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  cache.set(key, uri);
  return uri;
}
