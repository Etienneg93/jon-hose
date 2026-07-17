"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

// Capture the WAVE_TRIGGERS-length warning game.js emits at require time.
const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); realWarn(...a); };

global.window = global.window || {};
require("../js/config.js");
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/benedictions.js");   // Player.doSpray reads beneRank — load it like the game does
require("../js/entities.js");
require("../js/game.js");
console.warn = realWarn;
const JH = global.window.JH;
const Balance = require("../js/balance.js");

test("air act: ACT_STARTS gains the 6th act at wave 29", () => {
  assert.deepStrictEqual(JH.ACT_STARTS, [0, 5, 10, 16, 23, 29]);
  assert.strictEqual(Balance.actLevelForWave(29, JH.ACT_STARTS), 4);
  assert.strictEqual(Balance.actLevelForWave(31, JH.ACT_STARTS), 4);
  assert.strictEqual(Balance.actLevelForWave(28, JH.ACT_STARTS), 3);
});

test("air act: every act-indexed array has an entry for actLevel 4 (index 5)", () => {
  for (const [name, arr] of [
    ["TICKETS.budgets", JH.TICKETS.budgets],
    ["WAVEFLOW.fieldCap", JH.WAVEFLOW.fieldCap],
    ["SPRINKLE.counts", JH.SPRINKLE.counts],
    ["SPRINKLE.poolFloor", JH.SPRINKLE.poolFloor],
    ["SUPER_TUNE.hpByAct", JH.SUPER_TUNE.hpByAct],
    ["ELITE_FRAC", JH.ELITE_FRAC],
    ["SHOP.relicGradeOdds", JH.SHOP.relicGradeOdds],
  ]) assert.ok(arr.length >= 6, name + " needs 6 entries, has " + arr.length);
  // ELITE_FRAC is read UNCLAMPED (game.js waveEliteFrac) — a missing 6th
  // entry silently zeroes air-act elites.
  assert.ok(JH.ELITE_FRAC[5] > 0);
  assert.strictEqual(JH.SPRINKLE.poolFloor[5], JH.ACT_STARTS[5]);
});

test("air act: WAVE_TRIGGERS matches the wave list (no length warning)", () => {
  assert.strictEqual(warnings.filter((w) => w.includes("WAVE_TRIGGERS")).length, 0,
    "game.js warned: " + warnings.join(" | "));
  assert.strictEqual(JH.LEVEL1.waves.length, 35);  // 29 + the 6 air waves (30-35)
});

test("air act: waves 30-32 are authored per spec (pair, +gusts, +gasbags/tough)", () => {
  const w = JH.LEVEL1.waves;
  const types = (i) => w[i].spawns.map((g) => g.type);
  assert.deepStrictEqual([...new Set(types(29))].sort(), ["plunger", "tpmummy"]);
  assert.ok(!w[29].gusts && !w[29].tough);
  assert.ok(w[30].gusts && w[30].gusts.length >= 1, "wave 31 introduces gust lanes");
  assert.ok(types(31).includes("gasbag") && w[31].tough, "wave 32 adds gasbags + elite seasoning");
  // All four defs exist and are honest (waterMult 1).
  for (const t of ["plunger", "tpmummy", "gasbag", "bidet"])
    assert.strictEqual(JH.ENEMIES[t].waterMult, 1, t + " must not hide a soak");
});

test("air act: waves 33-35 extend progression per the Plan 2 authoring table", () => {
  const w = JH.LEVEL1.waves;
  const countsOf = (i) => {
    const c = {};
    w[i].spawns.forEach((g) => { c[g.type] = (c[g.type] || 0) + g.count; });
    return c;
  };
  // Wave 33: CLOUDLINE HOLDOUT — timed pool, terrain owns the read.
  assert.strictEqual(w[32].name, "CLOUDLINE HOLDOUT");
  assert.ok(w[32].holdout, "wave 33 is a holdout set-piece");
  assert.ok(w[32].cloudlineEdge, "wave 33 carries the cloud-edge flag");
  // holdDur is NOT duplicated on the wave — CLOUDLINE_HOLDOUT.holdDur is the
  // single source of truth Game.startWave reads for cloudlineEdge holdouts.
  assert.strictEqual(w[32].holdDur, undefined,
    "wave 33 must not duplicate CLOUDLINE_HOLDOUT.holdDur inline");
  assert.strictEqual(JH.CLOUDLINE_HOLDOUT.holdDur, 24, "the 24s duration lives in config only");
  assert.ok(w[32].gusts && w[32].gusts.length === 2 && w[32].gusts.every((g) => g.dir === 1),
    "two rightward gust lanes");
  assert.deepStrictEqual(countsOf(32), { plunger: 3, tpmummy: 3, gasbag: 2 });
  assert.ok(!w[32].placements && !w[32].superElite, "wave 33 has no Bidet/super");
  // Wave 34: PORCELAIN PATROL — one pre-placed Bidet + Super Plunger.
  assert.strictEqual(w[33].name, "PORCELAIN PATROL");
  assert.ok(w[33].tough);
  assert.strictEqual(w[33].superElite, "plunger");
  assert.strictEqual(w[33].placements.length, 1);
  assert.deepStrictEqual(countsOf(33), { plunger: 2, tpmummy: 2, gasbag: 2 });
  // Wave 35: FOUL WEATHER — two pre-placed Bidets + Super Gasbag.
  assert.strictEqual(w[34].name, "FOUL WEATHER");
  assert.ok(w[34].tough);
  assert.strictEqual(w[34].superElite, "gasbag");
  assert.strictEqual(w[34].placements.length, 2);
  assert.deepStrictEqual(countsOf(34), { plunger: 3, tpmummy: 3, gasbag: 2 });
  assert.ok(w[34].gusts && w[34].gusts.length === 2
    && w[34].gusts.some((g) => g.dir === 1) && w[34].gusts.some((g) => g.dir === -1),
    "wave 35 carries two opposed gust lanes");
});

test("air act placements: every pre-placed enemy is a Bidet inside the 440px arena/depth band", () => {
  const arenaW = JH.VIEW_W - 40;   // matches Game.startWave bounds (left+20 .. right-20)
  const placed = JH.LEVEL1.waves.filter((w) => w.placements && w.placements.length);
  assert.ok(placed.length >= 2, "wave 34 and 35 must carry placements");
  for (const w of placed) {
    for (const p of w.placements) {
      assert.strictEqual(p.type, "bidet", w.name + " placement must be a Bidet");
      assert.ok(p.x >= 0 && p.x <= arenaW, w.name + " placement x sits inside the arena band");
      assert.ok(p.y >= JH.DEPTH_MIN && p.y <= JH.DEPTH_MAX, w.name + " placement y sits inside the depth band");
    }
  }
});

test("air act: wave 32 clearing no longer wins; wave 35 clearing temporarily does", () => {
  const prevMusic = JH.Music;
  JH.Music = Object.assign({}, prevMusic, { setTrack() {} });
  const doc = global.document;
  global.document = { getElementById: () => ({ textContent: "", classList: { add() {}, remove() {} }, style: {} }) };
  try {
    const runClear = (waveIndex) => {
      const g = Object.create(JH.Game);
      g.player = stubPlayer(100, 40);
      g.sigils = []; g.relics = {}; g.checkpointWave = JH.ACT_STARTS[5];
      g.bounds = { minX: 0, maxX: 480 };
      g.spawnPickup = () => {}; g.grantXp = () => {}; g.spawnVendor = () => {}; g.banner = () => {};
      let wonAt = null;
      g.win = function () { wonAt = this.waveIndex; };
      g.waveIndex = waveIndex; g.waveActive = true;
      g.waveCleared_();
      return wonAt;
    };
    assert.strictEqual(runClear(31), null, "clearing wave 32 (index 31) must not win anymore");
    const lastIdx = JH.LEVEL1.waves.length - 1;
    assert.strictEqual(lastIdx, 34, "wave 35 is temporarily the last wave");
    assert.strictEqual(runClear(lastIdx), lastIdx, "clearing wave 35 still calls win() (temporary, Plan 3 moves it)");
  } finally { global.document = doc; JH.Music = prevMusic; }
});

