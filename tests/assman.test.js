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

// ---- Phase gates + Phase 2 (Air Superiority) ----

test("assman phases: gate on hp fraction with a transition beat + invuln", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(400, 40);
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  b.hp = b.maxHp * (D.gates[0] - 0.01);          // below gate 1
  b.think(1 / 60, g);
  assert.strictEqual(b.phase, 2);
  assert.strictEqual(b.state, "transition");
  assert.ok(b._invulnT > 0 && b._invulnT <= D.transitionInvuln);
  // invulnerable during the beat
  const hp0 = b.hp;
  b.takeDamage(50, g, 1, 0);
  assert.strictEqual(b.hp, hp0, "no damage during the transition beat");
});

test("assman P1: phase gate waits for an in-flight move to resolve", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(140, 40);           // close range, dead ahead — picks clap
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  b._decideT = 0; b._forceMove = "clap";
  b.think(1 / 60, g);                         // starts the clap windup
  assert.strictEqual(b.state, "clapwind");
  assert.ok(b.move, "move in flight");
  b.hp = b.maxHp * (D.gates[0] - 0.01);       // drop below gate 1 mid-move
  b.think(1 / 60, g);
  assert.strictEqual(b.phase, 1, "gate held off while the clap is still in flight");
  // run the clap out to resolution (release + skid-free completion)
  let guard = 0;
  while (b.move && guard++ < 300) b.think(1 / 60, g);
  assert.ok(!b.move, "clap resolved");
  assert.strictEqual(b.phase, 1, "still phase 1 the instant the move clears");
  // next think() call: the gate re-checks and fires now that the move is clear
  b.think(1 / 60, g);
  assert.strictEqual(b.phase, 2, "gate fires once the move resolves");
  assert.strictEqual(b.state, "transition");
});

test("assman: scald cannot tick through the airborne phase-2 band — cleared, no hp loss", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  const b = JH.makeEnemy("assman", 100, 40);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b.applyScald(50, 3);
  assert.ok(b.scaldT > 0, "scalded");
  const hp0 = b.hp;
  b.tickScald(1 / 60, g);
  assert.strictEqual(b.hp, hp0, "no DoT damage while airborne");
  assert.strictEqual(b.scaldT, 0, "scald cleared outright, not just paused");
  // grounded (slamland) phase 2 IS in the hit band — scald ticks normally there
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2.phase = 2; b2._grounded = true; b2.z = 0;
  b2.applyScald(50, 3);
  const hp2 = b2.hp;
  b2.tickScald(1 / 60, g);
  assert.ok(b2.hp < hp2, "grounded phase 2: DoT still ticks");
  assert.ok(b2.scaldT > 0, "scald not cleared while grounded");
});

test("assman P2: airborne = untouchable; slam landing recovery = the window", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  b.hp = b.maxHp * (D.gates[0] - 0.01);
  // run through the transition beat into flight
  for (let t = 0; t < D.transitionInvuln + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.ok(!b._grounded, "airborne after the beat");
  const hpAir = b.hp;
  b.takeDamage(60, g, 1, 0);
  assert.strictEqual(b.hp, hpAir, "out of the hit band while airborne");
  // force the slam cycle to the landing
  b._p2 = { mode: "slampause", t: 0.01, loops: 0, cbT: 9, tx: g.player.x, ty: g.player.y };
  b.state = "slampause";
  let guard = 0;
  while (!b._grounded && guard++ < 900) b.think(1 / 60, g);
  assert.strictEqual(b.state, "slamland");
  assert.ok(b._recoverT > 0 && b._recoverT <= D.slam.recovery);
  b.takeDamage(60, g, 1, 0);
  assert.strictEqual(b.hp, hpAir - 60, "vulnerable ONLY during landed recovery");
});

