// Client-side rendering of the shared world data — stylized Fortnite-inspired
// look — plus collision queries for local physics.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_SIZE, BUILD, RARITIES, mulberry32 } from '../shared/constants.js';
import { woodTexture, brickTexture, metalTexture, beamTexture } from './textures.js';

const G = BUILD.GRID;

export function createWorldView(scene, world, quality = 'high') {
  const HIGH = quality === 'high';
  const view = {
    buildMeshes: new Map(),
    chestMeshes: new Map(),
    lootMeshes: new Map(),
    propInstances: new Map(),   // propId -> { kind, indices }
  };
  const timed = [];             // shader materials needing uTime

  // ======================= TERRAIN =======================
  const SEGS = HIGH ? 128 : 96;
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, world.heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const cGrassA = new THREE.Color('#55b545');
  const cGrassB = new THREE.Color('#3f9636');
  const cMeadow = new THREE.Color('#7ccb4e');
  const cSand = new THREE.Color('#efd98f');
  const cDirt = new THREE.Color('#8a6b45');
  const cRock = new THREE.Color('#8d8d88');
  const tmp = new THREE.Color();
  const hash = (x, z) => {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = pos.getY(i);
    const ny = normals.getY(i);
    const n1 = hash(Math.floor(x / 9), Math.floor(z / 9));      // meadow patches
    const n2 = hash(x, z);                                       // fine speckle
    if (h < 1.15) tmp.copy(cSand);
    else if (ny < 0.82) tmp.copy(cDirt).lerp(cRock, (0.82 - ny) * 4);
    else if (h > 12) tmp.copy(cRock).lerp(cGrassB, 0.25);
    else {
      tmp.copy(n1 > 0.62 ? cMeadow : (n1 < 0.2 ? cGrassB : cGrassA));
      tmp.lerp(cGrassB, n2 * 0.25);
    }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ======================= OCEAN =======================
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vXZ;
      void main() {
        vXZ = vec2(position.x, position.y); // plane local xy -> world xz after rotation
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vXZ;
      uniform float uTime;
      void main() {
        float d = length(vXZ) / 380.0;
        vec3 shallow = vec3(0.22, 0.75, 0.78);
        vec3 deep    = vec3(0.05, 0.35, 0.68);
        vec3 col = mix(shallow, deep, clamp(d * 1.4 - 0.35, 0.0, 1.0));
        // sparkle bands
        float s1 = sin(vXZ.x * 0.22 + uTime * 0.9) * sin(vXZ.y * 0.19 - uTime * 0.7);
        float s2 = sin(vXZ.x * 0.07 - uTime * 0.4 + vXZ.y * 0.09);
        float sparkle = smoothstep(0.86, 0.99, s1 * s2 + 0.15);
        col += vec3(0.55, 0.65, 0.7) * sparkle * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  timed.push(waterMat);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE * 4, MAP_SIZE * 4), waterMat);
  ocean.rotateX(-Math.PI / 2);
  ocean.position.y = 0.42;
  scene.add(ocean);

  // ======================= GRASS =======================
  {
    const blade = new THREE.PlaneGeometry(0.45, 0.42, 1, 1);
    blade.translate(0, 0.21, 0);
    const blade2 = blade.clone().rotateY(Math.PI / 2);
    const tuftGeo = mergeGeometries([blade, blade2]);
    const gp = tuftGeo.attributes.position;
    const gc = new Float32Array(gp.count * 3);
    const cLo = new THREE.Color('#3c8a30'), cHi = new THREE.Color('#8fdc52');
    for (let i = 0; i < gp.count; i++) {
      tmp.copy(cLo).lerp(cHi, gp.getY(i) / 0.42);
      gc[i * 3] = tmp.r; gc[i * 3 + 1] = tmp.g; gc[i * 3 + 2] = tmp.b;
    }
    tuftGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
    const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    let grassShader = null;
    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float wPhase = instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.8;
          transformed.x += sin(uTime * 2.1 + wPhase) * position.y * 0.35;
          transformed.z += cos(uTime * 1.6 + wPhase) * position.y * 0.22;
        #endif`
      );
      grassShader = shader;
    };
    timed.push({ get uniforms() { return grassShader ? grassShader.uniforms : { uTime: { value: 0 } }; } });
    const COUNT = HIGH ? 4200 : 1700;
    const grass = new THREE.InstancedMesh(tuftGeo, grassMat, COUNT);
    const rng = mulberry32(world.seed ^ 0x77aa11);
    const d = new THREE.Object3D();
    let placed = 0, tries = 0;
    while (placed < COUNT && tries++ < COUNT * 4) {
      const x = (rng() - 0.5) * (MAP_SIZE - 30);
      const z = (rng() - 0.5) * (MAP_SIZE - 30);
      const h = world.heightAt(x, z);
      if (h < 1.3 || h > 11) continue;
      d.position.set(x, h - 0.02, z);
      d.rotation.y = rng() * Math.PI;
      d.scale.setScalar(0.7 + rng() * 0.6);
      d.updateMatrix();
      grass.setMatrixAt(placed++, d.matrix);
    }
    grass.count = placed;
    scene.add(grass);
  }

  // ======================= PROPS (instanced) =======================
  const props = [...world.props.values()];
  const trees = props.filter(p => p.type === 'tree');
  const rocks = props.filter(p => p.type === 'rock');
  const crates = props.filter(p => p.type === 'crate');
  const dummy = new THREE.Object3D();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // trunks
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.55, 4.2, 7);
  trunkGeo.translate(0, 2.1, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#7a5230' });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, trees.length));
  trunks.castShadow = HIGH;
  // canopies: 3 blobs per tree, per-instance color variation
  const blobGeo = new THREE.IcosahedronGeometry(1.55, 1);
  const leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const canopies = new THREE.InstancedMesh(blobGeo, leafMat, Math.max(1, trees.length * 3));
  canopies.castShadow = HIGH;
  const leafBase = new THREE.Color('#2f9e38');
  trees.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.setScalar(p.scale);
    dummy.rotation.set(0, p.x, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const rng = mulberry32((p.x * 73 + p.z * 179) | 0);
    for (let b = 0; b < 3; b++) {
      const idx = i * 3 + b;
      dummy.position.set(
        p.x + (rng() - 0.5) * 1.6 * p.scale,
        p.y + (4.2 + (b === 0 ? 1.1 : 0.2) + rng() * 0.8) * p.scale,
        p.z + (rng() - 0.5) * 1.6 * p.scale,
      );
      const s = (b === 0 ? 1.25 : 0.85 + rng() * 0.35) * p.scale;
      dummy.scale.set(s * 1.15, s, s * 1.15);
      dummy.updateMatrix();
      canopies.setMatrixAt(idx, dummy.matrix);
      tmp.copy(leafBase).offsetHSL((rng() - 0.5) * 0.06, rng() * 0.1, (rng() - 0.5) * 0.09);
      canopies.setColorAt(idx, tmp);
    }
    view.propInstances.set(p.id, { kind: 'tree', trunk: i, blobs: [i * 3, i * 3 + 1, i * 3 + 2] });
  });
  scene.add(trunks, canopies);

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(1.35, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rocks.length));
  rockInst.castShadow = HIGH;
  const rockBase = new THREE.Color('#8f9089');
  rocks.forEach((p, i) => {
    dummy.position.set(p.x, p.y + 0.4 * p.scale, p.z);
    dummy.rotation.set(p.z, p.x, 0);
    dummy.scale.set(p.scale, p.scale * 0.78, p.scale);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    const rr = mulberry32((p.x * 31 + p.z * 57) | 0)();
    tmp.copy(rockBase).offsetHSL(0, 0, (rr - 0.5) * 0.12);
    rockInst.setColorAt(i, tmp);
    view.propInstances.set(p.id, { kind: 'rock', idx: i });
  });
  scene.add(rockInst);

  // metal crates
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const crateMat = new THREE.MeshLambertMaterial({ map: metalTexture() });
  const crateInst = new THREE.InstancedMesh(crateGeo, crateMat, Math.max(1, crates.length));
  crateInst.castShadow = HIGH;
  crates.forEach((p, i) => {
    dummy.position.set(p.x, p.y + 0.8 * p.scale, p.z);
    dummy.rotation.set(0, p.x * 3, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    crateInst.setMatrixAt(i, dummy.matrix);
    view.propInstances.set(p.id, { kind: 'crate', idx: i });
  });
  scene.add(crateInst);

  view.removePropMesh = (id) => {
    const rec = view.propInstances.get(id);
    if (!rec) return;
    if (rec.kind === 'tree') {
      trunks.setMatrixAt(rec.trunk, ZERO);
      for (const b of rec.blobs) canopies.setMatrixAt(b, ZERO);
      trunks.instanceMatrix.needsUpdate = true;
      canopies.instanceMatrix.needsUpdate = true;
    } else if (rec.kind === 'rock') {
      rockInst.setMatrixAt(rec.idx, ZERO);
      rockInst.instanceMatrix.needsUpdate = true;
    } else {
      crateInst.setMatrixAt(rec.idx, ZERO);
      crateInst.instanceMatrix.needsUpdate = true;
    }
    view.propInstances.delete(id);
  };

  // ======================= BUILDS =======================
  const buildGroup = new THREE.Group();
  scene.add(buildGroup);
  const wallGeo = new THREE.BoxGeometry(G, G, 0.3);
  const floorGeo = new THREE.BoxGeometry(G, 0.3, G);
  const rampGeo = makeRampGeo();
  const buildMats = {
    wood: new THREE.MeshLambertMaterial({ map: woodTexture() }),
    brick: new THREE.MeshLambertMaterial({ map: brickTexture() }),
    metal: new THREE.MeshLambertMaterial({ map: metalTexture() }),
  };

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
    } else {
      mesh = new THREE.Mesh(rampGeo, mat);
      mesh.position.set(piece.x, piece.y, piece.z);
      mesh.rotation.y = piece.rot * Math.PI / 2;
    }
    mesh.castShadow = HIGH;
    mesh.receiveShadow = HIGH;
    buildGroup.add(mesh);
    view.buildMeshes.set(piece.id, mesh);
  };
  view.removeBuildMesh = (id) => {
    const mesh = view.buildMeshes.get(id);
    if (mesh) { buildGroup.remove(mesh); view.buildMeshes.delete(id); }
  };
  for (const piece of world.builds.values()) view.addBuildMesh(piece);

  // ======================= CHESTS =======================
  const beamTex = beamTexture();
  function makeBeam(color, height, radius) {
    const bg = new THREE.PlaneGeometry(radius * 2, height);
    const bm = new THREE.MeshBasicMaterial({
      map: beamTex, color, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const grp = new THREE.Group();
    const p1 = new THREE.Mesh(bg, bm);
    const p2 = new THREE.Mesh(bg, bm);
    p2.rotation.y = Math.PI / 2;
    p1.position.y = p2.position.y = height / 2;
    grp.add(p1, p2);
    return grp;
  }

  const chestBodyMat = new THREE.MeshLambertMaterial({ color: '#d9a12e' });
  const chestBandMat = new THREE.MeshLambertMaterial({ color: '#6b4a1a' });
  const chestGlowMat = new THREE.MeshBasicMaterial({ color: '#ffe9a0', toneMapped: false });
  const chestOpenMat = new THREE.MeshLambertMaterial({ color: '#77602c' });
  for (const c of world.chests) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 0.8), chestBodyMat);
    body.position.y = 0.28;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.8), chestBodyMat);
    lid.position.y = 0.71;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.19, 0.9, 0.2), chestBandMat);
    band.position.y = 0.44;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.24), chestGlowMat);
    lock.position.set(0, 0.5, 0.4);
    body.castShadow = lid.castShadow = HIGH;
    const beam = makeBeam('#ffd94d', 5, 0.5);
    grp.add(body, lid, band, lock, beam);
    grp.position.set(c.x, c.y - 0.1, c.z);
    grp.rotation.y = c.x + c.z;
    grp.userData.beam = beam;
    grp.userData.parts = [body, lid];
    scene.add(grp);
    view.chestMeshes.set(c.id, grp);
  }
  view.openChestMesh = (id) => {
    const grp = view.chestMeshes.get(id);
    if (!grp) return;
    grp.remove(grp.userData.beam);
    for (const m of grp.userData.parts) m.material = chestOpenMat;
    grp.children.find(ch => ch.material === chestGlowMat)?.removeFromParent();
    // pop the lid open
    const lid = grp.userData.parts[1];
    lid.rotation.x = -0.9;
    lid.position.z = -0.25;
    lid.position.y = 0.85;
  };

  // ======================= GROUND LOOT =======================
  const lootGroup = new THREE.Group();
  scene.add(lootGroup);
  const lootGeo = new THREE.OctahedronGeometry(0.32, 0);
  view.addLootMesh = (drop) => {
    let color = '#cfd6dd';
    if (drop.item.kind === 'weapon') color = RARITIES[drop.item.rarity].color;
    else if (drop.item.kind === 'heal') color = drop.item.h.includes('shield') ? '#3ad6ff' : '#8ef07f';
    else if (drop.item.kind === 'mats') color = { wood: '#c98d4b', brick: '#c96a5a', metal: '#aab6c5' }[drop.item.mat];
    const grp = new THREE.Group();
    const core = new THREE.Mesh(lootGeo, new THREE.MeshLambertMaterial({
      color, emissive: color, emissiveIntensity: 0.55,
    }));
    core.position.y = 0.6;
    grp.add(core, makeBeam(color, 2.6, 0.28));
    grp.position.set(drop.x, drop.y, drop.z);
    grp.userData.core = core;
    lootGroup.add(grp);
    view.lootMeshes.set(drop.id, grp);
  };
  view.removeLootMesh = (id) => {
    const mesh = view.lootMeshes.get(id);
    if (mesh) { lootGroup.remove(mesh); view.lootMeshes.delete(id); }
  };

  // ======================= STORM WALL =======================
  const stormMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 p = vec2(vUv.x * 14.0 + uTime * 0.06, vUv.y * 4.0 - uTime * 0.09);
        float n = noise(p) * 0.6 + noise(p * 2.7) * 0.4;
        vec3 colA = vec3(0.38, 0.07, 0.62);
        vec3 colB = vec3(0.85, 0.32, 1.0);
        vec3 col = mix(colA, colB, n);
        float alpha = 0.16 + n * 0.22;
        alpha *= smoothstep(1.0, 0.72, vUv.y);          // fade out at top
        float edge = smoothstep(0.10, 0.0, vUv.y);      // hot line at ground
        col += vec3(1.0, 0.55, 1.3) * edge;
        alpha += edge * 0.30;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  timed.push(stormMat);
  const stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 150, 72, 1, true), stormMat);
  stormWall.position.y = 55;
  stormWall.renderOrder = 5;
  scene.add(stormWall);
  view.updateStorm = (storm) => {
    stormWall.position.x = storm.cx;
    stormWall.position.z = storm.cz;
    stormWall.scale.set(Math.max(0.01, storm.r), 1, Math.max(0.01, storm.r));
  };

  // ======================= per-frame =======================
  view.tick = (t) => {
    for (const m of timed) m.uniforms.uTime.value = t;
    for (const grp of view.lootMeshes.values()) {
      const core = grp.userData.core;
      core.rotation.y = t * 2.0;
      core.position.y = 0.6 + Math.sin(t * 2.6 + grp.position.x) * 0.08;
    }
  };

  return view;
}

function makeRampGeo() {
  // solid wedge spanning one grid cell, sloping up along +z — with UVs
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
  const uvs = new Float32Array([
    // bottom
    0,0, 1,0, 1,1,  0,0, 1,1, 0,1,
    // slope
    0,0, 0,1, 1,1,  0,0, 1,1, 1,0,
    // back
    0,0, 1,1, 0,1,  0,0, 1,0, 1,1,
    // sides
    0,0, 1,0, 1,1,  0,0, 1,1, 1,0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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
