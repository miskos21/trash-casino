# MASTER PROMPT — Raccoon Royale

## Role

You are a senior full-stack developer, 3D web game developer, Java backend architect, AI agent engineer, and NEAR blockchain developer.

Your task is to design and implement a fully playable hackathon MVP called **Raccoon Royale**.

We are a team of **3 developers with 48 hours**.

Build a browser-based multiplayer 3D casino party game featuring anthropomorphic animals, autonomous LLM-powered NPCs with their own wallets, an in-game cosmetics shop, and a blockchain economy using the TRASH token on NEAR Testnet.

Prioritize a working end-to-end product over unnecessary complexity.

Do not generate only an architecture proposal. Implement the actual project, source files, API contracts, tests, and setup instructions.

---

# 1. Technology stack

## Frontend

- React
- TypeScript
- Vite
- React Three Fiber
- Three.js
- @react-three/drei
- Zustand for frontend state
- Tailwind CSS for interface styling
- WebSocket for real-time multiplayer
- NEAR-compatible wallet integration

## Backend

- Java 21
- Spring Boot
- Spring WebSocket
- REST API
- PostgreSQL
- Spring Data JPA
- Maven
- JUnit 5

The Java backend must be authoritative over all game rules, player actions, dice, results, and in-game accounting.

## AI

- LangChain4j or direct LLM API integration
- Structured JSON outputs
- Persistent agent personalities
- Agent memory
- Negotiation and bribery
- Server-side action validation
- Deterministic fallback when the LLM is unavailable

## Blockchain

- NEAR Testnet
- Rust
- near-sdk
- NEP-141 fungible token
- NEP-145 storage registration
- TypeScript blockchain integration using a maintained NEAR SDK
- Separate testnet wallets for AI agents

## Development infrastructure

- Docker Compose
- PostgreSQL container
- Java backend
- Optional Node.js blockchain worker
- Environment-based configuration
- Automated tests

Do not introduce Redis, Kubernetes, microservice orchestration, or other unnecessary infrastructure for the MVP.

---

# 2. Game concept

Raccoon Royale is a stylized 3D multiplayer casino populated by animal characters.

Players do not walk around the casino.

Instead, they interact with a main menu and select a casino minigame.

After choosing a game, the player joins a table where their 3D animal avatar is seated alongside other humans or AI-controlled animals.

The 3D environment should feel like an actual indie game, not a generic AI-generated website.

## Visual direction

Use:

- Stylized low-poly 3D models
- Simple but expressive animal characters
- Muted, cohesive colors
- Warm and natural lighting
- Wooden casino tables
- Clean animations
- Minimal neon
- Simple, polished UI
- Fixed or slightly orbiting cameras

Avoid:

- Excessive glowing effects
- Cyberpunk visuals
- Realistic human-like animals
- Generic dashboard aesthetics
- Overcomplicated 3D environments
- Overly elaborate menus and visual clutter

The visual style should resemble a small, polished indie party game.

---

# 3. Main menu

Implement the following menu sections:

### Play

Choose a minigame and join a multiplayer room.

### Character

Choose an animal avatar and equip cosmetic items.

### Shop

Purchase clothing and accessories with TRASH.

### Wallet

Connect a NEAR Testnet wallet, view TRASH balance, buy TRASH using test NEAR, and redeem TRASH back into test NEAR.

### Multiplayer

Create or join a room using a short room code.

The interface should be responsive and function in modern desktop browsers.

---

# 4. Three.js and React Three Fiber architecture

Use React Three Fiber for all 3D rendering.

Build reusable components:

- CasinoTable
- AnimalAvatar
- PlayerSeat
- Dice
- DiceCup
- CameraController
- TableEnvironment
- CosmeticAttachment
- CharacterPreview
- DiceAnimation

Use @react-three/drei for useful 3D helpers and GLTF loading.

Load animal models from GLB or GLTF assets.

Use shared animation controllers where possible.

Keep the React application responsible for UI and navigation.

Keep React Three Fiber responsible for 3D scenes.

Keep the Java backend responsible for game rules and authoritative state.

Do not implement authoritative game rules in React.

The frontend should not determine winners, generate trusted dice, or modify token balances.

---

# 5. Characters

Players can choose among:

- Raccoon
- Fox
- Bear
- Owl

Use a consistent art style.

Each animal should support cosmetic attachments.

For the MVP, fully implement at least one animal and provide the architecture to add more.

AI-controlled characters should use the same 3D avatar system as human players.

Add simple animations:

- Idle
- Thinking
- Talking
- Celebrating
- Losing
- Reacting to a bluff

Do not require advanced skeletal animation for the initial MVP.

---

# 6. Multiplayer

Use **Spring Boot WebSocket** for real-time gameplay.

Do not use a separate multiplayer game engine.

