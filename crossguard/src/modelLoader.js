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

  // Collect all node names from the model for animation retargeting
  const modelNodeNames = new Set();
  model.traverse(child => modelNodeNames.add(child.name));
  console.log('[CharLoader] Model root name:', model.name);
  console.log('[CharLoader] Model node names:', [...modelNodeNames]);

  // Load animation clips from separate FBX files
  const animFiles = ['idle', 'run', 'jump'];
  const animations = {};
  for (const name of animFiles) {
    try {
      const animFbx = await loadFBX(CHAR_BASE + 'Animations/' + name + '.fbx');
      console.log(`[CharLoader] Anim "${name}" loaded, animations count:`, animFbx.animations?.length);
      if (animFbx.animations && animFbx.animations.length > 0) {
        const clip = animFbx.animations[0];
        clip.name = name;
        console.log(`[CharLoader] Clip "${name}" tracks (${clip.tracks.length}):`,
          clip.tracks.slice(0, 5).map(t => t.name));

        // Retarget: ensure animation track node names match the model hierarchy.
        // Bone names match (same Kenney skeleton), but root object name may differ.
        for (const track of clip.tracks) {
          const dotIdx = track.name.indexOf('.');
          if (dotIdx < 0) continue;
          const nodeName = track.name.substring(0, dotIdx);
          const rest = track.name.substring(dotIdx);
          if (!modelNodeNames.has(nodeName)) {
            const oldName = track.name;
            track.name = model.name + rest;
            console.log(`[CharLoader] Retarget: "${oldName}" → "${track.name}"`);
          }
        }

        animations[name] = clip;
      } else {
        console.warn(`[CharLoader] No animations found in ${name}.fbx`);
      }
    } catch (e) {
      console.warn('[CharLoader] Could not load animation:', name, e);
    }
  }

  console.log('[CharLoader] Final animations:', Object.keys(animations));
  return { model, animations };
}
