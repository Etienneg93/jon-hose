# Wave-Flow Expansion — Design

Date: 2026-07-01
Status: Design (approved for spec review)
Branch: next-level-pass

## Problem

The run's pacing is uneven. Encounter count before each boss:

| Act | Encounters → Boss | Count |
|-----|-------------------|-------|
| Act 1 | W1, W2, W3, W4 → Big Drip | 4 |
| Act 2 | W5, Barricade → Switch | 2 |
| Act 3 | Rubble Row → Quake | 1 |
| Act 4 | Bulwark, Stalker, W6, Garden, W7 → GK9000 | 5 |
| Fire  | Fire Intro, Furnace Trial → Slayer | 2 |

Act 2 and (especially) Act 3 are far too compact — one wave between bosses in
Act 3. Fire world is the intended climax act but is only two encounters. Act 4
(5 encounters) is the reference for how a fleshed-out act should feel.

## Goals

- Flesh out the under-filled acts so boss fights are earned, not back-to-back.
- Keep each act's fights feeling distinct (no repetitive filler).
- Do not inflate the suds economy — total run income stays ~flat.
- No new enemy archetypes (no new AI/art/balance work this pass).

## Non-goals (explicitly out of scope)

- **Big Drip boss rework** — flagged separately; left in place here.
- Fixing the broader "income ≈ 2× tree cost" looseness — this pass only keeps
  income from getting *worse*; a dedicated economy pass comes later.
- New enemy types.

## Design

### 1. Target skeleton — escalating density

Encounter curve before each boss: **4 → 4 → 5 → 6 → 6**. Act 1 stays as the
tutorial act; density climbs as player power does. Act 3 gets the biggest
injection (1 → 5). Fire becomes the dense climax act. New entries marked
**[NEW]**.

| Act | Encounters (→ boss) |
|-----|---------------------|
| **Act 1** (4) | W1, W2, W3, W4 → **Big Drip** |
| **Act 2** (4) | W5 elites, **[NEW fight]**, Barricade, **[NEW fight]** → **Switch** |
| **Act 3** (5) | Rubble Row, **[NEW fight]**, **[NEW set-piece: Hold the Line]**, **[NEW fight]**, **[NEW fight]** → **Quake** |
| **Act 4** (6) | Bulwark, Stalker, W6, Garden, W7, **[NEW fight]** → **GK9000** |
| **Fire** (6) | Fire Intro, **[NEW fight]**, **[NEW set-piece: Douse the Flames]**, Furnace Trial, **[NEW fight]** → **Slayer** |

10 new entries total (8 fights + 2 set-pieces): Act 2 +2 fights,
Act 3 +3 fights +1 set-piece, Act 4 +1 fight, Fire +2 fights +1 set-piece.

New Act 2/3 fights carry `tough: true` to inherit their act's elite scaling.
New Fire fights stay un-`tough` (curated, matching existing fire waves). Fight
compositions are new mixes/counts of existing archetypes; the charger cap
(`JH.WAVECAP.charger = 2`, applied via `Balance.capEnemyType`) still holds.

### 2. Set-pieces (one distinct mechanic per act, high reuse)

Each act uses a different set-piece so no mechanic repeats within the run:
Act 2 = Barricade (existing), Act 3 = Hold the Line (new), Act 4 = Garden
(existing), Fire = Douse the Flames (new). Act 1 stays pure fights (tutorial).

**Act 3 — "HOLD THE LINE" (survival timer).**
A hold-out in the ruined district: survive a ~20–25s countdown while enemies
spawn continuously from a pool. Reuses the Barricade's pool-spawn loop but
swaps the "destroy the wall" win condition for a countdown timer, so it feels
distinct from the Act 2 Barricade despite shared plumbing. Continuous spawns
capped by the existing anti-farm `dropBudget` (as Barricade already does).

**Fire — "DOUSE THE FLAMES" (spray objective).**
Reskins the Garden objective: spray 4 fire sources to extinguish them while
enemies harass you. Reuses `GardenBox`'s spray-to-fill logic and the existing
`FirePatch` / `JH.FIRE` visuals — the "hose water solves the objective"
fantasy is on-brand for the fire act. Harasser is a Smelt (or two) lobbing
fire-bombs (existing behavior) in place of the Garden's rock-throwing Neighbor.

### 3. Economy — keep run income ~flat

Bosses already pay ~1,400 of the ~2,150 total run income (~65%); all regular
waves combined are only ~750. Approach:

- **Boss suds untouched** — they are the milestone paydays; that rhythm is good.
- **Trim regular-enemy suds ~40%** so the (roughly doubled) fight count lands
  regular income back near its current ~750, holding the run total at ~2,150.
- **Curated elites** (Bulwark 60, Furnace 55) trimmed more gently — they are
  mini-boss-tier.
- **Set-pieces** stay `dropBudget`-capped (~14 suds) as they are now.

Representative new values (exact numbers finalized in implementation):

| Enemy | Now | → |
|-------|-----|---|
| Mook | 8 | 5 |
| Charger | 13 | 8 |
| Pyro | 16 | 10 |
| Smelt | 20 | 12 |
| Fuse | 12 | 7 |

Side benefit: lightly tightens the pre-existing income looseness without
touching the boss reward cadence.

### 4. Make the wave list safely editable (implementation-critical)

Inserting waves shifts every wave index, and several places hardcode indices.
The implementation must convert these to derived/dynamic lookups so this pass
(and future pacing tweaks) don't require hunting magic numbers:

1. **`balance.js` `actLevelForWave(waveIndex)`** keys elite tiers to literal
   indices (`< 5`, `< 8`, `< 10`). Recompute these to the new indices — or
   better, derive act boundaries from act-start markers so they stop being
   magic numbers.
2. **`game.js` hardcoded `this.waveIndex === 9`** (Quake ally cutscene) and
   `waves[9]`. Convert to dynamic `findIndex` (by `bossType`/name), the way the
   Slayer index already is.
3. **`WAVE_TRIGGERS` + `LEVEL_LEN`** — the trigger array must match the new
   `waves.length` (guard warning already at game.js:14) and be repositioned;
   world length (7400) extends to fit the longer run. Fire-world trigger
   positions were already placeholders and are recomputed here anyway.
4. **New Act 2/3 fights need `tough: true`**; new Fire fights do not.

## Testing

- Existing `balance.js` unit tests (`tests/`) must pass; add/adjust
  `actLevelForWave` cases for the new act boundaries.
- Wave-list / `WAVE_TRIGGERS` length guard must not warn.
- Manual playtest per project rule (feel, not just correctness): confirm each
  act's new pacing, the two new set-pieces function, and end-of-run suds are
  in the ~2,150 range. Playtest and user-verify before committing.

## Open questions

None outstanding — proceed to implementation plan.
