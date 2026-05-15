// === Async loader for OBJ building assets from assets/OBJ format/ ===
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

const BASE = 'assets/OBJ%20format/';

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
