// Customizable stylized character: cartoon face, two-tone outfit, backpack,
// hats. Builds the mesh, animates it, draws name tags.
import * as THREE from 'three';
import { faceTexture } from './textures.js';

export const SKINS = ['#f2c79c', '#d9a066', '#a06a42', '#6b4226'];
export const OUTFITS = ['#2f8fff', '#ff4757', '#2ed573', '#ffa502', '#a55eea', '#17d3c4', '#ff6b9d', '#57606f'];
export const HATS = ['none', 'cap', 'beanie', 'crown', 'bucket'];

export function defaultCustom() {
  return { skin: 0, outfit: 0, hat: 0, name: 'Player' };
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

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0.02, amt);
  return c;
}

export function buildCharacter(custom) {
  const c = { ...defaultCustom(), ...(custom || {}) };
  const skinColor = SKINS[c.skin % SKINS.length];
  const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const outfit = new THREE.MeshLambertMaterial({ color: outfitColor });
  const outfitDark = new THREE.MeshLambertMaterial({ color: shade(outfitColor, -0.16) });
  const pants = new THREE.MeshLambertMaterial({ color: '#2e3140' });
  const shoes = new THREE.MeshLambertMaterial({ color: '#1c1e28' });

  const g = new THREE.Group();
  const cast = [];

  // torso with shoulder pads
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.34), outfit);
  torso.position.y = 1.06;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.36), outfitDark);
  belt.position.y = 0.73;
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.3), outfitDark);
  padL.position.set(-0.38, 1.38, 0);
  const padR = padL.clone();
  padR.position.x = 0.38;
  g.add(torso, belt, padL, padR);
  cast.push(torso);

  // backpack
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.16), outfitDark);
  pack.position.set(0, 1.14, -0.26);
  g.add(pack);

  // head: face texture on the front, skin on the rest
  const skinFlat = new THREE.MeshLambertMaterial({ color: skinColor });
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(skinColor) });
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.46, 0.44),
    [skinFlat, skinFlat, skinFlat, skinFlat, faceMat, skinFlat], // +z = face
  );
  head.position.y = 1.68;
  g.add(head);
  cast.push(head);

  // hats
  const hatKey = HATS[c.hat % HATS.length];
  if (hatKey !== 'none') {
    let hat;
    if (hatKey === 'cap') {
      hat = new THREE.Group();
      const crownM = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), outfit);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.26), outfitDark);
      brim.position.set(0, -0.06, 0.35);
      hat.add(crownM, brim);
      hat.position.y = 1.97;
    } else if (hatKey === 'beanie') {
      hat = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.48), new THREE.MeshLambertMaterial({ color: '#ff4757' }));
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: '#d63447' }));
      fold.position.y = -0.1;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshLambertMaterial({ color: '#fff' }));
      pom.position.y = 0.14;
      hat.add(cap, fold, pom);
      hat.position.y = 1.98;
    } else if (hatKey === 'crown') {
      hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.27, 0.2, 6, 1, true),
        new THREE.MeshLambertMaterial({ color: '#ffd700', emissive: '#8a6a00', side: THREE.DoubleSide }),
      );
      hat.position.y = 1.99;
    } else { // bucket
      hat = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.18, 10), new THREE.MeshLambertMaterial({ color: '#5b7042' }));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.05, 10), new THREE.MeshLambertMaterial({ color: '#4c5e37' }));
      brim.position.y = -0.09;
      hat.add(top, brim);
      hat.position.y = 1.99;
    }
    g.add(hat);
  }

  // arms: outfit sleeve + skin forearm, pivot at shoulder
  function makeArm(side) {
    const pivot = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.3, 0.17), outfit);
    sleeve.position.y = -0.14;
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.15), skin);
    fore.position.y = -0.44;
    pivot.add(sleeve, fore);
    pivot.position.set(0.4 * side, 1.38, 0);
    return pivot;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  g.add(armL, armR);

  // legs: pants + shoes, pivot at hip
  function makeLeg(side) {
    const pivot = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.62, 0.21), pants);
    leg.position.y = -0.3;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), shoes);
    shoe.position.set(0, -0.64, 0.04);
    pivot.add(leg, shoe);
    pivot.position.set(0.16 * side, 0.7, 0);
    return pivot;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  g.add(legL, legR);

  for (const m of cast) m.castShadow = true;

  // held item shown in right hand (swapped by main when weapon changes)
  const held = new THREE.Group();
  held.position.set(0.4, 0.78, 0.2);
  g.add(held);

  g.userData = { armL, armR, legL, legR, held, phase: Math.random() * 10, heldKey: null };
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
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6), new THREE.MeshLambertMaterial({ color: '#8a6b4a' }));
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.09), new THREE.MeshLambertMaterial({ color: '#a9b2bd' }));
    headM.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), new THREE.MeshLambertMaterial({ color: '#8b95a1' }));
    tip.position.set(0.24, 0.3, 0);
    tip.rotation.z = -Math.PI / 2;
    grp.add(handle, headM, tip);
    u.held.add(grp);
    return;
  }
  const st = WEAPON_STYLES[weaponKey] || WEAPON_STYLES.pistol;
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: st.body });
  const accentMat = new THREE.MeshLambertMaterial({ color: st.accent });
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
  u.phase += dt * (moving ? 9 : 2);
  const swing = moving ? Math.sin(u.phase) * 0.6 : Math.sin(u.phase) * 0.04;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8;
  u.armR.rotation.x = shooting ? -1.4 : swing * 0.8;
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
