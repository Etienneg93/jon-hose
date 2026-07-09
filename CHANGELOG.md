# Patch Notes

Release ritual: every merge to main bumps `package.json`, adds an entry here,
and the merge commit is titled `release: v{version} - {Patch Name}` — the name
comes from the branch's main addition. The deployed build tag shows
`v{version} · {sha}`.

---

## v0.29.0 — Water Meter (2026-07-09)

Opt-in run telemetry plus an in-game fastest-win leaderboard, backed by a
Google Apps Script + Sheet. (Spec:
`docs/superpowers/specs/2026-07-08-telemetry-leaderboard-design.md`.)

### Telemetry
- Every run records where the player reached and died per wave, the
  benedictions chosen and items bought, and the outcome/deaths/kills/time/suds
  — sent once on a win (or on tab-close mid-run). Deaths respawn, so the data
  feeds a per-wave death-rate matrix rather than a single win/lose flag.
- Leaderboard name is entered on a title-screen step (blank = play
  anonymously — nothing is sent). The whole system is inert until an endpoint
  is configured.

### Leaderboard
- In-game **FASTEST WINS** board (top 10 by run time) reachable from the title
  and shown on the win screen, read live via JSONP.

### Backend
- `tools/telemetry.gs` (Google Apps Script) appends each run to a Sheet, serves
  the leaderboard, and rebuilds a per-wave death-rate matrix from a menu.
  One-time setup in `docs/telemetry-setup.md`.

## v0.28.0 — Fire Drill (2026-07-08)

The Fire-Truck Escape — a full designed interlude that plays after the
Slayer falls: pick his benediction, the world starts collapsing, and Jon
boards the rig for a scrolling getaway that ends by smashing into the Air
World. (Spec: `docs/superpowers/specs/2026-07-06-fire-truck-escape-design.md`.)

- **The escape run**: a scrolling drive out of the burning Fire World —
  weave lanes, dodge wrecks and telegraphed debris drops, smash hydrants
  to refuel, and work a top-mounted cannon that hoses fuses across every
  lane. Honest collision HP; a low-water hydrant lifeline; a collapse wall
  that rubber-bands the pressure behind you.
- **The Firewall boss**: the real wallboss chassis + roaming weak-spot
  iris core, with a swept PORT SLAM crush, a full-lane SURGE bolt, and an
  HP-scaled tentacle slam (more cables the more hurt it is).
- **Gate Crash finale**: the Firewall doesn't despawn — it detonates and
  **splits along a horizontal seam**, the halves parting up and down so the
  rig barrels through into a whiteout. Behind the white: a cloud walkway to
  the Air World marble gate, the Firewall crashed in two flaming halves,
  Jon blast-thrown out, the empty rig ramming the gate, and Jon walking in
  on foot.
- **Presentation**: baked hero-truck sprite (wheel-spin), engine-loop
  audio, speed lines + exhaust fire trail, a dedicated escape soundtrack,
  and a seamless world backdrop continuing from the boarding beat.
- **Dev**: backtick dev menu gains **POST-FIREWALL**, jumping straight into
  the Gate Crash finale for iteration.

## v0.27.9 — Sermon Notes (2026-07-07)

Live-playtest follow-up: a benediction that never fired, plus readable
per-tick feedback and a couple of UI fixes.

**Pressure Sermon actually fires now.** It required full pressure (≥80% tank)
on the exact spray-release frame, but 0.8s of spraying always drains the tank
below 80% first (100 tank / 36 drain → full pressure lasts ~0.56s), so its
release check was effectively never true. It now arms for the whole hold the
moment it reaches full pressure, and the cast VFX is a clear forward water fan
+ shake. (Audit: all 24 benedictions are wired; this was the one real bug.)

**Readable per-tick feedback** — mirrors the kibble `+N` heal floater:
- GUSH water regen shows a blue `+N` every 0.5s.
- Burn DoT shows a red `-N` on each 0.5s beat (actual HP lost).

**Sunday Suit** now drops a whole second Holy Essence cross (each worth 1)
instead of one worth double. The world-dim keys off "any cross out", so it
neither stacks nor lifts until both are collected.

**Level-up stat text** lingers longer (0.9s → 1.4s beat) and no longer clips
behind the overhead HP/water bars.

**UI** — the sigil prompt reads `E: CHOOSE BENEDICTION` (the floating
"CHOOSE ONE" already says the rest fade).

**Dev-only** — the target range now has a benediction-picking section (one
walk-up sigil per benediction; pick any combo, re-pick to deepen) for testing.

