import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

// Real Java server + WebSockets. No wallets, payment mocks, or LLM calls.
const schema = JSON.parse(await readFile(new URL('../shared-schemas/api.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(schema);
const valid = ajv.compile({ $ref: schema.$id + '#/$defs/ServerMessage' });
const base = new URL(process.env.BACKEND_URL ?? 'http://localhost:8080');
base.pathname = '/ws'; base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const peers = [];
let sequence = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Peer {
  messages = [];
  failure = null;
  constructor() {
    peers.push(this);
    this.ws = new WebSocket(base);
    this.heartbeat = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) this.send('PING', {});
    }, 10000);
    this.ws.onclose = () => clearInterval(this.heartbeat);
    this.ws.onmessage = ({ data }) => {
      try {
        const value = JSON.parse(data);
        assert.ok(valid(value), 'Server message violates shared schema');
        this.messages.push(value);
      } catch (error) { this.failure = error; }
    };
    this.ws.onerror = () => { this.failure = new Error('WebSocket failed'); };
  }
  async wait(test, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.failure) throw this.failure;
      const found = this.messages.find(test);
      if (found) return found.payload;
      await delay(15);
    }
    throw new Error('Timed out awaiting server event');
  }
  latest(type) { return this.messages.findLast((m) => m.type === type)?.payload; }
  async open() { await this.wait((m) => m.type === 'CONNECTED'); return this; }
  send(type, payload, requestId = 'headless-' + ++sequence) {
    this.ws.send(JSON.stringify({ protocolVersion: 1, type, requestId, payload }));
    return requestId;
  }
  async command(type, payload, responseType = 'ROOM_STATE') {
    const from = this.messages.length;
    this.send(type, payload);
    return this.wait((m) => this.messages.indexOf(m) >= from && m.type === responseType);
  }
}
try {
  const host = await new Peer().open();
  await host.command('ROOM_CREATE', { displayName: 'Reviewer', avatar: 'CAT' }, 'ROOM_SESSION');
  const roomId = host.latest('ROOM_SESSION').roomId;
  const roomCode = host.latest('ROOM_SESSION').roomCode;
  await host.wait((m) => m.type === 'ROOM_STATE');
  const guest = await new Peer().open();
  await guest.command('ROOM_JOIN', { displayName: 'Guest', avatar: 'FROG', roomCode }, 'ROOM_SESSION');
  await guest.wait((m) => m.type === 'ROOM_STATE');
  const attacker = await new Peer().open();
  const rejected = await attacker.command('PLAYER_RECONNECT', { roomId, resumeToken: 'a'.repeat(43) }, 'ERROR');
  assert.equal(rejected.code, 'INVALID_SESSION');
  await host.command('ROOM_READY', { roomId, ready: true });
  await guest.command('ROOM_READY', { roomId, ready: true });
  await host.command('ROOM_START', { roomId }, 'GAME_STATE');
  await guest.wait((m) => m.type === 'GAME_STATE');

  // A room code is public; the resume capability is issued privately to each socket.
  assert.equal(host.latest('GAME_STATE').ownDice.length, 5);
  assert.equal(guest.latest('GAME_STATE').ownDice.length, 5);
  assert.equal(host.latest('GAME_STATE').publicState.participants.length, 3);
  for (const seat of host.latest('GAME_STATE').publicState.participants) assert.equal('dice' in seat, false);
  assert.equal(JSON.stringify(guest.latest('ROOM_STATE')).includes(host.latest('ROOM_SESSION').resumeToken), false);
  const state = host.latest('GAME_STATE').publicState;
  const illegal = await guest.command('PLAYER_BID', { matchId: state.matchId, expectedRevision: state.revision, bid: { quantity: 1, face: 1 } }, 'ERROR');
  assert.equal(illegal.code, 'ILLEGAL_ACTION');
  const noSeat = await attacker.command('PLAYER_BID', { matchId: state.matchId, expectedRevision: state.revision, bid: { quantity: 1, face: 1 } }, 'ERROR');
  assert.equal(noSeat.code, 'INVALID_SESSION');

  // Reconnect recovers exactly the same player and private dice.
  const recovered = await new Peer().open();
  await recovered.command('PLAYER_RECONNECT', { roomId, resumeToken: host.latest('ROOM_SESSION').resumeToken }, 'ROOM_SESSION');
  await recovered.wait((m) => m.type === 'GAME_STATE');
  assert.equal(recovered.latest('ROOM_SESSION').playerId, host.latest('ROOM_SESSION').playerId);
  assert.deepEqual(recovered.latest('GAME_STATE').ownDice, host.latest('GAME_STATE').ownDice);
  const humans = [recovered, guest];
  let sentRevision = -1;
  const end = Date.now() + 180000;
  // Chip rules: nobody loses dice; a lost challenge moves one chip. Play a few challenges, then the host ends it.
  const results = () => recovered.latest('GAME_STATE').publicState.history.filter((e) => e.type === 'ROUND_RESULT').length;
  while (Date.now() < end) {
    const current = recovered.latest('GAME_STATE').publicState;
    if (current.phase === 'FINISHED') break;
    if (results() >= 3 && Date.now() >= current.resumeAtEpochMillis) {
      for (const seat of current.participants) if (seat.chips > 0) assert.equal(seat.diceCount, 5, 'Dice are never lost');
      assert.equal(current.participants.reduce((sum, seat) => sum + seat.chips, 0), 15, 'Chips are conserved');
      const refused = await guest.command('MATCH_END', { roomId, matchId: current.matchId }, 'ERROR');
      assert.equal(refused.code, 'NOT_HOST');
      recovered.send('MATCH_END', { roomId, matchId: current.matchId });
      await recovered.wait((m) => m.type === 'GAME_RESULT');
      break;
    }
    if (current.revision !== sentRevision && Date.now() >= current.resumeAtEpochMillis + 30) {
      const actor = humans.find((p) => p.latest('ROOM_SESSION').playerId === current.currentPlayerId);
      if (actor) {
        sentRevision = current.revision;
        const payload = { matchId: current.matchId, expectedRevision: current.revision };
        actor.send(current.lastBid ? 'CALL_BLUFF' : 'PLAYER_BID',
          current.lastBid ? payload : { ...payload, bid: { quantity: 1, face: 1 } });
      }
    }
    for (const p of humans) if (p.failure) throw p.failure;
    await delay(25);
  }
  const finished = recovered.latest('GAME_STATE').publicState;
  assert.equal(finished.phase, 'FINISHED', 'Match did not finish');
  const result = await recovered.wait((m) => m.type === 'GAME_RESULT');
  assert.equal(result.settlement, 'NOT_STARTED');
  assert.equal(result.standings.reduce((sum, seat) => sum + seat.chips, 0), 15, 'Final chips equal the buy-ins');
  const best = Math.max(...result.standings.map((seat) => seat.chips));
  const leaders = result.standings.filter((seat) => seat.chips === best);
  assert.equal(result.winnerId, leaders.length === 1 ? leaders[0].playerId : null);
  await guest.wait((m) => m.type === 'GAME_RESULT');
  assert.equal(guest.latest('GAME_STATE').publicState.winnerId, finished.winnerId);
  console.log('PASS: two humans + agent played a real chip match ended by the host; chips conserved, dice kept, own-dice isolation, illegal actions and reconnect checked. No payments.');
  // Explicit leave prevents this reviewer script from leaving a room behind.
  recovered.send('ROOM_LEAVE', { roomId });
  guest.send('ROOM_LEAVE', { roomId });
  await delay(100);
} finally {
  for (const peer of peers) { clearInterval(peer.heartbeat); peer.ws.close(); }
}
