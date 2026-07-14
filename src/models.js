// Rigged GLB characters by Quaternius (CC0/CC-BY, see README credits):
//  - hero.glb   : Animated Base Character — mannequin + 45 clips (Rigify DEF-* rig)
//  - male.glb   : Universal Base Characters Superhero Male (UE-style rig, textured)
//  - female.glb : Universal Base Characters Superhero Female (UE-style rig, textured)
// The male/female rigs have no clips of their own; we retarget the hero's
// rotation tracks onto them via a bone-name map.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  OUTFITS, SKINS, defaultCustom, toon, shade, faceCap, buildHairMesh, buildHatMesh,
} from './character.js';
import { faceTexture } from './textures.js';

// semantic clip set used by the game (hero clip names, 'Rig|' stripped)
const CLIPS = {
  idle: 'Idle_Loop',
  run: 'Jog_Fwd_Loop',
  air: 'Jump_Loop',
  shoot: 'Pistol_Shoot',
  death: 'Death01',
  dance: 'Dance_Loop',
};

// Rigify (hero, names sanitized by GLTFLoader: dots stripped) -> UE-style (UBC)
function rigifyToUE() {
  const map = { root: 'root', 'DEF-hips': 'pelvis', 'DEF-neck': 'neck_01', 'DEF-head': 'Head' };
  for (let i = 1; i <= 3; i++) map[`DEF-spine00${i}`] = `spine_0${i}`;
  for (const [s, t] of [['L', 'l'], ['R', 'r']]) {
    map[`DEF-shoulder${s}`] = `clavicle_${t}`;
    map[`DEF-upper_arm${s}`] = `upperarm_${t}`;
    map[`DEF-forearm${s}`] = `lowerarm_${t}`;
    map[`DEF-hand${s}`] = `hand_${t}`;
    map[`DEF-thigh${s}`] = `thigh_${t}`;
    map[`DEF-shin${s}`] = `calf_${t}`;
    map[`DEF-foot${s}`] = `foot_${t}`;
    map[`DEF-toe${s}`] = `ball_${t}`;
    for (const [f, uf] of [['f_index', 'index'], ['f_middle', 'middle'], ['f_pinky', 'pinky'], ['f_ring', 'ring'], ['thumb', 'thumb']]) {
      for (let i = 1; i <= 3; i++) map[`DEF-${f}0${i}${s}`] = `${uf}_0${i}_${t}`;
    }
  }
  return map;
}

// clone a clip keeping only rotation tracks, renaming bones via the map
function retargetByName(clip, nameMap) {
  const tracks = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const node = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    if (prop !== 'quaternion') continue; // rotations only; positions are rig-scale-specific
    const target = nameMap[node];
    if (!target) continue;
    const t2 = track.clone();
    t2.name = `${target}.${prop}`;
    tracks.push(t2);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

const store = {
  hero: null, male: null, female: null, hairLong: null,
  heroClips: {},         // semantic -> clip (DEF rig)
  ueClips: {},           // semantic -> retargeted clip (UE rig)
};
let loadPromise = null;

export function preloadModels(baseUrl) {
  if (loadPromise) return loadPromise;
  const loader = new GLTFLoader();
  loadPromise = Promise.all([
    loader.loadAsync(baseUrl + 'models/hero.glb'),
    loader.loadAsync(baseUrl + 'models/male.glb').catch(() => null),
    loader.loadAsync(baseUrl + 'models/female.glb').catch(() => null),
    loader.loadAsync(baseUrl + 'models/hair_long.glb').catch(() => null),
  ]).then(([hero, male, female, hairLong]) => {
    store.hero = hero;
    store.male = male;
    store.female = female;
    store.hairLong = hairLong;
    for (const [key, name] of Object.entries(CLIPS)) {
      const clip = hero.animations.find((a) => a.name === 'Rig|' + name);
      if (!clip) continue;
      store.heroClips[key] = clip;
      store.ueClips[key] = retargetByName(clip, rigifyToUE());
    }
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
  const gltf = store[kind];
  if (!gltf) return null;
  const c = { ...defaultCustom(), ...(custom || {}) };
  const outfitColor = OUTFITS[c.outfit % OUTFITS.length];
  const skinColor = SKINS[c.skin % SKINS.length];

  const isHeroKind = kind === 'hero';
  const clone = SkeletonUtils.clone(gltf.scene);
  // the FBX-derived hero faces -z; the Blender-exported UBC models face +z
  if (isHeroKind) clone.rotation.y = Math.PI;
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
        // textured UBC models: keep the authored map, cel-shade it
        return toon('#ffffff', { map: m.map || null });
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    }
  });

  // head accessories (GLTFLoader strips dots from bone names: hand.R -> handR)
  const headBone = clone.getObjectByName(isHeroKind ? 'DEF-head' : 'Head');
  if (headBone) {
    const acc = new THREE.Group();
    if (isHeroKind) {
      // the mannequin gets our procedural face + hair; UBC models have real ones
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
      dress.scale.setScalar(isHeroKind ? 0.56 : 0.9);
      dress.position.y = isHeroKind ? 0.1 : 0.09;
      dress.add(hat);
      acc.add(dress);
    }
    if (acc.children.length) mount(headBone, acc);
  }

  // the female base model ships bald; give her the pack's long hairstyle
  // ("origin at 0" mesh authored in place — attach() keeps its world pose)
  if (kind === 'female' && store.hairLong && headBone) {
    const hair = store.hairLong.scene.clone(true);
    hair.traverse((o) => {
      if (o.isMesh) o.material = toon('#ffffff', { map: o.material.map || null });
    });
    clone.updateMatrixWorld(true);
    clone.add(hair);
    headBone.attach(hair);
  }

  // weapon mount on the right hand
  const handBone = clone.getObjectByName(isHeroKind ? 'DEF-handR' : 'hand_r');
  const held = new THREE.Group();
  if (handBone) {
    held.rotation.set(Math.PI / 2, 0, 0);
    held.position.set(0, 0.06, 0.02);
    mount(handBone, held);
  } else {
    g.add(held);
  }

  const mixer = new THREE.AnimationMixer(clone);
  const clips = isHeroKind ? store.heroClips : store.ueClips;
  const actions = {};
  for (const [key, clip] of Object.entries(clips)) {
    actions[key] = mixer.clipAction(clip);
  }

  g.userData = {
    isHero: true, mixer, actions, current: null, override: null,
    held, heldKey: null, phase: 0,
  };
  return g;
}
