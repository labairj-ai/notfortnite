// Client-side rendering of the shared world data: terrain, props, builds,
// chests, ground loot, storm wall. Also collision queries for local physics.
import * as THREE from 'three';
import { MAP_SIZE, BUILD, RARITIES } from '../shared/constants.js';

const G = BUILD.GRID;

const MAT_COLORS = { wood: '#9a7648', brick: '#a8695a', metal: '#8b96a5' };

export function createWorldView(scene, world) {
  const view = {
    buildMeshes: new Map(),
    propMeshes: new Map(),
    chestMeshes: new Map(),
    lootMeshes: new Map(),
  };

  // ---- Terrain ----
  const SEGS = 96;
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#5d9e4f');
  const grassDark = new THREE.Color('#4a8340');
  const sand = new THREE.Color('#d9c58a');
  const rock = new THREE.Color('#8d8d84');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = world.heightAt(x, z);
    pos.setY(i, h);
    if (h < 1.2) tmp.copy(sand);
    else if (h > 11) tmp.copy(rock);
    else tmp.copy(((x * 7919 + z * 104729) % 2 + 2) % 2 < 1 ? grass : grassDark);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(terrain);

  // ocean ring
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE * 4, MAP_SIZE * 4),
    new THREE.MeshLambertMaterial({ color: '#3a7ec2' })
  );
  ocean.rotateX(-Math.PI / 2);
  ocean.position.y = 0.35;
  scene.add(ocean);

  // ---- Props (instanced) ----
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4.5, 6);
  const leavesGeo = new THREE.ConeGeometry(2.2, 4.5, 7);
  const rockGeo = new THREE.DodecahedronGeometry(1.3, 0);
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6e4f2e' });
  const leavesMat = new THREE.MeshLambertMaterial({ color: '#3e7d3a' });
  const rockMat = new THREE.MeshLambertMaterial({ color: '#7d7d76' });
  const crateMat = new THREE.MeshLambertMaterial({ color: '#a5adb8' });

  const propGroup = new THREE.Group();
  scene.add(propGroup);
  for (const p of world.props.values()) {
    let mesh;
    if (p.type === 'tree') {
      mesh = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2.25;
      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.y = 5.8;
      mesh.add(trunk, leaves);
    } else if (p.type === 'rock') {
      mesh = new THREE.Mesh(rockGeo, rockMat);
      mesh.rotation.y = p.x;
    } else {
      mesh = new THREE.Mesh(crateGeo, crateMat);
      mesh.position.y = 0.8;
      const wrap = new THREE.Group();
      wrap.add(mesh);
      mesh = wrap;
    }
    mesh.position.set(p.x, p.y, p.z);
    mesh.scale.setScalar(p.scale);
    propGroup.add(mesh);
    view.propMeshes.set(p.id, mesh);
  }

  // ---- Builds ----
  const buildGroup = new THREE.Group();
  scene.add(buildGroup);
  const wallGeo = new THREE.BoxGeometry(G, G, 0.3);
  const floorGeo = new THREE.BoxGeometry(G, 0.3, G);
  const rampGeo = makeRampGeo();
  const buildMats = {};
  for (const [k, c] of Object.entries(MAT_COLORS)) buildMats[k] = new THREE.MeshLambertMaterial({ color: c });

  view.addBuildMesh = (piece) => {
    let mesh;
    const mat = buildMats[piece.mat];
    if (piece.type === 'wall') {
      mesh = new THREE.Mesh(wallGeo, mat);
      mesh.position.set(piece.x, piece.y + G / 2, piece.z);
      mesh.rotation.y = piece.rot * Math.PI / 2;
    } else if (piece.type === 'floor') {
      mesh = new THREE.Mesh(floorGeo, mat);
      mesh.position.set(piece.x, piece.y + 0.15, piece.z);
    } else { // ramp
      mesh = new THREE.Mesh(rampGeo, mat);
      mesh.position.set(piece.x, piece.y, piece.z);
      mesh.rotation.y = piece.rot * Math.PI / 2;
    }
    buildGroup.add(mesh);
    view.buildMeshes.set(piece.id, mesh);
  };
  view.removeBuildMesh = (id) => {
    const mesh = view.buildMeshes.get(id);
    if (mesh) { buildGroup.remove(mesh); view.buildMeshes.delete(id); }
  };
  for (const piece of world.builds.values()) view.addBuildMesh(piece);

  view.removePropMesh = (id) => {
    const mesh = view.propMeshes.get(id);
    if (mesh) { propGroup.remove(mesh); view.propMeshes.delete(id); }
  };

  // ---- Chests ----
  const chestGeo = new THREE.BoxGeometry(1.1, 0.8, 0.8);
  const chestMat = new THREE.MeshLambertMaterial({ color: '#c9962e' });
  const chestOpenMat = new THREE.MeshLambertMaterial({ color: '#6e5a2e' });
  for (const c of world.chests) {
    const mesh = new THREE.Mesh(chestGeo, chestMat);
    mesh.position.set(c.x, c.y + 0.4, c.z);
    mesh.rotation.y = c.x + c.z;
    scene.add(mesh);
    view.chestMeshes.set(c.id, mesh);
  }
  view.openChestMesh = (id) => {
    const mesh = view.chestMeshes.get(id);
    if (mesh) mesh.material = chestOpenMat;
  };

  // ---- Ground loot ----
  const lootGroup = new THREE.Group();
  scene.add(lootGroup);
  const lootGeo = new THREE.OctahedronGeometry(0.34, 0);
  view.addLootMesh = (drop) => {
    let color = '#cfd6dd';
    if (drop.item.kind === 'weapon') color = RARITIES[drop.item.rarity].color;
    else if (drop.item.kind === 'heal') color = drop.item.h.includes('shield') ? '#3ad6ff' : '#8ef07f';
    else if (drop.item.kind === 'mats') color = MAT_COLORS[drop.item.mat];
    const mesh = new THREE.Mesh(lootGeo, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
    mesh.position.set(drop.x, drop.y + 0.6, drop.z);
    lootGroup.add(mesh);
    view.lootMeshes.set(drop.id, mesh);
  };
  view.removeLootMesh = (id) => {
    const mesh = view.lootMeshes.get(id);
    if (mesh) { lootGroup.remove(mesh); view.lootMeshes.delete(id); }
  };
  view.animateLoot = (t) => {
    for (const mesh of view.lootMeshes.values()) {
      mesh.rotation.y = t * 1.8;
      mesh.position.y += Math.sin(t * 2.4 + mesh.position.x) * 0.0015;
    }
  };

  // ---- Storm wall ----
  const stormGeo = new THREE.CylinderGeometry(1, 1, 160, 64, 1, true);
  const stormMat = new THREE.MeshBasicMaterial({
    color: '#a13df0', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
  });
  const stormWall = new THREE.Mesh(stormGeo, stormMat);
  stormWall.position.y = 60;
  scene.add(stormWall);
  view.updateStorm = (storm) => {
    stormWall.position.x = storm.cx;
    stormWall.position.z = storm.cz;
    stormWall.scale.set(Math.max(0.01, storm.r), 1, Math.max(0.01, storm.r));
  };

  return view;
}