## v0.27.8 — Shop Class (2026-07-07)

Live-playtest follow-up: guaranteed pre-boss shops, calmer wave transitions,
and a big banner declutter.

**Shops** — a vendor now always appears in the corridor right before a boss,
so you can dump Suds to gear up. Guarded so the shop never lands in two
corridors in a row: a cadence/post-boss shop is skipped when the next
corridor will already force a pre-boss one.

**Wave transitions** — finishing a fight near the arena's right edge (or
holding right while grabbing a benediction) no longer instantly rolls the
next wave. The trigger now guarantees a stretch of corridor past where you
cleared (`JH.WAVE_GATE`), and the benediction sigil lineup is clamped clear
of it so walking out to inspect the last option can't cross the trigger.

**Banner declutter** — the banner is for things you can't just see, not
narration of the obvious:
- Cut the wave-clear / shop banners (`AREA CLEAR!`, `BOSS DOWN!`).
- Wave-start banner is now the wave name only (dropped `— FIGHT!` /
  `— ELITES!`; elite status reads via the gold bars).
- Cut the upgrade `X ACQUIRED!`, `TRY AGAIN!`, and `REINFORCEMENTS!`
  banners. Reinforcements now telegraph with a small localized dust puff at
  each arrival point instead. Kept: objective instructions, boss-name
  intros, benediction choose/acquire, ally-join beats, CONCERTA unlock,
  phase transitions.

**Victory screen** — added a Deaths counter to the run stats (a flawless
clear reads `Deaths: 0`).

## v0.27.7 — Weight Class (2026-07-07)

Live-playtest balance pass on the elite tiers and the difficulty curve —
heavy elites were out-massing the bosses, elites arrived all at once, and
the per-wave count ramped too hard too early.

**Elite / super-elite HP** — heavies no longer out-HP the bosses.
- New `JH.ELITE_TUNE` per-type HP damp, applied in `makeElite` after the
  eliteScale multiplier (smelt ×0.55, bulwark ×0.65). Because `makeSuper`
  builds on the elite-scaled def, one lever tames both tiers.
- Elite smelt ~1150–1590 → ~630–870; super smelt ~2290–3170 → ~1260–1750;
  elite bulwark ~670–930 → ~440–600; super bulwark ~910–1260 → ~590–820.
  All now sit below the boss of their act (was above The Big Drip / Switch,
  and every boss at high player power).

**Elite frequency** — elites ramp in instead of flipping on at once.
- New `JH.ELITE_FRAC` (by act) + `Game.nextEliteScale()`: a `tough` wave now
  makes only a fraction of its enemies elite, spread evenly by an
  accumulator across every spawn path (opening batch, reinforcement trickle,
  wall/holdout streams). ~30% (Act 2, introduced) → ~55% (Act 3, common) →
  ~75% (Act 4) → ~80% (Fire). Previously every enemy in a tough wave was
  elite the instant the first boss died. The super-elite still spawns one
  per wave at full scale.

**Fuse** — a slow stalk that arms and sprints.
- Base speed 78 → 54; new `litSpeedMult` 1.44 so it only sprints (back to
  ~78) once the wick lights within range; `litDrainFrac` 0.20 → 0.32 so a
  lit fuse burns down in ~3.1 s instead of 5 s.

**Per-wave enemy counts** — a smoother early ramp.
- `SPRINKLE.counts` `[1,2,3,3,4]` → `[1,1,2,3,4]` (delays the sprinkle ramp
  one act; keeps Act 4 / Fire pressure). STREET SWARM and OVERRUN each shed
  one mook. Totals now climb ~6→8→9→10→12 instead of leaping to 10 at
  wave 6 and peaking at 13.

## v0.27.6 — The Handbook (2026-07-06)

Docs-only release — no gameplay changes.

- **`docs/HANDBOOK.md`**: the committed project handbook — design
  principles with their origin stories, a systems map, the v0.27.5
  balance reference, and the forward vision queue.
- **Project skills** (`.claude/skills/`): `headless-playtest` (the
  verified browser-harness recipe and its input gotchas) and `release`
  (this very ritual, including the patch-vs-minor calibration).
- **README** refreshed to the v0.27.x state: run economy (levels,
  benedictions, pillars, Reliquary, voucher), super-elites, wave flow,
  baked-art pipeline, current file map, roadmap.

## v0.27.5 — Shield Inspection (2026-07-06)

- **Bulwark hp 420 → 300**: its defense is the dome, not the bar — elite
  ramps were turning it into a ~1,500-hp turtle sponge.