test("holdout cadence: Cloudline (wave 33) reads CLOUDLINE_HOLDOUT's cap; the older holdout keeps JH.WALL's", () => {
  const cloudWave = JH.LEVEL1.waves[32];
  assert.ok(cloudWave.cloudlineEdge, "premise: wave 33 carries the cloud-edge flag");
  assert.deepStrictEqual(JH.Game.holdoutCadence(cloudWave),
    { spawnEvery: JH.CLOUDLINE_HOLDOUT.spawnEvery, maxAlive: JH.CLOUDLINE_HOLDOUT.maxAlive });
  assert.strictEqual(JH.CLOUDLINE_HOLDOUT.maxAlive, 4, "premise: reinforcement cap is 4");
  const oldIdx = JH.LEVEL1.waves.findIndex((w) => w.name === "HOLD THE LINE");
  const oldWave = JH.LEVEL1.waves[oldIdx];
  assert.ok(oldWave.holdout && !oldWave.cloudlineEdge, "premise: an older holdout with no cloud edge");
  assert.deepStrictEqual(JH.Game.holdoutCadence(oldWave),
    { spawnEvery: JH.WALL.spawnEvery, maxAlive: JH.WALL.maxAlive });
  assert.notStrictEqual(JH.WALL.maxAlive, JH.CLOUDLINE_HOLDOUT.maxAlive,
    "premise: the two cadences must actually differ for this test to mean anything");
});

test("cloudline holdout: startWave reads its 24s duration from config and posts the exact edge-warning banner", () => {
  JH.Camera.reset();
  const g = Object.create(JH.Game);
  g.player = stubPlayer(0, 40);
  g.enemies = []; g.dropBudget = { suds: 0, items: 0 };
  g.sigils = [];
  let bannerText = null;
  g.banner = (t) => { bannerText = t; };
  g.startWave(32);
  assert.strictEqual(g.holdoutTimer, JH.CLOUDLINE_HOLDOUT.holdDur, "holdoutTimer sources from CLOUDLINE_HOLDOUT, not a wave literal");
  assert.strictEqual(bannerText, "CLOUDLINE HOLDOUT — STAY OFF THE EDGE!");
});

test("hold the line (older holdout): startWave keeps its own inline holdDur and banner line unchanged", () => {
  JH.Camera.reset();
  const oldIdx = JH.LEVEL1.waves.findIndex((w) => w.name === "HOLD THE LINE");
  const g = Object.create(JH.Game);
  g.player = stubPlayer(0, 40);
  g.enemies = []; g.dropBudget = { suds: 0, items: 0 };
  g.sigils = [];
  let bannerText = null;
  g.banner = (t) => { bannerText = t; };
  g.startWave(oldIdx);
  assert.strictEqual(g.holdoutTimer, JH.LEVEL1.waves[oldIdx].holdDur, "unchanged: still its own wave-authored holdDur");
  assert.strictEqual(bannerText, "HOLD THE LINE!  SURVIVE!");
});

test("cloudline holdout: timer expiry clears infinite enemies + gusts + edge, and awards the reward set exactly once", () => {
  const prevDoc = global.document, prevMusic = JH.Music;
  global.document = { getElementById: () => ({ classList: { add() {}, remove() {} }, textContent: "", style: {} }) };
  JH.Music = { setTrack() {} };
  try {
    const g = Object.create(JH.Game);
    g.player = stubPlayer(100, 40);
    g.waveIndex = 32;   // CLOUDLINE HOLDOUT
    g.waveActive = true;
    g.beneUsedOnce = {}; g.sigils = []; g.relics = {}; g.checkpointWave = JH.ACT_STARTS[5];
    g.bounds = { minX: 0, maxX: 480 };
    g.gustLanes = [new JH.GustLane(18, 1), new JH.GustLane(68, 1)];
    g.cloudlineEdge = new JH.CloudlineEdge(400);
    const mook = JH.makeEnemy("mook", 100, 40); mook.infinite = true;
    const boss = JH.makeEnemy("mook", 120, 40); boss.infinite = true; boss.isBoss = true;
    g.enemies = [mook, boss];
    let crossCalls = 0, xpCalls = 0;
    g.spawnPickup = (kind) => { if (kind === "cross") crossCalls++; };
    g.grantXp = () => { xpCalls++; };
    g.spawnVendor = () => {}; g.banner = () => {}; g.win = () => { throw new Error("must not win mid-act"); };
    // Same idiom the update() holdout branch runs when holdoutTimer <= 0.
    for (const e of g.enemies) if (!e.dead && !e.isBoss) e.dead = true;
    g.waveCleared_();
    assert.strictEqual(mook.dead, true, "infinite non-boss enemy is force-cleared, no mop-up required");
    assert.strictEqual(boss.dead, false, "the isBoss guard is respected (never force-killed)");
    assert.deepStrictEqual(g.gustLanes, [], "gust lanes clear with the wave");
    assert.strictEqual(g.cloudlineEdge, null, "the cloud edge hazard clears with the wave");
    assert.strictEqual(crossCalls, 1, "cross reward granted exactly once");
    assert.strictEqual(xpCalls, 1, "set-piece XP granted exactly once");
    assert.strictEqual(g.waveActive, false, "waveActive flips off so the same expiry can't fire twice");
  } finally {
    global.document = prevDoc; JH.Music = prevMusic;
  }
});

test("air act: placements + super + opening regulars never exceed the Air field cap", () => {
  const cap = JH.WAVEFLOW.fieldCap[5];
  for (const idx of [33, 34]) {   // wave 34 (Porcelain Patrol), wave 35 (Foul Weather)
    JH.Camera.reset();
    const g = Object.create(JH.Game);
    g.player = stubPlayer(0, 40);
    g.enemies = []; g.dropBudget = { suds: 0, items: 0 };
    g.sigils = []; g.banner = () => {};
    g.startWave(idx);
    assert.ok(g.enemies.length <= cap,
      JH.LEVEL1.waves[idx].name + " opening field (" + g.enemies.length + ") exceeds field cap " + cap);
  }
});

test("air act: pre-existing superElite waves without placements keep the old cap+1 opening field", () => {
  // Placement-slot reservation (js/game.js startWave) must apply ONLY to
  // waves that carry placements. Seven shipped, already-playtested waves
  // (STALKER AMBUSH, WAVE 6, WAVE 7, OVERRUN, FIRE INTRO, EMBER RUSH,
  // MELTDOWN) authored superElite with no placements and must keep opening
  // fieldCap regulars plus the super on top (peak cap+1) exactly as before.
  const idx = JH.LEVEL1.waves.findIndex((w) => w.name === "STALKER AMBUSH");
  const wave = JH.LEVEL1.waves[idx];
  assert.ok(wave.superElite && !wave.placements, "STALKER AMBUSH must stay a superElite wave with no placements");
  const actLevel = Balance.actLevelForWave(idx, JH.ACT_STARTS);
  const cap = Balance.ticketBudget(actLevel, JH.WAVEFLOW.fieldCap);
  JH.Camera.reset();
  const g = Object.create(JH.Game);
  g.player = stubPlayer(0, 40);
  g.enemies = []; g.dropBudget = { suds: 0, items: 0 };
  g.sigils = []; g.banner = () => {};
  g.startWave(idx);
  assert.strictEqual(g.enemies.length, cap + 1,
    "a superElite wave without placements must open fieldCap (" + cap + ") regulars plus the super, not fewer");
});

