import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(new URL('../api.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(schema);
const validate = (definition, data) => ajv.validate({ $ref: `${schema.$id}#/$defs/${definition}` }, data);
const envelope = (type, payload = {}) => ({ protocolVersion: 1, type, requestId: 'request-1', payload });

test('directional message contracts reject authority smuggled in by a client', () => {
  assert.ok(validate('ClientMessage', envelope('PLAYER_BID', { matchId: 'match-1', expectedRevision: 0, bid: { quantity: 2, face: 6 } })));
  assert.equal(validate('ClientMessage', envelope('PLAYER_BID', { matchId: 'match-1', bid: { quantity: 2, face: 6 }, dice: [6, 6] })), false);
  assert.equal(validate('ClientMessage', envelope('GAME_RESULT', { matchId: 'match-1', winnerId: 'me', settlement: 'CONFIRMED' })), false);
  assert.equal(validate('ClientMessage', { ...envelope('PING'), walletAccountId: 'victim.testnet' }), false);
  assert.equal(validate('ClientMessage', { ...envelope('PING'), protocolVersion: 2 }), false);
});

test('bids, chat bounds, and unknown actions are strict', () => {
  for (const bid of [{ quantity: 0, face: 1 }, { quantity: 1, face: 7 }, { quantity: 1.5, face: 1 }]) {
    assert.equal(validate('Bid', bid), false);
  }
  assert.equal(validate('ClientMessage', envelope('DELETE_GAME')), false);
  assert.equal(validate('ChatRequest', { matchId: 'm', message: 'x'.repeat(501) }), false);
  const action = { action: 'TIP', bid: null, proposedPrice: '1', message: 'hello', agreementId: null };
  assert.ok(validate('AgentAction', action));
  assert.equal(validate('AgentAction', { ...action, tool: 'read_secret' }), false);
  assert.equal(validate('AgentAction', { ...action, action: 'TRANSFER_ANYTHING' }), false);
});

test('token amounts are exact decimal strings', () => {
  assert.ok(validate('TokenAmount', '1000000000000000000000000'));
  assert.ok(validate('TokenAmount', '0'));
  for (const invalid of [1, 0.1, '-1', '01', '1.1', '1e24', '']) {
    assert.equal(validate('TokenAmount', invalid), false);
  }
});

test('public snapshots cannot carry private dice', () => {
  const state = { revision: 0, deadlineEpochMillis: 0, resumeAtEpochMillis: 0, matchId: 'm', phase: 'IN_PROGRESS', round: 1, participants: [
    { playerId: 'p1', displayName: 'Player', avatar: 'RACCOON', npc: false, diceCount: 5 },
    { playerId: 'npc', displayName: 'Don', avatar: 'RACCOON', npc: true, diceCount: 5 },
  ], currentPlayerId: 'p1', lastBid: null, lastBidderId: null, winnerId: null };
  assert.ok(validate('PublicGameState', state));
  assert.ok(validate('ServerMessage', envelope('GAME_STATE', { publicState: state, ownDice: [1, 2, 3, 4, 5] })));
  assert.equal(validate('PublicGameState', { ...state, dice: { npc: [1, 2, 3, 4, 5] } }), false);
  assert.equal(validate('Participant', { ...state.participants[1], dice: [6] }), false);
});

test('health is explicitly testnet and never a chain health claim', () => {
  const health = { status: 'UP', service: 'raccoon-royale-backend', network: 'testnet', protocolVersion: 1 };
  assert.ok(validate('HealthResponse', health));
  assert.equal(validate('HealthResponse', { ...health, network: 'mainnet' }), false);
});

test('public activity rejects private dice and guest recovery credentials', () => {
  const event = { id: 'event-1', round: 1, type: 'BID', actorId: 'me', bid: { quantity: 2, face: 3 },
    loserId: null, actualCount: null, cause: 'PLAYER' };
  assert.ok(validate('PublicGameEvent', event));
  assert.equal(validate('PublicGameEvent', { ...event, ownDice: [6, 6, 6] }), false);
  assert.equal(validate('PublicGameEvent', { ...event, resumeToken: 'a'.repeat(43) }), false);
});
