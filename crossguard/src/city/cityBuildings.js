import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import { settings } from '../core/settings.js';

export function _buildBuildings(cx, cz, area) {
  // Pomijamy zbyt male bloki
  if (area < 9.5) {
    if (Math.random() > 0.4) {
      this._spawnBench(cx, cz);
    }
    return;
  }

  const hasModels =
    this.models &&
    (this.models.buildings.length > 0 ||
      this.models.skyscrapers.length > 0);
  if (hasModels) {
    this._buildBuildingsFromModels(cx, cz, area);
  } else {
    this._buildBuildingsSimple(cx, cz, area);
  }
}

export function _buildBuildingsFromModels(cx, cz, area) {
  const isDowntown = this.zone.id === "downtown";
  const BUILDING_SCALE = 10.0;
  const GAP = 0.8;
  // Spawning up to 4 buildings if block size allows it, to pack space with uniform buildings.
  const maxCount = area >= 32 ? 4 : (area >= 18 ? 2 : 1);

  const placed = [];
  const hasShadows = settings.current.shadows;

  for (let i = 0; i < maxCount; i++) {
    const useSkyscraper =
      isDowntown &&
      Math.random() > 0.45 &&
      this.models.skyscrapers.length > 0;
    const pool = useSkyscraper
      ? this.models.skyscrapers
      : this.models.buildings;
    if (!pool.length) continue;

    // Filter the pool for templates that fit at the uniform scale
    let poolToUse = pool.filter(t => {
      const nativeSize = t.userData.size;
      if (!nativeSize || nativeSize.y < 0.01) return false;
      const actualW = nativeSize.x * BUILDING_SCALE;
      const actualD = nativeSize.z * BUILDING_SCALE;
      return actualW <= area && actualD <= area;
    });

    let fitScale = BUILDING_SCALE;
    let template;

    if (poolToUse.length > 0) {
      template = poolToUse[Math.floor(Math.random() * poolToUse.length)];
    } else {
      // Fallback: pick any template and scale it down to fit
      template = pool[Math.floor(Math.random() * pool.length)];
      const nativeSize = template.userData.size;
      const biggerNative = Math.max(nativeSize.x, nativeSize.z);
      fitScale = area / biggerNative;
    }

    const nativeSize = template.userData.size;
    let actualW = nativeSize.x * fitScale;
    let actualD = nativeSize.z * fitScale;
    if (actualW > area || actualD > area) {
      const sf = Math.min(area / actualW, area / actualD);
      fitScale *= sf;
      actualW *= sf;
      actualD *= sf;
    }

    // Pick rotation first so we can compute the rotated footprint for the collider.
    const rotationY = Math.floor(Math.random() * 4) * (Math.PI / 2);
    const swapAxes = Math.abs(Math.sin(rotationY)) > 0.5; // 90° or 270° swaps W/D

    // Collider uses the ground-level footprint (excludes balconies / rooftop details)
    // when available, falling back to the full AABB otherwise.
    const fp = template.userData.footprint;
    const collW = (fp ? fp.width : nativeSize.x) * fitScale;
    const collD = (fp ? fp.depth : nativeSize.z) * fitScale;
    const collOffsetX = (fp ? fp.cx : 0) * fitScale;
    const collOffsetZ = (fp ? fp.cz : 0) * fitScale;
    // Rotate the footprint offset by rotationY (0/90/180/270).
    const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
    const rotCollOffX = collOffsetX * cos + collOffsetZ * sin;
    const rotCollOffZ = -collOffsetX * sin + collOffsetZ * cos;
    const footW = swapAxes ? collD : collW;
    const footD = swapAxes ? collW : collD;

    const maxOffX = Math.max(0, (area - footW) / 2);
    const maxOffZ = Math.max(0, (area - footD) / 2);

    let offX = 0, offZ = 0, fits = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      // Smart packing strategy: try placing in corners first for the first 4 attempts
      if (maxCount > 1 && attempt < 4) {
        const signX = (attempt % 2 === 0) ? -1 : 1;
        const signZ = (attempt < 2) ? -1 : 1;
        offX = signX * maxOffX * 0.8;
        offZ = signZ * maxOffZ * 0.8;
      } else {
        offX = (Math.random() - 0.5) * 2 * maxOffX;
        offZ = (Math.random() - 0.5) * 2 * maxOffZ;
      }
      const fx = cx + offX + rotCollOffX;
      const fz = cz + offZ + rotCollOffZ;
      const b = {
        x1: fx - footW / 2 - GAP,
        z1: fz - footD / 2 - GAP,
        x2: fx + footW / 2 + GAP,
        z2: fz + footD / 2 + GAP,
      };
      const overlaps = placed.some(
        (p) =>
          b.x1 < p.x2 &&
          b.x2 > p.x1 &&
          b.z1 < p.z2 &&
          b.z2 > p.z1,
      );
      if (!overlaps) {
        fits = true;
        break;
      }
    }
    if (!fits) continue;

    const obj = template.clone(true);
    obj.scale.set(fitScale, fitScale, fitScale);
    obj.rotation.y = rotationY;

    obj.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = hasShadows;
        child.receiveShadow = hasShadows;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (!m || m.userData.__cgLit) continue;
          if (m.map) {
            m.emissiveMap = m.map;
            m.emissive = new THREE.Color(0xffffff);
            if ('emissiveIntensity' in m) m.emissiveIntensity = this.isNight ? 0.55 : 0.15;
          } else {
            m.emissive = new THREE.Color(m.color || 0xffffff);
            if ('emissiveIntensity' in m) m.emissiveIntensity = this.isNight ? 0.4 : 0.1;
          }
          m.userData.__cgLit = true;
          m.needsUpdate = true;
        }
      }
    });

    const h = nativeSize.y * fitScale;
    let mesh;
    if (settings.current.lod) {
      const lod = new THREE.LOD();
      
      // Detailed level (0m to 120m)
      lod.addLevel(obj, 0);
      obj.position.set(0, 0, 0);
      obj.rotation.y = 0; // reset local rotation as LOD will carry it
      
      // Low-poly level (120m+)
      const fallbackMat = new THREE.MeshStandardMaterial({
        color: 0x7a8296,
        roughness: 0.8,
        metalness: 0.1,
      });
      // Fallback box is added inside the rotated LOD group, so use pre-rotation dims.
      const fallbackBldg = new THREE.Mesh(new THREE.BoxGeometry(actualW, h, actualD), fallbackMat);
      fallbackBldg.position.y = h / 2;
      fallbackBldg.castShadow = hasShadows;
      fallbackBldg.receiveShadow = hasShadows;
      
      const lowPolyGroup = new THREE.Group();
      lowPolyGroup.add(fallbackBldg);
      
      lod.addLevel(lowPolyGroup, 120);
      lod.position.set(cx + offX, 0.12, cz + offZ);
      lod.rotation.y = rotationY;
      
      this.scene.add(lod);
      mesh = lod;
    } else {
      obj.position.set(cx + offX, 0.12, cz + offZ);
      this.scene.add(obj);
      mesh = obj;
    }

    mesh.userData.height = h;

    const fx = cx + offX + rotCollOffX;
    const fz = cz + offZ + rotCollOffZ;
    const box = {
      x1: fx - footW / 2,
      z1: fz - footD / 2,
      x2: fx + footW / 2,
      z2: fz + footD / 2,
      mesh: mesh
    };
    placed.push(box);
    this.buildings.push(box);
  }

  if (Math.random() > 0.3) this._addStreetFurniture(cx, cz, area);
}

