# The Slayer & Fire World — Design

**Date:** 2026-06-30
**Status:** Approved design — to become an implementation plan.
**Context:** Act 3 of the game's planned expansion (see `docs/superpowers/specs/2026-06-30-next-level-vision.md`,
pillar 5). The Slayer is a Fire-element boss who fights using a pool cue and flaming
billiard balls; after defeat he joins the Church as the Fire ally, lighting the Fire
branch of the Elemental Mirror. This spec covers two new shared mechanics (Burn DoT,
Fire Patch) and four new entities (The Slayer + Smelt, Fuse, Furnace). Wave placement
and the multi-round wave system are deferred — see Out of Scope.

## New Mechanic 1 — Burn DoT (Player-side)

A stacking damage-over-time effect applied to the player by fire sources.

**Fields on `Player`:** `burnStacks` (int, 0–3 cap), `burnTimer` (float, seconds).

**Application:** any fire source (Fireball hit, Fuse death-burst, Furnace vent) calls
`player.applyBurn(n)` which adds `n` stacks (clamped to `JH.FIRE.maxBurnStacks = 3`)
and resets `burnTimer = JH.FIRE.burnDuration = 2.0`. Timer is refreshed, not extended.

**Tick:** each frame while `burnTimer > 0`:
```
player.hp -= player.burnStacks * JH.FIRE.burnDpsPerStack * dt
player.burnTimer -= dt
```
When timer expires, `burnStacks` clears to 0. Max damage at 3 stacks: 12 dps for 2s =
24 hp per full burn cycle — meaningful but not lethal on its own; it punishes ignoring
fire sources for too long.

**Config block** (`js/config.js`, after `JH.COMBO_WINDOW`):
```js
JH.FIRE = {
  burnDpsPerStack: 4,   // hp/s per burn stack (max 3 stacks → 12 hp/s)
  burnDuration: 2.0,    // seconds the burn lasts (refreshed on reapplication)
  maxBurnStacks: 3,
};
```

**No new HUD** needed — the existing HP bar shows the drain. A brief red-tint hurt-flash
on the player during burn ticks communicates the state visually.

---

## New Mechanic 2 — Fire Patch (World Object)

A stationary burning ground zone left behind by fire events. Applies burn to the player
on overlap. Extinguishable by spraying (time-based, shrinks visually as spray accumulates).

**Class:** `FirePatch` — minimal standalone class (same pattern as `DeployedShield`),
tracked in `game.firePatches[]`.

**Fields:**
```js
{ x, y, z: 0, radius, extinguishDur, sprayProgress: 0, dead: false, t: 0 }
```

**Per-frame behavior:**
- While player overlaps (`dist(player, patch) < radius + playerBodyW/2`): apply 1 burn
  stack per `JH.FIRE.patchBurnInterval = 0.4s` (rate-limited, not every frame)
- While player spray hits it (checked at the bottom of `doSpray`, same as the barricade
  check): `sprayProgress += dt`
- When `sprayProgress >= extinguishDur`: `dead = true` (extinguished)
- `sprayProgress` pauses when spray is not aimed at it — does NOT decay back

**Visual:** placeholder — drawn as a glowing floor oval, shrinks as it's extinguished:
```js
currentRadius = this.radius * (1 - this.sprayProgress / this.extinguishDur)
```
Flicker via `Math.sin(t * 18)` modulating opacity between two fire palette colors.

**TODO (art):** replace the procedural oval with a real fire-patch sprite (`sprites/environment/fire_patch.png`). Sprite should be a looping animated floor decal (3-4 frames, burning embers/flame on the ground). The shrink as-extinguished effect can still be applied by scaling the sprite down toward the center using `ctx.scale`. Add to asset-generation-prompts when prioritizing next art pass.

**Sources and sizes:**

| Source | radius | extinguishDur |
|---|---|---|
| Fuse death-burst | 22 | 0.8s |
| Slayer fireball impact | 28 | 1.4s |
| Smelt smash | 32 | 2.0s |

**Config** (in `JH.FIRE`):
```js
patchBurnInterval: 0.4,  // seconds between burn-stack applications while standing in patch
```

---

## The Slayer (Boss)

**Identity:** A leather-clad brawler who fights like a pool shark — he summons flaming
billiard balls and drives them with a pool cue, striking them so hard they ignite in
flight. After defeat, joins the Church as the Fire ally (same ally-cutscene pattern as
Quake Walker), lighting the `elements.fire` flag and unlocking the Fire Mirror branch.

**Sprite states (all created by the user):**
- `idle` — default stance; weight on back foot. Used while charging up for movement (see
  below) — the fire-particle build-up plays over the idle pose, so no separate "charging"
  sprite is needed.
