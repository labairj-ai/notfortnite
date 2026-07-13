import * as THREE from 'three';
import {
  PLAYER, WEAPONS, RARITIES, HEALS, BUILD, HARVEST, MAP_SIZE, MATCH_PLAYERS, dist2d,
} from '../shared/constants.js';
import { createWorld } from '../shared/worldgen.js';
import {
  createMatch, addPlayer, fillWithBots, startMatch, tickMatch, damagePlayer,
  aliveCount, rollChestLoot, rollFloorLoot, spawnGroundLoot, newId,
} from '../shared/match.js';
import {
  buildCharacter, animateCharacter, setHeldItem, makeNameTag,
  SKINS, OUTFITS, HATS, loadCustom, saveCustom,
} from './character.js';
import { createControls, IS_TOUCH } from './controls.js';
import { createWorldView, supportHeight, resolveWalls, raycastWorld, raySphere } from './world.js';
import { connect, getServerUrl, saveServerUrl } from './net.js';
import { unlockAudio, sfx } from './sfx.js';
import { createUI } from './ui.js';
import { createSky, SUN_DIR } from './sky.js';
import { createFX } from './fx.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const G = BUILD.GRID;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const QUALITY = IS_TOUCH ? 'low' : 'high';
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.6 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
if (QUALITY === 'high') {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 700);
const ui = createUI();
const ctl = createControls(canvas);
let custom = loadCustom();

if (typeof __BUILD_TIME__ !== 'undefined') {
  $('build-time').textContent = 'Build: ' + __BUILD_TIME__;
}
document.body.classList.toggle('touch', IS_TOUCH);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (S && S.composer) S.composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------
let S = null; // active session

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9d3ee');
  scene.fog = new THREE.Fog('#bfe0f2', 110, IS_TOUCH ? 260 : 380);
  const sun = new THREE.DirectionalLight('#fff2d8', 2.1);
  sun.position.copy(SUN_DIR).multiplyScalar(160);
  if (QUALITY === 'high') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const ext = 70;
    sun.shadow.camera.left = -ext;
    sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext;
    sun.shadow.camera.bottom = -ext;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0006;
  }
  scene.add(sun, sun.target);
  scene.add(new THREE.AmbientLight('#d8e8ff', 0.55));
  scene.add(new THREE.HemisphereLight('#b8dcff', '#5f8f4e', 0.75));
  scene.userData.sun = sun;
  return scene;
}

function makeComposer(scene) {
  if (QUALITY !== 'high') return null;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.7, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return composer;
}

function createSession(seed, mode) {
  myChar = null; // character mesh belongs to the previous scene
  const scene = makeScene();
  const world = createWorld(seed);
  const view = createWorldView(scene, world, QUALITY);
  return {
    mode, seed, scene, world, view,
    sky: createSky(scene),
    fx: createFX(scene),
    composer: makeComposer(scene),
    state: 'playing',
    match: null,          // offline
    net: null,            // online
    myId: 'me',
    me: null,             // my entry in players map (offline) or local mirror (online)
    phys: { vy: 0, grounded: false, gliding: true },
    entities: new Map(),  // id -> {char, tag, tx, ty, tz, tyaw, shootT}
    slots: [{ kind: 'weapon', w: 'pickaxe', rarity: 0 }, null, null, null, null, null],
    active: 0,
    mats: { wood: 0, brick: 0, metal: 0 },
    buildMode: false,
    buildPiece: 'wall',
    buildMat: 'wood',
    ghost: null,
    fireCd: 0,
    healCd: 0,
    tracers: [],
    yaw: 0, pitch: 0,
    sendT: 0,
    stormView: null,      // smoothed storm for rendering (online)
    killedBy: 'The Storm',
    ended: false,
    openedChests: new Set(),
  };
}

const api = {
  heightAt: (x, z) => S.world.heightAt(x, z),
  onEvent: (ev) => handleEvent(ev),
};

// ---------------------------------------------------------------------------
// Offline match
// ---------------------------------------------------------------------------
function startOffline() {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  S = createSession(seed, 'offline');
  S.match = createMatch(seed);
  S.match.heightAt = S.world.heightAt;
  S.me = addPlayer(S.match, { id: 'me', name: custom.name || 'Player', custom });
  fillWithBots(S.match, MATCH_PLAYERS);
  spawnFloorLoot(S.match, S.world);
  startMatch(S.match, api);
  S.phys.gliding = true;
  syncEntities(playersArray());
  ui.showScreen('hud');
  ui.killfeed('Dropping in! Glide down and find loot.', true);
  enterPlay();
}

function spawnFloorLoot(m, world) {
  for (const spot of world.floorLootSpots) {
    spawnGroundLoot(m, rollFloorLoot(m.rng), spot.x, spot.y, spot.z, api);
  }
}