export function _buildBuildingsSimple(cx, cz, area) {
  const palette = PALETTE.building;
  const count = 1 + Math.floor(Math.random() * 3);
  const slot = area / Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const w = slot * (0.5 + Math.random() * 0.45);
    const d = slot * (0.5 + Math.random() * 0.45);
    const h =
      6 +
      Math.random() * 14 * (this.zone.id === "downtown" ? 1.8 : 1);
    const offX = (Math.random() - 0.5) * (area - w);
    const offZ = (Math.random() - 0.5) * (area - d);
    const col = palette[Math.floor(Math.random() * palette.length)];

    const group = new THREE.Group();
    group.position.set(cx + offX, 0.12, cz + offZ);
    this.scene.add(group);

    const mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.78,
      metalness: 0.08,
    });
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    bldg.position.set(0, h / 2, 0);
    bldg.castShadow = this.castShadows;
    bldg.receiveShadow = this.receiveShadows;
    group.add(bldg);

    // Cokol (ciemniejszy parter)
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.03, 1.5, d * 1.03),
      new THREE.MeshStandardMaterial({
        color: 0x3a4150,
        roughness: 0.7,
      }),
    );
    base.position.set(0, 0.75, 0);
    base.receiveShadow = this.receiveShadows;
    group.add(base);

    // Gzyms na gorze
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.05, 0.25, d * 1.05),
      new THREE.MeshStandardMaterial({
        color: 0x2a3040,
        roughness: 0.6,
      }),
    );
    cornice.position.set(0, h, 0);
    group.add(cornice);

    this._addWindows(bldg, w, h, d);

    // Dach
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.7, 0.8, d * 0.7),
      new THREE.MeshStandardMaterial({
        color: 0x3a404c,
        roughness: 0.7,
      }),
    );
    roof.position.set(0, h + 0.4, 0);
    group.add(roof);

    // Klimatyzator na dachu
    if (Math.random() > 0.4) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.6, 0.8),
        new THREE.MeshStandardMaterial({
          color: 0x8a8e96,
          roughness: 0.5,
          metalness: 0.4,
        }),
      );
      ac.position.set(
        (Math.random() - 0.5) * w * 0.4,
        h + 1.1,
        (Math.random() - 0.5) * d * 0.4,
      );
      group.add(ac);
    }

    // Antena dla wyzszych budynkow
    if (h > 14 && Math.random() > 0.5) {
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 3),
        new THREE.MeshStandardMaterial({
          color: 0xcc2233,
          emissive: 0x551111,
        }),
      );
      ant.position.set(0, h + 2.3, 0);
      group.add(ant);
    }

    group.userData.height = h;

    this.buildings.push({
      x1: cx + offX - w / 2,
      z1: cz + offZ - d / 2,
      x2: cx + offX + w / 2,
      z2: cz + offZ + d / 2,
      mesh: group
    });
  }

  if (Math.random() > 0.3) this._addStreetFurniture(cx, cz, area);
}

