"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Balance = require("../js/balance.js");

const ACT_STARTS = [0, 5, 8, 10];

test("actStartForWave returns the start of the act containing the wave", () => {
  assert.strictEqual(Balance.actStartForWave(0, ACT_STARTS), 0);   // Act 1
  assert.strictEqual(Balance.actStartForWave(4, ACT_STARTS), 0);   // still Act 1 (mid-boss)
  assert.strictEqual(Balance.actStartForWave(5, ACT_STARTS), 5);   // Act 2 start
  assert.strictEqual(Balance.actStartForWave(7, ACT_STARTS), 5);   // Act 2
  assert.strictEqual(Balance.actStartForWave(8, ACT_STARTS), 8);   // Act 3
  assert.strictEqual(Balance.actStartForWave(9, ACT_STARTS), 8);   // Act 3
  assert.strictEqual(Balance.actStartForWave(10, ACT_STARTS), 10); // Act 4
  assert.strictEqual(Balance.actStartForWave(13, ACT_STARTS), 10); // Act 4 finale
});

test("actStartForWave clamps a negative/pre-start index to the first act", () => {
  assert.strictEqual(Balance.actStartForWave(-1, ACT_STARTS), 0);
});

test("blessingCost rises by 1 per purchase: 1, 2, 3, ...", () => {
  assert.strictEqual(Balance.blessingCost(0), 1);
  assert.strictEqual(Balance.blessingCost(1), 2);
  assert.strictEqual(Balance.blessingCost(2), 3);
  assert.strictEqual(Balance.blessingCost(9), 10);
});

const Church = require("../js/church.js");

test("defaults() is a fresh meta-state (water unlocked, all pillars rank 0)", () => {
  const d = Church.defaults();
  assert.strictEqual(d.essence, 0);
  assert.deepStrictEqual(d.blessings, {});
  assert.deepStrictEqual(d.pillars, { water: 0, earth: 0, fire: 0, air: 0 });
  assert.strictEqual(d.churchVisited, false);
  assert.deepStrictEqual(d.elements, { earth: false, fire: false, air: false, water: true });
});

test("sanitize clamps pillar ranks to ints 0..3", () => {
  const s = Church.sanitize({ pillars: { water: 2.9, earth: -4, fire: 99, air: "x" } });
  assert.deepStrictEqual(s.pillars, { water: 2, earth: 0, fire: 3, air: 0 });
});

test("sanitize restores a missing/garbage pillars object to defaults", () => {
  assert.deepStrictEqual(Church.sanitize({ essence: 1 }).pillars, { water: 0, earth: 0, fire: 0, air: 0 });
  assert.deepStrictEqual(Church.sanitize({ pillars: 7 }).pillars, { water: 0, earth: 0, fire: 0, air: 0 });
});

test("sanitize() merges partial/corrupt data over defaults", () => {
  assert.strictEqual(Church.sanitize(null).essence, 0);
  assert.strictEqual(Church.sanitize({ essence: 3 }).essence, 3);
  // unknown/garbage fields ignored; missing nested objects restored
  const s = Church.sanitize({ essence: "x", blessings: { bless_dps: 2 } });
  assert.strictEqual(s.essence, 0);                 // non-number -> 0
  assert.strictEqual(s.blessings.bless_dps, 2);
  assert.strictEqual(s.elements.earth, false);
});

test("serialize() round-trips through sanitize()", () => {
  Church.state = Church.sanitize({ essence: 4, blessings: { bless_hp: 1 } });
  const round = Church.sanitize(JSON.parse(Church.serialize()));
  assert.strictEqual(round.essence, 4);
  assert.strictEqual(round.blessings.bless_hp, 1);
});

test("save() writes to localStorage, but load() always resets to defaults (no save system yet)", () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  Church.state = Church.sanitize({ essence: 7, blessings: { bless_dps: 3 }, elements: { earth: true } });
  Church.save();
  assert.ok(store[Church.KEY]);                // save() did write something
  Church.load();                                // but load() ignores it
  assert.deepStrictEqual(Church.state, Church.defaults());
  delete globalThis.localStorage;
});

