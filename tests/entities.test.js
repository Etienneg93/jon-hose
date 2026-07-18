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
require("../js/game.js");
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

test("Player exposes no cut jump or melee state", () => {
  const p = makePlayer();
  for (const key of ["jumpV", "meleeDamage", "meleeRange", "meleeCd", "meleeKnock"])
    assert.ok(!Object.hasOwn(JH.PLAYER, key), key + " must not return to player config");
  for (const key of ["meleeTimer", "meleeCdTimer", "meleeFxTimer"])
    assert.ok(!Object.hasOwn(p, key), key + " must not return to Player state");
  assert.strictEqual(typeof p.doMelee, "undefined");
  assert.strictEqual(typeof p.drawMeleeArc, "undefined");
});

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

test("Player.applyBurn: burnGraceT is exactly stats.invuln, +socksGraceBonus with Asbestos Socks", () => {
  const p = makePlayer();
  p.applyBurn(1);
  assert.strictEqual(p.burnGraceT, p.stats.invuln, "no socks: grace window is exactly stats.invuln");

  const p2 = makePlayer();
  const realGame = JH.Game;
  JH.Game = { relics: { asbestos_socks: true } };   // applyBurn reads JH.Game.relics (known idiom)
  try {
    p2.applyBurn(1);
    assert.strictEqual(p2.burnGraceT, p2.stats.invuln + JH.RELIC_TUNE.socksGraceBonus,
      "socks owned: grace window is exactly stats.invuln + socksGraceBonus");
  } finally { JH.Game = realGame; }
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

test("damage-number tally: accrues on damage, holds, then resets after the gap", () => {
  const e = JH.makeEnemy("mook", 100, 40);
  const g = makeThinkGame(300, 40);   // player far away so think() is a no-op here
  g.showDmgNumbers = true; g.float = () => {};
  e.takeDamage(10, g, 1, 0);
  assert.strictEqual(e._dmgAccum, 10, "first hit starts the tally");
  assert.ok(e._dmgPunchT > 0, "each hit arms the tick-punch");
  e.takeDamage(5, g, 1, 0, true);   // crit hit
  assert.strictEqual(e._dmgAccum, 15, "further hits accumulate the running total");
  assert.ok(e._dmgHoldT > 0, "each hit refreshes the hold timer");
  assert.ok(e._dmgCritT > 0, "a crit hit arms the crit-flash window");
  // Let the hold elapse via update — the tally resets for a fresh session.
  e._dmgHoldT = 0.01;
  e.update(0.05, g);
  assert.strictEqual(e._dmgAccum, 0, "tally resets once the hold gap passes");
});

test("damage-number tally: no accrual when the dev toggle is off", () => {
  const e = JH.makeEnemy("mook", 100, 40);
  e.takeDamage(10, { showDmgNumbers: false }, 1, 0);
  assert.ok(!e._dmgAccum, "toggle off: no tally state churned");
});

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

// Act-gating for the ex-signature Hydro Lance moved with it into JH.RELICS
// (relic.minAct) — see tests/relics.test.js; the NODES-tier gate this used
// to test no longer exists (NODES is empty, below).

test("Upgrades NODES: empty, signatures retired to JH.RELICS", () => {
  assert.strictEqual(JH.Upgrades.nodes.length, 0);
  assert.deepStrictEqual(JH.Upgrades.branches, []);
  assert.strictEqual(JH.Upgrades.repeatables.length, 1);
  assert.strictEqual(JH.Upgrades.repeatables[0].id, "ov_dmg");
  ["pw1", "pw2", "pw3", "rc1", "rc2", "rc3", "tk1", "tk2", "tk3",
   "mb1", "mb2", "mb3", "vt1", "vt2", "vt3", "ov_water", "ov_hp",
   "sig_dash", "sig_marshal", "sig_lance"].forEach((id) => {
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

test("Squeegee: a kill standing in a fire patch douses it; owned only", () => {
  const g = makeKillGame();
  g.relics.squeegee = true;
  const onPatch = { x: 0, y: 0, dead: false, sprayProgress: 0, extinguishDur: 5,
    footprint: () => ({ rx: 20, ry: 8 }) };
  g.firePatches = [onPatch];
  JH.Game.onEnemyKilled.call(g, { x: 0, y: 0 });
  assert.strictEqual(onPatch.sprayProgress, onPatch.extinguishDur, "kill on the patch snuffs it");

  const farPatch = { x: 0, y: 0, dead: false, sprayProgress: 0, extinguishDur: 5,
    footprint: () => ({ rx: 20, ry: 8 }) };
  g.firePatches = [farPatch];
  JH.Game.onEnemyKilled.call(g, { x: 200, y: 0 });
  assert.strictEqual(farPatch.sprayProgress, 0, "kill far from the patch leaves it lit");

  const g2 = makeKillGame();   // no relic: never touches the patch
  const noRelicPatch = { x: 0, y: 0, dead: false, sprayProgress: 0, extinguishDur: 5,
    footprint: () => ({ rx: 20, ry: 8 }) };
  g2.firePatches = [noRelicPatch];
  JH.Game.onEnemyKilled.call(g2, { x: 0, y: 0 });
  assert.strictEqual(noRelicPatch.sprayProgress, 0, "no Squeegee: patch untouched");
});

test("Squeegee: a dead patch on the kill's footprint is skipped; two overlapping live patches both snuff", () => {
  const g = makeKillGame();
  g.relics.squeegee = true;
  const deadPatch = { x: 0, y: 0, dead: true, sprayProgress: 0, extinguishDur: 5,
    footprint: () => ({ rx: 20, ry: 8 }) };
  const liveElsewhere = { x: 200, y: 0, dead: false, sprayProgress: 0, extinguishDur: 5,
    footprint: () => ({ rx: 20, ry: 8 }) };
  g.firePatches = [deadPatch, liveElsewhere];
  JH.Game.onEnemyKilled.call(g, { x: 0, y: 0 });
  assert.strictEqual(deadPatch.sprayProgress, 0, "dead patch untouched even though the kill sits on its footprint");
  assert.strictEqual(liveElsewhere.sprayProgress, 0, "live patch out of range is untouched");

  const g2 = makeKillGame();
  g2.relics.squeegee = true;
  const patchA = { x: 0, y: 0, dead: false, sprayProgress: 0, extinguishDur: 5,
    footprint: () => ({ rx: 20, ry: 8 }) };
  const patchB = { x: 5, y: 0, dead: false, sprayProgress: 0, extinguishDur: 4,
    footprint: () => ({ rx: 20, ry: 8 }) };   // overlaps the same kill spot
  g2.firePatches = [patchA, patchB];
  JH.Game.onEnemyKilled.call(g2, { x: 0, y: 0 });
  assert.strictEqual(patchA.sprayProgress, patchA.extinguishDur, "first overlapping patch is snuffed");
  assert.strictEqual(patchB.sprayProgress, patchB.extinguishDur, "second overlapping patch is also snuffed, not just the first");
});

test("Rosary Chain: banks +1 dmg per combo kill up to cap; chain break zeroes it; absent relic stays 0", () => {
  const g = makeKillGame();
  g.relics.rosary_chain = true;
  for (let i = 0; i < 12; i++) JH.Game.onEnemyKilled.call(g, null);
  assert.strictEqual(g.rosaryBonus, JH.RELIC_TUNE.rosaryCap, "banked bonus caps at rosaryCap");

  JH.Game.decayCombo.call(g, JH.COMBO_WINDOW + 1);   // force the chain to expire
  assert.strictEqual(g.combo, 0, "combo resets on expiry");
  assert.strictEqual(g.rosaryBonus, 0, "banked bonus clears when the chain breaks");

  const g2 = makeKillGame();
  for (let i = 0; i < 12; i++) JH.Game.onEnemyKilled.call(g2, null);
  assert.strictEqual(g2.rosaryBonus || 0, 0, "no relic, no bonus");
});

test("spawnGushPulse: ring dmg/kb reflect owned relics; neither relic spawns no ring", () => {
  const g = { pulseRings: [], relics: { backdraft_valve: true, big_spigot: true },
    player: { x: 50, y: 60 }, audio: { play() {} } };
  JH.Game.spawnGushPulse.call(g);
  assert.strictEqual(g.pulseRings.length, 1);
  assert.strictEqual(g.pulseRings[0].dmg, JH.RELIC_TUNE.spigotDamage);
  assert.strictEqual(g.pulseRings[0].kb, JH.RELIC_TUNE.valveKnockback);

  const g2 = { pulseRings: [], relics: {}, player: { x: 0, y: 0 }, audio: { play() {} } };
  JH.Game.spawnGushPulse.call(g2);
  assert.strictEqual(g2.pulseRings.length, 0, "no relic, no ring");
});

test("spawnGushPulse: valve alone gives knockback with no damage; spigot alone gives damage with no knockback", () => {
  const T = JH.RELIC_TUNE;
  const gValve = { pulseRings: [], relics: { backdraft_valve: true }, player: { x: 10, y: 20 }, audio: { play() {} } };
  JH.Game.spawnGushPulse.call(gValve);
  assert.strictEqual(gValve.pulseRings.length, 1);
  assert.strictEqual(gValve.pulseRings[0].dmg, 0, "valve-only: no damage");
  assert.strictEqual(gValve.pulseRings[0].kb, T.valveKnockback, "valve-only: full knockback");

  const gSpigot = { pulseRings: [], relics: { big_spigot: true }, player: { x: 10, y: 20 }, audio: { play() {} } };
  JH.Game.spawnGushPulse.call(gSpigot);
  assert.strictEqual(gSpigot.pulseRings.length, 1);
  assert.strictEqual(gSpigot.pulseRings[0].dmg, T.spigotDamage, "spigot-only: full damage");
  assert.strictEqual(gSpigot.pulseRings[0].kb, 0, "spigot-only: no knockback");
});

test("updatePulseRings: rim-is-hitbox — near enemy hit exactly once, far enemy untouched, patch doused", () => {
  const T = JH.RELIC_TUNE;
  const near = new JH.Enemy("mook", 50 + (T.pulseRadius - 30), 60);   // inside pulseRadius
  const far = new JH.Enemy("mook", 50 + T.pulseRadius + 40, 60);      // beyond pulseRadius
  const nearStartHp = near.hp, farStartHp = far.hp;
  const patch = { x: 55, y: 60, dead: false, sprayProgress: 0, extinguishDur: 5 };
  const g = {
    pulseRings: [{ x: 50, y: 60, r: 0, targetR: T.pulseRadius, dur: 0.25, t: 0,
      dmg: T.spigotDamage, kb: T.valveKnockback, douse: true, hit: new Set() }],
    enemies: [near, far], firePatches: [patch],
  };
  for (let i = 0; i < 30; i++) JH.Game.updatePulseRings.call(g, 0.02);   // past full expansion + fade tail
  assert.strictEqual(nearStartHp - near.hp, T.spigotDamage, "near enemy takes exactly one pulse hit");
  assert.notStrictEqual(near.knockVX, 0, "near enemy knocked back");
  assert.strictEqual(far.hp, farStartHp, "far enemy beyond pulseRadius untouched");
  assert.strictEqual(patch.sprayProgress, patch.extinguishDur, "patch inside the ring is doused");
  assert.strictEqual(g.pulseRings.length, 0, "ring is culled after its fade tail");
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
    pickups: [], pulseRings: [], firePatches: [],
    spawnPickup(kind, x, y, value) { this.pickups.push({ kind, x, y, value }); },
    spawnGushPulse() { JH.Game.spawnGushPulse.call(this); },
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

test("onEnemyKilled: boss drops one cross, or two (each worth 1) with Sunday Suit", () => {
  const prevChurch = JH.Church;
  JH.Church = { markBossDefeated() {} };

  const g1 = makeKillGame();
  JH.Game.onEnemyKilled.call(g1, { isBoss: true, type: "boss", x: 10, y: 20 });
  assert.strictEqual(g1.pickups.length, 1);
  assert.strictEqual(g1.pickups[0].value, 1);

  const g2 = makeKillGame();
  g2.relics.sunday_suit = true;
  JH.Game.onEnemyKilled.call(g2, { isBoss: true, type: "boss", x: 10, y: 20 });
  assert.strictEqual(g2.pickups.length, 2, "Sunday Suit drops a second cross");
  assert.strictEqual(g2.pickups[0].value, 1);
  assert.strictEqual(g2.pickups[1].value, 1);

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

// ---- super plunger: telegraphed triple vacuum pull before lunge/latch ----

test("super plunger: regular Plunger windup still resolves straight into lunge (no pull state)", () => {
  const g = makeThinkGame(90, 40);
  const e = JH.makeEnemy("plunger", 60, 40);
  e.spawnGrace = 0; e.windTimer = 0.01; e.state = "wind"; e.aimAng = 0;
  e.think(0.02, g);
  assert.strictEqual(e.state, "lunge", "regular plunger skips straight to lunge, never pull");
});

test("super plunger: windup locks aim then fires exactly 3 pulses over pullWind before lunging", () => {
  const SP = JH.SUPER_PLUNGER;
  const g = makeThinkGame(60, 40);
  const e = JH.makeEnemy("plunger", 200, 40);
  e.makeSuper(); e.spawnGrace = 0;
  e.windTimer = 0.01; e.state = "wind";
  e.think(0.02, g);                              // windup expires -> enters "pull"
  assert.strictEqual(e.state, "pull");
  const lockedAim = e.aimAng;
  const x0 = g.player.x;
  const dt = SP.pullWind / SP.pullPulses;
  for (let i = 0; i < SP.pullPulses; i++) {
    e.think(dt, g);
    assert.strictEqual(e.aimAng, lockedAim, "aim stays locked through the pull");
  }
  assert.strictEqual(e.pulseIdx, SP.pullPulses, "exactly 3 pulses fired");
  assert.strictEqual(e.state, "lunge", "the third pulse ends the windup into the existing lunge");
  assert.strictEqual(g.player.x - x0, SP.pullPulses * SP.pullStep,
    "each of the 3 pulses pulled Jon pullStep toward the Plunger");
});

test("super plunger: 72 consecutive real 1/60 dt steps (float accumulation) still fire exactly 3 pulses and reach lunge", () => {
  // The exact-boundary test above drives dt = pullWind/pullPulses per step,
  // which never touches the float-accumulation path the epsilon guard
  // (entities.js ~6114) exists for. Real gameplay steps at a fixed 1/60,
  // and summing 72 of those via repeated subtraction lands pullT a hair
  // off zero (not exactly 0) — this drives that real path instead.
  const SP = JH.SUPER_PLUNGER;
  const g = makeThinkGame(60, 40);
  const e = JH.makeEnemy("plunger", 200, 40);
  e.makeSuper(); e.spawnGrace = 0;
  e.aimAng = Math.PI; e.state = "pull"; e.pullT = SP.pullWind; e.pulseIdx = 0;
  const x0 = g.player.x;
  for (let i = 0; i < 72; i++) {
    e.think(1 / 60, g);
    assert.ok(e.pulseIdx <= SP.pullPulses, "pulseIdx never overshoots pullPulses off-boundary");
  }
  assert.strictEqual(e.pulseIdx, SP.pullPulses, "exactly 3 pulses fired after 72 real 1/60 steps");
  assert.strictEqual(e.state, "lunge", "the pull-to-lunge transition still lands on the accumulated-float path");
  assert.strictEqual(g.player.x - x0, SP.pullPulses * SP.pullStep,
    "all 3 pulses still pulled Jon pullStep each, off-boundary dt included");
});

test("super plunger pull: a target inside the locked wedge is pulled; behind it is not", () => {
  const SP = JH.SUPER_PLUNGER;
  const gIn = makeThinkGame(140, 40);
  const eIn = JH.makeEnemy("plunger", 200, 40);
  eIn.makeSuper(); eIn.aimAng = Math.PI; eIn.state = "pull"; eIn.pullT = SP.pullWind; eIn.pulseIdx = 0;
  const x0 = gIn.player.x;
  eIn.think(SP.pullWind / SP.pullPulses, gIn);
  assert.ok(gIn.player.x > x0, "inside the wedge: pulled toward the Plunger");

  const gOut = makeThinkGame(260, 40);            // opposite side of the locked aim
  const eOut = JH.makeEnemy("plunger", 200, 40);
  eOut.makeSuper(); eOut.aimAng = Math.PI; eOut.state = "pull"; eOut.pullT = SP.pullWind; eOut.pulseIdx = 0;
  const ox0 = gOut.player.x;
  eOut.think(SP.pullWind / SP.pullPulses, gOut);
  assert.strictEqual(gOut.player.x, ox0, "behind the locked aim: untouched");
});

test("super plunger pull: pulses never change HP or water", () => {
  const SP = JH.SUPER_PLUNGER;
  const g = makeThinkGame(60, 40);
  const e = JH.makeEnemy("plunger", 200, 40);
  e.makeSuper(); e.aimAng = Math.PI; e.state = "pull"; e.pullT = SP.pullWind; e.pulseIdx = 0;
  const hp0 = g.player.hp, w0 = g.player.water;
  const dt = SP.pullWind / SP.pullPulses;
  for (let i = 0; i < SP.pullPulses; i++) e.think(dt, g);
  assert.strictEqual(g.player.hp, hp0, "pull deals no damage");
  assert.strictEqual(g.player.water, w0, "pull does not drain water");
});

test("super plunger: after 3 pulses, the existing lunge resolves along the locked aim and can latch", () => {
  const SP = JH.SUPER_PLUNGER;
  const g = makeThinkGame(60, 40);
  const e = JH.makeEnemy("plunger", 100, 40);
  e.makeSuper(); e.spawnGrace = 0;
  e.aimAng = Math.PI; e.state = "pull"; e.pullT = SP.pullWind; e.pulseIdx = 0;
  const dt = SP.pullWind / SP.pullPulses;
  for (let i = 0; i < SP.pullPulses; i++) e.think(dt, g);
  assert.strictEqual(e.state, "lunge");
  for (let i = 0; i < 300 && e.state === "lunge"; i++) e.think(1 / 60, g);
  assert.strictEqual(e.state, "latch", "the resolved lunge can still latch onto Jon");
});

test("super plunger: dash i-frames dodge a pulse; dash still breaks the eventual latch", () => {
  const SP = JH.SUPER_PLUNGER;
  const g = makeThinkGame(80, 40);
  const e = JH.makeEnemy("plunger", 100, 40);
  e.makeSuper(); e.aimAng = Math.PI; e.state = "pull"; e.pullT = SP.pullWind; e.pulseIdx = 0;
  g.player.dashTimer = 0.1;
  const x0 = g.player.x;
  e.think(SP.pullWind / SP.pullPulses, g);
  assert.strictEqual(g.player.x, x0, "dash i-frames dodge the pull");
  assert.strictEqual(e.pulseIdx, 1, "the pulse still fires/counts, it just whiffs");

  e.state = "latch"; e.latchT = 2; g.player.dashTimer = 0.1;
  e.think(1 / 60, g);
  assert.notStrictEqual(e.state, "latch", "dash pops a super's latch exactly like a regular's");
});

test("super plunger: usingTicket releases when the target dies mid-pull, and on a post-pull lunge miss", () => {
  const SP = JH.SUPER_PLUNGER;
  const g = makeThinkGame(80, 40);
  const e = JH.makeEnemy("plunger", 100, 40);
  e.makeSuper(); e.aimAng = Math.PI; e.state = "pull"; e.pullT = SP.pullWind; e.pulseIdx = 0;
  e.usingTicket = true;
  g.player.alive = false;
  e.think(SP.pullWind / SP.pullPulses, g);
  assert.strictEqual(e.state, "idle", "a dead/interrupted target aborts the pull");
  assert.strictEqual(e.usingTicket, false, "attack ticket released");

  const g2 = makeThinkGame(60, 40);
  const e2 = JH.makeEnemy("plunger", 100, 40);
  e2.makeSuper(); e2.spawnGrace = 0;
  e2.aimAng = Math.PI; e2.state = "pull"; e2.pullT = SP.pullWind; e2.pulseIdx = 0; e2.usingTicket = true;
  g2.player.stats.dodgeChance = 1;
  const dt = SP.pullWind / SP.pullPulses;
  for (let i = 0; i < SP.pullPulses; i++) e2.think(dt, g2);
  assert.strictEqual(e2.state, "lunge");
  for (let i = 0; i < 300 && e2.state === "lunge"; i++) e2.think(1 / 60, g2);
  assert.strictEqual(e2.state, "idle", "dodged lunge off the pull path still aborts");
  assert.strictEqual(e2.usingTicket, false, "ticket released on the miss");
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

test("fuse children spawn with a real contact-timer grace, not just spawnGrace", () => {
  const g = makeThinkGame(400, 40);
  const spawned = [];
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); if (opts && opts.infinite) c.infinite = true; spawned.push(c); return c; };
  const e = JH.makeEnemy("fuse", 100, 40);
  e.makeElite();
  e.die(g);
  const child = spawned[0];
  g.enemies.push(child);
  // The death-burst hop (z=24,vz=90) already keeps contact out of reach for
  // its first ~0.33s via the z-gap check alone, which would mask a missing
  // contactTimer grace. Force the worst case the brief calls out directly:
  // a child already landed and overlapping Jon.
  child.dropping = false; child.z = 0; child.vz = 0;
  g.player.x = child.x; g.player.y = child.y;
  const hp0 = g.player.hp;
  child.update(1 / 60, g);
  child.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0,
    "contact-damage grace blocks the touch on the frames immediately after the death burst");
  // Advance past the 0.5s grace with the overlap held — the gate must not
  // be accidentally permanent; damage lands once contactTimer expires.
  for (let i = 0; i < 40 && g.player.hp === hp0; i++) child.update(1 / 60, g);
  assert.ok(g.player.hp < hp0, "damage lands once the 0.5s grace expires");
});

// ---- super gasbag: Fog of War death burst ----

test("super gasbag pre-vent death: exactly one friendly mega-cloud + two minis", () => {
  const G = JH.SUPER_GASBAG;
  const g = makeThinkGame(400, 40);
  g.stinkClouds = [];
  const spawned = [];
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); if (opts && opts.infinite) c.infinite = true; spawned.push(c); return c; };
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.makeSuper();
  assert.strictEqual(e._vented, false, "premise: never vented");
  e.die(g);
  assert.strictEqual(g.stinkClouds.length, 1, "exactly one mega-cloud");
  assert.strictEqual(g.stinkClouds[0].friendly, true, "pre-vent super death = friendly mega-cloud");
  assert.strictEqual(g.stinkClouds[0].radius, G.megaRadius);
  assert.strictEqual(g.stinkClouds[0].friendlyLife, G.megaFriendlyLife);
  assert.strictEqual(g.stinkClouds[0].friendlyDps, G.megaFriendlyDps);
  assert.strictEqual(spawned.length, G.childCount, "exactly two minis");
});

test("super gasbag post-vent death: exactly one hostile mega-cloud + two minis", () => {
  const G = JH.SUPER_GASBAG;
  const g = makeThinkGame(400, 40);
  g.stinkClouds = [];
  const spawned = [];
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); if (opts && opts.infinite) c.infinite = true; spawned.push(c); return c; };
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.makeSuper();
  e._vented = true;   // already vented once before dying
  e.die(g);
  assert.strictEqual(g.stinkClouds.length, 1, "exactly one mega-cloud, even though a vent already fired");
  assert.strictEqual(g.stinkClouds[0].friendly, false, "post-vent super death = hostile mega-cloud");
  assert.strictEqual(g.stinkClouds[0].radius, G.megaRadius);
  assert.strictEqual(g.stinkClouds[0].life, G.megaLife);
  assert.strictEqual(spawned.length, G.childCount, "exactly two minis");
});

test("super gasbag minis: half base hp, 0.72 body+sprite scale, first-vent delay, never super/elite", () => {
  const G = JH.SUPER_GASBAG;
  const g = makeThinkGame(400, 40);
  g.stinkClouds = [];
  const spawned = [];
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); if (opts && opts.infinite) c.infinite = true; spawned.push(c); return c; };
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.makeSuper();
  e.die(g);
  assert.strictEqual(spawned.length, G.childCount);
  const baseDef = JH.ENEMIES.gasbag;
  for (const child of spawned) {
    assert.strictEqual(child.maxHp, Math.round(baseDef.hp * G.childHpMult));
    assert.strictEqual(child.hp, child.maxHp);
    assert.strictEqual(child.bodyW, Math.round(baseDef.bodyW * G.childScale));
    assert.strictEqual(child.bodyH, Math.round(baseDef.bodyH * G.childScale));
    assert.strictEqual(child.spriteScale, G.childScale);
    assert.ok(child.ventT >= G.childFirstVent, "first vent respects the configured delay");
    assert.strictEqual(child.superElite, undefined, "minis never inherit superElite");
    assert.strictEqual(child.elite, undefined, "minis never inherit elite");
    assert.strictEqual(child.infinite, true, "minis are infinite for drop-budget purposes");
    assert.ok(Math.abs(child.spawnGrace - 0.5) < 1e-9, "0.5s spawn grace");
  }
  // Original def object is untouched (elite/super def-mutation idiom).
  assert.strictEqual(JH.ENEMIES.gasbag.hp, baseDef.hp);
});

test("super gasbag minis: spawn positions clamp to arena/depth bounds", () => {
  const G = JH.SUPER_GASBAG;
  const g = makeThinkGame(400, 40);
  g.stinkClouds = [];
  g.bounds = { minX: 90, maxX: 110 };   // tight band around the death point
  const spawned = [];
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); if (opts && opts.infinite) c.infinite = true; spawned.push(c); return c; };
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.makeSuper();
  e.die(g);
  for (const child of spawned) {
    assert.ok(child.x >= 90 && child.x <= 110, "mini x clamps to bounds");
    assert.ok(child.y >= JH.DEPTH_MIN && child.y <= JH.DEPTH_MAX, "mini y clamps to depth band");
  }
});

test("super gasbag minis: spawn with a real contact-timer grace, not just spawnGrace", () => {
  const g = makeThinkGame(400, 40);
  g.stinkClouds = [];
  const spawned = [];
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); if (opts && opts.infinite) c.infinite = true; spawned.push(c); return c; };
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.makeSuper();
  e.die(g);
  const child = spawned[0];
  g.enemies.push(child);
  // Overlap the player exactly on the mini's spawn point — the worst case
  // the brief calls out (a mini landing ON Jon).
  g.player.x = child.x; g.player.y = child.y;
  const hp0 = g.player.hp;
  child.update(1 / 60, g);
  child.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0,
    "contact-damage grace blocks the touch on the frames immediately after the death burst");
  // Advance past the 0.5s grace with the overlap held — the gate must not
  // be accidentally permanent; damage lands once contactTimer expires.
  for (let i = 0; i < 40 && g.player.hp === hp0; i++) child.update(1 / 60, g);
  assert.ok(g.player.hp < hp0, "damage lands once the 0.5s grace expires");
});

