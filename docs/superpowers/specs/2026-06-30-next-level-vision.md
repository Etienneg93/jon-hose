# Jon Hose — "Next Level" Vision (juice, agency, elements, new acts)

**Date:** 2026-06-30 (progress/reprioritization update 2026-07-01)
**Status:** Approved direction (brainstorm w/ user). Umbrella vision — each pillar
below gets its own spec + plan.
**Branch:** `next-level-pass` (off `balance-pass`). Nothing here ships to the live
game until reviewed.

## Progress & reprioritization (2026-07-01)

- **DONE:** Elemental Mirror altar v1 (Pillar 1) — **but the concept is now under
  reconsideration**, see its spec banner + the church "Corrected flow." GUSH combo
  meter (Pillar 2). Bulwark & Stalker enemies (Pillar 4 / row 6). Fire world +
  Slayer boss (Act 3) — in progress.
- **🔥 ASAP — Bulwark dome fix:** the shipped shield-throw Bulwark is *still*
  unplayable. Next iteration: **shield-throw + Bulwark hides inside a translucent
  dome/bubble fortress**. Needs its own spec + plan. Highest-priority open item.
- **Juice pass is partly already there:** pickup magnetism exists in some form;
  GUSH combo is **visual-only** (candidate: tie it to an ability/upgrade later).
  Remaining juice: hit-stop, soaked stacks, camera punch/slow-mo.
- **Church elemental progression is being rethought.** The two-sided Mirror-node
  talent-tree is parked; see `2026-06-29-church-of-the-hose-progression-overhaul-vision.md`
  § "Corrected flow" for the authoritative ally-lights-the-chamber model.
- **NOT near-term — "Finale act" (Act 5):** a full clear is currently <10 min
  (the fire world lengthens it a bit). The game is nowhere near needing a finale;
  Act 5 / Firewall → Gateway Krusher capstone is **deferred indefinitely**, not an
  open work item.
- **Player agency (Pillar 3) still mostly unbuilt** and wanted: charged blast,
  keepsakes, door-choice, dash-attack.

## Why this exists

The game is mechanically complete (waves → bosses → win) and now has the Church
death-loop (Phase 0). The next leap is **feel and depth**: make every hit chunky,
give the player expressive choices, and turn the four elemental shrines — today
purely cosmetic trophies — into the meta-progression spine. Direction is drawn
from **Hades**: chunky hit feedback, build-defining permanent upgrades (Mirror of
Night), keepsakes, and a "House" that fills with redeemed characters.

## How this fits the existing canon (read before building)

This is **not** a new direction — it's the payoff of work already designed:

- **`2026-06-29-church-of-the-hose-progression-overhaul-vision.md`** — the Church
  north-star. Its **Phase 3 (Elemental archetypes)** = "each ally-boss unlocks its
  archetype branch in the spiritual talent tree." The Mirror altar below *is*
  Phase 3, simplified: the Mirror **is** the spiritual tree, organized by element.
- **`IDEAS-TALENT-TREE.md`** — cross-branch combo talents, consumables, the
  "Jon-as-remote" world map, the Cauliflower Whisperer. The combo-talent flavors
  feed the Mirror's higher nodes; the consumables/world-map/NPC stay parked.
- **`FEATURE-BREAKDOWN.md` §2 — The Slayer** — fire ally, already fully broken
  down (boss→ally like Quake). Becomes Act 3's boss; lights the Fire branch.
- **`2026-06-28-super-elites-design.md` — Bulwark & Stalker** — two new enemy
  archetypes already designed (anti-pierce shield / anti-kite blink). They slot
  into the new acts.
- **Boss lineage (Planner/TODO.md)** — Switch → Firewall → Gateway Krusher.
  Firewall still isn't wired into waves; it joins the finale act here.
- **"Ass Man" (air ally)** — art started (`sprites/assman/`), **no design exists**.
  Genuinely new; specced as Act 4.

Genuinely-new contributions of this vision: **(1) a focused game-feel/juice pass**
(never specced), **(2) the concrete Mirror altar design**, **(3) the Ass Man air
act**, and **(4) the act/biome restructure** that ties boss conversions to element
unlocks.

## The five pillars

### 1. The Elemental Mirror altar (the spine) — *first to build*

