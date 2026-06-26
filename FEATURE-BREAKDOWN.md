# Feature Breakdown: Foraging + The Slayer + Heat Wave Minigame

> Research-only document. No implementation. All file references are to the current codebase.

---

## Table of Contents

1. [Plant Foraging / Revitalization](#1-plant-foraging--revitalization)
2. [The Slayer (New Character)](#2-the-slayer-new-character)
3. [Heat Wave Minigame](#3-heat-wave-minigame)

---

## 1. Plant Foraging / Revitalization

### Concept Summary

Dried-up plants appear randomly across the map during free-walk segments. The player waters them through a multi-step growth mechanic; completing a plant yields a reward. Higher-tier rewards trigger a guardian enemy spawn as a risk/reward gate.

---

### Systems / Scopes Touched

| System | File | Notes |
|--------|------|-------|
| Level config | `js/config.js` | Add `JH.FORAGE` tunables block (spawn count, reward tiers, growth thresholds, guardian trigger threshold) |
| World/spawn placement | `js/world.js` | Add random placement logic for forage plants during level init |
| Entity: ForagePlant | `js/entities.js` | New class; modeled on `GardenBox` (line 1739) — shares water-interaction pattern |
| Enemy spawning | `js/game.js:startWave()` | Guardian spawn call hooks into existing `spawnEnemy()` pattern (line 265) |
| Pickup system | `js/entities.js:995` | Existing `spawnPickup()` covers coin/health/pill rewards; no new infra needed |
| Asset painter | `js/assets.js` | New `"forage_plant"` painter registered via `Assets.register()` (pattern: line 708) |
| HUD / UX | `js/game.js` | Floating prompt text (pattern already in `GardenBox.draw()` lines 1779–1795) |
| SFX | `js/config.js:JH.SFX` | Reuse existing keys (`win`, `coin`, `hurt`) or add `water_pop`, `guardian_warn` entries |

---

### Implementation Tasks (Ordered)

#### Step 1 — Config Tunables
Add `JH.FORAGE` block to `js/config.js` after the `JH.GARDEN` entry (line 173):

```js
JH.FORAGE = {
  spawnCount: 6,          // per level, placed in free-walk zones only
  growMax: 180,           // faster than garden (GardenBox uses 280)
  growthStages: 3,        // dried → sprouting → bloomed
  rewardTiers: [
    { weight: 50, type: "coin",   value: 5  },
    { weight: 30, type: "kibble", value: 25 },
    { weight: 15, type: "coin",   value: 15 },
    { weight: 5,  type: "pill",   value: 1,  guardian: true },
  ],
  guardianType: "charger",   // enemy type spawned on high-tier harvest
  guardianElite: true,
  xMinGap: 300,           // minimum px between plants
  xOffset: [200, 800],    // spawn range within each free-walk zone
};
```

**Complexity:** XS

---

#### Step 2 — World Placement
In `js/world.js` (or `js/game.js` init), scatter `ForagePlant` instances across free-walk segments (between `WAVE_TRIGGERS`, which span 0–7400px). Avoid placing them inside locked-arena x-ranges.

- Reference: `JH.HYDRANTS` array in `js/config.js:28` — same pattern (static x/y array) but randomized at init time using a seeded or plain `Math.random()` spread.
- Plants must not overlap hydrants or each other (enforce `xMinGap`).
- Plants are non-blocking to movement (like hydrants); no collision deflection needed.

**Complexity:** S

---

#### Step 3 — `ForagePlant` Entity Class
New class in `js/entities.js`, placed after `GardenBox` (line 1799). Shares structure with `GardenBox` but adds:

- **Growth stages** (3 discrete visual states, not a continuous bar like `GardenBox`):
  - `stage 0` — dried/brown stalk
  - `stage 1` — sprouting green (reached at 33% `growMax`)
  - `stage 2` — full bloom (reached at 100% `growMax`)
- **Water interaction:** Checked in the hose-hit loop (`entities.js:302`, `HoseBeam` update). Plants need a screen-space proximity check, same as `GardenBox` in `game.js:update()`.
- **`addGrow(amt, game)`** — mirrors `GardenBox.addGrow()` (line 1747). On completion: roll reward tier, call `game.spawnPickup()`, optionally call `game.spawnEnemy()` for guardian.
- **`draw(ctx, cam)`** — reads current `stage`, calls `JH.Assets.draw(ctx, "forage_plant", ...)` with `{ stage }` opt.
- **No growth bar** — stage transitions communicate progress visually instead (avoids HUD clutter across 6 plants).

**Complexity:** M

---

#### Step 4 — Reward Roll + Guardian Spawn
Inside `ForagePlant.addGrow()` on completion:

```js
// Roll weighted reward tier
const tier = rollWeighted(JH.FORAGE.rewardTiers);
game.spawnPickup(tier.type, this.x, this.y, tier.value);
if (tier.guardian) {
  // Spawn elite charger nearby (offset ~60px right, same depth)
  const g = game.spawnEnemy(JH.FORAGE.guardianType, this.x + 60, this.y,
    { elite: JH.FORAGE.guardianElite });
  g.spawnGrace = 0.4;
  game.banner("GUARDIAN AWAKENS!", 1.8);
  game.audio.play("blast");  // existing SFX, reused as warning sting
}
```

- `spawnPickup()` already handles coin/kibble/pill pickup types (`entities.js:995`).
- `spawnEnemy()` already handles elite flag (`entities.js:654`).
- Guardian only spawns outside active wave arenas (plants are free-walk only).

**Complexity:** S

---

#### Step 5 — Hose Interaction Hookup
`GardenBox` water detection lives in `game.js:update()` — it manually checks `game.gardens[]`. Add a parallel check for `game.foragePlants[]`:

```js
// In game.update(), alongside the existing gardens loop:
if (this.player.spraying && this.foragePlants) {
  for (const fp of this.foragePlants) {
    if (!fp.done && Math.abs(fp.x - hoseEndX) < 30 && Math.abs(fp.y - player.y) < 22) {
      fp.addGrow(JH.GARDEN.growMax * 0.6 * dt, this);  // roughly same rate as garden boxes
    }
  }
}
```

Exact hose-end x/y calculation mirrors the existing garden interaction.

**Complexity:** S

---

#### Step 6 — Asset Painter (`forage_plant`)
Register in `js/assets.js` using the `Assets.register()` pattern (line 708). Three stage variants in a single function:

- **Stage 0:** Dried brown stalk + cracked soil (warm browns `#7a5020`, `#3a2010`)
- **Stage 1:** Green shoot emerging, soil moistened (green `#4a7a30`, wet soil `#2a1808`)
- **Stage 2:** Full bloom — flower, leaves, visible fruit/berry cluster (palette: `#5a9a40`, `#fff7a0`, `#cc3333` for berries)

All procedural pixel-rect, consistent with existing painters. No external PNG needed for MVP.

**Complexity:** S

---

#### Step 7 — SFX
Reuse existing keys where possible:

| Event | SFX |
|-------|-----|
| Watering hit | `spray` (already plays) |
| Stage advance | `coin` (pitch +1 octave via `freq` override, or just reuse) |
| Full bloom | `win` (same as GardenBox line 1754) |
| Guardian spawn | `blast` + `shake(6)` |
| Harvest pickup | `coin` / `pill` (existing pickup SFX) |

Add one new entry if a distinct "growth pop" tone is wanted:
```js
growpop: { type: "square", freq: 660, dur: 0.15, gain: 0.11 },
```

**Complexity:** XS

---

### Artwork Required

| Asset | Type | Notes |
|-------|------|-------|
| `forage_plant` (stage 0) | Procedural painter | Dried stalk, cracked soil |
| `forage_plant` (stage 1) | Procedural painter | Sprouting shoot, wet soil |
| `forage_plant` (stage 2) | Procedural painter | Full bloom, berries/fruit visible |
| Guardian alert particle burst | Reuse `burst()` | Red/orange color, existing function |
| Stage-advance particle pop | Reuse `burst()` | Green sparks, small radius |
| "GUARDIAN AWAKENS!" banner | Text only | Existing `game.banner()` system |

No external PNG files required for MVP — all procedural. Optionally add a `sprites/environment/forage-plant.png` atlas later for higher fidelity.

---

### Dependencies

- No new systems required; all hooks exist.
- `GardenBox` and `spawnPickup()` must remain stable (no refactors that break their interfaces).
- Guardian spawn depends on `spawnEnemy()` accepting `{ elite }` option — already supported (line 273).

---

### Estimated Complexity

| Task | Size |
|------|------|
| Config tunables | XS |
| World placement | S |
| `ForagePlant` entity class | M |
| Reward roll + guardian spawn | S |
| Hose interaction hookup | S |
| Asset painter (3 stages) | S |
| SFX | XS |
| **Total** | **M–L** |

One developer, est. 1–2 focused sessions. The `GardenBox` precedent covers ~60% of the logic; the main new work is the growth-stage visual system and the reward-tier roller.

---

---

## 2. The Slayer (New Character)

### Concept Summary

Fire-element character, leather-clad, shoots flaming pool balls. Introduced as a boss fight; after defeat he joins the squad via the same narrative cutscene + banner pattern as Quake Walker. Fills the fire element slot in the planned elemental shrine system.

> **Note on "Ass Man":** No character by this name exists in the current codebase. Quake Walker (`js/config.js:192`, `js/game.js:286`) is the only implemented boss-to-ally. "Ass Man" appears to be a third planned ally; The Slayer would be the second. This breakdown documents The Slayer in isolation.

---

### Systems / Scopes Touched

| System | File | Notes |
|--------|------|-------|
| Boss config | `js/config.js` | New `JH.SLAYER` block, `JH.FIREBALL` projectile config |
| Wave sequence | `js/config.js:JH.LEVEL1.waves` | Insert Slayer boss wave; renumber subsequent wave triggers |
| `WAVE_TRIGGERS` | `js/game.js:12` | Add new trigger x-position; shift downstream triggers |
| Entity: SlayerBoss | `js/entities.js` | New boss class; models on `QuakeWalker` (line 1419) |
| Fireball projectile | `js/entities.js` | New projectile class; models on `Ember` (line 838) with fire trail |
| Cutscene system | `js/game.js:286–336` | Add Slayer cutscene branch parallel to Quake Walker branch |
| `afterCutscene()` | `js/game.js:324` | Extend to handle Slayer's wave index + banner text |
| Cutscene draw | `js/game.js:338` | Add Slayer portrait data to `drawCutscene()` |
| Asset painter | `js/assets.js` | `"slayer"` character painter; `"fireball"` projectile painter |
| Sprite sheet | `sprites/slayer/` | New directory; frames: idle, walk0–3, throwWind, throwRelease |
| Portrait | `sprites/` | `slayer_portrait.jpg` + `slayer_portrait_mouthopen.jpg` |
| Elemental shrine | Future system | Slot reservation only; no shrine system exists yet |
| SFX | `js/config.js:JH.SFX` | Add `fireball`, `ignite`, `slam` entries |
| Music | `audio/` | Boss fight reuses existing `audio/jon-hose-rush.mp3`; new track optional |

---

### Implementation Tasks (Ordered)

#### Step 1 — Config Block
Add `JH.SLAYER` and `JH.FIREBALL` to `js/config.js` after `JH.QUAKE` (line 198):

```js
JH.SLAYER = {
  name: "The Slayer", hp: 1100, speed: 26, bodyW: 44, bodyH: 58,
  touchDmg: 15, contactCd: 0.9, suds: 280, color: "slayerBody",
  // Melee: leather-gloved haymaker
  slamDmg: 22, slamRange: 38, slamWind: 0.75,
  // Ranged: flaming pool-ball throw
  throwWind: 0.9, throwCd: 2.2, throwCount: 2,  // throws 2 per volley
  enrageAt: 0.42,
};
JH.FIREBALL = {
  speed: 145, dmg: 12, radius: 14,
  fireDmg: 8,           // burn-tick damage (future DoT system hook)
  lifespan: 2.4,
};
```

Add palette entries in `JH.PALETTE` for `slayerBody` (dark leather brown + ember glow rim).

**Complexity:** XS

---

#### Step 2 — Insert Wave Into Sequence
The Slayer boss fight should land between the current Act 3 and the Quake Walker encounter, or as a new Act. Proposed placement: insert after `RUBBLE ROW` (current index 8) and before `QUAKE WALKER` (currently index 9). This shifts Quake Walker to index 10 and all subsequent waves by 1.

In `js/config.js:JH.LEVEL1.waves`:
```js
{ name: "THE SLAYER", boss: true, bossType: "slayer" },
```

In `js/game.js:startWave()` (line 262), extend the bossType switch:
```js
const bdef = bt === "slayer" ? JH.SLAYER
           : bt === "switch" ? JH.SWITCH
           : bt === "quake"  ? JH.QUAKE
           : bt === "gk9000" ? JH.GK9000 : JH.BOSS;
```

Update `WAVE_TRIGGERS` (line 12) with a new x-position and shift all downstream values.

Update the Quake Walker cutscene branch (line 286) from `waveIndex === 9` to the new Quake index.

**Complexity:** S — mechanical but requires careful index bookkeeping across `WAVE_TRIGGERS` and `afterCutscene()`.

---

#### Step 3 — `SlayerBoss` Entity Class
New class in `js/entities.js`, placed after `QuakeWalker` (line 1611). Pattern: mirror `QuakeWalker`'s structure.

**Attack kit:**

1. **Slam** (melee, close-range): leather-gloved punch, same zone-telegraph pattern as `BigDrip.slam()` (entities.js ~line 920). Wind-up red danger zone around his feet.

2. **Fireball volley** (ranged): throws 1–2 flaming pool balls per attack. Each `Fireball` projectile travels horizontally at the player's depth row. On enrage (<42% HP): 3 balls per volley, tighter stagger.

3. **Fire dash** (on enrage only): short horizontal burst (echoes `Player.dash()` concept) closing distance before a slam. Visual: flame streak behind him during dash.

**State machine:** mirrors `QuakeWalker` — `idle → windUp → attack → recover → idle`. Enrage triggers at `JH.SLAYER.enrageAt`.

**Hurt flash:** standard `hurt` flag pattern (existing on all bosses).

**Death:** `game.spawnCoinFountain()` + transition to cutscene (new Slayer cutscene branch).

**Complexity:** L — largest task. Boss AI with 3 attacks + enrage is the heaviest single item.

---

#### Step 4 — `Fireball` Projectile Class
New class in `js/entities.js`, modeled on `Ember` (line 838). Key differences from `Ember`:

- **Visual:** larger (8–10px), animated fire flicker (alternate between two warm palettes per frame: `#ff6010` / `#ffcc00`), with a trailing particle ribbon.
- **Trajectory:** flat horizontal travel at fixed depth (no parabolic arc — pool balls roll hard and fast). Optionally add slight Z-bobble for visual interest.
- **Hit radius:** 14px (larger than Ember's 12px).
- **Fire trail:** on each update, emit 1–2 `burst()` particles (`#ff8030`, tiny, life 0.08s) at current position.
- **Impact:** on player hit, plays `ignite` SFX and shakes camera (`game.shake(3)`).
- **Future DoT hook:** store `fireDmg` on hit for when a burn/DoT system exists; no-op for now.

```js
class Fireball {
  constructor(x, y, dir, game) {
    this.x = x; this.y = y; this.z = 8; // slight air height
    this.dir = dir; // -1 or 1
    this.vx = JH.FIREBALL.speed * dir;
    this.life = JH.FIREBALL.lifespan;
    this.dmg = JH.FIREBALL.dmg;
    this.radius = JH.FIREBALL.radius;
    this.t = 0;
  }
  // update(), draw() — mirrors Ember
}
```

**Complexity:** M

---

#### Step 5 — Slayer Cutscene
The existing cutscene system in `js/game.js:286–423` is fully parameterized around a single `this.cutscene` object and portrait data. Adding The Slayer requires:

**5a. Trigger branch** in `waveCleared_()` (line 281):
```js
if (this.waveIndex === SLAYER_WAVE_INDEX) {
  JH.Camera.unlock();
  this.state = "cutscene";
  this.cutscene = { phase: 0, nextWave: SLAYER_WAVE_INDEX + 1, character: "slayer" };
  // hide HUD/banner same as Quake pattern (lines 291–292)
  return;
}
```

**5b. Dialogue lines** (3 phases, matching Quake Walker's 3-phase structure):
```
Phase 0: "You fight with more fire than I expected. / Heh."
Phase 1: "I've been burning this whole city down. / For what?"
Phase 2: "...You. I'll follow your lead. / Let's finish this."
```

**5c. Portrait integration** in `drawCutscene()` (line 338): add a `character === "slayer"` branch that loads `slayer_portrait.jpg` / `slayer_portrait_mouthopen.jpg` (same 96×108px format as Quake Walker portraits).

**5d. `afterCutscene()` extension** (line 324): add Slayer-specific banner text:
```js
this.banner("THE SLAYER JOINS YOUR SIDE!", 2.4);
```

**Complexity:** M — the system is well-established; it's mostly content authoring + portrait art.

---

#### Step 6 — Asset Painters (Procedural)

**`"slayer"` character painter** (`js/assets.js`):
- Leather-clad silhouette (dark brown `#3a2010`, `#5a3018`)
- Flame-tipped collar/shoulders (small `#ff6010` accents at shoulder line)
- Pool cue or cue-ball in hand (white `#f0f0f0` circle, 4px radius)
- Walk cycle: 4 frames (same cadence as Quake Walker's 4-frame walk in `quake-frames.js`)
- States needed: `idle`, `walk0–3`, `throwWind`, `throwRelease`

**`"fireball"` projectile painter**:
- Core: 8×8 white-hot circle (`#fff0c0`)
- Outer ring: alternating `#ff6010` / `#ffcc00` per frame tick
- No separate PNG needed at MVP

**Complexity:** M — character painter with 6 frame states is more work than a single-state prop.

---

#### Step 7 — Sprite Sheet (Production Art)
When moving from procedural to final art, create `sprites/slayer/` directory following the `/sprites/jon/` and `/sprites/neighbor/` naming patterns:

```
sprites/slayer/
├── idle.png
├── walk0.png, walk1.png, walk2.png, walk3.png
├── throw-wind.png
├── throw-release.png
└── Slayer.aseprite        # source file
```

Update `js/assets.js` with spritesheet loader (pattern: `quake-frames.js`).

Register frame data in a new `slayer-frames.js` following the structure of `quake-frames.js`.

**Complexity:** L — art-heavy, but pipeline is established.

---

#### Step 8 — Portrait Art
Two JPGs at ~200×230px (same format as `quake_walker_portrait.jpg`):

- `slayer_portrait.jpg` — neutral/stern expression
- `slayer_portrait_mouthopen.jpg` — speaking expression

Used exclusively in `drawCutscene()` at `game.js:338`.

**Complexity:** S (art production only; wiring is 2 lines of code)

---

#### Step 9 — Elemental Shrine Slot Reservation
No shrine system currently exists. The fire slot for The Slayer should be reserved as a comment/stub:

```js
// js/config.js
JH.ELEMENTS = {
  fire:  { ally: "slayer",  unlocked: false },  // The Slayer
  water: { ally: null,      unlocked: false },  // TBD
  earth: { ally: null,      unlocked: false },  // TBD
  // ...
};
```

No mechanical implementation yet — this is a placeholder to inform future shrine design.

**Complexity:** XS (stub only)

---

#### Step 10 — SFX
Add to `js/config.js:JH.SFX`:

```js
fireball: { type: "saw",    freq: 80,  dur: 0.22, gain: 0.14 },  // throw whoosh
ignite:   { type: "noise",  freq: 0,   dur: 0.18, gain: 0.12 },  // impact crackle
```

Slam attack reuses existing `blast` SFX. Dash reuses `jump`.

**Complexity:** XS

---

### Artwork Required

| Asset | Type | Format | Notes |
|-------|------|--------|-------|
| Slayer character (6 states) | Procedural painter OR sprite sheet | `sprites/slayer/*.png` | walk0–3, idle, throw wind-up, throw release |
| Fireball projectile | Procedural painter | Inline in `assets.js` | Animated 2-frame fire flicker |
| Fire trail particles | Reuse `burst()` | — | Orange/red, small, short-lived |
| Slayer portrait (neutral) | JPG | `sprites/slayer_portrait.jpg` | ~200×230px, same as Quake Walker |
| Slayer portrait (speaking) | JPG | `sprites/slayer_portrait_mouthopen.jpg` | Same format |
| Fire-dash streak effect | Procedural particles | — | Horizontal flame ribbon, 0.18s |
| "THE SLAYER JOINS YOUR SIDE!" | Text banner | — | Existing `game.banner()` system |
| Fireball impact burst | Reuse `burst()` | — | White-hot core → orange spread |

---

### Dependencies

| Dependency | Status |
|------------|--------|
| Boss entity pattern (`QuakeWalker`) | Exists — `entities.js:1419` |
| Cutscene system | Exists — `game.js:286–423`, parameterized and reusable |
| `spawnEnemy()` with bossType dispatch | Exists — `game.js:262`, needs one new branch |
| `afterCutscene()` banner system | Exists — `game.js:324`, needs Slayer branch |
| `Ember` projectile pattern | Exists — `entities.js:838`, template for `Fireball` |
| `burst()` particle helper | Exists — used extensively across `entities.js` |
| Portrait JPG loading | Exists — `assets.js` image preload pattern |
| `WAVE_TRIGGERS` array | Exists — `game.js:12`, must be extended by 1 entry |
| Elemental shrine system | **Does not exist** — Slayer fills the narrative slot; shrine mechanics are future scope |

---

### Estimated Complexity

| Task | Size |
|------|------|
| Config block (`JH.SLAYER`, `JH.FIREBALL`) | XS |
| Wave sequence insertion + index bookkeeping | S |
| `SlayerBoss` entity (3 attacks + enrage) | L |
| `Fireball` projectile class | M |
| Cutscene integration (5 sub-tasks) | M |
| Asset painters (character + projectile) | M |
| Sprite sheet (production art) | L |
| Portrait art (2 JPGs) | S |
| Elemental shrine stub | XS |
| SFX | XS |
| **Total** | **XL** |

The Slayer is roughly 2–3× the scope of Plant Foraging. The boss AI (`SlayerBoss`) and production art (sprite sheet + portraits) are the dominant items. The cutscene and wave-wiring are mechanical but low-risk given the Quake Walker precedent.

---

---

---

## 3. Heat Wave Minigame

### Concept Summary

A scripted wave event where combat stops and the stakes flip: instead of fighting enemies, Jon Hose must cool down overheating civilians scattered across the arena before they pass out. Pure water-management puzzle — the hose tank becomes the core constraint.

---

### Systems / Scopes Touched

| System | File | Notes |
|--------|------|-------|
| Wave config | `js/config.js` | New `JH.HEATWAVE` tunables block; new `{ heatwave: true }` wave entry in `JH.LEVEL1.waves` |
| Wave dispatch | `js/game.js:startWave()` | Add `heatwave` branch (line 239+), parallel to existing `garden` branch |
| Entity: `OverheatNPC` | `js/entities.js` | New class; inverse of `GardenBox` — heat resource depletes over time instead of building up |
| Hose interaction | `js/game.js:update()` | Same proximity + spray check as garden boxes; spraying an NPC replenishes their cool meter |
| Pickup system | `js/entities.js:995` | Rescued NPCs drop coins/health; no new pickup types needed |
| Asset painter | `js/assets.js` | `"overheating_npc"` painter with heat-state visual variants; registers via `Assets.register()` |
| HUD / UX | `js/game.js` | Survivor count banner; per-NPC overhead heat bar (mirrors `GardenBox` growth bar) |
| SFX | `js/config.js:JH.SFX` | Reuse `win` on rescue; add `sizzle` (noise burst) and `faint` entries |

---

### Implementation Tasks (Ordered)

#### Step 1 — Config Tunables
Add `JH.HEATWAVE` block to `js/config.js` after `JH.GARDEN` (line 173):

```js
JH.HEATWAVE = {
  npcCount: 5,            // civilians on screen at once
  heatMax: 100,           // full heat = pass out
  heatRate: 8,            // heat units per second (passive)
  coolRate: 55,           // heat removed per second while being sprayed
  rescueWindow: 0.5,      // seconds at heatMax before NPC faints (grace period)
  faintPenalty: 15,       // HP cost to Jon when an NPC faints
  passThreshold: 3,       // NPCs saved to clear the wave
  bonusThreshold: 5,      // save all 5 for bonus reward
  spawnStagger: 0.6,      // seconds between each NPC entering the arena
};
```

**Complexity:** XS

---

#### Step 2 — Wave Entry
Insert into `JH.LEVEL1.waves` in `js/config.js` — best placed between WAVE 6 and THE GARDEN (Acts 4), giving the player a breather between combat waves and the existing garden event:

```js
{ name: "HEAT WAVE", heatwave: true },
```

Shift `WAVE_TRIGGERS` in `js/game.js:12` by one entry to account for the new wave position.

**Complexity:** XS — same index-bookkeeping as any new wave insertion.

---

#### Step 3 — Wave Dispatch in `startWave()`
In `js/game.js:startWave()` (line 239), add a `heatwave` branch alongside the existing `garden` branch:

```js
if (wave.heatwave) {
  this.heatNpcs = [];
  for (let i = 0; i < JH.HEATWAVE.npcCount; i++) {
    setTimeout(() => {
      const x = left + 40 + Math.random() * (right - left - 80);
      const y = JH.DEPTH_MIN + 10 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 20);
      this.heatNpcs.push(new JH.OverheatNPC(x, y, i));
    }, i * JH.HEATWAVE.spawnStagger * 1000);
  }
  this.heatSaved = 0;
  this.heatFailed = 0;
  this.banner("COOL THEM DOWN!", 2.2);
}
```

Wave clears when `heatSaved >= JH.HEATWAVE.passThreshold` (checked in `update()`). If all 5 fail, wave still clears but Jon takes accumulated faint penalties and no bonus.

**Complexity:** S

---

#### Step 4 — `OverheatNPC` Entity Class
New class in `js/entities.js` after `GardenBox` (line 1799). Key inversion from `GardenBox`: heat builds passively and spray reduces it, rather than the reverse.

```js
class OverheatNPC {
  constructor(x, y, idx) {
    this.x = x; this.y = y; this.z = 0;
    this.idx = idx;
    this.heat = 0;                          // starts cool
    this.heatMax = JH.HEATWAVE.heatMax;
    this.fainted = false; this.rescued = false;
    this.faintGrace = 0;                    // countdown after hitting heatMax
    this.bodyW = 14; this.t = 0;
    this.sprayFx = 0;                       // visual flash when being cooled
  }

  update(dt, game) {
    if (this.fainted || this.rescued) return;
    this.t += dt;
    this.heat = Math.min(this.heatMax, this.heat + JH.HEATWAVE.heatRate * dt);
    if (this.sprayFx > 0) this.sprayFx -= dt;

    if (this.heat >= this.heatMax) {
      this.faintGrace -= dt;
      if (this.faintGrace <= 0) this.faint(game);
    } else {
      this.faintGrace = JH.HEATWAVE.rescueWindow;  // reset grace while heat < max
    }
  }

  cool(amt, game) {
    if (this.fainted || this.rescued) return;
    this.heat = Math.max(0, this.heat - amt);
    this.sprayFx = 0.1;
    if (this.heat <= 0) this.rescue(game);
  }

  rescue(game) {
    this.rescued = true;
    game.heatSaved++;
    game.audio.play("win"); game.shake(3);
    burst(game, this.x, this.y, 16, "#6cd3ff", 14, { speed: 70, life: 0.6, up: 50 });
    game.spawnPickup("coin", this.x, this.y, 10);
    if (game.heatSaved >= JH.HEATWAVE.passThreshold) game.checkHeatwaveCleared();
  }

  faint(game) {
    this.fainted = true;
    game.heatFailed++;
    game.player.takeDmg(JH.HEATWAVE.faintPenalty, game);
    game.audio.play("hurt");
    // Fainted NPC slumps — visual handled in draw() via fainted flag
    game.checkHeatwaveCleared();
  }
}
JH.OverheatNPC = OverheatNPC;
```

**Complexity:** M

---

#### Step 5 — Hose Interaction Hookup
In `game.js:update()`, alongside the gardens loop, add heat NPC cooling:

```js
if (this.player.spraying && this.heatNpcs) {
  for (const npc of this.heatNpcs) {
    if (!npc.rescued && !npc.fainted) {
      const dx = Math.abs(npc.x - hoseEndX);
      const dy = Math.abs(npc.y - this.player.y);
      if (dx < 28 && dy < 20) {
        npc.cool(JH.HEATWAVE.coolRate * dt, this);
      }
    }
  }
}
```

Uses existing hose-end x/y from the spray loop. No new infrastructure.

**Complexity:** S

---

#### Step 6 — Wave Clear Logic
Add `checkHeatwaveCleared()` to the game object:

```js
checkHeatwaveCleared() {
  const allDone = this.heatNpcs.every(n => n.rescued || n.fainted);
  if (!allDone) return;
  if (this.heatSaved >= JH.HEATWAVE.bonusThreshold) {
    this.banner("PERFECT RESCUE! +40 SUDS BONUS", 2.5);
    this.spawnPickup("coin", this.player.x, this.player.y - 20, 40);
  } else if (this.heatSaved >= JH.HEATWAVE.passThreshold) {
    this.banner(`${this.heatSaved}/5 COOLED — WAVE CLEAR!`, 2.0);
  } else {
    this.banner("WAVE CLEAR — NEXT TIME SAVE MORE.", 2.0);
  }
  this.waveCleared_();
}
```

**Complexity:** XS

---

#### Step 7 — Asset Painter (`overheating_npc`)
Register in `js/assets.js` using `Assets.register()` pattern (line 708). Three visual states driven by `opt.heatFrac` (0.0 = cool, 1.0 = about to faint):

- **Cool (0–0.4):** Standing civilian, relaxed pose. Neutral skin tones, light clothing.
- **Hot (0.4–0.8):** Flushed face (`#e06050`), slouched, sweat drops (animated, `#6cd3ff`).
- **Critical (0.8–1.0):** Deep red face (`#cc2020`), knees buckling (1px lower), heat shimmer particles above head.
- **Fainted:** Slumped on ground (rotated/flattened rect), grey tone.
- **Rescued:** Brief star-burst replaced by cool blue glow, then removed from scene.

Sweat drops: 2–3 small blue pixels at randomized offsets from face, animated via `Math.sin(t * 8)` bob.

**Complexity:** S

---

#### Step 8 — Per-NPC Overhead Heat Bar
In `OverheatNPC.draw()`, mirror the `GardenBox` growth bar (entities.js:1773) but color shifts from blue → yellow → red as heat rises:

```js
const hf = this.heat / this.heatMax;
const barColor = hf < 0.5 ? "#44aaff"
               : hf < 0.8 ? "#ffcc00"
               : "#ff3300";
// Draw 28px wide bar above NPC head, fill left-to-right with hf
```

Add a pulsing glow on the bar when `hf > 0.8` (use `Math.sin(t * 10)` alpha oscillation).

**Complexity:** XS

---

#### Step 9 — SFX
Add to `js/config.js:JH.SFX`:

```js
sizzle: { type: "noise", dur: 0.12, gain: 0.09 },   // NPC hitting heatMax
faint:  { type: "saw",   freq: 80,  dur: 0.3,  gain: 0.13 },  // NPC passes out
```

Rescue reuses `win`. Spray-on-NPC reuses `spray` (already plays during hose use).

**Complexity:** XS

---

### Artwork Required

| Asset | Type | Notes |
|-------|------|-------|
| `overheating_npc` (cool state) | Procedural painter | Neutral civilian silhouette |
| `overheating_npc` (hot state) | Procedural painter | Flushed face, sweat drops, slouch |
| `overheating_npc` (critical state) | Procedural painter | Deep red, knees buckling, shimmer |
| `overheating_npc` (fainted state) | Procedural painter | Slumped flat on ground |
| Rescue burst | Reuse `burst()` | Blue water-color particles |
| Heat shimmer | Procedural particles | Wavy heat-distortion dots above head |
| Survivor count HUD | Text only | "COOLED: 3/5" via existing banner system |
| "COOL THEM DOWN!" banner | Text only | Existing `game.banner()` |

All procedural — no external PNGs required.

---

### Design Notes

**Why this works mechanically:** The hose tank (36 units/sec drain) becomes a triage puzzle. With 5 overheating NPCs and limited water, the player must prioritize who to cool first based on heat bars. Kinetic Tap and Closed Loop upgrades (existing upgrade tree) become directly relevant — moving between NPCs triggers Kinetic Tap's regen bonus, and cooling an NPC triggers Closed Loop's drain reduction.

**Tonal fit:** Pure service-to-community moment — contrasts with combat waves, rewards the water-hose-as-tool fantasy rather than weapon fantasy. Fits the game's tone well.

**Scalable difficulty hooks (future):** NPCs could move around (wandering civilians), some could block the hose line of sight (crowds), or a Pyro enemy could appear mid-event re-heating cooled NPCs.

---

### Dependencies

- All hooks exist; no new systems required.
- `GardenBox` interaction pattern (water-proximity check in `game.js:update()`) must remain stable.
- `spawnPickup()` and `burst()` unchanged.
- Wave index bookkeeping must account for this new wave alongside any Slayer insertion.

---

### Estimated Complexity

| Task | Size |
|------|------|
| Config tunables | XS |
| Wave entry + trigger shift | XS |
| Wave dispatch (`startWave()` branch) | S |
| `OverheatNPC` entity class | M |
| Hose interaction hookup | S |
| Wave clear logic | XS |
| Asset painter (4 states) | S |
| Per-NPC heat bar | XS |
| SFX | XS |
| **Total** | **M** |

Smallest of the three banked features. The `GardenBox` → `OverheatNPC` inversion covers most of the logic; the main new work is the multi-NPC triage mechanic and the heat-state visual progression.

---

---

## Cross-Feature Notes

- All three features are **independently shippable** — no shared dependencies between them.
- Plant Foraging and Heat Wave can ship without touching the wave sequence at all if placed in free-walk zones; The Slayer requires careful wave-index surgery.
- If The Slayer ships first, confirm Quake Walker's cutscene trigger index (`game.js:286`) is updated to match the shifted wave positions before merging.
- Heat Wave and Plant Foraging both use the same hose-proximity interaction pattern — if that loop is ever refactored, update both.
- The procedural-art-first approach (no PNG required at MVP) applies to all three features and matches the existing fallback pattern throughout `assets.js`.