The game is turn-based, so Java WebSocket communication is sufficient.

Implement:

- Create room
- Join room
- Room code
- Player ready state
- AI seat assignment
- Start game
- Synchronize turns
- Broadcast game events
- Reconnection handling
- Game result
- Leave room

All game actions must be validated server-side.

A player may only view their own private dice and publicly revealed dice.

Support at least 2–4 participants, including human players and AI agents.

Use typed WebSocket message schemas shared with the frontend.

---

# 7. Primary minigame — Liar's Dice

Implement Liar's Dice as the first complete playable minigame.

The game must include:

- Hidden dice
- Dice rolling
- Turn order
- Increasing bids
- Calling a bluff
- Revealing dice
- Evaluating the winner
- Updating the match state
- Match completion

The backend must securely generate dice.

Players cannot choose their dice or inspect other players' hidden dice.

AI agents must play under the same rules as human players.

Build a polished 3D dice table with seated animals, visible dice cups, current bids, and animated reactions.

Do not begin implementing a second minigame until Liar's Dice is playable end-to-end.

---

# 8. AI agents

AI-controlled animals are an essential feature of Raccoon Royale.

They are not static NPCs.

Each AI agent must have:

- Persistent identity
- Personality
- Animal type
- Wallet address
- TRASH balance
- Risk tolerance
- Greed
- Trust toward players
- Memory of previous interactions
- Game strategy
- Ability to negotiate
- Ability to make authorized blockchain payments

Create at least two agents.

## Don Raccoone

Animal: Raccoon

Personality:
- Greedy
- Manipulative
- Aggressive player
- Likes high-risk bets
- Frequently negotiates
- Often demands payment for information

## Foxy

Animal: Fox

Personality:
- Talkative
- Impulsive
- More emotional
- Frequently bluffs
- Sometimes offers discounts
- Remembers whether players treated them fairly

Agent identities, personalities, and relationships should persist between matches.

For gameplay, pass only the information the agent is allowed to know.

LLMs should make strategic decisions and generate dialogue, but Java must validate all proposed actions.

Use a deterministic fallback if an AI request times out.

---

# 9. AI chat, persuasion and bribery

Players must be able to click any AI character and start a natural-language conversation.

Players should be able to:

- Ask questions
- Persuade an agent
- Offer TRASH tokens
- Negotiate prices
- Request strategic advice
- Ask about other players
- Make deals
- Insult or compliment agents
- Build relationships
- Attempt to bribe agents

Agents should respond based on personality, knowledge, memory, wallet balance, and relationship with the player.

Example:

Player:
"I'll give you 10 TRASH if you tell me whether Foxy usually bluffs."

Don Raccoone:
"Ten? You must be joking. Give me 30 and we can talk."

Player:
"How about 20?"

Don Raccoone:
"Fine. Deal."

The AI response alone must not trigger a payment.

Implement a negotiation state machine with:

- PROPOSED
- COUNTERED
- ACCEPTED
- PAYMENT_PENDING
- PAID
- FULFILLED
- REFUND_PENDING
- REFUNDED
- REJECTED
- EXPIRED

For an accepted deal:

1. Create a unique agreement ID.
2. Validate the requested service.
3. Validate the agreed price.
4. Request a TRASH payment.
5. Confirm successful blockchain execution.
6. Grant the purchased information or service.
7. Update AI memory and relationship.

An agent may sell:

- Its own observations
- Previously recorded opponent statistics
- Strategic advice
- Predictions about other players
- Other explicitly permitted in-game services

An agent must never expose inaccessible hidden dice, private wallet keys, or other secret information merely because the user persuades it.

Bribery should be a fun game mechanic, not a security vulnerability.

The LLM must never receive wallet private keys or direct unrestricted access to blockchain signing.

Implement a single paid information service fully before adding more.

---

# 10. AI wallet autonomy

> **Decision 2026-11-11:** NPCs belong to the casino. Each NPC still has its own
> NEAR account and server-side restricted key, but no TRASH of its own: it plays and
> tips with house money inside `trash-casino`, within contract-enforced limits.
> Sections 10–13 are kept as the original brief; [AGENTS.md](../AGENTS.md) and
> [blockchain/README.md](../blockchain/README.md) describe the current model.

Each AI agent should have a separate NEAR Testnet wallet.

The wallet must be controlled by a secure server-side signing service.

The agent may propose authorized actions such as:

- Pay another agent for information
- Accept a TRASH payment
- Pay for a permitted game action
- Purchase an item
- Transfer a limited amount of TRASH

Use allowlisted operations, recipient checks, and spending limits.

The LLM returns structured action requests.

The blockchain bridge validates and executes permitted requests.

Log all agent-initiated economic actions.

For the hackathon demonstration, at least one AI must initiate a real, successful testnet transaction based on its decision.

