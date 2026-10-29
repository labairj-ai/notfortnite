import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../shared/worldgen.js";
import {
  createMatch,
  addPlayer,
  fillWithBots,
  startMatch,
  tickMatch,
  damagePlayer,
  rollChestLoot,
} from "../shared/match.js";
import { STORM_PHASES, MATCH_PLAYERS } from "../shared/constants.js";
const api = { heightAt: () => 2, onEvent: () => {} };
test("fixed seed world and loot replay identically", () => {
  const a = createWorld(42),
    b = createWorld(42);
  assert.deepEqual(a.chests, b.chests);
  assert.deepEqual([...a.builds], [...b.builds]);
  const x = createMatch(42),
    y = createMatch(42);
  assert.deepEqual(rollChestLoot(x.rng), rollChestLoot(y.rng));
  assert(a.chests.length >= 30);
  assert.equal(new Set(a.chests.map((c) => c.id)).size, a.chests.length);
});
test("host-neutral replay preserves storm and bot outcomes", () => {
  const run = () => {
    const m = createMatch(42);
    addPlayer(m, { id: "human", name: "Human" });
    for (let i = 0; i < 9; i++) addPlayer(m, { id: "bot" + i, isBot: true });
    startMatch(m, api);
    for (let i = 0; i < 900; i++) tickMatch(m, 1 / 30, api);
    return { storm: m.storm, players: [...m.players.values()] };
  };
  assert.deepEqual(run(), run());
});
test("10 players, unchanged slow-storm durations, and elimination ends match", () => {
  const m = createMatch(42);
  addPlayer(m, { id: "me" });
  fillWithBots(m, MATCH_PLAYERS);
  assert.equal(m.players.size, 10);
  assert.deepEqual(
    STORM_PHASES.map((p) => p.shrink),
    [50, 40, 36, 30, 24, 20],
  );
  startMatch(m, api);
  for (const p of m.players.values())
    if (p.id !== "me") damagePlayer(m, p.id, 1000, "me", api);
  assert.equal(m.state, "ended");
  assert.equal(m.winnerId, "me");
});
