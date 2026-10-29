import { QUALITY_PRESETS, createPerformanceMonitor } from "./performance.js";
import {
  createMetrics,
  recordMetric,
  summarizeMetrics,
  persistMetrics,
} from "../shared/metrics.js";
import {
  createPractice,
  practiceLoadout,
  completePractice,
  PRACTICE_STEPS,
} from "../shared/practice.js";
import { installSettings } from "./settings.js";
import { initializeInventory, processAction } from "../shared/actions.js";
import { takeItem, newInventory } from "../shared/inventory.js";
import { traceShot, viewDirection, point, add } from "../shared/geometry.js";
import * as THREE from "three";
import {
  PLAYER,
  WEAPONS,
  RARITIES,
  HEALS,
  BUILD,
  HARVEST,
  MAP_SIZE,
  MATCH_PLAYERS,
  dist2d,
} from "../shared/constants.js";
import { createWorld } from "../shared/worldgen.js";
import {
  createMatch,
  addPlayer,
  fillWithBots,
  startMatch,
  tickMatch,
  damagePlayer,
  aliveCount,
  rollChestLoot,
  rollFloorLoot,
  spawnGroundLoot,
  newId,
} from "../shared/match.js";
import {
  buildCharacter,
  animateCharacter,
  setHeldItem,
  makeNameTag,
  BODIES,
  SKINS,
  OUTFITS,
  HATS,
  HAIRS,
  HAIR_COLORS,
  EMOTES,
  loadCustom,
  saveCustom,
} from "./character.js";
import { createControls, IS_TOUCH } from "./controls.js";
import {
  createWorldView,
  supportHeight,
  resolveWalls,
  raycastWorld,
  raySphere,
} from "./world.js";
import { connect, getServerUrl, saveServerUrl } from "./net.js";
import { unlockAudio, sfx } from "./sfx.js";
import { createUI } from "./ui.js";
import { createSky, SUN_DIR } from "./sky.js";
import { createFX } from "./fx.js";
import {
  loadModel,
  modelReady,
  createRiggedInstance,
  MODEL_DEFS,
} from "./models.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const $ = (id) => document.getElementById(id);
const G = BUILD.GRID;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
let QUALITY = "low";
const perfMonitor = createPerformanceMonitor();
const canvas = $("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.6 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
if (QUALITY === "high") {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  700,
);
const ui = createUI();
const ctl = createControls(canvas);
let custom = loadCustom();
const preferences = installSettings(ctl, () => applyQuality());

ui.initEmoteWheel(EMOTES, (i) => {
  if (!S) return;
  playEmote(i);
  S.emoteWheelOpen = false;
  ui.showEmoteWheel(false);
  ctl.enabled = true;
  if (!IS_TOUCH) requestLock();
});

if (typeof __BUILD_TIME__ !== "undefined") {
  $("build-time").textContent = "Build: " + __BUILD_TIME__;
}

// unified character factory: rigged GLB bodies when loaded, procedural otherwise
const RIGGED = new Set(Object.keys(MODEL_DEFS));
function makeCharacter(cust) {
  const bodyKey = BODIES[(cust?.body ?? 0) % BODIES.length];
  if (RIGGED.has(bodyKey)) {
    const rigged = createRiggedInstance(bodyKey, cust);
    if (rigged) return rigged;
    loadModel(bodyKey, import.meta.env.BASE_URL, {
      signal: S?.assetAbort?.signal,
    }).then(() => {
      if (
        !S &&
        !$("custom-screen").classList.contains("hidden") &&
        modelReady(bodyKey)
      )
        refreshPreview();
    });
  }
  const fallback = buildCharacter(cust);
  fallback.userData.pendingModel = RIGGED.has(bodyKey) ? bodyKey : null;
  fallback.userData.appearance = cust;
  return fallback;
}
document.body.classList.toggle("touch", IS_TOUCH);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (S && S.composer)
    S.composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------
let S = null; // active session
if (import.meta.env.DEV) Object.defineProperty(window, "__S", { get: () => S });
applyQuality();

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a9d3ee");
  scene.fog = new THREE.Fog("#bfe0f2", 110, IS_TOUCH ? 260 : 380);
  const sun = new THREE.DirectionalLight("#fff2d8", 2.1);
  sun.position.copy(SUN_DIR).multiplyScalar(160);
  if (QUALITY === "high") {
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
  scene.add(new THREE.AmbientLight("#d8e8ff", 0.55));
  scene.add(new THREE.HemisphereLight("#b8dcff", "#5f8f4e", 0.75));
  scene.userData.sun = sun;
  return scene;
}

function makeComposer(scene) {
  if (QUALITY !== "high") return null;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.38,
    0.7,
    0.86,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return composer;
}

function createSession(seed, mode, options = {}) {
  if (S) disposeSession();
  myChar = null; // character mesh belongs to the previous scene
  const scene = makeScene();
  const world = createWorld(seed, options);
  const view = createWorldView(scene, world, QUALITY);
  return {
    mode,
    seed,
    scene,
    world,
    view,
    assetAbort: new AbortController(),
    aimDebug: false,
    preset: options.preset || "Classic",
    metrics: createMetrics(seed, options.preset),
    practice: null,
    lastHud: 0,
    sky: createSky(scene),
    fx: createFX(scene),
    composer: makeComposer(scene),
    state: "playing",
    match: null, // offline
    net: null, // online
    myId: "me",
    me: null, // my entry in players map (offline) or local mirror (online)
    phys: { vy: 0, grounded: false, gliding: true },
    entities: new Map(), // id -> {char, tag, tx, ty, tz, tyaw, shootT}
    slots: [
      { kind: "weapon", w: "pickaxe", rarity: 0 },
      null,
      null,
      null,
      null,
      null,
    ],
    active: 0,
    mats: { wood: 0, brick: 0, metal: 0 },
    buildMode: false,
    buildPiece: "wall",
    buildMat: "wood",
    ghost: null,
    actionSeq: 0,
    pendingActions: new Map(),
    pendingPickup: new Set(),
    pickupDelay: new Map(),
    fireCd: 0,
    healCd: 0,
    tracers: [],
    yaw: 0,
    pitch: 0,
    sendT: 0,
    stormView: null, // smoothed storm for rendering (online)
    killedBy: "The Storm",
    ended: false,
    openedChests: new Set(),
    emoting: false,
    emoteWheelOpen: false,
  };
}

const api = {
  heightAt: (x, z) => S.world.heightAt(x, z),
  onEvent: (ev) => handleEvent(ev),
};

// ---------------------------------------------------------------------------
// Offline match
// ---------------------------------------------------------------------------
function startOffline(practice = false) {
  const options = {
    preset: practice ? "Classic" : $("match-preset").value,
    difficulty: $("bot-difficulty").value,
  };
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  S = createSession(practice ? 42 : seed, "offline", options);
  S.match = createMatch(S.seed, options);
  S.match.heightAt = S.world.heightAt;
  S.match.world = S.world;
  S.me = addPlayer(S.match, {
    id: "me",
    name: custom.name || "Player",
    custom,
  });
  initializeInventory(S.me);
  S.slots = S.me.slots;
  S.mats = S.me.mats;
  if (!practice) fillWithBots(S.match, MATCH_PLAYERS);
  spawnFloorLoot(S.match, S.world);
  startMatch(S.match, api);
  if (practice) setupPractice();
  S.phys.gliding = !practice;
  syncEntities(playersArray());
  ui.showScreen("hud");
  ui.killfeed(
    practice
      ? "Practice: choose a weapon, aim at targets, or follow the guide."
      : "Dropping in! Glide down and find loot.",
    true,
  );
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
  ui.showScreen("lobby-screen");
  ui.setLobbyStatus("Connecting to " + url + " …");
  const net = connect(url, {
    onOpen() {
      net.send({ t: "join", name: custom.name || "Player", custom });
    },
    onMessage(msg) {
      if (net !== pendingNet || net.closedByMenu) return;
      handleNetMessage(net, msg);
    },
    onClose() {
      if (net.closedByMenu || net !== pendingNet) return;
      if (S?.net === net) {
        disposeSession();
        exitPlayControls();
        S = null;
      }
      ui.setLobbyStatus("Disconnected from server.");
      setTimeout(() => {
        if (!S && pendingNet === net) ui.showScreen("menu-screen");
      }, 1500);
    },
    onError() {
      if (net.closedByMenu || net !== pendingNet) return;
      ui.setLobbyStatus(
        "Could not reach server. Check the address and that the server is running.",
      );
      setTimeout(() => {
        if (!S && pendingNet === net) ui.showScreen("menu-screen");
      }, 2500);
    },
  });
  pendingNet = net;
}
let pendingNet = null;

function handleNetMessage(net, msg) {
  switch (msg.t) {
    case "inventory":
      if (!S) return;
      S.slots = msg.slots;
      S.mats = msg.mats;
      S.me.hp = msg.hp;
      S.me.shield = msg.shield;
      S.pendingPickup.clear();
      if (
        msg.ok &&
        S.pendingActions.get(msg.seq) === "pickup" &&
        S.active === 0
      ) {
        const slot = S.slots.findIndex((i, n) => n > 0 && i?.kind === "weapon");
        if (slot > 0) S.active = slot;
      }
      S.pendingActions.delete(msg.seq);
      if (msg.ok === false && msg.reason)
        ui.killfeed(msg.reason.replaceAll("_", " "), true);
      if (!S.slots[S.active]) S.active = 0;
      syncInventoryUI();
      break;
    case "welcome": {
      S = createSession(msg.seed, "online");
      S.state = "lobby";
      S.net = net;
      S.myId = msg.id;
      S.me = {
        id: msg.id,
        name: custom.name,
        custom,
        isBot: false,
        x: msg.you.x,
        y: msg.you.y,
        z: msg.you.z,
        yaw: 0,
        pitch: 0,
        hp: PLAYER.HP,
        shield: 0,
        alive: true,
        kills: 0,
        anim: 0,
        weapon: "pickaxe",
        rarity: 0,
      };
      S.stormView = { ...msg.storm };
      S.remote = new Map();
      for (const p of msg.players) if (p.id !== S.myId) S.remote.set(p.id, p);
      S.snapshotStorm = msg.storm;
      applyWorldDeltas(msg.deltas);
      // never drop into an in-progress match; the server sends 'start' when
      // it's our turn to play
      ui.setLobbyStatus(
        msg.state === "play"
          ? "Match in progress — you'll join the next one…"
          : "Waiting for players…",
      );
      break;
    }
    case "lobby":
      ui.setLobbyStatus(
        msg.humans +
          " player" +
          (msg.humans === 1 ? "" : "s") +
          " connected" +
          (msg.countdown != null
            ? " — match starts in " + Math.ceil(msg.countdown) + "s"
            : " — waiting…"),
      );
      break;
    case "start":
      if (msg.you) {
        S.me.x = msg.you.x;
        S.me.y = msg.you.y;
        S.me.z = msg.you.z;
      }
      beginOnlinePlay();
      break;
    case "snapshot": {
      if (!S) return;
      S.snapshotStorm = msg.storm;
      S.aliveN = msg.alive;
      for (const p of msg.players) {
        if (p.id === S.myId) {
          S.me.hp = p.hp;
          S.me.shield = p.shield;
          if (S.me.alive && !p.alive) onLocalDeath();
          S.me.alive = p.alive;
          S.me.kills = p.kills;
          continue;
        }
        let e = S.remote.get(p.id);
        if (!e) {
          S.remote.set(p.id, p);
          e = p;
        }
        Object.assign(e, p);
      }
      break;
    }
    case "playerJoined":
      if (msg.player.id !== S.myId) S.remote.set(msg.player.id, msg.player);
      break;
    case "playerLeft": {
      S.remote.delete(msg.id);
      const e = S.entities.get(msg.id);
      if (e) {
        S.scene.remove(e.char);
        S.entities.delete(msg.id);
      }
      break;
    }
    case "ev":
      handleEvent(msg.ev);
      break;
    case "build":
      if (!S.world.builds.has(msg.piece.id)) {
        S.world.builds.set(msg.piece.id, msg.piece);
        S.view.addBuildMesh(msg.piece);
      }
      break;
    case "buildGone":
      S.world.builds.delete(msg.id);
      S.view.removeBuildMesh(msg.id);
      break;
    case "buildHp": {
      const b = S.world.builds.get(msg.id);
      if (b) b.hp = msg.hp;
      break;
    }
    case "propHit": {
      const p = S.world.props.get(msg.id);
      if (p) p.hp = msg.hp;
      break;
    }
    case "propGone":
      S.world.props.delete(msg.id);
      S.view.removePropMesh(msg.id);
      break;
    case "chestOpened":
      S.openedChests.add(msg.id);
      S.view.openChestMesh(msg.id);
      break;
    case "lootGone":
      removeLoot(msg.id);
      break;
    case "matchOver":
      // handled via 'end' event; server resets to lobby shortly after
      break;
  }
}

function applyWorldDeltas(d) {
  if (!d) return;
  for (const piece of d.builds || []) {
    if (!S.world.builds.has(piece.id)) {
      S.world.builds.set(piece.id, piece);
      S.view.addBuildMesh(piece);
    }
  }
  for (const id of d.buildsGone || []) {
    S.world.builds.delete(id);
    S.view.removeBuildMesh(id);
  }
  for (const id of d.propsGone || []) {
    S.world.props.delete(id);
    S.view.removePropMesh(id);
  }
  for (const id of d.chestsOpened || []) {
    S.openedChests.add(id);
    S.view.openChestMesh(id);
  }
  for (const drop of d.loot || []) {
    S.lootOnline = S.lootOnline || new Map();
    S.lootOnline.set(drop.id, drop);
    S.view.addLootMesh(drop);
  }
}

function beginOnlinePlay() {
  S.state = "playing";
  S.phys = { vy: 0, grounded: false, gliding: true };
  ui.showScreen("hud");
  ui.killfeed("Dropping in! Glide down and find loot.", true);
  enterPlay();
}

// ---------------------------------------------------------------------------
// Shared event handling (offline events fire directly; online relayed)
// ---------------------------------------------------------------------------
function handleEvent(ev) {
  if (!S) return;
  switch (ev.t) {
    case "lootGone":
      removeLoot(ev.id);
      break;
    case "lootUpdate":
      removeLoot(ev.loot.id);
      S.view.addLootMesh(ev.loot);
      groundLootMap().set(ev.loot.id, ev.loot);
      break;
    case "buildAdded":
      if (!S.view.buildMeshes.has(ev.piece.id)) S.view.addBuildMesh(ev.piece);
      S.world.builds.set(ev.piece.id, ev.piece);
      break;
    case "buildGone":
      S.world.builds.delete(ev.id);
      S.view.removeBuildMesh(ev.id);
      break;
    case "propGone":
      S.world.props.delete(ev.id);
      S.view.removePropMesh(ev.id);
      break;
    case "propHp":
      if (S.world.props.has(ev.id)) S.world.props.get(ev.id).hp = ev.hp;
      break;
    case "buildHp":
      if (S.world.builds.has(ev.id)) S.world.builds.get(ev.id).hp = ev.hp;
      break;
    case "harvest":
      if (ev.by === S.myId) {
        const colors = { wood: "#c98d4b", brick: "#c96a5a", metal: "#aab6c5" };
        S.fx.harvestBurst(ev.x, ev.y, ev.z, colors[ev.mat]);
        S.fx.number("+" + ev.amount, ev.x, ev.y + 1, ev.z, colors[ev.mat]);
      }
      break;
    case "damage":
      if (ev.id === S.myId || ev.by === S.myId)
        recordMetric(S.metrics, "damage", sessionTime());
      if (S.practice && ev.by === S.myId) {
        S.practice.hits++;
        completePractice(S.practice, "Hit a target");
      }
      if (ev.id === S.myId) {
        if (S.mode === "offline") {
          /* state already updated in match */
        } else {
          S.me.hp = ev.hp;
          S.me.shield = ev.shield;
        }
        ui.damageFlash();
        const attacker = playersArray().find((p) => p.id === ev.by);
        if (attacker)
          ui.damageDirection(
            Math.atan2(-(attacker.x - S.me.x), -(attacker.z - S.me.z)) - S.yaw,
          );
        sfx.hurt();
        cancelEmote();
      } else if (ev.by === S.myId) {
        ui.hitmarker(ev.toShield);
        sfx.hit(ev.toShield);
        if (ev.dmg && ev.x !== undefined) {
          S.fx.number(
            String(ev.dmg),
            ev.x,
            ev.y + 2.1,
            ev.z,
            ev.toShield ? "#5ad8ff" : "#ffffff",
          );
        }
      }
      break;
    case "kill": {
      if (S.practice && ev.victim !== S.myId) {
        const target = S.match.players.get(ev.victim);
        target.hp = 100;
        target.alive = true;
        S.practice.targetResets++;
        return;
      }
      if (ev.killer === S.myId)
        recordMetric(S.metrics, "elimination", sessionTime());
      if (ev.victim === S.myId && ev.killer === "storm")
        recordMetric(S.metrics, "stormDeath", sessionTime());
      const meKiller = ev.killer === S.myId;
      const meVictim = ev.victim === S.myId;
      ui.killfeed(
        ev.killerName + " eliminated " + ev.victimName,
        meKiller || meVictim,
      );
      if (meKiller) {
        S.me.kills = ev.kills;
      }
      {
        const victim =
          S.mode === "offline"
            ? S.match.players.get(ev.victim)
            : S.remote.get(ev.victim);
        if (victim) S.fx.killBurst(victim.x, victim.y, victim.z);
      }
      if (meVictim) {
        S.killedBy = ev.killerName;
        onLocalDeath();
      }
      // rigged characters play their death animation before fading out
      const e = S.entities.get(ev.victim);
      if (e) {
        const isHero = e.char.userData.isHero;
        if (isHero) e.char.userData.override = "death";
        setTimeout(
          () => {
            if (S && S.entities.get(ev.victim) === e) {
              S.scene.remove(e.char);
              disposeCharacter(e.char);
              S.entities.delete(ev.victim);
            }
          },
          isHero ? 2400 : 1200,
        );
      }
      break;
    }
    case "shot": {
      if (ev.from !== S.myId || S.mode === "online") {
        addTracer(ev.fx, ev.fy, ev.fz, ev.tx, ev.ty, ev.tz);
        S.fx.muzzleFlash(ev.fx, ev.fy, ev.fz);
        const d = S.me ? dist2d(ev.fx, ev.fz, S.me.x, S.me.z) : 999;
        if (d < 70) sfx.shoot("pistol");
        const e = S.entities.get(ev.from);
        if (e) e.shootT = 0.25;
      }
      break;
    }
    case "lootSpawn":
      S.view.addLootMesh(ev.loot);
      if (S.mode === "online") {
        S.lootOnline = S.lootOnline || new Map();
        S.lootOnline.set(ev.loot.id, ev.loot);
      }
      break;
    case "stormPhase":
      sfx.storm();
      ui.killfeed("⛈ The storm is closing in!", false);
      break;
    case "end": {
      S.ended = true;
      finishMetrics();
      const won = ev.winner === S.myId;
      if (won && myChar && myChar.userData.isHero)
        myChar.userData.override = "dance";
      const endedSession = S;
      setTimeout(
        () => {
          if (S !== endedSession) return;
          if (won) {
            sfx.win();
            ui.showEnd(true, 1, S.me.kills);
          } else if (S.me.alive) {
            // someone else won while we were alive (shouldn't happen) — treat as loss
            ui.showEnd(false, 2, S.me.kills, ev.winnerName || "the storm");
          }
          exitPlayControls();
        },
        won ? 800 : 400,
      );
      break;
    }
    case "matchStart":
      break;
  }
}

function onLocalDeath() {
  if (!S || S.deathShown) return;
  S.deathShown = true;
  finishMetrics();
  ctl.resetInputs("death");
  cancelEmote();
  ui.showEmoteWheel(false);
  sfx.lose();
  const deadSession = S;
  setTimeout(() => {
    if (S !== deadSession) return;
    // computed at show time so the online alive count has refreshed
    const placement =
      S.mode === "offline"
        ? S.me.placement || aliveCount(S.match) + 1
        : (S.aliveN ?? 1) + 1;
    ui.showEnd(false, placement, S.me.kills, S.killedBy);
    exitPlayControls();
  }, 1300);
}

// ---------------------------------------------------------------------------
// Local player physics + actions
// ---------------------------------------------------------------------------
let pointerLockWanted = false;
function releaseCursor() {
  pointerLockWanted = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function requestLock() {
  pointerLockWanted = true;
  try {
    Promise.resolve(canvas.requestPointerLock())
      .then(() => {
        if (!pointerLockWanted || !ctl.enabled) releaseCursor();
      })
      .catch(() => {});
  } catch {}
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    releaseCursor();
    ctl.resetInputs("escape");
  }
});
document.addEventListener("pointerlockchange", () => {
  if (
    document.pointerLockElement === canvas &&
    (!pointerLockWanted || !ctl.enabled)
  )
    releaseCursor();
});

