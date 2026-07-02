# Control Feel, Accessibility & QoL

**Date:** 2026-07-02 · **Priority: Strong** · **Scope: S/M (itemized)**

## Problem statement (grounded)

The three-verb kit (move/spray/dash — jump and melee are cut by design; `input.js` binds no key to `jump`/`whack` while dead handler branches linger in `Player.update`, `entities.js` ~258–265) is the right shape, but the input layer under it drops presses and the game has zero player-facing settings beyond volume.

Concrete issues found in code:

1. **Edge-presses are eaten during freezes.** `Input.pressed()` is a one-frame edge. `Game.update()` polls input and then early-returns during hit-stop (`game.js` ~1038), the church-arrival sequence (~1035), and cutscene phases — so a dash pressed on those frames is silently lost. The most common case is brutal: you get hit (0.06s hit-stop), you mash dash to escape, the press lands *inside* the freeze, nothing comes out, you eat the follow-up. This is a difficulty problem wearing a controls costume.
2. **No dash buffering.** A dash pressed 100ms before `dashCdTimer` expires does nothing (`Player.update` ~235). Every action game since DMC buffers this.
3. **Dash requires a direction** (`In.pressed("dash") && (mx || my)`) — a neutral dash-press does nothing, another silently-eaten input. Default to `facing` when neutral.
4. **Gamepad gaps:** `confirm` isn't on the A button (only Start, `input.js` ~77), so walk-up shops/stations/portals are keyboard-only in practice; no remapping exists for either device.
5. **No accessibility surface at all:** shake, hit-stop, flash (`HURT_FLASH_MAX_ALPHA`, `assets.js`), and particle density are hard constants; telegraphs communicate *only* by color (red/amber/orange/cyan), which is exactly the set most affected by common color-vision deficiencies.

## The ideas

### 1. Input buffer (S) — do this before the juice pass
A tiny ring buffer in `Input`: edge-presses for `dash`/`spray`/`confirm` stay "pending" for 130ms and are consumed by the first frame that can act on them. Fixes issues 1–2 in one place (freezes no longer eat presses; cooldown-edge dashes come out). Pure logic — testable with a fake clock like `balance.js` functions.

### 2. Dash polish (S)
Neutral dash = dash toward `facing`. Optionally: a 40ms "dash-cancel window" at the end of spray release so back-off feels snappy. No new buttons, no air game — respects the cut-jump constraint.

### 3. Gamepad parity + remapping (S/M)
Map A→confirm (keep Start=pause), add a minimal remap screen on the pause menu writing to `localStorage` (KEYMAP is already a flat table — serialize it). Rumble on player-hit if `gamepad.vibrationActuator` exists (one call, gate behind a setting).

### 4. Settings panel (M) — the accessibility surface
One pause-menu page, all values already funnel through single constants:

| Setting | Hook |
|---|---|
| Screenshake 0–150% | `JH.JUICE.shakeScale` (juice spec §2) |
| Hit-stop 0–150% | tier table multiplier |
| Flash intensity | `HURT_FLASH_MAX_ALPHA` |
| Particle density | emitter rates in `doSpray`/`burst` |
| Telegraph patterns | see §5 |
| Spray: hold ⇄ toggle | `wantSpray` derivation (~207) |
| Master/music/SFX volume | `JH.Music` exists; split SFX gain |

Hold-to-spray⇄toggle matters for motor accessibility in a game whose primary verb is "hold a button for 2.8 seconds at a time."

### 5. Colorblind-safe telegraph patterns (S)
The boss grammar (boss spec) maps shape→verb, which already helps. Add a redundant channel: danger fills get a **pattern**, not just a hue — diagonal stripes for step-out zones, chevrons pointing the safe direction for lanes/columns, concentric dashes for dash-through waves. Canvas `createPattern` on tiny procedural tiles; one shared helper next to the telegraph painters (`Boss.drawTelegraph`, `entities.js` ~1547 and friends).

### 6. QoL grab-bag (each S)
- **Aim forgiveness stays as-is** (the decoupled `sprayHitBand: 18` vs visual 12 is good design — document it) but add *target highlight*: the enemy currently eating the stream gets a 1px underline shadow, so pierce/blocker questions ("why is nothing dying?") self-answer. `doSpray` already computes `blocker`.
- **Shop deltas:** node rows show the resulting stat ("+8 dmg → 58") — data is in `computeStats`, render in `drawHoverShop`'s desc line.
- **Run summary on death/win:** kills, GUSH best, damage taken, time per act — `kills`/`elapsed`/`combo` already tracked; the Church can display it as a "confession" (ties into meta spec's tone).
- **Pause during hover-shop** (`togglePause` currently only from `play`; shopping is play-state so Esc works — verify and keep).
- **Practice range from the title screen:** `devGotoRange` (`game.js` ~170) is dev-only; expose as "TRAINING" behind the title menu — it already spawns dummies and a hydrant.
- **Delete the dead jump/melee code** (`IMPROVEMENT_PLAN.md` L4): input ACTIONS, `Player` branches, `meleeDamage` stats, `drawMeleeArc` — locks the design decision into the codebase so future specs (and contributors) can't accidentally resurrect them.

## Why it's fun

Input buffering is invisible; its absence is not — it's most of the difference between "tight" and "unfair" in fast brawlers (the Celeste/Hades postmortems both credit generous buffering + coyote-style forgiveness as the core of feel). And the settings panel is the cheapest breadth-of-audience win available: shake/flash sliders + colorblind patterns + spray-toggle covers the three most common accessibility asks for exactly this genre.

## Scope

§1–2: **S**, prerequisite for the juice pass (hit-stop amplifies the eaten-input bug). §3–5: **S/M**. §6: S each, independent.

## Open questions

1. Buffer window 130ms — tune 100–160 in playtest; does spray need buffering at all (it's a hold)? Probably confirm-only + dash.
2. Remap UI scope: full rebind vs. 3 presets (default / lefty / one-handed)? Presets first.
3. Do telegraph patterns render at 480×270 legibly? Prototype the chevron tile first — if it's noise at this resolution, fall back to safe-direction arrows at the zone edge.
4. Training range: freeze difficulty/economy (no suds earned) to keep it out of speedrun/economy paths?
