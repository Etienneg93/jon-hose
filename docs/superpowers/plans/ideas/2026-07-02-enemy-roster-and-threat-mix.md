# Enemy Roster & Threat Mix — De-Charger the Game, Fill the Verb Gaps

**Date:** 2026-07-02 · **Priority: Strong** · **Scope: M**

## Problem statement (grounded)

**Chargers dominate the threat mix** (playtest, both sessions). The data agrees: Chargers appear in the authored spawns of **14 of the 23 non-boss encounters** (`JH.LEVEL1.waves`), carry sprinkle weight 2 (`JH.SPRINKLE.weights`), and the per-wave cap of 2 (`JH.WAVECAP.charger`) converts *excess* chargers into mooks — meaning the cap papers over how often they're authored in rather than diversifying. Mechanically they're also the game's **only** displacement threat in Acts 1–3, so every fight's danger profile is "watch for the purple wind-up," and their 200px/s rush against 92px/s movement + a 0.7s-cooldown dash makes them the de facto difficulty knob.

**The roster teaches a narrow verb set.** Auditing what each enemy asks of the player (`entities.js`): mook = face-tank check; charger = lane dodge; pyro = closing gaps; fuse = kill-placement; stalker = anti-kite; bulwark = anti-pierce; smelt = standoff + area denial; furnace = burst rhythm. Missing entirely:
- **Resource attack** — nothing threatens *water*, the game's defining stat.
- **Depth-column pressure** — only bosses use column/row attacks; regular fights never force x-repositioning.
- **Swarm micro** — nothing dies in one tick and arrives in sixes (fuse is closest but spawns ≤3).
- **Support/buffer** — no enemy makes *other* enemies the priority target.

Elites are a flat stat ramp (`makeElite`, `entities.js` ~797 — hp/dmg/speed/size), so an elite mook is a slower fight, not a different one.

## The ideas

### 1. Rebalance the mix with data already in config (S)
- Author chargers **out** of ~5 waves (Acts 2–3 especially: STREET SWARM, DEBRIS RUN, HOLD THE LINE, WAVE 6, OVERRUN keep at most 1) and backfill with stalker/fuse — both post-intro types the variety pass explicitly wanted recurring.
- Per-act sprinkle weights: `JH.SPRINKLE.weights` becomes act-indexed so the fire acts stop sprinkling street mooks and Act 4 leans stalker/bulwark. (`pickSprinkles` already takes a weights object — pass a per-act one; test extends `tests/balance.test.js`.)
- Charger feel retune: wind 0.6→0.7 and a 25% "feint" chance at elite tier (stops short, re-winds — punishes autopilot dodges *without* raw speed).

### 2. Elite affixes — variation instead of inflation (M)
Replace flat `makeElite` on `tough` waves with 1 rolled **affix** + a smaller stat ramp:
- *Fleet* (existing speed ramp, visible dust trail) · *Armored* (first 25% HP takes half spray damage — a mini-Furnace read) · *Dripping* (leaves slow-puddles on hit — friendly-fire terrain for the player to exploit later via benedictions) · *Magnetic* (pulls dropped pickups toward itself — kill it to get your loot; economy tension) · *Faithless* (immune to knockback, 0.9× speed — the anti-shove check).
Affixes are def-clone tweaks in exactly `makeElite`'s existing pattern + one paint hint each (aura color — the elite gold ring already exists in `Enemy.draw`). Hades' Tartarus→Styx enemy *variants* are the model: same silhouette, one new rule.

### 3. Two new archetypes that fill real gaps (M each; Strong)
- **The Siphon** (any act ≥3): mid-range, fires a slow tether at Jon; while attached, **drains 8 water/s** into itself (visibly swelling) and heals nearby enemies with the runoff. Break the tether by dashing or line-of-sight. First enemy that attacks the *tank* — the resource the whole game orbits — and a support piece that reorders kill priority. Hooks: `player.water` writes, a beam draw, `moveRegen`-style tick.
- **The Gutter Choir** (fire/late): swarm of 6–8 one-hit wisps that arrive in a column formation and rush in sequence down a telegraphed depth column (regular-fight version of the boss column verb). Individually trivial, collectively a rhythm; GUSH combo food by design (kill-chain audio ladder gets its showcase).

### 4. Soaked — the enemy status groundwork (M, shared infrastructure)
The vision's parked "soaked stacks" (pillar 2) becomes the enemy-side status container that benedictions (Scald), affixes, and aspects all want: `enemy.status = { soaked, scald }` with one tick site in `Enemy.update` and one paint hint (darken + drips — palette shift, no new art). Baseline effect deliberately mild: 3 stacks of sustained spray = +10% damage taken, decaying. Build it once here; three other specs consume it.

## Why it's fun

Enemy *variety* is pacing: Hades ships ~40 base enemies but the felt variety comes from affix-style variants and per-biome verb rotation — exactly what §1–2 buy for config-money. The Siphon creates the genre's best emotion (triage under pressure) with Jon Hose's own noun, water. And a swarm enemy finally gives the hose a crowd to *hose* — the fantasy the weapon promises but the current 3–6-enemy waves rarely deliver.

## Scope

§1 **S** (config + one balance function + playtest). §2 **M**. §3 **M per enemy** (painter is procedural placeholder per CLAUDE.md — swap point documented). §4 **M** but amortized across three other specs.

## Open questions

1. Affixes on curated fire enemies too, or keep the fire act hand-tuned un-`tough` as designed? Lean: keep fire curated; affixes are the street acts' tool.
2. Siphon tether vs. the no-new-mechanics-on-placeholder-art rule — tether is a `LightningWave`-style procedural line, fine; confirm.
3. Does Gutter Choir break the `separate()` crowd solver at 8 bodies? They're `bodyW: 8` wisps — probably exempt them like `dropping` enemies (`game.js` ~1183).
4. Soaked + Scald stacking rules (mutually exclusive? steam burst on contact — the duo-benediction hook?) — decide when benedictions land.
