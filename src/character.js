// Stylized toon characters with multiple archetypes: humanoids (default and
// female with hair/hats), a banana mascot, bear and frog suits, and a robot.
// Every archetype shares the same rig contract (shoulder/elbow, hip/knee
// pivots + a held-item mount) so animation and weapons work for all of them.
import * as THREE from 'three';
import { faceTexture } from './textures.js';

export const BODIES = ['default', 'female', 'banana', 'bear', 'frog', 'robot', 'hero'];
export const SKINS = ['#f2c79c', '#d9a066', '#a06a42', '#6b4226'];
export const OUTFITS = ['#2f8fff', '#ff4757', '#2ed573', '#ffa502', '#a55eea', '#17d3c4', '#ff6b9d', '#57606f'];
export const HATS = ['none', 'cap', 'beanie', 'crown', 'bucket'];
export const HAIRS = ['short', 'spiky', 'swoop', 'ponytail', 'long', 'none'];
export const HAIR_COLORS = ['#2b2019', '#101014', '#a5581f', '#e8c364', '#d64f2a', '#8a8d95', '#7a4fd0', '#3ab5d6'];

export function defaultCustom() {
  return { body: 0, skin: 0, outfit: 0, hat: 0, hair: 0, hairColor: 0, name: 'Player' };
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

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...opts });
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0.02, amt);
  return c;
}

// curved face patch that hugs a sphere of the given radius, facing +z
export function faceCap(radius, tex, headScale = [0.95, 1.08, 0.92]) {
  const geo = new THREE.SphereGeometry(radius, 16, 12, -Math.PI / 3.2, (Math.PI / 3.2) * 2, Math.PI / 3.4, Math.PI / 2.4);
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({
    map: tex, gradientMap: ramp(), transparent: true,
  }));
  mesh.scale.set(...headScale);
  mesh.rotation.y = Math.PI / 2; // cap is built around +x
  return mesh;
}

// hair mesh sized for a ~0.25-radius head centered at the origin
export function buildHairMesh(c) {
  const hairKey = HAIRS[c.hair % HAIRS.length];
  if (hairKey === 'none') return null;
  const hairMat = toon(HAIR_COLORS[c.hairColor % HAIR_COLORS.length]);
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
    back.rotation.y = Math.PI;
    hair.add(back);
  }
  hair.position.y = 0.055;
  return hair;
}

// hat mesh sized for a ~0.25-radius head centered at the origin
export function buildHatMesh(c) {
  const hatKey = HATS[c.hat % HATS.length];
  if (hatKey === 'none') return null;
  const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
  const outfit = toon(outfitColor);
  const outfitDark = toon(shade(outfitColor, -0.16));
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
  return hat;
}