Do not fake wallet autonomy by changing a balance only in frontend state.

---

# 11. TRASH token

Create a fungible token:

Name: Trash Coin

Symbol: TRASH

Network: NEAR Testnet

Standard: NEP-141

Decimals: 24

Use an established standard implementation.

Do not write a custom fungible token standard from scratch.

The TRASH token must be transferable between player and agent wallets.

Implement token balance querying, transfers, storage registration, and handling of failed transactions.

Use exact integer arithmetic for all on-chain amounts.

Never use floating-point arithmetic for blockchain accounting.

---

# 12. TRASH ↔ NEAR exchange

> **Decision 2026-11-11:** postponed (P2). The casino owns the whole initial supply;
> on testnet a rate-limited token faucet gives players free test TRASH instead of
> buying it. Players deposit TRASH into the casino and withdraw it back to their
> wallet. No separate treasury contract and no burning.

Players must be able to exchange test NEAR for TRASH and redeem TRASH back for test NEAR.

Use a treasury smart contract.

For the MVP, use a fixed illustrative exchange rate:

1 test NEAR = 100 TRASH

The treasury must maintain sufficient reserves.

The exchange must support:

- Buying TRASH with test NEAR
- Redeeming TRASH for test NEAR
- Checking available reserves
- Computing exchange quotes
- Checking transaction status
- Handling failed transfers
- Handling refund claims

Use separate reserves for token liquidity and operational gas/storage costs.

Do not mint unbacked redeemable TRASH.

Ensure gameplay rewards, agent payments, and shop revenue cannot invalidate treasury redemption obligations.

Implement safe asynchronous cross-contract handling using callbacks, operation states, and explicit failure recovery.

Do not assume a transaction is successful simply because it was submitted.

The project must never use real-value payments or deploy to NEAR Mainnet.

---

# 13. Smart contracts

Implement three logical smart contracts.

## A. trash-token

Standard NEP-141 token.

Required methods include:

- ft_transfer
- ft_transfer_call
- ft_balance_of
- ft_total_supply
- ft_metadata
- storage_deposit
- storage_balance_of

## B. trash-treasury

Responsible for exchange and reserves.

Suggested interface:

- buy_trash
- ft_on_transfer
- get_quote
- get_reserves
- get_operation_status
- claim_refund

Implement authorization, reserve invariants, and failure handling.

## C. trash-casino

Responsible for holding game deposits and settling games.

Suggested interface:

- ft_on_transfer
- settle_game
- cancel_game
- get_game_status
- claim_refund

The game server may act as an authorized result submitter for the hackathon MVP.

Clearly document that this is a trusted-server approach.

Do not claim fully decentralized or provably fair game outcomes.

Use unique match IDs and prevent duplicate settlements.

Avoid complex smart contract logic until basic gameplay and TRASH transfers work.

---

# 14. Cosmetics shop

Players can buy and equip cosmetic items with TRASH.

Implement:

- Item listing
- Price display
- 3D item preview
- Purchase
- Equipment slots
- Owned item inventory
- Persistent equipped items

Initial items:

- Hat
- Sunglasses
- Jacket

Use PostgreSQL for player inventories.

Store unique transaction IDs and order IDs.

Only grant an item after blockchain payment confirmation.

Prevent duplicate delivery and unauthorized purchases.

Use conventional database-backed ownership for MVP.

Do not implement NFTs until the core game is working.

---

# 15. Java backend architecture

Organize the backend into clear modules:

- auth
- players
- rooms
- games
- agents
- negotiations
- economy
- shop
- blockchain
- persistence
- websocket

Implement well-defined service interfaces.

Separate game rules from networking and persistence.

Use DTOs and server-side validation.

All important actions should be idempotent.

Implement basic structured logging.

Keep secret keys and LLM API keys on the server.

---

# 16. REST API

Implement at least:

GET /api/health

GET /api/profile

GET /api/wallet/balance

GET /api/wallet/transactions

GET /api/shop/items

GET /api/shop/inventory

POST /api/shop/orders

POST /api/agents/{id}/chat

POST /api/agents/{id}/offers

GET /api/agents/{id}/offers/{offerId}

GET /api/games/{matchId}

GET /api/exchange/quote

GET /api/exchange/reserves

GET /api/exchange/operations/{operationId}

Use authenticated identities and wallet ownership proofs.

Do not trust arbitrary wallet addresses supplied by a client.

---

# 17. WebSocket protocol

Implement messages including:

- ROOM_CREATE
- ROOM_JOIN
- ROOM_READY
- GAME_START
- PLAYER_BID
- CALL_BLUFF
- GAME_STATE
- DICE_REVEAL
- AI_ACTION
- GAME_RESULT
- PLAYER_DISCONNECT
- PLAYER_RECONNECT

