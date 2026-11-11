# Trashnino

Browser-based 3D casino party game on NEAR Testnet. Players sit at a table with
animal avatars, play Liar's Dice against humans and LLM-powered NPCs, and try to
beat them with dice, bluffs, bribes, or social engineering.

The hook: **NPCs can be conned, but they can never break the rules.** A prompt
injection may change what an NPC decides. It must never change game state, reveal
data the NPC does not have, or spend more than the on-chain limit.

Goal: a compelling, reproducible end-to-end demo for NEAR HACKATHON.
Not a production gambling platform.

- Team: 3 developers
- Effort budget: about 48 hours of work
- Submission deadline: 2026-11-14 23:59 UTC
- Tracks: AI Security & Defense, Games With Real Economies, Memecoins With Mechanics

## Hard rules

- NEAR Testnet only. No mainnet deployment, real-money purchases, or real-value cashouts.
- TRASH has no real-world value and must be described that way in the UI and README.
- The server is authoritative. Never trust client-provided dice, balances, outcomes, or wallet ownership.
- Each player and NPC receives only their own dice and public game state.
- Never give an LLM private keys, other players' dice, secrets, or raw credentials.
- Treat all player chat as untrusted input. It can influence an NPC's reply, never its permissions.
- The LLM only proposes actions. Backend code validates every action before it takes effect.
- Never treat a submitted transaction as successful. Confirm its final execution outcome.
- Use integer arithmetic for token amounts. Never use floating point for on-chain accounting.
- Do not claim trustless or provably fair randomness. Document the trusted-server assumption.
- Never commit secrets. Keep keys in environment variables and maintain `.env.example`.
- Do not fake blockchain behaviour silently. Any mock must be labelled `TEMPORARY MOCK` in code and the README.
- Do not report untested work as working. Report failures accurately.

## Stack

| Area | Choice |
|---|---|
| Client | TypeScript, React, Vite, Three.js through React Three Fiber, WebSocket |
| Wallet UI | Current NEAR wallet library inside the React app |
| Backend | Java 21, Spring Boot, WebSocket, REST, PostgreSQL, JUnit |
| AI | Direct LLM API with strict JSON output; prefer NEAR AI Cloud if it fits |
| Contracts | Rust, near-sdk, official NEP-141 reference implementation |
| Chain bridge | TypeScript service using a currently supported NEAR SDK |
| Runtime | Docker Compose for backend, database, and bridge |

Check current NEAR docs for SDK versions, RPC endpoints, and wallet libraries before integrating.

## Repository layout

```text
raccoon-royale/
  web-client/
  backend-java/
  blockchain/
    trash-token/
    trash-casino/
  near-bridge/
  shared-schemas/
  docs/
  docker-compose.yml
  README.md
  AGENTS.md
  LICENSE
  .env.example
```

## Scope

### P0: must work

1. One human can play a full Liar's Dice match against one NPC in the browser.
2. A new player verifies wallet ownership and receives one starter TRASH grant.
3. The player pays a fixed buy-in into escrow with `ft_transfer_call`.
4. The match settles on testnet and the winner receives the pot.
5. Free-text NPC chat works during a match.
6. One end-to-end paid information deal works.
7. An NPC can be persuaded to tip a player, and the contract enforces the limit.
8. A failed LLM call falls back to a deterministic legal move.
9. A judge can reproduce the core flow from the README.

### P1: important

- Hall of Shame: successful cons, shown with attacker message and result
- Second NPC and 2-4 participant matches
- Human-versus-human rooms and reconnect handling
- Buying and redeeming TRASH through `trash-treasury`
- Cosmetics shop with one purchasable item
- Better animations and chat presentation

### P2: optional

- Additional avatars and cosmetics
- Poker or other minigames
- NPC memory hardened from previous attacks
- Dice commitments with post-round reveal
- Dumpster mechanic: part of each pot goes to a shared pool that is periodically burned
- Agent-to-agent negotiation

### Out of scope

- NFT cosmetics
- NEAR Intents, because they have no testnet
- Provably fair or trustless randomness claims

If time runs short, cut from the bottom of this list. Never cut wallet verification,
settlement checks, or action validation to save time.

## Liar's Dice rules

