# Super-Elites: Bulwark & Stalker — Design

**Date:** 2026-06-28
**Status:** ✅ SHIPPED as gameplay (both enemies built via
`2026-06-30-super-elites-bulwark-stalker.md`). Historical record — archived.

> ⚠️ **The Bulwark section below (Archetype 1) is SUPERSEDED.** The "moving
> front-shield / body-block" model described here was scrapped as unplayable and
> replaced by the **shield-throw / deployable-cover** rework
> (`2026-06-30-bulwark-shield-rework-design.md`, shipped `795b121`). A further
> **dome/bubble redesign** is now the ASAP Bulwark task — see the next-level
> vision's open-work list. The **Stalker section (Archetype 2) is accurate.**
**Context:** Follow-up to the v1.0 balance pass (`balance-pass` branch). Playtest finding: late-game enemies don't threaten a maxed player because you out-range, out-DPS, and Hydro-Lance-pierce the whole line. Pure stat-scaling (the existing elite ramp) just makes bullet-sponges. This feature adds two brand-new late-game enemy archetypes that punish the dominant tactics directly.

## Goal

Two new "super-elite" enemy types that make curated Act-4 encounters genuinely threatening to a fully-upgraded player, by countering the two pillars of late-game dominance: **standing-and-piercing** (Bulwark) and **kiting/back-pedaling** (Stalker).

## Design pillars

- **Fewer but super:** these appear in small numbers in hand-authored Act-4 waves, not sprinkled into RNG spawns.
- **Threat through behavior, not HP:** each forces a positioning change rather than just absorbing more spray.
- **Reward existing tools:** the dash (i-frames) is the answer to the Stalker; flanking/repositioning is the answer to the Bulwark.

---

## Archetype 1 — Bulwark (anti-pierce, "moving shield")

A slow, high-HP advancer carrying a **front shield**.

**Behavior:**
- Chases the player but turns to re-face **slowly** (a facing-reorient cooldown). This slow turn is the core counter-play window: dash *behind* it before it pivots its shield back toward you.
- Deals contact/shield-bash damage when it reaches the player (uses the standard contact-damage path; optionally a short wind-up bash later — not required for v1).

**Shield mechanic (the "moving shield" model):**
- The shield faces the Bulwark's current `facing` direction.
- A spray hit is **frontal** (shielded) when the player is on the shielded side — i.e., the Bulwark's `facing` points toward the player's position. Frontal spray does **no damage** (or heavily reduced — exact value tuned in config).
- **Pierce-blocking:** a shielding Bulwark acts as a hard beam blocker in `doSpray`, *even for Hydro Lance (beam ≥ 3)*. The stream stops at the nearest shielding Bulwark in the arc; enemies farther along the facing line take no damage. (Today only non-pierce stops at a blocker; this extends the "stop here" rule to a shielding Bulwark regardless of beam tier.)
- The Bulwark is **vulnerable from behind**: when the player has flanked so the Bulwark's `facing` points *away* from them, spray deals full damage and does not block.

**Why it works:** "stand still and lance the row" becomes "that row is walled off." You must dash past the Bulwark (into the pack, risky) to hit its back, during the brief window before it re-faces.

**Tunables (config):** hp (high), moveSpeed (slow), turnCooldown (sec between facing flips), frontDmgMult (0 or small), touchDmg, contactCd, suds.

---

## Archetype 2 — Stalker (anti-kite, "blink harasser")

A fast, low-HP harasser that repositions to your blind side.

**Behavior:**
- Between blinks, chases fast (high base move speed) so it always pressures.
- On a cooldown: plays a brief **telegraph tell** (the existing enemy "tell" cue/flash), then **blinks** to the player's blind side — behind the player relative to `player.facing`, at a set offset, clamped to the arena/depth bounds.
- After reappearing, a short **wind-up strike** (melee hit). The player's **dash i-frames** negate it — this is the intended dodge.

