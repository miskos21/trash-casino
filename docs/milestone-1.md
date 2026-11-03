# Milestone 1 — foundation

Verified on 2026-11-03. Scope: initialize the monorepo, frontend 3D preview,
Java backend skeleton, shared contracts, and standalone dice engine. This is not
the playable or blockchain milestone.

## Implemented

- Canonical `AGENTS.md` directory layout, npm workspaces and lockfile, MIT license,
  ignored secrets/build artifacts, environment template, standard Maven wrapper.
- React Three Fiber table, cups, procedural placeholder animal variants, orbit
  camera, responsive DOM avatar controls, WebGL fallback, actual transport status.
- Spring Boot 3.5.16 / Java 21, `/api/health`, `/ws`, strict inbound shared-schema
  validation, PING/PONG, request correlation, explicit errors, origin allowlist.
- JPA/PostgreSQL profile and non-root backend Docker image; local Compose stack.
- JSON Schema contracts for core REST, directional WS, agent proposals and
  negotiation states; generated TS declarations with a stale-output check.
- Independent SecureRandom dice engine, private immutable views, legal turns and
  bids, reveal/count, die loss, elimination, winner, deterministic fallback.
- Setup instructions, architecture, schema documentation, headless transport
  check, engine match test, and repeatable browser checks.

## Verification

| Check | Result |
|---|---|
| `npm test` | Passed: 5 schema tests, 4 frontend service/store tests |
| `npm run build` | Passed: generated declarations match, TypeScript compiles, Vite builds |
| `cd backend-java && ./mvnw verify` | Wrapper downloaded and executed Maven successfully; tests and JAR packaging passed |
| Final Java `mvn verify` in Docker build | Passed: 13 tests (7 engine, 6 real HTTP/WebSocket integration), executable JAR built |
| Compose configuration | Passed `docker compose config --quiet` with test environment values |
| Compose startup | Backend and PostgreSQL started; Hikari obtained a PostgreSQL connection and JPA initialized |
| `node scripts/smoke.mjs` | Passed against the Compose backend directly |
| `BACKEND_URL=http://localhost:5173 node scripts/smoke.mjs` | Passed through Vite HTTP and WS proxies |
| `npm run test:browser` | Passed: 2 Chromium scenarios, desktop and 390px-wide viewport |
| Screenshot inspection | Table and avatars visibly render, layout fits desktop/narrow screen |

Browser checks exercise a real WebGL2 canvas, avatar switching, disabled future
room control, no horizontal overflow, visible value disclaimer, genuine health
and WS status, offline failure, and reconnection. They encountered no uncaught
page errors. Screenshots are saved under ignored `test-results/`.

The backend tests cover own-dice isolation and immutable views, unknown actors,
invalid turns/bids, no wild ones, caller/bidder loss, eliminated-seat skipping,
finished-game rejection, full fallback match, participant bounds, real HTTP/WS,
schema-conformant output, unknown fields/types, duplicate JSON keys, trailing
JSON, localhost/loopback browser origins, and rejection of unapproved origins.

## Problems encountered

- Java and Maven were initially absent. Temporary Java 21 and Maven were
  provisioned under `/tmp` to validate the native build; Compose provides the
  documented container alternative. No system Java installation was changed.
- Initial tests caught counting face values instead of matching dice. The engine
  now counts matching dice, and the regression test passes.
- The first frontend build caught a REST definition missing from generated types
  and absent Node type definitions. Both were fixed and the final build passes.
- Sandbox restrictions blocked dependency DNS and binding local server ports;
  permission-approved executions completed dependency and local stack checks.
- The initial running-service smoke failed because sandbox restrictions prevented
  that Java process from binding. The Compose backend subsequently passed both
  direct and proxied smoke checks.
- The initial Compose startup found host port 5432 already occupied. PostgreSQL's
  host port is now configurable; the isolated validation project used 15432.
  The existing database was not stopped or altered.
- Vite reports a large Three.js bundle (about 1.16 MB minified, 319 KB gzip).
  Build succeeds; load optimization is deferred until playable integration.
- Spring's test tooling emits a Mockito dynamic-agent warning on Java 21. Tests
  pass; no future-JDK compatibility is claimed.
- The current Three.js/R3F combination emits Clock deprecation and soft-shadow
  fallback warnings. Canvas rendering passed; these dependency warnings remain.
  Vite also logged broken-pipe proxy messages while browser tests deliberately
  disconnected sockets; reconnect assertions passed.

## Limits and next slice

Firefox, Safari, and actual mobile devices have not been browser-tested. A narrow
Chromium viewport is not proof of full mobile/browser compatibility. No hosted
build or production serving configuration was exercised.

Rooms, authentication, NEP-413, UI gameplay, persisted player records, LLM calls,
5-second LLM fallback scheduling, chat limits, negotiations, tokens, bridge,
contracts, grants, buy-ins, settlement, and contract-enforced tips remain undone.
No chain or LLM success is simulated. One isolated frontend unit test uses a
labelled `TEMPORARY MOCK` HTTP 503 response; application transport always calls
the backend. No contract or bridge tests exist yet.

Next: prove wallet connection/signing with the required small spike, then build
rooms that bind actions and private views to server-owned session identities and
connect the existing engine to the browser.

Local validation processes and the isolated Compose containers are stopped after
verification. The validation project's empty database volume is retained; no
existing developer services or volumes are removed.