test("air act: wave 34 spawns exactly one Super Plunger, wave 35 exactly one Super Gasbag — never swapped, never doubled", () => {
  const cases = [[33, "plunger"], [34, "gasbag"]];
  for (const [idx, expectType] of cases) {
    JH.Camera.reset();
    const g = Object.create(JH.Game);
    g.player = stubPlayer(0, 40);
    g.enemies = []; g.dropBudget = { suds: 0, items: 0 };
    g.sigils = []; g.banner = () => {};
    g.startWave(idx);
    const supers = g.enemies.filter((e) => e.superElite);
    assert.strictEqual(supers.length, 1,
      JH.LEVEL1.waves[idx].name + " must spawn exactly one super-elite, got " + supers.length);
    assert.strictEqual(supers[0].type, expectType,
      JH.LEVEL1.waves[idx].name + " super must be " + expectType + ", not " + supers[0].type);
  }
});

test("air act: pre-placed Bidets are live wave members — block clear until killed, never sprinkled, die through the normal lifecycle", () => {
  JH.Camera.reset();
  const g = Object.create(JH.Game);
  g.player = stubPlayer(0, 40);
  g.enemies = []; g.dropBudget = { suds: 0, items: 0 };
  g.sigils = []; g.banner = () => {};
  g.startWave(33);   // PORCELAIN PATROL: one pre-placed Bidet
  const bidets = g.enemies.filter((e) => e.type === "bidet");
  assert.strictEqual(bidets.length, 1, "wave 34 opens with its one placed Bidet live on the field");
  assert.ok(!g.wavePool.includes("bidet"), "Bidet must never queue into the reinforcement pool");
  assert.ok(g.wavePool.length > 0, "premise: wave 34 still has queued regulars at open (10 authored - 6 open = 4)");
  // The wave's actual clear gate — js/game.js:2464, quoted verbatim — is a
  // CONJUNCTION: enemies.length===0 AND wavePool is empty. Evaluate exactly
  // that expression rather than approximating it.
  const clearGate = (game) => game.enemies.length === 0 && (!game.wavePool || game.wavePool.length === 0);
  // Kill everything except the Bidet; queued regulars (wavePool) are still
  // untouched, so the real gate must stay false even with the field empty
  // of everything but the Bidet — queued regulars block clear too.
  for (const e of g.enemies) if (e !== bidets[0]) e.dead = true;
  g.enemies = g.enemies.filter((e) => !e.dead);
  assert.deepStrictEqual(g.enemies, bidets, "the Bidet is the only live enemy left on the field");
  assert.strictEqual(clearGate(g), false,
    "wave must not be clearable while its placement is alive, even before checking wavePool");
  // Kill the Bidet through the same takeDamage/die path every other enemy
  // uses — no special despawn function exists for placements (verified: no
  // "placement" reference anywhere outside spawnWavePlacements itself).
  const hg = stubHazardGame(0, 40);
  bidets[0].takeDamage(9999, hg, 0, 0);
  assert.strictEqual(bidets[0].dead, true, "Bidet dies through the standard Enemy.die path");
  g.enemies = g.enemies.filter((e) => !e.dead);
  assert.strictEqual(clearGate(g), false,
    "Bidet dead but wavePool still holds queued regulars — the real conjunction still blocks clear");
  // Drain the queue (as reinforcement trickle would over time) — only now
  // does the real two-part gate flip true.
  g.wavePool = [];
  assert.strictEqual(clearGate(g), true,
    "with the Bidet dead AND wavePool empty, the real conjunction now clears the wave");
});

test("air act: wave 35's two placements + super reserve 3 of 8 opening slots; 5 regulars open, 7 queue for later surges", () => {
  const cap = JH.WAVEFLOW.fieldCap[5];
  assert.strictEqual(cap, 8, "premise: Air field cap is 8");
  JH.Camera.reset();
  const g = Object.create(JH.Game);
  g.player = stubPlayer(0, 40);
  g.enemies = []; g.dropBudget = { suds: 0, items: 0 };
  g.sigils = []; g.banner = () => {};
  g.startWave(34);   // FOUL WEATHER
  const wave = JH.LEVEL1.waves[34];
  assert.strictEqual(wave.placements.length, 2, "premise: two pre-placed Bidets");
  const regulars = g.enemies.filter((e) => e.type !== "bidet" && !e.superElite);
  assert.strictEqual(regulars.length, 5, "8 cap - 2 placements - 1 super = 5 regulars open");
  const authoredTotal = 3 + 3 + 2 + (JH.SPRINKLE.counts[5] || 0);   // plunger+tpmummy+gasbag + Air sprinkles
  assert.strictEqual(authoredTotal, 12, "premise: 12 authored regulars (3 plunger + 3 tpmummy + 2 gasbag + 4 sprinkles)");
  assert.strictEqual(g.wavePool.length, authoredTotal - regulars.length,
    "the remaining 7 regulars stay queued in wavePool for reinforcement surges");
  assert.strictEqual(g.wavePool.length, 7);
});

test("dev range catalog exposes every implemented combat enemy and boss", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "entities.js"), "utf8");
  const factory = source.slice(source.indexOf("JH.makeEnemy = function"));
  const explicit = [...factory.matchAll(/type === "([^"]+)"/g)].map((m) => m[1]);
  const implemented = new Set(["mook", ...explicit.filter((id) => id !== "dummy")]);
  const catalog = JH.RANGE_CATALOG_ENEMIES.map((e) => e.id);
  assert.strictEqual(new Set(catalog).size, catalog.length, "catalog entries must be unique");
  assert.deepStrictEqual([...catalog].sort(), [...implemented].sort());
  for (const id of ["plunger", "tpmummy", "gasbag", "bidet"])
    assert.ok(catalog.includes(id), id + " must be dispensable in the range");
  for (const id of ["boss", "switch", "quake", "gatewaykrusher", "wallboss", "slayer"])
    assert.ok(catalog.includes(id), id + " boss must be dispensable in the range");
});

test("plunger art: every runtime pose is a normalized transparent PNG frame", () => {
  const decoded = {};
  for (const pose of ["idle0", "idle1", "walk0", "walk1", "walk2", "walk3",
    "wind", "lunge", "latch", "death"]) {
    const png = fs.readFileSync(path.join(__dirname, "..", "sprites", "plunger", pose + ".png"));
    assert.strictEqual(png.toString("ascii", 1, 4), "PNG", pose + " must be a PNG");
    assert.strictEqual(png.readUInt32BE(16), 160, pose + " width");
    assert.strictEqual(png.readUInt32BE(20), 160, pose + " height");
    decoded[pose] = PNG.sync.read(png);
  }
  const differingPixels = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4)
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1]
          || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) n++;
    return n;
  };
  // The contact frames must be visibly opposite strides. The hand-cleaned
  // cycle intentionally reuses the neutral pass pose for frames 1 and 3.
  assert.ok(differingPixels(decoded.walk0, decoded.walk2) > 2500, "walk2 must oppose walk0");
  assert.ok(differingPixels(decoded.walk0, decoded.walk1) > 2500, "walk1 must be a distinct pass pose");
  assert.ok(differingPixels(decoded.walk2, decoded.walk3) > 2500, "walk3 must be a distinct pass pose");
});