Redeeming **Quake Walker (Earth)** opens a stairwell off the nave to the **Mirror
chamber**. Four element pillars; **Water lit from the start** (Jon's own element),
the others dark until you redeem their ally. Spend **Holy Essence** on **two-sided
nodes** (Hades' Mirror of Night: commit to one side, free re-toggle). This
**replaces** the three flat blessing stations — they become the opening Water
nodes. Redeemed allies hang out in the church by their pillar (the "House" fills
up; pays off *Essence of Friendship*).

**Ships in stages:** Water + Earth branches work immediately (both allies exist —
Jon + Quake). Fire/Air nodes are data-stubbed and light up when those bosses land.

Full design: `2026-06-30-elemental-mirror-altar-design.md`.

### 2. Game-feel / juice pass — *the new feel layer*

Hades' "every hit feels chunky." Impact order:

1. **Hit-stop** — 2–4 frame freeze on spray-kills and boss hits. Biggest single
   feel upgrade; pairs with existing `shake()`.
2. **Hit-flash + squash-stretch** — enemies flash white & deform on hit; on death
   **pop into a water splash + coin spray** instead of vanishing.
3. **"Soaked" stacks** — sustained spray visibly drenches an enemy (darken + drip
   particles); soaked enemies take slightly more damage. Hooks Fire later
   (soaked = extra burn).
4. **GUSH combo meter** — ✅ built, but **visual-only**. Candidate next step: tie
   it to an ability or upgrade so it's mechanically meaningful.
5. **Camera punch-in** on boss intros + **slow-mo on the final blow** (hangs on
   the existing boss-death sequence).
6. **Pickup magnetism** — ✅ already exists in some form (Suds/coins arc toward Jon).

Remaining juice to build: hit-stop, hit-flash/squash + death-pop, soaked stacks,
camera punch/slow-mo.

### 3. Player agency — Hades-flavored

1. **Charged High-Pressure Blast** — hold to charge, release a knockback cone.
   Promotes the Pressure-Charge consumable to a skill-expression button (the
   "Special"). Biggest agency add.
2. **Keepsakes** — before a dive, equip **one redeemed-ally token** for a passive
   (Quake = knockback resist; Slayer = +burn; Ass Man = extra dash). Ties allies
   → builds.
3. **Door/path choice between waves** — pick the next encounter from 2–3 doors
   that **preview the reward** (Suds / Essence / heal / elite-for-loot). Adds
   agency to the linear wave line.
4. **Dash-attack** — dashing through an enemy during i-frames procs a hit (the
   talent doc's "Slip Draft" as a baseline).

### 4. New enemy types

- **Already designed — just build:** **Bulwark** (shield, anti-pierce — flank it)
  and **Stalker** (blinks behind you — dash it). See super-elites spec.
- **New, element-themed (2 per new biome):**
  - **Fire:** *Cinder Imp* (fast swarm, ignites on touch — wide spray) ·
    *Slag Bloater* (slow tank, bursts into a lava puddle — spacing).
  - **Air:** *Drifter* (hovers in depth, dodges ground spray — up-aim) ·
    *Gust Sprite* (periodically shoves Jon — positioning threat).

### 5. Level / act plan — introducing Slayer & Ass Man

Hades' escalating biomes. Each boss→ally conversion lights its Mirror pillar and
adds that friend to the church.

| Act | Biome | New enemies | Boss | Lights |
|---|---|---|---|---|
| 1 | Hosetown Street | mook/charger/pyro | The Switch | — |
| 2 | Construction / Rubble | + Bulwark | **Quake Walker** | 🪨 Earth → opens Mirror |
| 3 | **Boiler District** (lava/furnace) | Cinder Imp, Slag Bloater | **The Slayer** | 🔥 Fire |
| 4 | **Windy Heights** (rooftops) | Drifter, Gust Sprite, + Stalker | **Ass Man** | 🌬️ Air |
| ~~5~~ | ~~Finale~~ | ~~curated pincers~~ | ~~Firewall → Gateway Krusher~~ | ~~💧 Water capstone~~ *(deferred indefinitely — game is nowhere near a finale)* |

Water beats fire — the Slayer is the most thematically perfect hose fight. Ass
Man's act is where **wind physically pushes Jon** (gust as a mechanic).

## Build order (decomposition)

Each item is its own spec → plan → implementation.

| # | Deliverable | Depends on | Ships without new boss? |
|---|---|---|---|
| 1 | **Elemental Mirror altar** (Water + Earth) | — | ✅ yes (first) |
| 2 | **Game-feel / juice pass** (increment 1) | — | ✅ yes |
| 3 | **Charged Blast / Keepsakes / Door-choice** | juice helpers | ✅ yes |
| 4 | **The Slayer** (Boiler act + Fire branch) | Mirror | new boss |
| 5 | **Ass Man** (Windy Heights + Air branch) | Mirror | new boss |
| 6 | **Bulwark / Stalker** (own spec) | — | ✅ yes |

## Out of scope for this vision doc

Per-node Essence formulas, Mirror UI layout, boss movesets, biome backdrops, and
keepsake/door data schemas — each defined in its pillar's own spec.
