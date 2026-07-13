# The Deepdive TV — kibble accelerator (design spec)

*Date: 2026-07-06 · Branch base: progression-pass (≈ live v0.27.6 "The Handbook")*

## Summary

When Jon walks into a shop interlude carrying a **large banked kibble buff**
(≥ 20 s remaining), a **TV** appears in the lane alongside the vendor. Sitting
at it fast-forwards **the whole game world** — a gradual, sound-and-effect
time-distortion ramp to **10×** — so the kibble heal-over-time resolves in a
couple of real seconds while Jon vanishes into a YouTube rabbit hole. Pure
comic relief that doubles as a "cash in your over-eating" convenience.

The mechanic and the gag are the *same code*: because kibble already heals on
per-frame `dt`, scaling world time makes it drain and heal 10× for free, and
the visibly-accelerated world *is* the joke.

## Design decisions (locked with user)

- **Full-HP / already-full rule:** *drain regardless.* The kibble timer keeps
  burning at the sped-up rate whether or not healing lands. Sitting mindlessly
  can waste banked kibble — that's the algorithm eating your afternoon.
- **Cancel:** *instant intent, eased exit.* Any movement input or a second
  confirm ends the deepdive immediately; the time-distortion **ramps back down
  over ~0.6 s** rather than snapping, for feel.
- **Speed-up scope:** *the whole world*, not just Jon's animation — achieved via
  a global time-scale on the fixed-step loop. Gradual ramp **in and out** with a
  time-distortion visual **+ sound** over roughly a second.
- **Comedy framing:** *fake YouTube on the TV screen* — rotating clickbait
  titles, a racing progress bar, "Up Next", view counts; Jon glued to it with
  occasional quip captions.