test("super gasbag mini death follows regular Gasbag behavior and never splits again", () => {
  const G = JH.SUPER_GASBAG;
  const g = makeThinkGame(400, 40);
  g.stinkClouds = [];
  const spawned = [];
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); if (opts && opts.infinite) c.infinite = true; spawned.push(c); return c; };
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.makeSuper();
  e.die(g);
  g.stinkClouds.length = 0;   // clear the mega-cloud so only the mini's own burst counts
  const child = spawned[0];
  assert.strictEqual(child._vented, false, "premise: mini never vented");
  child.die(g);
  assert.strictEqual(g.stinkClouds.length, 1, "mini pop-fast still bursts exactly one regular cloud");
  assert.strictEqual(g.stinkClouds[0].friendly, true);
  assert.strictEqual(g.stinkClouds[0].radius, JH.STINK.radius, "mini's own death payload is regular-sized, not another mega");
  assert.strictEqual(spawned.length, G.childCount, "no further minis spawned — recursion never happens");
});

test("regular (non-super) gasbag pop-fast behavior is unchanged by the super-death branch", () => {
  const g = makeThinkGame(400, 40);
  g.stinkClouds = [];
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.die(g);
  assert.strictEqual(g.stinkClouds.length, 1);
  assert.strictEqual(g.stinkClouds[0].friendly, true, "pre-vent regular death = friendly burst");
  assert.strictEqual(g.stinkClouds[0].radius, JH.STINK.radius);
  const g2 = makeThinkGame(400, 40);
  g2.stinkClouds = [];
  const e2 = JH.makeEnemy("gasbag", 100, 40);
  e2._vented = true;
  e2.die(g2);
  assert.strictEqual(g2.stinkClouds.length, 0, "post-vent regular death carries no payload, unchanged");
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

test("super smelt uses its SUPER_TUNE hp override; waterMult stays honest (1)", () => {
  const s = JH.makeEnemy("smelt", 0, 0);
  s.makeSuper();
  assert.strictEqual(s.maxHp, JH.ENEMIES.smelt.hp * JH.SUPER_TUNE.smelt.hp);
  assert.strictEqual(s.def.waterMult, 1, "survivability lives in hp, not a hidden soak");
});

test("hostile fire patches hold full size, fizzle only at end of life, then burn out", () => {
  const g = makeThinkGame(500, 40);   // player far away — no spraying involved
  const fp = new JH.FirePatch(100, 40, 24, 2.2);
  const dt = 1 / 60, F = JH.FIRE;
  const r0 = fp.footprint().r;
  for (let t = 0; t < F.patchMaxLife - F.patchFizzle - 0.1; t += dt) fp.update(dt, g);
  assert.strictEqual(fp.footprint().r, r0, "full size until the fizzle window opens");
  for (let t = 0; t < F.patchFizzle / 2; t += dt) fp.update(dt, g);
  assert.ok(fp.footprint().r < r0, "shrinking inside the fizzle window");
  assert.ok(!fp.dead, "still burning mid-fizzle");
  for (let t = 0; t < F.patchFizzle / 2 + 0.3; t += dt) fp.update(dt, g);
  assert.ok(fp.dead, "burned out after patchMaxLife");
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
  JH.Upgrades.levelCount = 2;                        // first two cycle steps: dmg, water
  const s = JH.Upgrades.computeStats({});
  assert.strictEqual(s.sprayDamage, base.sprayDamage + JH.LEVELS.cycle[0].sprayDamage);
  assert.strictEqual(s.maxWater, base.maxWater + JH.LEVELS.cycle[1].maxWater);
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
  // The thrown dome is FULL size — a super-elite's shield must not read smaller
  // than a regular Bulwark's planted dome (was a half-size 34).
  assert.strictEqual(g.shields[0].radius, JH.ENEMIES.bulwark.domeRadius);
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
  global.document = { getElementById: () => ({ classList: { add() {}, remove() {} }, textContent: "", style: {} }) };
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
  global.document = { getElementById: () => ({ classList: { add() {}, remove() {} }, textContent: "", style: {} }) };
  JH.Music = { setTrack() {} };
  const g = Object.create(JH.Game);
  g.player = makePlayer();
  g.waveIndex = JH.LEVEL1.waves.findIndex((w) => w.bossType === "slayer");
  assert.ok(g.waveIndex >= 0, "Slayer boss wave exists (premise)");
  g.beneUsedOnce = {}; g.sigils = [];
  let won = false;
  g.win = () => { won = true; };
  g.waveCleared_();
  assert.strictEqual(g.state, "cutscene", "slayer clear enters its cutscene");
  assert.strictEqual(g.cutscene && g.cutscene.who, "slayer");
  assert.strictEqual(won, false, "win() never fires synchronously on the slayer clear");
  // The Slayer's benediction is picked in the post-cutscene free-walk; choosing
  // it triggers the escape sequence (startTruckArrival), so the sigils spawn here.
  assert.ok(g.sigils.length > 0, "final boss clear still offers sigils");
  JH.Music = prevMusic;
  if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
  B.reset();
});

test("waveCleared_: vendor spawns every 3rd tracked clear, resets the counter", () => {
  const B = global.window.JH.Benedictions;
  B.reset();
  const prevDoc = global.document, prevMusic = JH.Music;
  global.document = { getElementById: () => ({ classList: { add() {}, remove() {} }, textContent: "", style: {} }) };
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

test("Pressure Sermon: SERMON.charge seconds of spray arms the pip regardless of pressure tier", () => {
  const B = global.window.JH.Benedictions;
  B.reset(); B.take("pressure_sermon");
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater * 0.5;   // MID tier the whole hold — no tier gate
  p.facing = 1;
  const steps = Math.ceil(JH.SERMON.charge / 0.05) + 1;
  for (let i = 0; i < steps; i++) p.doSpray(0.05, g);
  assert.ok(p.sprayHeldT >= JH.SERMON.charge, "held long enough to qualify");
  assert.ok(p.sermonReady, "armed at the charge threshold without full pressure");
  B.reset();
});

test("Pressure Sermon wave: front hits each enemy once with SERMON.dmg, band-gated", () => {
  const C = JH.SERMON;
  const mk = (x, y) => ({ x, y, dead: false, dropping: false, hp: 100,
    takeDamage(d) { this.hp -= d; }, applyKnockback() {} });
  const near = mk(60, 40), deep = mk(60, 40 + C.halfDepth + 5), far = mk(60 + C.range + 50, 40);
  const g = { sermonWaves: [{ x: 20, y: 40, dir: 1, traveled: 0, hit: new Set() }],
              enemies: [near, deep, far] };
  for (let i = 0; i < 120 && g.sermonWaves.length; i++)
    JH.Game.updateSermonWaves.call(g, 1 / 60);
  assert.strictEqual(near.hp, 100 - C.dmg, "in-band enemy hit exactly once");
  assert.strictEqual(deep.hp, 100, "outside the depth band: untouched");
  assert.strictEqual(far.hp, 100, "beyond range: wave dissipated first");
  assert.strictEqual(g.sermonWaves.length, 0, "wave culled at range");
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

test("Brass Nozzle: +10 flat dmg to the primary (blocker) target only; never a second target", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;   // full pressure tier (dmgScale 1.2)
  const near = new JH.Enemy("mook", p.x + 20, p.y);
  const far  = new JH.Enemy("mook", p.x + 40, p.y);
  g.enemies = [far, near];   // order shouldn't matter — nearest is still the primary blocker

  // Without the relic: only the closest (blocker) takes damage.
  const hpNear0 = near.hp, hpFar0 = far.hp;
  p.doSpray(0.05, g);
  const baseDmg = hpNear0 - near.hp;
  assert.ok(baseDmg > 0, "closest enemy always hit");
  assert.strictEqual(far.hp, hpFar0, "second enemy in line is untouched");

  // With the relic: the primary target takes +10 flat dmg (scaled by dmgScale/dt
  // like the base hit); the second-closest is still never touched — no chain promotion.
  g.relics = { brass_nozzle: true };
  const near2 = new JH.Enemy("mook", p.x + 20, p.y);
  const far2  = new JH.Enemy("mook", p.x + 40, p.y);
  g.enemies = [far2, near2];
  const hpNear2 = near2.hp, hpFar2 = far2.hp;
  p.doSpray(0.05, g);
  const nozzleDmg = hpNear2 - near2.hp;
  const expectedAdd = JH.RELIC_TUNE.brassNozzleAdd * 1.2 * 0.05;
  assert.ok(Math.abs((nozzleDmg - baseDmg) - expectedAdd) < 1e-6,
    "Brass Nozzle: primary target takes exactly the flat dmg add, scaled like the base hit");
  assert.strictEqual(far2.hp, hpFar2, "Brass Nozzle: second-closest enemy is never hit");
});

// ---- Hydro Lance: pierce damage fades down the line ----

test("inSprayPath: WYSIWYG — stream rect at nozzle height vs body rect, from config", () => {
  const G = global.window.JH.Geo;
  const band = JH.PLAYER.sprayHitBand, nz = JH.PLAYER.nozzleZ;
  const mk = (x, y, z, bodyH) => ({ x, y, z: z || 0, bodyW: 14, bodyH: bodyH || 28 });
  const hit = (t) => G.inSprayPath(100, 50, nz, t, 1, 78, band);
  assert.ok(hit(mk(140, 50)), "same-depth mook-height body crosses the jet");
  assert.ok(!hit(mk(80, 50)), "behind the nozzle: never hit");
  // deeper than bodyH - (nozzleZ - band): head no longer reaches the jet
  assert.ok(hit(mk(140, 50 + (28 - (nz - band)) - 1)), "slightly deeper: head still in the jet");
  assert.ok(!hit(mk(140, 50 + (28 - (nz - band)) + 2)), "too deep: water flies over the head");
  // airborne: body lifts out of the band
  assert.ok(!hit(mk(140, 50, nz + band + 30, 28)), "high airborne target: jet passes under");
});

test("lance falloff: pierce damage fades down the line per RELIC_TUNE.lanceFalloff", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;
  p.stats.beam = 3; p.stats.pierceMax = 99;   // uncapped pierce — exercise the full falloff ladder
  const a = new JH.Enemy("mook", p.x + 30, p.y);
  const b = new JH.Enemy("mook", p.x + 60, p.y);
  const c = new JH.Enemy("mook", p.x + 90, p.y);
  g.enemies = [c, a, b];   // scrambled order — sort must go by depth, not array order

  const a0 = a.hp, b0 = b.hp, c0 = c.hp;
  p.doSpray(0.1, g);
  const L = JH.RELIC_TUNE.lanceFalloff;
  const lossA = a0 - a.hp, lossB = b0 - b.hp, lossC = c0 - c.hp;
  assert.ok(lossA > 0, "nearest enemy is hit");
  assert.ok(Math.abs(lossB / lossA - L[1]) < 0.01, "2nd hit scales by lanceFalloff[1]");
  assert.ok(Math.abs(lossC / lossA - L[2]) < 0.01, "3rd hit scales by lanceFalloff[2]");
});

test("Hydro Lance caps at pierceMax: target + 1 behind; a 3rd enemy in line is untouched", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;
  JH.RELICS.find((r) => r.id === "hydro_lance").apply(p.stats);   // real relic → pierceMax 2
  assert.strictEqual(p.stats.pierceMax, 2, "Hydro Lance sets pierceMax 2");
  const a = new JH.Enemy("mook", p.x + 30, p.y);
  const b = new JH.Enemy("mook", p.x + 60, p.y);
  const c = new JH.Enemy("mook", p.x + 90, p.y);
  g.enemies = [a, b, c];
  const a0 = a.hp, b0 = b.hp, c0 = c.hp;
  p.doSpray(0.1, g);
  assert.ok(a.hp < a0, "target is hit");
  assert.ok(b.hp < b0, "the one enemy behind is hit");
  assert.strictEqual(c.hp, c0, "the third enemy in line is NOT pierced (was pierce-all before)");
});

test("lance falloff: hit indices past the ladder's length repeat the LAST entry", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;
  p.stats.beam = 3; p.stats.pierceMax = 99;   // uncapped pierce — exercise the full falloff ladder
  const L = JH.RELIC_TUNE.lanceFalloff;
  const n = L.length + 1;   // one more enemy than the ladder has entries
  const enemies = [];
  for (let i = 0; i < n; i++) enemies.push(new JH.Enemy("mook", p.x + 30 * (i + 1), p.y));
  g.enemies = enemies.slice().reverse();   // scrambled order — sort must go by depth
  const hp0 = enemies.map((e) => e.hp);
  p.doSpray(0.1, g);
  const loss = enemies.map((e, i) => hp0[i] - e.hp);
  const lossA = loss[0];
  for (let i = 0; i < n; i++) {
    const expected = L[Math.min(i, L.length - 1)];
    assert.ok(Math.abs(loss[i] / lossA - expected) < 0.01,
      "hit index " + i + " scales by lanceFalloff[" + Math.min(i, L.length - 1) + "]");
  }
  // The untested branch this pins: idx >= L.length must repeat L's last
  // entry (Math.min(idx, L.length-1)), not fall off to undefined/NaN.
  assert.ok(Math.abs(loss[n - 1] / lossA - L[L.length - 1]) < 0.01,
    "the extra hit past the ladder's length repeats the last falloff entry");
});

// ---- Dome shelter contract (Bulwark's planted dome blocks/shelters the stream) ----

test("dome shelter: enemy inside an active dome is immune while Jon is outside; hittable once the dome fades", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;   // long reach — the arc spans well past the dome
  const dome = new JH.DeployedShield(p.x + 100, p.y, null);
  g.shields = [dome];
  const e = new JH.Enemy("mook", dome.x, dome.y);   // at the dome's center
  g.enemies = [e];

  const hp0 = e.hp;
  p.doSpray(0.05, g);
  assert.strictEqual(e.hp, hp0, "active dome: stream blocked, enemy inside takes nothing");

  dome.active = false;   // dome faded — no blocking, no shelter
  p.doSpray(0.05, g);
  assert.ok(e.hp < hp0, "inactive dome: the same enemy takes spray damage");
});

test("dome shelter: stepping inside the dome lets the stream through (the counter)", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  const dome = new JH.DeployedShield(p.x + 30, p.y, null);   // Jon inside (30 < domeRadius)
  g.shields = [dome];
  assert.ok(JH.insideDome(dome, p.x, p.y), "setup: Jon is inside the dome");
  const e = new JH.Enemy("mook", dome.x + 20, dome.y);       // also inside, in front of Jon
  g.enemies = [e];

  const hp0 = e.hp;
  p.doSpray(0.05, g);
  assert.ok(e.hp < hp0, "Jon inside the dome: sheltered enemy is hittable");
});

