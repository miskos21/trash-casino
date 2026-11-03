// Render our own procedural models to PNGs. No external artwork or AI service.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const destination = new URL('../web-client/public/portraits/', import.meta.url);
const allAvatars = ['RACCOON', 'FOX', 'BEAR', 'CAT', 'CAPYBARA', 'FROG'];
const requested = process.argv.slice(2);
if (requested.some((avatar) => !allAvatars.includes(avatar))) throw new Error('Unknown avatar');
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 2 });
  for (const avatar of requested.length ? requested : allAvatars) {
    await page.goto(new URL('/tools/portraits.html?avatar=' + avatar, process.env.FRONTEND_URL ?? 'http://localhost:5173').href);
    await page.waitForFunction(() => document.documentElement.dataset.portraitReady === 'true');
    await page.locator('canvas').screenshot({ path: fileURLToPath(new URL(avatar.toLowerCase() + '.png', destination)) });
    console.log('Rendered ' + avatar);
  }
} finally { await browser.close(); }
