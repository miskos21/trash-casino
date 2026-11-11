import { test, expect } from '@playwright/test';

test('four seats keep dice separate from cups and show a consistent public reveal and history', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  let ownId = '';
  let lastReveal: { dice: { playerId: string; dice: number[] }[] } | undefined;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    const message = JSON.parse(String(payload));
    if (message.type === 'ROOM_SESSION') ownId = message.payload.playerId;
    if (message.type === 'DICE_REVEAL') lastReveal = message.payload;
  }));
  const peers: { socket: WebSocket; messages: { type: string; payload: any }[]; send: (type: string, payload: unknown) => void }[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /^Choose character/ }).click();
    await page.getByRole('button', { name: 'Frog', exact: true }).click();
    await page.getByRole('button', { name: 'Choose a game' }).click();
    await page.getByLabel('Player name').fill('Host');
    await page.getByRole('button', { name: 'Liar’s Dice', exact: true }).click(); // Blackjack is the default.
    await page.getByRole('button', { name: 'Create room', exact: true }).click();
    const roomCode = await page.getByLabel('Room code', { exact: true }).textContent();
    const endpoint = new URL('/ws', baseURL);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    for (const displayName of ['Guest one', 'Guest two']) {
      const messages: { type: string; payload: any }[] = [];
      const socket = new WebSocket(endpoint);
      socket.onmessage = ({ data }) => messages.push(JSON.parse(String(data)));
      const peer = { socket, messages, send: (type: string, payload: unknown) =>
        socket.send(JSON.stringify({ protocolVersion: 1, type, requestId: crypto.randomUUID(), payload })) };
      peers.push(peer);
      await expect.poll(() => messages.some((m) => m.type === 'CONNECTED')).toBe(true);
      peer.send('ROOM_JOIN', { displayName, avatar: 'CAT', roomCode });
      await expect.poll(() => messages.some((m) => m.type === 'ROOM_SESSION')).toBe(true);
      peer.send('ROOM_READY', { roomId: messages.find((m) => m.type === 'ROOM_SESSION')!.payload.roomId, ready: true });
    }
    await expect(page.locator('.lobby-seats li')).toHaveCount(4);
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await page.getByRole('button', { name: 'Start match', exact: true }).click();
    await expect(page.locator('.player-card')).toHaveCount(4);
    await expect(page.locator('.match-actions')).toHaveAttribute('data-turn', 'yours');

    // An overhead angle reproduced the user's obstructed playing surface.
    const size = page.viewportSize()!;
    await page.mouse.move(size.width / 2, size.height * 0.40);
    await page.mouse.down();
    await page.mouse.move(size.width / 2, size.height * 0.72, { steps: 16 });
    await page.mouse.up();
    await page.getByLabel('Claim quantity').fill('2');
    await page.getByLabel('Claim face').selectOption('3');
    await page.getByRole('button', { name: 'Make claim', exact: true }).click();
    const first = peers[0];
    await expect.poll(() => first.messages.filter((m) => m.type === 'GAME_STATE').at(-1)?.payload.publicState.revision).toBe(1);
    const state = first.messages.filter((m) => m.type === 'GAME_STATE').at(-1)!.payload.publicState;
    first.send('CALL_BLUFF', { matchId: state.matchId, expectedRevision: state.revision });
    await expect(page.locator('.match-actions')).toHaveAttribute('data-turn', 'reveal');
    const own = lastReveal!.dice.find((p) => p.playerId === ownId)!.dice.map(String);
    expect(await page.locator('.die-face').allTextContents()).toEqual(own);
    await page.screenshot({ path: testInfo.outputPath('four-seat-reveal-overhead.png') });
    await expect(page.locator('.private-dice > small')).toHaveText('Your dice', { timeout: 10000 });

    await page.reload();
    const showMoves = page.getByRole('button', { name: 'Show moves', exact: true });
    if (await showMoves.isVisible()) await showMoves.click();
    await expect(page.locator('[data-event-type="BID"]').first()).toContainText('Host');
    await expect(page.locator('[data-event-type="ROUND_RESULT"]')).toHaveCount(1);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Leave match', exact: true }).click();
    for (const peer of peers) {
      const roomId = peer.messages.find((m) => m.type === 'ROOM_SESSION')!.payload.roomId;
      peer.send('ROOM_LEAVE', { roomId });
    }
  } finally {
    peers.forEach((peer) => peer.socket.close());
  }
});