test("dome shelter: pierce beam — enemy in front is hit, enemy inside the dome is sheltered, enemy beyond is blocked", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;
  p.stats.beam = 3; p.stats.pierceMax = 99;   // uncapped pierce — exercise the full falloff ladder (planted shields still hard-block)
  const dome = new JH.DeployedShield(p.x + 100, p.y, null);
  g.shields = [dome];
  const front  = new JH.Enemy("mook", p.x + 30, p.y);        // before the dome, in the open
  const inside = new JH.Enemy("mook", dome.x - 20, dome.y);  // inside the dome, ahead of its center
  const beyond = new JH.Enemy("mook", dome.x + 100, dome.y); // past the dome
  g.enemies = [front, inside, beyond];
  assert.ok(JH.insideDome(dome, inside.x, inside.y) && !JH.insideDome(dome, p.x, p.y),
    "setup: middle enemy sheltered, Jon outside");

  const hpFront0 = front.hp, hpInside0 = inside.hp, hpBeyond0 = beyond.hp;
  p.doSpray(0.05, g);
  assert.ok(front.hp < hpFront0, "pierce: enemy in the open before the dome is hit");
  assert.strictEqual(inside.hp, hpInside0, "pierce: enemy inside the active dome is sheltered");
  assert.strictEqual(beyond.hp, hpBeyond0, "pierce: dome hard-blocks the beam — nothing past it is hit");
});

