// === City generation: grid-based blocks, roads, sidewalks, crossings, lights ===
import * as THREE from "three";
import { PALETTE } from "./config.js";

export class City {
  constructor(scene, zone, isNight, models = null) {
    this.scene = scene;
    this.zone = zone;
    this.isNight = isNight;
    this.blockSize = zone.blockSize;
    this.gridSize = zone.gridSize;
    this.size = this.gridSize * this.blockSize;

    // Tracked entities
    this.crossings = []; // [{x,z, axis:'h'|'v', light:obj}]
    this.trafficLights = []; // [{group, state, timer, pos, axis, redMat, greenMat, amberMat}]
    this.cameras = []; // [{x,z, mesh}]
    this.intersections = []; // [{x,z}]
    this.roadSegments = []; // [{x1,z1,x2,z2, axis:'h'|'v'}]
    this.sidewalks = []; // [{x1,z1,x2,z2, axis}]
    this.spawnPoints = []; // sidewalk corners
    this.buildings = []; // collision boxes
    this.obstacles = []; // roadworks etc.
    this.tramRails = []; // rail segments in downtown
    this.pedestrianLights = []; // [{group, state, redMat, grnMat, linkedVehicle}]
    this.models = models;

    this._build();
  }

  // World coords: city centered around (0,0). Grid coords in [-(g/2)..(g/2)]
  cellToWorld(i, j) {
    return {
      x: (i - this.gridSize / 2) * this.blockSize,
      z: (j - this.gridSize / 2) * this.blockSize,
    };
  }

  _build() {
    const g = this.gridSize,
      bs = this.blockSize;
    const half = (g * bs) / 2;
    const roadWidth = 8;

    // === Ground (grass base) - PLASKI, ponizej dróg ===
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
    ground.receiveShadow = true;
    ground.position.y = -0.08;
    this.scene.add(ground);

    // === Roads: full grid (every blockSize) ===
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

    // Roads (horizontal and vertical bands)
    for (let i = 0; i <= g; i++) {
      const coord = i * bs - half;
      // Horizontal road
      const hRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(this.size, roadWidth),
        roadMat,
      );
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0, coord);
      hRoad.receiveShadow = true;
      this.scene.add(hRoad);
      this.roadSegments.push({
        x1: -half,
        z1: coord,
        x2: half,
        z2: coord,
        axis: "h",
      });

