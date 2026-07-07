# Fire-Truck Escape — HANDOFF (2026-07-07)

**Branch:** `claude/fire-truck-minigame-concept-2pdlg0` (NOT merged to main; feature
branch only, per the playtest gate). **Everything below is committed** except the
in-flight art bake (see §3).

Spec: `docs/superpowers/specs/2026-07-06-fire-truck-escape-design.md`
Plan: `docs/superpowers/plans/2026-07-06-fire-truck-escape.md`
Assets plan: `docs/superpowers/plans/2026-07-06-fire-truck-assets-and-polish.md`
Ledger: `.superpowers/sdd/progress.md`

## 1. What the feature is (built + playable on placeholder art)

Post-Slayer between-worlds set-piece. Flow, all wired and headless-verified:

**Beat Slayer → cutscene → pick the Slayer benediction → that pick fires
`startTruckArrival` (rumble + `dread` SFX + truck drives in, stops at the right
screen edge) → press E to board → 60s escape → arrive at the Air World gate → win
(stub until the Ass Man act exists).**

- **Scene module:** `js/truck.js` (`JH.TruckRun`), a self-contained scrolling
  scene modeled on the Church interlude. Dispatched from `js/game.js` via
  `state === "truck"` (update + render branches). Entry seam:
  `afterSlayerCutscene` → benediction poll (`slayerBeneBeat`) → `startTruckArrival`
  → `truckBoard` drive-in + `worldCrumble` → board (E) → `JH.TruckRun.enter`.
- **Config:** `JH.TRUCKRUN` block in `js/config.js` (all tunables).
- **Pure helpers:** `js/truckrun.balance.js` (+ `tests/truckrun.test.js`, 10 tests).
  Full suite green (224).
- **Backdrop is seamless:** the run draws the same `JH.Background` (fire-world
  sky/skyline/moon) captured from the boarding camera (`camX0`) and drifted, so
  boarding flows straight in. Speed is the fast-scrolling road + near speed-strip.

