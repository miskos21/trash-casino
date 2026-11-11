# Trashnino

A browser-based 3D Liar's Dice party game for the NEAR hackathon. Animal NPCs can
be persuaded and conned, but backend validation and contract limits must always
control what they can do.

**NEAR Testnet only. TRASH has no real-world value.** No real-money purchases,
real-value cashouts, mainnet operations, or deployment are included.

## Current free-play slice

Implemented locally:

- npm workspaces, lockfile, Java 21 Maven wrapper, environment template, Docker Compose.
- React + TypeScript + Vite + React Three Fiber + drei + Zustand + Tailwind.
- Full-window procedural casino room, table, cups, six placeholder animal
  variants, rendered face portraits, 360° orbit, character close-up, and in-game menu.
- Spring Boot REST health and schema-validated WebSocket PING/PONG; the browser
  reports actual API and WebSocket availability with a retry button.
- Shared JSON schemas, generated TypeScript declarations, validation tests.
- Isolated authoritative Liar's Dice engine with private views, increasing bids,
  bluff resolution, elimination, full match completion, deterministic fallback.
- Guest rooms for up to four seats: humans plus 0–2 rule-based agents (Don Raccoone,
  Foxy) chosen when the room is created, room codes,
  ready states, host start, timed turns, dice reveal, winner, and rematch.
- Recipient-specific game state, browser controls and dice, 3D seats for each
  participant, reload recovery using a server-issued guest capability.
- Free-play Blackjack, the web client's default room game (P2 minigame): every human
  and agent plays a hand against a seatless house dealer. Same rooms, timers, reconnects.
  Liar's Dice stays available and remains the P0 game for the chain features.
- Shared vector playing cards in the HUD and on the table: full pip layouts,
  illustrated court cards, matching patterned backs, rounded paper edges, and a
  detailed shoe/discard tray. A procedural raccoon in a dinner jacket, shirt,
  bow tie, and gloves represents the house dealer without taking a player seat.
  Blackjack uses a larger table with a separate four-column area for each hand;
  every card keeps the same physical size as longer hands wrap into more rows.

### Playing for TRASH (NEAR Testnet)

TRASH has no real-world value. Economic model and contracts: [blockchain/README.md](blockchain/README.md).
Flow and trust boundaries: [architecture](docs/architecture.md). Verification: [economy milestone](docs/economy.md).

- The casino contract owns the whole initial supply as its house bankroll. NPCs
  belong to the casino and play and tip with house money.
- A player connects a NEAR wallet (near-connect) and signs a NEP-413 login message.
- **Get free test TRASH** mints 100 TRASH to the wallet (once a minute per account).
- **Deposit** moves TRASH into the casino balance; **Withdraw** sends it back.
- A paid Liar's Dice room (**10 TRASH buy-in**) opens an on-chain escrow. Each human
  pays from their casino balance; the match starts only when the chain shows every
  seat paid. The winner's pot is settled on-chain and shown with its transaction.

Implemented and tested end to end on a local NEAR Sandbox (contracts, bridge,
backend, and a headless player). **Not yet deployed to testnet, so there are no
contract IDs, and the browser wallet flow has not been tried with a real wallet.**
Without bridge configuration the server offers free play only; nothing is simulated.
LLM decisions/chat, negotiations, and the chat-driven tip are not implemented yet
(the contract methods `pay_offer` and `agent_pay` and the bridge endpoint exist).
The future offline LLM mode must be labelled `TEMPORARY MOCK` when implemented.
The frontend's HTTP-failure unit test uses a labelled `TEMPORARY MOCK` response
inside that test only; application status checks always use the real backend.

## Run locally

Prerequisites: Linux, Node.js 22.12+ (24 LTS recommended), npm 10+, Java 21 JDK,
and `curl` or `wget` plus `unzip` for the Maven wrapper. Maven is downloaded by
`./mvnw` on first use. Docker Engine with Compose v2+ is optional for the database
profile. Rust, NEAR CLI, and the contract toolchain are needed only for the
contracts; see [blockchain/README.md](blockchain/README.md).

From the repository root:

```bash
npm ci
cd backend-java
./mvnw spring-boot:run
```

In another terminal, from the repository root:

```bash
npm run dev
```

Open `http://localhost:5173`. The 3D room fills the browser window. Drag to orbit
360° around the table, and scroll/pinch to zoom. **My character** focuses the camera
on your animal's face; **Table** restores the table view. The fullscreen button
can additionally hide browser chrome when the browser allows it.

Click **Play & character**, your character portrait, or press **Esc** to open the setup menu.
Once in a room, the same button reads **Room & players**. The home table shows only your selected character.
Choose an animal by its rendered portrait, then **Back to table**. The connection
dot shows actual backend availability. Expand **Connection** inside the menu to
see the API and WebSocket indicators and **Check connection again**. Both should
read `online`; stop Java and retry to see `offline`. No wallet or balance is simulated.

### Play a match

1. Open **Play & character**, select an animal, enter a name, choose **Liar’s Dice** (Blackjack
   is the default), pick the number of agents, and click **Create room**. Liar's Dice
   needs at least two participants, so with 0 agents wait for a friend.
2. For multiplayer, open the app in a fresh tab or another browser, enter the
   six-character code, and click **Join room**. Humans and agents share four seats.
   You can also play alone against one or two agents.
3. Each human clicks **Ready**. The creator clicks **Start match**.
4. Your private dice appear below the scene. On your turn raise the quantity, or
   keep it and raise the face, using **Make claim**. Once a claim exists, **Call bluff**
   reveals the previous round's dice and removes one die from the loser.
5. Ones are not wild. Turns expire after 30 seconds and use a deterministic legal
   fallback. Don uses the same fallback, without an LLM. The reveal pause is four
   seconds. The last participant with dice wins.
6. Open **Room & players** to ready up for a rematch. The red **Leave match** / **Leave room** button is also always available in the header. Reloading the same
   tab restores that guest seat and its private view. Use a fresh tab, rather than
   duplicating an existing game tab, to create another player.

### Play Blackjack

1. Open **Play & character**. **Blackjack** is selected by default; choose **0**, **1** (Don), or
   **2** (Don + Foxy) agents, then **Create room**. Friends join with the code as
   above; humans plus agents fill at most four seats. The house dealer has no seat.
2. **Ready**, then **Start match**. Everyone gets two face-up cards; the dealer
   shows one card and keeps one face down. The server never sends that hidden card
   to any browser until the dealer reveals it.
3. On your turn click **Hit** for a card or **Stand** to keep your total. Over 21
   busts. Reaching 21 ends your turn. Turns expire after 30 seconds and stand.
4. Agents play their own hands after the humans: they hit below 17 and otherwise
   stand, using only their own cards. After the last player, the dealer reveals and draws to 17 or more (stands on
   soft 17). Each hand shows Win, Lose, Push, or Blackjack. A dealer natural ends
   the hand immediately.
5. After a four-second result pause the next hand is dealt from the same shoe, and
   each seat's W/L/P tally keeps counting for the final standings. The header shows
   the hand number. When the cut card comes out (75% of the shoe dealt), that hand
   finishes and the session ends with standings. Then use **Back to lobby**,
   **Ready**, **Play again** for a fresh shoe.

Like a casino shoe: before the first deal the dealer shuffles six decks once with
`SecureRandom` and burns the top card. Every hand then comes off the top of that
same shoe, in order, until the cut card (about 15–30 hands depending on seats).

**Shoe check.** Open **Room & players → Card verification** to inspect the fingerprint
and the final check. These details stay out of the playing HUD. Before the first card, the server publishes a fingerprint:
SHA-256 of a random salt plus the full card order. When the shoe ends it reveals
the salt and order, and the browser checks three things itself. The order must match
the fingerprint, the shoe must hold exactly six complete decks, and every hand that tab
saw must have come off the shoe in that order. This proves the order was fixed before play and
never changed mid-shoe. It does **not** prove the shuffle was random: the server
chose it and remains trusted. Hands dealt while a tab was closed are not checked
by that tab. Blackjack is
also free play: no buy-in, no payout, and no 3:2 token reward. No double, split,
insurance, or surrender in this slice.

