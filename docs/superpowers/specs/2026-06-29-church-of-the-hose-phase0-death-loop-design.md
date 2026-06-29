# Church of the Hose — Phase 0: The Church & the Death Loop — Design

**Date:** 2026-06-29
**Status:** Approved design — to become an implementation plan (writing-plans next).
**Umbrella vision:** `docs/superpowers/specs/2026-06-29-church-of-the-hose-progression-overhaul-vision.md`
**Phase:** 0 of 4. This is the keystone: it replaces full-reset death with a
meaningful death loop. Phases 1–3 (gear economy, spiritual talent tree, elemental
archetypes) build on top and are **out of scope here**.

## Goal

Replace the current "death = total wipe → restart at wave 1" behavior
(`gameOver()` at `js/game.js:655` → `startGame()` → `JH.Upgrades.reset()`) with:

> Die → a death sequence → the **Church of the Hose** (a short, atmospheric,
> walkable interlude with Father Jon and the Altar of Elements) → bank **Holy
> Essence** → spend it on a blessing → **portal back, resuming at your act-start
> checkpoint with your build intact.**

Phase 0 ships the *loop and the place*, with a minimal 3-blessing altar that
seeds the Phase 2 talent tree. Placeholder art throughout.

## Design pillars (Phase 0 slice)

- **Death is progress, never a wipe.** You keep your build and resume at the
  current act's start — not wave 1.
- **The Church is a place, not a menu.** A mysterious walk → discovery → Father
  Jon → (ceremony) → boon → portal. Atmosphere first.
- **Ceremony stays sacred.** The full experience plays on first visit and the
  first time each element is unlocked; repeat visits are abbreviated.
- **Forward-compatible.** Essence, blessings, and the shrine→element map are the
  seeds the later phases grow from — no throwaway work.

---

## 1. Game states & the death flow

Follows the established death-sequence convention already specced for bosses
(`docs/superpowers/specs/2026-06-28-boss-death-sequence-design.md`): a dedicated
state + a `deathSeqT` timer + an `update<State>` method + a render overlay.

Current states: `play`, `pause`, `over` (+ cutscene handling). Add two:

- **`playerDeathSeq`** — the death animation + fade + spirit flicker. World frozen.
- **`church`** — the walkable Church interlude (its own internal sub-phases).

The `over` screen is **retired from the death path** (all deaths now route to the
Church). It may remain as a future manual "give up / quit" affordance — out of
scope here.

### Death sequence timeline (`playerDeathSeq`)

All durations are `JH.CHURCH` tunables; starting values:

| Window | What happens |
|---|---|
| 0 s | `"hurt"`/`"die"` SFX, hitstop + `shake`. Jon enters death pose (placeholder: collapse + water-spurt). World frozen. |
| 0 – 1.2 s | Jon death animation holds. |
| 1.2 – 2.0 s | Black overlay alpha ramps 0 → 1 (fade to black). |
| 2.0 – 2.8 s | On black: **spirit flicker** — a ghostly Jon fades/flickers in (placeholder). |
| 2.8 s | State → `church`; spirit spawns at the Church entrance. |

Player takes no input and cannot be hurt during `playerDeathSeq` (update loop
frozen for actors, mirroring `bossDeathSeq`).

---

## 2. The Church scene (`church` state)

A small side-scrolling scene that **reuses the existing player movement + camera +
side-scroll render**, in a dim, ambiguous environment. Encapsulated in a new
`JH.Church` module (`js/church.js`) so `js/game.js` doesn't bloat; `game.js`
delegates to it while `state === "church"`.

### Internal sub-phases

1. **`walk`** — player-controlled. The spirit walks forward through the haze.
   The Altar of Elements sits at `JH.CHURCH.altarX`. Reaching it (a positional
   trigger, like `checkWaveTrigger`) advances to `discover`.
2. **`discover` → Father Jon cutscene** — reuses the cutscene/portrait system
   (Quake Walker pattern, `js/game.js:286–423`; `this.cutscene` object +
   `drawCutscene`). Father Jon's portrait + sermon: explains where you are,
   encourages you onward.
