# Shop & Relics pass (design spec)

*Date: 2026-07-09 · Base: main @ v0.28.0 line (branch `claude/fire-truck-minigame-concept-2pdlg0` working tree)*

> **Revised 2026-07-11:** the relic roster, pricing, and wheel-roll sections
> are superseded by `2026-07-11-relic-rarity-tiers-design.md` (rarity tiers,
> Lance pierce falloff, 9 new items) — same release. Everything else stands.

## Summary

One designed pass over the item economy and its presentation:

1. **System split made explicit**: benedictions = divine favor (random offers,
   element/rank structure, washed by death); relics = purchased gear (agency,
   flat effects, survive death). A permanent design rule enforces the lane.
2. **Signatures become relics** in the random rotation; the SIGNATURE shop
   section dies; Overcharge act-gates.
3. **Relic effect retune** (four relics), guided by a damage-stacking audit.
4. **Reliquary**: redeem-ALL washed benedictions for an escalating essence cost.
5. **Presentation**: 24 unique baked benediction icons with tier frames/glow,
   a relic slot-wheel shop centerpiece + always-available Kibble Pack, and an
   always-visible character stat block that Tab-expands into a full sheet.

Ships as a **minor release** (designed pass). Candidate name: "Rummage Sale".
Everything gameplay-feel-bearing is held uncommitted for the user playtest gate.

## Design decisions (locked with user)

- Signatures **join the random relic rotation** (no pinned slots, no weighting).
- Rarity tiers = existing kinds (boon / rank-II boon / duo / legendary); no new
  rarity data field.
- Item collection lives in the **Tab character panel**, not the shop.
- Relic balancing = **effect retune** (costs stay), per the stacking audit.
- Benedictions were removed from the shop overlay (already done in tree).
- Relic slot-wheel presentation + fixed Kibble Pack card (user call).
- A dedicated **relic + benediction review pass is planned later** — this spec
  retunes only the four audited relics and adds no new content to either pool.

## The system rule (permanent design line)

| | Benedictions | Relics |
|---|---|---|
| Fiction | Blessings granted | Gear bought |
| Agency | Pick 1 of 3 random sigils, free | Buy exactly what you want, suds |
| Death | Washed to the Reliquary | Survive the whole run |
| Structure | Elements, rank I→II, duos, legendaries | Flat one-shots, no ranks |
| Effects | Conditional / elemental / **percent multipliers** | **Flat, unconditional adders** |

**Rule**: a relic effect must be flat and unconditional; anything elemental,
conditional, rank-scaling, or multiplicative is benediction turf. Crossover is
allowed only in the "relics feed the benediction system" lane (Censer, Sunday
Suit, the Reliquary economy).

Rationale (stacking audit, 2026-07-09, `stack-analysis` scratchpad script):
9 benediction picks per run (offer waves 4,7,9,12,15,19,22,25,28 by index); the
full damage-multiplier stack (Overflow II + Baptize II + Trial II = ×2.54)
costs 6 of them. Late-typical DPS ≈ 182 vs late-all-in ≈ 284 (~×1.56 — a lucky
good build, not broken; elite smelt still ~3s, GK ~11s raw). Keeping relic
damage additive (not multiplicative) caps the transient god-window under ×5
(Stone 1.25 × Charge 1.5 × bene stack 2.54) and keeps the multiplier budget
entirely inside the pick-bounded system.
**No benediction nerfs.**

## 1 — Mechanics

### 1a. Signatures → relics

- `js/upgrades.js`: NODES emptied of the three signatures; SIGNATURE branch and
  its shop section removed. Overcharge repeatable stays.
- `JH.RELICS` gains (effects unchanged except noted; costs repriced in-band):
  - **Hydro-Dash** 200 — −0.2s dash cd, +28 speed for 3s after dash.
    **Drops the slick/puddle** (dash ground-effects are Baptismal Wake turf).
  - **Fire-Marshal Spec** 220 — +30 range, +30 knockback.
  - **Hydro Lance** 300 — +18 dmg, beam 3 (pierce), +20 knockback.
    **Pool-eligible only from Act 2** (`actLevel >= 0`), mirroring its old
    tier-3 gate: `pickRelics` excludes it earlier.
- Relics may carry `apply(s)`: folded in `Upgrades.computeStats()` where node
  applies fold today (source: `game.relics`). Flag-relics keep hook-checks.
- **powerCount**: stat-bearing relics (those with `apply`) count toward
  `Balance.powerCount` so the elite/boss HP ramp still sees this power after
  it leaves `Upgrades.owned`. Flag-relics don't count.
- **Overcharge gate**: `allNodesOwned()` (now vacuous) → unlocks from Act 2
  (`currentActLevel >= 0`), same boundary as the Lance. Keeps it a mid/late
  suds sink that can't be dumped in Act 1.

