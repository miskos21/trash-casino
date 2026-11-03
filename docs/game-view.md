# Full-window game view

The landing-page layout was replaced at the user's request. The canvas now fills
the viewport, with a small DOM overlay for menu, selected character, camera
controls, connection dot, and the required testnet/no-value notice. Promotional
headings, the permanent sidebar, and development explanations are removed.

The table sits in a procedural room with wood floor, rug, walls, lamps, a
sideboard, and plants. Camera azimuth is unrestricted, so the player can orbit
through 360°. Zoom and vertical movement stay bounded; the camera supports a
close-up from the face side of the player's seat and a table-view reset. Narrow
viewports receive a wider starting composition. Decorative walls face inward so
they do not occlude the table when zooming out.

The in-game menu is a native modal dialog with focus containment, background
input blocking, Escape, close button, backdrop dismissal, and return to table.
Avatar selection uses PNG face portraits rendered from the same procedural
models, not geometric text symbols. Portraits are stored in
`web-client/public/portraits/`, with a reproducible dev-only renderer:

```bash
# With Vite running and Playwright Chromium installed:
npm run portraits:render
```

Real connection status and retry remain in the menu. No client game authority,
wallet claim, simulated balance, or playable-room behavior was added.

## Verification

Verified on 2026-11-03: `npm test`, `npm run build`, and all four Playwright checks
passed. The build also includes all four portrait PNGs. Browser checks cover
desktop and 390px-wide Chromium:
full-viewport WebGL canvas, no document scrolling, mouse orbit/zoom, real portrait
loading, avatar selection, menu dismissal and Escape, character/table camera
buttons, actual HTTP/WS availability, offline failure, and retry recovery.
Screenshots are inspected for the table, menu, and character close-up.

The first browser check read the canvas at its default 300px width before R3F's
ResizeObserver updated it. The check now waits for the final canvas bounds rather
than treating initialization as a permanent layout. No backend source changed.
The existing large Three.js build chunk and Clock deprecation warning remain.
Firefox, Safari, and physical touch devices have not been checked.
