// Deterministic world generation — same seed produces the same island on every
// client and on the server. Pure data, no rendering.
import { createNoise2D } from 'simplex-noise';
import { MAP_SIZE, BUILD, HARVEST, mulberry32 } from './constants.js';

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const noise = createNoise2D(mulberry32(seed ^ 0x9e3779b9));
  const noise2 = createNoise2D(mulberry32(seed ^ 0x51ab3c4d));

  const half = MAP_SIZE / 2;

  function heightAt(x, z) {
    // Island: tall-ish center, falls to 0 at the edges
    const d = Math.sqrt(x * x + z * z) / half;      // 0 center, ~1.4 corner
    const edge = Math.max(0, 1 - d * d * 1.1);
    let h = noise(x * 0.006, z * 0.006) * 10 + noise2(x * 0.02, z * 0.02) * 2.5;
    h = (h + 6) * edge;
    return Math.max(0.2, h);
  }

  // --- POIs: small named settlements with houses ---
  const poiNames = ['Salty Suburbs', 'Loot Lagoon', 'Crate Canyon', 'Bush Borough'];
  const pois = [];
  const minPoiDist = 130;
  let guard = 0;
  while (pois.length < poiNames.length && guard++ < 200) {
    const x = (rng() - 0.5) * (MAP_SIZE - 160);
    const z = (rng() - 0.5) * (MAP_SIZE - 160);
    if (pois.every(p => Math.hypot(p.x - x, p.z - z) > minPoiDist)) {
      pois.push({ name: poiNames[pois.length], x, z });
    }
  }

  // --- Buildings: made of standard build pieces so they render/collide/harvest
  // exactly like player builds. builds is a Map<id, piece>.
  const builds = new Map();
  let buildId = 0;
  const G = BUILD.GRID;

  function addPiece(type, mat, x, y, z, rot) {
    const id = 'h' + (buildId++);
    builds.set(id, { id, type, mat, x, y, z, rot, hp: BUILD.MAT_HP[mat] });
  }

  const chests = [];
  let chestId = 0;

  function house(cx, cz) {
    // 2x2-cell one-story house on flattened ground
    const bx = Math.round(cx / G) * G;
    const bz = Math.round(cz / G) * G;
    // sit on the terrain (not the vertical build grid) so doors stay walkable
    const y = heightAt(bx + G, bz + G);
    const doorSide = Math.floor(rng() * 4);
    // walls around a 2x2-cell footprint; rot 0 = wall running along x, 1 = along z
    const spots = [];
    for (let i = 0; i < 2; i++) {
      spots.push([bx + i * G + G / 2, bz, 0, 0]);            // north edge
      spots.push([bx + i * G + G / 2, bz + 2 * G, 0, 2]);    // south edge
      spots.push([bx, bz + i * G + G / 2, 1, 3]);            // west edge
      spots.push([bx + 2 * G, bz + i * G + G / 2, 1, 1]);    // east edge
    }
    let skipped = false;
    for (const [wx, wz, rot, side] of spots) {
      if (!skipped && side === doorSide) { skipped = true; continue; } // doorway
      addPiece('wall', 'brick', wx, y, wz, rot);
    }
    // floor + roof
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      addPiece('floor', 'wood', bx + i * G + G / 2, y, bz + j * G + G / 2, 0);
      addPiece('floor', 'wood', bx + i * G + G / 2, y + G, bz + j * G + G / 2, 0);
    }
    if (rng() < 0.65) {
      chests.push({ id: 'c' + (chestId++), x: bx + G, y: y + 0.5, z: bz + G, opened: false });
    }
    return { x: bx + G, z: bz + G, y };
  }

  for (const poi of pois) {
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      house(poi.x + (rng() - 0.5) * 50, poi.z + (rng() - 0.5) * 50);
    }
  }
  // a few lone huts
  for (let i = 0; i < 4; i++) {
    house((rng() - 0.5) * (MAP_SIZE - 120), (rng() - 0.5) * (MAP_SIZE - 120));
  }

  // --- Props: trees, rocks, metal crates ---
  const props = new Map();
  let propId = 0;
  function scatter(type, count, minH) {
    for (let i = 0; i < count; i++) {
      const x = (rng() - 0.5) * (MAP_SIZE - 40);
      const z = (rng() - 0.5) * (MAP_SIZE - 40);
      const y = heightAt(x, z);
      if (y < minH) continue;
      const id = 'p' + (propId++);
      props.set(id, { id, type, x, y, z, hp: HARVEST[type].hp, scale: 0.8 + rng() * 0.5 });
    }
  }
  scatter('tree', 200, 1.0);
  scatter('rock', 70, 0.8);
  scatter('crate', 35, 0.8);

  // --- standalone chests + floor loot spawn points ---
  for (let i = 0; i < 14; i++) {
    const x = (rng() - 0.5) * (MAP_SIZE - 60);
    const z = (rng() - 0.5) * (MAP_SIZE - 60);
    chests.push({ id: 'c' + (chestId++), x, y: heightAt(x, z) + 0.5, z, opened: false });
  }
  const floorLootSpots = [];
  for (let i = 0; i < 55; i++) {
    const x = (rng() - 0.5) * (MAP_SIZE - 60);
    const z = (rng() - 0.5) * (MAP_SIZE - 60);
    floorLootSpots.push({ x, y: heightAt(x, z), z });
  }

  return { seed, heightAt, pois, builds, props, chests, floorLootSpots };
}