test("assman P2: slam ellipse is rim-true and the gust lane summons", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  g.gustLanes = [];
  const b = JH.makeEnemy("assman", 100, 40);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b._p2 = { mode: "slamfall", t: 0, loops: 1, cbT: 9, tx: 300, ty: 40 };   // loops odd → this landing summons
  b.x = 300; b.y = 40; b.state = "slamfall";
  const hp0 = g.player.hp;                        // player at the impact point
  let guard = 0;
  while (b.state !== "slamland" && guard++ < 900) b.think(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - D.slam.dmg, "landing ellipse caught the player");
  assert.strictEqual(g.gustLanes.length, 1, "every 2nd loop summons a gust lane");
  // outside the rim: safe
  const g2 = makeThinkGame(300 + D.slam.rx + 25, 40);
  g2.gustLanes = [];
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2.phase = 2; b2._grounded = false; b2.z = D.slam.airZ;
  b2._p2 = { mode: "slamfall", t: 0, loops: 0, cbT: 9, tx: 300, ty: 40 };
  b2.x = 300; b2.y = 40; b2.state = "slamfall";
  const hp2 = g2.player.hp;
  guard = 0;
  while (b2.state !== "slamland" && guard++ < 900) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "rim is hitbox");
});

test("assman P2: clap back wave travels the lane, dodged by depth", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(260, 40);
  const b = JH.makeEnemy("assman", 100, 40);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b._p2 = { mode: "shadow", t: 9, loops: 0, cbT: 0, tx: 0, ty: 0 };
  b.y = 40;                                       // same depth lane as the player
  b.think(1 / 60, g);
  assert.strictEqual(b._waves.length, 1, "clap back fired");
  const hp0 = g.player.hp;
  let guard = 0;
  while (b._waves.length && guard++ < 900) b.think(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - D.clapback.dmg, "wave crossed the player in-lane");
  // depth-dodged copy
  const g2 = makeThinkGame(260, 40 + D.clapback.band + 10);
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2.phase = 2; b2._grounded = false; b2.z = D.slam.airZ;
  b2._p2 = { mode: "shadow", t: 9, loops: 0, cbT: 0, tx: 0, ty: 0 };
  b2.y = 40;
  const hp2 = g2.player.hp;
  guard = 0;
  b2.think(1 / 60, g2);
  while (b2._waves.length && guard++ < 900) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "dodged by depth");
});

// ---- Phase 3 (Glute Force Trauma) + kneel ----

test("assman P3: storm rings expand, gap rotates, rim hits the player", () => {
  const D = JH.ASSMAN, S = D.storm;
  const g = makeThinkGame(0, 40);
  const b = JH.makeEnemy("assman", 200, 40);
  b.phase = 3; b._grounded = true;
  b.think(1 / 60, g);                             // arms the storm
  assert.ok(b._storm, "storm armed");
  // spawn all rings — the harness never runs Player.update(), so decay
  // invulnTimer by hand each frame (same house rule as the P1 toss test):
  // otherwise an incidental early graze from ring 0 sweeping past the
  // player's start position leaves i-frames permanently latched and the
  // intended hit below never lands.
  let guard = 0;
  while ((b._storm.spawned || 0) < S.rings && guard++ < 2000) {
    g.player.invulnTimer = Math.max(0, (g.player.invulnTimer || 0) - 1 / 60);
    b.think(1 / 60, g);
  }
  assert.strictEqual(b._storm.rings.length > 0, true);
  // gap centers rotate ring to ring
  const gaps = b._storm.rings.map((r) => r.gapA);
  if (gaps.length >= 2) assert.strictEqual((gaps[1] - gaps[0] + 360) % 360, S.gapRotDeg % 360);
  // park the player on a rim point opposite the freshest ring's gap → takes
  // ringDmg. The freshest (last-spawned) ring is used, not the oldest: by the
  // time all S.rings have spawned the oldest ring's r is already well into
  // its lifespan, and cullR (storm.cullR — burst length ~= spec's ~5s) can
  // retire it before its rim reaches a point this far out.
  const ring = b._storm.rings[b._storm.rings.length - 1];
  const away = (ring.gapA + 180) * Math.PI / 180;
  g.player.x = b.x + Math.cos(away) * (ring.r + 30);
  g.player.y = b.y + Math.sin(away) * (ring.r + 30) * 0.34;
  const hp0 = g.player.hp;
  guard = 0;
  while (g.player.hp === hp0 && guard++ < 2000) {
    g.player.invulnTimer = Math.max(0, (g.player.invulnTimer || 0) - 1 / 60);
    b.think(1 / 60, g);
  }
  assert.ok(g.player.hp <= hp0 - S.ringDmg, "expanding rim caught the player");
});

