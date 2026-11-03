import { test, expect } from '@playwright/test';

test('renders a real 3D preview, selects an avatar, and reports actual connectivity', async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pick your face.' })).toBeVisible();
  await expect(page.locator('[data-status="online"]')).toHaveCount(2);
  await expect(page.locator('canvas')).toBeVisible();
  const canvas = await page.locator('canvas').evaluate((element) => {
    const context = element.getContext('webgl2');
    return { width: element.width, height: element.height, available: !!context && !context.isContextLost() };
  });
  expect(canvas.available).toBe(true);
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Fox', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fox', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Raccoon', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Rooms coming next' })).toBeDisabled();
  await expect(page.getByText('TRASH has no real-world value.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('table.png'), fullPage: true });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Check connection again' }).click();
  await expect(page.locator('[data-status="offline"]')).toHaveCount(2);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Check connection again' }).click();
  await expect(page.locator('[data-status="online"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});
