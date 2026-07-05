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

test("Player.clearBurn: wipes all burn state (church respawn must not keep DoT)", () => {
  const p = makePlayer();
  p.applyBurn(2);
  p.burnTickT = 0.3;   // mid-beat accrual
  p.clearBurn();
  assert.strictEqual(p.burnStacks, 0);
  assert.strictEqual(p.burnTimer, 0);
  assert.strictEqual(p.burnTickT, 0);
  assert.strictEqual(p.burnGraceT, 0);
  // No damage beat can land afterwards: tickBurn with cleared state is a no-op.
  const hpBefore = p.hp;
  p.tickBurn(1.0, { particles: [] });
  assert.strictEqual(p.hp, hpBefore);
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

test("Fireball spawns at cue height and stays there", () => {
  const game = makeBallGame(300, 40);
  const fb = new JH.Fireball(100, 40, 1, game);
  assert.strictEqual(fb.z, JH.FIREBALL.spawnZ);   // cue tip, not feet
  for (let i = 0; i < 30; i++) fb.update(1 / 60, game);  // 0.5s of flight
  assert.strictEqual(fb.z, JH.FIREBALL.spawnZ, "flies flat off the cue");
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
    shake() {}, hitStop() {}, onEnemyKilled() {}, dropLoot() {}, killJuice() {},
    canAttack() { return true; },
    defer(ms, fn) { fn(); },   // stub runs deferred work immediately
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

test("SmeltBomb with bounces re-arcs once, leaving a patch at EACH touchdown", () => {
  const g = makeThinkGame(200, 40);
  const bomb = new JH.SmeltBomb(100, 40, 140, 40, JH.ENEMIES.smelt, { bounces: 1 });
  for (let i = 0; i < 400 && !bomb.dead; i++) bomb.update(1 / 60, g);
  assert.strictEqual(bomb.dead, true);
  assert.ok(g.firePatches.length >= 2, "patch at first landing AND bounce landing, got " + g.firePatches.length);
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

// ---- projectile depth motion (no mid-flight direction kinks) ----

test("Ember: leaving the walkable band culls it instead of clamping", () => {
  // Up-screen shot: with the old per-frame clamp, y froze at DEPTH_MIN and
  // the ember visibly bounced off the back edge and drifted back down.
  const e = new JH.Ember(100, JH.DEPTH_MIN + 5, 10, 0, -60, 5);
  const g = stubGame(999, 999);
  for (let i = 0; i < 40 && !e.dead; i++) e.update(0.016, g);
  assert.ok(e.dead, "culled once it leaves the band");
  assert.ok(e.y < JH.DEPTH_MIN, "depth motion never froze at the band edge");
});

test("Ember: z floors at the ground plane", () => {
  const e = new JH.Ember(100, 40, 0.01, 0, 0, 5);
  const g = stubGame(999, 999);
  for (let i = 0; i < 10; i++) e.update(0.016, g);
  assert.strictEqual(e.z, 0, "constant sink must not push z below the floor");
});

test("Fireball: flies dead straight — height never changes mid-flight", () => {
  const g = stubGame(999, 999);   // player far away → no hit
  const fb = new JH.Fireball(100, 40, 1, g);
  const z0 = fb.z;
  for (let i = 0; i < 90; i++) fb.update(0.016, g);
  assert.strictEqual(fb.z, z0, "no droop, no landing kink");
});

test("Fireball: still connects with a grounded player at cue height", () => {
  const g = stubGame(140, 40);
  const fb = new JH.Fireball(100, 40, 1, g);
  let guard = 0;
  while (!fb.dead && guard++ < 120) fb.update(0.016, g);
  assert.strictEqual(g.player.hits, 1, "flat flight path must still hit Jon");
});

// ---- stalker point-blank deadzone (no facing strobe on top of Jon) ----

test("Stalker: at point-blank it holds ground and facing (no L/R strobe)", () => {
  const s = JH.makeEnemy("stalker", 101, 40);   // 1px right of the player
  s.cdTimer = 5; s.spawnGrace = 0; s.facing = -1;
  const g = stubGame(100, 40);
  for (let i = 0; i < 30; i++) s.think(0.016, g);
  assert.strictEqual(s.facing, -1, "facing must not re-derive from sign(dx) at point-blank");
  assert.strictEqual(s.x, 101, "no walking into/through the player");
  assert.strictEqual(s.state, "idle");
});

test("Stalker: outside the deadzone it still stalks and faces the player", () => {
  const s = JH.makeEnemy("stalker", 150, 40);
  s.cdTimer = 5; s.spawnGrace = 0; s.facing = 1;
  const g = stubGame(100, 40);
  s.think(0.016, g);
  assert.strictEqual(s.facing, -1, "faces the player while stalking");
  assert.ok(s.x < 150, "closes the distance during blink cooldown");
  assert.strictEqual(s.state, "walk");
});

// ---- fuse: drop-in + point-blank deadzone ----

test("Fuse: beginDrop(0) still falls from height — never lands the same frame", () => {
  const f = JH.makeEnemy("fuse", 100, 40);
  f.beginDrop(0);   // the first spawn of a wave gets no stagger delay
  const g = stubGame(999, 999);
  f.update(0.016, g);
  assert.ok(f.dropping, "still airborne after one frame");
  assert.ok(f.z > 0, "falls from drop height, not from the ground");
});

test("Fuse: at point-blank it holds ground and facing (melee-less rusher)", () => {
  const f = JH.makeEnemy("fuse", 101, 40);   // 1px right of the player
  f.spawnGrace = 0; f.facing = -1;
  const g = stubGame(100, 40);
  for (let i = 0; i < 30; i++) f.think(0.016, g);
  assert.strictEqual(f.facing, -1, "no sign(dx) strobe while overlapping Jon");
  assert.strictEqual(f.x, 101, "holds ground at point-blank");
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

// separate() lives on JH.Game but is a pure method over {enemies, player}.
require("../js/game.js");

test("player-enemy overlap displaces neither party (contact damage is the deterrent)", () => {
  const p = makePlayer();
  const e = new JH.Enemy("mook", p.x + 2, p.y);   // overlapping Jon
  const ex = e.x, px = p.x;
  JH.Game.separate.call({ enemies: [e], player: p });        // walking
  assert.strictEqual(e.x, ex, "enemy never displaced by Jon's body");
  assert.strictEqual(p.x, px, "Jon never herded by enemy bodies");
  p.dashTimer = 0.1;
  JH.Game.separate.call({ enemies: [e], player: p });        // dashing
  assert.strictEqual(e.x, ex);
  assert.strictEqual(p.x, px);
});

test("enemy-enemy separation still anti-stacks", () => {
  const e1 = new JH.Enemy("mook", 100, 40);
  const e2 = new JH.Enemy("mook", 102, 40);
  JH.Game.separate.call({ enemies: [e1, e2], player: null });
  assert.ok(e2.x - e1.x > 2, "overlapping enemies get pushed apart");
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

test("computeStats caps dodgeChance at 25%", () => {
  JH.Upgrades.reset();
  // Force an over-cap contribution through a repeatable-free path: fake a
  // pillar application by monkey-patching Pillars.apply.
  const prevApply = JH.Pillars.apply;
  const prevChurch = JH.Church;
  JH.Pillars.apply = (s) => { s.dodgeChance = 0.4; };
  global.window.JH.Church = { state: {} };
  const s = JH.Upgrades.computeStats({});
  assert.ok(s.dodgeChance <= 0.25, "dodge capped, got " + s.dodgeChance);
  JH.Pillars.apply = prevApply;
  if (prevChurch === undefined) delete global.window.JH.Church; else global.window.JH.Church = prevChurch;
});

// ---- attack tickets: cap on simultaneous melee windups ----

// Minimal game stub for enemy think() tests.
function makeThinkGame(px, py) {
  return {
    player: Object.assign(makePlayer(), { x: px, y: py }),
    enemies: [], embers: [], particles: [], firePatches: [], shields: [],
    bounds: { minX: 0, maxX: 480 },
    audio: { play() {} }, shake() {}, hitStop() {}, defer() {},
    killJuice() {}, dropLoot() {}, onEnemyKilled() {}, spawnEnemy() {},
    canAttack() { return this._tickets !== false; }, _tickets: true,
    sigils: [], banner() {},
  };
}

test("mook holds its windup when no attack ticket is free", () => {
  const g = makeThinkGame(60, 40);
  const m = new JH.Enemy("mook", 62, 40);           // inside meleeRange (20)
  m.spawnGrace = 0;
  g._tickets = false;
  m.think(1 / 60, g);
  assert.strictEqual(m.windTimer, 0, "no windup without a ticket");
  assert.notStrictEqual(m.state, "wind");
  g._tickets = true;
  m.think(1 / 60, g);
  assert.ok(m.windTimer > 0, "winds up once a ticket frees");
  assert.strictEqual(m.usingTicket, true);
});

test("tier-3 nodes are act-gated: locked before Act 2, available from Act 2", () => {
  JH.Upgrades.reset();
  JH.Upgrades.currentActLevel = -1;                     // Act 1
  assert.strictEqual(JH.Upgrades.isAvailable("sig_lance"), false);
  JH.Upgrades.currentActLevel = 0;                      // Act 2 — gate opens here
  assert.strictEqual(JH.Upgrades.isAvailable("sig_lance"), true);
  JH.Upgrades.currentActLevel = 1;                      // Act 3 — still available
  assert.strictEqual(JH.Upgrades.isAvailable("sig_lance"), true);
  JH.Upgrades.reset(); JH.Upgrades.currentActLevel = -1;
});

test("Upgrades NODES: exactly three signatures, retired ids gone", () => {
  const ids = JH.Upgrades.nodes.map((n) => n.id).sort();
  assert.deepStrictEqual(ids, ["sig_dash", "sig_lance", "sig_marshal"]);
  assert.deepStrictEqual(JH.Upgrades.branches, ["SIGNATURE"]);
  assert.strictEqual(JH.Upgrades.repeatables.length, 1);
  assert.strictEqual(JH.Upgrades.repeatables[0].id, "ov_dmg");
  ["pw1", "pw2", "pw3", "rc1", "rc2", "rc3", "tk1", "tk2", "tk3",
   "mb1", "mb2", "mb3", "vt1", "vt2", "vt3", "ov_water", "ov_hp"].forEach((id) => {
    assert.strictEqual(JH.Upgrades.byId(id), undefined, id + " should be retired");
  });
});

test("repCost: Overcharge escalates at 1.8x per prior buy", () => {
  JH.Upgrades.reset();
  assert.strictEqual(JH.Upgrades.repCost("ov_dmg"), 60);
  JH.Upgrades.repCount.ov_dmg = 1;
  assert.strictEqual(JH.Upgrades.repCost("ov_dmg"), Math.round(60 * 1.8));
  JH.Upgrades.reset();
});

test("game.float pools with a 20 cap (oldest dropped) and culls by age", () => {
  const g = { floaters: [] };
  for (let i = 0; i < 25; i++) JH.Game.float.call(g, i, 0, "x", "#fff");
  assert.strictEqual(g.floaters.length, 20, "capped at 20");
  assert.strictEqual(g.floaters[0].x, 5, "the 5 oldest were dropped");
  JH.Game.tickFloaters.call(g, 1.0);   // past the ~0.9s life
  assert.strictEqual(g.floaters.length, 0, "aged-out floaters are culled");
});

test("sweepCrosses banks live crosses so win/respawn can't lose essence", () => {
  const prevChurch = JH.Church;
  JH.Church = { banked: 0, addEssence(n) { this.banked += n; } };
  const g = { pickups: [
    { kind: "cross", value: 2, dead: false },
    { kind: "cross", dead: true },              // already collected — skipped
    { kind: "health", value: 25, dead: false }, // not a cross — untouched
  ] };
  JH.Game.sweepCrosses.call(g);
  assert.strictEqual(JH.Church.banked, 2, "live cross value banked");
  assert.strictEqual(g.pickups[0].dead, true, "swept cross is killed");
  assert.strictEqual(g.pickups[2].dead, false, "non-cross pickups untouched");
  if (prevChurch === undefined) delete JH.Church; else JH.Church = prevChurch;
});

test("priceOf: Punch Card discounts 20%, rounded; absent relic charges full price", () => {
  assert.strictEqual(JH.Game.priceOf.call({ relics: {} }, 150), 150);
  assert.strictEqual(JH.Game.priceOf.call({ relics: { punch_card: true } }, 150), 120);
  assert.strictEqual(JH.Game.priceOf.call({ relics: { punch_card: true } }, 155), Math.round(155 * 0.8));
  assert.strictEqual(JH.Game.priceOf.call({}, 150), 150, "missing relics map never throws");
});

// Minimal game stub for onEnemyKilled: a real Player (suds/water/gushRegen
// fields) plus the handful of game-level methods the function calls.
function makeKillGame() {
  return {
    kills: 0, combo: 0, comboTimer: 0, comboFlash: 0,
    grantXp() {}, audio: { play() {} }, shake() {}, particles: [],
    pickups: [],
    spawnPickup(kind, x, y, value) { this.pickups.push({ kind, x, y, value }); },
    player: makePlayer(),
    relics: {},
  };
}

test("onEnemyKilled: Collection Plate grants +2 bonus suds per kill; absent grants none", () => {
  const g = makeKillGame();
  g.relics.collection_plate = true;
  JH.Game.onEnemyKilled.call(g, null);
  assert.strictEqual(g.player.suds, 2);
  assert.strictEqual(g.player.sudsEarned, 2);

  const g2 = makeKillGame();
  JH.Game.onEnemyKilled.call(g2, null);
  assert.strictEqual(g2.player.suds, 0, "no relic, no bonus");
});

test("onEnemyKilled: boss cross is worth 1, or 2 with Sunday Suit", () => {
  const prevChurch = JH.Church;
  JH.Church = { markBossDefeated() {} };

  const g1 = makeKillGame();
  JH.Game.onEnemyKilled.call(g1, { isBoss: true, type: "boss", x: 10, y: 20 });
  assert.strictEqual(g1.pickups[0].value, 1);

  const g2 = makeKillGame();
  g2.relics.sunday_suit = true;
  JH.Game.onEnemyKilled.call(g2, { isBoss: true, type: "boss", x: 10, y: 20 });
  assert.strictEqual(g2.pickups[0].value, 2);

  if (prevChurch === undefined) delete JH.Church; else JH.Church = prevChurch;
});

// makeSuper reads JH.Balance.superEliteDef at call time.
require("../js/balance.js");
require("../js/pillars.js");
require("../js/benedictions.js");

test("makeSuper: 7x hp, superElite + elite flags, def untouched globally", () => {
  const m = new JH.Enemy("mook", 0, 0);
  const baseHp = JH.ENEMIES.mook.hp;
  m.makeSuper();
  assert.strictEqual(m.superElite, true);
  assert.strictEqual(m.elite, true);          // reuses elite art/palette
  assert.strictEqual(m.maxHp, baseHp * 7);
  assert.strictEqual(JH.ENEMIES.mook.hp, baseHp);  // shared def not mutated
});

test("super mook windup resolves into a forward lunge, not a standing hit", () => {
  const g = makeThinkGame(120, 40);
  const m = new JH.Enemy("mook", 60, 40);
  m.makeSuper(); m.spawnGrace = 0; m.facing = 1;
  m.windTimer = 0.01; m.state = "wind";
  const x0 = m.x;
  m.think(0.02, g);                       // windup expires
  assert.strictEqual(m.state, "lunge");
  m.think(0.05, g);                       // lunging
  assert.ok(m.x > x0, "carries forward during the lunge");
});

test("lunge commits to its aim: no re-facing mid-flight when Jon is behind", () => {
  const g = makeThinkGame(20, 40);          // player BEHIND the lunge direction
  const m = new JH.Enemy("mook", 60, 40);
  m.makeSuper(); m.spawnGrace = 0; m.facing = 1;
  m.state = "lunge"; m.attackTimer = 0.16; m.lungeHit = false;
  const x0 = m.x;
  m.think(0.05, g);
  assert.strictEqual(m.facing, 1, "facing stays locked during the lunge");
  assert.ok(m.x > x0, "still advances along the committed direction");
});

test("super charger ricochets off the arena x-bounds and keeps momentum", () => {
  const g = makeThinkGame(200, 80);
  const c = JH.makeEnemy("charger", 470, 40);
  c.makeSuper(); c.spawnGrace = 0;
  c.state = "charge"; c.attackTimer = 2;
  c.chargeVX = 200; c.chargeVY = 30; c.bounces = 3;
  c.think(0.1, g);                          // crosses maxX=480 → bounce
  assert.ok(c.chargeVX < 0, "x velocity reflected");
  assert.strictEqual(c.state, "charge", "still charging after bounce");
});

test("super pyro fires a 3-ember fan; embers carry a patch spec", () => {
  const g = makeThinkGame(150, 40);
  const p = JH.makeEnemy("pyro", 60, 40);
  p.makeSuper(); p.spawnGrace = 0;
  p.windTimer = 0.01; p.state = "wind";
  p.think(0.02, g);
  assert.strictEqual(g.embers.length, 3);
  assert.ok(g.embers.every((e) => e.patch && e.patch.r === 14));
});

test("super stalker feints in FRONT first, then blinks behind and strikes", () => {
  const g = makeThinkGame(240, 40);
  g.player.facing = 1;
  const s = JH.makeEnemy("stalker", 100, 40);
  s.makeSuper(); s.spawnGrace = 0;
  s.windTimer = 0.01; s.state = "wind";
  s.think(0.02, g);                              // first blink = feint
  assert.ok(s.x > g.player.x, "feint lands in FRONT of the player (facing side)");
  assert.notStrictEqual(s.state, "strike", "no strike off the feint");
  assert.ok(s.windTimer > 0, "re-telegraphs for the real blink");
  s.windTimer = 0.01;
  s.think(0.02, g);                              // second blink = real
  assert.ok(s.x < g.player.x, "real blink lands BEHIND");
  assert.strictEqual(s.state, "strike");
});

// ---- fuse: proximity-lit self-destruct + elite/super death-split ----

test("fuse ignites on proximity and drains its own hp while lit", () => {
  const g = makeThinkGame(60, 40);
  const f = JH.makeEnemy("fuse", 100, 40);     // 40px away < igniteRange 70
  f.spawnGrace = 0; f.dropping = false;
  f.update(1 / 60, g);
  assert.strictEqual(f.lit, true);
  const hp0 = f.hp;
  f.update(0.5, g);
  assert.ok(f.hp < hp0, "lit fuse burns its own hp");
});

test("lit fuse reaching 0 hp self-destructs: blast patch + player damage in range", () => {
  const g = makeThinkGame(110, 40);
  const f = JH.makeEnemy("fuse", 100, 40);
  f.spawnGrace = 0; f.dropping = false; f.lit = true; f.hp = 0.01;
  const hpBefore = g.player.hp;
  f.update(0.5, g);
  assert.strictEqual(f.dead, true);
  assert.ok(g.firePatches.length >= 1, "blast leaves a fire patch");
  assert.ok(g.player.hp < hpBefore, "player inside blastRadius takes the hit");
});

test("elite fuse spawns 1 child on death; super spawns 3", () => {
  const spawned = [];
  const g = makeThinkGame(400, 40);
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); spawned.push(c); return c; };
  const e = JH.makeEnemy("fuse", 100, 40); e.makeElite(); e.die(g);
  assert.strictEqual(spawned.length, 1);
  const s = JH.makeEnemy("fuse", 100, 40); s.makeSuper(); s.die(g);
  assert.strictEqual(spawned.length, 4);
});

// ---- super bulwark: shield lob + slow zone ----

test("SlowZone slows the player inside, expires after dur", () => {
  const g = makeThinkGame(100, 40);
  const z = new JH.SlowZone(100, 40, 30, 5);
  z.update(1 / 60, g);
  assert.strictEqual(g.player.zoneSlow, 0.55);
  const z2 = new JH.SlowZone(400, 40, 30, 5);   // far away
  g.player.zoneSlow = 1; z2.update(1 / 60, g);
  assert.strictEqual(g.player.zoneSlow, 1);
  z.t = 99; assert.strictEqual(z.update(1 / 60, g), false);
});

test("spawnFirePatch: fire never stacks inside a live patch's footprint", () => {
  const g = makeThinkGame(400, 40);
  const first = JH.spawnFirePatch(g, 100, 40, 30, 2);
  assert.ok(first, "first patch spawns");
  assert.strictEqual(JH.spawnFirePatch(g, 102, 40, 30, 2), null); // on top -> refused
  assert.strictEqual(g.firePatches.length, 1);
  assert.ok(JH.spawnFirePatch(g, 200, 40, 30, 2), "well clear -> spawns");
  assert.strictEqual(g.firePatches.length, 2);
});

test("super smelt lobs ONE bouncing slag, not two", () => {
  const g = makeThinkGame(200, 40);
  const s = JH.makeEnemy("smelt", 60, 40);
  s.makeSuper(); s.spawnGrace = 0;
  s.windTimer = 0.01; s.state = "wind";
  s.think(0.02, g);
  assert.strictEqual(g.embers.length, 1);
  assert.strictEqual(g.embers[0].bounces, 1);
});

test("super smelt hp uses the SUPER_TUNE override (3x, not 7x)", () => {
  const s = JH.makeEnemy("smelt", 0, 0);
  s.makeSuper();
  assert.strictEqual(s.maxHp, JH.ENEMIES.smelt.hp * 3);
});

test("makeSuper hpScale damps hp after type multipliers (early-act giants)", () => {
  const m = new JH.Enemy("mook", 0, 0);
  m.makeSuper(0.55);
  assert.strictEqual(m.maxHp, Math.round(JH.ENEMIES.mook.hp * 7 * 0.55));   // 154
  const full = new JH.Enemy("mook", 0, 0);
  full.makeSuper();                                    // no scale = full 7x
  assert.strictEqual(full.maxHp, JH.ENEMIES.mook.hp * 7);
});

test("computeStats folds levelCount through the gain cycle", () => {
  JH.Upgrades.reset();
  const base = JH.Upgrades.computeStats({});
  JH.Upgrades.levelCount = 2;                        // +3 dmg, +8 water
  const s = JH.Upgrades.computeStats({});
  assert.strictEqual(s.sprayDamage, base.sprayDamage + 3);
  assert.strictEqual(s.maxWater, base.maxWater + 8);
  JH.Upgrades.reset();
  assert.strictEqual(JH.Upgrades.levelCount, 0);
});

test("super bulwark's thrown shield lands as barrier dome + slow zone", () => {
  const g = makeThinkGame(200, 40);
  g.slowZones = [];
  const b = JH.makeEnemy("bulwark", 60, 40);
  b.makeSuper();
  const lob = new JH.ShieldLob(60, 40, 120, 40, b);
  for (let i = 0; i < 200 && !lob.dead; i++) lob.update(1 / 60, g);
  assert.strictEqual(g.slowZones.length, 1, "slow zone landed");
  assert.strictEqual(g.shields.length, 1, "barrier dome landed");
  assert.strictEqual(g.shields[0].radius, 34);
  assert.strictEqual(b.shield, g.shields[0]);
  // Reclaim: zone expiry restores the shield and removes the dome.
  b.phase = "brawl"; b.thrownZone = g.slowZones[0]; b.hasShield = false;
  g.slowZones[0].dead = true;
  b.superThink(1 / 60, g);
  assert.strictEqual(b.hasShield, true);
  assert.strictEqual(g.shields[0].dead, true);
});

test("super bulwark hp uses its SUPER_TUNE override (2.5x)", () => {
  const b = JH.makeEnemy("bulwark", 0, 0);
  b.makeSuper();
  assert.strictEqual(b.maxHp, Math.round(JH.ENEMIES.bulwark.hp * 2.5));
});

test("sigil pick: takes the boon, refreshes stats, clears the beat", () => {
  global.window.JH.Benedictions.reset();
  const g = makeThinkGame(60, 40);
  g.sigils = [new JH.Sigil(60, 40, { id: "bedrock", deepen: false }),
              new JH.Sigil(120, 40, { id: "overflow", deepen: false })];
  const hpBefore = g.player.stats.maxHp;
  g.sigils[0].pick(g);
  assert.strictEqual(global.window.JH.Benedictions.rank("bedrock"), 1);
  assert.ok(g.player.stats.maxHp > hpBefore, "stat boon applied immediately");
  assert.ok(g.sigils.every((s) => s.dead), "picking one clears the offer");
  global.window.JH.Benedictions.reset();
});

test("waveCleared_: Absolution + sigil beat land before the quake cutscene return", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("absolution");
  const prevDoc = global.document, prevMusic = JH.Music;
  global.document = { getElementById: () => ({ classList: { add() {}, remove() {} }, textContent: "" }) };
  JH.Music = { setTrack() {} };
  const g = Object.create(JH.Game);
  g.player = makePlayer(); g.player.hp = 10;
  g.waveIndex = JH.LEVEL1.waves.findIndex((w) => w.bossType === "quake");
  g.beneUsedOnce = {}; g.sigils = [];
  g.waveCleared_();
  assert.strictEqual(g.state, "cutscene", "quake clear still enters its cutscene");
  assert.strictEqual(g.player.hp, 35, "rank-I Absolution healed 25 despite the early return");
  assert.ok(g.sigils.length > 0, "boss beat still offers sigils despite the early return");
  JH.Music = prevMusic;
  if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
  B.reset();
});

test("waveCleared_: final (Slayer) wave clear keeps its sigil beat — cutscene, not a synchronous win()", () => {
  const B = global.window.JH.Benedictions;
  B.reset();
  const prevDoc = global.document, prevMusic = JH.Music;
  global.document = { getElementById: () => ({ classList: { add() {}, remove() {} }, textContent: "" }) };
  JH.Music = { setTrack() {} };
  const g = Object.create(JH.Game);
  g.player = makePlayer();
  g.waveIndex = JH.LEVEL1.waves.findIndex((w) => w.bossType === "slayer");
  assert.strictEqual(g.waveIndex, JH.LEVEL1.waves.length - 1, "Slayer is the final wave (premise)");
  g.beneUsedOnce = {}; g.sigils = [];
  let won = false;
  g.win = () => { won = true; };
  g.waveCleared_();
  assert.strictEqual(g.state, "cutscene", "slayer clear enters its cutscene");
  assert.strictEqual(g.cutscene && g.cutscene.who, "slayer");
  assert.strictEqual(won, false, "win() never fires synchronously on the slayer clear");
  assert.ok(g.sigils.length > 0, "final boss clear still offers sigils");
  JH.Music = prevMusic;
  if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
  B.reset();
});

test("waveCleared_: vendor spawns every 3rd tracked clear, resets the counter", () => {
  const B = global.window.JH.Benedictions;
  B.reset();
  const prevDoc = global.document, prevMusic = JH.Music;
  global.document = { getElementById: () => ({ classList: { add() {}, remove() {} }, textContent: "" }) };
  JH.Music = { setTrack() {} };
  const g = Object.create(JH.Game);
  g.player = makePlayer();
  g.banner = () => {}; g.bannerTimer = 0;
  g.beneUsedOnce = {}; g.sigils = [];
  g.shopNpc = null;
  g.clearsSinceVendor = 1;              // matches startGame's seed
  g.waveIndex = 0;                      // plain "WAVE 1" — not boss/set-piece
  g.waveCleared_();
  assert.strictEqual(g.shopNpc, null, "no vendor after the 1st clear");
  assert.strictEqual(g.clearsSinceVendor, 2);

  g.waveIndex = 1;                      // 2nd clear — counter hits 3, vendor due
  g.waveCleared_();
  assert.ok(g.shopNpc, "vendor spawns on the 3rd tracked clear");
  assert.strictEqual(g.clearsSinceVendor, 0, "counter resets on spawn");

  JH.Music = prevMusic;
  if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
  B.reset();
});

// ---- Scald status ----

test("applyScald ticks damage over its duration and expires", () => {
  const g = makeThinkGame(400, 40);
  const m = new JH.Enemy("mook", 100, 40);
  m.applyScald(4, 2);
  const hp0 = m.hp;
  m.update(1, g);
  assert.ok(m.hp < hp0 && m.hp > hp0 - 6, "roughly 4 dmg over 1s");
  m.update(1.5, g);
  assert.strictEqual(m.scaldT, 0);
});

test("Scalding Faith: full-pressure spray applies scald", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("scalding_faith");
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater;   // full pressure tier (dmgScale 1.2)
  p.facing = 1;
  const e = new JH.Enemy("mook", p.x + 30, p.y);
  g.enemies = [e];
  p.doSpray(0.05, g);
  assert.ok(e.scaldT > 0, "full-pressure hit under Scalding Faith applies scald");
  B.reset();
});

// ---- Benedictions: Backdraft + Ash Walk ----

test("Backdraft: dashing through an enemy applies Scald", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("backdraft");
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  const e = new JH.Enemy("mook", p.x + 2, p.y);   // overlapping Jon's body
  g.enemies = [e];
  sim.In._keys.right = true;
  sim.In._keys.dash = true; sim.frame(16);
  p.update(0.016, g);
  assert.ok(p.dashTimer > 0, "dash fired");
  assert.ok(e.scaldT > 0, "enemy overlapped by the dash is scalded");
  B.reset();
});

test("Ash Walk: walking a ready patch douses it instantly and arms the cooldown", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("ash_walk");
  const g = makeThinkGame(100, 40);   // player standing at the patch center
  const p = new JH.FirePatch(100, 40, 24, 3);
  p.update(1 / 60, g);
  assert.strictEqual(p.dead, true, "douse extinguishes the patch immediately");
  assert.ok(g.player.douseCdT > 0, "cooldown armed after the douse");
  assert.strictEqual(g.player.burnStacks, 0, "first-burn immunity: no stack landed either");

  const p2 = new JH.FirePatch(100, 40, 24, 3);
  p2.update(1 / 60, g);
  assert.strictEqual(p2.dead, false, "a second patch within the cooldown is not doused");
  assert.strictEqual(g.player.burnStacks, 0, "first contact on this fresh patch is still free");
  p2.update(1 / 60, g);   // still standing in the same patch: the free stack is already spent
  assert.ok(g.player.burnStacks > 0, "immunity is once per patch — the next tick burns");

  // The free token must NOT burn remotely: a patch ticking while the player
  // is far away keeps its token for the actual first contact.
  const gFar = makeThinkGame(400, 40);             // player far from the patch
  const pFar = new JH.FirePatch(100, 40, 24, 3);
  gFar.player.douseCdT = 99;                       // isolate the immunity path
  pFar.update(1 / 60, gFar);                       // remote tick — token unspent
  gFar.player.x = 100;                             // NOW step in
  pFar.update(1 / 60, gFar);
  assert.strictEqual(gFar.player.burnStacks, 0, "first real contact is still free after remote ticks");

  // Rank II: shorter cooldown and a bigger pop (10 dmg vs 6).
  B.take("ash_walk");                              // rank 2
  const g2 = makeThinkGame(100, 40);
  const e = new JH.Enemy("mook", 100, 40);         // standing in the patch
  g2.enemies = [e];
  const hp0 = e.hp;
  const p3 = new JH.FirePatch(100, 40, 24, 3);
  p3.update(1 / 60, g2);
  assert.strictEqual(p3.dead, true, "rank-II douse still extinguishes");
  assert.strictEqual(hp0 - e.hp, 10, "rank-II pop deals 10 to enemies in the footprint");
  assert.ok(g2.player.douseCdT <= 6, "rank-II cooldown is the shorter 6s");
  B.reset();
});

// ---- Benedictions: Earth (Aftershock, Landslide) ----

test("Aftershock: an enemy slammed into the arena wall takes wall-slam damage", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("aftershock");
  const g = makeThinkGame(1000, 40);   // player far off-screen — chase moves toward the wall, not away
  const m = new JH.Enemy("mook", g.bounds.maxX - 2, 40);
  m.spawnGrace = 0;
  m.knockVX = 200;                     // strong knockback, headed at the wall
  g.enemies = [m];
  const hp0 = m.hp;
  m.update(0.05, g);
  assert.strictEqual(m.x, g.bounds.maxX, "clamped at the arena edge");
  assert.ok(m.hp < hp0, "wall slam damage landed");
  B.reset();
});

test("Landslide: an overlapping enemy under knockback batters the enemy next to it", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("landslide");
  const g = makeThinkGame(1000, 40);   // player far off — no melee/contact interference
  const slammed = new JH.Enemy("mook", 100, 40);
  const victim = new JH.Enemy("mook", 102, 40);   // overlapping the slammed enemy
  slammed.spawnGrace = 0; victim.spawnGrace = 0;
  slammed.knockVX = 200;               // strong knockback triggers the landslide check
  g.enemies = [slammed, victim];
  const hp0 = victim.hp;
  slammed.update(0.016, g);
  assert.ok(victim.hp < hp0, "overlapping enemy takes landslide damage");

  // Rank II: staggers the victim unconditionally — no wall-slam-stagger
  // capstone required (that pillar perk is a separate, independently-consumed
  // effect applied elsewhere).
  B.take("landslide");   // rank 2
  assert.ok(!g.player.stats.wallSlamStagger, "capstone not owned in this test");
  victim._lsCdT = 0;   // clear the per-victim tag set by the first update() above
  victim.windTimer = 0.5; victim.state = "wind"; victim.cdTimer = 0;
  slammed.update(0.016, g);
  assert.strictEqual(victim.windTimer, 0, "windup cancelled by the stagger");
  assert.strictEqual(victim.state, "idle");
  assert.ok(victim.cdTimer >= 0.6, "stagger cooldown applied");
  B.reset();
});

test("Bedrock Vigor: taking a hit grants a 3s +20% knockback window", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("bedrock");
  const p = makePlayer();
  const g = { particles: [], audio: { play() {} }, shake() {}, hitStop() {} };
  assert.strictEqual(p.vigorT, 0);
  p.takeHit(10, g, p.x - 10);
  assert.strictEqual(p.vigorT, 3, "landing a hit arms the vigor window");
  B.reset();
});

test("Bedrock Vigor: no window without the benediction", () => {
  const B = global.window.JH.Benedictions;
  B.reset();
  const p = makePlayer();
  const g = { particles: [], audio: { play() {} }, shake() {}, hitStop() {} };
  p.takeHit(10, g, p.x - 10);
  assert.strictEqual(p.vigorT, 0, "no bedrock owned — no vigor window");
});

// ---- Benedictions: Air (Eye of the Storm, Slipstream) ----

test("Eye of the Storm: takeHit no-ops while stormT is active, and consumes no HP", () => {
  const p = makePlayer();
  const g = { particles: [], audio: { play() {} }, shake() {}, hitStop() {} };
  p.stormT = 1;
  const hp0 = p.hp;
  p.takeHit(20, g, p.x - 10);
  assert.strictEqual(p.hp, hp0, "storm window blocks the hit entirely");
  assert.ok(p.invulnTimer > 0, "a brief invuln follows the storm dodge, like a normal dodge");
});

test("Slipstream: freeSprayT skips the water drain in doSpray", () => {
  const g = makeThinkGame(60, 40);
  const p = makePlayer();
  p.freeSprayT = 0.5;
  const water0 = p.water;
  p.doSpray(0.1, g);
  assert.strictEqual(p.water, water0, "spray drains no water while freeSprayT is active");
});

// ---- Benedictions: duos (Steam Sermon, Firestorm) ----

test("Steam Sermon: spraying a fire patch also vents steam damage onto an enemy standing in it", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("steam_sermon");
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater;
  p.facing = 1;
  const fp = new JH.FirePatch(p.x + 30, p.y, 24, 3);
  g.firePatches = [fp];
  const e = new JH.Enemy("mook", fp.x, fp.y);   // standing in the patch
  g.enemies = [e];
  const hp0 = e.hp;
  p.doSpray(0.1, g);
  assert.ok(fp.sprayProgress > 0, "spray still advances the patch's extinguish timer");
  assert.ok(e.hp < hp0, "steam damage landed on the enemy standing in the sprayed patch");
  B.reset();
});

