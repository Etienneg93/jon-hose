"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
require("../js/upgrades.js");
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

// Minimal Player stub — Player constructor reads JH.Upgrades.computeStats().
// Ensure Upgrades is initialised before constructing a Player.
function makePlayer() {
  JH.Upgrades.reset();
  return new JH.Player(60, 40);
}

test("Player.applyBurn: adds stacks and resets timer", () => {
  const p = makePlayer();
  assert.strictEqual(p.burnStacks, 0);
  p.applyBurn(2);
  assert.strictEqual(p.burnStacks, 2);
  assert.strictEqual(p.burnTimer, JH.FIRE.burnDuration);
});

test("Player.applyBurn: caps stacks at maxBurnStacks", () => {
  const p = makePlayer();
  p.applyBurn(2);
  p.applyBurn(2);  // would be 4, capped at 3
  assert.strictEqual(p.burnStacks, JH.FIRE.maxBurnStacks);
});

test("Player.applyBurn: refreshes timer even when already burning", () => {
  const p = makePlayer();
  p.applyBurn(1);
  p.burnTimer = 0.5;  // simulate partial drain
  p.applyBurn(1);
  assert.strictEqual(p.burnTimer, JH.FIRE.burnDuration);  // reset, not extended
});

// Minimal game stub for Fireball flight tests — just what update() touches.
function makeBallGame(px, py) {
  return {
    player: {
      x: px, y: py, z: 0, alive: true, bodyW: 20,
      hits: 0, burns: 0,
      takeHit(dmg) { this.hits++; this.lastDmg = dmg; },
      applyBurn(n) { this.burns += n; },
    },
    particles: [], firePatches: [],
    shake() {},
  };
}

test("Fireball aims at the player's position, depth included", () => {
  const game = makeBallGame(300, 60);
  const fb = new JH.Fireball(100, 20, 1, game);   // player is right and deeper
  assert.ok(fb.vx > 0, "vx should head toward the player");
  assert.ok(fb.vy > 0, "vy should converge on the player's depth row");
});

test("Fireball spawns at cue height and droops into the hittable z-band", () => {
  const game = makeBallGame(300, 40);
  const fb = new JH.Fireball(100, 40, 1, game);
  assert.strictEqual(fb.z, JH.FIREBALL.spawnZ);   // cue tip, not feet
  for (let i = 0; i < 30; i++) fb.update(1 / 60, game);  // 0.5s of flight
  assert.ok(fb.z < 24, "z should droop below the 24px hit band within ~0.5s");
});

test("Fireball fired at an off-row player actually hits them", () => {
  const game = makeBallGame(260, 70);
  const fb = new JH.Fireball(100, 20, 1, game);   // 50px off the player's depth row
  for (let i = 0; i < 200 && !fb.dead; i++) fb.update(1 / 60, game);
  assert.ok(game.player.hits >= 1, "aimed ball should connect");
  assert.ok(game.player.burns >= 1, "hit should apply burn stacks");
});
