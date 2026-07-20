const { test } = require("node:test");
const assert = require("node:assert");
global.window = globalThis;
require("../js/config.js");
require("../js/balance.js");
window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/entities.js");
const JH = global.window.JH;

test("assman: def exists with phase gates and full move tables", () => {
  const D = JH.ASSMAN;
  assert.ok(D && D.hp > JH.SLAYER.hp, "hardest boss yet: hp above Slayer");
  assert.deepStrictEqual(D.gates, [0.66, 0.33]);
  for (const k of ["clap", "hip", "toss", "clapback", "slam", "storm", "exhaust"])
    assert.ok(D[k], "move table " + k);
});

test("assman: wave 36 exists, routes bossType assman, triggers stay in sync", () => {
  const waves = JH.LEVEL1.waves;
  const last = waves[waves.length - 1];
  assert.strictEqual(last.boss, true);
  assert.strictEqual(last.bossType, "assman");
});

test("assman: makeEnemy builds the boss with isBoss and def wiring", () => {
  const b = JH.makeEnemy("assman", 100, 40);
  assert.ok(b instanceof JH.AssManBoss);
  assert.strictEqual(b.isBoss, true);
  assert.strictEqual(b.maxHp, JH.ASSMAN.hp);
  assert.strictEqual(b.phase, 1);
});

test("assman helpers: phase gating from hp fraction", () => {
  const B = JH.Balance, G = JH.ASSMAN.gates;
  assert.strictEqual(B.assmanPhase(1.0, G), 1);
  assert.strictEqual(B.assmanPhase(G[0] + 0.001, G), 1);
  assert.strictEqual(B.assmanPhase(G[0], G), 2);
  assert.strictEqual(B.assmanPhase(G[1], G), 3);
  assert.strictEqual(B.assmanPhase(0, G), 3);
});

