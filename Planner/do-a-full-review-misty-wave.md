# Jon Hose — Full Project Review & Improvement Plan

## Context
This is a code review of the `jon-hose` beat-'em-up (a from-scratch HTML5 canvas
game). The goal of this pass is **analysis only** — produce a severity-ranked
list of findings with real `file:line` citations, then a prioritized action plan
(to be written to `IMPROVEMENT_PLAN.md` in the repo root once approved). No code
changes until the user picks what to tackle.

---

## Phase 1 — Orient

**Engine / stack (verified from files, not assumed):**
- **Pure vanilla JavaScript** (ES2015+ classes), no framework, no bundler, no ES
  modules. Plain `<script>` tags sharing a global `JH` namespace on `window`.
- Runs directly from `file://` *or* `npm run dev` (`serve@14` static host on :5173).
- **Build:** `tools/build.mjs` (Node) copies static assets to `dist/` and stamps a
  cache-busting `?v=<git-sha|timestamp>` onto every `js/*.js` + `styles.css` URL,
  plus `<meta name="build">` / `<meta name="ver">`. No transpile/minify step.
- **Rendering:** single `<canvas>` at a fixed **480×270 logical** resolution,
  `setTransform` scales to physical pixels, `imageSmoothingEnabled = false`.
- **No test suite, no linter** (confirmed — none configured).
- Versions: `package.json` 0.9.3; `serve@14` is the only npm dep (dev-time only).

**Structure / load order** (`index.html`):
`config → quake-frames → assets → input → world → entities → upgrades → game → main`
(Note: `js/jon-frames.js` is **not** loaded — see L4.)

**Core systems:**
- **Loop:** fixed-timestep accumulator at 1/60s, `MAX_STEPS=5` clamp, `requestAnimationFrame` (`game.js:500-514`).
- **State machine:** `title → play ⇄ pause → win/over`, plus `shop`, `cutscene`, dev wave-select menu.
- **World:** 2.5-D depth band (`worldX` along level, `worldY` depth 0..86, `z` jump height), camera lock per arena, parallax skyline (`world.js`).
- **Entities:** `Entity` base → `Player`, `Enemy` (Mook/Charger/Pyro/Neighbor), 4 bosses (Big Drip / SwitchBoss / QuakeBoss / GK9000), projectiles (Ember/Rock/Shockwave), `Pickup`, `Wall`, `GardenBox`, `ShopNPC`.
- **Progression:** suds currency → 15-node skill tree (`upgrades.js`), hover-panel shop between fights, anti-farm loot budget for infinite spawns.
- **Save/load:** only audio prefs persist (`localStorage` `jh_audio`, `assets.js:178-179`). Game progress is **not** saved; death fully resets the run.
- **Input:** keyboard + gamepad normalized each frame; edge detection via prev-state snapshot (`input.js`).

**Intended vs. actual:** The game is feature-complete through 14 waves / 4 acts /
4 bosses + a garden event + a cutscene. `TODO.md` shows the active direction
(sprite-sheet migration, more SFX/FX polish, co-op, "Assman" enemy). A few
systems are half-wired (see findings).

---

## Phase 2 — Findings (by severity)

### CRITICAL — none found
No unhandled exceptions, save corruption, or hard crashes in the reviewed paths.
Boss/wave indices stay in-bounds; all entities carry the fields their draw/AI read.

### HIGH

- **H1 — Garden "Neighbor" is killable mid-event, breaking it.**
  `NeighborNPC` is a normal `Enemy` (hp 280, `waterMult 1.3`) so the player's
  spray damages it like anything else (`entities.js:327` spray loop, `:551` `takeDamage`).
  Kill her before all 4 crops are watered and she's culled → no more rocks, event
  trivialized. She's also invisible except during wind-up (`entities.js:1677`), so
  this reads as "she vanished." This is the open bug in `TODO.md:12`.
  *Fix:* make the neighbor invulnerable during the garden (override `takeDamage` to
  no-op, or skip her in spray/melee targeting) so she only leaves when crops finish.

### MEDIUM

- **M1 — `clearHeal` upgrade effect is dead.** Base stat `clearHeal:0` (`config.js:94`)
  is read on wave clear (`game.js:262-264`) and after the cutscene (`game.js:296-298`),
  but **no node ever sets it** — `vt2 "Second Wind"` sets `dodgeChance` instead
  (`upgrades.js:71-73`). The "heal a chunk on area clear" never triggers.
  *Fix:* either wire `clearHeal` to an upgrade or delete the stat + its two checks.

- **M2 — `pierce` stat is set but never read; spray already pierces everything.**
  `pw3 "Hydro Lance"` does `s.pierce += 99` (`upgrades.js:32`) but nothing consumes
  `pierce` — the spray loop hits *every* enemy in the arc at all tiers
  (`entities.js:327-341`, no target cap). So "punches through the whole line" is
  already true from tier 0, making the flavor misleading.
  *Fix:* either cap targets by `pierce` at low tiers (real upgrade) or drop the stat.

