import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, addPlayer, spawnGroundLoot } from "../shared/match.js";
import {
  initializeInventory,
  processAction,
  acceptPosition,
} from "../shared/actions.js";
import {
  newInventory,
  takeItem,
  dropItem,
  consumeHeal,
} from "../shared/inventory.js";
const api = { heightAt: () => 0, onEvent: () => {} };
function fixture() {
  const m = createMatch(42);
  m.state = "play";
  const p = addPlayer(m, { id: "me" });
  Object.assign(p, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  initializeInventory(p);
  const w = { builds: new Map(), props: new Map(), heightAt: () => 0 };
  return { m, p, w, act: (msg) => processAction(m, w, p, msg, api) };
}
test("heal stack limits, full replacement/cancel, pickaxe protection and consumption", () => {
  let slots = newInventory();
  slots[1] = { kind: "heal", h: "bandage", uses: 14 };
  let r = takeItem(slots, { kind: "heal", h: "bandage", uses: 3 });
  assert.equal(r.slots[1].uses, 15);
  assert.equal(r.slots[2].uses, 2);
  assert.equal(slots[1].uses, 14);
  for (let i = 1; i < 6; i++) slots[i] = { kind: "weapon", w: "ar", rarity: 0 };
  assert.equal(
    takeItem(slots, { kind: "weapon", w: "sniper", rarity: 4 }).ok,
    false,
  );
  r = takeItem(slots, { kind: "weapon", w: "sniper", rarity: 4 }, 2);
  assert.equal(r.dropped.w, "ar");
  assert.equal(r.slots[2].w, "sniper");
  assert.equal(dropItem(slots, 0).ok, false);
  slots[1] = { kind: "heal", h: "bandage", uses: 1 };
  r = consumeHeal(slots, 1, 70, 0);
  assert.equal(r.hp, 75);
  assert.equal(r.slots[1], null);
  assert.equal(consumeHeal(slots, 1, 75, 0).ok, false);
});
test("single claimant and replay-safe pickup; out-of-range requests preserve loot", () => {
  const { m, p, w, act } = fixture();
  spawnGroundLoot(m, { kind: "weapon", w: "ar", rarity: 0 }, 0, 0, 0, api);
  const id = [...m.groundLoot.keys()][0];
  assert.equal(act({ t: "pickup", seq: 1, id }).ok, true);
  assert.equal(act({ t: "pickup", seq: 1, id }).ok, false);
  assert.equal(act({ t: "pickup", seq: 2, id }).ok, false);
  assert.equal(p.slots.filter((i) => i?.w === "ar").length, 1);
  spawnGroundLoot(m, { kind: "weapon", w: "ar", rarity: 0 }, 40, 0, 0, api);
  assert.equal(
    act({ t: "pickup", seq: 3, id: [...m.groundLoot.keys()][0] }).ok,
    false,
  );
});
test("harvesting is once per accepted swing, cadence checked, no client material grants", () => {
  const { m, p, w, act } = fixture();
  w.props.set("tree", {
    id: "tree",
    type: "tree",
    x: 0,
    y: 0,
    z: -2,
    scale: 1,
    hp: 4,
  });
  assert(
    act({ t: "attack", seq: 1, slot: 0, aim: { x: 0, y: 1.4, z: -2 } }).ok,
  );
  assert.equal(p.mats.wood, 15);
  assert.equal(w.props.get("tree").hp, 3);
  assert.equal(
    act({ t: "attack", seq: 2, slot: 0, aim: { x: 0, y: 1.4, z: -2 } }).reason,
    "SHOT_CADENCE",
  );
  assert.equal(p.mats.wood, 15);
  m.time = 0.5;
  assert(
    act({ t: "attack", seq: 3, slot: 0, aim: { x: 0, y: 1.4, z: -2 } }).ok,
  );
  assert.equal(p.mats.wood, 30);
});
test("damage, aim, range, occlusion and cadence remain host-owned", () => {
  const { m, p, w, act } = fixture();
  p.slots[1] = { kind: "weapon", w: "pistol", rarity: 0 };
  const enemy = addPlayer(m, { id: "enemy" });
  Object.assign(enemy, { x: 0, y: 0, z: -10, hp: 100, shield: 0 });
  assert.equal(act({ t: "hit", seq: 1, target: "enemy", dmg: 200 }).ok, false);
  assert.equal(enemy.hp, 100);
  for (const [i, bad] of [NaN, Infinity, -Infinity].entries())
    assert.equal(
      act({ t: "attack", seq: i + 2, slot: 1, aim: { x: bad, y: 1, z: -10 } })
        .ok,
      false,
    );
  w.builds.set("wall", {
    id: "wall",
    type: "wall",
    x: 0,
    y: 0,
    z: -5,
    rot: 0,
    hp: 300,
    mat: "brick",
  });
  assert(
    act({ t: "attack", seq: 5, slot: 1, aim: { x: 0, y: 1.4, z: -10 } }).ok,
  );
  assert.equal(enemy.hp, 100);
  assert.equal(w.builds.get("wall").hp, 276);
  w.builds.clear();
  m.time = 1;
  assert(
    act({ t: "attack", seq: 6, slot: 1, aim: { x: 0, y: 1.4, z: -10 } }).ok,
  );
  assert.equal(enemy.hp, 76);
  assert.equal(
    act({ t: "attack", seq: 7, slot: 1, aim: { x: 0, y: 1.4, z: -10 } }).ok,
    false,
  );
});
test("finite and plausible movement, malformed builds and unaffordable builds rejected", () => {
  const { m, p, act } = fixture();
  assert.equal(
    acceptPosition(p, { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0 }, 0),
    false,
  );
  assert.equal(
    acceptPosition(p, { x: 100, y: 0, z: 0, yaw: 0, pitch: 0 }, 0),
    false,
  );
  assert.equal(
    act({
      t: "build",
      seq: 1,
      piece: { id: "b", type: "wall", mat: "wood", x: 0, y: 0, z: 0, rot: 0 },
    }).ok,
    false,
  );
  p.mats.wood = 20;
  assert(
    act({
      t: "build",
      seq: 2,
      piece: { id: "b", type: "wall", mat: "wood", x: 0, y: 0, z: -4, rot: 0 },
    }).ok,
  );
  assert.equal(p.mats.wood, 10);
});

test("two independent claimants and 50/100/200ms delayed attack schedules remain replay-safe", () => {
  for (const latency of [0.05, 0.1, 0.2]) {
    const { m, p, w, act } = fixture(),
      q = addPlayer(m, { id: "other" });
    Object.assign(q, { x: 0, y: 0, z: 0 });
    initializeInventory(q);
    const drop = spawnGroundLoot(
      m,
      { kind: "weapon", w: "pistol", rarity: 0 },
      0,
      0,
      0,
      api,
    );
    assert(act({ t: "pickup", seq: 1, id: drop.id }).ok);
    assert.equal(
      processAction(m, w, q, { t: "pickup", seq: 1, id: drop.id }, api).ok,
      false,
    );
    m.time = latency;
    assert(
      act({ t: "attack", seq: 2, slot: 1, aim: { x: 0, y: 1.4, z: -10 } }).ok,
    );
    m.time += 0.2;
    assert.equal(
      act({ t: "attack", seq: 3, slot: 1, aim: { x: 0, y: 1.4, z: -10 } }).ok,
      false,
    );
    m.time += 0.2;
    assert(
      act({ t: "attack", seq: 4, slot: 1, aim: { x: 0, y: 1.4, z: -10 } }).ok,
    );
  }
});
