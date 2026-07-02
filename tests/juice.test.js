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
