# Jon Hose v1.0 — "Balance & Polish" — Design

**Date:** 2026-06-28
**Current version:** 0.10.2
**Status:** ✅ SHIPPED (v0.12.0). Track 1 balance pass built via the
`2026-06-28-jon-hose-v1-balance-pass.md` plan. Historical record — archived.

## Source of truth

This design folds together: the 2026-06-28 playtest notes, `Planner/TODO.md`,
`IMPROVEMENT_PLAN.md`, `Planner/do-a-full-review-misty-wave.md`, and
`Planner/SFX_AUDIT.md`. Balance tunables all live in `js/config.js` (single source
of truth — no other file hardcodes gameplay constants).

## Theme

The systems are feature-complete (14 waves / 4 acts / 4 bosses + garden + cutscene).
The **curve** is broken: brutal early, trivial late, with a dead-end economy. v1.0
is **not new content** — it fixes how the game *feels* end-to-end and gets real art
in. Three parallel tracks ship together.

Tier C work (boss multi-phase movesets, new enemy types, larger map) is explicitly
**post-1.0**; each gets its own brainstorm → spec.

---

## Track 1 — Balance pass

The headline fixes for the inverted curve and dead-end economy.

### Root-cause findings (from code)

- **Economy dead-ends structurally.** The skill tree is finite: all 15 nodes cost
  ~1,145 Suds total (`js/upgrades.js`). Boss payouts alone total ~1,160 (Big Drip
  120 + Switch 240 + Quake 320 + Gateway 480). The tree *cannot not* be maxed → no
  tuning fixes "nothing to spend on late." Needs a **sink**.
- **Difficulty scaling is binary, not progressive.** Every Act-2+ wave sets
  `tough:true`, applying one flat `makeElite()` (×1.7 HP, ×1.3 dmg, ×1.12 speed —
  `js/entities.js:655`). No ramp, and it ignores player power, so the same switch
  makes early elites brutal and late elites trivial.
- **Drops ignore enemy type.** Flat per-kill roll (18% health / 27% water) at
  `js/game.js:507`. "Pyros/Chargers should drop more" is impossible without a
  per-type field.
- **Early income is thin vs. cost.** Mook 6 / Charger 11 / Pyro 14 Suds; tier-1
  nodes 25–45. Early game is both the hardest *and* slowest to power up.

### Tier A — pure number tuning (`js/config.js` only)

| Problem | Lever | Proposed starting value |
|---|---|---|
| Early water starvation | `JH.PLAYER.waterRegen` / `regenDelay` | 14 → **18**/sec; 0.5 → **0.35**s |
| Early upgrades expensive | tier-1 node costs (`js/upgrades.js`) | ~**20% cheaper** on tier-1 nodes |
| Early income slow | enemy `suds` | mook 6→**8**, charger 11→**13**, pyro 14→**16** |
| Late surplus | boss payouts | **keep as-is** — the sink gives them purpose; nerfing payouts hides the real problem |

**Chargers: stats unchanged** (user decision). Their swing is tamed by the
per-wave cap + drop changes in Tier B, not by nerfing hp/dmg/speed.

All Tier-A values are *starting points* — fine-tuned by playtest after implementation.

### Tier B — small structural changes

1. **Per-type drop rates.** Add a `dropMult` field to each archetype in
   `JH.ENEMIES` (default 1). Pyro/Charger ≈ **1.8**. `dropLoot` (`js/game.js:493`)
   scales the item-roll thresholds by `e.def.dropMult`.

2. **Progressive elite ramp.** Replace the binary `tough` → flat ×1.7 with a
   multiplier that:
   - ramps by act (≈**1.3** early Act 2 → ~**2.1** by Act 4), and
   - scales with **player power** (owned-upgrade count) so a maxed player still
     faces tension.
   This is the single biggest fix for "trivial late." Implemented by parameterizing
   `makeElite()` and feeding it an act/power-derived factor at spawn time
   (`spawnEnemy` opts at `js/game.js:323`, `:696`).

3. **Charger cap.** Cap chargers per wave (≈**2**) and/or guarantee a mix so an
   all-charger swarm can't occur. Kills the luck-driven difficulty.

4. **Hybrid Suds sink** (both directions):
   - **Repeatable scaling nodes.** Once the tree is maxed, a few "Overcharge"-style
     nodes become infinitely repeatable with rising cost (e.g. `60 × 1.4ⁿ`):
     +damage, +max water, +HP. Permanent sink; power keeps creeping to match the
     elite ramp.
   - **Between-wave consumables.** Shop sells one-run items: Med Kit (restore HP),
     Pressure boost (temp +dmg for next fight), optional Revive. Ongoing sink for
     spare Suds.

---

## Track 2 — Art pipeline

Run in parallel with Track 1.

- Replace procedural painters (`js/assets.js`) with animated pixel-art sprite
  sheets, **bosses + Jon first** (per CLAUDE.md art-pipeline note). The `neighbor`
  painter is the documented image-blit + procedural-fallback pattern to copy.
- Formalize the **Gemini reference-gen → aseprite cleanup → slice** flow alongside
  the existing `sprite:gen` / `sprite:animate` / `sprite:quantize` scripts and the
  `sprite-forge` skill.
- Shared red-core motif cleanup; tint the Firewall SURGE shockwave electric
  cyan/green (parameterize `Shockwave` color — don't recolor Quake's shared class).

---

## Track 3 — Tech-debt ride-alongs

- **R1 — deferred-spawn queue.** Replace `setTimeout`-based loot/FX
  (`js/entities.js`) with an in-game queue ticked by `update(dt)` and cleared on
  `startGame`. Current timers leak across restart and fire during pause. Worth
  landing before 1.0.
- **Firewall wiring** (original `Planner/TODO.md` #1). Once balanced in Track 1,
  slot The Firewall into `JH.LEVEL1.waves` **and** add the matching `WAVE_TRIGGERS`
  entry in `js/game.js` together (length-invariant `console.warn` guards mismatch).
  Proposed slot: Act 3/4, between the Switch and Gateway Krusher.

---

## Out of scope for v1.0 (post-1.0 brainstorms)

- Boss multi-phase movesets: unattackable phases, charge-up moves, phase
  transitions, dynamic danger zones (playtest: bosses feel one-note).
- New enemy types (variety).
- Larger logical map area.
- SFX gaps from `SFX_AUDIT.md` (wire `hit`, split `dash`/`tell` cues) — polish, not
  blocking.

---

## Verification

No automated tests exist; verification is manual playthrough.

- `npm run dev` → http://localhost:5173 (or open `index.html` via `file://`).
- Dev wave-select: backtick on localhost opens "JUMP TO WAVE" (player gets 999 Suds
  on warp). Garden = index 12, Quake = index 10.
- Balance checks: early run should no longer feel water-starved; tier-1 upgrades
  reachable within ~2 waves; late-act elites should stay threatening against a
  maxed build; Suds always have a use (repeatable nodes / consumables); no
  all-charger waves.
- Bump `package.json` `version` before any commit (project rule).

## Implementation order

1. **Track 1 balance pass** (this spec → implementation plan). Tier A first
   (isolated config), then Tier B (drops → elite ramp → charger cap → sink).
2. R1 robustness fix.
3. Firewall balance + wiring.
4. Art pipeline runs in parallel throughout.
