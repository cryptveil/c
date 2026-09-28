# Tactical Strike

An original, browser-based tactical FPS: Three.js client, Node.js + Socket.IO
server. Round-based 5v5 with a buy phase, plant/defuse objective, an economy,
and two fully-playable original characters with real abilities.

This README is written to be accurate, not promotional. The "Known issues /
not implemented" section below is as important as the features list.

## Quick start

```bash
npm install
npm start
```

Then open `http://localhost:3000`. `npm install` needs internet access to
fetch `express` and `socket.io` — that wasn't available in the environment
this was built in, so **the server has been syntax-checked and unit-tested
in isolation, but never actually run end-to-end.** Please treat first boot
as a real test, not a formality — see "What's actually been tested" below.

Offline modes (Practice / Unranked / Competitive vs bots) work without any
server-side multiplayer state; Online (queue or private lobby) needs the
server running and reachable by every player.

## Hosting for other people to connect

1. Run `npm start` on a machine with a public IP or a tunnel (e.g. `ngrok
   http 3000`), or deploy to any Node host (Render, Railway, Fly.io, a VPS).
2. Set `PORT` if your host requires a specific port: `PORT=8080 npm start`.
3. Share the resulting URL. Everyone who opens it and joins the queue or a
   lobby code plays in the same server-authoritative match.
4. For a real deployment, put it behind HTTPS/WSS (a plain `ws://` socket
   will be blocked by browsers on an `https://` page) — most PaaS hosts
   (Render, Railway, Fly) terminate TLS for you automatically.

There is no database and no persistence between server restarts — matches,
queues, and lobbies all live in memory.

## What's actually been tested

Being specific here on purpose, since the brief asked not to invent test
results:

- **`npm test`** runs two real automated checks and both pass:
  - `tools/verify-map.mjs` — flood-fills the flagship map's actual collision
    geometry and confirms both spawns, all 3 sites, and the mid platform are
    reachable. It caught a real hairline-gap bug between two stair pieces on
    first run; that bug is fixed and the check now passes.
  - `tools/verify-round-engine.mjs` — 16 assertions against the round state
    machine (buy→live→planted→postround transitions, the plant-timer
    regression test, elimination rules, side switching, match-end).
- Every `.js` file has been run through `node --check` (syntax validation).
- A static script cross-checked every `import { x } from './y.js'` against
  `y.js`'s actual exports, and every DOM `id` referenced in JS against
  `index.html`. Both caught real bugs (see CHANGELOG below) that are fixed.
- **Not tested:** actually running the server, loading the page in a
  browser, or two real clients playing a match together. This sandbox has
  no internet access, so `npm install` (and therefore `node server.js`)
  could not be executed here. The code is correct to the best of a careful
  read and the checks above, but "compiles and passes unit tests" is not
  the same as "works," and you should expect to find and report bugs on
  first real playtest.

## Controls

| Action | Key |
|---|---|
| Move | WASD |
| Jump | Space |
| Crouch | Ctrl |
| Walk (slow, quiet) | Shift |
| Reload | R |
| Switch weapon | 1 / 2 |
| Fire | Left click |
| Interact (plant / defuse, hold) | E |
| Abilities | Q, C, F, V |
| Ultimate | X |
| Scoreboard (hold) | Tab |
| Pause | Esc |

Crouch was moved from `C` to `Ctrl` in this version specifically to free up
`C` for an ability slot — see Known Issues in the prototype this was built
from.

## Implemented

**Core FPS:** pointer-lock mouse aim, WASD movement, jump/crouch/walk,
gravity, height-aware collision (you can stand on crates and the mid
platform, and duck under things — the original prototype's collision only
supported flat-floor blocking), real recoil (camera kick + bloom spread
that grows with sustained fire and decays when you stop) on top of
per-shot spread, headshot/bodyshot hit detection via raycasting, reload,
weapon switching, ammo tracking, death/respawn (offline) and death/eliminate
(online, no respawn until next round — correct for round-based play).

**One flagship map (Triad Keep):** hand-authored geometry (not procedural),
3 sites, a stepped-up central platform for verticality, lane-splitting
walls so flanks matter, cover at each site, automated-verified navigability.
This is the only map wired into online matchmaking.

**12 prototype maps:** the original project's procedurally-generated
arenas, kept for offline bot practice. Site-marker and plant/defuse
coordinate bugs are fixed (see CHANGELOG) but they are not hand-built,
not server-validated, and not claimed to be "complete."

**Two original characters**, each with 4 abilities + an ultimate, real
cooldowns/charges, and real gameplay effects:
- **Vesper** (Duelist) — Surge Dash, Adrenal Boost, Phase Step, Flashpoint,
  ultimate Overdrive.
