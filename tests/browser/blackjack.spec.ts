import { test, expect } from '@playwright/test';

test('a guest plays Blackjack hands from one shoe with two agents against the house dealer', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  // Blackjack and one agent (Don) are the defaults.
  await expect(page.getByRole('button', { name: 'Blackjack', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '1 agent', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '2 agents', exact: true }).click();
  await page.getByLabel('Player name', { exact: true }).fill('Card Shark');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.locator('.room-code-line small')).toHaveText('Free play · Blackjack');
  await expect(page.locator('.lobby-seats li')).toHaveCount(3);
  await expect(page.locator('.lobby-seats li').nth(1)).toContainText('Don Raccoone');
  await expect(page.locator('.lobby-seats li').nth(2)).toContainText('Foxy');
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();

  const actions = page.getByRole('region', { name: 'Blackjack actions' });
  await expect(actions).toBeVisible();
  await expect(page.locator('.die-face')).toHaveCount(0);
  // Casino shoe: the dealer shuffles and burns a card before the first deal; the fingerprint is published first.
  await expect(actions).toHaveAttribute('data-turn', 'shuffling');
  await expect(page.locator('.match-heading small')).toContainText('NEW SHOE · 311 CARDS LEFT');
  await expect(page.locator('.shoe-fingerprint code')).toHaveText(/^[0-9a-f]{8}…[0-9a-f]{8}$/);
  const fingerprint = await page.locator('.shoe-fingerprint').getAttribute('title');
  await expect(page.locator('.match-heading small')).toContainText('HAND 1', { timeout: 15000 });
  await expect(page.getByLabel('Your hand').getByRole('img')).toHaveCount(2); // Also true when a natural ends the hand at once.
  if (await actions.getAttribute('data-turn') === 'yours') {
    // While the hand is open exactly one dealer card is face down.
    await expect(page.getByLabel('Dealer hand').getByRole('img', { name: 'Face-down card' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Hit', exact: true }).click();
    await expect(page.getByLabel('Your hand').getByRole('img')).toHaveCount(3);
    if (await actions.getAttribute('data-turn') === 'yours') await page.getByRole('button', { name: 'Stand', exact: true }).click();
  }
  await expect(actions).toHaveAttribute('data-turn', 'result', { timeout: 20000 }); // Agents play after you.
  await expect(page.getByLabel('Blackjack hands').locator('.player-card')).toHaveCount(4); // Dealer + you + two agents.
  await expect(page.getByLabel('Dealer hand').getByRole('img', { name: 'Face-down card' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(/You win!|Dealer wins|Push|Blackjack!/);
  await expect(page.locator('.match-heading small')).toContainText('HAND 1');
  await expect(page.locator('.hand-tally').first()).toHaveText(/^[01]W [01]L [01]P$/);
  await page.screenshot({ path: testInfo.outputPath('blackjack.png') });

  // The next hand is dealt automatically from the same shoe after the result pause.
  await expect(page.locator('.match-heading small')).toContainText('HAND 2', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Back to lobby', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Your hand').getByRole('img')).toHaveCount(2);
  expect(await page.locator('.shoe-fingerprint').getAttribute('title')).toBe(fingerprint); // Same shoe, same commitment.
  expect(errors).toEqual([]);
});
