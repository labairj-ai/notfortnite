// Match simulation shared by the browser (offline vs-CPU mode) and the Node
// server (online matches). Operates on plain objects; emits events through
// api.onEvent so each host can relay/render them its own way.
import {
  STORM_PHASES, STORM_START_R, WEAPONS, RARITIES, HEALS, MAP_SIZE, PLAYER,
  BOT_NAMES, mulberry32, rollRarity, dist2d,
} from './constants.js';

let uid = 0;
export function newId(prefix) { return prefix + (uid++) + '_' + Math.floor(Math.random() * 1e6); }

export function createMatch(seed) {
  return {
    seed,
    state: 'lobby',            // lobby | play | ended
    players: new Map(),
    groundLoot: new Map(),     // id -> {id, item, x, y, z}
    winnerId: null,
    time: 0,
    storm: {
      cx: 0, cz: 0, r: STORM_START_R,
      phase: -1, timer: 8,     // seconds until first phase starts
      shrinking: false,
      fromCx: 0, fromCz: 0, fromR: STORM_START_R,
      toCx: 0, toCz: 0, toR: STORM_START_R,
      shrinkT: 0, shrinkDur: 1,
      dps: 0,
    },
    rng: mulberry32(seed ^ 0xabcdef),
  };
}

export function addPlayer(m, { id, name, custom, isBot }) {
  const rng = m.rng;
  const p = {
    id, name, custom: custom || null, isBot: !!isBot,
    x: (rng() - 0.5) * (MAP_SIZE - 120),
    y: PLAYER.DROP_ALT,
    z: (rng() - 0.5) * (MAP_SIZE - 120),
    yaw: rng() * Math.PI * 2, pitch: 0,
    hp: PLAYER.HP, shield: 0,
    alive: true, kills: 0, placement: 0,
    weapon: 'pickaxe', rarity: 0,
    anim: 0,                    // bitmask: 1 moving, 2 shooting
    // bot brain
    bot: isBot ? { tx: 0, tz: 0, retarget: 0, shootCd: 1 + rng() * 2, enemy: null } : null,
  };
  if (isBot) {
    p.y = 0; // bots skip the skydive; placed on ground by first tick
    const guns = ['pistol', 'smg', 'ar', 'shotgun'];
    p.weapon = guns[Math.floor(rng() * guns.length)];
    p.rarity = rollRarity(rng);
    p.shield = rng() < 0.4 ? 50 : 0;
  }
  m.players.set(id, p);
  return p;
}

export function fillWithBots(m, upTo) {
  const names = [...BOT_NAMES].sort(() => m.rng() - 0.5);
  let i = 0;
  while (m.players.size < upTo && i < names.length) {
    addPlayer(m, { id: newId('bot'), name: names[i++], isBot: true });
  }
}

export function aliveCount(m) {
  let n = 0;
  for (const p of m.players.values()) if (p.alive) n++;
  return n;
}

export function damagePlayer(m, targetId, dmg, killerId, api) {
  const t = m.players.get(targetId);
  if (!t || !t.alive) return;
  let remaining = dmg;
  if (t.shield > 0) {
    const absorbed = Math.min(t.shield, remaining);
    t.shield -= absorbed;
    remaining -= absorbed;
  }
  t.hp -= remaining;
  api.onEvent({ t: 'damage', id: targetId, hp: t.hp, shield: t.shield, by: killerId });
  if (t.hp <= 0) {
    t.hp = 0;
    t.alive = false;
    t.placement = aliveCount(m) + 1;
    const killer = m.players.get(killerId);
    if (killer && killerId !== targetId) killer.kills++;
    api.onEvent({
      t: 'kill', victim: targetId, victimName: t.name,
      killer: killerId, killerName: killer ? killer.name : 'The Storm',
      kills: killer ? killer.kills : 0,
    });
    checkEnd(m, api);
  }
}

function checkEnd(m, api) {
  if (m.state !== 'play') return;
  const alive = [...m.players.values()].filter(p => p.alive);
  if (alive.length <= 1) {
    m.state = 'ended';
    m.winnerId = alive[0] ? alive[0].id : null;
    if (alive[0]) alive[0].placement = 1;
    api.onEvent({ t: 'end', winner: m.winnerId, winnerName: alive[0] ? alive[0].name : null });
  }
}

