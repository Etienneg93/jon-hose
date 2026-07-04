# v0.26.0 Curve Pass — design

**Date:** 2026-07-04 · **Scope:** Part 1 of the overpressure idea spec only
(the PSI dial stays deferred in `docs/superpowers/plans/ideas/`).

## Evidence

Three playtests, one arc: 06-28 "brutal early, trivial late" → 07-01 "upgrade
trivialization" → 07-04 **full clear, zero deaths** on v0.25.1. The early
brutality was solved by the input-buffer / readability / collision fixes; what
remains is a game with no teeth anywhere. Direction (user, 2026-07-04): **do
not soften anything** — the original on-ramp softening items (charger delayed
to wave 3, spawn-grace bump) are dropped. Pressure goes up across the board.

## 1. Attack tickets (readability, not mercy)

A scheduler in `game.js`: only N enemies may enter windup/attack states at
once. Ticketless melee enemies advance to a loose ring (existing `separate()`
spreads them) until a slot frees. Ranged cadence (pyro/smelt lobs) is not
ticketed in v1.

Default budgets (playtest-tunable): Act 1: 4 · Act 2: 4 · Act 3: 5 ·
Act 4: 5 · Act 5: 6. Generous on purpose — tickets exist so crowds stay
readable, which is what allows:

## 2. Bigger waves

Regular-enemy counts rise ~40–60% in Acts 2–5 and modestly in Act 1
(charger stays in wave 2). Late waves lean on MORE REGULARS per the
2026-07-03 directive; elites stay rare, super-elites rarer. Exact counts are
playtest tuning, not spec.

## 3. Base-enemy reworks

- **Stalker → blink-strike (all tiers).** Telegraph → blink behind →
  immediate wide backstab arc. One beat; the current post-blink strike windup
  is removed.
- **Fuse → lit-fuse timer.** Head-fuse art becomes consistent across frames
  plus a separate baked fuse-lit animation. Within ~70px of Jon the fuse
  ignites (hiss + sparking); while lit, the fuse **drains its own HP**
  (default ~20% max HP/s → ~5s natural burn). Reaching 0 HP *while lit* — by
  drain or by damage — self-destructs: AoE (default r≈40, dmg 18) + fire
  patch. Killed before ignition = current death behavior.
- **Elite fuse:** on death, lobs **1 regular fuse** in a random direction; it
  lands and starts chasing.
- **Furnace:** heat glow currently stops at the torso — rebake so heat steps
  reach arms/legs. Furnace death explosion now launches **one slag arcing at
  Jon's position** (fire patch on landing).
- Rebakes touch **fuse + furnace only**; hand-cleaned mook frames are never
  regenerated.

## 4. Super-elites

**Principle (recorded):** every enemy type eventually gets a super-elite
form. This release ships seven; Furnace's waits for its heat fix + a designed
move.

Stats (defaults, playtest-tunable): **1.8x sprite scale** (runtime scale of
elite bakes + heavier outline glow + bigger shadow — no new art), **~7x
regular HP, 2x damage, 0.85x speed**. Act-level `eliteScale` still applies on
top. Max ONE per wave, one per act placed as a set-beat, may reappear
alongside big late crowds. Kills pay a fat suds burst + guaranteed kibble
(Essence stays boss/set-piece currency).

| Type | Signature move |
|---|---|
| Mook | Lunging haymaker — carries ~60px forward, ground-shock band on landing |
| Charger | Diagonal charges (Slayer-style), longer duration, **ricochets off walls keeping momentum** (max ~3 bounces, then recovery) |
| Pyro | Triple lob in a fan — three smaller fire patches |
| Stalker | Fakeout — first blink is a feint, second blink is the real backstab |
| Smelt | Two slag lobs for range; **each slag bounces once, leaving a fire patch at every touchdown** |
| Bulwark | **Lobs his shield** smelt-style — landing zone is area denial that **slows Jon** (~45%, ~5s); fights on shieldless (non-`sh_` frames) |
| Fuse | Explodes into **three regular fuses** lobbed outward — however it dies — which land and chase |

**Threat vocabulary stays three-step:** regular → elite (current gold-bar
tier, kept as late-wave seasoning) → super-elite (rare apex).

## 5. Scaling-leak fixes (pure functions, unit-tested)

- `eliteScale` power count = **nodes + repeatable buys + total Mirror
  ranks**; cap 15 → **24**.
- Boss HP at spawn: `def.hp × (1 + 0.02 × ownedCount)`.
- Vampiric: **h3 base drops to 5%**; half-rate extends from bosses to elites
  and super-elites (full rate vs regulars).
- `dodgeChance` capped at **25%** in `computeStats`.

## 6. Economy — "both, lightly"

- Tier-3 nodes unlock at **Act 2**.
- Tier-3 prices **+20%**.
- Goal: the build finishes *during* the hard content, not before it.

## 7. Holy Essence cross — an event

Cross hovers (slow bob + outline glow); a vignette dims the world (~35%,
~0.5s ease-in) and holds until pickup. No spawn pause. "Something is over
there" must read from anywhere on the street.

## 8. First-death pity

First Church visit per run grants +1 Essence, Father Jon line: "Take this,
child — the water keeps what it takes." With the curve up, the first death
teaches the loop instead of just costing time.

## 9. Slim stat panel

Pause/upgrade screen gains a readable stat block: damage, max water, regen,
move speed, dodge, vampirism. Recent changes flash a delta highlight. Exists
partly so the scaling fixes in §5 can be tuned by eye during the playtest
gate. (Full character-sheet version deferred to the progression pass.)

## Testing & gate

Unit tests: ticket allocator, `eliteScale`/boss-HP formulas, fuse drain math,
super-elite def scaling, dodge cap. The mandatory playtest gate applies to
the entire release — every item here is a feel change.

## Deferred (recorded 2026-07-04)

- **v0.27.0 — Progression & Benedictions pass:** shop/pedestal buff overhaul
  (which stats, rarer/pricier/juicier purchases, shopkeeper appears less
  often but matters more), XP/level-ups granting stats via benedictions
  (Hades boon-feel; INDEX #6), Essence-spending feel (church/altar juice),
  full stat screen. Needs its own brainstorm — user still finding the feel.
- **v0.28.0-ish — Areas & World pass:** area choices for Jon between levels
  (Hades room-choice) + background/floor graphics upgrade (pairs — choices
  need distinct backdrops). Backgrounds may ship earlier as pure art after
  Switch + GK.
- **Overpressure PSI dial** (Part 2 of the idea spec): after church
  persistence unparks and boss-pattern work ships.