- **Station placement (author's call, accepted):** the TV spawns **further
  down the lane than the vendor** so the two walk-up stations never contend for
  the same E-press.

## Non-goals (YAGNI)

- ~~No overflow conversion (no temp shield / suds from healing past full)~~
  **OVERTURNED by user 2026-07-13:** while diving, kibble healing past full
  HP banks as an OVERSHIELD (cap `DEEPDIVE.shieldCap`) that soaks damage
  first and never recharges. Same round: threshold 20→10 and gated at
  SIT-time (the TV always spawns; short bank shows [REQUIRES KIBBLE] in
  red), and the leaderboard clock counts REAL seconds during a dive
  (deepdive is a net positive).
- No minigame, no scrubbing, no channel selection — sit, binge, heal, stand.
- No persistence across runs or shops; the TV is a per-interlude prop.
- Not armable outside a shop. It can never overlap combat because shop
  interludes contain no wave enemies — so nothing dangerous is ever sped up.

---

## Architecture

Four small, independently-testable units. New surface is deliberately thin:
the feature reuses the existing floating-text helper, the `essenceDim`
full-screen-overlay pattern, the `ShopNPC` prop shape, and the sigil/shop
walk-up interaction pattern.

### Unit 1 — Config (`js/config.js`)

```js
JH.DEEPDIVE = {
  threshold: 20,    // s of banked kibble required at shop-spawn to spawn the TV
  maxScale: 10,     // peak world time multiplier
  rampUp:   0.8,    // s of REAL time to ramp 1 -> maxScale
  rampDown: 0.6,    // s of REAL time to ramp back to 1
  stepCap:  12,     // MAX_STEPS override while deepdiving (default JH.MAX_STEPS = 5)
  titleSwap: 2.5,   // s of SCALED time between fake-video title swaps
  laneGap:  40,     // px further down-lane than the vendor the TV sits
  titles: [ /* clickbait pool, see §Presentation */ ],
  quips:  [ /* Jon caption pool, see §Presentation */ ],
};
```

All tunables land verbatim; balancing happens in playtest, not in code review.

### Unit 2 — Time-scale seam (`js/game.js`, `frame()` + state)

New game state: `this.timeScale = 1`, `this.deepdiving = false`.

The fixed-step loop ([current game.js:1306-1320]) becomes:

```js
frame(now) {
  if (!this.running) return;
  let dt = (now - this.lastT) / 1000;
  this.lastT = now;
  if (dt > 0.25) dt = 0.25;                 // tab-switch guard (unchanged)

  // Advance the ramp on REAL dt FIRST, so speeding up never feeds back
  // into the ramp rate (decouples ramp speed from sim speed).
  const D = JH.DEEPDIVE;
  const target = this.deepdiving ? D.maxScale : 1;
  const rate = (D.maxScale - 1) / (this.deepdiving ? D.rampUp : D.rampDown);
  const step = rate * dt;
  this.timeScale = target > this.timeScale
    ? Math.min(target, this.timeScale + step)
    : Math.max(target, this.timeScale - step);

  this.acc += dt * this.timeScale;          // <-- scaled time drives the sim
  const cap = (this.deepdiving || this.timeScale > 1.01) ? D.stepCap : JH.MAX_STEPS;
  let steps = 0;
  while (this.acc >= JH.FIXED_DT && steps < cap) {
    this.update(JH.FIXED_DT);
    this.acc -= JH.FIXED_DT;
    steps++;
  }
  this.render();
  requestAnimationFrame((t) => this.frame(t));
}
```

Rationale:
- **Per-step `dt` stays `FIXED_DT`** — physics/collision determinism is
  untouched; only the *number* of steps per frame rises (~10 at 60 fps).
- The default `MAX_STEPS = 5` would cap effective speed near 5×; the
  `stepCap = 12` override lets the full 10× actually run. Safe because the
  interlude is nearly empty of entities (no spiral-of-death risk).
- The `timeScale > 1.01` term keeps the raised cap during ramp-down so the
  tail of the effect isn't clipped.
- **Kibble needs zero feature-specific code**: `kibbleTimer` decrement and
  `hp += kibbleRegen * dt` at [entities.js:277] already ride per-step `dt`, so
  10× steps ⇒ 10× drain **and** 10× heal, and "drain regardless of full HP"
  falls out for free.

### Unit 3 — `DeepdiveTV` prop + interaction (`js/entities.js` + `js/game.js`)

`DeepdiveTV` mirrors the tiny `ShopNPC` class shape (x, y, z, facing, t,
bodyW; `update(dt)`; `draw(ctx, cam)`), plus its own screen-render state
(`videoT`, `titleIdx`). It joins the depth-sorted actor list next to the
vendor.

**Spawn** — piggyback the single shop-spawn seam ([current game.js:829],
`this.shopNpc = new JH.ShopNPC(x, …)`):

```js
this.shopNpc = new JH.ShopNPC(x, JH.DEPTH_MIN + 6);
this.deepdiveTV = (this.player.kibbleTimer >= JH.DEEPDIVE.threshold)
  ? new JH.DeepdiveTV(x - JH.DEEPDIVE.laneGap, JH.DEPTH_MIN + 6)   // further down-lane
  : null;
```

The TV persists for the whole interlude regardless of how kibble drains after
spawn. It is cleared everywhere `shopNpc` is cleared (wave start,
`respawnFromChurch`, `startGame`, win).

**Interaction** — a new `tickDeepdive()` called from `update()` next to
`tickSigils()`, using the same proximity + `input.buffered("confirm")` +
`input.consume("confirm")` idiom:

```js
tickDeepdive() {
  const tv = this.deepdiveTV;
  if (!tv) return;
  const pl = this.player;
  tv.near = Math.abs(pl.x - tv.x) < 22 && Math.abs(pl.y - tv.y) < 28;

  if (!this.deepdiving) {
    if (tv.near && this.input.buffered("confirm")) {
      this.input.consume("confirm");
      this.deepdiving = true;
      this.audio.play("...spinup...");       // §Audio
    }
    return;
  }
  // --- deepdiving: Jon is seated; suppress move/spray elsewhere via this.deepdiving ---
  tv.videoT += /* scaled dt is fine here (drives the fake-video race) */;
  // instant cancel: any move key OR a second confirm
  const bail = this.input.pressed("up") || this.input.pressed("down")
            || this.input.pressed("left") || this.input.pressed("right")
            || this.input.buffered("confirm");
  if (bail || pl.kibbleTimer <= 0) {         // auto-end when nothing left to binge
    if (this.input.buffered("confirm")) this.input.consume("confirm");
    this.deepdiving = false;
    this.audio.play("...spindown...");
  }
}
```

While `this.deepdiving`, Jon's own movement/spray input is gated (he's sitting)
— the movement branch in `Player.update` / the play-input block checks
`!game.deepdiving`. Note: `input.pressed` is edge-triggered per poll and
`update()` polls once per step; at 10× the edge is seen on the first step of a
frame only, so cancel won't mis-repeat.

### Unit 4 — Presentation (`js/game.js` render + `js/assets.js`)

- **Fake YouTube screen** (canvas-drawn on the TV prop, placeholder-art
  appropriate): a dark screen rect with a video area, a **rotating title** from
  `JH.DEEPDIVE.titles` (swap every `titleSwap` s of *scaled* time ⇒ ~0.25 s
  real ⇒ visibly autoplay-hell), a **progress bar** filling over "video time"
  (races at 10×), a fake **view count**, and an **"Up Next"** thumbnail box.
