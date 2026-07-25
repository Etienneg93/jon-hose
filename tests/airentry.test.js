"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
// world.js preloads a debris sprite via JH.Loader at script eval; node has no
// Image, so stub the loader (same pattern as tests/entities.test.js).
// drawOverlay's props/wind-gust reads JH.Camera.x, so world.js must load
// before any test calls it.
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/airentry.js");
const JH = global.window.JH;
const AirEntry = JH.AirEntry;
const C = JH.AIRENTRY;

test("phase order ends in release", () => {
  assert.strictEqual(AirEntry.ORDER[AirEntry.ORDER.length - 1], "release");
  assert.deepStrictEqual(AirEntry.ORDER,
    ["notice", "desecrate", "rage", "reveal", "feud", "depart", "release"]);
});

test("totalDur is the sum of every scripted phase, derived from config", () => {
  const expected = AirEntry.ORDER.slice(0, -1)
    .reduce((sum, k) => sum + C.phases[k], 0);
  assert.strictEqual(AirEntry.totalDur(C), expected);
});

test("phaseAt walks the phases in order and lands on release", () => {
  assert.strictEqual(AirEntry.phaseAt(C, 0), "notice");
  let acc = 0;
  for (const k of AirEntry.ORDER.slice(0, -1)) {
    // Sample the middle of each phase so the assertion never sits on a boundary.
    assert.strictEqual(AirEntry.phaseAt(C, acc + C.phases[k] / 2), k);
    acc += C.phases[k];
  }
  assert.strictEqual(AirEntry.phaseAt(C, AirEntry.totalDur(C)), "release");
  assert.strictEqual(AirEntry.phaseAt(C, AirEntry.totalDur(C) + 99), "release");
});

test("every phase duration is positive", () => {
  for (const k of AirEntry.ORDER.slice(0, -1))
    assert.ok(C.phases[k] > 0, k + " must have a positive duration");
});

// Records paint calls so the test can prove a painter actually ran.
// Assets.draw's p() helper sinks to ctx.fillRect (js/assets.js:344-350).
// texts[] records every fillText string (bark lines).
function mkCtx() {
  const noop = () => {};
  const c = {
    calls: 0, texts: [], fillStyle: "", globalAlpha: 1, globalCompositeOperation: "",
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    drawImage: noop, clearRect: noop, setTransform: noop, beginPath: noop,
    arc: noop, ellipse: noop, fill: noop, stroke: noop, closePath: noop,
    fillText(text) { c.texts.push(text); },
    measureText: () => ({ width: 0 }), putImageData: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    fillRect() { c.calls++; },
  };
  return c;
}

test("assmanPlain and collie painters are registered and paint", () => {
  // assets.js builds an offscreen canvas at eval time — same document stub
  // pattern as tests/air.test.js and tests/juice.test.js.
  global.window.JH.Loader = { img: () => ({}) };
  global.document = global.document || {
    createElement: () => ({ width: 0, height: 0, getContext: mkCtx }),
    getElementById: () => ({ style: {} }),
  };
  require("../js/assets.js");
  const Assets = global.window.JH.Assets;
  assert.strictEqual(typeof Assets.airEntryReady, "function");

  // The stub Loader returns bare {} handles, so neither painter has usable
  // art and both must take their procedural fallback — which paints.
  for (const key of ["assmanPlain", "collie"]) {
    const ctx = mkCtx();
    Assets.draw(ctx, key, 100, 100, 1, { state: "idle" });
    assert.ok(ctx.calls > 0, key + " must be registered and paint a fallback");
  }
  // Control: Assets.draw returns early on an unregistered key. Without this,
  // the assertions above would pass even if draw() were a no-op.
  const ctl = mkCtx();
  Assets.draw(ctl, "notAPainter", 100, 100, 1, {});
  assert.strictEqual(ctl.calls, 0, "unregistered key must paint nothing");
});

// Minimal game stub: the module only touches these fields.
function makeGame() {
  return {
    airEntry: null, airEntryArmed: true,
    waveIndex: 28, checkpointWave: 29, waveActive: false, sigils: [],
    player: { x: C.triggerX, y: 51, z: 0, facing: 1 },
    input: { _buf: {}, buffered(a) { return !!this._buf[a]; }, consume(a) { this._buf[a] = false; } },
    shake() {},   // camera push on reveal — a real JH.Game method in production
  };
}