const DS = {
  fallEnd: 0.6, lingerDur: 0.4, riseDur: 0.35, materializeDur: 0.15,
  standDur: 0.45, driftDur: 0.3, beamFadeDur: 0.4, screenFadeDelay: 0.3,
  screenFadeDur: 0.7, riseHeight: 16, ghostAlphaMax: 0.82, total: 3.2,
};
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test("deathCorpseFrame plays 0->7 over fallEnd, then holds on 7 for the rest of the sequence", () => {
  assert.strictEqual(Church.deathCorpseFrame(0, DS), 0);
  assert.strictEqual(Church.deathCorpseFrame(0.3, DS), 4);     // 0.3/0.6*8 = 4
  assert.strictEqual(Church.deathCorpseFrame(0.6, DS), 7);     // settled
  assert.strictEqual(Church.deathCorpseFrame(1.0, DS), 7);     // linger
  assert.strictEqual(Church.deathCorpseFrame(3.0, DS), 7);     // corpse stays put till the end
});

test("deathGhostState is null until the corpse has settled and lingered", () => {
  assert.strictEqual(Church.deathGhostState(0.5, DS), null);   // mid-collapse
  assert.strictEqual(Church.deathGhostState(1.0, DS), null);   // exactly ghostStart (0.6+0.4)
});

test("deathGhostState rise-out phase: still frame 7, rises out of the corpse, fades in", () => {
  const s = Church.deathGhostState(1.05, DS);                  // 0.05s into riseDur (0.35)
  assert.strictEqual(s.frame, 7);
  approx(s.riseY, (0.05 / 0.35) * 16);
  approx(s.alpha, Math.min(1, 0.05 / 0.15) * 0.82);
});

test("deathGhostState rise-out -> stand-up boundary is continuous (no visual pop)", () => {
  const end = Church.deathGhostState(1.35, DS);                // riseEnd = 1.0+0.35
  assert.strictEqual(end.frame, 7);
  approx(end.riseY, 16);
  approx(end.alpha, 0.82);
});

test("deathGhostState stand-up phase: frame counts 7->0, holds at riseHeight", () => {
  const mid = Church.deathGhostState(1.5975, DS);              // 55% through standDur (0.45)
  assert.strictEqual(mid.frame, 3);                            // step = floor(0.55*8) = 4 -> 7-4=3
  approx(mid.riseY, 16);
  approx(mid.alpha, 0.82);
});

test("deathGhostState stand-up -> ascend boundary is continuous", () => {
  const end = Church.deathGhostState(1.8, DS);                 // standEnd = 1.35+0.45
  assert.strictEqual(end.frame, 0);
  approx(end.riseY, 16);
  approx(end.alpha, 0.82);
});

test("deathGhostState ascend phase: slow drift then accelerating beam, fading out", () => {
  const slow = Church.deathGhostState(2.1, DS);                // beamStart, at=driftDur=0.3
  assert.strictEqual(slow.frame, 0);
  approx(slow.riseY, 16 + 0.3 * 28);
  approx(slow.alpha, 0.82);

  const mid = Church.deathGhostState(2.4, DS);                 // at=0.6
  approx(mid.riseY, 16 + 0.3 * 28 + Math.pow(0.3, 2) * 480);
  approx(mid.alpha, Math.max(0, 1 - 0.3 / 0.4) * 0.82);

  const gone = Church.deathGhostState(2.7, DS);                // at=0.9, fully faded
  approx(gone.alpha, 0);
});

test("deathScreenFadeAlpha stays 0 until fadeStart, then ramps to 1 over screenFadeDur", () => {
  assert.strictEqual(Church.deathScreenFadeAlpha(2.0, DS), 0);
  assert.strictEqual(Church.deathScreenFadeAlpha(2.4, DS), 0);  // fadeStart = 2.1+0.3
  approx(Church.deathScreenFadeAlpha(2.75, DS), 0.5);
  assert.strictEqual(Church.deathScreenFadeAlpha(3.5, DS), 1);  // clamped
});
