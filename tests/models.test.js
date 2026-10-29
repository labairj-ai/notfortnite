import test from "node:test";
import assert from "node:assert/strict";
import { loadModel, modelReady, preloadModels } from "../src/models.js";
test("models load on demand, share pending/cache, fail safely and respect cancellation", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        asset: { version: "2.0" },
        scenes: [{ nodes: [] }],
        scene: 0,
        nodes: [],
      }),
    );
  };
  try {
    await preloadModels("/");
    assert.equal(calls, 0);
    const [a, b] = await Promise.all([
      loadModel("hero", "/"),
      loadModel("hero", "/"),
    ]);
    assert(a);
    assert.equal(a, b);
    assert.equal(calls, 1);
    assert(modelReady("hero"));
    await loadModel("hero", "/");
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      throw new Error("fixture fetch failure");
    };
    assert.equal(await loadModel("knight", "/"), null);
    assert.equal(modelReady("knight"), false);
    const abort = new AbortController();
    abort.abort();
    const before = calls;
    assert.equal(await loadModel("mage", "/", { signal: abort.signal }), null);
    assert.equal(calls, before);
  } finally {
    globalThis.fetch = original;
  }
});
test("a new session does not inherit an aborted model request", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const abort = new AbortController();
  globalThis.fetch = (url, { signal } = {}) => {
    calls++;
    if (calls === 1)
      return new Promise((resolve, reject) =>
        signal.addEventListener(
          "abort",
          () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          { once: true },
        ),
      );
    return Promise.resolve(
      new Response(
        JSON.stringify({
          asset: { version: "2.0" },
          scenes: [{ nodes: [] }],
          scene: 0,
          nodes: [],
        }),
      ),
    );
  };
  try {
    const old = loadModel("mage", "/", { signal: abort.signal });
    abort.abort();
    const fresh = loadModel("mage", "/");
    assert.equal(await old, null);
    assert(await fresh);
    assert.equal(calls, 2);
    assert(modelReady("mage"));
  } finally {
    globalThis.fetch = original;
  }
});
