# Bulwark "Bubble-Fortress" Redesign — Full Spec

**Date:** 2026-07-02 · **Priority: Must-explore** · **Scope: M**
**Supersedes:** `docs/superpowers/done/2026-06-30-bulwark-shield-rework-design.md` (shipped, judged unplayable) and the quick dome patch currently in code.

## Problem statement (grounded in current code)

The Bulwark has been through two failed iterations (permanent facing-shield → shield-throw), and the dome patch now in `js/entities.js` (`Bulwark`, ~line 1121; `DeployedShield`, ~line 1279) is closer but still isn't a fight. Reading the shipped implementation, five concrete failure modes stand out:

1. **A dead annulus inside the dome.** The dome radius is 58 but the slam only triggers at `dist < slamRange` = 46 (`config.js` `JH.ENEMIES.bulwark`; `Bulwark.think` shelter branch). Worse, while sheltering the Bulwark only chases if `dist > slamRange * 0.8` **and** it's within `domeRadius * 0.5` of the dome center — so a player standing in the ~12px ring just inside the bubble can spray a fully-vulnerable, mostly-stationary Bulwark forever. The "risky duel inside the bubble" collapses into "step over the line and hold the button."
2. **The hose shoves it out of its own fortress.** `Enemy.applyKnockback` only no-ops for `isBoss` (`entities.js` ~line 779). The Bulwark is not a boss, so base spray knockback (115, applied every frame in `doSpray`) pushes it out through its own dome wall while the dome stays planted. Once it's outside its bubble it's just a slow mook.
3. **The dome is pure negation from outside.** It hard-blocks the stream at every beam tier, including the 140-Suds Hydro Lance capstone (`doSpray` blocker scan, `entities.js` ~lines 361–383), and it's indestructible. A ranged build's only move is "stop playing your build and walk in." Negating the player's purchases with no counterplay is the core reason all three iterations have felt bad.
4. **Dome uptime dominates the fight.** `domeDur: 7.0` with `redeployCd: 1.4` means the cycle is ~80% dome. Outside-the-dome time is where the Bulwark is a normal readable enemy; there's almost none of it.
5. **The pyro-huddle plant is unanchored.** With any pyro alive it plants "wherever it stands" (`Bulwark.think` approach branch) — frequently nowhere near the pyros or the player, producing an irrelevant bubble in a corner.

## The idea — the bubble is the fight, and it's poppable

Keep the shipped fantasy (a fortress engineer who deploys a shelter dome, sheltering ranged allies) but redesign around one rule: **the player always has two active, build-expressive answers — pop it from outside, or duel inside — and both are on a clock.**

### The cycle

```
APPROACH → PLANT (0.5s wind, ground ring telegraph)
  → FORTRESS (dome up, max 6s)
      outside: dome RIM has HP — spray it to pop it early
      inside:  duel — slam + bash-eject, Bulwark 80% knockback-resistant
  → BREACH (dome pops/expires): Bulwark staggered 1.4s, fully vulnerable ← the payoff window
  → RETRIEVE (sprints to the emitter prop) → COOLDOWN 3.0s (normal chaser) → APPROACH
```

### Answer 1 — pop it from outside (new)

The dome gets **rim integrity** (`domeHp: 140`, tunable). Spray that hits the dome edge (the existing blocker path already computes the contact point for the splash-back particles, `doSpray` ~line 421) deals its normal damage to the rim instead of vanishing. Pressure-tier and beam upgrades apply, so a Hydro Lance build pops bubbles fast — the dome becomes a *check* on DPS builds, not a *negation*. Visual: the existing rim flicker gets an integrity fade (bright → strained → cracking ripples at contact point). When the rim breaks: a satisfying bubble-pop (droplet spray outward, `boom-small` FxBurst, shake 4) and **every enemy that was sheltering inside is staggered 1.0s and takes +25% damage for 3s** — popping the bubble is a play *on the pyros*, not just on the Bulwark.

### Answer 2 — duel inside (fixed)

