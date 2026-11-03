// Render our own procedural models to PNGs. No external artwork or AI service.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const destination = new URL('../web-client/public/portraits/', import.meta.url);
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 2 });
  for (const avatar of ['RACCOON', 'FOX', 'BEAR', 'OWL', 'CAPYBARA']) {
    await page.goto(new URL('/tools/portraits.html?avatar=' + avatar, process.env.FRONTEND_URL ?? 'http://localhost:5173').href);
    await page.waitForFunction(() => document.documentElement.dataset.portraitReady === 'true');
    await page.locator('canvas').screenshot({ path: fileURLToPath(new URL(avatar.toLowerCase() + '.png', destination)) });
    console.log('Rendered ' + avatar);
  }
} finally { await browser.close(); }