test("tpmummy art: every runtime pose is a normalized transparent PNG frame", () => {
  const dims = (name, w, h) => {
    const png = fs.readFileSync(path.join(__dirname, "..", "sprites", "tpmummy", name + ".png"));
    assert.strictEqual(png.toString("ascii", 1, 4), "PNG", name + " must be a PNG");
    assert.strictEqual(png.readUInt32BE(16), w, name + " width");
    assert.strictEqual(png.readUInt32BE(20), h, name + " height");
    return PNG.sync.read(png);
  };
  const feetRow = (png) => {
    for (let y = png.height - 1; y >= 0; y--)
      for (let x = 0; x < png.width; x++)
        if (png.data[(y * png.width + x) * 4 + 3]) return y;
    return -1;
  };
  // Body poses: 112x116 canvas (4x logical), shared feet baseline row 111.
  for (const pose of ["idle0", "idle1", "walk0", "walk1", "walk2", "walk3",
    "wind", "release", "hurt", "drop0", "unravel0", "unravel1"])
    assert.strictEqual(feetRow(dims(pose, 112, 116)), 111, pose + " feet baseline");
  // FX canvases: death puff 112x64, wrap projectile 64x32.
  dims("puff0", 112, 64); dims("puff1", 112, 64);
  dims("wrap0", 64, 32); dims("wrap1", 64, 32);
});

test("air act: sprinkle pool floor keeps fire enemies out of the air roster", () => {
  const pool = Balance.unlockedPool(JH.LEVEL1.waves, 30, JH.ACT_STARTS[5]);
  assert.ok(pool.includes("plunger") && pool.includes("tpmummy"));
  for (const t of ["fuse", "smelt", "furnace", "mook", "charger", "pyro"])
    assert.ok(!pool.includes(t), t + " must not sprinkle into the air act");
  // Default arg unchanged: full pool from wave 0.
  assert.ok(Balance.unlockedPool(JH.LEVEL1.waves, 30).includes("mook"));
  // Bidet is a placement-only enemy: it never appears in any wave's `spawns`
  // list, so it can never enter the unlocked pool that sprinkles draw from —
  // double-enforced by SPRINKLE.weights.bidet === 0.
  const poolAtWave35 = Balance.unlockedPool(JH.LEVEL1.waves, 34, JH.SPRINKLE.poolFloor[5]);
  assert.ok(!poolAtWave35.includes("bidet"), "Bidet must never enter the sprinkle pool, even by wave 35");
  assert.strictEqual(JH.SPRINKLE.weights.bidet, 0, "belt-and-suspenders: Bidet's sprinkle weight is 0");
});

function stubPlayer(x, y) {
  JH.Upgrades.reset();
  const p = new JH.Player(x, y);
  return p;
}
function stubHazardGame(px, py) {
  return {
    player: Object.assign(stubPlayer(px, py), { x: px, y: py }),
    enemies: [], embers: [], particles: [], firePatches: [], shields: [],
    stinkClouds: [], gustLanes: [],
    bounds: { minX: 0, maxX: 480 },
    audio: { play() {} }, shake() {}, hitStop() {}, defer() {},
    killJuice() {}, dropLoot() {}, onEnemyKilled() {}, spawnEnemy() {},
    canAttack() { return true; }, sigils: [], banner() {}, combo: 0,
  };
}

test("stink cloud: grows in from the vent point, never spawns full size", () => {
  const c = new JH.StinkCloud(100, 40);
  assert.ok(c.footprint().rx < JH.STINK.radius * 0.3, "t=0 must be near-point");
  c.t = JH.STINK.growT;
  assert.ok(Math.abs(c.footprint().rx - JH.STINK.radius) < 0.001, "full size at growT");
});

test("stink cloud rim: inside tags player.gasT, outside (x and depth) does not", () => {
  const S = JH.STINK;
  const g = stubHazardGame(100, 40);
  const c = new JH.StinkCloud(100, 40); c.t = S.growT;   // full grown
  g.stinkClouds.push(c);
  const f = c.footprint(), pad = g.player.bodyW * 0.25;
  // inside the rim (x axis)
  g.player.x = 100 + f.rx + pad - 2; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.ok(g.player.gasT > 0, "inside rim must tag gasT");
  // outside the rim (x axis)
  g.player.x = 100 + f.rx + pad + 3; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.strictEqual(g.player.gasT, 0, "outside rim must not tag");
  // outside in DEPTH: rim ry = rx*GROUND_RY, so depth f.rx would be a circle bug
  g.player.x = 100; g.player.y = 40 + f.rx * 0.8; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.strictEqual(g.player.gasT, 0, "depth uses the flattened ellipse");
});

test("gas chokes the nozzle to the STINK clog scales at EVERY tank level", () => {
  const g = stubHazardGame(100, 40);
  const p = g.player;
  // Mid tank: gassed reach = clog rangeMult (was the only case that bit before).
  p.water = p.stats.maxWater * 0.5;
  p.gasT = 0; p.doSpray(1 / 60, g);
  const midClean = p._dbgReach;
  p.gasT = 0.15; p.doSpray(1 / 60, g);
  assert.ok(p._dbgReach < midClean, "mid-tank gassed reach must shrink");
  assert.ok(Math.abs(p._dbgReach - p.stats.sprayRange * JH.STINK.gasRangeMult) < 0.001,
    "gassed range = STINK.gasRangeMult");
  // Full tank: the regression case — the stream must ALSO shorten here (a
  // one-tier demote left it at full range, so gas read as nothing on top).
  p.water = p.stats.maxWater;
  p.gasT = 0; p.doSpray(1 / 60, g);
  const fullClean = p._dbgReach;
  p.gasT = 0.15; p.doSpray(1 / 60, g);
  assert.ok(p._dbgReach < fullClean, "full-tank gassed reach must shrink too");
  assert.ok(Math.abs(p._dbgReach - p.stats.sprayRange * JH.STINK.gasRangeMult) < 0.001,
    "full-tank gassed range clamps to the same clog scale");
});

test("gas debuff lingers like burn: one contact sets the full window", () => {
  const g = stubHazardGame(100, 40);
  const p = g.player;
  const c = new JH.StinkCloud(100, 40); c.t = JH.STINK.growT;   // full grown, on the player
  g.stinkClouds.push(c);
  p.gasT = 0;
  c.update(1 / 60, g);
  // A single contact refreshes to the FULL debuff window (was a 0.15s flicker
  // that vanished the instant you left — the "too short" report).
  assert.ok(Math.abs(p.gasT - JH.STINK.gasDebuffDur) < 1e-9, "contact sets gasDebuffDur");
  assert.ok(JH.STINK.gasDebuffDur > 1, "the window is impactful, not a flicker");
  // Refresh (not stack): re-contact holds at the cap, never climbs past it.
  p.gasT = JH.STINK.gasDebuffDur - 0.5;
  c.update(1 / 60, g);
  assert.ok(Math.abs(p.gasT - JH.STINK.gasDebuffDur) < 1e-9, "re-contact refreshes to the cap");
});

