/* =====================================================================
   config.js — single source of truth for tunables & data.
   Everything hangs off the global namespace `JH`.
   Tweak numbers here to balance the game; no other file should hardcode
   gameplay constants.
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});

  // ---- Rendering ------------------------------------------------------
  JH.VIEW_W = 480;          // logical canvas width  (16:9)
  JH.VIEW_H = 270;          // logical canvas height
  JH.FIXED_DT = 1 / 60;     // physics step (seconds)
  JH.MAX_STEPS = 5;         // clamp spiral-of-death after lag spikes

  // ---- The walkable depth band (2.5-D floor plane) --------------------
  // Characters live at a worldY in [DEPTH_MIN, DEPTH_MAX]. Screen Y is
  // derived from depth (+ jump height z). Bigger depth = lower on screen.
  JH.FLOOR_TOP = 168;       // screen-y of the back edge of the floor
  JH.DEPTH_MIN = 0;
  JH.DEPTH_MAX = 86;        // floor depth span in px
  // Ground-ellipse depth ratio: every ground-plane footprint (hazard zones,
  // domes, telegraphs) draws AND hits an ellipse (rx, rx * GROUND_RY) — the
  // hit test lives in Geo.inGroundEllipse (world.js).
  JH.GROUND_RY = 0.40;
  JH.LEVEL_LEN = 11200;     // world length of level 1 (logical px)
  // Zone boundaries sit in the free-walk corridor after each act's boss so the
  // 500px tint ramp (world.js) never bleeds into the locked boss arena behind it.
  JH.ZONE2_START = 4250;    // ruined district (Act 3) — Switch at 3780, Rubble Row at 4160
  JH.ZONE3_START = 8950;    // Boiler District (fire world) — GK at 8720, Fire Intro at 9100

  // Interactive fire hydrants: stand next to one to refill fast (any water
  // level). Deliberately sparse — checkpoints, not crutches: one at the start,
  // one after each boss, one at each act's midpoint. Each sits 100px before a
  // wave trigger (WAVE_TRIGGERS in game.js — keep in sync if triggers move),
  // past the shop vendor (T-150). Touching one sets the death-respawn
  // checkpoint (lastHydrantX).
  JH.HYDRANTS = [
    { x: 260,   y: JH.DEPTH_MAX - 12 },   // start
    { x: 1020,  y: JH.DEPTH_MAX - 26 },   // Act 1 midpoint (before WAVE 3)
    { x: 2160,  y: JH.DEPTH_MAX - 12 },   // after Big Drip
    { x: 2920,  y: JH.DEPTH_MAX - 26 },   // Act 2 midpoint (before BARRICADE)
    { x: 4060,  y: JH.DEPTH_MAX - 12 },   // after The Switch
    { x: 5200,  y: JH.DEPTH_MAX - 26 },   // Act 3 midpoint (before ASH CHARGE)
    { x: 6340,  y: JH.DEPTH_MAX - 12 },   // after Quake Walker
    { x: 7480,  y: JH.DEPTH_MAX - 26 },   // Act 4 midpoint (before THE GARDEN)
    { x: 9000,  y: JH.DEPTH_MAX - 12 },   // after Gateway Krusher
    { x: 10140, y: JH.DEPTH_MAX - 26 },   // Fire midpoint (before FURNACE TRIAL)
  ];
  JH.HYDRANT = { range: 30, lowFrac: 0.5, refill: 50 }; // water refill only; no HP heal (buy Med Kit at shop)

  // Floor collision for Act-3 rubble piles. Ellipse footprint scaled by pile's `s`.
  // rx/ry are a touch larger than the sprite so the visual edge always blocks.
  JH.DEBRIS = { collide: true, rx: 13, ry: 10 }; // rx/ry = half-extents in worldX / depth at s=1

  // Walk-up shop vendor between fights.
  JH.SHOP = { range: 28 };

  // Colour palette (kept central so procedural art + UI stay in sync).
  JH.PAL = {
    skin: "#f1c08a", skinDark: "#c98f5a",
    jonShirt: "#4a4d52", jonShirtDk: "#2e3033",
    pants: "#33384a", pantsDk: "#23273a",
    tank: "#3fb0c9", tankDk: "#2a7a8c", tankHi: "#bdf0ff",
    hose: "#1f6f3f", hoseDk: "#134d2a",
    water: "#6cd3ff", waterDk: "#2a93d8", waterHi: "#d6f6ff",
    mook: "#a04848", mookDk: "#6e2f2f",
    charger: "#7a4fb0", chargerDk: "#523078",
    pyro: "#ff8a3c", pyroDk: "#c1531a", flame: "#ffd23f",
    boss: "#4a5d3a", bossDk: "#2e3a24",
    switchBody: "#2a3346", switchDk: "#11151e", switchLed: "#6cff9a", cable: "#41506b",
    wall: "#8a6b46", wallDk: "#5c4327", wallHi: "#b08a5c",
    quakeBody: "#4a4f57", quakeDk: "#2c3036", quakeHi: "#e0902f",
    rubble: "#6a5f52", rubbleDk: "#473f36",
    dummy: "#cc5c18",
    suds: "#ffd23f", hpPk: "#ff5a5a",
    shadow: "rgba(0,0,0,0.35)",
    gkBody: "#1e2535", gkDk: "#0c0f18", gkFace: "#8a7a6a", gkStubble: "#5a5050",
    gkLed: "#ff3a3a",
    wallbossBody: "#27314a", wallbossDk: "#10141d", wallbossHi: "#46557a",
    wallbossHaz: "#d8a82a", wallbossShut: "#0c1018",
    wallbossCore: "#ff5a2a", wallbossCoreHi: "#ffd06a",
    neighbor: "#3a5888", neighborDk: "#243a66",
    soundwave: "#40e0ff",
    rock: "#7a6a58", rockDk: "#4e4030",
    pill: "#ff77ff",
    bulwark: "#5a6b7a", bulwarkDk: "#33404c", bulwarkShield: "#cfe9ff",
    stalker: "#8a2f5a", stalkerDk: "#591b3a",
    slayerBody: "#3a2010", slayerDk: "#1e0f00", slayerEmber: "#ff6010",
    smelt: "#5a3020",      smeltDk: "#3a1a08",  smeltGlow: "#ff8030",
    fuse: "#ff4810",       fuseDk: "#cc2800",
    furnaceBody: "#4a3020",furnaceDk: "#2a1808",furnaceHot: "#ff6820",
    firePatch: "#ff6010",  firePatchHi: "#ffd040",
  };

  // ---- Baked UI icon atlas (sprites/icons/<key>.png, tools/icon-sprites.mjs).
  // size = logical px per icon side; PNGs are baked at 4x (48px). keys drives
  // the Assets.icon preload — keep in sync with the baker's BAKERS set.
  JH.ICONS = {
    size: 12,
    keys: [
      "dmg", "range", "water", "regen", "hp", "knockback", "speed", "dash", "dodge", "vamp",
      "el_water", "el_fire", "el_earth", "el_air",
      "essence",
      "brass_nozzle", "spigot_key", "loaded_sponge", "prayer_bead", "collection_plate",
      "censer", "sunday_suit", "punch_card", "dowsing_rod", "alarm_bell",
      "frame_duo", "frame_legendary",
    ],
  };

  // ---- Player base stats (pre-upgrade) --------------------------------
  JH.PLAYER = {
    maxHp: 100,
    moveSpeed: 92,          // px/sec
    dashSpeed: 240,
    dashTime: 0.18,         // seconds of dash
    dashCd: 0.7,            // cooldown seconds
    jumpV: 165,             // initial jump velocity (z px/sec)
    gravity: 620,           // z gravity px/sec^2
    invuln: 0.6,            // i-frames after taking a hit (sec)

    // Water / hose — SMALL tank, punchy short bursts, quick recovery.
    // At good pressure the hose out-DPSes melee; melee is the dry fallback.
    maxWater: 100,
    waterDrain: 36,         // units/sec while spraying (~2.8s per full tank)
    waterRegen: 18,         // units/sec passive recovery (was 14)
    regenDelay: 0.35,       // sec after spraying before regen kicks in (was 0.5)
    sprayDamage: 50,        // dmg/sec at FULL pressure (80-100% tank = bonus tier)
    sprayRange: 78,         // stream reach (px)
    sprayWidth: 12,         // VISUAL depth half-band of the droplet spray (tightens with Pressure)
    sprayHitBand: 18,       // DAMAGE depth half-band — decoupled from visual so hits stay forgiving up/down
    knockback: 115,         // px/sec impulse imparted by spray (punchy)
    beam: 0,                // stream concentration tier (0=hose spray .. 3=lance)
    waterReturn: 0,         // water units/sec refunded while hosing a target (Closed Loop)
    dashPuddle: false,      // dash leaves a slick water puddle (Hydro-Dash)

    // Melee fallback (no water cost) — deliberately weak so the hose wins at
    // any decent pressure; melee is just for when you're dry.
    meleeDamage: 11,
    meleeRange: 26,
    meleeCd: 0.34,
    meleeKnock: 110,

    dodgeChance: 0,         // fraction chance to negate a hit entirely (Second Wind)
    burnTakenMult: 1,       // damage multiplier for burn taken (Pillar of Fire rank 3+)
    vampiricRate: 0,        // fraction of spray damage converted to HP (Vampiric Hose)
    moveRegen: 0,           // extra water regen/sec while moving (Kinetic Tap)
    dashBoost: 0,           // extra move speed px/sec after dashing (Hydro-Dash)
    dashBoostDur: 0,        // seconds the post-dash speed boost lasts

    bodyW: 20, bodyH: 34,   // collision box (px), feet-anchored
  };

  // ---- Enemy archetypes ----------------------------------------------
  JH.ENEMIES = {
    mook: {
      name: "Mook", hp: 40, speed: 46, touchDmg: 8, contactCd: 0.8,
      meleeDmg: 10, meleeRange: 20, meleeWind: 0.45, suds: 5,
      waterMult: 1, dropMult: 1, bodyW: 16, bodyH: 28, color: "mook",
    },
    charger: {
      name: "Charger", hp: 55, speed: 40, touchDmg: 6, contactCd: 0.8,
      chargeSpeed: 200, chargeWind: 0.6, chargeDur: 0.55, chargeCd: 1.8,
      chargeDmg: 16, suds: 8, waterMult: 1, dropMult: 1.8, bodyW: 18, bodyH: 30, color: "charger",
    },
    pyro: {
      name: "Pyro", hp: 36, speed: 38, touchDmg: 10, contactCd: 0.7,
      shootRange: 150, shootCd: 1.6, emberSpeed: 130, emberDmg: 9,
      suds: 10, waterMult: 1.5, dropMult: 1.8, bodyW: 16, bodyH: 28, color: "pyro",
    },
    dummy: {
      name: "Target Dummy", hp: 9999, speed: 0, touchDmg: 0, contactCd: 99,
      suds: 0, waterMult: 1, bodyW: 14, bodyH: 30, color: "dummy",
    },
    neighbor: {
      name: "The Neighbor", hp: 280, speed: 0, touchDmg: 0, contactCd: 99,
      rockCd: 2.4, rockSpeed: 148, rockDmg: 14,
      meleeDmg: 0, meleeRange: 0, meleeWind: 0.4,
      soundwaveDmg: 20, soundwaveSpeed: 120, soundwaveArcs: 3, soundwaveBand: 14,
      speakerWindup: 0.5, speakerHold: 0.8, speakerChance: 0.33,
      suds: 0, waterMult: 1.3, bodyW: 14, bodyH: 28, color: "neighbor",
    },
    // Super-elite: "shield trooper" — counters stand-and-pierce play. The
    // body is never a blocker; it periodically plants its shield as a
    // separate, stationary, indestructible obstacle, then fights shieldless
    // until it sprints back to reclaim it. See docs/superpowers/specs/
    // 2026-06-30-bulwark-shield-rework-design.md.
    bulwark: {
      // Its defense identity is the dome, not raw hp — keep the bar modest
      // or elite ramps turn it into a turtling sponge.
      name: "Bulwark", hp: 300, speed: 26, touchDmg: 14, contactCd: 1.0,
      // Dome-shield cycle: approaches, plants a dome barrier centered on itself,
      // shelters inside it (spray is blocked from outside) and big-slams when the
      // player steps in, then retrieves the shield once the dome fades and
      // redeploys. See project memory project_bulwark_dome_redesign.
      plantRange: 90,          // approach until within this of the player, then plant
      plantWind: 0.5,          // wind-up before the dome forms
      domeRadius: 58,          // dome radius (world units — x and depth)
      // Duty cycle: 7s dome / 1.4s gap meant ~80% shelter — hose windows were
      // token. 5s / 2.5s keeps the turtle identity but guarantees real gaps.
      domeDur: 5.0,            // seconds the barrier holds before fading out
      redeployCd: 2.5,         // cooldown after retrieving before it can plant again
      retrieveSpeedMult: 1.6, pickupRadius: 16, shieldBodyW: 16,
      // Big slam (à la The Big Drip) when the player is close/inside the dome.
      slamRange: 46, slamWind: 0.65, slamDmg: 22, slamBand: 20,
      suds: 48, waterMult: 1, dropMult: 1.6, bodyW: 22, bodyH: 34, color: "bulwark",
    },
    // Fast chaser. On cooldown it telegraphs, then blinks behind the player
    // and strikes in the same beat (0.12s); only dash i-frames dodge it.
    // Super-elite variant feints in front first, then blinks behind for the real strike.
    stalker: {
      name: "Stalker", hp: 30, speed: 95, touchDmg: 10, contactCd: 0.8,
      blinkCd: 3.2, blinkTell: 0.35, blinkDist: 30,
      strikeWind: 0.12, strikeDmg: 14, strikeRange: 26,
      suds: 13, waterMult: 1, dropMult: 1.2, bodyW: 14, bodyH: 26, color: "stalker",
    },
    // Fire-world enemies — Smelt/Fuse are regular (elite-scaleable); Furnace
    // is a curated elite (no `tough` flag in its wave entry).
    smelt: {
      // Survivability lives in hp, not a hidden waterMult soak — the health
      // bar you see is the fight you get (was 300 hp x 0.5 waterMult = a
      // dishonest 600 effective).
      name: "Smelt", hp: 450, speed: 26, touchDmg: 10, contactCd: 1.0,
      waterMult: 1,
      preferRange: 110,        // standoff distance — backs away if closer, advances if farther
      lobWindup: 0.55,         // telegraph before throw
      lobCd: 3.0,              // cooldown between lobs
      lobBombSpeed: 130,       // horizontal speed of the arcing bomb
      lobGravity: 300,         // arc gravity
      lobBombRadius: 34,       // FirePatch radius on landing
      lobBombDur: 2.2,         // FirePatch duration
      suds: 12, dropMult: 1.4, bodyW: 22, bodyH: 34, color: "smelt",
    },
    fuse: {
      name: "Fuse", hp: 65, speed: 78, touchDmg: 8, contactCd: 0.6,
      waterMult: 1.0,
      deathPatchRadius: 22, deathPatchDur: 0.8,
      deathBurnRange: 30,      // px: Jon within this on death → +1 burn stack
      igniteRange: 70,       // px from Jon at which the head-fuse lights
      litDrainFrac: 0.20,    // fraction of maxHp burned off per second while lit
      blastRadius: 40,       // self-destruct AoE (ground ellipse rx)
      blastDmg: 18,
      blastPatchRadius: 26, blastPatchDur: 2.0,
      suds: 7, dropMult: 1.0, bodyW: 14, bodyH: 24, color: "fuse",
    },
    furnace: {
      name: "Furnace", hp: 850, speed: 18, touchDmg: 14, contactCd: 1.0,
      waterMult: 1.0,          // normal phase: full spray damage
      heatedWaterMult: 0.2,    // heated phase: 20% spray damage
      heatThreshold: 1.5,      // continuous spray-seconds before heating triggers
      coolRate: 2.5,           // heat lost per second once spray pauses (>0.3s) — cools, not resets
      ventWind: 0.5,           // delay after heat threshold before vent fires (s)
      ventKnock: 180,          // knockback impulse on vent (px/s)
      ventBurnStacks: 1,       // burn stacks applied by vent
      ventCd: 4.0,             // post-vent cooldown before it can heat again
      cooldownSpeedMult: 2,    // movespeed multiplier while cooling (ventCdT > 0)
      ventPatchRadius: 26,     // fire-zone patch radius left around it on vent
      ventPatchDur: 2.6,       // how long the vent fire zone burns (s)
      suds: 44, dropMult: 1.8, bodyW: 22, bodyH: 36, color: "furnaceBody",
    },
  };

  JH.BOSS = {
    name: "The Big Drip", hp: 620, speed: 34, bodyW: 40, bodyH: 56,
    touchDmg: 14, contactCd: 0.9, suds: 120, color: "boss",
    slamDmg: 20, slamRange: 40, slamWind: 0.85,
    sweepDmg: 16, sweepRange: 56, sweepWind: 1.0,
    summonCd: 6.5, enrageAt: 0.4, summonType: "mook",   // hp fraction → faster attacks
  };

  // Act-2 boss — "The Switch of Doom": an 8-port network switch with cable
  // tentacles. Fires telegraphed full-width LINE attacks along a depth row;
  // dodge by moving up/down a lane (or jumping).
  JH.SWITCH = {
    name: "The Switch of Doom", hp: 1000, speed: 30, bodyW: 48, bodyH: 30,
    touchDmg: 14, contactCd: 0.9, suds: 240, color: "switchBody",
    lineDmg: 22, lineBand: 11, lineWind: 0.95, enrageAt: 0.45,
    whipDmg: 20, whipBand: 14, whipWind: 0.90,
  };

  // Destructible barricade encounter: smash the wall while enemies keep coming,
  // then walk through to the next zone.
  JH.WALL = { hp: 360, spawnEvery: 1.5, maxAlive: 3 };

  // Per-wave spawn caps to defang luck-driven swings (e.g. all-charger waves).
  JH.WAVECAP = { charger: 3 };

  // Attack tickets: max enemies simultaneously in a melee windup/attack,
  // indexed by actLevel+1 (like SPRINKLE.counts). Readability cap, not a
  // mercy rule — ticketless melee enemies hold at approach range instead.
  JH.TICKETS = { budgets: [4, 4, 5, 5, 6] };

  // Wave spawn flow: fieldCap enemies open the wave; the rest queue. With
  // batchMin+ queued, reinforcements arrive as a batch (batchMin..batchMax
  // at once, REINFORCEMENTS! banner, batchPause between surges) once the
  // field has room for a full batch — a wave-within-a-wave. Smaller
  // remainders trickle in singly (one per `trickle` sec). fieldCap is
  // indexed by actLevel+1 (like SPRINKLE.counts): Act 1 runs tight because
  // the kit has no AoE yet (pierce/split arrive with later purchases).
  JH.WAVEFLOW = { fieldCap: [4, 6, 7, 7, 7], trickle: 1.1,
                  batchMin: 3, batchMax: 5, batchPause: 2.0 };

  // Per-type super-elite multiplier overrides (default hp x7 in
  // Balance.superEliteDef). Heavies with big base hp need smaller ones.
  JH.SUPER_TUNE = {
    smelt: { hp: 2 },       // 450 base: x7 was a chore, x3 still lost MELTDOWN playtests
    bulwark: { hp: 2.5 },   // big base + tough-wave elite ramp made 7x unhoseable
    // Per-act hp damp applied on top of the type multiplier, indexed
    // actLevel+1 (like SPRINKLE.counts) — early giants shouldn't outlast
    // their whole wave.
    hpByAct: [0.55, 0.75, 0.9, 1, 1],
  };

  // Wave sprinkle: extra enemies drawn from the already-introduced pool,
  // added on top of authored spawns (variety, not economy — counts stay low).
  // counts is indexed by actLevel+1 (Balance.actLevelForWave returns -1..3).
  JH.SPRINKLE = {
    counts: [1, 2, 3, 3, 4],
    weights: { mook: 3, pyro: 3, fuse: 3, stalker: 3, charger: 2, bulwark: 0.5, furnace: 0.5, smelt: 0.5 },
    heavies: ["bulwark", "furnace", "smelt"],
    heavyCap: 1,
  };

  // Garden event: spray water on the planter to grow crops. Neighbor throws rocks.
  JH.GARDEN = { growMax: 280 };

  // Concerta pill: unlimited water spray for a few seconds.
  JH.CONCERTA = { dur: 4.5 };

  // Between-wave consumables (Suds sink). Med Kit heals instantly on purchase;
  // Pressure Charge is "armed" in the shop and ticks down only during play.
  JH.CONSUMABLES = {
    medkit:   { name: "Med Kit",        cost: 45, heal: 60 },
    pressure: { name: "Pressure Charge", cost: 70, mult: 1.5, dur: 8 },
  };

  // Relics: one-time flag purchases (game.relics[id] = true), never a
  // repeatable. Effects are hook-checks scattered across game.js/entities.js
  // (grep the id) rather than an apply fn — see each id's comment there.
  // A rotating stock of 3 is rolled per vendor visit from the still-unowned
  // pool (Balance.pickRelics).
  JH.RELICS = [
    { id: "brass_nozzle",    name: "Brass Nozzle",     cost: 180, desc: "Non-pierce stream also catches the next-closest enemy" },
    { id: "spigot_key",      name: "Spigot Key",       cost: 150, desc: "Hydrant refill grants +10% spray dmg for 15s" },
    { id: "loaded_sponge",   name: "Loaded Sponge",    cost: 160, desc: "GUSH milestone water refund doubled" },
    { id: "prayer_bead",     name: "Prayer Bead",      cost: 220, desc: "A boss's first enrage grants a brief pressure buff" },
    { id: "collection_plate",name: "Collection Plate", cost: 300, desc: "+2 bonus suds per kill" },
    { id: "censer",          name: "Censer",           cost: 250, desc: "Sigil offers include an extra choice" },
    { id: "sunday_suit",     name: "Sunday Suit",      cost: 260, desc: "Boss essence crosses are worth double" },
    { id: "punch_card",      name: "Punch Card",       cost: 200, desc: "All shop prices are 20% cheaper" },
    { id: "dowsing_rod",     name: "Dowsing Rod",      cost: 150, desc: "Pickups magnet from farther away; water cans +50% value" },
    { id: "alarm_bell",      name: "Alarm Bell",       cost: 180, desc: "Non-elite wave clears also roll the bonus item drop" },
  ];

  // Seconds a kill keeps the GUSH combo chain alive (cosmetic feedback only).
  JH.COMBO_WINDOW = 2.5;

  // XP level-ups: kills grant xp = the enemy's def.suds; each level applies
  // the next step of this repeating cycle instantly (no pick, no pause).
  JH.LEVELS = {
    setPieceXp: 30,
    // Water steps lean generous: an empty tank is the early game's harshest
    // wall, so levels relieve it fastest. Sized against the retired shop
    // nodes (tier-1 water was +40 tank, regen was +10): two cycle laps
    // roughly reproduce them, with the first lap landing half of it early.
    cycle: [
      { sprayDamage: 3 }, { maxWater: 20 }, { maxHp: 8 },
      { sprayRange: 4 }, { sprayDamage: 3 }, { waterRegen: 5 },
    ],
  };

  // ---- Fire element tunables (Burn DoT + FirePatch) ---------------------
  JH.FIRE = {
    burnDpsPerStack: 4,      // hp/s per stack (3 stacks = 12 hp/s for burnDuration)
    burnDuration: 2.0,       // seconds burn lasts; refreshed (not extended) on reapply
    maxBurnStacks: 3,
    patchBurnInterval: 0.4,  // min seconds between burn-stack ticks while in a patch
    burnTickInterval: 0.5,   // seconds between DoT damage beats (flash + ember puff)
    patchMaxLife: 7,         // hostile patches burn out on their own after this many seconds
    patchFizzle: 2.5,        // ...staying FULL SIZE until these last seconds, when they fizzle down
    douseDmgScale: true,     // spray-douse speed scales with spray damage (base dmg = 1x, never slower)
  };

  // ---- Scald: enemy-only DoT applied by Scalding Faith / fire pillar -----
  // (Enemy.applyScald takes the max of dps/duration, so re-triggering never
  // downgrades an active scald.)
  JH.SCALD = { dps: 4, dur: 2, dps2: 6, dur2: 3 };

  // ---- Juice / game-feel tunables --------------------------------------
  JH.JUICE = {
    // Hit-stop tier table — every freeze routes through game.hitStop, which
    // takes the max of pending freezes (simultaneous kills never sum).
    // DESIGN RULE: moment-to-moment play NEVER freezes (it reads as clunk at
    // this game's pace); freezes are reserved for boss-scale beats only.
    hitstop: {
      kill: 0,           // regular kills never freeze
      heavyKill: 0,      // elite/heavy kills never freeze either
      waveEnd: 0,        // wave-ender beat is shake + loot drift only
      playerHit: 0,      // getting hit kicks the screen, never freezes the sim
      domePop: 0.10,     // reserved: dome/wall break (boss-scale set-pieces)
      bossPhase: 0.20,   // reserved: boss phase transitions / kill sequence
    },
    heavyTypes: ["bulwark", "furnace", "smelt"],
    // Trauma screenshake: shake(n) adds n/traumaDiv trauma (cap 1); the
    // rendered amplitude is trauma^2 * shakeMax px and trauma decays
    // traumaDecay/sec — big hits punch, small ones barely register.
    traumaDiv: 16,
    traumaDecay: 1.1,
    shakeMax: 14,
    shakeScale: 1,        // player-facing intensity multiplier (settings hook)
    vacuumDur: 3.0,       // wave-ender loot-drift duration (sec)
    vacuumPull: 2.5,      // drift strength (fraction of distance closed per sec)
    comboPitchCap: 12,    // kill-blip ladder tops out +12 semitones
    comboWaterRefund: 10, // GUSH x5 water refund
    squashDur: 0.12,      // Jon's hit squash pulse length (sec)
    squashAmp: 0.10,      // Jon's peak squash deform (scaleX 1+a / scaleY 1-a)
    // Wetness: spray hits soak enemies — a blue tint that builds toward
    // wetTintMax opacity and dries off, with drip particles while soaked.
    // This (not flash/squash) is the enemy hurt read.
    wetTintMax: 0.30,
    wetPerHit: 0.08,      // wetness added per spray hit (caps at 1)
    wetDryPerSec: 0.35,   // wetness lost per second
    // GUSH combo tiers: x3 arms a minor water-regen window; every 5th kill
    // bumps it + refunds comboWaterRefund.
    gushRegenDur: 4,      // regen window (sec)
    gushRegen3: 4,        // water/sec at the x3 tier
    gushRegen5: 8,        // water/sec at x5+ milestones
  };

  // Fuse aerial drop-in: telegraph ring + gravity fall + light landing slam.
  JH.FUSE_DROP = {
    height: 150,      // spawn z (px); gravity (620) lands it in ~0.7s
    slamRadius: 20,   // landing hit zone (world px; also the ring size)
    slamDmg: 8,       // light and dodgeable — no burn stack
    stagger: 0.5,     // per-fuse drop delay (s)
  };

  // ---- Church of the Holy Hose (Phase 0 meta-progression) -------------
  JH.CHURCH = {
    // Player death/ghost sequence (seconds) — durations of each phase, consumed by
    // Church.deathCorpseFrame / deathGhostState / deathScreenFadeAlpha (church.js).
    deathSeq: {
      fallEnd: 0.6,          // corpse collapses, frames 0->7
      lingerDur: 0.4,        // corpse holds on frame 7 before the ghost stirs
      riseDur: 0.35,         // ghost lifts out of the corpse, still in the collapsed pose
      materializeDur: 0.15,  // ghost alpha ramp-in, within riseDur
      standDur: 0.45,        // ghost plays frames 7->0 (reverse), standing up while hovering
      driftDur: 0.3,         // slow upward drift once standing, before the beam accelerates
      beamFadeDur: 0.4,      // ghost alpha fades out over this long once the beam starts
      screenFadeDelay: 0.3,  // gap between beam start and the screen starting to fade
      screenFadeDur: 0.7,    // screen fade-to-black duration
      riseHeight: 16,        // px the ghost lifts above the corpse before standing
      ghostAlphaMax: 0.82,   // ghost's peak opacity
      total: 3.2,            // whole sequence length; updatePlayerDeathSeq exits the Church at this point
    },
    // Father Jon dialogue. `first` = in-character Holy-Essence tutorial (one
    // box per line); `repeat` = a single short line picked at random per visit.
    sermon: {
      first: [
        "Rise, child. You stand in the Church of the Holy Hose — where the fallen are made faithful.",
        "Each nemesis you redeem — and each trial you weather — leaves behind Holy Essence. I keep it here, gathered from your deeds.",
        "Spend it at the four pillars along the nave — Water, Earth, Fire, Air — and their strength follows you into every life to come.",
        "Death is not the end of the spray. Walk into the light when you are ready, and try again.",
      ],
      repeat: ["The water remembers you, child.", "Again you fall — again you rise.", "Spend what you have earned; the street still thirsts.", "Pressure builds in the faithful. Return to the light.", "Hose before Hoes, child."],
    },
    // Walkable scene layout (logical px). Jon spawns at spawnX and walks right:
    // Father Jon materializes at fatherX; blessing stations sit along the nave;
    // walking into portalX (within portalReach) returns you to the street.
    layout: {
      length: 720, spawnX: 28, fatherX: 168, altarX: 300, reliquaryX: 336,
      portalX: 660,
      portalReach: 18, stationRange: 24,
      depthMin: 35, depthMax: 75,
      // Walk-up pillar stations, one per element (JH.PILLARS.defs). Locked
      // pillars still render (dark, with their nemesis) but can't be bought.
      stations: [
        { pillar: "water", x: 396 },
        { pillar: "earth", x: 470 },
        { pillar: "fire",  x: 544 },
        { pillar: "air",   x: 618 },
      ],
    },
    // Shrine -> element -> redeeming boss (s.type). null boss = capstone (Water/Jon).
    shrines: [
      { element: "earth", boss: "quake",  label: "EARTH" },
      { element: "fire",  boss: "slayer", label: "FIRE"  },
      { element: "air",   boss: "assman", label: "AIR"   },
      { element: "water", boss: null,     label: "WATER" },
    ],
    // LEGACY flat blessings — no longer applied (no saves exist to migrate;
    // persistence is parked). Kept only for the state-field shape.
    blessings: [
      { id: "bless_dps",  name: "Anointed Pressure", desc: "+4 spray dmg",   apply: (s) => { s.sprayDamage += 4; } },
      { id: "bless_tank", name: "Deep Reservoir",    desc: "+15 max water",  apply: (s) => { s.maxWater += 15; } },
      { id: "bless_hp",   name: "Blessed Vigor",     desc: "+20 max HP",     apply: (s) => { s.maxHp += 20; } },
    ],
  };

  // ---- The four element pillars (Church meta-upgrades) ----------------
  // Rank r costs r+1 essence (JH.Pillars.cost). Water has no gate; the
  // others unlock when their gateBoss is redeemed (Church.state.elements).
  // Locked pillars render dark with the nemesis silhouette.
  JH.PILLARS = {
    defs: [
      { element: "water", name: "Pillar of Water", gateBoss: null, maxRank: 3,
        desc: "+15 max water, +3 regen / rank · III: pressure never drops below mid tier",
        apply: (s, r) => { s.maxWater += 15 * r; s.waterRegen += 3 * r; if (r >= 3) s.pressureFloor = true; } },
      { element: "earth", name: "Pillar of Earth", gateBoss: "quake", maxRank: 3,
        desc: "+12 max HP, +15 knockback / rank · III: wall-slammed enemies stagger",
        apply: (s, r) => { s.maxHp += 12 * r; s.knockback += 15 * r; if (r >= 3) s.wallSlamStagger = true; } },
      { element: "fire", name: "Pillar of Fire", gateBoss: "slayer", maxRank: 3,
        desc: "+3 spray dmg, burn on you -25%·rank/3 · III: full pressure Scalds",
        apply: (s, r) => { s.sprayDamage += 3 * r; s.burnTakenMult = 1 - 0.25 * (r / 3); if (r >= 3) s.baselineScald = true; } },
      { element: "air", name: "Pillar of Air", gateBoss: "assman", maxRank: 3,
        desc: "+5 move speed, -0.05s dash cd / rank · III: +0.1s dash i-frames",
        apply: (s, r) => { s.moveSpeed += 5 * r; s.dashCd = Math.max(0.2, s.dashCd - 0.05 * r); if (r >= 3) s.dashIframeBonus = 0.1; } },
    ],
  };

  // Gateway Krusher 9000 — a powered-up standing switch with an embedded face.
  // Reuses the Switch's line/whip attacks and adds a floor-row depth slam.
  JH.GATEWAYKRUSHER = {
    name: "Gateway Krusher 9000", hp: 1800, speed: 28, bodyW: 44, bodyH: 60,
    touchDmg: 18, contactCd: 0.9, suds: 480, color: "gkBody",
    lineDmg: 26, lineBand: 13, lineWind: 0.82, enrageAt: 0.38,
    whipDmg: 24, whipBand: 16, whipWind: 0.78,
    rowDmg: 22, rowBand: 18, rowWind: 0.92,
  };

  // "The Firewall" — a large switch-chassis wall pinned to the RIGHT edge of
  // the arena; it doesn't move. Body is armoured (spray does no damage); only
  // the WEAK SPOT (an exposed port/core) takes damage, and only while OPEN. The
  // weak spot also ROAMS in depth — its lane (this.y) is what the stream is
  // tested against, so the player must stand in its lane. Attacks: PORT SLAM
  // slab in front of the face (back off) and a SURGE shockwave along the floor
  // (jump). Not in JH.LEVEL1.waves; wire in with
  //   { name: "THE FIREWALL", boss: true, bossType: "wallboss" }  (game.js maps it).
  JH.WALLBOSS = {
    name: "The Firewall", hp: 1500, suds: 540, color: "wallbossBody",
    bodyW: 84, bodyH: 178, touchDmg: 20, contactCd: 0.8, enrageAt: 0.4,
    // Weak-spot cycle (seconds): armored → opening telegraph → open(vulnerable).
    wsClosed: 3.0, wsOpen: 2.6, wsWind: 0.7,
    wsClosedEnraged: 2.0, wsOpenEnraged: 3.2,
    wsRoam: 30, wsRetargetMin: 1.1, wsRetargetMax: 2.2,   // depth drift px/s + retarget cadence
    wsLift: 46, wsBob: 9,                                  // core sits this high on the wall, bobs ±wsBob
    dmgMult: 1.4,                                          // hose hurts more on an exposed port
    // SURGE → lightning bolt rolls left along the core's depth lane (step out of the lane to dodge).
    slamWind: 0.8, slamCd: 2.6, waveDmg: 20, waveRange: 480, waveSpeed: 170,
    // PORT SLAM → slab punches the zone in front of the face (back away to dodge).
    crushWind: 0.85, crushCd: 2.8, crushDmg: 32, crushReach: 78,
    // Reinforcements (spawned "security daemons").
    summonCd: 7.5, summonType: "mook",
  };

  // True final boss — "Quake Walker", one of Jon's nemeses. A hulking bruiser
  // who STOMPS the ground: each stomp sends shockwaves rolling along the floor
  // in both directions. DASH through them — i-frames negate the hit.
  // (Distinct from Big Drip's zone slam and the Switch's depth-line.)
  JH.QUAKE = {
    name: "Quake Walker", hp: 1200, speed: 22, bodyW: 50, bodyH: 60,
    touchDmg: 16, contactCd: 1.0, suds: 320, color: "quakeBody",
    stompWind: 0.8, stompDmg: 26, stompRadius: 36,   // direct hit around his feet
    waveDmg: 18, waveSpeed: 150, waveRange: 340, enrageAt: 0.4,
    leapWind: 0.65, leapDur: 0.38, leapDmg: 32, leapRadius: 52, leapPeak: 58,
  };

  // The Slayer — Fire boss (pool cue, charge-dash movement, fireball volley).
  // After defeat: ally cutscene, elements.fire unlocked, Fire pillar opens.
  // See docs/superpowers/specs/2026-06-30-slayer-fire-world-design.md.
  JH.SLAYER = {
    name: "The Slayer", hp: 1900, bodyW: 44, bodyH: 58,
    touchDmg: 15, contactCd: 0.9, suds: 280, color: "slayerBody",
    // Movement: charge-up → dash (no walk cycle)
    chargeDur: 0.75,          // fire-particle build-up before dash
    dashSpeed: 380,           // px/s during dash
    dashDist: 220,            // max px per dash
    dashTell: 0.15,           // hold in dash pose before launching (visual beat)
    dashPatchSpacing: 40,     // px between FirePatch spawns along trail
    dashPatchRadius: 18,      // radius of each trail patch
    dashPatchDur: 1.2,        // extinguish duration for trail patches
    // Attack: Fireball Volley (rapid-fire pool-cue break)
    volleyRange: 200,         // px: trigger volley when player within this distance
    volleyWind: 0.7,          // cue wind-up duration (s) before the first ball
    volleyCd: 1.9,            // post-volley cooldown
    ballCount: 4,             // balls per volley (rapid fire)
    enrageBallCount: 6,       // balls per volley when enraged
    ballSpawnOffset: 32,      // px in front of Slayer — at the cue tip, so the release connects
    ballStagger: 0.1,         // seconds between each ball in a volley (rapid)
    // Attack: Slam
    slamWind: 0.75, slamDmg: 22, slamRange: 38,
    // Attack: dash-landing fire ring (radiates from where he lands)
    dashRingDmg: 16, dashRingBurn: 1, dashRingMaxR: 95, dashRingSpeed: 280,
    // Behaviour
    enrageAt: 0.40,
  };
  JH.FIREBALL = {
    speed: 230, dmg: 14, burnStacks: 2, radius: 14, lifespan: 2.6,
    spawnZ: 30,        // flight height for the whole flight — the cue tip on the release sprite
    igniteDelay: 0.12, // s after launch before the ball ignites (burn + hit active)
  };

  // ---- Fire-truck escape (post-Slayer between-worlds set-piece) --------
  // Self-contained ~60s scrolling escape; JH.TruckRun scene consumes these.
  // Depth axis (lanes) is the dodge/aim axis; the hose is a forward swath.
  // All tunables live here — nothing in truck.js/truckrun.balance.js hardcodes.
  JH.TRUCKRUN = {
    runDuration: 60,     // total escape length (s)
    scrollSpeed: 320,    // world px/s the road moves under the truck
    truckScreenX: 140,   // truck's resting screen-x
    throttleBand: 40,    // ± screen-x the throttle/brake nudges within
    moveSpeed: 120,      // truck depth (up/down) speed, px/s
    throttleSpeed: 80,   // truck screen-x (throttle/brake) speed, px/s
    lanes: [16, 43, 70], // soft authoring lanes across DEPTH_MIN..DEPTH_MAX

    // Truck integrity — VISIBLE bar, non-lethal (feeds shake + wall pressure +
    // clean bonus; never ends the run).
    truckHp: 200,

    // The hose — the SAME cone as Jon's, just more powerful (vs Jon: 50 dps /
    // 78 range / 18 band). Longer range + more damage, NOT wider. High dps so
    // road enemies die well before they reach the truck.
    hoseDps: 240,
    hoseRange: 240,      // reaches the Firewall's weak spot even when braked
    hoseBand: 18,        // depth half-band (used for the Firewall weak-spot match)
    knockback: 300,      // strong shove — it's a truck-mounted cannon
    douseRate: 4.5,      // fire-patch life/s the beam burns off (shoot out fires)

    // Big tank — passive regen is a trickle; HYDRANTS are the real refill.
    tank: 180,
    drain: 20,           // units/s while spraying (~9s per full tank)
    regen: 5,            // units/s passive trickle
    regenDelay: 0.35,    // s after spraying before passive regen resumes
    pressureFloor: 0.06, // tank frac at/above which the hose is full power
    dryDpsMult: 0.25,
    dryRangeMult: 0.5,

    // Hydrants — smash to refuel AND lane-wash.
    hydrantHp: 30,
    hydrantRefill: 90,   // water restored on smash (the meaningful refill)
    washRadius: 40,      // friendly wash AoE (depth-band px)
    hydrantEverySec: 9,  // spacing along the run

    // Collision hazards.
    wreckHp: 50,
    wreckDmg: 15,        // truckHp lost on un-broken wreck contact
    collideSlow: 0.8,    // scroll-speed mult applied briefly on any collision
    collideSlowDur: 0.6, // s the slow lasts (lets the wall creep up)

    // Collapse wall — non-lethal rubber-band pressure.
    wall: {
      startGap: 220,     // world px behind the truck at start
      creepOnHit: 60,    // px the wall gains per collision
      recoverRate: 35,   // px/s the lead rebuilds when driving clean
      contactBurnStacks: 1,
    },

    // Climax: The Firewall (JH.WALLBOSS mechanics adapted to the road). Pinned
    // ahead; armored body — only the roaming WEAK SPOT takes damage, and only
    // while OPEN and lane-matched. SURGE bolt rolls down its lane (dodge by
    // lane); PORT SLAM punches forward (don't crowd it).
    firewall: {
      atSec: 35, hp: 1360, essence: 3, screenX: 355, dmgMult: 1.4,
      wsBand: 16,                                   // strict depth match to hit the core
      wsClosed: 2.4, wsWind: 0.7, wsOpen: 2.8,      // weak-spot cycle (s)
      wsRoam: 34, wsRetarget: 1.6,                  // depth drift px/s + retarget cadence
      surgeCd: 3.0, surgeSpeed: 230, surgeDmg: 18,  // SURGE bolt along the core lane
      slamCd: 4.2, slamWind: 0.8, slamDmg: 26, slamReach: 150, // PORT SLAM forward zone
    },

    // Essence economy (kept in-band with normal run income).
    crossVal: 1,
    crossCount: 6,
    cleanBonusTiers: [1, 2], // [decent run, flawless (full HP + no wall touch)]
  };

  // FX frame animations, curated from the local itch.io packs (sprites/effects/,
  // gitignored) into sprites/fx/<key>/1..count.png by tools/curate-fx.mjs.
  // Re-pick a variant there and rerun it; update count here if it changes.
  JH.FX = {
    "fire-small": { count: 8,  fps: 14 },   // FirePatch flames
    "fire-big":   { count: 8,  fps: 12 },   // douse objective flames
    "fire-jon":   { count: 8,  fps: 14 },   // burning player
    "boom-small": { count: 8,  fps: 16 },   // fuse death pop
    "boom-mid":   { count: 12, fps: 16 },   // smelt bomb impact, furnace vent
    "boom-big":   { count: 12, fps: 14 },   // boss deaths
    "portal":     { count: 6,  fps: 8 },    // church return portal
  };

  // Act-start wave indices (bounded by boss clears) — death respawns here.
  // 0 Act1 · 5 Act2 (after Big Drip) · 10 Act3 (after Switch) · 16 Act4 (after Quake) · 23 Fire (after GK).
  JH.ACT_STARTS = [0, 5, 10, 16, 23];

  // ---- Level 1 waves --------------------------------------------------
  // Each wave: list of {type, count}. Gate progress until cleared, then
  // open the shop (except before the boss, which is its own finale).
  JH.LEVEL1 = {
    waves: [
      { name: "WAVE 1", spawns: [{ type: "mook", count: 4 }] },
      { name: "WAVE 2", spawns: [{ type: "mook", count: 4 }, { type: "charger", count: 1 }] },
      { name: "WAVE 3", spawns: [{ type: "mook", count: 4 }, { type: "pyro", count: 1 }] },
      { name: "WAVE 4", spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 2 }] },
      { name: "BOSS", boss: true },                          // mid-boss: The Big Drip
      // ---- Act 2: ELITE ----
      { name: "WAVE 5", tough: true, spawns: [{ type: "pyro", count: 3 }, { type: "charger", count: 2 }] },
      { name: "STREET SWARM", tough: true, spawns: [{ type: "mook", count: 6 }, { type: "charger", count: 2 }] },
      { name: "BARRICADE", wall: true, tough: true, wallHp: 360,
        spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 2 }] },
      { name: "CROSSFIRE", tough: true, spawns: [{ type: "pyro", count: 3 }, { type: "mook", count: 4 }] },
      { name: "THE SWITCH", boss: true, bossType: "switch" },
      // ---- Act 3: the ruined district ----
      { name: "RUBBLE ROW", tough: true, spawns: [{ type: "bulwark", count: 1 }, { type: "mook", count: 4 }, { type: "charger", count: 2 }] },
      { name: "DEBRIS RUN", tough: true, spawns: [{ type: "charger", count: 3 }, { type: "mook", count: 4 }] },
      { name: "HOLD THE LINE", holdout: true, tough: true, holdDur: 22,
        spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 2 }, { type: "bulwark", count: 1 }] },
      { name: "ASH CHARGE", tough: true, spawns: [{ type: "charger", count: 4 }, { type: "mook", count: 3 }] },
      { name: "LAST STAND", tough: true, spawns: [{ type: "mook", count: 5 }, { type: "charger", count: 2 }, { type: "bulwark", count: 1 }] },
      { name: "QUAKE WALKER", boss: true, bossType: "quake" },
      // ---- Act 4: the aftermath ----
      { name: "THE BULWARK LINE", spawns: [{ type: "bulwark", count: 1 }, { type: "pyro", count: 4 }, { type: "mook", count: 2 }] },
      { name: "STALKER AMBUSH", superElite: "stalker", spawns: [{ type: "stalker", count: 3 }, { type: "charger", count: 1 }, { type: "mook", count: 2 }] },
      { name: "WAVE 6", tough: true, superElite: "mook", spawns: [{ type: "mook", count: 5 }, { type: "pyro", count: 2 }, { type: "charger", count: 2 }] },
      { name: "THE GARDEN", garden: true },
      { name: "WAVE 7", tough: true, superElite: "bulwark", spawns: [{ type: "charger", count: 3 }, { type: "pyro", count: 3 }, { type: "mook", count: 3 }] },
      { name: "OVERRUN", tough: true, superElite: "charger", spawns: [{ type: "mook", count: 6 }, { type: "charger", count: 2 }, { type: "pyro", count: 2 }] },
      { name: "GATEWAY KRUSHER 9000", boss: true, bossType: "gatewaykrusher" },
      // ---- Fire World (curated, un-tough) ----
      { name: "FIRE INTRO", superElite: "pyro", spawns: [{ type: "fuse", count: 5 }, { type: "smelt", count: 2 }] },
      { name: "EMBER RUSH", superElite: "fuse", spawns: [{ type: "fuse", count: 5 }, { type: "smelt", count: 2 }] },
      { name: "DOUSE THE FLAMES", douse: true, spawns: [{ type: "smelt", count: 2 }] },
      { name: "FURNACE TRIAL", spawns: [{ type: "furnace", count: 1 }, { type: "fuse", count: 4 }, { type: "smelt", count: 1 }] },
      { name: "MELTDOWN", tough: true, superElite: "smelt", spawns: [{ type: "smelt", count: 1 }, { type: "fuse", count: 5 }] },
      { name: "THE SLAYER", boss: true, bossType: "slayer" },
    ],
  };

  // ---- Audio (procedural WebAudio blips) ------------------------------
  JH.SFX = {
    spray:  { type: "noise", dur: 0.08, gain: 0.05 },
    hit:    { type: "square", freq: 220, dur: 0.06, gain: 0.10 },
    whack:  { type: "square", freq: 130, dur: 0.08, gain: 0.12 },
    hurt:   { type: "saw", freq: 90, dur: 0.18, gain: 0.14 },
    coin:   { type: "square", freq: 880, dur: 0.07, gain: 0.10 },
    buy:    { type: "square", freq: 660, dur: 0.12, gain: 0.12 },
    upgrade:{ type: "square", freq: 523, dur: 0.3,  gain: 0.14 },
    die:    { type: "saw", freq: 70, dur: 0.4, gain: 0.16 },
    win:    { type: "square", freq: 990, dur: 0.5, gain: 0.14 },
    jump:   { type: "square", freq: 480, dur: 0.09, gain: 0.08 },
    pill:   { type: "square", freq: 1400, dur: 0.45, gain: 0.14 },
    blast:  { type: "saw", freq: 55, dur: 0.35, gain: 0.18 },
    sizzle: { type: "noise", dur: 0.15, gain: 0.10 },
    kill:   { type: "square", freq: 320, dur: 0.08, gain: 0.13 },  // combo-pitched kill blip
    dash:   { type: "noise", dur: 0.22, gain: 0.15, attack: 0.02, bpFrom: 450, bpTo: 2600, q: 0.7 },  // rising whoosh
    bell:   { type: "sine", freq: 196, dur: 0.6, gain: 0.16 },  // pillar rank bought
    dread:  { type: "saw", freq: 44, dur: 1.4, gain: 0.2, attack: 0.2 },  // ominous low rumble (truck arrival)
  };
})();