function enterPlay() {
  ctl.resetInputs("enter-play");
  ctl.enabled = true;
  unlockAudio();
  if (!IS_TOUCH && !S.practice) requestLock();
  updateSlotsUI();
  ui.setMats(S.mats);
}

function exitPlayControls() {
  ctl.enabled = false;
  releaseCursor();
}

canvas.addEventListener("click", () => {
  if (
    S &&
    S.state === "playing" &&
    !IS_TOUCH &&
    ctl.enabled &&
    document.pointerLockElement !== canvas
  ) {
    requestLock();
  }
});

function playersArray() {
  if (S.mode === "offline") return [...S.match.players.values()];
  const arr = [...S.remote.values()];
  return arr;
}

function currentStorm() {
  return S.mode === "offline" ? S.match.storm : S.snapshotStorm;
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

  if (
    ctl.settings.aimAssist &&
    S.mode === "offline" &&
    (S.preset === "Casual" || S.practice)
  ) {
    const forward = viewDirection(S.yaw, S.pitch);
    let best = null,
      bestAngle = 0.08;
    for (const p of playersArray()) {
      if (p.id === S.myId || !p.alive) continue;
      const dx = p.x - me.x,
        dz = p.z - me.z,
        dist = Math.hypot(dx, dz);
      if (dist > 25 || dist < 2) continue;
      let delta = Math.atan2(-dx, -dz) - S.yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(delta) < bestAngle) {
        const d = { x: dx / dist, y: 0, z: dz / dist };
        const h = traceShot(
          S.world,
          [p],
          point(me.x, me.y + 1.2, me.z),
          d,
          dist + 1,
          S.myId,
        );
        if (h?.id === p.id) {
          best = p;
          bestAngle = Math.abs(delta);
        }
      }
    }
    if (best) {
      const angle = Math.atan2(-(best.x - me.x), -(best.z - me.z)) - S.yaw;
      S.yaw +=
        Math.atan2(Math.sin(angle), Math.cos(angle)) * Math.min(0.08, dt * 1.5);
      me.yaw = S.yaw;
    }
  }

  // move relative to yaw
  const sin = Math.sin(S.yaw),
    cos = Math.cos(S.yaw);
  const fx = -sin,
    fz = -cos; // forward
  const rx = cos,
    rz = -sin; // right
  let vx = fx * ctl.moveZ + rx * ctl.moveX;
  let vz = fz * ctl.moveZ + rz * ctl.moveX;
  const vlen = Math.hypot(vx, vz);
  if (vlen > 1) {
    vx /= vlen;
    vz /= vlen;
  }
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
    if (me.y <= support) {
      recordMetric(S.metrics, "landing", sessionTime());
      me.y = support;
      phys.gliding = false;
      phys.vy = 0;
      phys.grounded = true;
    }
  } else {
    if (ctl.jumpPressed && phys.grounded) {
      if (S.practice) S.practice.jumped = true;
      phys.vy = PLAYER.JUMP;
      phys.grounded = false;
    }
    phys.vy -= PLAYER.GRAVITY * dt;
    phys.vy = Math.max(phys.vy, -40);
    me.y += phys.vy * dt;
    if (me.y <= support) {
      if (S.practice?.jumped) {
        completePractice(S.practice, "Jump and land");
        S.practice.jumped = false;
      }
      me.y = support;
      phys.vy = 0;
      phys.grounded = true;
    } else if (me.y > support + 0.05) {
      phys.grounded = false;
    }
  }

  // walls push-out
  const fixed = resolveWalls(S.world, me.x, me.y, me.z, PLAYER.RADIUS);
  me.x = fixed.x;
  me.z = fixed.z;

  me.anim =
    (vlen > 0.1 ? 1 : 0) |
    (S.fireCd > (activeWeaponDef()?.rate || 1) - 0.15 ? 2 : 0);

  // emote wheel
  if (ctl.emoteWheelPressed) toggleEmoteWheel();
  if (ctl.emoteSelected >= 0) {
    playEmote(ctl.emoteSelected);
    S.emoteWheelOpen = false;
    if (!IS_TOUCH) requestLock();
  }
  if (S.emoting && vlen > 0.1) cancelEmote();

  updateCamera(); // aim uses this frame's pose, before any attack

  // actions
  if (ctl.slotPressed >= 0) selectSlot(ctl.slotPressed);
  if (ctl.buildTogglePressed) toggleBuildMode();
  if (ctl.piecePressed && S.buildMode) {
    S.buildPiece = ctl.piecePressed;
    refreshBuildUI();
  }
  if (ctl.matCyclePressed && S.buildMode) {
    const order = ["wood", "brick", "metal"];
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
  if (ctl.debugPressed) {
    S.aimDebug = !S.aimDebug;
    $("debug-overlay").classList.toggle("hidden", !S.aimDebug);
  }
  if (ctl.dropPressed) dispatchAction({ t: "drop", slot: S.active });
  checkAutoPickup();
  updateInteractPrompt();
}

