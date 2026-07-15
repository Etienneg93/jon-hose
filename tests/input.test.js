"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
global.window.addEventListener = global.window.addEventListener || (() => {});
// poll() reads navigator.getGamepads — node 21+ ships a global navigator
// (read-only, no getGamepads), which the existing guard handles.
require("../js/input.js");
const Input = global.window.JH.Input;

// Fake clock + fresh input state per test.
let now = 0;
function reset() {
  now = 0;
  Input.init();
  Input._now = () => now;
}
function frame(ms) { now += ms; Input.poll(); }

test("player action surface has no jump or melee verb", () => {
  reset();
  assert.ok(Object.hasOwn(Input.state, "spray"));
  assert.ok(Object.hasOwn(Input.state, "dash"));
  assert.ok(!Object.hasOwn(Input.state, "jump"));
  assert.ok(!Object.hasOwn(Input.state, "whack"));
});

test("buffered: press edge stays pending within 130ms", () => {
  reset();
  Input._keys.dash = true; frame(16);        // edge lands
  assert.ok(Input.buffered("dash"));
  Input._keys.dash = false;
  frame(50); frame(50);                      // 116ms after the edge
  assert.ok(Input.buffered("dash"), "still pending inside the window");
});

test("buffered: expires after 130ms", () => {
  reset();
  Input._keys.dash = true; frame(16);
  Input._keys.dash = false;
  frame(140);
  assert.ok(!Input.buffered("dash"));
});

test("consume clears the pending edge", () => {
  reset();
  Input._keys.confirm = true; frame(16);
  assert.ok(Input.buffered("confirm"));
  Input.consume("confirm");
  assert.ok(!Input.buffered("confirm"));
});

test("holding does not re-arm the buffer after consume", () => {
  reset();
  Input._keys.dash = true; frame(16);
  Input.consume("dash");
  frame(16); frame(16);                      // still held — no new edge
  assert.ok(!Input.buffered("dash"));
});

test("re-press after release re-arms", () => {
  reset();
  Input._keys.dash = true; frame(16);
  Input.consume("dash");
  Input._keys.dash = false; frame(16);
  Input._keys.dash = true; frame(16);
  assert.ok(Input.buffered("dash"));
});

test("pressed() edge semantics unchanged", () => {
  reset();
  Input._keys.spray = true; frame(16);
  assert.ok(Input.pressed("spray"));
  frame(16);
  assert.ok(!Input.pressed("spray"), "only true on the edge frame");
});