test("Firestorm: a friendly fire patch damages an enemy inside it but never burns the player", () => {
  const g = makeThinkGame(100, 40);   // player standing at the patch center
  const fp = new JH.FirePatch(100, 40, 24, 3, { friendly: true });
  const e = new JH.Enemy("mook", 100, 40);
  g.enemies = [e];
  const hp0 = e.hp;
  fp.update(0.1, g);
  assert.ok(e.hp < hp0, "enemy standing in the friendly patch takes damage");
  assert.strictEqual(g.player.burnStacks, 0, "the player standing in the same patch is never burned");
  assert.strictEqual(fp.sizzled, false, "friendly patches never run the player-facing sizzle/burn logic");
  // Wall-clock expiry: nobody sprays a harmless patch, so it must die on time.
  fp.update(3.1, g);                          // pushes fp.t past extinguishDur (3)
  assert.strictEqual(fp.dead, true, "friendly patch expires on wall-clock time without being sprayed");
});

// ---- Benedictions: Legendaries ----

test("Standing Stone: braced stance eats knockback but damage still lands", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("standing_stone");
  const p = makePlayer();
  p.stillT = 1;   // past the 0.5s stationary threshold
  const g = { particles: [], audio: { play() {} }, shake() {}, hitStop() {} };
  const hp0 = p.hp;
  p.takeHit(20, g, p.x - 10);
  assert.strictEqual(p.hp, hp0 - 20, "damage still lands");
  assert.strictEqual(p.knockVX, 0, "no knockback while braced and still");
  B.reset();
});