export function _addBlockTrees(cx, cz, sidewalkW, sidewalkD) {
  const trunkMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x2a1c0e : 0x5b3a1d,
    roughness: 0.9,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x142820 : 0x4a8a3f,
    roughness: 0.85,
  });
  const treeR = 1.4;
  const halfX = sidewalkW / 2 - treeR;
  const halfZ = sidewalkD / 2 - treeR;
  if (halfX < 0.5 || halfZ < 0.5) return;
  const plantable = Math.max(0, halfX * 2) * Math.max(0, halfZ * 2);
  let target = Math.min(10, Math.max(2, Math.round(plantable / 14)));
  if (settings.current.quality === 'low') {
    target = Math.max(1, Math.round(target * 0.3));
  }
  let placed = 0;
  for (let attempt = 0; attempt < target * 6 && placed < target; attempt++) {
    const tx = cx + (Math.random() - 0.5) * 2 * halfX;
    const tz = cz + (Math.random() - 0.5) * 2 * halfZ;
    if (this.collidesBuilding(tx, tz, 1.2)) continue;
    this._spawnTree(tx, tz, trunkMat, leafMat);
    placed++;
  }
}

export function _spawnTree(tx, tz, trunkMat, leafMat) {
  const isLow = settings.current.quality === 'low';
  const group = new THREE.Group();
  group.position.set(tx, 0, tz);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 1.6, isLow ? 5 : 8),
    trunkMat,
  );
  trunk.position.y = 0.92;
  trunk.castShadow = this.castShadows;
  group.add(trunk);
  const r = 0.9 + Math.random() * 0.5;
  const leaves = new THREE.Mesh(
    new THREE.IcosahedronGeometry(r, isLow ? 0 : 1),
    leafMat,
  );
  leaves.position.y = 2.3;
  leaves.castShadow = this.castShadows;
  group.add(leaves);
  if (!isLow) {
    const leaves2 = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r * 0.65, 1),
      leafMat,
    );
    leaves2.position.set(0.4, 2.6, -0.3);
    group.add(leaves2);
  }

  this.scene.add(group);
  this.trees.push({ x: tx, z: tz, mesh: group });
}

