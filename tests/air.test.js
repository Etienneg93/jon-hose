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

function stubPlayer(x, y) {
  JH.Upgrades.reset();
  const p = new JH.Player(x, y);
  return p;
}
function stubHazardGame(px, py) {
  return {
    player: Object.assign(stubPlayer(px, py), { x: px, y: py }),
    enemies: [], embers: [], particles: [], firePatches: [], shields: [],
    stinkClouds: [], gustLanes: [],
    bounds: { minX: 0, maxX: 480 },
    audio: { play() {} }, shake() {}, hitStop() {}, defer() {},
    killJuice() {}, dropLoot() {}, onEnemyKilled() {}, spawnEnemy() {},
    canAttack() { return true; }, sigils: [], banner() {}, combo: 0,
  };
}

test("stink cloud: grows in from the vent point, never spawns full size", () => {
  const c = new JH.StinkCloud(100, 40);
  assert.ok(c.footprint().rx < JH.STINK.radius * 0.3, "t=0 must be near-point");
  c.t = JH.STINK.growT;
  assert.ok(Math.abs(c.footprint().rx - JH.STINK.radius) < 0.001, "full size at growT");
});

test("stink cloud rim: inside tags player.gasT, outside (x and depth) does not", () => {
  const S = JH.STINK;
  const g = stubHazardGame(100, 40);
  const c = new JH.StinkCloud(100, 40); c.t = S.growT;   // full grown
  g.stinkClouds.push(c);
  const f = c.footprint(), pad = g.player.bodyW * 0.25;
  // inside the rim (x axis)
  g.player.x = 100 + f.rx + pad - 2; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.ok(g.player.gasT > 0, "inside rim must tag gasT");
  // outside the rim (x axis)
  g.player.x = 100 + f.rx + pad + 3; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.strictEqual(g.player.gasT, 0, "outside rim must not tag");
  // outside in DEPTH: rim ry = rx*GROUND_RY, so depth f.rx would be a circle bug
  g.player.x = 100; g.player.y = 40 + f.rx * 0.8; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.strictEqual(g.player.gasT, 0, "depth uses the flattened ellipse");
});

test("gas demotes the pressure tier one step (full -> low reach)", () => {
  const g = stubHazardGame(100, 40);
  const p = g.player;
  p.water = p.stats.maxWater * 0.5;   // full tier (0.25..0.8)
  p.gasT = 0; p.doSpray(1 / 60, g);
  const cleanReach = p._dbgReach;
  p.gasT = 0.15; p.doSpray(1 / 60, g);
  assert.ok(p._dbgReach < cleanReach, "gassed reach must shrink");
  assert.ok(Math.abs(p._dbgReach - p.stats.sprayRange * 0.55) < 0.001,
    "full tier demotes to the LOW tier rangeMult");
});

test("spraying into a cloud disperses it; speed scales with spray damage", () => {
  const g = stubHazardGame(100, 40);
  const c = new JH.StinkCloud(150, 40); c.t = JH.STINK.growT;
  g.stinkClouds.push(c);
  g.player.facing = 1; g.player.water = g.player.stats.maxWater;
  g.player.doSpray(1 / 60, g);
  const base = c.sprayProgress;
  assert.ok(base > 0, "stream over the cloud must add dispersal progress");
  c.sprayProgress = 0;
  g.player.stats.sprayDamage = JH.PLAYER.sprayDamage * 2;
  g.player.doSpray(1 / 60, g);
  assert.ok(c.sprayProgress > base * 1.5, "dispersal scales with spray damage");
  c.sprayProgress = JH.STINK.disperseDur;
  assert.ok(c.fadeFrac() >= 1, "fully dispersed cloud is gone");
});

test("friendly cloud cooks enemies, ignores the player; hostile stack check", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("mook", 100, 40);   // any live enemy works
  g.enemies.push(e);
  const fc = JH.spawnStinkCloud(g, 100, 40, { friendly: true });
  fc.t = JH.STINK.growT;
  const hp0 = e.hp; g.player.gasT = 0;
  fc.update(0.5, g);
  assert.ok(e.hp < hp0, "friendly cloud damages enemies");
  assert.strictEqual(g.player.gasT, 0, "friendly cloud never gasses Jon");
  // Hostile clouds don't stack on the same spot; friendly always spawns.
  const h1 = JH.spawnStinkCloud(g, 200, 40); h1.t = JH.STINK.growT;
  assert.strictEqual(JH.spawnStinkCloud(g, 200, 40), null);
  assert.ok(JH.spawnStinkCloud(g, 200, 40, { friendly: true }) !== null);
});
