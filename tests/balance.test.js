"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Balance = require("../js/balance.js");

test("actLevelForWave maps wave index to elite act tier", () => {
  const AS = [0, 5, 8, 10];
  assert.strictEqual(Balance.actLevelForWave(0, AS), -1);  // Act 1, no elites
  assert.strictEqual(Balance.actLevelForWave(4, AS), -1);  // mid-boss wave
  assert.strictEqual(Balance.actLevelForWave(5, AS), 0);   // first elite wave
  assert.strictEqual(Balance.actLevelForWave(7, AS), 0);   // Act 2
  assert.strictEqual(Balance.actLevelForWave(8, AS), 1);   // Act 3
  assert.strictEqual(Balance.actLevelForWave(9, AS), 1);
  assert.strictEqual(Balance.actLevelForWave(10, AS), 2);  // Act 4
  assert.strictEqual(Balance.actLevelForWave(13, AS), 2);
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

test("capEnemyType clamps a type and reassigns excess to fallback", () => {
  const spawns = [{ type: "charger", count: 4 }, { type: "pyro", count: 1 }];
  const out = Balance.capEnemyType(spawns, "charger", 2, "mook");
  const charger = out.find((g) => g.type === "charger");
  const mook = out.find((g) => g.type === "mook");
  assert.strictEqual(charger.count, 2);
  assert.strictEqual(mook.count, 2);                  // 2 excess → mooks
  assert.strictEqual(out.find((g) => g.type === "pyro").count, 1);
});

test("capEnemyType merges fallback into an existing group and is non-mutating", () => {
  const spawns = [{ type: "charger", count: 3 }, { type: "mook", count: 1 }];
  const out = Balance.capEnemyType(spawns, "charger", 2, "mook");
  assert.strictEqual(out.find((g) => g.type === "mook").count, 2); // 1 + 1 excess
  assert.strictEqual(spawns[0].count, 3);             // original untouched
});

test("capEnemyType leaves under-cap lists unchanged", () => {
  const spawns = [{ type: "charger", count: 1 }];
  const out = Balance.capEnemyType(spawns, "charger", 2, "mook");
  assert.deepStrictEqual(out, [{ type: "charger", count: 1 }]);
});

test("repeatableCost rises 1.5x per purchase", () => {
  assert.strictEqual(Balance.repeatableCost(60, 0), 60);
  assert.strictEqual(Balance.repeatableCost(60, 1), 90);
  assert.strictEqual(Balance.repeatableCost(60, 2), 135);
  assert.strictEqual(Balance.repeatableCost(60, 3), 203); // round(202.5)
});

test("bulwarkShouldThrow: true when the player is within range", () => {
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 40, 150, 40, 80), true);  // dist 50 <= 80
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 40, 100, 40, 80), true);  // dist 0
});

test("bulwarkShouldThrow: false when the player is out of range", () => {
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 40, 250, 40, 80), false); // dist 150
});

test("bulwarkShouldThrow: accounts for depth (y), not just x", () => {
  // hypot(30, 80) ≈ 85.44 > 80
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 0, 130, 80, 80), false);
});

test("bulwarkShouldThrow: exactly at range counts as in range", () => {
  assert.strictEqual(Balance.bulwarkShouldThrow(0, 0, 80, 0, 80), true);
});

test("stalkerBlinkTarget: lands behind the player relative to their facing", () => {
  const bounds = { minX: 0, maxX: 1000, depthMin: 0, depthMax: 86 };
  const t = Balance.stalkerBlinkTarget(500, 40, 1, 60, bounds);     // facing right -> blink lands LEFT
  assert.strictEqual(t.x, 440);
  assert.strictEqual(t.y, 40);
  const t2 = Balance.stalkerBlinkTarget(500, 40, -1, 60, bounds);   // facing left -> blink lands RIGHT
  assert.strictEqual(t2.x, 560);
});

test("stalkerBlinkTarget: clamps to the arena/depth bounds", () => {
  const bounds = { minX: 0, maxX: 1000, depthMin: 0, depthMax: 86 };
  const t = Balance.stalkerBlinkTarget(20, 5, 1, 60, bounds);       // would land at x=-40
  assert.strictEqual(t.x, 0);
  const t2 = Balance.stalkerBlinkTarget(500, 90, 1, 60, bounds);    // y past depthMax
  assert.strictEqual(t2.y, 86);
});

test("furnaceShouldVent: true when spray threshold reached and not on cooldown", () => {
  assert.strictEqual(Balance.furnaceShouldVent(1.5, 1.5, 0), true);   // exactly at threshold
  assert.strictEqual(Balance.furnaceShouldVent(2.0, 1.5, 0), true);   // over threshold
});

test("furnaceShouldVent: false when still building up spray time", () => {
  assert.strictEqual(Balance.furnaceShouldVent(1.4, 1.5, 0), false);  // just under threshold
  assert.strictEqual(Balance.furnaceShouldVent(0, 1.5, 0), false);    // no spray yet
});

test("furnaceShouldVent: false when on cooldown even if threshold reached", () => {
  assert.strictEqual(Balance.furnaceShouldVent(2.0, 1.5, 0.1), false); // ventCdT > 0
});

test("actLevelForWave with expanded ACT_STARTS assigns new act tiers", () => {
  const AS = [0, 5, 10, 16, 23];
  assert.strictEqual(Balance.actLevelForWave(4, AS), -1);   // Act 1
  assert.strictEqual(Balance.actLevelForWave(5, AS), 0);    // Act 2 start
  assert.strictEqual(Balance.actLevelForWave(9, AS), 0);    // Act 2 (Switch)
  assert.strictEqual(Balance.actLevelForWave(10, AS), 1);   // Act 3 start
  assert.strictEqual(Balance.actLevelForWave(15, AS), 1);   // Act 3 (Quake)
  assert.strictEqual(Balance.actLevelForWave(16, AS), 2);   // Act 4 start
  assert.strictEqual(Balance.actLevelForWave(22, AS), 2);   // Act 4 (GK)
  assert.strictEqual(Balance.actLevelForWave(23, AS), 3);   // Fire start
  assert.strictEqual(Balance.actLevelForWave(28, AS), 3);   // Fire (Slayer)
});