test("Bushfire: scald spreads once to a nearby enemy", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("bushfire");
  const g = makeThinkGame(400, 40);   // player kept well away from the mooks
  const m1 = new JH.Enemy("mook", 100, 40);
  const m2 = new JH.Enemy("mook", 130, 40);   // 30px away — within the 40px spread radius
  g.enemies = [m1, m2];
  m1.applyScald(4, 2);
  m1.update(1 / 60, g);
  assert.ok(m1.scaldT > 0, "source keeps burning");
  assert.ok(m2.scaldT > 0, "nearby enemy catches the spread");
  B.reset();
});

test("Whirlwind Walk: dashing near a live ember destroys it", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("whirlwind_walk");
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  const em = new JH.Ember(p.x + 2, p.y, 10, 0, 0, 10, {});
  g.embers = [em];
  sim.In._keys.right = true;
  sim.In._keys.dash = true; sim.frame(16);
  p.update(0.016, g);
  assert.ok(p.dashTimer > 0, "dash fired");
  assert.strictEqual(em.dead, true, "ember destroyed by the dash sweep");
  B.reset();
});

test("Whirlwind Walk: non-projectile embers riders (FireRing) survive the sweep", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("whirlwind_walk");
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  const ring = new JH.FireRing(p.x + 2, p.y, { maxR: 60, speed: 40, dmg: 10 });
  g.embers = [ring];
  sim.In._keys.right = true;
  sim.In._keys.dash = true; sim.frame(16);
  p.update(0.016, g);
  assert.ok(p.dashTimer > 0, "dash fired");
  assert.strictEqual(ring.dead, false, "boss pattern untouched — sweep is isProjectile-only");
  B.reset();
});