export function buildCharacter(custom) {
  const c = { ...defaultCustom(), ...(custom || {}) };
  let body = BODIES[c.body % BODIES.length];
  if (body === 'hero') body = 'default'; // rigged hero is built in models.js; this is the fallback
  const g = new THREE.Group();

  // ---- shared limb factory (same pivot contract for every archetype) ----
  function makeArm(side, o) {
    const shoulder = new THREE.Group();
    shoulder.position.set(o.x * side, o.y, 0);
    if (o.pad) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(o.padR ?? 0.11, 10, 8), o.pad);
      shoulder.add(pad);
    }
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(o.thick, o.thick * 0.87, 0.3, 8), o.sleeve);
    upper.position.y = -0.17;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(o.thick * 0.8, o.thick * 0.67, 0.28, 8), o.fore);
    fore.position.y = -0.13;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(o.thick * 0.95, 8, 6), o.hand);
    hand.position.y = -0.3;
    elbow.add(hand);
    shoulder.rotation.z = -0.12 * side;
    elbow.rotation.x = -0.25;
    if (o.scale) shoulder.scale.setScalar(o.scale);
    return { shoulder, elbow };
  }

  function makeLeg(side, o) {
    const hip = new THREE.Group();
    hip.position.set(o.x * side, o.y, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(o.thick, o.thick * 0.81, 0.4, 9), o.pant);
    thigh.position.y = -0.21;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(o.thick * 0.76, o.thick * 0.57, 0.34, 8), o.pant);
    calf.position.y = -0.17;
    knee.add(calf);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), o.shoe);
    shoe.scale.set(o.footW ?? 1, 0.62, o.footL ?? 1.7);
    shoe.position.set(0, -0.4, 0.05);
    knee.add(shoe);
    if (o.scale) hip.scale.setScalar(o.scale);
    return { hip, knee };
  }

  let armL, armR, legL, legR;
  const cast = [];

  // =========================================================================
  if (body === 'default' || body === 'female') {
    const female = body === 'female';
    const skinColor = SKINS[c.skin % SKINS.length];
    const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
    const skin = toon(skinColor);
    const outfit = toon(outfitColor);
    const outfitDark = toon(shade(outfitColor, -0.16));
    const pants = toon('#333748');
    const shoes = toon('#1e2029');

    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), pants);
    hips.scale.set(female ? 1.2 : 1.15, 0.7, 0.85);
    hips.position.y = 0.86;
    g.add(hips);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(female ? 0.26 : 0.3, female ? 0.19 : 0.22, 0.62, 14), outfit);
    torso.scale.z = 0.68;
    torso.position.y = 1.22;
    g.add(torso);
    cast.push(torso);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(female ? 0.26 : 0.3, 14, 10), outfit);
    chest.scale.set(1.08, 0.62, 0.72);
    chest.position.y = 1.5;
    g.add(chest);

    const pack = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), outfitDark);
    pack.scale.set(1, 1.25, 0.62);
    pack.position.set(0, 1.28, -0.26);
    g.add(pack);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 12), outfitDark);
    belt.scale.z = 0.72;
    belt.position.y = 0.95;
    g.add(belt);

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
    headG.add(faceCap(0.245, faceTexture(skinColor, female ? 'female' : 'default')));

    const hair = buildHairMesh(c);
    if (hair) headG.add(hair);
    const hat = buildHatMesh(c);
    if (hat) headG.add(hat);

    armL = makeArm(-1, { x: female ? 0.3 : 0.33, y: 1.5, thick: female ? 0.065 : 0.075, sleeve: outfit, fore: skin, hand: skin, pad: outfitDark, padR: female ? 0.09 : 0.11 });
    armR = makeArm(1, { x: female ? 0.3 : 0.33, y: 1.5, thick: female ? 0.065 : 0.075, sleeve: outfit, fore: skin, hand: skin, pad: outfitDark, padR: female ? 0.09 : 0.11 });
    legL = makeLeg(-1, { x: 0.14, y: 0.86, thick: female ? 0.095 : 0.105, pant: pants, shoe: shoes });
    legR = makeLeg(1, { x: 0.14, y: 0.86, thick: female ? 0.095 : 0.105, pant: pants, shoe: shoes });

  // =========================================================================
  } else if (body === 'banana') {
    const yellow = '#f5c542';
    const peel = toon(yellow);
    const peelDark = toon('#c99a2a');
    const tipMat = toon('#7a5a24');

    // curved banana body from stacked spheres
    const spine = [
      [0.55, 0.2, -0.03, 0.9], [0.85, 0.27, 0.01, 1], [1.15, 0.31, 0.05, 1],
      [1.45, 0.28, 0.06, 1], [1.7, 0.21, 0.02, 0.9],
    ];
    for (const [y, r, z, sy] of spine) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), peel);
      seg.scale.set(1, sy, 0.88);
      seg.position.set(0, y, z);
      g.add(seg);
      cast.push(seg);
    }
    // stem tips
    const topTip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.22, 7), tipMat);
    topTip.position.set(0, 1.92, -0.04);
    topTip.rotation.x = -0.35;
    const botTip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), tipMat);
    botTip.scale.set(1, 0.7, 1);
    botTip.position.set(0, 0.42, -0.06);
    g.add(topTip, botTip);

    // face on the peel
    const face = faceCap(0.32, faceTexture(yellow, 'banana'), [1, 1, 1]);
    face.position.set(0, 1.35, 0.02);
    g.add(face);

    armL = makeArm(-1, { x: 0.32, y: 1.32, thick: 0.06, sleeve: peel, fore: peel, hand: peelDark });
    armR = makeArm(1, { x: 0.32, y: 1.32, thick: 0.06, sleeve: peel, fore: peel, hand: peelDark });
    legL = makeLeg(-1, { x: 0.13, y: 0.62, thick: 0.08, pant: peel, shoe: peelDark, scale: 0.75 });
    legR = makeLeg(1, { x: 0.13, y: 0.62, thick: 0.08, pant: peel, shoe: peelDark, scale: 0.75 });

  // =========================================================================
  } else if (body === 'bear') {
    const suitColor = OUTFITS[c.outfit % OUTFITS.length];
    const suit = toon(suitColor);
    const suitDark = toon(shade(suitColor, -0.18));
    const bellyMat = toon(shade(suitColor, 0.22));

    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), suit);
    hips.scale.set(1.15, 0.75, 0.9);
    hips.position.y = 0.84;
    g.add(hips);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 12), suit);
    torso.scale.set(1, 1.15, 0.85);
    torso.position.y = 1.22;
    g.add(torso);
    cast.push(torso);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bellyMat);
    belly.scale.set(1, 1.25, 0.5);
    belly.position.set(0, 1.18, 0.19);
    g.add(belly);

    const headG = new THREE.Group();
    headG.position.y = 1.8;
    g.add(headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), suit);
    head.scale.set(1.05, 0.95, 0.95);
    headG.add(head);
    cast.push(head);
    // ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), suit);
      ear.position.set(0.18 * side, 0.22, 0);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bellyMat);
      inner.position.set(0.18 * side, 0.22, 0.04);
      headG.add(ear, inner);
    }
    // muzzle + nose + eyes
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bellyMat);
    muzzle.scale.set(1.1, 0.78, 0.8);
    muzzle.position.set(0, -0.07, 0.22);
    headG.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon('#241a14'));
    nose.position.set(0, -0.02, 0.33);
    headG.add(nose);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), toon('#16130f'));
      eye.position.set(0.1 * side, 0.07, 0.24);
      headG.add(eye);
    }

    armL = makeArm(-1, { x: 0.35, y: 1.46, thick: 0.085, sleeve: suit, fore: suit, hand: suitDark });
    armR = makeArm(1, { x: 0.35, y: 1.46, thick: 0.085, sleeve: suit, fore: suit, hand: suitDark });
    legL = makeLeg(-1, { x: 0.15, y: 0.84, thick: 0.115, pant: suit, shoe: suitDark, footW: 1.15 });
    legR = makeLeg(1, { x: 0.15, y: 0.84, thick: 0.115, pant: suit, shoe: suitDark, footW: 1.15 });

  // =========================================================================
  } else if (body === 'frog') {
    const skinC = OUTFITS[c.outfit % OUTFITS.length];
    const frog = toon(skinC);
    const bellyMat = toon(shade(skinC, 0.24));

    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), frog);
    hips.scale.set(1.2, 0.72, 0.95);
    hips.position.y = 0.82;
    g.add(hips);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), frog);
    torso.scale.set(1, 1.05, 0.85);
    torso.position.y = 1.18;
    g.add(torso);
    cast.push(torso);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), bellyMat);
    belly.scale.set(1, 1.1, 0.5);
    belly.position.set(0, 1.14, 0.18);
    g.add(belly);

    const headG = new THREE.Group();
    headG.position.y = 1.66;
    g.add(headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), frog);
    head.scale.set(1.2, 0.8, 1);
    headG.add(head);
    cast.push(head);
    // bulging eyes on top
    for (const side of [-1, 1]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon('#f2f6f0'));
      ball.position.set(0.15 * side, 0.2, 0.08);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon('#14130f'));
      pupil.position.set(0.15 * side, 0.21, 0.16);
      headG.add(ball, pupil);
    }
    // wide mouth line
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 6, 14, Math.PI * 0.8), toon('#1e3320'));
    mouth.position.set(0, -0.06, 0.22);
    mouth.rotation.set(Math.PI / 2 - 0.5, 0, -Math.PI * 0.4);
    headG.add(mouth);

    armL = makeArm(-1, { x: 0.33, y: 1.4, thick: 0.06, sleeve: frog, fore: frog, hand: bellyMat });
    armR = makeArm(1, { x: 0.33, y: 1.4, thick: 0.06, sleeve: frog, fore: frog, hand: bellyMat });
    legL = makeLeg(-1, { x: 0.15, y: 0.82, thick: 0.1, pant: frog, shoe: bellyMat, footW: 1.25, footL: 2.1 });
    legR = makeLeg(1, { x: 0.15, y: 0.82, thick: 0.1, pant: frog, shoe: bellyMat, footW: 1.25, footL: 2.1 });

  // =========================================================================
  } else { // robot
    const accent = OUTFITS[c.outfit % OUTFITS.length];
    const metal = toon('#9aa4b0');
    const metalDark = toon('#5b636e');
    const glow = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.3), metalDark);
    hips.position.y = 0.88;
    g.add(hips);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.34), metal);
    torso.position.y = 1.28;
    g.add(torso);
    cast.push(torso);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), glow);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 1.34, 0.18);
    g.add(core);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), metalDark);
    vent.position.set(0, 1.1, 0.18);
    g.add(vent);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), metalDark);
    neck.position.y = 1.63;
    g.add(neck);

    const headG = new THREE.Group();
    headG.position.y = 1.8;
    g.add(headG);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.36), metal);
    headG.add(head);
    cast.push(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.03), glow);
    visor.position.set(0, 0.03, 0.18);
    headG.add(visor);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6), metalDark);
    antenna.position.set(0.12, 0.26, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow);
    bulb.position.set(0.12, 0.36, 0);
    headG.add(antenna, bulb);
    // jaw plate
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.03), metalDark);
    jaw.position.set(0, -0.11, 0.18);
    headG.add(jaw);

    armL = makeArm(-1, { x: 0.34, y: 1.5, thick: 0.07, sleeve: metal, fore: metalDark, hand: metalDark, pad: metalDark, padR: 0.1 });
    armR = makeArm(1, { x: 0.34, y: 1.5, thick: 0.07, sleeve: metal, fore: metalDark, hand: metalDark, pad: metalDark, padR: 0.1 });
    legL = makeLeg(-1, { x: 0.14, y: 0.88, thick: 0.09, pant: metal, shoe: metalDark, footW: 1.1 });
    legR = makeLeg(1, { x: 0.14, y: 0.88, thick: 0.09, pant: metal, shoe: metalDark, footW: 1.1 });
  }

  g.add(armL.shoulder, armR.shoulder, legL.hip, legR.hip);
  for (const m of cast) m.castShadow = true;

  // held item follows the right forearm (raises with the shooting pose)
  const held = new THREE.Group();
  held.position.set(0, -0.32, 0.05);
  held.rotation.x = Math.PI / 2 - 0.15;
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

