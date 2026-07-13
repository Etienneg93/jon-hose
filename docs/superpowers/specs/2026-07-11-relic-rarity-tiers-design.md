# Relic Rarity Tiers — design spec (2026-07-11)

Revision of the Shop & Relics pass (spec:
`2026-07-09-shop-relics-pass-design.md`) while it is still unreleased on
`shop-relics-pass`. Ships inside the same minor release ("Rummage Sale").
This spec supersedes the parent spec's relic roster, pricing, and wheel
sections; everything else there (system split, panel, reliquary, kibble)
stands.

## Problem

Playtest verdict on the built pass: Hydro Lance's pierce scales with
enemies-per-line and lands at 6–10x output in late-game packs, while the
other twelve relics are marginal nudges — a ceiling item over a floor of
trinkets with nothing in between. Prices compress into one 150–300 band:
no impulse buy, no splurge, and the 10-item rotation repeats faces fast.

## Design

Three rarity tiers. Each tier is a price band, a wheel slot, a visual
frame grade, and an impact promise. All effects keep the flat-gear rule
(adders only — percent multipliers stay benediction territory) but borrow
Lance's trick: flat effects whose value scales with the situation.

| Tier        | Frame grade | Price band | Promise                          |
|-------------|-------------|------------|----------------------------------|
| Common      | steel       | 60–100     | one honest effect you notice     |
| Rare        | brass       | 250–350    | a combat-moment mechanic         |
| Relic-grade | gold        | 500+       | act-gated build-around           |

### Wheel

Slots keep the existing spin-in/SOLD-in-place behavior. The roll changes:

- **Slot 1** rolls from the unowned **common** pool.
- **Slot 2** rolls from the unowned **rare** pool.
- **Slot 3** rolls **rare**, upgrading to **relic-grade** with odds by act:
  0% / 25% / 50% / 75% for acts 0–3 (`actLevel+1` indexing, same
  convention as `Balance.ticketBudget`).
- **Slot 4** stays the fixed Kibble Pack card.

Pool-exhaustion fallback: relic-grade → rare → common → SOLD OUT card.
Act gates filter the relic-grade pool before the roll (a gated item never
burns the upgrade proc).

### Existing 13, re-slotted

**Common:** Dowsing Rod 80, Alarm Bell 80, Spigot Key 90, Brass Nozzle 90,
Loaded Sponge 100.

**Rare:** Punch Card 250, Censer 270, Hydro-Dash 270, Sunday Suit 300,
Fire-Marshal Spec 300, Prayer Bead 300, Collection Plate 320.

- **Prayer Bead raise:** the pressure buff now triggers on **every** boss
  enrage, not just the first (`prayerBeadDur`/`prayerBeadMult` unchanged).

**Relic-grade:** Hydro Lance 520, **trimmed** — pierce applies per-enemy
falloff down the line: 100 / 70 / 50 / 35 / 25%-floor of stream damage by
hit order. A 6-enemy line totals 3.05x single-target output (was 6x); a
10-enemy line 4.05x (was 10x). Still the wave-deleter, no longer a
different game. The +18 flat and knockback are unchanged.

### New items (9)

**Common**

1. **Rubber Boots** (90) — +20 max HP (computeStats apply); slow zones
   and puddles no longer slow Jon (movement flag checked by the slow-zone
   overlap test).
2. **Asbestos Socks** (80) — burn ticks on Jon deal 2 less hp/s per stack
   (floor 1; flat adder against `FIRE.burnDpsPerStack` 4 = halved at
   current tune) and burn i-frames last +1s.
