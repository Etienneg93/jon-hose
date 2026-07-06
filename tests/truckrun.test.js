"use strict";
const test = require("node:test");
const assert = require("node:assert");

// config.js hangs data off window.JH; stub window then load it, then the
// pure helper (dual-export like balance.js).
global.window = global.window || globalThis;
require("../js/config.js");
const CFG = global.window.JH.TRUCKRUN;
const TB = require("../js/truckrun.balance.js");

// Deterministic rng for the timeline (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("config: TRUCKRUN block is present and shaped", () => {
  assert.ok(CFG, "JH.TRUCKRUN exists");
  assert.strictEqual(CFG.lanes.length, 3);
  assert.strictEqual(CFG.cleanBonusTiers.length, 2);
});

test("truckPressure: full at/above floor, dry sputter below", () => {
  const full = TB.truckPressure(CFG, CFG.pressureFloor);
  assert.deepStrictEqual(full, { dmgScale: 1, rangeMult: 1 });
  assert.deepStrictEqual(TB.truckPressure(CFG, 1), { dmgScale: 1, rangeMult: 1 });
  const dry = TB.truckPressure(CFG, 0);
  assert.deepStrictEqual(dry, { dmgScale: CFG.dryDpsMult, rangeMult: CFG.dryRangeMult });
  // Just below the floor is already sputtering.
  assert.deepStrictEqual(
    TB.truckPressure(CFG, CFG.pressureFloor - 0.001),
    { dmgScale: CFG.dryDpsMult, rangeMult: CFG.dryRangeMult }
  );
});

test("douse: subtracts dps*dt and clamps at 0", () => {
  assert.strictEqual(TB.douse(850, 120, 1), 730);
  assert.strictEqual(TB.douse(50, 120, 1), 0);
  assert.strictEqual(TB.douse(0, 120, 1), 0);
});

test("cleanBonus: flawless > decent > none, wall touch caps the top tier", () => {
  const [low, high] = CFG.cleanBonusTiers;
  assert.strictEqual(TB.cleanBonus(CFG, 1, false), high, "full HP, no wall → top");
  assert.strictEqual(TB.cleanBonus(CFG, 1, true), low, "wall touch caps to decent");
  assert.strictEqual(TB.cleanBonus(CFG, 0.7, false), low, "mid HP → decent");
  assert.strictEqual(TB.cleanBonus(CFG, 0.3, false), 0, "low HP → none");
});

test("beamCovers: forward, in-range, within the depth swath", () => {
  const { hoseBand, hoseRange } = CFG;
  assert.ok(TB.beamCovers(43, hoseBand, 43, 50, hoseRange), "same lane, ahead");
  assert.ok(TB.beamCovers(43, hoseBand, 43 + hoseBand, 50, hoseRange), "swath edge in");
  assert.ok(!TB.beamCovers(43, hoseBand, 43 + hoseBand + 1, 50, hoseRange), "past swath out");
  assert.ok(!TB.beamCovers(43, hoseBand, 43, -5, hoseRange), "behind the nozzle out");
  assert.ok(!TB.beamCovers(43, hoseBand, 43, hoseRange + 1, hoseRange), "beyond range out");
});

test("buildTimeline: deterministic for a fixed seed", () => {
  const a = TB.buildTimeline(CFG, seeded(1234));
  const b = TB.buildTimeline(CFG, seeded(1234));
  assert.deepStrictEqual(a, b);
});

test("buildTimeline: sorted, within run, only known kinds/lanes", () => {
  const ev = TB.buildTimeline(CFG, seeded(7));
  const kinds = new Set(["wreck", "fuse", "smelt", "pyro", "hydrant", "cross"]);
  for (let i = 0; i < ev.length; i++) {
    assert.ok(ev[i].at >= 0 && ev[i].at <= CFG.runDuration, "within run");
    assert.ok(kinds.has(ev[i].kind), "known kind: " + ev[i].kind);
    assert.ok(CFG.lanes.includes(ev[i].depth), "on a lane");
    if (i) assert.ok(ev[i].at >= ev[i - 1].at, "sorted by at");
  }
});

test("buildTimeline: density builds then goes quiet at the arrival tail", () => {
  const ev = TB.buildTimeline(CFG, seeded(99));
  const inWin = (s, e) => ev.filter((x) => x.kind !== "hydrant" && x.kind !== "cross" && x.at >= s && x.at < e).length;
  const intro = inWin(0, 12), build = inWin(12, 35), dense = inWin(35, 52), tail = inWin(52, 60);
  assert.ok(build > intro, "build denser than intro");
  assert.ok(dense > build, "climax denser than build");
  assert.strictEqual(tail, 0, "no combat hazards in the arrival tail");
});

test("buildTimeline: crossCount crosses, all carrying value", () => {
  const ev = TB.buildTimeline(CFG, seeded(3));
  const crosses = ev.filter((x) => x.kind === "cross");
  assert.strictEqual(crosses.length, CFG.crossCount);
  crosses.forEach((c) => assert.strictEqual(c.value, CFG.crossVal));
});

test("buildTimeline: never blocks every lane at once (a gap always exists)", () => {
  for (const seed of [1, 2, 42, 777, 9001]) {
    const ev = TB.buildTimeline(CFG, seeded(seed));
    assert.ok(TB.gapExists(ev, CFG.lanes), "seed " + seed + " leaves a passable lane");
  }
});