test("super bulwark recovers its shield when the lob dies mid-flight", () => {
  const g = makeThinkGame(200, 40);
  const b = JH.makeEnemy("bulwark", 60, 40);
  b.makeSuper();
  b.phase = "brawl"; b.hasShield = false;
  b.lob = { dead: true };   // destroyed before landing — no zone, no dome
  b.superThink(1 / 60, g);
  assert.strictEqual(b.hasShield, true, "shield reclaimed despite the lob never landing");
  assert.strictEqual(b.phase, "approach", "brawl phase exits instead of locking forever");
  assert.strictEqual(b.lob, null, "stale lob reference cleared");
});

// ---- Relics: runtime effect hooks ----

test("Brass Nozzle: non-pierce stream also hits the next-closest enemy in arc", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  const near = new JH.Enemy("mook", p.x + 20, p.y);
  const far  = new JH.Enemy("mook", p.x + 40, p.y);
  g.enemies = [far, near];   // order shouldn't matter — nearest is still the primary blocker

  // Without the relic: only the closest (blocker) takes damage.
  const hpNear0 = near.hp, hpFar0 = far.hp;
  p.doSpray(0.05, g);
  assert.ok(near.hp < hpNear0, "closest enemy always hit");
  assert.strictEqual(far.hp, hpFar0, "no relic: second enemy in line is untouched");

  // With the relic: the next-closest also takes damage.
  g.relics = { brass_nozzle: true };
  const hpFar1 = far.hp;
  p.doSpray(0.05, g);
  assert.ok(far.hp < hpFar1, "Brass Nozzle: second-closest enemy also hit");
});

