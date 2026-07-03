# Benedictions — Hades-Style In-Run Boons (No New Buttons)

**Date:** 2026-07-02 · **Priority: Must-explore** · **Scope: L (system M + content S per batch)**

## Problem statement (grounded)

In-run build choice today is the 15-node Suds tree (`js/upgrades.js`) plus three Overcharge repeatables. Almost every node is a stat delta (+dmg, +range, +HP); only three change *rules* (Hydro Lance pierce, Split Stream, Hydro-Dash puddle-visual). The economy maxes the tree mid-run, every run converges on the same build, and — per the vision doc — "Player agency (Pillar 3) still mostly unbuilt." Meanwhile the constraint set is unusually clean: the kit is move/spray/dash **only** (jump and melee were cut; `input.js` binds no key to them), and `IDEAS-TALENT-TREE.md` already establishes the input philosophy: *default to passive/auto-trigger; a new button only if unavoidable*.

The code has a surprising number of dormant hooks that boons can light up without new engine work: `splitStream`, `waterReturn`, `dashPuddle`, `dodgeChance`, `vampiricRate`, `moveRegen`, `dashBoost` (all read in `Player`/`doSpray`), the burn/`FirePatch` system, knockback, the GUSH combo, and the kibble/Concerta buff-timer pattern.

## The idea

**Benedictions**: temporary-for-this-life boons granted by the four elements, offered as a **pick-1-of-3** after each boss and each set-piece (8 choice moments per run — the same cadence Holy Essence crosses already drop on, `game.js` ~444). They stack until you die; death washes them away (you keep Suds/tree/Mirror as today). This finally gives the "unloseable" death loop real stakes — dying costs your benediction stack, not your progress.

**Presentation (no modal, no new button):** after the award moment, three floating element sigils hover in the cleared arena (the walk-up-station pattern from the Church, `church.js` stations); walk to one and press E. Skipping is allowed (walk on) — Hades door logic, diegetic.

### Content — verbs first, numbers second

Each benediction hangs off one of the four verbs the player already has (Stream, Dash, Tank, Body). Sixteen to start, four per element. Examples with their code hooks:

**💧 Water**
- *Undertow* — spray knockback reverses: the stream **pulls** enemies toward you (flip the sign in `doSpray`'s `applyKnockback` call). Suddenly you herd instead of scatter — synergizes with pierce and Split Stream.
- *Baptismal Wake* — dash leaves a real puddle zone (FirePatch-shaped object, friendly): enemies inside are slowed 30%. (`dashPuddle` finally becomes mechanical.)
- *Second Font* — Closed Loop doubled while at full-pressure tier (`waterReturn` hook).
- *Absolution* — wave-clear restores 25 HP (the old removed `clearHeal`, reborn as a choice instead of a default).

**🔥 Fire (unlocks in the pool after the Slayer is redeemed)**
- *Scalding Faith* — full-pressure spray applies **Scald** (enemy-side DoT, 4/s for 2s — the enemy mirror of `applyBurn`; one small new status on `Enemy`).
- *Ash Walk* — immunity to your first burn stack each patch; walking through fire leaves it doused (patch `sprayProgress` bump on overlap).
- *Backdraft* — your dash through an enemy Scalds it (dash i-frames already overlap bodies).
- *Stoke the Boiler* — +25% damage while you have ≥1 burn stack (risk trade; burn UI already exists).

**🪨 Earth**
- *Stone Nozzle* — full-pressure hits stagger: interrupt wind-ups (`windTimer` reset, capped 1/enemy/3s). Anti-Charger tool the threat mix needs.
- *Sure Grip* — no spray movement slow (removes the 0.55× factor in `Player.update` ~249) but +10% water drain.
- *Bedrock Vigor* — +40 max HP, −10 move speed (the tanky identity pick).
- *Landslide* — your knockback sends enemies through other enemies for collision damage (pairs with *Undertow* inversely — mutually exclusive pick tension).

**🌬️ Air (unlocks with Ass Man; two ship early anyway)**
- *Second Coming* — kill during dash boost window resets dash cooldown (`dashBoostTimer` exists).
- *Slipstream Draft* — after a dash, next 0.5s of spray costs no water.
- *Tailwind Tithe* — +move speed scaling with GUSH combo (finally a mechanical combo hook, capped).
- *Eye of the Storm* — 0.5s of `dodgeChance = 1` after a benediction sigil pickup / wave start (opener protection for the early-game problem).

### Duos (Hades duo-boons — the chase)

Offered rarely when you hold prerequisites from two elements:
- *Steam Sermon* (💧+🔥) — spraying a FirePatch vents a damaging steam cloud over it (extinguishing becomes offense; uses the patch's existing `sprayProgress` path).
- *Mudslide* (💧+🪨) — your puddles + knockback: enemies knocked across a puddle are dragged its full length.
- *Firestorm* (🔥+🌬️) — dash trail leaves the Slayer's own `dashPatchSpacing` fire trail, friendly.

### The special (the one allowed input upgrade)

*Charged blast* from the vision doc, without a new button: **release-burst** — releasing spray after ≥0.8s of continuous full-pressure fire emits a short knockback cone (10 water). It's a boon (*Pressure Sermon*, water pool), not baseline, so the base kit stays pure and the tech is opt-in. `sprayHeldT` already tracks continuous spray time (`doSpray` ~324).

## Why it's fun

This is Hades' actual engine of replayability — gods offering rule-changing, stackable, synergy-bearing choices at a steady cadence — mapped onto elements the game already worships (the Church shrines, the Mirror branches, the ally bosses). Every benediction changes what a *button already does*, honoring the three-verb kit, and the element pools give the meta loop a hook: redeeming a boss doesn't just light a shrine, it adds that god's voice to your runs. Pick-1-of-3 at fixed beats also smooths difficulty (the early spike gets an opener boon; the late lull gets escalating synergies) without touching enemy math.

## Scope

**System M:** offer/pick flow (walk-up sigils), a `player.benedictions` list folded like buffs (the kibble/Concerta timer pattern generalized to permanent-until-death flags), death-wipe, HUD icon strip. **Content S per batch of ~6**, each individually playtest-gated. Enemy-side Scald status is the one real engine addition (small: mirror of player burn). No new art beyond three sigil glyphs (procedural, per CLAUDE.md).

## Open questions

1. Do benedictions persist through a death at reduced count (keep 1 random) to soften the loss? Start with full wash — stakes are the point.
2. Rarity tiers (common/epic) or flat pool? Start flat; add duos as the only "rare."
3. Does the tree need trimming once benedictions exist (two overlapping in-run systems)? Likely: tree = stats/economy, benedictions = rules. Revisit after playtest.
4. Sigil choice UI on gamepad (walk-up works; confirm E maps to A/Start — `input.js` maps confirm to Start only, worth adding A).
