"use strict";
const test = require("node:test");
const assert = require("node:assert");
global.window = global.window || {};
require("../js/config.js");
const JH = global.window.JH;
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

test("deepdiveRamp: reaches maxScale in ~rampUp s, returns in ~rampDown s, clamps, never overshoots", () => {
  const D = JH.DEEPDIVE;
  let s = 1, t = 0;
  while (s < D.maxScale && t < 5) { s = JH.Balance.deepdiveRamp(s, true, 1 / 60, D); t += 1 / 60; }
  assert.ok(Math.abs(t - D.rampUp) < 0.05, "ramp-up time ~" + D.rampUp + ", got " + t.toFixed(2));
  assert.strictEqual(s, D.maxScale, "clamps at maxScale exactly");
  s = JH.Balance.deepdiveRamp(s, true, 1, D);
  assert.strictEqual(s, D.maxScale, "no overshoot while held");
  t = 0;
  while (s > 1 && t < 5) { s = JH.Balance.deepdiveRamp(s, false, 1 / 60, D); t += 1 / 60; }
  assert.ok(Math.abs(t - D.rampDown) < 0.05, "ramp-down time ~" + D.rampDown);
  assert.strictEqual(s, 1, "clamps at 1 exactly");
});

test("DEEPDIVE config shape", () => {
  const D = JH.DEEPDIVE;
  for (const k of ["threshold", "maxScale", "rampUp", "rampDown", "titleSwap", "laneGap"])
    assert.strictEqual(typeof D[k], "number", k);
  assert.ok(Array.isArray(D.titles) && D.titles.length >= 5);
  assert.ok(Array.isArray(D.quips) && D.quips.length >= 3);
  assert.ok(D.laneGap > JH.SHOP.range + 22, "TV interact zone must clear the shop-open zone");
});

test("propPushout: inside pushed to rim, outside null, depth flattened 2.4x", () => {
  // Straight-left approach, well inside r=13: pushed to the rim along -x.
  let p = Balance.propPushout(95, 40, 100, 40, 13);
  assert.ok(p, "inside horizontally -> pushout");
  assert.ok(Math.abs(p.x - 87) < 1e-9, "rim at propX - r, got " + p.x);
  assert.ok(Math.abs(p.y - 40) < 1e-9, "no depth change on a pure-x approach");
  // Exactly on the rim or beyond: no pushout.
  assert.strictEqual(Balance.propPushout(87, 40, 100, 40, 13), null, "on-rim is outside");
  assert.strictEqual(Balance.propPushout(60, 40, 100, 40, 13), null, "far away is outside");
  // Depth flatten: 10px below at r=13 is OUTSIDE (10*2.4=24 > 13)...
  assert.strictEqual(Balance.propPushout(100, 50, 100, 40, 13), null, "flattened depth escapes the ellipse");
  // ...but 4px below is inside (4*2.4=9.6 < 13) and pushes to the depth rim r/2.4.
  p = Balance.propPushout(100, 44, 100, 40, 13);
  assert.ok(p, "4px below -> inside");
  assert.ok(Math.abs(p.x - 100) < 1e-9, "pure-depth approach keeps x");
  assert.ok(Math.abs(p.y - (40 + 13 / 2.4)) < 1e-9, "depth rim at propY + r/2.4, got " + p.y);
  // Dead-center degenerate: still returns a rim point, never NaN.
  p = Balance.propPushout(100, 40, 100, 40, 13);
  assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), "center pushout is finite");
});

