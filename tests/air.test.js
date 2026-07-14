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

test("gust lane rim: the drawn band edge is the push edge; telegraph never pushes", () => {
  const G = JH.GUST;
  const g = stubHazardGame(200, 40);
  const lane = new JH.GustLane(40, 1);
  g.gustLanes.push(lane);
  lane.phase = "blow"; lane.phaseT = G.blowDur;
  // inside the band
  g.player.y = 40 + G.band - 1; const x0 = g.player.x;
  lane.update(1 / 60, g);
  assert.ok(g.player.x > x0, "inside the band: pushed along +X");
  // just outside the band
  g.player.y = 40 + G.band + 1; const x1 = g.player.x;
  lane.update(1 / 60, g);
  assert.strictEqual(g.player.x, x1, "outside the drawn edge: untouched");
  // telegraph phase never pushes
  lane.phase = "telegraph"; lane.phaseT = G.telegraph;
  g.player.y = 40; const x2 = g.player.x;
  lane.update(1 / 60, g);
  assert.strictEqual(g.player.x, x2);
});

test("gust lane: displaces light enemies; emplacements and bosses hold fast", () => {
  const g = stubHazardGame(200, 0);
  const lane = new JH.GustLane(40, 1);
  lane.phase = "blow"; lane.phaseT = JH.GUST.blowDur;
  const mook = JH.makeEnemy("mook", 100, 40);
  const turret = JH.makeEnemy("bidet", 140, 40);
  const boss = JH.makeEnemy("mook", 180, 40); boss.isBoss = true;
  g.enemies.push(mook, turret, boss);
  lane.update(1 / 60, g);
  assert.ok(mook.x > 100, "light enemy shoved");
  assert.strictEqual(turret.x, 140, "speed-0 emplacement immune");
  assert.strictEqual(boss.x, 180, "boss immune");
});

test("gust lane cycle: telegraph -> blow -> gap -> telegraph", () => {
  const G = JH.GUST;
  const g = stubHazardGame(0, 0);
  const lane = new JH.GustLane(40, 1);
  assert.strictEqual(lane.phase, "telegraph");
  lane.update(G.telegraph + 0.01, g);
  assert.strictEqual(lane.phase, "blow");
  lane.update(G.blowDur + 0.01, g);
  assert.strictEqual(lane.phase, "gap");
  lane.update(G.gapDur + 0.01, g);
  assert.strictEqual(lane.phase, "telegraph");
});

test("plunger: lunge contact latches and drains WATER, not HP", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  g.enemies.push(e);
  e.state = "lunge"; e.attackTimer = JH.ENEMIES.plunger.lungeDur;
  e.aimAng = 0; e.spawnGrace = 0;
  const hp0 = g.player.hp, w0 = g.player.water;
  e.think(1 / 60, g);
  assert.strictEqual(e.state, "latch");
  e.think(1, g);   // one full latched second
  assert.ok(w0 - g.player.water >= JH.ENEMIES.plunger.latchDrain * 0.99,
    "latch drains latchDrain water/s");
  assert.ok(g.player.hp >= hp0 - JH.ENEMIES.plunger.lungeDmg,
    "only the lunge hit touches HP, the latch itself never does");
});

test("plunger: a dash breaks the latch; latch ignores spray knockback", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 100, 40);
  e.state = "latch"; e.latchT = 2;
  e.applyKnockback(1, 500);
  assert.strictEqual(e.knockVX || 0, 0, "suction holds through knockback");
  g.player.dashTimer = 0.1;
  e.think(1 / 60, g);
  assert.notStrictEqual(e.state, "latch", "dash pops it off");
  assert.ok(e.cdTimer > 0, "broken latch goes on lunge cooldown");
});

test("plunger: dash i-frames also dodge the lunge grab itself", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  e.state = "lunge"; e.attackTimer = JH.ENEMIES.plunger.lungeDur; e.aimAng = 0;
  g.player.dashTimer = 0.1;
  e.think(1 / 60, g);
  assert.notStrictEqual(e.state, "latch");
});

test("makeElite scales the air-roster damage keys", () => {
  const e = JH.makeEnemy("plunger", 0, 0);
  const base = JH.ENEMIES.plunger.lungeDmg;
  e.makeElite({ hp: 2, dmg: 1.5, speed: 1 });
  assert.strictEqual(e.def.lungeDmg, Math.round(base * 1.5));
});

test("tpmummy: streamer drop-in drifts down without a landing slam", () => {
  const g = stubHazardGame(200, 40);
  const e = JH.makeEnemy("tpmummy", 100, 40);
  e.beginDrop(0);
  assert.strictEqual(e.z, JH.ENEMIES.tpmummy.driftH);
  g.player.x = 100; g.player.y = 40;
  const hp0 = g.player.hp;
  for (let i = 0; i < 400 && e.dropping; i++) e.update(1 / 60, g);
  assert.strictEqual(e.dropping, false);
  assert.strictEqual(e.z, 0);
  assert.strictEqual(g.player.hp, hp0, "no landing slam — harasser entry");
});

test("tpmummy wrap: snares (soft slow) only when the hit lands", () => {
  const g = stubHazardGame(100, 40);
  const d = JH.ENEMIES.tpmummy;
  const wrap = new JH.TPWrap(80, 40, 100, 40, d);
  // i-framed: no hit, no snare
  g.player.invulnTimer = 1;
  for (let i = 0; i < 60 && !wrap.dead; i++) wrap.update(1 / 60, g);
  assert.strictEqual(g.player.snareT, 0);
  // clean hit: snare lands
  const g2 = stubHazardGame(100, 40);
  const wrap2 = new JH.TPWrap(80, 40, 100, 40, d);
  for (let i = 0; i < 60 && !wrap2.dead; i++) wrap2.update(1 / 60, g2);
  assert.ok(wrap2.dead);
  assert.strictEqual(g2.player.snareT, d.wrapSlowDur);
  assert.strictEqual(g2.player.snareMult, d.wrapSlow);
});

test("tpmummy wrap: a dodged hit (dodge chance) applies NOTHING — no hp, no snare", () => {
  const d = JH.ENEMIES.tpmummy;
  const g = stubHazardGame(100, 40);
  g.player.stats.dodgeChance = 1;   // Second Wind-style guaranteed dodge
  const hp0 = g.player.hp;
  const wrap = new JH.TPWrap(80, 40, 100, 40, d);
  for (let i = 0; i < 60 && !wrap.dead; i++) wrap.update(1 / 60, g);
  assert.ok(wrap.dead, "wrap still dies on contact");
  assert.strictEqual(g.player.hp, hp0, "dodged wrap deals no damage");
  assert.strictEqual(g.player.snareT, 0, "dodged wrap never snares");
  assert.strictEqual(g.player.snareMult, 1);
});

test("tpmummy death puff: shoves inside the rim, no damage, spares the rim-outside", () => {
  const d = JH.ENEMIES.tpmummy;
  const g = stubHazardGame(100 + d.puffRadius - 2, 40);
  const e = JH.makeEnemy("tpmummy", 100, 40);
  const hp0 = g.player.hp;
  e.die(g);
  assert.ok((g.player.knockVX || 0) > 0, "inside the puff rim: shoved");
  assert.strictEqual(g.player.hp, hp0, "the puff never damages");
  const g2 = stubHazardGame(100 + d.puffRadius + 3, 40);
  const e2 = JH.makeEnemy("tpmummy", 100, 40);
  e2.die(g2);
  assert.strictEqual(g2.player.knockVX || 0, 0, "outside the rim: untouched");
});
