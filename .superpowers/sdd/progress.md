# SDD Progress — Air Act / Ass Man

Spec: `docs/superpowers/specs/2026-07-12-air-act-ass-man-design.md`
Plan 1: `docs/superpowers/plans/2026-07-14-air-act-1-world-roster-core.md`
Branch: `air-act`

## Status

**Plan 1 complete and pushed; branch held for user playtest.** The campaign
currently ends after wave 32. Plans 2 and 3 are not written. Nothing merges to
`main` before explicit playtest approval.

Current verification baseline: **345/345 unit tests green**. Plan 1 received
unit, review, and headless coverage; the ignored task reports and scripts in
this directory retain the detailed transcripts.

Plan 2 is now specified in
`docs/superpowers/plans/2026-07-16-air-act-2-pressure-setpiece.md` and is
ready for task-by-task execution. No Plan 2 implementation has landed yet.

## Plan 1 execution

| # | Task | Status | Commits / evidence |
|---|---|---|---|
| 1 | Sixth-act config, wave 30–32 data, act arrays, sprinkle floor | done | `4d3dee8`; 305 tests |
| 2 | Stink cloud footprint, gas pressure choke, spray dispersal | done | `ce481d6`, rim correction `81f1c0e`; task-2 report |
| 3 | Gust lanes and wave-terrain lifecycle | done | `190e7a9`; task-3 report |
| 4 | Plunger Fiend lunge/latch/tank drain/dash break | done | `22155c7`; task-4 report |
| 5 | TP Mummy drop-in, wrap snare, death shove | done | `0a4af22`, landed-hit fix `65c003f`; task-5 report |
| 6 | Gasbag vent cycle and pop-fast friendly burst | done | `3196c65`; task-6 report |
| 7 | Bidet Turret and locked-target water arcs | done | `ba6fecc`, knockback wiring `4299dda`; task-7 report |
| 8 | Air arrival, cloudline scene, vendor/checkpoint handoff | done | `57c87a2`, respawn floor `f634aae`; task-8 report + `t8-verify.mjs` |
| 9 | Whole-plan review and cross-system fix wave | done | `30f65f0`; `fixwave-report.md` + `fixwave-verify.mjs` |

## Review findings resolved

- Post-Slayer free-walk can no longer roll wave 30 before the truck sequence.
- The cloudline backdrop is gated by scene truth and does not bleed into the
  truck run.
- Air arrival clears stale combat arrays and establishes the gate as the
  minimum free-walk/respawn position.
- Plunger and TP Mummy riders apply only when `Player.takeHit` returns a
  landed hit; dodges never latch or snare.
- Gasbag remains in the hose/contact band, only records a vent after a cloud
  actually spawns, and preserves its pop-fast reward window.
- Bidet Turret is immune to separation and uses its configured landing shove.
- Stink-cloud puff wobble is capped at the shared hit footprint rim.

## Live-playtest support rounds

| Round | Result | Commits |
|---|---|---|
| Dev sim-power | Wave warps can grant act-expected levels, benedictions, and wallet so late-wave reads are not fresh-stat slaughter | `28a1b1b` |
| Gas readability | Full-tank bite, lingering burn-style choke, status indicators, sickly aura, and green sputter | `8c97d32`, `1a1cf1a`, `07b32c2` |
| Damage numbers | Dev-toggle enemy running tallies, incoming damage, crit punch, kill slam, and universal boss status pass | `aa69e15`, `60b8bec` |
| Scald / balance follow-up | Scald reads as steam; boss overlays cover custom draws; super-bulwark/furnace regressions fixed; Hydro Lance capped at target + one enemy | `82ddf82`, `bede4bb` |
| Plunger art pass | Ten generated/normalized frames (idle, walk, wind, lunge, latch, death), baked runtime painter, and visual-only death beat; the user hand-cleaned the final contact-pass-contact-pass walk cycle and it is wired to the runtime frame counter | uncommitted; **walk animation approved**; `plunger-verify.mjs` + `plunger-gallery.png` |
| Dev-range cleanup | Rejected horizontal zoning replaced by a compact 1,220-unit lab. TEST-O-MAT menus contain every benediction/relic and dispense one live specimen from the complete implemented enemy/boss roster, including all Air enemies and The Firewall; arrival banner suppressed | uncommitted; awaiting user range approval |

## Cross-cutting API state

- `Player.takeHit(dmg, game, fromX, knock)` returns `true` only for a landed
  hit and accepts an optional knockback amount.
- `Enemy.takeDamage(dmg, game, dirX, knock, crit)` accepts an optional crit
  flag for damage-number presentation.
- `Balance.unlockedPool(waves, waveIndex, fromWave)` accepts a floor so Air
  sprinkling cannot pull earlier-world enemies.

## Next work

1. User playtest gate for the current branch, including explicit approval of
   the remaining Plunger wind/lunge/latch/death animations.
2. Execute Plan 2: Super Plunger, Super Gasbag, Cloudline Holdout, Bidet
   placement, waves 33–35, quantified threat-score pass.
3. Plan 3: three-phase Ass Man, entry/outro bookends, K-9 Unit, leaderboard
   comparator/payload, victory-flow move, and named minor release.
4. Deferred art: bake the remaining Air roster after feel survives playtest;
   the Plunger Fiend frame set and silhouette pass are complete.
