"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
global.window.addEventListener = global.window.addEventListener || (() => {});
require("../js/config.js");
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/entities.js");
require("../js/game.js");
const JH = global.window.JH;

test("JH.JUICE: hit-stop tier table and shake constants exist", () => {
  const J = JH.JUICE;
  assert.ok(J, "JH.JUICE missing");
  for (const k of ["kill", "heavyKill", "waveEnd", "playerHit", "domePop", "bossPhase"])
    assert.strictEqual(typeof J.hitstop[k], "number", "hitstop." + k);
  assert.ok(J.hitstop.waveEnd > J.hitstop.heavyKill && J.hitstop.heavyKill > J.hitstop.kill);
  assert.ok(Array.isArray(J.heavyTypes) && J.heavyTypes.includes("furnace"));
  for (const k of ["traumaDiv", "traumaDecay", "shakeMax", "shakeScale", "vacuumDur",
                   "splatCap", "splatFade", "comboPitchCap", "comboWaterRefund"])
    assert.strictEqual(typeof J[k], "number", k);
});

function shakeStub() { return { trauma: 0, shakeKickX: 0 }; }

test("shake: trauma accumulates and caps at 1", () => {
  const g = shakeStub();
  JH.Game.shake.call(g, 5);
  const t1 = g.trauma;
  assert.ok(t1 > 0 && t1 < 1);
  for (let i = 0; i < 20; i++) JH.Game.shake.call(g, 12);
  assert.strictEqual(g.trauma, 1);
});

test("shake: amplitude follows trauma-squared and respects shakeScale", () => {
  const g = shakeStub();
  g.trauma = 1;
  let max = 0;
  for (let i = 0; i < 200; i++) {
    const o = JH.Game.shakeOffset.call(g);
    max = Math.max(max, Math.abs(o.y));
  }
  assert.ok(max <= 0.5 * JH.JUICE.shakeMax * JH.JUICE.shakeScale + 1e-9);
  assert.ok(max > 0.2 * JH.JUICE.shakeMax, "full trauma should visibly shake");
  g.trauma = 0.3;                       // trauma² = 0.09 → tiny
  let max2 = 0;
  for (let i = 0; i < 200; i++) max2 = Math.max(max2, Math.abs(JH.Game.shakeOffset.call(g).y));
  assert.ok(max2 < max * 0.2, "small trauma should be near-invisible (squared curve)");
});

test("tickShake: trauma decays to zero and clears the kick", () => {
  const g = shakeStub();
  JH.Game.shake.call(g, 8, -1);
  assert.strictEqual(g.shakeKickX, -1);
  for (let i = 0; i < 120; i++) JH.Game.tickShake.call(g, 1 / 60);
  assert.strictEqual(g.trauma, 0);
  assert.strictEqual(g.shakeKickX, 0);
  const o = JH.Game.shakeOffset.call(g);
  assert.deepStrictEqual(o, { x: 0, y: 0 });
});

test("shake: directional kick biases x away from impact", () => {
  const g = shakeStub();
  JH.Game.shake.call(g, 10, -1);        // impact from the right → kick left
  let mean = 0;
  for (let i = 0; i < 400; i++) mean += JH.Game.shakeOffset.call(g).x;
  mean /= 400;
  assert.ok(mean < -0.5, "offsets should bias in the kick direction, got " + mean);
});

// Stub with the real juice methods bound, so Enemy.die exercises them.
function killStub(waveActive) {
  const g = {
    waveActive: !!waveActive, combo: 0, kills: 0,
    comboTimer: 0, comboFlash: 0,
    enemies: [], embers: [], splats: [], particles: [], pickups: [],
    player: { x: 0, y: 0, alive: true, stats: { maxWater: 100 }, water: 50, regenLock: 1 },
    hitStopTimer: 0, lootVacuumT: 0, trauma: 0, shakeKickX: 0,
    audio: { played: [], play(k, o) { this.played.push({ k, o }); } },
    dropLoot() {}, onEnemyKilled(e) { JH.Game.onEnemyKilled.call(this, e); },
    hitStop(s) { this.hitStopTimer = Math.max(this.hitStopTimer, s); },
    shake(n, d) { JH.Game.shake.call(this, n, d); },
    killJuice(e) { JH.Game.killJuice.call(this, e); },
    addSplat(x, y, w) { JH.Game.addSplat.call(this, x, y, w); },
  };
  return g;
}

