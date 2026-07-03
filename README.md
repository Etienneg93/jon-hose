# Jon Hose — A Browser Beat 'em Up

A side-scrolling, pixel-art beat 'em up in the spirit of *Battletoads* and *Double Dragon*.
You play **Jon Hose**, a hero strapped into a FLUDD-style hydro-pack. Instead of throwing
punches, Jon blasts foes with a high-pressure water hose. Water is limited, so you manage a
tank that drains as you spray and recharges over time — and you spend the cash dropped by
enemies on upgrades between fights.

> Status: **Playable level — 29 waves across five acts** (4-4-5-6-6 escalation curve),
> each act capped by a boss with its own distinct dodge: **The Big Drip** (step out of
> ground slams), **The Switch of Doom** (change depth lane vs. line attacks), **Quake
> Walker** (dash through stomp shockwaves in the ruined district), **Gateway Krusher
> 9000**, and **The Slayer** (pool-cue fireballs, in the fire-world Boiler District).
> Set-pieces along the way: destructible barricade, 22s holdout, douse-the-flames,
> the Garden, and stalker/bulwark ambushes. Death sends you through the **Church of the
> Holy Hose** — a walkable interlude with Father Jon — before respawning at your last
> hydrant checkpoint. Full core loop, skill-tree shop, GUSH kill combos, HUD, win/lose
> flow. The streamlined kit is move + spray + dash (no jump/melee — by design).

---

## Quick start

No build step needed to play. Just open the game:

- **Double-click `index.html`** (works straight off disk via `file://`), or
- `npm run dev` to serve it at `http://localhost:5173` (nice for testing on your phone over LAN).

Tested in current Chrome/Edge/Firefox.

**Sharing with friends / deploying:** see **[DEPLOY.md](DEPLOY.md)** — push to GitHub and
it auto-publishes to a free GitHub Pages URL with cache-busting, so `git push` is the whole
iteration loop. (Cloudflare Pages works off the same repo too.)

---

## Controls

| Action            | Keyboard                | Gamepad            |
|-------------------|-------------------------|--------------------|
| Move              | Arrow keys / `WASD`     | Left stick / D-pad |
| Spray hose (hold) | `J` or `Space`          | A / right trigger  |
| Dash (i-frames)   | `L` / `Shift`           | B                  |
| Talk to vendor / interact | `E` / `Enter`   | —                  |
| Confirm / Pause   | `Enter` / `Esc`         | Start              |

*(Dev, localhost only: backtick toggles a jump-to-wave menu — includes the target range
and a church-save reset.)*

The hose is your only weapon
Spraying costs water, and the beam weakens as the tank drains (sputters when empty), so back
off to recharge or top up at a **fire hydrant**. 
**Dash** has brief invulnerability — it's
your dodge.

**Audio:** three looping tracks — the level theme, *Jon Hose Rush* for boss fights, and a
church theme for the death interlude — cross-fade automatically. **Music and Sound
Effects have independent volume sliders** on the title and pause screens (mute button
stops music only); settings persist in `localStorage`. Music starts on the first
key/click (browser autoplay policy).

---

## Core loop

1. **Advance** along the street; the camera locks during a fight ("GO!" once cleared).
2. **Spray** a high-pressure water beam to damage and knock back foes. Pyros take bonus damage. Facing locks while you spray, so you can back-pedal and keep aiming.
3. **Manage water** — drain vs. passive recharge, hydrant top-ups, and tank upgrades. Stand next to a **fire hydrant** while low to refill fast.
4. **Collect Suds** (currency) and health/water drops from downed enemies.
5. **Walk up to the vendor** (Old Spigot, at the back of the street — he shows up from the second wave onward) and press `E` for the **skill tree** plus a repeatable **Patch-Up Kit** (15 Suds → 35% HP); he's left behind as you push on.
6. **Beat the boss** at the end of the level to win the slice.

---

## Mechanics

### The hose & water economy
- **Small tank, punchy bursts**: a 100-unit tank gives ~2.8s of continuous fire, then recovers quickly (fast passive regen, faster still at a **fire hydrant**). The model rewards short, high-pressure blasts over holding the trigger.
- **Pressure tiers** (shown by the meter colour): the beam's damage *and* range drop as the tank drains — **100–67% green** = full power (out-DPSes melee), **67–33% yellow** = reduced, **33–0% red** = weak/short, and an empty tank just sputters. Ease off and let it climb back to green between bursts.
- At **full pressure** the hose hits hardest and adds range + knockback. It's your only attack — there's no melee — so keeping your pressure up is the whole game.
- The particle stream gets **denser and tighter** as you climb the Pressure skill branch.

### 2.5-D movement
Classic beat 'em up plane: a horizontal axis plus a **depth** axis (move "up/down" the floor).
Attacks connect only when the target is roughly on your depth line, so positioning matters.
There's no jump — your only defensive move is the **dash**, which carries brief i-frames.

### Enemies
- **Mook** — walks in, swings a punch. Cannon fodder.
- **Charger** — winds up, then rushes; punish the recovery.
- **Pyro** — on fire, ranged embers, but takes **bonus** damage from water (theme hook).
- **Bulwark** — plants a shield dome that shelters shooters; crack it to get at them.
- **Stalker** — blinks behind you and strikes; stalks between blinks.
- **Smelt / Fuse / Furnace** (fire world) — bomb-lobber, dive-bombing spark that leaves
  burning ground, and a vent-cycling heavy. Fire hazards damage inside the **exact
  ellipse they draw** (rim = hitbox), and burns tick in readable half-second beats.