**What is at stake?** This is a free match: no buy-in, no tokens at risk, no pot,
and no token reward or persistent points for winning. Each resolved bluff costs
the loser one die. The last player with dice wins the match. A claim such as
“3 × 4” means at least three fours across all participants' dice, not a monetary
bet. If that claim is met, the bluff caller loses a die; otherwise, the person
who made the claim loses one. Ones are not wild.

Your turn has a gold marker at the seat, a high-contrast banner, a highlighted
action panel, and an explicit countdown. **Table activity** records the server's
accepted public claims, bluff calls, results, NPC moves, and timeout moves, even
after a reload. It starts collapsed; **Show moves** opens the history and previous
reveal. **How to play** is in **Room & players**, alongside optional card verification.
The match HUD shows only the turn, timer, cards/dice, opponents, and actions.
Camera controls stay as small corner buttons during play.

During the reveal, the 3D dice and the private-dice panel show the same completed
round. When play resumes, only your newly rolled dice remain visible. Cups sit
beside each seat's dice row, not on its last die; the overhead camera hides the
lamp shade so it does not block the table.

Guest recovery is tab-scoped (`sessionStorage`), not NEP-413 or wallet auth. Rooms
and secrets are in memory: restarting Java ends all matches. A disconnected guest
has two minutes to return; its turn still times out. Their 3D seat becomes empty,
and the lobby and match show **Disconnected**. Heartbeats detect a lost connection
even when no socket close arrives (within 45 seconds on the server).

**Leave match** waits for server acknowledgement, revokes guest recovery, and shows
**Left match** to the remaining players. In Liar’s Dice, departure forfeits all of
the player’s dice, cancels an open claim, and starts a fresh round (or awards the
last remaining player the win). In Blackjack, their current hand stands automatically
and remains in the completed hand for shoe verification; they receive no further
hands. A disconnect lasting two minutes follows the same departure rules. Idle rooms expire after
one hour. No monetary state exists in this slice.

If upgrading from the preview-only backend, rebuild/restart it:

```bash
docker compose up --build -d backend
```

The UI source can hot-reload, but Java's packaged schemas and room service need
the rebuilt backend. Full game verification is in [free-play milestone](docs/free-play.md).

```bash
curl http://localhost:8080/api/health
# {"status":"UP","service":"raccoon-royale-backend","network":"testnet","protocolVersion":1}
node scripts/smoke.mjs
# Tests the running health + WebSocket transport without a browser.
node scripts/game-smoke.mjs
# Plays a real match with two guest clients and an NPC; checks reconnect and permissions.
```

The default backend needs no database. Its state is in memory and no wallet is
authenticated. Health means this backend is running, not that a chain, database,
or LLM is available. The only implemented REST endpoint is `/api/health`.

Vite proxies `/api` and `/ws` to `http://localhost:8080`. For a different backend,
copy `VITE_BACKEND_TARGET` from `.env.example` into `web-client/.env.local` and
restart Vite. Set `WEB_ORIGIN` in the Java process if the browser origin changes;
the default allowlist includes `http://localhost:5173` and `http://127.0.0.1:5173`
(comma-separated in `WEB_ORIGIN`). A root `.env` is consumed by
Compose, not automatically by Java or Vite. Keep server secrets out of `VITE_*`.

## Play with a remote friend (informal test)

A Cloudflare quick tunnel exposes the local Vite server through a random public
`https://*.trycloudflare.com` URL. No Cloudflare account is needed. Anyone with
the URL reaches your dev server while the tunnel runs, so share it only with testers.

1. Start the backend and Vite as above, then install `cloudflared`
   (`sudo pacman -S cloudflared` on Arch, or the official release binary).
2. Run `cloudflared tunnel --url http://localhost:5173` and copy the printed URL.
   Vite already accepts `.trycloudflare.com` hosts (`web-client/vite.config.ts`).
3. Restart Java with that origin allowed, otherwise the WebSocket handshake is rejected:

   ```bash
   cd backend-java
   WEB_ORIGIN=http://localhost:5173,https://<random-name>.trycloudflare.com ./mvnw spring-boot:run
   ```

4. Both players open the tunnel URL. One creates a room and shares the code.

Each tunnel start gets a new URL, which needs a new `WEB_ORIGIN` restart. Stopping
`cloudflared` ends public access. This is not a hosted demo deployment.

