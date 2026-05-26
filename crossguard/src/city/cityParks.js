import * as THREE from 'three';

export function _buildPark(cx, cz, w, d) {
  // Zielona nawierzchnia parku (nadpisuje szary chodnik wizualnie)
  const parkMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x1a2e1a : 0x3a7a3a,
    roughness: 0.95,
  });
  const parkGround = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 2, d - 2),
    parkMat,
  );
  parkGround.rotation.x = -Math.PI / 2;
  parkGround.position.set(cx, 0.13, cz);
  parkGround.receiveShadow = this.receiveShadows;
  this.scene.add(parkGround);

  // Sciezka przez srodek parku (jasniejszy pasek)
  const pathMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x3a3832 : 0x8a8478,
    roughness: 0.85,
  });
  const pathW = 1.5;
  // Sciezka pozioma
  const pathH = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 4, pathW),
    pathMat,
  );
  pathH.rotation.x = -Math.PI / 2;
  pathH.position.set(cx, 0.135, cz);
  pathH.receiveShadow = this.receiveShadows;
  this.scene.add(pathH);
  // Sciezka pionowa (krzyz)
  const pathV = new THREE.Mesh(
    new THREE.PlaneGeometry(pathW, d - 4),
    pathMat,
  )
  pathV.rotation.x = -Math.PI / 2;
  pathV.position.set(cx, 0.135, cz);
  pathV.receiveShadow = this.receiveShadows;
  this.scene.add(pathV);

  // Zywoploty wzdluz krawedzi (niskie zielone boksy)
  const hedgeMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x1a3218 : 0x2a5a28,
    roughness: 0.9,
  });
  const hedgeH = 0.6;
  const hedgeW = 0.5;
  for (const [dx, dz, hw, hd] of [
    [0, -(d / 2 - 1.5), w - 4, hedgeW],
    [0, (d / 2 - 1.5), w - 4, hedgeW],
    [-(w / 2 - 1.5), 0, hedgeW, d - 4],
    [(w / 2 - 1.5), 0, hedgeW, d - 4],
  ]) {
    const hedge = new THREE.Mesh(
      new THREE.BoxGeometry(hw, hedgeH, hd),
      hedgeMat,
    );
    hedge.position.set(cx + dx, hedgeH / 2 + 0.12, cz + dz);
    hedge.castShadow = this.castShadows;
    this.scene.add(hedge);
  }

  // Duzo drzew w parku
  const trunkMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x2a1c0e : 0x5b3a1d,
    roughness: 0.9,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x142820 : 0x4a8a3f,
    roughness: 0.85,
  });

  const treeR = 1.8;
  const halfX = w / 2 - treeR - 2;
  const halfZ = d / 2 - treeR - 2;
  const treeCount = Math.max(4, Math.round((w * d) / 30));
  let placed = 0;
  for (let attempt = 0; attempt < treeCount * 8 && placed < treeCount; attempt++) {
    const tx = cx + (Math.random() - 0.5) * 2 * halfX;
    const tz = cz + (Math.random() - 0.5) * 2 * halfZ;
    // Omijaj sciezke srodkowa
    if (Math.abs(tx - cx) < 1.2 && Math.abs(tz - cz) < 1.2) continue;
    this._spawnTree(tx, tz, trunkMat, leafMat);
    placed++;
  }

  // Lawki po bokach sciezki
  for (const [bx, bz] of [
    [cx + 3, cz + 1.5],
    [cx - 3, cz - 1.5],
    [cx + 1.5, cz + 3],
    [cx - 1.5, cz - 3],
  ]) {
    if (Math.abs(bx - cx) < w / 2 - 3 && Math.abs(bz - cz) < d / 2 - 3) {
      this._spawnBench(bx, bz);
    }
  }
}

export function _buildPlaza(cx, cz, w, d) {
  // Plac/rynek — cieplejsza nawierzchnia
  const plazaMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x3a3530 : 0x7a7068,
    roughness: 0.8,
  });
  const plazaGround = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 2, d - 2),
    plazaMat,
  );
  plazaGround.rotation.x = -Math.PI / 2;
  plazaGround.position.set(cx, 0.13, cz);
  plazaGround.receiveShadow = this.receiveShadows;
  this.scene.add(plazaGround);

  // Centralna fontanna
  const fountainMat = new THREE.MeshStandardMaterial({
    color: 0x606870,
    roughness: 0.5,
    metalness: 0.2,
  });
  // Basen fontanny (cylinder)
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.8, 0.6, 16),
    fountainMat,
  );
  basin.position.set(cx, 0.42, cz);
  basin.castShadow = this.castShadows;
  this.scene.add(basin);

  // Woda w basenie
  const waterMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x1a3050 : 0x4a8ab0,
    roughness: 0.1,
    metalness: 0.3,
    transparent: true,
    opacity: 0.7,
  });
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 0.05, 16),
    waterMat,
  );
  water.position.set(cx, 0.7, cz);
  this.scene.add(water);

  // Slup fontanny (tryskacz)
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 1.8, 8),
    fountainMat,
  );
  spout.position.set(cx, 1.6, cz);
  this.scene.add(spout);

  // Kula na gorze tryskacza
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 8),
    new THREE.MeshStandardMaterial({
      color: 0x8a8e96,
      roughness: 0.3,
      metalness: 0.5,
    }),
  );
  ball.position.set(cx, 2.6, cz);
  ball.castShadow = this.castShadows;
  this.scene.add(ball);

  // Fontanna to kolizja (nie mozna przez nia przejsc)
  this.buildings.push({
    x1: cx - 2.8, z1: cz - 2.8,
    x2: cx + 2.8, z2: cz + 2.8,
  });

  // Lawki wokol fontanny (4 strony)
  const benchDist = Math.min(w, d) * 0.3;
  for (const [dx, dz] of [[benchDist, 0], [-benchDist, 0], [0, benchDist], [0, -benchDist]]) {
    if (Math.abs(dx) < w / 2 - 2 && Math.abs(dz) < d / 2 - 2) {
      this._spawnBench(cx + dx, cz + dz);
    }
  }

  // Latarnie na rogach placu
  if (this.isNight) {
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });
    const lampOff = Math.min(w, d) * 0.35;
    for (const [dx, dz] of [[-lampOff, -lampOff], [lampOff, -lampOff], [-lampOff, lampOff], [lampOff, lampOff]]) {
      this._createStreetLamp(cx + dx, cz + dz, lampMat, lampHeadMat);
    }
  }

  // Dekoracyjne drzewka na rogach
  const trunkMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x2a1c0e : 0x5b3a1d, roughness: 0.9,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: this.isNight ? 0x142820 : 0x4a8a3f, roughness: 0.85,
  });
  const treeOff = Math.min(w, d) * 0.38;
  for (const [dx, dz] of [[-treeOff, -treeOff], [treeOff, -treeOff], [-treeOff, treeOff], [treeOff, treeOff]]) {
    this._spawnTree(cx + dx, cz + dz, trunkMat, leafMat);
  }
}
