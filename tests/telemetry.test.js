const test = require("node:test");
const assert = require("node:assert");
const T = require("../js/telemetry.js");

function withSpy() {
  const sent = [];
  T.configure({ endpoint: "https://x/exec", enabled: true, gameVersion: "9.9.9" });
  T.setTransport((p) => sent.push(p));
  return sent;
}

test("builds a full win record from a hook sequence", () => {
  const sent = withSpy();
  T.startRun("Ash");
  T.waveReached(0, "Hosetown");
  T.waveReached(1, "Maple St");
  T.death(1);
  T.death(1);
  T.benediction("eye_of_storm");
  T.item("node:pressure");
  T.finishWin({ timeSec: 123.4, kills: 50, deaths: 2, sudsEarned: 999.7, finalWaveIndex: 1, finalWaveName: "Maple St" });

  assert.strictEqual(sent.length, 1);
  const p = sent[0];
  assert.strictEqual(p.outcome, "win");
  assert.strictEqual(p.handle, "Ash");
  assert.strictEqual(p.gameVersion, "9.9.9");
  assert.deepStrictEqual(p.wavesReached, [0, 1]);
  assert.deepStrictEqual(p.deathsByWave, { 1: 2 });
  assert.deepStrictEqual(p.benedictions, ["eye_of_storm"]);
  assert.deepStrictEqual(p.items, ["node:pressure"]);
  assert.strictEqual(p.timeSec, 123.4);
  assert.strictEqual(p.deaths, 2);
  assert.strictEqual(p.sudsEarned, 999);
  assert.strictEqual(p.finalWaveIndex, 1);
  assert.ok(p.runId && typeof p.runId === "string");
});

test("blank handle disables the run: no record, no send", () => {
  const sent = withSpy();
  T.startRun("   ");
  T.waveReached(0, "Hosetown");
  T.death(0);
  T.finishWin({ timeSec: 10 });
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(T.buildPayload("win", {}), null);
});

test("disabled config disables the run even with a handle", () => {
  const sent = [];
  T.configure({ endpoint: "https://x/exec", enabled: false, gameVersion: "1" });
  T.setTransport((p) => sent.push(p));
  T.startRun("Ash");
  T.finishWin({ timeSec: 10 });
  assert.strictEqual(sent.length, 0);
});

test("missing endpoint disables the run", () => {
  const sent = [];
  T.configure({ endpoint: "", enabled: true, gameVersion: "1" });
  T.setTransport((p) => sent.push(p));
  T.startRun("Ash");
  T.finishWin({ timeSec: 10 });
  assert.strictEqual(sent.length, 0);
});

test("one send per run: double finish does not double-send", () => {
  const sent = withSpy();
  T.startRun("Ash");
  T.finishWin({ timeSec: 5 });
  T.finishWin({ timeSec: 5 });
  T.finishAbandoned();
  assert.strictEqual(sent.length, 1);
});

test("finishAbandoned sends outcome=abandoned when a run is live", () => {
  const sent = withSpy();
  T.startRun("Ash");
  T.waveReached(3, "Elm");
  T.finishAbandoned();
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].outcome, "abandoned");
  assert.strictEqual(sent[0].finalWaveIndex, 3);
});