// --- Loot rolls -------------------------------------------------------------
export function rollWeaponItem(rng) {
  const guns = ['pistol', 'smg', 'ar', 'shotgun', 'sniper'];
  const weights = [24, 22, 26, 18, 10];
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  let w = guns[0];
  for (let i = 0; i < guns.length; i++) { roll -= weights[i]; if (roll <= 0) { w = guns[i]; break; } }
  return { kind: 'weapon', w, rarity: rollRarity(rng) };
}

export function rollHealItem(rng) {
  const keys = ['bandage', 'minishield', 'medkit', 'shieldpot'];
  const weights = [35, 30, 15, 20];
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  let h = keys[0];
  for (let i = 0; i < keys.length; i++) { roll -= weights[i]; if (roll <= 0) { h = keys[i]; break; } }
  return { kind: 'heal', h, uses: HEALS[h].uses };
}

export function rollChestLoot(rng) {
  const items = [rollWeaponItem(rng)];
  items.push(rollHealItem(rng));
  if (rng() < 0.5) items.push({ kind: 'mats', mat: ['wood', 'brick', 'metal'][Math.floor(rng() * 3)], amount: 30 });
  return items;
}

export function rollFloorLoot(rng) {
  return rng() < 0.6 ? rollWeaponItem(rng) : rollHealItem(rng);
}

export function spawnGroundLoot(m, item, x, y, z, api) {
  const id = newId('L');
  const drop = { id, item, x, y, z };
  m.groundLoot.set(id, drop);
  api.onEvent({ t: 'lootSpawn', loot: drop });
  return drop;
}

// --- Tick -------------------------------------------------------------------
export function startMatch(m, api) {
  m.state = 'play';
  api.onEvent({ t: 'matchStart' });
}

export function tickMatch(m, dt, api) {
  if (m.state !== 'play') return;
  m.time += dt;
  tickStorm(m, dt, api);
  for (const p of m.players.values()) {
    if (!p.alive) continue;
    // storm damage (humans and bots alike)
    const d = dist2d(p.x, p.z, m.storm.cx, m.storm.cz);
    if (d > m.storm.r && m.storm.dps > 0) {
      p.stormAcc = (p.stormAcc || 0) + m.storm.dps * dt;
      if (p.stormAcc >= 1) {
        const dmg = Math.floor(p.stormAcc);
        p.stormAcc -= dmg;
        // storm ignores shield in Fortnite; hit hp directly
        p.hp -= dmg;
        api.onEvent({ t: 'damage', id: p.id, hp: p.hp, shield: p.shield, by: 'storm' });
        if (p.hp <= 0) {
          p.hp = 0; p.alive = false; p.placement = aliveCount(m) + 1;
          api.onEvent({ t: 'kill', victim: p.id, victimName: p.name, killer: 'storm', killerName: 'The Storm', kills: 0 });
          checkEnd(m, api);
        }
      }
    }
    if (p.isBot && p.alive) tickBot(m, p, dt, api);
  }
}

function tickStorm(m, dt, api) {
  const s = m.storm;
  if (s.shrinking) {
    s.shrinkT += dt;
    const t = Math.min(1, s.shrinkT / s.shrinkDur);
    s.cx = s.fromCx + (s.toCx - s.fromCx) * t;
    s.cz = s.fromCz + (s.toCz - s.fromCz) * t;
    s.r = s.fromR + (s.toR - s.fromR) * t;
    if (t >= 1) {
      s.shrinking = false;
      const next = STORM_PHASES[s.phase + 1];
      s.timer = next ? next.wait : Infinity;
    }
  } else {
    s.timer -= dt;
    if (s.timer <= 0 && s.phase + 1 < STORM_PHASES.length) {
      s.phase++;
      const ph = STORM_PHASES[s.phase];
      s.dps = ph.dps;
      s.fromCx = s.cx; s.fromCz = s.cz; s.fromR = s.r;
      // new center: random point that keeps the new circle inside the old one
      const maxOff = Math.max(0, s.r - ph.r);
      const ang = m.rng() * Math.PI * 2;
      const off = m.rng() * maxOff * 0.7;
      s.toCx = s.cx + Math.cos(ang) * off;
      s.toCz = s.cz + Math.sin(ang) * off;
      s.toR = ph.r;
      s.shrinkT = 0;
      s.shrinkDur = ph.shrink;
      s.shrinking = true;
      api.onEvent({ t: 'stormPhase', phase: s.phase });
    }
  }
}