export function _addStreetFurniture(cx, cz, area) {
  const trunkMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x2a1c0e : 0x5b3a1d,
    roughness: 0.9,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x142820 : 0x4a8a3f,
    roughness: 0.85,
  });
  const isLow = settings.current.quality === 'low';
  let trees = 1 + Math.floor(Math.random() * 3);
  if (isLow) {
    trees = Math.random() < 0.4 ? 1 : 0;
  }
  for (let i = 0; i < trees; i++) {
    const tx = cx + (Math.random() - 0.5) * area * 0.95;
    const tz = cz + (Math.random() - 0.5) * area * 0.95;
    if (this.collidesBuilding(tx, tz, 1)) continue;
    this._spawnTree(tx, tz, trunkMat, leafMat);
  }

  // Lawka
  const benchChance = isLow ? 0.15 : 0.55;
  if (Math.random() < benchChance) {
    const bx = cx + (Math.random() - 0.5) * area * 0.7;
    const bz = cz + (Math.random() - 0.5) * area * 0.7;
    if (!this.collidesBuilding(bx, bz, 1)) {
      this._spawnBench(bx, bz);
    }
  }
}

export function _spawnBench(bx, bz) {
  const group = new THREE.Group();
  group.position.set(bx, 0, bz);

  const benchMat = new THREE.MeshStandardMaterial({
    color: 0x6a4a2c,
    roughness: 0.7,
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f38,
    metalness: 0.4,
  });
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.1, 0.5),
    benchMat,
  );
  seat.position.y = 0.5;
  seat.castShadow = this.castShadows;
  group.add(seat);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.5, 0.08),
    benchMat,
  );
  back.position.set(0, 0.8, -0.21);
  group.add(back);
  for (const sx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.5, 0.4),
      legMat,
    );
    leg.position.set(sx, 0.25, 0);
    group.add(leg);
  }

  this.scene.add(group);
  this.benches.push({ x: bx, z: bz, mesh: group });
}

export function _addWindows(parent, w, h, d) {
  if (settings.current.quality === 'low') return;
  const winMat = this.isNight
    ? new THREE.MeshStandardMaterial({
      color: 0xffe9a8,
      emissive: 0xffd07a,
      emissiveIntensity: 1.1,
      roughness: 0.4,
    })
    : new THREE.MeshStandardMaterial({
      color: 0x9bc3e6,
      roughness: 0.15,
      metalness: 0.7,
      emissive: 0x1a2a3a,
      emissiveIntensity: 0.15,
    });
  const rows = Math.floor(h / 2.4);
  const cols = Math.max(1, Math.floor(w / 2.0));
  const sz = 0.6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() > 0.7) continue;
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(sz, sz),
        winMat,
      );
      win.position.set(
        -w / 2 + (c + 0.5) * (w / cols),
        -h / 2 + 1.5 + r * 2.4,
        d / 2 + 0.02,
      );
      parent.add(win);
      const winB = win.clone();
      winB.position.z = -d / 2 - 0.02;
      winB.rotation.y = Math.PI;
      parent.add(winB);
    }
  }
}

