# SDD Progress — Air Act / Ass Man

Spec: `docs/superpowers/specs/2026-07-12-air-act-ass-man-design.md`
Plan 1: `docs/superpowers/plans/2026-07-14-air-act-1-world-roster-core.md`
Branch: `air-act`

## Status

**Plan 1 complete and pushed; branch held for user playtest.** The campaign
currently ends after wave 32. Plan 3 is not written. Nothing merges to
`main` before explicit playtest approval.

Current verification baseline: **345/345 unit tests green**. Plan 1 received
unit, review, and headless coverage; the ignored task reports and scripts in
this directory retain the detailed transcripts.

Plan 2 (`docs/superpowers/plans/2026-07-16-air-act-2-pressure-setpiece.md`)
is **complete**. Waves 30-35 play from a fresh Air entry through real combat
with no dev-only state edits: Cloudline Holdout (wave 33), pre-placed
Bidets, Super Plunger (Triple Latch), and Super Gasbag (Fog of War) all
verified headlessly with real keys, and `tools/air-threat-score.mjs`
confirms the authored pressure curve and every wave's field-cap/roster
invariants. Wave 35 still calls `win()` temporarily — Plan 3 (Ass Man,
entry/outro bookends, K-9 Unit, leaderboard, named minor release) is next
and not yet written. Branch remains held for user playtest; nothing merges
to `main` before explicit approval.

## Plan 1 execution

| # | Task | Status | Commits / evidence |
|---|---|---|---|
| 1 | Sixth-act config, wave 30–32 data, act arrays, sprinkle floor | done | `4d3dee8`; 305 tests |
| 2 | Stink cloud footprint, gas pressure choke, spray dispersal | done | `ce481d6`, rim correction `81f1c0e`; task-2 report |
| 3 | Gust lanes and wave-terrain lifecycle | done | `190e7a9`; task-3 report |
| 4 | Plunger Fiend lunge/latch/tank drain/dash break | done | `22155c7`; task-4 report |
| 5 | TP Mummy drop-in, wrap snare, death shove | done | `0a4af22`, landed-hit fix `65c003f`; task-5 report |
| 6 | Gasbag vent cycle and pop-fast friendly burst | done | `3196c65`; task-6 report |
| 7 | Bidet Turret and locked-target water arcs | done | `ba6fecc`, knockback wiring `4299dda`; task-7 report |
| 8 | Air arrival, cloudline scene, vendor/checkpoint handoff | done | `57c87a2`, respawn floor `f634aae`; task-8 report + `t8-verify.mjs` |
| 9 | Whole-plan review and cross-system fix wave | done | `30f65f0`; `fixwave-report.md` + `fixwave-verify.mjs` |

## Review findings resolved

- Post-Slayer free-walk can no longer roll wave 30 before the truck sequence.
- The cloudline backdrop is gated by scene truth and does not bleed into the
  truck run.
- Air arrival clears stale combat arrays and establishes the gate as the
  minimum free-walk/respawn position.
- Plunger and TP Mummy riders apply only when `Player.takeHit` returns a
  landed hit; dodges never latch or snare.
- Gasbag remains in the hose/contact band, only records a vent after a cloud
  actually spawns, and preserves its pop-fast reward window.
- Bidet Turret is immune to separation and uses its configured landing shove.
- Stink-cloud puff wobble is capped at the shared hit footprint rim.

## Live-playtest support rounds