function activeWeaponDef() {
  const item = S.slots[S.active];
  if (item && item.kind === "weapon") return WEAPONS[item.w];
  return null;
}

function selectSlot(i) {
  if (i === S.active) return;
  if (!S.slots[i] && i !== 0) return;
  S.active = i;
  if (S.buildMode) toggleBuildMode();
  const item = S.slots[i];
  S.me.weapon = item && item.kind === "weapon" ? item.w : "pickaxe";
  S.me.rarity = item && item.kind === "weapon" ? item.rarity : 0;
  updateSlotsUI();
}

function updateSlotsUI() {
  ui.setSlots(S.slots, S.active);
}

// --- shooting / harvesting / healing ---------------------------------------
function syncInventoryUI() {
  if (!S) return;
  if (S.mode === "offline") {
    S.slots = S.me.slots;
    S.mats = S.me.mats;
  }
  if (S.slots.some((i, n) => n > 0 && i?.kind === "weapon")) {
    recordMetric(S.metrics, "weapon", sessionTime());
  }
  const item = S.slots[S.active];
  S.me.weapon = item?.kind === "weapon" ? item.w : "pickaxe";
  S.me.rarity = item?.rarity ?? 0;
  updateSlotsUI();
  ui.setMats(S.mats);
}
function dispatchAction(msg) {
  msg.seq = ++S.actionSeq;
  if (S.mode === "online") {
    S.pendingActions.set(msg.seq, msg.t);
    if (S.pendingActions.size > 100)
      S.pendingActions.delete(S.pendingActions.keys().next().value);
    S.net.send(msg);
    return { ok: true, pending: true };
  }
  const result = processAction(S.match, S.world, S.me, msg, api);
  if (result.ok && msg.t === "pickup" && S.active === 0) {
    const slot = S.me.slots.findIndex((i, n) => n > 0 && i?.kind === "weapon");
    if (slot > 0) S.active = slot;
  }
  if (S.practice && result.ok) {
    if (msg.t === "pickup") completePractice(S.practice, "Pick up a weapon");
    if (msg.t === "attack") {
      S.practice.shots++;
      if (result.hit?.kind === "prop")
        completePractice(S.practice, "Harvest materials");
    }
    if (msg.t === "build")
      completePractice(
        S.practice,
        msg.piece.type === "wall" ? "Place a wall" : "Place a ramp",
      );
    if (msg.t === "useHeal") completePractice(S.practice, "Use a healing item");
  }
  syncInventoryUI();
  return result;
}
function fireActiveItem() {
  const item = S.slots[S.active];
  if (!item) return;
  if (item.kind === "heal") {
    if (S.healCd > 0) return;
    const r = dispatchAction({ t: "useHeal", slot: S.active });
    if (r.ok) {
      S.healCd = 1.1;
      S.fireCd = 0.6;
      sfx.heal();
    }
    return;
  }
  const w = WEAPONS[item.w];
  S.fireCd = w.rate;
  sfx.shoot(item.w);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const sight = traceShot(
    S.world,
    playersArray(),
    camera.position,
    dir,
    w.range + 6,
    S.myId,
  );
  const aim = add(camera.position, dir, sight?.dist ?? w.range);
  if (S.aimDebug)
    addTracer(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      aim.x,
      aim.y,
      aim.z,
    );
  const result = dispatchAction({ t: "attack", slot: S.active, aim });
  if (result.impact) {
    const p = result.impact;
    addTracer(S.me.x, S.me.y + 1.4, S.me.z, p.x, p.y, p.z);
    if (result.hit) {
      S.fx.hitSparks(p.x, p.y, p.z);
      if (w.melee) ui.killfeed("Contact", true);
    } else if (w.melee) ui.killfeed("Out of reach — move closer", true);
  }
  if (!w.melee) S.fx.muzzleFlash(S.me.x, S.me.y + 1.4, S.me.z);
}
function grantMats(mat, amount) {
  S.mats[mat] = Math.min(BUILD.MAT_CAP, S.mats[mat] + amount);
  ui.setMats(S.mats);
}