test("enter() stages both actors and starts the scene", () => {
  const g = makeGame();
  AirEntry.enter(g);
  assert.ok(g.airEntry, "scene state exists");
  assert.strictEqual(g.airEntry.phase, "notice");
  assert.strictEqual(AirEntry.actors(g).length, 2);
});

test("enter() is a no-op unless explicitly armed", () => {
  // Regression: devGotoWave and the Church return both set Background.airOn
  // without going through enterAirAct, so an unset flag must NOT arm.
  for (const armed of [false, undefined]) {
    const g = makeGame();
    g.airEntryArmed = armed;
    AirEntry.enter(g);
    assert.strictEqual(g.airEntry, null, "must not arm when airEntryArmed is " + armed);
  }
});

test("running to the end releases control and disarms", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const steps = Math.ceil(AirEntry.totalDur(C) / (1 / 60)) + 2;
  for (let i = 0; i < steps; i++) AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry, null, "scene cleared");
  assert.strictEqual(g.airEntryArmed, false);
  assert.strictEqual(AirEntry.actors(g).length, 0);
});

test("skip() from any phase lands in the same end state", () => {
  for (const phase of AirEntry.ORDER.slice(0, -1)) {
    const g = makeGame();
    AirEntry.enter(g);
    // Advance to the middle of `phase`, then skip.
    let acc = 0;
    for (const k of AirEntry.ORDER.slice(0, -1)) {
      if (k === phase) break;
      acc += C.phases[k];
    }
    g.airEntry.t = acc + C.phases[phase] / 2;
    AirEntry.skip(g);
    assert.strictEqual(g.airEntry, null, "skipped from " + phase);
    assert.strictEqual(g.airEntryArmed, false);
  }
});

test("a buffered confirm during the scene skips it", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.input._buf.confirm = true;
  AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry, null);
});

test("depart soars in the direction he faces, carrying the dog", () => {
  const g = makeGame();
  AirEntry.enter(g);
  // Park time inside `depart`, past the rise fraction so he is soaring.
  const before = AirEntry.ORDER.slice(0, -1)
    .filter((k) => k !== "depart")
    .reduce((sum, k) => sum + C.phases[k], 0);
  g.airEntry.t = before + C.phases.depart * (C.departRiseFrac + 0.01);
  const x0 = g.airEntry.stranger.x;
  AirEntry.update(1 / 60, g);
  const st = g.airEntry.stranger, dog = g.airEntry.dog;
  assert.strictEqual(st.state, "soar");
  assert.strictEqual(st.facing, 1, "facing must match travel direction");
  assert.ok(st.x > x0, "soars downrange");
  assert.strictEqual(dog.held, true);
  assert.strictEqual(dog.x, st.x + C.dogCarryDX, "dog rides the carrier");
});

// Regression: riseup (AM_POSE_H 66px tall) and soar (19px) are very
// different heights — one dY offset for the whole depart phase floated the
// dog above the soar body for roughly half the exit.
test("depart carries the dog at the riseup offset while rising", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const before = AirEntry.ORDER.slice(0, -1)
    .filter((k) => k !== "depart")
    .reduce((sum, k) => sum + C.phases[k], 0);
  g.airEntry.t = before + C.phases.depart * (C.departRiseFrac / 2);   // well inside riseup
  AirEntry.update(1 / 60, g);
  const st = g.airEntry.stranger, dog = g.airEntry.dog;
  assert.strictEqual(st.state, "riseup");
  assert.strictEqual(dog.z, st.z - C.dogCarryDY, "riseup uses the tall-pose offset");
});

test("depart switches the dog to the soar offset once he's soaring", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const before = AirEntry.ORDER.slice(0, -1)
    .filter((k) => k !== "depart")
    .reduce((sum, k) => sum + C.phases[k], 0);
  g.airEntry.t = before + C.phases.depart * (C.departRiseFrac + 0.01);
  AirEntry.update(1 / 60, g);
  const st = g.airEntry.stranger, dog = g.airEntry.dog;
  assert.strictEqual(st.state, "soar");
  assert.strictEqual(dog.z, st.z - C.dogCarrySoarDY, "soar uses the shallow-pose offset");
  assert.notStrictEqual(C.dogCarrySoarDY, C.dogCarryDY, "the two offsets must actually differ");
});