test("assman helpers: cone membership — rim is hitbox", () => {
  const B = JH.Balance, C = JH.ASSMAN.clap;
  // dead ahead inside range: hit
  assert.ok(B.coneHits(100 + C.range - 1, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // behind: miss
  assert.ok(!B.coneHits(60, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // beyond range: miss
  assert.ok(!B.coneHits(100 + C.range + 2, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // just inside the angular edge (depth axis divided by ry): hit; just outside: miss
  const rad = (C.halfAngleDeg - 1) * Math.PI / 180;
  const dx = Math.cos(rad) * C.range * 0.9, dy = Math.sin(rad) * C.range * 0.9 * JH.GROUND_RY;
  assert.ok(B.coneHits(100 + dx, 40 + dy, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  const rad2 = (C.halfAngleDeg + 2) * Math.PI / 180;
  const dx2 = Math.cos(rad2) * C.range * 0.9, dy2 = Math.sin(rad2) * C.range * 0.9 * JH.GROUND_RY;
  assert.ok(!B.coneHits(100 + dx2, 40 + dy2, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
});

test("assman helpers: ring rim hits except inside the rotating gap", () => {
  const B = JH.Balance, S = JH.ASSMAN.storm;
  const r = 80;
  // on the rim, opposite the gap: hit
  assert.ok(B.ringGapHits(200 + r, 40, 200, 40, r, S.rimW, 180, S.gapDeg, 0.34));
  // on the rim, at gap center (gap at 0°): safe
  assert.ok(!B.ringGapHits(200 + r, 40, 200, 40, r, S.rimW, 0, S.gapDeg, 0.34));
  // inside the ring, not on the rim: no hit
  assert.ok(!B.ringGapHits(200 + r * 0.5, 40, 200, 40, r, S.rimW, 180, S.gapDeg, 0.34));
  // angle wraparound: gap centered at 350°, point at +5° is inside the gap
  assert.ok(!B.ringGapHits(200 + r * Math.cos(5 * Math.PI / 180), 40 + r * Math.sin(5 * Math.PI / 180) * 0.34, 200, 40, r, S.rimW, 350, S.gapDeg, 0.34));
});

test("assman helpers: leaderboard comparator — version, waves, time", () => {
  const B = JH.Balance;
  const mk = (v, w, t) => ({ gameVersion: v, wavesCleared: w, timeSec: t });
  // newer version outranks regardless of waves/time
  assert.ok(B.lbCompare(mk("0.32.0", 10, 999), mk("0.31.9", 36, 100)) < 0);
  // same version: more waves outranks
  assert.ok(B.lbCompare(mk("0.32.0", 36, 999), mk("0.32.0", 29, 100)) < 0);
  // same version + waves: faster time outranks
  assert.ok(B.lbCompare(mk("0.32.0", 36, 100), mk("0.32.0", 36, 200)) < 0);
  // missing fields sort last, never throw
  assert.ok(B.lbCompare(mk("0.32.0", 36, 100), {}) < 0);
});

// ---- Phase 1 think() tests ----

function makePlayer() {
  JH.Upgrades.reset();
  return new JH.Player(60, 40);
}

// Minimal game stub for enemy think() tests.
function makeThinkGame(px, py) {
  return {
    player: Object.assign(makePlayer(), { x: px, y: py }),
    enemies: [], embers: [], particles: [], firePatches: [], shields: [],
    pulseRings: [],
    bounds: { minX: 0, maxX: 480 },
    audio: { play() {} }, shake() {}, hitStop() {}, defer() {},
    killJuice() {}, dropLoot() {}, onEnemyKilled() {}, spawnEnemy() {},
    canAttack() { return this._tickets !== false; }, _tickets: true,
    sigils: [], banner() {},
  };
}

test("assman P1: cheek clap — telegraph then cone hit, shape shared", () => {
  const g = makeThinkGame(140, 40);              // player close, dead ahead
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  const C = JH.ASSMAN.clap;
  b._decideT = 0;                                // force a decision now
  b.think(1 / 60, g);
  assert.strictEqual(b.state, "clapwind", "close range picks the clap");
  const hp0 = g.player.hp;
  // run out the windup; the release frame applies cone damage once
  for (let t = 0; t < C.wind + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - C.dmg, "cone caught the player once");
  // same fight, player parked outside the cone angle: no damage
  const g2 = makeThinkGame(100, 120);            // deep off-axis
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2._decideT = 0; b2._forceMove = "clap";       // test hook (see Step 3)
  b2.think(1 / 60, g2);
  const hp2 = g2.player.hp;
  for (let t = 0; t < C.wind + 0.1; t += 1 / 60) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "outside the cone: telegraph = hit shape");
});

test("assman P1: hip check — dash with punishable skid on whiff", () => {
  const g = makeThinkGame(360, 40);              // far: picks hip or toss; force hip
  const b = JH.makeEnemy("assman", 100, 40);
  b._decideT = 0; b._forceMove = "hip";
  b.think(1 / 60, g);
  assert.strictEqual(b.state, "hipbrace");
  const H = JH.ASSMAN.hip;
  for (let t = 0; t < H.brace + 0.05; t += 1 / 60) b.think(1 / 60, g);
  assert.strictEqual(b.state, "hipdash");
  const x0 = b.x;
  g.player.x = 2000;                             // guarantee a whiff
  for (let t = 0; t < H.dist / H.speed + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.ok(b.x > x0 + H.dist * 0.8, "dashed forward");
  assert.strictEqual(b.state, "skid", "whiff ends in the skid window");
  assert.ok(b._skidT > 0 && b._skidT <= H.skid);
});

test("assman toss: toilet arcs, lands with rim-true impact + shard ticks", () => {
  const T = JH.ASSMAN.toss;
  const g = makeThinkGame(200, 40);
  const bomb = new JH.ToiletBomb(100, 40, 200, 40, T);
  g.embers = [bomb];
  // fly until landing
  let guard = 0;
  while (!bomb.landed && guard++ < 600) bomb.update(1 / 60, g);
  assert.ok(bomb.landed, "landed");
  // player stood on the landing spot: impact damage applied exactly once
  assert.strictEqual(g.player.hp, 100 - T.dmg);
  // Shard ticks route through takeHit (i-frames apply, same house rule as
  // the Big Drip pour tick) — the harness never runs Player.update, so we
  // decay invulnTimer by hand each frame the way the real game loop would.
  // The impact's own 0.6s invuln outlives the first scheduled tick (0.5s
  // later), so that first tick is honestly negated; the second tick
  // (~1.0s post-impact) lands once i-frames have decayed.
  const hpAfterImpact = g.player.hp;
  for (let t = 0; t < T.shardEvery * 2 + 0.05; t += 1 / 60) {
    g.player.invulnTimer = Math.max(0, (g.player.invulnTimer || 0) - 1 / 60);
    bomb.update(1 / 60, g);
  }
  assert.strictEqual(g.player.hp, hpAfterImpact - T.shardDmg, "first tick eaten by impact i-frames, second tick lands");
  // outside the rim: no ticks
  g.player.x = 200 + T.landRx + 20;
  const hp2 = g.player.hp;
  for (let t = 0; t < T.shardEvery * 2; t += 1 / 60) {
    g.player.invulnTimer = Math.max(0, (g.player.invulnTimer || 0) - 1 / 60);
    bomb.update(1 / 60, g);
  }
  assert.strictEqual(g.player.hp, hp2, "rim is hitbox — outside is safe");
  // zone expires
  for (let t = 0; t < T.shardDur; t += 1 / 60) if (!bomb.update(1 / 60, g)) break;
  assert.ok(!bomb.update(1 / 60, g), "dead after shardDur");
});
