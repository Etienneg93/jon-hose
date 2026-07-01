"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global.window || {};
require("../js/config.js");
const JH = global.window.JH;

test("every JH.FX entry has its curated frames on disk", () => {
  assert.ok(JH.FX, "JH.FX manifest missing");
  assert.ok(Object.keys(JH.FX).length >= 7, "expected 7 fx keys");
  for (const [key, m] of Object.entries(JH.FX)) {
    assert.ok(m.count > 0 && m.fps > 0, key + " needs count and fps");
    for (let i = 1; i <= m.count; i++) {
      const p = path.join(__dirname, "..", "sprites", "fx", key, i + ".png");
      assert.ok(fs.existsSync(p), key + " missing frame " + i + ".png");
    }
    const extra = path.join(__dirname, "..", "sprites", "fx", key, (m.count + 1) + ".png");
    assert.ok(!fs.existsSync(extra), key + " has stale frame " + (m.count + 1) + ".png beyond the manifest count");
  }
});
