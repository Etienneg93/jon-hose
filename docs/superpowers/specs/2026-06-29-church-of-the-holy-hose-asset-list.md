# Church of the Holy Hose — Asset List (for generation)

**Date:** 2026-06-29
**Purpose:** Art to generate for the Church polish pass. Supersedes the minimal
prop-pack brief in the `sprite-forge` skill. Drop finished PNGs into
`sprites/church/`; they blit through `JH.ChurchArt` (with ctx-rect fallback).

## Style (apply to all)

Low-res **pixel art**, hard edges, no anti-aliasing/gradients. Game canvas is
**480×270 logical**, nearest-neighbour upscaled — generate at ~3–4× then
downscale. Match `JH.PAL`: water/holy cyan `#6cd3ff`/`#d6f6ff`, suds gold
`#ffd23f`, stone/dark `#0a0c14`/`#11141f`, element accents (earth `#e0902f`,
fire orange, air pale, water cyan). **Transparent background** (except the
full-frame backdrop). **No baked drop shadows** (engine draws its own). Mood:
dim, sacred, mysterious — a flooded cathedral devoted to the hose.

| # | Asset | File (`sprites/church/`) | ~Logical px | States / frames | Notes |
|---|---|---|---|---|---|
| **Environment** |
| 1 | Backdrop | `backdrop.png` | 480×270 (opaque) | 1 | Cathedral interior: pillars, godrays, hose/hydrant-cross iconography, water motifs. Optional split: `backdrop_far/mid/floor.png` for parallax. |
| **Jon (ghost)** |
| 2 | Ghost Jon | *(reuse existing `sprites/jon/*`)* | ~58 tall | idle, walk0–3 | Rendered **translucent + cyan tint at runtime** — no new art required. Optional dedicated `ghost_jon_*` if you want a wispier look. No water tank, no spray FX. |
| **Father Jon** |
| 3 | Father Jon NPC | `father_jon.png` | ~58 tall | idle (+ optional talk) | In-world bishop-Jon at the altar: mitre, hose-vestments, kindly-stern. Walk-up NPC. |
| 4 | Father Jon portraits | `father_jon_portrait.png`, `father_jon_portrait_mouthopen.png` | ~96×108 | 2 | Codec-style dialogue portraits (match Quake Walker portrait format). |
| **Altar & blessing stations (walk-up, icon-based)** |
| 5 | Altar centerpiece | `altar.png` | ~48×40 | 1 | The Altar of Elements / font. |
| 6 | Blessing station — Damage | `station_dmg_base.png`, `station_dmg_icon.png`, `station_dmg_icon_hover.png` | base ~24×28, icon ~16 | 3 | "Anointed Pressure" (+DPS). Pressure-nozzle glyph; hover = glow. |
| 7 | Blessing station — Health | `station_hp_base.png`, `station_hp_icon.png`, `station_hp_icon_hover.png` | same | 3 | "Blessed Vigor" (+HP). Heart / holy-cross glyph. |
| 8 | Blessing station — Water | `station_water_base.png`, `station_water_icon.png`, `station_water_icon_hover.png` | same | 3 | "Deep Reservoir" (+Tank). Water-drop / tank glyph. |
| 9 | Holy Essence glyph | `essence.png` | ~12 | 1 | Currency icon (HUD + station cost). Distinct from suds gold — holy cyan/white. |
| **Elemental shrines (the four allies)** |
| 10 | Earth shrine | `shrine_earth_dim.png`, `shrine_earth_lit.png` | ~20×44 | 2 | Quake. Lit = earth-orange glow. (Only one active today.) |
| 11 | Fire shrine | `shrine_fire_dim.png`, `shrine_fire_lit.png` | ~20×44 | 2 | Slayer (future). |
| 12 | Air shrine | `shrine_air_dim.png`, `shrine_air_lit.png` | ~20×44 | 2 | Ass Man (future). |
| 13 | Water shrine | `shrine_water_dim.png`, `shrine_water_lit.png` | ~20×44 | 2 | Jon / capstone. |
| **Portal & transition** |
| 14 | Portal idle | `portal_idle.png` | ~24×44 | 1 (or 2–3 shimmer) | Rift back to the street; holy/green vertical shimmer. **Walk into it** (no menu). |
| 15 | Portal envelop | `portal_envelop_0..n.png` | ~32×56 | 3–5 | Energy wrapping around Jon as he steps in, before fade-out. |
| 16 | Warp beam (Mega Man-style) | `warp_beam_0..n.png` | ~16×64 | 4–6 | Teleport column + (de)materialize frames for leaving the church / arriving in the world. |
| **FX (optional polish)** |
| 17 | Spirit rise | `spirit_rise_0..n.png` | ~16×32 | 3–4 | Soul-leaving-body for the death→church flicker (can reuse ghost Jon). |
| 18 | Essence-spend burst | `essence_burst.png` | small | 1 | Particle accent on purchase. |

