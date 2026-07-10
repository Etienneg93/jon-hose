"use strict";
const test = require("node:test");
const assert = require("node:assert");
global.window = globalThis;
require("../js/config.js");
require("../js/balance.js");
require("../js/upgrades.js");
const JH = globalThis.JH;

test("RELICS: ex-signatures exist with apply hooks and relic costs", () => {
  const byId = (id) => JH.RELICS.find((r) => r.id === id);
  const dash = byId("hydro_dash"), marshal = byId("fire_marshal"), lance = byId("hydro_lance");
  assert.ok(dash && marshal && lance, "all three ex-signatures are relics");
  assert.strictEqual(dash.cost, 200);
  assert.strictEqual(marshal.cost, 220);
  assert.strictEqual(lance.cost, 300);
  assert.ok(lance.actGate, "lance is act-gated");
  for (const r of [dash, marshal, lance]) assert.strictEqual(typeof r.apply, "function");
});

test("computeStats folds owned relic applies (lance +18 dmg, dash cd, no puddle)", () => {
  JH.Game = { relics: { hydro_lance: true, hydro_dash: true } };
  const s = JH.Upgrades.computeStats({});
  assert.strictEqual(s.sprayDamage, JH.PLAYER.sprayDamage + 18);
  assert.strictEqual(s.beam, 3);
  assert.ok(Math.abs(s.dashCd - Math.max(0.2, JH.PLAYER.dashCd - 0.2)) < 1e-9);
  assert.strictEqual(!!s.dashPuddle, false, "Hydro-Dash relic must NOT set dashPuddle");
  JH.Game = null;
});

test("upgrades NODES no longer contain signatures", () => {
  assert.strictEqual(JH.Upgrades.nodes.length, 0);
});
