# Benediction Rework Pass — Design

Date: 2026-07-19. Status: user-approved design, pre-plan.

## Goal

Every benediction should be a real choice: no auto-picks, no dead cards.
Weak boons become active and *feelable*; strong boons keep their identity at
a fair price; flat numbers that fade late-game now scale with the player's
spray-damage stat. Presentation follows the design rule set this pass:
**Jon's heat is scalding water and steam, never open flame.**

## Cross-cutting rules

- **Scaling convention:** every damage rider expressed as a percentage of
  the CURRENT spray-damage stat (`player.stats.sprayDamage`), sampled at
  application time. No new flat damage numbers.
- **Rim is hitbox:** every new AoE radius lives in `JH.BENE_AOE`
  (config.js) and is consumed by BOTH the hit test and a drawn
  ring/telegraph. Existing entries stay; new entries added per below.
- **Styled descriptions:** all changed descs rewritten with the markup
  system — `{g:...}` for green buff values, `{i:stat}` for inline stat
  icons (dmg, range, speed, knockback, water, hp).
- **Offer gating:** Trial by Fire joins the duo-style prerequisite system:
  it appears in offers only when the player owns a Scald source
  (Scalding Faith, Backdraft, or Steam Devil).
- **Steam theming:** fire-tree copy and FX read as scald/steam (steam
  wisps, boiling water); no new open-flame reads. Renames: Firestorm →
  **Steam Devil**, Bushfire → **Boilover**.

## Per-benediction changes

### Water

1. **Split Stream** (tone down): arc carries **35%** of spray damage to 1
   nearby enemy. II: **50%** to **2** enemies. Chain visual unchanged.
2. **Baptismal Wake** (rework): dash puddles now **pull** enemies toward
   their center (gentle, ~40 px/s inside the rim) in addition to the
   existing 0.7× slow; 3s life. II: stronger pull (~70 px/s) + ~40% larger
   puddle. Puddles remain SlowZones (Mudslide-agnostic; kept for any
   future puddle synergy).
3. **Overflow** (rework, "strong at the edges"): tank ≥80% → **+20%**
   spray damage, AND tank <20% → **water regen ×2**. II: thresholds 70% /
   30%, values +30% / regen ×3. Both edges display: existing tank bar
   gains a subtle glow at whichever edge is active.
4. **Baptize** (tone down): bonus scales linearly with the target's
   wetness — 0 at dry up to **+15%** at full soak (II: **+25%**). Max
   damage requires max soak, i.e. sustained tank spend on that target.
5. **Absolution** (keep): wave clear heals 25 (II: 40 + clears burn).

### Fire (scald/steam)

6. **Scalding Faith** (scaling): Scald dps = **10% of spray damage**
   (II: **18%**), durations 2s / 3s unchanged. All other Scald appliers
   inherit this dps automatically.
7. **Backdraft** (keep + II scaling): dash-through Scalds (inherits
   scaled dps). II burst pop: **20% of spray damage** (was flat 8).
8. **Trial by Fire** (offer-gate): effect unchanged (+20% / II +30% vs
   burning, Scalded, or in-fire). Offered only while the player owns a
   Scald source (see cross-cutting).
9. **Ash Walk → Hazard Boots** (rework): the first damage/effect tick
   from ANY ground hazard (fire patch, stink cloud, wind hazard, hostile
   slow zone) is ignored, per-hazard, 10s cooldown; walking into a patch
   or cloud clears it with a steam pop (small AoE, scaled 30% spray dmg).
   II: 6s cooldown + bigger pop (50%). Name/desc updated; useful in every
   act. **Follow-up flag:** Rubber Boots relic overlaps (slow immunity) —
   queue a relic rework, out of scope here.

### Earth

10. **Aftershock → Focus Quake** (rework): 2s of sustained spray on the
    SAME target cracks a quake under it: AoE **40% spray damage** at
    radius `BENE_AOE.focusQuake = 30`, small hit-pause; repeats each 2s
    of continued focus. II: every 1.5s, **60%** + brief stagger. Drawn
    crack ring = hit ellipse.
11. **Sure Grip** (restructure): base — spray movement penalty **halved**.
    II — penalty removed entirely + **+10% knockback**.