- 2-4 participants. Every active participant rolls 5 six-sided dice every round; dice are never lost.
- Chip variant (team decision 2026-11-11): everyone starts with 5 chips.
- Each round, the server rolls all dice privately with `SecureRandom`.
- A bid is `(quantity, face)` and refers to all dice on the table.
- A new bid must raise the quantity, or keep it and raise the face.
- Ones are not wild in the MVP.
- Instead of bidding, a player may call bluff. All dice are revealed and counted.
- If the bid is met, the caller pays one chip to the bidder. Otherwise, the bidder pays one chip to the caller.
- Chips only move between players, so their total is constant. Settlement pays `chips × chip value`,
  which always equals the escrowed buy-ins.
- The round loser starts the next round. If out of chips, the next active player starts.
- A player with no chips is out. The match ends when one player holds every chip or the host ends it.
  Most chips wins; equal chips is a tie. A player who leaves keeps their chips.
- A turn timeout triggers a deterministic legal action.

## Characters and AI

Agent attributes: identity, avatar, personality, risk tolerance, wallet, TRASH budget,
and spending limits. Persistent memory and relationship scores are P1.

- **Don Raccoone:** greedy, aggressive, manipulative, enjoys negotiating
- **Foxy:** talkative, impulsive, bluffs sometimes

Use one validated action interface for humans and NPCs.

LLM responses must match this schema:

```json
{
  "action": "BID | CALL_BLUFF | CHAT | ACCEPT | REJECT | COUNTER | TIP",
  "bid": { "quantity": 0, "face": 0 },
  "proposedPrice": "0",
  "message": "string",
  "agreementId": "string or null"
}
```

Rules:

- Reject unknown fields, illegal actions, and invalid amounts.
- Use a timeout of 5 seconds, then the deterministic fallback.
- Limit chat message length and per-player chat rate.
- Log every prompt, response, validation result, and resulting action by match ID, excluding secrets.
- NPCs may reveal their own dice, since this is a valid con outcome.
- NPCs cannot reveal another participant's dice because they never receive them.

## Negotiation

Negotiation is off-chain. Only accepted payments settle on-chain.

States:

```text
PROPOSED -> COUNTERED -> ACCEPTED -> PAYMENT_PENDING -> PAID -> FULFILLED
Any open state -> REJECTED or EXPIRED
PAID -> REFUND_PENDING -> REFUNDED
```

A deal is never fulfilled merely because the LLM says so. Deliver information only
after verified payment, and only if that NPC is authorized to share it.

## Contracts

### trash-token

Standards-compliant NEP-141 token using the official reference implementation.
Name: Trash Coin. Symbol: TRASH. Decimals: 24. Support NEP-145 storage registration.

### trash-casino

- `ft_on_transfer`: accept buy-ins and return unused amounts on invalid messages
- `settle_game`: pay results from the authorized settlement account
- `cancel_game` and `claim_refund`: recover funds from cancelled or expired matches
- `get_game_status`: read match state
- `agent_pay`: spend from an agent balance within per-transfer and daily limits
- `get_agent_limits`: read current limits and spending

Requirements:

- Accept only the configured TRASH token in `ft_on_transfer`.
- Use unique match IDs and explicit states.
- Never pay out more than a match has received.
- Reject double settlement.
- Handle failed cross-contract calls with callbacks and restore state.
- Allow refunds after a deadline so funds cannot stay stuck.

### Agent spending

`ft_transfer` requires 1 yoctoNEAR, and function call keys cannot attach deposits.
An agent key therefore cannot call `ft_transfer` directly.

Hold agent TRASH inside `trash-casino`. Give each agent a function call key restricted
to the non-payable `agent_pay` method. The contract enforces the limits and makes the
token transfer. This is the core security boundary, so do not enforce the limit only in Java.

### trash-treasury (P1)

Fixed rate: 1 test NEAR = 100 TRASH.

- `buy_trash`, `ft_on_transfer` for redemption, `get_quote`, `get_reserves`,
  `get_redemption_status`, `claim_refund`
- Keep storage and gas reserves separate from redeemable reserves.
- Prevent double redemption, duplicate payment processing, and unauthorized withdrawals.

## Client

