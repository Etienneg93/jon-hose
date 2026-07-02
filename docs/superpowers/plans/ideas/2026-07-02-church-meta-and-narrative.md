# Church of the Holy Hose — Meta-Progression & Narrative Hooks

**Date:** 2026-07-02 · **Priority: Strong (item 1 is Must-explore)** · **Scope: M overall; items land independently**

Builds on Phase 0 (shipped: death loop, walkable nave, Father Jon, Essence, portal) and the corrected church flow (ally reveals gate the elemental chamber). Complements — does not duplicate — the Phase-0 side-branch work.

## Problem statement (grounded)

1. **Meta-progression doesn't actually persist.** `Church.load()` deliberately resets to `defaults()` every boot — the comment says "No save system yet — every run starts Church meta-progression fresh" (`church.js` ~156–160), while `save()` still writes localStorage that's never read. Essence, elements, Mirror ranks: all evaporate on refresh. Everything else in the meta design is moot until this one function is wired.
2. **Death banks nothing.** Essence comes only from bosses (1 each, `markBossDefeated`) and set-piece crosses (`game.js` ~444). A player who dies five times to the Switch arrives at the Church with the same 1 Essence each visit — the Church is a scene, not yet a *loop*. Hades' core trick is that every failed run still pays (Darkness).
3. **The nave is static.** Redeemed allies light a shrine texture (`renderScene` shrineLit/shrineDim) but never appear; Father Jon has 4 first-visit lines + 5 random repeats (`JH.CHURCH.sermon`), unreactive to how you died — even though `diedWave` is captured at death (`startPlayerDeathSeq`, `game.js` ~925).
4. **Water shrine is undecided** — the vision explicitly leaves Jon's own element open ("Jon must face his inner demon — candidate").

## The ideas

### 1. Wire persistence (Must-explore, S — do first)
`load()` reads the existing `jonhose.church.v1` key through the already-written-and-tested `sanitize()` (`tests/church.test.js` covers it). Add `schema: 1`, an explicit "Rededicate (reset save)" station at the back of the nave, and fold in the new fields the other specs need (aspect unlocks/ranks, Overpressure best, cosmetics). Half a day; unlocks every other meta idea.

### 2. Condensation — death tithes Essence (S)
On entering the Church: `essence += clamp(floor(wavesClearedSinceLastDeath / 2) + (bossKilledThisLife ? 1 : 0), 0, 3)`. Pure function, unit-testable beside `blessingCost`. Father Jon narrates it ("The water keeps what it takes — and returns a tithe"). Now a lost life converts to permanent progress at a rate that still makes winning strictly better. This is the single cheapest way to make the brutal-early curve *feel* acceptable (see difficulty spec) without touching combat.

### 3. The nave fills (M) — the House of Hades effect
Redeemed allies appear **in the church**, by their shrine, with the reveal beats from the corrected flow:
- **Quake Walker:** first visit after redemption — his stomp cracks the chamber doorway (shake + `boom-mid` FxBurst + a floor-crack decal; his walk cycle and stomp assets exist).
- **The Slayer:** leans on his cue by the Fire shrine, racks a ball when you pass.
- Each ally: 3–5 walk-up lines (E to talk — station pattern), including *hints* ("The Krusher guards its core after every third swing" — teaching the boss grammar diegetically).
- Each ally offers a **Keepsake** once (vision Pillar 3): equip exactly one at their shrine — Quake = knockback resist 50%, Slayer = start each life with 1 free Scald benediction, Ass Man = +1 dash charge (when he exists). Keepsakes are the aspect system's little sibling: one passive slot, swap freely in the nave. Data-only fold into `computeStats`.

### 4. Reactive Father Jon (S)
Key the repeat-sermon pool on context that already exists or is one field away: `diedWave` (act → "The ruined district tests even the faithful"), killer type (add `lastHitBy` set in `takeHit` — one assignment), death count this campaign, current PSI. ~20 lines of data, no new systems. Cheap reactivity is the highest words-per-engineering-hour in the genre (Hades shipped 21,000 lines of it because it *works*).
Also: give the sermon box a skip-all (hold E) — respect repeat deaths.

### 5. Dark Jon — the Water reveal (M/L, Speculative but load-bearing)
The undecided Water shrine becomes the Church's own secret: once Earth+Fire are lit (and later Air), the baptismal font reflects… Jon. Interact → the nave dims → **fight your reflection in the church itself** (the scene already has a depth lane and the full entity pipeline is one spawn call away — bounds = nave, camera fixed). Dark Jon uses *your current stats snapshot* (computeStats output inverted palette) with the three-verb kit: his spray pushes, his dash mirrors yours, his "benedictions" are whichever ones you're carrying. Reward: lights Water, unlocks the **Aspect of the Font** (aspects spec), one-time big Essence drop.
It answers the vision's open question with the game's own thesis: the last nemesis to redeem is Jon.

### 6. Nave renovations (S, Speculative)
Pure-cosmetic Essence sinks à la Hades' House Contractor: candles, stained glass per element, pews filling with saved townsfolk (mook-palette NPCs), the GUSH record engraved on a plaque. Zero mechanics; makes the persistence you just wired *visible*. Procedural placeholder art only, per CLAUDE.md.

## Why it's fun

Hades' meta loop is: every death pays (Darkness), the hub visibly accumulates your history (House), and the people you meet remember you (reactive dialogue). Items 1–4 are precisely those three legs, each mapped to a system Jon Hose already half-owns. Dark Jon then gives the Church a *destination* — the hub itself becomes the final door, which is the strongest narrative shape available given "the fallen are made faithful" is already the game's liturgy.

## Scope & sequencing

1 (S, first) → 2 (S) → 4 (S) → 3 (M) → 5 (M/L) → 6 (S, whenever). All church-side; no combat retuning required except Dark Jon.

## Open questions

1. Condensation rate vs. Overpressure Essence rewards — one economy pass over both (Essence sinks are currently tiny: Mirror max-out costs 54).
2. Should keepsakes and benedictions interact (Slayer keepsake grants a benediction — yes, as specced — or stay parallel)?
3. Dark Jon difficulty source: mirror stats 1:1 or a tuned fraction? Mirror-with-handicap (0.8×) first pass.
4. Does the ally-in-nave art wait for the sprite-sheet pass (CLAUDE.md: high-value characters first)? The bosses' existing in-game sprites/painters can stand in the nave as-is — no new art needed for v1.