3. **`ceremony`** — for each unlocked-but-not-yet-celebrated element, a short
   shrine-lighting cutscene plays in sequence (its shrine animates from dim to
   lit). Marks that element celebrated. (Phase 0: at most Earth/Quake.)
4. **`altar`** — the boon menu (Section 4). Player picks a blessing (or skips).
5. **`portal`** — a portal graphic appears; interacting returns to the world
   (Section 3 — respawn at checkpoint).

### First-visit-full vs. abbreviated (anti-repetition)

Persistent flags (Section 5): `churchVisited` and `ceremonyDone[element]`.

- **Full** (first visit ever, OR a newly-unlocked element this death): long walk
  (spawn far from altar), Father Jon's full sermon, ceremony for each
  not-yet-celebrated unlocked element.
- **Abbreviated** (every other visit): spawn near the altar (short walk),
  already-lit shrines glow ambiently (no ceremony), Father Jon gives one brief
  varying line.
- **Always present:** the altar boon-pick and the portal — that's the real loop.

A small pool of Father Jon lines varies by progress (act reached / how you died)
for cheap reactivity.

---

## 3. Checkpoints — resume at act start

Acts are bounded by boss clears. Act-start wave indices (from the existing
`JH.LEVEL1.waves` act-boundary comments) are made explicit:

```
JH.ACT_STARTS = [0, 5, 8, 10]
// 0  Act 1 (WAVE 1)         — start of game
// 5  Act 2 (WAVE 5)         — after The Big Drip
// 8  Act 3 (RUBBLE ROW)     — after The Switch
// 10 Act 4 (WAVE 6)         — after Quake Walker
```

- `this.checkpointWave` = the largest `ACT_STARTS` value ≤ the current
  `waveIndex`, updated as waves start.
- **Returning from the Church** re-enters `play` and resumes at
  `checkpointWave`: player at `WAVE_TRIGGERS[checkpointWave]`, **full HP**, enemies
  cleared, that act's first wave re-armed. **The build is NOT reset** — unlike
  `startGame()`, the Church-return path does **not** call `JH.Upgrades.reset()`.
  Suds and skill-tree purchases persist across deaths within a campaign.
- A brand-new campaign (fresh load / explicit new game) still resets the in-run
  tree via the existing `startGame()`; Church-return is a separate respawn path.

**Accepted Phase 0 consequence:** because death keeps your build and resumes
mid-campaign, the game becomes effectively unloseable in Phase 0. That is the
intended proof of "death isn't a wipe"; stakes/difficulty re-tuning is later work.

---

## 4. Holy Essence & the altar

### Earning essence

Banked on each death, scaled by *this life's* progress so deeper deaths pay more,
never zero. Tracked via `lifeWavesCleared` / `lifeKills`, reset on every (re)spawn.

```
JH.CHURCH.essence = { perWave: 6, perKill: 1, min: 8 }   // tunables
award = max(min, lifeWavesCleared * perWave + lifeKills * perKill)
```

### The blessings (3, repeatable — seed of the Phase 2 tree)

Repeatable with rising cost, reusing the Overcharge pattern
(`JH.Balance.repeatableCost(base, n)` in `js/upgrades.js`). Permanent.

| id | Blessing | Effect | base cost |
|---|---|---|---|
| `bless_dps`   | Anointed Pressure | +4 `sprayDamage` | 30 |
| `bless_tank`  | Deep Reservoir    | +15 `maxWater`   | 25 |
| `bless_range` | Long Reach        | +8 `sprayRange`  | 30 |

(Magnitudes/costs are `JH.CHURCH` tunables, fine-tuned by playtest.)

### How blessings reach the player's stats

`JH.Upgrades.computeStats()` is extended to fold the **permanent** Church blessings
onto the base block (additively, like `REPEATABLES`), reading `JH.Church.blessings`
counts. Because they live in `JH.Church` (not `JH.Upgrades`), they survive
`Upgrades.reset()` and apply at the start of *every* run — the permanent floor the
per-run tree stacks on.

---

## 5. Persistence

A small persistence layer in `JH.Church` (localStorage, single JSON key,
e.g. `jonhose.church.v1`):

