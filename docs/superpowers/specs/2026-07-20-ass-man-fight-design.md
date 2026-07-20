# Ass Man Fight (wave 36) — design spec

*Date: 2026-07-20 · Status: user-approved in brainstorm · Parent:
2026-07-12-air-act-ass-man-design.md (act-level spec; fight section
superseded by the detail here). Scope decisions this round: dog /
plain-clothes entry cutscene, outro cutscene, K-9 Unit relic, and the
victory-flow move are ON ICE — the fight ships with pure gameplay stubs.
The leaderboard comparator rides with this spec (a 36-wave clear must
outrank 29-wave-era runs the moment it becomes possible).*

## Summary

The game's first true multi-phase boss: a three-phase duel against Ass Man
in the Air World plaza, HP-gated at 100/66/33, ending in a kneel (defeated,
never dead). Difficulty target: **hardest boss yet** — expected to kill a
first-timer once or twice; ~2.5–3 min for a mid-power build. No adds at any
point — waves 30–35 were the horde; this is the duel.

## Stubs (bookends on ice)

- **Entry:** wave-36 banner → boss spawns like any boss. No barks, no
  cutscene. The entry cutscene replaces this later without rework.
- **Exit:** at 0 HP he kneels (pose_kneel), corpse/death VFX gated OFF,
  1.5s beat, then the existing victory flow runs unchanged. The outro
  cutscene later replaces the beat only.
- The kneel gate lands the owed shared fix: **defeated-but-surviving bosses
  must not play the corpse/explosion death VFX** — one gate covering the
  Slayer (retroactively) and Ass Man.

## Structure

One `AssManBoss` class — Boss subclass with a `think()` state machine, per
house pattern (Big Drip / Switch precedent). All tunables in `js/config.js`
under `JH.ASSMAN`.

- **HP: 2200 base** (new ceiling; Slayer 1900), scaled by the existing boss
  formula `1 + 0.02·power`.
- **Phase gates at hp fractions 0.66 / 0.33** — moves gate on hp fraction,
  never timers, so fight length tracks player power.
- **Phase transition beat** (debuts the boss-phase language): the current
  move completes → **invulnerable 1.6s** → transition flourish (phase 2:
  flight lift-off using pose_flight; phase 3: furious hover-drop + ground
  crack) → one poster bark banner ("THE CHEEKS HAVE CLAPPED BACK." at
  phase 2, "GLUTE FORCE TRAUMA." at phase 3) → new move pool arms.
- Enrage latch = phase-3 entry; prayer_bead interacts normally.

## Phase 1 — Grounded Glutes (100→66%)

Brawler footsies. Walk speed **40** (fast for a boss — he is a hero, not a
furnace). Decision cadence **2.2s**, move picked by range band:

| Move | Trigger range | Telegraph | Effect |
|---|---|---|---|
| **Cheek Clap** | close/mid | 0.9s arms-wide (pose_clapwind), cone fills | Cone shockwave from his front: **range 95, half-angle 38°**. **22 dmg + 260 shove.** ONE cone shape feeds telegraph, draw, and hit test (SwitchBoss.lineHits precedent). Release uses pose_clap. THUNDERCRACK audio slot. |
| **Hip Check** | mid/far | 0.7s brace | Charger-style line dash: speed **300**, max distance **200**, **16 dmg + heavy knock**. On whiff: **0.8s skid recovery** (punish window). Uses pose_hipcheck. |
| **Toilet Toss** | far | arc + **marked landing ellipse rx 30** (ry = rx·GROUND_RY) | SmeltBomb arc idiom. **20 dmg** on impact + **shard zone 2.5s** ticking **6 per 0.5s** inside the drawn ellipse (rim is hitbox). Uses pose_toss; the porcelain composites separately (new prop sprite). |

## Phase 2 — Air Superiority (66→33%)

Airborne (pose_flight), **out of the hit band** — spray passes under him,
visibly. The fight's tension core; vulnerability is ONLY the slam windows.

Loop (~8s cycle):
1. **Shadow**: he tracks Jon's x from the air for ~2s, firing **Clap Back**
   every **1.8s** — an airborne clap (pose_airclap) sending a horizontal
   pressure wave down his current depth lane (lineHits band, **14 dmg**,
   dodged by depth).
