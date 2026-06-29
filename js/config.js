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
  JH.LEVEL_LEN = 7400;      // world length of level 1 (logical px)
  JH.ZONE2_START = 4100;    // world-x where the ruined district (Act 3) begins

  // Interactive fire hydrants: stand next to one to refill fast (any water
  // level). Spread along the street so you're never far from a top-up.
  JH.HYDRANTS = [
    { x: 300,  y: JH.DEPTH_MAX - 10 },
    { x: 1100, y: JH.DEPTH_MIN + 12 },
    { x: 1900, y: JH.DEPTH_MAX - 14 },
    { x: 2700, y: JH.DEPTH_MIN + 10 },
    { x: 3500, y: JH.DEPTH_MAX - 12 },
    { x: 4350, y: JH.DEPTH_MAX - 12 },   // ruined district
    { x: 4820, y: JH.DEPTH_MIN + 12 },
    { x: 5300, y: JH.DEPTH_MAX - 12 },
    { x: 5900, y: JH.DEPTH_MIN + 10 },
    { x: 6700, y: JH.DEPTH_MAX - 14 },
  ];
  JH.HYDRANT = { range: 30, lowFrac: 0.5, refill: 50, healRate: 8 }; // healRate: HP/sec out of combat

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
    vampiricRate: 0,        // fraction of spray damage converted to HP (Vampiric Hose)
    splitStream: false,     // spray arcs to a nearby secondary target (Split Stream)
    moveRegen: 0,           // extra water regen/sec while moving (Kinetic Tap)
    dashBoost: 0,           // extra move speed px/sec after dashing (Hydro-Dash)
    dashBoostDur: 0,        // seconds the post-dash speed boost lasts

    bodyW: 20, bodyH: 34,   // collision box (px), feet-anchored
  };

  // ---- Enemy archetypes ----------------------------------------------
  JH.ENEMIES = {
    mook: {
      name: "Mook", hp: 40, speed: 46, touchDmg: 8, contactCd: 0.8,
      meleeDmg: 10, meleeRange: 20, meleeWind: 0.45, suds: 8,
      waterMult: 1, dropMult: 1, bodyW: 16, bodyH: 28, color: "mook",
    },
    charger: {
      name: "Charger", hp: 55, speed: 40, touchDmg: 6, contactCd: 0.8,
      chargeSpeed: 200, chargeWind: 0.6, chargeDur: 0.55, chargeCd: 1.8,
      chargeDmg: 16, suds: 13, waterMult: 1, dropMult: 1.8, bodyW: 18, bodyH: 30, color: "charger",
    },
    pyro: {
      name: "Pyro", hp: 36, speed: 38, touchDmg: 10, contactCd: 0.7,
      shootRange: 150, shootCd: 1.6, emberSpeed: 130, emberDmg: 9,
      suds: 16, waterMult: 1.5, dropMult: 1.8, bodyW: 16, bodyH: 28, color: "pyro",
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
  JH.WAVECAP = { charger: 2 };

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

  // ---- Church of the Holy Hose (Phase 0 meta-progression) -------------
  JH.CHURCH = {
    // Death-sequence timeline (seconds): collapse -> fade -> spirit -> Church.
    deathSeq: { animEnd: 1.2, fadeEnd: 2.0, spiritEnd: 2.8, total: 2.8 },
    essencePerBoss: 1,
    // Father Jon dialogue. `first` = in-character Holy-Essence tutorial (one
    // box per line); `repeat` = a single short line picked at random per visit.
    sermon: {
      first: [
        "Rise, child. You stand in the Church of the Holy Hose — where the fallen are made faithful.",
        "Each nemesis you redeem leaves behind Holy Essence. I keep it here, gathered from your trials.",
        "Spend it at the shrines along the nave — Pressure, Vigor, Reservoir — and the blessing follows you into every life to come.",
        "Death is not the end of the spray. Walk into the light when you are ready, and try again.",
      ],
      repeat: ["The water remembers you, child.", "Again you fall — again you rise.", "Spend what you have earned; the street still thirsts.", "Pressure builds in the faithful. Return to the light."],
    },
    // Walkable scene layout (logical px). Jon spawns at spawnX and walks right:
    // Father Jon materializes at fatherX; blessing stations sit along the nave;
    // walking into portalX (within portalReach) returns you to the street.
    layout: {
      length: 720, spawnX: 28, fatherX: 168, altarX: 300, portalX: 660,
      portalReach: 18, stationRange: 24,
      stations: [
        { id: "bless_dps",  x: 396 },
        { id: "bless_tank", x: 470 },
        { id: "bless_hp",   x: 544 },
      ],
    },
    // Shrine -> element -> redeeming boss (s.type). null boss = capstone (Water/Jon).
    shrines: [
      { element: "earth", boss: "quake",  label: "EARTH" },
      { element: "fire",  boss: "slayer", label: "FIRE"  },
      { element: "air",   boss: "assman", label: "AIR"   },
      { element: "water", boss: null,     label: "WATER" },
    ],
    // Permanent blessings (repeatable, +1-per-level cost via Balance.blessingCost).
    blessings: [
      { id: "bless_dps",  name: "Anointed Pressure", desc: "+4 spray dmg",   apply: (s) => { s.sprayDamage += 4; } },
      { id: "bless_tank", name: "Deep Reservoir",    desc: "+15 max water",  apply: (s) => { s.maxWater += 15; } },
      { id: "bless_hp",   name: "Blessed Vigor",     desc: "+20 max HP",     apply: (s) => { s.maxHp += 20; } },
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

  // Act-start wave indices (bounded by boss clears) — death respawns here.
  // 0 Act1 · 5 Act2 (after Big Drip) · 8 Act3 (after Switch) · 10 Act4 (after Quake).
  JH.ACT_STARTS = [0, 5, 8, 10];

  // ---- Level 1 waves --------------------------------------------------
  // Each wave: list of {type, count}. Gate progress until cleared, then
  // open the shop (except before the boss, which is its own finale).
  JH.LEVEL1 = {
    waves: [
      { name: "WAVE 1", spawns: [{ type: "mook", count: 3 }] },
      { name: "WAVE 2", spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 1 }] },
      // Gentle intro to the Pyro — mostly familiar mooks plus a single pyro.
      { name: "WAVE 3", spawns: [{ type: "mook", count: 3 }, { type: "pyro", count: 1 }] },
      { name: "WAVE 4", spawns: [{ type: "mook", count: 2 }, { type: "charger", count: 2 }] },
      { name: "BOSS", boss: true },                          // mid-boss: The Big Drip
      // ---- Act 2: everything from here is ELITE (much tougher) ----
      { name: "WAVE 5", tough: true, spawns: [{ type: "pyro", count: 2 }, { type: "charger", count: 2 }] },
      { name: "BARRICADE", wall: true, tough: true, wallHp: 360,
        spawns: [{ type: "mook", count: 2 }, { type: "charger", count: 1 }] }, // spawn pool while wall stands
      { name: "THE SWITCH", boss: true, bossType: "switch" }, // act-2 boss: The Switch of Doom
      // ---- Act 3: the ruined district — broken buildings & debris ----
      { name: "RUBBLE ROW", tough: true, spawns: [{ type: "charger", count: 2 }, { type: "pyro", count: 1 }, { type: "mook", count: 2 }] },
      { name: "QUAKE WALKER", boss: true, bossType: "quake" },
      // ---- Act 4: the aftermath — Quake Walker turns ally ----
      { name: "WAVE 6", tough: true, spawns: [{ type: "mook", count: 3 }, { type: "pyro", count: 1 }, { type: "charger", count: 1 }] },
      { name: "THE GARDEN", garden: true },
      { name: "WAVE 7", tough: true, spawns: [{ type: "charger", count: 2 }, { type: "pyro", count: 2 }, { type: "mook", count: 1 }] },
      { name: "GATEWAY KRUSHER 9000", boss: true, bossType: "gatewaykrusher" },  // true finale
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
  };
})();
