# Bulwark Shield Rework — Design

**Date:** 2026-06-30
**Status:** Approved design — to become an implementation plan.
**Context:** Playtest finding on the just-shipped Bulwark (`docs/superpowers/specs/2026-06-28-super-elites-design.md`). The original "moving shield" — a permanent, facing-tracked block on the Bulwark's own body (`frontDmgMult: 0` whenever the player stood in front of its `facing`, with `facing` re-acquiring the player every `turnCooldown` seconds) — read as **completely unkillable** in practice: the slow re-face window wasn't a meaningful dash-past opportunity, so the body was effectively always shielded. This spec replaces that mechanic.

## Goal

Keep the Bulwark's identity (a shield-bearer that denies pierce/spray lanes) while fixing the unkillable feel: the Bulwark's own body is **never** a blocker. Instead it periodically **throws/plants its shield as a separate, stationary, indestructible obstacle**, then fights unarmed and fully vulnerable until it reclaims it. The player beats it by repositioning around the planted shield (different depth lane, or flanking past it in x) and by punishing the shieldless window directly.

This also sets up (but does not implement) a later follow-up: ranged allies (Pyro) using a planted shield as cover. Architecting the shield as a real, standalone world object (not Bulwark-internal state) is what makes that follow-up cheap later — see "Out of scope."

## Removed from the prior implementation

- `Balance.bulwarkShielded` (`js/balance.js`) — the facing-based shielded/vulnerable check.
- `JH.ENEMIES.bulwark.frontDmgMult` / `.turnCooldown` (`js/config.js`).
- `Bulwark`'s slow-reface `think()` logic (`js/entities.js`) — replaced by the state machine below.
- `doSpray`'s Bulwark-specific pierce-blocking branch (`js/entities.js`, the `shielding`/`blockerFwd` logic added for the body-block) — replaced by a generic "deployed shield blocks the lane" check that needs no facing at all.

None of this requires touching the wave config (`THE BULWARK LINE` still spawns 1 Bulwark + 2 mooks) or the painter's overall shape — just what triggers the shield-block visual and the body's own damage multiplier.

## State machine (`Bulwark.think()`)

1. **`armed`** — default state. Approaches the player like a normal slow melee chaser (no block, takes full damage); `this.facing` updates freely every frame toward the player, same as `Charger`/`Pyro` — no more turn-cooldown gating. Once the player is within `throwRange` (a plain distance check — no separate angle gate needed, since freely-updating facing means the Bulwark is already oriented toward whatever triggered the throw), transitions to `winding`.
2. **`winding`** — brief telegraph (`throwWind` seconds), reusing the existing `windTimer` pattern other enemies use. On expiry: **deploy**.
3. **Deploy** (instantaneous, not a timed state) — spawns a `DeployedShield` object at the Bulwark's *current* position (no projectile travel — it plants the shield where it's standing; this keeps the mechanic readable without needing new throw/projectile art or physics). Bulwark transitions to `shieldless`.
4. **`shieldless`** — for `shieldlessDur` seconds, behaves like a normal melee chaser (advance, contact damage), fully vulnerable, same as `armed` mechanically — the only difference is it has no shield to reclaim-and-rearm with yet. At the end of the duration, transitions to `retrieving`.
5. **`retrieving`** — sprints (`retrieveSpeedMult × speed`) directly toward the `DeployedShield`'s position, ignoring the player. On arrival (within a small pickup radius), removes the `DeployedShield` from the world and returns to `armed`.

If the Bulwark dies while a `DeployedShield` it owns still exists in the world (during `shieldless` or `retrieving`), the shield object is removed too — no orphaned props. (Persisting it for allies to use after its owner dies is part of the deferred ally-cover follow-up, not this phase.)

## `DeployedShield` (new world object)

A minimal standalone class, following the existing `Wall`/`GardenBox` pattern (`js/entities.js`): holds `x`, `y` (depth), a `bodyW` for hit-arc purposes, and a back-reference to its owning Bulwark (so `retrieving` knows where to go and death-cleanup can find it). Tracked in a new `game.shields` array, alongside the existing `game.enemies`/`game.pickups`/etc. lists, updated/drawn each frame like the other lightweight world objects.