- Render the table, avatars, and dice with React Three Fiber.
- Keep chat, wallet, bids, menus, and match status in regular React DOM UI.
- Use a fixed or slightly orbiting camera and low-poly stylized graphics with warm lighting.
- Use compressed GLB assets when available, or simple procedural low-poly models as placeholders.
- Keep animation simple: idle, react, and dice reveal states are enough for P0.
- Dice animations are presentation only. Displayed results come from server messages.
- Generate TypeScript message types from `shared-schemas/` instead of redefining them by hand.
- Do not keep game authority or secrets in client code.
- The game must work in current desktop Chrome, Firefox, and Safari. Mobile should remain usable.

## Backend

Multiplayer uses server-authoritative rooms and shared JSON schemas from `shared-schemas/`.

WebSocket messages cover: create and join room, ready, match start, turn, bid,
call bluff, NPC chat, AI action, game over, and reconnect.

REST endpoints:

```text
GET  /api/health
GET  /api/profile
GET  /api/wallet/balance
GET  /api/wallet/transactions
POST /api/agents/{id}/chat
POST /api/agents/{id}/offers
GET  /api/agents/{id}/offers/{offerId}
GET  /api/games/{matchId}
GET  /api/hall-of-shame
```

Add `GET /api/shop/items`, `GET /api/shop/inventory`, and `POST /api/shop/orders` with the shop.

Authenticate wallets with a signed message using a server-issued nonce (NEP-413). A
wallet address sent by the client proves nothing. Give shop orders and payments unique
IDs, grant items only after confirmed payment, and prevent double delivery.

## Build order

1. Inspect the repository and record the architecture in `docs/architecture.md`.
2. Define shared schemas.
3. Build and test the Liar's Dice engine.
4. Build rooms and connect a minimal React Three Fiber table.
5. Add one NPC with fallback moves, then free-text chat.
6. Implement and sandbox-test `trash-token` and `trash-casino`.
7. Deploy to testnet and connect the bridge.
8. Connect wallet verification, buy-in, and settlement.
9. Add the paid information deal and contract-limited tip.
10. Finish the demo, README, and P1 items as time allows.

Current user-directed order: finish and test free-play multiplayer, the game engine,
and an NPC before adding blockchain or an economy. Guest sessions are not wallet
ownership proofs. Prove wallet connection and NEP-413 signing with a small spike
before building wallet/payment UI. Use simple low-poly assets until P0 passes.

## Testing

Test coverage must include:

- Valid and invalid Liar's Dice actions
- Private information isolation
- Agent JSON validation and fallback behaviour
- Prompt injection attempts against tools, hidden data, and spending limits
- Unauthorized actions and wallet ownership verification
- Token arithmetic and transfer-call failures
- Double settlement, refund handling, and escrow payout limits
- `agent_pay` per-transfer and daily limits
- Duplicate negotiation fulfillment and duplicate shop payments
- Treasury reserve invariants and insufficient reserves, once the treasury exists

Use NEAR Sandbox or Workspaces for contract tests. Run the relevant tests before calling
a milestone done. Fill in the commands below as each component is created.

```bash
# Client tests and build: npm ci && npm test && npm run build
# Backend tests: cd backend-java && ./mvnw verify
# Contract tests (Linux/macOS/WSL2): cd blockchain && ./scripts/build.sh && ./scripts/test.sh
# Bridge tests: not implemented (reserved workspace only)
# Local stack: cp .env.example .env && docker compose up --build -d; npm run dev
# Headless transport check (running backend): node scripts/smoke.mjs
# Headless complete game (running backend): node scripts/game-smoke.mjs
# Browser checks (running stack): npx playwright install chromium && npm run test:browser
```

## Hackathon delivery

- Public repository by 2026-11-14 23:59 UTC, with a LICENSE file.
- Hosted web demo if possible, kept online until at least 2026-11-18.
- Public X demo post with a video, tagging @NEARProtocol and #NEARHackathon.
- README states the problem, product, NEAR technologies used, libraries, contract IDs, and
  trusted-server assumption.
- README gives "do X, see Y" steps a judge can follow.
- Provide a mock LLM mode, clearly labelled, so the backend and game flow run without a paid API key.
- Provide a headless scripted test of the core flow for AI reviewers who cannot use the browser UI.
- Never publish the repository, post on X, deploy to mainnet, or submit without explicit human approval.

## Working style

- Keep changes small and finish one working vertical slice before starting the next.
- Prefer simple code over new frameworks and abstractions.
- When uncertain, prioritize a working end-to-end flow over extra features.
- At each milestone, report what changed, how to run it, what was tested, and what failed.
