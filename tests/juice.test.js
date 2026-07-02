"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
global.window.addEventListener = global.window.addEventListener || (() => {});
require("../js/config.js");
global.window.JH.Loader = { img: () => ({}) };
// assets.js creates an offscreen canvas at eval time — stub the DOM bits so
// AudioFX (SFX channel) is loadable in node. AudioContext stays absent, so
// play() is a no-op; only the volume plumbing is under test.
const ctx2dStub = { save() {}, restore() {}, clearRect() {}, fillRect() {}, drawImage() {} };
global.document = global.document || {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2dStub }),
};
require("../js/assets.js");
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
  // Design rule: no kill or hit ever freezes the sim — freezes are reserved
  // for boss-scale beats (domePop / bossPhase).
  for (const k of ["kill", "heavyKill", "waveEnd", "playerHit"])
    assert.strictEqual(J.hitstop[k], 0, "hitstop." + k + " must stay 0");
  assert.ok(Array.isArray(J.heavyTypes) && J.heavyTypes.includes("furnace"));
  for (const k of ["traumaDiv", "traumaDecay", "shakeMax", "shakeScale", "vacuumDur",
                   "vacuumPull", "comboPitchCap", "comboWaterRefund", "squashDur",
                   "squashAmp", "wetTintMax", "wetPerHit", "wetDryPerSec",
                   "gushRegenDur", "gushRegen3", "gushRegen5"])
    assert.strictEqual(typeof J[k], "number", k);
  assert.strictEqual(J.hitstop.kill, 0, "regular kills must not freeze the sim");
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
    enemies: [], embers: [], particles: [], pickups: [],
    player: { x: 0, y: 0, alive: true, stats: { maxWater: 100 }, water: 50, regenLock: 1 },
    hitStopTimer: 0, lootVacuumT: 0, trauma: 0, shakeKickX: 0,
    audio: { played: [], play(k, o) { this.played.push({ k, o }); } },
    dropLoot() {}, onEnemyKilled(e) { JH.Game.onEnemyKilled.call(this, e); },
    deferredQueue: [],
    defer(ms, fn) { JH.Game.defer.call(this, ms, fn); },
    tickDeferred(dt) { JH.Game.tickDeferred.call(this, dt); },
    hitStop(s) { this.hitStopTimer = Math.max(this.hitStopTimer, s); },
    shake(n, d) { JH.Game.shake.call(this, n, d); },
    killJuice(e) { JH.Game.killJuice.call(this, e); },
  };
  return g;
}

test("killJuice: regular kill = NO freeze + KillPop confirm", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.hitStopTimer, 0, "regular kills never freeze the sim");
  assert.ok(g.embers.some((m) => m instanceof JH.KillPop), "KillPop spawned");
});

test("killJuice: elite kill = boom, still no freeze", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  e.makeElite();
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.hitStopTimer, 0, "elite kills never freeze");
  assert.ok(g.embers.some((m) => m instanceof JH.FxBurst), "boom FxBurst spawned");
});

test("killJuice: last kill of an active wave = shake + loot drift, NO freeze", () => {
  const g = killStub(true);
  const e1 = new JH.Enemy("mook", 50, 40);
  const e2 = new JH.Enemy("mook", 90, 40);
  g.enemies.push(e1, e2);
  e1.die(g);
  assert.strictEqual(g.lootVacuumT, 0);
  e2.die(g);
  assert.strictEqual(g.hitStopTimer, 0, "wave-ender never freezes");
  assert.ok(g.trauma > 0, "wave-ender shakes");
  assert.strictEqual(g.lootVacuumT, JH.JUICE.vacuumDur);
});

test("killJuice: dedicated kill blip pitch climbs with the combo and caps", () => {
  const g = killStub(false);
  for (let i = 0; i < 15; i++) {
    const e = new JH.Enemy("mook", 50, 40);
    g.enemies.push(e);
    e.die(g);
  }
  const kills = g.audio.played.filter((s) => s.k === "kill");
  assert.strictEqual(kills.length, 15, "audible kill blip on every kill");
  assert.strictEqual(kills[0].o.pitch, 1, "first kill at base pitch");
  assert.ok(kills[5].o.pitch > kills[1].o.pitch, "ladder climbs");
  const cap = Math.pow(2, JH.JUICE.comboPitchCap / 12);
  assert.ok(Math.abs(kills[14].o.pitch - cap) < 1e-9, "caps at +12 semitones");
  assert.ok(JH.SFX.kill, "kill blip has an SFX definition");
});

test("wetness: spray hits soak, time dries", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  assert.strictEqual(e.wetness, 0);
  e.takeDamage(1, g, 1);
  const w1 = e.wetness;
  assert.ok(w1 > 0, "a hit soaks");
  for (let i = 0; i < 50; i++) e.takeDamage(1, g, 1);
  assert.strictEqual(e.wetness, 1, "caps at 1");
  // drying happens in Enemy.update; simulate the decay directly
  const before = e.wetness;
  e.update(0.5, { player: { x: 999, y: 999, z: 0, alive: true, bodyW: 12 },
                  bounds: { minX: 0, maxX: 600 }, particles: [],
                  audio: { play() {} } });
  assert.ok(e.wetness < before, "dries over time");
});

