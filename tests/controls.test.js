import test from "node:test";
import assert from "node:assert/strict";
import { createControls } from "../src/controls.js";
test("input reset clears held keys, edges and deltas; disabled controls cannot latch", () => {
  const win = new EventTarget(),
    doc = new EventTarget(),
    canvas = new EventTarget();
  doc.getElementById = () => null;
  globalThis.window = win;
  globalThis.document = doc;
  const c = createControls(canvas);
  c.enabled = true;
  const e = new Event("keydown");
  e.code = "KeyW";
  e.target?.closest;
  c.fire = true;
  c.jumpPressed = true;
  c.lookDX = 1;
  win.dispatchEvent(e);
  c.update();
  assert.equal(c.moveZ, 1);
  win.dispatchEvent(new Event("blur"));
  assert.equal(c.moveZ, 0);
  assert.equal(c.fire, false);
  assert.equal(c.jumpPressed, false);
  assert.equal(c.lookDX, 0);
  c.enabled = false;
  c.update();
  assert.equal(c.moveZ, 0);
  c.dispose();
  delete globalThis.window;
  delete globalThis.document;
});
