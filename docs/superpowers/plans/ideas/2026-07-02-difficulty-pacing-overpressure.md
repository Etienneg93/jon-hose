# Difficulty & Pacing — Curve Fixes + the "Overpressure" Dial

**Date:** 2026-07-02 · **Priority: Must-explore** · **Scope: M (curve fixes S, dial M)**

## Problem statement (grounded)

Both playtests (06-28, 07-01) report the same inverted curve: **brutal early, trivial late**. The code shows why on both ends.

**Brutal early:**
- Wave 2 (`config.js` `JH.LEVEL1.waves[1]`) already fields a Charger: `chargeSpeed: 200` vs. Jon's `moveSpeed: 92`, `chargeDmg: 16` = 16% of base HP, and at that point the player owns zero nodes and has a 100-unit tank that empties in ~2.8s (`waterDrain: 36`).
- Dash is the only defense (no jump/melee by design) with a 0.7s cooldown and no input buffering — and presses during hit-stop frames are silently eaten (`game.js` `update()` polls input then early-returns while `hitStopTimer > 0`, ~line 1038), so the panic dash after taking a hit often doesn't come out. (Fix detailed in the controls spec; it is *also* a difficulty fix.)
- Death → Church → respawn at the last hydrant re-arms the died wave (`respawnFromChurch`, `game.js` ~835) — good loop, but a first-death player banks nothing (Essence only comes from bosses/set-pieces), so early deaths are pure time loss.

**Trivial late — three scaling leaks, all citable:**
1. **Overcharge purchases are invisible to the elite ramp.** `eliteScale(actLevel, ownedCount)` takes `Object.keys(JH.Upgrades.owned).length` (`game.js` ~369) — that's only the 15 one-time nodes. The unbounded `repCount` repeatables (`upgrades.js` `REPEATABLES`) and all Mirror ranks (`JH.Mirror.apply`) never enter the power term, which caps at ×1.45 anyway (`balance.js:23`, `min(ownedCount, 15)`). Late-game player power grows past what enemies can see.
2. **The economy maxes the tree mid-run.** Full tree ≈ 1,110 Suds; run income is held at ~2,150 by design (`2026-07-01-wave-flow-expansion-design.md` §3). The tree "cannot not be maxed" (called out as far back as the v1 balance design) — by Act 3 the build is done and shopping is just Overcharge trickle.
3. **Defensive stats stack quietly.** Vampiric is halved vs. bosses only (`entities.js` ~494) — full-rate vs. elite HP sponges; dodge stacks to 20% (vt2 5% + `earth_stance` 15%); Mirror water nodes add another permanent floor. None of this is priced into wave design.

Boss HP is static per def, so a maxed Act-4 player deletes Gateway Krusher phases before seeing them — which is half of why bosses read as "one-pattern" (the other half is the boss spec).

## Part 1 — Curve fixes (baseline, no new systems)

1. **Soften the on-ramp, not the game.** Move the first Charger from wave 2 to wave 3 and give waves 1–2 a `spawnGrace` bump; first three waves cap concurrent attackers at 2 (a tiny scheduler: extra enemies hold at approach range until a slot frees — the classic beat-'em-up "attack ticket" pattern, and `separate()` already keeps crowds readable).
2. **First-death pity.** First Church visit per save grants +1 Essence and Father Jon points at the shrine ("Take this, child — the water keeps what it takes"). Turns the worst moment of the curve into the meta-progression tutorial.
3. **Count all power in the ramp.** `eliteScale`'s `ownedCount` becomes `nodes + repeatable buys + total Mirror ranks`, and the cap rises from 15 to ~24. One-line callsite change, existing unit tests extend cleanly (`tests/balance.test.js`).
4. **Price the late game.** Act-gate tier-3 nodes (buyable from Act 3) so the build *finishes* against the hardest content instead of before it; extend the boss half-rate vampiric to elites; cap `dodgeChance` at 25% in `computeStats`.
5. **Boss HP respects player power.** `bossHp = def.hp × (1 + 0.02 × ownedCount)` at spawn — same pure-function shape as `eliteScale`, testable.

Every item is a data/one-function change; the mandatory playtest gate applies (feel, not just correctness).

## Part 2 — "Overpressure" — the opt-in Heat system

Hades' Pact of Punishment, themed as what it is: turning up the PSI past spec.

- **Where:** the run-start hydrant at x=260 (`JH.HYDRANTS[0]`) grows a pressure gauge. Interact (E — the walk-up-station pattern from the Church, no modal) to open the dial. Unlocks after the first Slayer clear.
- **What:** each condition arms 1–2 PSI. Conditions are *modifiers to systems that already exist*, so v1 is cheap:

| Condition | PSI | Hook (existing lever) |
|---|---|---|
| **Hard Water** — elites scale one act tier higher | 2 | `actLevelForWave(...) + 1` |
| **Rusted Hydrants** — refill rate halved | 1 | `JH.HYDRANT.refill` |
| **Loaded Dice** — +2 sprinkles per wave, heavier weights | 1 | `JH.SPRINKLE.counts/weights` |
| **Overtime** — holdout +10s, barricade +40% HP | 1 | `holdDur`, `wallHp` |
| **Union Rates** — shop prices +25% | 1 | node `cost` multiplier |
| **No Refunds** — set-piece/infinite drop budgets halved | 1 | `dropBudget` |
| **Two-Alarm** — Fuse death patches burn 2× longer; Smelt bombs bigger | 1 | `deathPatchDur`, `lobBombRadius` |
| **Sunday Service** — bosses use their phase-2 pattern sets from the start | 2 | boss-pattern spec |
| **Tempered Glass** — Bulwark dome HP +50%, Furnace vents faster | 1 | enemy defs |
| **Personal Best** — par timer per act; miss it and elites regen | 2 | `elapsed` already tracked |

- **Why bother (rewards):** +1 Holy Essence per boss per 3 PSI armed, a per-save best-PSI record on the win screen (`win()` already prints run stats, `game.js` ~905), and nozzle/stream palette cosmetics at PSI milestones. Essence is the right prize — it feeds the Church loop without inflating in-run Suds.
- **Persistence:** rides the Church save (`jonhose.church.v1`) once the persistence gap is closed (see meta-progression spec — `Church.load()` currently resets to defaults every boot, `church.js` ~158).

## Why it's fun

The dial converts "trivial late" from a bug into a player-owned slider — Hades proved self-selected difficulty with legible, à-la-carte conditions has far better retention than a global hard mode, because every condition is a *promise about what will change*. Theming them as water-utility bureaucracy (Union Rates, Two-Alarm, Overtime) keeps Jon Hose's tone. And Part 1 means the dial starts from a sane baseline instead of compensating for scaling leaks.

## Scope

Part 1: **S** (data + two pure functions + playtest). Part 2: **M** (dial UI via walk-up pattern, condition plumbing, save field, reward wiring).

## Open questions

1. Should PSI apply to Essence *set-piece* crosses too, or only boss awards? (Lean: bosses only — keeps set-pieces relaxing.)
2. Does Sunday Service depend on the boss-pattern spec shipping first? (Yes — sequence it after.)
3. Attack-ticket cap in Act 1 only, or a global concurrency budget tuned per act? Start Act-1-only, measure.
4. Is act-gating tier-3 nodes too restrictive for players who rush Pressure? Alternative: raise tier-3 prices ~40% instead.
