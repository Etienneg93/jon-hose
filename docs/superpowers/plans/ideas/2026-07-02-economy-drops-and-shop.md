# Economy, Drops & the Shop — Making Suds and Loot Feel Alive

**Date:** 2026-07-02 · **Priority: Strong** · **Scope: S/M**

## Problem statement (grounded)

- **Playtest: "item drop rates feel low."** Base thresholds are 18% health / 27% water per kill (`Balance.dropThresholds`, `balance.js` ~79). Three compounding reasons it *feels* worse than 45%: (a) mooks — most kills — sit at `dropMult: 1`; (b) the health drop isn't a heal, it's kibble — 25 HP over 6 seconds (`Pickup.collect`, `entities.js` ~1622) — which under fire reads as "nothing happened"; (c) set-pieces and boss fights run on `dropBudget` (14 suds / 7 items, or 0 for garden/douse), so the longest fights are the driest. There's no pity mechanism, so 8-kill droughts happen and get remembered.
- **Suds stop mattering mid-run.** Full tree ≈ 1,110 Suds vs. ~2,150 income (held flat by the wave-flow pass). After tree completion the only sinks are two consumables (Med Kit 45 / Pressure Charge 70, `JH.CONSUMABLES`) and the Overcharge repeatables — flat +4 dmg / +12 water / +12 HP at 1.5× escalating cost (`upgrades.js` REPEATABLES), i.e. pure stat paste that also worsens trivial-late (and isn't even counted by `eliteScale` — see difficulty spec).
- The shop itself (`drawHoverShop`) is a fine walk-up list, but stock is identical from wave 2 to wave 28 — nothing to look forward to.

## The ideas

### 1. Pity timer + smart drops (S) — fixes "feels low" without inflating
- **Pity:** after `N = 6` consecutive item-less kills, the next kill is a guaranteed item. Pure function (`Balance.rollDrop(dropMult, dryStreak, rng)`), unit-testable, replaces the raw `Math.random()` in `dropLoot` (`game.js` ~690).
- **Smart weighting:** bias the health/water split by need — if `hp < 50%` weight health 2×; if `water < 30%` weight water 2× (classic Mario-Kart need-based loot). Inputs are already on `game.player`.
- **Kibble legibility:** keep the over-time heal (it's good anti-facetank design) but make it *read*: green +HP tick numbers during regen and a louder pickup sting. Half the "low drop rate" complaint is unfelt heals.
- Leave `dropBudget` anti-farm exactly as is — it's correct; just let the *pity streak* carry across a budgeted fight so bosses don't feel dry.

### 2. Wave-clear loot beat (S)
On `waveCleared_`, the wave-ender kill triggers the arena-wide pickup magnet (juice spec §4) **and** tough waves drop one bonus guaranteed item (need-weighted). One reward moment per fight, synchronized with the AREA CLEAR banner instead of scattered mid-chaos.

### 3. Replace Overcharge with Relics (M) — the late-game sink that adds identity
Once the tree is maxed (`allNodesOwned()` already gates Overcharge, `game.js` ~1587), the shop's top section sells **Relics**: one-per-run rule items at real prices (150–300), stocked 2 of 5 per act:
- *Brass Nozzle* — +1 pierce target below Hydro Lance tier (revives the parked `pierce` decision from `IMPROVEMENT_PLAN.md` M2b as a purchase).
- *Prayer Bead Hose Clamp* — Pressure Charge buff also triggers free for 4s after every boss-phase transition.
- *Spigot Key* — hydrants also grant 15s of +10% damage (makes checkpoint touches tactile).
- *Loaded Sponge* — your GUSH milestone refund doubles (combo-build relic).
- *Collection Plate* — +2 Suds per kill, −1 Essence tithe on death (greed trade with the Church economy).
Keep one Overcharge node (damage) for players who just want paste; price it steeper (`×1.8ⁿ`). Relics slot into `shopSelectables()`/`drawHoverShop` with the existing row plumbing.

### 4. Act-rotating supplies (S)
The consumable section gains one act-flavored item each act, straight from the vetted `IDEAS-TALENT-TREE.md` list (they respect the no-new-button philosophy): Act 2 *Repair Tape* (auto-heal 25 when dropping under 15%), Act 3 *Anti-Ember Wrap* (−40% ember/burn damage next fight), Fire *Overflow Valve* (over-refill converts to next-fight damage). All passive/auto-trigger; each is a small `Player` timer in the kibble/Concerta pattern.

### 5. Price the early game down, not the drops up (S)
Tier-1 nodes (20–36 Suds) are fine, but the first shop appears only after wave 2 (`waveCleared_` gates the vendor at `waveIndex >= 1`, `game.js` ~456) — by then a struggling player has died to wave 2's Charger already. Spawn the vendor after wave 1 with a one-time "starter deal" (first tier-1 node −50%). Cheap, targeted at the exact minutes the difficulty spec identifies as brutal.

## Why it's fun

Hades (and Dead Cells, and Slay the Spire shops) treat late-game currency as *identity* purchases, not stat paste — that's what keeps gold interesting after the build stabilizes. Pity + need-weighting is invisible-hand design: players never see it, they just report "drops feel fair now" (documented effect in roguelite postmortems from Risk of Rain to Hades' own gem/darkness smoothing). And loot arriving as a synchronized wave-clear beat turns economy into juice.

## Scope

1, 2, 4, 5: **S** each. 3 (Relics): **M**. All data + pure functions + existing shop UI rows; zero new art (relic icons can be text rows like today's nodes).

## Open questions

1. Pity streak N=6 — right constant? (Test 5–8; also whether elite kills should decrement the streak by 2.)
2. Do Relics persist through death within a campaign (they're run-scoped like the tree, which *does* persist via `respawnFromChurch`)? Lean yes — same rules as tree nodes, washed only by `startGame()`.
3. Collection Plate's Essence interaction needs the Condensation tithe (church spec) to exist first — sequence.
4. Should Pressure Charge become a benediction instead once that system lands, leaving the shop purely economy? Revisit at benediction playtest.