function makeRampGeo() {
  // solid wedge spanning one grid cell, sloping up along +z
  const g = G;
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    // bottom quad
    -g/2, 0, -g/2,   g/2, 0, -g/2,   g/2, 0, g/2,
    -g/2, 0, -g/2,   g/2, 0, g/2,   -g/2, 0, g/2,
    // sloped top: from y0 at -z to y=g at +z
    -g/2, 0, -g/2,  -g/2, g, g/2,    g/2, g, g/2,
    -g/2, 0, -g/2,   g/2, g, g/2,    g/2, 0, -g/2,
    // back face (+z, tall)
    -g/2, 0, g/2,    g/2, g, g/2,   -g/2, g, g/2,
    -g/2, 0, g/2,    g/2, 0, g/2,    g/2, g, g/2,
    // sides
    -g/2, 0, -g/2,  -g/2, 0, g/2,   -g/2, g, g/2,
     g/2, 0, -g/2,   g/2, g, g/2,    g/2, 0, g/2,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Collision / support queries against terrain + builds (used by local physics)
// ---------------------------------------------------------------------------

// Height of whatever the player can stand on at (x, z) when at height y.
export function supportHeight(world, x, y, z) {
  let best = world.heightAt(x, z);
  for (const b of world.builds.values()) {
    if (b.type === 'floor') {
      if (Math.abs(x - b.x) <= G / 2 && Math.abs(z - b.z) <= G / 2) {
        const top = b.y + 0.3;
        if (top <= y + 0.6 && top > best) best = top;
      }
    } else if (b.type === 'ramp') {
      // rotate point into ramp-local space
      const dx = x - b.x, dz = z - b.z;
      const ang = -b.rot * Math.PI / 2;
      const lx = dx * Math.cos(ang) - dz * Math.sin(ang);
      const lz = dx * Math.sin(ang) + dz * Math.cos(ang);
      if (Math.abs(lx) <= G / 2 && Math.abs(lz) <= G / 2) {
        const top = b.y + (lz + G / 2) / G * G;
        if (top <= y + 0.9 && top > best) best = top;
      }
    } else if (b.type === 'wall') {
      // stand on top of walls
      const alongX = b.rot % 2 === 0;
      const hw = alongX ? G / 2 : 0.4;
      const hd = alongX ? 0.4 : G / 2;
      if (Math.abs(x - b.x) <= hw && Math.abs(z - b.z) <= hd) {
        const top = b.y + G;
        if (top <= y + 0.4 && top > best) best = top;
      }
    }
  }
  return best;
}

// Push the player out of wall pieces. Returns corrected {x, z}.
export function resolveWalls(world, x, y, z, radius) {
  for (const b of world.builds.values()) {
    if (b.type !== 'wall') continue;
    if (y > b.y + G - 0.2 || y + 1.6 < b.y) continue; // above or below the wall
    const alongX = b.rot % 2 === 0;
    const hw = (alongX ? G / 2 : 0.15) + radius;
    const hd = (alongX ? 0.15 : G / 2) + radius;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx);
      const pz = hd - Math.abs(dz);
      if (px < pz) x = b.x + Math.sign(dx || 1) * hw;
      else z = b.z + Math.sign(dz || 1) * hd;
    }
  }
  return { x, z };
}

// Raycast against builds and props (coarse). Returns nearest hit or null.
export function raycastWorld(world, origin, dir, maxDist) {
  let best = null;
  // builds as spheres (coarse but cheap), then refined by slab distance
  for (const b of world.builds.values()) {
    const cy = b.type === 'wall' ? b.y + G / 2 : b.y + (b.type === 'ramp' ? G / 2 : 0.15);
    const hit = raySphere(origin, dir, b.x, cy, b.z, G * 0.72, maxDist);
    if (hit !== null && (!best || hit < best.dist)) best = { dist: hit, kind: 'build', id: b.id };
  }
  for (const p of world.props.values()) {
    const r = p.type === 'tree' ? 1.1 : 1.4;
    const cy = p.type === 'tree' ? p.y + 2.5 : p.y + 1.0;
    const hit = raySphere(origin, dir, p.x, cy, p.z, r * p.scale, maxDist);
    if (hit !== null && (!best || hit < best.dist)) best = { dist: hit, kind: 'prop', id: p.id };
  }
  return best;
}

export function raySphere(o, d, cx, cy, cz, r, maxDist) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return null;
  return t;
}
