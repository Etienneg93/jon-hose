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
require("../js/quake-frames.js");
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
    calls: 0, texts: [], fills: [], fillStyle: "", globalAlpha: 1, globalCompositeOperation: "",
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    drawImage: noop, clearRect: noop, setTransform: noop, beginPath: noop,
    arc: noop, ellipse: noop, fill: noop, stroke: noop, closePath: noop,
    strokeRect: noop, strokeStyle: "", lineWidth: 1, lineCap: "",
    quadraticCurveTo: noop, moveTo: noop, lineTo: noop,
    fillText(text) { c.texts.push(text); },
    measureText: () => ({ width: 0 }), putImageData: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    fillRect(x, y, w, h) {
      c.calls++;
      c.fills.push({ style: c.fillStyle, alpha: c.globalAlpha, x, y, w, h });
    },
  };
  return c;
}

// A full-screen wash of the given colour, if one was painted. Asserting on the
// recorded op rather than the trailing ctx.fillStyle keeps these tests honest
// when later passes (the codec box) paint after the wash.
function findWash(ctx, style) {
  return ctx.fills.find((f) =>
    f.style === style && f.x === 0 && f.y === 0 &&
    f.w === JH.VIEW_W && f.h === JH.VIEW_H);
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

// Drive the scene the way a player does: pump frames, and confirm through any
// codec line that is waiting. Dialogue GATES the clock now, so a bare
// update() loop parks on the first line and never advances.
function pump(g, seconds, dt) {
  dt = dt || 1 / 60;
  // Loop on the SCENE clock, not a frame count: gated dialogue burns frames
  // without advancing sc.t, so a fixed step budget stops short.
  for (let i = 0; i < 20000; i++) {
    if (!g.airEntry) break;
    if (g.airEntry.t >= seconds) break;
    clearGate(g);
    AirEntry.update(dt, g);
  }
}

// Answer whatever codec line is waiting, if any.
function clearGate(g) {
  if (!g.airEntry || !AirEntry.codecActive(g)) return;
  g.airEntry.codecT = C.codecMinHold;   // satisfy the double-advance guard
  g.input._buf.confirm = true;
}

// Park the scene at an absolute time with its dialogue already answered, so a
// single update() exercises the phase's ACTION rather than its first line.
function seek(g, t) {
  g.airEntry.t = t;
  g.airEntry.phase = AirEntry.phaseAt(C, t);
  openGate(g);
}

// Mark the current phase's dialogue as answered without moving the clock, so
// the next update() runs its ACTION. Every phase gates on its lines first.
function openGate(g) {
  let n = 0;
  while (AirEntry.codecBeat(g.airEntry.phase, n)) n++;   // ask the module
  g.airEntry.codecIdx = n;
  g.airEntry.codecT = 0;
}

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
  pump(g, AirEntry.totalDur(C) + 1);   // past release, so the scene finishes
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
    seek(g, acc + C.phases[phase] / 2);
    AirEntry.skip(g);
    assert.strictEqual(g.airEntry, null, "skipped from " + phase);
    assert.strictEqual(g.airEntryArmed, false);
  }
});

test("a buffered confirm does NOT skip the scene, but is swallowed", () => {
  // User call: the arrival beat is not skippable. Confirm must still be
  // consumed so a press during the locked scene cannot leak into resumed play.
  const g = makeGame();
  AirEntry.enter(g);
  g.input._buf.confirm = true;
  AirEntry.update(1 / 60, g);
  assert.ok(g.airEntry, "scene must still be running");
  assert.strictEqual(g.input.buffered("confirm"), false, "confirm consumed, not leaked");
});

