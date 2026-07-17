# Air Wind Pass — dynamic lanes, wind hazards, edge art, roster sprites

**Date:** 2026-07-17
**Status:** approved (brainstorm 2026-07-17, live-playtest follow-up round)
**Scope:** Air act waves 30–35 on branch `air-act`. No Plan 3 content.

## Goal

Make wind the Air act's living terrain: gust lanes vary blow-to-blow instead
of sitting static, gusts have something physical to blow you into, the
cloudline edge looks like a place instead of a line, and the Gasbag/Bidet
lose their procedural placeholder art.

## Decisions locked in brainstorm

1. **Hazard fiction: both, layered.** The cloudline edge keeps its mechanic
   and gains real art; waves can additionally place standalone mid-field
   contact hazards that gusts blow you into.
2. **Lane dynamism: re-roll between blows.** Geometry changes only at
   telegraph start — every blow is telegraphed at its final geometry first.
   No mid-blow drift.
3. **Escalation: within the Air act.** Waves 30–32 tame, 33–35 wilder, all
   authored in wave data. No speculative future-act tiers.
4. **Hazard sides: player chip damage; enemies knockback + stagger only,
   no damage.** No farmable damage source.
5. **Lane architecture: A (range-spec lanes) now.** Option B (a "wind
   director" controller with orchestrated blow patterns) is explicitly
   deferred as the Plan 3 option if the Ass Man boss wants choreographed
   wind phases.
6. **Art route: codex/gpt-image-2 primary** (ChatGPT subscription quota).
   PixelLab reserved for walk-cycle-grade animation (~5–6 generations/month
   quota). One generation presented for user verification at a time.

## 1. Dynamic gust lanes (range-spec re-roll)

### Data

Wave `gusts` entries become specs:

```js
{ yMin, yMax,          // depth range the lane may occupy
  dirs,                // array of allowed directions, e.g. [1] or [1, -1]
  bandMin, bandMax,    // half-band width range (px)
  phase }              // cycle start offset in seconds (staggers lanes)
```

Every field optional. Legacy `{ y, dir }` entries remain valid and behave
byte-identically to today: `yMin = yMax = y`, `dirs = [dir]`,
`bandMin = bandMax = JH.GUST.band`, `phase = 0`. This is regression-pinned.

`JH.GUST` gains `bandMin: 10, bandMax: 22` as the default roll range for
specs that omit band fields. Existing keys unchanged.

### Behavior

`GustLane` keeps telegraph → blow → gap. At each **telegraph start** it
re-rolls from its spec: depth uniform in `[yMin, yMax]`, direction uniform
from `dirs`, half-band uniform in `[bandMin, bandMax]`. The 1.2s telegraph
flashes the edge lines at the NEW geometry — the fairness contract. The
drawn band edges are the rolled band (rim is hitbox, one source). `phase`
delays the first telegraph so multiple lanes alternate instead of syncing.

### Escalation ladder (playtest knobs, wave data only)

| Wave | Lanes |
|---|---|
| 31 | current fixed lane as a zero-width spec (unchanged feel) |
| 32 | ±12px depth wobble, fixed direction |
| 33 Holdout | both lanes roll depth; direction stays rightward (the edge is the encounter — direction flips there would be unfair) |
| 34 | one lane gains `dirs: [1, -1]` |
| 35 | two opposed lanes roll depth + band, offset `phase` (the squeeze) |

## 2. Mid-field wind hazards ("sky vents")

New entity `WindHazard`: a broken rooftop turbine/fan, sparking. Stationary
scenery — **not** a wave member: no HP, never blocks wave clear, spawns and
clears with the wave's terrain (same lifecycle paths as gusts/edge).

- Placed via wave data `hazards: [{ x, y }]` (Bidet-placement idiom; `x`
  offset from arena left bound, `y` world depth).
- Footprint: ground ellipse, ONE shape for draw and hit
  (`FirePatch.footprint` idiom).
- Player contact: `JH.WIND_HAZARD.dmg` (starting value 8 — chip, below the
  edge's 12) through the normal `takeHit` path + knockback away from the
  hazard center, gated by a per-entity contact cooldown
  (`JH.WIND_HAZARD.contactCd`, start 0.6s).
- Enemy contact: knockback + brief stagger, **zero damage**. Emplacements
  (`speed === 0`) and bosses immune, same exemptions as gust push.
- Authoring: wave 34 one hazard, wave 35 two, positioned to compose with
  the Bidet placements and lane bands. Wave 33 has none mid-field.

Config block (all tunables in js/config.js):

```js
JH.WIND_HAZARD = { rx: 14, dmg: 8, knock: 140, enemyKnock: 120,
                   staggerT: 0.35, contactCd: 0.6 };
```

## 3. Cloudline edge art

Mechanic untouched (edge.x line, reset + 12 HP via takeHit, gust burst).
Three visual layers anchored to the same `edge.x`:

1. **Walkway lip strip** (baked, codex): pavement visibly ends — broken
   concrete, rebar stubs, snapped guardrail post variant — tiling
   vertically along the depth band.
2. **Cloud churn** (procedural): slow rolling puffs past the lip, reusing
   the scald-pass steam-wisp idiom, drawn on the sky side only.
3. **Crossing poof**: small cloud burst at the reset point (visual only).

The dashed line is removed once the lip renders; the procedural fallback
becomes a simple two-tone edge band, not dashes.

## 4. Roster sprites (codex/gpt-image-2, one at a time)

All wired via `registerBaked` (proven by the TP Mummy set: right-facing
sources, elite fallback to base frames, procedural painters kept as load
fallbacks). Canvas conventions follow the existing sets (4x logical,
feet-baseline row, magenta-keyed, 2px outline).

| Set | Frames | Notes |
|---|---|---|
| Gasbag | `idle0/1` (sag bob), `wind0/1` (inflate stages via existing `windFrac`), `vent` (deflate spurt) | floats, no walk frames; minis reuse via `spriteScale` |
| Bidet | `idle0/1` (bowl shimmer), `wind` (nozzle rise + bulge), `fire` (recoil + spout) | stationary artillery |
| Wind hazard | `idle0/1` (lazy broken spin) | spark particles at runtime |
| Edge lip | tileable segment + broken-guardrail variant | strip, not a character |

Small visual-state beats where the runtime lacks a pose hook: Gasbag `vent`
and Bidet `fire` get short timers like the TP Mummy `release` (visual only,
no behavior change).

## 5. Testing & verification

- **Lanes:** rolled values always inside spec ranges; legacy `{y, dir}`
  specs behave identically to current behavior (regression test); geometry
  changes only at telegraph start; phase offsets stagger cycles.
- **Hazards:** ellipse rim draw=hit test; player chip + cooldown (no
  per-frame ticking); enemy knockback-without-damage; never blocks wave
  clear; cleared on every terrain reset path (waveCleared_, death/respawn,
  dev warps, new run).
- **Edge art:** hit line unchanged (existing geometry tests keep passing).
- **Headless:** drive waves 33–35 with dynamic lanes + hazards on real
  keys; screenshot each new visual (lane re-roll telegraph, hazard contact,
  edge lip + churn) and inspect.
- **Threat tool:** add a hazards column to the per-wave audit.
- All held on `air-act` for user playtest; sprite generations verified by
  the user one at a time before wiring.

## Out of scope

- Wind director / orchestrated blow patterns (Plan 3, boss).
- Spray-bending wind, third Air verb (cut in Plan 2, stays cut).
- TP Mummy / Plunger art (separate track: plunger walk cycle in progress).
- Any softening of existing waves; lanes 30–32 keep today's feel.