test("rage phase arms a red flash on entry", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const dt = 1 / 60;
  const rageStart = C.phases.notice + C.phases.desecrate;
  g.airEntry.t = rageStart - dt;   // one tick short of the rage boundary
  AirEntry.update(dt, g);
  assert.strictEqual(g.airEntry.phase, "rage");
  assert.strictEqual(g.airEntry.flashColor, "rage");
  assert.ok(g.airEntry.flashT > 0);
});

test("reveal completion arms a white flash exactly once", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const dt = 1 / 60;
  const revealStart = C.phases.notice + C.phases.desecrate + C.phases.rage;
  // A small margin past the frame-2 boundary (rather than landing exactly on
  // it) so float rounding in the t/dt roundtrip can't floor it back to 1.
  g.airEntry.t = revealStart + C.ripFrameStep * 2 + 0.01 - dt;
  AirEntry.update(dt, g);
  assert.strictEqual(g.airEntry.revealed, true);
  assert.strictEqual(g.airEntry.flashColor, "reveal");
  assert.ok(g.airEntry.flashT > 0);
});

test("drawOverlay paints a full-screen wash while a rage flash is active", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.flashT = C.flashDur;
  g.airEntry.flashColor = "rage";
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.ok(ctx.calls > 0, "must paint the wash");
  assert.strictEqual(ctx.fillStyle, "#ff2020");
  assert.strictEqual(ctx.globalAlpha, C.flashRedPeak, "full timer -> full peak alpha");
});

test("drawOverlay uses the white peak for a reveal flash", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.flashT = C.flashDur;
  g.airEntry.flashColor = "reveal";
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.ok(ctx.calls > 0);
  assert.strictEqual(ctx.fillStyle, "#ffffff");
  assert.strictEqual(ctx.globalAlpha, C.flashWhitePeak);
});

test("drawOverlay is a no-op once the flash timer elapses", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.flashT = 0;
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.strictEqual(ctx.calls, 0, "no flash left to paint");
});

test("drawOverlay is a no-op with no live scene", () => {
  const g = makeGame();
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.strictEqual(ctx.calls, 0);
});

// ---- placeholder bark lines ----

test("rage bark line draws above the player only", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.phase = "rage";
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.ok(ctx.texts.includes("NOT THE HYDRANT!"), "player's rage line drawn");
  assert.strictEqual(ctx.texts.length, 2, "one line = outline + fill fillText calls");
});

test("feud bark lines draw for both the stranger and the player", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.phase = "feud";
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.ok(ctx.texts.includes("MY SKY NOW."), "stranger's feud line drawn");
  assert.ok(ctx.texts.includes("NOT ON MY WATCH."), "player's feud line drawn");
  assert.strictEqual(ctx.texts.length, 4, "two lines x (outline + fill) fillText calls");
});

test("no bark line outside rage/feud", () => {
  const g = makeGame();
  AirEntry.enter(g);   // phase stays "notice"
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.strictEqual(ctx.texts.length, 0);
});

// ---- reveal props: hoodie prop, storm ring, camera push ----

test("reveal completion spawns the hoodie prop and storm ring, and pushes the camera", () => {
  const g = makeGame();
  AirEntry.enter(g);
  let shookWith = null;
  g.shake = (n) => { shookWith = n; };
  const dt = 1 / 60;
  const revealStart = C.phases.notice + C.phases.desecrate + C.phases.rage;
  g.airEntry.t = revealStart + C.ripFrameStep * 2 + 0.01 - dt;
  AirEntry.update(dt, g);
  assert.ok(g.airEntry.hoodieProp, "hoodie prop spawned");
  assert.ok(g.airEntry.stormRing, "storm ring spawned");
  assert.strictEqual(shookWith, C.revealShakeMag, "camera push uses the configured magnitude");
});

test("hoodie prop tumbles (translate + rotate) then despawns after hoodieLife", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const dt = 1 / 60;
  g.airEntry.hoodieProp = { x: 0, y: 0, z: C.hoodieSpawnZ, vx: 10, vz: 0, rot: 0, rotSpeed: C.hoodieRotSpeed, t: 0 };
  AirEntry.update(dt, g);
  let hp = g.airEntry.hoodieProp;
  assert.ok(hp, "still alive after one tick");
  assert.ok(hp.rot > 0, "rotates over time");
  assert.strictEqual(hp.x, 10 * dt, "moves by vx*dt");
  g.airEntry.hoodieProp.t = C.hoodieLife - dt / 2;   // about to cross the life boundary
  AirEntry.update(dt, g);
  assert.strictEqual(g.airEntry.hoodieProp, null, "despawns once its life elapses");
});

