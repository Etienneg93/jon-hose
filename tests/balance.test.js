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
