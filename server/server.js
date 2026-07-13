// NotFortnite multiplayer server.
//
//   cd server && npm install && npm start          (listens on :8081)
//   PORT=9000 npm start                            (custom port)
//
// Runs one match at a time: humans join a lobby, a countdown starts, the
// lobby is filled with CPU bots, and everyone drops in. When the match ends
// the server resets to a fresh lobby. Clients connect from the web game via
// "Multiplayer" -> ws://<this-host>:8081
import { WebSocketServer } from 'ws';
import {
  MATCH_PLAYERS, LOBBY_COUNTDOWN, TICK_RATE, SNAPSHOT_RATE, HEALS, PLAYER, BUILD,
} from '../shared/constants.js';
import { createWorld } from '../shared/worldgen.js';
import {
  createMatch, addPlayer, fillWithBots, startMatch, tickMatch, damagePlayer,
  aliveCount, rollChestLoot, rollFloorLoot, spawnGroundLoot, newId,
} from '../shared/match.js';

const PORT = process.env.PORT || 8081;
const wss = new WebSocketServer({ port: PORT });
console.log(`[notfortnite] server listening on :${PORT}`);

let nextClientId = 1;
const clients = new Map(); // ws -> {id, name, custom, inMatch}

let room = null;
newLobby();

function newLobby() {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const world = createWorld(seed);
  const match = createMatch(seed);
  match.heightAt = world.heightAt;
  room = {
    seed,
    world,
    match,
    state: 'lobby',        // lobby | play | ended
    countdown: null,
    deltas: { buildsGone: [], propsGone: [], chestsOpened: [], playerBuilds: [] },
  };
  console.log(`[notfortnite] new lobby, seed ${seed}`);
  // pull every connected client into the fresh lobby (auto-requeue)
  for (const c of clients.values()) {
    c.inMatch = false;
    joinLobbyOrMatch(c);
  }
  broadcastLobby();
}

const api = {
  heightAt: (x, z) => room.world.heightAt(x, z),
  onEvent: (ev) => {
    broadcast({ t: 'ev', ev });
    if (ev.t === 'end') {
      room.state = 'ended';
      console.log(`[notfortnite] match over, winner: ${ev.winnerName}`);
      setTimeout(newLobby, 8000);
    }
  },
};

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------
wss.on('connection', (ws) => {
  const id = 'p' + (nextClientId++);
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    handleMessage(ws, id, msg);
  });
  ws.on('close', () => {
    const c = clients.get(ws);
    clients.delete(ws);
    if (!c) return;
    const p = room.match.players.get(c.id);
    if (p && p.alive && room.state === 'play') {
      p.alive = false;
      api.onEvent({
        t: 'kill', victim: c.id, victimName: p.name,
        killer: 'left', killerName: 'Disconnect', kills: 0,
      });
      // re-check win condition
      if (aliveCount(room.match) <= 1 && room.state === 'play') {
        const last = [...room.match.players.values()].find(pl => pl.alive);
        room.match.state = 'ended';
        api.onEvent({ t: 'end', winner: last ? last.id : null, winnerName: last ? last.name : null });
      }
    }
    broadcast({ t: 'playerLeft', id: c.id });
    broadcastLobby();
    console.log(`[notfortnite] ${c.name} disconnected`);
  });
});