test("prop collide radii present and smaller than their interact zones", () => {
  assert.strictEqual(typeof JH.SHOP.vendorCollideR, "number");
  assert.strictEqual(typeof JH.DEEPDIVE.tvCollideR, "number");
  assert.ok(JH.SHOP.vendorCollideR < JH.SHOP.range, "vendor rim inside shop-open range");
  assert.ok(JH.DEEPDIVE.tvCollideR < 22, "TV rim inside the sit near-zone (+/-22)");
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

test("eliteScale ramps with player power and caps at 24 owned", () => {
  const fresh = Balance.eliteScale(2, 0);
  const mid = Balance.eliteScale(2, 10);
  const capped = Balance.eliteScale(2, 24);
  const over = Balance.eliteScale(2, 99);
  assert.ok(mid.hp > fresh.hp);
  assert.strictEqual(capped.hp, over.hp);   // capped at 24
  assert.strictEqual(over.hp, 3.096);       // 1.8 * (1 + 0.03*24) = 1.8*1.72
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

test("repeatableCost: optional factor overrides the 1.5x default", () => {
  assert.strictEqual(Balance.repeatableCost(60, 0, 1.8), 60);
  assert.strictEqual(Balance.repeatableCost(60, 1, 1.8), Math.round(60 * 1.8));
  assert.strictEqual(Balance.repeatableCost(60, 2, 1.8), Math.round(60 * 1.8 * 1.8));
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

test("unlockedPool: types accumulate up to the wave index, deduped", () => {
  const waves = [
    { spawns: [{ type: "mook", count: 3 }] },
    { spawns: [{ type: "mook", count: 2 }, { type: "charger", count: 1 }] },
    { boss: true },
    { spawns: [{ type: "pyro", count: 2 }] },
  ];
  assert.deepStrictEqual(Balance.unlockedPool(waves, 0), ["mook"]);
  assert.deepStrictEqual(Balance.unlockedPool(waves, 1), ["mook", "charger"]);
  assert.deepStrictEqual(Balance.unlockedPool(waves, 2), ["mook", "charger"]); // boss wave adds nothing
  assert.deepStrictEqual(Balance.unlockedPool(waves, 3), ["mook", "charger", "pyro"]);
});

test("unlockedPool excludes dummy and neighbor", () => {
  const waves = [{ spawns: [{ type: "dummy", count: 1 }, { type: "neighbor", count: 1 }, { type: "fuse", count: 2 }] }];
  assert.deepStrictEqual(Balance.unlockedPool(waves, 0), ["fuse"]);
});

test("pickSprinkles: deterministic picks from the pool, honors count", () => {
  const picks = Balance.pickSprinkles(["mook", "pyro"], 3, { rng: () => 0 });
  assert.strictEqual(picks.length, 3);
  picks.forEach((p) => assert.ok(["mook", "pyro"].includes(p)));
});

test("pickSprinkles caps heavies at heavyCap total", () => {
  // rng()=0 walks the cumulative weights and lands on the first eligible type;
  // bulwark's huge weight would win every roll if it weren't heavy-capped.
  const picks = Balance.pickSprinkles(["bulwark", "mook"], 3, {
    weights: { bulwark: 100, mook: 1 }, heavies: ["bulwark"], heavyCap: 1, rng: () => 0,
  });
  assert.strictEqual(picks.filter((p) => p === "bulwark").length, 1);
  assert.strictEqual(picks.filter((p) => p === "mook").length, 2);
});

test("pickSprinkles honors per-type caps", () => {
  const picks = Balance.pickSprinkles(["charger", "mook"], 3, {
    typeCaps: { charger: 1 }, rng: () => 0,
  });
  assert.deepStrictEqual(picks, ["charger", "mook", "mook"]);
});

test("pickSprinkles returns fewer picks when nothing is eligible", () => {
  const picks = Balance.pickSprinkles(["bulwark"], 3, { heavies: ["bulwark"], heavyCap: 1, rng: () => 0 });
  assert.deepStrictEqual(picks, ["bulwark"]);
});

test("powerCount = nodes + repeatable buys + pillar ranks (mirror ignored)", () => {
  const owned = { pw1: true, tk1: true, vt1: true };                       // 3 nodes
  const reps = { ov_dmg: 4, ov_hp: 2 };                                    // 6 buys
  const church = { pillars: { water: 3, earth: 1 }, mirror: { water_vigor: { rank: 3 } } }; // 4 pillar ranks (mirror ignored)
  assert.strictEqual(Balance.powerCount(owned, reps, church, 0), 13);
  assert.strictEqual(Balance.powerCount({}, {}, null, 0), 0);
  assert.strictEqual(Balance.powerCount(null, null, undefined, 0), 0);
});

test("powerCount v2: nodes + reps + pillar ranks + levels (mirror term gone)", () => {
  const church = { pillars: { water: 3, earth: 1 }, mirror: { water_vigor: { rank: 3 } } };
  assert.strictEqual(Balance.powerCount({ a: 1 }, { ov: 2 }, church, 5), 1 + 2 + 4 + 5);
});

test("eliteScale power term now caps at 24, not 15", () => {
  const at15 = Balance.eliteScale(2, 15);
  const at24 = Balance.eliteScale(2, 24);
  assert.ok(at24.hp > at15.hp);                       // 15 is no longer the ceiling
  assert.deepStrictEqual(Balance.eliteScale(2, 24), Balance.eliteScale(2, 99)); // 24 is
});

test("bossHpScale: +2% base HP per owned power point", () => {
  assert.strictEqual(Balance.bossHpScale(1000, 0), 1000);
  assert.strictEqual(Balance.bossHpScale(1000, 10), 1200);
  assert.strictEqual(Balance.bossHpScale(620, 24), Math.round(620 * 1.48));
});

test("superEliteDef: 7x hp, 2x damage fields, 0.85x speed, 4x suds, 1.6x body — input untouched", () => {
  const base = { hp: 40, speed: 46, touchDmg: 8, meleeDmg: 10, suds: 5, bodyW: 16, bodyH: 28 };
  const d = Balance.superEliteDef(base);
  assert.strictEqual(d.hp, 280);
  assert.strictEqual(d.touchDmg, 16);
  assert.strictEqual(d.meleeDmg, 20);
  assert.strictEqual(d.speed, Math.round(46 * 0.85));
  assert.strictEqual(d.suds, 20);
  assert.strictEqual(d.bodyW, Math.round(16 * 1.6));
  assert.strictEqual(base.hp, 40);                     // clone, not mutation
});

test("ticketBudget indexes budgets by actLevel+1 and clamps", () => {
  const B = [4, 4, 5, 5, 6];
  assert.strictEqual(Balance.ticketBudget(-1, B), 4);  // Act 1
  assert.strictEqual(Balance.ticketBudget(1, B), 5);   // Act 3
  assert.strictEqual(Balance.ticketBudget(3, B), 6);   // Act 5 (fire)
  assert.strictEqual(Balance.ticketBudget(9, B), 6);   // clamped high
});

test("superEliteDef honors a per-type hp override; other multipliers unchanged", () => {
  const base = { hp: 300, speed: 26, touchDmg: 10, suds: 12, bodyW: 22, bodyH: 34 };
  const d = Balance.superEliteDef(base, { hp: 3 });
  assert.strictEqual(d.hp, 900);                       // 3x, not the default 7x
  assert.strictEqual(d.touchDmg, 20);                  // dmg still 2x
  assert.strictEqual(d.suds, 48);                      // suds still 4x
  assert.strictEqual(base.hp, 300);                    // clone, not mutation
  assert.strictEqual(Balance.superEliteDef(base).hp, 2100);  // no tune = 7x
});

test("xpForLevel: 20 + 12n curve", () => {
  assert.strictEqual(Balance.xpForLevel(1), 32);
  assert.strictEqual(Balance.xpForLevel(5), 80);
  assert.strictEqual(Balance.xpForLevel(13), 176);
});

test("levelGains sums the repeating cycle", () => {
  const cycle = [
    { sprayDamage: 3 }, { maxWater: 8 }, { maxHp: 8 },
    { sprayRange: 4 }, { sprayDamage: 3 }, { waterRegen: 2 },
  ];
  assert.deepStrictEqual(Balance.levelGains(0, cycle), {});
  assert.deepStrictEqual(Balance.levelGains(2, cycle), { sprayDamage: 3, maxWater: 8 });
  const g13 = Balance.levelGains(13, cycle);          // two full cycles + 1
  assert.strictEqual(g13.sprayDamage, 3 * 2 * 2 + 3); // 4 dmg steps + the 13th (dmg)
  assert.strictEqual(g13.maxWater, 16);
  assert.strictEqual(g13.waterRegen, 4);
});

test("rollDrop: pity guarantees an item at streak >= 6; need-weighting biases the split", () => {
  assert.notStrictEqual(Balance.rollDrop(1, 6, 1, 1, () => 0.99), null);   // pity fires
  assert.strictEqual(Balance.rollDrop(1, 0, 1, 1, () => 0.99), null);      // no pity, high roll
  // low hp doubles health weight: with rng 0.5 the pick tips to health
  assert.strictEqual(Balance.rollDrop(1, 6, 0.3, 1, () => 0.5), "health");
  assert.strictEqual(Balance.rollDrop(1, 6, 1, 0.1, () => 0.5), "water");
});

test("beneDmgMult: each boon gates on its own threshold, bigger + looser at rank II", () => {
  assert.strictEqual(Balance.beneDmgMult({}, { waterFrac: 1, wet: 1, burning: true }), 1, "no owned ranks is a no-op");
  assert.strictEqual(Balance.beneDmgMult({ overflow: 1 }, { waterFrac: 0.79, wet: 0, burning: false }), 1, "below rank-I tank threshold");
  assert.strictEqual(Balance.beneDmgMult({ overflow: 1 }, { waterFrac: 0.8, wet: 0, burning: false }), 1.2);
  assert.strictEqual(Balance.beneDmgMult({ overflow: 2 }, { waterFrac: 0.7, wet: 0, burning: false }), 1.3, "rank II lowers threshold to 0.7");
  assert.strictEqual(Balance.beneDmgMult({ baptize: 1 }, { waterFrac: 0, wet: 0.3, burning: false }), 1, "wetness exactly 0.3 doesn't qualify");
  assert.strictEqual(Balance.beneDmgMult({ baptize: 2 }, { waterFrac: 0, wet: 0.5, burning: false }), 1.25);
  assert.strictEqual(Balance.beneDmgMult({ trial: 1 }, { waterFrac: 0, wet: 0, burning: false }), 1, "not burning doesn't qualify");
  assert.strictEqual(Balance.beneDmgMult({ trial: 2 }, { waterFrac: 0, wet: 0, burning: true }), 1.3);
});

test("beneDmgMult: qualifying boons stack multiplicatively", () => {
  const m = Balance.beneDmgMult({ overflow: 1, baptize: 1, trial: 1 }, { waterFrac: 0.9, wet: 0.5, burning: true });
  assert.ok(Math.abs(m - 1.2 * 1.15 * 1.2) < 1e-9);
});

test("pickRelics: never returns an owned id, returns at most n", () => {
  const pool = ["a", "b", "c", "d", "e"];
  const owned = { a: true, c: true };
  const picks = Balance.pickRelics(pool, owned, 3, Math.random);
  assert.ok(picks.length <= 3);
  assert.ok(picks.every((id) => id === "b" || id === "d" || id === "e"), "never picks an owned id");
  assert.strictEqual(new Set(picks).size, picks.length, "no duplicates");
});

test("pickRelics: returns fewer than n when the unowned pool is thin", () => {
  const pool = ["a", "b", "c"];
  const owned = { a: true, b: true };
  const picks = Balance.pickRelics(pool, owned, 3, Math.random);
  assert.deepStrictEqual(picks, ["c"]);
});

test("pickRelics: deterministic under a seeded rng, never mutates the input pool", () => {
  const pool = ["a", "b", "c", "d"];
  const seq1 = [0.1, 0.9, 0.5];
  let i1 = 0;
  const rng1 = () => seq1[i1++];
  const picks1 = Balance.pickRelics(pool, {}, 2, rng1);

  let i2 = 0;
  const rng2 = () => seq1[i2++];
  const picks2 = Balance.pickRelics(pool, {}, 2, rng2);

  assert.deepStrictEqual(picks1, picks2, "same rng sequence -> same picks");
  assert.deepStrictEqual(pool, ["a", "b", "c", "d"], "input pool array untouched");
});

test("pickRelics: no owned map treats every id as available", () => {
  const pool = ["a", "b"];
  const picks = Balance.pickRelics(pool, null, 5, Math.random);
  assert.strictEqual(picks.length, 2);
});

test("relicPoolIds: excludes minAct-gated defs before their act, includes them from that act on", () => {
  const defs = [{ id: "a" }, { id: "b", minAct: 0 }];
  assert.deepStrictEqual(Balance.relicPoolIds(defs, -1), ["a"]);
  assert.deepStrictEqual(Balance.relicPoolIds(defs, 0), ["a", "b"]);
  assert.deepStrictEqual(Balance.relicPoolIds(defs, 2), ["a", "b"]);
});