export function _buildGhostIslands() {
  const half = this.size / 2;
  const count = 30; // 30 distant islands

  const ghostRockMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x0f1b2b : 0x22354f,
    roughness: 0.9,
    metalness: 0.1,
  });
  const ghostGrassMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x0c252b : 0x2d5a5e,
    roughness: 0.95,
  });
  const ghostRoofMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x3d1515 : 0x733333,
    roughness: 0.8,
  });
  const winMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.8,
  });

  this.ghostBuildings = [];

  for (let k = 0; k < count; k++) {
    const angle = (k / count) * Math.PI * 2 + Math.random() * 0.1;
    const dist = half + 45 + Math.random() * 220;
    
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;
    
    // Floating height: some are higher, some are lower
    const by = -20 + (Math.random() - 0.5) * 60; // y between -50 and 10
    
    const iw = 14 + Math.random() * 18; // width of island
    const id = 14 + Math.random() * 18; // depth of island
    const ih = 6 + Math.random() * 10;  // rock thickness
    
    const group = new THREE.Group();
    group.position.set(bx, by, bz);

    // 1. Grass top (flat box)
    const topGeo = new THREE.BoxGeometry(iw, 0.4, id);
    const topMesh = new THREE.Mesh(topGeo, ghostGrassMat);
    topMesh.position.y = 0.2;
    group.add(topMesh);

    // 2. Rock base (inverted cone for tapered look)
    const baseGeo = new THREE.ConeGeometry(iw * 0.6, ih, 5);
    const baseMesh = new THREE.Mesh(baseGeo, ghostRockMat);
    baseMesh.rotation.x = Math.PI;
    baseMesh.position.y = -ih / 2;
    group.add(baseMesh);

    // 3. Stalactites (smaller cones hanging below)
    const numStalactites = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < numStalactites; s++) {
      const sw = 1 + Math.random() * 2.5;
      const sh = 2 + Math.random() * 5;
      const stalGeo = new THREE.ConeGeometry(sw, sh, 4);
      const stal = new THREE.Mesh(stalGeo, ghostRockMat);
      stal.rotation.x = Math.PI;
      
      const ox = (Math.random() - 0.5) * iw * 0.5;
      const oz = (Math.random() - 0.5) * id * 0.5;
      stal.position.set(ox, -ih - sh/2 + 0.5, oz);
      group.add(stal);
    }

    // 4. Houses on top of the island
    const suburbanPool = this.models && this.models.suburban && this.models.suburban.length > 0
      ? this.models.suburban : null;
    const houseCount = 1 + Math.floor(Math.random() * 2); // 1-2 houses per island
    for (let h = 0; h < houseCount; h++) {
      const hx = (Math.random() - 0.5) * (iw - 8);
      const hz = (Math.random() - 0.5) * (id - 8);
      const rotY = Math.floor(Math.random() * 4) * (Math.PI / 2);

      if (suburbanPool) {
        const template = suburbanPool[Math.floor(Math.random() * suburbanPool.length)];
        const obj = template.clone(true);
        const nativeSize = template.userData.size || new THREE.Vector3(4, 4, 4);
        const yOffset = template.userData.yOffset || 0;
        const targetH = 3 + Math.random() * 2;
        const s = nativeSize.y > 0.01 ? targetH / nativeSize.y : 1;
        obj.scale.set(s, s, s);
        obj.rotation.y = rotY;
        obj.position.set(hx, 0.4 + yOffset * s, hz);
        obj.traverse(child => {
          if (child.isMesh) {
            child.castShadow = this.castShadows;
            child.receiveShadow = this.receiveShadows;
          }
        });
        group.add(obj);
      } else {
        const cw = 2 + Math.random() * 1.5;
        const ch = 2 + Math.random() * 1.5;
        const house = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cw), ghostRockMat);
        house.position.set(hx, 0.4 + ch / 2, hz);
        group.add(house);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(cw * 0.8, 1.2, 4), ghostRoofMat);
        roof.position.set(hx, 0.4 + ch + 0.6, hz);
        roof.rotation.y = Math.PI / 4;
        group.add(roof);
        if (Math.random() < 0.8) {
          const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), winMat);
          dot.position.set(hx, 0.4 + ch / 2, hz + cw / 2 + 0.02);
          group.add(dot);
        }
      }
    }

    // Spawn a few small trees
    const numTrees = 2 + Math.floor(Math.random() * 4);
    for (let t = 0; t < numTrees; t++) {
      const th = 2 + Math.random() * 3.5;
      const tr = 0.8 + Math.random() * 1.2;
      
      const treeGroup = new THREE.Group();
      const ox = (Math.random() - 0.5) * iw * 0.7;
      const oz = (Math.random() - 0.5) * id * 0.7;
      treeGroup.position.set(ox, 0.4, oz);

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.0, 4);
      const trunk = new THREE.Mesh(trunkGeo, ghostRockMat);
      trunk.position.y = 0.5;
      treeGroup.add(trunk);

      // Leaves
      const leavesGeo = new THREE.ConeGeometry(tr, th, 4);
      const leaves = new THREE.Mesh(leavesGeo, ghostGrassMat);
      leaves.position.y = 1.0 + th/2;
      treeGroup.add(leaves);

      group.add(treeGroup);
    }

    this.scene.add(group);
    
    this.ghostBuildings.push({
      x1: bx - iw / 2,
      z1: bz - id / 2,
      x2: bx + iw / 2,
      z2: bz + id / 2,
      height: ih + 10,
      mesh: group
    });
  }
}