| Round | Result | Commits |
|---|---|---|
| Dev sim-power | Wave warps can grant act-expected levels, benedictions, and wallet so late-wave reads are not fresh-stat slaughter | `28a1b1b` |
| Gas readability | Full-tank bite, lingering burn-style choke, status indicators, sickly aura, and green sputter | `8c97d32`, `1a1cf1a`, `07b32c2` |
| Damage numbers | Dev-toggle enemy running tallies, incoming damage, crit punch, kill slam, and universal boss status pass | `aa69e15`, `60b8bec` |
| Scald / balance follow-up | Scald reads as steam; boss overlays cover custom draws; super-bulwark/furnace regressions fixed; Hydro Lance capped at target + one enemy | `82ddf82`, `bede4bb` |
| Plunger art pass | Ten generated/normalized frames (idle, walk, wind, lunge, latch, death), baked runtime painter, and visual-only death beat; the user hand-cleaned the final contact-pass-contact-pass walk cycle and it is wired to the runtime frame counter | `d768ff1`; **walk animation approved**; `plunger-verify.mjs` + `plunger-gallery.png` |
| Dev-range cleanup | Rejected horizontal zoning replaced by a compact 1,220-unit lab. TEST-O-MAT menus contain every benediction/relic and dispense one live specimen from the complete implemented enemy/boss roster, including all Air enemies and The Firewall; arrival banner suppressed | `d768ff1`; awaiting user range approval |
| TP Mummy art wiring | 56dcf2c's 16-frame set wired via `registerBaked` (flip: true — source faces left): idle/walk/wind live; new visual-only release beat (0.22s), drop-in uses drop0, death spawns unravel corpse + puff (plunger corpse idiom), TPWrap projectile blits wrap0/1. `registerBaked` gained elite-image fallback to base frames (tpmummy has no elite_* bakes). hurt.png left unwired by design (soak tint is the hurt read); player snare keeps the hand-tuned streamer rects. | uncommitted; awaiting playtest; 382/382 + `tpmummy-verify.mjs` green (`tpmummy-gallery.png`, `tpmummy-ingame.png`) |
| Plunger walk3/idle rework | Distinct walk3 pass pose (staged `walk3-v3` candidate normalized in, h143/feet row 151); walk2 re-baselined up 4px so all walk frames share feet row 151; walk-frame test hardened (walk1≠walk3, shared baseline, pair heights equal, width ≤8px apart, mass within 8%); idle1 breath bob softened 8px→2px; stray byte-dup `idle2.png` removed | uncommitted; awaiting user sprite verification (`tmp/plunger-walk-rework.gif`, `tmp/plunger-walk-strip.png`, `tmp/plunger-idle-rework.gif`); 345/345 tests + `plunger-verify.mjs` green |

## Plan 2 execution (started 2026-07-17)

Plan: `docs/superpowers/plans/2026-07-16-air-act-2-pressure-setpiece.md`.
Working-tree note: the uncommitted plunger sprite rework (idle1/walk2/walk3)
stays dirty in-tree; its paired test hardening was saved to
`tmp/plunger-test-hardening.patch` and reverted from `tests/air.test.js` so
plan tasks can commit that path cleanly. Re-apply the patch after Plan 2
execution and re-verify (bounds asserts may need re-anchoring to the evolved
test file).

| # | Task | Status | Commits / evidence |
|---|---|---|---|
| 1 | Progression + field-cap-aware placements | complete | `f01e49c` + fix `1db3790` (reservation scoped to placement waves; legacy superElite waves keep cap+1 openings), review clean, 350/350 |
| 2 | Cloudline edge hazard | complete | `470f6e2`, review clean, 354/354. Minor notes for later: double shake on edge hit (entities.js:1102 + :2740, max-take likely fine); wave-33 inline `holdDur: 24` duplicates `JH.CLOUDLINE_HOLDOUT.holdDur` — Task 3 must consume the config one |
| 3 | Wave 33 Cloudline Holdout | complete | `5c06076`, review clean, 358/358 + 24s headless drive (gust cycle, edge reset, cap 4, clean free-walk). Playtest notes: banner overflows viewport width (pre-existing shared CSS, affects long banners generally); scripted bot needed safety-net culls to survive 24s — human feel-check the pressure |
| 4 | Super Plunger: Triple Latch | complete | `58cff3b`, review clean, 368/368. Minors logged for final review: Geo wedge fns divide by `range` unguarded (world.js:314, unreachable today); pulse scheduler untested at dt=1/60 granularity (entities.test.js:441-477 uses exact boundary steps); engage gate stays at regular melee range so pullRange 150 only bites on mid-windup retreat (feel note for playtest) |
| 5 | Super Gasbag: Fog of War | complete | `1368d5e` + fix `6872966` (mini contactTimer delivers real 0.5s contact grace), review clean, 378/378. Minors logged: StinkCloud numeric opts use `\|\|` not `??`; Fuse child-spawn has the same latent spawnGrace/contactTimer gap (pre-existing, now a demonstrated pattern — follow-up ticket); no mid-vent-windup death test |
| 6 | Author waves 34-35 | complete | `21257ed` + fix `badd87d` (bidet clear-gate test now matches the real two-conjunct gate at game.js:2464), review clean, 381/381. Task 1's authored data survived verification unchanged |
| 7 | Threat pass + full headless gate | complete | `42a696a` (tools/air-threat-score.mjs, exits 0, all plan targets matched from live config), review approved with caveat, 381/381. CAVEAT: the waves 30-35 headless run needed a dev-harness HP floor (700) on the scripted bot — every mechanic assertion used real keys/damage, but an unaided clear is NOT demonstrated; the user playtest is the authoritative check for "plays without dev-only state edits". Tool minors logged: write-only `warnings` capture; printed `queued` excludes sprinkle overflow; `OWNED_CEILING = 24` duplicates an unexported balance.js internal; one-super gate is a schema shape check, not a count |

