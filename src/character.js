// Stylized toon character: rounded anatomy, hair styles, cel shading,
// articulated arms/legs. Fortnite-inspired silhouette, built procedurally.
import * as THREE from 'three';
import { faceTexture } from './textures.js';

export const SKINS = ['#f2c79c', '#d9a066', '#a06a42', '#6b4226'];
export const OUTFITS = ['#2f8fff', '#ff4757', '#2ed573', '#ffa502', '#a55eea', '#17d3c4', '#ff6b9d', '#57606f'];
export const HATS = ['none', 'cap', 'beanie', 'crown', 'bucket'];
export const HAIRS = ['short', 'spiky', 'swoop', 'ponytail', 'long', 'none'];
export const HAIR_COLORS = ['#2b2019', '#101014', '#a5581f', '#e8c364', '#d64f2a', '#8a8d95', '#7a4fd0', '#3ab5d6'];

export function defaultCustom() {
  return { skin: 0, outfit: 0, hat: 0, hair: 0, hairColor: 0, name: 'Player' };
}

export function loadCustom() {
  try {
    const saved = JSON.parse(localStorage.getItem('nf_custom'));
    if (saved && typeof saved.skin === 'number') return { ...defaultCustom(), ...saved };
  } catch { /* fall through */ }
  return defaultCustom();
}

export function saveCustom(c) {
  localStorage.setItem('nf_custom', JSON.stringify(c));
}

// --- cel-shading ramp shared by all character materials ---
let gradientMap = null;
function ramp() {
  if (!gradientMap) {
    const data = new Uint8Array([110, 170, 225, 255]);
    gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
    gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...opts });
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0.02, amt);
  return c;
}

