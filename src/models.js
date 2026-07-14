// Rigged GLB character ("Hero"): professionally-made mesh + 45 skeletal
// animation clips by Quaternius (poly.pizza/m/cwYvO5UauX, CC-BY 3.0).
// We tint its materials to the player's outfit, attach our procedural
// hair/hats/face to the head bone, and mount weapons on the right hand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  OUTFITS, SKINS, defaultCustom, toon, shade, faceCap, buildHairMesh, buildHatMesh,
} from './character.js';
import { faceTexture } from './textures.js';

let heroGltf = null;
let loadPromise = null;

export function preloadHero(url) {
  if (!loadPromise) {
    loadPromise = new GLTFLoader().loadAsync(url).then((gltf) => {
      heroGltf = gltf;
      return gltf;
    });
  }
  return loadPromise;
}

export function heroReady() {
  return !!heroGltf;
}

export function createHeroInstance(custom) {
  if (!heroGltf) return null;
  const c = { ...defaultCustom(), ...(custom || {}) };
  const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
  const skinColor = SKINS[c.skin % SKINS.length];

  const clone = SkeletonUtils.clone(heroGltf.scene);
  clone.rotation.y = Math.PI; // model faces -z; our convention is face +z
  const g = new THREE.Group();
  g.add(clone);

  // retint with our cel-shaded materials (M_Main = suit, M_Joints = accents)
  const suitMat = toon(outfitColor);
  const jointMat = toon(shade(outfitColor, -0.24));
  clone.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds are unreliable while animating
      if (Array.isArray(o.material)) {
        o.material = o.material.map((m) => (m.name === 'M_Joints' ? jointMat : suitMat));
      } else {
        o.material = o.material.name === 'M_Joints' ? jointMat : suitMat;
      }
    }
  });

  // head accessories on the head bone (compensate for any baked bone scale)
  // note: GLTFLoader sanitizes node names, stripping the dots (hand.R -> handR)
  const headBone = clone.getObjectByName('DEF-head') || clone.getObjectByName('DEFhead');
  if (headBone) {
    const ws = new THREE.Vector3();
    headBone.getWorldScale(ws);
    const acc = new THREE.Group();
    acc.scale.setScalar(1 / (ws.x || 1));
    const face = faceCap(0.13, faceTexture(skinColor), [1, 1.05, 0.95]);
    face.position.y = 0.1;
    acc.add(face);
    const dress = new THREE.Group();
    dress.scale.setScalar(0.56); // our accessories fit a 0.25-radius head
    dress.position.y = 0.1;
    const hair = buildHairMesh(c);
    if (hair) dress.add(hair);
    const hat = buildHatMesh(c);
    if (hat) dress.add(hat);
    acc.add(dress);
    headBone.add(acc);
  }

  // weapon mount on the right hand
  const handBone = clone.getObjectByName('DEF-hand.R') || clone.getObjectByName('DEF-handR');
  const held = new THREE.Group();
  if (handBone) {
    const ws = new THREE.Vector3();
    handBone.getWorldScale(ws);
    const inv = 1 / (ws.x || 1);
    held.scale.setScalar(inv);
    held.rotation.set(Math.PI / 2, 0, 0);
    // position offset lives in bone space, so it scales with the bone too
    held.position.set(0, 0.06, 0.02).multiplyScalar(inv);
    handBone.add(held);
  } else {
    g.add(held);
  }

  const mixer = new THREE.AnimationMixer(clone);
  const actions = {};
  for (const clip of heroGltf.animations) {
    actions[clip.name.replace('Rig|', '')] = mixer.clipAction(clip);
  }

  g.userData = {
    isHero: true, mixer, actions, current: null, override: null,
    held, heldKey: null, phase: 0,
  };
  return g;
}
