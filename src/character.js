// Customizable blocky character: builds the mesh, animates it, draws name tags.
import * as THREE from 'three';

export const SKINS = ['#f2c79c', '#d9a066', '#a06a42', '#6b4226'];
export const OUTFITS = ['#3aa0ff', '#e34d4d', '#57c94f', '#f0a13a', '#b04df0', '#3ad6c4', '#f25ca2', '#5c5c72'];
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

export function buildCharacter(custom) {
  const c = { ...defaultCustom(), ...(custom || {}) };
  const skin = new THREE.MeshLambertMaterial({ color: SKINS[c.skin % SKINS.length] });
  const outfit = new THREE.MeshLambertMaterial({ color: OUTFITS[c.outfit % OUTFITS.length] });
  const dark = new THREE.MeshLambertMaterial({ color: '#2a2a38' });

  const g = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), outfit);
  torso.position.y = 1.06;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.66;
  g.add(head);

  // hat
  const hatKey = HATS[c.hat % HATS.length];
  if (hatKey !== 'none') {
    let hat;
    if (hatKey === 'cap') {
      hat = new THREE.Group();
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), outfit);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.24), outfit);
      brim.position.set(0, -0.05, 0.33);
      hat.add(crown, brim);
      hat.position.y = 1.92;
    } else if (hatKey === 'beanie') {
      hat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.46), new THREE.MeshLambertMaterial({ color: '#e34d4d' }));
      hat.position.y = 1.93;
    } else if (hatKey === 'crown') {
      hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 6, 1, true), new THREE.MeshLambertMaterial({ color: '#ffd700', side: THREE.DoubleSide }));
      hat.position.y = 1.95;
    } else { // bucket
      hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.2, 8), new THREE.MeshLambertMaterial({ color: '#556b2f' }));
      hat.position.y = 1.95;
    }
    g.add(hat);
  }

  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.16);
  armGeo.translate(0, -0.24, 0); // pivot at shoulder
  const armL = new THREE.Mesh(armGeo, skin);
  armL.position.set(-0.4, 1.36, 0);
  const armR = new THREE.Mesh(armGeo.clone(), skin);
  armR.position.set(0.4, 1.36, 0);
  g.add(armL, armR);

  const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
  legGeo.translate(0, -0.32, 0); // pivot at hip
  const legL = new THREE.Mesh(legGeo, dark);
  legL.position.set(-0.16, 0.7, 0);
  const legR = new THREE.Mesh(legGeo.clone(), dark);
  legR.position.set(0.16, 0.7, 0);
  g.add(legL, legR);

  // held item shown in right hand (swapped by main when weapon changes)
  const held = new THREE.Group();
  held.position.set(0.4, 0.76, 0.18);
  g.add(held);

  g.userData = { armL, armR, legL, legR, held, phase: Math.random() * 10, heldKey: null };
  return g;
}

const WEAPON_COLORS = { pickaxe: '#8a6b4a', pistol: '#555', smg: '#446', ar: '#464', shotgun: '#653', sniper: '#345' };

export function setHeldItem(charGroup, weaponKey) {
  const u = charGroup.userData;
  if (u.heldKey === weaponKey) return;
  u.heldKey = weaponKey;
  u.held.clear();
  if (!weaponKey) return;
  const color = WEAPON_COLORS[weaponKey] || '#555';
  const mat = new THREE.MeshLambertMaterial({ color });
  let mesh;
  if (weaponKey === 'pickaxe') {
    mesh = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), mat);
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: '#999' }));
    headM.position.y = 0.28;
    mesh.add(handle, headM);
  } else {
    const len = weaponKey === 'sniper' ? 0.8 : weaponKey === 'pistol' ? 0.3 : 0.55;
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, len), mat);
    mesh.position.z = len / 2;
  }
  u.held.add(mesh);
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(2.4, 0.52, 1);
  sprite.position.y = 2.35;
  return sprite;
}
