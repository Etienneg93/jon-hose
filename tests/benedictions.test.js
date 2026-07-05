"use strict";
const test = require("node:test");
const assert = require("node:assert");
const B = require("../js/benedictions.js");

test("DEFS: 17 boons, 3 duos, 4 legendaries; ids unique", () => {
  const boons = B.DEFS.filter((d) => d.kind === "boon");
  assert.strictEqual(boons.length, 17);
  assert.strictEqual(B.DEFS.filter((d) => d.kind === "duo").length, 3);
  assert.strictEqual(B.DEFS.filter((d) => d.kind === "legendary").length, 4);
  assert.strictEqual(new Set(B.DEFS.map((d) => d.id)).size, B.DEFS.length);
});

test("pickOffers: 3 offers, distinct elements when possible, no rank-2 repeats", () => {
  const state = { active: {}, pillarRanks: {}, usedOnce: {}, censer: false };
  const offers = B.pickOffers(state, () => 0.9);   // high rolls: no duo/legendary
  assert.strictEqual(offers.length, 3);
  const els = offers.map((o) => B.byId(o.id).element);
  assert.strictEqual(new Set(els).size, 3);
});

test("pickOffers: owned rank-1 boons can return as deepen; rank-2 never return", () => {
  const state = { active: { baptize: 2, overflow: 1 }, pillarRanks: {}, usedOnce: {}, censer: false };
  for (let i = 0; i < 40; i++) {
    const offers = B.pickOffers(state, Math.random);
    assert.ok(!offers.some((o) => o.id === "baptize"));
    for (const o of offers) if (o.id === "overflow") assert.strictEqual(o.deepen, true);
  }
});

test("legendary appears only with >= 2 boons of its element and only once", () => {
  const state = { active: { baptize: 1, overflow: 1 }, pillarRanks: {}, usedOnce: {}, censer: false };
  let seen = false;
  for (let i = 0; i < 200 && !seen; i++)
    seen = B.pickOffers(state, Math.random).some((o) => B.byId(o.id).kind === "legendary" && B.byId(o.id).element === "water");
  assert.ok(seen, "water legendary eventually offered");
  state.usedOnce.pressure_sermon = true;
  for (let i = 0; i < 100; i++)
    assert.ok(!B.pickOffers(state, Math.random).some((o) => o.id === "pressure_sermon"));
});

test("applyStats folds stat boons only", () => {
  B.reset(); B.take("bedrock"); B.take("gale_stride");
  const s = { maxHp: 100, dashSpeed: 240 };
  B.applyStats(s);
  assert.strictEqual(s.maxHp, 140);
  assert.ok(Math.abs(s.dashSpeed - 336) < 1e-9);
  B.take("bedrock");                                  // deepen to rank 2
  const s2 = { maxHp: 100, dashSpeed: 240 };
  B.applyStats(s2);
  assert.strictEqual(s2.maxHp, 160);
  B.reset();
});