test("Brass Nozzle: never promotes a target past an active dome blocker (regression)", () => {
  const g = makeThinkGame(60, 40);
  g.relics = { brass_nozzle: true };
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;   // long reach — the arc spans well past the dome
  // Dome (r 58) between Jon and the mook; Jon outside it, mook beyond its far edge.
  g.shields = [new JH.DeployedShield(p.x + 100, p.y, null)];
  const beyond = new JH.Enemy("mook", p.x + 250, p.y);
  g.enemies = [beyond];
  const hp0 = beyond.hp;
  p.doSpray(0.05, g);
  assert.strictEqual(beyond.hp, hp0, "dome stops the stream — no second target promoted past it");
});

test("Brass Nozzle: enemy blocker with a dome behind it — second target can't sit past the dome", () => {
  const g = makeThinkGame(60, 40);
  g.relics = { brass_nozzle: true };
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;
  g.shields = [new JH.DeployedShield(p.x + 100, p.y, null)];   // dome near edge ~30px out
  const near   = new JH.Enemy("mook", p.x + 20, p.y);    // in front of the dome — the blocker
  const beyond = new JH.Enemy("mook", p.x + 250, p.y);   // past the dome's far edge
  g.enemies = [near, beyond];
  const hpNear0 = near.hp, hpBeyond0 = beyond.hp;
  p.doSpray(0.05, g);
  assert.ok(near.hp < hpNear0, "enemy in front of the dome still takes the stream");
  assert.strictEqual(beyond.hp, hpBeyond0, "second target is never promoted past the dome");
});