- **Dome duty cycle 7s up / 1.4s down → 5s up / 2.5s down**: it was
  sheltered ~80% of the fight; hose windows are now nearly twice as long,
  and stepping in to force the slam stays the aggressive counter.

## v0.27.4 — Fire Code (2026-07-06)

### Fire, regulated
- **Fire patches burn out on their own after 7s** — full size and full danger
  for the first ~4.5s, then a 2.5s fizzle where they visibly shrink and die.
  The shrinking rim is still exactly the hitbox.
- **Dousing scales with spray damage**: a built-up hose puts fires out far
  faster than the old flat rate (which remains the floor).

### Smelts, honest
- **Smelt waterMult 0.5 → 1**: survivability now lives in the health bar you
  can see (hp 300 → 450, a net ~25% softening). Elite and super smelts
  inherit the honesty — the super's bar reads true instead of hiding a 2x soak.
- Super smelt HP tune 3x → 2x; MELTDOWN fields 1 elite smelt + 5 fuses
  (was 2 + 4). The wave is a fight now, not a coverage lockout.

### Fixes
- **Switch + Gateway Krusher slam circles hit exactly what they draw** —
  dodging up/down out of the telegraph ellipse now actually escapes it
  (the old check ignored depth entirely).

### Progression & church
- Level-up water gains raised: +20 max water and +5 regen per cycle step —
  two laps of the cycle now reproduce the retired shop nodes (+40 tank,
  18→28 regen), with half landing early where the dry tank hurts most.
- Father Jon's voucher beat moved to the END of his sermon, rewritten to
  fit, and the ticket only materializes on the line where he offers it.

## v0.27.3 — Legible Liturgy (2026-07-06)

- All free-floating Church text (pillar details, Reliquary, prompts, rising
  floats, the Essence readout) now draws with a dark outline so it stays
  readable over the painted nave.
- The rising "+RANK" float starts above the station detail text instead of
  ghosting through it.

## v0.27.2 — Church Members' Discount (2026-07-06)

### Father Jon's voucher
- The first-death pity gift is now a **50% shop voucher** instead of a Holy
  Essence — Father Jon vouches for you with his old friend at the stall, and
  the chalkboard's "50% OFF FOR CHURCH MEMBERS" finally pays out. Prices
  show the cut while you hold it; the next purchase redeems it.

### Clarity
- Benediction offers now announce **"BENEDICTION — CHOOSE ONE"**, a pulsing
  CHOOSE ONE hangs over the sigil lineup, and the info card spells out
  "E: TAKE — THE REST FADE."
- The stat panel's KB row now says KNOCKBACK.

## v0.27.1 — Reliquary (2026-07-06)

Live-playtest follow-up to Benedictions: death no longer eats your boons,
and late waves surge instead of dripping.

### The Reliquary
- **Washed benedictions are no longer gone.** Death moves them into the
  Reliquary — a chest in the Church nave with gold motes hovering while it
  holds boons. Press **E to reclaim the next one for 1 Essence**, rank
  preserved. Dying again with unreclaimed boons keeps the higher rank.
  A fresh run still starts clean.
- **Father Jon's pity Essence is now handed over in the Church** — a cross
  set down beside him on your first death, collected in-scene — instead of
  materializing at the respawn point.

### Wave flow
- **Batch reinforcements:** with 3+ enemies queued, reinforcements hold
  until the field thins, then **3–5 arrive at once** with a
  REINFORCEMENTS! banner — a wave within the wave instead of one-for-one
  replacement. Small remainders still trickle in singly.

### Fixes & feel
- Buff timers (kibble, GUSH regen, Concerta, Spigot, storm, vigor...) no
  longer freeze through the Church and resume after respawn.
- Upgrade stat text lingers longer (0.9s beat, late fade) so it finishes
  readable.

## v0.27.0 — Benedictions (2026-07-06)

The progression release: levels give numbers, the elements give rules, the
Church gives favor — and getting stronger finally feels like something.

### XP & levels
- Kills grant XP; ~13 **level-ups per run** land instantly mid-fight with a
  flash, a chime, a water/HP top-up, and a fixed stat-gain cycle.
- Every stat gain (levels, shop, pillars, boons) plays a short **upgrade
  sequence** — the stat's icon rises off Jon with its +delta, chiming up a
  pitch ladder when several land at once.

### Benedictions — Hades-style run boons
- After every boss and set-piece, **three element sigils** appear: pick one
  by walking up (E). **17 boons, 3 duo boons, 4 legendaries**, all with
  rank-II Deepens — pull-free chain streams, scalding sprays, wall-slam
  crunches, turret stances, projectile-eating dashes and more.