- **Warden** (Controller) — Smoke Canister (blocks vision *and* bullets —
  it's wired into the actual raycast, not just a visual), Trap Wire,
  Barrier Wall (a real temporary collider), Recon Ping, ultimate Lockdown.

The remaining roster slots (entry/duelist, recon/initiator, sentinel, and
more controller/duelist variety) are architected for — `shared/data.js`'s
`CHARACTERS` array and `shared/abilityState.js`'s engine are generic — but
not implemented. The character-select screen only shows these two; it does
not show placeholder cards for characters that don't work.

**Competitive ruleset:** attackers/defenders, round timer, 20s buy phase,
buy menu (weapons + armor, credits-gated), plant/defuse with hold timers,
bomb fuse independent of the round clock, team-elimination win conditions
(with the correct asymmetry: a wiped defense pre-plant does *not* auto-win
the round for attack — they still have to plant), round wins to 13, side
switch after round 12, win/loss credit rewards with a loss-streak bonus,
scoreboard, match result screen.

**Multiplayer, server-authoritative for:**
- Matchmaking queue (auto-starts at 10) and private lobby codes.
- Movement (rate-limited, speed-sanity-checked, and rejected if it would
  place the player inside map geometry).
- Shooting: fire-rate and ammo enforced server-side; damage, headshots,
  armor reduction, kills, and deaths are all server-decided, not
  client-reported. See the honest limitation below.
- Abilities: cooldowns, charges, and credit cost are validated server-side;
  the server broadcasts the confirmed activation and clients render the
  effect from that broadcast.
- Buy phase: credits and purchases are server-tracked; a client cannot
  grant itself money or gear.
- Plant/defuse: proximity and hold-duration are server-checked.
- Round state, economy, and match results: entirely server-owned.
- Disconnection: a leaving player is removed from the match and the room
  is torn down once empty.

## Known issues / not implemented

Being direct about this, per the brief:

- **No server-side raytracing against level geometry for hit validation.**
  The server checks fire-rate, ammo, weapon range, and a generous aim-cone
  between the shooter's reported facing and the target, and that makes
  health/kills/credits genuinely server-decided rather than client-trusted
  — but it does not verify the shot's line of sight against walls. A
  modified client could currently report a hit through a wall and the
  server would accept it if the angle/range were plausible. Closing this
  needs a server-side collision pass (the `shared/collision.js` primitives
  this project already has could be extended to a full raycast, but that
  wasn't done here).
- **No reconnection support.** A disconnected player is simply removed;
  they can't rejoin the same match.
- **Only 2 of the ~8+ requested characters are implemented.** See above.
- **Only 1 of the 13 maps is hand-built/server-validated.** The other 12
  are the original prototype's procedural arenas, offline-only.
- **No weapon-drop/pickup from eliminated players.** Purchases are
  per-round; nothing is lost or gained by looting a body.
- **No overtime.** A match tied at 12–12 currently has no defined
  resolution beyond "first to 13" not being reached — this needs explicit
  overtime rules (sudden-round-win format is typical) which aren't coded.
- **Flash/recon/tripwire reveal use a facing/distance check, not a raycast
  against geometry**, so they don't yet correctly get blocked by a wall
  between the effect and the target. Smoke and walls *do* block real
  gunfire (wired into the shooting raycast/collision), which is the more
  important mechanical piece; the vision-only effects are the looser one.
- **Slows and speed boosts share a single multiplier**, so in the rare case
  a player is both boosted and slowed at once, the more recent one wins
  rather than them combining correctly.
- **No audio.** Not attempted, not claimed.
- **No mobile/touch controls**, despite the HUD being responsive down to
  small screens.
- **Never run end-to-end** — see "What's actually been tested" above.

## Project structure

```
server.js              entry point (Express + Socket.IO, ESM)
server/
  matchmaking.js        queue + private lobby handling
  match.js               the authoritative Match class
shared/                 imported by BOTH client and server — the reason
  rules.js               round/economy/weapon/movement constants
  data.js                 map geometry + character/ability data
  collision.js            height-aware collision primitives
  roundEngine.js          the round state machine (pure functions)
  abilityState.js         ability charge/cooldown bookkeeping (pure)
public/
  index.html
  src/
    main.js               orchestrates offline (bots) and online modes
    world.js               builds the THREE.js scene from map data
    player.js              movement/physics
    weapons.js              shooting, reload, recoil
    bots.js                 practice-mode AI
    abilities.js            ability visuals/effects (imports shared/abilityState.js)
    net.js                  Socket.IO client wrapper
    ui.js                    all DOM wiring (menus, HUD, buy menu, scoreboard)
tools/
  verify-map.mjs           automated map-reachability test
  verify-round-engine.mjs  automated round-rules test
```

## CHANGELOG from the original prototype

Bugs found during the audit and fixed:
- Round timer decremented twice per frame after a bomb plant (once in the
  general round-timer line, again in the planted-branch), so the clock ran
  roughly 2x speed post-plant. Fixed by giving `live` and `planted` fully
  separate timers in `shared/roundEngine.js`.
- An unplanted round timer reaching zero froze the game on a "TIME EXPIRED"
  overlay instead of ending the round. Fixed: it's now a defender win.
- Plant/defuse only ever checked Site A's hardcoded coordinates, so 3-site
  maps were unplantable at Site B/C despite having visible pads there.
  Fixed by making every map's sites real, checked data.
- A 3-site map's second objective pad rendered at `z:+15` instead of
  `z:-15` (asymmetric by typo). Fixed.
- Collision only checked x/z against every solid, ignoring stored
  `ymin`/`ymax`, so no prop could ever be stood on and nothing could ever
  be walked under. Fixed with height-aware collision in
  `shared/collision.js`.
- Crouch only reduced movement speed; the camera never lowered and the
  hitbox never shrank. Fixed.
- Recoil only animated the gun mesh cosmetically and never affected where
  shots landed or where the camera pointed. Fixed with real bloom + a
  camera-pitch kick.


## Animation upgrade

The current build includes a procedural animation layer using original Three.js geometry rather than proprietary game assets. It adds:

- first-person arms and weapon viewmodel
- idle breathing and weapon sway
- walk/run/strafe/crouch bob
- jump and landing camera motion
- firing muzzle flash, recoil and particles
- reload, weapon-switch and inspect animations
- ability-cast VFX, dash/boost trails and rings
- hit markers, damage feedback, kill feed and round flashes
- plant/defuse progress UI
- procedural bot locomotion, hit reaction and death animation
- reduced-motion CSS handling

These are gameplay/animation equivalents inspired by the reference sheet, not copies of Riot's proprietary character models, animations, maps, textures, sounds or source code.