### 1b. Relic retunes (all → flat adders per the rule)

| Relic | Was | Becomes |
|---|---|---|
| Brass Nozzle (180) | non-pierce stream also catches next-closest enemy | **+10 spray dmg to the first enemy the stream hits** (chain identity belongs to Split Stream) |
| Spigot Key (150) | +10% dmg for 15s after hydrant refill | **Hydrant refill also restores 15 HP** (windowed dmg cut entirely — a temporary +N is strictly worse than Brass Nozzle's permanent +10; ~300 HP/run ≈ 335 suds of Med Kit value for 150, paid for in hydrant trips) |
| Prayer Bead (220) | 4s pressure buff at a boss's first enrage | **8s** |
| Loaded Sponge (160) | GUSH x5 refund doubled (10→20) | doubled refund **and** GUSH regen windows 4s→**6s** (`gushRegenDur`) |

Untouched: Censer, Sunday Suit, Punch Card, Dowsing Rod, Alarm Bell,
Collection Plate. Sunday Suit gains value passively via the new Reliquary
(essence worth more) — intended synergy.

Implementation note: `spigotMult` and the `spigotT` window timer in
`Player.doSpray`/update are removed (heal fires in the hydrant-refill handler);
Brass Nozzle adds its +10 only to the primary target (`e === blocker` path),
never to Split Stream chain hits.

### 1c. Reliquary — redeem-all, escalating

- Replaces per-boon "1 essence each" (`reclaimNext`): one E-press redeems
  **all** washed benedictions at their washed ranks for **N essence**,
  N = 1 + (redemptions this run). Counter lives with run state
  (`Benedictions.reset()` clears it; death does NOT).
- Church station text: `RELIQUARY — {n} washed · redeem all: {N}✝`; if
  essence < N the prompt shows the price and the press is a no-op (soft
  deny sound).
- Strategic intent (user's design): bank essence as death insurance vs spend
  it on pillar ranks. No partial redemption.

### 1d. Kibble Pack (new always-available shop staple)

- Fixed card in the relic wheel row (see 2d). Repeatable purchase, **30 suds**.
- Effect: the standard kibble heal — 25 HP over ~6s, stacking by extending the
  timer (exactly the `spawnPickup("health", x, y, 25)` collect path; implement
  by granting the same buff directly, no ground pickup).
- Economy: ~4 packs ≈ Med Kit×2.7 cost for 100 HP delayed — cheaper per HP
  than Med Kit's instant 40, pays in patience. Banking packs is the intended
  feeder for the future Deepdive TV (needs ≥20s banked kibble at a shop).

## 2 — Presentation

### 2a. Benediction icon set (24 baked glyphs)

New baker `tools/bene-icon-sprites.mjs`, same pipeline as
`tools/icon-sprites.mjs` (12×12 logical grid, 2px grid units, 48×48 PNG,
half-px rim outline, shared element palettes) → `sprites/icons/bene_<id>.png`.
Keys appended to `JH.ICONS.keys`. New files only — never touches hand-cleaned
sprite dirs. Glyphs drawn in the benediction's element palette; duos two-tone;
legendaries element+gold.

Motifs: split_stream forking-Y stream · baptismal_wake ripple-ring footprint ·
overflow brimming cup · baptize droplet+halo · absolution heart-in-droplet ·
scalding_faith steaming droplet · backdraft flame-swirl dash arrow ·
trial_by_fire burning target ring · ash_walk footprint on embers ·
aftershock cracked-wall impact star · sure_grip gauntlet fist ·
bedrock strata-block heart · landslide tumbling boulder arrow ·
gale_stride winged boot · slipstream double swirl trail ·
tailwind coin with gust lines · eye_of_storm spiral w/ calm center ·
steam_sermon cloud over open book · mudslide brown/blue wave ·
firestorm flame tornado · pressure_sermon bursting gauge ·
bushfire spreading flame row · standing_stone monolith ·
whirlwind_walk cyclone over boots.

### 2b. Tier frames + glow (runtime helper)

One shared draw helper (assets.js) renders frame + glow around any baked icon:

- Boon I: thin 1px element-color frame, no glow.
- Boon II: double frame + soft element glow.
- Duo: diagonally split two-tone frame + dual glow.
- Legendary: gold frame + corner studs + slow pulsing gold glow.
- Relic: uniform steel/bronze **gear** frame, no glow (the visual system line).

Consumers: character panel benediction rows, relic collection grid, shop cards,
in-world `Sigil.draw` + `drawSigilCard` (which switch from element diamonds to
the unique glyphs). Baked `frame_duo.png` / `frame_legendary.png` retire.

### 2c. Character panel

- **Collapsed (always on in play)**: top-left block (today's position), one row
  per stat — 6px icon + right-aligned number, ~46px wide, no labels. LV row
  dropped (HUD top bar owns it). Percent stats appear when nonzero (current
  rule). Purchase flash (green ▲) unchanged.
- **Tab-expanded**: width ~152. Stat names appear. Then BENEDICTIONS — 12px
  icon in tier frame + name + wrapped effect text (`wrapText(…, 36, 4)`,
  budgets verified untruncated for all rank-II texts). Then RELICS — grid of
  owned relic icons, 12px gear-framed, ~9/row, icons only. All section heights
  computed from content (existing dynamic-height pattern) — nothing clips.
- Near shop: names shown, benediction descriptions suppressed
  (`inlineDesc = showStats && !nearShop`, as built).
- Input: `toggleStats` action (Tab / gamepad Back) — already built + verified.

### 2d. Shop — slot wheel + staples

Vertical flow becomes: SUPPLIES (Med Kit, Pressure Charge — list rows, icons
bumped to full 12px, row height ~14) → **RELIC WHEEL** (one entry in the
vertical flow) → OVERCHARGE row.

The wheel: four horizontal cards. Cards 1–3 = the vendor's random relic stock;
card 4 = Kibble Pack (fixed). Each card: 12px icon in gear frame, name, price.
On `spawnVendor` the three reels spin — icons cycle, staggered left→right
(~0.3s apart, ~0.6s total), landing with a clunk SFX + flash. Bought relic →
card shows SOLD (dark); exhausted pool → empty slot. Cursor: ↑↓ enters/leaves
the wheel row, ←→ moves across cards, E buys. Description panel shows the
focused card's desc text as for list rows.

## Data flow

```
spawnVendor ──► pickRelics(pool w/ act-gate) ──► wheel spin-in ──► cards
buyRelic ──► relics[id]=true ──► computeStats folds apply() ──► powerCount sees it
death ──► active benedictions → washed ──► Church Reliquary: redeem ALL for N✝ (N=1,2,3…)
Kibble Pack buy ──► kibbleTimer += 6s / +25 HP pool (stacks) ──► (future: Deepdive TV)
```

## Error / edge handling

- Lance act-gate: `pickRelics` filter; a pre-Act-2 vendor can never stock it.
- All relics owned: wheel shows empty slots; Kibble Pack card remains.
- Reliquary with 0 washed: station renders idle (current behavior), no prompt.
- Redeem with insufficient essence: price shown, deny sound, no state change.
- Ex-signature stat carry: buying mid-run recomputes stats with HP/water
  headroom carry (same as `Upgrades.buy` does today — reuse that carry logic
  in `buyRelic` when the relic has `apply`).
- Icon PNG not yet loaded: `Assets.icon()` already returns false → callers
  fall back to text-only rows (existing pattern).
- Save/versioning: none — all state is in-run; no persistence changes.

## Testing

Unit (node --test; derive numbers from config, not literals):
- Every `Benedictions.DEFS` id has `bene_<id>` in `JH.ICONS.keys` (and every
  relic id an icon key) — derived, so adding a benediction without an icon
  fails the suite.
- Reliquary: redeem-all moves every washed→active at washed rank, charges
  1 then 2 then 3; counter survives death, resets on new run; insufficient
  essence = no-op.
- Relic `apply` folds: owning hydro_lance relic yields +18 sprayDamage in
  `computeStats`; Hydro-Dash lowers dashCd and does NOT set dashPuddle.
- `powerCount` counts stat-relics, ignores flag-relics.
- `pickRelics` never yields hydro_lance at actLevel −1; can from 0.
- Overcharge availability flips at actLevel 0.
- Brass Nozzle: +10 on the primary target only — chain hits unaffected.
- Spigot Key: hydrant refill heals 15 (capped at maxHp), no dmg window remains.
- Kibble Pack purchase: suds −30, kibble pool +25/+6s, stacks.

Headless (headless-playtest skill; telemetry spy BEFORE any startGame):
- Shop screenshots: wheel spin frames, focused card desc, SOLD state,
  Kibble Pack repeat-buy.
- Panel screenshots: collapsed block in combat; Tab-expanded with mixed-tier
  benedictions (worst-case ash_walk II text) + relic grid; near-shop compact.
- In-world sigil offer row with unique glyphs + tier frames.
- Reliquary flow: die with boons, church redeem-all, cost escalation visible.

## Release

Minor release per the ritual (version bump + CHANGELOG + titled merge),
candidate name "Rummage Sale". All feel-bearing changes stay uncommitted until
the user playtests on the working branch.

## Future work (recorded, not in scope)

- **Relic + benediction review pass** (user-requested): full-pool effect audit
  of both systems against the post-pass game, with play data; candidate lane
  for new "relics that feed benedictions" designs.
- Deepdive TV (specced 2026-07-06) consumes the Kibble Pack banking loop.
- Shop collection view revisit if the panel grid proves insufficient.