test("KillPop: ~150ms collapse that carries the enemy's wetness", () => {
  const e = new JH.Enemy("mook", 10, 40);
  e.wetness = 0.6;
  const kp = new JH.KillPop(e);
  assert.strictEqual(kp.wet, 0.6, "soak tint survives into the collapse");
  for (let i = 0; i < 8; i++) kp.update(0.016);   // 128ms — still collapsing
  assert.ok(!kp.dead);
  for (let i = 0; i < 2; i++) kp.update(0.016);   // 160ms — done
  assert.ok(kp.dead);
});

test("Enemy.die: death burst waits for the collapse, not instant", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.particles.length, 0, "no particles at the moment of death");
  g.tickDeferred(0.15);
  assert.ok(g.particles.length > 0, "burst fires as the body finishes flattening");
});

test("AudioFX: independent SFX volume channel", () => {
  assert.strictEqual(typeof JH.AudioFX.volume, "number");
  JH.AudioFX.setVolume(1.7);
  assert.strictEqual(JH.AudioFX.volume, 1, "clamps high");
  JH.AudioFX.setVolume(-0.2);
  assert.strictEqual(JH.AudioFX.volume, 0, "clamps low");
  JH.AudioFX.setVolume(0.8);
  assert.strictEqual(JH.AudioFX.volume, 0.8);
});

test("Kibble stacks by extending the window, never overwriting", () => {
  const g = killStub(false);
  JH.Upgrades.reset();
  const p = new JH.Player(60, 40);
  g.player = p;
  new JH.Pickup("health", p.x, p.y, 25).collect(g);
  assert.strictEqual(p.kibbleTimer, 6.0);
  p.kibbleTimer = 3.5;                       // half spent
  new JH.Pickup("health", p.x, p.y, 25).collect(g);
  assert.strictEqual(p.kibbleTimer, 9.5, "second kibble extends, not resets");
});

test("burn damage lands in discrete ticks with a flash beat + ember puff", () => {
  JH.Upgrades.reset();
  const p = new JH.Player(60, 40);
  p.applyBurn(2);
  const g = { particles: [], audio: { play() {} } };
  const hp0 = p.hp;
  p.tickBurn(0.3, g);
  assert.strictEqual(p.hp, hp0, "no damage before a tick lands");
  assert.strictEqual(p.flashTimer, 0, "no flash between ticks");
  p.tickBurn(0.3, g);   // 0.6s elapsed → first tick fires
  assert.ok(p.hp < hp0, "tick chunks the damage");
  assert.ok(p.flashTimer > 0, "tick pulses the flash");
  assert.strictEqual(p.squashT, 0, "still no squash from burn");
  assert.ok(g.particles.length > 0, "tick puffs embers off Jon");
});

test("burn ticks drain the same total as the old continuous DoT", () => {
  JH.Upgrades.reset();
  const p = new JH.Player(60, 40);
  p.applyBurn(3);   // 3 stacks x 4 hp/s x 2s = 24 hp
  const g = { particles: [], audio: { play() {} } };
  const hp0 = p.hp;
  for (let t = 0; t < 2.2; t += 0.016) p.tickBurn(0.016, g);
  assert.ok(Math.abs((hp0 - p.hp) - 24) < 1.5, "total ~24, got " + (hp0 - p.hp));
  assert.strictEqual(p.burnStacks, 0, "stacks clear on expiry");
});

test("hurt(flashOnly) arms the flash but never the squash (burn DoT path)", () => {
  const e = new JH.Enemy("mook", 0, 0);
  e.hurt(true);
  assert.strictEqual(e.flashTimer, 0.18);
  assert.strictEqual(e.squashT, 0, "DoT ticks must not deform the sprite");
});

test("hurt() arms both the flash and the squash", () => {
  const e = new JH.Enemy("mook", 0, 0);
  e.hurt();
  assert.strictEqual(e.flashTimer, 0.18);
  assert.ok(e.squashT > 0 && e.squashT <= 0.15);
});

