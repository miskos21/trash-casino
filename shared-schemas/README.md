# API contracts v1

`api.schema.json` is the source of truth (JSON Schema Draft 2020-12). Every object
rejects unknown fields. TypeScript declarations in `generated/api.d.ts` are
generated and checked during the root build. Java packages this exact schema
and validates every inbound WebSocket message against `ClientMessage`.

```bash
npm run schemas:generate # after changing the JSON schema
npm run schemas:check    # fails if generated declarations are stale
npm test -w shared-schemas
```

The schema file's root validates WebSocket messages. REST and AI definitions are
addressable as `#/$defs/HealthResponse`, `#/$defs/AgentAction`, etc. TS generation
includes those definitions too. `ApiContract` in generated declarations is the
union of all definitions, not a runtime validator.

## WebSocket

Path: `/ws`, raw JSON text, no STOMP. Each message has required fields:

```json
{"protocolVersion":1,"type":"PING","requestId":"check-1","payload":{}}
```

Implemented: server sends `CONNECTED`; client sends `PING`; server replies `PONG`
with the same request ID. Invalid messages receive `ERROR/INVALID_MESSAGE` with
null request ID. All non-PING commands require a non-null request ID. Exact
duplicates are suppressed within a bounded socket cache. Gameplay commands
also require `expectedRevision` to reject delayed/replayed turns.

Implemented client commands: `ROOM_CREATE`, `ROOM_JOIN`, `ROOM_READY`, `ROOM_START`,
`PLAYER_BID`, `CALL_BLUFF`, `PLAYER_RECONNECT`, `ROOM_LEAVE`. `PLAYER_CHAT` remains
reserved and returns `NOT_IMPLEMENTED`.

Implemented events: `ROOM_SESSION`, `ROOM_STATE`, `GAME_START`, `GAME_STATE`,
`DICE_REVEAL`, `GAME_RESULT`. Turn identity and timing are carried by `GAME_STATE`.
`TURN`, `NPC_CHAT`, `AI_ACTION`, and `PLAYER_DISCONNECT` remain reserved.
`GAME_STATE` is recipient-specific (`ownDice` plus public state). Never broadcast
one recipient's complete snapshot to a room. `AI_ACTION` carries only public
action metadata, not the LLM's private input or full proposal. Reconnect requires
the private `resumeToken` from `ROOM_SESSION`, never just a room or player ID.
`ROOM_SESSION` is sent only to that seat; tokens must never enter room snapshots,
LLM prompts, chat, or logs. Guest sessions are not wallet ownership proofs.
`GAME_RESULT.settlement` is always `NOT_STARTED` in the free-play slice.

`PublicGameState.history` contains up to 60 accepted public `PublicGameEvent`
entries, including claims, bluff calls, round results, round starts, and the
winner. `cause` distinguishes a player command, a rule-based NPC move, and a
timeout. No die arrays, credentials, or private player views are allowed in an
event. IDs are match-scoped and the history resets on rematch. The history field
is optional for compatibility with older snapshots; the current server sends it.

## REST

| Method / path | Response definition | Status |
|---|---|---|
| `GET /api/health` | `HealthResponse` | Implemented |
| `GET /api/profile` | `ProfileResponse` | Planned; requires wallet auth |
| `GET /api/wallet/balance` | `BalanceResponse` | Planned |
| `GET /api/wallet/transactions` | `TransactionsResponse` | Planned |
| `POST /api/agents/{id}/chat` | `ChatResponse` (body `ChatRequest`) | Planned |
| `POST /api/agents/{id}/offers` | `OfferResponse` (body `OfferRequest`) | Planned |
| `GET /api/agents/{id}/offers/{offerId}` | `OfferResponse` | Planned |
| `GET /api/games/{matchId}` | `PlayerGameState` | Planned; recipient scoped |
| `GET /api/hall-of-shame` | `HallOfShameResponse` | Planned |

Unimplemented REST endpoints currently return Spring's 404; there are no dummy
success responses. `ApiError` is the future REST error shape as well as the
implemented WebSocket error payload. Shop and treasury schemas come with P1.

## Context validation

Schemas enforce shape, not game legality, ownership, or transaction finality.
The engine validates contextual bid bounds and turns. Future agent validation
must require a bid for `BID`, enforce action-specific field combinations,
permissions, valid agreement states, and spending bounds. Non-bid proposals use
`bid: null`; all schema fields remain required. `TokenAmount` is an unsigned
decimal string of at most 39 digits, with u128 maximum and budget checks required
in the consuming service. `SUCCEEDED` and `CONFIRMED` must only be emitted after
final successful on-chain execution.
