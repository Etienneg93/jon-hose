# Elemental Mirror Altar — Design Spec

**Date:** 2026-06-30
**Status:** ⚠️ **v1 BUILT (`bf36abc`) but the CONCEPT is UNDER RECONSIDERATION
(2026-07-01).** The two-sided "Mirror of Night" node/altar model got muddled into
the Church docs before the church flow was fully thought through, and the user is
**not sold on the elemental-upgrade-pillars-as-talent-tree** framing. Do **not**
treat this as settled canon or build further on it until the church flow is
re-decided — see the corrected flow in
`2026-06-29-church-of-the-hose-progression-overhaul-vision.md` (§ "Corrected flow").
**Parent vision:** `2026-06-30-next-level-vision.md` (Pillar 1).
**Realizes:** Phase 3 of the Church progression north-star (elemental archetypes),
simplified so the Mirror *is* the spiritual talent tree.

## Summary

Replace the three flat blessing stations with a **Mirror of Night**–style altar:
four element branches of **two-sided, Essence-bought, leveled nodes**. **Water** is
open from the start; **Earth/Fire/Air** light up when their ally-boss is redeemed.
Redeeming Quake (Earth) opens a stairwell to the Mirror chamber.

This spec covers **v1: Water + Earth functional, Fire + Air defined-but-locked**,
mapped entirely to **existing player stats** (no new combat wiring). Deeper
elemental effects (burn DoT, knockback-stun, gust) are explicitly later increments.

## Model

### State (persisted in `JH.Church.state`)

Add `mirror: { [nodeId]: { side: "a"|"b", rank: int } }`. Default `{}` (a missing
node = `{ side:"a", rank:0 }`). Water starts unlocked: `defaults().elements.water = true`.

### Node definition (`JH.MIRROR`, in config.js)

```js
JH.MIRROR = {
  maxRank: 3,                 // ranks per node (shared across both sides)
  nodes: [
    { id, element, name,
      a: { name, desc, apply: (s, rank) => {...} },
      b: { name, desc, apply: (s, rank) => {...} } },
    ...
  ],
};
```

- A node belongs to one `element` branch.
- Two sides `a`/`b`. **Rank is shared** across sides; **toggling side is free** and
  keeps rank (v1 decision: maximally forgiving, easy to rebalance; Hades tracks
  per-face ranks — revisit if commitment feels too cheap).
- Effect applied = active side's `apply(stats, rank)`.

### Pure functions (`js/mirror.js`, dual-export like `balance.js`/`church.js`)

All pure, unit-tested with `node:test`:

- `cost(rank)` → Essence to buy rank `rank→rank+1`. v1: `rank + 1` (1,2,3) — mirrors
  `Balance.blessingCost`. Maxing one node = 1+2+3 = 6 Essence.
- `branchUnlocked(churchState, element)` → `element === "water" || !!churchState.elements[element]`.
- `nodeState(churchState, nodeId)` → `{ side, rank }` (defaults `{a,0}`).
- `canBuy(churchState, nodeDef, maxRank)` → unlocked && rank < maxRank && essence ≥ cost(rank).
- `buy(churchState, nodeDef, maxRank)` → bool; on success spend essence, rank++.
- `toggleSide(churchState, nodeDef)` → flip `side` (rank untouched).
- `apply(stats, churchState, nodeDefs)` → for each node with rank>0 **and** branch
  unlocked, run active side's `apply(stats, rank)`. (Locked branches never apply,
  even if somehow ranked — defends against stale saves.)

### Migration (one-time, in `church.js` sanitize/load)

Old `state.blessings` → Mirror Water nodes (rank = min(count, maxRank), side `a`):
`bless_dps→water_pressure`, `bless_tank→water_reservoir`, `bless_hp→water_vigor`.
Run only if `mirror` is empty and `blessings` is non-empty; keep `blessings` field
for rollback safety but stop reading it.

## v1 Node table (mapped to existing stats — no new wiring)

`maxRank = 3` for all.

### 💧 Water (open from start)

