import { test, expect } from '@playwright/test';

test('Trashnino has one play menu and previews only the selected character', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Trashnino');
  await expect(page.locator('.game-brand')).toHaveText('TTRASHNINO');
  await expect(page.locator('.game-header').getByRole('button', { name: /^Choose character/ })).toHaveCount(1);
  await expect(page.locator('.play-trigger')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('trashnino-home.png') });
});

for (const game of ['Liar’s Dice', 'Blackjack']) {
  test(game + ': shows disconnect, restores a seat, and leaves the actual match', async ({ page, context }, testInfo) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByLabel('Your name').fill('Host');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: game, exact: true }).click();
    await page.getByRole('button', { name: '0 agents', exact: true }).click();
    await page.getByRole('button', { name: 'Create room', exact: true }).click();
    const code = await page.getByLabel('Room code', { exact: true }).textContent();
    const guest = await context.newPage();
    await guest.goto('/');
    await guest.getByLabel('Your name').fill('Guest');
    await guest.getByRole('button', { name: 'Play', exact: true }).click();
    await guest.getByLabel('Room code to join').fill(code!);
    await guest.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(guest.getByLabel('Room code', { exact: true })).toHaveText(code!);
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await guest.getByRole('button', { name: 'Ready', exact: true }).click();
    await page.getByRole('button', { name: 'Start match', exact: true }).click();
    await guest.getByRole('button', { name: 'Back to table', exact: true }).click();
    const saved = await guest.evaluate(() => sessionStorage.getItem('raccoon-guest-session'));
    await guest.close();
    await expect(page.getByLabel('Player connection updates')).toContainText('Guest disconnected.');
    await expect(page.locator('.player-card[data-presence="DISCONNECTED"]')).toContainText('Guest');
    await page.screenshot({ path: testInfo.outputPath('disconnected.png') });

    const recovered = await context.newPage();
    recovered.on('pageerror', (e) => errors.push(e.message));
    await recovered.addInitScript((value) => sessionStorage.setItem('raccoon-guest-session', value!), saved);
    await recovered.goto('/');
    await expect(page.getByLabel('Player connection updates')).not.toContainText('disconnected');
    await recovered.getByRole('button', { name: 'Settings' }).click(); // Leave match lives in Settings during a match.
    const leave = recovered.locator('.settings-menu').getByRole('button', { name: 'Leave match', exact: true });
    await expect(leave).toBeVisible();
    expect(await leave.evaluate((button) => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await leave.click();
    await expect(recovered.locator('.match-actions')).toHaveCount(0);
    await expect(recovered.getByRole('button', { name: 'Play', exact: true })).toBeVisible(); // Back on the home screen.
    await expect(recovered.locator('.character-chip')).toBeVisible();
    expect(await recovered.evaluate(() => sessionStorage.getItem('raccoon-guest-session'))).toBeNull();
    // Chip rules: the leaver keeps their 5 chips, so a two-player match ends in a tie.
    if (game === 'Liar’s Dice') await expect(page.locator('.match-heading h2')).toHaveText('Tie on chips');
    else await expect(page.getByLabel('Player connection updates')).toContainText('Guest left the match.');
    await recovered.reload();
    await expect(recovered.locator('.game-shell')).toHaveAttribute('data-connection', 'online');
    await expect(recovered.locator('.match-actions')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('player-left.png') });
    await page.locator('.game-header').getByRole('button', { name: /Leave (match|room)/ }).click();
    expect(errors).toEqual([]);
  });
}
