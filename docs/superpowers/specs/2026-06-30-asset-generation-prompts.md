# Asset-Generation Prompts — Next-Level Content

**Date:** 2026-06-30
**Scope:** Every missing asset for the next-level work (Mirror chamber, the Slayer,
Ass Man finishing, new enemies, Act 3/4 biome backdrops). Prompts are written for
the project's two backends — `node tools/imagen-gen.mjs <key>` (Gemini, magenta-bg)
and the agent-sprite-forge magenta pipeline (`sprite-forge` skill).
**Pipeline note:** all subjects on **solid magenta `#FF00FF`**, **thick 2px black
outline**, **no shadows / flat lighting**, low-res pixel art (canvas is 480×270),
limited palette matching `JH.PAL`. Generate 3–4× then downscale.

**Append this suffix to every prop/character prompt:**
> `— 2D pixel-art game sprite, crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette (16–32 colors), single subject centered with clear margin, on a FLAT SOLID magenta (#FF00FF) background for cutout, no text, no drop shadow, must read at very low resolution.`

`✅ already exists` · `🔲 generate` · `⚙️ needs code wiring after art lands`

---

## 1. Elemental Mirror chamber (Pillar 1 — building now)

The sub-chamber Quake's redemption opens. Files land in `sprites/church/` and blit
via `JH.ChurchArt` (procedural fallback until present).

| State | File | ~Logical px | 🔲/✅ | Prompt |
|---|---|---|---|---|
| Chamber backdrop | `mirror_backdrop.png` | 480×270 (opaque) | 🔲 | A deeper, darker sub-crypt beneath the Church of the Holy Hose: a circular stone chamber, four tall elemental pillars around a central reflecting water-font (the "Mirror"), faint cyan godrays from above, flooded floor with still reflective water. Sacred, mysterious, dim. Stone `#0a0c14`/`#11141f`, cyan holy light `#6cd3ff`/`#d6f6ff`. |
| Mirror font (centerpiece) | `mirror_font.png` | ~40×44 | 🔲 | A sacred reflecting font/basin of still glowing holy water on a carved dark-stone plinth — the Mirror of the Hose where blessings are chosen. Cyan light `#6cd3ff` rising from the surface, brass rim `#ffd23f`, dark stone `#11141f`. |
| Earth pillar — dim | `pillar_earth_dim.png` | ~24×64 | 🔲 | A tall narrow carved stone pillar with an earth/stone emblem (cracked boulder, fault lines), dormant and unlit, cold grey weathered stone, no glow. |
| Earth pillar — lit | `pillar_earth_lit.png` | ~24×64 | 🔲 | The same earth pillar awakened: amber-orange glow `#e0902f` pouring from the cracked-stone emblem, illuminated rock, rising motes. |
| Fire pillar — dim/lit | `pillar_fire_dim.png` / `pillar_fire_lit.png` | ~24×64 | 🔲 | Same pillar form, flame/ember emblem. Lit = ember-orange glow `#ff8a3c`. |
| Air pillar — dim/lit | `pillar_air_dim.png` / `pillar_air_lit.png` | ~24×64 | 🔲 | Same pillar form, swirling-wind/cloud emblem. Lit = pale white-cyan glow `#cfe9ff`. |
| Water pillar — dim/lit | `pillar_water_dim.png` / `pillar_water_lit.png` | ~24×64 | 🔲 | Same pillar form, water-droplet/hose emblem. Lit = cyan glow `#6cd3ff`. (Water lit from start.) |
| Stairwell / door | `mirror_stair.png` | ~28×48 | 🔲 | A descending stone stairwell archway off the nave, glowing faintly cyan, leading down — sealed look when Earth is unlocked it opens. |

## 2. Still-missing wired church props (404 today)

These are referenced by `JH.ChurchArt` right now and fail to load (procedural
fallback shows). `altar`/`shrine_*`/`portal` are still wanted; the three flat
`station_*` sprites become **deprecated** once the Mirror replaces stations.

