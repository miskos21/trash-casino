import { test, expect } from '@playwright/test';

test('two browser players join one table with an NPC, reconnect, and finish a full match', async ({ page, context }, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^Choose character/ }).click();
  await page.getByRole('button', { name: 'Capybara', exact: true }).click();
  await page.getByRole('button', { name: 'Choose a game' }).click();
  await page.getByLabel('Player name', { exact: true }).fill('Host');
  await page.getByRole('button', { name: 'Liar’s Dice', exact: true }).click(); // Blackjack is the default.
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  const code = await page.getByLabel('Room code', { exact: true }).textContent();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const guest = await context.newPage();
  guest.on('pageerror', (e) => errors.push(e.message));
  await guest.goto('/');
  await guest.getByRole('button', { name: 'Play', exact: true }).click();
  await guest.getByLabel('Player name', { exact: true }).fill('Guest');
  await guest.getByLabel('Room code to join').fill(code!);
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(guest.getByLabel('Room code', { exact: true })).toHaveText(code!);
  await expect(page.locator('.lobby-seats li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready', exact: true }).click();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await guest.getByRole('button', { name: 'Back to table', exact: true }).click();
  await expect(page.getByLabel('Your private dice')).toBeVisible();
  await expect(page.locator('.die-face')).toHaveCount(5);
  await expect(guest.locator('.die-face')).toHaveCount(5);
  await expect(page.getByLabel('Game actions')).toHaveAttribute('data-turn', 'yours');
  await expect(guest.getByLabel('Game actions')).toHaveAttribute('data-turn', 'waiting');
  await expect(page.locator('.match-mode-footer, .claim-explanation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'How Liar’s Dice works' })).toBeVisible();
  await expect(page.getByText(/No buy-in, no tokens at risk, no token reward/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'How Liar’s Dice works' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Back to table', exact: true }).click();
  const ownDice = await guest.locator('.die-face').allTextContents();
  await guest.reload();
  await expect(guest.locator('.die-face')).toHaveCount(5);
  expect(await guest.locator('.die-face').allTextContents()).toEqual(ownDice);
  await expect(page.getByRole('button', { name: 'Make claim', exact: true })).toBeEnabled();
  await expect(guest.getByRole('button', { name: 'Make claim', exact: true })).toBeDisabled();
  await page.getByLabel('Claim quantity').fill('2');
  await page.getByLabel('Claim face').selectOption('3');
  await page.getByRole('button', { name: 'Make claim', exact: true }).click();
  await expect(guest.getByRole('button', { name: 'Call bluff', exact: true })).toBeEnabled();
  await expect(guest.getByLabel('Current claim')).toContainText('At least 2');
  await expect(guest.getByLabel('Current claim').getByRole('img', { name: 'Die 3', exact: true })).toBeVisible();
  const showMoves = guest.getByRole('button', { name: 'Show moves', exact: true });
  if (await showMoves.isVisible()) await showMoves.click();
  await expect(guest.locator('[data-event-type="BID"]').first()).toContainText('Host');
  await expect(guest.locator('[data-event-type="BID"]').first().getByRole('img', { name: 'Die 3', exact: true })).toBeVisible();
  const hideMoves = guest.getByRole('button', { name: 'Hide', exact: true });
  if (await hideMoves.isVisible()) await hideMoves.click();
  await page.screenshot({ path: testInfo.outputPath('multiplayer-table.png') });

  const deadline = Date.now() + 140000;
  while (Date.now() < deadline) {
    if (await page.locator('.match-heading h2').textContent().then((s) => s?.endsWith(' wins!'))) break;
    for (const actor of [page, guest]) {
      const bluff = actor.getByRole('button', { name: 'Call bluff', exact: true });
      const bid = actor.getByRole('button', { name: 'Make claim', exact: true });
      // The final server action removes these controls. Bound the wait so this
      // transition cannot strand the test in an isVisible/isEnabled race.
      const tryClick = async (button: typeof bluff) => {
        if (!await button.evaluateAll((elements) => elements.some((element) => !(element as HTMLButtonElement).disabled))) return false;
        // A background WebGL tab may throttle animation frames; foreground it
        // before Playwright waits for two stable frames and dispatches a click.
        await actor.bringToFront();
        try { await button.click({ timeout: 5000 }); }
        catch (error) {
          const heading = await actor.locator('.match-heading h2').textContent();
          if (!(error instanceof Error) || error.name !== 'TimeoutError' || heading === 'Your turn') throw error;
        }
        return true;
      };
      if (!await tryClick(bluff)) await tryClick(bid);
    }
    await page.waitForTimeout(150); // Allow server turn/reveal timers; never invent local outcomes.
  }
  await expect(page.locator('.match-heading h2')).toHaveText(/ wins!$/);
  await expect(guest.locator('.match-heading h2')).toHaveText(await page.locator('.match-heading h2').textContent() ?? '');
  await expect(page.getByRole('button', { name: 'Back to lobby', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('match-result.png') });
  expect(errors).toEqual([]);
  for (const actor of [page, guest]) {
    await actor.getByRole('button', { name: 'Open menu', exact: true }).click();
    await actor.getByRole('button', { name: 'Leave room', exact: true }).click();
  }
});
