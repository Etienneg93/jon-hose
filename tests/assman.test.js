const { test } = require("node:test");
const assert = require("node:assert");
global.window = globalThis;
require("../js/config.js");
require("../js/balance.js");
window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/entities.js");
const JH = global.window.JH;

test("assman: def exists with phase gates and full move tables", () => {
  const D = JH.ASSMAN;
  assert.ok(D && D.hp > JH.SLAYER.hp, "hardest boss yet: hp above Slayer");
  assert.deepStrictEqual(D.gates, [0.66, 0.33]);
  for (const k of ["clap", "hip", "toss", "clapback", "slam", "storm", "exhaust"])
    assert.ok(D[k], "move table " + k);
});

test("assman: wave 36 exists, routes bossType assman, triggers stay in sync", () => {
  const waves = JH.LEVEL1.waves;
  const last = waves[waves.length - 1];
  assert.strictEqual(last.boss, true);
  assert.strictEqual(last.bossType, "assman");
});

test("assman: makeEnemy builds the boss with isBoss and def wiring", () => {
  const b = JH.makeEnemy("assman", 100, 40);
  assert.ok(b instanceof JH.AssManBoss);
  assert.strictEqual(b.isBoss, true);
  assert.strictEqual(b.maxHp, JH.ASSMAN.hp);
  assert.strictEqual(b.phase, 1);
});

test("assman helpers: phase gating from hp fraction", () => {
  const B = JH.Balance, G = JH.ASSMAN.gates;
  assert.strictEqual(B.assmanPhase(1.0, G), 1);
  assert.strictEqual(B.assmanPhase(G[0] + 0.001, G), 1);
  assert.strictEqual(B.assmanPhase(G[0], G), 2);
  assert.strictEqual(B.assmanPhase(G[1], G), 3);
  assert.strictEqual(B.assmanPhase(0, G), 3);
});

test("assman helpers: cone membership — rim is hitbox", () => {
  const B = JH.Balance, C = JH.ASSMAN.clap;
  // dead ahead inside range: hit
  assert.ok(B.coneHits(100 + C.range - 1, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // behind: miss
  assert.ok(!B.coneHits(60, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // beyond range: miss
  assert.ok(!B.coneHits(100 + C.range + 2, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // just inside the angular edge (depth axis divided by ry): hit; just outside: miss
  const rad = (C.halfAngleDeg - 1) * Math.PI / 180;
  const dx = Math.cos(rad) * C.range * 0.9, dy = Math.sin(rad) * C.range * 0.9 * JH.GROUND_RY;
  assert.ok(B.coneHits(100 + dx, 40 + dy, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  const rad2 = (C.halfAngleDeg + 2) * Math.PI / 180;
  const dx2 = Math.cos(rad2) * C.range * 0.9, dy2 = Math.sin(rad2) * C.range * 0.9 * JH.GROUND_RY;
  assert.ok(!B.coneHits(100 + dx2, 40 + dy2, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
});

test("assman helpers: ring rim hits except inside the rotating gap", () => {
  const B = JH.Balance, S = JH.ASSMAN.storm;
  const r = 80;
  // on the rim, opposite the gap: hit
  assert.ok(B.ringGapHits(200 + r, 40, 200, 40, r, S.rimW, 180, S.gapDeg, 0.34));
  // on the rim, at gap center (gap at 0°): safe
  assert.ok(!B.ringGapHits(200 + r, 40, 200, 40, r, S.rimW, 0, S.gapDeg, 0.34));
  // inside the ring, not on the rim: no hit
  assert.ok(!B.ringGapHits(200 + r * 0.5, 40, 200, 40, r, S.rimW, 180, S.gapDeg, 0.34));
  // angle wraparound: gap centered at 350°, point at +5° is inside the gap
  assert.ok(!B.ringGapHits(200 + r * Math.cos(5 * Math.PI / 180), 40 + r * Math.sin(5 * Math.PI / 180) * 0.34, 200, 40, r, S.rimW, 350, S.gapDeg, 0.34));
});

test("assman helpers: leaderboard comparator — version, waves, time", () => {
  const B = JH.Balance;
  const mk = (v, w, t) => ({ gameVersion: v, wavesCleared: w, timeSec: t });
  // newer version outranks regardless of waves/time
  assert.ok(B.lbCompare(mk("0.32.0", 10, 999), mk("0.31.9", 36, 100)) < 0);
  // same version: more waves outranks
  assert.ok(B.lbCompare(mk("0.32.0", 36, 999), mk("0.32.0", 29, 100)) < 0);
  // same version + waves: faster time outranks
  assert.ok(B.lbCompare(mk("0.32.0", 36, 100), mk("0.32.0", 36, 200)) < 0);
  // missing fields sort last, never throw
  assert.ok(B.lbCompare(mk("0.32.0", 36, 100), {}) < 0);
});