### Plan 2 final whole-branch review (Fable, d768ff1..42a696a)

**Verdict: ready for user playtest. No Critical/Important findings**; 381/381
tests + threat tool re-verified fresh. Cross-system checks passed: field cap
holds through trickle refill; ticket economy safe (worst case ~5-6 melee vs
budget 6, pull holds a ticket ~1.7s longer per 6.4s cycle); wave 35 → win()
path clean on every reset; no loot/XP exploit from infinite spawns.

Plan 3 punch list from review triage:
- Wave-33 right-side reinforcements can spawn up to 18px past the drawn
  cloudline edge (game.js:2413-2415 band vs edge at maxX-28) — visual
  fiction break, enemies are edge-immune; fix: clamp right band to
  `cloudlineEdge.x - 10` when the edge exists.
- Super Gasbag death at cap 8 transiently puts 9 on field (2 minis, net +1)
  — matches shipped cap+1 super behavior; plan-text ambiguity, note for
  Plan 3 brainstorm.
- Mini XP ungated by `infinite` (game.js:1375-1377 grants def.suds; only
  coins are budget-gated) — no exploit, tuning awareness for wave 35 XP.
- Bidet clear-gate test still replicates rather than drives the real gate.
- Pulse scheduler 1/60-dt test; StinkCloud `??`; double edge-shake (key the
  edge's shake off takeHit's return, don't delete — it's the only feedback
  on i-frame crossings); threat-tool `queued` understates sprinkle overflow
  (prints 3 vs real 7 on FOUL WEATHER) + cosmetic nits.
- Fuse child contact-grace gap: shipped behavior — needs explicit user call.
- Playtest flags for the user: pull engages at melee range (pullRange 150
  only bites on retreat); wave-33 banner is the longest in the game on the
  known overflow CSS; wave-33 pressure feel unproven by the scripted bot.

## Wind Pass execution (started 2026-07-17)

Plan: `docs/superpowers/plans/2026-07-17-air-wind-pass.md` (spec
`2026-07-17-air-wind-pass-design.md`). Working-tree note: the plunger-walk
test hardening was re-saved to `tmp/plunger-test-hardening-2.patch` and
reverted from `tests/air.test.js` for the duration; re-apply after
execution. Sprite GENERATION (codex, user-verified one at a time) is
out-of-plan; briefs land in `tmp/briefs/`.

| # | Task | Status | Commits / evidence |
|---|---|---|---|
| 1 | Range-spec gust lanes | complete | `40dbef7` (pushed), review clean, 386/386. Minors logged: legacy lanes burn 3 no-op random draws per cycle; `dirs: []` would yield undefined dir (no live caller) |
| 2 | WindHazard entity + placements | complete | `fc8fbb2` + fix `d387214` (hazard cd decays once per frame — plan reference code had a per-hazard double-decrement), review clean, 390/390, threat tool green (hazards col 0/0/0/1/2), pushed |
| 3 | Cloudline edge dressing | complete | `92b080b`, review clean, 391/391, pushed. Deviation (verified correct): drawCloudlineLip resolves JH.Geo lazily — assets.js loads before world.js |
| 4 | Gasbag/Bidet pose hooks + baked wiring + briefs | complete | `ad657d6`, review clean, 392/392, pushed. Briefs in tmp/briefs/ (gasbag, bidet, windhazard, cloudline-lip). Minor logged: bidet's own aim ellipse skips the single firing frame (cosmetic, co-rendered redundantly with the shot telegraph before) |
| 5 | Headless gate + ledger | complete | verify-only, no commit (`.superpowers/sdd/windpass-verify.mjs`, gitignored). 392/392 + threat tool green. See gate results below |