- A bottom info card shows exactly what you're choosing; boon icons carry
  element + verb marks so your build reads at a glance.
- Benedictions wash away on death — the death loop's real stake. Everything
  else (levels, purchases, pillars) survives.

### The Church rebuilt — four element Pillars
- The Mirror is gone. Four pillars line the nave — Water open from the
  start, the others sealed behind their nemesis. Ranks are chunky stat
  packages with rank-3 capstones, and pillar favor **pulls that element's
  boons to your sigil beats**.
- Spending Essence rings a church bell; Essence itself is now **pickup-only**
  — bosses and the pity grant drop real crosses, and none can ever be lost.

### The event shop
- The vendor appears **every third wave** with three signature builds
  (Hydro-Dash, Fire-Marshal Spec, Hydro Lance), a rotating **2-of-10 relic
  stock** (Censer, Punch Card, Dowsing Rod, Sunday Suit...), and lifeline
  consumables. The stat-node tree is retired — levels carry the numbers.

### Drops & feel
- Pity timer (6 dry kills → guaranteed drop), need-weighted health/water,
  kibble that visibly ticks +HP, and a wave-clear bonus drop on tough waves.
- **Tab** shows your full stat sheet anywhere; 0% stats hide until earned.
- A baked 27-icon atlas replaces every glyph placeholder, and the Switch +
  Gateway Krusher wear real baked chassis with live blinking LEDs.

## v0.26.0 — The Giants (2026-07-06)

The whole game has teeth now: bigger waves that stay readable, a rare apex
enemy tier with signature moves, and an enemy ramp that finally sees all
of your power.

### Super-elites — the new apex tier
- Seven enemy types have **super-elite** forms: ~1.8x giants with red-framed
  health bars, big HP/damage, and a **signature move each** — the mook's
  lunging haymaker, the charger's wall-ricochet diagonal charge, the pyro's
  triple lob, the stalker's fakeout double-blink, the smelt's bouncing slag,
  the bulwark's thrown-shield barrier + slow zone, and the fuse splitting
  into three live fuses on death.
- Supers are **late-game only** (Act 4 + the Fire World); gold-bar elites
  remain the Acts 2–4 middle tier; Act 1 is pure regulars.

### Wave flow
- **Attack tickets**: only a per-act handful of melee enemies can wind up at
  you simultaneously — crowds stay readable at any size.
- **Trickle spawning**: a per-act field cap opens each wave (4 in Act 1) and
  the rest stream in as reinforcements instead of dumping at frame one.
- Bigger regular counts mid/late, a threat-curve pass over all 29 waves, and
  **Act 3 is now the earth act** — bulwarks debut in the rubble, pyros went
  home to the Fire World.

### Enemy reworks
- **Stalker**: blink and strike land in one beat — the windup after the
  blink is gone.
- **Fuse**: its head-fuse lights near Jon and burns its own health down to a
  real self-destruct — kill it before the bang. Elite fuses lob out a live
  fuse on death.
- **Furnace**: heat now glows through its arms and legs, and its death
  explosion hurls a slag at you.

### Scaling & economy
- The enemy ramp counts ALL player power (Overcharge, Mirror ranks); boss HP
  scales with your build so you see every phase.
- Vampiric heals at half rate vs elites too and its base drops to 5%; dodge
  caps at 25%.
- Tier-3 upgrades unlock from Act 2 at +20% price — the build finishes
  during the hard part.

### Feel
- Holy Essence crosses hover and **dim the whole world** until collected.
- Your first death each run banks a pity Essence with a word from Father Jon.
- A slim stat panel at the vendor shows your numbers and flashes what grew.

## v0.25.1 — Bake Sale (2026-07-04)

Every enemy on the street is now real baked pixel art, and the renderer got
cheaper while looking better.

### Art — baked enemy pass
- **Every regular enemy is baked pixel art now**: mook, charger, pyro, stalker,
  fuse, smelt, bulwark, furnace — elite variants included. The procedural
  painters remain only as loading fallbacks (Switch + GK still procedural,
  queued for a chassis/LED hybrid).
- Mook got a hand-cleaned frame pass: **12-step idle breathing loop** and a
  **4-frame haymaker windup** that ramps across the anticipation.
- Pyro's flame crown is the FX-pack fire animation riding the baked sprite.
- Furnace bakes at 4 heat steps; bulwark has shield-carried sprite variants;
  smelt bombs now spawn from the overhead hoist.

