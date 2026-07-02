"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
// world.js preloads a debris sprite via JH.Loader at script eval; node has no
// Image, so stub the loader. Geo itself is pure math.
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
const JH = global.window.JH;
const Geo = JH.Geo;

test("GROUND_RY is defined", () => {
  assert.strictEqual(typeof JH.GROUND_RY, "number");
  assert.ok(JH.GROUND_RY > 0 && JH.GROUND_RY < 1);
});

test("inGroundEllipse: center and x-rim edge", () => {
  assert.ok(Geo.inGroundEllipse(100, 40, 100, 40, 30));
  assert.ok(Geo.inGroundEllipse(129, 40, 100, 40, 30));
  assert.ok(!Geo.inGroundEllipse(131, 40, 100, 40, 30));
});

test("inGroundEllipse: depth reach is rx * GROUND_RY, not rx", () => {
  const ry = 30 * JH.GROUND_RY; // 12
  assert.ok(Geo.inGroundEllipse(100, 40 + ry - 1, 100, 40, 30));
  assert.ok(!Geo.inGroundEllipse(100, 40 + ry + 1, 100, 40, 30));
  // A plain circle test would pass at depth 25; the ellipse must not.
  assert.ok(!Geo.inGroundEllipse(100, 40 + 25, 100, 40, 30));
});

test("inGroundEllipse: explicit ry overrides the default ratio", () => {
  assert.ok(Geo.inGroundEllipse(100, 40 + 19, 100, 40, 30, 20));
  assert.ok(!Geo.inGroundEllipse(100, 40 + 21, 100, 40, 30, 20));
});
