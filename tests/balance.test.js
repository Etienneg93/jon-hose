"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Balance = require("../js/balance.js");

test("actLevelForWave maps wave index to elite act tier", () => {
  assert.strictEqual(Balance.actLevelForWave(0), -1);  // Act 1, no elites
  assert.strictEqual(Balance.actLevelForWave(4), -1);  // mid-boss wave
  assert.strictEqual(Balance.actLevelForWave(5), 0);   // first elite wave
  assert.strictEqual(Balance.actLevelForWave(7), 0);   // Act 2
  assert.strictEqual(Balance.actLevelForWave(8), 1);   // Act 3
  assert.strictEqual(Balance.actLevelForWave(9), 1);
  assert.strictEqual(Balance.actLevelForWave(10), 2);  // Act 4
  assert.strictEqual(Balance.actLevelForWave(13), 2);
});

test("dropThresholds reproduces base rates at mult 1", () => {
  const t = Balance.dropThresholds(1);
  assert.strictEqual(t.health, 0.18);
  assert.ok(Math.abs(t.water - 0.45) < 1e-9);   // 0.18 + 0.27
});

test("dropThresholds scales item chances by mult and stays cumulative", () => {
  const t = Balance.dropThresholds(1.8);
  assert.ok(Math.abs(t.health - 0.324) < 1e-9); // 0.18 * 1.8
  assert.ok(Math.abs(t.water - 0.81) < 1e-9);   // 0.324 + 0.27*1.8 (0.486)
  assert.ok(t.water > t.health);
});

test("dropThresholds caps so drops are never guaranteed", () => {
  const t = Balance.dropThresholds(10);
  assert.ok(t.health <= 0.45);
  assert.ok(t.water <= 0.9);
});

test("dropThresholds applies cumulative water cap at mult 2", () => {
  const t = Balance.dropThresholds(2);
  assert.ok(Math.abs(t.health - 0.36) < 1e-9);  // 0.18 * 2
  assert.ok(Math.abs(t.water - 0.9) < 1e-9);    // min(0.9, 0.36 + 0.54)
});

test("eliteScale ramps by act level", () => {
  const a2 = Balance.eliteScale(0, 0);
  const a4 = Balance.eliteScale(2, 0);
  assert.strictEqual(a2.hp, 1.3);
  assert.strictEqual(a4.hp, 1.8);
  assert.ok(a4.dmg > a2.dmg);
  assert.ok(a4.speed > a2.speed);
});

test("eliteScale ramps with player power and caps at 15 owned", () => {
  const fresh = Balance.eliteScale(2, 0);
  const mid = Balance.eliteScale(2, 10);
  const capped = Balance.eliteScale(2, 15);
  const over = Balance.eliteScale(2, 99);
  assert.ok(mid.hp > fresh.hp);
  assert.strictEqual(capped.hp, over.hp);   // capped at 15
  assert.strictEqual(over.hp, 2.61);        // 1.8 * (1 + 0.03*15) = 1.8*1.45
});