export function buildCharacter(custom) {
  const c = { ...defaultCustom(), ...(custom || {}) };
  const skinColor = SKINS[c.skin % SKINS.length];
  const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
  const hairColor = HAIR_COLORS[c.hairColor % HAIR_COLORS.length];

  const skin = toon(skinColor);
  const outfit = toon(outfitColor);
  const outfitDark = toon(shade(outfitColor, -0.16));
  const pants = toon('#333748');
  const shoes = toon('#1e2029');
  const hairMat = toon(hairColor);

  const g = new THREE.Group();
  const cast = [];

  // ---- hips + torso (tapered: broad shoulders, narrow waist) ----
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), pants);
  hips.scale.set(1.15, 0.7, 0.85);
  hips.position.y = 0.86;
  g.add(hips);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.62, 14), outfit);
  torso.scale.z = 0.68;
  torso.position.y = 1.22;
  g.add(torso);
  cast.push(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), outfit);
  chest.scale.set(1.08, 0.62, 0.72);
  chest.position.y = 1.5;
  g.add(chest);

  // backpack
  const pack = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), outfitDark);
  pack.scale.set(1, 1.25, 0.62);
  pack.position.set(0, 1.28, -0.26);
  g.add(pack);

  // belt
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 12), outfitDark);
  belt.scale.z = 0.72;
  belt.position.y = 0.95;
  g.add(belt);

  // ---- neck + head ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 8), skin);
  neck.position.y = 1.62;
  g.add(neck);

  const headG = new THREE.Group();
  headG.position.y = 1.78;
  g.add(headG);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), skin);
  head.scale.set(0.95, 1.08, 0.92);
  headG.add(head);
  cast.push(head);

  // face: curved cap floating just in front of the head sphere
  const faceGeo = new THREE.SphereGeometry(0.245, 16, 12, -Math.PI / 3.2, (Math.PI / 3.2) * 2, Math.PI / 3.4, Math.PI / 2.4);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshToonMaterial({
    map: faceTexture(skinColor), gradientMap: ramp(), transparent: true,
  }));
  face.scale.set(0.95, 1.08, 0.92);
  face.rotation.y = Math.PI / 2; // cap is built around +x; face forward (+z)
  headG.add(face);

  // ---- hair ----
  const hairKey = HAIRS[c.hair % HAIRS.length];
  if (hairKey !== 'none') {
    const hair = new THREE.Group();
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.255, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.35), hairMat);
    cap.scale.set(0.98, 1.05, 0.95);
    hair.add(cap);
    if (hairKey === 'spiky') {
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), hairMat);
        const a = (i / 7) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.13, 0.24, Math.sin(a) * 0.11);
        spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        hair.add(spike);
      }
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), hairMat);
      top.position.y = 0.28;
      hair.add(top);
    } else if (hairKey === 'swoop') {
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hairMat);
      fringe.scale.set(1.3, 0.55, 0.8);
      fringe.position.set(0.06, 0.13, 0.17);
      fringe.rotation.z = -0.35;
      hair.add(fringe);
    } else if (hairKey === 'ponytail') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), hairMat);
      bun.position.set(0, 0.16, -0.2);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.34, 7), hairMat);
      tail.position.set(0, -0.02, -0.26);
      tail.rotation.x = 0.35;
      hair.add(bun, tail);
    } else if (hairKey === 'long') {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 12, 1, false, -Math.PI / 2, Math.PI), hairMat);
      back.position.set(0, -0.12, -0.06);
      back.rotation.y = Math.PI; // open side forward
      hair.add(back);
    }
    hair.position.y = 0.055;
    headG.add(hair);
  }

  // ---- hats (sit on top of hair) ----
  const hatKey = HATS[c.hat % HATS.length];
  if (hatKey !== 'none') {
    let hat;
    if (hatKey === 'cap') {
      hat = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), outfit);
      dome.scale.set(1, 0.75, 1);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.035, 10, 1, false, -Math.PI / 2.4, Math.PI / 1.2), outfitDark);
      brim.position.set(0, 0.02, 0.16);
      brim.scale.z = 1.6;
      hat.add(dome, brim);
      hat.position.y = 0.12;
    } else if (hatKey === 'beanie') {
      hat = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ff4757'));
      dome.scale.y = 0.85;
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.09, 12), toon('#d63447'));
      fold.position.y = -0.02;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon('#ffffff'));
      pom.position.y = 0.24;
      hat.add(dome, fold, pom);
      hat.position.y = 0.1;
    } else if (hatKey === 'crown') {
      hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.18, 0.14, 6, 1, true),
        new THREE.MeshToonMaterial({ color: '#ffd700', gradientMap: ramp(), emissive: '#7a5c00', side: THREE.DoubleSide }),
      );
      hat.position.y = 0.24;
    } else { // bucket
      hat = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.14, 12), toon('#5b7042'));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.04, 12), toon('#4c5e37'));
      brim.position.y = -0.07;
      hat.add(top, brim);
      hat.position.y = 0.19;
    }
    headG.add(hat);
  }

  // ---- arms: shoulder pivot -> upper arm -> elbow pivot -> forearm + hand ----
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.33 * side, 1.5, 0);

    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), outfitDark);
    shoulder.add(pad);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.3, 8), outfit);
    upper.position.y = -0.17;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);

    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.28, 8), skin);
    fore.position.y = -0.13;
    elbow.add(fore);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin);
    hand.position.y = -0.3;
    elbow.add(hand);

    // relaxed default pose: slightly out and bent
    shoulder.rotation.z = -0.12 * side;
    elbow.rotation.x = -0.25;
    return { shoulder, elbow, hand };
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  g.add(armL.shoulder, armR.shoulder);

  // ---- legs: hip pivot -> thigh -> knee pivot -> calf + shoe ----
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.14 * side, 0.86, 0);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.085, 0.4, 9), pants);
    thigh.position.y = -0.21;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);

    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.34, 8), pants);
    calf.position.y = -0.17;
    knee.add(calf);

    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), shoes);
    shoe.scale.set(1, 0.62, 1.7);
    shoe.position.set(0, -0.4, 0.05);
    knee.add(shoe);
    return { hip, knee };
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  g.add(legL.hip, legR.hip);

  for (const m of cast) m.castShadow = true;

  // held item follows the right hand (raises with the arm when shooting)
  const held = new THREE.Group();
  held.position.set(0, -0.32, 0.05);
  held.rotation.x = Math.PI / 2 - 0.15; // lie along the forearm, muzzle forward when raised
  armR.elbow.add(held);

  g.userData = {
    armL, armR, legL, legR, held,
    phase: Math.random() * 10, heldKey: null,
  };
  return g;
}

