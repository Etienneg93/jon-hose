# Jon Hose — Project Handbook

The committed source of truth for design principles, the systems map, and
the forward vision. Written 2026-07-06 at v0.27.5, when the game was live
for external playtesters. If you are an AI assistant working on this repo:
read this before touching gameplay code, and keep it current when design
decisions change — this file is the successor's briefing, not a museum.

---

## 1. What this game is

A vanilla-JS canvas beat 'em up (no bundler, `file://`-runnable, global
namespace `JH`). Jon Hose walks a 29-wave street across five elemental
acts, spraying a pressure-managed water hose — his only weapon. Move,
spray, dash. **No jump, no melee: cut from the design; do not reintroduce.**

The run structure is Hades-shaped: XP levels give steady numbers,
**benedictions** (element boons picked at sigil beats after bosses and
set-pieces) give rules, the **Church** (death interlude) banks permanent
pillar ranks bought with Holy Essence, and death washes your benedictions
into a **Reliquary** where Essence buys them back. The event shop sells
signature builds, relics, and lifelines. A fresh run every boot is
INTENTIONAL (church persistence is parked until the game is bigger).

## 2. Design principles (hard-won; each was a correction)

**Honest numbers.** Survivability lives in the visible HP bar, not hidden
multipliers. waterMult is 1 on nearly everything (pyro 1.5 and neighbor
1.3 are thematic bonus damage; the furnace's phase soak is a visible
mechanic). History: smelt shipped at 300hp × 0.5 waterMult = a dishonest
600 effective; the user called it out and it became 450hp × 1.

**Rim is hitbox.** Every damaging zone hits exactly the shape it draws.
One shape object feeds both the hit test and the render (see
`FirePatch.footprint()`, `SwitchBoss.lineHits()`, `Geo.inGroundEllipse`).
Violations keep resurfacing as "X hit me when I dodged" playtest reports —
the GK slam circle was the latest. When adding any telegraph or AoE,
derive draw and hit from the same function, and unit-test the rim.

**Tune tedium down, challenge up.** Three playtests ran "brutal early,
trivial late" → "upgrade trivialization" → "0 deaths, too easy". The
answer was never softening: it was the Giants pass (bigger waves, attack
tickets for readability, super-elites). When something is a "pain point,"
diagnose whether it's HARD (usually fine) or TEDIOUS (sponge HP, turtle
duty cycles, unreadable crowds — fix these). Quantify before turning
knobs: effective-HP math, shelter duty-cycle percentages, damage-per-10s
threat scores.

**Three-step threat vocabulary.** Regular → elite (gold health bar,
mid/late seasoning) → super-elite (red frame, ~1.8x giant, ONE per wave,
late-game only, each type has a user-designed signature move). Every enemy
type eventually gets a super form (recorded principle; furnace still
pending).

**World-element theming.** Each act's roster matches its boss's element:
Act 3 is earth (bulwarks in the rubble), the Fire World is fire
(smelt/fuse/furnace). The future air act (Ass Man) requires a NEW
air-themed roster designed in its own brainstorm — do not reuse fire
enemies there.

**Readability beats mercy.** Attack tickets cap simultaneous attackers so
crowds stay readable at any size — they are NOT spawn control. Spawn flow
is field cap + trickle + batch surges ("wave within a wave",
REINFORCEMENTS! banner). Fire patches burn out after 7s with a fizzle
only in the last 2.5s; dousing scales with spray damage.

**Feel rules from the Juice Pass.** No hit-stop in normal combat (freezes
read as lag at hose kill density; boss beats only). Damage reads as
wetness soak + corpse collapse, not flashes. Buffs stack and never
overwrite. Burn ticks in half-second beats. Discrete inputs are buffered
130ms (`Input.buffered`), which also matters for headless testing: a
programmatic keypress must span ≥2 frames or the edge is lost.

## 3. Systems map (where things live)

| System | Files | Notes |
|---|---|---|
| Tunables — ALL of them | `js/config.js` | Single source of truth; nothing else hardcodes gameplay constants. Act-indexed arrays use `Balance.ticketBudget(actLevel, arr)`, indexed `actLevel+1` (actLevelForWave returns -1..3): SPRINKLE.counts, TICKETS.budgets, WAVEFLOW.fieldCap, SUPER_TUNE.hpByAct. |
| Pure balance math | `js/balance.js` | eliteScale, powerCount, superEliteDef, drop rolls. Dual-export (browser + node:test). Unit-test anything here. |
| Entities | `js/entities.js` | Player, all enemies, bosses, projectiles, FirePatch, Pickup, Sigil. Player transient buffs must be cleared at respawn (`clearBuffs`) — timers freeze through the Church and resume otherwise. |
| Game orchestration | `js/game.js` | Waves (wavePool/trickle/batch), tickets (`canAttack`), sigil beats, shop (`priceOf` = single discount source: Punch Card, voucher50), XP levels, death seq, stat panel, HUD. |
| Benedictions | `js/benedictions.js` | DEFS (17 boons/3 duos/4 legendaries), active/washed maps, wash() at death, reclaimNext() for the Reliquary, pickOffers (pure, injectable rng). Dual-export. |
| Church | `js/church.js` | Meta state (essence, pillars) + the walkable nave scene (sermon gates movement; pillars, Reliquary, pity voucher, portal). Text over the backdrop must use `otext` (outlined) — raw fillText muddles. |
| Pillars | `js/pillars.js` | Element pillar ranks; applied via `Upgrades.computeStats`. |
| Stat chain | `js/upgrades.js` | `computeStats` folds: base → shop signatures/repeatables → levels (`JH.LEVELS.cycle`) → pillars → `Benedictions.applyStats`. `player.applyStats` diff-tracks for the upgrade-sequence juice. |
| Geometry | `js/world.js` | Depth band, `Geo.inGroundEllipse` (GROUND_RY 0.40), camera. |
| Art | `js/assets.js` + `sprites/` + `tools/*.mjs` | Baked sprites via `registerBaked` (poseFn + procedural fallback + overlay). See §5 safety rules. |

