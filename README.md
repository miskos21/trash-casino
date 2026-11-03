# Raccoon Royale

A browser-based 3D Liar's Dice party game for the NEAR hackathon. Animal NPCs can
be persuaded and conned, but backend validation and contract limits must always
control what they can do.

**NEAR Testnet only. TRASH has no real-world value.** No real-money purchases,
real-value cashouts, mainnet operations, or deployment are included.

## Milestone 1

Implemented locally:

- npm workspaces, lockfile, Java 21 Maven wrapper, environment template, Docker Compose.
- React + TypeScript + Vite + React Three Fiber + drei + Zustand + Tailwind.
- Full-window procedural casino room, table, cups, four placeholder animal
  variants, rendered face portraits, 360° orbit, character close-up, and in-game menu.
- Spring Boot REST health and schema-validated WebSocket PING/PONG; the browser
  reports actual API and WebSocket availability with a retry button.
- Shared JSON schemas, generated TypeScript declarations, validation tests.
- Isolated authoritative Liar's Dice engine with private views, increasing bids,
  bluff resolution, elimination, full match completion, deterministic fallback.

Rooms and the engine are **not connected to the browser yet**. Wallet signing,
LLM chat, negotiations, starter grants, contracts, buy-in, and settlement are not
implemented. Contract and bridge directories are reservations; no contract IDs
or testnet deployments exist. No blockchain mocks or simulated balances exist.
The future offline LLM mode must be labelled `TEMPORARY MOCK` when implemented.
The frontend's HTTP-failure unit test uses a labelled `TEMPORARY MOCK` response
inside that test only; application status checks always use the real backend.

## Run locally

Prerequisites: Linux, Node.js 22.12+ (24 LTS recommended), npm 10+, Java 21 JDK,
and `curl` or `wget` plus `unzip` for the Maven wrapper. Maven is downloaded by
`./mvnw` on first use. Docker Engine with Compose v2+ is optional for the database
profile. Rust, NEAR CLI, wallet libraries, and contract toolchains are not needed
for this milestone; choose and document them against current NEAR docs when
blockchain integration begins.

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

Click **Menu**, your character portrait, or press **Esc** to open the in-game menu.
Choose an animal by its rendered portrait, then **Back to table**. The connection
dot shows actual backend availability. Expand **Connection** inside the menu to
see the API and WebSocket indicators and **Check connection again**. Both should
read `online`; stop Java and retry to see `offline`. **Play Liar’s Dice** remains
disabled because gameplay isn't connected. No wallet or balance is simulated.

```bash
curl http://localhost:8080/api/health
# {"status":"UP","service":"raccoon-royale-backend","network":"testnet","protocolVersion":1}
node scripts/smoke.mjs
# Tests the running health + WebSocket transport without a browser.
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
transport independently. Contract and bridge tests do not exist yet.

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
near-bridge/          reserved TypeScript workspace, no signing implementation
blockchain/
  trash-token/        reserved NEP-141/145 reference-based token
  trash-casino/       reserved escrow, refunds, and agent spending limits
docs/                architecture, specification, and milestone verification
```

See [API contracts](shared-schemas/README.md) and [AGENTS.md](AGENTS.md). The
architecture follows `AGENTS.md` where the older specification has different
directory names or priorities. P1 treasury/shop work has not started.

Before extending wallet UI, implement a small wallet connection and NEP-413
signing spike against current NEAR docs. Then connect rooms and this engine,
one NPC and chat, sandbox-tested contracts, testnet bridge, verified wallet
ownership, buy-in and settlement, paid information, and contract-limited tips.

## Trust and security

The server is authoritative and trusted to roll private dice with `SecureRandom`
and report match outcomes. This is **not trustless or provably fair randomness**.
Only a participant's own dice and public state may enter their view or LLM prompt.
Schema shape checks do not replace identity, rule, agreement, or budget validation.
LLMs will only propose actions; they will never receive keys or unrestricted tools.
Testnet token amounts will use exact integers. Payment submission will never count
as success without final execution verification. Agent limits belong in the
casino contract, not solely in Java.

Nothing has been published, submitted, or deployed. Repository publication,
social posts, and hackathon submission require explicit human approval.

License: [MIT](LICENSE).