// --- building ----------------------------------------------------------------
// ---------------------------------------------------------------------------
// Emotes
// ---------------------------------------------------------------------------
function playEmote(i) {
  if (!myChar || !S || !S.me.alive || S.ended) return;
  const u = myChar.userData;
  if (u.isHero) {
    const key = `emote${i}`;
    u.override = u.actions?.[key] ? key : u.actions?.dance ? "dance" : null;
  }
  u.emoteIndex = i;
  S.emoting = true;
  ui.showEmoteLabel(EMOTES[i].label);
  sfx.emote();
  ui.killfeed(
    `${custom.name || "Player"} is doing the ${EMOTES[i].label}!`,
    true,
  );
}

function cancelEmote() {
  if (!S) return;
  if (S.emoteWheelOpen) {
    S.emoteWheelOpen = false;
    ui.showEmoteWheel(false);
  }
  if (!S.emoting) return;
  S.emoting = false;
  if (myChar) {
    const u = myChar.userData;
    if (u.isHero) u.override = null;
    u.emoteIndex = -1;
    if (!u.isHero && u.armL) {
      u.armL.shoulder.rotation.z = 0;
      u.armR.shoulder.rotation.z = 0;
      u.legL.hip.rotation.z = 0;
      u.legR.hip.rotation.z = 0;
    }
  }
  ui.showEmoteLabel(null);
}

