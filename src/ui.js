// HUD: health/shield/mats/slots/killfeed/minimap/storm status + screens.
import { WEAPONS, RARITIES, HEALS, MAP_SIZE, STORM_PHASES } from '../shared/constants.js';

const $ = (id) => document.getElementById(id);

export function createUI() {
  const killfeedEl = $('killfeed');
  const minimap = $('minimap');
  const mctx = minimap.getContext('2d');

  const ui = {};

  ui.showScreen = (name) => {
    for (const s of ['menu-screen', 'custom-screen', 'lobby-screen', 'hud', 'end-screen', 'server-screen']) {
      $(s).classList.toggle('hidden', s !== name);
    }
  };

  ui.setHealth = (hp, shield) => {
    $('hp-fill').style.width = Math.max(0, hp) + '%';
    $('shield-fill').style.width = Math.max(0, shield) + '%';
    $('hp-num').textContent = Math.ceil(Math.max(0, hp));
  };

  ui.setMats = (mats) => {
    $('mat-wood').textContent = mats.wood;
    $('mat-brick').textContent = mats.brick;
    $('mat-metal').textContent = mats.metal;
  };

  ui.setAlive = (n) => { $('alive-count').textContent = n; };
  ui.setKills = (n) => { $('kill-count').textContent = n; };

  ui.setStormStatus = (storm, playerDist) => {
    const el = $('storm-status');
    if (storm.shrinking) {
      el.textContent = 'STORM CLOSING';
      el.className = 'storm-closing';
    } else if (storm.phase + 1 < STORM_PHASES.length) {
      el.textContent = 'Storm: ' + Math.max(0, Math.ceil(storm.timer)) + 's';
      el.className = '';
    } else {
      el.textContent = 'FINAL CIRCLE';
      el.className = 'storm-closing';
    }
    $('hud').classList.toggle('in-storm', playerDist > storm.r);
  };

  ui.setSlots = (slots, active) => {
    for (let i = 0; i < 6; i++) {
      const el = $('hud-slot-' + i);
      const item = slots[i];
      el.classList.toggle('active', i === active);
      el.classList.toggle('empty', !item);
      const label = el.querySelector('.slot-name');
      el.style.borderColor = '';
      if (!item) { label.textContent = ''; continue; }
      if (item.kind === 'weapon') {
        label.textContent = WEAPONS[item.w].name;
        if (i !== active) el.style.borderColor = RARITIES[item.rarity].color;
        el.style.background = i === active ? '' : hexA(RARITIES[item.rarity].color, 0.25);
      } else if (item.kind === 'heal') {
        label.textContent = HEALS[item.h].name + ' x' + item.uses;
        el.style.background = '';
      }
    }
  };

  ui.killfeed = (text, highlight) => {
    const div = document.createElement('div');
    div.className = 'feed-line' + (highlight ? ' feed-me' : '');
    div.textContent = text;
    killfeedEl.prepend(div);
    while (killfeedEl.children.length > 5) killfeedEl.lastChild.remove();
    setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 900); }, 5200);
  };

  ui.setInteract = (text) => {
    const el = $('btn-interact');
    el.classList.toggle('hidden', !text);
    if (text) el.textContent = text;
  };

  ui.setBuildMode = (on, piece, mat, mats) => {
    $('build-bar').classList.toggle('hidden', !on);
    $('btn-build').classList.toggle('active', on);
    if (on) {
      for (const p of ['wall', 'floor', 'ramp']) {
        $('btn-piece-' + p).classList.toggle('active', p === piece);
      }
      $('btn-mat').textContent = mat.toUpperCase() + ' ' + mats[mat];
    }
  };

  ui.hitmarker = () => {
    const el = $('hitmarker');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };

  ui.damageFlash = () => {
    const el = $('damage-flash');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };

  ui.drawMinimap = (storm, px, pz, yaw) => {
    const S = minimap.width;
    const scale = S / MAP_SIZE;
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = 'rgba(20,40,70,0.75)';
    mctx.fillRect(0, 0, S, S);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];

    // island blob
    mctx.fillStyle = 'rgba(90,140,80,0.8)';
    mctx.beginPath();
    mctx.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
    mctx.fill();

    // storm circle
    const [sx, sz] = toMap(storm.cx, storm.cz);
    mctx.strokeStyle = '#c05df0';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.arc(sx, sz, Math.max(1, storm.r * scale), 0, Math.PI * 2);
    mctx.stroke();
    // next circle
    if (storm.shrinking || storm.dps > 0) {
      const [tx, tz] = toMap(storm.toCx, storm.toCz);
      mctx.strokeStyle = 'rgba(255,255,255,0.85)';
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.arc(tx, tz, Math.max(1, storm.toR * scale), 0, Math.PI * 2);
      mctx.stroke();
    }

    // player arrow
    const [mx, mz] = toMap(px, pz);
    mctx.save();
    mctx.translate(mx, mz);
    mctx.rotate(-yaw + Math.PI);
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  };

  ui.showEnd = (won, placement, kills, byName) => {
    ui.showScreen('end-screen');
    $('end-title').textContent = won ? '🏆 #1 VICTORY!' : '#' + placement;
    $('end-title').className = won ? 'end-win' : 'end-lose';
    $('end-sub').textContent = won
      ? kills + ' elimination' + (kills === 1 ? '' : 's') + ' — Battle Bus Champion!'
      : 'Eliminated by ' + byName + ' · ' + kills + ' elimination' + (kills === 1 ? '' : 's');
  };

  ui.setLobbyStatus = (text) => { $('lobby-status').textContent = text; };

  return ui;
}

function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