```
{ essence, blessings: { bless_dps, bless_tank, bless_range },
  churchVisited, ceremonyDone: { earth, fire, air, water } }
```

- `load()` on boot; `save()` after essence award and after each altar purchase.
- This is the intended *permanence* of meta-progression (persists across browser
  sessions). A full reset is **debug-only** (clear the key) — no in-game reset UI
  in Phase 0.
- Robust to missing/corrupt data: fall back to defaults.

---

## 6. Components / files

| File | Change |
|---|---|
| `js/config.js` | New `JH.CHURCH` block (scene layout: `length`/`altarX`/`portalX`/`spawnFar`/`spawnNear`; death-seq durations; essence formula; blessing defs; shrine→element map). `JH.ACT_STARTS = [0,5,8,10]`. New `JH.PAL` keys for Church/spirit/Father-Jon placeholders. |
| `js/church.js` *(new)* | `JH.Church` module: persistent state + `load`/`save`; the scene state machine (`enter`, `update(dt)`, `render`, input handling, sub-phases); essence award; altar buy logic; exposes `blessings` for `computeStats`. Keeps the Church self-contained and testable. |
| `js/upgrades.js` | `computeStats()` folds `JH.Church.blessings` onto the base stats (permanent layer). |
| `js/game.js` | New `playerDeathSeq` + `church` states; death routing (`gameOver`/player-death → `playerDeathSeq` → `church`); `deathSeqT` timeline + fade/spirit render overlay; `checkpointWave` tracking (act start); Church-return respawn path (no `Upgrades.reset()`); `lifeWavesCleared`/`lifeKills` tracking; delegate update/render to `JH.Church` while `state === "church"`. |
| `js/assets.js` | Placeholder painters: Jon death pose, spirit flicker, Father Jon portrait, Church backdrop, Altar of Elements, four shrines (dim/lit), portal. |
| `index.html` | Add `<script src="js/church.js">` (before `game.js`). |

**Isolation note:** the Church is its own module with one job (run the death
interlude + own the meta-persistence). `game.js` only needs to know: route death
to it, delegate update/render while in it, and accept a "respawn at checkpoint"
callback when it finishes. `computeStats` only needs the blessing counts.

## 7. Art (placeholder, per CLAUDE.md art pipeline)

All Church visuals ship as **procedural placeholder painters** so the loop is
playable immediately; real pixel-art (Church backdrop, Father Jon portrait, spirit,
altar, shrines, portal) is a parallel art-pipeline track swapped in at the painter
seam. Don't over-detail placeholders.

## 8. Testing / verification

No automated tests exist; manual per project convention, **except** pure logic
worth locking with Node `node:test` (the `js/balance.js` pattern):

- Essence award formula (`lifeWavesCleared`, `lifeKills` → essence).
- Checkpoint resolution (`waveIndex` → correct `ACT_STARTS` entry).
- Blessing folding in `computeStats` (counts → stat deltas) and persistence
  round-trip (`save` → `load` → equal).

Manual checks (dev wave-select, backtick, 999 Suds):
- Die in each act → land in the Church → return at that act's first wave with
  build + Suds intact, full HP.
- First death: full walk + Father Jon + (Earth ceremony if Quake beaten).
  Second death: abbreviated, shrine already glowing, no ceremony.
- Buy a blessing → essence spent, effect applies this run **and** persists after a
  page reload.
- Essence is never zero on death; deeper deaths pay more.
- No console errors; normal wave/boss flow and the boss-death sequence unaffected.

## 9. Out of scope (later phases / parallel tracks)

- **Gear economy** (Suds → per-run hose gear, skill-tree replacement) — Phase 1.
- **Full spiritual talent tree + boon variety** — Phase 2. Phase 0 ships only the
  3-blessing seed.
- **Elemental archetype branches / new powers** — Phase 3 (needs Slayer & Ass Man
  bosses). Phase 0 only *lights* shrines for already-redeemed allies (Earth today).
- New bosses (Slayer/Fire, Ass Man/Air).
- Real (non-placeholder) art.
- Difficulty/stakes re-tuning around the now-unloseable death loop.
- In-game meta reset UI.