function toggleEmoteWheel() {
  if (!S) return;
  S.emoteWheelOpen = !S.emoteWheelOpen;
  ui.showEmoteWheel(S.emoteWheelOpen);
  ctl.enabled = !S.emoteWheelOpen;
  if (S.emoteWheelOpen && !IS_TOUCH && document.pointerLockElement) {
    document.exitPointerLock();
  } else if (!S.emoteWheelOpen && !IS_TOUCH && ctl.enabled) {
    requestLock();
  }
}

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
  for (const child of [...S.ghost.children]) disposeCharacter(child);
  S.ghost.clear();
  const mat = new THREE.MeshBasicMaterial({
    color: "#4fc3ff",
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  let mesh;
  if (S.buildPiece === "wall")
    mesh = new THREE.Mesh(new THREE.BoxGeometry(G, G, 0.3), mat);
  else if (S.buildPiece === "floor")
    mesh = new THREE.Mesh(new THREE.BoxGeometry(G, 0.3, G), mat);
  else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(G, 0.3, G * 1.35), mat);
    mesh.rotation.x = -Math.PI / 4;
  }
  S.ghost.add(mesh);
}

function ghostPlacement() {
  const me = S.me;
  const fx = -Math.sin(S.yaw),
    fz = -Math.cos(S.yaw);
  const ax = me.x + fx * G;
  const az = me.z + fz * G;
  const gx = Math.round(ax / G) * G;
  const gz = Math.round(az / G) * G;
  const gy = Math.round(me.y / G) * G;
  // walls sit on cell edges facing the player; keep it simple: center of cell
  const rot = ((Math.round(S.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  return { x: gx, y: gy, z: gz, rot: rot % 2 === 0 ? 0 : 1, rampRot: rot };
}

function updateGhost() {
  if (!S.ghost) return;
  const g = ghostPlacement();
  if (S.buildPiece === "wall") {
    S.ghost.position.set(g.x, g.y + G / 2, g.z);
    S.ghost.rotation.y = (g.rot * Math.PI) / 2;
  } else if (S.buildPiece === "floor") {
    S.ghost.position.set(g.x, g.y + 0.15, g.z);
    S.ghost.rotation.y = 0;
  } else {
    S.ghost.position.set(g.x, g.y + G / 2, g.z);
    S.ghost.rotation.y = (g.rampRot * Math.PI) / 2;
  }
}

function tryPlace() {
  recordMetric(S.metrics, "build", sessionTime());
  if (S.mats[S.buildMat] < BUILD.COST) {
    ui.killfeed(
      "Not enough " + S.buildMat + "! Harvest with your pickaxe.",
      true,
    );
    return;
  }
  const g = ghostPlacement();
  const piece = {
    id: newId("b"),
    type: S.buildPiece,
    mat: S.buildMat,
    x: g.x,
    y: g.y,
    z: g.z,
    rot: S.buildPiece === "ramp" ? g.rampRot : g.rot,
    hp: BUILD.MAT_HP[S.buildMat],
  };
  // block duplicate piece in same spot
  for (const b of S.world.builds.values()) {
    if (
      b.type === piece.type &&
      Math.abs(b.x - piece.x) < 0.5 &&
      Math.abs(b.y - piece.y) < 0.5 &&
      Math.abs(b.z - piece.z) < 0.5
    )
      return;
  }
  const result = dispatchAction({ t: "build", piece });
  if (result.ok) {
    sfx.build();
    refreshBuildUI();
  }
}

// --- loot / chests -----------------------------------------------------------
function groundLootMap() {
  return S.mode === "offline"
    ? S.match.groundLoot
    : (S.lootOnline = S.lootOnline || new Map());
}

function nearbyLoot() {
  return [...groundLootMap().values()]
    .filter(
      (d) =>
        dist2d(S.me.x, S.me.z, d.x, d.z) < 1.7 && Math.abs(S.me.y - d.y) < 2.5,
    )
    .sort(
      (a, b) =>
        dist2d(S.me.x, S.me.z, a.x, a.z) - dist2d(S.me.x, S.me.z, b.x, b.z),
    );
}
function checkAutoPickup() {
  for (const drop of nearbyLoot()) {
    if (
      S.pendingPickup.has(drop.id) ||
      (S.pickupDelay.get(drop.id) || 0) > performance.now()
    )
      continue;
    const possible =
      drop.item.kind === "mats" ? { ok: true } : takeItem(S.slots, drop.item);
    if (!possible.ok) continue;
    if (S.mode === "online") S.pendingPickup.add(drop.id);
    S.pickupDelay.set(drop.id, performance.now() + 500);
    const result = dispatchAction({ t: "pickup", id: drop.id });
    if (result.ok) sfx.pickup();
  }
}
function removeLoot(id) {
  groundLootMap().delete(id);
  S.view.removeLootMesh(id);
  S.pendingPickup.delete(id);
}
function itemLabel(i) {
  return i?.kind === "weapon"
    ? RARITIES[i.rarity].key +
        " " +
        WEAPONS[i.w].name +
        " · " +
        Math.round(WEAPONS[i.w].dmg * RARITIES[i.rarity].mult) +
        " dmg · " +
        WEAPONS[i.w].rate +
        "s"
    : i?.kind === "heal"
      ? HEALS[i.h].name + " x" + i.uses
      : "materials";
}
function showSwap(drop) {
  ctl.resetInputs("swap");
  ctl.enabled = false;
  releaseCursor();
  const dialog = $("swap-dialog");
  $("swap-description").textContent =
    "Pick up " + itemLabel(drop.item) + "? Choose an item to replace.";
  const list = $("swap-slots");
  list.replaceChildren();
  const close = () => {
    dialog.close();
    ctl.enabled = true;
    ctl.resetInputs("swap-close");
  };
  for (let i = 1; i < 6; i++) {
    const b = document.createElement("button");
    b.textContent = itemLabel(S.slots[i]);
    b.onclick = () => {
      if (groundLootMap().has(drop.id)) {
        dispatchAction({ t: "pickup", id: drop.id, replace: i });
      }
      close();
    };
    list.append(b);
  }
  $("swap-cancel").onclick = () => {
    S.pickupDelay.set(drop.id, performance.now() + 1000);
    close();
  };
  dialog.oncancel = () => {
    ctl.enabled = true;
    ctl.resetInputs("swap-cancel");
  };
  dialog.showModal();
}

function nearestChest() {
  let best = null,
    bestD = 2.6;
  for (const c of S.world.chests) {
    if (c.opened || S.openedChests.has(c.id)) continue;
    const d = dist2d(S.me.x, S.me.z, c.x, c.z);
    if (d < bestD && Math.abs(S.me.y - c.y) < 3) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function updateInteractPrompt() {
  const drop = nearbyLoot().find(
    (d) => d.item.kind !== "mats" && !takeItem(S.slots, d.item).ok,
  );
  const chest = nearestChest();
  if (drop) {
    if (IS_TOUCH) ui.setInteract("SWAP");
    else {
      $("interact-prompt").classList.remove("hidden");
      $("interact-prompt").textContent = "F · Swap " + itemLabel(drop.item);
    }
    return;
  }
  $("interact-prompt").textContent = "F · Open Chest";
  if (IS_TOUCH) ui.setInteract(chest ? "OPEN" : null);
  else $("interact-prompt").classList.toggle("hidden", !chest);
}

function tryInteract() {
  const drop = nearbyLoot().find(
    (d) => d.item.kind !== "mats" && !takeItem(S.slots, d.item).ok,
  );
  if (drop) {
    showSwap(drop);
    return;
  }
  const chest = nearestChest();
  if (!chest) return;
  sfx.chest();
  if (S.mode === "offline") {
    chest.opened = true;
    S.view.openChestMesh(chest.id);
    const items = rollChestLoot(S.match.rng);
    items.forEach((item, i) => {
      const ang = (i / items.length) * Math.PI * 2;
      spawnGroundLoot(
        S.match,
        item,
        chest.x + Math.cos(ang) * 0.9,
        chest.y,
        chest.z + Math.sin(ang) * 0.9,
        api,
      );
    });
  } else {
    S.net.send({ t: "chest", id: chest.id });
  }
}

// --- tracers -------------------------------------------------------------------
function addTracer(x1, y1, z1, x2, y2, z2) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, y1, z1),
    new THREE.Vector3(x2, y2, z2),
  ]);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color: "#ffe9a0",
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    }),
  );
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
      tr.line.material.dispose();
      S.tracers.splice(i, 1);
    }
  }
}