test("depart soars in the direction he faces, carrying the dog", () => {
  const g = makeGame();
  AirEntry.enter(g);
  // Park time inside `depart`, past the rise fraction so he is soaring.
  const before = AirEntry.ORDER.slice(0, -1)
    .filter((k) => k !== "depart")
    .reduce((sum, k) => sum + C.phases[k], 0);
  seek(g, before + C.phases.depart * (C.departRiseFrac + 0.01));
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
  seek(g, before + C.phases.depart * (C.departRiseFrac / 2));   // well inside riseup
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
  seek(g, before + C.phases.depart * (C.departRiseFrac + 0.01));
  AirEntry.update(1 / 60, g);
  const st = g.airEntry.stranger, dog = g.airEntry.dog;
  assert.strictEqual(st.state, "soar");
  assert.strictEqual(dog.z, st.z - C.dogCarrySoarDY, "soar uses the shallow-pose offset");
  assert.notStrictEqual(C.dogCarrySoarDY, C.dogCarryDY, "the two offsets must actually differ");
});

test("rage phase arms a red flash on its first action frame", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const dt = 1 / 60;
  const rageStart = C.phases.notice + C.phases.desecrate;
  // Land inside rage with its line already answered — dialogue gates the
  // clock, so the flash arms on the first ACTION frame, not the phase boundary.
  seek(g, rageStart + dt);
  g.airEntry.actedPhase = null;   // as if rage's action has not started yet
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
  seek(g, revealStart + C.ripFrameStep * 2 + 0.01 - dt);
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
  const wash = findWash(ctx, "#ff2020");
  assert.ok(wash, "must paint a full-screen red wash");
  assert.strictEqual(wash.alpha, C.flashRedPeak, "full timer -> full peak alpha");
});

test("drawOverlay uses the white peak for a reveal flash", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.flashT = C.flashDur;
  g.airEntry.flashColor = "reveal";
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  const wash = findWash(ctx, "#ffffff");
  assert.ok(wash, "must paint a full-screen white wash");
  assert.strictEqual(wash.alpha, C.flashWhitePeak);
});

test("drawOverlay is a no-op once the flash timer elapses", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.flashT = 0;
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.ok(!findWash(ctx, "#ff2020"), "no red flash wash");
  assert.ok(!findWash(ctx, "#ffffff"), "no white flash wash");
});

test("drawOverlay is a no-op with no live scene", () => {
  const g = makeGame();
  const ctx = mkCtx();
  AirEntry.drawOverlay(ctx, g);
  assert.strictEqual(ctx.calls, 0);
});

// ---- codec dialogue ----

test("reveal completion spawns the hoodie prop and storm ring, and pushes the camera", () => {
  const g = makeGame();
  AirEntry.enter(g);
  let shookWith = null;
  g.shake = (n) => { shookWith = n; };
  const dt = 1 / 60;
  const revealStart = C.phases.notice + C.phases.desecrate + C.phases.rage;
  seek(g, revealStart + C.ripFrameStep * 2 + 0.01 - dt);
  AirEntry.update(dt, g);
  assert.ok(g.airEntry.hoodieProp, "hoodie prop spawned");
  assert.ok(g.airEntry.stormRing, "storm ring spawned");
  assert.strictEqual(shookWith, C.revealShakeMag, "camera push uses the configured magnitude");
});

