# Fire-Truck Escape — Assets & Polish Plan (selling the design)

Date: 2026-07-06
Status: Inventory for the art/juice pass (Task 9 of the implementation plan, expanded)
Branch: claude/fire-truck-minigame-concept-2pdlg0
Companion: `docs/superpowers/plans/2026-07-06-fire-truck-escape.md` (impl plan),
`docs/superpowers/specs/2026-07-06-fire-truck-escape-design.md` (spec)

The mechanics ship on **placeholder rectangles** and are headless-verified
(Tasks 1–8c). This doc inventories everything needed to turn that prototype into
a build that *sells the fantasy*, grounded in what art already exists in the repo
(so most of it is reuse, not new work).

## 0. The three things the art + juice must sell

Everything below serves one of these. If an asset doesn't push one, it's P2.

1. **SPEED** — the world is *tearing* past at high speed (the Battletoads rush).
2. **THE BIG HOSE** — you are wielding a firehose *cannon*, not Jon's thin cone.
   It should feel absurdly powerful.
3. **THE ESCAPE** — the Fire World is dying *behind* you; keep moving or the
   collapse eats you.

## 1. What's a rectangle today (current placeholders)

| Element | Placeholder now | Where |
|---|---|---|
| The truck + Jon | red rect + white block | `truck.js` renderScene |
| Road / parallax | flat fill + scrolling lane dashes | `truck.js` |
| Hazards (fuse/smelt/pyro/wreck) | kind-tinted blocks | `truck.js` HCOL |
| Hose beam | translucent blue swath | `truck.js` |
| Fire patches | orange ground ellipse | `truck.js` |
| Hydrant | blue block + wash ring | `truck.js` |
| Collapse wall | red gradient band + "FORWARD!" | `truck.js` |
| Furnace boss | orange block + blue HP bar | `truck.js` |
| Essence cross | gold "+" | `truck.js` |
| Boarding truck / crumble | red rect + falling debris squares | `game.js` drawTruckBoard/drawCrumble |
| HP / water bars | bare filled rects | `truck.js` _bar |

## 2. Art assets — reuse first (per CLAUDE.md art rules)

Existing sprite dirs confirmed: `jon`, `fuse`, `smelt`, `pyro`, `furnace`,
`slayer`, `assman`, `environment` (debris), `fx` (boom-big/mid/small,
fire-big/small/jon, portal), a `hydrant` painter (play-world `drawHydrants`).
Bakers: `enemy-sprites.mjs`, `boss-sprites.mjs`, `icon-sprites.mjs`,
`curate-fx.mjs`, `pixellab-animate.mjs` (imagen-gen is 429-dead).

### P0 — the hero asset: the fire truck + Jon at the nozzle
- **NEW.** Side-view truck: cab + water tank + big roof/side-mounted monitor
  nozzle, Jon on the running board working it. States: **rolling** (wheel spin),
  **firing** (nozzle kick + beam origin), **damaged** (smoke/tilt at low HP),
  plus the **boarding** pose for the drive-in scene.
- Source: keep the procedural rect as the fallback (registerBaked pattern), then
  bake a real sprite via a node tool (mirror `boss-sprites.mjs`: baked chassis +
  runtime overlays for the nozzle/wheels). Jon can be composited from existing
  `sprites/jon/*`. **This is THE asset** — if only one thing gets real art, it's
  this; everything else can stay stylized.

### P0 — road + parallax (this is most of the SPEED sell)
- Scrolling **road foreground** (asphalt/lane texture already dashes; add rush).
- **Parallax layers** reusing `JH.Background` machinery, fire palette:
  - *near* — guardrail / roadside debris whipping past (the strongest speed cue),
  - *mid* — burning Fire-World silhouette,
  - *far* — smoke + ember sky, moon through haze.
- Fire-World **skyline on fire**: recolor the existing Background skyline + layer
  `fx/fire-*` flames along rooftops.

### P1 — hazards (mostly REUSE — big win)
- **fuse / smelt / pyro / furnace**: draw the **existing baked sprites** at road
  scale in place of the tinted blocks. Near-free; they're already registered.
- **Wrecks / molten debris**: adapt `sprites/environment/debris.png` +
  `fx/fire-small` for burning-car / slag-chunk variants (2–3).
- **Hydrant**: reuse the play-world `hydrant` painter/sprite; add a smashed frame.

### P1 — collapse wall
- Animated wall of fire + tumbling rubble: tile `fx/fire-big` frames + ember
  particles over the current gradient (which stays as the fallback). Heat-shimmer
  optional (P2).

### P1 — furnace road-boss
- Reuse the **furnace** sprite (baked `elite_*` frames exist) scaled up with a
  "rolling/among-flames" treatment; theme the HP bar (see HUD).

