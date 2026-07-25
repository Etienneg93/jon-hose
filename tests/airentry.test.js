"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
require("../js/airentry.js");
const JH = global.window.JH;
const AirEntry = JH.AirEntry;
const C = JH.AIRENTRY;

test("phase order ends in release", () => {
  assert.strictEqual(AirEntry.ORDER[AirEntry.ORDER.length - 1], "release");
  assert.deepStrictEqual(AirEntry.ORDER,
    ["notice", "desecrate", "rage", "reveal", "feud", "depart", "release"]);
});

test("totalDur is the sum of every scripted phase, derived from config", () => {
  const expected = AirEntry.ORDER.slice(0, -1)
    .reduce((sum, k) => sum + C.phases[k], 0);
  assert.strictEqual(AirEntry.totalDur(C), expected);
});

test("phaseAt walks the phases in order and lands on release", () => {
  assert.strictEqual(AirEntry.phaseAt(C, 0), "notice");
  let acc = 0;
  for (const k of AirEntry.ORDER.slice(0, -1)) {
    // Sample the middle of each phase so the assertion never sits on a boundary.
    assert.strictEqual(AirEntry.phaseAt(C, acc + C.phases[k] / 2), k);
    acc += C.phases[k];
  }
  assert.strictEqual(AirEntry.phaseAt(C, AirEntry.totalDur(C)), "release");
  assert.strictEqual(AirEntry.phaseAt(C, AirEntry.totalDur(C) + 99), "release");
});

test("every phase duration is positive", () => {
  for (const k of AirEntry.ORDER.slice(0, -1))
    assert.ok(C.phases[k] > 0, k + " must have a positive duration");
});

// Records paint calls so the test can prove a painter actually ran.
// Assets.draw's p() helper sinks to ctx.fillRect (js/assets.js:344-350).
function mkCtx() {
  const noop = () => {};
  const c = {
    calls: 0, fillStyle: "", globalAlpha: 1, globalCompositeOperation: "",
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    drawImage: noop, clearRect: noop, setTransform: noop, beginPath: noop,
    arc: noop, ellipse: noop, fill: noop, stroke: noop, closePath: noop,
    fillText: noop, measureText: () => ({ width: 0 }), putImageData: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    fillRect() { c.calls++; },
  };
  return c;
}

test("assmanPlain and collie painters are registered and paint", () => {
  // assets.js builds an offscreen canvas at eval time — same document stub
  // pattern as tests/air.test.js and tests/juice.test.js.
  global.window.JH.Loader = { img: () => ({}) };
  global.document = global.document || {
    createElement: () => ({ width: 0, height: 0, getContext: mkCtx }),
    getElementById: () => ({ style: {} }),
  };
  require("../js/assets.js");
  const Assets = global.window.JH.Assets;
  assert.strictEqual(typeof Assets.airEntryReady, "function");

  // The stub Loader returns bare {} handles, so neither painter has usable
  // art and both must take their procedural fallback — which paints.
  for (const key of ["assmanPlain", "collie"]) {
    const ctx = mkCtx();
    Assets.draw(ctx, key, 100, 100, 1, { state: "idle" });
    assert.ok(ctx.calls > 0, key + " must be registered and paint a fallback");
  }
  // Control: Assets.draw returns early on an unregistered key. Without this,
  // the assertions above would pass even if draw() were a no-op.
  const ctl = mkCtx();
  Assets.draw(ctl, "notAPainter", 100, 100, 1, {});
  assert.strictEqual(ctl.calls, 0, "unregistered key must paint nothing");
});

// Minimal game stub: the module only touches these fields.
function makeGame() {
  return {
    airEntry: null, airEntryArmed: true,
    waveIndex: 28, checkpointWave: 29, waveActive: false, sigils: [],
    player: { x: C.triggerX, y: 51, z: 0, facing: 1 },
    input: { _buf: {}, buffered(a) { return !!this._buf[a]; }, consume(a) { this._buf[a] = false; } },
  };
}

test("enter() stages both actors and starts the scene", () => {
  const g = makeGame();
  AirEntry.enter(g);
  assert.ok(g.airEntry, "scene state exists");
  assert.strictEqual(g.airEntry.phase, "notice");
  assert.strictEqual(AirEntry.actors(g).length, 2);
});