test("hoodie prop tumbles (translate + rotate) then despawns after hoodieLife", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const dt = 1 / 60;
  openGate(g);   // notice gates on its line; the prop only ticks in the action path
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
  openGate(g);   // as above — dialogue gates the clock
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
  seek(g, revealStart + C.ripFrameStep * 2 + 0.01 - dt);
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
  seek(g, before);
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
  pump(g, AirEntry.totalDur(C));
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
  // Generous frame budget: gated dialogue burns frames without advancing the
  // scene clock, so this cannot be sized from phase durations alone.
  for (let i = 0; i < 4000; i++) {
    if (!g.airEntry || g.airEntry.t >= C.phases.notice + C.phases.desecrate) break;
    clearGate(g);
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
  pump(g, C.phases.notice + C.phases.desecrate);

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

test("the intro codec speaks in its scripted phases, with a portrait", () => {
  const beats = { notice: "???", desecrate: "MARIO", feud: "ASS MAN" };
  for (const [phase, name] of Object.entries(beats)) {
    const g = makeGame();
    AirEntry.enter(g);
    g.airEntry.phase = phase;
    const ctx = mkCtx();
    AirEntry.drawOverlay(ctx, g);
    assert.ok(ctx.texts.includes(name), `${phase} codec names ${name}`);
    // The veil is what keeps the live scene readable behind the box; without
    // it the staged action competes with the text.
    assert.ok(ctx.fills.some((f) => f.style === "#000" && f.alpha === C.codecDim),
      `${phase} codec dims the scene behind it`);
  }
});

test("Mario barks, and only during the desecration", () => {
  for (const phase of AirEntry.ORDER) {
    const g = makeGame();
    AirEntry.enter(g);
    g.airEntry.phase = phase;
    const ctx = mkCtx();
    AirEntry.drawOverlay(ctx, g);
    const barked = ctx.texts.includes("BARK BARK");
    assert.strictEqual(barked, phase === "desecrate",
      `BARK BARK should ${phase === "desecrate" ? "" : "not "}appear in ${phase}`);
  }
});

test("codec phases with no scripted beat draw no box", () => {
  for (const phase of ["reveal", "depart"]) {
    const g = makeGame();
    AirEntry.enter(g);
    g.airEntry.phase = phase;
    const ctx = mkCtx();
    AirEntry.drawOverlay(ctx, g);
    assert.ok(!ctx.fills.some((f) => f.style === "#000" && f.alpha === C.codecDim),
      `${phase} must not dim for a codec box it does not have`);
  }
});

test("codecActive marks exactly the phases that speak", () => {
  // game.js hides the stat panel on this flag; the panel shares the portrait's
  // top-left rect and would otherwise draw over the face.
  const speaking = new Set(["notice", "desecrate", "rage", "feud"]);
  const g = makeGame();
  AirEntry.enter(g);
  for (const phase of AirEntry.ORDER) {
    g.airEntry.phase = phase;
    assert.strictEqual(AirEntry.codecActive(g), speaking.has(phase), phase);
  }
  g.airEntry = null;
  assert.strictEqual(AirEntry.codecActive(g), false, "no scene = no codec");
});

test("zoomK pushes in, holds, and returns to native scale by the end", () => {
  const total = AirEntry.totalDur(C);
  assert.strictEqual(AirEntry.zoomK(C, 0), 1, "starts at native scale");
  assert.ok(Math.abs(AirEntry.zoomK(C, total) - 1) < 1e-9,
    "back to native scale as control returns");
  // Held at full push through the middle of the beat.
  assert.ok(Math.abs(AirEntry.zoomK(C, total / 2) - C.zoomMax) < 1e-9, "holds at zoomMax");
  // Monotonic on the way in.
  let prev = 0;
  for (let t = 0; t <= C.zoomInDur; t += C.zoomInDur / 8) {
    const k = AirEntry.zoomK(C, t);
    assert.ok(k >= prev - 1e-9, "push-in never reverses");
    prev = k;
  }
  // Never below native scale, never past the cap, at any point in the beat.
  for (let t = 0; t <= total; t += total / 40) {
    const k = AirEntry.zoomK(C, t);
    assert.ok(k >= 1 - 1e-9 && k <= C.zoomMax + 1e-9, `zoom ${k} out of range at t=${t}`);
  }
});

test("zoom frames the player and the dog, and is inert with no scene", () => {
  const g = makeGame();
  assert.strictEqual(AirEntry.zoom(g).k, 1, "no scene = no zoom");
  AirEntry.enter(g);
  seek(g, AirEntry.totalDur(C) / 2);
  const z = AirEntry.zoom(g);
  assert.ok(Math.abs(z.k - C.zoomMax) < 1e-9);
  // Focal x sits between the two subjects in screen space.
  const cam = JH.Camera.x;
  const lo = Math.min(g.player.x, g.airEntry.dog.x) - cam;
  const hi = Math.max(g.player.x, g.airEntry.dog.x) - cam;
  assert.ok(z.fx >= lo && z.fx <= hi, "focal point framed between player and dog");
});

test("drawOverlay paints the edge vignette", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const ctx = mkCtx();
  let madeGradient = false;
  ctx.createRadialGradient = () => { madeGradient = true; return { addColorStop() {} }; };
  AirEntry.drawOverlay(ctx, g);
  assert.ok(madeGradient, "vignette uses a radial gradient");
  assert.ok(ctx.fills.some((f) => f.x === 0 && f.y === 0 && f.w === JH.VIEW_W && f.h === JH.VIEW_H),
    "vignette covers the frame");
});

test("every scripted line is codec dialogue, spoken by the right portrait", () => {
  const expected = {
    notice:    [["???", "Nice day for it."]],
    desecrate: [["MARIO", "BARK BARK"]],
    rage:      [["JON", "NOT THE HYDRANT!"]],
    feud:      [["ASS MAN", "These skies are mine,"], ["JON", "NOT ON MY WATCH."]],
  };
  for (const [phase, beats] of Object.entries(expected)) {
    for (let i = 0; i < beats.length; i++) {
      const [name, line] = beats[i];
      const g = makeGame();
      AirEntry.enter(g);
      g.airEntry.phase = phase;
      g.airEntry.codecIdx = i;      // the cursor decides what is on screen
      g.airEntry.codecT = 0;
      const ctx = mkCtx();
      AirEntry.drawOverlay(ctx, g);
      assert.ok(ctx.texts.includes(name), `${phase} beat ${i} names ${name}`);
      assert.ok(ctx.texts.includes(line), `${phase} beat ${i} speaks "${line}"`);
    }
  }
});

test("feud holds two beats, advanced by the player in order", () => {
  const g = makeGame();
  AirEntry.enter(g);
  seek(g, AirEntry.totalDur(C) - C.phases.depart - C.phases.feud / 2);
  g.airEntry.phase = "feud";
  g.airEntry.codecIdx = 0;

  const first = AirEntry.codecBeat("feud", 0);
  assert.strictEqual(first.beat.name, "ASS MAN", "Ass Man speaks first");
  assert.strictEqual(first.remaining, 1, "one line still queued behind him");

  const second = AirEntry.codecBeat("feud", 1);
  assert.strictEqual(second.beat.name, "JON", "Jon answers");
  assert.strictEqual(second.remaining, 0, "last line of the phase");

  // Past the end the phase has nothing more to say, which is what opens the
  // clock gate and lets the action run.
  assert.strictEqual(AirEntry.codecBeat("feud", 2), null);
});

test("phases with no dialogue never gate the clock", () => {
  for (const phase of ["reveal", "depart", "release"])
    assert.strictEqual(AirEntry.codecBeat(phase, 0), null, phase);
});

test("dialogue gates the clock: the scene will not advance unanswered", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const t0 = g.airEntry.t;
  for (let i = 0; i < 600; i++) AirEntry.update(1 / 60, g);   // ten seconds, no input
  assert.strictEqual(g.airEntry.t, t0, "clock frozen while a line waits");
  assert.strictEqual(g.airEntry.phase, "notice", "still on the opening beat");
  assert.ok(g.airEntry, "and the scene has NOT skipped itself");
});

