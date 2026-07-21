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
  for (const k of ["clap", "hip", "toss", "airfire", "slam", "storm", "exhaust"])
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

test("assman P1: big clap — suction pull, then rim-true radial blast", () => {
  const C = JH.ASSMAN.clap;
  const g = makeThinkGame(150, 40);              // inside blast range -> picks clap
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  b._decideT = 0; b._forceMove = "clap";
  b.think(1 / 60, g);
  assert.strictEqual(b.state, "charge", "the big clap opens with the charge");
  // suction: the charge drags the player toward the locked center
  const px0 = g.player.x;
  for (let t = 0; t < 0.5; t += 1 / 60) b.think(1 / 60, g);
  assert.ok(g.player.x < px0, "charge sucks the player toward the blast");
  const hp0 = g.player.hp;
  // run through the rest of the charge, the held clap beat, and the
  // expanding blast front (front travel = rx / blastSpeed)
  const runOut = C.charge + C.rx / C.blastSpeed + 0.3;
  let sawClapBeat = false;
  for (let t = 0.5; t < runOut; t += 1 / 60) {
    b.think(1 / 60, g);
    if (b.state === "clap" && b.move && b.move.blast) sawClapBeat = true;
  }
  assert.ok(sawClapBeat, "the clap frame holds while the front expands");
  assert.strictEqual(g.player.hp, hp0 - C.dmg, "blast front swept the player once");
  // parked outside the blast ellipse: pulled a little, but never hit
  const g2 = makeThinkGame(100 + C.rx + 200, 40);
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2._decideT = 0; b2._forceMove = "clap";
  b2.think(1 / 60, g2);
  const hp2 = g2.player.hp;
  for (let t = 0; t < C.charge + C.rx / C.blastSpeed + 0.3; t += 1 / 60) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "outside the drawn boundary: rim is hitbox");
  // dashing breaks the pull
  const g3 = makeThinkGame(150, 40);
  const b3 = JH.makeEnemy("assman", 100, 40);
  b3._decideT = 0; b3._forceMove = "clap";
  b3.think(1 / 60, g3);
  g3.player.dashTimer = 1;
  const px3 = g3.player.x;
  for (let t = 0; t < 0.4; t += 1 / 60) b3.think(1 / 60, g3);
  assert.strictEqual(g3.player.x, px3, "dash breaks the suction");
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

test("assman toss: artillery toilet lands, hits rim-true, stands up as a turret", () => {
  const T = JH.ASSMAN.toss;
  const g = makeThinkGame(200, 40);
  g.enemies = [];
  const bomb = new JH.ToiletBomb(100, 40, 200, 40, T, { turret: true });
  let alive = true, guard = 0;
  while (alive && guard++ < 600) alive = bomb.update(1 / 60, g);
  assert.ok(!alive, "bomb dies at touchdown");
  assert.strictEqual(g.player.hp, 100 - T.dmg, "impact hit applied once (player on the spot)");
  const turrets = g.enemies.filter((e) => e._bossTurret);
  assert.strictEqual(turrets.length, 1, "the porcelain stands up as a turret");
  assert.strictEqual(turrets[0].type, "bidet");
  // cap: with turretMax already alive, a new landing spawns nothing
  while (g.enemies.filter((e) => e._bossTurret && !e.dead).length < T.turretMax)
    g.enemies.push(Object.assign(JH.makeEnemy("bidet", 300, 40), { _bossTurret: true }));
  const bomb2 = new JH.ToiletBomb(100, 40, 260, 40, T, { turret: true });
  guard = 0; alive = true;
  while (alive && guard++ < 600) alive = bomb2.update(1 / 60, g);
  assert.strictEqual(g.enemies.filter((e) => e._bossTurret).length, T.turretMax, "turret cap holds");
});

test("assman P1: toss joins the mix on cooldown; turret spawns alternate", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);              // beyond the 120 no-point-blank floor
  g.enemies = [];
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies.push(b);
  // probabilistic pick (~28% when ready): within a bounded number of picks
  // the toss must appear, and it must arm its cooldown
  let picked = false, guard = 0;
  while (!picked && guard++ < 200) {
    b.move = null; b._skidT = 0; b._clapLock = null; b._decideT = 0; b._tossCdT = 0;
    b.x = 100; b.think(1 / 60, g);
    picked = b.state === "toss";
  }
  assert.ok(picked, "toss appears in the mix when off cooldown");
  assert.ok(b._tossCdT > 0 && b._tossCdT <= D.toss.cd, "cooldown armed at throw");
  // with the cooldown running, toss never picks
  for (let i = 0; i < 40; i++) {
    const b2 = JH.makeEnemy("assman", 100, 40);
    b2._tossCdT = D.toss.cd; b2._decideT = 0;
    b2.think(1 / 60, g);
    assert.notStrictEqual(b2.state, "toss", "cooldown blocks the artillery");
  }
  // alternation: throw 1 spawns a turret, throw 2 does not, throw 3 does
  const b3 = JH.makeEnemy("assman", 100, 40);
  const flags = [];
  for (let n = 0; n < 3; n++) {
    b3.move = null; b3._decideT = 0; b3._forceMove = "toss"; b3._tossCdT = 0;
    b3.think(1 / 60, g);
    flags.push(b3.move.turret);
    b3.move = null;
  }
  assert.deepStrictEqual(flags, [true, false, true], "artillery stands up every OTHER throw");
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
  b.think(1 / 60, g);                         // starts the clap charge
  assert.strictEqual(b.state, "charge");
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

test("assman: ambient gust lanes scale by phase and die with the kneel", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  g.gustLanes = [];
  g.enemies = [];
  const b = JH.makeEnemy("assman", 200, 40);
  g.enemies.push(b);
  b.think(1 / 60, g);
  assert.strictEqual(g.gustLanes.filter((l) => l._bossLane).length, D.lanes.byPhase[0], "phase 1 lane count");
  b.phase = 3; b._grounded = true;
  for (let i = 0; i < 5; i++) b.think(1 / 60, g);
  assert.strictEqual(g.gustLanes.filter((l) => l._bossLane).length, D.lanes.byPhase[2], "phase 3 lane count");
  assert.ok(g.gustLanes.every((l) => l.pushMult === D.lanes.pushMult), "boss lanes blow harder");
  const slots = g.gustLanes.filter((l) => l._bossLane).map((l) => l._slot);
  assert.strictEqual(new Set(slots).size, slots.length, "each lane owns a distinct third");
  assert.ok(g.gustLanes.filter((l) => l._bossLane).every((l) => l._bossT >= D.lanes.lifeMin - 0.2 && l._bossT <= D.lanes.lifeMax), "lanes expire and reshuffle");
  b.die(g);
  assert.strictEqual(g.gustLanes.filter((l) => l._bossLane).length, 0, "the wind dies with the kneel");
});

