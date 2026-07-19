"use strict";
const test = require("node:test");
const assert = require("node:assert");
const B = require("../js/benedictions.js");
global.window = global.window || {};
require("../js/config.js");
const JH = global.window.JH;

test("DEFS: 17 boons, 3 duos, 4 legendaries; ids unique", () => {
  const boons = B.DEFS.filter((d) => d.kind === "boon");
  assert.strictEqual(boons.length, 17);
  assert.strictEqual(B.DEFS.filter((d) => d.kind === "duo").length, 3);
  assert.strictEqual(B.DEFS.filter((d) => d.kind === "legendary").length, 4);
  assert.strictEqual(new Set(B.DEFS.map((d) => d.id)).size, B.DEFS.length);
});

test("DEFS: every boon carries a verb from the allowed set; duos/legendaries none", () => {
  const VERBS = new Set(["stream", "dash", "body"]);
  for (const d of B.DEFS) {
    if (d.kind === "boon") assert.ok(VERBS.has(d.verb), d.id + " verb=" + d.verb);
    else assert.strictEqual(d.verb, undefined, d.id + " should carry no verb");
  }
});

test("effectText: rank 1 is base desc; rank 2 appends the II upgrade line", () => {
  const d = B.byId("split_stream");
  assert.strictEqual(B.effectText("split_stream", 1), d.desc);
  assert.strictEqual(B.effectText("split_stream", 0), d.desc);
  const two = B.effectText("split_stream", 2);
  assert.ok(two.startsWith(d.desc), "rank-2 text keeps the base effect");
  assert.ok(two.includes(d.descII), "rank-2 text includes the descII upgrade");
});

test("effectText: duos/legendaries (no descII) return their single desc at any rank", () => {
  const duo = B.byId("steam_sermon");
  assert.strictEqual(B.effectText("steam_sermon", 2), duo.desc);
  assert.strictEqual(B.effectText("bogus_id", 2), "");
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

test("legendary pick is uniform among eligible elements (no DEFS-order starvation)", () => {
  // water AND air both eligible (2 owned boons each); over many rolls both
  // legendaries must appear — the earlier element must not shadow the later.
  const state = {
    active: { baptize: 1, overflow: 1, gale_stride: 1, tailwind: 1 },
    pillarRanks: {}, usedOnce: {}, censer: false,
  };
  const seen = {};
  for (let i = 0; i < 600; i++)
    for (const o of B.pickOffers(state, Math.random))
      if (B.byId(o.id).kind === "legendary") seen[o.id] = true;
  assert.ok(seen.pressure_sermon, "water legendary offered");
  assert.ok(seen.whirlwind_walk, "air legendary offered");
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

test("wash moves active boons to the reliquary; second wash keeps the higher rank", () => {
  B.reset();
  B.take("bedrock"); B.take("bedrock");               // rank 2
  B.take("gale_stride");                              // rank 1
  B.wash();
  assert.deepStrictEqual(B.active, {}, "death clears live boons");
  assert.strictEqual(B.washedCount(), 2);
  assert.strictEqual(B.washed.bedrock, 2, "washed rank preserved");
  // Reclaim bedrock, take it back down to rank 1 via a fresh take elsewhere,
  // then die again: the reliquary keeps the max of old and new.
  B.active.bedrock = 1;
  B.wash();
  assert.strictEqual(B.washed.bedrock, 2, "re-wash keeps the higher rank");
  B.reset();
});

test("reliquary: redeemAll restores every washed boon at rank, cost escalates, reset clears", () => {
  B.reset();
  B.take("split_stream"); B.take("split_stream"); B.take("ash_walk");
  B.wash();
  assert.strictEqual(B.redeemAllCost(), 1);
  const n = B.redeemAll();
  assert.strictEqual(n, 2);
  assert.strictEqual(B.rank("split_stream"), 2);
  assert.strictEqual(B.rank("ash_walk"), 1);
  assert.strictEqual(B.washedCount(), 0);
  assert.strictEqual(B.redeemAllCost(), 2, "second redemption costs 2");
  B.wash();                      // death does NOT reset the counter
  assert.strictEqual(B.redeemAllCost(), 2);
  B.reset();
  assert.strictEqual(B.redeemAllCost(), 1, "new run resets the counter");
  assert.strictEqual(typeof B.reclaimNext, "undefined", "per-boon reclaim retired");
});

test("every benediction has a baked icon key", () => {
  for (const d of B.DEFS)
    assert.ok(JH.ICONS.keys.includes("bene_" + d.id), "missing icon key bene_" + d.id);
});

test("reset clears both active and washed (new run wipes the reliquary)", () => {
  B.reset();
  B.take("bedrock"); B.wash();
  B.take("tailwind");
  B.reset();
  assert.deepStrictEqual(B.active, {});
  assert.strictEqual(B.washedCount(), 0);
});

test("BENE_TUNE and BENE_AOE carry the rework constants", () => {
  const T = JH.BENE_TUNE, A = JH.BENE_AOE;
  // presence + sane ranges only — values are design-owned
  for (const k of ["splitArcFrac", "splitArcFracII", "wakePull", "wakePullII",
    "overflowHigh", "overflowHighII", "overflowLow", "overflowLowII",
    "overflowRegenMult", "overflowRegenMultII", "baptizeMax", "baptizeMaxII",
    "scaldDpsFrac", "scaldDpsFracII", "backdraftPopFrac",
    "hazardBootsCd", "hazardBootsCdII", "hazardPopFrac", "hazardPopFracII",
    "quakeChargeS", "quakeChargeSII", "quakeDmgFrac", "quakeDmgFracII",
    "gravelEveryS", "gravelEverySII", "gravelDmgFrac", "gravelKnock",
    "galeStride", "galeStrideII", "tailwindRange", "tailwindRangeII",
    "tailwindKnock", "tailwindKnockII",
    "eyeHpFrac", "eyeHpFracII", "eyeShieldS", "eyeShieldSII", "eyeCd",
    "steamVentDpsFrac", "mudSlowCap",
    "devilLife", "devilSpeed", "sermonWaveFrac",
    "boiloverScaldMult", "boiloverRecheckS",
    "whirlGustFrac", "dropletPopFrac", "bedrockHp", "bedrockHpII"])
    assert.ok(typeof T[k] === "number" && T[k] > 0, k + " present");
  for (const k of ["focusQuake", "steamVent", "dropletPop", "whirlwindSweep", "bushfireSpread"])
    assert.ok(A[k] > 0, "BENE_AOE." + k);
  assert.ok(A.whirlwindSweep === 20, "whirlwind sweep widened per spec");
});
