"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
require("../js/entities.js");
const JH = global.window.JH;

test("applyKnockback still knocks back regular enemies", () => {
  const mook = new JH.Enemy("mook", 0, 0);
  mook.applyKnockback(1, 500, 10);
  assert.notStrictEqual(mook.knockVX, 0);
});

test("applyKnockback is a no-op for bosses — the hose can't shove them", () => {
  const boss = new JH.Enemy("mook", 0, 0);
  boss.isBoss = true;
  boss.applyKnockback(1, 500, 10);
  assert.strictEqual(boss.knockVX, 0);
  assert.strictEqual(boss.knockVY, 0);
});