**Why it works:** back-pedaling while spraying no longer creates safe space — the Stalker appears behind you and forces a turn/dash. Camping at max range is punished the same way.

**Tunables (config):** hp (low), moveSpeed (fast), blinkCd, blinkTell (telegraph duration), blinkDist (offset behind player), strikeWind, strikeDmg, strikeRange, suds.

---

## Placement & wiring

- **Curated Act-4 waves.** Act 4 begins after the Quake Walker ally cutscene. The cutscene is triggered by a **hardcoded** `this.waveIndex === 9` check in `waveCleared_`, and `nextWave = 10`. To avoid disturbing that, new waves are inserted at **index ≥ 10** (after the cutscene), before the Gateway Krusher finale.
- **Proposed new waves** (exact roster tuned in the plan), e.g.:
  - `THE BULWARK LINE` — 1 Bulwark + a couple of mooks/chargers behind it (so the shield-blocking matters).
  - `STALKER AMBUSH` — 1–2 Stalkers + light support.
  - (Optionally a combined `PINCER` wave with one of each.)
- **WAVE_TRIGGERS invariant:** `WAVE_TRIGGERS` in `js/game.js` must grow in lockstep with `JH.LEVEL1.waves` (the length-invariant `console.warn` guards this). Each new wave needs a sensible world-x gate within `JH.LEVEL_LEN`.
- **Final-boss check** (`waveIndex >= waves.length - 1`) is dynamic and stays correct after insertion.
- No double-ramp: these are inherently strong with fixed late-game stats; the existing elite ramp (`makeElite`) is **not** applied to them (they are not `tough`-flagged elites — they're their own types).

## Components / files

- `js/config.js` — `JH.ENEMIES.bulwark` and `JH.ENEMIES.stalker` stat blocks; new `JH.PAL` color keys; the new wave entries in `JH.LEVEL1.waves`.
- `js/entities.js` — `Bulwark` and `Stalker` classes (extend `Enemy`), each with `think()` (and Bulwark's slow-turn + shield-facing state, Stalker's blink/strike state machine). Register both in the `JH.makeEnemy` factory.
- `js/entities.js` `doSpray` — extend the beam-blocker logic so a shielding Bulwark stops the stream for all beam tiers and applies `frontDmgMult` to frontal hits; full damage from behind.
- `js/assets.js` — procedural placeholder painters for both (same pattern as existing enemies); real sprites later via the Gemini→aseprite→sprite-forge pipeline.
- `js/game.js` — `WAVE_TRIGGERS` entries for the new waves; the `else if (wave.boss)` mapping is untouched (these are normal-wave spawns).

## Art approach

Ship with **procedural placeholder painters** so the mechanics are playable immediately. Real animated pixel-art sprites are a parallel track (art pipeline), swapped in at the painter seam per CLAUDE.md. This feature's scope is **gameplay only**.

## Testing / verification

- Pure logic that can be unit-tested (Node `node:test`, following the `js/balance.js` pattern) should be extracted where natural — e.g., the Stalker blink-target computation (given player pos+facing+offset+bounds → reappear point) and the Bulwark shield-facing/frontal test (given player pos vs bulwark pos+facing → shielded?). These are pure and worth locking with tests.
- Everything else (AI feel, shield-blocking in the live spray loop, wave pacing) is **manual playtest**, per project convention. Dev wave-select (backtick) warps with 999 Suds to reach the new Act-4 waves directly.

## Out of scope

- Real sprite art (parallel pipeline track).
- Bulwark shield-bash wind-up attack (contact damage is enough for v1; can add later).
- Applying these archetypes outside the curated Act-4 waves.
- The unrelated pending items from the balance branch (shop cache-visibility fix, elite-ramp tuning) — tracked separately.

## Open sequencing note (not part of the spec)

This builds on `balance-pass` (shares the spray/pierce loop and the late-game balance intent). Implementation should branch from `balance-pass` (or from `main` after that merges) so the two don't diverge on `entities.js`/`game.js`.