// ---------------------------------------------------------------------------
// Online match
// ---------------------------------------------------------------------------
function startOnline(url) {
  ui.showScreen('lobby-screen');
  ui.setLobbyStatus('Connecting to ' + url + ' …');
  const net = connect(url, {
    onOpen() {
      net.send({ t: 'join', name: custom.name || 'Player', custom });
    },
    onMessage(msg) { handleNetMessage(net, msg); },
    onClose() {
      if (S && S.mode === 'online') { S = null; }
      ui.setLobbyStatus('Disconnected from server.');
      setTimeout(() => ui.showScreen('menu-screen'), 1500);
    },
    onError() {
      ui.setLobbyStatus('Could not reach server. Check the address and that the server is running.');
      setTimeout(() => ui.showScreen('menu-screen'), 2500);
    },
  });
  pendingNet = net;
}
let pendingNet = null;

function handleNetMessage(net, msg) {
  switch (msg.t) {
    case 'welcome': {
      S = createSession(msg.seed, 'online');
      S.net = net;
      S.myId = msg.id;
      S.me = {
        id: msg.id, name: custom.name, custom, isBot: false,
        x: msg.you.x, y: msg.you.y, z: msg.you.z, yaw: 0, pitch: 0,
        hp: PLAYER.HP, shield: 0, alive: true, kills: 0, anim: 0,
        weapon: 'pickaxe', rarity: 0,
      };
      S.stormView = { ...msg.storm };
      S.remote = new Map();
      for (const p of msg.players) if (p.id !== S.myId) S.remote.set(p.id, p);
      S.snapshotStorm = msg.storm;
      applyWorldDeltas(msg.deltas);
      // never drop into an in-progress match; the server sends 'start' when
      // it's our turn to play
      ui.setLobbyStatus(msg.state === 'play'
        ? 'Match in progress — you\'ll join the next one…'
        : 'Waiting for players…');
      break;
    }
    case 'lobby':
      ui.setLobbyStatus(
        msg.humans + ' player' + (msg.humans === 1 ? '' : 's') + ' connected' +
        (msg.countdown != null ? ' — match starts in ' + Math.ceil(msg.countdown) + 's' : ' — waiting…'));
      break;
    case 'start':
      if (msg.you) { S.me.x = msg.you.x; S.me.y = msg.you.y; S.me.z = msg.you.z; }
      beginOnlinePlay();
      break;
    case 'snapshot': {
      if (!S) return;
      S.snapshotStorm = msg.storm;
      S.aliveN = msg.alive;
      for (const p of msg.players) {
        if (p.id === S.myId) {
          S.me.hp = p.hp; S.me.shield = p.shield;
          if (S.me.alive && !p.alive) onLocalDeath();
          S.me.alive = p.alive;
          S.me.kills = p.kills;
          continue;
        }
        let e = S.remote.get(p.id);
        if (!e) { S.remote.set(p.id, p); e = p; }
        Object.assign(e, p);
      }
      break;
    }
    case 'playerJoined':
      if (msg.player.id !== S.myId) S.remote.set(msg.player.id, msg.player);
      break;
    case 'playerLeft': {
      S.remote.delete(msg.id);
      const e = S.entities.get(msg.id);
      if (e) { S.scene.remove(e.char); S.entities.delete(msg.id); }
      break;
    }
    case 'ev':
      handleEvent(msg.ev);
      break;
    case 'build':
      if (!S.world.builds.has(msg.piece.id)) {
        S.world.builds.set(msg.piece.id, msg.piece);
        S.view.addBuildMesh(msg.piece);
      }
      break;
    case 'buildGone':
      S.world.builds.delete(msg.id);
      S.view.removeBuildMesh(msg.id);
      break;
    case 'buildHp': {
      const b = S.world.builds.get(msg.id);
      if (b) b.hp = msg.hp;
      break;
    }
    case 'propHit': {
      const p = S.world.props.get(msg.id);
      if (p) p.hp = msg.hp;
      break;
    }
    case 'propGone':
      S.world.props.delete(msg.id);
      S.view.removePropMesh(msg.id);
      break;
    case 'chestOpened':
      S.openedChests.add(msg.id);
      S.view.openChestMesh(msg.id);
      break;
    case 'lootGone':
      removeLoot(msg.id);
      break;
    case 'matchOver':
      // handled via 'end' event; server resets to lobby shortly after
      break;
  }
}

function applyWorldDeltas(d) {
  if (!d) return;
  for (const piece of d.builds || []) {
    if (!S.world.builds.has(piece.id)) { S.world.builds.set(piece.id, piece); S.view.addBuildMesh(piece); }
  }
  for (const id of d.buildsGone || []) { S.world.builds.delete(id); S.view.removeBuildMesh(id); }
  for (const id of d.propsGone || []) { S.world.props.delete(id); S.view.removePropMesh(id); }
  for (const id of d.chestsOpened || []) { S.openedChests.add(id); S.view.openChestMesh(id); }
  for (const drop of d.loot || []) {
    S.lootOnline = S.lootOnline || new Map();
    S.lootOnline.set(drop.id, drop);
    S.view.addLootMesh(drop);
  }
}

