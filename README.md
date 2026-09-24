# Novaris: Fleet Vanguard

**[Enter the Vanguard](https://novarisfleetvanguard.github.io/)**

Ancient oaths. Distant stars. Your Vanguard.

A 3D multiplayer cosmic combat game for one to six pilots. Fly between worlds, fight alien guardians, land on Ember and Veil, breach the Hollow Dreadnought, and board another pilot's vessel. A room code is all a crew needs.

## Play

1. Choose a callsign and create a room, or enter a friend's room code.
2. Select **Expedition** for a shared three-core recovery mission, or **Skirmish** for a 12-point contest.
3. Expedition clears both planetary relics before the citadel unlocks. Physical cover, shield bracing and evasion answer distinct enemy tactics and a two-phase Jarl.
4. Every pilot selects Ready. The host explicitly launches the mission.
5. Open the complete Field Manual from the menu or press **H** in a mission. It stays open until you close it.

Desktop: **WASD** move, **arrow keys / drag** aim, **Space** fire, **Q** ground evasion, **C/right mouse** shield brace, **Shift** boost, **R/F** rise/dive in space, **1–4** select weapon, **E** interact, **Tab** star chart, **Esc** flight menu/settings. Touch devices have on-screen movement, aim, fire, boost, altitude, evade and brace controls.

Menus do not pause a shared mission. Respawning, travel, starting another match and closing tutorials require a player's explicit choice.

## World and craft

Shogun armor, Roman and Greek military forms, medieval standards and northern longship silhouettes meet an original cosmic setting. The editable Blender kit contains the pilot, fighters, alien, flagship, corridor and rift core. The opening is an original nine-second ink-and-starlight sequence, followed by an animated astral loading scene that waits for the player to enter command. Original eight-bar music arrangements combine plucked strings, tuned percussion, bowed voices and celestial bells, with one musical score active at a time. Spatial action cues and continuous flight audio share the same volume controls.

**A Beautiful Cosmic Showcase: Dontaeus A. Meek**

The animated insignia pairs an ivory-and-gold shogun sword with a cyan-chambered space pistol. Nine coordinated motion layers animate its orbit, reactor and blade; both weapons remain fully visible. The reduced-motion option selects a completely still version.

The visual credit replaces only the period after “A” with a custom orbital / torii / star emblem. There is no punctuation after “Meek”.

## Source and hosting

GitHub Pages serves the static game in `app/public`. The room simulation runs on a separately hosted authoritative Cloudflare Durable Object at `novaris-fleet-vanguard.novaris-fleet-vanguard.workers.dev`. GitHub Pages itself does not run game servers. The shipped frontend uses that service on public hosts; local development connects to the local worker.

The project includes game logic, room synchronization, browser source, assets and tests. Third-party notices are in `app/public/CREDITS.txt` and `app/public/vendor/THREE-LICENSE.txt`.

For local development, install Bun, then run:

```sh
cd app
bun install
bun run build
bun run dev
```

Validation: `bun run test` and `bun run build`.

The independent room service is defined in `app/src/relay.ts` and `app/wrangler.relay.jsonc`. Build it with `bun run scripts/build-relay.mjs`; deploy it to your own Cloudflare account with `bunx wrangler deploy --config wrangler.relay.jsonc`. It needs the SQLite-backed `Room` Durable Object binding and does not serve the static game. Update the public server hostname in `app/public/client.js` if you deploy a different endpoint.

The release workflow verifies the source archive against its pinned SHA-256, preserves its source in this repository, and publishes `app/public` to GitHub Pages. No player account is required.


## Repeat the release audit

`bun run test` runs the rules and room integration tests against source in the real Workers runtime. `bun scripts/check-simulation.mjs` completes deterministic routes for one, two and six pilots plus Skirmish using validated actions.

For browser edge cases, start the local game, run `bunx playwright install chromium` once, then run `node scripts/check-browser-audit.cjs` from `app/`. It checks saved settings, interrupted loading, blocked storage reconnection, manual navigation, offline-seat release, stale socket events and explicit control transfer between duplicate tabs. `GAME_URL` selects another test game URL; `REPORT_PATH` saves its JSON evidence. The checker creates temporary test rooms.

The game needs a browser with WebGL support. Physical-device performance varies; the release report records the devices and conditions actually checked.

`node scripts/check-browser-deep.cjs` adds real two-pilot simultaneous audio, mouse-button chord and audio-resource regressions. It uses the same browser and URL configuration as the primary browser audit.

`node scripts/check-browser-loading.cjs` checks a pending audio activation, a stalled model download and a malformed model response. Each failure must expose an explicit retry, and a fresh successful request must reach the command menu. Model downloads have a 30-second deadline.

`node scripts/check-browser-keyboard.cjs` checks keyboard launch, firing after arrival and notice dismissal, and focus inside the manual. `BROWSER` selects Chromium, Firefox or WebKit; install the matching Playwright browser first.

`node scripts/check-browser-interruption.cjs` exercises real boarding, sabotage, reconstruction and replay across deliberate connection loss. It verifies that unsent choices stay open for an explicit retry and that resumed play has neutral controls. It uses the same browser, URL and report environment variables as the other browser checks.

`node scripts/check-browser-capture.cjs` follows keyboard navigation into mouse capture, verifies Space firing after the native capture event, and checks neutral input on release. `node scripts/check-browser-roster.cjs` keeps three real pilots in a room to verify focus and held clicks survive unrelated crew updates; confirmed seat removal must still work. Both use the same URL and report settings as the browser audit.

`node scripts/check-audio-spatial.cjs` checks three-dimensional action-sound distance calculations, including vertical separation in space.
