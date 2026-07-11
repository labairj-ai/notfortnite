// Shared tuning constants — imported by both the browser client and the Node server.
// No THREE.js or DOM references allowed in this file.

export const MAP_SIZE = 512;          // world spans -256..+256 on x/z
export const MATCH_PLAYERS = 10;      // lobby fills to this with bots
export const LOBBY_COUNTDOWN = 10;    // seconds once a human is present (online)
export const TICK_RATE = 15;          // server sim ticks per second
export const SNAPSHOT_RATE = 10;      // server -> client state broadcasts per second

export const PLAYER = {
  HP: 100,
  SHIELD_MAX: 100,
  RADIUS: 0.5,
  HEIGHT: 1.8,
  SPEED: 5.6,
  JUMP: 8.0,
  GRAVITY: 22,
  GLIDE_FALL: 7,     // glider descent speed
  DIVE_FALL: 26,     // fast-fall descent speed
  DROP_ALT: 90,      // spawn altitude
};

// Storm phases: wait (circle holds), shrink (circle closes to r), dps outside.
export const STORM_PHASES = [
  { wait: 20, shrink: 25, r: 170, dps: 1 },
  { wait: 15, shrink: 20, r: 110, dps: 2 },
  { wait: 12, shrink: 18, r: 65,  dps: 4 },
  { wait: 10, shrink: 15, r: 32,  dps: 7 },
  { wait: 8,  shrink: 12, r: 10,  dps: 10 },
  { wait: 6,  shrink: 10, r: 0,   dps: 14 },
];
export const STORM_START_R = 300;

export const WEAPONS = {
  pickaxe: { name: 'Pickaxe',  dmg: 20,  rate: 0.5,  range: 3.4,  spread: 0,     melee: true },
  pistol:  { name: 'Pistol',   dmg: 24,  rate: 0.38, range: 70,   spread: 0.022 },
  smg:     { name: 'SMG',      dmg: 15,  rate: 0.09, range: 55,   spread: 0.05  },
  ar:      { name: 'Rifle',    dmg: 30,  rate: 0.18, range: 110,  spread: 0.02  },
  shotgun: { name: 'Shotgun',  dmg: 72,  rate: 0.95, range: 22,   spread: 0.06, falloff: true },
  sniper:  { name: 'Sniper',   dmg: 105, rate: 1.6,  range: 220,  spread: 0.002 },
};

export const RARITIES = [
  { key: 'common',    mult: 1.0,  color: '#b8b8b8', weight: 40 },
  { key: 'uncommon',  mult: 1.1,  color: '#57c94f', weight: 30 },
  { key: 'rare',      mult: 1.2,  color: '#3aa0ff', weight: 18 },
  { key: 'epic',      mult: 1.35, color: '#b04df0', weight: 9 },
  { key: 'legendary', mult: 1.5,  color: '#f0a13a', weight: 3 },
];

export const HEALS = {
  bandage:    { name: 'Bandage',      hp: 15, hpCap: 75,  uses: 3 },
  medkit:     { name: 'Medkit',       hp: 100, hpCap: 100, uses: 1 },
  minishield: { name: 'Mini Shield',  shield: 25, shieldCap: 50,  uses: 2 },
  shieldpot:  { name: 'Shield Potion', shield: 50, shieldCap: 100, uses: 1 },
};

export const BUILD = {
  GRID: 4,
  COST: 10,
  MAT_HP: { wood: 150, brick: 300, metal: 500 },
  MAT_CAP: 500,
};

// Resources granted per harvest hit, and hits to destroy the prop
export const HARVEST = {
  tree:  { mat: 'wood',  perHit: 15, hp: 4 },
  rock:  { mat: 'brick', perHit: 15, hp: 5 },
  crate: { mat: 'metal', perHit: 15, hp: 4 },
  build: { perHit: 8 },
};

export const BOT_NAMES = [
  'BustedBanana', 'LlamaDrama', 'SirLootsAlot', 'CrankedNinety', 'BushCamper',
  'NoSkinNed', 'TomatoTown', 'DustyDiv0t', 'PeelyFan99', 'StormChaser',
  'DefaultDan', 'SweatyPalms', 'OneShotWanda', 'RiftRider', 'TiltedTed',
  'GliderGuy', 'ChugJugChad', 'BoogieBomber', 'CrackShotCarl', 'SlurpySwamp',
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollRarity(rng) {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    roll -= RARITIES[i].weight;
    if (roll <= 0) return i;
  }
  return 0;
}

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
