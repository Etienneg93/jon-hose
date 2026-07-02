"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
// world.js preloads a debris sprite via JH.Loader at script eval; node has no
// Image, so stub the loader. entities.js captures Geo at eval time, so world
// must load first (same order as index.html).
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
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

// ---- ground-hazard footprint contract (rim = hitbox) ----

// Minimal game stub for hazard update/think paths. Extend fields here if an
// entity path touches something missing — keep one shared stub.
function stubGame(px, py) {
  return {
    player: {
      x: px, y: py, z: 0, alive: true, bodyW: 12, facing: 1,
      burns: 0, hits: 0,
      applyBurn(n) { this.burns += n; },
      takeHit() { this.hits++; },
      applyKnockback() {},
    },
    particles: [], embers: [], firePatches: [], pickups: [],
    bounds: { minX: 0, maxX: 600 },
    shake() {}, hitStop() {}, onEnemyKilled() {}, dropLoot() {},
    audio: { played: [], play(k) { this.played.push(k); } },
  };
}

test("FirePatch: first contact arms sizzle grace — warning, no instant burn", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  p.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);
  assert.deepStrictEqual(g.audio.played, ["sizzle"]);
});

test("FirePatch: still inside after the grace window → burn lands", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  for (let t = 0; t < 0.3; t += 0.016) p.update(0.016, g);
  assert.ok(g.player.burns >= 1);
});

test("FirePatch: stepping out during grace → no burn ever", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  p.update(0.016, g);            // sizzle warning fires
  g.player.y = 40 + 30;          // step out of the footprint
  for (let t = 0; t < 0.5; t += 0.016) p.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);
});

test("FirePatch: hit footprint is the drawn ellipse — depth miss a circle would hit", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  // footprint ry = 24*0.85*GROUND_RY ≈ 8.2; a 24-radius circle reaches depth 24
  const g = stubGame(100, 40 + 15);
  for (let t = 0; t < 0.5; t += 0.016) p.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);
  assert.deepStrictEqual(g.audio.played, []);   // never even warned
});

test("FirePatch: re-entry after grace burns immediately, no second warning", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  for (let t = 0; t < 0.3; t += 0.016) p.update(0.016, g);  // grace + first burn
  g.player.y = 40 + 30;                                      // step out
  for (let t = 0; t < 0.5; t += 0.016) p.update(0.016, g);  // burn interval expires
  const before = g.player.burns;
  g.player.y = 40;                                           // step back in
  p.update(0.016, g);
  assert.strictEqual(g.player.burns, before + 1);
  assert.strictEqual(g.audio.played.filter((k) => k === "sizzle").length, 1);
});

test("FirePatch.footprint: shrinks with spray progress, floors at r=6", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const f0 = p.footprint();
  assert.strictEqual(f0.rx, 24 * 0.85);
  assert.strictEqual(f0.ry, f0.rx * JH.GROUND_RY);
  p.sprayProgress = 3;                 // fully extinguish-progressed
  const f1 = p.footprint();
  assert.ok(f1.r >= 6 && f1.r < f0.r);
});

test("FireRing: rim crossing is elliptical, matching the drawn ring", () => {
  // Ring at r=30 draws an ellipse (30, 30*GROUND_RY=12).
  // Depth 10 → rim-space 10/0.4 = 25, |25-30| < 14 → HIT (old circle missed).
  const ring = new JH.FireRing(100, 40, { maxR: 80, speed: 0, dmg: 10, burn: 1 });
  ring.r = 30;
  let g = stubGame(100, 40 + 10);
  ring.update(0.016, g);
  assert.strictEqual(g.player.hits, 1);
  // Depth 25 → rim-space 62.5 → MISS (old circle logic hit here: |25-30| < 14).
  const ring2 = new JH.FireRing(100, 40, { maxR: 80, speed: 0, dmg: 10, burn: 1 });
  ring2.r = 30;
  g = stubGame(100, 40 + 25);
  ring2.update(0.016, g);
  assert.strictEqual(g.player.hits, 0);
});

test("Furnace vent: burn/knockback only inside the drawn telegraph ellipse", () => {
  const f = JH.makeEnemy("furnace", 100, 40);
  const R = f.bodyW * 4;
  // Depth 0.6R: inside the old circle, outside the drawn ellipse (ry = 0.4R).
  let g = stubGame(100, 40 + R * 0.6);
  f.heatT = 0.001; f.heated = true;
  f.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);

  const f2 = JH.makeEnemy("furnace", 100, 40);
  g = stubGame(100 + R * 0.6, 40);
  f2.heatT = 0.001; f2.heated = true;
  f2.update(0.016, g);
  assert.ok(g.player.burns > 0);
});

test("SmeltBomb landing burn matches the spawned FirePatch footprint", () => {
  // lobBombRadius 34 → patch footprint rx = 34*0.85 = 28.9, ry ≈ 11.6.
  // Depth 20: the old world circle (r=34) burned; the patch ellipse must not.
  const s = JH.makeEnemy("smelt", 100, 40);
  let g = stubGame(100, 40 + 20);
  s.windTimer = 0.001;
  s.think(0.016, g);
  const bomb = g.embers.find((e) => e.vz !== undefined);
  assert.ok(bomb, "smelt should have lobbed a bomb");
  bomb.x = 100; bomb.y = 40; bomb.z = 0.0001; bomb.vz = -1;
  bomb.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);

  const s2 = JH.makeEnemy("smelt", 100, 40);
  g = stubGame(120, 40);   // x-offset 20 < rx 28.9 → burn
  s2.windTimer = 0.001;
  s2.think(0.016, g);
  const bomb2 = g.embers.find((e) => e.vz !== undefined);
  bomb2.x = 100; bomb2.y = 40; bomb2.z = 0.0001; bomb2.vz = -1;
  bomb2.update(0.016, g);
  assert.strictEqual(g.player.burns, 1);
});

test("Fuse drop slam: hit zone matches the landing ring ellipse", () => {
  // slamRadius 20 → ry 8. Depth 14: old circle hit; ellipse must not.
  const f = JH.makeEnemy("fuse", 100, 40);
  let g = stubGame(100, 40 + 14);
  f.dropping = true; f.dropWait = 0; f.z = 0.0001; f.vz = -1;
  f.update(0.016, g);
  assert.strictEqual(g.player.hits, 0);

  const f2 = JH.makeEnemy("fuse", 100, 40);
  g = stubGame(112, 40);   // x-offset 12 < 20 → hit
  f2.dropping = true; f2.dropWait = 0; f2.z = 0.0001; f2.vz = -1;
  f2.update(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});

test("Fuse death burn: elliptical, matching its death patch", () => {
  // deathBurnRange 30 → ry 12. Depth 20: old circle burned; ellipse must not.
  const f = JH.makeEnemy("fuse", 100, 40);
  let g = stubGame(100, 40 + 20);
  f.die(g);
  assert.strictEqual(g.player.burns, 0);

  const f2 = JH.makeEnemy("fuse", 100, 40);
  g = stubGame(120, 40);   // x-offset 20 < 30 → burn
  f2.die(g);
  assert.strictEqual(g.player.burns, 1);
});