3. **Squeegee** (80) — an enemy that dies while overlapping a fire patch
   douses that patch (calls the patch's existing douse path).

**Rare**

4. **Rosary Chain** (320) — the GUSH combo becomes mechanical: each combo
   kill inside `COMBO_WINDOW` grants +1 flat spray damage, stacking to
   +10, cleared when the chain breaks. Dynamic bonus applied at damage
   time (not computeStats — it changes mid-fight). The existing combo
   counter UI is the indicator; bonus shown beside it ("+N").
5. **Backdraft Valve** (320) — activating GUSH releases a radial pulse
   around Jon: flat 40 knockback and douses fire patches within the ring
   (radius ~70). Rim-is-hitbox: one shared shape draws and hits.
6. **Dog Leash** (270) — enemies take +15 flat spray damage while in a
   lunge/charge state (charger charge, stalker pounce; hook = the enemy's
   existing charging/lunge flag at damage application).

**Relic-grade**

7. **Deputy Sprinkler** (500) — mounts a sprinkler on Jon's tank:
   auto-sprays the nearest enemy within short range (~80) for flat 8 dps,
   costs no water, draws its own mini stream. The multitask build-around.
8. **The Big Spigot** (540) — GUSH activation adds a 360° blast: flat 30
   damage + douse + knockback in a ring around Jon (radius ~70,
   rim-is-hitbox, one shape). Stacks additively with Backdraft Valve
   (valve knockback + spigot damage; douse shared) — owning both is legal
   and just bigger.
9. **Boiler Coil** (560, act-gated one act after Lance) — after 2s of
   continuous spray on the same target the stream superheats: +30 flat
   damage to that target and 12 flat splash to enemies within ~24 of the
   impact point. Heat resets on target switch or a >0.3s spray gap. The
   focus-fire build-around.

Relic-grade fantasy square: Lance = the line, Sprinkler = multitask,
Big Spigot = the crowd around you, Boiler Coil = the single tough thing.

**Parked** (future passes, not this round): K-9 Unit companion (deserves
its own art moment — candidate for the Air-act pass), Milk-Bone Charm,
Blessed Quarter, Hydrant Wrench, Bingo Card.

### Economy check

Current spend capacity per run is roughly 800–1200 suds (today's build
affords the 300 Lance plus 2–3 mid items). Under these bands a full
basket — 2–3 commons (~250) + 1–2 rares (~600) + one relic-grade (~520)
— runs ≈ 1200–1400: deliberately past the wallet, so tier purchases are
real tradeoffs (a relic-grade costs you roughly two rares; you don't get
everything in one run). Collection Plate and Punch Card still flow
through `priceOf` and are the counterplay for greedy baskets. Verify real
per-run income with a headless full campaign during implementation and
report the number before final pricing.

### Visual language

`Assets.gearFrame` grows metal grades: **steel** (existing) for common,
**brass** for rare, **gold** for relic-grade. Applied on shop cards, the
SOLD OUT card, and the expanded panel's owned-relic grid. Gold gear frame
must read differently from the benediction legendary tier frame (gear =
riveted metal, benediction = ornate glow) so the system split stays
legible. Nine new 12px icons via the `icon-sprites.mjs` procedural
painters (hand-baked; imagen is dead).

## Implementation notes

- `JH.RELICS` gains `tier` per entry; `Balance.relicPoolIds` splits into
  per-tier pools; `Balance.pickRelics` takes the act and rolls per the
  slot rules. Wheel odds array lives in config as
  `JH.SHOP.relicGradeOdds`, act-indexed.
- New tunables join `JH.RELIC_TUNE` (falloff ladder, sprinkler dps/range,
  boiler heat time/bonus/splash, spigot ring radius/damage, leash bonus,
  rosary cap, socks adders, boots hp). No literals in game code.
- Lance falloff implements in the beam hit iteration (sort by distance
  along the line, index into the ladder).
- Telemetry: shop buy events already log `kind`/`id`; new ids flow free.
- Tests: tier/price shape pins derived from config, pickRelics tier
  distribution + exhaustion fallback, falloff ladder math, rosary stack
  cap + chain-break reset, prayer-bead multi-enrage, socks floor. When a
  number moves, tests read config, not literals.

## Out of scope

- No benediction changes (stacking audit in the parent spec stands: no
  nerfs needed).
- No shop UI structure changes beyond frame grades and the slot-3 odds.
- No new enemy-side systems (Squeegee/Leash hook existing states only).
