# Air Act — Ass Man (design spec)

*Date: 2026-07-12 · Status: user-approved in brainstorm (corrections applied) ·
Builds after "Rummage Sale" + "Deepdive" release; branch will fork from main
once both land.*

## Summary

The campaign continues past the gate crash. The Air World is the warzone of
**Ass Man** — a superhero of the Jon Hose cinematic universe (canon: the four
movie posters; Quake Walker already allies in-game, so the JHCU is
established). Jon arrives, relaxes in plain clothes; **Ass Man's dog** pees on
the holy hydrant; Jon rages, suits up, and fights through the sanitation
horrors Ass Man has been battling — a misunderstanding brawl between heroes
that ends in alliance, an Assvengers tease, and the dog deputized to Jon as
the **K-9 Unit** relic.

Waves 30–36 (6 waves + boss), one set-piece, 4 new enemy types + 2
super-elites, and the game's **first true multi-phase boss** (debuts the
boss-phase language from the handbook queue).

## Locked decisions (user)

- **Slot:** extend past the gate. Victory ("Visits to Father Jon") moves to
  after the alliance. The fire-truck escape becomes the act transition it was
  built as.
- **Ass Man is a hero**, not a villain. Fight shape: misunderstanding brawl →
  alliance. At 0 HP he takes a knee — mutual respect, never death.
- **The dog is Ass Man's dog, and Ass Man is walking it at the entry**
  (original 2026-07-02 beat, user-confirmed over the draft's Jon-suits-up
  variant): a plain-clothes stranger's dog desecrates the holy hydrant; Jon
  rages; the STRANGER suits up — the transformation is Ass Man's power
  reveal, and the feud is declared face-to-face. Outro: NO boot-pee gag —
  Ass Man deputizes the dog to Jon as apology (→ K-9 Unit relic).
- **Roster fantasy:** "the crap he fights" — the sanitation-horror menagerie
  from the posters. Jon looks like more crap to fight; that's the
  misunderstanding.
- **Scope:** full flagship act (waves + set-piece + multi-phase boss +
  cutscene bookends).
- **Stink clouds have no drawn ground ellipse.** They render as billowing
  gas, growing in from the vent point — never appearing at full size. Rim is
  hitbox still holds structurally: the puff mass is generated FROM the same
  footprint function the hit test uses (one shape source), so the visible
  gas edge and the effect edge agree; there is just no stroked outline.

## Act structure

| Wave | Content |
|---|---|
| 30 | Plunger Fiends + TP Mummies (the two core regulars, light count) |
| 31 | Same pair, fuller; first gust lanes appear as terrain |
| 32 | + Gasbags; elites start seasoning |
| 33 | **Set-piece: Cloudline Holdout** — gusts push Jon toward the walkway edge while waves land; survive the timer. Edge is a drawn hazard line (rim rule), being pushed past it costs HP + resets Jon inward (no instant death). |
| 34 | + Bidet Turrets pre-placed; full mix; first super-elite |
| 35 | Full mix, second super-elite, densest wave |
| 36 | **Ass Man** |

- `actLevelForWave` extends to 4. Every act-indexed array gains an entry:
  `SPRINKLE.counts`, `TICKETS.budgets`, `WAVEFLOW.fieldCap`,
  `SUPER_TUNE.hpByAct`, `SHOP.relicGradeOdds` (6th entry). `WAVE_TRIGGERS`
  extends; the death matrix picks the new waves up automatically.
- One vendor visit at the act boundary (post-arrival, pre-wave-30) and the
  standard sigil beat after the set-piece, per existing cadence.

## Air element verbs (two, no more)

1. **Stink clouds** — the air-element ground hazard. Standing in gas drops
   Jon's PRESSURE TIER (attacks the weapon, not the HP bar — honest numbers:
   no hidden damage, the spray visibly weakens). Spraying into a cloud
   disperses it (water washes air; dispersal time scales with spray damage,
   mirroring fire-patch dousing). Render: billowing puffs grown from the
   vent, no drawn ellipse; footprint function shared by render + hit test.
2. **Gust lanes** — telegraphed horizontal wind bands (SwitchBoss.lineHits
   precedent: one shape feeds telegraph, draw, and shove). They displace Jon
   and light enemies along X; dodged by depth. Used as terrain (waves 31+),
   by the set-piece, and by the boss.

No third verb. Wind never bends the spray itself in this act (parked as a
possible future super mechanic).

## Roster — regular → elite → super-elite

All four types get standard gold-bar elite forms. Threat-score targets
(damage-per-10s, handbook method) sit in the existing band: rushers near
mook/charger (~60–105), control pieces near smelt/fuse (~35–45). Exact
numbers derived at plan time and verified with the threat-score script.

1. **Plunger Fiend** — rusher (charger slot). Lunges and **latches**: while
   latched it drains Jon's WATER TANK (not HP); a dash breaks the latch.
   Clogs the hose — on-theme, attacks the weapon. Latch has a clear stuck-on
   sprite state; drain rate visible on the tank bar.
