// === City generation: deterministyczne layouty per poziom ===
// Kazdy poziom ma recznie zaprojektowany uklad siatki,
// selektywne skrzyzowania i rozne typy blokow (budynki, parki, place).
import * as THREE from "three";
import { PALETTE } from "./config.js";
import { settings } from "./settings.js";

export class City {
  constructor(scene, zone, isNight, models = null) {
    this.scene = scene;
    this.zone = zone;
    this.isNight = isNight;
    this.models = models;
    this.castShadows = settings.current.shadows;
    this.receiveShadows = settings.current.shadows;

    // Layout z konfiguracji strefy
    const layout = zone.layout;
    this.layout = layout;
    this.gridSize = layout.xWidths.length;

    // Stalowe wspolrzedne siatki z layoutu (zamiast losowych)
    this.xCoords = this._layoutToCoords(layout.xWidths);
    this.zCoords = this._layoutToCoords(layout.zWidths);
    this.size = this.xCoords[this.gridSize] - this.xCoords[0];

    // Mapa sygnalizowanych skrzyzowan dla szybkiego lookupu
    this._signalSet = new Set(layout.signals.map(([i,j]) => `${i},${j}`));

    // Tracked entities
    this.crossings = [];
    this.trafficLights = [];
    this.cameras = [];
    this.intersections = [];
    this.roadSegments = [];
    this.sidewalks = [];
    this.spawnPoints = [];
    this.buildings = [];
    this.obstacles = [];
    this.tramRails = [];
    this.pedestrianLights = [];

    this._build();
  }

  // Zamienia tablice szerokosc blokow na tablice wspolrzednych, wycentrowana wokol zera
  _layoutToCoords(widths) {
    const total = widths.reduce((a, b) => a + b, 0);
    const half = total / 2;
    const coords = [-half];
    for (let i = 0; i < widths.length; i++) {
      coords.push(coords[i] + widths[i]);
    }
    coords[widths.length] = half; // pin dokladnego konca
    return coords;
  }

  cellToWorld(i, j) {
    return { x: this.xCoords[i], z: this.zCoords[j] };
  }