test("enter() is a no-op unless explicitly armed", () => {
  // Regression: devGotoWave and the Church return both set Background.airOn
  // without going through enterAirAct, so an unset flag must NOT arm.
  for (const armed of [false, undefined]) {
    const g = makeGame();
    g.airEntryArmed = armed;
    AirEntry.enter(g);
    assert.strictEqual(g.airEntry, null, "must not arm when airEntryArmed is " + armed);
  }
});

test("running to the end releases control and disarms", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const steps = Math.ceil(AirEntry.totalDur(C) / (1 / 60)) + 2;
  for (let i = 0; i < steps; i++) AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry, null, "scene cleared");
  assert.strictEqual(g.airEntryArmed, false);
  assert.strictEqual(AirEntry.actors(g).length, 0);
});

test("skip() from any phase lands in the same end state", () => {
  for (const phase of AirEntry.ORDER.slice(0, -1)) {
    const g = makeGame();
    AirEntry.enter(g);
    // Advance to the middle of `phase`, then skip.
    let acc = 0;
    for (const k of AirEntry.ORDER.slice(0, -1)) {
      if (k === phase) break;
      acc += C.phases[k];
    }
    g.airEntry.t = acc + C.phases[phase] / 2;
    AirEntry.skip(g);
    assert.strictEqual(g.airEntry, null, "skipped from " + phase);
    assert.strictEqual(g.airEntryArmed, false);
  }
});

test("a buffered confirm during the scene skips it", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.input._buf.confirm = true;
  AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry, null);
});

test("depart soars in the direction he faces, carrying the dog", () => {
  const g = makeGame();
  AirEntry.enter(g);
  // Park time inside `depart`, past the rise fraction so he is soaring.
  const before = AirEntry.ORDER.slice(0, -1)
    .filter((k) => k !== "depart")
    .reduce((sum, k) => sum + C.phases[k], 0);
  g.airEntry.t = before + C.phases.depart * (C.departRiseFrac + 0.01);
  const x0 = g.airEntry.stranger.x;
  AirEntry.update(1 / 60, g);
  const st = g.airEntry.stranger, dog = g.airEntry.dog;
  assert.strictEqual(st.state, "soar");
  assert.strictEqual(st.facing, 1, "facing must match travel direction");
  assert.ok(st.x > x0, "soars downrange");
  assert.strictEqual(dog.held, true);
  assert.strictEqual(dog.x, st.x + C.dogCarryDX, "dog rides the carrier");
});

test("leashCurve: sag equals leashSag at zero hand-to-collar distance", () => {
  const curve = AirEntry.leashCurve(C, 100, 50, 100, 50);
  assert.strictEqual(curve.cy - 50, C.leashSag);
});

test("leashCurve: sag is 0 once distance reaches leashTautLen", () => {
  const curve = AirEntry.leashCurve(C, 0, 0, C.leashTautLen, 0);
  assert.strictEqual(curve.cy, 0);
});

test("leashCurve: sag stays 0 (never negative) well past leashTautLen", () => {
  const curve = AirEntry.leashCurve(C, 0, 0, C.leashTautLen * 5, 0);
  assert.strictEqual(curve.cy, 0);
});

test("leashCurve: sag eases down between rest and taut, always >= 0", () => {
  const half = AirEntry.leashCurve(C, 0, 0, C.leashTautLen / 2, 0);
  assert.ok(half.cy > 0, "still sagging at half the taut length");
  assert.ok(half.cy < C.leashSag, "sag eased down from the at-rest value");
});

test("leashCurve: endpoints match the inputs exactly", () => {
  const curve = AirEntry.leashCurve(C, 12, 34, 56, 78);
  assert.strictEqual(curve.x0, 12);
  assert.strictEqual(curve.y0, 34);
  assert.strictEqual(curve.x1, 56);
  assert.strictEqual(curve.y1, 78);
});

test("the scene never mutates wave state", () => {
  const g = makeGame();
  const before = { waveIndex: g.waveIndex, checkpointWave: g.checkpointWave,
                   waveActive: g.waveActive, sigils: g.sigils.length };
  AirEntry.enter(g);
  const steps = Math.ceil(AirEntry.totalDur(C) / (1 / 60)) + 2;
  for (let i = 0; i < steps; i++) AirEntry.update(1 / 60, g);
  assert.strictEqual(g.waveIndex, before.waveIndex);
  assert.strictEqual(g.checkpointWave, before.checkpointWave);
  assert.strictEqual(g.waveActive, before.waveActive);
  assert.strictEqual(g.sigils.length, before.sigils);
});
