# Jon Hose — Sound Effects Audit

Full inventory of every procedural SFX cue, where it fires, plus the music
layer. Generated from `js/config.js` (`JH.SFX`), `js/assets.js` (`JH.AudioFX` /
`JH.Music`), and all `audio.play(...)` call sites.

All SFX are synthesised at runtime via WebAudio (`JH.AudioFX.play` in
`js/assets.js`) — there are **no audio files**. Each cue is a single oscillator
(or filtered noise) blip described by a `JH.SFX` descriptor.

## Descriptor table (`JH.SFX` in `js/config.js`)

| Key | Type | Freq | Dur (s) | Gain | Pitch sweep |
|------|------|------|---------|------|-------------|
| `spray`   | noise (bandpass 1800 Hz) | — | 0.08 | 0.05 | — |
| `hit`     | square | 220  | 0.06 | 0.10 | — |
| `whack`   | square | 130  | 0.08 | 0.12 | — |
| `hurt`    | saw    | 90   | 0.18 | 0.14 | ↓ ×0.5 |
| `coin`    | square | 880  | 0.07 | 0.10 | ↑ ×1.6 |
| `buy`     | square | 660  | 0.12 | 0.12 | ↑ ×1.6 |
| `upgrade` | square | 523  | 0.30 | 0.14 | ↑ ×1.6 |
| `die`     | saw    | 70   | 0.40 | 0.16 | ↓ ×0.5 |
| `win`     | square | 990  | 0.50 | 0.14 | ↑ ×1.6 |
| `jump`    | square | 480  | 0.09 | 0.08 | — |
| `pill`    | square | 1400 | 0.45 | 0.14 | — |
| `blast`   | saw    | 55   | 0.35 | 0.18 | — |

Pitch sweep is applied in `AudioFX.play`: `coin`/`win`/`buy`/`upgrade` ramp up to
1.6×; `hurt`/`die` ramp down to 0.5×. All others hold a flat tone. Gain is scaled
by the shared master volume (`JH.Music.volume`) and silenced when muted.

## Trigger map (where each cue plays)

| Cue | Triggered by | Sites |
|-----|--------------|-------|
| `spray`   | Player spraying water (throttled ~every 0.05 s while held) | `entities.js:303` |
| `hit`     | **UNUSED** — defined but never played | — |
| `whack`   | Heavy impacts: player melee (disabled path), charger lunge start, boss slams/stomps, neighbor rock impact | `entities.js:386, 687, 835, 1045, 1372, 1417, 1772, 1899` |
| `hurt`    | Player takes damage; failed/unaffordable purchase | `entities.js:421`; `game.js:455, 568` |
| `coin`    | Suds (coin) pickup collected | `entities.js:950` |
| `buy`     | Consumable pickups (health, water can, generic) | `entities.js:954, 958` |
| `upgrade` | Shop upgrade node purchased (HTML shop + hover shop) | `game.js` `upgradeFx()` |
| `die`     | Enemy death, boss death, player death | `entities.js:568, 1251`; `game.js:483` |
| `win`     | Triumph fanfares: boss defeats, garden box completed | `entities.js:902, 1227, 1528, 1676, 1985` |
| `jump`    | Player dash; enemy wind-up "tells" (teleport/leap); disabled jump branch (never fires) | `entities.js:195, 214*, 857, 1086, 1402, 1459, 1967` |
| `pill`    | Concerta pill pickup | `entities.js:961` |
| `blast`   | Neighbor speaker Soundwave blast | `entities.js:1737` |

`*` line 214 is the disabled jump action — no key is bound, so it never plays
(see "Disabled features" in CLAUDE.md).

## Music (`JH.Music` in `js/assets.js`)

Two looping `<audio>` tracks with a ~0.3 s cross-fade:

- **`level`** — exploration / wave combat (default track)
- **`boss`** — boss encounters

| Transition | Site |
|------------|------|
| Switch to boss theme on boss spawn | `game.js:219` |
| Back to level theme after boss clear / new game / continue | `game.js:174, 241, 470` |
| init / start / reset lifecycle | `game.js:46, 55, 173` |

Master volume + mute (`JH.Music.volume`, `JH.Music.muted`) are shared by both
music and SFX, controlled by the volume slider / mute button in the menu.

## Findings & gaps

1. **`hit` is dead code** — defined but never played. Spray *impacts* on enemies
   are currently silent (only the `spray` emitter loops). Wiring `hit` to the
   enemy-hit branch in `Player.update` (`entities.js:330`) would close that gap,
   or remove the descriptor.
2. **`jump` is overloaded** — it covers the dash *and* multiple enemy wind-up
   tells *and* the disabled jump action. Distinct `dash` and enemy-`tell` cues
   would read more clearly.
3. **`whack` is a catch-all heavy impact** — used by the charger, every boss
   slam, and the neighbor rock. Acceptable as a generic thud, but signature boss
   attacks could use unique cues.
4. **No dedicated cue for several events:** shop proximity/open, wave-start
   banner, hydrant refill/heal, barricade smash, pickup spawn, menu navigation.
5. `buy` vs `upgrade` are now distinct — `buy` = consumable pickups,
   `upgrade` = shop node purchase.