test("hurt() pulses complete before re-arming (continuous spray reads as beats)", () => {
  const e = new JH.Enemy("mook", 0, 0);
  e.hurt();
  e.flashTimer = 0.05; e.squashT = 0.03;   // mid-pulse
  e.hurt();                                 // spray tick lands again
  assert.strictEqual(e.flashTimer, 0.05, "flash pulse not extended mid-flight");
  assert.strictEqual(e.squashT, 0.03, "squash pulse not extended mid-flight");
  e.flashTimer = 0; e.squashT = 0;
  e.hurt();                                 // expired → re-arm
  assert.strictEqual(e.flashTimer, 0.18);
  assert.ok(e.squashT > 0);
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

test("Player.takeHit: no freeze, shake kicked away from impact", () => {
  JH.Upgrades.reset();
  const p = new JH.Player(60, 40);
  const g = killStub(false);
  g.player = p;
  p.takeHit(10, g, 100);      // hit from the right
  assert.strictEqual(g.hitStopTimer, 0, "player hits never freeze the sim");
  assert.strictEqual(g.shakeKickX, -1, "kick away from impact (leftward)");
});

test("GUSH x3 arms the minor water-regen window", () => {
  const g = killStub(false);
  g.combo = 2;
  JH.Game.onEnemyKilled.call(g, null);
  assert.strictEqual(g.combo, 3);
  assert.strictEqual(g.player.gushRegenT, JH.JUICE.gushRegenDur);
  assert.strictEqual(g.player.gushRegenRate, JH.JUICE.gushRegen3);
  assert.strictEqual(g.player.water, 50, "x3 grants regen, not a refund");
});

test("GUSH x5 bumps the regen tier and refunds water", () => {
  const g = killStub(false);
  g.combo = 4;
  g.player.water = 40; g.player.regenLock = 0.8;
  JH.Game.onEnemyKilled.call(g, null);
  assert.strictEqual(g.combo, 5);
  assert.strictEqual(g.player.gushRegenRate, JH.JUICE.gushRegen5);
  assert.strictEqual(g.player.gushRegenT, JH.JUICE.gushRegenDur);
  assert.strictEqual(g.player.water, 40 + JH.JUICE.comboWaterRefund);
  assert.strictEqual(g.player.regenLock, 0);
  assert.ok(g.audio.played.some((s) => s.k === "upgrade"), "audible milestone");
});

test("GUSH regen scales with the milestone — x20 pays 4x the x5 rate, uncapped", () => {
  const g = killStub(false);
  g.combo = 9;
  JH.Game.onEnemyKilled.call(g, null);        // x10
  assert.strictEqual(g.player.gushRegenRate, JH.JUICE.gushRegen5 * 2);
  g.combo = 19;
  JH.Game.onEnemyKilled.call(g, null);        // x20
  assert.strictEqual(g.player.gushRegenRate, JH.JUICE.gushRegen5 * 4);
  assert.ok(g.particles.length > 0, "milestone water burst spawned");
});

test("GUSH: non-milestone kills grant nothing", () => {
  const g = killStub(false);
  g.combo = 1;
  g.player.water = 40;
  JH.Game.onEnemyKilled.call(g, null);
  assert.strictEqual(g.player.water, 40);
  assert.ok(!g.player.gushRegenT, "no regen outside milestones");
});

test("Range stations: E grants kibble pickup / fires a GUSH milestone", () => {
  const g = killStub(false);
  g.pickups = [];
  g.player.x = 180; g.player.y = 40;
  let pending = true;
  g.input = { buffered: () => pending, consume() { pending = false; } };
  g.spawnPickup = function (kind, x, y, v) { this.pickups.push({ kind, x, y, v }); };
  g.rangeStations = [
    { kind: "kibble", x: 180, y: 40, near: false },
    { kind: "gush", x: 230, y: 40, near: false },
  ];
  JH.Game.tickRangeStations.call(g);
  assert.strictEqual(g.pickups.length, 1, "kibble station drops a health pickup");
  assert.strictEqual(g.pickups[0].kind, "health");
  // Move to the gush button, press again.
  g.player.x = 230; pending = true;
  JH.Game.tickRangeStations.call(g);
  assert.strictEqual(g.combo, 5, "first press lands the x5 milestone");
  assert.strictEqual(g.player.gushRegenRate, JH.JUICE.gushRegen5);
  pending = true;
  JH.Game.tickRangeStations.call(g);
  assert.strictEqual(g.combo, 10, "next press scales to x10");
  assert.strictEqual(g.player.gushRegenRate, JH.JUICE.gushRegen5 * 2);
});

test("Player: gush regen ticks water up while the window is live", () => {
  JH.Upgrades.reset();
  const p = new JH.Player(60, 40);
  const noIn = { held: () => false, pressed: () => false, buffered: () => false, consume() {} };
  const g = { input: noIn, audio: { play() {} }, particles: [], embers: [],
              enemies: [], shields: [], firePatches: [], pickups: [],
              bounds: { minX: 0, maxX: 600 }, shake() {}, hitStop() {} };
  p.water = 50;
  p.gushRegenT = 2; p.gushRegenRate = JH.JUICE.gushRegen3;
  p.regenLock = 99;              // regular regen locked out — gush still ticks
  p.update(0.5, g);
  assert.ok(p.water > 50 + JH.JUICE.gushRegen3 * 0.5 * 0.9, "water regenerated");
  assert.ok(p.gushRegenT < 2, "window counts down");
});