test("assman P1: hip check leaves a wind wake along the dash", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(360, 40);
  g.gustLanes = [];
  g.enemies = [];
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies.push(b);
  b._decideT = 0; b._forceMove = "hip";
  b.think(1 / 60, g);
  for (let t = 0; t < D.hip.brace + 0.1; t += 1 / 60) b.think(1 / 60, g);
  const wakes = g.gustLanes.filter((l) => l._bossT != null && !l._bossLane);
  assert.strictEqual(wakes.length, 1, "one wake lane on launch");
  assert.strictEqual(wakes[0].phase, "blow", "no telegraph — the dash is the telegraph");
  assert.strictEqual(wakes[0].y, 40, "wake lies on the dash line");
});

test("assman P2: slam ellipse is rim-true", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  g.gustLanes = [];
  const b = JH.makeEnemy("assman", 100, 40);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b._p2 = { mode: "slampause", t: 0.02, loops: 1, tx: 300, ty: 40 };
  b.x = 240; b.y = 40; b.state = "slampause";
  const hp0 = g.player.hp;                        // player at the dive target
  let guard = 0;
  while (b.state !== "slamland" && guard++ < 900) b.think(1 / 60, g);
  assert.strictEqual(Math.round(b.x), 300, "he lands ON the locked target — dived, not teleported");
  assert.strictEqual(g.player.hp, hp0 - D.slam.dmg, "landing ellipse caught the player");
  // the dodge contract: the telegraph chases until the dive LOCKS; moving
  // away during the dive travel escapes the rim
  const g2 = makeThinkGame(300, 40);
  g2.gustLanes = [];
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2.phase = 2; b2._grounded = false; b2.z = D.slam.airZ;
  b2._p2 = { mode: "slampause", t: 0.02, loops: 0, tx: 300, ty: 40 };
  b2.x = 240; b2.y = 40; b2.state = "slampause";
  guard = 0;
  while (b2._p2.mode !== "slamfall" && guard++ < 300) b2.think(1 / 60, g2);
  g2.player.x = 300 + D.slam.rx + 25;             // dash out AFTER the lock
  const hp2 = g2.player.hp;
  guard = 0;
  while (b2.state !== "slamland" && guard++ < 900) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "moved after the lock: rim is hitbox, no hit");
});