## Priority order (to unblock the rework)

1. `backdrop.png` (sells the zone instantly)
2. Father Jon portraits (#4) + NPC (#3)
3. Blessing stations (#6–8) + essence glyph (#9)
4. Portal (#14–15) + warp beam (#16)
5. Shrines (#10 Earth first; #11–13 later with their bosses)
6. FX (#17–18)

Anything missing or want different sizes? The engine downscales on blit, so a bit
larger is safe; flag if a target px feels wrong.

---

# Gemini generation prompts

Backdrop, Father Jon NPC, and Father Jon portraits are **done** — omitted below.
Filenames match what the engine already blits via `JH.ChurchArt`, so dropping a
finished PNG into `sprites/church/` makes it appear with no code change.

**Append this style suffix to every prompt** (keeps the set consistent + cutout-friendly):

> `— 2D pixel-art game sprite, crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, a single object centered with clear empty margin, on a FLAT SOLID FILL background (no scene, no floor) for easy cutout, no text, no drop shadow, must read clearly at very low resolution.`

## Wired now — generate these first (they render immediately)

**`altar.png`** (~48×40)
> A small sacred stone altar of the Church of the Holy Hose: a carved dark-stone pedestal crowned with a brass fire-hydrant relic, a coiled fire-hose draped over it like holy vestment cloth, faint cyan holy-water glow rising from it. Dark stone `#11141f`, brass-gold accents `#ffd23f`, cyan light `#6cd3ff`.

**`station_dmg.png`** (~24×34 — "Anointed Pressure", RED)
> A narrow gothic prayer-pedestal shrine topped with a glowing brass spray-nozzle relic haloed by pressure rings, radiating hot red-pink holy light `#ff5a5a`. Dark carved stone base `#11141f`, red glow.

**`station_water.png`** (~24×34 — "Deep Reservoir", CYAN)
> A narrow gothic prayer-pedestal shrine topped with a sacred water-vessel / droplet relic overflowing with light, radiating cyan holy glow `#6cd3ff` / `#d6f6ff`. Dark carved stone base `#11141f`, cyan glow.

**`station_hp.png`** (~24×34 — "Blessed Vigor", GREEN)
> A narrow gothic prayer-pedestal shrine topped with a radiant holy heart-relic ringed by a faint cross halo, radiating green holy light `#6cff9a`. Dark carved stone base `#11141f`, green glow.

**`shrine_dim.png`** (~20×44 — locked elemental shrine, generic)
> A tall narrow gothic cathedral wall-niche shrine, dormant and unlit: cold grey weathered stone, a dark dead emblem set in the niche, no glow, deep shadow. Inactive/locked.

**`shrine_lit.png`** (~20×44 — awakened elemental shrine, generic)
> The same tall narrow gothic cathedral wall-niche shrine, now awakened and radiant: cyan-white holy light `#d6f6ff` pouring from the emblem, illuminated stone, soft rising light rays. Active/blessed.

**`portal.png`** (~24×48 — return rift)
> A vertical swirling portal of holy green-cyan energy `#6cff9a` / `#bfffd6` framed by carved stone arch fragments, a glowing rift back to the mortal street, faint runic light along the edges, ethereal.

## Optional / future (need a little code wiring before they show — nice-to-have)

**`essence.png`** (~12 — Holy Essence currency glyph)
> A single glowing holy-essence mote: a cyan-white teardrop of light `#d6f6ff` with a tiny four-point star/cross sparkle at its core, a sacred pickup icon.

**`portal_envelop_0.png` … `_4.png`** (~32×56 — 5 frames)
> Frame {N} of 5: a ring of green-cyan portal energy `#6cff9a` spiralling inward around an empty character-sized center, progressively tighter and brighter from frame 0 to 4 (wraps a figure as they step in).

**`warp_beam_0.png` … `_5.png`** (~16×64 — 6 frames, Mega Man-style)
> Frame {N} of 6: a thin vertical teleport beam — a bright cyan-white column of light `#d6f6ff` against empty space, materialize sequence (frame 0 a full bright column, narrowing/resolving toward frame 5).

**Per-element shrines** (only if you want each shrine visually distinct — currently the engine reuses the generic `shrine_lit`/`shrine_dim` for all four). Same niche prompt as `shrine_lit`, recoloured: Earth `#e0902f` amber, Fire `#ff8a3c` ember, Air pale `#cfe`/white, Water `#6cd3ff` cyan. Filenames TBD when wired.

**Ghost Jon** — **no asset needed**; the engine tints the existing `sprites/jon/*` sprite cyan + translucent at runtime.