function applyQuality(auto) {
  const requested = preferences.get().quality,
    chosen = requested === "Auto" ? auto || "Medium" : requested,
    q = QUALITY_PRESETS[chosen];
  if (!q) return;
  QUALITY = chosen === "High" ? "high" : "low";
  perfMonitor.setQuality(chosen);
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.dpr));
  renderer.shadowMap.enabled = q.shadows;
  if (S) {
    S.composer?.dispose();
    S.composer = null;
    S.scene.userData.sun.castShadow = q.shadows;
    if (q.bloom) S.composer = makeComposer(S.scene);
  }
}
function upgradeLoadedCharacters() {
  const upgrade = (char) => {
    const kind = char?.userData.pendingModel;
    if (!kind || !modelReady(kind)) return char;
    const replacement = makeCharacter(char.userData.appearance);
    replacement.position.copy(char.position);
    replacement.rotation.copy(char.rotation);
    for (const child of [...char.children])
      if (child.isSprite) replacement.add(child);
    S.scene.remove(char);
    disposeCharacter(char);
    S.scene.add(replacement);
    return replacement;
  };
  myChar = upgrade(myChar);
  for (const e of S.entities.values()) e.char = upgrade(e.char);
}
function disposeMaterial(m) {
  for (const value of Object.values(m))
    if (value?.isTexture && !value.userData.sharedModel) value.dispose();
  m.dispose();
}
function disposeCharacter(char) {
  char.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton.dispose();
    if (o.geometry && !o.geometry.userData.sharedModel) o.geometry.dispose();
    for (const m of Array.isArray(o.material)
      ? o.material
      : o.material
        ? [o.material]
        : [])
      disposeMaterial(m);
  });
}

function sessionTime() {
  return S?.mode === "offline"
    ? S.match.time
    : (performance.now() - (S.startedAt ??= performance.now())) / 1000;
}
function finishMetrics() {
  if (!S || S.practice || S.metricsFinished) return;
  S.metricsFinished = true;
  recordMetric(S.metrics, "end", sessionTime());
  persistMetrics(S.metrics, localStorage);
  const summary = summarizeMetrics(S.metrics);
  $("match-summary").textContent =
    "Duration " +
    Math.round(summary.duration || 0) +
    "s · First contact " +
    (summary.firstContact === null
      ? "—"
      : Math.round(summary.firstContact) + "s") +
    " · Builds " +
    summary.buildAttempts;
}
function updateGuidance() {
  if (S.aimDebug)
    $("debug-overlay").textContent = JSON.stringify(
      {
        seed: S.seed,
        frame: perfMonitor.report(),
        bots:
          S.mode === "offline"
            ? [...S.match.players.values()]
                .filter((p) => p.isBot)
                .map((p) => ({
                  state: p.bot.state,
                  style: p.bot.style,
                  expanded: p.bot.expanded,
                  trace: p.bot.trace?.slice(-2),
                }))
            : [],
      },
      null,
      1,
    );
  const storm = currentStorm(),
    me = S.me;
  let poi = null,
    d = Infinity;
  for (const p of S.world.pois) {
    const n = dist2d(me.x, me.z, p.x, p.z);
    if (n < d) {
      poi = p;
      d = n;
    }
  }
  $("guidance").textContent = S.practice
    ? "Practice · no storm"
    : (poi ? poi.name + " " + Math.round(d) + "m · " : "") +
      "Safe circle " +
      Math.round(dist2d(me.x, me.z, storm.toCx, storm.toCz)) +
      "m";
  if (!S.metrics.events.opponent)
    for (const p of playersArray())
      if (p.id !== S.myId && p.alive && dist2d(me.x, me.z, p.x, p.z) < 35) {
        const o = point(me.x, me.y + 1.4, me.z),
          aim = point(p.x, p.y + 1.1, p.z),
          dx = aim.x - o.x,
          dy = aim.y - o.y,
          dz = aim.z - o.z,
          n = Math.hypot(dx, dy, dz);
        const hit = traceShot(
          S.world,
          [p],
          o,
          point(dx / n, dy / n, dz / n),
          n + 1,
          S.myId,
        );
        if (hit?.id === p.id) {
          recordMetric(S.metrics, "opponent", sessionTime());
          break;
        }
      }
  if (S.practice) {
    const p = S.practice,
      next = PRACTICE_STEPS.find((s) => !p.completed.includes(s));
    $("practice-status").textContent =
      (p.hideHints ? "Free practice" : next || "All exercises complete!") +
      " · Accuracy " +
      (p.shots ? Math.round((p.hits / p.shots) * 100) : 0) +
      "% · " +
      p.completed.length +
      "/" +
      PRACTICE_STEPS.length;
  }
}
function setupPractice() {
  S.practice = createPractice();
  S.match.storm.dps = 0;
  S.match.storm.r = 10000;
  S.match.storm.timer = Infinity;
  // Reuse a small clear part of the island; no extra models or networking.
  const station = [...S.world.props.values()]
    .filter((p) => p.type === "tree")
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  const cx = station ? station.x - 3 : 0,
    cz = station ? station.z : 0;
  for (const [id, b] of S.world.builds)
    if (Math.hypot(b.x - cx, b.z - cz) < 60) {
      S.world.builds.delete(id);
      S.view.removeBuildMesh(id);
    }
  for (const [id, p] of S.world.props)
    if (p !== station && Math.hypot(p.x - cx, p.z - cz) < 60) {
      S.world.props.delete(id);
      S.view.removePropMesh(id);
    }
  if (station) station.hp = 1000;
  const me = S.me;
  Object.assign(me, {
    x: cx,
    z: cz,
    y: S.world.heightAt(cx, cz),
    hp: 60,
    shield: 0,
  });
  S.phys = { vy: 0, grounded: true, gliding: false };
  S.practiceStart = { x: cx, z: cz };
  S.me.slots = practiceLoadout();
  S.me.mats = { wood: 100, brick: 100, metal: 100 };
  S.active = 1;
  syncInventoryUI();
  for (const [i, offset] of [-8, -20, -40].entries()) {
    const z = cz + offset,
      p = addPlayer(S.match, {
        id: "target" + i,
        name: i === 1 ? "Moving target" : "Target",
      });
    Object.assign(p, {
      x: cx,
      y: S.world.heightAt(cx, z),
      z,
      weapon: "pickaxe",
    });
  }
  S.practiceOrigin = { x: cx, z: cz };
  $("practice-bar").classList.remove("hidden");
  $("match-summary").textContent = "";
}
function tickPractice(dt) {
  S.match.time += dt;
  S.practice.elapsed += dt;
  const p = S.match.players.get("target1");
  p.x = S.practiceOrigin.x + Math.sin(S.match.time) * 3;
  p.y = S.world.heightAt(p.x, p.z);
  if (Math.hypot(S.me.x - S.practiceStart.x, S.me.z - S.practiceStart.z) >= 3)
    completePractice(S.practice, "Move three metres");
  if (!S.me.alive) {
    S.me.alive = true;
    S.me.hp = 100;
  }
  S.match.state = "play";
}
function disposeSession() {
  if (!S) return;
  const old = S;
  old.assetAbort.abort();
  ctl.resetInputs("session-teardown");
  $("practice-bar").classList.add("hidden");
  const geometries = new Set(),
    materials = new Set();
  old.scene.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton.dispose();
    if (o.isInstancedMesh) o.dispose();
    if (o.isLight && o.shadow) o.shadow.dispose();
    if (o.geometry) geometries.add(o.geometry);
    for (const m of Array.isArray(o.material)
      ? o.material
      : o.material
        ? [o.material]
        : [])
      materials.add(m);
    if (o.userData?.mixer) o.userData.mixer.stopAllAction();
  });
  for (const g of old.view.resources?.geometries || []) geometries.add(g);
  for (const m of old.view.resources?.materials || []) materials.add(m);
  for (const g of geometries) if (!g.userData?.sharedModel) g.dispose();
  for (const m of materials) disposeMaterial(m);
  old.composer?.dispose();
  old.scene.clear();
  renderer.renderLists.dispose();
}

