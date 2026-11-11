// Headless paid Liar's Dice flow against a running backend + near-bridge + chain
// (NEAR Testnet, or a local sandbox rehearsal). Real signed transactions, real
// NEP-413 login, real WebSocket match. No mocks. TRASH has no real-world value.
//
// The player signs with PLAYER_PRIVATE_KEY, a full-access key of PLAYER_ACCOUNT_ID.
// Required env: PLAYER_ACCOUNT_ID, PLAYER_PRIVATE_KEY, NEAR_RPC_URL,
//               TRASH_TOKEN_CONTRACT_ID, TRASH_CASINO_CONTRACT_ID
// Optional env: BACKEND_URL (default http://localhost:8080)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { signMessage } from 'near-api-js/nep413';

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
};
const backend = process.env.BACKEND_URL ?? 'http://localhost:8080';
const tokenId = env('TRASH_TOKEN_CONTRACT_ID'), casinoId = env('TRASH_CASINO_CONTRACT_ID');
const provider = new JsonRpcProvider({ url: env('NEAR_RPC_URL') });
const player = new Account(env('PLAYER_ACCOUNT_ID'), provider, KeyPairSigner.fromSecretKey(env('PLAYER_PRIVATE_KEY')));
const TRASH = 10n ** 24n;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (yocto) => `${BigInt(yocto) / TRASH}.${String(BigInt(yocto) % TRASH).padStart(24, '0').slice(0, 2)} TRASH`;

