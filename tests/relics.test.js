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

test("relicPoolIds: hydro_lance absent pre-Act-2, present from Act 2 on", () => {
  const idsAt = (actLevel) => JH.Balance.relicPoolIds(JH.RELICS, actLevel);
  assert.ok(!idsAt(-1).includes("hydro_lance"), "act 1: lance not in the vendor pool");
  assert.ok(idsAt(0).includes("hydro_lance"), "act 2+: lance is in the vendor pool");
  assert.ok(idsAt(-1).includes("hydro_dash"), "non-gated relics unaffected");
});

test("powerCount counts stat relics via 5th arg", () => {
  const base = JH.Balance.powerCount({}, {}, null, 0);
  assert.strictEqual(JH.Balance.powerCount({}, {}, null, 0, 3), base + 3);
});

test("overcharge unlocks by act, not node ownership", () => {
  JH.Upgrades.currentActLevel = -1;
  assert.strictEqual(JH.Upgrades.overchargeUnlocked(), false);
  JH.Upgrades.currentActLevel = 0;
  assert.strictEqual(JH.Upgrades.overchargeUnlocked(), true);
  JH.Upgrades.currentActLevel = -1;
});
