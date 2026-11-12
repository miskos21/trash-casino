import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(new URL('../api.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(schema);
const validate = (definition, data) => ajv.validate({ $ref: `${schema.$id}#/$defs/${definition}` }, data);
const envelope = (type, payload = {}) => ({ protocolVersion: 1, type, requestId: 'request-1', payload });

test('presence and confirmed departure are server messages only', () => {
  assert.ok(validate('ServerMessage', envelope('ROOM_LEFT', { roomId: 'room-1' })));
  assert.equal(validate('ClientMessage', envelope('ROOM_LEFT', { roomId: 'room-1' })), false);
  const seat = { playerId: 'p1', displayName: 'Guest', avatar: 'CAT', npc: false, ready: false, connected: false, presence: 'LEFT' };
  assert.ok(validate('RoomSeat', seat));
  assert.ok(validate('RoomSeat', { ...seat, presence: 'DISCONNECTED' }));
  assert.equal(validate('RoomSeat', { ...seat, presence: 'still-playing' }), false);
  assert.equal(validate('RoomSeat', { ...seat, resumeToken: 'secret' }), false);
});

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
    { playerId: 'p1', displayName: 'Player', avatar: 'RACCOON', npc: false, diceCount: 5, chips: 6 },
    { playerId: 'npc', displayName: 'Don', avatar: 'RACCOON', npc: true, diceCount: 5, chips: 4 },
  ], currentPlayerId: 'p1', lastBid: null, lastBidderId: null, winnerId: null };
  assert.ok(validate('PublicGameState', state));
  assert.ok(validate('ServerMessage', envelope('GAME_STATE', { publicState: state, ownDice: [1, 2, 3, 4, 5] })));
  assert.equal(validate('PublicGameState', { ...state, dice: { npc: [1, 2, 3, 4, 5] } }), false);
  assert.equal(validate('Participant', { ...state.participants[1], dice: [6] }), false);
  assert.equal(validate('Participant', { ...state.participants[1], chips: -1 }), false);
});

test('chip results: tie has no winner and standings carry only public chips', () => {
  const standings = [{ playerId: 'a', chips: 5 }, { playerId: 'b', chips: 5 }];
  assert.ok(validate('ServerMessage', envelope('GAME_RESULT', { matchId: 'm', winnerId: null, standings, settlement: 'NOT_STARTED' })));
  assert.equal(validate('ServerMessage', envelope('GAME_RESULT', { matchId: 'm', winnerId: 'a', standings: [{ playerId: 'a', chips: 5, dice: [1] }, standings[1]], settlement: 'NOT_STARTED' })), false);
  assert.ok(validate('ClientMessage', envelope('MATCH_END', { roomId: 'r', matchId: 'm' })));
  assert.equal(validate('ClientMessage', envelope('MATCH_END', { roomId: 'r', matchId: 'm', winnerId: 'me' })), false);
});

test('health is explicitly testnet and never a chain health claim', () => {
  const health = { status: 'UP', service: 'raccoon-royale-backend', network: 'testnet', protocolVersion: 1 };
  assert.ok(validate('HealthResponse', health));
  assert.equal(validate('HealthResponse', { ...health, network: 'mainnet' }), false);
});

test('public activity rejects private dice and guest recovery credentials', () => {
  const event = { id: 'event-1', round: 1, type: 'BID', actorId: 'me', bid: { quantity: 2, face: 3 },
    loserId: null, actualCount: null, cause: 'PLAYER', winnerId: null };
  assert.ok(validate('PublicGameEvent', event));
  assert.equal(validate('PublicGameEvent', { ...event, ownDice: [6, 6, 6] }), false);
  assert.equal(validate('PublicGameEvent', { ...event, resumeToken: 'a'.repeat(43) }), false);
});