test("assman P3: exhaustion window — 1.25x damage taken, then next burst", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(0, 40);
  const b = JH.makeEnemy("assman", 200, 40);
  b.phase = 3; b._grounded = true;
  b.think(1 / 60, g);
  // fast-forward: exhaust after the burst completes
  let guard = 0;
  while (!(b._exhaustT > 0) && guard++ < 5000) b.think(1 / 60, g);
  assert.ok(b._exhaustT > 0, "exhaustion window opened");
  assert.strictEqual(b.state, "exhaust");
  const hp0 = b.hp;
  b.takeDamage(100, g, 1, 0);
  assert.strictEqual(b.hp, hp0 - 100 * D.exhaust.dmgTakenMult, "opening takes bonus damage");
});

test("assman P3: brawl window between storms, then recenter and re-arm", () => {
  const D = JH.ASSMAN, S = D.storm;
  const g = makeThinkGame(60, 40);
  g.bounds = { minX: 0, maxX: 480 };
  const b = JH.makeEnemy("assman", 400, 40);
  b.phase = 3; b._grounded = true;
  // run to the exhaustion window, then let it lapse
  let guard = 0;
  while (!(b._exhaustT > 0) && guard++ < 6000) b.think(1 / 60, g);
  assert.ok(b._exhaustT > 0, "reached exhaustion");
  while (b._exhaustT > 0 && guard++ < 8000) b.think(1 / 60, g);
  assert.ok(b._p3brawlT > 0, "brawl window armed after the opening");
  assert.strictEqual(b._storm, null, "storm cleared during the brawl");
  // brawl runs the P1 kit: within the window he must pick a move
  let sawMove = false;
  while (b._p3brawlT > 0 && guard++ < 12000) {
    b.think(1 / 60, g);
    if (b.move || ["clapwind", "hipbrace", "hipdash", "toss"].includes(b.state)) sawMove = true;
  }
  assert.ok(sawMove, "P1 moves fire during the brawl window");
  // after the brawl he recenters and a fresh storm arms
  while (!b._storm && guard++ < 20000) b.think(1 / 60, g);
  assert.ok(b._storm, "next storm armed after recentering");
  const cx0 = (g.bounds.minX + g.bounds.maxX) / 2;
  assert.ok(Math.abs(b.x - cx0) <= 20, "storm plants at arena center");
});

test("assman kneel: no death VFX, beat, then onEnemyKilled — and Slayer gated too", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(0, 40);
  let killed = null; let fxPushed = 0;
  g.onEnemyKilled = (e) => { killed = e; };
  g.embers = { push: () => { fxPushed++; } };
  const b = JH.makeEnemy("assman", 200, 40);
  b.phase = 3;
  b.takeDamage(b.hp + 10, g, 1, 0);               // lethal
  assert.ok(b._kneeling, "kneels instead of dying");
  assert.strictEqual(b.dead, false);
  assert.strictEqual(fxPushed, 0, "no corpse/explosion VFX");
  for (let t = 0; t < D.kneelBeat + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.strictEqual(b.dead, true);
  assert.strictEqual(killed, b, "routed through onEnemyKilled (ally path)");
  // Slayer: survivesDefeat gates its boom-big
  assert.strictEqual(JH.SLAYER.survivesDefeat, true);
});

test("telemetry payload carries wavesCleared and gameVersion", () => {
  require("../js/telemetry.js");
  const T = JH.Telemetry;
  let sent = null;
  T.configure({ endpoint: "x", enabled: true, gameVersion: JH.TELEMETRY.version });
  T._setTransport((p) => { sent = p; });
  T.startRun("testhandle");
  T.finishWin({ timeSec: 100, kills: 5, deaths: 0, sudsEarned: 10, finalWaveIndex: 35, finalWaveName: "BOSS" });
  assert.ok(sent, "payload sent");
  assert.strictEqual(sent.wavesCleared, 36, "win: finalWaveIndex + 1");
  assert.strictEqual(sent.gameVersion, JH.TELEMETRY.version);
});