- `dash` — aerodynamic lean; used for **all movement**: the Slayer has no walk cycle.
  When he wants to reposition, he charges up in the idle pose with intensifying fire
  particles, then snaps to the dash pose and zips to the target position.
- `cueWind` — cue drawn back, pool ball materializing in front of him (static, held for
  wind duration)
- `cueRelease` — cue snapped forward, ball just left frame (brief flash, ~0.15s)

**Fireball projectile:** `sprites/slayer/fireball.png` — a separate small 2-frame
sprite (pool ball → catches fire); see asset-generation-prompts for the full art brief.

**Config block** (`js/config.js`, after `JH.QUAKE` at line ~365):
```js
JH.SLAYER = {
  name: "The Slayer", hp: 1100, bodyW: 44, bodyH: 58,
  touchDmg: 15, contactCd: 0.9, suds: 280, color: "slayerBody",
  // Movement: charge-up → dash (no walk cycle)
  chargeDur: 0.75,       // seconds of fire-particle build-up before the dash executes
  dashSpeed: 380,        // px/s during the dash itself (very fast)
  dashDist: 220,         // max px the dash covers
  dashTell: 0.15,        // brief hold in dash pose before launching (visual beat)
  // Attack: Fireball Volley
  volleyWind: 0.9,       // cue wind-up telegraph duration (s)
  volleyCd: 2.4,         // cooldown between volleys
  volleyRange: 200,      // px: triggers volley when player is within this distance
  ballCount: 2,          // balls per volley (normal phase)
  enrageBallCount: 3,    // balls per volley (enraged)
  ballSpawnOffset: 22,   // px forward of Slayer center where the pool ball materializes
  ballStagger: 0.18,     // seconds between each ball in a multi-ball volley
  igniteDelay: 0.12,     // seconds after launch before ball visually ignites + deals burn
  // Attack: Slam
  slamWind: 0.75, slamDmg: 22, slamRange: 38,
  // Behaviour
  enrageAt: 0.40,        // HP fraction that triggers enrage
};
JH.FIREBALL = {
  speed: 155, dmg: 14, burnStacks: 2, radius: 14, lifespan: 2.6,
};
```

**State machine:**

1. **Charge** (`"idle"` sprite + escalating fire particles) — the Slayer's ONLY movement
   mode. When he needs to reposition (open volley, escape close range, or start the
   fight), he roots in place in the idle pose while `burst()` particles build up around
   him for `chargeDur` seconds, intensifying each frame. Then he snaps to:
2. **Dash** (`"dash"` sprite) — holds the pose for `dashTell` seconds (brief visual beat),
   then zips up to `dashDist` px toward the target position at `dashSpeed` px/s. The
   dash leaves a **fire trail** (see note below). Slayer has no continuous walk motion —
   all repositioning is charge → dash.
3. **Volley** (trigger: player within `volleyRange` after landing from a dash OR cooldown
   expires): enters `cueWind` state for `volleyWind` seconds, then fires `ballCount`
   `Fireball` projectiles one after another at the player's current depth row, spaced
   `ballStagger` seconds apart. Each `Fireball` spawns at `ballSpawnOffset` px in front
   of the Slayer, starts as a plain pool ball, ignites after `igniteDelay` (applies burn
   on hit, leaves a `FirePatch` at impact).
4. **Slam** (trigger: player within `slamRange + 10px`): wind-up telegraph zone at his
   feet, then punch. If hit: `slamDmg` + `game.shake`. No burn.
5. **Enrage** (below `enrageAt` HP): `ballCount → enrageBallCount`, `chargeDur` shortens
   by 30%, volley timing 20% faster.

**Fire trail (dash):** during the dash, emit `burst()` particles in orange/yellow along
the path. Whether the trail also spawns `FirePatch` objects is TBD pending confirmation
— see design note below.

> **Design note — dash trail hazard:** should the dash trail leave actual `FirePatch`
> objects at intervals along the path (e.g. one patch every ~40px of dash distance),
> or stay visual-only? Fire patches would make the trail a genuine hazard to extinguish
> and reward players for repositioning during the charge. Awaiting user confirmation.

**Ally cutscene:** same structure as the Quake Walker branch (`waveIndex === N` check in
`waveCleared_()`, `nextWave: N+1`, `afterCutscene()` banner). Exact wave index is
determined during implementation once the wave-flow pacing spec lands.

---

## Enemy 1 — Smelt (Regular, Arena-Control)

**Identity:** A slow, heavy fire-worker who smashes the ground to create fire patches.
Spray is half-effective against it (it's dense/hot — water flashes off rather than
soaking). The threat is accumulated fire-patch real estate across rounds.

