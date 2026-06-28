# Jon Hose — Improvement Plan

Generated from the full code review (June 2026). Items ordered by impact/effort.
✅ = completed in Milestone 1 (v0.9.4).

---

## Milestone 1 — Stabilize (completed in v0.9.4)

| # | Severity | Item | Files touched |
|---|----------|------|---------------|
| ✅ H1 | High | Garden Neighbor made invulnerable — override `takeDamage` to no-op so spray/melee can't kill her before all crops are watered | `entities.js` |
| ✅ M1 | Medium | Removed dead `clearHeal` stat — no upgrade ever set it; `waveCleared_` and `afterCutscene` both had unreachable heal blocks | `config.js`, `game.js` |
| ✅ M2 | Medium | Removed dead `pierce` stat — spray already hits every enemy in the arc at all tiers; `pw3` no longer sets it | `config.js`, `upgrades.js` |
| ✅ M3a | Medium | Fixed Quake Walker comment — "JUMP over them" → "DASH through them" (jump is disabled; dash i-frames are the actual dodge) | `config.js` |
| ✅ M4 | Medium | Removed dead garden spawn config — `spawnEvery`/`maxAlive` and the wave `spawns` list were never consumed | `config.js`, `game.js` |
| ✅ L1 | Low | Fixed straight vertical dash — `_dashX = mx` (was `mx \|\| this.facing`, causing diagonal drift on pure up/down dashes) | `entities.js` |
| ✅ L2 | Low | Bosses excluded from `separate()` — push-apart pass was jittering bosses against their summons | `game.js` |
| ✅ CH | Health | Added `WAVE_TRIGGERS` length assert — mismatch with wave list now logs a warning instead of silently breaking progression | `game.js` |

---

## Milestone 2 — Robustness (queued)

| # | Severity | Item | Files | Effort |
|---|----------|------|-------|--------|
| R1 | Med | Replace `setTimeout` loot/FX with an in-game deferred-spawn queue ticked by `update(dt)`, cleared on `startGame` — stale timers currently leak into new runs and fire during pause | `entities.js`, `game.js` | M |
| CH | Low | De-duplicate wave-clear heal helper (two identical blocks in `waveCleared_` and `afterCutscene`) | `game.js` | S |

---

## Milestone 3 — Polish core loop (queued)

| # | Severity | Item | Files | Effort |
|---|----------|------|-------|--------|
| M2b | Med | Decide on `pierce`: cap targets at lower tiers (making Hydro Lance meaningfully different) vs leave spray as unlimited-pierce at all tiers | `entities.js`, `upgrades.js` | M |
| M3b | Med | Quake shockwave difficulty: widen dash i-frame window and/or add a visual safe-lane if play-testing shows the timing is a coin-flip | `config.js`, `entities.js` | M |
| TODO | Low | Garden floating "+WATER" / "GREAT!" text on crop progress | `entities.js` | S |
| TODO | Low | Post-boss: suppress shop vendor spawn (per `TODO.md:13`) | `game.js` | S |
| L5 | Low | Wire `walking` state hint into the Jon sprite painter | `assets.js` | S |
| L6 | Low | HUD DOM writes on change only (not every frame) | `game.js` | S |
| L7 | Low | Music cross-fade should pause when game is paused | `assets.js` | S |

---

## Milestone 4 — Refactor & perf (optional, larger)

| # | Severity | Item | Files | Effort |
|---|----------|------|-------|--------|
| CH | Low | Extract shared boss-telegraph helper (blink-color + fill-by-progress + quadratic arm) — duplicated across Boss/SwitchBoss/QuakeBoss draw methods | `entities.js` | L |
| L3 | Low | Allocation audit — `enemies.filter()`, `actors.slice()/sort()`, particle churn run every frame; swap to in-place compaction if perf becomes an issue | `game.js`, `entities.js` | M |
| L4 | Low | Remove dead `jon-frames.js` (not loaded anywhere, points at non-existent sheet) and the disabled jump/melee `if` branches | multiple | S |

---

## Decisions already resolved

1. **Garden Neighbor** — invulnerable during garden ✅
2. **`clearHeal` + `pierce`** — deleted (no upgrade ever wired them) ✅
3. **Quake shockwave** — docs fixed only; keep dash-as-dodge, no balance change ✅
4. **Post-boss shop** — deferred to Milestone 3

## Open decisions (for Milestone 3+)

- **`pierce` revival?** Implement target-cap at low beam tiers so Hydro Lance is the only true multi-pierce, or leave spray as unlimited-pierce forever?
- **Quake difficulty** — is the current dash timing comfortable enough, or should the shockwave i-frame window expand?