### Performance & glows
- Silhouette stamps (wetness, flashes, auras) now blit only their bounding box
  — a ~96% overdraw cut, pixel-identical output.
- All `shadowBlur` glows removed (Chromium streak artifacts). Non-round glows
  hug the sprite outline; radial discs remain only on round things.
- Burn aura flickers like fire instead of reading as a steady buff ring.
- Hydrant glow toned down.

### Fixes
- Dying while burning no longer carries the burn DoT into the Church respawn.
- Stalkers and fuses hold ground and facing at point-blank instead of strobing
  left/right over Jon's center.
- The first fuse of a wave drops from height instead of appearing mid-air.

### Dev
- Target range now has a **sprite gallery**: every combat entity as a labeled,
  frozen, unkillable statue for visual inspection.

## v0.25.0 — Juice Pass (2026-07-03)

The game-feel release: how hits read, how kills land, how the street sounds.

### Game feel — the Juice Pass
- Enemies now show damage as a **blue wetness soak** that builds with spray and
  drips off — no more white flash or squash throbbing on enemies.
- Kills confirm with a **150ms corpse collapse** — the body flattens to the
  ground and the particle burst pops as it lands.
- **Zero freezes in normal combat.** Hit-stop is reserved for boss-scale beats
  only; at hose kill density freezes read as lag, not impact.
- **Trauma-based directional screenshake** — hits kick the camera away from
  the impact; heavy moments stack shake instead of freezing the game.
- **GUSH combo overhaul:** x3 arms a water-regen window; every 5th milestone
  scales regen further **without cap** (x20 = 32 water/s) plus a water refund.
  Kill blips climb a pitch ladder as the combo grows.
- **Buffs stack, never overwrite:** kibble extends its own timer, and active
  buffs show as layered silhouette auras (green kibble ring outside the blue
  gush ring). HP/water bars run a traveling wave while boosted regen is live.
- **Independent Sound Effects channel** with its own slider — music mute no
  longer kills SFX; coin showers no longer chord-blast; dash got a real whoosh.
- **Burn damage ticks in half-second beats** (flash pulse + ember puff per
  tick) instead of a silent drain — and burning never squashes Jon.

### Input & movement
- **130ms input buffer** for dash/confirm — presses are no longer eaten during
  freezes and cooldown edges. Dash with no direction held goes toward facing.
- **Player-enemy body collision removed:** enemies can't corner-pin Jon, and
  dash phases through crowds instead of shoving them.

### Fire & hazard readability
- Every damaging ground zone now hits **exactly the ellipse it draws** (rim =
  hitbox): fire patches, fire rings, furnace vents, smelt smashes, fuse drops,
  Slayer slam, Quake leap.
- Burn stacks have i-frames like hits — overlapping fire can't insta-stack —
  with a sizzle cue on first contact.

### Shop & street
- The shopkeeper got a real sprite and a **full stall with runtime signage**,
  and he turns his head to watch Jon walk past.
- GUSH readout signals the live regen window.
- Pressure Charge delisted from the shop until its buff actually works.

### Art
- New Jon walk/idle/fire sprites (hose fixed in the walk cycle).
- New Father Jon face — portrait and in-world nave sprite.

### Fixes
- Boss deaths no longer flash the sprite back after the fade-out (and adds
  killed by the boss's death no longer linger frozen through the sequence).
- Pyro embers no longer bounce off an invisible line at the edge of the
  walkable band; Slayer fireballs fly dead straight off the cue.
- Stalkers no longer strobe left/right when they reach Jon.
- Slayer's intro banner shows the right name.

### Build & docs
- **Sprite URLs are cache-busted on deploys** — art updates now land without a
  hard refresh (JS/CSS already were).
- README brought up to date (5 acts, 5 bosses, church loop, audio channels);
  all plan docs carry STATUS banners; the idea-spec backlog lives in
  `docs/superpowers/plans/ideas/`.

---

## Earlier

- **v0.20.0 — The Fire World** (2026-07-02): next-level-pass — 29-wave 4-4-5-6-6
  street, the Boiler District + The Slayer, Smelt/Fuse/Furnace enemies, enemy
  variety pass, itch.io FX pack across 8 surfaces. (Walked back from a
  premature v1.0.0 call.)
- **v0.14.0** (2026-06-30): player death/ghost rework, Church polish, combat fixes.
- **v0.12.1** (2026-06-30): asset preloader gate + Father Jon talking portrait.
- **v0.12.0 — Church of the Holy Hose** (2026-06-30): the death-loop interlude,
  new Jon art, balance pass.
