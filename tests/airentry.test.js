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
