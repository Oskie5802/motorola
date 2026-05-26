// Asynchroniczny loader budynków
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'assets/OBJ%20format/';
const CHAR_BASE = 'assets/kenney_animated-characters-protagonists/';
const CAR_BASE = 'assets/kenney_car-kit/Models/GLB format/';
const SUBURBAN_BASE = 'assets/kenney_city-kit-suburban_20/Models/GLB format/';

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
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // Recenter geometry on X/Z (keep Y so base sits on the ground)
        // so that the model's footprint center matches its local origin.
        obj.traverse((child) => {
          if (child.isMesh && child.geometry) {
            child.geometry.translate(-center.x, -box.min.y, -center.z);
          }
        });
        obj.userData.size = size;

        // Compute a ground-level footprint (bottom 30% of the height) for the
        // collider — balconies, signs and rooftop details often extend the
        // full AABB beyond the actual wall the player runs into.
        const baseCutoff = size.y * 0.3;
        let bxmin = Infinity, bxmax = -Infinity, bzmin = Infinity, bzmax = -Infinity;
        const v = new THREE.Vector3();
        obj.traverse((child) => {
          if (!child.isMesh || !child.geometry) return;
          const pos = child.geometry.attributes.position;
          if (!pos) return;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            if (v.y > baseCutoff) continue;
            if (v.x < bxmin) bxmin = v.x;
            if (v.x > bxmax) bxmax = v.x;
            if (v.z < bzmin) bzmin = v.z;
            if (v.z > bzmax) bzmax = v.z;
          }
        });
        if (bxmin < bxmax && bzmin < bzmax) {
          obj.userData.footprint = {
            width: bxmax - bxmin,
            depth: bzmax - bzmin,
            cx: (bxmin + bxmax) / 2,
            cz: (bzmin + bzmax) / 2,
          };
        }
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

// Loadowanie wozow od Kenneya
const CAR_MODEL_DEFS = [
    // zwyklaki
  { file: 'sedan.glb',           type: 'car',    speed: 1.0, w: 1.8, h: 1.2, d: 4.0 },
  { file: 'sedan-sports.glb',    type: 'car',    speed: 1.1, w: 1.8, h: 1.2, d: 4.0 },
  { file: 'hatchback-sports.glb',type: 'car',    speed: 1.0, w: 1.7, h: 1.1, d: 3.6 },
  { file: 'suv.glb',            type: 'car',    speed: 0.9, w: 2.0, h: 1.5, d: 4.4 },
  { file: 'suv-luxury.glb',     type: 'car',    speed: 0.95,w: 2.0, h: 1.5, d: 4.4 },
  { file: 'van.glb',            type: 'car',    speed: 0.85,w: 2.0, h: 1.7, d: 4.6 },
  { file: 'taxi.glb',           type: 'car',    speed: 1.0, w: 1.8, h: 1.2, d: 4.0 },
    // pks
  { file: 'delivery.glb',       type: 'bus',    speed: 0.7, w: 2.2, h: 2.4, d: 7.0 },
    // tira
  { file: 'truck.glb',          type: 'truck',  speed: 0.65,w: 2.2, h: 2.2, d: 5.5 },
  { file: 'truck-flat.glb',     type: 'truck',  speed: 0.6, w: 2.2, h: 2.0, d: 6.0 },
  { file: 'garbage-truck.glb',  type: 'truck',  speed: 0.55,w: 2.2, h: 2.4, d: 6.0 },
    // sluzby
  { file: 'police.glb',         type: 'emergency', speed: 1.2, w: 1.8, h: 1.2, d: 4.0 },
  { file: 'ambulance.glb',      type: 'emergency', speed: 1.1, w: 2.0, h: 1.8, d: 4.8 },
  { file: 'firetruck.glb',      type: 'emergency', speed: 0.9, w: 2.2, h: 2.4, d: 7.0 },
];

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });
}

export async function loadCarModels(onProgress) {
  const results = {};
  let done = 0;
  const total = CAR_MODEL_DEFS.length;

  for (const def of CAR_MODEL_DEFS) {
    try {
      const gltf = await loadGLB(CAR_BASE + def.file);
      const model = gltf.scene;
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
            // Oblicz rozmiar hitboxa po wgraniu
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      results[def.file] = { model, size, def };
    } catch (e) {
      console.warn('[CarLoader] Failed to load', def.file, e);
    }
    done++;
    if (onProgress) onProgress(done / total);
  }

  console.log('[CarLoader] Loaded', Object.keys(results).length, 'car models');
  return results;
}

const SUBURBAN_NAMES = [
  'building-type-a', 'building-type-b', 'building-type-c', 'building-type-d',
  'building-type-e', 'building-type-f', 'building-type-g', 'building-type-h',
  'building-type-i', 'building-type-j', 'building-type-k', 'building-type-l',
  'building-type-m', 'building-type-n', 'building-type-o', 'building-type-p',
  'building-type-q', 'building-type-r', 'building-type-s', 'building-type-t',
  'building-type-u',
];

export async function loadSuburbanModels(onProgress) {
  const results = [];
  let done = 0;
  const total = SUBURBAN_NAMES.length;
  for (const name of SUBURBAN_NAMES) {
    try {
      const gltf = await loadGLB(SUBURBAN_BASE + name + '.glb');
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      model.userData.size = box.getSize(new THREE.Vector3());
      model.userData.yOffset = -box.min.y;
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      results.push(model);
    } catch (e) {
      console.warn('[SuburbanLoader] Failed:', name, e);
    }
    done++;
    if (onProgress) onProgress(done / total);
  }
  console.log('[SuburbanLoader] Loaded', results.length, 'suburban models');
  return results;
}

// Wgranie ludzika fbx
function loadFBX(url) {
  return new Promise((resolve, reject) => {
    new FBXLoader().load(url, resolve, undefined, reject);
  });
}

export async function loadCharacterModel() {
    // laduj siatke i kosci
  const model = await loadFBX(CHAR_BASE + 'Model/characterMedium.fbx');

    // nalepka ze skina
  const texLoader = new THREE.TextureLoader();
  const skinTex = await new Promise((res, rej) => {
    texLoader.load(CHAR_BASE + 'Skins/skaterMaleA.png', res, undefined, rej);
  });
  skinTex.colorSpace = THREE.SRGBColorSpace;
    // z blendera wypluwa fbx'a bez flipY wiec zostawiamy

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

    // robimy mape kosci dla animacji bo moga sie inaczej nazywac w zaleznosci co wgrasz
    // ten kod to zlosliwy hack na FBXa od Kenneya
    // np. klucz -> prawdziwa kosc
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

    // wyciagamy osobno same animacje z fbx
  const animFiles = ['idle', 'run', 'jump'];
  const animations = {};
  for (const name of animFiles) {
    try {
      const animFbx = await loadFBX(CHAR_BASE + 'Animations/' + name + '.fbx');
      if (animFbx.animations && animFbx.animations.length > 0) {
                // bierz najdluzsza animacje (ignorujemy t-pose)
        const clip = animFbx.animations.reduce((best, c) => c.duration > best.duration ? c : best, animFbx.animations[0]);
        clip.name = name;

                // tutaj mapujemy nazwy animacji na nasz rig
                // parsowanie tego paskudnego formatu nazw
        let remapped = 0, skipped = 0;
        for (const track of clip.tracks) {
          const dotIdx = track.name.indexOf('.');
          if (dotIdx < 0) continue;
          let nodeName = track.name.substring(0, dotIdx);
          const prop = track.name.substring(dotIdx);

                    // wycinamy prefiksy z blendera
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