function handleMessage(ws, id, msg) {
  const c = clients.get(ws);
  switch (msg.t) {
    case 'join': {
      const name = String(msg.name || 'Player').slice(0, 16);
      const client = { id, ws, name, custom: msg.custom || null, inMatch: false };
      clients.set(ws, client);
      console.log(`[notfortnite] ${name} joined (${id})`);
      joinLobbyOrMatch(client);
      break;
    }
    case 'requeue':
      if (!c) return;
      if (room.state === 'lobby') joinLobbyOrMatch(c);
      else {
        c.inMatch = false;
        send(ws, { t: 'lobby', humans: clients.size, countdown: null });
      }
      break;
    case 'state': {
      if (!c) return;
      const p = room.match.players.get(c.id);
      if (!p || !p.alive) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z;
      p.yaw = msg.yaw; p.pitch = msg.pitch;
      p.anim = msg.anim; p.weapon = msg.weapon; p.rarity = msg.rarity || 0;
      break;
    }
    case 'shot':
      if (c) broadcastExcept(ws, { t: 'ev', ev: { ...msg, t: 'shot', from: c.id } });
      break;
    case 'hit': {
      if (!c || room.state !== 'play') return;
      const dmg = Math.max(0, Math.min(200, Number(msg.dmg) || 0));
      damagePlayer(room.match, msg.target, dmg, c.id, api);
      break;
    }
    case 'useHeal': {
      if (!c) return;
      const p = room.match.players.get(c.id);
      const h = HEALS[msg.h];
      if (!p || !p.alive || !h) return;
      if (h.hp) p.hp = Math.min(h.hpCap, p.hp + h.hp);
      if (h.shield) p.shield = Math.min(h.shieldCap, p.shield + h.shield);
      break;
    }
    case 'build': {
      if (!c || !msg.piece || room.world.builds.has(msg.piece.id)) return;
      const piece = {
        id: String(msg.piece.id), type: msg.piece.type, mat: msg.piece.mat,
        x: msg.piece.x, y: msg.piece.y, z: msg.piece.z, rot: msg.piece.rot | 0,
        hp: BUILD.MAT_HP[msg.piece.mat] || 150,
      };
      if (!['wall', 'floor', 'ramp'].includes(piece.type)) return;
      room.world.builds.set(piece.id, piece);
      room.deltas.playerBuilds.push(piece);
      broadcastExcept(ws, { t: 'build', piece });
      break;
    }
    case 'buildDmg': {
      const b = room.world.builds.get(msg.id);
      if (!b) return;
      b.hp -= Math.max(0, Math.min(200, Number(msg.dmg) || 0));
      if (b.hp <= 0) {
        room.world.builds.delete(msg.id);
        room.deltas.buildsGone.push(msg.id);
        broadcast({ t: 'buildGone', id: msg.id });
      } else {
        broadcastExcept(ws, { t: 'buildHp', id: msg.id, hp: b.hp });
      }
      break;
    }
    case 'propHit': {
      const p = room.world.props.get(msg.id);
      if (!p) return;
      p.hp--;
      if (p.hp <= 0) {
        room.world.props.delete(msg.id);
        room.deltas.propsGone.push(msg.id);
        broadcast({ t: 'propGone', id: msg.id });
      } else {
        broadcastExcept(ws, { t: 'propHit', id: msg.id, hp: p.hp });
      }
      break;
    }
    case 'chest': {
      const chest = room.world.chests.find(ch => ch.id === msg.id);
      if (!chest || chest.opened) return;
      chest.opened = true;
      room.deltas.chestsOpened.push(chest.id);
      broadcast({ t: 'chestOpened', id: chest.id });
      const items = rollChestLoot(room.match.rng);
      items.forEach((item, i) => {
        const ang = (i / items.length) * Math.PI * 2;
        spawnGroundLoot(room.match, item, chest.x + Math.cos(ang) * 0.9, chest.y, chest.z + Math.sin(ang) * 0.9, api);
      });
      break;
    }
    case 'pickup': {
      if (room.match.groundLoot.has(msg.id)) {
        room.match.groundLoot.delete(msg.id);
        broadcastExcept(ws, { t: 'lootGone', id: msg.id });
      }
      break;
    }
  }
}

function joinLobbyOrMatch(client) {
  const you = { x: 0, y: PLAYER.DROP_ALT, z: 0 };
  if (room.state !== 'lobby') {
    // match in progress: they wait in the lobby screen for the next one
    send(client.ws, welcomeMsg(client, you));
    send(client.ws, { t: 'lobby', humans: clients.size, countdown: null });
    return;
  }
  client.inMatch = true;
  const p = room.match.players.get(client.id) ||
    addPlayer(room.match, { id: client.id, name: client.name, custom: client.custom });
  send(client.ws, welcomeMsg(client, { x: p.x, y: p.y, z: p.z }));
  broadcastExcept(client.ws, { t: 'playerJoined', player: publicPlayer(p) });
  if (room.countdown === null) room.countdown = LOBBY_COUNTDOWN;
  broadcastLobby();
}