// ---------------------------------------------------------------------------
// Other players' rendering
// ---------------------------------------------------------------------------
function botCustom(id) {
  // deterministic per-id look so a bot keeps its style all match;
  // humanoids are common, mascots (banana/bear/frog/robot) are the treat
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  h = Math.abs(h);
  // adventurers/skeletons/monsters are common; mascots are the treat
  const bodyPool = [
    7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 6, 2, 3, 4, 5, 7, 9, 16,
  ];
  return {
    body: bodyPool[(h >> 13) % bodyPool.length],
    skin: h % SKINS.length,
    outfit: (h >> 2) % OUTFITS.length,
    hat: (h >> 5) % 7 < HATS.length ? (h >> 5) % HATS.length : 0,
    hair: (h >> 8) % HAIRS.length,
    hairColor: (h >> 11) % HAIR_COLORS.length,
  };
}

function syncEntities(players) {
  for (const p of players) {
    if (p.id === S.myId) continue;
    if (dist2d(p.x, p.z, S.me.x, S.me.z) > 85) continue;
    if (!S.entities.has(p.id) && p.alive) {
      const char = makeCharacter(p.custom || botCustom(p.id));
      char.add(makeNameTag(p.name, p.isBot));
      S.scene.add(char);
      S.entities.set(p.id, {
        char,
        tx: p.x,
        ty: p.y,
        tz: p.z,
        tyaw: p.yaw,
        shootT: 0,
      });
    }
  }
}