test("assman P2: flying fire — periodic marked bolts while patrolling", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  g.enemies = []; g.gustLanes = [];
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies.push(b);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b._p2 = { mode: "shadow", t: 9e9, loops: 0, tx: 0, ty: 0, fireT: 0.01, wx: 460, wy: 40 };
  let fired = 0, sawPose = false, guard = 0;
  while (fired < 2 && guard++ < 600) {
    b.think(1 / 60, g);
    fired = g.embers.filter((e) => e instanceof JH.AirBolt).length;
    if (b.state === "airclap") sawPose = true;
  }
  assert.strictEqual(fired, 2, "bolts fire on the airfire cadence");
  assert.ok(sawPose, "the airclap frame shows on each shot");
  // bolt contract: marked mini ellipse is the hit shape
  const bolt = new JH.AirBolt(300, 40, D.slam.airZ, g.player.x, g.player.y, D.airfire);
  const hp0 = g.player.hp;
  let alive = true; guard = 0;
  while (alive && guard++ < 300) alive = bolt.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - D.airfire.strafeDmg, "bolt impact rim-true");
});

test("assman P2: landing spawns the pressure ring — expanding rim hits once", () => {
  const D = JH.ASSMAN, RR = D.slam.ring;
  const g = makeThinkGame(2000, 40);              // player far: slam itself misses
  g.enemies = [];
  const b = JH.makeEnemy("assman", 300, 40);
  g.enemies.push(b);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b._p2 = { mode: "slampause", t: 0.02, loops: 0, tx: 300, ty: 40 };
  b.x = 300; b.y = 40; b.state = "slampause";
  // hold the player at the slam point through the lock, then step out past
  // the slam rim so only the RING can reach them
  g.player.x = 300; g.player.y = 40;
  let guard = 0;
  while (b._p2.mode !== "slamfall" && guard++ < 300) b.think(1 / 60, g);
  g.player.x = 300 + RR.maxR * 0.7; g.player.y = 40;
  guard = 0;
  while (!b._slamRing && guard++ < 900) b.think(1 / 60, g);
  assert.ok(b._slamRing, "ring spawned at touchdown");
  const hp0 = g.player.hp;
  guard = 0;
  while (b._slamRing && guard++ < 900) {
    g.player.invulnTimer = Math.max(0, (g.player.invulnTimer || 0) - 1 / 60);
    b.think(1 / 60, g);
  }
  assert.strictEqual(g.player.hp, hp0 - RR.dmg, "rim swept the player exactly once");
});

// ---- Phase 3 (Glute Force Trauma) + kneel ----

test("assman P3: storm rings expand, gap rotates, rim hits the player", () => {
  const D = JH.ASSMAN, S = D.storm;
  const g = makeThinkGame(0, 40);
  const b = JH.makeEnemy("assman", 200, 40);
  b.phase = 3; b._grounded = true;
  // storms plant center-arena: he recenters first, then the storm arms
  let guard0 = 0;
  while (!b._storm && guard0++ < 900) b.think(1 / 60, g);
  assert.ok(b._storm, "storm armed after recentering");
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

test("assman pose reads: glide for movement, slam-then-exhaust landing", () => {
  const D = JH.ASSMAN;
  const b = JH.makeEnemy("assman", 200, 40);
  b.state = "walk";
  assert.strictEqual(b.poseKey(), "flight", "ground movement glides on the flight pose");
  b.state = "slamland";
  b._recoverT = D.slam.recovery - D.slam.landPose * 0.5;   // just landed
  assert.strictEqual(b.poseKey(), "slam", "touchdown holds the ass-contact frame");
  b._recoverT = D.slam.recovery - D.slam.landPose - 0.1;   // past the hold
  assert.strictEqual(b.poseKey(), "exhaust", "then the open recovery read");
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
