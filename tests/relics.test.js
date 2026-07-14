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
  assert.strictEqual(dash.tier, "rare");
  assert.strictEqual(marshal.tier, "rare");
  assert.strictEqual(lance.tier, "relic");
  assert.strictEqual(lance.minAct, 0, "lance is act-gated");
  for (const r of [dash, marshal, lance]) assert.strictEqual(typeof r.apply, "function");
});

test("RELICS: every relic has a tier and a price inside its band", () => {
  const bands = { common: [60, 100], rare: [250, 350], relic: [500, Infinity] };
  assert.strictEqual(JH.RELICS.length, 22);
  for (const r of JH.RELICS) {
    const b = bands[r.tier];
    assert.ok(b, r.id + " has a known tier");
    assert.ok(r.cost >= b[0] && r.cost <= b[1], r.id + " cost " + r.cost + " in " + r.tier + " band");
  }
  const count = (t) => JH.RELICS.filter((r) => r.tier === t).length;
  assert.strictEqual(count("common"), 8);
  assert.strictEqual(count("rare"), 10);
  assert.strictEqual(count("relic"), 4);
});

test("RELIC_TUNE: rarity-pass tunables exist", () => {
  const T = JH.RELIC_TUNE;
  assert.deepStrictEqual(T.lanceFalloff, [1, 0.7, 0.5, 0.35, 0.25]);
  for (const k of ["socksBurnDpsCut", "socksBurnDpsFloor", "socksGraceBonus", "leashLungeBonus",
                   "rosaryPerKill", "rosaryCap", "pulseRadius", "valveKnockback", "spigotDamage",
                   "sprinklerRange", "sprinklerDps", "boilerHeatTime", "boilerBonus",
                   "boilerSplash", "boilerSplashR", "boilerGap", "bootsHp"])
    assert.strictEqual(typeof T[k], "number", k);
});

test("SHOP.relicGradeOdds is act-indexed for all six acts (-1..4)", () => {
  assert.deepStrictEqual(JH.SHOP.relicGradeOdds, [0, 0.25, 0.5, 0.75, 0.75, 0.75]);
  assert.strictEqual(JH.SHOP.relicGradeOdds.length, JH.ACT_STARTS.length);
});