- **Slam fills the bubble:** `slamRange` rises to match `domeRadius` (58) so there is no safe annulus. Wind-up 0.65s, same rectangular telegraph, dodge by dashing out through the wall (the dome never blocks the *player's* movement — unchanged).
- **New move — Bash Eject:** if the player is inside for >2.5s continuously, the Bulwark shoulder-checks (0.4s tell): 8 dmg + a strong radial knockback that throws Jon out through the rim. It's the wrestler tossing you out of the ring — the dome duel has a rhythm (get in, deal a burst, get tossed or dash out) instead of a stand-off.
- **Anchored:** while the dome is up the Bulwark takes only 20% of hose knockback (a resist multiplier, not boss immunity — it can still be nudged), so it can't be shoved out of its own fortress. Outside the fortress phase it takes full knockback as today.

### The payoff window — BREACH

Whether the dome expires (6s) or is popped, the Bulwark is **staggered 1.4s** (arms down, distinct pose flag for the painter, no actions, takes full damage). This is the fight's kill-confirm beat and what makes *both* answers feel rewarded. After breach it sprints to the emitter (existing retrieve), then a **3.0s** cooldown as a normal chaser — real dome downtime (cycle goes from ~80% dome to ~55%).

### Pyros and the plant

Proactive planting only triggers when a pyro is within 130px of the Bulwark **or** the Bulwark is within `plantRange` of the player (fixes the corner-bubble). Pyros still huddle (existing behavior, `Pyro.think` dome branch) — with the rim-pop stagger above, "Bulwark + pyros" graduates from annoyance to a puzzle with two solutions.

## Why it's fun

This is the Hades shielded-Theseus / Hollow Knight Baldur problem: a defense gimmick is only fun if breaking it is *itself* a satisfying verb with a visible payoff window. Rim HP gives every build a way to play its own game (DPS builds melt bubbles, mobility builds duel inside), the breach stagger is the dopamine beat (Zelda-style guard-break), and the bash-eject gives the duel a physical, comedic rhythm that fits the game's tone. It also finally makes the Bulwark *teach* something: burst windows and commitment, the same literacy the Furnace and the bosses want.

## Tunables (config.js `JH.ENEMIES.bulwark`)

| Field | Now | → | Why |
|---|---|---|---|
| `domeDur` | 7.0 | **6.0** | shorter worst-case wait |
| `redeployCd` | 1.4 | **3.0** | real downtime between fortresses |
| `slamRange` | 46 | **58** (= domeRadius) | no safe annulus |
| `domeHp` | — | **140** | ~2.3s of base full-pressure spray (50 dps × 1.2 tier) |
| `bashWind` / `bashDmg` / `bashKnock` | — | **0.4 / 8 / 260** | eject, not execute |
| `breachStagger` | — | **1.4** | payoff window |
| `domeKnockResist` | — | **0.8** | anchored while fortressing |
| `shelterBuffDur` / `shelterPopVuln` | — | **1.0 / +25% for 3s** | pop payoff vs sheltered allies |

## Implementation notes

- `DeployedShield` gains `hp`; `doSpray`'s dome-blocker branch routes damage to it at the already-computed contact point (particles for free). Pure function candidate: `Balance.domeRimDamage(sprayDmg, dmgScale, dt)` + a pop threshold test — unit-testable like `furnaceShouldVent`.
- `Bulwark.think` gains `breach` phase; `insideDome` (`entities.js` ~1343) already gives the inside test for the bash-eject timer.
- No new art dependencies: dome is already procedural; breach pose can be a `stagger: true` paint hint (reuse the wind pose darkened). Per CLAUDE.md, keep painter work minimal.

## Boss-tier follow-up (Speculative)

If the fixed super-elite lands well, "**Bulwark Prime**" is a cheap act-boss: three emitters planted in sequence (triple overlapping bubbles), breach-chaining as the phase mechanic. Park until the base enemy is proven.

## Open questions

1. Should rim HP scale with the elite ramp (`makeElite`), or stay flat so late-game popping stays snappy?
2. Does the bash-eject need i-frame respect (currently `takeHit` already no-ops during dash — probably sufficient)?
3. When the rim pops, should the Bulwark's *next* dome be weaker (escalating reward for repeat pops) or identical (readable loop)? Start identical.
4. Does Split Stream (`rc3`) arc *into* the dome from a rim hit? Proposed: no — rim is a terminal hit.
