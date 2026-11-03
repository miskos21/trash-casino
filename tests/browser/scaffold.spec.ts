import { test, expect } from '@playwright/test';

test('fills the viewport, orbits the table, and selects a real portrait through the game menu', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.connection-indicator')).toHaveAttribute('data-connection', 'online');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  // R3F sizes the canvas after its first ResizeObserver callback.
  await expect.poll(() => page.locator('canvas').evaluate((element) => element.getBoundingClientRect().width)).toBe(page.viewportSize()!.width);
  await expect.poll(() => page.locator('canvas').evaluate((element) => element.getBoundingClientRect().height)).toBe(page.viewportSize()!.height);
  const canvas = await page.locator('canvas').evaluate((element) => {
    const context = element.getContext('webgl2');
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, available: !!context && !context.isContextLost() };
  });
  expect(canvas.available).toBe(true);
  expect(canvas.width).toBe(page.viewportSize()!.width);
  expect(canvas.height).toBe(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
    && document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('table.png') });

  // Orbit from one side toward the other; the entire scene remains interactive.
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(width * 0.25, height * 0.5);
  await page.mouse.down();
  await page.mouse.move(width * 0.8, height * 0.5, { steps: 20 });
  await page.mouse.up();
  await page.mouse.wheel(0, -180);

  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('img')).toHaveCount(5);
  for (const image of await menu.getByRole('img').all()) {
    expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(menu.getByRole('button', { name: 'Owl', exact: true })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Cat', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Cat', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(menu.getByRole('button', { name: 'Raccoon', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(menu.getByRole('button', { name: 'Create room', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('menu.png') });
  await menu.getByRole('button', { name: 'Back to table' }).click();
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose character. Current: Cat', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Look at my character' }).click();
  await page.screenshot({ path: testInfo.outputPath('my-character.png') });
  await page.getByRole('button', { name: 'Reset table camera' }).click();

  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(page.getByText(/TRASH has no real-world value/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps actual connection status and retry inside the menu', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.connection-indicator')).toHaveAttribute('data-connection', 'online');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByText('Connection', { exact: true }).click();
  await expect(page.locator('[data-status="online"]')).toHaveCount(2);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Check connection again' }).click();
  await expect(page.locator('[data-status="offline"]')).toHaveCount(2);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Check connection again' }).click();
  await expect(page.locator('[data-status="online"]')).toHaveCount(2);
});