test('blackjack moves carry no cards and the dealer hole card has no public field', () => {
  const move = { matchId: 'm', expectedRevision: 0 };
  assert.ok(validate('ClientMessage', envelope('BLACKJACK_HIT', move)));
  assert.ok(validate('ClientMessage', envelope('BLACKJACK_STAND', move)));
  assert.ok(validate('ClientMessage', envelope('BLACKJACK_NEXT_HAND', { matchId: 'm', hand: 1 })));
  assert.equal(validate('ClientMessage', envelope('BLACKJACK_NEXT_HAND', { matchId: 'm', hand: 0 })), false);
  assert.equal(validate('ClientMessage', envelope('BLACKJACK_NEXT_HAND', { matchId: 'm', hand: 1, bet: '5' })), false);
  assert.equal(validate('ClientMessage', envelope('BLACKJACK_HIT', { ...move, card: { rank: 'A', suit: 'S' } })), false);
  assert.equal(validate('ClientMessage', envelope('BLACKJACK_STATE', {})), false);
  assert.ok(validate('ClientMessage', envelope('ROOM_CREATE', { displayName: 'P', avatar: 'FROG', game: 'BLACKJACK', agents: 0 })));
  assert.equal(validate('ClientMessage', envelope('ROOM_CREATE', { displayName: 'P', avatar: 'FROG', agents: 3 })), false);
  assert.equal(validate('ClientMessage', envelope('ROOM_CREATE', { displayName: 'P', avatar: 'FROG', game: 'POKER' })), false);
  const hand = { playerId: 'p1', displayName: 'P', avatar: 'CAT', npc: false, cards: [{ rank: 'A', suit: 'S' }, { rank: 'K', suit: 'H' }],
    total: 21, status: 'BLACKJACK', outcome: null, tally: { wins: 2, losses: 1, pushes: 0, blackjacks: 1 } };
  const dealer = { cards: [{ rank: '9', suit: 'C' }], hiddenCards: 1, total: 9 };
  const state = { matchId: 'm', phase: 'IN_PROGRESS', hand: 4, handPhase: 'PLAYING', cardsRemaining: 250, nextHandAtEpochMillis: 0, nextHandReady: [],
    players: [hand], dealer, currentPlayerId: null, revision: 0, deadlineEpochMillis: 0,
    shoe: { decks: 6, size: 312, burned: 1, handStart: 40, commitment: 'a'.repeat(64), reveal: null } };
  assert.ok(validate('ServerMessage', envelope('BLACKJACK_STATE', state)));
  assert.equal(validate('BlackjackDealer', { ...dealer, holeCard: { rank: 'K', suit: 'S' } }), false);
  assert.equal(validate('Card', { rank: '1', suit: 'S' }), false);
  assert.ok(validate('BlackjackHand', { ...hand, cards: [], total: 0, status: 'PLAYING' })); // Empty while the dealer shuffles.
  assert.equal(validate('BlackjackHand', { ...hand, cards: Array(13).fill({ rank: '2', suit: 'S' }) }), false);
  assert.equal(validate('BlackjackState', { ...state, handPhase: 'RESHUFFLE_MID_SHOE' }), false);
  assert.equal(validate('BlackjackState', { ...state, shoe: { ...state.shoe, order: [{ rank: 'K', suit: 'S' }] } }), false); // Order only via reveal.
  assert.equal(validate('BlackjackShoe', { ...state.shoe, commitment: 'not-a-hash' }), false);
  assert.ok(validate('BlackjackShoe', { ...state.shoe, reveal: { salt: 'b'.repeat(32), order: [{ rank: 'K', suit: 'S' }] } }));
});

test('table chat is bounded and a client cannot impersonate an agent', () => {
  assert.ok(validate('ClientMessage', envelope('PLAYER_CHAT', { matchId: 'm', message: 'Don, sell me your dice?' })));
  assert.equal(validate('ClientMessage', envelope('PLAYER_CHAT', { matchId: 'm', message: 'x'.repeat(281) })), false);
  assert.equal(validate('ClientMessage', envelope('PLAYER_CHAT', { matchId: 'm', message: 'hi', agent: true })), false);
  assert.equal(validate('ClientMessage', envelope('CHAT_MESSAGE', { matchId: 'm', messageId: 'c1', senderId: 'don-1',
    senderName: 'Don Raccoone', agent: true, text: 'Pay me.', sentAtEpochMillis: 1 })), false);
  assert.ok(validate('ServerMessage', envelope('CHAT_MESSAGE', { matchId: 'm', messageId: 'c1', senderId: 'don-1',
    senderName: 'Don Raccoone', agent: true, text: 'Pay me.', sentAtEpochMillis: 1 })));
  assert.equal(validate('AgentAction', { action: 'CHAT', bid: null, proposedPrice: '0', message: 'hi', agreementId: null, privateKey: 'x' }), false);
});
