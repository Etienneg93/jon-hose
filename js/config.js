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
  JH.LEVEL_LEN = 4380;      // world length of level 1 (logical px)

  // Interactive fire hydrants: stand next to one to refill fast (any water
  // level). Spread along the street so you're never far from a top-up.
  JH.HYDRANTS = [
    { x: 300,  y: JH.DEPTH_MAX - 10 },
    { x: 1100, y: JH.DEPTH_MIN + 12 },
    { x: 1900, y: JH.DEPTH_MAX - 14 },
    { x: 2700, y: JH.DEPTH_MIN + 10 },
    { x: 3500, y: JH.DEPTH_MAX - 12 },
  ];
  JH.HYDRANT = { range: 30, lowFrac: 0.5, refill: 50 }; // boost rate when below lowFrac of tank

  // Walk-up shop vendor between fights.
  JH.SHOP = { range: 28 };

  // Colour palette (kept central so procedural art + UI stay in sync).
  JH.PAL = {
    skin: "#f1c08a", skinDark: "#c98f5a",
    jonShirt: "#2f6db5", jonShirtDk: "#1d4a80",
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
    suds: "#ffd23f", hpPk: "#ff5a5a",
    shadow: "rgba(0,0,0,0.35)",
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
    waterRegen: 14,         // units/sec passive recovery (steady, not too quick)
    regenDelay: 0.5,        // sec after spraying before regen kicks in
    sprayDamage: 58,        // dmg/sec at FULL pressure (beats melee's ~53 DPS)
    sprayRange: 78,         // stream reach (px)
    sprayWidth: 18,         // depth half-band the stream covers
    knockback: 115,         // px/sec impulse imparted by spray (punchy)
    pierce: 0,              // extra targets the stream passes through (nozzle)
    beam: 0,                // stream concentration tier (0=hose spray .. 3=lance)
    waterReturn: 0,         // water units/sec refunded while hosing a target (Closed Loop)
    clearHeal: 0,           // fraction of max HP healed on wave clear (Second Wind)
    dashPuddle: false,      // dash leaves a slick water puddle (Hydro-Dash)

    // Melee fallback (no water cost) — deliberately weak so the hose wins at
    // any decent pressure; melee is just for when you're dry.
    meleeDamage: 11,
    meleeRange: 26,
    meleeCd: 0.34,
    meleeKnock: 110,

    bodyW: 16, bodyH: 30,   // collision box (px), feet-anchored
  };

  // ---- Enemy archetypes ----------------------------------------------
  JH.ENEMIES = {
    mook: {
      name: "Mook", hp: 40, speed: 46, touchDmg: 8, contactCd: 0.8,
      meleeDmg: 10, meleeRange: 20, meleeWind: 0.45, suds: 6,
      waterMult: 1, bodyW: 16, bodyH: 28, color: "mook",
    },
    charger: {
      name: "Charger", hp: 55, speed: 40, touchDmg: 6, contactCd: 0.8,
      chargeSpeed: 200, chargeWind: 0.6, chargeDur: 0.55, chargeCd: 1.8,
      chargeDmg: 16, suds: 11, waterMult: 1, bodyW: 18, bodyH: 30, color: "charger",
    },
    pyro: {
      name: "Pyro", hp: 36, speed: 38, touchDmg: 10, contactCd: 0.7,
      shootRange: 150, shootCd: 1.6, emberSpeed: 130, emberDmg: 9,
      suds: 14, waterMult: 2.2, /* doused fast */ bodyW: 16, bodyH: 28, color: "pyro",
    },
  };

  JH.BOSS = {
    name: "The Big Drip", hp: 620, speed: 34, bodyW: 40, bodyH: 56,
    touchDmg: 14, contactCd: 0.9, suds: 120, color: "boss",
    slamDmg: 20, slamRange: 40, slamWind: 0.85,
    sweepDmg: 16, sweepRange: 56, sweepWind: 1.0,
    summonCd: 6.5, enrageAt: 0.4, summonType: "mook",   // hp fraction → faster attacks
  };

  // Final boss — "The Switch of Doom" (Jon Hose cinematic universe): an 8-port
  // network switch with Doc-Ock cable tentacles. Fires TELEGRAPHED full-width
  // LINE attacks along a depth row; dodge by moving up/down a lane (or jumping).
  JH.SWITCH = {
    name: "The Switch of Doom", hp: 1000, speed: 30, bodyW: 48, bodyH: 30,
    touchDmg: 14, contactCd: 0.9, suds: 240, color: "switchBody",
    lineDmg: 22, lineBand: 11, lineWind: 0.95, enrageAt: 0.45,
  };

  // Destructible barricade encounter: smash the wall while enemies keep coming,
  // then walk through to the next zone.
  JH.WALL = { hp: 360, spawnEvery: 1.5, maxAlive: 3 };

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
      { name: "FINAL BOSS", boss: true, bossType: "switch" }, // finale: The Switch of Doom
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
    die:    { type: "saw", freq: 70, dur: 0.4, gain: 0.16 },
    win:    { type: "square", freq: 990, dur: 0.5, gain: 0.14 },
    jump:   { type: "square", freq: 480, dur: 0.09, gain: 0.08 },
  };
})();