2. **Glute Slam**: 0.8s hover-pause telegraph directly above Jon's last
   position → butt-first drop (pose_slam) → **landing ellipse rx 44**
   (drawn ellipse IS the hit ellipse, GK-slam precedent), **26 dmg + 300
   shove** → **2.6s landed recovery = the only vulnerability window**.
3. Every second loop he summons one **gust lane** (existing tech) that
   persists **6s**.

Uptime math: ~2.6s vulnerable per ~8s cycle ≈ 33%; ~733 phase hp at ~80
sustained dps ≈ ~10 slam cycles ≈ 80–90s.

## Phase 3 — Glute Force Trauma (33→0%)

He plants center-arena; the exhaustion cycle is the phase's movement.

- **Clap-storm burst (~5s):** 3 expanding shockwave rings from his position
  (GUSH-pulse ring tech; drawn rim = hit rim), ring speed **90 px/s**,
  **12 dmg** per ring. Each ring carries a **55°-wide safe gap**, rotated
  **+40° per ring** — weave, don't memorize.
- **Exhaustion window (4s):** bent over, hands on knees (pose_exhaust); he
  takes **1.25× damage** — the big honest opening, visibly presented as
  one. Repeat burst → exhaustion until 0 HP.
- **At 0 HP:** kneel (see Stubs). Never a death.

## Arena

Air World plaza, camera-locked like other boss waves. Gust lanes are the
only terrain hazard. No stink clouds during the fight (his own act's
hazard fights FOR him would muddy the duel read).

## Leaderboard (ships with the fight)

- Client payload carries **`wavesCleared`** and **game version** — verify at
  plan time which of the two the v0.29 telemetry rows already include; add
  whichever is missing.
- Comparator, in order: **(1) newer game version ranks above all older-
  version runs; (2) waves cleared, descending; (3) fastest time** as the
  tiebreak. Same Apps Script/Sheets + client-render split as today; only
  the comparator and payload change.

## Art & audio

- All nine Ass Man poses shipped in `sprites/assman/` (canon salt-and-
  pepper set): idle reference, flight, slam, kneel, clapwind, clap,
  hipcheck, toss, airclap, exhaust. Game-scale baking via the boss-chassis
  pipeline (Switch/GK precedent); **procedural chassis fallback first**,
  per the pipeline rule.
- **New prop: toilet projectile** (single clean porcelain toilet; engine
  handles arc, spin optional, shard burst procedural). Generated during
  the build.
- Audio: Cheek Clap needs the THUNDERCRACK (reuse/pitch existing cues
  first); slam reuses the GK slam thump family; rings reuse GUSH-pulse
  cues.

## Numbers summary (all in JH.ASSMAN, config-only)

hp 2200 · gates 0.66/0.33 · transition invuln 1.6s · walk 40 · decision
2.2s · clap: wind 0.9s, range 95, half-angle 38°, dmg 22, shove 260 ·
hipcheck: brace 0.7s, speed 300, dist 200, dmg 16, skid 0.8s · toss:
landing rx 30, dmg 20, shards 2.5s @ 6/0.5s · clapback: every 1.8s,
dmg 14 · slam: pause 0.8s, rx 44, dmg 26, shove 300, recovery 2.6s ·
gust lane every 2nd loop, 6s · rings: speed 90, dmg 12, gap 55°, rot
40°/ring, burst ~5s · exhaustion 4s @ 1.25× dmg taken · kneel beat 1.5s.

Fight-length sanity at ~80 sustained dps: P1 ~748 hp ≈ 35–45s under dodge
pressure · P2 ≈ 80–90s of window discipline · P3 ≈ 40s with the 1.25×
openings → **~2.5–3 min total**.

## Testing

- Pure helpers dual-exported and unit-tested: cone membership (telegraph =
  hit), ring gap membership + rotation, slam ellipse, phase gating on hp
  fractions, leaderboard comparator ordering.
- Rim tests for every new shape (cone, landing ellipses, rings, clap-back
  lane).
- Headless full-fight run: scripted kill through all three phases →
  transition beats observed → kneel → victory flow, before the playtest
  gate. Suite derives every number from `JH.ASSMAN`, never literals.

## Non-goals

- No adds during the fight. No stink clouds in the arena.
- No entry/outro cutscenes, no K-9 Unit relic, no victory-flow move (all
  on ice; stubs above).
- No new fx tech beyond the reused cone/ring/lane/slam shapes.