### P1 — pickups + combat FX (reuse `fx/`)
- Essence cross: reuse the existing cross/`icons` art.
- Hose water: fatten the existing spray particles into a **plume** + **impact
  splashes** + enemy **wetness** darkening (the game's established hurt-read).
- Extinguish **steam**, hydrant **gush**, lane-**wash sheet**: compose from
  `fx/fire-big` (reverse-tint to steam) + `fx/boom-*`.

### P2 — Air World arrival teaser (high payoff, cheap)
- **`sprites/assman/ass-man.png` already exists.** Use it for a "THE WINDS
  RISE… / TO BE CONTINUED" card at the gate, seeding Ass Man. Sells "this bridges
  to the next world" for almost no cost, and slots the real handoff later.

## 3. VFX / juice — sells SPEED + the BIG HOSE + impact

| FX | Sells | Pri | Source |
|---|---|---|---|
| Speed lines / motion streaks | speed | **P0** | procedural — cheapest, biggest speed win |
| Truck fire/exhaust trail | speed + power | **P0** | reuse `fx/fire-small` behind the truck |
| Wheel spin + road-blur | speed | P1 | sprite frames / motion blur band |
| Hose plume + impact splash + wetness | the BIG hose | **P0/P1** | scale existing spray particles |
| Collision crunch + debris + hit flash | impact | P1 | `fx/boom-small` + shake tiers |
| Camera: speed-bob, brake-lurch, furnace punch-in | weight | P1 | existing `shake()` + a scene zoom |
| Wall heat-shimmer + ember rain | the escape | P2 | displacement / particles |
| Furnace-break steam blast + slow-mo | payoff | P2 | `fx/boom-big` + brief timescale dip |

## 4. Audio — currently only the `dread` synth stub

SFX are synth (`JH.SFX` in config.js) — cheap to add in the same style; sustained
loops need a held node or the Music system.

| Sound | Sells | Pri |
|---|---|---|
| Engine loop (rumble, pitch ↑ with speed) | speed, always-on | **P0** |
| Hose blast loop (pressure-tracking, beefier than `spray`) | the BIG hose | **P0** |
| Tire screech (arrival brake) | the drive-in beat | P1 |
| Collision crunch | impact | P1 |
| Hydrant smash + gush | refuel payoff | P1 |
| Furnace roar (loop) + extinguish hiss | climax | P1 |
| Wall fire roar (loop) | the escape | P1 |
| Essence pickup chime | reward | P1 (reuse `coin`) |
| `dread` low sting | the sequence trigger | **DONE** (synth; upgrade = P2) |
| Ignition / door on board, arrival stinger | framing | P2 |

## 5. HUD / UI

- **Truck HP + water bars** — theme to match the game HUD (currently bare rects).
- **Distance-to-gate progress bar** (**P1, strong design-seller**): shows how far
  to the Air World AND the collapse wall creeping behind the marker — makes the
  60s a legible *journey* with mounting urgency. Cheap, high-impact.
- **Essence tally** — pickup floaters + an arrival total (`lastTruckEssence`
  already tracked).
- **Prompt styling** — "BOARD (E)" to match the portal-prompt look.
- **Furnace HP bar** — themed, with a "DOUSE!" label.
- **Intro title card** "THE ESCAPE" (P2).

## 6. Design-selling beyond assets (feel / readability / tuning)

- **Incoming-hazard telegraphs** (**P1, readability-critical**): lane warning
  chevrons a beat before a hazard reaches the truck. Rim-is-hitbox: the marker
  shares the hazard's shape. Without this, high speed reads as unfair.
- **Greed read**: essence in risky lanes should visibly *entice* (glow/bob/pull)
  so diving for it is a real, legible temptation — the core skill expression.
- **Tuning pass** (post-playtest): the timeline windows (density), `scrollSpeed`,
  `hoseDps/Band`, hydrant spacing, wall creep/recover, furnace `hp`, essence
  payouts — all in `JH.TRUCKRUN`. Driven by your feel notes.
- **Arrival payoff**: the ass-man teaser (§2 P2) closes the loop emotionally.

## 7. Production constraints (CLAUDE.md §5)

- **Procedural-first**: the current rectangles ARE the registered fallbacks; bake
  real sprites via node tools and keep both (registerBaked poseFn + fallback).
- **Imagen is 429-dead** — hand-bake / node tools only.
- **Never rebake** hand-cleaned `sprites/mook/*`, `sprites/fuse/*`.
- Generate art at **~4× the logical target** (480×270 logical → dpr-scaled).
- **Maximize reuse**: fire roster sprites, `sprites/jon/*`, `fx/*` (boom/fire/
  portal), the hydrant painter, `environment/debris`, `assman/ass-man`.

## 8. Build order (what actually sells it, in sequence)

1. **P0 — core fantasy** (do first, biggest perceptual jump):
   truck hero sprite · road parallax (near layer) · speed lines + fire trail ·
   engine loop + hose-blast loop audio.
2. **P1 — the world + readability**:
   swap hazards to real sprites · wall + furnace art · hose/collision VFX ·
   HP/water + **distance-to-gate** HUD · **hazard telegraphs** · greed-read glow ·
   remaining SFX.
3. **P2 — polish + payoff**:
   crumble/boarding art · camera punches + furnace slow-mo · **ass-man arrival
   teaser** · title card · audio upgrades.

After the P0 tier the run should already *feel* like the pitch; P1 makes it
readable and complete; P2 is the shine. Each item lands behind its procedural
fallback, so the build stays playable throughout — and everything stays on the
feature branch until you sign off per the playtest gate.