// ---- Brass Nozzle: bonus targets the first (nearest) enemy the stream hits ----

test("Brass Nozzle: pierce beam (Hydro Lance) — bonus lands on the nearest enemy only", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  p.stats.sprayRange = 300;
  p.stats.beam = 3; p.stats.pierceMax = 2;  // Hydro Lance: target + 1 behind (2-target pierce)
  g.relics = { brass_nozzle: true };
  const near = new JH.Enemy("mook", p.x + 40, p.y);
  const far  = new JH.Enemy("mook", p.x + 120, p.y);
  g.enemies = [near, far];

  const n0 = near.hp, f0 = far.hp;
  p.doSpray(0.05, g);
  const nearLoss = n0 - near.hp, farLoss = f0 - far.hp;
  assert.ok(farLoss > 0, "pierce: far enemy is hit too");
  // Ratio folds in the lance falloff ladder (near = hit index 0 → LF[0]=1,
  // far = hit index 1 → LF[1]) on top of the nozzle's flat add on near only.
  const LF = JH.RELIC_TUNE.lanceFalloff;
  const expected = (p.stats.sprayDamage + JH.RELIC_TUNE.brassNozzleAdd) / (p.stats.sprayDamage * LF[1]);
  assert.ok(Math.abs(nearLoss / farLoss - expected) < 1e-9,
    "near enemy takes the nozzle bonus, both scaled by lanceFalloff: loss ratio near/far == "
    + "(sprayDamage+add)/(sprayDamage*LF[1]), got " + (nearLoss / farLoss));
});