      // Vertical road
      const vRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth, this.size),
        roadMat,
      );
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(coord, 0, 0);
      vRoad.receiveShadow = true;
      this.scene.add(vRoad);
      this.roadSegments.push({
        x1: coord,
        z1: -half,
        x2: coord,
        z2: half,
        axis: "v",
      });

      // Lane lines (dashed yellow center)
      this._addLaneLines(0, coord, this.size, roadWidth, "h");
      this._addLaneLines(coord, 0, roadWidth, this.size, "v");
    }

    // === Blocks: sidewalk frame + building cluster ===
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g; j++) {
        const cx = (i + 0.5) * bs - half;
        const cz = (j + 0.5) * bs - half;
        // Leave a wider gap (3m on each side) between road edge and sidewalk
        // so zebra crossings fit entirely on the road, not on the curb.
        const innerSize = bs - roadWidth - 6;
        const sidewalkSize = innerSize;
        const buildArea = innerSize - 2;

        // Sidewalk slab
        const sw = new THREE.Mesh(
          new THREE.BoxGeometry(sidewalkSize, 0.12, sidewalkSize),
          sidewalkMat,
        );
        sw.position.set(cx, 0.06, cz);
        sw.receiveShadow = true;
        this.scene.add(sw);
        this.sidewalks.push({
          x1: cx - sidewalkSize / 2,
          z1: cz - sidewalkSize / 2,
          x2: cx + sidewalkSize / 2,
          z2: cz + sidewalkSize / 2,
        });

        // Curb edges (subtle)
        const curbT = 0.18;
        const curbW = 0.4;
        // Place curb just outside the sidewalk slab so it sits in the road-side gap,
        // not on top of the slab where it would overlap zebra-crossing stripes.
        const curbOff = sidewalkSize / 2 + curbW / 2;
        for (const [dx, dz, w, d] of [
          [0, -curbOff, sidewalkSize, curbW],
          [0, curbOff, sidewalkSize, curbW],
          [-curbOff, 0, curbW, sidewalkSize],
          [curbOff, 0, curbW, sidewalkSize],
        ]) {
          const c = new THREE.Mesh(
            new THREE.BoxGeometry(w, curbT, d),
            curbMat,
          );
          c.position.set(cx + dx, curbT / 2 + 0.12, cz + dz);
          this.scene.add(c);
        }

        // Buildings inside block (1-4 buildings, low-poly)
        this._buildBuildings(cx, cz, buildArea);

        // Spawn points (corners of sidewalk) — skip any inside a building
        const off = sidewalkSize / 2 - 1.5;
        for (const pt of [
          { x: cx - off, z: cz - off },
          { x: cx + off, z: cz - off },
          { x: cx - off, z: cz + off },
          { x: cx + off, z: cz + off },
        ]) {
          if (!this.collidesBuilding(pt.x, pt.z, 0.6))
            this.spawnPoints.push(pt);
        }
      }
    }

    // === Intersections + crossings + lights ===
    // Polish convention: vehicle signal sits on the driver's right, just BEFORE
    // the stop line/crossing. Pedestrian signals sit on both curbs at each end
    // of a crossing, lamps facing into the crossing area.
    const crossOff = roadWidth / 2 + 1.5;               // 5.5 – crossing center from intersection
    const crossWidth = 3.0;
    const roadHalf = roadWidth / 2;                     // 4
    const sigOff = crossOff + crossWidth / 2 + 0.5;  // 7.5 – signal post just past crossing on approach side

    for (let i = 1; i < g; i++) {
      for (let j = 1; j < g; j++) {
        const x = i * bs - half;
        const z = j * bs - half;
        this.intersections.push({ x, z });

        // --- Vehicle signals (one per approach arm, right-hand side, BEFORE the intersection) ---
        // Right-hand traffic: vehicle is on the half-road closer to the curb on its right.
        // Pole sits on that curb, lamps face the oncoming driver.
        // Vehicles coming FROM SOUTH (drive -Z, on +X half): pole SE of intersection, lamps face +Z.
        const tlForSouth = this._addTrafficLight(x + roadHalf + 0.5, z + sigOff, 'ns', 0, x, z);
        // Vehicles FROM NORTH (drive +Z, on -X half): pole NW, lamps face -Z.
        const tlForNorth = this._addTrafficLight(x - roadHalf - 0.5, z - sigOff, 'ns', Math.PI, x, z);
        // Vehicles FROM WEST (drive +X, on +Z half): pole SW, lamps face -X.
        const tlForWest = this._addTrafficLight(x - sigOff, z + roadHalf + 0.5, 'ew', -Math.PI / 2, x, z);
        // Vehicles FROM EAST (drive -X, on -Z half): pole NE, lamps face +X.
        const tlForEast = this._addTrafficLight(x + sigOff, z - roadHalf - 0.5, 'ew', Math.PI / 2, x, z);

        // --- Pedestrian signals: 2 per crossing, on the sidewalk corners at each end. ---
        // pedCorner = sidewalk inner edge (where the curb meets the sidewalk slab). The two
        // ped lights that share a corner are offset along their own crossing axis so they
        // don't collide visually.
        const pedCorner = roadHalf + 3;      // 7 – at the far crossing edge (sidewalk side)
        const pedOff = roadHalf + 0.5;    // 4.5 – just outside road edge at crossing corner
        // North-arm crossing (peds walk E–W across NS road)
        this._addPedestrianLight(x - pedOff, z - pedCorner, Math.PI / 2, tlForNorth); // NW corner, lamps face +X (toward crossing)
        this._addPedestrianLight(x + pedOff, z - pedCorner, -Math.PI / 2, tlForNorth); // NE corner, lamps face -X
        // South-arm crossing
        this._addPedestrianLight(x - pedOff, z + pedCorner, Math.PI / 2, tlForSouth); // SW corner
        this._addPedestrianLight(x + pedOff, z + pedCorner, -Math.PI / 2, tlForSouth); // SE corner
        // East-arm crossing (peds walk N–S across EW road)
        this._addPedestrianLight(x + pedCorner, z - pedOff, 0, tlForEast); // NE corner, lamps face +Z
        this._addPedestrianLight(x + pedCorner, z + pedOff, Math.PI, tlForEast); // SE corner, lamps face -Z
        // West-arm crossing
        this._addPedestrianLight(x - pedCorner, z - pedOff, 0, tlForWest); // NW corner
        this._addPedestrianLight(x - pedCorner, z + pedOff, Math.PI, tlForWest); // SW corner

        // --- Zebra crossings ---
        // North/south arms on the NS road, peds walk E–W:
        for (const dz of [-crossOff, +crossOff]) {
          this._addZebra(x, z + dz, 'x', roadWidth, crossWidth);
          const lightObj = dz < 0 ? tlForNorth : tlForSouth;
          this.crossings.push({
            x, z: z + dz, axis: 'h', light: lightObj,
            x1: x - roadWidth / 2, z1: z + dz - crossWidth / 2,
            x2: x + roadWidth / 2, z2: z + dz + crossWidth / 2,
          });
        }
        // East/west arms on the EW road, peds walk N–S:
        for (const dx of [-crossOff, +crossOff]) {
          this._addZebra(x + dx, z, 'z', roadWidth, crossWidth);
          const lightObj = dx < 0 ? tlForWest : tlForEast;
          this.crossings.push({
            x: x + dx, z, axis: 'v', light: lightObj,
            x1: x + dx - crossWidth / 2, z1: z - roadWidth / 2,
            x2: x + dx + crossWidth / 2, z2: z + roadWidth / 2,
          });
        }
      }
    }

    // Link N-S and E-W lights so they oppose each other (per intersection)
    this._linkTrafficLights();

    // === Cameras (Avigilon) ===
    this._placeCameras();

    // === Roadworks obstacles ===
    if (this.zone.id === "industrial" || this.zone.id === "highway") {
      this._addRoadworks();
    }

    // === Street lamps (night atmosphere) ===
    this._addLamps();

    // === Boundary box ===
    this.bounds = { min: -half, max: half };
  }

  _addLaneLines(cx, cz, w, d, axis) {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bs = this.blockSize;
    const g = this.gridSize;
    const half = (g * bs) / 2;
    // Exclusion radius around each intersection center (covers intersection box + crossings + dash length margin)
    const excludeR = 8.5; // crossOff(5.5) + crossWidth/2(1.5) + dashLen/2(1) + margin(0.5)

    // Collect all road grid coordinates (perpendicular roads cross at these positions)
    const roadPositions = [];
    for (let k = 0; k <= g; k++) {
      roadPositions.push(k * bs - half);
    }

    // Check if a dash position along the road is near any perpendicular road crossing
    const isNearCrossing = (pos) => {
      for (const rp of roadPositions) {
        if (Math.abs(pos - rp) < excludeR) return true;
      }
      return false;
    };

    if (axis === "h") {
      const dashLen = 2,
        gap = 2;
      for (let x = -w / 2 + 1; x < w / 2; x += dashLen + gap) {
        const worldX = cx + x;
        // Skip dashes near intersections (where vertical roads cross this horizontal road)
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
      const dashLen = 2,
        gap = 2;
      for (let z = -d / 2 + 1; z < d / 2; z += dashLen + gap) {
        const worldZ = cz + z;
        // Skip dashes near intersections (where horizontal roads cross this vertical road)
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

  // Render a zebra crossing.
  //   pedAxis: 'x' or 'z' - direction the pedestrian walks (perpendicular to vehicles)
  //   roadW: road width (= length of each stripe, spans across the road in walk direction)
  //   footprint: width of crossing along the vehicle direction
  // Real zebras: stripes are LONG in pedestrian walking direction (you walk across each bar),
  // and arrayed along the vehicle direction.
  _addZebra(cx, cz, pedAxis, roadW, footprint) {
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripeCount = 8;
    const stripeLen = footprint;           // each bar spans the full crossing width
    const totalSpan = roadW * 0.85;        // bars distributed across most of the road width
    const stripeThick = totalSpan / (stripeCount * 2 - 1);
    for (let i = 0; i < stripeCount; i++) {
      const off = -totalSpan / 2 + stripeThick / 2 + i * stripeThick * 2;
      let geo, pos;
      if (pedAxis === 'x') {
        // Peds walk X → vehicles travel Z → bars short in X (perpendicular), arrayed in X
        geo = new THREE.PlaneGeometry(stripeThick, stripeLen);
        pos = [cx + off, 0.015, cz];
      } else {
        // Peds walk Z → vehicles travel X → bars short in Z (perpendicular), arrayed in Z
        geo = new THREE.PlaneGeometry(stripeLen, stripeThick);
        pos = [cx, 0.015, cz + off];
      }
      const s = new THREE.Mesh(geo, stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(...pos);
      this.scene.add(s);
    }
  }

  _addTrafficLight(x, z, axis, rotationY = 0, intersectionX = x, intersectionZ = z) {
    const group = new THREE.Group();
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 4.2),
      new THREE.MeshLambertMaterial({ color: 0x222a33 })
    );
    pole.position.y = 2.1;
    pole.castShadow = true;
    group.add(pole);
    // Housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.6, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1a1f28 })
    );
    housing.position.y = 4.0;
    group.add(housing);

    // 3 lamps
    const redMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0x220000, emissiveIntensity: 0.4 });
    const ambMat = new THREE.MeshStandardMaterial({ color: 0x553f00, emissive: 0x221800, emissiveIntensity: 0.4 });
    const grnMat = new THREE.MeshStandardMaterial({ color: 0x005522, emissive: 0x002211, emissiveIntensity: 0.4 });
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), redMat);
    red.position.set(0, 4.55, 0.26);
    const amb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), ambMat);
    amb.position.set(0, 4.05, 0.26);
    const grn = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), grnMat);
    grn.position.set(0, 3.55, 0.26);
    group.add(red, amb, grn);

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.scene.add(group);

    const lightObj = {
      group, axis,
      state: 'red',           // red | green | amber
      timer: Math.random() * 6,
      cycleRed: 6.0,
      cycleGreen: 5.0,
      cycleAmber: 1.2,
      redMat, ambMat, grnMat,
      pos: { x, z },
      intersection: { x: intersectionX, z: intersectionZ },
      pairedWith: null,
    };
    this.trafficLights.push(lightObj);
    return lightObj;
  }

  _addPedestrianLight(x, z, rotationY, linkedVehicle) {
    const group = new THREE.Group();
    // Shorter, thinner pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 2.6),
      new THREE.MeshLambertMaterial({ color: 0x222a33 })
    );
    pole.position.y = 1.3;
    pole.castShadow = true;
    group.add(pole);
    // Smaller housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.95, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x1a1f28 })
    );
    housing.position.set(0, 2.85, 0);
    group.add(housing);
    // Two lamps: red (top = stop) and green (bottom = walk)
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

  _linkTrafficLights() {
    // Group lights by intersection center (each light carries its intersection coords).
    // Position-based grouping is unsafe with Polish-style placement because adjacent
    // intersections' near-side signals can come within ~13 units of each other.
    const groups = new Map();
    for (const tl of this.trafficLights) {
      const key = `${tl.intersection.x.toFixed(2)},${tl.intersection.z.toFixed(2)}`;
      let g = groups.get(key);
      if (!g) { g = { items: [] }; groups.set(key, g); }
      g.items.push(tl);
    }
    // Sync NS and EW
    for (const g of groups.values()) {
      const ns = g.items.filter(t => t.axis === 'ns');
      const ew = g.items.filter(t => t.axis === 'ew');
      // Initial offset: ns green when ew red
      ns.forEach(t => { t.state = 'green'; t.timer = 0; });
      ew.forEach(t => { t.state = 'red'; t.timer = 0; });
      this._applyLightVisual(ns);
      this._applyLightVisual(ew);
    }
    // Initialize pedestrian signals (opposite phase to their linked vehicle signal)
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
          mat.emissiveIntensity = on ? 1.8 : 0.25;
        }
      };
      setLamp(t.redMat, t.state === 'red', 0xff2233, 0x550000);
      setLamp(t.ambMat, t.state === 'amber', 0xffaa00, 0x553f00);
      setLamp(t.grnMat, t.state === 'green', 0x33ee55, 0x005522);
    }
  }

  updateTrafficLights(dt) {
    // Update vehicle signals
    for (const tl of this.trafficLights) {
      tl.timer += dt;
      let nextState = tl.state;
      if (tl.state === 'green' && tl.timer >= tl.cycleGreen) { nextState = 'amber'; tl.timer = 0; }
      else if (tl.state === 'amber' && tl.timer >= tl.cycleAmber) { nextState = 'red'; tl.timer = 0; }
      else if (tl.state === 'red' && tl.timer >= tl.cycleRed) { nextState = 'green'; tl.timer = 0; }
      if (nextState !== tl.state) {
        tl.state = nextState;
        this._applyLightVisual([tl]);
      }
    }
    // Update pedestrian signals: green when linked vehicle is red, red otherwise
    for (const pl of this.pedestrianLights) {
      const newState = pl.linkedVehicle.state === 'red' ? 'green' : 'red';
      if (newState !== pl.state) {
        pl.state = newState;
        this._applyPedLightVisual(pl);
      }
    }
  }

  _buildBuildings(cx, cz, area) {
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
    const MODEL_SCALE = 10;
    const GAP = 0.5; // minimum gap between buildings
    const count = 1 + Math.floor(Math.random() * 3);

    const placed = []; // AABBs already placed in this block

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

      let actualW = nativeSize.x * MODEL_SCALE;
      let actualD = nativeSize.z * MODEL_SCALE;

      // Scale down if the model is too large for the block
      const maxDim = area;
      let fitScale = MODEL_SCALE;
      if (actualW > maxDim || actualD > maxDim) {
        const scaleFactor = Math.min(maxDim / actualW, maxDim / actualD);
        fitScale = MODEL_SCALE * scaleFactor;
        actualW *= scaleFactor;
        actualD *= scaleFactor;
      }

      // Clamp offset so model stays inside the block
      const maxOffX = Math.max(0, (area - actualW) / 2);
      const maxOffZ = Math.max(0, (area - actualD) / 2);

      // First building (placed[] empty) always fits. Subsequent ones get 15 attempts.
      let offX = 0,
        offZ = 0,
        fits = false;
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
      obj.position.set(cx + offX, 0.12, cz + offZ);
      obj.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);

      obj.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(obj);

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
    const neonPalette = PALETTE.neon || [0x00ffaa, 0xff00ff, 0x00aaff, 0xff6600, 0xaa00ff, 0x00ffff];
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
        metalness: 0.15,
      });
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      bldg.position.set(cx + offX, h / 2 + 0.12, cz + offZ);
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      this.scene.add(bldg);

      // Cokół (ciemniejszy parter)
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.03, 1.5, d * 1.03),
        new THREE.MeshStandardMaterial({
          color: 0x1a2030,
          roughness: 0.7,
        }),
      );
      base.position.set(cx + offX, 0.75 + 0.12, cz + offZ);
      base.receiveShadow = true;
      this.scene.add(base);

      // Gzyms na górze
      const cornice = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.05, 0.25, d * 1.05),
        new THREE.MeshStandardMaterial({
          color: 0x1a2035,
          roughness: 0.6,
        }),
      );
      cornice.position.set(cx + offX, h + 0.12, cz + offZ);
      this.scene.add(cornice);

      this._addWindows(bldg, w, h, d);

      // === NEON ACCENT STRIPS on buildings ===
      if (this.isNight && Math.random() > 0.25) {
        const neonColor = neonPalette[Math.floor(Math.random() * neonPalette.length)];
        // Horizontal neon strip at random height
        const stripY = 1.5 + Math.random() * (h - 3);
        const stripH = 0.12 + Math.random() * 0.1;
        for (const side of [1, -1]) {
          // Front and back neon strips
          const strip = new THREE.Mesh(
            new THREE.PlaneGeometry(w * 0.85, stripH),
            new THREE.MeshBasicMaterial({
              color: neonColor,
              transparent: true,
              opacity: 0.9,
            })
          );
          strip.position.set(0, -h / 2 + stripY, side * (d / 2 + 0.02));
          if (side < 0) strip.rotation.y = Math.PI;
          bldg.add(strip);
        }
      }

      // === GROUND FLOOR GLOW (shop fronts / storefronts) ===
      if (this.isNight && Math.random() > 0.35) {
        const shopColor = neonPalette[Math.floor(Math.random() * neonPalette.length)];
        const shopGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.6, 1.4),
          new THREE.MeshBasicMaterial({
            color: shopColor,
            transparent: true,
            opacity: 0.35,
          })
        );
        shopGlow.position.set(cx + offX, 1.2, cz + offZ + d / 2 + 0.03);
        this.scene.add(shopGlow);
      }

      // Dach
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 0.8, d * 0.7),
        new THREE.MeshStandardMaterial({
          color: 0x1a2030,
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
            color: 0x4a4e56,
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

      // Antena + blinking red light for taller buildings
      if (h > 14 && Math.random() > 0.5) {
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 3),
          new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.5,
          }),
        );
        ant.position.set(cx + offX, h + 2.5, cz + offZ);
        this.scene.add(ant);
        // Red beacon on top
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff2233 }),
        );
        beacon.position.set(cx + offX, h + 4.0, cz + offZ);
        this.scene.add(beacon);
      }

      this.buildings.push({
        x1: cx + offX - w / 2,
        z1: cz + offZ - d / 2,
        x2: cx + offX + w / 2,
        z2: cz + offZ + d / 2,
      });
    }
    // Dodaj drzewa i ławki przy chodnikach
    if (Math.random() > 0.3) this._addStreetFurniture(cx, cz, area);
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
    const trees = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < trees; i++) {
      const tx = cx + (Math.random() - 0.5) * area * 0.95;
      const tz = cz + (Math.random() - 0.5) * area * 0.95;
      // pomiń jeśli w budynku
      if (this.collidesBuilding(tx, tz, 1)) continue;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 1.6, 8),
        trunkMat,
      );
      trunk.position.set(tx, 0.92, tz);
      trunk.castShadow = true;
      this.scene.add(trunk);
      const r = 1.0 + Math.random() * 0.6;
      const leaves = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 1),
        leafMat,
      );
      leaves.position.set(tx, 2.3, tz);
      leaves.castShadow = true;
      this.scene.add(leaves);
      // dwie mniejsze "kępy" - mniej geometrycznie
      const leaves2 = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r * 0.65, 1),
        leafMat,
      );
      leaves2.position.set(tx + 0.4, 2.6, tz - 0.3);
      this.scene.add(leaves2);
    }
    // Ławka
    if (Math.random() > 0.55) {
      const bx = cx + (Math.random() - 0.5) * area * 0.7;
      const bz = cz + (Math.random() - 0.5) * area * 0.7;
      if (!this.collidesBuilding(bx, bz, 1)) {
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
        seat.castShadow = true;
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
    }
  }

  _addWindows(parent, w, h, d) {
    // At night, windows have varied glowing colors for atmospheric effect
    const nightColors = [
      { color: 0xffe9a8, emissive: 0xffd07a }, // warm yellow
      { color: 0xffc878, emissive: 0xffaa44 }, // orange warm
      { color: 0xa8c8ff, emissive: 0x6088dd }, // cool blue
      { color: 0xddaaff, emissive: 0xbb88ee }, // purple
      { color: 0x88ffcc, emissive: 0x44dd99 }, // green
      { color: 0x222222, emissive: 0x000000 }, // dark (off)
      { color: 0x222222, emissive: 0x000000 }, // dark (off) - higher chance
    ];
    const dayMat = new THREE.MeshStandardMaterial({
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
        let winMat;
        if (this.isNight) {
          const nc = nightColors[Math.floor(Math.random() * nightColors.length)];
          winMat = new THREE.MeshStandardMaterial({
            color: nc.color,
            emissive: nc.emissive,
            emissiveIntensity: nc.emissive === 0x000000 ? 0 : (0.8 + Math.random() * 1.2),
            roughness: 0.4,
          });
        } else {
          winMat = dayMat;
        }
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

  _placeCameras() {
    // Mount on intersection corners
    const positions = [];
    const used = new Set();
    for (const intr of this.intersections) {
      positions.push(intr);
    }
    positions.sort(() => Math.random() - 0.5);

    const camCount = Math.min(this.zone.cameras, positions.length);
    for (let i = 0; i < camCount; i++) {
      const p = positions[i];
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 5),
        new THREE.MeshLambertMaterial({ color: 0x333a44 }),
      );
      pole.position.set(p.x + 4, 2.5, p.z + 4);
      this.scene.add(pole);

      const cam = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.8),
        new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
      );
      cam.position.set(p.x + 4, 5.0, p.z + 4);
      this.scene.add(cam);

      // Red status LED
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff2233 }),
      );
      led.position.set(p.x + 4 + 0.3, 5.0, p.z + 4 + 0.35);
      this.scene.add(led);

      this.cameras.push({ x: p.x + 4, z: p.z + 4, mesh: cam, led });
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

      // Cone
      const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6a00 });
      for (let c = -1; c <= 1; c++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 0.9, 8),
          coneMat,
        );
        cone.position.set(x + c * 0.8, 0.45, z);
        cone.castShadow = true;
        this.scene.add(cone);
        // Reflective band
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
    // Street lamps at intersections and along roads (visual only, no PointLights)
    if (!this.isNight) return;
    const bs = this.blockSize;
    const g = this.gridSize;
    const half = (g * bs) / 2;
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });

    // Place lamps along roads at regular intervals
    for (let i = 0; i <= g; i++) {
      const roadCoord = i * bs - half;
      // Lamps along horizontal roads
      for (let seg = 0; seg < g; seg++) {
        const segCenter = (seg + 0.5) * bs - half;
        for (const side of [-1, 1]) {
          const lx = segCenter;
          const lz = roadCoord + side * 5.5;
          this._createStreetLamp(lx, lz, lampMat, lampHeadMat);
        }
      }
      // Lamps along vertical roads
      for (let seg = 0; seg < g; seg++) {
        const segCenter = (seg + 0.5) * bs - half;
        for (const side of [-1, 1]) {
          const lx = roadCoord + side * 5.5;
          const lz = segCenter;
          this._createStreetLamp(lx, lz, lampMat, lampHeadMat);
        }
      }
    }
  }

  _createStreetLamp(x, z, poleMat, headMat) {
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6),
      poleMat
    );
    pole.position.set(x, 2.75, z);
    pole.castShadow = true;
    this.scene.add(pole);
    // Lamp head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.15, 0.35),
      headMat
    );
    head.position.set(x, 5.5, z);
    this.scene.add(head);
    // Warm light cone
    // const light = new THREE.PointLight(0xffcc88, 1.8, 18, 2);
    // light.position.set(x, 5.3, z);
    // this.scene.add(light);
  }

  // === Helpers used by gameplay ===
  isOnSidewalk(x, z) {
    for (const s of this.sidewalks) {
      if (x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2) return true;
    }
    return false;
  }
  isOnRoad(x, z) {
    // Only consider actual road surface (within roadWidth/2 of a road center line)
    if (
      x < this.bounds.min ||
      x > this.bounds.max ||
      z < this.bounds.min ||
      z > this.bounds.max
    )
      return false;
    const roadHalf = 4; // roadWidth / 2
    for (const seg of this.roadSegments) {
      if (seg.axis === "h") {
        // Horizontal road: check if within Z band and X range
        if (
          Math.abs(z - seg.z1) <= roadHalf &&
          x >= seg.x1 &&
          x <= seg.x2
        )
          return true;
      } else {
        // Vertical road: check if within X band and Z range
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
  // Returns true if player is on any safe ground (sidewalk or grass - anything not road/crossing)
  isOnSafeGround(x, z) {
    if (this.isOnSidewalk(x, z)) return true;
    // Grass: within bounds, not on road, not on crossing
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

  // Pick a random spawn point far from a position
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

  // Random sidewalk point
  randomSidewalkPoint() {
    return this.spawnPoints[
      Math.floor(Math.random() * this.spawnPoints.length)
    ];
  }
}