function beginOnlinePlay() {
  S.state = 'playing';
  S.phys = { vy: 0, grounded: false, gliding: true };
  ui.showScreen('hud');
  ui.killfeed('Dropping in! Glide down and find loot.', true);
  enterPlay();
}

// ---------------------------------------------------------------------------
// Shared event handling (offline events fire directly; online relayed)
// ---------------------------------------------------------------------------
function handleEvent(ev) {
  if (!S) return;
  switch (ev.t) {
    case 'damage':
      if (ev.id === S.myId) {
        if (S.mode === 'offline') { /* state already updated in match */ }
        else { S.me.hp = ev.hp; S.me.shield = ev.shield; }
        ui.damageFlash();
        sfx.hurt();
      } else if (ev.by === S.myId) {
        ui.hitmarker();
        sfx.hit();
        if (ev.dmg && ev.x !== undefined) {
          S.fx.number(String(ev.dmg), ev.x, ev.y + 2.1, ev.z, ev.toShield ? '#5ad8ff' : '#ffffff');
        }
      }
      break;
    case 'kill': {
      const meKiller = ev.killer === S.myId;
      const meVictim = ev.victim === S.myId;
      ui.killfeed(ev.killerName + ' eliminated ' + ev.victimName, meKiller || meVictim);
      if (meKiller) { S.me.kills = ev.kills; }
      {
        const victim = S.mode === 'offline' ? S.match.players.get(ev.victim) : S.remote.get(ev.victim);
        if (victim) S.fx.killBurst(victim.x, victim.y, victim.z);
      }
      if (meVictim) { S.killedBy = ev.killerName; onLocalDeath(); }
      // remove victim's character mesh after a beat
      const e = S.entities.get(ev.victim);
      if (e) setTimeout(() => { if (S && S.entities.get(ev.victim) === e) { S.scene.remove(e.char); S.entities.delete(ev.victim); } }, 1200);
      break;
    }
    case 'shot': {
      if (ev.from !== S.myId) {
        addTracer(ev.fx, ev.fy, ev.fz, ev.tx, ev.ty, ev.tz);
        S.fx.muzzleFlash(ev.fx, ev.fy, ev.fz);
        const d = S.me ? dist2d(ev.fx, ev.fz, S.me.x, S.me.z) : 999;
        if (d < 70) sfx.shoot('pistol');
        const e = S.entities.get(ev.from);
        if (e) e.shootT = 0.25;
      }
      break;
    }
    case 'lootSpawn':
      S.view.addLootMesh(ev.loot);
      if (S.mode === 'online') {
        S.lootOnline = S.lootOnline || new Map();
        S.lootOnline.set(ev.loot.id, ev.loot);
      }
      break;
    case 'stormPhase':
      sfx.storm();
      ui.killfeed('⛈ The storm is closing in!', false);
      break;
    case 'end': {
      S.ended = true;
      const won = ev.winner === S.myId;
      setTimeout(() => {
        if (!S) return;
        if (won) { sfx.win(); ui.showEnd(true, 1, S.me.kills); }
        else if (S.me.alive) {
          // someone else won while we were alive (shouldn't happen) — treat as loss
          ui.showEnd(false, 2, S.me.kills, ev.winnerName || 'the storm');
        }
        exitPlayControls();
      }, won ? 800 : 400);
      break;
    }
    case 'matchStart':
      break;
  }
}

function onLocalDeath() {
  if (!S || S.deathShown) return;
  S.deathShown = true;
  sfx.lose();
  setTimeout(() => {
    if (!S) return;
    // computed at show time so the online alive count has refreshed
    const placement = S.mode === 'offline'
      ? (S.me.placement || aliveCount(S.match) + 1)
      : (S.aliveN ?? 1) + 1;
    ui.showEnd(false, placement, S.me.kills, S.killedBy);
    exitPlayControls();
  }, 1300);
}

// ---------------------------------------------------------------------------
// Local player physics + actions
// ---------------------------------------------------------------------------
function enterPlay() {
  ctl.enabled = true;
  unlockAudio();
  if (!IS_TOUCH) canvas.requestPointerLock();
  updateSlotsUI();
  ui.setMats(S.mats);
}

function exitPlayControls() {
  ctl.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
}