### Current gameplay tuning (all in `JH.TRUCKRUN`)
- **Hose:** `hoseDps 240`, `hoseRange 240`, `knockback 300`. Spray is a
  **droplet cone** (same look as Jon's hose) emitted from the **top cannon**, and
  it **clears any enemy in front across ALL lanes** (dx-only, no lane match) so
  "only obstacles are dodged." **Wrecks are beam-immune** (dodge them); **hydrants
  pop on contact** (positional); fires are doused by the beam.
- **Water:** big tank `180`, trickle `regen 5`, **hydrants** are the real refill
  (`hydrantRefill 90`).
- **Enemies:** **fuses only** (timeline drops smelt/pyro; wrecks are obstacles).
  Normal-game spray feedback: **wetness tint + health bar + knockback**.
- **Truck on-hit:** Jon's exact effect — white flash + `JH.PLAYER.invuln` (0.6s)
  i-frames + `hurt` sound + screen shake, **no hitstop** (matches the player).
  HP is **non-lethal** (feeds shake + collapse-wall pressure + clean bonus).
- **Boss — The Firewall** (replaces the old furnace): the real `wallboss` chassis
  art + iris weak-spot core (real `JH.PAL.wallboss*` palette). Armored body; only
  the **roaming weak spot** takes damage, and only while **OPEN** and
  **lane-matched** (`firewall.wsBand 16`, strict). Moves use the boss's own
  graphics: **PORT SLAM** = the crush telegraph (forward red zone), **SURGE** =
  the `LightningWave` bolt. `screenX 355`, `hp 1360`. Break it → arrive → win.

## 2. Playtest gate

Nothing merges to main until the user plays it. Commit + push to the feature
branch freely. When it lands it's a **minor** release (full designed pass) — use
the `release` skill.

## 3. DONE: bake + wire the real truck sprite (Jon in the fire truck)

**COMPLETE (2026-07-07).** The hero truck sprite (Jon in the cab, wheel-spin) is
baked AND wired into `renderScene`; the spray origin sits on the cannon-tip. Steps
1-5 below are all finished and headless-verified (screenshots in §5's e2e run show
the truck sprite driving + spraying). The render swap + spray-origin retarget are
committed on the branch (commits `36d620d`, `fcce553`). What follows preserves the
original handoff notes for reference.

### Done
- Raw art dropped: `sprites/firetruck/jon-truck.png` (Jon in the cab — USE THIS)
  and `truck.png` (empty cab). Both 798×778, white bg + black outline (Gemini).
- **Baker built:** `tools/truck-sprite.mjs`. `node tools/truck-sprite.mjs` bakes
  `sprites/firetruck/drive.png`; `node tools/truck-sprite.mjs debug` writes
  `_clean.png` + `_debug.png` (wheel-circle overlay) for tuning.
  - Cleanup: border flood white→transparent (`WT 205`) + 2-pass defringe →
    verified clean, no halo.
  - **Wheel spin:** `WHEELS` hardcoded in source coords — rear `{199,664,r86}`,
    front `{614,661,r86}` (tuned against `_debug.png`). Rotates the **inner hub
    disc** (`0.6·r`) a full revolution over **5 frames** (always loops); tire ring
    stays.
  - Output (baked at **4× logical**, like the mook — `TARGET_H = LOGICAL_H*4`):
    **`sprites/firetruck/drive.png` = 2285×320, a 5-frame strip of 457×320 each;
    logical draw size 114×80.**

> **⚠ WORKING-TREE STATE (uncommitted):** `js/assets.js` and `js/truck.js` have
> **in-progress edits** (NOT committed — these are gameplay/render, hold for the
> playtest gate). Resume from these, don't rewrite from scratch:
> - `js/assets.js` ~line 560: **`Assets.register("truck", …)` is DONE** — loads
>   `drive.png`, slices the 5 frames, and handles `opt.hurt` via an offscreen
>   canvas (`_truckOC`) for the white hit-flash. Faces right.
> - `js/truck.js` ~line 21-24: constants added (`TRUCK_FRAMES 5, TRUCK_W 114,
>   TRUCK_H 80`, `_drive` img, a cannon-tip offset comment). **The `renderScene`
>   swap + spray-origin retarget still need finishing/verifying.**
> - Stray `sprites/firetruck/_drive4x.png` is a temp artifact (gitignored).

### NOT done — next steps (in order)
1. ~~Resolution decision~~ **DONE** — baker bakes at 4× (320px); draw scaled to
   `TRUCK_H = 80` via `scale = TRUCK_H / img.naturalHeight` (= 80/320).
2. ~~Register in `js/assets.js`~~ **DONE in the working tree** (see ⚠ above) —
   verify it draws correctly. Reference (Jon pattern is at ~line 511-557):
   ```js
   const _truckSheet = JH.Loader.img("sprites/firetruck/drive.png");
   const TRUCK_FRAMES = 5, TRUCK_H = 80;   // logical draw height
   Assets.register("truck", (p, opt, ctx, x, y, facing) => {
     const img = _truckSheet; if (!img || !img.complete || !img.naturalWidth) return;
     const fw = img.naturalWidth / TRUCK_FRAMES, fh = img.naturalHeight;
     const f = (opt.frame | 0) % TRUCK_FRAMES;
     const scale = TRUCK_H / fh, dw = Math.round(fw * scale);
     ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
     ctx.imageSmoothingEnabled = false;
     ctx.drawImage(img, f * fw, 0, fw, fh, -Math.round(dw / 2), -TRUCK_H, dw, TRUCK_H);
     ctx.restore();
   });
   ```
   `JH.Loader.img(path)` is the preloaded-image loader used everywhere.
3. **Swap into `js/truck.js` `renderScene`:** replace the placeholder chassis
   block (the red-rect tank/cab + top-cannon rects) with
   `A.draw(ctx, "truck", t.screenX, ty, 1, { frame: wheelFrame })`, where
   `wheelFrame = Math.floor(sc.scrollX / SPIN_PX) % 5` (tie spin speed to scroll;
   pick `SPIN_PX ≈ 22` and tune). Truck faces **right** (no flip). Keep the
   **hit-flash overlay** (white rect over the sprite bounds while `t.hitFlashT>0`).
   The sprite has Jon baked in — the separate Jon draw is already removed.
4. **Move the spray origin to the cannon barrel tip.** In `_hose`, the droplets
   currently emit from `gunX = t.screenX + 12, gunY = feetScreenY(depth) - 21`.
   Re-point to the actual cannon tip on the sprite (top-mounted, forward). Easiest:
   have the baker also print the cannon-tip pixel in output coords, or eyeball it
   from a screenshot and set the offset. Tune via headless screenshot.
5. **Headless-screenshot** the run to confirm sprite + wheel spin + spray-from-gun.

### Gotchas for next session
- **Environment changed:** the shell is now Windows Git Bash at `/d/Projects/jon-hose`
  (earlier turns ran in a Linux sandbox at `/home/user/jon-hose` with chromium at
  `/opt/pw-browsers/...`). **That chromium path won't exist on Windows** — use the
  **`headless-playtest` skill** (msedge channel) for headless runs here.
- The **dev server** (`npm run dev`, :5173) has been dying between runs — restart
  it before each headless session.
- **Untracked new files to commit** (safe — assets + tool, not gameplay feel):
  `tools/truck-sprite.mjs`, `sprites/firetruck/{jon-truck.png, truck.png,
  drive.png}`. `_clean.png`/`_debug.png` are debug artifacts (delete or gitignore).
- `?truck=1` boots straight into the escape (debug entry, `main.js`); note it
  starts at the level's beginning so the backdrop shows the night-city skyline,
  not the fire-world one (the real post-Slayer flow captures the fire backdrop).

## 4. Still open after the sprite lands (from the assets/polish plan)
Real art for: **road/fire parallax**, **hydrant**, **wrecks/debris**, **collapse
wall**; a **distance-to-gate progress bar**; **hazard telegraphs** (readability at
speed); the **ass-man arrival teaser** (`sprites/assman/ass-man.png` exists);
audio (engine loop, hose loop, tire screech, etc.). See
`docs/superpowers/plans/2026-07-06-fire-truck-assets-and-polish.md`.

## 5. Gate Crash finale — IMPLEMENTED (2026-07-07), held for playtest

The Firewall's old instant despawn is replaced by an authored finale, built per
`docs/superpowers/plans/2026-07-07-gate-crash-finale.md` +
`docs/superpowers/specs/2026-07-07-gate-crash-finale-design.md`:

**detonate** (growing chassis booms, road scroll eases to a stop) → **whiteout**
(white ramp/hold; the road restages into the walkway tableau behind the white) →
**reveal** (white fades onto a pale dawn sky / cloud-deck walkway; the empty-cab
truck races the gate while Jon is blast-thrown in a spinning arc) → **crash** (the
truck rams the Air World gate, becomes the wreck at its foot with fire + portal
glow, gate blows open) → **walk** (player walks Jon into the gate; enter-fade →
`afterTruckRun()` win stub).

- **Config:** `JH.TRUCKRUN.finale` block + `JH.TruckBalance` finale helpers
  (`finaleWhite / boomInterval / boomScale / throwArc / gateReached`) — committed
  (TDD, 5 new tests; full suite **229/229**).
- **Art:** `sprites/firetruck/wreck.png` (dark-matte defringe bake) + the
  `truckWreck` painter — sprite committed; painter lives in `js/assets.js`.
- **Phase machine + walkway tableau render:** in `js/truck.js`.

> **HELD FOR THE PLAYTEST GATE (uncommitted):** `js/truck.js` (finale phase
> machine + `_renderWalkway`) and `js/assets.js` (`truckWreck` painter) are
> feel-bearing and stay UNCOMMITTED until the user plays them, alongside the
> pre-existing playtest-held `js/game.js` / `js/world.js`. Only config, balance,
> tests, the baker, the sprites, and docs are committed.

**Honest e2e verification (headless, msedge):** booted `?truck=1`, fast-forwarded
`scene.t` to the boss (the only rig), then **actually fought the Firewall** by
matching truck depth to the roaming weak spot and spraying its wind/open windows —
killed it in **~10s** (hp 1360→0, no hp-cut needed). The finale then played with no
page-eval interference: all five phases fired in order, essence banked (+3), Jon
walked into the gate, scene torn down, `Game.state === "win"`. **Zero pageerrors,
zero JS errors**; the only console 404s are the known pre-existing `sprites/church/*`
misses. 8-frame screenshot pack captured for the user's playtest review.
