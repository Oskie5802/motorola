// === Async loader for OBJ building assets from assets/OBJ format/ ===
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const BASE = 'assets/OBJ%20format/';
const CHAR_BASE = 'assets/kenney_animated-characters-protagonists/';

const BUILDING_NAMES = [
  'building-a', 'building-b', 'building-c', 'building-d', 'building-e',
  'building-f', 'building-g', 'building-h', 'building-i', 'building-j',
  'building-k', 'building-l', 'building-m', 'building-n',
];

const SKYSCRAPER_NAMES = [
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c',
  'building-skyscraper-d', 'building-skyscraper-e',
];

function loadOne(name) {
  return new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath(BASE);
    mtlLoader.load(name + '.mtl', (mtl) => {
      mtl.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(mtl);
      objLoader.setPath(BASE);
      objLoader.load(name + '.obj', (obj) => {
        const box = new THREE.Box3().setFromObject(obj);
        obj.userData.size = box.getSize(new THREE.Vector3());
        resolve(obj);
      }, undefined, reject);
    }, undefined, reject);
  });
}

export async function loadBuildingModels(onProgress) {
  const total = BUILDING_NAMES.length + SKYSCRAPER_NAMES.length;
  let done = 0;
  const tick = () => onProgress && onProgress(++done / total);

  const [bResults, sResults] = await Promise.all([
    Promise.allSettled(BUILDING_NAMES.map(n => loadOne(n).then(o => { tick(); return o; }))),
    Promise.allSettled(SKYSCRAPER_NAMES.map(n => loadOne(n).then(o => { tick(); return o; }))),
  ]);

  return {
    buildings:   bResults.filter(r => r.status === 'fulfilled').map(r => r.value),
    skyscrapers: sResults.filter(r => r.status === 'fulfilled').map(r => r.value),
  };
}

// === Load Kenney animated character (FBX model + animations + skin) ===
function loadFBX(url) {
  return new Promise((resolve, reject) => {
    new FBXLoader().load(url, resolve, undefined, reject);
  });
}

export async function loadCharacterModel() {
  // Load base model
  const model = await loadFBX(CHAR_BASE + 'Model/characterMedium.fbx');

  // Apply skin texture
  const texLoader = new THREE.TextureLoader();
  const skinTex = await new Promise((res, rej) => {
    texLoader.load(CHAR_BASE + 'Skins/skaterMaleA.png', res, undefined, rej);
  });
  skinTex.colorSpace = THREE.SRGBColorSpace;
  // Kenney FBX from Blender: leave flipY at default (true)

  model.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        map: skinTex,
        roughness: 0.7,
        metalness: 0.0,
      });
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Build a bone name lookup map with multiple naming conventions
  // so we can retarget animation tracks regardless of prefix differences.
  // Maps: normalized-key → actual bone name in model
  const boneNameMap = new Map();
  model.traverse(child => {
    if (!child.isBone) return;
    const n = child.name;
    boneNameMap.set(n, n);                                    // exact
    boneNameMap.set(n.replace(/^mixamorig[_:]/, ''), n);     // strip prefix
    boneNameMap.set('mixamorig:' + n, n);                    // add colon prefix
    boneNameMap.set('mixamorig_' + n, n);                    // add underscore prefix
  });

  const exactBones = [...boneNameMap.keys()].filter(k => boneNameMap.get(k) === k);
  console.log('[CharLoader] All model bone names:', exactBones);

  // Load animation clips from separate FBX files
  const animFiles = ['idle', 'run', 'jump'];
  const animations = {};
  for (const name of animFiles) {
    try {
      const animFbx = await loadFBX(CHAR_BASE + 'Animations/' + name + '.fbx');
      if (animFbx.animations && animFbx.animations.length > 0) {
        // Pick the longest clip — FBX files often contain a bind-pose clip first
        const clip = animFbx.animations.reduce((best, c) => c.duration > best.duration ? c : best, animFbx.animations[0]);
        clip.name = name;

        // Retarget: remap track node names to actual bone names in the model.
        // Handles: plain "BoneName", "mixamorig:BoneName", "Armature|BoneName", "Armature|mixamorig:BoneName"
        let remapped = 0, skipped = 0;
        for (const track of clip.tracks) {
          const dotIdx = track.name.indexOf('.');
          if (dotIdx < 0) continue;
          let nodeName = track.name.substring(0, dotIdx);
          const prop = track.name.substring(dotIdx);

          // Strip armature/object prefix separated by '|' (Blender FBX export)
          const pipeIdx = nodeName.lastIndexOf('|');
          if (pipeIdx >= 0) nodeName = nodeName.substring(pipeIdx + 1);

          if (boneNameMap.has(nodeName)) {
            const actualName = boneNameMap.get(nodeName);
            track.name = actualName + prop;
            remapped++;
          } else {
            skipped++;
          }
        }
        console.log(`[CharLoader] "${name}": ${clip.tracks.length} tracks, ${remapped} bound, ${skipped} unmatched`);

        animations[name] = clip;
      } else {
        console.warn(`[CharLoader] No animations found in ${name}.fbx`);
      }
    } catch (e) {
      console.warn('[CharLoader] Could not load animation:', name, e);
    }
  }

  console.log('[CharLoader] Loaded animations:', Object.keys(animations));
  return { model, animations };
}
