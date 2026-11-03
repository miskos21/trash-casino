# Free-play multiplayer

Per the user's updated priority, gameplay and multiplayer come before wallet and
chain integration. No security requirement for future payments has been removed;
there is simply no ledger, buy-in, or payment operation in this slice.

## Implemented behavior

- A host creates a six-character room; up to three humans join with independent
  server-issued IDs and a rule-based Don Raccoone (2–4 participants total).
- Every human must be connected and ready before the host starts. Names and
  avatar choices are fixed for that room; leaving permits a new selection.
- The server rolls SecureRandom dice, binds actors to sockets, and projects
  public counts plus only the recipient's own dice. Reveals contain only the
  completed round. The next round's private dice never enter another seat's view.
- Bids and bluffs go through the same engine as deterministic NPC and timeout
  actions. Thirty-second turns and a four-second reveal pause are enforced on
  the server. A winner ends the match; readying and starting again makes a new ID.
- Request IDs suppress exact duplicate commands. Revision checks reject stale
  actions, even across reconnect, and normal engine validation checks the turn.
- A private 256-bit resume capability recovers the same guest seat after reload.
  Public room codes, names, or a client-supplied player ID prove no identity.
  The browser stores only this capability in sessionStorage, not dice. An old
  socket closing cannot detach its replacement. No wallet auth is claimed.
- Rooms are bounded (200), peers are bounded (512), commands are rate limited
  (120 per ten seconds per socket), and stale rooms expire. Each connected socket
  has bounded send time and buffering. These are hackathon limits, not a public
  service abuse-prevention guarantee.
- The browser renders each participant, their server-approved animal, private
  dice, game actions, timers, completed-round reveal, and final winner. Gameplay
  remains separate from the avatar/camera controls.

The NPC is honestly labelled rule-based. It bids `(1,1)` without a prior bid and
otherwise calls bluff. It makes legal moves, not sophisticated strategic moves.
No mock LLM or blockchain responses exist. Unit tests mock only socket transport.

## Runtime and limits

One Java instance owns in-memory rooms. Reconnect grace is two minutes when no
other connected human keeps the room alive. After two minutes, disconnected seats
forfeit their dice match or stop receiving future Blackjack hands; lobby/finished
abandoned seats are removed. Explicit leave takes effect immediately after server
validation and is acknowledged with `ROOM_LEFT`. Disconnections and departures
are visible in the lobby, match HUD, and empty 3D seat. Heartbeats detect half-open
connections within 45 seconds; a disconnect keeps a two-minute recovery window. Restarting Java loses
the room and expires guest recovery. There is no cross-instance coordination.
Sessions are not wallets and cannot authorize any future economic operation.
The only REST endpoint remains health; gameplay uses the validated WebSocket.

For LAN play, run Vite using
`npm run dev -w web-client -- --host 0.0.0.0`, set `WEB_ORIGIN` for Java to the exact
browser origin (for example `http://192.168.1.20:5173`), restart the backend, and
open that computer's address on the other device. Vite proxies to the local Java
backend, so the browser still uses same-origin `/api` and `/ws`. Actual LAN devices,
Firefox, and Safari have not been tested. Only localhost Chromium is verified.

## Verification commands

```bash
npm test
npm run build
npm run test:backend
# With backend and frontend running:
node scripts/game-smoke.mjs
npm run test:browser
```

The headless game script validates server messages against the shared schema,
plays two clients plus Don through an entire match, checks private view shape,
rejects an out-of-turn action and an unseated attacker, and recovers a guest.
JUnit additionally covers room capacity, host permissions, readiness, duplicate
requests, stale revisions, full timeout matches, rematch IDs, and host transfer.
Browser tests cover two windows, joining by code, readiness, private dice, reload,
bid/bluff controls, and consistent winner on desktop and narrow viewports.

The three timing properties are `app.game.turn-timeout-ms`, `app.game.npc-delay-ms`
and `app.game.reveal-ms`. Local automated checks may shorten NPC and reveal delays;
they use the same engine, SecureRandom, socket authorization, and game lifecycle.
The existing Vite size warning remains. No payment, wallet, LLM, contract, or
settlement behavior is tested or claimed.

The first two-window browser run completed its game, but the test itself timed
out waiting for a removed Bid/Call bluff control after GAME_RESULT. The test now
bounds individual button waits and checks the final winner explicitly; it does
not reinterpret submitted actions as successful.

Dynamic Drei HTML nameplates also produced removeChild errors when the table
population changed. They were removed; regular DOM participant labels remain.
The final full-match browser runs report no uncaught page errors. Browser test
automation foregrounds the acting tab and checks button availability atomically
to avoid waiting forever on controls removed at match completion.

## Observed results (2026-11-03)

- Java/Maven: 19 tests passed, including the abandoned-seat/rematch regression.
- Schema and frontend tests passed; generated declarations match the schema.
- Production TypeScript/Vite build passed, with the known large-chunk warning.
- Headless full game passed against the isolated native backend and the normal
  Compose backend, including standard production timers on the latter.
- Desktop Chromium: the complete two-window match/reload test passed. The two
  existing desktop preview/connection checks passed earlier in this change.
- Narrow-width Chromium: all three tests passed after the nameplate fix (full
  two-window match, preview/camera/menu, connection loss and recovery).
- Compose rebuilt the final backend and its running image was checked against
  the build output. PostgreSQL and the regular localhost backend remain running.

The isolated QA backend used port 18080 and Vite used 5174; both are stopped after
verification. The user's normal frontend/backend stack is preserved.