test("confirm advances one line, never two", () => {
  // A press buffered on the previous line must not blow through the next one,
  // which is what codecMinHold guards.
  const g = makeGame();
  AirEntry.enter(g);
  g.airEntry.phase = "feud";
  g.airEntry.codecIdx = 0;
  g.airEntry.codecT = 0;

  g.input._buf.confirm = true;
  AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry.codecIdx, 0, "too soon — the hold guard blocks it");

  g.airEntry.codecT = C.codecMinHold;
  g.input._buf.confirm = true;
  AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry.codecIdx, 1, "one line advanced");
  assert.strictEqual(g.airEntry.codecT, 0, "hold timer restarts for the new line");
});

test("every phase with dialogue plays it before its action", () => {
  // Regression: an earlier gate compared the phase at the TOP of update, but
  // sc.phase is assigned in the bottom half — so the comparison always matched
  // and that phase's lines were silently skipped.
  const g = makeGame();
  AirEntry.enter(g);
  const spoken = [];
  for (let i = 0; i < 6000; i++) {
    if (!g.airEntry) break;
    if (AirEntry.codecActive(g)) {
      const sel = AirEntry.codecBeat(g.airEntry.phase, g.airEntry.codecIdx);
      const tag = g.airEntry.phase + ":" + sel.beat.name;
      if (spoken[spoken.length - 1] !== tag) spoken.push(tag);
      clearGate(g);
    }
    AirEntry.update(1 / 60, g);
  }
  assert.deepStrictEqual(spoken, [
    "notice:???", "desecrate:MARIO", "rage:JON", "feud:ASS MAN", "feud:JON",
  ], "every scripted line is reached, in order");
});