- **M3 — Quake shockwave dodge is inconsistent & under-telegraphed.**
  `config.js:178-179` says "they hit you only while GROUNDED — JUMP over them," but
  **jump is a disabled feature** (no keybind, `input.js:13-22`) and `Shockwave.update`
  has **no `z`/grounded check** (`entities.js:1293`) — it hits on X-overlap across
  *all* depth lanes. The in-game banner correctly says "DASH THROUGH THE QUAKE"
  (`entities.js:1450`). Net: docs are wrong and the only dodge is a tight dash
  i-frame window (`dashTime 0.18s`).
  *Fix:* correct the comment; consider a slightly wider dash i-frame or a readable
  safe-lane so the fight isn't a coin-flip. (Decision needed — see below.)

- **M4 — Garden spawn config is dead.** `JH.GARDEN.spawnEvery/maxAlive`
  (`config.js:162`), `gardenSpawnTimer`/`gardenPool` (`game.js:160,202-203`), and the
  garden wave's `spawns:[{mook,2}]` (`config.js:210`) are set but never used — the
  garden `update` branch (`game.js:611-619`) only ticks boxes; no mid-garden
  reinforcements ever spawn.
  *Fix:* implement the intended mook pressure during the garden, or remove the dead config.

### LOW

- **L1 — Pure-vertical dash drifts sideways.** `this._dashX = mx || this.facing`
  (`entities.js:194`): an up-only/down-only dash falls back to `facing`, so it dashes
  diagonally instead of straight up/down. *Fix:* keep `_dashX = mx` (0 allowed).
- **L2 — `separate()` shoves bosses.** Bosses live in `enemies`, so the push-apart
  pass (`game.js:632-646`) jitters a boss against its summons. *Fix:* skip `isBoss`.
- **L3 — Per-frame allocations.** Four `.filter()` rebuilds (`game.js:552-554,587`)
  + `actors.slice()/sort()` every render (`game.js:683-686`) + heavy particle churn.
  Fine at current scale; flag for when counts grow (reuse scratch arrays / in-place compaction).
- **L4 — Dead/disabled code retained.** Jump & melee branches run each frame on
  always-false inputs (`entities.js:213-221`); `jon-frames.js` (`JH.JON`) is loaded by
  nothing and points at a non-existent sheet. Harmless clutter.
  *(Per project rules: do NOT re-enable jump/melee — only consider removing dead refs.)*
- **L5 — `walking` hint unused.** `Player.draw` passes `walking` (`entities.js:438`)
  but the `jon` painter ignores it (`assets.js:236-254`).
- **L6 — HUD DOM writes every frame** (`game.js:648-653`): visibility + textContent
  set unconditionally. Negligible; could write-on-change.
- **L7 — Music fade ignores pause.** `setTrack` uses `setInterval(16ms)`
  (`assets.js:136`) decoupled from the loop, so cross-fades continue while paused. Cosmetic.

### Robustness (state-leak class — Medium-ish)

- **R1 — `setTimeout`-based loot & death FX leak across restart / ignore pause.**
  Staggered coin drops (`entities.js:45` 45ms, `:53` 30ms) and boss death bursts
  (`entities.js:904,1223,1524,1842`) are scheduled on wall-clock `setTimeout`. They
  capture the singleton `game`; a restart (`startGame` resets `pickups/particles`)
  can have stale timers push coins/particles into the *new* run, and they fire
  during `pause`. *Fix:* a small in-game deferred-spawn queue ticked by `update(dt)`,
  cleared on `startGame`.

### Code health / structural

- `entities.js` is **1863 lines**; the four bosses duplicate telegraph-draw logic
  (blink-color + fill-by-progress + quadratic "arm"). GK9000 already extends
  SwitchBoss (good reuse) — a shared telegraph helper would cut the rest.
- Wave-clear heal logic is duplicated (`game.js:262` & `:296`).
- **`WAVE_TRIGGERS` (`game.js:13`) must stay length-synced with `JH.LEVEL1.waves`
  by hand** — a mismatch silently breaks progression. Add a length assert.

### Design / UX (decisions, not bugs)

- A shop vendor + GO prompt still spawn after a boss (`game.js:273`), though
  `TODO.md:13` wants no shop hint post-boss. (Banner already differentiates
  "BOSS DOWN!" vs "AREA CLEAR!" — `game.js:277`.)
- Death wipes all upgrades + suds (`startGame → Upgrades.reset`, `game.js:154`).
  Confirm this arcade-style full reset is intended (no meta-progression exists).

---

## Phase 3 — Action Plan (prioritized)

Quick wins (✅) are small, isolated, low-risk. Effort: **S** ≈ <30min, **M** ≈ 1-2h, **L** ≈ half-day+.