test("hoodie prop draws without any non-uniform scale (rotation only)", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.hoodieProp = { x: 0, y: 0, z: 10, vx: 5, vz: 0, rot: 0.3, rotSpeed: 1, t: 0 };
  const ctx = mkCtx();
  let scaleCalls = 0;
  ctx.scale = () => { scaleCalls++; };
  AirEntry.drawOverlay(ctx, g);
  assert.strictEqual(scaleCalls, 0, "hoodie prop must never be scaled, only rotated/translated");
  assert.ok(ctx.calls > 0, "hoodie prop paints a fillRect");
});

test("storm ring grows then despawns after stormRingDur", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const dt = 1 / 60;
  g.airEntry.stormRing = { cx: 0, cy: 0, t: 0 };
  AirEntry.update(dt, g);
  assert.ok(g.airEntry.stormRing, "still alive after one tick");
  g.airEntry.stormRing.t = C.stormRingDur - dt / 2;
  AirEntry.update(dt, g);
  assert.strictEqual(g.airEntry.stormRing, null, "despawns once its duration elapses");
});

test("storm ring never touches game.enemies (cosmetic only, no hit test)", () => {
  const g = makeGame();   // deliberately has no `enemies` field
  AirEntry.enter(g);
  const dt = 1 / 60;
  const revealStart = C.phases.notice + C.phases.desecrate + C.phases.rage;
  g.airEntry.t = revealStart + C.ripFrameStep * 2 + 0.01 - dt;
  assert.doesNotThrow(() => AirEntry.update(dt, g), "reveal fx must never read game.enemies");
  assert.ok(g.airEntry.stormRing, "ring spawned");
  const ctx = mkCtx();
  assert.doesNotThrow(() => AirEntry.drawOverlay(ctx, g));
});

// ---- wind gust (depart) ----

test("depart spawns wind-gust streaks at the configured cadence", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const before = AirEntry.ORDER.slice(0, -1)
    .filter((k) => k !== "depart")
    .reduce((sum, k) => sum + C.phases[k], 0);
  g.airEntry.t = before;
  const dt = 1 / 240;   // fine steps so the spawn accumulator isn't skipped over
  // Stop one tick short of depart's own end: windGustCount streaks are spread
  // evenly across the phase, so the last one lands on the same frame the
  // scene releases (game.airEntry goes null) and is unobservable here.
  const steps = Math.floor((C.phases.depart - dt) / dt);
  for (let i = 0; i < steps; i++) AirEntry.update(dt, g);
  assert.strictEqual(g.airEntry.windSpawnedCount, C.windGustCount - 1,
    "every gust but the final phase-boundary one has spawned");
  assert.ok(g.airEntry.windParticles.length > 0, "the most recent streaks are still live");
});

test("leashCurve: sag equals leashSag at zero hand-to-collar distance", () => {
  const curve = AirEntry.leashCurve(C, 100, 50, 100, 50);
  assert.strictEqual(curve.cy - 50, C.leashSag);
});

test("leashCurve: sag is 0 once distance reaches leashTautLen", () => {
  const curve = AirEntry.leashCurve(C, 0, 0, C.leashTautLen, 0);
  assert.strictEqual(curve.cy, 0);
});

test("leashCurve: sag stays 0 (never negative) well past leashTautLen", () => {
  const curve = AirEntry.leashCurve(C, 0, 0, C.leashTautLen * 5, 0);
  assert.strictEqual(curve.cy, 0);
});

test("leashCurve: sag eases down between rest and taut, always >= 0", () => {
  const half = AirEntry.leashCurve(C, 0, 0, C.leashTautLen / 2, 0);
  assert.ok(half.cy > 0, "still sagging at half the taut length");
  assert.ok(half.cy < C.leashSag, "sag eased down from the at-rest value");
});

test("leashCurve: endpoints match the inputs exactly", () => {
  const curve = AirEntry.leashCurve(C, 12, 34, 56, 78);
  assert.strictEqual(curve.x0, 12);
  assert.strictEqual(curve.y0, 34);
  assert.strictEqual(curve.x1, 56);
  assert.strictEqual(curve.y1, 78);
});