| File | 🔲/✅ | Note |
|---|---|---|
| `altar.png` | 🔲 | Gemini prompt already in `imagen-gen.mjs` (`church.altar`) and the 2026-06-29 church asset list. Two `church_altar_gemini_*` candidates exist under `sprites/church/gen/` — just cut & drop in. |
| `shrine_dim.png` / `shrine_lit.png` | 🔲 | Generic locked/awakened niche — prompts in the 2026-06-29 church asset list §"Wired now". |
| `portal.png` | 🔲 | Return rift — prompt in the 2026-06-29 church asset list. |
| `station_dmg/water/hp.png` | ⚙️ DEPRECATED | The Mirror replaces flat blessing stations; no longer needed unless we keep a quick nave sink. Skip. |

## 3. The Slayer — Fire ally (Act 3 boss)

Leather-clad, throws flaming pool balls. Boss→ally like Quake. Sheet → `sprites/slayer/`.
Add a `slayer` entry to `imagen-gen.mjs` `CHARACTER_PROMPTS` (done in this branch).

| Asset | File | 🔲 | Prompt |
|---|---|---|---|
| Character sheet | `sprites/slayer/{idle,walk0-3,throw_wind,throw_release,hurt}.png` | 🔲 | Pixel-art game sprite, ~58px tall, of "The Slayer": a lean menacing brawler in dark leather (jacket `#3a2010`, straps), flame-tipped collar/shoulders (ember accents `#ff6010`), holding a glowing cue-ball. States — idle (weight on back foot, smirking), 4-frame walk cycle, throw wind-up (cue-ball drawn back behind shoulder), throw release (arm extended forward, ball leaving hand), hurt recoil. Facing right. |
| Fireball projectile | `sprites/slayer/fireball.png` | 🔲 | A flaming pool/cue ball projectile: white-hot core `#fff0c0`, alternating ember ring `#ff6010`/`#ffcc00`, short fire trail. ~10px. (2-frame flicker.) |
| Portrait (neutral) | `sprites/slayer_portrait.jpg` | 🔲 | Codec-style dialogue bust of The Slayer, stern/cocky, dark leather, ember rim-light. ~200×230, opaque, MGS-codec framing. (Match `quake_walker_portrait.jpg`.) |
| Portrait (talking) | `sprites/slayer_portrait_mouthopen.jpg` | 🔲 | Same bust, mouth open mid-speech. |

## 4. Ass Man — Air ally (Act 4 boss)

✅ Base sprite art exists (`sprites/assman/ass-man.png`, `ass-man-quantized.png`) and
an `assman` entry is already in `imagen-gen.mjs`. Still missing:

| Asset | File | 🔲 | Prompt |
|---|---|---|---|
| Walk/attack sheet (if not yet sliced) | `sprites/assman/{idle,walk0-3,attack_wind,attack_hit,hurt}.png` | 🔲 | Use the existing `imagen-gen.mjs` `assman` states (idle/walk/attack_wind/attack_hit/hurt) — run `node tools/imagen-gen.mjs assman` and slice. |
| Portrait (neutral) | `sprites/assman_portrait.jpg` | 🔲 | Codec-style bust of "Ass Man": costumed superhero, dark navy suit, gold belt/gloves, flowing cape, confident grin. ~200×230 opaque. |
| Portrait (talking) | `sprites/assman_portrait_mouthopen.jpg` | 🔲 | Same, mouth open. |
| Gust FX | `sprites/assman/gust_0-3.png` | 🔲 | A horizontal wind-gust shockwave: pale curved air-streak crescents `#cfe9ff`/white, 4 expanding frames, semi-transparent. (Pushes Jon.) |

## 5. New enemies

Heights ~28–34px. Sheet per enemy → `sprites/<name>/`. Each needs at least
`idle, walk0-3, attack` (+ a clear **tell/telegraph** frame where noted). Add each
as an `imagen-gen.mjs` key.

