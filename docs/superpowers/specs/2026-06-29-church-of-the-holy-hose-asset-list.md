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