// --- Bot AI -----------------------------------------------------------------
function tickBot(m, b, dt, api) {
  const brain = b.bot;
  const s = m.storm;

  // choose enemy: nearest alive player within 45m
  brain.retarget -= dt;
  if (brain.retarget <= 0) {
    brain.retarget = 0.8;
    let best = null, bestD = 45;
    for (const p of m.players.values()) {
      if (p.id === b.id || !p.alive || p.y > 40) continue; // ignore skydivers
      const d = dist2d(b.x, b.z, p.x, p.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    brain.enemy = best ? best.id : null;

    // movement goal
    const distToStorm = dist2d(b.x, b.z, s.cx, s.cz);
    if (distToStorm > s.r * 0.85) {
      // head toward safe zone with jitter
      const ang = Math.atan2(s.cz - b.z, s.cx - b.x) + (m.rng() - 0.5) * 0.6;
      brain.tx = b.x + Math.cos(ang) * 40;
      brain.tz = b.z + Math.sin(ang) * 40;
    } else if (!brain.enemy && m.rng() < 0.4) {
      brain.tx = b.x + (m.rng() - 0.5) * 60;
      brain.tz = b.z + (m.rng() - 0.5) * 60;
    }
  }

  const enemy = brain.enemy ? m.players.get(brain.enemy) : null;

  // move
  let mvx = brain.tx - b.x, mvz = brain.tz - b.z;
  const mvd = Math.hypot(mvx, mvz);
  let moving = false;
  if (enemy && enemy.alive) {
    // strafe-ish: keep 12-25m distance
    const d = dist2d(b.x, b.z, enemy.x, enemy.z);
    if (d > 22) { mvx = enemy.x - b.x; mvz = enemy.z - b.z; }
    else if (d < 10) { mvx = b.x - enemy.x; mvz = b.z - enemy.z; }
    else { mvx = 0; mvz = 0; }
    b.yaw = Math.atan2(enemy.x - b.x, enemy.z - b.z);
  }
  const spd = PLAYER.SPEED * 0.78;
  const md = Math.hypot(mvx, mvz);
  if (md > 1.5) {
    b.x += (mvx / md) * spd * dt;
    b.z += (mvz / md) * spd * dt;
    if (!enemy) b.yaw = Math.atan2(mvx, mvz);
    moving = true;
  } else if (mvd > 1.5 && !enemy) {
    moving = false;
  }
  // clamp to map
  const lim = MAP_SIZE / 2 - 6;
  b.x = Math.max(-lim, Math.min(lim, b.x));
  b.z = Math.max(-lim, Math.min(lim, b.z));
  b.y = api.heightAt(b.x, b.z);
  b.anim = moving ? 1 : 0;

  // shoot
  brain.shootCd -= dt;
  if (enemy && enemy.alive && brain.shootCd <= 0) {
    const w = WEAPONS[b.weapon] || WEAPONS.pistol;
    brain.shootCd = Math.max(0.25, w.rate) + m.rng() * 0.5;
    const d = dist2d(b.x, b.z, enemy.x, enemy.z);
    if (d <= w.range) {
      b.anim |= 2;
      api.onEvent({
        t: 'shot', from: b.id,
        fx: b.x, fy: b.y + 1.5, fz: b.z,
        tx: enemy.x, ty: enemy.y + 1.2, tz: enemy.z,
      });
      // hit chance falls with distance; bots are beatable on purpose
      const hitChance = Math.max(0.08, 0.5 - d * 0.009);
      if (m.rng() < hitChance) {
        const dmg = Math.round(w.dmg * RARITIES[b.rarity].mult * (0.8 + m.rng() * 0.3));
        damagePlayer(m, enemy.id, dmg, b.id, api);
      }
    }
  }
}