test("quake sheet: every frame plants its feet on the baseline", () => {
  // The stomp wind-up raises both fists overhead, so its art is TALLER than the
  // idle. assets.js anchors by ay in source px and scales by the sheet's
  // declared `scale`, which is what lets a tall pose extend upward instead of
  // being squashed — or, worse, shrinking every other pose to fit.
  const M = JH.QUAKE_FRAMES;
  assert.ok(M && M.frames, "frame atlas present");
  assert.ok(M.scale > 1, "sheet declares its source-px-per-logical-px");
  for (const [name, f] of Object.entries(M.frames)) {
    const s = 1 / M.scale;
    const feet = (-f.ay * s) + (f.h * s);
    assert.ok(Math.abs(feet) < 1e-6, `${name} must land its feet at y=0, got ${feet}`);
    assert.strictEqual(f.ay, f.h, `${name}: ay must be the frame's bottom row`);
  }
  const walk = M.anims.walk;
  assert.ok(walk.length >= 2, "walk cycle needs at least two beats");
  for (const n of walk) assert.ok(M.frames[n], `walk references a real frame: ${n}`);
  for (const need of ["idle", "stompUp", "stompDown"])
    assert.ok(M.frames[need], `required frame present: ${need}`);
});

test("quake atlas declares its footfall frames for the step shake", () => {
  // entities.js reads stepFrames off the atlas instead of hardcoding indices,
  // so reordering the walk cycle cannot silently desync the camera jolt from
  // the frame where his boot actually lands.
  const M = JH.QUAKE_FRAMES;
  assert.ok(Array.isArray(M.stepFrames) && M.stepFrames.length > 0,
    "atlas must declare which walk frames plant a boot");
  const walk = M.anims.walk;
  for (const i of M.stepFrames) {
    assert.ok(Number.isInteger(i) && i >= 0 && i < walk.length,
      `step frame ${i} must index into the walk cycle (0..${walk.length - 1})`);
  }
  assert.ok(M.stepFrames.length < walk.length,
    "not every frame can be a footfall, or the shake never stops");
  // Assert the RENDERED amplitude, not the raw arg: shake is quadratic
  // ((n/traumaDiv)^2 * shakeMax), so a sensible-looking number can still land
  // sub-pixel and show nothing at all.
  const J = JH.JUICE;
  const px = (n) => Math.pow(n / J.traumaDiv, 2) * J.shakeMax;
  const step = px(JH.QUAKE.stepShake);
  assert.ok(step >= 0.4, `a footfall must be visible, got ${step.toFixed(2)}px`);
  assert.ok(step <= 1.5, `a footfall must stay SLIGHT, got ${step.toFixed(2)}px`);
  assert.ok(step < px(11) / 3,
    "a footfall must stay well under the charged stomp's jolt");
});
