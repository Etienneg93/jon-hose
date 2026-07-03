# Boss Multi-Phase Pattern Language (+ per-boss upgrade sketches)

**Date:** 2026-07-02 · **Priority: Must-explore** · **Scope: L overall — but per-boss increments are S/M and ship independently**

## Problem statement (grounded)

Playtests say bosses are **one-pattern**. The code agrees: every boss's only "phase" is a single `enrageAt` HP threshold that multiplies speeds/counts of the *same* moves:

- **Big Drip** (`Boss.think`, `entities.js` ~1480): slam or sweep by distance + a mook summon; enrage = faster cooldowns. Two rectangles for the whole fight.
- **Switch** (~1672): alternates line/column; enrage = two-at-once, same shapes.
- **Quake** (~2227): stomp/leap alternator; enrage = extra trailing shockwave.
- **Gateway Krusher** (~2772): Switch's set + a depth row — the most varied, still a fixed alternator from wave 1 of the fight.
- **Slayer** (~3362): the best of the bunch (volley/dash/slam + enraged landing ring) but still a strict volley↔dash alternator; players clock it in one attempt.
- The boss bar (`drawBossBar`, `game.js` ~1750) is a single red strip — no phase pips, so even the enrage isn't legible as a *moment*.

Meanwhile the game already owns a rich attack vocabulary, each with a distinct dodge verb and telegraph shape — it's just never recombined per-fight.

## Part 1 — The pattern language (the reusable asset)

### Verb grammar — one dodge verb per telegraph shape, everywhere

| Telegraph (exists today) | Shape | Dodge verb | Source |
|---|---|---|---|
| red rect from boss front | zone | **step out** (x or depth) | Big Drip slam/sweep |
| cyan floor ellipse | spot | **move off the spot** | Switch line target |
| orange full-height column | column | **change x** | Switch whip |
| orange full-width row | row | **change depth lane** | GK row slam |
| amber traveling wall | wave | **dash through** (i-frames) | Quake `Shockwave` |
| cyan bolt in one lane | lane bolt | **leave the lane** | Firewall `LightningWave` |
| expanding fire ring | ring | **dash through / gap** | Slayer `FireRing` |
| ground patches | terrain | **don't stand there** | `FirePatch` |
| core exposure window | weak spot | **be in its lane, commit DPS** | Firewall `wsOpen` |

Rules (write into the spec that implements this, enforce in review):
1. **Shape ⇒ verb, always.** No fight may reuse a shape with a different dodge. This is the Hades/Furi contract that makes "hard" feel fair.
2. **≤ 2 verbs active at once**, and only from phase 2 on. Enrage overlays never add a *new* shape, only density.
3. **Phase = new verb combination, not new numbers.** Speed multipliers alone don't count as a phase.
4. Every phase change is a ritual: 0.2s hit-stop + white strobe (the tech exists in the dying-boss render path, `game.js` ~1279) + **one free demonstration** of the new move against no other pressure.

### Phase skeleton (all bosses)

- **P1 (100–66%):** teaching set — two verbs, generous winds (exactly what exists today).
- **P2 (66–33%):** the remix — one new verb + recombination; the fight's identity move appears here.
- **P3 (33–0%):** the exam — P1+P2 verbs interleaved, winds −20% (the current enrage multipliers finally applied), plus the fight's spectacle move.
- Boss bar gets **phase pips** (two notches on the strip — three fills, one draw call) and the HP thresholds live in each def (`phaseAt: [0.66, 0.33]` replacing lone `enrageAt`).

The `atk`/`tele`/`strikeFx` scaffolding in `Boss.think` and the shared telegraph painters already support all of this — the work per boss is a bigger state table, not new engine.

## Part 2 — Per-boss sketches (each is its own S/M increment)

**Big Drip** (needs it most — flagged "rework out of scope" since 06-30):
- P2 — *he drips*: slow puddle spots (cyan ellipse verb) fall where he walks; standing slam gains +12 range when launched from a puddle ("he draws power from standing water"). Suddenly his position history matters.
- P3 — *burst pipe*: alternating slam→sweep chains (zone verb twice, opposite sides) + summons arrive as Fuse-style drop-ins (ring verb) instead of walk-ins.
- Spectacle: on death his puddles evaporate into the coin fountain. S/M.

**Switch of Doom:**
- P2 — *sequential lane sweep*: three columns fire left-to-right with 0.4s offsets (column verb, but now it's a rhythm — dash-through works via timing, walk works via position).
- P3 — *port overload*: after each sweep, 1.5s weak-spot window on its core glyph (`Assets.bossCore` already draws it; the Firewall's open/closed cycle is the code template) for +40% damage — gives DPS builds a commitment beat. M.

**Quake Walker:**
- P2 — *rubble rain*: 3 targeted spots (cyan ellipse) fall during his leap — the leap stops being downtime.
- P3 — *the treadmill*: continuous slow waves from the arena edges every 2.5s (dash-through metronome) while he stomps. Dash economy becomes the exam. S/M.

**Gateway Krusher:**
- P2 — summons arrive as **elite** pairs through a telegraphed column ("shipping lanes"); P3 — row + column cross-patterns forming a moving safe cell (the classic bullet-hell "find the gap"). S.

**The Slayer** (already closest — formalize):
- P2 — *bank shots*: volley balls rebound once off arena walls (pool theme pays off; `Fireball` needs one reflection). Telegraph: cue aims at the wall, not at you.
- P3 — *run the table*: he racks 5 balls in a line mid-arena (cyan spots), then breaks — all five scatter as bank shots while he dashes. Spectacle exam, on-theme, mostly reuses `Fireball`. M.

**The Firewall** (built, unwired — `devGotoWallBoss`, `game.js` ~198): wire it as an optional Overpressure-gated miniboss between GK and the fire zone rather than the wave list — its weak-spot/lane grammar is P2 vocabulary the other bosses now teach. S to wire.

## Why it's fun

Hades bosses (and Hollow Knight's, and Furi's) stay fun on the 40th kill because phases are *recombinations of legible verbs*, so mastery transfers and escalation reads as the fight "learning you" rather than inflating. Jon Hose already teaches four distinct dodge verbs across its bosses — the campaign's best existing idea — this spec just makes each *fight* do what the *game* already does. Phase pips + transition rituals also fix "one-pattern" perception cheaply: half the problem is that the enrage isn't announced.

## Scope & sequencing

Grammar + phase plumbing + bar pips: **M** (shared). Then per-boss: Big Drip (S/M, highest value — first boss, worst offender) → Slayer P2/P3 (M, climax fight) → Switch (M) → Quake (S/M) → GK (S) → Firewall wiring (S). Each gated on the standard playtest.

## Open questions

1. Do phase thresholds pause damage carryover (Hades caps overkill into the next phase)? Lean yes: clamp HP at each `phaseAt` boundary for one frame so transitions always play.
2. Sunday Service (Overpressure) = "start at P2 sets" — confirm that's the intended coupling.
3. Big Drip puddles: do they interact with the player's own water theme (e.g., benediction synergy "your knockback is stronger vs. enemies in water")? Tempting — park until benedictions exist.
4. Does the Slayer bank-shot need a distinct ball tint to separate it from direct volleys? Probably (grammar rule 1) — same sprite, cooler flame.
