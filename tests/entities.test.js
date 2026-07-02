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
  p.burnGraceT = 0;   // burn i-frames elapsed
  p.applyBurn(2);     // would be 4, capped at 3
  assert.strictEqual(p.burnStacks, JH.FIRE.maxBurnStacks);
});

test("Player.applyBurn: refreshes timer even when already burning", () => {
  const p = makePlayer();
  p.applyBurn(1);
  p.burnTimer = 0.5;  // simulate partial drain
  p.burnGraceT = 0;   // burn i-frames elapsed
  p.applyBurn(1);
  assert.strictEqual(p.burnTimer, JH.FIRE.burnDuration);  // reset, not extended
});

test("Player.applyBurn: burn stacks have i-frames like hits", () => {
  const p = makePlayer();
  p.applyBurn(1);
  assert.ok(p.burnGraceT > 0);
  p.applyBurn(1);     // inside the burn-grace window → ignored
  assert.strictEqual(p.burnStacks, 1);
  p.burnGraceT = 0;
  p.applyBurn(1);
  assert.strictEqual(p.burnStacks, 2);
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
      applyBurn(n) { this.burns += n; return true; },
      takeHit() { this.hits++; },
      applyKnockback() {},
    },
    particles: [], embers: [], firePatches: [], pickups: [],
    bounds: { minX: 0, maxX: 600 },
    shake() {}, hitStop() {}, onEnemyKilled() {}, dropLoot() {},
    audio: { played: [], play(k) { this.played.push(k); } },
  };
}

test("FirePatch: first contact burns immediately, with a sizzle cue", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  p.update(0.016, g);
  assert.strictEqual(g.player.burns, 1);
  assert.deepStrictEqual(g.audio.played, ["sizzle"]);
});

test("FirePatch: dip in and out → exactly one stack, one sizzle", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  p.update(0.016, g);            // contact: burn + sizzle
  g.player.y = 40 + 40;          // step out
  for (let t = 0; t < 0.6; t += 0.016) p.update(0.016, g);
  assert.strictEqual(g.player.burns, 1);
  assert.deepStrictEqual(g.audio.played, ["sizzle"]);
});

test("Two overlapping patches: one stack on contact, next lands at the 0.6s i-frame boundary", () => {
  const p = makePlayer();                     // real Player at (60, 40)
  const g = { player: p, audio: { play() {} } };
  const a = new JH.FirePatch(60, 40, 24, 3);
  const b = new JH.FirePatch(60, 40, 24, 3);  // stacked on top of the first
  const dt = 0.016;
  a.update(dt, g); b.update(dt, g);
  assert.strictEqual(p.burnStacks, 1);        // both patches, one stack
  // Simulate time passing (patch updates + the player's i-frame countdown).
  let t = 0;
  while (t < p.stats.invuln - 0.05) {
    p.burnGraceT -= dt; a.update(dt, g); b.update(dt, g); t += dt;
  }
  assert.strictEqual(p.burnStacks, 1);        // still inside the window
  while (t < p.stats.invuln + 0.1) {
    p.burnGraceT -= dt; a.update(dt, g); b.update(dt, g); t += dt;
  }
  assert.strictEqual(p.burnStacks, 2);        // lands right after 0.6s, not 0.8s
});

test("FirePatch: staying inside ticks stacks on the burn interval", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  for (let t = 0; t < JH.FIRE.patchBurnInterval + 0.1; t += 0.016) p.update(0.016, g);
  assert.ok(g.player.burns >= 2);
});

test("FirePatch: foot-width overlap counts as contact (padded rim)", () => {
  // radius 24 → rx 20.4; pad = bodyW 20 * 0.25 = 5 → contact out to 25.4.
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100 + 23, 40);   // center 2.6px past the rim, foot well in
  p.update(0.016, g);
  assert.deepStrictEqual(g.audio.played, ["sizzle"]);   // contact registered
  const p2 = new JH.FirePatch(100, 40, 24, 3);
  const g2 = stubGame(100 + 27, 40);  // beyond rim + pad → no contact
  p2.update(0.016, g2);
  assert.deepStrictEqual(g2.audio.played, []);
});

test("FirePatch: hit footprint is the drawn ellipse — depth miss a circle would hit", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  // footprint ry = 24*0.85*GROUND_RY ≈ 8.2; a 24-radius circle reaches depth 24
  const g = stubGame(100, 40 + 15);
  for (let t = 0; t < 0.5; t += 0.016) p.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);
  assert.deepStrictEqual(g.audio.played, []);   // never even warned
});

