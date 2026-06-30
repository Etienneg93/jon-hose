"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Mirror = require("../js/mirror.js");

// Self-contained node defs (don't depend on config) — two-sided, leveled.
const NODES = [
  { id: "w1", element: "water",
    a: { apply: (s, r) => { s.dmg += 3 * r; } },
    b: { apply: (s, r) => { s.range += 6 * r; } } },
  { id: "e1", element: "earth",
    a: { apply: (s, r) => { s.knock += 30 * r; } },
    b: { apply: (s, r) => { s.band += 3 * r; } } },
];
const byId = (id) => NODES.find((n) => n.id === id);

function freshState(over) {
  return Object.assign({
    essence: 0,
    elements: { water: true, earth: false, fire: false, air: false },
    mirror: {},
  }, over || {});
}

test("cost rises 1,2,3 per rank and is monotonic", () => {
  assert.strictEqual(Mirror.cost(0), 1);
  assert.strictEqual(Mirror.cost(1), 2);
  assert.strictEqual(Mirror.cost(2), 3);
  assert.ok(Mirror.cost(5) > Mirror.cost(4));
});

test("branchUnlocked: water always open; earth gated on elements.earth", () => {
  const s = freshState();
  assert.strictEqual(Mirror.branchUnlocked(s, "water"), true);
  assert.strictEqual(Mirror.branchUnlocked(s, "earth"), false);
  s.elements.earth = true;
  assert.strictEqual(Mirror.branchUnlocked(s, "earth"), true);
});

test("nodeState defaults to side a, rank 0", () => {
  assert.deepStrictEqual(Mirror.nodeState(freshState(), "w1"), { side: "a", rank: 0 });
});

test("canBuy respects unlock, essence, and maxRank", () => {
  const s = freshState({ essence: 0 });
  assert.strictEqual(Mirror.canBuy(s, byId("w1"), 3), false, "no essence");
  s.essence = 1;
  assert.strictEqual(Mirror.canBuy(s, byId("w1"), 3), true, "can afford rank 1");
  assert.strictEqual(Mirror.canBuy(s, byId("e1"), 3), false, "earth locked");
});

test("buy spends escalating essence and increments rank", () => {
  const s = freshState({ essence: 6 });
  assert.strictEqual(Mirror.buy(s, byId("w1"), 3), true); // cost 1 -> rank 1, essence 5
  assert.strictEqual(s.essence, 5);
  assert.strictEqual(Mirror.nodeState(s, "w1").rank, 1);
  assert.strictEqual(Mirror.buy(s, byId("w1"), 3), true); // cost 2 -> rank 2, essence 3
  assert.strictEqual(s.essence, 3);
  assert.strictEqual(Mirror.buy(s, byId("w1"), 3), true); // cost 3 -> rank 3, essence 0
  assert.strictEqual(s.essence, 0);
  assert.strictEqual(Mirror.nodeState(s, "w1").rank, 3);
  assert.strictEqual(Mirror.buy(s, byId("w1"), 3), false, "at maxRank");
});

test("toggleSide flips side and preserves rank", () => {
  const s = freshState({ essence: 3 });
  Mirror.buy(s, byId("w1"), 3);  // rank 1, side a
  assert.strictEqual(Mirror.toggleSide(s, byId("w1")), "b");
  assert.strictEqual(Mirror.nodeState(s, "w1").rank, 1);
  assert.strictEqual(Mirror.toggleSide(s, byId("w1")), "a");
});

test("apply folds active sides, sums by rank, and respects locks", () => {
  const s = freshState({ essence: 99, elements: { water: true, earth: true } });
  Mirror.buy(s, byId("w1"), 3); Mirror.buy(s, byId("w1"), 3); // w1 rank 2, side a
  Mirror.buy(s, byId("e1"), 3);                               // e1 rank 1, side a
  let stats = { dmg: 0, range: 0, knock: 0, band: 0 };
  Mirror.apply(stats, s, NODES);
  assert.strictEqual(stats.dmg, 6, "w1 side a: 3*2");
  assert.strictEqual(stats.knock, 30, "e1 side a: 30*1");
  assert.strictEqual(stats.range, 0);

  // Toggle w1 to side b -> effect moves to range, dmg stops.
  Mirror.toggleSide(s, byId("w1"));
  stats = { dmg: 0, range: 0, knock: 0, band: 0 };
  Mirror.apply(stats, s, NODES);
  assert.strictEqual(stats.dmg, 0);
  assert.strictEqual(stats.range, 12, "w1 side b: 6*2");
});

test("apply skips a locked branch even if it somehow has rank", () => {
  const s = freshState({ elements: { water: true, earth: false }, mirror: { e1: { side: "a", rank: 3 } } });
  const stats = { dmg: 0, range: 0, knock: 0, band: 0 };
  Mirror.apply(stats, s, NODES);
  assert.strictEqual(stats.knock, 0, "earth locked -> no effect");
});
