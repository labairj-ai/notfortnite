// Rigged GLB characters:
//  - hero.glb : Quaternius "Animated Base Character" — mannequin + clips (CC-BY)
//  - knight/barbarian/mage/rogue.glb : KayKit Adventurers (CC0) — fully clothed,
//    textured, each with its own baked animation clips and handslot bones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  OUTFITS, SKINS, defaultCustom, toon, shade, faceCap, buildHairMesh, buildHatMesh,
} from './character.js';
import { faceTexture } from './textures.js';

// semantic clip names per rig family
const HERO_CLIPS = {
  idle: 'Rig|Idle_Loop',
  run: 'Rig|Jog_Fwd_Loop',
  air: 'Rig|Jump_Loop',
  shoot: 'Rig|Pistol_Shoot',
  death: 'Rig|Death01',
  dance: 'Rig|Dance_Loop',
};
const KAYKIT_CLIPS = {
  idle: 'Idle',
  run: 'Running_A',
  air: 'Jump_Idle',
  shoot: '1H_Ranged_Shooting',
  death: 'Death_A',
  dance: 'Cheer',
};

export const KAYKIT_KINDS = ['knight', 'barbarian', 'mage', 'rogue'];

const store = {};       // kind -> { gltf, clips: {semantic->AnimationClip}, scale }
let loadPromise = null;

function register(kind, gltf, clipMap, targetHeight) {
  if (!gltf) return;
  const clips = {};
  for (const [key, name] of Object.entries(clipMap)) {
    const clip = gltf.animations.find((a) => a.name === name);
    if (clip) clips[key] = clip;
  }
  // normalize height so every character matches the game's ~1.8m collision
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const h = box.max.y - box.min.y;
  const scale = h > 0.1 ? targetHeight / h : 1;
  store[kind] = { gltf, clips, scale };
}

export function preloadModels(baseUrl) {
  if (loadPromise) return loadPromise;
  const loader = new GLTFLoader();
  const load = (f) => loader.loadAsync(baseUrl + 'models/' + f).catch(() => null);
  loadPromise = Promise.all([
    load('hero.glb'), load('knight.glb'), load('barbarian.glb'), load('mage.glb'), load('rogue.glb'),
  ]).then(([hero, knight, barbarian, mage, rogue]) => {
    register('hero', hero, HERO_CLIPS, 1.8);
    register('knight', knight, KAYKIT_CLIPS, 1.75);
    register('barbarian', barbarian, KAYKIT_CLIPS, 1.75);
    register('mage', mage, KAYKIT_CLIPS, 1.75);
    register('rogue', rogue, KAYKIT_CLIPS, 1.75);
    return store;
  });
  return loadPromise;
}

export function modelReady(kind) {
  return !!store[kind];
}

function mount(bone, obj) {
  const ws = new THREE.Vector3();
  bone.getWorldScale(ws);
  const inv = 1 / (ws.x || 1);
  obj.scale.multiplyScalar(inv);
  obj.position.multiplyScalar(inv);
  bone.add(obj);
}

export function createRiggedInstance(kind, custom) {
  const entry = store[kind];
  if (!entry) return null;
  const c = { ...defaultCustom(), ...(custom || {}) };
  const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
  const skinColor = SKINS[c.skin % SKINS.length];
  const isHeroKind = kind === 'hero';

  const clone = SkeletonUtils.clone(entry.gltf.scene);
  // the FBX-derived hero faces -z; our convention is face +z
  if (isHeroKind) clone.rotation.y = Math.PI;
  clone.scale.setScalar(entry.scale);
  const g = new THREE.Group();
  g.add(clone);

  const suitMat = toon(outfitColor);
  const jointMat = toon(shade(outfitColor, -0.24));
  clone.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds are unreliable while animating
      const swap = (m) => {
        if (isHeroKind) return m.name === 'M_Joints' ? jointMat : suitMat;
        // textured models: keep the authored atlas, cel-shade it
        return toon('#ffffff', { map: m.map || null });
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    }
  });

  // head accessories (GLTFLoader strips dots from node names: hand.R -> handR)
  const headBone = clone.getObjectByName(isHeroKind ? 'DEF-head' : 'head');
  if (headBone) {
    const acc = new THREE.Group();
    if (isHeroKind) {
      // the mannequin gets our procedural face + hair; KayKit heads are complete
      const face = faceCap(0.13, faceTexture(skinColor), [1, 1.05, 0.95]);
      face.position.y = 0.1;
      acc.add(face);
      const hair = buildHairMesh(c);
      if (hair) {
        const dress = new THREE.Group();
        dress.scale.setScalar(0.56);
        dress.position.y = 0.1;
        dress.add(hair);
        acc.add(dress);
      }
    }
    const hat = buildHatMesh(c);
    if (hat) {
      const dress = new THREE.Group();
      dress.scale.setScalar(isHeroKind ? 0.56 : 1.15);
      dress.position.y = isHeroKind ? 0.1 : 0.16;
      dress.add(hat);
      acc.add(dress);
    }
    if (acc.children.length) mount(headBone, acc);
  }

  // KayKit models ship holding their own weapons (swords/axes) parented to
  // the hand slots — remove them so our pickaxe/guns take their place
  if (!isHeroKind) {
    for (const slotName of ['handslotr', 'handslotl']) {
      const slot = clone.getObjectByName(slotName);
      if (slot) [...slot.children].forEach((ch) => ch.removeFromParent());
    }
  }

  // weapon mount: KayKit rigs have a dedicated right-hand item slot
  const handBone = clone.getObjectByName(isHeroKind ? 'DEF-handR' : 'handslotr');
  const held = new THREE.Group();
  if (handBone) {
    held.rotation.set(Math.PI / 2, 0, 0);
    held.position.set(0, 0.06, 0.02);
    if (!isHeroKind) held.scale.setScalar(1 / entry.scale); // undo body normalization
    mount(handBone, held);
  } else {
    g.add(held);
  }

  const mixer = new THREE.AnimationMixer(clone);
  const actions = {};
  for (const [key, clip] of Object.entries(entry.clips)) {
    actions[key] = mixer.clipAction(clip);
  }

  g.userData = {
    isHero: true, mixer, actions, current: null, override: null,
    held, heldKey: null, phase: 0,
  };
  return g;
}