const WEAPON_STYLES = {
  pickaxe: null,
  pistol:  { body: '#4a4f5c', accent: '#2c2f38', len: 0.32 },
  smg:     { body: '#3d4a6b', accent: '#252c40', len: 0.5 },
  ar:      { body: '#44583f', accent: '#2a3627', len: 0.62 },
  shotgun: { body: '#6b5138', accent: '#3d2e20', len: 0.6 },
  sniper:  { body: '#33475c', accent: '#1f2c3a', len: 0.92 },
};

export function setHeldItem(charGroup, weaponKey) {
  const u = charGroup.userData;
  if (u.heldKey === weaponKey) return;
  u.heldKey = weaponKey;
  u.held.clear();
  if (!weaponKey) return;
  if (weaponKey === 'pickaxe') {
    const grp = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6), toon('#8a6b4a'));
    handle.rotation.x = Math.PI / 2;
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.09), toon('#a9b2bd'));
    headM.position.z = 0.3;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), toon('#8b95a1'));
    tip.position.set(0.24, 0, 0.3);
    tip.rotation.z = -Math.PI / 2;
    grp.add(handle, headM, tip);
    u.held.add(grp);
    return;
  }
  const st = WEAPON_STYLES[weaponKey] || WEAPON_STYLES.pistol;
  const grp = new THREE.Group();
  const bodyMat = toon(st.body);
  const accentMat = toon(st.accent);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, st.len), bodyMat);
  body.position.z = st.len / 2;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), accentMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = st.len + 0.08;
  barrel.position.y = 0.02;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), accentMat);
  grip.position.set(0, -0.12, 0.1);
  grip.rotation.x = 0.25;
  grp.add(body, barrel, grip);
  if (weaponKey === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 6), accentMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.11, 0.4);
    grp.add(scope);
  }
  u.held.add(grp);
}

export function animateCharacter(charGroup, dt, moving, shooting) {
  const u = charGroup.userData;
  u.phase += dt * (moving ? 9.5 : 1.6);
  const s = Math.sin(u.phase);
  if (moving) {
    // legs: hip swing with knee bend on the trailing leg
    u.legL.hip.rotation.x = s * 0.62;
    u.legR.hip.rotation.x = -s * 0.62;
    u.legL.knee.rotation.x = Math.max(0, -s) * 0.9 + 0.08;
    u.legR.knee.rotation.x = Math.max(0, s) * 0.9 + 0.08;
    // arms swing opposite with a live elbow
    u.armL.shoulder.rotation.x = -s * 0.5;
    u.armL.elbow.rotation.x = -0.3 - Math.max(0, -s) * 0.4;
    if (!shooting) {
      u.armR.shoulder.rotation.x = s * 0.5;
      u.armR.elbow.rotation.x = -0.3 - Math.max(0, s) * 0.4;
    }
  } else {
    // idle: gentle sway
    u.legL.hip.rotation.x = 0;
    u.legR.hip.rotation.x = 0;
    u.legL.knee.rotation.x = 0.05;
    u.legR.knee.rotation.x = 0.05;
    u.armL.shoulder.rotation.x = s * 0.045;
    u.armL.elbow.rotation.x = -0.25;
    if (!shooting) {
      u.armR.shoulder.rotation.x = -s * 0.045;
      u.armR.elbow.rotation.x = -0.25;
    }
  }
  if (shooting) {
    u.armR.shoulder.rotation.x = -1.35;
    u.armR.elbow.rotation.x = -0.12;
  }
}

export function makeNameTag(name, isBot) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = Math.min(240, ctx.measureText(name).width + 24);
  ctx.beginPath();
  ctx.roundRect(128 - w / 2, 6, w, 44, 10);
  ctx.fill();
  ctx.fillStyle = isBot ? '#c9c9d6' : '#ffffff';
  ctx.fillText(name, 128, 30);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(2.4, 0.52, 1);
  sprite.position.y = 2.45;
  return sprite;
}
