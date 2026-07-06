"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Pillars = require("../js/pillars.js");

const DEFS = [
  { element: "water", gateBoss: null, maxRank: 3,
    apply: (s, r) => { s.maxWater += 15 * r; s.waterRegen += 3 * r; if (r >= 3) s.pressureFloor = true; } },
  { element: "earth", gateBoss: "quake", maxRank: 3,
    apply: (s, r) => { s.maxHp += 12 * r; s.knockback += 15 * r; if (r >= 3) s.wallSlamStagger = true; } },
];

test("water is open from the start; earth gates on its boss", () => {
  const state = { essence: 5, elements: {}, pillars: {} };
  assert.strictEqual(Pillars.unlocked(state, DEFS[0]), true);
  assert.strictEqual(Pillars.unlocked(state, DEFS[1]), false);
  state.elements.earth = true;
  assert.strictEqual(Pillars.unlocked(state, DEFS[1]), true);
});

test("buy: costs 1/2/3, caps at maxRank, spends essence", () => {
  const state = { essence: 6, elements: {}, pillars: {} };
  assert.ok(Pillars.buy(state, DEFS[0]));   // -1
  assert.ok(Pillars.buy(state, DEFS[0]));   // -2
  assert.ok(Pillars.buy(state, DEFS[0]));   // -3
  assert.strictEqual(state.essence, 0);
  assert.strictEqual(Pillars.rank(state, "water"), 3);
  state.essence = 9;
  assert.strictEqual(Pillars.buy(state, DEFS[0]), false);  // capped
});

test("apply folds ranks + capstone; totalRanks sums", () => {
  const state = { essence: 0, elements: { earth: true }, pillars: { water: 3, earth: 1 } };
  const s = { maxWater: 100, waterRegen: 18, maxHp: 100, knockback: 115 };
  Pillars.apply(s, state, DEFS);
  assert.strictEqual(s.maxWater, 145);
  assert.strictEqual(s.pressureFloor, true);
  assert.strictEqual(s.maxHp, 112);
  assert.strictEqual(Pillars.totalRanks(state), 4);
});
