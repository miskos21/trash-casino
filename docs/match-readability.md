# Match readability and dice placement

The dice/cup overlap came from a row whose final die was only 0.02 world units
from the cup center. Each seat now has a local tray facing the center; the cup is
0.92 units to the side of a centered, at most five-die row. The full cup rim and
the nearest die have a gap. Rows are positioned inside the table perimeter.
The lamp's mesh is hidden above the table camera, without disabling its light.

There was also a presentation mismatch: after bluff resolution the engine had
already rolled the next round, while the 3D scene kept the previous reveal until
the next bid. The HUD could therefore show different dice from the table. A
single presentation clock and shared helpers now select the same completed
round for the reveal, and switch to recipient-only next-round dice when the
server's reveal deadline passes. While a reconnect is awaiting the matching
reveal, the next private roll is not prematurely displayed. Historical reveals
remain available in the activity panel, rather than on opponents' live seats.

The server includes a bounded public history in each game snapshot. It records
only accepted actions, marks NPC/timeout causes, survives reconnect, excludes
private dice and guest recovery tokens, and resets on rematch. The client's
history is a rendering of that data, not an optimistic claim of action success.

The HUD adds an explicit highlighted turn state at both the top and controls,
portrait-based participant cards with remaining dice and last claim, the current
table-wide claim, public activity, and an inspectable completed-round reveal.
The active seat has a floor ring. On smaller screens the activity can be opened
and closed. Rules and results explicitly state: free match, no buy-in, no pot,
and no token payout. No balances, rewards, or economic actions were added.

## Verification

Presentation tests cover synchronized past-round dice, hiding cached opponent
dice when play resumes, mismatched/missing reveals, and the final public reveal.
Server/schema tests cover history privacy, duplicate actions, reconnect, timeout
causes, bounds, and rematch reset alongside the existing game tests. Browser
checks cover highlighted turns, claim visibility in another player's view,
rules/free-match explanation, accepted history, four-seat overhead rendering,
same-round dice in the HUD, history after reload, and a full match.

Commands:

```bash
npm test
npm run build
npm run test:backend
# With Java and Vite running:
npm run test:browser
```

Firefox, Safari, and physical mobile devices remain unverified. The existing
large Three.js production-chunk warning remains.

Observed on 2026-11-03: the 19 Java tests passed (native Maven and the Compose
build), the 8 frontend tests and schema checks passed, and the production build
passed. Complete two-window matches passed on desktop and narrow-width Chromium;
the four-seat overhead/reveal/history checks passed at both widths. The final
shared-clock version was checked again in the desktop overhead scenario. A real
headless full match passed against the isolated Java backend as well. The normal
local Compose backend was rebuilt with the new schema and public history.

The initial TypeScript build caught an ES2023 Array.findLast call; it was replaced
with ES2022-compatible array operations. No wallet or monetary behavior was added.
