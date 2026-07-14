// Rigged GLB characters (see README credits):
//  - hero.glb                    : Quaternius Animated Base Character (CC-BY)
//  - knight/barbarian/mage/rogue : KayKit Adventurers (CC0)
//  - skeleton_*                  : KayKit Skeletons (CC0)
//  - alien/dino/ghost/yeti       : Quaternius Ultimate Monsters (CC0)
// Every model carries its own baked animation clips; clip names vary by pack,
// so each semantic action resolves against a candidate list.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  OUTFITS, SKINS, defaultCustom, toon, shade, faceCap, buildHairMesh, buildHatMesh,
} from './character.js';
import { faceTexture } from './textures.js';

const HERO_CLIPS = {
  idle: ['Rig|Idle_Loop'], run: ['Rig|Jog_Fwd_Loop'], air: ['Rig|Jump_Loop'],
  shoot: ['Rig|Pistol_Shoot'], death: ['Rig|Death01'], dance: ['Rig|Dance_Loop'],
  gunidle: ['Rig|Pistol_Aim_Neutral'],
};
const KAYKIT_CLIPS = {
  idle: ['Idle'], run: ['Running_A'], air: ['Jump_Idle'],
  shoot: ['1H_Ranged_Shooting'], death: ['Death_A'], dance: ['Cheer'],
  gunidle: ['1H_Ranged_Shooting'],
};
// monsters vary: ghosts fly, aliens bite — resolve by suffix after the '|'
const MONSTER_CLIPS = {
  idle: ['Idle', 'Flying_Idle'],
  run: ['Run', 'Fast_Flying', 'Walk'],
  air: ['Jump_Idle', 'Jump', 'Flying_Idle', 'Idle'],
  shoot: ['Shoot', 'Punch', 'Bite_Front', 'Headbutt'],
  death: ['Death'],
  dance: ['Dance', 'Wave', 'Yes'],
};

const kaykit = (file) => ({
  file, height: 1.75, clips: KAYKIT_CLIPS,
  hand: ['handslotr'], head: ['head'], dressScale: 1.15, dressY: 0.16,
  stripHandItems: true,
});
const monster = (file, height = 1.6) => ({
  file, height, clips: MONSTER_CLIPS,
  hand: ['HandR', 'Hand1R', 'LowerArmR'], head: ['Head'], dressScale: 1.2, dressY: 0.1,
  // monster hand bones run opposite to humanoid rigs: the default mount points
  // guns backward over the shoulder; identity keeps them horizontal and visible
  heldRot: [0, 0, 0],
});

export const MODEL_DEFS = {
  hero: {
    file: 'hero.glb', height: 1.8, clips: HERO_CLIPS, flip: true,
    hand: ['DEF-handR'], head: ['DEF-head'], dressScale: 0.56, dressY: 0.1,
    heroStyle: true,
  },
  knight: kaykit('knight.glb'),
  barbarian: kaykit('barbarian.glb'),
  mage: kaykit('mage.glb'),
  rogue: kaykit('rogue.glb'),
  skeleton_warrior: kaykit('skeleton_warrior.glb'),
  skeleton_mage: kaykit('skeleton_mage.glb'),
  skeleton_rogue: kaykit('skeleton_rogue.glb'),
  skeleton_minion: kaykit('skeleton_minion.glb'),
  alien: monster('alien.glb'),
  dino: monster('dino.glb', 1.7),
  ghost: monster('ghost.glb', 1.5),
  yeti: monster('yeti.glb', 1.7),
};

const store = {};       // kind -> { gltf, clips, scale, yOffset }
let loadPromise = null;

function findClip(animations, candidates) {
  for (const cand of candidates) {
    const clip = animations.find(
      (a) => a.name === cand || a.name.split('|').pop() === cand);
    if (clip) return clip;
  }
  return null;
}