  _build() {
    const g = this.gridSize;
    const half = this.size / 2;
    const roadWidth = 8;
    this.bounds = { min: -half, max: half };

    // === Podloze ===
    const groundGeo = new THREE.PlaneGeometry(
      this.size + 200,
      this.size + 200,
    );
    const groundMat = new THREE.MeshStandardMaterial({
      color: PALETTE.grass,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = this.receiveShadows;
    ground.position.y = -0.08;
    this.scene.add(ground);

    // === Materialy ===
    const roadMat = new THREE.MeshStandardMaterial({
      color: PALETTE.road,
      roughness: 0.85,
      metalness: 0.05,
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.sidewalk,
      roughness: 0.9,
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: PALETTE.curb,
      roughness: 0.8,
    });

    const xs = this.xCoords;
    const zs = this.zCoords;

    // Rozmiary osi moga sie roznic (xWidths vs zWidths)
    const sizeX = xs[g] - xs[0];
    const sizeZ = zs[g] - zs[0];

    // === Drogi poziome (staly z, rozciagaja sie na cala szerokosc w x) ===
    for (let j = 0; j <= g; j++) {
      const coord = zs[j];
      const hRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(sizeX, roadWidth),
        roadMat,
      );
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0, coord);
      hRoad.receiveShadow = this.receiveShadows;
      this.scene.add(hRoad);
      this.roadSegments.push({
        x1: -sizeX / 2, z1: coord, x2: sizeX / 2, z2: coord, axis: "h",
      });
      this._addLaneLines(0, coord, sizeX, roadWidth, "h");
    }

    // === Drogi pionowe (staly x, rozciagaja sie na cala glebokosc w z) ===
    for (let i = 0; i <= g; i++) {
      const coord = xs[i];
      const vRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth, sizeZ),
        roadMat,
      );
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(coord, 0, 0);
      vRoad.receiveShadow = this.receiveShadows;
      this.scene.add(vRoad);
      this.roadSegments.push({
        x1: coord, z1: -sizeZ / 2, x2: coord, z2: sizeZ / 2, axis: "v",
      });
      this._addLaneLines(coord, 0, roadWidth, sizeZ, "v");
    }

    // === Bloki: chodnik + zawartosc w zaleznosci od typu ===
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g; j++) {
        const cellW = xs[i + 1] - xs[i];
        const cellD = zs[j + 1] - zs[j];
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cz = (zs[j] + zs[j + 1]) / 2;

        const sidewalkW = cellW - roadWidth - 6;
        const sidewalkD = cellD - roadWidth - 6;
        const buildAreaW = sidewalkW - 2;
        const buildAreaD = sidewalkD - 2;

        // Chodnik — zawsze obecny
        const sw = new THREE.Mesh(
          new THREE.BoxGeometry(sidewalkW, 0.12, sidewalkD),
          sidewalkMat,
        );
        sw.position.set(cx, 0.06, cz);
        sw.receiveShadow = this.receiveShadows;
        this.scene.add(sw);
        this.sidewalks.push({
          x1: cx - sidewalkW / 2,
          z1: cz - sidewalkD / 2,
          x2: cx + sidewalkW / 2,
          z2: cz + sidewalkD / 2,
        });

        // Krawezniki
        const curbT = 0.28;
        const curbW = 0.55;
        const curbOffX = cellW / 2 - roadWidth / 2 - curbW / 2;
        const curbOffZ = cellD / 2 - roadWidth / 2 - curbW / 2;
        for (const [dx, dz, w, d] of [
          [0, -curbOffZ, sidewalkW, curbW],
          [0, curbOffZ, sidewalkW, curbW],
          [-curbOffX, 0, curbW, sidewalkD],
          [curbOffX, 0, curbW, sidewalkD],
        ]) {
          const c = new THREE.Mesh(
            new THREE.BoxGeometry(w, curbT, d),
            curbMat,
          );
          c.position.set(cx + dx, curbT / 2 + 0.12, cz + dz);
          this.scene.add(c);
        }

        // Zawartosc bloku w zaleznosci od typu w layoucie
        const blockType = (this.layout.blocks && this.layout.blocks[`${i},${j}`]) || 'building';

        switch (blockType) {
          case 'park':
            this._buildPark(cx, cz, sidewalkW, sidewalkD);
            break;
          case 'plaza':
            this._buildPlaza(cx, cz, sidewalkW, sidewalkD);
            break;
          case 'empty':
            // Sam chodnik, moze lawka
            if (Math.random() > 0.5) this._spawnBench(cx, cz);
            this._addBlockTrees(cx, cz, sidewalkW, sidewalkD);
            break;
          case 'building':
          default:
            this._buildBuildings(cx, cz, Math.min(buildAreaW, buildAreaD));
            this._addBlockTrees(cx, cz, sidewalkW, sidewalkD);
            break;
        }

        // Punkty spawnu na rogach chodnika
        const offX = sidewalkW / 2 - 1.5;
        const offZ = sidewalkD / 2 - 1.5;
        for (const pt of [
          { x: cx - offX, z: cz - offZ },
          { x: cx + offX, z: cz - offZ },
          { x: cx - offX, z: cz + offZ },
          { x: cx + offX, z: cz + offZ },
        ]) {
          if (!this.collidesBuilding(pt.x, pt.z, 0.6))
            this.spawnPoints.push(pt);
        }
      }
    }

    // === Skrzyzowania — sygnalizowane lub ze znakami ===
    const crossOff = roadWidth / 2 + 1.5;
    const crossWidth = 3.0;
    const roadHalf = roadWidth / 2;
    const sigOff = crossOff + crossWidth / 2 + 0.5;

    for (let i = 1; i < g; i++) {
      for (let j = 1; j < g; j++) {
        const x = xs[i];
        const z = zs[j];

        if (this._signalSet.has(`${i},${j}`)) {
          // --- Skrzyżowanie z sygnalizacją świetlną ---
          this.intersections.push({ x, z, signalized: true });

          // Sygnalizacja pojazdowa (4 ramiona)
          const tlForSouth = this._addTrafficLight(x + roadHalf + 0.5, z + sigOff, 'ns', 0, x, z);
          const tlForNorth = this._addTrafficLight(x - roadHalf - 0.5, z - sigOff, 'ns', Math.PI, x, z);
          const tlForWest = this._addTrafficLight(x - sigOff, z + roadHalf + 0.5, 'ew', -Math.PI / 2, x, z);
          const tlForEast = this._addTrafficLight(x + sigOff, z - roadHalf - 0.5, 'ew', Math.PI / 2, x, z);

          // Sygnalizacja piesza
          const pedCorner = roadHalf + 3;
          const pedOff = roadHalf + 0.5;
          this._addPedestrianLight(x - pedOff, z - pedCorner, Math.PI / 2, tlForNorth);
          this._addPedestrianLight(x + pedOff, z - pedCorner, -Math.PI / 2, tlForNorth);
          this._addPedestrianLight(x - pedOff, z + pedCorner, Math.PI / 2, tlForSouth);
          this._addPedestrianLight(x + pedOff, z + pedCorner, -Math.PI / 2, tlForSouth);
          this._addPedestrianLight(x + pedCorner, z - pedOff, 0, tlForEast);
          this._addPedestrianLight(x + pedCorner, z + pedOff, Math.PI, tlForEast);
          this._addPedestrianLight(x - pedCorner, z - pedOff, 0, tlForWest);
          this._addPedestrianLight(x - pedCorner, z + pedOff, Math.PI, tlForWest);

          // Zebry
          for (const dz of [-crossOff, +crossOff]) {
            this._addZebra(x, z + dz, 'x', roadWidth, crossWidth);
            const lightObj = dz < 0 ? tlForNorth : tlForSouth;
            this.crossings.push({
              x, z: z + dz, axis: 'h', light: lightObj,
              x1: x - roadWidth / 2, z1: z + dz - crossWidth / 2,
              x2: x + roadWidth / 2, z2: z + dz + crossWidth / 2,
            });
          }
          for (const dx of [-crossOff, +crossOff]) {
            this._addZebra(x + dx, z, 'z', roadWidth, crossWidth);
            const lightObj = dx < 0 ? tlForWest : tlForEast;
            this.crossings.push({
              x: x + dx, z, axis: 'v', light: lightObj,
              x1: x + dx - crossWidth / 2, z1: z - roadWidth / 2,
              x2: x + dx + crossWidth / 2, z2: z + roadWidth / 2,
            });
          }
        } else {
          // --- Skrzyżowanie równorzędne ze znakami (bez sygnalizacji) ---
          this.intersections.push({ x, z, signalized: false });

          // Zebry bez sygnalizacji
          for (const dz of [-crossOff, +crossOff]) {
            this._addZebra(x, z + dz, 'x', roadWidth, crossWidth);
            this.crossings.push({
              x, z: z + dz, axis: 'h', light: null,
              x1: x - roadWidth / 2, z1: z + dz - crossWidth / 2,
              x2: x + roadWidth / 2, z2: z + dz + crossWidth / 2,
            });
          }
          for (const dx of [-crossOff, +crossOff]) {
            this._addZebra(x + dx, z, 'z', roadWidth, crossWidth);
            this.crossings.push({
              x: x + dx, z, axis: 'v', light: null,
              x1: x + dx - crossWidth / 2, z1: z - roadWidth / 2,
              x2: x + dx + crossWidth / 2, z2: z + roadWidth / 2,
            });
          }

          // Znaki pionowe na skrzyżowaniach bez sygnalizacji (przesunięte przed przejście dla pieszych i bardziej na bok):
          const unsigSignOff = crossOff + crossWidth / 2 + 2.0; // 9.0 (odsunięcie przed przejście dla pieszych)
          const unsigSignLat = roadHalf + 1.2; // 5.2 (bardziej na bok drogi, aby nie blokować wejścia na pasy)

          // Droga z pierwszeństwem (D-1) z podczepionym znakiem przejścia dla pieszych (D-6) na jednym słupku (oś pozioma)
          this._createDoubleSign(x - unsigSignOff, z + unsigSignLat, 'D-1', 'D-6', -Math.PI / 2); // West approach & crossing
          this._createDoubleSign(x + unsigSignOff, z - unsigSignLat, 'D-1', 'D-6', Math.PI / 2);  // East approach & crossing

          // Ustąp pierwszeństwa (A-7) z podczepionym znakiem przejścia dla pieszych (D-6) na jednym słupku (oś pionowa)
          this._createDoubleSign(x - unsigSignLat, z - unsigSignOff, 'A-7', 'D-6', Math.PI); // North approach & crossing
          this._createDoubleSign(x + unsigSignLat, z + unsigSignOff, 'A-7', 'D-6', 0);       // South approach & crossing
        }
      }
    }

    this._linkTrafficLights();
    this._placeCameras();

    if (this.zone.id === "industrial" || this.zone.id === "highway") {
      this._addRoadworks();
    }

    this._addLamps();
    this.bounds = { min: -half, max: half };
  }

  // ============================================================
  // Typy blokow: park, plac, budynki
  // ============================================================

  _buildPark(cx, cz, w, d) {
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

  _buildPlaza(cx, cz, w, d) {
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

  // ============================================================
  // Linie na jezdni
  // ============================================================

  _addLaneLines(cx, cz, w, d, axis) {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const excludeR = 8.5;

    const roadPositions = axis === "h" ? this.xCoords : this.zCoords;
    const isNearCrossing = (pos) => {
      for (const rp of roadPositions) {
        if (Math.abs(pos - rp) < excludeR) return true;
      }
      return false;
    };

    if (axis === "h") {
      const dashLen = 2, gap = 2;
      for (let x = -w / 2 + 1; x < w / 2; x += dashLen + gap) {
        const worldX = cx + x;
        if (isNearCrossing(worldX)) continue;
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(dashLen, 0.25),
          lineMat,
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(worldX, 0.01, cz);
        this.scene.add(line);
      }
    } else {
      const dashLen = 2, gap = 2;
      for (let z = -d / 2 + 1; z < d / 2; z += dashLen + gap) {
        const worldZ = cz + z;
        if (isNearCrossing(worldZ)) continue;
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(0.25, dashLen),
          lineMat,
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(cx, 0.01, worldZ);
        this.scene.add(line);
      }
    }
  }

  // ============================================================
  // Zebry
  // ============================================================

  _addZebra(cx, cz, pedAxis, roadW, footprint) {
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripeCount = 8;
    const stripeLen = footprint;
    const totalSpan = roadW * 0.85;
    const stripeThick = totalSpan / (stripeCount * 2 - 1);
    for (let i = 0; i < stripeCount; i++) {
      const off = -totalSpan / 2 + stripeThick / 2 + i * stripeThick * 2;
      let geo, pos;
      if (pedAxis === 'x') {
        geo = new THREE.PlaneGeometry(stripeThick, stripeLen);
        pos = [cx + off, 0.015, cz];
      } else {
        geo = new THREE.PlaneGeometry(stripeLen, stripeThick);
        pos = [cx, 0.015, cz + off];
      }
      const s = new THREE.Mesh(geo, stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(...pos);
      this.scene.add(s);
    }
  }

  // ============================================================
  // Sygnalizacja swietlna
  // ============================================================

  _addTrafficLight(x, z, axis, rotationY = 0, intersectionX = x, intersectionZ = z) {
    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.6, roughness: 0.5 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.4, roughness: 0.6 });
    const backboardMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.3, roughness: 0.8 });

    // Pole (taller, tapered)
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 4.6, 12),
      poleMat
    );
    pole.position.y = 2.3;
    pole.castShadow = this.castShadows;
    group.add(pole);

    // Pole base / foundation
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.25, 12),
      poleMat
    );
    base.position.y = 0.12;
    group.add(base);

    // Mounting bracket from pole to housing
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.35),
      poleMat
    );
    bracket.position.set(0, 4.0, 0.17);
    group.add(bracket);

    // Backboard plate (yellow border style is common in PL, but we keep dark for night look)
    const backboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 2.05, 0.06),
      backboardMat
    );
    backboard.position.set(0, 4.0, 0.31);
    group.add(backboard);

    // Housing (slimmer, taller)
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 1.85, 0.42),
      housingMat
    );
    housing.position.set(0, 4.0, 0.36);
    housing.castShadow = this.castShadows;
    group.add(housing);

    // Lamp materials — brighter emissive when lit
    const redMat = new THREE.MeshStandardMaterial({ color: 0x3a0a10, emissive: 0x180005, emissiveIntensity: 0.3, roughness: 0.4 });
    const ambMat = new THREE.MeshStandardMaterial({ color: 0x3a2a05, emissive: 0x1a1200, emissiveIntensity: 0.3, roughness: 0.4 });
    const grnMat = new THREE.MeshStandardMaterial({ color: 0x0a3a18, emissive: 0x00180a, emissiveIntensity: 0.3, roughness: 0.4 });

    // Lens discs (flat, not spheres — looks more like real lights)
    const lensGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20);
    const red = new THREE.Mesh(lensGeo, redMat);
    red.rotation.x = Math.PI / 2;
    red.position.set(0, 4.62, 0.59);
    const amb = new THREE.Mesh(lensGeo, ambMat);
    amb.rotation.x = Math.PI / 2;
    amb.position.set(0, 4.0, 0.59);
    const grn = new THREE.Mesh(lensGeo, grnMat);
    grn.rotation.x = Math.PI / 2;
    grn.position.set(0, 3.38, 0.59);
    group.add(red, amb, grn);

    // Visors / hoods over each lamp (half tubes)
    const visorMat = housingMat;
    const visorGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 16, 1, true, -Math.PI / 2, Math.PI);
    for (const y of [4.62, 4.0, 3.38]) {
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.rotation.x = Math.PI / 2;
      visor.position.set(0, y, 0.55);
      visor.scale.set(1, 1.2, 1);
      group.add(visor);
    }

    // Glow halo discs (visible only when lit; updated in _applyLightVisual)
    const haloGeo = new THREE.CircleGeometry(0.32, 16);
    const makeHalo = (col) => new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    const redHalo = makeHalo(0xff2233);
    redHalo.position.set(0, 4.62, 0.63);
    const ambHalo = makeHalo(0xffaa00);
    ambHalo.position.set(0, 4.0, 0.63);
    const grnHalo = makeHalo(0x33ee55);
    grnHalo.position.set(0, 3.38, 0.63);
    group.add(redHalo, ambHalo, grnHalo);

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.scene.add(group);

    const lightObj = {
      group, axis,
      state: 'red',
      timer: Math.random() * 6,
      cycleRed: 6.0,
      cycleGreen: 5.0,
      cycleAmber: 1.2,
      redMat, ambMat, grnMat,
      redHalo, ambHalo, grnHalo,
      pos: { x, z },
      intersection: { x: intersectionX, z: intersectionZ },
      pairedWith: null,
    };
    this.trafficLights.push(lightObj);
    return lightObj;
  }

  _addPedestrianLight(x, z, rotationY, linkedVehicle) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 2.6),
      new THREE.MeshLambertMaterial({ color: 0x222a33 })
    );
    pole.position.y = 1.3;
    pole.castShadow = this.castShadows;
    group.add(pole);
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.95, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x1a1f28 })
    );
    housing.position.set(0, 2.85, 0);
    group.add(housing);

    const redMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0x220000, emissiveIntensity: 0.4 });
    const grnMat = new THREE.MeshStandardMaterial({ color: 0x005522, emissive: 0x002211, emissiveIntensity: 0.4 });
    const redLamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), redMat);
    redLamp.position.set(0, 3.1, 0.17);
    const grnLamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), grnMat);
    grnLamp.position.set(0, 2.65, 0.17);
    group.add(redLamp, grnLamp);

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.scene.add(group);

    const pedLight = { group, state: 'red', redMat, grnMat, linkedVehicle };
    this.pedestrianLights.push(pedLight);
    return pedLight;
  }

  _applyPedLightVisual(pl) {
    const on = pl.state === 'green';
    pl.redMat.color.setHex(on ? 0x550000 : 0xff2233);
    pl.redMat.emissive.setHex(on ? 0x220000 : 0xff1122);
    pl.redMat.emissiveIntensity = on ? 0.25 : 1.8;
    pl.grnMat.color.setHex(on ? 0x33ee55 : 0x005522);
    pl.grnMat.emissive.setHex(on ? 0x22dd44 : 0x002211);
    pl.grnMat.emissiveIntensity = on ? 1.8 : 0.25;
  }

  // ============================================================
  // Cyklowanie swiatel (fazy, fala zielona, linkowanie)
  // ============================================================

  _linkTrafficLights() {
    const groups = new Map();
    for (const tl of this.trafficLights) {
      const key = `${tl.intersection.x.toFixed(2)},${tl.intersection.z.toFixed(2)}`;
      let g = groups.get(key);
      if (!g) { g = { items: [], x: tl.intersection.x, z: tl.intersection.z }; groups.set(key, g); }
      g.items.push(tl);
    }

    // Fala zielona na losowej arterii
    const arterialJ = 1 + Math.floor(Math.random() * Math.max(1, this.gridSize - 1));
    const arterialI = 1 + Math.floor(Math.random() * Math.max(1, this.gridSize - 1));
    const arterialZ = this.zCoords[arterialJ];
    const arterialX = this.xCoords[arterialI];
    const waveSpeed = 11;
    const arterialGreen = 6.5;
    const arterialCross = 4.0;
    const arterialAmber = 1.3;
    const arterialCycle = arterialGreen + arterialAmber + arterialCross + arterialAmber;

    for (const grp of groups.values()) {
      const ns = grp.items.filter(t => t.axis === 'ns');
      const ew = grp.items.filter(t => t.axis === 'ew');

      const onArterialEW = Math.abs(grp.z - arterialZ) < 0.5;
      const onArterialNS = Math.abs(grp.x - arterialX) < 0.5;

      let nsGreen, ewGreen, amber, phase;
      if (onArterialEW) {
        ewGreen = arterialGreen;
        nsGreen = arterialCross;
        amber = arterialAmber;
        const fullCycle = arterialCycle;
        phase = ((nsGreen + amber - grp.x / waveSpeed) % fullCycle + fullCycle) % fullCycle;
      } else if (onArterialNS) {
        nsGreen = arterialGreen;
        ewGreen = arterialCross;
        amber = arterialAmber;
        const fullCycle = arterialCycle;
        phase = ((-grp.z / waveSpeed) % fullCycle + fullCycle) % fullCycle;
      } else {
        nsGreen = 3.5 + Math.random() * 4.0;
        ewGreen = 3.5 + Math.random() * 4.0;
        amber = 1.0 + Math.random() * 0.6;
        const fullCycle = nsGreen + amber + ewGreen + amber;
        phase = Math.random() * fullCycle;
      }

      const fullCycle = nsGreen + amber + ewGreen + amber;

      ns.forEach(t => {
        t.cycleGreen = nsGreen;
        t.cycleAmber = amber;
        t.cycleRed = ewGreen + amber;
      });
      ew.forEach(t => {
        t.cycleGreen = ewGreen;
        t.cycleAmber = amber;
        t.cycleRed = nsGreen + amber;
      });

      const p = phase % fullCycle;
      const setFromPhase = (t, axis) => {
        if (axis === 'ns') {
          if (p < nsGreen)                       { t.state = 'green'; t.timer = p; }
          else if (p < nsGreen + amber)          { t.state = 'amber'; t.timer = p - nsGreen; }
          else                                   { t.state = 'red';   t.timer = p - nsGreen - amber; }
        } else {
          if (p < nsGreen + amber)               { t.state = 'red';   t.timer = p; }
          else if (p < nsGreen + amber + ewGreen){ t.state = 'green'; t.timer = p - nsGreen - amber; }
          else                                   { t.state = 'amber'; t.timer = p - nsGreen - amber - ewGreen; }
        }
      };
      ns.forEach(t => setFromPhase(t, 'ns'));
      ew.forEach(t => setFromPhase(t, 'ew'));

      this._applyLightVisual(ns);
      this._applyLightVisual(ew);
    }

    for (const pl of this.pedestrianLights) {
      pl.state = pl.linkedVehicle.state === 'red' ? 'green' : 'red';
      this._applyPedLightVisual(pl);
    }
  }

  _applyLightVisual(list) {
    for (const t of list) {
      const setLamp = (mat, on, onCol, offCol) => {
        mat.color.setHex(on ? onCol : offCol);
        if (mat.emissive) {
          mat.emissive.setHex(on ? onCol : (offCol >> 2));
          mat.emissiveIntensity = on ? 2.4 : 0.2;
        }
      };
      setLamp(t.redMat, t.state === 'red', 0xff2233, 0x3a0a10);
      setLamp(t.ambMat, t.state === 'amber', 0xffaa00, 0x3a2a05);
      setLamp(t.grnMat, t.state === 'green', 0x33ee55, 0x0a3a18);
      if (t.redHalo) t.redHalo.material.opacity = t.state === 'red' ? 0.55 : 0;
      if (t.ambHalo) t.ambHalo.material.opacity = t.state === 'amber' ? 0.55 : 0;
      if (t.grnHalo) t.grnHalo.material.opacity = t.state === 'green' ? 0.55 : 0;
    }
  }

  updateTrafficLights(dt) {
    const FLASH_DURATION = 3.0;
    const FLASH_INTERVAL = 0.35;

    for (const tl of this.trafficLights) {
      tl.timer += dt;
      let nextState = tl.state;
      if (tl.state === 'green' && tl.timer >= tl.cycleGreen) { nextState = 'amber'; tl.timer = 0; }
      else if (tl.state === 'amber' && tl.timer >= tl.cycleAmber) { nextState = 'red'; tl.timer = 0; }
      else if (tl.state === 'red'   && tl.timer >= tl.cycleRed)   { nextState = 'green'; tl.timer = 0; }
      if (nextState !== tl.state) {
        tl.state = nextState;
        this._applyLightVisual([tl]);
      }
      tl._pedFlashing = tl.state === 'red' && (tl.cycleRed - tl.timer) <= FLASH_DURATION;
    }

    for (const pl of this.pedestrianLights) {
      const veh = pl.linkedVehicle;
      if (veh.state !== 'red') {
        pl._flashTimer = 0;
        if (pl.state !== 'red') { pl.state = 'red'; this._applyPedLightVisual(pl); }
      } else if (veh._pedFlashing) {
        pl.state = 'flashing';
        pl._flashTimer = (pl._flashTimer || 0) + dt;
        const on = Math.floor(pl._flashTimer / FLASH_INTERVAL) % 2 === 0;
        pl.grnMat.color.setHex(on ? 0x33ee55 : 0x004018);
        pl.grnMat.emissive.setHex(on ? 0x22dd44 : 0x001008);
        pl.grnMat.emissiveIntensity = on ? 1.8 : 0.12;
        pl.redMat.color.setHex(0x550000);
        pl.redMat.emissive.setHex(0x220000);
        pl.redMat.emissiveIntensity = 0.25;
      } else {
        pl._flashTimer = 0;
        if (pl.state !== 'green') { pl.state = 'green'; this._applyPedLightVisual(pl); }
      }
    }
  }

  // ============================================================
  // Budynki
  // ============================================================

  _buildBuildings(cx, cz, area) {
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

  _buildBuildingsFromModels(cx, cz, area) {
    const isDowntown = this.zone.id === "downtown";
    const MIN_SCALE = 7;
    const MAX_SCALE = 30;
    const GAP = 0.5;
    const count = area > 22 && Math.random() < 0.5 ? 2 : 1;
    const targetFill = count === 1 ? 0.92 : 0.62;

    const placed = [];
    const hasShadows = settings.current.shadows;

    for (let i = 0; i < count; i++) {
      const useSkyscraper =
        isDowntown &&
        Math.random() > 0.45 &&
        this.models.skyscrapers.length > 0;
      const pool = useSkyscraper
        ? this.models.skyscrapers
        : this.models.buildings;
      if (!pool.length) continue;

      const template = pool[Math.floor(Math.random() * pool.length)];
      const nativeSize = template.userData.size;
      if (!nativeSize || nativeSize.y < 0.01) continue;

      const biggerNative = Math.max(nativeSize.x, nativeSize.z);
      let fitScale = (area * targetFill) / biggerNative;
      fitScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitScale));
      let actualW = nativeSize.x * fitScale;
      let actualD = nativeSize.z * fitScale;
      if (actualW > area || actualD > area) {
        const sf = Math.min(area / actualW, area / actualD);
        fitScale *= sf;
        actualW *= sf;
        actualD *= sf;
      }

      const maxOffX = Math.max(0, (area - actualW) / 2);
      const maxOffZ = Math.max(0, (area - actualD) / 2);

      let offX = 0, offZ = 0, fits = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        offX = (Math.random() - 0.5) * 2 * maxOffX;
        offZ = (Math.random() - 0.5) * 2 * maxOffZ;
        const b = {
          x1: cx + offX - actualW / 2 - GAP,
          z1: cz + offZ - actualD / 2 - GAP,
          x2: cx + offX + actualW / 2 + GAP,
          z2: cz + offZ + actualD / 2 + GAP,
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
      const rotationY = Math.floor(Math.random() * 4) * (Math.PI / 2);
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

      if (settings.current.lod) {
        const lod = new THREE.LOD();
        
        // Detailed level (0m to 120m)
        lod.addLevel(obj, 0);
        obj.position.set(0, 0, 0);
        obj.rotation.y = 0; // reset local rotation as LOD will carry it
        
        // Low-poly level (120m+)
        const h = nativeSize.y * fitScale;
        const fallbackMat = new THREE.MeshStandardMaterial({
          color: 0x7a8296,
          roughness: 0.8,
          metalness: 0.1,
        });
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
      } else {
        obj.position.set(cx + offX, 0.12, cz + offZ);
        this.scene.add(obj);
      }

      const box = {
        x1: cx + offX - actualW / 2,
        z1: cz + offZ - actualD / 2,
        x2: cx + offX + actualW / 2,
        z2: cz + offZ + actualD / 2,
      };
      placed.push(box);
      this.buildings.push(box);
    }

    if (Math.random() > 0.3) this._addStreetFurniture(cx, cz, area);
  }

  _buildBuildingsSimple(cx, cz, area) {
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
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.78,
        metalness: 0.08,
      });
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      bldg.position.set(cx + offX, h / 2 + 0.12, cz + offZ);
      bldg.castShadow = this.castShadows;
      bldg.receiveShadow = this.receiveShadows;
      this.scene.add(bldg);

      // Cokol (ciemniejszy parter)
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.03, 1.5, d * 1.03),
        new THREE.MeshStandardMaterial({
          color: 0x3a4150,
          roughness: 0.7,
        }),
      );
      base.position.set(cx + offX, 0.75 + 0.12, cz + offZ);
      base.receiveShadow = this.receiveShadows;
      this.scene.add(base);

      // Gzyms na gorze
      const cornice = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.05, 0.25, d * 1.05),
        new THREE.MeshStandardMaterial({
          color: 0x2a3040,
          roughness: 0.6,
        }),
      );
      cornice.position.set(cx + offX, h + 0.12, cz + offZ);
      this.scene.add(cornice);

      this._addWindows(bldg, w, h, d);

      // Dach
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 0.8, d * 0.7),
        new THREE.MeshStandardMaterial({
          color: 0x3a404c,
          roughness: 0.7,
        }),
      );
      roof.position.set(cx + offX, h + 0.55, cz + offZ);
      this.scene.add(roof);

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
          cx + offX + (Math.random() - 0.5) * w * 0.4,
          h + 1.2,
          cz + offZ + (Math.random() - 0.5) * d * 0.4,
        );
        this.scene.add(ac);
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
        ant.position.set(cx + offX, h + 2.5, cz + offZ);
        this.scene.add(ant);
      }

      this.buildings.push({
        x1: cx + offX - w / 2,
        z1: cz + offZ - d / 2,
        x2: cx + offX + w / 2,
        z2: cz + offZ + d / 2,
      });
    }

    if (Math.random() > 0.3) this._addStreetFurniture(cx, cz, area);
  }

  // ============================================================
  // Dekoracje blokow: drzewa, lawki, meble uliczne
  // ============================================================

  _addBlockTrees(cx, cz, sidewalkW, sidewalkD) {
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

  _spawnTree(tx, tz, trunkMat, leafMat) {
    const isLow = settings.current.quality === 'low';
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 1.6, isLow ? 5 : 8),
      trunkMat,
    );
    trunk.position.set(tx, 0.92, tz);
    trunk.castShadow = this.castShadows;
    this.scene.add(trunk);
    const r = 0.9 + Math.random() * 0.5;
    const leaves = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, isLow ? 0 : 1),
      leafMat,
    );
    leaves.position.set(tx, 2.3, tz);
    leaves.castShadow = this.castShadows;
    this.scene.add(leaves);
    if (!isLow) {
      const leaves2 = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r * 0.65, 1),
        leafMat,
      );
      leaves2.position.set(tx + 0.4, 2.6, tz - 0.3);
      this.scene.add(leaves2);
    }
  }

  _addStreetFurniture(cx, cz, area) {
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

  _spawnBench(bx, bz) {
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
    seat.position.set(bx, 0.5, bz);
    seat.castShadow = this.castShadows;
    this.scene.add(seat);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.5, 0.08),
      benchMat,
    );
    back.position.set(bx, 0.8, bz - 0.21);
    this.scene.add(back);
    for (const sx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.5, 0.4),
        legMat,
      );
      leg.position.set(bx + sx, 0.25, bz);
      this.scene.add(leg);
    }
  }

  // ============================================================
  // Okna budynkow
  // ============================================================

  _addWindows(parent, w, h, d) {
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

  // ============================================================
  // Kamery, przeszkody, latarnie
  // ============================================================

  _placeCameras() {
    const positions = [];
    for (const intr of this.intersections) {
      positions.push(intr);
    }
    positions.sort(() => Math.random() - 0.5);

    const camCount = Math.min(this.zone.cameras, positions.length);

    // Shared materials for Avigilon H5A-style bullet camera
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.7, roughness: 0.4 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: 0.35, roughness: 0.55 });
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.25, roughness: 0.5 });
    const lensRingMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.6, roughness: 0.35 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x05080c, metalness: 0.9, roughness: 0.08, emissive: 0x0a1a2a, emissiveIntensity: 0.4 });
    const irMat = new THREE.MeshStandardMaterial({ color: 0x2a0a0a, emissive: 0x661111, emissiveIntensity: 0.6, roughness: 0.4 });

    for (let i = 0; i < camCount; i++) {
      const p = positions[i];
      const cx = p.x + 4;
      const cz = p.z + 4;

      // Tall pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 5.4, 12),
        poleMat,
      );
      pole.position.set(cx, 2.7, cz);
      pole.castShadow = this.castShadows;
      this.scene.add(pole);

      // Base flange
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.36, 0.22, 12),
        poleMat,
      );
      base.position.set(cx, 0.11, cz);
      this.scene.add(base);

      // Camera assembly group — mount on horizontal arm extending outward
      const camGroup = new THREE.Group();
      camGroup.position.set(cx, 5.2, cz);
      // Aim camera into the intersection (toward -x,-z corner)
      camGroup.rotation.y = Math.atan2(-1, -1) + Math.PI / 4;
      this.scene.add(camGroup);

      // Horizontal mounting arm
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.85),
        poleMat,
      );
      arm.position.set(0, 0, -0.42);
      camGroup.add(arm);

      // Knuckle / pivot joint (sphere)
      const knuckle = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 14, 10),
        poleMat,
      );
      knuckle.position.set(0, 0, -0.85);
      camGroup.add(knuckle);

      // Bracket arm (angled down toward camera body)
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.32),
        poleMat,
      );
      bracket.position.set(0, -0.04, -1.05);
      bracket.rotation.x = -0.15;
      camGroup.add(bracket);

      // Main bullet body — cylindrical, pointing forward (-z in local space)
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.7, 20),
        bodyMat,
      );
      body.rotation.x = Math.PI / 2;
      body.position.set(0, -0.1, -1.35);
      body.castShadow = this.castShadows;
      camGroup.add(body);

      // Rear cap (slightly larger, rounded)
      const rear = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        bodyMat,
      );
      rear.rotation.x = -Math.PI / 2;
      rear.position.set(0, -0.1, -1.02);
      camGroup.add(rear);

      // Sun shield / hood over top of bullet
      const shield = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.5, 20, 1, true, -Math.PI / 2 - 0.5, Math.PI + 1),
        shieldMat,
      );
      shield.rotation.x = Math.PI / 2;
      shield.position.set(0, -0.05, -1.45);
      shield.scale.set(1, 1, 1);
      camGroup.add(shield);

      // Lens ring (black bezel at front of bullet)
      const lensRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.155, 0.155, 0.08, 20),
        lensRingMat,
      );
      lensRing.rotation.x = Math.PI / 2;
      lensRing.position.set(0, -0.1, -1.71);
      camGroup.add(lensRing);

      // Glass lens (dark)
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 24),
        lensMat,
      );
      lens.position.set(0, -0.1, -1.76);
      lens.rotation.y = Math.PI; // face forward
      camGroup.add(lens);

      // IR LED ring around lens — small bumps (12 around)
      const irGeo = new THREE.SphereGeometry(0.018, 6, 5);
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const ir = new THREE.Mesh(irGeo, irMat);
        ir.position.set(Math.cos(ang) * 0.135, -0.1 + Math.sin(ang) * 0.135, -1.755);
        camGroup.add(ir);
      }

      // "AVIGILON" / Motorola Solutions branding strip (dark band on side)
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.06, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.5, roughness: 0.4 }),
      );
      strip.position.set(0, 0.07, -1.35);
      camGroup.add(strip);

      // Red status LED (small, on rear knuckle)
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2233 }),
      );
      led.position.set(0.09, 0.02, -0.85);
      camGroup.add(led);

      // Subtle glow halo around LED
      const ledHalo = new THREE.Mesh(
        new THREE.CircleGeometry(0.09, 12),
        new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      ledHalo.position.set(0.11, 0.02, -0.85);
      ledHalo.rotation.y = Math.PI / 2;
      camGroup.add(ledHalo);

      this.cameras.push({ x: cx, z: cz, mesh: camGroup, led });
    }
  }

  _addRoadworks() {
    const count = 2 + Math.floor(Math.random() * 3);
    const segs = this.roadSegments;
    for (let i = 0; i < count; i++) {
      const seg = segs[Math.floor(Math.random() * segs.length)];
      const t = 0.2 + Math.random() * 0.6;
      const x = seg.x1 + (seg.x2 - seg.x1) * t;
      const z = seg.z1 + (seg.z2 - seg.z1) * t;

      const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6a00 });
      for (let c = -1; c <= 1; c++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 0.9, 8),
          coneMat,
        );
        cone.position.set(x + c * 0.8, 0.45, z);
        cone.castShadow = this.castShadows;
        this.scene.add(cone);
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.22, 0.1, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff }),
        );
        band.position.set(x + c * 0.8, 0.5, z);
        this.scene.add(band);
      }
      this.obstacles.push({
        x1: x - 1.5,
        z1: z - 0.5,
        x2: x + 1.5,
        z2: z + 0.5,
      });
    }
  }

  _addLamps() {
    if (!this.isNight) return;
    const g = this.gridSize;
    const xs = this.xCoords;
    const zs = this.zCoords;
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });

    for (let j = 0; j <= g; j++) {
      const roadZ = zs[j];
      for (let seg = 0; seg < g; seg++) {
        const segCenter = (xs[seg] + xs[seg + 1]) / 2;
        for (const side of [-1, 1]) {
          this._createStreetLamp(segCenter, roadZ + side * 5.5, lampMat, lampHeadMat);
        }
      }
    }
    for (let i = 0; i <= g; i++) {
      const roadX = xs[i];
      for (let seg = 0; seg < g; seg++) {
        const segCenter = (zs[seg] + zs[seg + 1]) / 2;
        for (const side of [-1, 1]) {
          this._createStreetLamp(roadX + side * 5.5, segCenter, lampMat, lampHeadMat);
        }
      }
    }
  }

  _createStreetLamp(x, z, poleMat, headMat) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6),
      poleMat
    );
    pole.position.set(x, 2.75, z);
    pole.castShadow = this.castShadows;
    this.scene.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.15, 0.35),
      headMat
    );
    head.position.set(x, 5.5, z);
    this.scene.add(head);
  }

  _createSignBoard(type) {
    const boardGroup = new THREE.Group();

    const createTriangleGeometry = (size, inverted = false) => {
      const geom = new THREE.BufferGeometry();
      const h = size * Math.sqrt(3) / 2;
      const vertices = inverted ? new Float32Array([
        -size/2, h/2, 0,
        size/2, h/2, 0,
        0, -h/2, 0
      ]) : new Float32Array([
        -size/2, -h/2, 0,
        size/2, -h/2, 0,
        0, h/2, 0
      ]);
      geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geom.computeVertexNormals();
      return geom;
    };

    if (type === 'D-1') {
      // Droga z pierwszeństwem (czarno-biało-żółty romb)
      // Czarny tył i obwódka
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.65, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
      );
      back.rotation.z = Math.PI / 4;
      boardGroup.add(back);

      // Biały środek
      const mid = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.58, 0.022),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      mid.rotation.z = Math.PI / 4;
      boardGroup.add(mid);

      // Żółty kwadrat wewnętrzny
      const front = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.38, 0.024),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 })
      );
      front.rotation.z = Math.PI / 4;
      boardGroup.add(front);

    } else if (type === 'A-7') {
      // Ustąp pierwszeństwa (odwrócony żółty trójkąt z czerwoną obwódką)
      const redTriangleGeo = createTriangleGeometry(0.75, true);
      const redMesh = new THREE.Mesh(redTriangleGeo, new THREE.MeshBasicMaterial({ color: 0xcc2222, side: THREE.DoubleSide }));
      boardGroup.add(redMesh);

      const yellowTriangleGeo = createTriangleGeometry(0.53, true);
      const yellowMesh = new THREE.Mesh(yellowTriangleGeo, new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide }));
      yellowMesh.position.z = 0.005;
      boardGroup.add(yellowMesh);

    } else if (type === 'D-6') {
      // Przejście dla pieszych (realistyczny polski znak D-6 ze zdjęcia)
      
      // 1. Biały prostopadłościan (tył / obwódka)
      const whiteBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.65, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      boardGroup.add(whiteBack);

      // 2. Niebieski kwadrat na wierzchu (mniejszy, aby odsłonić białą obwódkę)
      const blueBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.61, 0.61, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x0044aa })
      );
      blueBox.position.z = 0.002;
      boardGroup.add(blueBox);

      // 3. Duży biały trójkąt wpisany w niebieski kwadrat
      const whiteTriGeo = createTriangleGeometry(0.56, false);
      const whiteTri = new THREE.Mesh(
        whiteTriGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      );
      whiteTri.position.set(0, -0.05, 0.013);
      boardGroup.add(whiteTri);

      // 4. Trzy czarne poziome kreski (pasy zebry) na tle trójkąta pod nogami pieszego
      const zebraGroup = new THREE.Group();
      zebraGroup.position.set(0, -0.10, 0.015);
      const zebraMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      
      const stripeW = 0.09;
      const stripeH = 0.015;
      const stripeD = 0.002;
      const stripeLeft = new THREE.Mesh(new THREE.BoxGeometry(stripeW, stripeH, stripeD), zebraMat);
      stripeLeft.position.set(-0.13, 0, 0);
      zebraGroup.add(stripeLeft);

      const stripeMid = new THREE.Mesh(new THREE.BoxGeometry(stripeW, stripeH, stripeD), zebraMat);
      stripeMid.position.set(0, 0, 0);
      zebraGroup.add(stripeMid);

      const stripeRight = new THREE.Mesh(new THREE.BoxGeometry(stripeW, stripeH, stripeD), zebraMat);
      stripeRight.position.set(0.13, 0, 0);
      zebraGroup.add(stripeRight);

      boardGroup.add(zebraGroup);

      // 5. Ulepszona czarna sylwetka pieszego
      const pedGroup = new THREE.Group();
      pedGroup.position.set(0, -0.05, 0.017); // Wyśrodkowana w układzie znaku
      const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

      // Głowa
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), blackMat);
      head.position.set(-0.015, 0.13, 0);
      pedGroup.add(head);

      // Tułów
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.005), blackMat);
      torso.rotation.z = 0.15; // Pochylenie w lewo (do przodu)
      torso.position.set(0, 0.05, 0);
      pedGroup.add(torso);

      // Lewa ręka (front, wysunięta w lewo/dół)
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 0.005), blackMat);
      leftArm.rotation.z = -0.65; // Kąt ujemny kieruje rękę w dół-lewo
      leftArm.position.set(-0.035, 0.05, 0.001);
      pedGroup.add(leftArm);

      // Prawa ręka (back, idąca w dół/prawo)
      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 0.005), blackMat);
      rightArm.rotation.z = 0.15; // Kąt dodatni kieruje rękę w dół-prawo
      rightArm.position.set(0.02, 0.05, -0.001);
      pedGroup.add(rightArm);

      // Lewa noga (przednia, wysunięta mocno w lewo/dół)
      const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.10, 0.005), blackMat);
      leftLeg.rotation.z = -0.5; // Kąt ujemny kieruje nogę w dół-lewo
      leftLeg.position.set(-0.03, -0.04, 0.001);
      pedGroup.add(leftLeg);

      // Lewa stopa (pozioma kreska na końcu lewej nogi)
      const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.005), blackMat);
      leftFoot.position.set(-0.055, -0.085, 0.001);
      pedGroup.add(leftFoot);

      // Prawa noga (tylna, wysunięta w prawo/dół)
      const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.10, 0.005), blackMat);
      rightLeg.rotation.z = 0.5; // Kąt dodatni kieruje nogę w dół-prawo
      rightLeg.position.set(0.03, -0.04, -0.001);
      pedGroup.add(rightLeg);

      // Prawa stopa (pozioma kreska na końcu prawej nogi)
      const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.005), blackMat);
      rightFoot.position.set(0.055, -0.085, -0.001);
      pedGroup.add(rightFoot);

      boardGroup.add(pedGroup);
    }

    return boardGroup;
  }

  _createSign(x, z, type, rotationY) {
    const group = new THREE.Group();

    // Słupek znaku (szary cylinder)
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6),
      poleMat
    );
    pole.position.y = 1.4;
    pole.castShadow = this.castShadows;
    group.add(pole);

    const board = this._createSignBoard(type);
    board.position.set(0, 2.5, 0.07); // Odsunięcie w osi Z, aby słupek nie przechodził przez środek znaku
    group.add(board);

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.scene.add(group);
    return group;
  }

  _createDoubleSign(x, z, topType, bottomType, rotationY) {
    const group = new THREE.Group();

    // Słupek znaku (szary cylinder)
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6),
      poleMat
    );
    pole.position.y = 1.4;
    pole.castShadow = this.castShadows;
    group.add(pole);

    // Górny znak (np. Ustąp pierwszeństwa A-7)
    const topBoard = this._createSignBoard(topType);
    topBoard.position.set(0, 2.5, 0.07); // Odsunięcie w osi Z
    group.add(topBoard);

    // Dolny znak (np. Przejście dla pieszych D-6)
    const bottomBoard = this._createSignBoard(bottomType);
    bottomBoard.position.set(0, 1.6, 0.07); // Odsunięcie w osi Z i obniżenie na słupku
    group.add(bottomBoard);

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.scene.add(group);
    return group;
  }

  // ============================================================
  // Helpery do gameplayu
  // ============================================================

  isOnSidewalk(x, z) {
    for (const s of this.sidewalks) {
      if (x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2) return true;
    }
    return false;
  }

  isOnRoad(x, z) {
    if (
      x < this.bounds.min ||
      x > this.bounds.max ||
      z < this.bounds.min ||
      z > this.bounds.max
    )
      return false;
    const roadHalf = 4;
    for (const seg of this.roadSegments) {
      if (seg.axis === "h") {
        if (
          Math.abs(z - seg.z1) <= roadHalf &&
          x >= seg.x1 &&
          x <= seg.x2
        )
          return true;
      } else {
        if (
          Math.abs(x - seg.x1) <= roadHalf &&
          z >= seg.z1 &&
          z <= seg.z2
        )
          return true;
      }
    }
    return false;
  }

  isOnSafeGround(x, z) {
    if (this.isOnSidewalk(x, z)) return true;
    if (
      x < this.bounds.min ||
      x > this.bounds.max ||
      z < this.bounds.min ||
      z > this.bounds.max
    )
      return false;
    return !this.isOnRoad(x, z) && !this.isOnCrossing(x, z);
  }

  isOnCrossing(x, z) {
    for (const c of this.crossings) {
      if (x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2) return c;
    }
    return null;
  }

  collidesBuilding(x, z, r = 0.6) {
    for (const b of this.buildings) {
      if (x + r > b.x1 && x - r < b.x2 && z + r > b.z1 && z - r < b.z2)
        return true;
    }
    for (const o of this.obstacles) {
      if (x + r > o.x1 && x - r < o.x2 && z + r > o.z1 && z - r < o.z2)
        return true;
    }
    return false;
  }

  farSpawn(fromX, fromZ, minDist = 60) {
    const candidates = this.spawnPoints
      .map((p) => ({ p, d: Math.hypot(p.x - fromX, p.z - fromZ) }))
      .filter((o) => o.d > minDist)
      .sort((a, b) => b.d - a.d);
    if (!candidates.length) return this.spawnPoints[0];
    return candidates[
      Math.floor(Math.random() * Math.min(5, candidates.length))
    ].p;
  }

  randomSidewalkPoint() {
    return this.spawnPoints[
      Math.floor(Math.random() * this.spawnPoints.length)
    ];
  }
}
