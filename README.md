# Jon Hose — A Browser Beat 'em Up

A side-scrolling, pixel-art beat 'em up in the spirit of *Battletoads* and *Double Dragon*.
You play **Jon Hose**, a hero strapped into a FLUDD-style hydro-pack. Instead of throwing
punches, Jon blasts foes with a high-pressure water hose. Water is limited, so you manage a
tank that drains as you spray and recharges over time — and you spend the cash dropped by
enemies on upgrades between fights.

> Status: **Live for playtesters (v0.27.x) — 29 waves across five elemental acts**
> (4-4-5-6-6 escalation curve), each capped by a boss with its own distinct dodge:
> **The Big Drip** (step out of ground slams), **The Switch of Doom** (change depth
> lane), **Quake Walker** (dash through shockwaves in the earth-themed rubble),
> **Gateway Krusher 9000**, and **The Slayer** (pool-cue fireballs in the Boiler
> District). Set-pieces along the way: destructible barricade, holdout,
> douse-the-flames, the Garden, ambushes. A full **Hades-style run economy** sits on
> top: XP level-ups, **Benedictions** (24 element boons picked at post-fight sigils),
> a rotating **event shop** (signature builds + relics), rare **super-elites** with
> signature moves, and a death loop through the **Church of the Holy Hose** — pillars
> bought with Holy Essence, a Reliquary that ransoms back your washed boons, and
> Father Jon. The streamlined kit is move + spray + dash (no jump/melee — by design).
> All enemies wear baked pixel-art sprites. Every merge to main is a named release —
> see `CHANGELOG.md`.

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

