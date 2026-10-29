import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createWorld } from "../shared/worldgen.js";
import {
  createMatch,
  addPlayer,
  fillWithBots,
  startMatch,
  tickMatch,
  rollFloorLoot,
  spawnGroundLoot,
} from "../shared/match.js";
import { initializeInventory, processAction } from "../shared/actions.js";
import {
  createMetrics,
  recordMetric,
  summarizeMetrics,
} from "../shared/metrics.js";
import { nextWaypoint, clearPath } from "../shared/bots.js";
const sourceFiles = [
  "shared/bots.js",
  "shared/actions.js",
  "shared/match.js",
  "shared/geometry.js",
  "shared/worldgen.js",
];
const sourceDigests = Object.fromEntries(
  sourceFiles.map((p) => [
    p,
    createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
  ]),
);
const results = [];
for (const preset of ["Classic", "Casual"])
  for (let seed = 1; seed <= 20; seed++) {
    const w = createWorld(seed, { preset }),
      m = createMatch(seed, { preset });
    m.world = w;
    m.heightAt = w.heightAt;
    const p = addPlayer(m, { id: "scripted" });
    initializeInventory(p);
    p.y = w.heightAt(p.x, p.z);
    fillWithBots(m, 10);
    let seq = 0;
    const metrics = createMetrics(seed, preset);
    recordMetric(metrics, "landing", 0);
    const api = {
      heightAt: w.heightAt,
      onEvent(e) {
        if (e.t === "damage" && (e.id === p.id || e.by === p.id))
          recordMetric(metrics, "damage", m.time);
        if (e.t === "kill" && e.killer === p.id)
          recordMetric(metrics, "elimination", m.time);
        if (e.t === "kill" && e.victim === p.id && e.killer === "storm")
          recordMetric(metrics, "stormDeath", m.time);
      },
    };
    for (const spot of w.floorLootSpots)
      spawnGroundLoot(m, rollFloorLoot(m.rng), spot.x, spot.y, spot.z, api);
    startMatch(m, api);
    let waypoint = null,
      decision = 0;
    for (let i = 0; i < 2100 && m.state === "play"; i++) {
      const dt = 0.2;
      decision -= dt;
      if (p.alive) {
        const enemy = [...m.players.values()]
          .filter((q) => q.id !== p.id && q.alive)
          .sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.z - p.z) -
              Math.hypot(b.x - p.x, b.z - p.z),
          )[0];
        if (
          enemy &&
          Math.hypot(enemy.x - p.x, enemy.z - p.z) < 35 &&
          clearPath(w, p, enemy)
        )
          recordMetric(metrics, "opponent", m.time);
        const slot = p.slots.findIndex((x, i) => i > 0 && x?.kind === "weapon");
        const loot = [...m.groundLoot.values()]
          .filter((d) => d.item.kind === "weapon")
          .sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.z - p.z) -
              Math.hypot(b.x - p.x, b.z - p.z),
          )[0];
        const storm =
          Math.hypot(p.x - m.storm.cx, p.z - m.storm.cz) > m.storm.r * 0.8;
        const goal = storm
          ? {
              x: m.storm.cx,
              z: m.storm.cz,
              y: w.heightAt(m.storm.cx, m.storm.cz),
            }
          : slot < 0
            ? loot
            : enemy;
        if (goal) {
          if (decision <= 0) {
            waypoint = nextWaypoint(w, p, goal);
            decision = 0.8;
          }
          const dx = waypoint.x - p.x,
            dz = waypoint.z - p.z,
            d = Math.hypot(dx, dz),
            step = Math.min(d, 5.6 * dt);
          if (d) {
            const nx = p.x + (dx / d) * step,
              nz = p.z + (dz / d) * step,
              next = { x: nx, y: w.heightAt(nx, nz), z: nz };
            if (clearPath(w, p, next)) Object.assign(p, next);
          }
        }
        if (
          loot &&
          Math.hypot(loot.x - p.x, loot.z - p.z) < 1.7 &&
          Math.abs(loot.y - p.y) < 3
        ) {
          processAction(m, w, p, { t: "pickup", seq: ++seq, id: loot.id }, api);
          recordMetric(metrics, "weapon", m.time);
        }
        if (slot > 0 && enemy && clearPath(w, p, enemy)) {
          p.yaw = Math.atan2(-(enemy.x - p.x), -(enemy.z - p.z));
          p.pitch = 0;
          processAction(
            m,
            w,
            p,
            {
              t: "attack",
              seq: ++seq,
              slot,
              aim: { x: enemy.x, y: enemy.y + 1.2, z: enemy.z },
            },
            api,
          );
        }
      }
      tickMatch(m, dt, api);
    }
    if (m.state === "ended") recordMetric(metrics, "end", m.time);
    results.push({
      ...summarizeMetrics(metrics),
      terminated: m.state === "ended",
      simulationSeconds: +m.time.toFixed(1),
    });
    console.error(preset, seed, m.state);
  }
const quantile = (a, p) => {
  a = a.filter(Number.isFinite).sort((a, b) => a - b);
  return a.length ? a[Math.floor((a.length - 1) * p)] : null;
};
const summary = {
  implementationSha: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceDigests,
  methodology:
    "SIMULATION ONLY: 20 fixed seeds per preset, grounded scripted human loots nearest weapon, bounded navigation, then attacks nearest opponent; dt=0.2, 420s cap. Not human engagement or device evidence.",
  targets: {
    weaponAfterLanding: 20,
    firstContact: [45, 60],
    duration: [240, 360],
  },
  presets: {},
  runs: results,
};
for (const preset of ["Classic", "Casual"]) {
  const rows = results.filter((r) => r.preset === preset);
  summary.presets[preset] = {};
  for (const key of ["weaponAfterLanding", "firstContact", "duration"])
    summary.presets[preset][key] = {
      observed: rows.filter((r) => r[key] !== null).length,
      median: quantile(
        rows.map((r) => r[key]),
        0.5,
      ),
      p75: quantile(
        rows.map((r) => r[key]),
        0.75,
      ),
      max: quantile(
        rows.map((r) => r[key]),
        1,
      ),
    };
  summary.presets[preset].terminated = rows.filter((r) => r.terminated).length;
}
fs.writeFileSync(
  "docs/pacing-simulation.json",
  JSON.stringify(summary, null, 2) + "\n",
);