### Bosses (one distinct dodge each)
- **"The Big Drip"** (Act 1) — telegraphed slams/sweeps with red danger zones: **step out**.
- **"The Switch of Doom"** (Act 2) — full-width line attacks along a depth row: **change lane**.
- **"Quake Walker"** (Act 3) — stomp shockwaves sweep every lane: **dash through** (i-frames).
- **"Gateway Krusher 9000"** (Act 4) — the gate guardian to the Boiler District.
- **"The Slayer"** (Act 5) — pool-shark pyromancer; cue-launched fireballs that leave
  fire patches, plus a slam. Killing any boss clears its summoned goons.

### Encounters
- **Elites**: later fights spawn tougher "elite" enemies (more HP, damage and speed; marked with a red aura ring), scaled by act.
- **Set-pieces**: a destructible **barricade** with reinforcements, a 22-second **holdout**, **douse-the-flames** (spray out burning ground), and **the Garden**.
- **GUSH combos**: chained kills pitch-ladder the kill sound and pay out — x3 arms a water-regen window, every 5th milestone scales it further (uncapped) plus a water refund.
- **Death loop**: dying takes Jon through the **Church of the Holy Hose** — a walkable nave interlude — then respawns him at the last touched hydrant. Every boot is a deliberately **fresh run** (no persistent meta-progression yet — that's a design decision, not a gap).
- **Anti-farm**: infinitely-spawning foes (boss summons, barricade reinforcements) share a per-encounter drop budget, so you're rewarded for fighting but can't idle-farm unlimited Suds/health/water.

### Upgrades — a branching skill tree
Buy one-time nodes from five branches, each gated behind the previous tier:
**Pressure** (Thumb on the Nozzle → Pressure Washer → Hydro Lance — concentrates the
beam tighter/brighter and adds pierce), **Reach** (Extension Hose → Fire-Marshal Spec),
**Tank** (Bladder Pack → Quick Prime → Closed Loop, which siphons water back as you hose
enemies), **Mobility** (Gripper Soles → Hydro-Dash), and **Vitality** (Wetsuit → Second
Wind, which heals on a wave clear). The water beam visibly tightens as you climb the
Pressure branch.

---

## Architecture

Plain `<script>` files (no modules/bundler) so it runs from `file://` by double-click, while
still being cleanly separated. Everything hangs off a single global namespace `JH`.

```
Jon Hose Beatemup/
├── index.html          # canvas + UI overlays, script load order
├── styles.css          # arcade / CRT styling for shell & overlays
├── js/
│   ├── config.js       # ALL tunables: player, enemies, waves, upgrades, palette
│   ├── assets.js       # AssetManager: procedural pixel sprites + WebAudio SFX
│   │                   #   (swap point for real sprite-sheet PNGs — see below)
│   ├── input.js        # keyboard + gamepad → input state
│   ├── world.js        # depth math, collision bands, camera, parallax background
│   ├── entities.js     # Entity base, Player, enemies, Boss, WaterDrop, Pickup, Particle
│   ├── upgrades.js      # upgrade definitions + apply logic + shop model
│   ├── game.js         # scene manager, wave spawner, HUD, states, fixed-step loop
│   └── main.js         # bootstrap / wiring
└── README.md
```

**Load order** (in `index.html`): `config → assets → input → world → entities → upgrades → game → main`.

### Rendering
Internal logical resolution is **480×270** (16:9), scaled up to the window with
`image-rendering: pixelated` and `imageSmoothingEnabled = false` for crisp pixels. All game
coordinates are in logical pixels, so placeholder art and future sprite sheets line up 1:1.

### Game loop
Fixed-timestep accumulator (`config.FIXED_DT`) for deterministic physics, rendered on
`requestAnimationFrame`. Pausing freezes the accumulator.

---

## Swapping in real sprite art (later)

Art is intentionally abstracted. Right now `assets.js` registers **procedural** pixel-art
draw functions keyed by name (`jon_idle`, `mook_walk`, `boss`, `water`, …). To move to real
sprite sheets:

1. Drop your PNG sheets in `assets/` (e.g. `assets/jon.png`).
2. In `assets.js`, replace a key's procedural factory with a sheet definition:
   `{ img: 'assets/jon.png', frameW: 32, frameH: 48, anims: { idle:[0,1], walk:[2,3,4,5] } }`.
3. Render code already calls `Assets.draw(ctx, key, frame, x, y, facing)` — no entity changes needed.

Frame sizes, anchors (feet-centered), and animation names are documented inline in `assets.js`.

---

## Roadmap (beyond the slice)

Active planning lives in **`docs/superpowers/plans/`** — executed plans carry STATUS
banners, and `ideas/INDEX.md` is the prioritized backlog (difficulty curve fixes,
Bulwark dome-fortress redesign, boss phase language, in-run boons, hose aspects,
economy/roster passes, settings & accessibility). Longer-term:

- More levels with new backdrops + a level-select / progression map.
- Co-op (second player), more enemy archetypes, mini-bosses.
- Real sprite sheets for the remaining procedural painters (bosses and Jon first).
- Permanent meta-progression via the Church — **deliberately parked** until the game
  is long enough that a fresh-run start stops being the better experience.

---

## Credits
Concept & direction: Etienne. Jon Hose is an affectionate send-up of a co-worker.
Code scaffold generated as a vanilla-JS canvas prototype.