// Regression: startGame() (run reset, also called by devGotoWave) must clear
// a scene armed by a prior run — otherwise a dev-warp into AIR ENTRY followed
// by a warp elsewhere leaves the flag set and the beat fires on top of the
// new wave. Exercises the real Game.startGame(), so it needs the module
// chain startGame touches (Camera, Player, Upgrades); JH.Music is unguarded
// in startGame so it's stubbed directly rather than loading real audio.
test("startGame clears a stale armed air-entry scene", () => {
  // world.js is already loaded (top of file); startGame also needs these.
  require("../js/upgrades.js");
  require("../js/entities.js");
  require("../js/game.js");
  const Game = global.window.JH.Game;
  global.window.JH.Music = { reset() {}, start() {} };
  // Unconditional: an earlier test in this file (assmanPlain/collie painters)
  // stubs document with a classList-less element, which showScreen() needs.
  global.document = {
    getElementById: () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, textContent: "" }),
  };
  Game.airEntry = { phase: "notice" };
  Game.airEntryArmed = true;
  Game.startGame();
  assert.strictEqual(Game.airEntry, null, "a stale armed scene must not survive a run reset");
  assert.strictEqual(Game.airEntryArmed, false);
});

test("the scene never mutates wave state", () => {
  const g = makeGame();
  const before = { waveIndex: g.waveIndex, checkpointWave: g.checkpointWave,
                   waveActive: g.waveActive, sigils: g.sigils.length };
  AirEntry.enter(g);
  const steps = Math.ceil(AirEntry.totalDur(C) / (1 / 60)) + 2;
  for (let i = 0; i < steps; i++) AirEntry.update(1 / 60, g);
  assert.strictEqual(g.waveIndex, before.waveIndex);
  assert.strictEqual(g.checkpointWave, before.checkpointWave);
  assert.strictEqual(g.waveActive, before.waveActive);
  assert.strictEqual(g.sigils.length, before.sigils);
});

test("the trot cycles over exactly JH.AIRENTRY.dogTrotFrames frames", () => {
  // The collie's contact and passing poses are the only two distinct beats the
  // generator produced; frames must stay inside that set or the painter falls
  // back to idle mid-stride.
  const g = makeGame();
  AirEntry.enter(g);
  const seen = new Set();
  const steps = Math.ceil((C.phases.notice + C.phases.desecrate) / (1 / 60));
  for (let i = 0; i < steps; i++) {
    AirEntry.update(1 / 60, g);
    const d = g.airEntry && g.airEntry.dog;
    if (d && d.state === "trot") seen.add(d.frame);
  }
  assert.ok(seen.size > 1, "the trot must actually advance frames");
  for (const f of seen)
    assert.ok(f >= 0 && f < C.dogTrotFrames,
      `frame ${f} outside 0..${C.dogTrotFrames - 1}`);
});

test("the dog parks so its cocked leg aims at the hydrant, and streams", () => {
  // The lift pose faces right with the raised rear leg LEFT of centre, so the
  // dog must stop to the RIGHT of the hydrant — a negative dogLiftDX would aim
  // the stream away from it.
  assert.ok(C.dogLiftDX > 0, "dog must park right of the hydrant to aim back at it");

  const g = makeGame();
  g.particles = [];
  AirEntry.enter(g);
  const steps = Math.ceil((C.phases.notice + C.phases.desecrate) / (1 / 60));
  for (let i = 0; i < steps; i++) AirEntry.update(1 / 60, g);

  const sc = g.airEntry;
  assert.strictEqual(sc.dog.state, "lift", "dog should have reached the hydrant and lifted");
  assert.ok(g.particles.length > 0, "the lift must emit stream particles");

  // Every droplet leaves the cocked leg travelling AWAY from the dog's facing,
  // i.e. toward the hydrant it is parked beside.
  for (const p of g.particles) {
    assert.ok(p.vx * sc.dog.facing < 0, "stream must travel opposite the dog's facing");
  }
  // Every droplet must be renderable: Particle.draw sizes its fillRect from
  // `size`, so an undefined tunable silently draws NaN-sized rects — visible
  // in no screenshot and caught by no phase assertion.
  for (const p of g.particles) {
    assert.ok(Number.isFinite(p.size) && p.size > 0, "droplet size must be a positive number");
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), "droplet position must be finite");
  }

  const originDX = g.particles[0].x - sc.dog.x;
  assert.ok(originDX * sc.dog.facing < 0, "stream must originate at the rear, not the head");
  assert.ok(sc.hydrantX < sc.dog.x, "hydrant must be behind the dog for the stream to land on it");
});
