# Jon Hose — A Browser Beat 'em Up

A side-scrolling, pixel-art beat 'em up in the spirit of *Battletoads* and *Double Dragon*.
You play **Jon Hose**, a hero strapped into a FLUDD-style hydro-pack. Instead of throwing
punches, Jon blasts foes with a high-pressure water hose. Water is limited, so you manage a
tank that drains as you spray and recharges over time — and you spend the cash dropped by
enemies on upgrades between fights.

> Status: **Playable level.** Two acts capped by distinct bosses — **The Big Drip**
> (telegraphed ground slams) then **The Switch of Doom** (full-width line attacks) —
> with a gentle pyro-introduction wave, an elite-enemy second act, a destructible-barricade
> encounter, the full core loop, a skill-tree shop, HUD, and win/lose flow. Built to be
> extended with more levels, enemies, and real sprite art.

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
| Melee whack       | `K`                     | X                  |
| Dash              | `L` / `Shift`           | B                  |
| Jump              | `I` / `Up`-tap          | Y                  |
| Talk to vendor    | `E` / `Enter`           | —                  |
| Confirm / Pause   | `Enter` / `Esc`         | Start              |

Spraying costs water. When the tank is dry, the hose sputters — fall back on the melee
whack (no water cost, short range) until the tank trickles back up or you grab a pickup.

**Audio:** the title track *Jon Hose Rush* (`audio/jon-hose-rush.mp3`) loops in the
background. Use the **master volume** slider (it also scales SFX) or **mute** on the title
and pause screens — your setting is saved between sessions in `localStorage`. Music starts
on the first key/click (browser autoplay policy).

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
- At **full pressure the hose beats the melee whack** for damage and adds range + knockback, so it's your primary weapon; melee is the free fallback when you're dry.
- The particle stream gets **denser and tighter** as you climb the Pressure skill branch.

### 2.5-D movement
Classic beat 'em up plane: a horizontal axis plus a **depth** axis (move "up/down" the floor).
Attacks connect only when the target is roughly on your depth line, so positioning matters.
Jumping adds a vertical hop for dodging and aerial sprays.

### Enemies (slice)
- **Mook** — walks in, swings melee. Cannon fodder.
- **Charger** — winds up, then rushes; punish the recovery.
- **Pyro** — on fire, ranged embers, but takes **bonus** damage from water (theme hook).
- **Boss: "The Big Drip"** (mid-level) — brute with slam, sweep, and summon attacks. Each strike is **telegraphed**: he rears back and a red danger zone fills in over the exact area he'll hit, so you can read the range and step out (in or out of depth) to dodge. Killing a boss instantly clears any goons he summoned.
- **Final boss: "The Switch of Doom"** — an 8-port network switch with Doc-Ock cable tentacles (Jon Hose cinematic universe lore). Instead of a positional zone, it fires **telegraphed full-width LINE attacks** along a depth row: a red lane lights up, then it strikes across the whole screen. Dodge by moving **up or down a lane** (or jumping over it). When enraged it fires two lanes at once.

### Encounters
- **Elite act 2**: every fight after the first boss spawns tougher "elite" enemies (more HP, damage and speed; marked with a red aura ring).
- **Barricade**: a destructible wall blocks the street while reinforcements keep coming — spray/melee it down, then walk through to the finale.
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

- More levels with new backdrops + a level-select / progression map.
- Co-op (second player), more enemy archetypes, mini-bosses.
- Charged "pressure-blast" special and a soap/ice ammo system.
- Real sprite sheets + animation polish, screen shake/juice, music tracks.
- Save progress (upgrades/score) to `localStorage`.

---

## Credits
Concept & direction: Etienne. Jon Hose is an affectionate send-up of a co-worker.
Code scaffold generated as a vanilla-JS canvas prototype.
