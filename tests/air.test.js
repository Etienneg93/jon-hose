"use strict";
const test = require("node:test");
const assert = require("node:assert");

// Capture the WAVE_TRIGGERS-length warning game.js emits at require time.
const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); realWarn(...a); };

global.window = global.window || {};
require("../js/config.js");
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/benedictions.js");   // Player.doSpray reads beneRank — load it like the game does
require("../js/entities.js");
require("../js/game.js");
console.warn = realWarn;
const JH = global.window.JH;
const Balance = require("../js/balance.js");

test("air act: ACT_STARTS gains the 6th act at wave 29", () => {
  assert.deepStrictEqual(JH.ACT_STARTS, [0, 5, 10, 16, 23, 29]);
  assert.strictEqual(Balance.actLevelForWave(29, JH.ACT_STARTS), 4);
  assert.strictEqual(Balance.actLevelForWave(31, JH.ACT_STARTS), 4);
  assert.strictEqual(Balance.actLevelForWave(28, JH.ACT_STARTS), 3);
});

test("air act: every act-indexed array has an entry for actLevel 4 (index 5)", () => {
  for (const [name, arr] of [
    ["TICKETS.budgets", JH.TICKETS.budgets],
    ["WAVEFLOW.fieldCap", JH.WAVEFLOW.fieldCap],
    ["SPRINKLE.counts", JH.SPRINKLE.counts],
    ["SPRINKLE.poolFloor", JH.SPRINKLE.poolFloor],
    ["SUPER_TUNE.hpByAct", JH.SUPER_TUNE.hpByAct],
    ["ELITE_FRAC", JH.ELITE_FRAC],
    ["SHOP.relicGradeOdds", JH.SHOP.relicGradeOdds],
  ]) assert.ok(arr.length >= 6, name + " needs 6 entries, has " + arr.length);
  // ELITE_FRAC is read UNCLAMPED (game.js waveEliteFrac) — a missing 6th
  // entry silently zeroes air-act elites.
  assert.ok(JH.ELITE_FRAC[5] > 0);
  assert.strictEqual(JH.SPRINKLE.poolFloor[5], JH.ACT_STARTS[5]);
});

test("air act: WAVE_TRIGGERS matches the wave list (no length warning)", () => {
  assert.strictEqual(warnings.filter((w) => w.includes("WAVE_TRIGGERS")).length, 0,
    "game.js warned: " + warnings.join(" | "));
  assert.strictEqual(JH.LEVEL1.waves.length, 32);  // 29 + the 3 air waves
});

test("air act: waves 30-32 are authored per spec (pair, +gusts, +gasbags/tough)", () => {
  const w = JH.LEVEL1.waves;
  const types = (i) => w[i].spawns.map((g) => g.type);
  assert.deepStrictEqual([...new Set(types(29))].sort(), ["plunger", "tpmummy"]);
  assert.ok(!w[29].gusts && !w[29].tough);
  assert.ok(w[30].gusts && w[30].gusts.length >= 1, "wave 31 introduces gust lanes");
  assert.ok(types(31).includes("gasbag") && w[31].tough, "wave 32 adds gasbags + elite seasoning");
  // All four defs exist and are honest (waterMult 1).
  for (const t of ["plunger", "tpmummy", "gasbag", "bidet"])
    assert.strictEqual(JH.ENEMIES[t].waterMult, 1, t + " must not hide a soak");
});

test("air act: sprinkle pool floor keeps fire enemies out of the air roster", () => {
  const pool = Balance.unlockedPool(JH.LEVEL1.waves, 30, JH.ACT_STARTS[5]);
  assert.ok(pool.includes("plunger") && pool.includes("tpmummy"));
  for (const t of ["fuse", "smelt", "furnace", "mook", "charger", "pyro"])
    assert.ok(!pool.includes(t), t + " must not sprinkle into the air act");
  // Default arg unchanged: full pool from wave 0.
  assert.ok(Balance.unlockedPool(JH.LEVEL1.waves, 30).includes("mook"));
});