## Optional PostgreSQL stack

```bash
cp .env.example .env
# Edit the local development password in .env.
docker compose up --build -d
npm run dev
docker compose logs backend
docker compose down
```

Compose runs PostgreSQL 17 and Java with the `postgres` profile. There are no
entities or migrations yet. `docker compose down` preserves the named database
volume. Do not run the native Java server and Compose backend on port 8080 at the
same time. The frontend runs through Vite on the host; the bridge is not a dummy
service. If 5432 is already occupied, set `POSTGRES_PORT=15432` in `.env`; containers
still communicate on 5432. `SERVER_PORT` controls the exposed Compose backend port.
See [architecture](docs/architecture.md) for the intended runtime.

## Checks

```bash
npm test                 # schema + frontend service/store tests
npm run build            # generated-type freshness, TypeScript, Vite production build
npx playwright install chromium # once, for optional browser checks
npm run test:browser     # requires the running Java/Compose backend and Vite
cd backend-java
./mvnw verify            # JUnit engine + real HTTP/WS integration tests + executable JAR
```

`npm run test:backend` is a root shortcut for JUnit tests. For a headless complete
rules match, run `./mvnw -Dtest=LiarsDiceGameTest test` inside `backend-java`.
This exercises legal deterministic fallback turns until one participant wins;
it is not a browser/chain end-to-end demo. `node scripts/smoke.mjs` checks running
transport independently. Contract tests run on Linux, macOS, or WSL2:
`cd blockchain && ./scripts/build.sh && ./scripts/test.sh`. Bridge tests: `npm test -w near-bridge`.
With backend + bridge + deployed contracts running, `node scripts/paid-smoke.mjs` plays
the whole paid flow headlessly (see [economy milestone](docs/economy.md)).

Validation results and remaining verification limits are recorded in
[milestone 1](docs/milestone-1.md). A Three.js production chunk currently triggers
Vite's size warning; optimization is deferred until the playable slice.

Avatar portraits are checked-in PNG renders of our procedural 3D characters,
stored in `web-client/public/portraits/`. After changing the models, with Vite
running and Chromium installed, regenerate them using `npm run portraits:render`.
The renderer uses `web-client/tools/portraits.html` in development only; no image
generation API or external artwork is involved. For the full-window UI change,
see [game view verification](docs/game-view.md).

## Structure and contracts

```text
web-client/           React DOM UI and procedural R3F scene
backend-java/         Spring Boot transport and pure Java dice engine
shared-schemas/       JSON Schema source and generated TypeScript API types
near-bridge/          TypeScript service: restricted-key signing, final outcomes, NEP-413 checks
blockchain/
  trash-token/        TRASH: NEP-141/145 reference token + test faucet (not deployed)
  trash-casino/       house, balances, escrow, settlement, refunds, NPC tip limits (not deployed)
  integration-tests/  NEAR Sandbox tests for both contracts
  scripts/            build, test, and testnet deploy scripts
docs/                architecture, specification, and milestone verification
```

See [API contracts](shared-schemas/README.md) and [AGENTS.md](AGENTS.md). The
architecture follows `AGENTS.md` where the older specification has different
directory names or priorities. The shop has not started; buying TRASH for test
NEAR replaces the faucet later (P2).

Next: deploy to testnet (needs team approval), try the browser wallet flow with a
real testnet wallet, then NPC chat with validated LLM proposals, the paid
information deal, and the chat-driven contract-limited tip.

## Trust and security

The server is authoritative and trusted to roll private dice with `SecureRandom`
and report match outcomes. This is **not trustless or provably fair randomness**.
Only a participant's own dice and public state may enter their view or LLM prompt.
Schema shape checks do not replace identity, rule, agreement, or budget validation.
LLMs will only propose actions; they will never receive keys or unrestricted tools.
Token amounts use exact integers (`u128`, `BigInteger`, `bigint`). A transaction
counts only after its final execution outcome succeeds. Agent tip limits and house
limits are enforced by the casino contract, not solely in Java.

Nothing has been published, submitted, or deployed. Repository publication,
social posts, and hackathon submission require explicit human approval.

License: [MIT](LICENSE).