**Config** (in `JH.ENEMIES`, after `stalker`):
```js
smelt: {
  name: "Smelt", hp: 80, speed: 20, touchDmg: 10, contactCd: 1.0,
  waterMult: 0.5,        // spray does half damage (dense material, not a shield)
  smashWind: 0.8,        // telegraph wind-up (s)
  smashCd: 2.8,          // cooldown between smashes
  smashPatchRadius: 32,  // fire patch radius at landing
  smashPatchDur: 2.0,    // extinguish duration for the patch
  suds: 20, dropMult: 1.4, bodyW: 22, bodyH: 34, color: "smelt",
},
```

**AI:** extends `Enemy`, overrides `think()`. Uses inherited `windTimer`/`cdTimer`. When
player is within `this.bodyW + 14px` (melee-adjacent): starts smash wind-up via `windTimer
= d.smashWind` (state `"wind"`). On wind-up expiry: spawns `FirePatch` at the Smelt's
current position, sets `cdTimer = d.smashCd`. The smash IS its melee — no separate contact
damage attack (contact damage from `Enemy.update` still applies if the player runs into it
during movement).

**Counter-play:** focus spray to burn it down before it builds too many patches. In
multi-round waves, two Smelts quickly tile the arena.

---

## Enemy 2 — Fuse (Regular, Death-Placement Puzzle)

**Identity:** Low-HP melee rusher. Dies in under 2 seconds at full Jon DPS — the mechanic
is entirely about WHERE it dies. Death triggers a burst that leaves a fire patch + applies
1 burn stack if Jon is within range. Killing them carelessly seeds the arena for the next
round.

**Config**:
```js
fuse: {
  name: "Fuse", hp: 28, speed: 78, touchDmg: 8, contactCd: 0.6,
  waterMult: 1.0,
  deathPatchRadius: 22,  // fire patch radius on death
  deathPatchDur: 0.8,    // extinguish duration for the death patch
  deathBurnRange: 30,    // px: if Jon within this on death, +1 burn stack
  suds: 12, dropMult: 1.0, bodyW: 14, bodyH: 24, color: "fuse",
},
```

**AI:** pure melee chaser, inherits `Enemy.think()` with no overrides. Death behavior
in `Fuse.die(game)` override: spawn `FirePatch`, check `dist(game.player, this) < d.deathBurnRange`
→ apply 1 burn stack if so.

**Counter-play:** herd it away from chokepoints and other enemies before killing; or
accept the patch and spend spray time extinguishing it next round. In a 4-5 round wave,
Fuse corpse-patches compound fast.

---

## Enemy 3 — Furnace (Curated Elite, Rhythm)