### Task 5 gate results

Headless gate: `.superpowers/sdd/windpass-verify.mjs` (port 5199, real keys,
same telemetry/page-error spies as tpmummy-verify), all 17 checks green
across three consecutive runs:

- Wave 32 (index 31) range-spec gust lanes — PASS. Sampled `gustLanes[0..1]`
  at two consecutive telegraph starts; both lanes stayed inside spec
  (`{yMin:12,yMax:36,dir:1,band:14}` / `{yMin:50,yMax:74,dir:-1,band:14}`)
  and `y` re-rolled between samples.
- Wave 34 (index 33) WindHazard contact — PASS. Walked Jon into the hazard
  with real arrow keys; HP dropped by exactly `JH.WIND_HAZARD.dmg` (8) once,
  and a re-approach within the 0.6s cooldown (measured 502-517ms across
  runs) dealt zero additional damage. Screenshot: `windpass-hazard.png`.
- Wave 33 (index 32) dressed cloudline edge — PASS. Screenshotted during a
  gust lane's blow phase (`windpass-edge.png`); driving right with real
  keys crosses the edge, snaps Jon back to `edge.x - resetDist` (within one
  input-tap's drift, ~13px tolerance for the held-key overshoot), and arms
  the crossing poof (`poofT > 0`).
- Zero page errors, zero telemetry calls across the whole run.

Screenshots inspected (Read tool): `windpass-hazard.png` shows the wave-34
PORCELAIN PATROL arena (two Plunger Fiends, a TP Mummy dropping in, the
pre-placed Bidet, Jon mid-knockback) — the WindHazard renders as a small
dark broken-fan box sitting inside a visible thin elliptical rim near Jon's
feet (confirmed via a coordinate-marked debug pass); legible but modest in
scale, consistent with the documented procedural fallback until sprites
land. `windpass-edge.png` shows the CLOUDLINE HOLDOUT arena with the lip
band + rising churn ellipses along the right-side walkway boundary, no
dashed line.

`npm test`: 392/392 green. `node tools/air-threat-score.mjs`: all gate
checks passed, hazards column now populated (wave 34: 1, wave 35: 2).

No defects found; no production code touched. Sprites still pending
user-verified codex generations — briefs in `tmp/briefs/`.

### Wind Pass final whole-branch review (Fable, 058c5f6..ad657d6)

**Verdict: ready for user playtest. No Critical/Important findings**;
392/392 + threat tool re-verified fresh. Cross-system checks passed: wave
33's phased lanes never blow simultaneously (blowDur 3.5 < phase 3.6 —
COUPLING: a blowDur bump breaks this, comment-worthy); hazard knockback is
an impulse (no same-frame edge double-resolve; edge and hazards never
co-occur on a wave); stagger pauses windups player-favorably, no timer
desync; threat peak-field math unchanged; draw order sane.
Post-review guards landed as `afdd8a0` (394/394): windhazard partial-set
falls back to idle0 (one-at-a-time generation won't blink), GustLane spec
normalization guards dirs:[] and half-ranges against NaN.
Punch list (Minors accepted): player contact cd is per-hazard (overlapping
hazards would double-chip — data-guarded today, remember when authoring);
range-catalog specimen swap doesn't clear windHazards (symmetry nit);
phase/blowDur coupling comment.

### Pre-playtest round (2026-07-18)

- Punch-list sweep `e2fe452` (398/398): wave-33 holdout right-spawns clamp
  inside the cloudline edge (new `holdoutSpawnX()` helper + test); range
  catalog clears windHazards; phase/blowDur coupling comment; threat tool
  `queued` now includes sprinkle overflow (FOUL WEATHER prints 7) + dead
  `warnings` capture removed; Super Plunger pulse scheduler tested at 72
  consecutive 1/60 steps; cloudline edge shakes once per crossing (edge's
  own shake only when i-frames negate takeHit's); StinkCloud opts use `??`;
  bidet clear-gate test drives a factored `reinforcementWaveCleared()`
  predicate.
- Fuse contact-grace fix `744de60` (user-approved shipped-behavior change):
  fuse children get real 0.5s contactTimer grace, mirroring gasbag minis.
- WATCH: sweep agent saw one transient failure of a Math.random-driven
  gust-lane test that passed clean on two re-runs — possible rare flake in
  the range-roll test; if it recurs, pin down which assertion.
- Bidet art SHIPPED (2026-07-18): pedestal design rejected → toilet-artillery
  hybrid approved → 4-pose sheet (idle0/idle1/wind/fire) generated, water
  stripped in postprocess (projectile will be its own sprite), fire frame
  rebuilt surgically from idle0 (axis recoil + lever mirror about shaft pivot
  y309.5 — "mostly static" per user), muzzle transplant repaired the
  cell-boundary cut, edge-sliver sweep + outline mends. Sliced to
  `sprites/bidet/*.png` (112x116, feet row 111, shared transform, zero
  clipping) into the existing registerBaked slot; 398/398 green. UNCOMMITTED.
  Pipeline lesson: gpt-image-2 follows the REFERENCE image's facing over
  prompt text; sheet splits leave boundary slivers — always run the
  component sweep + outline mend + pixel facing check (eye-offset metric).
- Plunger FROG conversion (user call 2026-07-18, expanded to FULL set): frog
  body, plunger cup head, cup rim = suction-lip mouth, hop cycle instead of
  walk. SHIPPED to sprites/plunger/ (uncommitted): walk0-3 = hop
  (crouch/launch/airborne/land, airborne bakes a 43px air-gap), idle0/1 =
  breathing pair. tests/air.test.js walk test re-anchored to the hop
  contract (shared baseline for grounded frames, >=20px airborne gap,
  distinct poses, mass ratio <1.25); 398/398. Attack set SHIPPED too
  (wind/lunge/latch/death — flared suction-maw lunge, belly-up X-eye death;
  latch+death regenerated once for ghost-hands/glitches). ALL 10 plunger
  frames are now frog; silhouette rims re-darkened (light-edge audit: paint
  edge px lum>60 to #0a, don't cull) for the light cloudline bg. Old imp
  frames fully replaced on disk. Pipeline now:
  transparent-bg generations (no magenta), component slicing (not fixed
  columns), color-bleed before downscale, speck cull, halo cull. NOTE for
  playtest: frog reads ~27 logical px tall vs imp ~36 — painter blit scale
  is the knob if it feels small.
- Bidet PROJECTILE candidate (2026-07-19): "pressurized water shell" —
  teardrop water glob + riveted chrome coupling ring, nose-right for
  in-flight rotation. Normalized 64x32 at tmp/bidet-shell-norm.png; wiring
  plan = rotated blit in BidetShot.draw (entities.js:6333) keeping glow +
  landing ellipse. AWAITING user call.
- ICON regeneration pass (2026-07-19): all 24 BENEDICTION icons SHIPPED to
  sprites/icons/bene_*.png (48x48, replacing node-bakes; style approved via
  sheets, 398/398 green). All 22 RELIC icons generated + normalized in
  tmp/relic-icons-sheet{1,2,3}-out/ (8 common, 10 rare, 4 relic-grade w/
  gold bursts) — AWAITING user call to ship.
- BACKGROUND pass (2026-07-19, ALL ACTS, style approved "looking good"):
  keep world.js Background.init() placement/parallax, blit baked building
  variants instead of rect-painting (per-slot rng variant, native aspect,
  baseline anchor, procedural fallback). ALL 4 PACKS GENERATED
  (tmp/imagegen/bg-{act1-buildings2,act3-ruins,boiler,air-monuments}-raw
  .png): act1 beat-em-up storefronts (sanitation neon, Double Dragon
  density per user), act3 collapsed ruins, boiler district industrial,
  air porcelain monuments (plunger column, faucet arch). WIRED 2026-07-19:
  sprites/bg/{street,ruins,boiler,air}{0-5}.png + ground_*.jpg baked
  (checkerboard-keyed where needed, valley-cut slicing, edge hygiene);
  world.js: baked-variant blits in the near-skyline loop (pack from
  zone flags + fire flag, variant hashed from b.x — rng stream untouched),
  drawFloor ground strips on the zone ramps (dashes only as fallback),
  far skyline fades out with airT. Church backdrop.jpg REPLACED (old one
  in tmp/backup/church-backdrop-old.jpg). In-game screenshots verified
  headlessly (devGotoWave warps; naive x-teleports get clamped by arena
  bounds — use devGotoWave). 398/398. RELEASE SPLIT AGREED: air-act
  content release vs world-art release — commit file sets separately
  (world-art files: world.js, sprites/bg/, sprites/icons/, church
  backdrop; air-act: everything else).
- GROUND textures (2026-07-19, user-requested): 4 per-act floor strips
  generated (tmp/imagegen/ground-{act1,act3,boiler,air}-raw.png — asphalt /
  rubble / riveted iron w/ glowing grates / cloud deck w/ porcelain tiles).
  Wiring seam: drawFloor (world.js:344) — scrolling image band over the
  flat fills, zone-faded like the tints; horizontal tileability must be
  enforced at wiring (edge crossfade or mirror-tile). AWAITING call.
- CHURCH backdrop generated (tmp/imagegen/church-backdrop-raw.png):
  pillared flooded nave, floodwater reflections, godrays, hose-cross
  altar glow — fills the sprite-forge brief's sprites/church/backdrop.png
  slot (JH.ChurchArt already falls back procedurally). Needs 16:9 crop +
  downscale at ship. Remaining church props (spirit/altar/shrines/portal/
  father_jon) still ungapped. AWAITING call.
- World-art round 2 (2026-07-19, all wired, 398/398): bene FRAMES baked —
  15 ELEMENTAL frames per user call (frame_{base,rank2}_{water,fire,earth,
  air}, frame_duo_{water_fire,water_earth,fire_air}, frame_leg_<el>, each
  with element trim + symbol medallion; gold on rank2/legendary) +
  universal set kept as fallback chain in Assets.tierFrame (elemental →
  universal → procedural; legendary glow kept, verified in the Tab panel); shop wheel +
  vendor shelf icons at 1.5x scale; AIR pack regenerated TOILET-themed
  (golden toilet throne / plunger column / TP obelisk / cistern tower /
  urinal arch / bidet fountain — teapots rejected by user); building
  variety in world.js (hash-driven skip ~16% gaps, mirror flip, 0.85-1.15
  scale jitter, +2px floor overlap kills the parallax base sliver);
  ruins/boiler rebaked with two-tone checker sampling (kills enclosed
  white patches + jaggies); relic icons deep-scrubbed (sunday_suit halo);
  CHURCH split into nave.jpg (mirror-tiled wall, 0.35 parallax, above
  FLOOR_TOP) + ground.jpg (flooded flagstones, full parallax) in
  church.js drawBackdrop — street-style band flow, old single-backdrop
  path kept as fallback. All verified via headless devGotoWave shots.
- HUD cleanup + bene range honesty (2026-07-19, 398/398): verbMark
  (square/arrow/dash corner marks) DELETED — obsolete now that every
  benediction has a distinct icon; HUD sigil strip draws bene_<id> icons
  (el_/pip fallback chain); sigil pickups lost the mark too. Bene AoE
  radii moved to JH.BENE_AOE config (single source shared by hit + draw
  per rim-is-hitbox): aftershockSplash 30 + new visual ring (ochre),
  bushfireSpread 40 + new visual ring (orange), whirlwindSweep 14 + new
  gust ellipse around Jon during the dash. Audited as already rim-correct:
  sermon waves, wake puddles, GUSH pulse rings. pulseRings now accept
  color + visual-only entries (dmg/kb 0).
- Shop/UI round (2026-07-19, 398/398): 22 RELIC icons SHIPPED to
  sprites/icons/. Shop wheel REDESIGNED as a slot machine (RELIC-O-MAT:
  gold housing, chasing marquee, 4 recessed reel windows w/ rolling icons
  during spin, tier = rim color, payout strip below — no text-through-
  frame; lever pulls while spinning; row h 34→58). Overcharge section
  fully HIDDEN pre-first-boss (header+lock row gone). Bene FRAMES rebaked
  at 320px w/ border-square anchoring (medallion no longer shifts
  centering) + smooth minification in tierFrame (fs*320/240 box) — fixes
  readability + centering. STYLED TEXT system: Assets.styledText/
  stripMarkup — "{g:...}" green values, "{i:key}" inline stat icons;
  wrapText wraps on visible length; wired into bene panel lines, sigil
  card, relic rack card. Baptize desc reworded ("After 0.1s of spraying,
  enemies take {g:+15%} {i:dmg} spray damage" / II "{g:+25%} {i:dmg}
  instead" — 0.1s is the honest wetness-0.3 time at 60fps). Sigil rank-II
  cards now show base desc + "II: ..." (never a blind upgrade pick).
- Slot-machine input round (2026-07-19, 398/398): keyboard wheel purchase
  VERIFIED working headlessly (navigate + buy spigot_key/alarm_bell). Added
  MOUSE support: input.js mouse.click/clickEdge (mousedown, one polled
  frame) + Input.bufferPress(action); clicking a reel window selects the
  slot + buys (hitboxes stored by the draw pass in game._wheelRects).
  Focus affordance: thicker gold rim + outer glow + ▼ pointer (focus was
  invisible on gold-tier rims). FLAKE RESOLVED (2026-07-19): the transient
  was "gust lanes: range specs re-roll" — a TEST bug: its step-counted
  loop broke 11 frames into the FIRST telegraph (guard `phase==='telegraph'
  && i>10` matched the current phase), so 40 "cycles" ≈ 1 real cycle and
  dir sampled only ~6 rolls → P(all-same dirs) ≈ 3%. Game code was always
  correct. Test loop now rides real full cycles; 0 failures in 40 stress
  runs. Also: FUSE DORMANCY shipped (user call): fuses spawn dormant
  (dimmed idle, no move/contact), wake at JH.ENEMIES.fuse.wakeRange 130 or
  on damage with 0.3s grace + spark beat; drop-ins and death-children
  never dormant; 2 new tests (400/400).
- Local playtest server: http://localhost:8123 (npx http-server, detached).
- Review artifact (approval gates + previews):
  https://claude.ai/code/artifact/65196741-1fbb-4d1f-a2e4-344f36b300a0

## Benediction rework (Tasks 1-10, complete 2026-07-19/20)

Spec: 2026-07-19 benediction rework (percent-of-sprayDamage scaling for
every boon/duo/legendary, replacing flat literals; per-task ledger at
`.superpowers/sdd/bene-rework-ledger.md`, task briefs/reports
`task-{1..10}-brief.md`/`task-{1..10}-report.md` in this directory).
Tasks 1-9 committed individually (see ledger for commit hashes). **Task 10
(final, commit `67aeab6`) closes the pass**: Pressure Sermon wavefront and Whirlwind Walk's
dash gust converted from flat literals to `sprayDamage * BENE_TUNE frac`
(`sermonWaveFrac` 0.40, `whirlGustFrac` 0.25); Whirlwind's projectile-destroy
now also pops nearby enemies for `dropletPopFrac` (0.10) — mirrors the
droplet-pop pattern already shipped elsewhere in the rework. `JH.SERMON.dmg`
deleted from config.js (dead now that the wave reads `sprayDamage` live).
Desc sweep: backdraft descII, pressure_sermon, whirlwind_walk now read their
live percentages via the `{g:}/{i:}` markup; standing_stone confirmed
untouched (no numeric literal tied to the reworked config).

Verification: 422/422 unit tests (2 new — sermon wave % damage, whirlwind
gust+droplet scaling — plus the existing sermon-wave/whirlwind tests
updated off the deleted `SERMON.dmg`/hardcoded gust literal). Headless gate
`.superpowers/sdd/bene-rework-verify.mjs` (gitignored, port 8123, real keys)
— 9/9 checks green: Aftershock quake fires within `quakeChargeS` of
continuous spray + Gravel Spray's periodic chunk lands on the same focus
target; Pressure Sermon's release wavefront deals >= `sermonWaveFrac` of
spray damage; Whirlwind's dash gust deals >= `whirlGustFrac`; Mud Spray's
`_mudSlow` measurably ramps toward its cap while sprayed; Eye of the Storm
blocks a hit staged just under `eyeHpFrac`; screenshots confirm a live quake
ring (`tmp/bene-quake-ring.png`) and a Steam Devil from a firestorm dash
(`tmp/bene-steam-devil.png`); zero pageerrors, zero telemetry calls.
Gotcha hit and fixed while writing the gate: checks run back-to-back drain
Jon's tank, and dry-tier spray silently blocks Pressure Sermon from arming
(`!dry` gate) while a leftover `dashGraceT`/`invulnTimer` makes
`takeHit()`'s top guard return `false` before Eye of the Storm's own branch
ever runs — every check now primes water/invuln/dash state first.

Working-tree note: this repo currently carries substantial UNRELATED
uncommitted work in the same files Task 10 touches (fuse dormancy, shop
wheel slot-machine redesign, damage-number default, verb-mark removal,
gearFrame sizing, markup-aware text wrap) — none of it from this task.
Commit was built with `git add -p`, staging only Task 10's hunks in
js/config.js, js/entities.js, js/game.js, js/benedictions.js, and
tests/entities.test.js; `git diff --cached --stat` confirmed the staged set
matches exactly the brief's scope before committing.

**The benediction rework pass is now COMPLETE (Tasks 1-10)** — held
uncommitted-to-main / branch-only per the standing playtest-before-release
rule; awaiting user playtest before any merge.

## Cross-cutting API state

- `Player.takeHit(dmg, game, fromX, knock)` returns `true` only for a landed
  hit and accepts an optional knockback amount.
- `Enemy.takeDamage(dmg, game, dirX, knock, crit)` accepts an optional crit
  flag for damage-number presentation.
- `Balance.unlockedPool(waves, waveIndex, fromWave)` accepts a floor so Air
  sprinkling cannot pull earlier-world enemies.

## Next work

1. User playtest gate for the current branch: Plan 1 + Plan 2 content
   (waves 30-35, both supers, Cloudline Holdout), the remaining Plunger
   wind/lunge/latch/death animations, the uncommitted walk3/idle rework, and
   the unaided-clear check the scripted headless bot could not provide.
2. Plan 3 (not written): three-phase Ass Man, entry/outro bookends, K-9 Unit,
   leaderboard comparator/payload, victory-flow move, and named minor release.
3. Deferred art: bake the remaining Air roster after feel survives playtest;
   the Plunger Fiend frame set and silhouette pass are complete.

## Ass Man fight pass (plan 2026-07-20-ass-man-fight.md)

Task 1: complete (commits 18b65a7..59060b8, review clean)
Task 2: complete (commits 59060b8..5f34ea9, review clean; Minor: lbCompare timeSec ternary readability)
Task 3: complete (commits 5f34ea9..434ad50, review clean; Minor: hip shove literal 320 [plan-inherited, add hip.shove to config], clap angle-boundary untested)
Task 4: complete (commits 434ad50..faba026, review clean after fix round: shard ticks restored to takeHit; hip.shove config carried in)
Task 5: complete (commits faba026..b6dae56, opus review clean; 4 implementer fixes to plan snippet all validated. Carried to T6: clear _waves on phase-3 arm, sequential-phase clamp. Minor ledgered: contact dmg during beat [thematic, playtest call])
Task 6: complete (commits b6dae56..e9f08e6, review clean; carried T5 fixes in [waves clear + sequential clamp]; awareness note: hp drives negative while kneeling, inert)
Task 7: complete (commits e9f08e6..1e506de, review clean; controller visual pass done: all phases render, kneel excellent. USER CALL: chest lettering mirrors when facing left [all masters face right]; storm ring rim subtle — playtest feel)
Task 8: complete (commits 1e506de..8b30ee0, review clean; Minor: _setTransport duplicates existing setTransport seam — dedup nit)
Final review: complete (fix commit 712635a; 2 Importants + 8 Minors fixed; deferred to playtest: toilet prop art [user-verify loop], P3 flourish fx, contact-during-beat thematic call, chest lettering mirror). Headless full-fight verified: P1->P2 8.5s, P2->P3 29.9s, kneel->win, 150 refused/256 landed through gates. Suite 450/450. HELD for user playtest.