function register(kind, gltf) {
  if (!gltf) return;
  const def = MODEL_DEFS[kind];
  const clips = {};
  for (const [key, candidates] of Object.entries(def.clips)) {
    const clip = findClip(gltf.animations, candidates);
    if (clip) clips[key] = clip;
  }
  // normalize height and plant feet at y=0
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const h = box.max.y - box.min.y;
  const scale = h > 0.1 ? def.height / h : 1;
  store[kind] = { gltf, clips, scale, yOffset: -box.min.y * scale };
}

export function preloadModels(baseUrl) {
  if (loadPromise) return loadPromise;
  const loader = new GLTFLoader();
  const kinds = Object.keys(MODEL_DEFS);
  loadPromise = Promise.all(
    kinds.map((k) => loader.loadAsync(baseUrl + 'models/' + MODEL_DEFS[k].file).catch(() => null)),
  ).then((results) => {
    kinds.forEach((k, i) => register(k, results[i]));
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

function findBone(root, names) {
  for (const n of names) {
    const b = root.getObjectByName(n);
    if (b) return b;
  }
  return null;
}

export function createRiggedInstance(kind, custom) {
  const entry = store[kind];
  const def = MODEL_DEFS[kind];
  if (!entry) return null;
  const c = { ...defaultCustom(), ...(custom || {}) };
  const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
  const skinColor = SKINS[c.skin % SKINS.length];

  const clone = SkeletonUtils.clone(entry.gltf.scene);
  if (def.flip) clone.rotation.y = Math.PI; // FBX-derived models face -z
  clone.scale.setScalar(entry.scale);
  clone.position.y = entry.yOffset;
  const g = new THREE.Group();
  g.add(clone);

  const suitMat = toon(outfitColor);
  const jointMat = toon(shade(outfitColor, -0.24));
  clone.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds are unreliable while animating
      const swap = (m) => {
        if (def.heroStyle) return m.name === 'M_Joints' ? jointMat : suitMat;
        // textured or color-material models: keep the authored look, cel-shade it
        return toon(m.color ? m.color.clone() : '#ffffff', {
          map: m.map || null,
          vertexColors: !!m.vertexColors,
          transparent: !!m.transparent,
          opacity: m.opacity ?? 1,
        });
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    }
  });

  // head accessories (GLTFLoader strips dots from node names)
  const headBone = findBone(clone, def.head);
  if (headBone) {
    const acc = new THREE.Group();
    if (def.heroStyle) {
      const face = faceCap(0.13, faceTexture(skinColor), [1, 1.05, 0.95]);
      face.position.y = 0.1;
      acc.add(face);
      const hair = buildHairMesh(c);
      if (hair) {
        const dress = new THREE.Group();
        dress.scale.setScalar(def.dressScale);
        dress.position.y = def.dressY;
        dress.add(hair);
        acc.add(dress);
      }
    }
    const hat = buildHatMesh(c);
    if (hat) {
      const dress = new THREE.Group();
      dress.scale.setScalar(def.dressScale);
      dress.position.y = def.dressY;
      dress.add(hat);
      acc.add(dress);
    }
    if (acc.children.length) mount(headBone, acc);
  }

  // some models ship holding their own weapons — clear the hand slots
  if (def.stripHandItems) {
    for (const slotName of ['handslotr', 'handslotl']) {
      const slot = clone.getObjectByName(slotName);
      if (slot) [...slot.children].forEach((ch) => ch.removeFromParent());
    }
  }

  // weapon mount: hand bone when the rig has one, chest-height fallback if not
  const handBone = findBone(clone, def.hand);
  const held = new THREE.Group();
  if (handBone) {
    held.rotation.set(...(def.heldRot || [Math.PI / 2, 0, 0]));
    held.position.set(0, 0.06, 0.02);
    if (!def.heroStyle) held.scale.setScalar(1 / entry.scale); // undo normalization
    mount(handBone, held);
  } else {
    held.position.set(0.32, 1.0, 0.28);
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
