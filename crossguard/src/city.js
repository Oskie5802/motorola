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

    // Per-axis road grid coordinates: g+1 entries each, centered around 0.
    // Spacing between consecutive entries varies (shorter/longer blocks)
    // while the total city size matches gridSize * blockSize.
    this.xCoords = this._generateGridCoords(this.gridSize, this.blockSize);
    this.zCoords = this._generateGridCoords(this.gridSize, this.blockSize);

    this._build();
  }

  _generateGridCoords(g, bs) {
    const total = g * bs;
    const half = total / 2;
    // Bimodal widths: each cell is either "short" (~0.55-0.80) or "long"
    // (~1.25-1.60) of nominal. After normalisation the long/short ratio is
    // around 2:1 — clearly visible variation in road segment length.
    const widths = [];
    for (let i = 0; i < g; i++) {
      if (i % 2 === 0) widths.push(0.55 + Math.random() * 0.25);
      else widths.push(1.25 + Math.random() * 0.35);
    }
    // Shuffle so the short/long pattern isn't a regular stripe.
    for (let i = widths.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [widths[i], widths[j]] = [widths[j], widths[i]];
    }
    const sum = widths.reduce((a, b) => a + b, 0);
    const scale = g / sum; // normalise so sum(widths)*bs == total
    for (let i = 0; i < g; i++) widths[i] *= bs * scale;
    const coords = [-half];
    for (let i = 0; i < g; i++) coords.push(coords[i] + widths[i]);
    coords[g] = half; // pin exact end to avoid float drift
    return coords;
  }

  // World coords of the (i,j) grid corner (= intersection center for inner i,j).
  cellToWorld(i, j) {
    return { x: this.xCoords[i], z: this.zCoords[j] };
  }

  _build() {
    const g = this.gridSize,
      bs = this.blockSize;
    const half = (g * bs) / 2;
    const roadWidth = 8;
    // Set bounds early — some helpers (isOnRoad) read this during block setup.
    this.bounds = { min: -half, max: half };

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

    const xs = this.xCoords;
    const zs = this.zCoords;

    // Horizontal roads (constant z, span full city in x)
    for (let j = 0; j <= g; j++) {
      const coord = zs[j];
      const hRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(this.size, roadWidth),
        roadMat,
      );
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0, coord);
      hRoad.receiveShadow = true;
      this.scene.add(hRoad);
      this.roadSegments.push({
        x1: -half, z1: coord, x2: half, z2: coord, axis: "h",
      });
      this._addLaneLines(0, coord, this.size, roadWidth, "h");
    }
    // Vertical roads (constant x, span full city in z)
    for (let i = 0; i <= g; i++) {
      const coord = xs[i];
      const vRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth, this.size),
        roadMat,
      );
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(coord, 0, 0);
      vRoad.receiveShadow = true;
      this.scene.add(vRoad);
      this.roadSegments.push({
        x1: coord, z1: -half, x2: coord, z2: half, axis: "v",
      });
      this._addLaneLines(coord, 0, roadWidth, this.size, "v");
    }

    // === Blocks: sidewalk frame + building cluster ===
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g; j++) {
        const cellW = xs[i + 1] - xs[i];
        const cellD = zs[j + 1] - zs[j];
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cz = (zs[j] + zs[j + 1]) / 2;
        // Leave a wider gap (3m on each side) between road edge and sidewalk
        // so zebra crossings fit entirely on the road, not on the curb.
        const sidewalkW = cellW - roadWidth - 6;
        const sidewalkD = cellD - roadWidth - 6;
        const buildAreaW = sidewalkW - 2;
        const buildAreaD = sidewalkD - 2;

        // Sidewalk slab
        const sw = new THREE.Mesh(
          new THREE.BoxGeometry(sidewalkW, 0.12, sidewalkD),
          sidewalkMat,
        );
        sw.position.set(cx, 0.06, cz);
        sw.receiveShadow = true;
        this.scene.add(sw);
        this.sidewalks.push({
          x1: cx - sidewalkW / 2,
          z1: cz - sidewalkD / 2,
          x2: cx + sidewalkW / 2,
          z2: cz + sidewalkD / 2,
        });

        // Curb edges
        const curbT = 0.28;
        const curbW = 0.55;
        // Place curb at the road edge (transition from road to walkable area).
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

        // Buildings inside block (1-4 buildings, low-poly)
        this._buildBuildings(cx, cz, Math.min(buildAreaW, buildAreaD));

        // Trees scattered on the sidewalk slab around the buildings
        this._addBlockTrees(cx, cz, sidewalkW, sidewalkD);

        // Spawn points (corners of sidewalk) — skip any inside a building
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
        const x = xs[i];
        const z = zs[j];
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
    // Exclusion radius around each intersection center (covers intersection box + crossings + dash length margin)
    const excludeR = 8.5; // crossOff(5.5) + crossWidth/2(1.5) + dashLen/2(1) + margin(0.5)

    // Dashes on a horizontal road get interrupted at every vertical road (x = xCoords[i]);
    // dashes on a vertical road get interrupted at every horizontal road (z = zCoords[j]).
    const roadPositions = axis === "h" ? this.xCoords : this.zCoords;

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
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.6, roughness: 0.5 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.4, roughness: 0.6 });
    const backboardMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.3, roughness: 0.8 });

    // Pole (taller, tapered)
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 4.6, 12),
      poleMat
    );
    pole.position.y = 2.3;
    pole.castShadow = true;
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
    housing.castShadow = true;
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
      state: 'red',           // red | green | amber
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
      if (!g) { g = { items: [], x: tl.intersection.x, z: tl.intersection.z }; groups.set(key, g); }
      g.items.push(tl);
    }

    // Pick a random arterial row (constant z) and column (constant x). Intersections
    // on these get a "green wave": phases aligned so cars travelling at waveSpeed
    // along the arterial hit consecutive greens. All other intersections get
    // independent random phases so the city doesn't tick in lockstep.
    const arterialJ = 1 + Math.floor(Math.random() * Math.max(1, this.gridSize - 1));
    const arterialI = 1 + Math.floor(Math.random() * Math.max(1, this.gridSize - 1));
    const arterialZ = this.zCoords[arterialJ];
    const arterialX = this.xCoords[arterialI];
    const waveSpeed = 11;             // m/s — target speed cars must drive to ride the wave
    const arterialGreen = 6.5;        // longer green on the arterial direction
    const arterialCross = 4.0;        // shorter green on the crossing direction
    const arterialAmber = 1.3;
    const arterialCycle = arterialGreen + arterialAmber + arterialCross + arterialAmber;

    for (const grp of groups.values()) {
      const ns = grp.items.filter(t => t.axis === 'ns');
      const ew = grp.items.filter(t => t.axis === 'ew');

      // Decide if this intersection is on an arterial.
      const onArterialEW = Math.abs(grp.z - arterialZ) < 0.5; // EW road runs along constant z
      const onArterialNS = Math.abs(grp.x - arterialX) < 0.5;

      let nsGreen, ewGreen, amber, phase;
      if (onArterialEW) {
        // EW gets the long green; NS is the cross street
        ewGreen = arterialGreen;
        nsGreen = arterialCross;
        amber = arterialAmber;
        // Phase chosen so EW green starts at t = x / waveSpeed at this intersection.
        // Cycle phase progresses as (t + offset) mod fullCycle. EW green window
        // begins at phase nsGreen + amber. Solve offset = nsGreen+amber - x/waveSpeed.
        const fullCycle = arterialCycle;
        phase = ((nsGreen + amber - grp.x / waveSpeed) % fullCycle + fullCycle) % fullCycle;
      } else if (onArterialNS) {
        nsGreen = arterialGreen;
        ewGreen = arterialCross;
        amber = arterialAmber;
        const fullCycle = arterialCycle;
        // NS green window begins at phase 0. Solve offset = 0 - z/waveSpeed.
        phase = ((-grp.z / waveSpeed) % fullCycle + fullCycle) % fullCycle;
      } else {
        // Off-arterial: randomise each intersection independently.
        nsGreen = 3.5 + Math.random() * 4.0;   // 3.5 – 7.5 s
        ewGreen = 3.5 + Math.random() * 4.0;
        amber = 1.0 + Math.random() * 0.6;     // 1.0 – 1.6 s
        const fullCycle = nsGreen + amber + ewGreen + amber;
        phase = Math.random() * fullCycle;
      }

      const fullCycle = nsGreen + amber + ewGreen + amber;

      // Assign cycle durations. Red duration for each axis = opposite axis green + amber,
      // so the state machine never lets both axes be green simultaneously.
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

      // Map phase position in the joint cycle to (state, timer) per axis.
      // Joint cycle layout (starting at NS-green-begins):
      //   [0, nsGreen)                              : NS green, EW red (just turned)
      //   [nsGreen, nsGreen+amber)                  : NS amber, EW red
      //   [nsGreen+amber, nsGreen+amber+ewGreen)    : NS red (just turned), EW green
      //   [nsGreen+amber+ewGreen, fullCycle)        : NS red, EW amber
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
    const FLASH_DURATION = 3.0;  // seconds of flashing green before ped turns red
    const FLASH_INTERVAL = 0.35; // on/off period

    // Update vehicle signals and mark pedestrian-flash window
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
      // Pedestrian flash window: last FLASH_DURATION seconds of the vehicle red phase
      tl._pedFlashing = tl.state === 'red' && (tl.cycleRed - tl.timer) <= FLASH_DURATION;
    }

    // Update pedestrian signals with flashing support
    for (const pl of this.pedestrianLights) {
      const veh = pl.linkedVehicle;
      if (veh.state !== 'red') {
        // Vehicle green/amber → ped red
        pl._flashTimer = 0;
        if (pl.state !== 'red') { pl.state = 'red'; this._applyPedLightVisual(pl); }
      } else if (veh._pedFlashing) {
        // Last N seconds of ped green → flash
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
        // Solid pedestrian green
        pl._flashTimer = 0;
        if (pl.state !== 'green') { pl.state = 'green'; this._applyPedLightVisual(pl); }
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
    const MIN_SCALE = 7;
    const MAX_SCALE = 30; // allow significant upscale so tiny natives still fill big blocks
    const GAP = 0.5; // minimum gap between buildings
    // Prefer one chunky building per block; occasionally two in larger blocks.
    const count = area > 22 && Math.random() < 0.5 ? 2 : 1;
    // Per-building target fill: nearly fill the block when alone.
    const targetFill = count === 1 ? 0.92 : 0.62;

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

      // Choose a fit scale that brings the model's larger footprint dimension
      // to `targetFill * area`. Then clamp to [MIN_SCALE, MAX_SCALE] and a hard
      // cap so we never exceed the block.
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
          // Night lighting is very dim (ambient ~0.15); without an
          // emissive contribution the Kenney models render almost black.
          // Reuse the diffuse colormap as an emissive map so each building
          // self-illuminates with its own texture colors.
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
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      this.scene.add(bldg);

      // Cokół (ciemniejszy parter)
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.03, 1.5, d * 1.03),
        new THREE.MeshStandardMaterial({
          color: 0x3a4150,
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
      // Antena dla wyższych budynków
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
    // Dodaj drzewa i ławki przy chodnikach
    if (Math.random() > 0.3) this._addStreetFurniture(cx, cz, area);
  }

  _addBlockTrees(cx, cz, sidewalkW, sidewalkD) {
    // Scatters trees on the sidewalk slab around the buildings, leaving a small
    // inset from the slab edge so they don't hang over the curb.
    const trunkMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x2a1c0e : 0x5b3a1d,
      roughness: 0.9,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x142820 : 0x4a8a3f,
      roughness: 0.85,
    });
    // Tree foliage radius (~1.4m) must fit on the sidewalk slab without
    // overhanging the curb / road / crossings. Skip blocks too narrow.
    const treeR = 1.4;
    const halfX = sidewalkW / 2 - treeR;
    const halfZ = sidewalkD / 2 - treeR;
    if (halfX < 0.5 || halfZ < 0.5) return;
    // Target ~one tree per ~14 m² of plantable area.
    const plantable = Math.max(0, halfX * 2) * Math.max(0, halfZ * 2);
    const target = Math.min(10, Math.max(2, Math.round(plantable / 14)));
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
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 1.6, 8),
      trunkMat,
    );
    trunk.position.set(tx, 0.92, tz);
    trunk.castShadow = true;
    this.scene.add(trunk);
    const r = 0.9 + Math.random() * 0.5;
    const leaves = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      leafMat,
    );
    leaves.position.set(tx, 2.3, tz);
    leaves.castShadow = true;
    this.scene.add(leaves);
    const leaves2 = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r * 0.65, 1),
      leafMat,
    );
    leaves2.position.set(tx + 0.4, 2.6, tz - 0.3);
    this.scene.add(leaves2);
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

  _placeCameras() {
    // Mount on intersection corners
    const positions = [];
    const used = new Set();
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
      pole.castShadow = true;
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
      body.castShadow = true;
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
    const g = this.gridSize;
    const xs = this.xCoords;
    const zs = this.zCoords;
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });

    // Lamps along each horizontal road (constant z), one per block on each side
    for (let j = 0; j <= g; j++) {
      const roadZ = zs[j];
      for (let seg = 0; seg < g; seg++) {
        const segCenter = (xs[seg] + xs[seg + 1]) / 2;
        for (const side of [-1, 1]) {
          this._createStreetLamp(segCenter, roadZ + side * 5.5, lampMat, lampHeadMat);
        }
      }
    }
    // Lamps along each vertical road (constant x)
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