test("Brass Nozzle: beam 0 — bonus still lands on the blocker (regression)", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  const near = new JH.Enemy("mook", p.x + 40, p.y);
  const far  = new JH.Enemy("mook", p.x + 60, p.y);
  g.enemies = [near, far];

  g.relics = {};                           // control: no nozzle
  const n0 = near.hp;
  p.doSpray(0.05, g);
  const plainLoss = n0 - near.hp;
  assert.ok(plainLoss > 0, "non-pierce: blocker is hit");

  near.hp = n0; p.water = p.stats.maxWater;
  g.relics = { brass_nozzle: true };
  const f0 = far.hp;
  p.doSpray(0.05, g);
  const nozzleLoss = n0 - near.hp;
  assert.strictEqual(far.hp, f0, "non-pierce: enemy behind the blocker is untouched");
  const expected = (p.stats.sprayDamage + JH.RELIC_TUNE.brassNozzleAdd) / p.stats.sprayDamage;
  assert.ok(Math.abs(nozzleLoss / plainLoss - expected) < 1e-9,
    "blocker takes the nozzle bonus: loss ratio == (sprayDamage+add)/sprayDamage, got " + (nozzleLoss / plainLoss));
});

test("Dog Leash: flat dmg bonus vs a charging or lunging enemy, not a walking one", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  g.relics = { dog_leash: true };

  const charging = new JH.Enemy("mook", p.x + 20, p.y);
  charging.state = "charge";
  g.enemies = [charging];
  const c0 = charging.hp;
  p.doSpray(0.05, g);
  const chargeLoss = c0 - charging.hp;

  p.water = p.stats.maxWater;
  const lunging = new JH.Enemy("mook", p.x + 20, p.y);
  lunging.state = "lunge";
  g.enemies = [lunging];
  const l0 = lunging.hp;
  p.doSpray(0.05, g);
  const lungeLoss = l0 - lunging.hp;

  p.water = p.stats.maxWater;
  const walking = new JH.Enemy("mook", p.x + 20, p.y);
  walking.state = "walk";
  g.enemies = [walking];
  const w0 = walking.hp;
  p.doSpray(0.05, g);
  const walkLoss = w0 - walking.hp;

  const expected = (p.stats.sprayDamage + JH.RELIC_TUNE.leashLungeBonus) / p.stats.sprayDamage;
  assert.ok(Math.abs(chargeLoss / walkLoss - expected) < 1e-9,
    "charging enemy takes the flat bonus: loss ratio charge/walk == (sprayDamage+bonus)/sprayDamage, got " + (chargeLoss / walkLoss));
  assert.ok(Math.abs(lungeLoss / walkLoss - expected) < 1e-9,
    "lunging enemy takes the same flat bonus, got " + (lungeLoss / walkLoss));
});