**Blocking:** `doSpray`'s existing blocker-finding loop (`js/entities.js`) — already shaped to find "the nearest hard blocker in the arc, even for pierce" from the original Bulwark work — gets a second source of blocker candidates: every live entry in `game.shields`, tested with the same `Geo.inHitArc` check already used for enemies. No facing check is needed (the shield has no facing) — it blocks anyone whose spray passes through its position/depth-band, from either side, exactly like an enemy currently blocks non-pierce spray today. This is strictly simpler than the removed facing-based logic.

**Indestructible:** the shield itself never takes damage and is never a `takeDamage` target in `doSpray`'s damage loop — only a blocker for the visual stream and for damage-skipping, never a thing the player can directly destroy. Mooks standing farther along that lane (behind the shield, from the player's position) get the same "no damage" protection as before — an emergent ally-cover effect, for free.

## Tunables (`js/config.js`, `JH.ENEMIES.bulwark`)

| Field | Value | Notes |
|---|---|---|
| `hp` | **420** | Confirmed by user: should read as the toughest non-boss enemy in the game (Neighbor is 280, Big Drip boss is 620). |
| `speed` | 26 (unchanged) | Normal approach speed in `armed`/`shieldless`. |
| `touchDmg` | 14 (unchanged) | |
| `throwRange` | 80 | Roughly matches base player `sprayRange` (78) — throws once it's in your spraying distance. |
| `throwWind` | 0.5 | Telegraph before the shield plants. |
| `shieldlessDur` | 3.5 | How long it fights unarmed before sprinting to retrieve. |
| `retrieveSpeedMult` | 1.6 | Multiplies `speed` during the `retrieving` sprint. |
| `pickupRadius` | 16 | Distance at which it reclaims the shield and exits `retrieving`. |
| `shieldBodyW` | 16 | The `DeployedShield`'s `bodyW` for `Geo.inHitArc` purposes — how wide a lane it blocks. |

`frontDmgMult` and `turnCooldown` are removed (no longer meaningful).

## Components / files

- `js/config.js` — replace the `bulwark` stat block's `frontDmgMult`/`turnCooldown` fields with the table above; no new `JH.PAL` colors needed (the deployed shield reuses `PAL.bulwarkShield`).
- `js/entities.js` — rewrite `Bulwark.think()` as the 5-state machine above; add the `DeployedShield` class; extend `doSpray`'s blocker-finding (and the "skip anyone behind the blocker" check) to also scan `game.shields`; register `game.shields = []` in the game's reset/init path alongside the other per-run arrays, and clear it on `startGame`/respawn like `enemies`/`pickups` are.
- `js/game.js` — initialize/reset `game.shields`; update/draw it each frame in the same pass as other lightweight world objects (mirroring how `gardens`/the `wall` are handled).
- `js/assets.js` — the Bulwark painter drops its body-mounted shield block entirely (no more "shield rect at a fixed +x offset"); add a small standalone painter for the planted `DeployedShield` (reuse `PAL.bulwarkShield`/`bulwarkDk`).

## Testing / verification

Following the project's established split: pure/extractable logic gets a `node:test`, AI feel and live spray-blocking get manual playtest.

- **Pure & testable:** the "is the player within `throwRange` and roughly in front" gate is a clean candidate for a `Balance.bulwarkShouldThrow(bulwarkX, bulwarkY, playerX, playerY, throwRange)` pure function (mirrors how `bulwarkShielded`/`stalkerBlinkTarget` were extracted in the prior round) — this is the one place a future tuning regression (like the Stalker's `blinkDist`/`strikeRange` mismatch found last round) could silently break the trigger condition.
- **Integration / manual playtest:** the state-machine timing (`winding`→deploy→`shieldless`→`retrieving`→re-arm), the `DeployedShield` actually blocking pierce for the player and for a mook standing behind it, and the Bulwark taking full damage in every state — same manual dev-wave-select playtest process used for the original Bulwark/Stalker work.

## Out of scope

- Ranged allies (Pyro) using a `DeployedShield` as cover — a separate follow-up spec, enabled by `game.shields` already being a real, queryable world list.
- Any travel/projectile animation for the throw (it plants in place).
- Letting the player destroy the deployed shield directly.
- Multiple Bulwarks ever needing to coordinate/share a shield — each owns exactly one.