test("spraying into a cloud disperses it; speed scales with spray damage", () => {
  const g = stubHazardGame(100, 40);
  const c = new JH.StinkCloud(150, 40); c.t = JH.STINK.growT;
  g.stinkClouds.push(c);
  g.player.facing = 1; g.player.water = g.player.stats.maxWater;
  g.player.doSpray(1 / 60, g);
  const base = c.sprayProgress;
  assert.ok(base > 0, "stream over the cloud must add dispersal progress");
  c.sprayProgress = 0;
  g.player.stats.sprayDamage = JH.PLAYER.sprayDamage * 2;
  g.player.doSpray(1 / 60, g);
  assert.ok(c.sprayProgress > base * 1.5, "dispersal scales with spray damage");
  c.sprayProgress = JH.STINK.disperseDur;
  assert.ok(c.fadeFrac() >= 1, "fully dispersed cloud is gone");
});

test("friendly cloud cooks enemies, ignores the player; hostile stack check", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("mook", 100, 40);   // any live enemy works
  g.enemies.push(e);
  const fc = JH.spawnStinkCloud(g, 100, 40, { friendly: true });
  fc.t = JH.STINK.growT;
  const hp0 = e.hp; g.player.gasT = 0;
  fc.update(0.5, g);
  assert.ok(e.hp < hp0, "friendly cloud damages enemies");
  assert.strictEqual(g.player.gasT, 0, "friendly cloud never gasses Jon");
  // Hostile clouds don't stack on the same spot; friendly always spawns.
  const h1 = JH.spawnStinkCloud(g, 200, 40); h1.t = JH.STINK.growT;
  assert.strictEqual(JH.spawnStinkCloud(g, 200, 40), null);
  assert.ok(JH.spawnStinkCloud(g, 200, 40, { friendly: true }) !== null);
});

test("gust lane rim: the drawn band edge is the push edge; telegraph never pushes", () => {
  const G = JH.GUST;
  const g = stubHazardGame(200, 40);
  const lane = new JH.GustLane(40, 1);
  g.gustLanes.push(lane);
  lane.phase = "blow"; lane.phaseT = G.blowDur;
  // inside the band
  g.player.y = 40 + G.band - 1; const x0 = g.player.x;
  lane.update(1 / 60, g);
  assert.ok(g.player.x > x0, "inside the band: pushed along +X");
  // just outside the band
  g.player.y = 40 + G.band + 1; const x1 = g.player.x;
  lane.update(1 / 60, g);
  assert.strictEqual(g.player.x, x1, "outside the drawn edge: untouched");
  // telegraph phase never pushes
  lane.phase = "telegraph"; lane.phaseT = G.telegraph;
  g.player.y = 40; const x2 = g.player.x;
  lane.update(1 / 60, g);
  assert.strictEqual(g.player.x, x2);
});

test("gust lane: displaces light enemies; emplacements and bosses hold fast", () => {
  const g = stubHazardGame(200, 0);
  const lane = new JH.GustLane(40, 1);
  lane.phase = "blow"; lane.phaseT = JH.GUST.blowDur;
  const mook = JH.makeEnemy("mook", 100, 40);
  const turret = JH.makeEnemy("bidet", 140, 40);
  const boss = JH.makeEnemy("mook", 180, 40); boss.isBoss = true;
  g.enemies.push(mook, turret, boss);
  lane.update(1 / 60, g);
  assert.ok(mook.x > 100, "light enemy shoved");
  assert.strictEqual(turret.x, 140, "speed-0 emplacement immune");
  assert.strictEqual(boss.x, 180, "boss immune");
});

test("gust lane cycle: telegraph -> blow -> gap -> telegraph", () => {
  const G = JH.GUST;
  const g = stubHazardGame(0, 0);
  const lane = new JH.GustLane(40, 1);
  assert.strictEqual(lane.phase, "telegraph");
  lane.update(G.telegraph + 0.01, g);
  assert.strictEqual(lane.phase, "blow");
  lane.update(G.blowDur + 0.01, g);
  assert.strictEqual(lane.phase, "gap");
  lane.update(G.gapDur + 0.01, g);
  assert.strictEqual(lane.phase, "telegraph");
});

test("cloudline edge rim: front rim one epsilon inside does not cross; touching crosses", () => {
  const edge = new JH.CloudlineEdge(400);
  const p = stubPlayer(0, 40);
  const half = p.bodyW * 0.5;
  p.x = edge.x - half - 0.01;
  assert.strictEqual(edge.crossed(p), false, "one epsilon inside must not cross");
  p.x = edge.x - half;
  assert.strictEqual(edge.crossed(p), true, "front rim touching the line crosses");
});

test("cloudline edge: crossing resets Jon inward and the 12 HP penalty routes through takeHit only", () => {
  const C = JH.CLOUDLINE_HOLDOUT;
  const g = stubHazardGame(400, 40);
  const edge = new JH.CloudlineEdge(400);
  g.cloudlineEdge = edge;
  const hp0 = g.player.hp;
  g.player.x = edge.x;   // touching the line -> crossed
  edge.update(1 / 60, g);
  assert.ok(Math.abs(g.player.x - (edge.x - C.resetDist)) < 0.001,
    "crossing resets to edge.x - resetDist");
  assert.strictEqual(hp0 - g.player.hp, C.edgeDmg,
    "exactly the configured edge damage lands, through Player.takeHit");
  assert.ok(g.player.alive, "never an instant kill by a special path — normal takeHit owns HP/death");
});

test("cloudline edge: positional reset happens even when takeHit negates the hit (i-frames)", () => {
  const C = JH.CLOUDLINE_HOLDOUT;
  const g = stubHazardGame(400, 40);
  const edge = new JH.CloudlineEdge(400);
  g.player.invulnTimer = 1;   // takeHit will return false and skip HP loss
  const hp0 = g.player.hp;
  g.player.x = edge.x;
  edge.update(1 / 60, g);
  assert.ok(Math.abs(g.player.x - (edge.x - C.resetDist)) < 0.001,
    "positional reset is unconditional, independent of takeHit's landed/negated result");
  assert.strictEqual(g.player.hp, hp0, "a negated hit costs no HP");
});

test("cloudline edge: repeated update after reset cannot multi-hit on adjacent frames", () => {
  const g = stubHazardGame(400, 40);
  const edge = new JH.CloudlineEdge(400);
  g.player.x = edge.x;
  edge.update(1 / 60, g);
  const hpAfterFirst = g.player.hp;
  const xAfterFirst = g.player.x;
  edge.update(1 / 60, g);   // very next fixed-step frame
  assert.strictEqual(g.player.hp, hpAfterFirst, "no second HP hit lands on the adjacent frame");
  assert.strictEqual(g.player.x, xAfterFirst, "no second reset displaces Jon further on the adjacent frame");
});

test("plunger: lunge contact latches and drains WATER, not HP", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  g.enemies.push(e);
  e.state = "lunge"; e.attackTimer = JH.ENEMIES.plunger.lungeDur;
  e.aimAng = 0; e.spawnGrace = 0;
  const hp0 = g.player.hp, w0 = g.player.water;
  e.think(1 / 60, g);
  assert.strictEqual(e.state, "latch");
  e.think(1, g);   // one full latched second
  assert.ok(w0 - g.player.water >= JH.ENEMIES.plunger.latchDrain * 0.99,
    "latch drains latchDrain water/s");
  assert.ok(g.player.hp >= hp0 - JH.ENEMIES.plunger.lungeDmg,
    "only the lunge hit touches HP, the latch itself never does");
});

test("plunger: a dash breaks the latch; latch ignores spray knockback", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 100, 40);
  e.state = "latch"; e.latchT = 2;
  e.applyKnockback(1, 500);
  assert.strictEqual(e.knockVX || 0, 0, "suction holds through knockback");
  g.player.dashTimer = 0.1;
  e.think(1 / 60, g);
  assert.notStrictEqual(e.state, "latch", "dash pops it off");
  assert.ok(e.cdTimer > 0, "broken latch goes on lunge cooldown");
});

