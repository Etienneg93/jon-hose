# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # serve at http://localhost:5173 (edit + refresh; no build step)
npm run build     # write ./dist with cache-busted asset URLs
npm run preview   # build then serve ./dist at http://localhost:5174
```

There is no test suite or linter. The game also runs by opening `index.html` directly via `file://` — no server needed.

## Architecture

Plain `<script>` tags with no bundler or ES modules — the game runs from `file://` as-is. Everything shares a single global namespace `JH` (set on `window`).

**Script load order** (defined in `index.html` and must be respected):

```
config → assets → input → world → entities → upgrades → game → main
```

### Files

| File | Responsibility |
|------|----------------|
| `js/config.js` | **Single source of truth for all tunables.** Player stats, enemy archetypes, boss data, wave definitions, palette, SFX descriptors. Adjust game balance here only. |
| `js/assets.js` | `JH.Assets` — procedural pixel-art draw functions + WebAudio SFX/music. Sprites registered by name (`jon`, `mook`, `charger`, `pyro`, `boss`, `switch`, `shopkeeper`, `hydrant`, pickups). |
| `js/input.js` | Keyboard + gamepad → normalized input state consumed each frame. |
| `js/world.js` | `JH.Geo` (coordinate math, hit detection), `JH.Camera`, `JH.Background` (parallax). All spatial helpers live here. |
| `js/entities.js` | `Entity` base, `Player`, `Enemy`, `Boss`, `Particle`, pickups, `ShopNPC`. Every entity implements `update(dt, game)` and `draw(ctx, cam)`. |
| `js/upgrades.js` | Upgrade tree definitions and `apply(player)` logic; `JH.Upgrades` shop data model with `computeStats()`, `buy()`, `isAvailable()`. |
| `js/game.js` | `JH.Game` — fixed-step loop, scene/state machine (`title → play ⇄ pause → win/over`), wave spawner, HUD, camera advance, hover shop panel. |
| `js/main.js` | Bootstrap only: DPR-aware canvas sizing via `fitCanvas()`, wires `DOMContentLoaded`, calls `JH.Game.init()`, key handlers. |

### Coordinate model

```
worldX   — horizontal position along the level (0 .. JH.LEVEL_LEN = 4380)
worldY   — depth on the floor plane (JH.DEPTH_MIN=0 .. JH.DEPTH_MAX=86)
z        — jump height above the floor (0 = grounded)

screenX  = worldX - camera.x
screenY  = JH.FLOOR_TOP + worldY - z   (feet-baseline anchor, FLOOR_TOP=168)
```

Logical resolution is **480×270** (16:9). `ctx.setTransform` maps all drawing to this logical space regardless of the physical display — use logical units everywhere. `imageSmoothingEnabled = false` for crisp nearest-neighbor scaling.

### Game loop

Fixed-timestep accumulator at `JH.FIXED_DT` (1/60 s), driven by `requestAnimationFrame`. `JH.MAX_STEPS = 5` clamps spiral-of-death on lag spikes.

### State machine

```
title → play ↔ pause → win / over
```

The `shop` HTML overlay state still exists but the primary shop interaction is a **canvas hover panel** (`drawHoverShop`) drawn during `play` state when `this.nearShop` is true. The HUD is hidden (`visibility: hidden`) while the hover shop is visible.

### Wave system

`WAVE_TRIGGERS` in `game.js` is an array of worldX positions. When the player crosses a trigger, the next wave from `JH.LEVEL1.waves` starts. After clearing a wave, `waveCleared_()` spawns a `ShopNPC` 150px before the next trigger. Wave types: normal spawns, `boss: true` (mid-boss or final boss), `wall: true` (barricade + continuous spawns), `tough: true` (all enemies spawn as elites).

### Upgrade tree (`js/upgrades.js`)

5 branches × 3 tiers = **15 nodes** total. `JH.Upgrades.computeStats(owned)` deep-copies `JH.PLAYER` base stats and replays each owned node's `apply(s)` — bonuses are per-node increments, cumulative.

| Branch | Focus |
|--------|-------|
| PRESSURE | Spray damage, beam concentration (pw1→pw2→pw3 Hydro Lance) |
| REACH | Stream range + knockback (rc1→rc2→rc3 Split Stream) |
| TANK | Water capacity, regen, Closed Loop water return (tk1→tk2→tk3) |
| MOBILITY | Move speed, dash cooldown, Hydro-Dash boost, Kinetic Tap regen (mb1→mb2→mb3) |
| VITALITY | Max HP, dodge chance (Second Wind), vampiric heal (vt1→vt2→vt3 Vampiric Hose) |

New player stats added to `JH.PLAYER` (must always have zero/false defaults for `computeStats()` to work):
- `dodgeChance` — fraction chance to negate a hit (Second Wind)
- `vampiricRate` — fraction of spray damage converted to HP (Vampiric Hose)
- `splitStream` — spray arcs 30% dmg to a nearby secondary target (Split Stream)
- `moveRegen` — bonus water/sec regen while moving (Kinetic Tap)
- `dashBoost` / `dashBoostDur` — speed boost after dashing (Hydro-Dash)
- `waterReturn` — water refunded per sec while hitting a target (Closed Loop)

### Assets API

```js
Assets.draw(ctx, key, x, y, facing, opts)
// opts: { frame, state, t, hurt, wind, elite, scale, waterFrac }
// scale: multiplies all p() rect dimensions/positions (used for elite 1.08×)
// waterFrac: 0-1 passed to jon painter for backpack tank water level indicator
// elite: boolean — color-shifts mook/charger/pyro sprites and adds bulk

Assets.shadow(ctx, sx, sy, radius)  // elliptical floor shadow
```

Painters are registered with `Assets.register(key, fn)` where `fn(p, opt, ctx, x, y, facing)`. The `p(lx, ly, w, h, color)` helper draws a mirroring-aware filled rect: `ly=0` = feet, positive `ly` = upward from feet.

### Elite enemies

Act 2 waves (`tough: true`) spawn enemies with `this.elite = true`. Elites get:
- HP ×1.5, damage ×1.3, speed ×1.12, suds ×1.4
- `bodyW` ×1.22, `bodyH` ×1.16 (updated on the entity after def scaling)
- Amber fill ellipse at feet, larger shadow, color-shifted sprite, `scale: 1.08`

### Fire hydrants

`JH.HYDRANTS` places 5 hydrants along the level. Standing within `JH.HYDRANT.range` (30px) refills water at 50 units/sec and heals HP at `healRate` (8 HP/sec) only when not in combat (no recent damage).

### Audio

- `JH.AudioFX` — procedural WebAudio SFX, keyed by `JH.SFX` descriptors in `config.js`
- `JH.Music` — two-track background music with cross-fade; boss music starts on boss encounter

### Extending the game

- **Balance:** edit numbers only in `js/config.js`.
- **New enemy type:** add archetype to `JH.ENEMIES` in `config.js`, implement AI subclass in `entities.js`, add painter in `assets.js` with `Assets.register(key, fn)`.
- **New wave:** add entry to `JH.LEVEL1.waves` in `config.js` and a matching X-position to `WAVE_TRIGGERS` in `game.js`.
- **New upgrade node:** add to `NODES` array in `upgrades.js`. Any new player stat the node sets must first be declared with a zero/false default in `JH.PLAYER` in `config.js`.
- **Hover shop:** `drawHoverShop()` in `game.js` reads `JH.Upgrades.nodes` and `JH.Upgrades.branches` directly — adding nodes to upgrades.js automatically appears in the shop.