### Milestone 1 — Stabilize core loop (quick wins)
| # | Item | Files | Effort | Risk |
|---|------|-------|--------|------|
| ✅ H1 | Make garden Neighbor invulnerable until crops done | `entities.js` (NeighborNPC) | S | low |
| ✅ M3a | Fix Quake "jump over" docs → "dash through" | `config.js`, code comments | S | none |
| ✅ M1 | Remove (or wire) dead `clearHeal` | `config.js`, `game.js`, `upgrades.js` | S | low |
| ✅ M4 | Remove dead garden spawn config (or implement) | `config.js`, `game.js` | S | low |
| ✅ L1 | Straight vertical dash | `entities.js:194` | S | low |
| ✅ L2 | Skip bosses in `separate()` | `game.js:632` | S | low |
| ✅ CH | Assert `WAVE_TRIGGERS.length === waves.length` | `game.js` | S | none |

### Milestone 2 — Robustness
| # | Item | Files | Effort | Risk |
|---|------|-------|--------|------|
| R1 | In-game deferred-spawn queue (replace loot/FX `setTimeout`), cleared on restart | `entities.js`, `game.js` | M | medium |
| CH | De-duplicate wave-clear heal into one helper | `game.js` | S | low |

### Milestone 3 — Polish core loop
| # | Item | Files | Effort | Risk |
|---|------|-------|--------|------|
| M2 | Make `pierce` real (cap targets at low tiers) or drop it | `entities.js`, `upgrades.js` | M | medium (balance) |
| M3b | Widen Quake dash window / add readable dodge | `config.js`, `entities.js` | M | medium (balance) |
| L5/L6/L7 | Minor render/HUD/music polish | `entities.js`, `game.js`, `assets.js` | S | low |
| TODO | Garden floating "Keep watering!/GREAT!" text; "BOSS DOWN" no-shop | `entities.js`, `game.js` | M | low |

### Milestone 4 — Refactor & perf (optional, larger)
| # | Item | Files | Effort | Risk |
|---|------|-------|--------|------|
| CH | Extract shared boss-telegraph helper; consider splitting `entities.js` | `entities.js` | L | medium |
| L3 | Allocation/particle audit (reuse scratch arrays) — only if profiling shows hitches | `game.js`, `entities.js` | M | low |
| L4 | Remove dead `jon-frames.js` / disabled-code refs (keep jump/melee OUT) | multiple | S | low |

### Decisions (RESOLVED with user)
1. **Quake difficulty (M3):** ✅ Just fix the docs — keep dash-as-the-dodge, no balance change.
2. **Garden Neighbor (H1):** Make her **invulnerable** during the garden (recommended approach).
3. **`pierce`/`clearHeal` (M1/M2):** ✅ **Delete both** dead stats + their checks. No balance impact.
4. **Post-boss shop (UX):** Deferred (not in this round).

### >>> ACTIVE SCOPE: Milestone 1 — Stabilize (quick wins) <<<
Tackle these now, in order. All small/low-risk. Bump `package.json` version before commit.

1. **H1** — `NeighborNPC`: override `takeDamage()` to a no-op so spray/melee can't kill
   her; she only leaves when all crops are watered (`game.js` garden-clear already calls
   `e.die`). File: `entities.js` (NeighborNPC class ~`:1625`).
2. **M1 (delete)** — Remove `clearHeal`: drop `config.js:94`, the two heal checks at
   `game.js:262-264` & `:296-298`. Leave Second Wind's dodge intact.
3. **M2 (delete)** — Remove `pierce`: drop `config.js:91` and `s.pierce += 99` in
   `pw3` (`upgrades.js:32`). Spray behavior is unchanged (already hits all in arc).
   Update the doc line in `upgrades.js:7` that lists `pierce`/`clearHeal` flags.
4. **M3a (docs)** — Fix the "JUMP over them" wording in `config.js:178-179` (and any
   sibling comments) to say dash-through; the banner already says this.
5. **M4 (delete)** — Remove dead garden spawn config: `JH.GARDEN.spawnEvery/maxAlive`
   (`config.js:162`), `gardenSpawnTimer`/`gardenPool` (`game.js:160,202-203`), and the
   unused `spawns` on the garden wave (`config.js:210`).
6. **L1** — `entities.js:194`: `this._dashX = mx` (drop `|| this.facing`) for straight
   vertical dashes; the `(mx || my)` guard already prevents a zero-vector dash.
7. **L2** — `game.js` `separate()` (`:632`): `continue` when either enemy `isBoss`.
8. **CH** — Add a startup assert/console.warn if
   `WAVE_TRIGGERS.length !== JH.LEVEL1.waves.length` (`game.js`).

Milestones 2-4 below remain queued for later rounds.

---

## Verification (per change, once implementing)
- `npm run dev` → http://localhost:5173, or open `index.html` via `file://`.
- Dev wave-select: backtick (`` ` ``) on localhost opens "JUMP TO WAVE"; warp to the
  relevant wave (garden = index 12, Quake = index 10) to test H1/M3 directly.
  Player gets 999 suds on warp to test upgrades.
- Manual checks: spray the Neighbor during the garden (should not die); dash through
  a Quake shockwave (i-frames negate it); buy each upgrade tier in the hover shop and
  confirm stat changes (water bar, range, dmg) behave.
- No automated tests exist; verification is manual playthrough.
- Remember to bump `package.json` `version` before any commit (project rule).