export function animateCharacter(charGroup, dt, moving, shooting, airborne) {
  const u = charGroup.userData;

  // rigged hero: drive the skeletal animation state machine
  if (u.isHero) {
    u.mixer.update(dt);
    const target =
      u.override ? u.override :
      shooting ? 'Pistol_Shoot' :
      airborne ? 'Jump_Loop' :
      moving ? 'Jog_Fwd_Loop' : 'Idle_Loop';
    if (target !== u.current && u.actions[target]) {
      const prev = u.actions[u.current];
      const next = u.actions[target];
      if (prev) prev.fadeOut(0.18);
      next.reset().fadeIn(0.18).play();
      if (target === 'Death01') {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      u.current = target;
    }
    return;
  }

  u.phase += dt * (moving ? 9.5 : 1.6);
  const s = Math.sin(u.phase);
  if (moving) {
    u.legL.hip.rotation.x = s * 0.62;
    u.legR.hip.rotation.x = -s * 0.62;
    u.legL.knee.rotation.x = Math.max(0, -s) * 0.9 + 0.08;
    u.legR.knee.rotation.x = Math.max(0, s) * 0.9 + 0.08;
    u.armL.shoulder.rotation.x = -s * 0.5;
    u.armL.elbow.rotation.x = -0.3 - Math.max(0, -s) * 0.4;
    if (!shooting) {
      u.armR.shoulder.rotation.x = s * 0.5;
      u.armR.elbow.rotation.x = -0.3 - Math.max(0, s) * 0.4;
    }
  } else {
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