2. **TP Mummy** — harasser. Enters by drifting down on toilet-paper
   streamers (the act's fuse-style drop-in). Throws TP wrap snares: brief
   slow on hit (soft snare, never a full root). On death, unravels into a
   one-shot gust puff that shoves.
3. **Gasbag** — zone control. Hovering stink spirit; periodically vents a
   stink cloud beneath itself. Popped quickly (before its first vent
   finishes), the cloud bursts on ENEMIES instead — a skill reward that
   makes fast target-priority feel great.
4. **Bidet Turret** — artillery. Pre-placed porcelain emplacement lobbing
   pressurized water arcs back at Jon (his own element returned; SmeltBomb
   arc idiom, honest telegraphed landing spots — shared shape). Their arcs
   douse fire patches if any exist (world consistency).

**Super-elites** (waves 34–35, one per wave, red frame, signature moves):
- **Super Plunger Fiend — "Triple Latch":** leaping vacuum yank that pulls
  Jon toward it before the latch attempt (telegraphed pull cone).
- **Super Gasbag — "Fog of War":** on death, bursts into a mega-cloud plus
  two mini-gasbags. (Pop-fast reward still applies: killed before first
  vent, the mega-cloud lands on enemies.)

Per the recorded principle, the other two types' super forms are deferred
until a later pass (as furnace's still is) — designed moves required first.

## Ass Man (wave 36) — first multi-phase boss

Arena: the Air World plaza. HP gates at 100% / 66% / 33%. Poster taglines as
fight barks ("FIGHTING CRAP. ONE ASS AT A TIME.", "THE CHEEKS HAVE CLAPPED
BACK."). Enrage latch = phase-3 entry (prayer_bead interacts normally).

- **Phase 1 — Grounded Glutes** (100–66%): brawler footsies.
  *Cheek Clap*: telegraphed cone shockwave (one cone shape: telegraph, draw,
  hit, shove + damage). *Hip Check*: charger-style line dash. *Toilet Toss*:
  arcing porcelain with a marked landing ellipse, brief shard zone.
- **Phase 2 — Air Superiority** (66–33%): he flies (cape out). Out of the
  hit band while airborne; vulnerable ONLY during *Glute Slam* landings
  (GK-slam shared-shape precedent — the drawn slam ellipse is the hit
  ellipse, and his landing recovery is the damage window). *Clap Back*:
  airborne claps send horizontal pressure waves down lanes, dodged by depth.
  Summons a gust lane while aloft.
- **Phase 3 — Glute Force Trauma** (33–0%): clap-storm — expanding shockwave
  rings from his position with moving safe gaps (rings are drawn rims = hit
  rims, GUSH-pulse tech reused); each storm burst ends in a long exhaustion
  window (bent over, hands on knees — the big honest opening).
- **At 0 HP:** takes a knee. No death sequence. Flows into the outro beat.
- HP scales with the existing boss formula (`1 + 0.02·power`); phase moves
  gate on hp fraction, not timers, so the fight length tracks player power.

## Cutscene bookends

- **Entry (replaces the current post-gate victory):** gate walk-in → sky
  suburb vista (clouds below the walkway, drifting TP, distant golden
  porcelain per the Ass Man 3 poster) → a plain-clothes stranger strolls
  the walkway walking his dog → the dog stops at the holy hydrant and pees
  on it → Jon eye-twitch close-up, rage → the STRANGER calmly drops the
  leash (the dog wanders off into his warzone), and SUITS UP — transformation
  flourish reveals ASS MAN (cape snap, chest lettering glint; his power
  reveal) → he declares the feud with a poster bark and takes off down-lane
  → wave 30 banner: his warzone now stands between Jon and him. Sight-gag
  driven, minimal dialogue; reuses the cutscene/boarding-beat tech from the
  truck finale.
- **Outro:** Ass Man kneels → the dog trots back to HIM → Jon's rage
  deflates (he fought a hero over the dog's crime — and the hero knew it) →
  Ass Man apologizes and DEPUTIZES the dog to Jon → Assvengers tease card
  (Quake Walker + Jon + Ass Man; the poster alien silhouetted — the
  long-game hook; no gameplay attached) → victory flow ("Visits to Father
  Jon" stats) runs after.

## K-9 Unit relic (the act's payoff)

Granted by the outro (not sold): the deputized dog follows Jon. Effect
(flat-gear rule): periodically **marks** the nearest enemy; marked enemies
take +N flat spray damage (number at plan time, tuned against brass nozzle's
+10). Appears in the relic panel with its own icon; survives death like all
relics; listed in the test range with "(needs real run)" until granted.

## Art & audio notes

- Ass Man sprite: blue suit, gold cape/gloves/boots, gold chest lettering,
  peach-emblem belt — bake via the boss-chassis pipeline (Switch/GK
  precedent); procedural fallback first, per the pipeline rule. Flight pose
  + slam pose + kneel pose required.
- Roster sprites: procedural fallbacks ship the act; baking follows as its
  own art pass (registerBaked). NEVER rebake the protected mook/fuse sets.
- New backdrop: cloudline street (one new Background variant — scoped to
  this act, not the full Areas & World pass from the queue).
- Audio: cheek-clap needs a proper THUNDERCRACK; stink clouds get a low
  fizz; reuse/pitch existing cues first, bespoke only if playtest demands.

## Non-goals (YAGNI)

- No jump, no melee (permanent).
- No Assvengers gameplay — the tease card is a card, nothing more.
- No spray-bending wind mechanic in this act.
- No new benediction element content (air benedictions/pillars already
  exist; the act consumes them as-is).
- No church persistence changes; no co-op hooks.
- Plunger/TP super forms deferred (need designed moves).

## Build shape (at plan time)

Three plans, in order, each with its own SDD cycle:
1. **World & roster core:** act structure/config extension, backdrop, the
   two air verbs, 4 regular types + elites, waves 30–32 playable.
2. **Pressure & set-piece:** super-elites, Cloudline Holdout, waves 33–35,
   threat-score balance pass (quantified, per handbook).
3. **Ass Man & bookends:** boss (3 phases), entry/outro cutscenes, K-9 Unit
   relic, victory-flow move, release as the act's minor.

Testing per repo rule: pure helpers dual-exported and unit-tested (cloud
footprint/dispersal math, latch drain, gust displacement, clap-ring rims);
rim tests for every new shape; headless full-act run before the playtest
gate; suite derives from config throughout.
