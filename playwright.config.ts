import { defineConfig } from '@playwright/test';

// Start Java (or Compose) and `npm run dev` first. These tests consume real transport.
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://localhost:5173', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-width-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
});