canvas.addEventListener('click', () => {
  if (S && S.state === 'playing' && !IS_TOUCH && ctl.enabled && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});

function playersArray() {
  if (S.mode === 'offline') return [...S.match.players.values()];
  const arr = [...S.remote.values()];
  return arr;
}

function currentStorm() {
  return S.mode === 'offline' ? S.match.storm : S.snapshotStorm;
}

function updateLocalPlayer(dt) {
  const me = S.me;
  if (!me.alive) return;
  const phys = S.phys;

  // look
  S.yaw -= ctl.lookDX;
  S.pitch = Math.max(-1.35, Math.min(1.35, S.pitch + ctl.lookDY));
  me.yaw = S.yaw;
  me.pitch = S.pitch;

  // move relative to yaw
  const sin = Math.sin(S.yaw), cos = Math.cos(S.yaw);
  const fx = -sin, fz = -cos;          // forward
  const rx = cos, rz = -sin;           // right
  let vx = (fx * ctl.moveZ + rx * ctl.moveX);
  let vz = (fz * ctl.moveZ + rz * ctl.moveX);
  const vlen = Math.hypot(vx, vz);
  if (vlen > 1) { vx /= vlen; vz /= vlen; }
  const speed = PLAYER.SPEED * (phys.gliding ? 1.4 : 1);
  me.x += vx * speed * dt;
  me.z += vz * speed * dt;

  const lim = MAP_SIZE / 2 - 4;
  me.x = Math.max(-lim, Math.min(lim, me.x));
  me.z = Math.max(-lim, Math.min(lim, me.z));

  // vertical
  const support = supportHeight(S.world, me.x, me.y, me.z);
  if (phys.gliding) {
    phys.vy = ctl.jump ? -PLAYER.DIVE_FALL : -PLAYER.GLIDE_FALL;
    me.y += phys.vy * dt;
    if (me.y <= support) { me.y = support; phys.gliding = false; phys.vy = 0; phys.grounded = true; }
  } else {
    if (ctl.jumpPressed && phys.grounded) { phys.vy = PLAYER.JUMP; phys.grounded = false; }
    phys.vy -= PLAYER.GRAVITY * dt;
    phys.vy = Math.max(phys.vy, -40);
    me.y += phys.vy * dt;
    if (me.y <= support) {
      me.y = support; phys.vy = 0; phys.grounded = true;
    } else if (me.y > support + 0.05) {
      phys.grounded = false;
    }
  }

  // walls push-out
  const fixed = resolveWalls(S.world, me.x, me.y, me.z, PLAYER.RADIUS);
  me.x = fixed.x; me.z = fixed.z;

  me.anim = (vlen > 0.1 ? 1 : 0) | (S.fireCd > (activeWeaponDef()?.rate || 1) - 0.15 ? 2 : 0);

  // actions
  if (ctl.slotPressed >= 0) selectSlot(ctl.slotPressed);
  if (ctl.buildTogglePressed) toggleBuildMode();
  if (ctl.piecePressed && S.buildMode) { S.buildPiece = ctl.piecePressed; refreshBuildUI(); }
  if (ctl.matCyclePressed && S.buildMode) {
    const order = ['wood', 'brick', 'metal'];
    S.buildMat = order[(order.indexOf(S.buildMat) + 1) % 3];
    refreshBuildUI();
  }

  S.fireCd -= dt;
  S.healCd -= dt;
  if (S.buildMode) {
    updateGhost();
    if (ctl.firePressed) tryPlace();
  } else if (ctl.fire && S.fireCd <= 0) {
    fireActiveItem();
  }

  if (ctl.interactPressed) tryInteract();
  checkAutoPickup();
  updateInteractPrompt();
}

function activeWeaponDef() {
  const item = S.slots[S.active];
  if (item && item.kind === 'weapon') return WEAPONS[item.w];
  return null;
}

function selectSlot(i) {
  if (i === S.active) return;
  if (!S.slots[i] && i !== 0) return;
  S.active = i;
  if (S.buildMode) toggleBuildMode();
  const item = S.slots[i];
  S.me.weapon = item && item.kind === 'weapon' ? item.w : 'pickaxe';
  S.me.rarity = item && item.kind === 'weapon' ? item.rarity : 0;
  updateSlotsUI();
}

function updateSlotsUI() { ui.setSlots(S.slots, S.active); }

// --- shooting / harvesting / healing ---------------------------------------
function fireActiveItem() {
  const item = S.slots[S.active];
  if (!item) return;
  if (item.kind === 'heal') { useHeal(item); return; }
  const w = WEAPONS[item.w];
  S.fireCd = w.rate;
  sfx.shoot(item.w);

  // ray from camera center
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  if (w.spread) {
    dir.x += (Math.random() - 0.5) * w.spread * 2;
    dir.y += (Math.random() - 0.5) * w.spread * 2;
    dir.z += (Math.random() - 0.5) * w.spread * 2;
    dir.normalize();
  }
  const origin = camera.position.clone();
  const range = w.range;

  // nearest of: world geometry, players
  const worldHit = raycastWorld(S.world, origin, dir, range);
  let playerHit = null;
  for (const p of playersArray()) {
    if (p.id === S.myId || !p.alive) continue;
    const t = raySphere(origin, dir, p.x, p.y + 1.0, p.z, 0.9, range);
    if (t !== null && (!playerHit || t < playerHit.dist)) playerHit = { dist: t, id: p.id };
  }

  let hitPoint = origin.clone().addScaledVector(dir, range);
  if (playerHit && (!worldHit || playerHit.dist < worldHit.dist)) {
    hitPoint = origin.clone().addScaledVector(dir, playerHit.dist);
    let dmg = Math.round(w.dmg * RARITIES[item.rarity].mult);
    if (w.falloff) dmg = Math.round(dmg * Math.max(0.3, 1 - playerHit.dist / w.range));
    applyDamage(playerHit.id, dmg);
  } else if (worldHit) {
    hitPoint = origin.clone().addScaledVector(dir, worldHit.dist);
    if (worldHit.kind === 'prop') hitProp(worldHit.id, item.w === 'pickaxe');
    else hitBuild(worldHit.id, item.w === 'pickaxe' ? 50 : w.dmg, item.w === 'pickaxe');
  } else if (w.melee) {
    return; // pickaxe whiff
  }

  // muzzle roughly at chest height
  const mx = S.me.x, my = S.me.y + 1.4, mz = S.me.z;
  addTracer(mx, my, mz, hitPoint.x, hitPoint.y, hitPoint.z);
  if (!w.melee) S.fx.muzzleFlash(mx + dir.x, my + dir.y, mz + dir.z);
  if (playerHit || worldHit) S.fx.hitSparks(hitPoint.x, hitPoint.y, hitPoint.z);
  if (S.mode === 'online') {
    S.net.send({ t: 'shot', fx: mx, fy: my, fz: mz, tx: hitPoint.x, ty: hitPoint.y, tz: hitPoint.z });
  }
}

function applyDamage(targetId, dmg) {
  if (S.mode === 'offline') damagePlayer(S.match, targetId, dmg, S.myId, api);
  else S.net.send({ t: 'hit', target: targetId, dmg });
}

const HARVEST_FX = {
  tree: { color: '#5a9c3a', num: '#c98d4b' },
  rock: { color: '#9a9a92', num: '#c96a5a' },
  crate: { color: '#b8c4d2', num: '#aab6c5' },
};

function hitProp(id, isPickaxe) {
  const p = S.world.props.get(id);
  if (!p) return;
  p.hp--;
  const fx = HARVEST_FX[p.type];
  S.fx.harvestBurst(p.x, p.y + 1.6, p.z, fx.color);
  if (isPickaxe) {
    grantMats(HARVEST[p.type].mat, HARVEST[p.type].perHit);
    S.fx.number('+' + HARVEST[p.type].perHit, p.x, p.y + 2.6, p.z, fx.num, 0.8);
  }
  if (p.hp <= 0) {
    S.world.props.delete(id);
    S.view.removePropMesh(id);
  }
  if (S.mode === 'online') S.net.send({ t: 'propHit', id });
}

function hitBuild(id, dmg, isPickaxe) {
  const b = S.world.builds.get(id);
  if (!b) return;
  if (isPickaxe) grantMats(b.mat, HARVEST.build.perHit);
  if (S.mode === 'offline') {
    b.hp -= dmg;
    if (b.hp <= 0) { S.world.builds.delete(id); S.view.removeBuildMesh(id); }
  } else {
    S.net.send({ t: 'buildDmg', id, dmg });
  }
}

function grantMats(mat, amount) {
  S.mats[mat] = Math.min(BUILD.MAT_CAP, S.mats[mat] + amount);
  ui.setMats(S.mats);
}

function useHeal(item) {
  if (S.healCd > 0) return;
  const h = HEALS[item.h];
  const me = S.me;
  if (h.hp && me.hp >= (h.hpCap || 100)) return;
  if (h.shield && me.shield >= (h.shieldCap || 100)) return;
  S.healCd = 1.1;
  S.fireCd = 0.6;
  sfx.heal();
  if (S.mode === 'offline') {
    if (h.hp) me.hp = Math.min(h.hpCap, me.hp + h.hp);
    if (h.shield) me.shield = Math.min(h.shieldCap, me.shield + h.shield);
  } else {
    S.net.send({ t: 'useHeal', h: item.h });
  }
  item.uses--;
  if (item.uses <= 0) {
    S.slots[S.active] = null;
    selectSlot(0);
  }
  updateSlotsUI();
}

// --- building ----------------------------------------------------------------
function toggleBuildMode() {
  S.buildMode = !S.buildMode;
  if (S.buildMode && !S.ghost) makeGhost();
  if (S.ghost) S.ghost.visible = S.buildMode;
  refreshBuildUI();
}

function refreshBuildUI() {
  ui.setBuildMode(S.buildMode, S.buildPiece, S.buildMat, S.mats);
  if (S.ghost) rebuildGhostShape();
}

function makeGhost() {
  S.ghost = new THREE.Group();
  S.scene.add(S.ghost);
  rebuildGhostShape();
}

function rebuildGhostShape() {
  if (!S.ghost) return;
  S.ghost.clear();
  const mat = new THREE.MeshBasicMaterial({ color: '#4fc3ff', transparent: true, opacity: 0.4, depthWrite: false });
  let mesh;
  if (S.buildPiece === 'wall') mesh = new THREE.Mesh(new THREE.BoxGeometry(G, G, 0.3), mat);
  else if (S.buildPiece === 'floor') mesh = new THREE.Mesh(new THREE.BoxGeometry(G, 0.3, G), mat);
  else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(G, 0.3, G * 1.35), mat);
    mesh.rotation.x = -Math.PI / 4;
  }
  S.ghost.add(mesh);
}