test("plunger: dash i-frames also dodge the lunge grab itself", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  e.state = "lunge"; e.attackTimer = JH.ENEMIES.plunger.lungeDur; e.aimAng = 0;
  g.player.dashTimer = 0.1;
  e.think(1 / 60, g);
  assert.notStrictEqual(e.state, "latch");
});

test("plunger: a dodged lunge (dodge chance) grabs nothing — no latch, no drain", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  g.enemies.push(e);
  e.state = "lunge"; e.attackTimer = JH.ENEMIES.plunger.lungeDur;
  e.aimAng = 0; e.spawnGrace = 0; e.usingTicket = true;
  g.player.stats.dodgeChance = 1;   // guaranteed dodge — takeHit reports false
  const hp0 = g.player.hp, w0 = g.player.water;
  e.think(1 / 60, g);
  assert.strictEqual(e.state, "idle", "dodged lunge aborts instead of latching");
  assert.ok(e.cdTimer > 0, "aborted lunge goes on lunge cooldown");
  assert.strictEqual(e.usingTicket, false, "attack ticket released");
  assert.strictEqual(g.player.hp, hp0, "dodged hit deals no damage");
  assert.strictEqual(g.player.water, w0, "no latch tick ever runs");
});

test("plunger: death frame lingers cosmetically without delaying enemy death", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  e.facing = 1;
  e.die(g);
  assert.strictEqual(e.dead, true, "wave truth sees the kill immediately");
  assert.strictEqual(g.particles.length, 1, "a visual-only death sprite is spawned");
  assert.strictEqual(g.particles[0].facing, 1);
  assert.strictEqual(g.particles[0].update(0.1), true, "corpse holds for a readable beat");
  assert.strictEqual(g.particles[0].update(0.5), false, "corpse self-culls from particles");
});

test("Geo ground wedge: near edge, far widening edge, outside lateral edge, behind origin, draw/hit agreement", () => {
  const Geo = JH.Geo;
  const SP = JH.SUPER_PLUNGER;
  const cx = 100, cy = 40, angle = 0;   // facing +X
  const pts = Geo.groundWedgePoints(cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf);
  assert.strictEqual(pts.length, 4, "trapezoid has 4 corners");
  // draw-point/hit agreement: every polygon vertex the draw call consumes
  // must test as inside/edge against the same hit test.
  for (const p of pts)
    assert.ok(Geo.inGroundWedge(p.x, p.y, cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf),
      `polygon vertex (${p.x},${p.y}) must test inside/edge`);
  // near edge: at the origin, right at the near half-width — inside/edge.
  assert.ok(Geo.inGroundWedge(cx, cy + SP.pullNearHalf, cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf));
  // far widening edge: at max range, right at the far half-width — inside/edge.
  assert.ok(Geo.inGroundWedge(cx + SP.pullRange, cy + SP.pullFarHalf, cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf));
  // outside lateral edge: just beyond the far half-width at max range.
  assert.ok(!Geo.inGroundWedge(cx + SP.pullRange, cy + SP.pullFarHalf + 2, cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf));
  // behind origin: directly behind the locked aim.
  assert.ok(!Geo.inGroundWedge(cx - 5, cy, cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf));
});

test("Geo ground wedge: rotates with the locked aim, not axis-locked", () => {
  const Geo = JH.Geo;
  const SP = JH.SUPER_PLUNGER;
  const cx = 100, cy = 40, angle = Math.PI / 2;   // aim locked straight into depth (+Y)
  assert.ok(!Geo.inGroundWedge(cx + 50, cy, cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf),
    "perpendicular to the locked aim: outside");
  assert.ok(Geo.inGroundWedge(cx, cy + 50, cx, cy, angle, SP.pullRange, SP.pullNearHalf, SP.pullFarHalf),
    "along the locked aim: inside");
});

test("makeElite scales the air-roster damage keys", () => {
  const e = JH.makeEnemy("plunger", 0, 0);
  const base = JH.ENEMIES.plunger.lungeDmg;
  e.makeElite({ hp: 2, dmg: 1.5, speed: 1 });
  assert.strictEqual(e.def.lungeDmg, Math.round(base * 1.5));
});

test("tpmummy: streamer drop-in drifts down without a landing slam", () => {
  const g = stubHazardGame(200, 40);
  const e = JH.makeEnemy("tpmummy", 100, 40);
  e.beginDrop(0);
  assert.strictEqual(e.z, JH.ENEMIES.tpmummy.driftH);
  g.player.x = 100; g.player.y = 40;
  const hp0 = g.player.hp;
  for (let i = 0; i < 400 && e.dropping; i++) e.update(1 / 60, g);
  assert.strictEqual(e.dropping, false);
  assert.strictEqual(e.z, 0);
  assert.strictEqual(g.player.hp, hp0, "no landing slam — harasser entry");
});

test("tpmummy wrap: snares (soft slow) only when the hit lands", () => {
  const g = stubHazardGame(100, 40);
  const d = JH.ENEMIES.tpmummy;
  const wrap = new JH.TPWrap(80, 40, 100, 40, d);
  // i-framed: no hit, no snare
  g.player.invulnTimer = 1;
  for (let i = 0; i < 60 && !wrap.dead; i++) wrap.update(1 / 60, g);
  assert.strictEqual(g.player.snareT, 0);
  // clean hit: snare lands
  const g2 = stubHazardGame(100, 40);
  const wrap2 = new JH.TPWrap(80, 40, 100, 40, d);
  for (let i = 0; i < 60 && !wrap2.dead; i++) wrap2.update(1 / 60, g2);
  assert.ok(wrap2.dead);
  assert.strictEqual(g2.player.snareT, d.wrapSlowDur);
  assert.strictEqual(g2.player.snareMult, d.wrapSlow);
});

test("tpmummy wrap: a dodged hit (dodge chance) applies NOTHING — no hp, no snare", () => {
  const d = JH.ENEMIES.tpmummy;
  const g = stubHazardGame(100, 40);
  g.player.stats.dodgeChance = 1;   // Second Wind-style guaranteed dodge
  const hp0 = g.player.hp;
  const wrap = new JH.TPWrap(80, 40, 100, 40, d);
  for (let i = 0; i < 60 && !wrap.dead; i++) wrap.update(1 / 60, g);
  assert.ok(wrap.dead, "wrap still dies on contact");
  assert.strictEqual(g.player.hp, hp0, "dodged wrap deals no damage");
  assert.strictEqual(g.player.snareT, 0, "dodged wrap never snares");
  assert.strictEqual(g.player.snareMult, 1);
});

test("tpmummy death puff: shoves inside the rim, no damage, spares the rim-outside", () => {
  const d = JH.ENEMIES.tpmummy;
  const g = stubHazardGame(100 + d.puffRadius - 2, 40);
  const e = JH.makeEnemy("tpmummy", 100, 40);
  const hp0 = g.player.hp;
  e.die(g);
  assert.ok((g.player.knockVX || 0) > 0, "inside the puff rim: shoved");
  assert.strictEqual(g.player.hp, hp0, "the puff never damages");
  const g2 = stubHazardGame(100 + d.puffRadius + 3, 40);
  const e2 = JH.makeEnemy("tpmummy", 100, 40);
  e2.die(g2);
  assert.strictEqual(g2.player.knockVX || 0, 0, "outside the rim: untouched");
});