| Node | Side A | Side B |
|---|---|---|
| `water_pressure` | Anointed Pressure: `+3 sprayDamage`/rank | Wide Spray: `+6 sprayRange`/rank |
| `water_reservoir` | Deep Reservoir: `+12 maxWater`/rank | Closed Loop: `+0.5 waterReturn`/rank |
| `water_vigor` | Blessed Vigor: `+15 maxHp`/rank | Vampiric Mist: `+0.04 vampiricRate`/rank |

### 🪨 Earth (Quake — unlocked on redeem)

| Node | Side A | Side B |
|---|---|---|
| `earth_force` | Crushing Spray: `+30 knockback`/rank | Fault Line: `+3 sprayHitBand`/rank |
| `earth_stance` | Sure Footing: `+0.05 dodgeChance`/rank | Deep Roots: `+20 maxWater`/rank |

### 🔥 Fire (Slayer — defined, locked until redeemed)

| Node | Side A | Side B |
|---|---|---|
| `fire_zeal` | Searing Pressure: `+4 sprayDamage`/rank | Render: `+0.05 vampiricRate`/rank |
| `fire_reach` | Long Burn: `+8 sprayRange`/rank | Flashpoint: `+4 sprayHitBand`/rank |

*(v1 effects are stat approximations; true burn-DoT lands with the Slayer act.)*

### 🌬️ Air (Ass Man — defined, locked until redeemed)

| Node | Side A | Side B |
|---|---|---|
| `air_swift` | Tailwind: `+8 moveSpeed`/rank | Slipstream: `+18 dashBoost`/rank |
| `air_drift` | Long Wake: `+0.25 dashBoostDur`/rank | Slick Wake: `dashPuddle=true` (rank≥1) |

*(true gust/dash-charge effects land with the Ass Man act.)*

## Integration points

- **`config.js`** — add `JH.MIRROR`; set `defaults().elements.water = true` (in church.js).
  Keep `JH.CHURCH.blessings` for migration reference; remove the 3 station entries
  from `JH.CHURCH.layout.stations` (the nave no longer hosts flat stations).
- **`upgrades.js` `computeStats`** — replace the `cdefs.forEach` blessing block with
  `JH.Mirror.apply(s, JH.Church.state, JH.MIRROR.nodes)`.
- **`church.js`** — add `mirror` to defaults/sanitize/serialize; migration; helper
  methods `buyMirror(nodeId, player)` / `toggleMirror(nodeId)` that mirror the
  existing `buyBlessing` carry-stats pattern.
- **`assets.js`** — Mirror chamber art keys (pillars lit/dim per element) — procedural
  fallback first; real art via asset prompts.

## UI / scene (v1 — pragmatic)

The full walkable sub-chamber is a later increment. **v1 reachable UI:** at the
altar (`altarX`), if **Earth is unlocked**, an interaction opens a **Mirror panel**
listing the four branches; locked branches show "Convert <Boss> to light this."
Within a branch, each node shows both sides, the active side, rank pips, and the
next cost; inputs buy rank / toggle side / change branch. Reuse the existing
proximity-prompt + in-scene drawing patterns (no new DOM overlay). Pre-Earth, the
altar shows only the Water branch (so the player can still spend Essence early).

## Testing

`tests/mirror.test.js` (Node `node:test`), pure-logic only:

- `cost(0..3)` = 1,2,3 and is monotonic.
- `branchUnlocked`: water always true; earth false until `elements.earth`.
- `canBuy`/`buy`: respects unlock, maxRank, essence; spends correct amount; rank++.
- `toggleSide`: flips, preserves rank, `apply` then uses the new side.
- `apply`: sums multi-rank correctly; skips locked branches; skips rank-0; a known
  Water+Earth state produces expected stat deltas off a base block.
- Migration: old `blessings` map into the right Water nodes once, idempotently.

Scene/UI and stat-carry are manual playtest (dev wave-select → die → church).

## Out of scope (later increments)

- Walkable Mirror sub-chamber with per-pillar navigation + ally NPCs.
- True elemental effects (burn DoT, knockback-stun, gust push, dash-charges).
- Per-face rank tracking / paid respec.
- Cross-element "duo" nodes (the talent-doc combos).