function ghostPlacement() {
  const me = S.me;
  const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
  const ax = me.x + fx * G;
  const az = me.z + fz * G;
  const gx = Math.round(ax / G) * G;
  const gz = Math.round(az / G) * G;
  const gy = Math.round(me.y / G) * G;
  // walls sit on cell edges facing the player; keep it simple: center of cell
  const rot = ((Math.round(S.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  return { x: gx, y: gy, z: gz, rot: (rot % 2 === 0 ? 0 : 1), rampRot: rot };
}

function updateGhost() {
  if (!S.ghost) return;
  const g = ghostPlacement();
  if (S.buildPiece === 'wall') {
    S.ghost.position.set(g.x, g.y + G / 2, g.z);
    S.ghost.rotation.y = g.rot * Math.PI / 2;
  } else if (S.buildPiece === 'floor') {
    S.ghost.position.set(g.x, g.y + 0.15, g.z);
    S.ghost.rotation.y = 0;
  } else {
    S.ghost.position.set(g.x, g.y + G / 2, g.z);
    S.ghost.rotation.y = g.rampRot * Math.PI / 2;
  }
}

function tryPlace() {
  if (S.mats[S.buildMat] < BUILD.COST) { ui.killfeed('Not enough ' + S.buildMat + '! Harvest with your pickaxe.', true); return; }
  const g = ghostPlacement();
  const piece = {
    id: newId('b'),
    type: S.buildPiece,
    mat: S.buildMat,
    x: g.x, y: g.y, z: g.z,
    rot: S.buildPiece === 'ramp' ? g.rampRot : g.rot,
    hp: BUILD.MAT_HP[S.buildMat],
  };
  // block duplicate piece in same spot
  for (const b of S.world.builds.values()) {
    if (b.type === piece.type && Math.abs(b.x - piece.x) < 0.5 && Math.abs(b.y - piece.y) < 0.5 && Math.abs(b.z - piece.z) < 0.5) return;
  }
  S.mats[S.buildMat] -= BUILD.COST;
  ui.setMats(S.mats);
  S.world.builds.set(piece.id, piece);
  S.view.addBuildMesh(piece);
  sfx.build();
  refreshBuildUI();
  if (S.mode === 'online') S.net.send({ t: 'build', piece });
}

// --- loot / chests -----------------------------------------------------------
function groundLootMap() {
  return S.mode === 'offline' ? S.match.groundLoot : (S.lootOnline = S.lootOnline || new Map());
}

function checkAutoPickup() {
  const me = S.me;
  for (const drop of groundLootMap().values()) {
    if (dist2d(me.x, me.z, drop.x, drop.z) < 1.7 && Math.abs(me.y - drop.y) < 2.5) {
      if (tryTakeItem(drop.item)) {
        removeLoot(drop.id);
        sfx.pickup();
        if (S.mode === 'online') S.net.send({ t: 'pickup', id: drop.id });
      }
    }
  }
}

function removeLoot(id) {
  groundLootMap().delete(id);
  S.view.removeLootMesh(id);
}

function tryTakeItem(item) {
  if (item.kind === 'mats') { grantMats(item.mat, item.amount); return true; }
  for (let i = 1; i < 6; i++) {
    if (!S.slots[i]) {
      S.slots[i] = { ...item };
      updateSlotsUI();
      if (S.active === 0 && item.kind === 'weapon') selectSlot(i);
      return true;
    }
  }
  return false; // inventory full
}

function nearestChest() {
  let best = null, bestD = 2.6;
  for (const c of S.world.chests) {
    if (c.opened || S.openedChests.has(c.id)) continue;
    const d = dist2d(S.me.x, S.me.z, c.x, c.z);
    if (d < bestD && Math.abs(S.me.y - c.y) < 3) { best = c; bestD = d; }
  }
  return best;
}

function updateInteractPrompt() {
  const chest = nearestChest();
  if (IS_TOUCH) ui.setInteract(chest ? 'OPEN' : null);
  else $('interact-prompt').classList.toggle('hidden', !chest);
}

function tryInteract() {
  const chest = nearestChest();
  if (!chest) return;
  sfx.chest();
  if (S.mode === 'offline') {
    chest.opened = true;
    S.view.openChestMesh(chest.id);
    const items = rollChestLoot(S.match.rng);
    items.forEach((item, i) => {
      const ang = (i / items.length) * Math.PI * 2;
      spawnGroundLoot(S.match, item, chest.x + Math.cos(ang) * 0.9, chest.y, chest.z + Math.sin(ang) * 0.9, api);
    });
  } else {
    S.net.send({ t: 'chest', id: chest.id });
  }
}

// --- tracers -------------------------------------------------------------------
function addTracer(x1, y1, z1, x2, y2, z2) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: '#ffe9a0', transparent: true, opacity: 0.9, toneMapped: false,
  }));
  S.scene.add(line);
  S.tracers.push({ line, t: 0.12 });
}