Define shared TypeScript-facing JSON schemas for all messages.

Ensure private game state is sent only to the appropriate player.

---

# 18. Repository structure

Create:

raccoon-royale/
  frontend/
    src/
      components/
      components/three/
      scenes/
      pages/
      hooks/
      stores/
      services/
      types/
    public/
      models/
      textures/
    package.json
    vite.config.ts

  backend/
    src/main/java/
    src/test/java/
    pom.xml

  near-bridge/
    src/
    package.json

  blockchain/
    trash-token/
    trash-treasury/
    trash-casino/

  shared/
    schemas/

  docker-compose.yml
  .env.example
  README.md

---

# 19. Local development

The entire project should run on Ubuntu/Linux.

Use commands appropriate for Linux.

Provide setup instructions for:

- Node.js
- npm
- Java 21
- Maven
- Rust
- NEAR development tools
- PostgreSQL
- Docker

The frontend should run using Vite.

The backend should run using Spring Boot.

Use environment variables to configure backend URLs, NEAR RPC, contract IDs, LLM API keys, and wallet credentials.

Do not commit private keys, secret phrases, or API keys.

---

# 20. Automated testing

Write tests for:

- Liar's Dice rules
- Turn validation
- Private dice isolation
- AI legal actions
- Agent fallback behavior
- Negotiation lifecycle
- Payment confirmation
- Duplicate payments
- Treasury reserve accounting
- TRASH conversion precision
- Failed redemption
- Agent transaction limits
- Shop inventory consistency
- Unauthorized wallet operations
- Game settlement idempotency

Use NEAR Sandbox for local smart contract testing.

Never claim a contract or deployment works unless it has been tested.

---

# 21. Priorities for a 48-hour hackathon

## P0 — Mandatory

1. Browser loads the application.
2. Player sees a real 3D table.
3. Player chooses an animal.
4. Two human players can join a room.
5. Liar's Dice is playable.
6. One AI animal makes valid moves.
7. Player can chat with the AI.
8. TRASH exists on NEAR Testnet.
9. AI has its own NEAR Testnet wallet.
10. A real testnet token transfer works.

## P1 — High priority

1. AI negotiation and bribery.
2. One paid AI information service.
3. TRASH ↔ test NEAR exchange.
4. Cosmetics shop.
5. On-chain match settlement.

## P2 — Optional

1. Four different animal models.
2. Additional minigames.
3. More complex agent memories.
4. Agent-to-agent negotiations.
5. NFT cosmetics.
6. Animations and graphical polish.

---

# 22. Team responsibilities

Developer 1 — Frontend and 3D

- React
- React Three Fiber
- 3D scenes
- Avatars
- Animations
- Shop UI
- Wallet UI

Developer 2 — Backend and gameplay

- Java Spring Boot
- WebSocket
- Game rules
- Multiplayer
- LLM agents
- Negotiation API

Developer 3 — Blockchain and integration

- NEAR smart contracts
- TRASH token
- Treasury
- AI wallets
- Blockchain bridge
- Deployment and transaction verification

Agree on API contracts at the beginning so development can proceed in parallel.

---

# 23. Delivery instructions

Do not attempt to build all features simultaneously.

Work in small, testable milestones.

Begin with:

1. Initialize the monorepo.
2. Configure React, Vite, TypeScript and React Three Fiber.
3. Create the basic 3D casino table with placeholder animal avatars.
4. Configure Java Spring Boot and WebSocket.
5. Define shared WebSocket and REST schemas.
6. Implement server-authoritative Liar's Dice.
7. Connect frontend actions to Java.
8. Implement one AI opponent.
9. Add AI dialogue and negotiation.
10. Create and deploy TRASH to NEAR Testnet.
11. Integrate wallets and token transfers.
12. Add treasury exchange and shop if time permits.
13. Test the complete demo flow.

At each milestone:

- Write actual source files.
- Explain how to run the result.
- Run available tests.
- Fix errors encountered.
- Do not invent successful build results.
- Do not silently replace blockchain operations with local mock balances.
- Keep the architecture simple.
- Prefer working functionality over visual or architectural complexity.

## Final goal

Produce a working browser game where:

A human player selects a 3D animal, joins a multiplayer Liar's Dice table, plays against another human and an AI-controlled animal, negotiates with the AI through natural language, pays TRASH for information, and sees a real NEAR Testnet transaction associated with that interaction.

The player should also be able to view their wallet, purchase cosmetics, and—if treasury implementation is completed—exchange TRASH for test NEAR and back.

The game must feel like a small polished indie party game rather than an AI-generated demo dashboard.

**Start implementation immediately with the repository structure, frontend 3D scene, Java backend skeleton, shared schemas, and Liar's Dice game logic.**