test("tpmummy retreat: turns to face its travel direction, not a backward moonwalk", () => {
  const g = stubHazardGame(100, 40);
  // Inside the 70px comfort ring -> retreats; must face away (travel direction).
  const e = JH.makeEnemy("tpmummy", 140, 40);
  e.spawnGrace = 0; e.cdTimer = 99;
  e.think(1 / 60, g);
  assert.strictEqual(e.state, "walk");
  assert.ok(e.x > 140, "backs away from the player");
  assert.strictEqual(e.facing, 1, "faces the travel direction while backing up");
  // Beyond 120px -> approaches; faces the player as before.
  const e2 = JH.makeEnemy("tpmummy", 300, 40);
  e2.spawnGrace = 0; e2.cdTimer = 99;
  e2.think(1 / 60, g);
  assert.strictEqual(e2.state, "walk");
  assert.ok(e2.x < 300, "closes toward the player");
  assert.strictEqual(e2.facing, -1, "faces the player while approaching");
  // Winding up at close range still faces the player (the throw aims at Jon).
  const e3 = JH.makeEnemy("tpmummy", 140, 40);
  e3.spawnGrace = 0; e3.cdTimer = 0;
  e3.think(1 / 60, g);
  assert.strictEqual(e3.state, "wind");
  assert.strictEqual(e3.facing, -1, "faces the player during the windup");
  // Hysteresis: retreat engages under 70px, holds until 82px, releases after.
  const e4 = JH.makeEnemy("tpmummy", 140, 40);
  e4.spawnGrace = 0; e4.cdTimer = 99;
  e4.think(1 / 60, g);
  assert.ok(e4.retreating, "premise: engaged under 70px");
  e4.x = 175;                       // dist 75 — inside the 70..82 hold band
  e4.think(1 / 60, g);
  assert.strictEqual(e4.state, "walk", "still backing up inside the hysteresis band");
  assert.strictEqual(e4.facing, 1, "keeps facing away between 70 and 82px");
  e4.x = 190;                       // dist 90 — past the release threshold
  e4.think(1 / 60, g);
  assert.ok(!e4.retreating, "releases past 82px");
  assert.strictEqual(e4.state, "idle");
  assert.strictEqual(e4.facing, -1, "faces the player again once released");
  // A fresh mummy inside the hold band but never engaged does NOT retreat.
  const e5 = JH.makeEnemy("tpmummy", 175, 40);
  e5.spawnGrace = 0; e5.cdTimer = 99;
  e5.think(1 / 60, g);
  assert.ok(!e5.retreating, "75px without prior engagement holds ground");
  assert.strictEqual(e5.state, "idle");
});

test("gasbag: vents a hostile cloud beneath itself after the inflate telegraph", () => {
  const g = stubHazardGame(400, 40);
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.spawnGrace = 0; e.ventT = 0; e.cdTimer = 0;
  // run until the vent completes
  for (let i = 0; i < 600 && g.stinkClouds.length === 0; i++) e.think(1 / 60, g);
  assert.strictEqual(g.stinkClouds.length, 1);
  assert.ok(!g.stinkClouds[0].friendly);
  assert.ok(e._vented);
});

test("gasbag pop-fast: killed before its first vent, the payload bursts on ENEMIES", () => {
  const g = stubHazardGame(400, 40);
  const e = JH.makeEnemy("gasbag", 100, 40);
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.stinkClouds.length, 1);
  assert.ok(g.stinkClouds[0].friendly, "pre-vent kill = friendly burst");
  // after venting, death carries no payload
  const g2 = stubHazardGame(400, 40);
  const e2 = JH.makeEnemy("gasbag", 100, 40);
  e2._vented = true;
  e2.die(g2);
  assert.strictEqual(g2.stinkClouds.length, 0);
});

test("stink cloud: per-instance radius/life override JH.STINK defaults; hit/draw rim still agrees", () => {
  const G = JH.SUPER_GASBAG;
  const g = stubHazardGame(400, 40);
  const c = new JH.StinkCloud(100, 40, { radius: G.megaRadius, life: G.megaLife });
  c.t = JH.STINK.growT;   // full grown
  assert.ok(Math.abs(c.footprint().rx - G.megaRadius) < 0.001,
    "full size at growT is the configured radius, not JH.STINK.radius");
  assert.notStrictEqual(G.megaRadius, JH.STINK.radius, "premise: the two radii differ");
  // rim agreement: draw's ellipse (footprint()) IS the hit test — sample the
  // gas-tag check the same way the existing rim test does, at the custom radius.
  g.stinkClouds.push(c);
  const f = c.footprint(), pad = g.player.bodyW * 0.25;
  g.player.x = 100 + f.rx + pad - 2; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.ok(g.player.gasT > 0, "inside the custom-radius rim tags gasT");
  g.player.x = 100 + f.rx + pad + 3; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.strictEqual(g.player.gasT, 0, "outside the custom-radius rim does not");
  // custom life expires the cloud instead of JH.STINK.life.
  const c2 = new JH.StinkCloud(200, 40, { life: 1.5 });
  c2.t = 1.5 - JH.STINK.fizzle - 0.001;
  assert.ok(c2.fadeFrac() < 1, "not yet expired just before custom life - fizzle");
  c2.t = 1.5 + 0.001;
  assert.ok(c2.fadeFrac() >= 1, "expired at the custom life, not JH.STINK.life");
  assert.notStrictEqual(1.5, JH.STINK.life, "premise: the two lives differ");
});

test("stink cloud: friendly custom friendlyLife/friendlyDps override JH.STINK defaults", () => {
  const G = JH.SUPER_GASBAG;
  const g = stubHazardGame(400, 40);
  const e = JH.makeEnemy("mook", 100, 40);
  g.enemies.push(e);
  const c = new JH.StinkCloud(100, 40, { friendly: true, radius: G.megaRadius,
    friendlyLife: G.megaFriendlyLife, friendlyDps: G.megaFriendlyDps });
  c.t = JH.STINK.growT;
  const hp0 = e.hp;
  c.update(0.5, g);
  assert.ok(Math.abs((hp0 - e.hp) - G.megaFriendlyDps * 0.5) < 0.01,
    "damage matches the custom friendlyDps exactly");
  assert.ok(hp0 - e.hp > JH.STINK.friendlyDps * 0.5,
    "custom friendlyDps (12/s) deals more than the default (8/s) would over the same tick");
  assert.strictEqual(c.dead, false);
  c.t = G.megaFriendlyLife + 0.001;
  c.update(0, g);
  assert.strictEqual(c.dead, true, "expires at the custom friendlyLife, not JH.STINK.friendlyLife");
  assert.notStrictEqual(G.megaFriendlyLife, JH.STINK.friendlyLife, "premise: the two friendly lives differ");
});

test("stink cloud: defaults remain JH.STINK when no per-instance opts are given (regular Gasbag callers unchanged)", () => {
  const c = new JH.StinkCloud(100, 40);
  c.t = JH.STINK.growT;
  assert.ok(Math.abs(c.footprint().rx - JH.STINK.radius) < 0.001);
  const fc = new JH.StinkCloud(100, 40, { friendly: true });
  assert.strictEqual(fc.friendlyLife, JH.STINK.friendlyLife);
  assert.strictEqual(fc.friendlyDps, JH.STINK.friendlyDps);
});

test("gasbag hovers inside the spray band (nozzle can reach it)", () => {
  const e = JH.makeEnemy("gasbag", 100, 40);
  assert.ok(e.z >= JH.ENEMIES.gasbag.hoverZ - 3);
  // stream line at nozzleZ must intersect the hover body
  assert.ok(JH.ENEMIES.gasbag.hoverZ < JH.PLAYER.nozzleZ + 10);
});