12. **Bedrock Vigor** (tone down): **+25** max HP (II: **+45**). The
    on-hit +20% knockback (3s) rider is unchanged.
13. **Landslide → Gravel Spray** (rework): every **3s** of continuous
    spraying, the stream launches a rock chunk at its current target:
    **60% spray damage** + heavy knockback (~220). II: every **2s**.
    Chunk is a visible projectile in the stream; timer pauses while not
    spraying (does not reset on brief taps ≤0.3s gap).

### Air

14. **Gale Stride** (trim): dash distance **+25%** (II: **+40%**).
15. **Slipstream Draft** (visibility): mechanics unchanged (0.5s / II
    0.8s free-water after dash). Add a clear active read: stream renders
    bright-cyan tinted + a small swirl at the nozzle while freeSprayT > 0.
16. **Tailwind Tithe** (rework): the wind carries the stream — **+20%
    spray range** and **+20% knockback** (II: **+30% / +30%**). Always
    on, no combo dependence.
17. **Eye of the Storm** (rework): emergency immunity bubble — when a hit
    would land while HP < **30%**, the bubble raises, blocks that hit
    (existing BLOCKED read), and persists **1.5s**; cooldown **30s**.
    II: threshold 40%, bubble 2s. Cooldown shows as a faint bubble pip on
    the HUD sigil strip.

### Duos

18. **Steam Sermon** (rework — "Whistling Kettle" mechanic, name kept):
    Scalded enemies vent a steam aura that damages OTHER enemies within
    `BENE_AOE.steamVent = 24` at **15% spray damage per second** for the
    scald's duration. The scalded enemy itself takes only its Scald.
    Faint aura ring drawn at the vent radius on affected enemies.
19. **Mudslide** (rework — mud spray): the stream runs muddy: enemies
    being sprayed accumulate slow, stacking to a **50%** cap, decaying
    ~1s after spray leaves them. II: cap **65%** + slowed enemies take
    **+10%** damage. Self-contained; no puddle dependency.
20. **Firestorm → Steam Devil** (rework): dashing spins off a steam
    vortex that travels onward along the dash direction (~80 px/s,
    ~2s life), applying Scald and a small nudge to enemies it touches
    (each enemy once per vortex). Steam FX, no flame.

### Legendaries

21. **Pressure Sermon** (scaling): wavefront hit = **40% of spray
    damage** (was flat 10). Knockback/arming unchanged.
22. **Bushfire → Boilover** (buff + fix): global **+50% Scald dps**
    multiplier, and contagion re-checks every **1s** while any enemy is
    scalded (was once per application): spreads to enemies within
    `BENE_AOE.bushfireSpread = 40` carrying full dps/duration. Steam
    theming.
23. **Standing Stone** (keep): unchanged.
24. **Whirlwind Walk** (polish): projectile-destroy radius
    `BENE_AOE.whirlwindSweep` **14 → 20** (gust ellipse already drawn at
    the constant); gust hit on enemies scales to **25% spray damage**
    (was flat 15); destroyed projectiles pop a droplet splash — **10%
    spray damage** at `BENE_AOE.dropletPop = 12`, drawn burst = hit.

## Out of scope (flagged follow-ups)

- **Rubber Boots relic rework** (overlaps Hazard Boots).
- **GUSH combo system** relevance (user: "fringe, useless on bosses") —
  larger system question, separate brainstorm.
- Offer-weighting beyond the Trial gate.

## Testing expectations

- Unit: per-bene behavior tests derive numbers from defs/config (no
  literals): scaling formulas sample sprayDamage; Focus Quake ring radius
  == BENE_AOE.focusQuake in both draw and hit paths; Trial absent from
  offers without a scald source, present with one; Eye bubble triggers
  once per 30s and only under threshold; Gravel Spray timer pause/resume.
- Headless: one scripted pass exercising Focus Quake, Gravel Spray,
  Steam Devil, and the Eye emergency block with real keys; screenshot
  the new telegraphs.
- Balance sanity: threat tool untouched (enemy-side); spot-check a
  wave-30 clear feel manually (user playtest owns final feel).