**Identity:** Slow, bulky fire-golem. The threat is behavioural, not HP-based: sustained
spray causes it to heat up (reduced damage, visual glow), then vent steam (knockback +
burn). Forces the player to spray in bursts rather than holding the trigger — a
fundamentally different habit from every other enemy. **No elite-ramp** (`tough: false`
in its wave entry — it's already hand-tuned for the fire act).

**Config**:
```js
furnace: {
  name: "Furnace", hp: 320, speed: 18, touchDmg: 14, contactCd: 1.0,
  waterMult: 1.0,         // normal phase: full damage
  heatedWaterMult: 0.2,   // heated phase: 20% damage
  heatThreshold: 1.5,     // seconds of continuous spray to trigger heating
  ventWind: 0.5,          // delay after hitting heat threshold before vent fires
  ventKnock: 180,         // knockback impulse on vent
  ventBurnStacks: 1,      // burn stacks applied by vent
  ventCd: 4.0,            // cooldown before it can heat again after a vent
  suds: 55, dropMult: 1.8, bodyW: 22, bodyH: 36, color: "furnaceBody",
},
```

**AI:** `Furnace` extends `Enemy`. New fields: `lastSprayT` (timestamp of last spray hit,
init `-99`), `continuousSprayT` (accumulates while being sprayed), `heatT` (vent wind-up
countdown, -1 when inactive), `ventCdT` (post-vent cooldown). New method `onSprayHit(dt,
game)` called from `doSpray` alongside `takeDamage` (add an `e.onSprayHit && e.onSprayHit(dt, game)`
call immediately after the existing `e.takeDamage` call in `doSpray`'s damage loop —
one-line hook, no signature change to `takeDamage`). `onSprayHit` increments
`continuousSprayT += dt`; sets `lastSprayT = this.t`. In `Furnace.update(dt, game)`:
if `(this.t - this.lastSprayT) > 0.3` → reset `continuousSprayT = 0` (spray stopped).
When `continuousSprayT >= heatThreshold` and `ventCdT <= 0` and `heatT < 0`: set `heatT
= d.ventWind` (begin vent countdown). While `heatT >= 0`, apply `heatedWaterMult` to
incoming damage via a `this.waterMultOverride` checked in the damage calculation (or
override `takeDamage` to scale `dmg` before passing to super). When `heatT` ticks to 0:
vent — knockback player if `dist(player, this) < this.bodyW * 4` via `player.applyKnockback`,
call `player.applyBurn(d.ventBurnStacks)`, set `ventCdT = d.ventCd`, `heatT = -1`, reset
`continuousSprayT = 0`.

**Visual:** during heated phase, `opt.heated = true` tells the painter to render a
glowing/redder version (or use the existing hurt-flash pipeline with a warm tint).

**Counter-play:** spray in bursts. Watch for the glow. Stop. Dodge backward. Resume.
In multi-round waves, the Furnace is the "attention-tax" enemy — you can never fully
ignore it to kill other threats, because leaving it unsprayed lets the round drag, but
over-spraying it punishes you.

---

## Palette additions (`JH.PAL`)

```js
slayerBody: "#3a2010", slayerDk: "#1e0f00", slayerEmber: "#ff6010",
smelt: "#5a3020",      smeltDk: "#3a1a08",  smeltGlow: "#ff8030",
fuse: "#ff4810",       fuseDk: "#cc2800",
furnaceBody: "#4a3020",furnaceDk: "#2a1808",furnaceHot: "#ff6820",
firePatch: "#ff6010",  firePatchHi: "#ffd040",
```

---

## Sprites / Art

| Asset | Path | Status |
|---|---|---|
| Slayer — idle | `sprites/slayer/idle.png` | ✅ done |
| Slayer — dash | `sprites/slayer/dash.png` | ✅ done |
| Slayer — cue wind-up | `sprites/slayer/cueWind.png` | ✅ done |
| Slayer — cue release | `sprites/slayer/cueRelease.png` | ✅ done |
| Fireball projectile | `sprites/slayer/fireball.png` | 🔲 see asset-generation-prompts |
| Slayer portrait (neutral) | `sprites/slayer_portrait.jpg` | 🔲 |
| Slayer portrait (talking) | `sprites/slayer_portrait_mouthopen.jpg` | 🔲 |
| Smelt, Fuse, Furnace painters | `js/assets.js` | Procedural placeholder per CLAUDE.md |

---

## Components / Files

- `js/config.js` — `JH.FIRE`, `JH.SLAYER`, `JH.FIREBALL`, `JH.ENEMIES.smelt/fuse/furnace`,
  new `JH.PAL` keys
- `js/entities.js` — `Fireball` projectile class, `FirePatch` world class, `SlayerBoss`
  class, `Smelt`/`Fuse`/`Furnace` classes; `Player.applyBurn()` + burn tick in
  `Player.update()`; `Fuse.die()` override; `Furnace.takeDamage()` heat tracking;
  register all in `JH.makeEnemy`; `game.firePatches` update loop; fire-patch check at
  bottom of `Player.doSpray()`
- `js/game.js` — `game.firePatches = []` init in `startGame()` + `respawnAtCheckpoint()`;
  update/cull/draw loop for fire patches; ally cutscene branch for the Slayer
- `js/assets.js` — `SlayerBoss` sprite-sheet painter (sprite paths above); procedural
  placeholder painters for Smelt, Fuse, Furnace; `FirePatch` draw method is inline on
  the class

## Testing / Verification

Following project convention:
- **Unit-testable (node:test):** `player.applyBurn()` + `burnTimer`/`burnStacks` behavior;
  the `Furnace` heat-threshold/vent trigger logic is a good candidate for extraction as a
  pure function (`Balance.furnaceShouldVent(continuousSprayT, heatThreshold, ventCdT)`).
- **Integration / manual playtest:** all other AI behavior, fire-patch accumulation across
  rounds, Slayer fireball velocity/timing, ally cutscene trigger.

## Out of Scope

- Wave placement and multi-round wave system — tracked separately
  (`docs/` memory note: project_wave_flow_redesign). Smelt/Fuse/Furnace are designed
  for multi-round waves but work in single-round waves with reduced depth.
- Bulwark dome redesign — tracked separately (memory: project_bulwark_dome_redesign).
- Slayer ally portrait / Church dialogue lines.
- Soaked mechanic (sustained spray drenches + fire synergy) — vision pillar 2, deferred.
- True burn-DoT triggering from Fire Mirror nodes — the Mirror's fire nodes use existing
  stats (`sprayDamage`, etc.) in v1; burn-DoT hooks into those nodes are a future pass.
- Ass Man / Air act.
