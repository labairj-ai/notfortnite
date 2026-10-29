import { PLAYER, WEAPONS, RARITIES, MAP_SIZE } from "./constants.js";
import { raycastWorld, traceShot, direction, point } from "./geometry.js";
export const DIFFICULTIES = {
  Beginner: { reaction: 1.6, accuracy: 0.14, interval: 1.1 },
  Standard: { reaction: 1, accuracy: 0.26, interval: 0.7 },
  Challenging: { reaction: 0.55, accuracy: 0.4, interval: 0.4 },
};
export function clearPath(world, a, b) {
  if (!world) return true;
  const start = point(a.x, a.y + 0.9, a.z),
    end = point(b.x, b.y + 0.9, b.z),
    dir = direction(start, end);
  if (!dir) return true;
  const distance = Math.hypot(
    end.x - start.x,
    end.y - start.y,
    end.z - start.z,
  );
  for (const offset of [-0.4, 0, 0.4]) {
    const o = point(
      start.x - dir.z * offset,
      start.y,
      start.z + dir.x * offset,
    );
    if (raycastWorld(world, o, dir, distance)) return false;
  }
  return true;
}
// Bounded A*: at most 160 expanded nodes per decision, never in the render loop.
export function nextWaypoint(world, start, goal, budget = 160) {
  if (!world || clearPath(world, start, goal))
    return { x: goal.x, z: goal.z, expanded: 0 };
  const step = 4,
    sx = Math.round(start.x / step),
    sz = Math.round(start.z / step),
    gx = Math.round(goal.x / step),
    gz = Math.round(goal.z / step),
    key = (x, z) => x + "," + z;
  const starts = [];
  for (let x = sx - 1; x <= sx + 1; x++)
    for (let z = sz - 1; z <= sz + 1; z++) {
      const p = {
        x: x * step,
        z: z * step,
        y: world.heightAt(x * step, z * step),
      };
      if (clearPath(world, start, p))
        starts.push({ x, z, d: Math.hypot(p.x - start.x, p.z - start.z) });
    }
  starts.sort((a, b) => a.d - b.d);
  if (!starts.length) return { x: start.x, z: start.z, expanded: 0 };
  const origin = { x: starts[0].x, z: starts[0].z, g: 0, parent: null },
    open = [origin],
    seen = new Map([[key(origin.x, origin.z), 0]]);
  let best = origin,
    expanded = 0;
  const heuristic = (n) => Math.hypot(n.x - gx, n.z - gz);
  while (open.length && expanded < budget) {
    open.sort((a, b) => a.g + heuristic(a) - b.g - heuristic(b));
    const n = open.shift();
    expanded++;
    if (heuristic(n) < heuristic(best)) best = n;
    if (n.x === gx && n.z === gz) {
      best = n;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const x = n.x + dx,
        z = n.z + dz;
      if (
        Math.abs(x * step) > MAP_SIZE / 2 - 6 ||
        Math.abs(z * step) > MAP_SIZE / 2 - 6
      )
        continue;
      const g = n.g + Math.hypot(dx, dz),
        k = key(x, z);
      if ((seen.get(k) ?? Infinity) <= g) continue;
      const a = {
          x: n.x * step,
          z: n.z * step,
          y: world.heightAt(n.x * step, n.z * step),
        },
        b = { x: x * step, z: z * step, y: world.heightAt(x * step, z * step) };
      if (!clearPath(world, a, b)) continue;
      seen.set(k, g);
      open.push({ x, z, g, parent: n });
    }
  }
  while (best.parent?.parent) best = best.parent;
  const target = {
    x: best.x * step,
    z: best.z * step,
    y: world.heightAt(best.x * step, best.z * step),
  };
  if (!clearPath(world, start, target))
    return { x: origin.x * step, z: origin.z * step, expanded };
  return { ...target, expanded };
}
export function tickBot(m, b, dt, api, damage) {
  const brain = b.bot,
    s = m.storm,
    world = m.world,
    level = DIFFICULTIES[m.difficulty] || DIFFICULTIES.Standard;
  brain.style ??= ["cautious", "aggressive", "ranged", "scavenger"][
    Math.floor(m.rng() * 4)
  ];
  brain.trace ??= [];
  brain.retarget -= dt;
  const visible = (p) => clearPath(world, b, p);
  if (brain.retarget <= 0) {
    brain.retarget = 0.8;
    let best = null,
      bestD = 35;
    for (const p of m.players.values()) {
      if (p.id === b.id || !p.alive || p.y > 40) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d >= bestD || !visible(p)) continue;
      let focused = 0;
      for (const q of m.players.values())
        if (q.id !== b.id && q.isBot && q.alive && q.bot.enemy === p.id)
          focused++;
      if (focused >= 2) continue;
      best = p;
      bestD = d;
    }
    if (best?.id !== brain.enemy)
      brain.reaction = level.reaction + m.rng() * 0.5;
    brain.enemy = best?.id || null;
    let state = "search",
      goal = { x: b.x + (m.rng() - 0.5) * 40, z: b.z + (m.rng() - 0.5) * 40 };
    if (m.time < 6) {
      state = "loot";
      goal = { x: b.x, z: b.z };
    } else if (Math.hypot(b.x - s.cx, b.z - s.cz) > Math.max(3, s.r * 0.8)) {
      state = "rotate";
      goal = { x: s.toCx ?? s.cx, z: s.toCz ?? s.cz };
      brain.enemy = null;
    } else if (b.hp < 35 && brain.heals > 0 && !best) {
      state = "heal";
      goal = { x: b.x, z: b.z };
    } else if (best) {
      const d = bestD,
        desired =
          brain.style === "aggressive"
            ? 12
            : brain.style === "ranged"
              ? 27
              : 20;
      state =
        d < 8 || b.hp < 25 ? "retreat" : d > desired ? "reposition" : "attack";
      const sign = state === "retreat" ? -1 : 1;
      goal =
        state === "attack"
          ? { x: b.x, z: b.z }
          : { x: b.x + (best.x - b.x) * sign, z: b.z + (best.z - b.z) * sign };
    } else {
      const sound = (m.noises || []).findLast(
        (n) =>
          m.time - n.at < 3 &&
          n.by !== b.id &&
          Math.hypot(n.x - b.x, n.z - b.z) < 45,
      );
      if (sound) {
        state = "investigate";
        goal = sound;
      }
      const loot = [...m.groundLoot.values()]
        .filter((d) => Math.hypot(d.x - b.x, d.z - b.z) < 20)
        .sort(
          (a, c) =>
            Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z),
        )[0];
      if (loot && (brain.style === "scavenger" || !sound)) {
        state = "loot";
        goal = loot;
      }
    }
    if (best && b.hp < 35 && world) {
      let cover = null,
        dist = Infinity;
      for (const wall of world.builds.values()) {
        if (wall.type !== "wall") continue;
        const dx = wall.x - best.x,
          dz = wall.z - best.z,
          n = Math.hypot(dx, dz) || 1,
          p = { x: wall.x + (dx / n) * 3, z: wall.z + (dz / n) * 3 };
        p.y = api.heightAt(p.x, p.z);
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < dist && d < 18 && !clearPath(world, p, best)) {
          cover = p;
          dist = d;
        }
      }
      if (cover) {
        state = "seek-cover";
        goal = cover;
      }
    }
    brain.state = state;
    brain.goal = goal;
    const next = nextWaypoint(world, b, {
      ...goal,
      y: api.heightAt(goal.x, goal.z),
    });
    brain.tx = next.x;
    brain.tz = next.z;
    brain.expanded = next.expanded;
    brain.trace.push({
      at: +m.time.toFixed(2),
      state,
      expanded: next.expanded,
    });
    if (brain.trace.length > 24) brain.trace.shift();
  }
  if (brain.state === "heal" && brain.heals > 0) {
    brain.healT = (brain.healT || 0) + dt;
    if (brain.healT >= 1.1) {
      b.hp = Math.min(75, b.hp + 15);
      brain.heals--;
      brain.healT = 0;
    }
  }
  for (const drop of m.groundLoot.values())
    if (
      Math.hypot(drop.x - b.x, drop.z - b.z) < 1.5 &&
      drop.item.kind === "heal"
    ) {
      brain.heals = Math.min(3, (brain.heals || 0) + drop.item.uses);
      m.groundLoot.delete(drop.id);
      api.onEvent({ t: "lootGone", id: drop.id });
      break;
    }
  const enemy = brain.enemy ? m.players.get(brain.enemy) : null;
  let dx = brain.tx - b.x,
    dz = brain.tz - b.z,
    n = Math.hypot(dx, dz);
  const distance = Math.min(n, PLAYER.SPEED * 0.78 * dt),
    nx = b.x + (n ? (dx / n) * distance : 0),
    nz = b.z + (n ? (dz / n) * distance : 0),
    next = { x: nx, y: api.heightAt(nx, nz), z: nz };
  let moving = n > 1 && clearPath(world, b, next);
  if (moving) {
    b.x = nx;
    b.z = nz;
  }
  b.y = api.heightAt(b.x, b.z);
  b.anim = moving ? 1 : 0;
  if (enemy?.alive) b.yaw = Math.atan2(enemy.x - b.x, enemy.z - b.z);
  else if (moving) b.yaw = Math.atan2(dx, dz);
  brain.shootCd -= dt;
  brain.reaction -= dt;
  if (
    enemy?.alive &&
    brain.state !== "rotate" &&
    brain.reaction <= 0 &&
    brain.shootCd <= 0 &&
    m.time > 6 &&
    visible(enemy)
  ) {
    const w = WEAPONS[b.weapon] || WEAPONS.pistol;
    brain.shootCd = Math.max(w.rate, level.interval) + m.rng() * 0.5;
    const from = point(b.x, b.y + 1.4, b.z),
      to = point(enemy.x, enemy.y + 1.1, enemy.z),
      dir = direction(from, to),
      range = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (dir && range <= w.range) {
      b.anim |= 2;
      api.onEvent({
        t: "shot",
        from: b.id,
        fx: from.x,
        fy: from.y,
        fz: from.z,
        tx: to.x,
        ty: to.y,
        tz: to.z,
      });
      const hit = world
        ? traceShot(world, [...m.players.values()], from, dir, w.range, b.id)
        : { id: enemy.id, kind: "player" };
      if (
        hit?.kind === "player" &&
        hit.id === enemy.id &&
        m.rng() < Math.max(0.04, level.accuracy - range * 0.004)
      )
        damage(
          m,
          enemy.id,
          Math.round(w.dmg * RARITIES[b.rarity].mult),
          b.id,
          api,
        );
    }
  }
}