### Progression — the run economy
- **XP levels** (~13/run): kills grant XP; each level lands instantly with a chime and
  the next step of a fixed stat cycle (damage / max water / HP / range / regen —
  water-weighted, since the dry tank is the early game's wall).
- **Benedictions**: after bosses and set-pieces, three element **sigils** appear —
  choose ONE by walking up (E). 17 boons + 3 duos + 4 legendaries with rank-II
  deepens: scalding sprays, chain streams, projectile-eating dashes, turret stances...
  Death **washes** them into the Church **Reliquary**, where 1 Essence each buys them
  back (rank preserved) — the death loop's real stake.
- **The Church of the Holy Hose**: the walkable death interlude. Four element
  **pillars** (Water open; Earth/Fire/Air sealed behind their nemesis boss) sell
  permanent ranks for **Holy Essence**, which only ever enters via cross pickups.
  Pillar favor pulls that element's boons into your sigil offers. First death per
  run: Father Jon hands you a **50% shop voucher** (the stall's sign always said
  "50% off for church members").
- **Event shop**: Old Spigot appears every third wave with three signature builds
  (Hydro-Dash, Fire-Marshal Spec, Hydro Lance), a rotating 2-of-10 **relic** stock,
  and lifeline consumables.

### Encounters
- **Elites**: later fights spawn tougher gold-bar "elite" enemies, scaled by act and
  by your build. **Super-elites** (late game only, red-framed, ~1.8x giants) each
  carry a signature move — the mook's lunging haymaker, the charger's wall-ricochet,
  the fuse splitting into three live fuses...
- **Wave flow**: a per-act field cap opens each wave; the rest queue and arrive as
  **batch reinforcement surges** (a wave within the wave). **Attack tickets** cap
  simultaneous attackers so crowds stay readable at any size.
- **Set-pieces**: a destructible **barricade** with reinforcements, a 22-second **holdout**, **douse-the-flames** (spray out burning ground), and **the Garden**.
- **GUSH combos**: chained kills pitch-ladder the kill sound and pay out — x3 arms a water-regen window, every 5th milestone scales it further (uncapped) plus a water refund.
- **Death loop**: dying takes Jon through the **Church of the Holy Hose** — a walkable nave interlude — then respawns him at the last touched hydrant. Every boot is a deliberately **fresh run** (no persistent meta-progression yet — that's a design decision, not a gap).
- **Anti-farm**: infinitely-spawning foes (boss summons, barricade reinforcements) share a per-encounter drop budget, so you're rewarded for fighting but can't idle-farm unlimited Suds/health/water.

### Stats & readability
**Tab** shows the full stat sheet anywhere (icons per stat; zero stats hide until
earned). Every stat gain — level, shop, pillar, boon — plays a short upgrade sequence
off Jon with its icon and delta, chiming up a pitch ladder. Fire hazards damage inside
the **exact ellipse they draw** (rim = hitbox, everywhere), and hostile fire patches
burn out on their own after ~7s. Dousing scales with your spray damage.

---

## Architecture

Plain `<script>` files (no modules/bundler) so it runs from `file://` by double-click, while
still being cleanly separated. Everything hangs off a single global namespace `JH`.

```
jon-hose/
├── index.html          # canvas + UI overlays, script load order
├── styles.css          # arcade / CRT styling for shell & overlays
├── js/
│   ├── config.js       # ALL tunables: player, enemies, waves, boons, palette —
│   │                   #   nothing else hardcodes a gameplay constant
│   ├── balance.js      # pure balance math (elite/super scaling, drops) — unit-tested
│   ├── assets.js       # AssetManager: baked sprites + procedural fallbacks + SFX
│   ├── loader.js       # asset preloader gate
│   ├── input.js        # keyboard + gamepad → buffered input state
│   ├── world.js        # depth math, ground-ellipse hit tests, camera, parallax
│   ├── entities.js     # Player, enemies, bosses, projectiles, FirePatch, Sigil
│   ├── benedictions.js # boon defs, offers, wash/reclaim (dual-export for tests)
│   ├── pillars.js      # Church element pillars
│   ├── church.js       # Church meta state + the walkable nave scene
│   ├── upgrades.js     # stat chain: shop → levels → pillars → benedictions
│   ├── game.js         # scene manager, waves/tickets, shop, XP, HUD, fixed-step loop
│   └── main.js         # bootstrap / wiring
├── sprites/            # baked pixel art (some frames HAND-CLEANED — see docs/HANDBOOK.md)
├── tools/              # node bakers that generate sprites/ (never rebake hand-cleaned art)
├── tests/              # node --test suites (npm test)
└── docs/HANDBOOK.md    # design principles, systems map, future vision — read first
```

**Load order** is set in `index.html` (config → balance → assets → … → game → main).

### Rendering
Internal logical resolution is **480×270** (16:9), scaled up to the window with
`image-rendering: pixelated` and `imageSmoothingEnabled = false` for crisp pixels. All game
coordinates are in logical pixels, so placeholder art and future sprite sheets line up 1:1.

### Game loop
Fixed-timestep accumulator (`config.FIXED_DT`) for deterministic physics, rendered on
`requestAnimationFrame`. Pausing freezes the accumulator.

---

## Art pipeline

Jon and **every combat enemy wear baked pixel-art sprites** (`sprites/`), generated by
the node bakers in `tools/` and wired through `registerBaked()` in `assets.js` — each
baked key keeps its procedural painter as a loading fallback. Some frames are
**hand-cleaned and must never be re-baked** (list in `docs/HANDBOOK.md` §5). Bosses:
Switch + Gateway Krusher use baked chassis with runtime LED overlays; the Firewall is
still procedural. When generating new art, size it ~4x+ the logical target — the
480×270 logical space is devicePixelRatio-scaled to the real screen.

---

## Roadmap (beyond the slice)

The forward queue lives in **`docs/HANDBOOK.md` §7** (the committed project
handbook); specs and executed plans live in `docs/superpowers/`. Headlines:

- **Areas & World pass**: between-level area choices (Hades room-choice feel) paired
  with a background/floor art upgrade.
- **The air world**: the Ass Man boss + a new air-themed enemy roster (each act's
  enemies match its boss's element).
- Boss phase language, more levels, co-op — and permanent Church meta-progression,
  **deliberately parked** until the game is long enough that a fresh-run start stops
  being the better experience.

---

## Credits
Concept & direction: Etienne. Jon Hose is an affectionate send-up of a co-worker.
Code scaffold generated as a vanilla-JS canvas prototype.