function updateEntities(dt) {
  const players = playersArray();
  syncEntities(players);
  const lerp = S.mode === "online" ? Math.min(1, dt * 12) : 1;
  for (const p of players) {
    if (p.id === S.myId) continue;
    const e = S.entities.get(p.id);
    if (!e) continue;
    if (!p.alive) {
      animateCharacter(e.char, dt, false, false);
      continue;
    } // finish death anim
    e.char.position.x += (p.x - e.char.position.x) * lerp;
    e.char.position.y += (p.y - e.char.position.y) * lerp;
    e.char.position.z += (p.z - e.char.position.z) * lerp;
    // shortest-arc yaw lerp; humans and bots use opposite yaw conventions,
    // and the mesh's face points +z
    const meshYaw = p.isBot ? p.yaw : p.yaw + Math.PI;
    let dy = meshYaw - e.char.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    e.char.rotation.y += dy * (S.mode === "online" ? Math.min(1, dt * 10) : 1);
    e.shootT = Math.max(0, e.shootT - dt);
    setHeldItem(e.char, p.weapon);
    animateCharacter(
      e.char,
      dt,
      (p.anim & 1) !== 0,
      (p.anim & 2) !== 0 || e.shootT > 0,
    );
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
function updateCamera() {
  const me = S.me;
  const eyeY = me.y + 1.62;
  const cp = Math.cos(S.pitch),
    sp = Math.sin(S.pitch);
  const fwd = new THREE.Vector3(
    -Math.sin(S.yaw) * cp,
    -sp,
    -Math.cos(S.yaw) * cp,
  );
  const right = new THREE.Vector3(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
  const target = new THREE.Vector3(me.x, eyeY, me.z);
  const camPos = target
    .clone()
    .addScaledVector(fwd, -4.4)
    .addScaledVector(right, 0.85);
  camPos.y += 0.4;
  const terrainY = S.world.heightAt(camPos.x, camPos.z);
  if (camPos.y < terrainY + 0.4) camPos.y = terrainY + 0.4;
  camera.position.copy(camPos);
  camera.lookAt(target.clone().addScaledVector(fwd, 6));
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let myChar = null,
  lastT = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const frameMs = now - lastT;
  const dt = Math.min(0.05, frameMs / 1000);
  const recommendation = perfMonitor.sample(frameMs);
  if (recommendation && preferences.get().quality === "Auto")
    applyQuality(recommendation);
  lastT = now;
  if (!S || S.state !== "playing") return;
  if (import.meta.env.DEV) {
    window.__myChar = myChar;
    window.__performanceReport = () => ({
      frame: perfMonitor.report(),
      renderer: renderer.info.memory,
    });
  }

  ctl.update();
  updateLocalPlayer(dt);

  if (S.mode === "offline") {
    if (S.practice) tickPractice(dt);
    else tickMatch(S.match, dt, api);
  } else {
    // interpolate storm view toward snapshot
    const sv = S.stormView,
      ss = S.snapshotStorm;
    if (ss) {
      const k = Math.min(1, dt * 4);
      sv.cx += (ss.cx - sv.cx) * k;
      sv.cz += (ss.cz - sv.cz) * k;
      sv.r += (ss.r - sv.r) * k;
      Object.assign(sv, {
        toCx: ss.toCx,
        toCz: ss.toCz,
        toR: ss.toR,
        timer: ss.timer,
        shrinking: ss.shrinking,
        phase: ss.phase,
        dps: ss.dps,
      });
    }
    S.sendT -= dt;
    if (S.sendT <= 0 && S.me.alive) {
      S.sendT = 0.1;
      const m = S.me;
      S.net.send({
        t: "state",
        x: m.x,
        y: m.y,
        z: m.z,
        yaw: m.yaw,
        pitch: m.pitch,
        anim: m.anim,
        slot: S.active,
      });
    }
  }

  // my own character mesh
  if (!myChar) {
    myChar = makeCharacter(custom);
    S.scene.add(myChar);
  }
  myChar.position.set(S.me.x, S.me.y, S.me.z);
  myChar.rotation.y = S.yaw + Math.PI; // mesh face is +z; player forward is -z

  myChar.visible = S.me.alive;
  setHeldItem(myChar, S.me.weapon);
  animateCharacter(
    myChar,
    dt,
    (S.me.anim & 1) !== 0,
    (S.me.anim & 2) !== 0,
    S.phys.gliding || !S.phys.grounded,
  );

  upgradeLoadedCharacters();
  updateEntities(dt);
  updateTracers(dt);
  updateCamera();
  S.fx.update(dt);
  S.sky.update(dt, camera);

  // shadow camera follows the player so shadows stay crisp anywhere on the map
  const sun = S.scene.userData.sun;
  sun.position.set(
    S.me.x + SUN_DIR.x * 160,
    SUN_DIR.y * 160,
    S.me.z + SUN_DIR.z * 160,
  );
  sun.target.position.set(S.me.x, 0, S.me.z);

  const storm = S.mode === "offline" ? S.match.storm : S.stormView;
  S.view.updateStorm(storm);
  S.view.tick(now / 1000);

  // HUD updates at 10 Hz; input and rendering stay at frame rate.
  if (now - S.lastHud >= 100) {
    S.lastHud = now;
    ui.setHealth(S.me.hp, S.me.shield);
    const stormForUi =
      S.mode === "offline" ? S.match.storm : S.snapshotStorm || S.stormView;
    if (S.practice) {
      $("storm-status").textContent = "Practice — no storm";
      $("storm-status").className = "";
      $("hud").classList.remove("in-storm");
    } else
      ui.setStormStatus(
        stormForUi,
        dist2d(S.me.x, S.me.z, stormForUi.cx, stormForUi.cz),
      );
    ui.setAlive(S.mode === "offline" ? aliveCount(S.match) : (S.aliveN ?? "–"));
    ui.setKills(S.me.kills);
    ui.drawMinimap(stormForUi, S.me.x, S.me.z, S.yaw);
    updateGuidance();
  }

  if (S.composer) S.composer.render();
  else renderer.render(S.scene, camera);
  ctl.consumeFrame();
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------------------
// Menus & customization
// ---------------------------------------------------------------------------
function endSession() {
  exitPlayControls();
  if (S) disposeSession();
  const net = S?.net;
  S = null;
  if (net) {
    net.closedByMenu = true;
    net.close();
  }
  myChar = null;
  ui.showScreen("menu-screen");
}

$("practice-btn").addEventListener("click", () => startOffline(true));
$("practice-exit").onclick = endSession;
$("practice-reset").onclick = () => startOffline(true);
$("practice-loadout").onchange = () => {
  if (S?.practice) {
    S.me.slots = practiceLoadout($("practice-loadout").value);
    S.active = 1;
    syncInventoryUI();
  }
};
$("metrics-export").onclick = () => {
  const data = localStorage.getItem("notfortnite-matches") || "[]",
    url = URL.createObjectURL(new Blob([data], { type: "application/json" })),
    a = document.createElement("a");
  a.href = url;
  a.download = "notfortnite-local-matches.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$("play-solo-btn").addEventListener("click", () => {
  unlockAudio();
  startOffline();
});
$("play-online-btn").addEventListener("click", () => {
  unlockAudio();
  $("server-url").value = getServerUrl();
  ui.showScreen("server-screen");
});
$("server-connect-btn").addEventListener("click", () => {
  let url = $("server-url").value.trim();
  if (!url) return;
  if (!/^wss?:\/\//.test(url)) url = "ws://" + url;
  saveServerUrl(url);
  startOnline(url);
});
$("server-back-btn").addEventListener("click", () =>
  ui.showScreen("menu-screen"),
);
$("customize-btn").addEventListener("click", () => {
  openCustomize();
});
$("end-again-btn").addEventListener("click", () => {
  const mode = S ? S.mode : "offline";
  const net = S && S.net;
  if (mode === "online" && net && net.connected) {
    S.deathShown = false;
    ui.showScreen("lobby-screen");
    ui.setLobbyStatus("Waiting for the next match…");
    net.send({ t: "requeue" });
  } else {
    endSession();
    startOffline();
  }
});
$("end-menu-btn").addEventListener("click", endSession);
$("lobby-cancel-btn").addEventListener("click", () => {
  if (pendingNet) {
    pendingNet.closedByMenu = true;
    pendingNet.close();
  }
  endSession();
});

// ---------------------------------------------------------------------------
// Customization screen with live 3D preview
// ---------------------------------------------------------------------------
let preview = null;

function initPreview() {
  if (preview) return preview;
  const pCanvas = $("custom-preview");
  const pRenderer = new THREE.WebGLRenderer({
    canvas: pCanvas,
    antialias: true,
    alpha: true,
  });
  pRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  pRenderer.setSize(pCanvas.clientWidth, pCanvas.clientHeight, false);
  pRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  const pScene = new THREE.Scene();
  const pCam = new THREE.PerspectiveCamera(
    38,
    pCanvas.clientWidth / pCanvas.clientHeight,
    0.1,
    20,
  );
  pCam.position.set(0, 1.35, 3.2);
  pCam.lookAt(0, 1.0, 0);
  const key = new THREE.DirectionalLight("#fff2d8", 2.2);
  key.position.set(2, 3, 3);
  pScene.add(key);
  pScene.add(new THREE.AmbientLight("#cfe0ff", 0.7));
  pScene.add(new THREE.HemisphereLight("#b8dcff", "#5f8f4e", 0.7));
  preview = {
    renderer: pRenderer,
    scene: pScene,
    cam: pCam,
    char: null,
    spin: 0,
  };
  return preview;
}

function refreshPreview() {
  const p = initPreview();
  if (p.char) {
    p.scene.remove(p.char);
    disposeCharacter(p.char);
  }
  p.char = makeCharacter(custom);
  p.scene.add(p.char);
}

function previewLoop() {
  if ($("custom-screen").classList.contains("hidden")) return;
  requestAnimationFrame(previewLoop);
  const p = preview;
  if (!p || !p.char) return;
  p.spin += 0.012;
  p.char.rotation.y = Math.sin(p.spin) * 0.9 + Math.PI * 0.05;
  animateCharacter(p.char, 1 / 60, false, false);
  p.renderer.render(p.scene, p.cam);
}

function openCustomize() {
  ui.showScreen("custom-screen");
  $("custom-name").value = custom.name || "";
  buildOptionRow("body-options", BODIES, custom.body, "Default", (i) => {
    custom.body = i;
    refreshPreview();
  });
  buildSwatches("skin-swatches", SKINS, custom.skin, (i) => {
    custom.skin = i;
    refreshPreview();
  });
  buildSwatches("outfit-swatches", OUTFITS, custom.outfit, (i) => {
    custom.outfit = i;
    refreshPreview();
  });
  buildSwatches("hair-color-swatches", HAIR_COLORS, custom.hairColor, (i) => {
    custom.hairColor = i;
    refreshPreview();
  });
  buildOptionRow("hair-options", HAIRS, custom.hair, "No Hair", (i) => {
    custom.hair = i;
    refreshPreview();
  });
  buildOptionRow("hat-options", HATS, custom.hat, "No Hat", (i) => {
    custom.hat = i;
    refreshPreview();
  });
  refreshPreview();
  requestAnimationFrame(previewLoop);
}

function buildOptionRow(id, options, selected, noneLabel, onPick) {
  const wrap = $(id);
  wrap.innerHTML = "";
  options.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "hat-btn" + (i === selected ? " selected" : "");
    b.textContent =
      o === "none"
        ? noneLabel
        : o
            .split("_")
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(" ");
    b.addEventListener("click", () => {
      onPick(i);
      wrap
        .querySelectorAll(".hat-btn")
        .forEach((el, j) => el.classList.toggle("selected", j === i));
    });
    wrap.appendChild(b);
  });
}

function buildSwatches(id, colors, selected, onPick) {
  const wrap = $(id);
  wrap.innerHTML = "";
  colors.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "swatch" + (i === selected ? " selected" : "");
    b.style.background = c;
    b.addEventListener("click", () => {
      onPick(i);
      wrap
        .querySelectorAll(".swatch")
        .forEach((el, j) => el.classList.toggle("selected", j === i));
    });
    wrap.appendChild(b);
  });
}

$("custom-save-btn").addEventListener("click", () => {
  custom.name = ($("custom-name").value.trim() || "Player").slice(0, 16);
  saveCustom(custom);
  ui.showScreen("menu-screen");
});

// try to lock landscape on mobile when starting play
document.addEventListener(
  "click",
  () => {
    if (IS_TOUCH && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  },
  { once: true },
);

ui.showScreen("menu-screen");

if (import.meta.env.DEV)
  window.__gameTest = {
    getSession: () => S,
    controls: ctl,
    dispatchAction,
    fireActiveItem,
    tryPlace,
    tryInteract,
    endSession,
    startOffline,
    updateCamera,
  };

$("practice-skip").onclick = () => {
  if (S?.practice) S.practice.hideHints = true;
};
$("practice-respawn").onclick = () => {
  if (S?.practice) {
    S.me.x = S.practiceStart.x;
    S.me.z = S.practiceStart.z;
    S.me.y = S.world.heightAt(S.me.x, S.me.z);
    S.me.hp = 60;
    S.me.alive = true;
    S.phys = { vy: 0, grounded: true, gliding: false };
    ctl.resetInputs("practice-reposition");
  }
};
