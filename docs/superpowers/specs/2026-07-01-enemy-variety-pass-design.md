# Enemy Variety & Behavior Pass — Design

Date: 2026-07-01
Status: Design (approved for spec review)
Branch: next-level-pass

## Problem

Post wave-flow-expansion playtest surfaced four wants that all reduce to
"enemies are too samey in where they come from and how they behave":

1. **Furnace** vents are a pure punish — after venting it just slow-chases,
   fully vulnerable; no interesting follow-up.
2. **Spawn positions** are monotonous — every enemy enters clustered at the
   right edge (`right - 6`, 3 columns), so waves always come from one corner.
3. **Fuses** have no distinct entrance — they walk in like everything else.
4. **Bulwark and Stalker** are locked to their single authored fights; once an
   enemy type is introduced it should keep showing up for variety.

## Goals

- More variety in where and how enemies enter, and in a couple of signature
  behaviors, without discarding the hand-authored 29-wave list or its economy.
- Keep it tunable and (where logic is non-trivial) unit-testable.

## Non-goals

- No new enemy archetypes (this reuses existing types + adds entry/behavior).
- No rewrite of the authored wave list — the pool only *augments* it.
- Big Drip / boss reworks remain out of scope.

## Design

### 1. Spawn-pool augmentation (#4)

Authored per-wave spawns stay the backbone; a few pooled enemies are sprinkled
on top for variety.

- **Unlocked pool** = distinct enemy types appearing in authored waves with
  index `<= current waveIndex`, excluding bosses, `dummy`, and `neighbor`.
  Types unlock naturally as the run reaches them (Bulwark unlocks at its wave
  16, Stalker at 17, fire types in the Fire acts, etc.).
- **Sprinkle count by act** (tunable): Act 1 = 0 (keep the tutorial clean),
  Act 2 = 1, Act 3 = 2, Act 4 = 2, Fire = 2. Applied only to normal fight
  waves (`else` branch of `startWave`) — never to boss / wall / holdout /
  garden / douse waves.
- **Weighting:** light types (`mook`, `pyro`, `fuse`, `stalker`) common;
  `charger` medium; **heavies (`bulwark`, `furnace`, `smelt`) low-weight and
  capped at 1 total sprinkled per wave**. The existing `Balance.capEnemyType`
  charger cap (2) still applies to the combined authored+sprinkled charger
  count.
- **Elite scaling:** sprinkled enemies receive the same `eliteScale` as the
  authored spawns on `tough` waves; unscaled otherwise.
- **Fuse sprinkles** use the drop-in entry (section 2); other sprinkled enemies
  use the edge entry (section 2).

**Where it lives:** pure functions in `js/balance.js`, unit-tested in
`tests/balance.test.js`:

- `unlockedPool(waves, waveIndex)` → array of eligible type strings (deduped,
  bosses/dummy/neighbor excluded).
- `pickSprinkles(pool, count, weights, caps, rng)` → array of type strings,
  honoring per-type weights and the heavy cap. `rng` is injected (defaults to
  `Math.random`) so tests are deterministic.

`startWave` calls these after placing authored spawns, then spawns each picked
type via the section-2 entry rules.

**Economy note:** sprinkled enemies drop suds, nudging run income back up
somewhat (partly offsetting the ~40% trim from the wave-flow pass). Sprinkle
counts are kept modest for this reason; re-check end-of-run income in playtest.

### 2. Entry variety (#2 positions + #3 fuse drop-in)

**#2 — varied edge entry (non-fuse enemies).** Replace the right-edge 3-column
cluster. Each non-fuse enemy (authored or sprinkled) picks a **random edge
(left or right)** and a **random depth** across `[DEPTH_MIN, DEPTH_MAX]`,
entering just off that screen edge. Waves now pressure from both sides. (The
arena is screen-locked during a wave, so "edges" are the visible left/right
edges: `left`/`right` already computed in `startWave`.)

**#3 — fuse drop-in (fuse-only).** All fuses enter via a telegraphed aerial
drop instead of walking in:

1. A **danger-zone marker** appears at a random arena spot (x within
   `[left,right]`, y within the depth band) — a shrinking targeting ring /
   ground shadow, ~0.7s telegraph, reusing the existing danger-ring visual
   idiom (cf. Charger/Furnace telegraphs).
2. The fuse **falls from above** (starts at high `z`, descends under gravity)
   and lands at the marked spot.
3. **On landing:** if the player is within the zone radius, a **light
   dodgeable hit** — small damage (~8) + knockback, **no burn stack**. Then the
   fuse reverts to normal chase.
4. During telegraph + fall the fuse is **inert**: it can't be damaged and deals
   no contact damage until it lands.
5. **Stagger:** when multiple fuses spawn together, offset each one's drop start
   by ~0.5s × index so they don't all slam simultaneously.

**Where it lives:** a `dropIn` spawn option consumed by the `Fuse` class. A
fuse spawned with `dropIn` starts in a `"drop"` state: elevated `z`, a telegraph
drawn beneath its landing point, an optional `dropDelay` (the stagger offset)
before the fall begins, then falling under gravity. On land it runs the slam
check once, clears the drop state, and resumes normal `think()`. Inert-state is
enforced by gating `takeDamage` and contact damage on the drop state.

### 3. Furnace vent buff (#1)

While the Furnace is **cooling down** after a vent (`ventCdT > 0`):

- **Movespeed ×2** (tunable) — it lunges instead of its 18px/s crawl.
- **Invulnerable** — spray and melee deal 0 damage until cooldown ends.
- **Visual cue** — a hot red/orange glow + shimmer (burn/heat palette) so the
  player reads "stop spraying, reposition"; optional small "COOLING" status tag.

Creates the loop: bait the vent → dodge the steam → stop spraying and kite the
fast, untouchable furnace for ~`ventCd` (4s) → resume damage once it settles.

**Where it lives:** the `Furnace` class (`js/entities.js`). It already tracks
`ventCdT`. Add: a speed multiplier applied in `think()` while `ventCdT > 0`;
a `takeDamage`/spray-damage gate returning no-op while `ventCdT > 0`; and the
glow in `Furnace.prototype.draw`.

Defaults (tunable in playtest): speed ×2, full invuln, duration = `ventCd`
(4s).

## Testing

- New `Balance.unlockedPool` / `pickSprinkles` covered by `node:test` in
  `tests/balance.test.js` (deterministic via injected `rng`): pool excludes
  bosses/dummy/neighbor and respects the `<= waveIndex` cutoff; sprinkle honors
  the heavy cap and weighting; empty/underflow cases.
- Scene/behavior changes (spawn positions, fuse drop-in, furnace buff) have no
  unit-test harness; verified by the mandatory playtest per project rule —
  playtest and user-verify before committing.
- Playtest focus: sprinkle difficulty + income drift; fuse drop-in telegraph
  readability + stagger feel + dodgeability; furnace kite loop (speed/invuln
  duration).

## Open questions

None outstanding — proceed to implementation plan.
