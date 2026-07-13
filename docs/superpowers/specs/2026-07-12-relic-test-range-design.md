# Relic Test Range — Design

**Date:** 2026-07-12
**Status:** Approved (user, 2026-07-12)
**Parent:** Relic Rarity Tiers pass (`2026-07-11-relic-rarity-tiers-design.md`); ships
inside the same "Rummage Sale" minor.

## Goal

Every relic effect must be testable on demand in the dev TARGET RANGE
(`devGotoRange`), so the Rummage Sale playtest can feel each of the 22 items
without grinding runs for suds or waiting on the right combat moment.

## Non-goals

- No production-path changes. Everything lives behind the range
  (`rangeStations`/`rangeMode` are null/false in real runs).
- No new balance knobs. The range grants and stages; it never retunes.
- Not a replacement for the shop: the range vendor keeps selling the real
  wheel (that is itself the Punch Card / wheel-tier test).

## Part 1 — Relic rack

A rack of 22 walk-up relic stations below the existing benediction sigil
rows, two rows of 11, one station per `JH.RELICS` def (roster order, so the
rack reads common → rare → relic-grade left to right).

- **Interaction:** same proximity + buffered-E pattern as the sigils /
  range stations. **E toggles** the relic in `Game.relics` — on if absent,
  off if owned. Toggle-off exists for A/B feel checks (lance falloff on/off,
  boots in the puddle vs not).
- **On every toggle:** re-run `JH.Upgrades.computeStats(owned)` +
  `player.applyStats(...)` so the `apply()` relics (hydro_dash,
  fire_marshal, hydro_lance, rubber_boots) fold in AND out correctly;
  clamp `hp = min(hp, maxHp)` after a boots toggle-off. Toggling
  rosary_chain off also zeroes `rosaryBonus`; toggling boiler_coil off
  clears `boilerTarget/boilerHeat/boilerGapT`.
- **Draw:** the relic's 12px icon inside its tier `gearFrame`
  (steel/brass/gold — tier reads at a glance). Owned stations draw at full
  alpha with a small check tick; un-owned dim. The nearest station's
  name + tier + one-line desc shows in the existing bottom info card
  (drawSigilCard pattern). Relics with a range gap (see Part 3) append
  "(needs real run)" to the card line.
- **Wallet-free:** the rack never touches suds or the wheel stock.

## Part 2 — Scenario props

The range already covers most effects: killable dummies (single + pierce
pair + off-depth), hydrant, gush station (combo jump to one-off-milestone),
kibble station, vendor, 999 suds. New props fill the gaps:

| Prop | What it stages | Effects it unlocks for testing |
|---|---|---|
| **Fire patch station** | E spawns a FirePatch at a fixed spot beside a kill dummy (re-pressing respawns it if doused/expired) | squeegee (kill-on-patch douse), backdraft_valve (ring douse), asbestos_socks (stand in it: reduced burn ticks + longer i-frames) |
| **Slow puddle strip** | permanent SlowZone segment on the range floor | rubber_boots (walk in/out; immunity vs slow) |
| **Charge dummy** | one dummy cycles `walk → charge` state ~4s period (state flag only — no real charger AI/contact) | dog_leash (+15 lands only during the charge windows) |
| **Dome pair** | active deployed dome with one dummy inside, one outside, in sprinkler range of a marked stand spot | deputy_sprinkler (shelter respected: outside dummy drains, sheltered one doesn't), lance blocker behavior |
| **Super-elite button station** | E fires the super-elite-arrival proc path (the same code startWave runs after the super-elite spawn) | prayer_bead (pressure buff + PRESSURE floater on demand) |
| **Respawning dummies** | range kill dummies respawn ~3s after death at their spawn spot; normal drop rolls stay on | GUSH-milestone farming (backdraft_valve rings, big_spigot blasts, rosary_chain stacking), dowsing_rod (magnet + can value on real drops), collection_plate, brass_nozzle/boiler_coil/spigot re-kills |

Existing props already cover: brass_nozzle + hydro_lance (pierce pair),
boiler_coil (sustained spray on a dummy + neighbor), spigot_key (hydrant),
loaded_sponge (gush station windows), hydro_dash / fire_marshal (feel),
punch_card (vendor prices), kibble economics (kibble station).

## Part 3 — Honest gaps

Three effects cannot fire in the range and are labeled "(needs real run)"
on their rack card rather than faked:

- **alarm_bell** — needs a real non-elite wave clear (range has no waves).
- **sunday_suit** — needs a real boss kill (gallery bosses are statues).
- **censer** — affects post-boss sigil offer count.

## Implementation shape

- All code inside the existing dev-only surfaces: `devGotoRange` (setup),
  `tickRangeStations` (new station kinds + rack toggles + dummy respawn +
  charge cycling), `drawRangeStations` / sigil-card draw (rack render +
  labels). The rack can reuse the station list with a `relic: id` kind
  rather than a new parallel system.
- The super-elite button calls the same proc block `startWave` uses
  (extract to a tiny shared helper if needed rather than duplicating).
- Statue-gallery and benediction-rack patterns are the model; follow them.
- Tests: one unit test for the toggle helper (grant → stats fold in;
  revoke → stats fold out, hp clamped, rosary/boiler state cleared).
  Everything else is dev-only staging verified by a headless range visit
  (enter range, toggle a relic of each tier, exercise one prop) +
  screenshots.

## Success criteria

Entering TARGET RANGE, a player can: toggle any of the 22 relics on/off and
see stats update; stage a fire patch, slow puddle, charging dummy, dome
pair, and super-elite proc on demand; farm GUSH milestones off respawning
dummies; and read which three relics need a real run instead.
