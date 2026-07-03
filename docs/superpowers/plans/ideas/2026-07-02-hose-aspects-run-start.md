# Hose Aspects — A Run-Start Take to Replace the Mirror-Altar Question

**Date:** 2026-07-02 · **Priority: Strong** · **Scope: M**

## Problem statement (grounded)

The Elemental Mirror altar v1 is built (`js/mirror.js`, `JH.MIRROR` in config, walk-up stations in `church.js`) but **explicitly under reconsideration** — its own spec carries a warning banner, and the church vision's "Corrected flow" (2026-07-01) parks the two-sided-node model while leaving the real question open: *"What the light-ups DO is undecided. They may power Jon up in some way — mechanic TBD."*

The Mirror's weakness is diagnosable from its node table: all 18 sides are stat deltas (+3 dmg, +12 water, +15 HP…). Permanent stat floors are the least *felt* form of progression — invisible moment-to-moment, and they compound the trivial-late problem (they're also invisible to `eliteScale`, see the difficulty spec). Hades' Mirror works because it sits *underneath* a system that changes verbs every run (boons + **weapon aspects**). Jon Hose is building the boons (benedictions spec); this spec argues for the aspect layer — and for making aspects the answer to "what does a lit shrine DO."

## The idea

**Hose Aspects**: before leaving the Church (and at the run-start hydrant), choose the hose's *form*. One choice, changes the feel of the whole run — Hades' Aspects of the weapon, themed as the four elements the game already worships.

Each redeemed ally **lights their shrine ⇒ unlocks their aspect**. That makes the reveal beats in the corrected church flow (Quake's stomp cracking open the chamber, the Slayer lighting Fire) deliver something you *hold in your hands* next run, not a +3 on a stat sheet.

### The aspects (v1 — four, each one rule + a stat trade)

| Aspect | Unlock | The rule change | The trade |
|---|---|---|---|
| **Aspect of Jon** (💧, default) | always | the shipped kit, exactly | — |
| **Aspect of the Quake** (🪨) | Quake redeemed | stream is a short **wide fan**: `sprayHitBand` 18→34, range −35%; full-pressure hits stagger wind-ups | close-range crowd controller; weak vs. Pyro/Smelt standoff |
| **Aspect of the Slayer** (🔥) | Slayer redeemed | no mid tier: pressure is **all or nothing** — ≥60% tank sprays at 1.5×, below that sputters (`doSpray`'s `dmgScale` table becomes two-step) | burst discipline; hydrant/regen play becomes the skill |
| **Aspect of the Font** (💧 capstone) | Dark Jon defeated (see meta spec) | **holy water**: lifesteal baseline 6%, spray heals nothing extra but *extinguishes and cleanses* (douse objectives 2×, burn stacks purge on spray release) | −15% damage; the sustain/support identity |

(An Air aspect — dash-woven, `Slipstream`-flavored — ships with Ass Man; the table above needs no unbuilt boss except the capstone.)

Aspects are data blocks folded exactly where the Mirror folds today (`Upgrades.computeStats` already calls `JH.Mirror.apply` — an `JH.Aspects.apply(s, aspectId)` sits beside it), plus at most one behavior flag each read in `doSpray`. The fan and two-step-pressure aspects are pure config-shape changes to logic that already branches on `beam`/`frac`.

### What happens to the Mirror

Don't delete — **demote and repurpose**:
1. The 9 walk-up stations collapse into the aspect shrines + a single small "Vigor font" (the 3 water stat nodes, kept as a modest Essence sink for players who want raw floor).
2. **Essence's main sink becomes aspect ranks** (Hades: Titan Blood): each aspect has 3 ranks deepening *its own rule* (e.g., Quake fan: rank 2 widens the stagger window; Slayer: rank 3 raises the burst tier to 1.7×). Ranks reuse `mirror.js`'s cost/rank plumbing nearly verbatim (`nodeState`/`buy`/`cost` are already pure and tested — `tests/mirror.test.js`).
3. Old saves: `state.mirror` water ranks migrate into the Vigor font (the migration pattern already exists — `migrateBlessings`, `church.js` ~103).

### Why this beats the two-sided-node altar

- **Choice you can feel in 5 seconds.** An aspect changes the shape of the water leaving the nozzle; a node changes a number you verify in a spreadsheet.
- **Answers the parked question directly.** "What does the light-up do?" → *it hands you the ally's way of fighting.* Quake's aspect staggers like his stomp; the Slayer's is his all-in temperament. Narrative and mechanics point the same way.
- **Run variety multiplies with benedictions.** 4 aspects × element boon pools ≈ Hades' aspect+boon matrix — the replay engine — while the flat node tree multiplies with nothing.
- **Cheap.** No new scene (shrines exist, stations pattern exists), pure-logic rank plumbing exists, and v1 is 3 aspects + 1 gated capstone.

## Why it's fun

Weapon aspects are the single highest-leverage replayability system in Hades: same fights, new hands. Jon has exactly one weapon, which makes aspects *more* valuable here, not less — they're the only way the hose itself ever changes. And run-start choice at the Church gives every death the Hades cadence: die → talk → *re-arm differently* → dive.

## Scope

**M.** Aspect data + `computeStats` fold + 2 behavior flags in `doSpray` + shrine walk-up UI (reuse station code) + rank sink + save field. Art: none required (stream already visually varies by beam tier; the fan reuses spread math — widen `sprayWidth`/`spread`, per CLAUDE.md keep placeholder-level).

## Open questions

1. Do aspects gate behind *beating* the game once (protect the tuned first campaign), or unlock live as allies are redeemed mid-campaign? Lean: live — the mid-campaign power beat is the point of the reveal.
2. Should aspect choice lock per-life or per-run-start only (change at any hydrant?)? Lean: per-death (choose in Church) — keeps identity but allows adaptation.
3. Does the Slayer aspect fight the Concerta pill (infinite water trivializes its trade)? Probably cap Concerta at the 60% tier under that aspect.
4. Names: in-fiction titles ("The Marshal's Fan"?) vs. ally names — bikeshed at playtest.