## 4. Process (how work ships here)

1. **Big passes**: brainstorm → spec (`docs/superpowers/specs/`) → plan
   (`docs/superpowers/plans/`) → subagent-driven execution with review
   gates (ledger: `.superpowers/sdd/progress.md`). Small live-support
   rounds are inline.
2. **Playtest gate**: gameplay changes stay uncommitted until the user
   plays them and says push. Verify headlessly first (see the
   `headless-playtest` skill in `.claude/skills/`) — full loops, not
   smoke: drive real keys through the church, buy at the shop, clear waves.
3. **Release ritual** (see the `release` skill): version bump + CHANGELOG
   + `release: v{X} - {Name}` merge title, every merge to main. Minor
   bumps only for full designed passes; playtest follow-ups are patches on
   the current minor. Never force-push main — it deploys to live testers.
4. **Tests**: `npm test` (node --test). Derive expectations from config,
   not literals. New mechanics get a test; regressions get a named one
   (e.g. the GK line-slam rim test).

## 5. Art pipeline safety

- **HAND-CLEANED, never rebake**: `sprites/mook/*` (12-frame idle,
  wind1-4), `sprites/fuse/walk0-3.png`. The bakers overwrite blindly.
- Fuse `idle0/1` wick inconsistency is known and queued.
- Firewall (wall boss) is still procedural; Switch + GK are baked chassis
  with runtime LED overlays.
- Logical-vs-device resolution: generate art ~4x+ the logical target
  (480×270 logical maps onto a dpr-scaled native buffer; a 53-logical-px
  character is ~212 real px at 1080p).
- Imagen generation is out of credits (429s); bake with the node tools.

## 6. Balance reference (v0.27.5 state)

- Player: 100hp, 100 water tank (~2.8s spray), 50 dps at full pressure,
  pressure tiers green/yellow/red by tank fraction.
- Levels: ~13/run, cycle `+3 dmg, +20 water, +8 hp, +4 range, +3 dmg,
  +5 regen` — two laps ≈ the retired shop stat nodes (+40 tank, 18→28
  regen), front-loaded because the dry tank is the early game's wall.
- Elite ramp: `(1.3 + 0.25·act) × (1 + 0.03·min(power,24))` hp; supers ×7
  hp default with per-type SUPER_TUNE overrides (smelt 2, bulwark 2.5) and
  hpByAct damp. Boss hp scales `1 + 0.02·power`.
- Threat scores (damage-per-10s, 2026-07-05 assessment): mook ~104,
  bulwark ~91, pyro ~66, charger ~61, stalker ~55, smelt ~40, fuse ~38,
  furnace ~21. Supers sit at waves 17+ only.
- Economy: Essence enters ONLY via cross pickups (bosses/set-pieces).
  Death → benedictions wash to Reliquary (1 Essence reclaims, rank kept).
  First death per run → Father Jon's 50% shop voucher (sermon-end beat).

## 7. Future vision (the queue, in rough order)

1. **v0.28 — Areas & World pass** (recorded bucket): between-level area
   choices (Hades room-choice feel) + background/floor art upgrade —
   these pair; choices need visually distinct backdrops.
2. **Air world / Ass Man boss**: entry idea recorded (plain clothes → dog
   pees on holy hydrant → rage suit-up cutscene → fight). Needs its own
   brainstorm: air-themed enemy roster (world-theming directive), boss
   moves, where it slots in the act structure.
3. **Boss phase language**: playtest critique that bosses are one-pattern;
   phases/pattern-mixing pass (ideas INDEX).
4. **Overpressure PSI dial**: parked until church persistence unparks and
   boss patterns ship.
5. **Church persistence**: PARKED BY DESIGN — fresh run every boot is
   intentional until the game is long enough that a fresh start stops
   being the better experience. Built code sits on the
   `church-persistence` branch; don't re-propose early.
6. **Deferred art/content**: Slayer post-defeat portrait/dialogue/Church
   NPC (cutscene stub live, no art); furnace super-elite (needs a designed
   move); fuse idle wick cleanup; Firewall chassis bake; procedural
   painters remain fallbacks everywhere.
7. **Longer term** (README roadmap): more levels, co-op, level-select.

## 8. Known playtest history (what got us here)

- 06-28: brutal early, trivial late; chargers dominant; drops low.
- 07-01: fire-world pass (7 items); upgrade trivialization flagged.
- 07-04: full clear, ZERO deaths → the Giants curve pass.
- 07-06: live externals — Reliquary + voucher + smelt/fire/bulwark rounds
  (v0.27.1–.5). Super-elite numbers remain live-tuning territory.