- **Jon**: drawn seated facing the TV (placeholder pose — art is disposable per
  the pipeline note; do not over-invest). Occasional caption from
  `JH.DEEPDIVE.quips` via the existing `game.float(x, y, text, color)` helper
  ([game.js:849]).
- **Time-distortion overlay**: a full-screen effect modeled on the existing
  `essenceDim` ramp ([game.js:1858-1871]) — scan-lines / slight chromatic
  offset + vignette + speed-lines, intensity tracking
  `(timeScale - 1) / (maxScale - 1)`. Ambient particles and the vendor's idle
  bob accelerate for free because the world runs on scaled time.
- **Prompt**: "E: deepdive" over the TV when `tv.near && !deepdiving`, matching
  the vendor/sigil prompt style.

**Draft title pool** (tunable):
- "Are FIRE HYDRANTS conscious? (they answered)"
- "I ate only KIBBLE for 30 days"
- "The DARK TRUTH about municipal water pressure"
- "POV: you're a dog at 3am"
- "This ONE hose trick BROKE the game"
- "Why do I keep RESPAWNING? (existential)"
- "Top 10 hydrants that ATTACKED back"

**Draft quip pool** (float above Jon, tunable):
- "wait — it's ALL kibble?"
- "liked & subscribed"
- "just one more video"
- "the algorithm knows me"

### Audio

Two one-shot SFX: a **spin-up** whoosh on sit and a **spin-down** on stand /
auto-end (reuse/pitch-bend an existing cue via `audio.play(name, {pitch})` if a
bespoke asset isn't warranted). A continuous warble is optional polish, not
required for v1.

## Data flow

```
shop spawn seam ──(kibbleTimer ≥ threshold?)──► spawn DeepdiveTV down-lane
      │
walk up + E ──► game.deepdiving = true
      │
frame(): ramp timeScale 1→10 on REAL dt ──► acc += dt·timeScale ──► ~10 fixed steps/frame
      │                                                                    │
      │                                          Player.update: kibbleTimer/heal burn 10×
      │
move-key / 2nd E / kibble==0 ──► deepdiving = false ──► ramp 10→1 over rampDown ──► control returns
```

## Error / edge handling

- **Kibble expires mid-deepdive** → `kibbleTimer <= 0` auto-ends the deepdive
  (ramp-down), so you're never stuck watching a dead buff.
- **Kibble drains below threshold before reaching the TV** → the TV was already
  spawned (checked at shop spawn) and remains sittable; the binge just heals
  less. Acceptable and on-theme.
- **Wave starts / player leaves shop** → TV cleared with `shopNpc`; if somehow
  `deepdiving` is still set, it is force-cleared and `timeScale` snaps toward 1
  on the next frame.
- **Tab-switch during deepdive** → the existing `dt > 0.25` clamp in `frame()`
  bounds the catch-up; combined with `stepCap` there is no unbounded step
  spiral.
- **Death / pause** cannot occur mid-deepdive in practice (no enemies), but
  `startGame`/`respawnFromChurch` reset `deepdiving = false`, `timeScale = 1`
  defensively.

## Testing

**Unit (node test runner):**
- Ramp math: given real dt, `timeScale` monotonically approaches `maxScale` in
  ~`rampUp` s and returns to 1 in ~`rampDown` s; clamps at both ends; never
  overshoots.
- Eligibility gate: TV spawns at `kibbleTimer == 20` and above, not at 19.
- Auto-end: `deepdiving` clears when `kibbleTimer` reaches 0.

**Headless playtest (`headless-playtest` skill):**
- Bank ≥ 20 s kibble, clear a wave → assert `game.deepdiveTV` present at the
  shop, positioned down-lane of `shopNpc`.
- Sit (walk to TV + confirm) → assert `timeScale` climbs toward 10 and
  `kibbleTimer` drops ~10× faster than a real-time baseline.
- Press a movement key → assert `deepdiving` false, `timeScale` ramps to 1,
  Jon's control returns.
- Screenshot the deepdive frame to eyeball the fake-YouTube screen + overlay.

## Release

Per the repo ritual, this ships as a **named minor release** (feature merge):
version bump in `package.json`, `CHANGELOG.md` entry, merge titled
`release: v0.X.0 - {Patch Name}` (candidate name: "Deepdive"). Gameplay is
playtested and user-verified before the merge, per the playtest-before-commit
rule.
