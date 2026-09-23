# Multiplayer service

The public game frontend is hosted separately on GitHub Pages. The authoritative room service is deployed directly to Cloudflare:

https://novaris-fleet-vanguard.novaris-fleet-vanguard.workers.dev

GET /health returns the service status. WebSocket clients connect at /ws/<room-code>. No account or app login is required. Room seats use private per-player reconnect tokens; tokens are sent only in the owning socket's welcome message, never in public state.

## Deploy from source

Install the app dependencies with `bun install`, then run `bunx wrangler deploy --config wrangler.relay.jsonc` from the app directory using your own Cloudflare account authentication. The standalone configuration binds the Room Durable Object with SQLite storage and enables the public workers.dev endpoint. It does not need an assets binding or any game secrets. The initial SQLite migration is v1; subsequent uploads retain the existing room namespace.

For a direct API upload, `bun scripts/build-relay.mjs` creates `dist/relay/index.js`. Upload this module with metadata `main_module: index.js`, the compatibility settings from wrangler.relay.jsonc, and the ROOMS Durable Object binding. Apply `new_sqlite_classes: [Room]` with migration tag v1 only when creating the namespace for the first time.

## Verify a public deployment

From the repository root, set GAME_ORIGIN to the HTTPS backend URL and CLIENT_ORIGIN to the actual frontend origin, then run `node app/scripts/check-public-game.cjs`. This opens two independent sockets in a fresh room, checks identity and action validation, reconnects one player, and plays a full expedition using ordinary game inputs. Optional REPORT_PATH writes a JSON result.

Rooms preserve six seats for reconnects and replay. In the lobby, only the connected host can release a disconnected pilot using `{type: "dismiss", playerId}`. The room confirms there is no active socket, removes the seat and revokes its reconnect token. Joining again after release requires the user to explicitly choose a fresh seat. When all pilots leave, a new or returning pilot becomes host. Empty rooms stop their simulation alarms. NPC counts are fixed at 15. At launch, enemy health scales by 12% per extra connected pilot, capped at six pilots; late joins do not change existing enemy health. Planetary cores unlock dreadnought boarding in Expedition. Cover boxes are shared in the public view and authoritatively stop movement, projectiles and melee line of sight. Enemies navigate these solids and expose locked-aim charge warnings. The Jarl changes attack phase at half health. Initial launch and a new late entry provide ten seconds of protection; reconnecting does not renew it. Reconstruction provides two seconds. Zone transit provides two seconds at most once per ten seconds. An actual shot or blade attack ends active protection. Cooperative allies cannot damage one another. Vanguard Skirmish permits player damage and reactor sabotage, and ends when the first pilot reaches twelve score from kills and core captures.

## Added combat protocol

`input.guard` is optional and defaults to false for older clients. Guard drains 20 energy per simulated second, reduces frontal damage by 60%, reduces movement speed to 45%, and prevents firing and boosting. Public player fields include `guard`, `vx`, `vy`, and `vz`.

`{type: "dash"}` is a ground-only action requiring 25 energy and a 3.5-second cooldown. The dodge lasts three simulation ticks at triple ground movement speed and avoids damage during those ticks. Its direction uses current movement, falling back to facing when stationary. Public fields `dashing` and `dashCooldown` communicate the state.

`view.obstacles` contains axis-aligned boxes `{id,zone,x,y,z,hx,hy,hz,kind}`; dimensions are half-extents. Visuals must use these same coordinates. NPC views add `role`, `boss`, `phase`, `hpMax` (alias of `maxHp`), and nullable `telegraph: {kind,endTick,yaw,pitch}`. Charge aim is locked at the beginning of the warning. `objective.stage` and `objective.briefing` describe the current expedition leg.

Additional event types are `dash`, `guard`, `block`, `shieldBreak`, `telegraph`, `bossPhase`, and `impact`. These are presentation cues; all damage and movement remain server-owned. Existing private reconnect tokens and socket ownership are unchanged.

Room rules schema version 2 upgrades earlier persisted rooms when read or acted on. It supplies missing combat fields without resetting hull, score, cores or phase. If an old actor overlaps newly physical cover, it is moved to the nearest free side of that solid. Reactor sabotage remains lethal ship destruction and bypasses brace/dodge; active launch or reconstruction/travel protection still prevents the interaction.