test("Dowsing Rod: doubles the pickup magnet radius; water cans give 50% more", () => {
  const pull = new JH.Pickup("water_can", 0, 0, 10);
  const g = { player: { x: 45, y: 0 }, lootVacuumT: 0 };   // 45px away: outside base 30, inside relic 60
  const x0 = pull.x;
  pull.update(1 / 60, g);
  assert.strictEqual(pull.x, x0, "outside the base 30px radius: no pull");

  g.relics = { dowsing_rod: true };
  pull.update(1 / 60, g);
  assert.notStrictEqual(pull.x, x0, "Dowsing Rod: pulled in from 45px away");

  const p = makePlayer();
  p.water = 0;
  const can = new JH.Pickup("water_can", p.x, p.y, 10);
  can.collect({ player: p, audio: { play() {} }, particles: [], relics: { dowsing_rod: true } });
  assert.strictEqual(p.water, 15, "Dowsing Rod: water_can value x1.5 (10 -> 15)");
});

test("Spigot Key: hydrant contact arms a 15s window; doSpray deals +10% while it's live", () => {
  const p = makePlayer();
  p.facing = 1;
  const g = { hydrants: [{ x: p.x, y: p.y, t: 0 }], relics: { spigot_key: true },
    particles: [], bounds: { minX: 0, maxX: 480 }, input: { held: () => false, pressed: () => false, buffered: () => false, consume() {} } };
  // Drive just the hydrant-proximity slice of Player.update via a direct call
  // to the same logic: assert the flag through a real update() tick.
  p.update(1 / 60, g);
  assert.strictEqual(p.spigotT, 15, "standing at a hydrant arms Spigot Key's window");

  const g2 = makeThinkGame(60, 40);
  const e = new JH.Enemy("mook", p.x + 20, p.y);
  g2.player = p; g2.enemies = [e]; g2.relics = { spigot_key: true };
  p.water = p.stats.maxWater;
  const hpBefore = e.hp;
  p.doSpray(0.05, g2);
  const dmgWithBuff = hpBefore - e.hp;

  p.spigotT = 0;
  const e2 = new JH.Enemy("mook", p.x + 20, p.y);
  g2.enemies = [e2];
  p.water = p.stats.maxWater;
  const hpBefore2 = e2.hp;
  p.doSpray(0.05, g2);
  const dmgWithoutBuff = hpBefore2 - e2.hp;
  assert.ok(Math.abs(dmgWithBuff - dmgWithoutBuff * 1.1) < 1e-6, "spigotT active: +10% spray dmg");
});