function updateTracers(dt) {
  for (let i = S.tracers.length - 1; i >= 0; i--) {
    const tr = S.tracers[i];
    tr.t -= dt;
    tr.line.material.opacity = Math.max(0, tr.t / 0.12);
    if (tr.t <= 0) {
      S.scene.remove(tr.line);
      tr.line.geometry.dispose();
      S.tracers.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Other players' rendering
// ---------------------------------------------------------------------------
function syncEntities(players) {
  for (const p of players) {
    if (p.id === S.myId) continue;
    if (!S.entities.has(p.id) && p.alive) {
      const char = buildCharacter(p.custom || { skin: p.isBot ? 1 : 0, outfit: Math.floor(Math.random() * 8), hat: 0 });
      char.add(makeNameTag(p.name, p.isBot));
      S.scene.add(char);
      S.entities.set(p.id, { char, tx: p.x, ty: p.y, tz: p.z, tyaw: p.yaw, shootT: 0 });
    }
  }
}

function updateEntities(dt) {
  const players = playersArray();
  syncEntities(players);
  const lerp = S.mode === 'online' ? Math.min(1, dt * 12) : 1;
  for (const p of players) {
    if (p.id === S.myId) continue;
    const e = S.entities.get(p.id);
    if (!e) continue;
    if (!p.alive) continue;
    e.char.position.x += (p.x - e.char.position.x) * lerp;
    e.char.position.y += (p.y - e.char.position.y) * lerp;
    e.char.position.z += (p.z - e.char.position.z) * lerp;
    // shortest-arc yaw lerp; humans and bots use opposite yaw conventions,
    // and the mesh's face points +z
    const meshYaw = p.isBot ? p.yaw : p.yaw + Math.PI;
    let dy = meshYaw - e.char.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    e.char.rotation.y += dy * (S.mode === 'online' ? Math.min(1, dt * 10) : 1);
    e.shootT = Math.max(0, e.shootT - dt);
    setHeldItem(e.char, p.weapon);
    animateCharacter(e.char, dt, (p.anim & 1) !== 0, (p.anim & 2) !== 0 || e.shootT > 0);
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
function updateCamera() {
  const me = S.me;
  const eyeY = me.y + 1.62;
  const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  const fwd = new THREE.Vector3(-Math.sin(S.yaw) * cp, -sp, -Math.cos(S.yaw) * cp);
  const right = new THREE.Vector3(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
  const target = new THREE.Vector3(me.x, eyeY, me.z);
  const camPos = target.clone().addScaledVector(fwd, -4.4).addScaledVector(right, 0.85);
  camPos.y += 0.4;
  const terrainY = S.world.heightAt(camPos.x, camPos.z);
  if (camPos.y < terrainY + 0.4) camPos.y = terrainY + 0.4;
  camera.position.copy(camPos);
  camera.lookAt(target.clone().addScaledVector(fwd, 6));
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let myChar = null, lastT = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!S || S.state !== 'playing') return;

  ctl.update();
  updateLocalPlayer(dt);

  if (S.mode === 'offline') {
    tickMatch(S.match, dt, api);
  } else {
    // interpolate storm view toward snapshot
    const sv = S.stormView, ss = S.snapshotStorm;
    if (ss) {
      const k = Math.min(1, dt * 4);
      sv.cx += (ss.cx - sv.cx) * k;
      sv.cz += (ss.cz - sv.cz) * k;
      sv.r += (ss.r - sv.r) * k;
      Object.assign(sv, { toCx: ss.toCx, toCz: ss.toCz, toR: ss.toR, timer: ss.timer, shrinking: ss.shrinking, phase: ss.phase, dps: ss.dps });
    }
    S.sendT -= dt;
    if (S.sendT <= 0 && S.me.alive) {
      S.sendT = 0.1;
      const m = S.me;
      S.net.send({ t: 'state', x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch, anim: m.anim, weapon: m.weapon, rarity: m.rarity });
    }
  }

  // my own character mesh
  if (!myChar) {
    myChar = buildCharacter(custom);
    S.scene.add(myChar);
  }
  myChar.position.set(S.me.x, S.me.y, S.me.z);
  myChar.rotation.y = S.yaw + Math.PI; // mesh face is +z; player forward is -z

  myChar.visible = S.me.alive;
  setHeldItem(myChar, S.me.weapon);
  animateCharacter(myChar, dt, (S.me.anim & 1) !== 0, (S.me.anim & 2) !== 0);

  updateEntities(dt);
  updateTracers(dt);
  updateCamera();
  S.fx.update(dt);
  S.sky.update(dt, camera);

  // shadow camera follows the player so shadows stay crisp anywhere on the map
  const sun = S.scene.userData.sun;
  sun.position.set(S.me.x + SUN_DIR.x * 160, SUN_DIR.y * 160, S.me.z + SUN_DIR.z * 160);
  sun.target.position.set(S.me.x, 0, S.me.z);

  const storm = S.mode === 'offline' ? S.match.storm : S.stormView;
  S.view.updateStorm(storm);
  S.view.tick(now / 1000);

  // HUD
  ui.setHealth(S.me.hp, S.me.shield);
  const stormForUi = S.mode === 'offline' ? S.match.storm : (S.snapshotStorm || S.stormView);
  ui.setStormStatus(stormForUi, dist2d(S.me.x, S.me.z, stormForUi.cx, stormForUi.cz));
  ui.setAlive(S.mode === 'offline' ? aliveCount(S.match) : (S.aliveN ?? '–'));
  ui.setKills(S.me.kills);
  ui.drawMinimap(stormForUi, S.me.x, S.me.z, S.yaw);

  if (S.composer) S.composer.render();
  else renderer.render(S.scene, camera);
  ctl.consumeFrame();
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------------------
// Menus & customization
// ---------------------------------------------------------------------------
function endSession() {
  if (S && S.net) S.net.close();
  S = null;
  myChar = null;
  ui.showScreen('menu-screen');
}

$('play-solo-btn').addEventListener('click', () => { unlockAudio(); startOffline(); });
$('play-online-btn').addEventListener('click', () => {
  unlockAudio();
  $('server-url').value = getServerUrl();
  ui.showScreen('server-screen');
});
$('server-connect-btn').addEventListener('click', () => {
  let url = $('server-url').value.trim();
  if (!url) return;
  if (!/^wss?:\/\//.test(url)) url = 'ws://' + url;
  saveServerUrl(url);
  startOnline(url);
});
$('server-back-btn').addEventListener('click', () => ui.showScreen('menu-screen'));
$('customize-btn').addEventListener('click', () => { openCustomize(); });
$('end-again-btn').addEventListener('click', () => {
  const mode = S ? S.mode : 'offline';
  const net = S && S.net;
  if (mode === 'online' && net && net.connected) {
    S.deathShown = false;
    ui.showScreen('lobby-screen');
    ui.setLobbyStatus('Waiting for the next match…');
    net.send({ t: 'requeue' });
  } else {
    endSession();
    startOffline();
  }
});
$('end-menu-btn').addEventListener('click', endSession);
$('lobby-cancel-btn').addEventListener('click', () => {
  if (pendingNet) pendingNet.close();
  endSession();
});

// customization screen
function openCustomize() {
  ui.showScreen('custom-screen');
  $('custom-name').value = custom.name || '';
  buildSwatches('skin-swatches', SKINS, custom.skin, (i) => { custom.skin = i; });
  buildSwatches('outfit-swatches', OUTFITS, custom.outfit, (i) => { custom.outfit = i; });
  const hatWrap = $('hat-options');
  hatWrap.innerHTML = '';
  HATS.forEach((h, i) => {
    const b = document.createElement('button');
    b.className = 'hat-btn' + (i === custom.hat ? ' selected' : '');
    b.textContent = h === 'none' ? 'No Hat' : h[0].toUpperCase() + h.slice(1);
    b.addEventListener('click', () => {
      custom.hat = i;
      hatWrap.querySelectorAll('.hat-btn').forEach((el, j) => el.classList.toggle('selected', j === i));
    });
    hatWrap.appendChild(b);
  });
}

function buildSwatches(id, colors, selected, onPick) {
  const wrap = $(id);
  wrap.innerHTML = '';
  colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === selected ? ' selected' : '');
    b.style.background = c;
    b.addEventListener('click', () => {
      onPick(i);
      wrap.querySelectorAll('.swatch').forEach((el, j) => el.classList.toggle('selected', j === i));
    });
    wrap.appendChild(b);
  });
}

$('custom-save-btn').addEventListener('click', () => {
  custom.name = ($('custom-name').value.trim() || 'Player').slice(0, 16);
  saveCustom(custom);
  ui.showScreen('menu-screen');
});

// try to lock landscape on mobile when starting play
document.addEventListener('click', () => {
  if (IS_TOUCH && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}, { once: true });

ui.showScreen('menu-screen');