test("killJuice: regular kill = kill tier + white KillPop", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.kill);
  assert.ok(g.embers.some((m) => m instanceof JH.KillPop), "KillPop spawned");
  assert.strictEqual(g.splats.length, 0, "no splat for a mook");
});

test("killJuice: elite kill = heavy tier + boom + wet splat", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  e.makeElite();
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.heavyKill);
  assert.ok(g.embers.some((m) => m instanceof JH.FxBurst), "boom FxBurst spawned");
  assert.strictEqual(g.splats.length, 1);
});

test("killJuice: last kill of an active wave = waveEnd tier + loot vacuum", () => {
  const g = killStub(true);
  const e1 = new JH.Enemy("mook", 50, 40);
  const e2 = new JH.Enemy("mook", 90, 40);
  g.enemies.push(e1, e2);
  e1.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.kill, "not last yet");
  assert.strictEqual(g.lootVacuumT, 0);
  e2.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.waveEnd);
  assert.strictEqual(g.lootVacuumT, JH.JUICE.vacuumDur);
});

test("killJuice: kill sound pitch climbs with the combo and caps", () => {
  const g = killStub(false);
  for (let i = 0; i < 15; i++) {
    const e = new JH.Enemy("mook", 50, 40);
    g.enemies.push(e);
    e.die(g);
  }
  const dies = g.audio.played.filter((s) => s.k === "die");
  assert.strictEqual(dies[0].o.pitch, 1, "first kill at base pitch");
  assert.ok(dies[5].o.pitch > dies[1].o.pitch, "ladder climbs");
  const cap = Math.pow(2, JH.JUICE.comboPitchCap / 12);
  assert.ok(Math.abs(dies[14].o.pitch - cap) < 1e-9, "caps at +12 semitones");
});

test("addSplat: cap culls oldest", () => {
  const g = killStub(false);
  for (let i = 0; i < JH.JUICE.splatCap + 5; i++) g.addSplat(i, 40, 16);
  assert.strictEqual(g.splats.length, JH.JUICE.splatCap);
  assert.strictEqual(g.splats[0].x, 5, "oldest culled first");
});

test("KillPop: expires after ~70ms", () => {
  const kp = new JH.KillPop(new JH.Enemy("mook", 10, 40));
  for (let i = 0; i < 3; i++) kp.update(0.016);
  assert.ok(!kp.dead);
  for (let i = 0; i < 3; i++) kp.update(0.016);
  assert.ok(kp.dead);
});

test("hurt() arms both the flash and the squash", () => {
  const e = new JH.Enemy("mook", 0, 0);
  e.hurt();
  assert.strictEqual(e.flashTimer, 0.18);
  assert.ok(e.squashT > 0 && e.squashT <= 0.12);
});

test("Pickup: arena-wide vacuum while lootVacuumT is live", () => {
  const mk = () => { const p = new JH.Pickup("suds", 400, 40, 5); p.grounded = true; p.z = 0; return p; };
  const base = { player: { x: 60, y: 40 }, lootVacuumT: 0 };
  const still = mk();
  still.update(0.016, base);
  assert.strictEqual(still.x, 400, "no magnet from 340px away normally");
  const vac = mk();
  vac.update(0.016, Object.assign({}, base, { lootVacuumT: 1 }));
  assert.ok(vac.x < 400, "vacuum pulls from across the arena");
});

test("Player.takeHit: playerHit tier + shake kicked away from impact", () => {
  JH.Upgrades.reset();
  const p = new JH.Player(60, 40);
  const g = killStub(false);
  g.player = p;
  p.takeHit(10, g, 100);      // hit from the right
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.playerHit);
  assert.strictEqual(g.shakeKickX, -1, "kick away from impact (leftward)");
});