| Enemy | Element/act | File dir | 🔲 | Prompt + tell |
|---|---|---|---|---|
| **Bulwark** | Act 2+ (super-elite) | `sprites/bulwark/` | 🔲 | A slow heavy armored brute carrying a large **front riot-shield**; bulky, ~34px. Distinct **shield-facing** read (shield clearly on one side). States: idle, walk0-3, slow-turn (mid-pivot frame — the flank window), shield-bash. Heavy iron `#5a5f68`, rivets. |
| **Stalker** | Act 4 (super-elite) | `sprites/stalker/` | 🔲 | A fast lean shadowy harasser, ~30px, wraith-like cloak. States: idle, walk0-3, **blink-tell** (crouched, glowing outline — telegraph), strike (lunging claw/jab). Dark `#2a2336` with cyan blink-glow `#6cd3ff`. |
| **Cinder Imp** | Fire (Act 3) | `sprites/cinder_imp/` | 🔲 | A small fast swarm imp wreathed in embers, ~26px. States: idle, scurry0-3, ignite-lunge. Charcoal body `#2a1810`, ember glow `#ff6010`. Reads as a fast crowd unit. |
| **Slag Bloater** | Fire (Act 3) | `sprites/slag_bloater/` | 🔲 | A slow bloated lava-tank enemy, ~34px, cracked molten skin glowing through. States: idle, lumber0-3, swell (pre-burst tell). Blackened crust `#1a0f0a`, lava cracks `#ff7a1a`. Bursts into a puddle on death. |
| **Drifter** | Air (Act 4) | `sprites/drifter/` | 🔲 | A floating airborne enemy hovering at head-height, ~28px, balloon/jelly-fish-like with trailing wisps. States: hover0-3 (bob), dive-attack. Pale `#cfe9ff`, translucent look. Dodges ground-level spray. |
| **Gust Sprite** | Air (Act 4) | `sprites/gust_sprite/` | 🔲 | A small swirling wind-elemental, ~26px, spiral of pale air with a face. States: idle, drift0-3, **gust-tell** (winding up) + gust-blow. White-cyan `#cfe9ff`. Shoves the player. |

## 6. Act 3/4 biome backdrops (parallax)

Match the existing street backdrop's layered approach. Each ~480×270, plus optional
`_far/_mid/_floor` splits for parallax.

| Biome | File | 🔲 | Prompt |
|---|---|---|---|
| **Boiler District** (Act 3, Fire) | `sprites/environment/boiler_bg.png` | 🔲 | A grimy industrial boiler-room / furnace district street at the logical 480×270 scale: rusted pipes, glowing furnace vents, molten-orange light pools, steam, dark iron catwalks. Hot palette — black iron `#1a1410`, ember orange `#ff7a1a`, smoke grey. Side-scroller backdrop, parallax-friendly. |
| **Windy Heights** (Act 4, Air) | `sprites/environment/heights_bg.png` | 🔲 | A high rooftop/skybridge district at dusk, 480×270: rooftops, billowing flags, drifting clouds, distant skyline, wind-streaks in the air. Cool airy palette — slate `#2a3340`, pale sky `#cfe9ff`, sunset accents. Side-scroller backdrop, parallax-friendly. |

## 7. Juice FX (mostly procedural — minimal art)

Most juice (hit-flash, splash, combo text, soaked overlay, magnetized coins) is
**procedural** (`burst()` / canvas) and needs **no art**. Optional polish only:

| Asset | 🔲 | Note |
|---|---|---|
| Water-splash death pop | optional | Procedural `burst()` (cyan droplets) is the default; a 4-frame `sprites/fx/splash_0-3.png` is a nice-to-have upgrade. |
| Soaked drip overlay | optional | Procedural drip particles default; no art needed for v1. |

---

## Priority order (to unblock the build)

1. **Mirror chamber** (#1) — backdrop, font, the four pillar pairs (Water+Earth
   first; Fire/Air when those bosses land).
2. **404 church props** (#2) — `altar`/`shrine_*`/`portal` (candidates already in
   `sprites/church/gen/`).
3. **The Slayer** (#3) — character sheet + portraits (Act 3 boss).
4. **New enemies** (#5) — Bulwark/Stalker first (already designed), then fire/air.
5. **Biome backdrops** (#6) — Boiler, then Heights.
6. **Ass Man finishing** (#4) — portraits + gust FX (Act 4).

Runnable now where wired: `node tools/imagen-gen.mjs slayer` / `assman` / `church`
(needs `GOOGLE_API_KEY` in `.env`). All others are in the table above for manual /
Gemini generation; drop processed PNGs into the listed paths.