test("shopSelectables lists the current relic stock; buyRelic spends suds, flags ownership, and clears stock", () => {
  const g = Object.create(JH.Game);
  g.player = makePlayer();
  g.player.suds = 300;
  g.relics = {};
  g.relicStock = ["brass_nozzle", "spigot_key"];
  const sel = g.shopSelectables();
  const relicRows = sel.filter((s) => s.kind === "relic");
  assert.deepStrictEqual(relicRows.map((r) => r.id), ["brass_nozzle", "spigot_key"]);

  assert.strictEqual(g.buyRelic("dowsing_rod"), false, "not in stock: rejected");
  const cost = JH.RELICS.find((r) => r.id === "brass_nozzle").cost;
  const before = g.player.suds;
  assert.strictEqual(g.buyRelic("brass_nozzle"), true);
  assert.strictEqual(g.player.suds, before - cost);
  assert.strictEqual(g.relics.brass_nozzle, true);
  assert.ok(!g.relicStock.includes("brass_nozzle"), "bought relic leaves the stock");
  assert.strictEqual(g.buyRelic("brass_nozzle"), false, "already owned: rejected");
});

test("Punch Card discounts a relic purchase by 20%", () => {
  const g = Object.create(JH.Game);
  g.player = makePlayer();
  g.relics = { punch_card: true };
  const def = JH.RELICS.find((r) => r.id === "spigot_key");
  g.player.suds = Math.round(def.cost * 0.8);   // exactly the discounted price, not the sticker price
  g.relicStock = ["spigot_key"];
  assert.strictEqual(g.buyRelic("spigot_key"), true, "discounted price is enough to buy");
  assert.strictEqual(g.player.suds, 0);
});