test("FirePatch: re-entry burns again but never re-sizzles (one cue per patch)", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  p.update(0.016, g);                                        // contact: burn + sizzle
  g.player.y = 40 + 40;                                      // step out (clear of pad)
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

test("Quake stomp: old rect corners no longer hit; drawn ellipse does", () => {
  const d = JH.QUAKE;
  // Corner of the old rect (|dx|<36, |dy|<26): dx=32.4, dy=23 → old HIT.
  const q = JH.makeEnemy("quake", 100, 40);
  let g = stubGame(100 + d.stompRadius * 0.9, 40 + 23);
  q.state = "tele"; q.windTimer = 0.001; q.atkDur = 1;
  q.think(0.016, g);
  assert.strictEqual(g.player.hits, 0);
  // Dead ahead at half radius → hit.
  const q2 = JH.makeEnemy("quake", 100, 40);
  g = stubGame(100 + d.stompRadius * 0.5, 40);
  q2.state = "tele"; q2.windTimer = 0.001; q2.atkDur = 1;
  q2.think(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});

test("Quake leap: landing hit matches the crosshair telegraph ellipse", () => {
  const d = JH.QUAKE;
  // Depth 0.6·leapRadius: old circle hit (31.2 < 52); ellipse (ry=20.8) must not.
  const q = JH.makeEnemy("quake", 100, 40);
  q.state = "leaping"; q.leapTarget = { x: 200, y: 40 };
  q._leapStartX = 100; q._leapStartY = 40; q._leapProgress = 0.999;
  let g = stubGame(200, 40 + d.leapRadius * 0.6);
  q.think(0.016, g);
  assert.strictEqual(g.player.hits, 0);
  // x-offset 0.7·leapRadius on the long axis → hit.
  const q2 = JH.makeEnemy("quake", 100, 40);
  q2.state = "leaping"; q2.leapTarget = { x: 200, y: 40 };
  q2._leapStartX = 100; q2._leapStartY = 40; q2._leapProgress = 0.999;
  g = stubGame(200 + d.leapRadius * 0.7, 40);
  q2.think(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});

test("Slayer slam: hits the drawn ellipse, not the old rect", () => {
  const d = JH.SLAYER;
  // Old rect corner (|dx|<38, |dy|<24): dx=34.2, dy=20 → old HIT; ellipse miss.
  // cdTimer must be 0 or think() early-returns before the slam branch.
  const s = JH.makeEnemy("slayer", 100, 40);
  s.state = "slam"; s.windTimer = 0.001; s.cdTimer = 0;
  let g = stubGame(100 + d.slamRange * 0.9, 40 + 20);
  s.think(0.016, g);
  assert.strictEqual(g.player.hits, 0);
  // Dead ahead at half range → hit.
  const s2 = JH.makeEnemy("slayer", 100, 40);
  s2.state = "slam"; s2.windTimer = 0.001; s2.cdTimer = 0;
  g = stubGame(100 + d.slamRange * 0.5, 40);
  s2.think(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});

// ---- input buffer: dash ----
// Uses the real JH.Input with a fake clock so Player.update sees genuine
// buffered() semantics. (node 21+ ships a global navigator; poll()'s
// getGamepads guard handles it having none.)
require("../js/input.js");
function makeBufferedInput() {
  global.window.addEventListener = global.window.addEventListener || (() => {});
  const In = JH.Input;
  In.init();
  let now = 0;
  In._now = () => now;
  return {
    In,
    frame(ms) { now += ms; In.poll(); },
  };
}
function dashStubGame(In) {
  return {
    input: In,
    audio: { play() {} },
    particles: [], embers: [], enemies: [], shields: [], firePatches: [], pickups: [],
    bounds: { minX: 0, maxX: 600 },
    shake() {}, hitStop() {},
  };
}

test("dash pressed during cooldown fires when the cooldown expires (buffer)", () => {
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  p.dashCdTimer = 0.05;                    // still cooling down
  sim.In._keys.right = true;               // direction held
  sim.In._keys.dash = true; sim.frame(16); // press lands during cooldown
  p.update(0.016, g);
  assert.strictEqual(p.dashTimer, 0, "cooldown still active — no dash yet");
  sim.In._keys.dash = false;
  for (let i = 0; i < 5; i++) { sim.frame(16); p.update(0.016, g); }  // ~80ms later
  assert.ok(p.dashTimer > 0, "buffered dash fires once the cooldown expires");
});

test("dash press older than the buffer window is dropped", () => {
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  p.dashCdTimer = 0.3;                     // long cooldown
  sim.In._keys.right = true;
  sim.In._keys.dash = true; sim.frame(16);
  p.update(0.016, g);
  sim.In._keys.dash = false;
  for (let i = 0; i < 20; i++) { sim.frame(16); p.update(0.016, g); }  // ~320ms
  assert.strictEqual(p.dashTimer, 0, "stale press must not fire");
});

test("neutral dash goes toward facing", () => {
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  p.facing = -1;
  sim.In._keys.dash = true; sim.frame(16); // no direction held
  p.update(0.016, g);
  assert.ok(p.dashTimer > 0, "neutral press should still dash");
  assert.strictEqual(p._dashX, -1, "dashes toward facing");
  assert.strictEqual(p._dashY, 0);
});