test("minAct gates: lance from act 2 (>=0), boiler one act later (>=1)", () => {
  const byId = (id) => JH.RELICS.find((r) => r.id === id);
  assert.strictEqual(byId("hydro_lance").minAct, 0);
  assert.strictEqual(byId("boiler_coil").minAct, 1);
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

test("kibble grant matches pickup semantics", () => {
  const pl = { kibbleTimer: 3, kibbleRegen: 0 };
  JH.Balance.kibbleGrant(pl, JH.KIBBLE_PACK);
  assert.strictEqual(pl.kibbleTimer, 3 + JH.KIBBLE_PACK.dur);
  assert.ok(Math.abs(pl.kibbleRegen - JH.KIBBLE_PACK.heal / JH.KIBBLE_PACK.dur) < 1e-9);
});

test("rubber boots: +bootsHp maxHp via computeStats", () => {
  JH.Game = { relics: { rubber_boots: true } };
  const s = JH.Upgrades.computeStats({});
  assert.strictEqual(s.maxHp, JH.PLAYER.maxHp + JH.RELIC_TUNE.bootsHp);
  JH.Game = null;
});

test("asbestos socks: per-stack burn dps cut with floor", () => {
  const F = JH.FIRE, T = JH.RELIC_TUNE;
  assert.strictEqual(JH.Balance.burnTickDps(3, false), 3 * F.burnDpsPerStack);
  assert.strictEqual(JH.Balance.burnTickDps(3, true),
    3 * Math.max(T.socksBurnDpsFloor, F.burnDpsPerStack - T.socksBurnDpsCut));
});

test("asbestos socks: the floor actually clamps when the cut would drive the rate below it", () => {
  const T = JH.RELIC_TUNE;
  const origCut = T.socksBurnDpsCut;
  T.socksBurnDpsCut = JH.FIRE.burnDpsPerStack + 5;   // cut exceeds the base rate entirely
  try {
    assert.strictEqual(JH.Balance.burnTickDps(4, true), 4 * T.socksBurnDpsFloor,
      "per-stack rate clamps at socksBurnDpsFloor, never goes to 0 or negative");
  } finally { T.socksBurnDpsCut = origCut; }
});

test("prayerBeadProc tops up pressureBuffT without shortening it", () => {
  const pl = { pressureBuffT: 2 };
  JH.Balance.prayerBeadProc(pl, JH.RELIC_TUNE);
  assert.strictEqual(pl.pressureBuffT, JH.RELIC_TUNE.prayerBeadDur);
  pl.pressureBuffT = 20;
  JH.Balance.prayerBeadProc(pl, JH.RELIC_TUNE);
  assert.strictEqual(pl.pressureBuffT, 20);
});

test("JH.KIBBLE_PACK is shaped as the shop expects", () => {
  // Pin the SHAPE the shop relies on, not config's current balance numbers —
  // a tuning pass shouldn't break this test for no functional reason.
  const K = JH.KIBBLE_PACK;
  assert.strictEqual(typeof K.name, "string");
  assert.strictEqual(typeof K.cost, "number");
  assert.strictEqual(typeof K.heal, "number");
  assert.strictEqual(typeof K.dur, "number");
  assert.ok(K.cost > 0, "cost is a positive price");
  assert.ok(K.heal > 0, "heal is a positive amount");
  assert.ok(K.dur > 0, "dur is a positive duration");
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

test("retuned relic descs match the flat-gear effects", () => {
  const d = (id) => JH.RELICS.find((r) => r.id === id).desc;
  assert.match(d("brass_nozzle"), /\+10 spray dmg .* first enemy/i);
  assert.match(d("spigot_key"), /hydrant .* (restores|heals)/i);
  assert.match(d("prayer_bead"), /8s|8 s/i);
  assert.match(d("loaded_sponge"), /doubled .* regen window/i);
});

test("wheel entries: three stock slots + fixed kibble slot", () => {
  const entries = JH.Balance.shopWheelEntries(["censer", "punch_card"], {});
  assert.deepStrictEqual(entries, [
    { kind: "wheel", slot: 0, id: "censer", sold: false },
    { kind: "wheel", slot: 1, id: "punch_card", sold: false },
    { kind: "wheel", slot: 2, id: null, sold: false },   // thin pool at spawn renders empty
    { kind: "wheel", slot: 3, id: "kibble", sold: false },
  ]);
});

test("wheel entries: buying marks sold in place, slots never shift", () => {
  const stock = ["censer", "punch_card", "dowsing_rod"];   // spawn-time snapshot
  const entries = JH.Balance.shopWheelEntries(stock, { punch_card: true });
  assert.deepStrictEqual(entries.map((e) => e.id), ["censer", "punch_card", "dowsing_rod", "kibble"],
    "ids stay put after a buy — sold marks in place, no left-shift");
  assert.deepStrictEqual(entries.map((e) => e.sold), [false, true, false, false]);
});

test("relicPoolIds: optional tier filter + minAct gating", () => {
  const ids = (act, tier) => JH.Balance.relicPoolIds(JH.RELICS, act, tier);
  assert.ok(ids(-1, "relic").length === 0, "no relic-grade before act 2");
  assert.ok(ids(0, "relic").includes("hydro_lance"));
  assert.ok(!ids(0, "relic").includes("boiler_coil"), "boiler gated one act later");
  assert.ok(ids(1, "relic").includes("boiler_coil"));
  assert.strictEqual(ids(3, "common").length, 8);
});

test("rollWheelStock: slot tiers, upgrade odds, no dupes", () => {
  const tierOf = (id) => id && JH.RELICS.find((r) => r.id === id).tier;
  // rng -> 0.99: slot-3 upgrade never procs => [common, rare, rare]
  let s = JH.Balance.rollWheelStock(JH.RELICS, {}, 3, () => 0.99);
  assert.strictEqual(tierOf(s[0]), "common");
  assert.strictEqual(tierOf(s[1]), "rare");
  assert.strictEqual(tierOf(s[2]), "rare");
  assert.strictEqual(new Set(s.filter(Boolean)).size, s.filter(Boolean).length);
  // rng -> 0: upgrade always procs at act 3 => slot 3 is relic-grade
  s = JH.Balance.rollWheelStock(JH.RELICS, {}, 3, () => 0);
  assert.strictEqual(tierOf(s[2]), "relic");
  // act -1 (below SHOP.wheelAllCommonsBelowAct): the whole wheel is commons —
  // nothing unbuyable on the first wallet's shelf.
  s = JH.Balance.rollWheelStock(JH.RELICS, {}, -1, () => 0);
  assert.deepStrictEqual(s.map(tierOf), ["common", "common", "common"]);
  assert.strictEqual(new Set(s).size, 3, "three distinct commons");
  // knob shape: the gate is config-driven
  assert.strictEqual(typeof JH.SHOP.wheelAllCommonsBelowAct, "number");
});

test("rollWheelStock: exhaustion falls back across tiers, then null", () => {
  const own = (tiers) => { const o = {}; JH.RELICS.forEach((r) => { if (tiers.includes(r.tier)) o[r.id] = true; }); return o; };
  // all commons owned -> slot 1 falls back to a rare
  let s = JH.Balance.rollWheelStock(JH.RELICS, own(["common"]), 3, () => 0.99);
  assert.strictEqual(JH.RELICS.find((r) => r.id === s[0]).tier, "rare");
  // everything owned -> all null
  s = JH.Balance.rollWheelStock(JH.RELICS, own(["common", "rare", "relic"]), 3, () => 0.5);
  assert.deepStrictEqual(s, [null, null, null]);
});