test("bidet shot: lands at the LOCKED target; the telegraph ellipse is the hit ellipse", () => {
  const d = JH.ENEMIES.bidet;
  // player stands just inside the landing rim
  const g = stubHazardGame(200 + d.landRadius - 2, 40);
  const shot = new JH.BidetShot(100, 40, 200, 40, d);
  const hp0 = g.player.hp;
  for (let i = 0; i < 600 && !shot.dead; i++) shot.update(1 / 60, g);
  assert.ok(shot.dead);
  assert.ok(Math.abs(shot.x - 200) < 8, "arc comes down at the locked spot");
  assert.ok(g.player.hp < hp0, "inside the drawn rim: hit");
  // just outside the rim: spared
  const g2 = stubHazardGame(200 + d.landRadius + 4, 40);
  const shot2 = new JH.BidetShot(100, 40, 200, 40, d);
  const hp2 = g2.player.hp;
  for (let i = 0; i < 600 && !shot2.dead; i++) shot2.update(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "outside the drawn rim: spared");
});

test("bidet shot: landing douses fire patches it touches (world consistency)", () => {
  const d = JH.ENEMIES.bidet;
  const g = stubHazardGame(400, 40);
  const fp = new JH.FirePatch(200, 40, 20, 2.0);
  g.firePatches.push(fp);
  const shot = new JH.BidetShot(100, 40, 200, 40, d);
  for (let i = 0; i < 600 && !shot.dead; i++) shot.update(1 / 60, g);
  assert.ok(fp.sprayProgress >= fp.extinguishDur, "returned water still douses fire");
});

test("bidet turret: locks its aim at wind start and is knockback-immune", () => {
  const g = stubHazardGame(180, 40);
  const e = JH.makeEnemy("bidet", 100, 40);
  e.spawnGrace = 0;
  e.think(1 / 60, g);
  assert.strictEqual(e.aimX, 180, "target locked when the wind starts");
  g.player.x = 300;                       // player moves; telegraph must not chase
  e.think(1 / 60, g);
  assert.strictEqual(e.aimX, 180);
  e.applyKnockback(1, 500);
  assert.strictEqual(e.knockVX || 0, 0, "porcelain emplacement doesn't slide");
});

test("bidet landing shoves at landKnock, not the default takeHit impulse", () => {
  const d = JH.ENEMIES.bidet;
  const g = stubHazardGame(200 + d.landRadius - 2, 40);
  const shot = new JH.BidetShot(100, 40, 200, 40, d);
  for (let i = 0; i < 600 && !shot.dead; i++) shot.update(1 / 60, g);
  assert.ok(shot.dead);
  // applyKnockback: knockVX += dir * force from 0 — a landed splash carries
  // the config impulse exactly (no player physics ticks in this loop).
  assert.strictEqual(Math.abs(g.player.knockVX), d.landKnock,
    "pressurized-water shove derives from config landKnock");
});

test("enterAirAct: arrival state — position, checkpoint, vendor, free-walk trigger", () => {
  // Game.init touches the DOM; drive enterAirAct on a shallow clone instead.
  const airStart = JH.ACT_STARTS[JH.ACT_STARTS.length - 1];
  const g = Object.create(JH.Game);
  g.player = stubPlayer(0, 40);
  g.showScreen = () => {}; g.banner = () => {}; g.spawnVendor = function (x) { this._vendorX = x; };
  g.gatedTriggerX = JH.Game.gatedTriggerX;
  g.stinkClouds = [{}]; g.gustLanes = [{}]; g.sigils = [];
  g.enemies = [{}]; g.embers = [{}]; g.firePatches = [{}];   // leaked combat state
  JH.Background.airOn = false;
  g.enterAirAct();
  assert.strictEqual(g.player.x, JH.ZONE4_START + 40);
  assert.strictEqual(g.checkpointWave, airStart);
  assert.strictEqual(g.waveIndex, airStart - 1, "next walk trigger rolls WAVE 30");
  assert.ok(g.bounds.minX >= JH.ZONE4_START, "no walking back through the gate");
  assert.ok(g._vendorX > JH.ZONE4_START && g._vendorX < g.waveTriggerX,
    "act-boundary vendor sits in the arrival corridor");
  assert.strictEqual(JH.Background.airOn, true, "cloudline art turns on at arrival");
  for (const k of ["enemies", "embers", "firePatches", "stinkClouds", "gustLanes"])
    assert.strictEqual(g[k].length, 0, k + " cleared on arrival");
});

test("afterSlayerCutscene: stale wave trigger disarmed — the walk to the truck rolls NO wave", () => {
  const airStart = JH.ACT_STARTS[JH.ACT_STARTS.length - 1];
  const slayerIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "slayer");
  assert.strictEqual(slayerIdx + 1, airStart, "the slayer is the last pre-gate wave");
  const g = Object.create(JH.Game);
  g.player = stubPlayer(11000, 40);
  g.showScreen = () => {}; g.banner = () => {};
  g.cutscene = {}; g.state = "cutscene";
  g.waveIndex = slayerIdx; g.waveActive = false;
  g.waveTriggerX = 11000;   // stale from wave 28's arming — pre-fix this rolled wave 29
  g.sigils = [{}];          // the Slayer's benediction lineup, unpicked
  let started = null;
  g.startWave = (i) => { started = i; };
  const doc = global.document;
  global.document = { getElementById: () => ({ textContent: "", classList: { add() {}, remove() {} }, style: {} }) };
  try {
    g.afterSlayerCutscene(slayerIdx + 1);
    assert.strictEqual(g.waveTriggerX, Infinity, "stale trigger disarmed (enterAirAct re-arms)");
    assert.ok(g.bounds.maxX <= JH.ZONE4_START - 60,
      "free-walk capped short of the air gate (got " + g.bounds.maxX + ")");
    // Walk all the way to the truck stop point: no wave may roll.
    g.player.x = g.bounds.maxX;
    g.checkWaveTrigger();
    assert.strictEqual(started, null,
      "no wave starts post-Slayer — wave " + airStart + " belongs to enterAirAct");
    assert.strictEqual(g.sigils.length, 1, "the benediction lineup survives the walk");
  } finally { global.document = doc; }
});

test("respawnFromChurch: corridor death past the gate respawns AT the gate, never behind it", () => {
  // Death in the arrival corridor (WAVE 30 not yet rolled): waveIndex/diedWave
  // sit at airStart-1, but checkpointWave is the act start — the respawn must
  // floor at the checkpoint or Jon lands near WAVE_TRIGGERS[28] behind the gate.
  const airStart = JH.ACT_STARTS[JH.ACT_STARTS.length - 1];
  const g = Object.create(JH.Game);
  g.player = stubPlayer(JH.ZONE4_START + 60, 40);
  g.showScreen = () => {}; g.banner = () => {}; g.sweepCrosses = () => {};
  g.gatedTriggerX = JH.Game.gatedTriggerX;
  g.diedWave = airStart - 1;
  g.checkpointWave = airStart;
  g.lastHydrantX = 0;   // never touched a hydrant past the gate
  JH.Music = JH.Music || { reset() {}, start() {} };   // node has no music module
  g.respawnFromChurch();
  assert.ok(g.player.x >= JH.ZONE4_START,
    "respawn position floors at the gate (got " + g.player.x + ")");
  assert.ok(g.bounds.minX >= JH.ZONE4_START + 8,
    "respawn bounds keep the gate one-way (got " + g.bounds.minX + ")");
});