test("Rosary Chain: banked bonus adds flat dmg while the relic is owned", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.water = p.stats.maxWater; p.facing = 1;
  g.relics = { rosary_chain: true };
  g.rosaryBonus = 5;

  const target = new JH.Enemy("mook", p.x + 20, p.y);
  g.enemies = [target];
  const t0 = target.hp;
  p.doSpray(0.05, g);
  const bonusLoss = t0 - target.hp;

  p.water = p.stats.maxWater;
  g.rosaryBonus = 0;
  const plain = new JH.Enemy("mook", p.x + 20, p.y);
  g.enemies = [plain];
  const p0 = plain.hp;
  p.doSpray(0.05, g);
  const plainLoss = p0 - plain.hp;

  const expected = (p.stats.sprayDamage + 5) / p.stats.sprayDamage;
  assert.ok(Math.abs(bonusLoss / plainLoss - expected) < 1e-9,
    "rosary bonus adds flat dmg: loss ratio == (sprayDamage+bonus)/sprayDamage, got " + (bonusLoss / plainLoss));
});

test("Boiler Coil: sustained spray on one target superheats — flat bonus dps + splash on a neighbor", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.facing = 1;
  g.relics = { boiler_coil: true };
  const T = JH.RELIC_TUNE;
  const dt = 0.05;

  const primary = new JH.Enemy("mook", p.x + 20, p.y);
  primary.hp = 1e6;
  const neighbor = new JH.Enemy("mook", primary.x + 10, primary.y);   // within boilerSplashR (24)
  neighbor.hp = 1e6;
  g.enemies = [primary, neighbor];

  p.water = p.stats.maxWater;
  p.doSpray(dt, g);   // frame 1: locks onto primary, heat starts at 0
  assert.strictEqual(p.boilerTarget, primary, "nearest hit enemy is tracked");

  // Just under threshold: normal spray damage only, no splash yet.
  p.boilerHeat = T.boilerHeatTime - 0.1;
  p.water = p.stats.maxWater;
  let p0 = primary.hp, n0 = neighbor.hp;
  p.doSpray(dt, g);
  const baseLoss = p0 - primary.hp;
  assert.strictEqual(neighbor.hp, n0, "no splash before the superheat threshold");

  // This frame's dt crosses the threshold — bonus + splash both land.
  p.boilerHeat = T.boilerHeatTime - dt + 0.001;
  p.water = p.stats.maxWater;
  p0 = primary.hp; n0 = neighbor.hp;
  p.doSpray(dt, g);
  const heatedLoss = p0 - primary.hp;
  const neighborLoss = n0 - neighbor.hp;
  const dmgScale = 1.2;   // full-pressure tier both frames (water topped off each call)
  assert.ok(Math.abs((heatedLoss - baseLoss) - T.boilerBonus * dmgScale * dt) < 1e-6,
    "heated frame adds flat boilerBonus dps on top of the base hit, got delta " + (heatedLoss - baseLoss));
  assert.ok(Math.abs(neighborLoss - T.boilerSplash * dmgScale * dt) < 1e-6,
    "neighbor within boilerSplashR takes boilerSplash dps once superheated, got " + neighborLoss);
});

test("Boiler Coil: switching the hit target resets the heat build-up", () => {
  const g = makeThinkGame(60, 40);
  const p = g.player;
  p.facing = 1;
  g.relics = { boiler_coil: true };
  const T = JH.RELIC_TUNE;
  const dt = 0.05;

  const a = new JH.Enemy("mook", p.x + 20, p.y);
  a.hp = 1e6;
  g.enemies = [a];
  for (let t = 0; t < 1.0; t += dt) { p.water = p.stats.maxWater; p.doSpray(dt, g); }
  assert.strictEqual(p.boilerTarget, a);
  assert.ok(p.boilerHeat > 0 && p.boilerHeat < T.boilerHeatTime, "accumulated heat, still under threshold");

  const b = new JH.Enemy("mook", p.x + 20, p.y);
  b.hp = 1e6;
  g.enemies = [b];
  p.water = p.stats.maxWater;
  p.doSpray(dt, g);
  assert.strictEqual(p.boilerTarget, b, "new nearest hit becomes the tracked target");
  assert.strictEqual(p.boilerHeat, 0, "heat resets on target switch");
});

test("Boiler Coil: a boilerGap pause with no spray resets the heat", () => {
  const p = makePlayer();
  p.boilerTarget = {};   // stand-in for a previously tracked enemy
  p.boilerHeat = 1.5;
  p.boilerGapT = 0;
  const g = {
    relics: {}, enemies: [], particles: [], bounds: { minX: 0, maxX: 480 },
    input: { held: () => false, pressed: () => false, buffered: () => false, consume() {} },
  };
  const dt = 1 / 60;
  const total = JH.RELIC_TUNE.boilerGap + 0.1;
  for (let t = 0; t < total; t += dt) p.update(dt, g);
  assert.strictEqual(p.boilerTarget, null, "gap pause clears the tracked target");
  assert.strictEqual(p.boilerHeat, 0, "gap pause clears the heat");
});