test("Prayer Bead: a boss's first enrage flip grants a pressure buff exactly once", () => {
  const g = makeThinkGame(400, 40);   // far away so the boss doesn't commit to an attack this tick
  g.relics = { prayer_bead: true };
  const boss = new JH.Boss(60, 40, Object.assign({}, JH.BOSS, { enrageAt: 0.99 }), "boss");
  boss.hp = boss.maxHp * 0.5;         // already below the (high) enrageAt threshold
  g.player.pressureBuffT = 0;
  boss.think(1 / 60, g);
  assert.strictEqual(g.player.pressureBuffT, 4, "first enrage tick grants the buff");
  g.player.pressureBuffT = 0;         // simulate the buff wearing off
  boss.think(1 / 60, g);
  assert.strictEqual(g.player.pressureBuffT, 0, "latch prevents re-granting on subsequent enraged frames");
});

test("dropLoot: dryStreak increments on a null roll and resets once an item drops", () => {
  const g = Object.create(JH.Game);
  g.player = makePlayer();
  g.pickups = []; g.deferredQueue = []; g.dryStreak = 0;
  const mook = new JH.Enemy("mook", 0, 0);   // dropMult 1 -> t.water = 0.45 cumulative item chance

  const origRandom = Math.random;
  try {
    Math.random = () => 0.99;   // above every threshold: no item, streak-only miss
    g.dropLoot(mook);
    assert.strictEqual(g.dryStreak, 1);
    g.dropLoot(mook);
    assert.strictEqual(g.dryStreak, 2);

    Math.random = () => 0;      // below every threshold: guaranteed health drop
    g.dropLoot(mook);
    assert.strictEqual(g.dryStreak, 0, "a landed drop resets the streak");
    assert.ok(g.pickups.some((p) => p.kind === "health"));
  } finally {
    Math.random = origRandom;
  }
});

test("death wash: benedictions clear, levels/signatures survive respawn refresh", () => {
  JH.Upgrades.reset(); JH.Benedictions.reset();
  JH.Upgrades.owned = { sig_marshal: true };
  JH.Upgrades.levelCount = 4;
  JH.Benedictions.take("bedrock");
  const before = JH.Upgrades.computeStats(JH.Upgrades.owned);
  JH.Benedictions.reset();                             // what respawnFromChurch does
  const after = JH.Upgrades.computeStats(JH.Upgrades.owned);
  assert.strictEqual(before.maxHp - after.maxHp, 40);  // bedrock gone
  assert.ok(after.sprayRange > JH.PLAYER.sprayRange);  // signature survived
  JH.Upgrades.reset(); JH.Benedictions.reset();
});