function welcomeMsg(client, you) {
  return {
    t: 'welcome',
    id: client.id,
    seed: room.seed,
    state: room.state,
    you,
    storm: publicStorm(),
    players: [...room.match.players.values()].map(publicPlayer),
    deltas: {
      builds: room.deltas.playerBuilds,
      buildsGone: room.deltas.buildsGone,
      propsGone: room.deltas.propsGone,
      chestsOpened: room.deltas.chestsOpened,
      loot: [...room.match.groundLoot.values()],
    },
  };
}

function broadcastLobby() {
  if (room.state !== 'lobby') return;
  broadcast({ t: 'lobby', humans: clients.size, countdown: room.countdown });
}

// ---------------------------------------------------------------------------
// Match lifecycle + tick
// ---------------------------------------------------------------------------
function beginMatch() {
  fillWithBots(room.match, MATCH_PLAYERS);
  for (const spot of room.world.floorLootSpots) {
    spawnGroundLoot(room.match, rollFloorLoot(room.match.rng), spot.x, spot.y, spot.z, { onEvent: () => {} });
  }
  room.state = 'play';
  startMatch(room.match, api);
  for (const c of clients.values()) {
    if (!c.inMatch) continue;
    const p = room.match.players.get(c.id);
    send(c.ws, { t: 'start', you: p ? { x: p.x, y: p.y, z: p.z } : null });
  }
  // ship the floor loot to everyone after 'start'
  broadcast({ t: 'ev', ev: { t: 'matchStart' } });
  for (const drop of room.match.groundLoot.values()) {
    broadcast({ t: 'ev', ev: { t: 'lootSpawn', loot: drop } });
  }
  console.log(`[notfortnite] match started with ${room.match.players.size} players (${[...clients.values()].filter(c => c.inMatch).length} human)`);
}

let snapAcc = 0;
setInterval(() => {
  const dt = 1 / TICK_RATE;
  if (room.state === 'lobby' && room.countdown !== null) {
    const humans = [...clients.values()].some(c => c.inMatch);
    if (!humans) { room.countdown = null; broadcastLobby(); }
    else {
      const before = Math.ceil(room.countdown);
      room.countdown -= dt;
      if (Math.ceil(room.countdown) !== before) broadcastLobby();
      if (room.countdown <= 0) beginMatch();
    }
  }
  if (room.state === 'play') {
    tickMatch(room.match, dt, api);
    snapAcc += dt;
    if (snapAcc >= 1 / SNAPSHOT_RATE) {
      snapAcc = 0;
      broadcast({
        t: 'snapshot',
        storm: publicStorm(),
        alive: aliveCount(room.match),
        players: [...room.match.players.values()].map(snapPlayer),
      });
    }
  }
}, 1000 / TICK_RATE);

function publicStorm() {
  const s = room.match.storm;
  return {
    cx: s.cx, cz: s.cz, r: s.r, phase: s.phase, timer: s.timer,
    shrinking: s.shrinking, toCx: s.toCx, toCz: s.toCz, toR: s.toR, dps: s.dps,
  };
}

function publicPlayer(p) {
  return {
    id: p.id, name: p.name, custom: p.custom, isBot: p.isBot,
    x: p.x, y: p.y, z: p.z, yaw: p.yaw,
    hp: p.hp, shield: p.shield, alive: p.alive, kills: p.kills,
    weapon: p.weapon, anim: p.anim,
  };
}

function snapPlayer(p) {
  return {
    id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
    yaw: +p.yaw.toFixed(3), hp: p.hp, shield: p.shield,
    alive: p.alive, kills: p.kills, weapon: p.weapon, anim: p.anim,
  };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) if (c.ws.readyState === 1) c.ws.send(data);
}

function broadcastExcept(ws, msg) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) if (c.ws !== ws && c.ws.readyState === 1) c.ws.send(data);
}