const schema = JSON.parse(await readFile(new URL('../shared-schemas/api.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(schema);
const validServer = ajv.compile({ $ref: schema.$id + '#/$defs/ServerMessage' });

const view = (contractId, method, args) => provider.callFunction({ contractId, method, args, blockQuery: { finality: 'final' } });
const wallet = async () => BigInt(await view(tokenId, 'ft_balance_of', { account_id: player.accountId }));
const casino = async () => BigInt(await view(casinoId, 'get_balance', { account_id: player.accountId }));

/** Signs, sends, and waits for the FINAL outcome. Throws unless execution succeeded. */
async function tx(receiverId, methodName, args, deposit = 0n, tgas = 100n) {
  const outcome = await player.signAndSendTransaction({
    receiverId, actions: [actions.functionCall(methodName, args, tgas * 10n ** 12n, deposit)], waitUntil: 'FINAL', throwOnFailure: false,
  });
  const failed = !outcome.status || typeof outcome.status !== 'object' || !('SuccessValue' in outcome.status)
    || outcome.receipts_outcome.some((r) => typeof r.outcome.status === 'object' && 'Failure' in r.outcome.status);
  if (failed) throw new Error(`${methodName} failed: ${JSON.stringify(outcome.status).slice(0, 300)}`);
  const raw = outcome.status.SuccessValue;
  return { hash: outcome.transaction.hash, value: raw ? JSON.parse(Buffer.from(raw, 'base64').toString()) : null };
}

async function post(path, body, headers = {}) {
  const res = await fetch(backend + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

class Peer {
  messages = []; failure = null; sequence = 0;
  constructor() {
    const url = new URL('/ws', backend); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(url);
    this.heartbeat = setInterval(() => { if (this.ws.readyState === WebSocket.OPEN) this.send('PING', {}); }, 10000);
    this.ws.onmessage = ({ data }) => {
      try { const value = JSON.parse(data); assert.ok(validServer(value), 'Server message violates shared schema'); this.messages.push(value); }
      catch (error) { this.failure = error; }
    };
    this.ws.onerror = () => { this.failure = new Error('WebSocket failed'); };
  }
  send(type, payload) { this.ws.send(JSON.stringify({ protocolVersion: 1, type, requestId: 'paid-' + ++this.sequence, payload })); }
  latest(type) { return this.messages.findLast((m) => m.type === type)?.payload; }
  async wait(test, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.failure) throw this.failure;
      const found = this.messages.findLast(test);
      if (found) return found.payload;
      await delay(20);
    }
    throw new Error('Timed out awaiting server event');
  }
  close() { clearInterval(this.heartbeat); this.ws.close(); }
}

const peer = new Peer();
try {
  const chain = await (await fetch(backend + '/api/chain')).json();
  assert.equal(chain.enabled, true, 'Backend chain features are disabled');
  assert.equal(chain.casinoId, casinoId);
  console.log(`chain: ${chain.network}, casino ${casinoId}, buy-in ${fmt(chain.buyIn)}`);

  // 1. Test faucet -> wallet. Skipped while the per-account cooldown is active.
  const faucet = await view(tokenId, 'get_faucet', { account_id: player.accountId });
  if (BigInt(faucet.next_claim_ns) <= BigInt(Date.now()) * 1_000_000n) {
    const minted = await tx(tokenId, 'faucet', {}, BigInt(faucet.storage_deposit_yocto), 30n);
    console.log(`faucet: +${fmt(minted.value)} to wallet (tx ${minted.hash})`);
  } else console.log('faucet: cooldown active, skipped');

  // 2. Deposit 2 buy-ins into the casino.
  const depositAmount = BigInt(chain.buyIn) * 2n;
  assert.ok(await wallet() >= depositAmount, 'Not enough TRASH in the wallet');
  const casinoBefore = await casino();
  const deposit = await tx(tokenId, 'ft_transfer_call', { receiver_id: casinoId, amount: depositAmount.toString(), msg: '{"type":"deposit"}' }, 1n);
  assert.equal(deposit.value, depositAmount.toString(), 'Casino refused the deposit');
  assert.equal(await casino(), casinoBefore + depositAmount);
  console.log(`deposit: ${fmt(depositAmount)} into the casino (tx ${deposit.hash})`);

  // 3. NEP-413 login. Forged signatures and reused nonces are rejected.
  const challenge = (await post('/api/auth/nonce')).body;
  const signed = await signMessage({ signerAccount: player, payload: {
    message: challenge.message, recipient: challenge.recipient, nonce: Buffer.from(challenge.nonce, 'base64') } });
  const credentials = { accountId: player.accountId, publicKey: signed.publicKey.toString(),
    signature: Buffer.from(signed.signature).toString('base64'), nonce: challenge.nonce };
  const forgedChallenge = (await post('/api/auth/nonce')).body;
  const forged = await post('/api/auth/verify', { ...credentials, nonce: forgedChallenge.nonce });
  assert.equal(forged.status, 401, 'A signature over a different nonce must fail');
  const login = await post('/api/auth/verify', credentials);
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal((await post('/api/auth/verify', credentials)).status, 401, 'A nonce is single use');
  const sessionToken = login.body.sessionToken;
  console.log(`login: NEP-413 verified ${login.body.accountId}`);

  // 4. Paid Liar's Dice against Don. The server opens the game on-chain; the buy-in
  //    comes from the casino balance with no player signature.
  await peer.wait((m) => m.type === 'CONNECTED');
  peer.send('ROOM_CREATE', { displayName: 'Reviewer', avatar: 'CAT', game: 'LIARS_DICE', agents: 1, paid: true, sessionToken });
  const session = await peer.wait((m) => m.type === 'ROOM_SESSION');
  peer.send('ROOM_READY', { roomId: session.roomId, ready: true });
  await peer.wait((m) => m.type === 'ROOM_STATE' && m.payload.participants[0].ready);
  peer.send('ROOM_START', { roomId: session.roomId });
  await peer.wait((m) => m.type === 'GAME_STATE', 60000);
  const gameId = peer.latest('ROOM_STATE').economy.gameId;
  const opened = await view(casinoId, 'get_game_status', { game_id: gameId });
  assert.deepEqual(opened.seats.map((s) => [s.is_agent, s.deposited]), [[false, true], [true, true]]);
  assert.equal(opened.seats[0].account_id, player.accountId);
  assert.equal(await casino(), casinoBefore + depositAmount - BigInt(chain.buyIn), 'buy-in taken from the casino balance');
  console.log(`liars dice: game ${gameId} funded on-chain without a player signature; match started`);

  // 5. Play: bid (1,1) on an empty round, otherwise call bluff.
  let sentRevision = -1;
  const end = Date.now() + 300000;
  while (Date.now() < end && !peer.latest('GAME_RESULT')) {
    const state = peer.latest('GAME_STATE').publicState;
    if (state.phase === 'IN_PROGRESS' && state.currentPlayerId === session.playerId && state.revision !== sentRevision
      && Date.now() >= state.resumeAtEpochMillis + 30) {
      sentRevision = state.revision;
      const payload = { matchId: state.matchId, expectedRevision: state.revision };
      peer.send(state.lastBid ? 'CALL_BLUFF' : 'PLAYER_BID', state.lastBid ? payload : { ...payload, bid: { quantity: 1, face: 1 } });
    }
    if (peer.failure) throw peer.failure;
    await delay(30);
  }
  const result = await peer.wait((m) => m.type === 'GAME_RESULT' && m.payload.settlement !== 'PENDING', 120000);
  assert.equal(result.settlement, 'CONFIRMED', 'Settlement was not confirmed');
  const economy = peer.latest('ROOM_STATE').economy;
  const mine = BigInt(economy.payouts.find((p) => p.playerId === session.playerId)?.amount ?? '0');
  console.log(`settlement: you got ${fmt(mine)} of the pot (tx ${economy.settlementTxHash})`);
  assert.equal((await view(casinoId, 'get_game_status', { game_id: gameId })).state, 'SETTLED');
  assert.equal(await casino(), casinoBefore + depositAmount - BigInt(chain.buyIn) + mine, 'Casino balance after settlement');

  // 6. Paid Blackjack, 1 TRASH per hand: every hand is its own on-chain game, no signatures.
  peer.send('ROOM_LEAVE', { roomId: session.roomId });
  await peer.wait((m) => m.type === 'ROOM_LEFT');
  peer.send('ROOM_CREATE', { displayName: 'Reviewer', avatar: 'CAT', game: 'BLACKJACK', agents: 0, paid: true, betTrash: 1, sessionToken });
  const bj = await peer.wait((m) => m.type === 'ROOM_SESSION' && m.payload.roomId !== session.roomId);
  peer.send('ROOM_READY', { roomId: bj.roomId, ready: true });
  await peer.wait((m) => m.type === 'ROOM_STATE' && m.payload.roomId === bj.roomId && m.payload.participants[0].ready);
  peer.send('ROOM_START', { roomId: bj.roomId });
  const confirmed = new Set();
  let stood = '';
  const bjEnd = Date.now() + 300000;
  while (Date.now() < bjEnd && confirmed.size < 2) {
    const room = peer.latest('ROOM_STATE');
    if (room?.economy?.settlement === 'CONFIRMED' && room.economy.settlementTxHash) confirmed.add(room.economy.settlementTxHash);
    if (room?.economy?.funding === 'FAILED') throw new Error('Blackjack funding failed: ' + room.economy.message);
    const state = peer.latest('BLACKJACK_STATE');
    const key = state && `${state.hand}:${state.revision}`;
    if (state?.currentPlayerId === bj.playerId && key !== stood) {
      stood = key;
      peer.send('BLACKJACK_STAND', { matchId: state.matchId, expectedRevision: state.revision });
    }
    if (peer.failure) throw peer.failure;
    await delay(50);
  }
  assert.ok(confirmed.size >= 2, 'two Blackjack hands were paid out on-chain');
  console.log(`blackjack: ${confirmed.size} hands settled on-chain (${[...confirmed].join(', ')})`);
  peer.send('ROOM_LEAVE', { roomId: bj.roomId });
  await delay(3000); // Leaving refunds the open next hand.

  // 7. The casino ledger matches its token balance.
  const totals = await view(casinoId, 'get_totals', {});
  assert.equal(BigInt(totals.total), BigInt(await view(tokenId, 'ft_balance_of', { account_id: casinoId })), 'Casino ledger matches its token balance');

  // 8. Withdraw everything back to the wallet.
  const walletBefore = await wallet();
  const withdrawAmount = await casino();
  const withdrawal = await tx(casinoId, 'withdraw', { amount: withdrawAmount.toString() }, 1n, 50n);
  assert.equal(withdrawal.value, true, 'withdraw returned false');
  assert.equal(await casino(), 0n);
  assert.equal(await wallet(), walletBefore + withdrawAmount);
  console.log(`withdraw: ${fmt(withdrawAmount)} back to the wallet (tx ${withdrawal.hash})`);
  console.log('PASS: faucet, deposit, NEP-413 login, paid Liar\'s Dice and Blackjack without play signatures, confirmed settlements, withdrawal.');
} finally {
  peer.close();
}
