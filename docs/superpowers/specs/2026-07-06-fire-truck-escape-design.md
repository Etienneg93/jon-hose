# Fire-Truck Escape — Design Spec

Date: 2026-07-06
Status: Design (approved for spec review)
Branch: claude/fire-truck-minigame-concept-2pdlg0
Supersedes brainstorm: `docs/superpowers/plans/ideas/2026-07-06-fire-truck-interlude-minigame.md`

## Problem / opportunity

Beating the Slayer is the end of built content. `afterSlayerCutscene`
(`js/game.js:618-637`) currently opens a **placeholder `victoryPortal`** —
"Placeholder exit to the next world" — which the player walks into to hit
`win()`. There is no bridge from the Fire World to the (unbuilt) Air World /
Ass Man; the run just ends.

This spec fills that seam with a **single bespoke ~60-second set-piece: a
fire-truck escape.** Slayer falls, the forge-world collapses, and Jon guns it
out on the department's truck — its oversized mounted hose blasting the fire
roster off the road — arriving at the Air World's gate. It's the Fire World's
victory lap and the on-ramp to Ass Man.

## Goals

- A **~60s** high-speed escape that reads as spectacle and release, not a second
  difficulty test. It is the palate-cleanser between two worlds.
- **Zero new player language.** The three verbs are the game's own, re-oriented
  into a scrolling road: **move = dodge/aim, spray = kill, dash = swerve.**
- **Reuse the Fire roster** (fuse, smelt, pyro, furnace, FirePatch) as road
  hazards — art and behavior we already have.
- Plug into **existing reward plumbing**: strewn `"cross"` Holy Essence pickups
  and a closing **benediction sigil beat**.
- **Honest numbers, rim-is-hitbox** hold exactly as in the main game.
- Land it at the **Air World entrance** — swappable to the real Ass Man act when
  it exists; stubs to `win()` until then.

## Non-goals

- **No Air World content.** No Ass Man boss, air enemies, or air waves here.
  This spec only builds the truck run and wires its exit to the (currently
  `win()`) air-world seam.
- **No build/benediction carryover.** Fixed loadout by design — see §4.
- **No new player-facing buttons.** No charge/ram supermove (the big beam does
  the work); flagged as a possible later add in Open Questions.
- **Not a recurring system.** One instance, after Slayer only.

## Design

### 1. Where it lives — a self-contained sub-mode

Modeled on the **Church interlude**, the only bespoke-scene precedent
(`js/church.js` + its dispatch in `js/game.js`). The truck run is its own module
`JH.TruckRun` (`js/truck.js`) owning a `scene` object with an internal phase
machine, exposing `enter(game)` / `update(dt, game)` / `renderScene(ctx, game)`.

- **New state string** `"truck"` on `game.state` (joins `play`, `church`,
  `cutscene`, … around `js/game.js:326-349`).
- **Update dispatch**: one branch beside the church branch
  (`js/game.js:~1352`): `if (this.state === "truck") { JH.TruckRun.update(dt,
  this); return; }`.
- **Render dispatch**: beside the church render branch (`js/game.js:~1670`):
  `if (this.state === "truck") { JH.TruckRun.renderScene(ctx, this); return; }`.
- **Entry**: in `afterSlayerCutscene` (`js/game.js:618-637`), replace the
  `victoryPortal` block with `this.state = "truck"; JH.TruckRun.enter(this)`.
  Camera unlock/HUD hiding already happen upstream in the Slayer cutscene path
  (`js/game.js:555-565`).
- **Exit**: on finish, `JH.TruckRun` calls a new `game.afterTruckRun()` that runs
  the closing benediction beat (§7) then routes to the air-world entrance —
  currently `win()` (`js/game.js:1243-1252`), later the Ass Man act intro.

The truck run does **not** use the `Player`/`enemies`/wave systems. It holds its
own lightweight lists (hazards, pickups, hydrants) and a single `truck` object
(x, depth, hp, water). Jon is *depicted* on the running board manning the nozzle
(art), not driven as the normal `Player` entity. This isolation mirrors the
Church scene and keeps the main combat systems untouched.

### 2. Frame, camera, movement

Reuses the existing coordinate model (`js/world.js:5-12`) and the depth band as
the dodge axis:

- **Auto-scroll.** The world scrolls left→right under a truck fixed near
  screen-left (`truckScreenX ≈ 140`). Scroll speed `scrollSpeed ≈ 320` px/s
  sells "high speed" (well above the camera's normal follow). Over 60s ≈ 19,200px
  of road — its own coordinate space, independent of `JH.LEVEL_LEN`.
- **Depth = the road's width and the dodge axis.** The truck moves continuously
  in depth over `[JH.DEPTH_MIN 0 .. JH.DEPTH_MAX 86]` (`js/config.js:20-21`),
  exactly as Jon moves in depth now. Authoring uses ~3 **soft lanes** (depth
  ≈ 16 / 43 / 70) for telegraph clarity, but movement is analog.
- **Throttle/brake** on the horizontal axis nudges `truckScreenX` within a small
  band (≈ ±40px) for spacing — lets you back off a cluster or lunge a pickup.
- **Dash = swerve.** Reuses dash feel (`dashSpeed 240`, `dashTime 0.18`,
  `dashCd 0.7`, i-frames through the dash — `js/config.js:116-118`,
  `js/entities.js:387,909`): a quick depth burst with i-frames, the panic dodge.
- **Parallax.** Reuse `JH.Background`'s layered deterministic parallax machinery
  (`js/world.js:97-290`, near layer at 0.5) with a **fire-highway palette + road
  foreground** (new art, §9). Into-the-screen perspective is explicitly rejected
  (would need all-new scaled art).

### 3. The truck hose — the big blast

Much bigger than Jon's (baseline `sprayDamage 50`, `sprayRange 78`,
`sprayHitBand 18`, thin cone — `js/config.js:129-132`). The truck cannon:

- **`hoseDps ≈ 120`** (≈2.4× Jon) — road mooks pop near-instantly.
- **`hoseRange ≈ 200`** — reaches most of the screen ahead.
- **`hoseBand ≈ 28`** depth half-swath **centered on the truck's current
  depth** — a fat forward rectangle. This is the elegant Driver coupling:
  **position IS aim.** From mid-road the swath covers ~65% of the width; from an
  edge you cover your half. To kill a far-lane threat you slide into its lane —
  which is also how you dodge — so movement does double duty. The swath is
  generous enough that you're never helpless, but a threat in the lane you're
  *not* covering forces a real reposition.
- Fires **forward only** (+x, direction of travel). No 360° aim, no separate
  reticle — that's the whole point of Driver.
- Knockback shoves hazards back down the road (juice; harmless).

### 4. Fixed loadout + light tank

**No benediction / upgrade / build carryover.** The truck run tunes against ONE
known kit, so there is no `eliteScale` or player-power scaling — the road's
hazard density is the entire difficulty knob. (Honest-numbers + cheap-to-balance
win.)

Tank is present but **generous** — never the main game's dry-tank anxiety:

- **`tank 100`, `drain 20`/s** → **5s** of continuous fire (vs Jon's ~2.8s).
- **`regen 6`/s** slow passive — enough to top off between clusters, not enough
  to camp the beam. Hydrants are the real refill.
- **Two-tier pressure** (simplified from the main game's four): at/above a small
  floor = full `hoseDps`; **dry = sputter** (`~0.25×` dps, `~0.5×` range).
  Running dry mid-climax is a real, recoverable mistake.

### 5. Hydrants — refuel + lane-wash weapon

Smashable road props at set depths. Blasting one (small HP, ~30):

- **Refuels `+60` water** instantly (a burst).
- **Washes its lane**: spawns a one-shot friendly water AoE (reuse the
  `FirePatch` *friendly* pattern, `js/entities.js:2081-2094`) that soaks/kills
  enemies within `washRadius ≈ 40` depth-band and extinguishes any FirePatch it
  overlaps. So a hydrant is fuel **and** a setup weapon: lure enemies alongside
  it, then pop it.

Spacing ≈ one every ~9s (~6 across the run), often placed one lane off the safe
line so refueling costs position.

### 6. Hazards (Fire roster reuse) + honest HP

The truck has a **visible HP bar** (`truckHp 200`, honest — generous for a bonus
gauntlet). Two hazard classes, all sharing **one shape between draw and hit**
(rim-is-hitbox; reuse `FirePatch.footprint()` / `Geo.inGroundEllipse`,
`js/world.js:53-58`, `js/entities.js:2072-2076`):

**Environmental**
- **Molten wrecks / debris** — static in a lane, scrolling toward you. Small HP
  (~50); blast to break or slide around. Un-broken collision = **`-15 truckHp`
  + shake + brief speed loss** (see the wall loop below).

**Enemies (simplified, existing sprites/behaviors)**
- **Fuse-mook** (`hp 65`, `blastDmg 18`, `js/config.js:235-246`) — flung at the
  windshield; pop it or eat the blast (`-18 truckHp`).
- **Smelt lobber** (`hp 450`; lobs a `FirePatch` on landing,
  `js/config.js:220-234`, `js/entities.js:4427`) — roadside, drops a fire-zone
  into a lane ahead. Driving through it = burn stacks (`burnDpsPerStack 4`,
  `js/config.js:373-383`); **douse it with the beam** to clear the lane (reuse
  existing douse math, `js/entities.js:844-855`).
- **Pyro embers** (`emberDmg 9`, `js/config.js:167-171`) — roadside spitters;
  dodge or kill.

**HP is non-lethal by design** (bonus gauntlet, "less punishing"). It does two
things: (a) feeds collision juice, and (b) **gates the Clean-Escape bonus** (§7).
It never ends the run early — escape is guaranteed. Each collision also briefly
**slows the truck**, which lets the collapse wall creep closer (below), turning
sloppy driving into pressure rather than death. *(Making HP lethal is a
one-line escalation left for a later playtest — Open Questions.)*

**The collapse wall.** A wall of fire/rubble chases from the left screen edge —
cosmetic terror that sells the escape and stops essence-camping. Its gap to the
truck is your "lead." Collisions (speed loss) let it creep up; clean driving
restores speed and rebuilds the lead. Wall contact = burn stacks + heavy shake +
"FORWARD!" and blocks the rearmost lanes — but **cannot kill**. A pure rubber-band
pressure meter.

### 7. The climax + rewards

**Furnace douse-race (~35–52s).** The Furnace (`hp 850`,
`js/config.js:247-261`) rolls onto the road as the "road boss." Finale = **hold
the beam on it to extinguish it** while dodging its vent-fire patches
(`ventPatchRadius 26`, reuse `js/entities.js:4825-4835`) and the ongoing
traffic. Break it before the gate → big pop, extinguished, drops a **fat essence
cross (value ~2–3)**. Fail to break it → it simply falls behind (you still
escape); you forfeit its essence and the clean bonus. A greed/skill damage-race,
never a wall.

**Holy Essence — the score.** Reuse `"cross"` `Pickup`s (bank on contact via
`JH.Church.addEssence`, never expire — `js/entities.js:2538-2607`). Crosses are
strewn in the **risky lanes** (behind wrecks, alongside hydrants, in the
furnace's ember spread), so *how greedily you drive = how much you bank*.
Budget, kept in-band with normal essence income (bosses ~1–2, set-pieces 1 —
`js/game.js:573-575,912-914`):

| Source | Value | Notes |
|---|---|---|
| Roadside crosses | 1 each, ~6 placed | greed lanes; typical grab 3–5 |
| Furnace break | ~2–3 | climax payoff |
| Clean-Escape bonus | +1 / +2 tiers | by `truckHp` retained + no wall contact |
| **Realistic total** | **~4–6 typ, ~9–10 max** | ≈ one boss-and-change, one-time |

**Closing benediction beat.** On arrival at the gate, `afterTruckRun` fires the
**existing sigil trio** (`JH.Benedictions.pickOffers` → `JH.Sigil` row, one pick
clears the offer — `js/benedictions.js:187-278`, `js/game.js:531-542`,
`js/entities.js:2630-2651`), banner "BENEDICTION — CHOOSE ONE". **Suppress the
Slayer boss's own post-defeat sigil** so there is exactly one benediction beat,
here at the arrival (route the Slayer wave's `pickOffers` to skip and let the
truck run own it).

### 8. The 60-second beat map

- **0–12s — power moment.** Grab the hose; first blast is huge and wide. Light
  debris only. Learn move/blast/dash unpressured. Sell speed + gun size.
- **12–35s — build.** Fuse-mooks at the windshield, first hydrants (refuel +
  lane-wash), smelt fire-zones to douse, essence dangled in hot lanes.
- **35–52s — climax.** Furnace douse-race + densest traffic; collapse wall
  surges close.
- **52–60s — arrival.** Punch the gate → essence tallies → benediction sigil
  beat → hand off to the Air World seam (`win()` for now).

## Config — single source of truth

All tunables go in a new **`JH.TRUCKRUN`** block in `js/config.js` (nothing
hardcoded elsewhere, per the config rule). Representative fields (exact values
finalized in implementation + playtest):

| Field | Value | Field | Value |
|---|---|---|---|
| `scrollSpeed` | 320 | `truckHp` | 200 |
| `truckScreenX` | 140 | `hoseDps` | 120 |
| `throttleBand` | 40 | `hoseRange` | 200 |
| `tank` | 100 | `hoseBand` | 28 |
| `drain` | 20 | `dryDpsMult` / `dryRangeMult` | 0.25 / 0.5 |
| `regen` | 6 | `hydrantRefill` | 60 |
| `hydrantHp` | 30 | `washRadius` | 40 |
| `wreckHp` / `wreckDmg` | 50 / 15 | `hydrantEverySec` | ~9 |
| `furnaceHp` | 850 (reuse) | `wallCreepOnHit` | tune |
| essence: `crossVal` / `furnaceVal` / `cleanBonus[]` | 1 / 2–3 / [1,2] | `runDuration` | 60 |

Fire-roster hazard stats are **read from existing `JH.ENEMIES`** — no
duplication.

## Testing

Pure/unit-testable (balance.js style, `node --test`):
- **Hazard-spawn timeline** — deterministic given `(seed, elapsed)`; assert
  density curve matches the beat map and no impossible walls (a gap always
  exists in depth).
- **Clean-Escape essence calc** from `truckHp` + wall-contact flag.
- **Furnace douse progress** math (beam dps × dt vs `furnaceHp`).
- **Hydrant lane-wash hit test** via `Geo.inGroundEllipse` (rim = hitbox).

Headless playtest (`headless-playtest` skill): add a debug hook to enter
`"truck"` directly (skip the full run to Slayer), drive real keys, assert
arrival + essence banked + sigil beat opens. **Input gotcha**: a programmatic
keypress must span ≥2 frames (inputs buffered 130ms — `Input.buffered`).

Per the project rule, the run stays **uncommitted until the user playtests the
feel** and says push; release ritual (version bump + CHANGELOG + named merge)
applies when it lands on main. This is a **minor** (0.X.0) — a full designed
pass with its own brainstorm + spec.

## Open questions

1. **Air-world handoff.** Ship the truck run now as a Fire World capstone that
   stubs to `win()`, or hold it to land *with* the Ass Man act as its true
   on-ramp? (Recommend: build now, stub to `win()`, swap the exit later.)
2. **Should HP ever be lethal?** Start non-lethal (spec'd). If playtest wants
   teeth, the escalation is a one-liner (0 HP → forced dented arrival / lose
   carried essence).
3. **Truck art: procedural vs baked?** New chrome needed (truck + Jon-on-board,
   road/fire parallax, hydrant, wall, wrecks). Imagen is 429-dead; hand-bake via
   node tools, or ship a procedural truck first (Firewall-style fallback) and
   bake later. Needs a small asset sub-plan (§9 below) before implementation.
4. **Exact essence payout** vs the church/reliquary economy — the table is a
   first pass; finalize against total-run-income once the Air World's cost sinks
   exist.
5. **Collapse-wall tuning** — creep-on-hit vs recovery rates need feel-testing.
6. **Ram/charge move** — cut for cleanliness; revisit only if the big beam feels
   like it lacks a "smash the one huge thing" beat the furnace doesn't cover.

## §9 Asset sub-plan (to detail in the implementation plan)

Reused as-is: fuse/smelt/pyro/furnace sprites, `FirePatch` visuals, `Sigil`,
`"cross"` Pickup, `Background` parallax machinery. **New**: fire-truck side
sprite (with Jon at the nozzle), road/highway foreground + fire-palette parallax
layers, hydrant prop, collapse-wall, molten-wreck obstacles. Procedural-first
fallbacks per CLAUDE.md art rules; never re-run bakers over hand-cleaned
`sprites/mook/*` or `sprites/fuse/*`.
