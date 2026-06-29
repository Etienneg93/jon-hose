"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Balance = require("../js/balance.js");

const ACT_STARTS = [0, 5, 8, 10];

test("actStartForWave returns the start of the act containing the wave", () => {
  assert.strictEqual(Balance.actStartForWave(0, ACT_STARTS), 0);   // Act 1
  assert.strictEqual(Balance.actStartForWave(4, ACT_STARTS), 0);   // still Act 1 (mid-boss)
  assert.strictEqual(Balance.actStartForWave(5, ACT_STARTS), 5);   // Act 2 start
  assert.strictEqual(Balance.actStartForWave(7, ACT_STARTS), 5);   // Act 2
  assert.strictEqual(Balance.actStartForWave(8, ACT_STARTS), 8);   // Act 3
  assert.strictEqual(Balance.actStartForWave(9, ACT_STARTS), 8);   // Act 3
  assert.strictEqual(Balance.actStartForWave(10, ACT_STARTS), 10); // Act 4
  assert.strictEqual(Balance.actStartForWave(13, ACT_STARTS), 10); // Act 4 finale
});

test("actStartForWave clamps a negative/pre-start index to the first act", () => {
  assert.strictEqual(Balance.actStartForWave(-1, ACT_STARTS), 0);
});

test("blessingCost rises by 1 per purchase: 1, 2, 3, ...", () => {
  assert.strictEqual(Balance.blessingCost(0), 1);
  assert.strictEqual(Balance.blessingCost(1), 2);
  assert.strictEqual(Balance.blessingCost(2), 3);
  assert.strictEqual(Balance.blessingCost(9), 10);
});

const Church = require("../js/church.js");

test("defaults() is a fresh zeroed meta-state", () => {
  const d = Church.defaults();
  assert.strictEqual(d.essence, 0);
  assert.deepStrictEqual(d.blessings, {});
  assert.strictEqual(d.churchVisited, false);
  assert.deepStrictEqual(d.elements, { earth: false, fire: false, air: false, water: false });
});

test("sanitize() merges partial/corrupt data over defaults", () => {
  assert.strictEqual(Church.sanitize(null).essence, 0);
  assert.strictEqual(Church.sanitize({ essence: 3 }).essence, 3);
  // unknown/garbage fields ignored; missing nested objects restored
  const s = Church.sanitize({ essence: "x", blessings: { bless_dps: 2 } });
  assert.strictEqual(s.essence, 0);                 // non-number -> 0
  assert.strictEqual(s.blessings.bless_dps, 2);
  assert.strictEqual(s.elements.earth, false);
});

test("serialize() round-trips through sanitize()", () => {
  Church.state = Church.sanitize({ essence: 4, blessings: { bless_hp: 1 } });
  const round = Church.sanitize(JSON.parse(Church.serialize()));
  assert.strictEqual(round.essence, 4);
  assert.strictEqual(round.blessings.bless_hp, 1);
});