test("Boiler Coil: real per-frame order — heat survives while spraying via update(), gap only fires after real dry frames", () => {
  const dt = 1 / 60;
  const spraying = { v: true };
  const g = Object.assign(makeThinkGame(60, 40), {
    input: { held: (k) => k === "spray" && spraying.v, pressed: () => false, buffered: () => false, consume() {} },
  });
  const p = g.player;
  p.facing = 1;
  g.relics = { boiler_coil: true };
  const T = JH.RELIC_TUNE;
  const target = new JH.Enemy("mook", p.x + 20, p.y);
  target.hp = 1e6;
  g.enemies = [target];

  // Drive the real per-step order: player.update() ticks boilerGapT up FIRST,
  // then (still inside the same update) doSpray fires and zeroes it back to 0.
  // The regression this pins: that same-frame incr-then-reset order must
  // never let the gap threshold trip mid-stream, and heat must climb, not reset.
  let lastHeat = -1;
  for (let i = 0; i < 10; i++) {
    p.water = p.stats.maxWater;   // keep the tank topped so pressure tier stays constant
    p.update(dt, g);
    assert.strictEqual(p.boilerGapT, 0, "gap timer stays zeroed while actively spraying, frame " + i);
    assert.ok(p.boilerHeat >= lastHeat, "heat never resets mid-stream, frame " + i);
    lastHeat = p.boilerHeat;
  }
  assert.strictEqual(p.boilerTarget, target, "boiler target tracked through the real update() path");
  assert.ok(lastHeat > 0, "heat actually accumulated while spraying");

  // Stop spraying and let real (non-spray) update() frames pass beyond boilerGap.
  spraying.v = false;
  const total = T.boilerGap + 0.1;
  for (let t = 0; t < total; t += dt) p.update(dt, g);
  assert.strictEqual(p.boilerTarget, null, "gap after real dry frames clears the target");
  assert.strictEqual(p.boilerHeat, 0, "gap after real dry frames clears the heat");
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

test("Spigot Key: standing at a hydrant heals HP at the configured rate while it refills you", () => {
  const dt = 1 / 60;
  const mkGame = (relics, p) => ({
    hydrants: [{ x: p.x, y: p.y }], relics,
    particles: [], bounds: { minX: 0, maxX: 480 },
    input: { held: () => false, pressed: () => false, buffered: () => false, consume() {} },
  });

  const p = makePlayer();
  p.facing = 1; p.hp = p.stats.maxHp - 50;   // leave room to heal
  p.water = p.stats.maxWater * 0.5;          // tank must be FILLING for the heal
  const hpBefore = p.hp;
  p.update(dt, mkGame({ spigot_key: true }, p));
  assert.ok((p.hp - hpBefore) >= JH.RELIC_TUNE.spigotHealRate * dt - 1e-6,
    "Spigot Key: heals at spigotHealRate HP/s while the hydrant refills you");

  // Full tank: no refill happening -> no heal (hydrants can't be camped for HP).
  const pFull = makePlayer();
  pFull.facing = 1; pFull.hp = pFull.stats.maxHp - 50;
  pFull.water = pFull.stats.maxWater;
  const hpBeforeFull = pFull.hp;
  pFull.update(dt, mkGame({ spigot_key: true }, pFull));
  assert.ok(pFull.hp <= hpBeforeFull + 1e-9, "Spigot Key: full tank grants no heal");

  const p2 = makePlayer();
  p2.facing = 1; p2.hp = p2.stats.maxHp - 50;
  const hpBefore2 = p2.hp;
  p2.update(dt, mkGame({}, p2));
  assert.strictEqual(p2.hp, hpBefore2, "no relic: hydrant proximity alone doesn't heal");

  const p3 = makePlayer();
  p3.facing = 1; p3.hp = p3.stats.maxHp;   // already full
  p3.update(dt, mkGame({ spigot_key: true }, p3));
  assert.strictEqual(p3.hp, p3.stats.maxHp, "heal clamps at maxHp");
});

test("Deputy Sprinkler: auto-jets flat dps on the nearest enemy in range, gated on the relic", () => {
  const dt = 1 / 60;
  const mkGame = (relics, enemies) => ({
    relics, enemies, particles: [], bounds: { minX: 0, maxX: 480 },
    input: { held: () => false, pressed: () => false, buffered: () => false, consume() {} },
  });

  // In range, relic owned: pyro (waterMult 1.5) drains sprinklerDps*dt*waterMult.
  const p = makePlayer();
  p.facing = 1;
  const near = new JH.Enemy("pyro", p.x + 20, p.y);
  const hpBefore = near.hp;
  p.update(dt, mkGame({ deputy_sprinkler: true }, [near]));
  const loss = hpBefore - near.hp;
  const expected = JH.RELIC_TUNE.sprinklerDps * dt * 1.5;
  assert.ok(Math.abs(loss - expected) < 1e-9,
    "in-range pyro takes sprinklerDps*dt*waterMult, got " + loss);

  // Beyond sprinklerRange: untouched (no spraying involved either way).
  const p2 = makePlayer();
  p2.facing = 1;
  const far = new JH.Enemy("mook", p2.x + JH.RELIC_TUNE.sprinklerRange + 10, p2.y);
  const farHp = far.hp;
  p2.update(dt, mkGame({ deputy_sprinkler: true }, [far]));
  assert.strictEqual(far.hp, farHp, "enemy beyond sprinklerRange is untouched");

  // No relic: nothing happens even at close range.
  const p3b = makePlayer();
  p3b.facing = 1;
  const close = new JH.Enemy("mook", p3b.x + 20, p3b.y);
  const closeHp = close.hp;
  p3b.update(dt, mkGame({}, [close]));
  assert.strictEqual(close.hp, closeHp, "no relic: no auto-jet damage");
});

test("Deputy Sprinkler: enemy sheltered inside an active dome takes no auto-jet damage; unsheltered twin does", () => {
  const dt = 1 / 60;
  const mkGame = (relics, enemies, shields) => ({
    relics, enemies, shields: shields || [], particles: [], bounds: { minX: 0, maxX: 480 },
    input: { held: () => false, pressed: () => false, buffered: () => false, consume() {} },
  });

  // Dome center 70 units out (inside sprinklerRange 80, outside domeRadius 58) —
  // Jon is outside the dome, the enemy sitting at its center is sheltered.
  const p = makePlayer();
  p.facing = 1;
  const dome = new JH.DeployedShield(p.x + 70, p.y, null);
  const sheltered = new JH.Enemy("mook", dome.x, dome.y);
  const hpBefore = sheltered.hp;
  p.update(dt, mkGame({ deputy_sprinkler: true }, [sheltered], [dome]));
  assert.strictEqual(sheltered.hp, hpBefore,
    "enemy sheltered inside an active dome takes no auto-jet damage");

  // Same relic, no dome: an unsheltered twin at close range takes the damage.
  const p2 = makePlayer();
  p2.facing = 1;
  const unsheltered = new JH.Enemy("mook", p2.x + 20, p2.y);
  const hpBefore2 = unsheltered.hp;
  p2.update(dt, mkGame({ deputy_sprinkler: true }, [unsheltered], []));
  assert.ok(unsheltered.hp < hpBefore2, "unsheltered twin at close range takes sprinkler damage");
});

test("Deputy Sprinkler: nearest of two in-range enemies drains; dead/dropping skipped; dead player never drains", () => {
  const dt = 1 / 60;
  const mkGame = (relics, enemies) => ({
    relics, enemies, particles: [], bounds: { minX: 0, maxX: 480 },
    input: { held: () => false, pressed: () => false, buffered: () => false, consume() {} },
  });

  // Two live enemies in range — only the nearer one drains this frame.
  const p = makePlayer();
  p.facing = 1;
  const near = new JH.Enemy("mook", p.x + 20, p.y);
  const far = new JH.Enemy("mook", p.x + 50, p.y);
  const nearHp0 = near.hp, farHp0 = far.hp;
  p.update(dt, mkGame({ deputy_sprinkler: true }, [near, far]));
  assert.ok(near.hp < nearHp0, "nearest enemy drains");
  assert.strictEqual(far.hp, farHp0, "farther enemy is untouched while a nearer one is in range");

  // Dead/dropping enemies are skipped even when nearer than the only live target.
  const p2 = makePlayer();
  p2.facing = 1;
  const deadNear = new JH.Enemy("mook", p2.x + 10, p2.y);
  deadNear.dead = true;
  const deadHp0 = deadNear.hp;
  const droppingNear = new JH.Enemy("mook", p2.x + 15, p2.y);
  droppingNear.dropping = true;
  const droppingHp0 = droppingNear.hp;
  const liveFar = new JH.Enemy("mook", p2.x + 40, p2.y);
  const liveFarHp0 = liveFar.hp;
  p2.update(dt, mkGame({ deputy_sprinkler: true }, [deadNear, droppingNear, liveFar]));
  assert.strictEqual(deadNear.hp, deadHp0, "dead enemy never takes auto-jet damage");
  assert.strictEqual(droppingNear.hp, droppingHp0, "dropping (airborne) enemy never takes auto-jet damage");
  assert.ok(liveFar.hp < liveFarHp0, "the only live enemy drains despite being farthest");

  // alive=false player: no drain at all.
  const p3 = makePlayer();
  p3.facing = 1;
  p3.alive = false;
  const target = new JH.Enemy("mook", p3.x + 10, p3.y);
  const targetHp0 = target.hp;
  p3.update(dt, mkGame({ deputy_sprinkler: true }, [target]));
  assert.strictEqual(target.hp, targetHp0, "dead player: no auto-jet drain");
});

test("shopSelectables carries the relic wheel as one row; buyRelic spends suds, flags ownership, and clears stock", () => {
  const g = Object.create(JH.Game);
  g.player = makePlayer();
  g.player.suds = 300;
  g.relics = {};
  g.relicStock = ["brass_nozzle", "spigot_key"];
  g.wheelStock = g.relicStock.slice(0, 3);   // spawnVendor's snapshot — production always reads THIS, not relicStock
  const sel = g.shopSelectables();
  const wheelRows = sel.filter((s) => s.kind === "wheelRow");
  assert.strictEqual(wheelRows.length, 1, "the whole relic stock collapses to a single wheel row");
  // Production always calls this with the (wheelStock, relics) two-arg form (game.js drawHoverShop) — match it here.
  const entries = JH.Balance.shopWheelEntries(g.wheelStock, g.relics);
  assert.deepStrictEqual(entries.map((e) => e.id), ["brass_nozzle", "spigot_key", null, "kibble"]);

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
  assert.strictEqual(g.player.pressureBuffT, JH.RELIC_TUNE.prayerBeadDur, "first enrage tick grants the buff");
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

test("death wash: benedictions clear, levels/relics survive respawn refresh", () => {
  JH.Upgrades.reset(); JH.Benedictions.reset();
  const prevGame = JH.Game;
  JH.Game = { relics: { fire_marshal: true } };
  JH.Upgrades.levelCount = 4;
  JH.Benedictions.take("bedrock");
  const before = JH.Upgrades.computeStats(JH.Upgrades.owned);
  JH.Benedictions.reset();                             // what respawnFromChurch does
  const after = JH.Upgrades.computeStats(JH.Upgrades.owned);
  assert.strictEqual(before.maxHp - after.maxHp, 40);  // bedrock gone
  assert.ok(after.sprayRange > JH.PLAYER.sprayRange);  // relic survived
  JH.Upgrades.reset(); JH.Benedictions.reset();
  JH.Game = prevGame;
});

test("toggleRelic: grant folds apply() stats in, revoke folds out + clamps hp + clears relic state", () => {
  const stats = [];
  const g = {
    relics: {}, rosaryBonus: 7,
    player: {
      hp: 120, stats: { maxHp: 100 },
      boilerTarget: {}, boilerHeat: 1.5, boilerGapT: 0.1,
      applyStats(s) { this.stats = s; stats.push(s); },
    },
  };
  const toggleMethod = JH.Game.toggleRelic;
  const toggle = (id) => toggleMethod.call(g, id);
  const realGame = JH.Game;
  JH.Game = g;                                  // computeStats reads JH.Game.relics (known idiom)
  try {
    assert.strictEqual(toggle("rubber_boots"), true);
    assert.strictEqual(g.relics.rubber_boots, true);
    assert.strictEqual(g.player.stats.maxHp, JH.PLAYER.maxHp + JH.RELIC_TUNE.bootsHp);
    g.player.hp = g.player.stats.maxHp;         // full hp with boots on
    assert.strictEqual(toggle("rubber_boots"), false);
    assert.ok(!g.relics.rubber_boots);
    assert.strictEqual(g.player.stats.maxHp, JH.PLAYER.maxHp);
    assert.ok(g.player.hp <= g.player.stats.maxHp, "hp clamped after boots revoke");
    // relic-state cleanup on revoke
    g.relics.rosary_chain = true; g.rosaryBonus = 7;
    toggle("rosary_chain");                     // revoke
    assert.strictEqual(g.rosaryBonus, 0);
    g.relics.boiler_coil = true; g.player.boilerHeat = 2;
    toggle("boiler_coil");                      // revoke
    assert.strictEqual(g.player.boilerTarget, null);
    assert.strictEqual(g.player.boilerHeat, 0);
  } finally { JH.Game = realGame; }
});

test("deepdive: TV always spawns down-lane; SITTING is gated on kibble > threshold", () => {
  const D = JH.DEEPDIVE;
  const g = { relics: {}, player: { kibbleTimer: 0, x: 0, y: 0 },
              shopWheelEntries: () => [], };
  JH.Game.spawnVendor.call(g, 300);
  assert.ok(g.deepdiveTV, "TV anchored with zero kibble (materialization carries the gate)");
  assert.strictEqual(g.deepdiveTV.x, 300 - D.laneGap, "down-lane by laneGap");
  // Sit gate: E near the TV only arms above the threshold.
  const mkInput = (buffered) => ({ buffered: (k) => buffered.includes(k), consume: () => {}, pressed: () => false });
  const sit = (kib) => {
    const s = { deepdiving: false, deepdiveTV: { x: 0, y: 0, near: true, videoT: 0, mat: 1 },
                player: { x: 0, y: 0, kibbleTimer: kib },
                input: mkInput(["confirm"]), audio: { play() {} },
                pickQuip: () => "", float() {} };   // sit-down fires a guaranteed quip
    JH.Game.tickDeepdive.call(s);
    return s.deepdiving;
  };
  assert.strictEqual(sit(D.threshold - 1), false, "short bank: E refused");
  assert.strictEqual(sit(D.threshold + 1), true, "banked: sits");
});

test("deepdive TV materializes with banked kibble, dematerializes when it empties", () => {
  const D = JH.DEEPDIVE;
  const tv = new JH.DeepdiveTV(0, 0);
  const realGame = JH.Game;
  try {
    JH.Game = { deepdiving: false, player: { kibbleTimer: 0 } };
    tv.update(0.5);
    assert.strictEqual(tv.mat, 0, "no kibble: stays immaterial");
    JH.Game.player.kibbleTimer = 3;
    tv.update(D.matIn / 2);
    assert.ok(tv.mat > 0 && tv.mat < 1, "mid tune-in");
    tv.update(D.matIn);
    assert.strictEqual(tv.mat, 1, "fully materialized (clamped)");
    // Bank drains to 0 mid-dive: the active dive pins it solid until stand-up.
    JH.Game.player.kibbleTimer = 0;
    JH.Game.deepdiving = true;
    tv.update(0.2);
    assert.strictEqual(tv.mat, 1, "active dive holds it solid at kibble 0");
    JH.Game.deepdiving = false;
    tv.update(D.matOut / 2);
    assert.ok(tv.mat > 0 && tv.mat < 1, "mid tune-out");
    tv.update(D.matOut);
    assert.strictEqual(tv.mat, 0, "empty bank: fully dematerialized");
  } finally { JH.Game = realGame; }
});

test("deepdive overshield: soaks hits first, depletes, never recharges", () => {
  const p = makePlayer();
  const g = dashStubGame(makeBufferedInput().In);
  p.overshield = 20;
  const hp0 = p.hp;
  p.takeHit(30, g, p.x + 10);
  assert.strictEqual(p.overshield, 0, "shield fully spent");
  assert.strictEqual(p.hp, hp0 - 10, "only the overflow reaches HP");
  p.invulnTimer = 0;
  p.takeHit(10, g, p.x + 10);
  assert.strictEqual(p.hp, hp0 - 20, "no shield left: full damage (no recharge)");
  p.clearBuffs();
  assert.strictEqual(p.overshield, 0, "death path clears it");
});

test("deepdive drain: heals first — shield only accrues once HP is full", () => {
  const p = makePlayer();
  const g = dashStubGame(makeBufferedInput().In);
  g.deepdiving = true;
  p.kibbleRegen = 2; p.kibbleTimer = 30;
  p.hp = p.stats.maxHp - 10;
  while (p.hp < p.stats.maxHp && p.kibbleTimer > 0) {
    p.update(0.016, g);
    if (p.hp < p.stats.maxHp)
      assert.strictEqual(p.overshield, 0, "zero shield (not even float residue) while HP below full");
  }
  assert.strictEqual(p.hp, p.stats.maxHp, "kibble healed to full before any shield");
  // At full HP the whole drain converts to shield at the same rate.
  const kib0 = p.kibbleTimer, sh0 = p.overshield;
  assert.ok(kib0 > 0, "bank not exhausted by the heal");
  for (let i = 0; i < 20; i++) p.update(0.016, g);
  const spent = kib0 - p.kibbleTimer;
  assert.ok(spent > 0, "bank still draining at full HP");
  assert.ok(Math.abs((p.overshield - sh0) - spent * p.kibbleRegen) < 1e-9,
    "every drained kibble-second converts to shield at kibbleRegen rate");
});

test("deepdive: auto-ends when kibble empties; move key bails", () => {
  const mkInput = (bufferedKeys, pressedKeys) => ({
    buffered: (k) => bufferedKeys.includes(k), consume: () => {},
    pressed: (k) => pressedKeys.includes(k),
  });
  const g = { deepdiving: true, deepdiveTV: { x: 0, y: 0, near: true, videoT: 0 },
              player: { x: 0, y: 0, kibbleTimer: 0 },
              input: mkInput([], []), audio: { play() {} } };
  JH.Game.tickDeepdive.call(g);
  assert.strictEqual(g.deepdiving, false, "kibble 0 auto-ends");
  g.deepdiving = true; g.player.kibbleTimer = 5; g.input = mkInput([], ["left"]);
  JH.Game.tickDeepdive.call(g);
  assert.strictEqual(g.deepdiving, false, "move key bails");
  g.deepdiving = true; g.input = mkInput(["confirm"], []);
  JH.Game.tickDeepdive.call(g);
  assert.strictEqual(g.deepdiving, false, "second confirm bails");
  let dashConsumed = false;
  g.deepdiving = true;
  g.input = { buffered: (k) => k === "dash", pressed: () => false,
              consume: (k) => { if (k === "dash") dashConsumed = true; } };
  JH.Game.tickDeepdive.call(g);
  assert.strictEqual(g.deepdiving, false, "dash bails");
  assert.strictEqual(dashConsumed, false, "dash not consumed — it executes as the stand-up move");
  // Real frame order: Player.update consumes the buffered dash BEFORE
  // tickDeepdive runs — the started dash must still bail via dashTimer.
  g.deepdiving = true; g.input = mkInput([], []); g.player.dashTimer = 0.2;
  JH.Game.tickDeepdive.call(g);
  assert.strictEqual(g.deepdiving, false, "in-flight dash (already-consumed edge) bails");
});

test("upgrade sequence: a grown stat queues an icon+delta entry; equal stats queue nothing", () => {
  const p = makePlayer();
  p.upgradeQ.length = 0;
  const grown = Object.assign({}, p.stats, { sprayDamage: p.stats.sprayDamage + 3 });
  p.applyStats(grown);
  assert.strictEqual(p.upgradeQ.length, 1);
  assert.strictEqual(p.upgradeQ[0].icon, "dmg");
  assert.strictEqual(p.upgradeQ[0].text, "+3 DMG");
  p.applyStats(Object.assign({}, p.stats));   // identical rebuild → no entry
  assert.strictEqual(p.upgradeQ.length, 1);
});

test("boss line slam hits exactly its telegraph ellipse — dodging in depth escapes", () => {
  for (const type of ["switch", "gatewaykrusher"]) {
    const b = JH.makeEnemy(type, 200, 40);
    const d = b.def, lt = { x: 100, y: 40 };
    const pl = { x: 100, y: 40, z: 0 };
    assert.ok(b.lineHits(pl, lt), type + ": dead center hits");
    pl.y = 40 + d.lineBand + 1;                       // dodged down past the rim
    assert.ok(!b.lineHits(pl, lt), type + ": outside in depth misses");
    pl.y = 40 - d.lineBand - 1;                       // dodged up past the rim
    assert.ok(!b.lineHits(pl, lt), type + ": outside upward misses");
    pl.y = 40; pl.x = 100 + d.whipBand * 2 + 1;       // outside the drawn rx
    assert.ok(!b.lineHits(pl, lt), type + ": outside in x misses");
    pl.x = 100 + d.whipBand * 2 - 2;                  // inside the drawn rx on-axis
    assert.ok(b.lineHits(pl, lt), type + ": drawn width hits on-axis");
    pl.x = 100; pl.z = 20;                            // airborne
    assert.ok(!b.lineHits(pl, lt), type + ": airborne misses");
  }
});

test("spray-douse speed scales with spray damage, never below the flat rate", () => {
  const mkSpray = (dmgMult) => {
    const g = makeThinkGame(60, 40);
    const p = g.player;
    p.water = p.stats.maxWater;
    p.stats.sprayDamage = JH.PLAYER.sprayDamage * dmgMult;
    p.facing = 1;
    const fp = new JH.FirePatch(p.x + 30, p.y, 24, 3);
    g.firePatches = [fp];
    p.doSpray(0.1, g);
    return fp.sprayProgress;
  };
  const base = mkSpray(1), twice = mkSpray(2), weak = mkSpray(0.3);
  assert.ok(twice > base * 1.5, "double damage douses much faster");
  assert.ok(base >= 0.1 - 1e-9, "base damage is at least the flat rate");
  assert.ok(Math.abs(weak - 0.1) < 1e-9, "well-below-base damage clamps to exactly the flat rate");
});

test("procSuperEliteArrival: grants pressure buff + floater only with prayer_bead and a live player", () => {
  const floats = [];
  const g = { relics: { prayer_bead: true },
              player: { alive: true, x: 0, y: 0, pressureBuffT: 0 },
              float(x, y, txt) { floats.push(txt); } };
  JH.Game.procSuperEliteArrival.call(g);
  assert.strictEqual(g.player.pressureBuffT, JH.RELIC_TUNE.prayerBeadDur);
  assert.strictEqual(floats.length, 1);
  const g2 = { relics: {}, player: { alive: true, pressureBuffT: 0 }, float() { floats.push("x"); } };
  JH.Game.procSuperEliteArrival.call(g2);
  assert.strictEqual(g2.player.pressureBuffT, 0);
  assert.strictEqual(floats.length, 1);
});
