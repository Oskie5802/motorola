// === City generation: grid-based blocks, roads, sidewalks, crossings, lights ===
import * as THREE from 'three';
import { PALETTE } from './config.js';

export class City {
  constructor(scene, zone, isNight) {
    this.scene = scene;
    this.zone = zone;
    this.isNight = isNight;
    this.blockSize = zone.blockSize;
    this.gridSize = zone.gridSize;
    this.size = this.gridSize * this.blockSize;

    // Tracked entities
    this.crossings = [];        // [{x,z, axis:'h'|'v', light:obj}]
    this.trafficLights = [];    // [{group, state, timer, pos, axis, redMat, greenMat, amberMat}]
    this.cameras = [];          // [{x,z, mesh}]
    this.intersections = [];    // [{x,z}]
    this.roadSegments = [];     // [{x1,z1,x2,z2, axis:'h'|'v'}]
    this.sidewalks = [];        // [{x1,z1,x2,z2, axis}]
    this.spawnPoints = [];      // sidewalk corners
    this.buildings = [];        // collision boxes
    this.obstacles = [];        // roadworks etc.
    this.tramRails = [];        // rail segments in downtown

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
    const g = this.gridSize, bs = this.blockSize;
    const half = (g * bs) / 2;
    const roadWidth = 8;

    // === Ground (grass base) - PLASKI, ponizej dróg ===
    const groundGeo = new THREE.PlaneGeometry(this.size + 200, this.size + 200);
    const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.08;
    this.scene.add(ground);


    // === Roads: full grid (every blockSize) ===
    const roadMat = new THREE.MeshStandardMaterial({
      color: PALETTE.road, roughness: 0.85, metalness: 0.05,
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.sidewalk, roughness: 0.9,
    });
    const curbMat = new THREE.MeshStandardMaterial({ color: PALETTE.curb, roughness: 0.8 });

    // Roads (horizontal and vertical bands)
    for (let i = 0; i <= g; i++) {
      const coord = i * bs - half;
      // Horizontal road
      const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(this.size, roadWidth), roadMat);
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0, coord);
      hRoad.receiveShadow = true;
      this.scene.add(hRoad);
      this.roadSegments.push({ x1: -half, z1: coord, x2: half, z2: coord, axis: 'h' });

      // Vertical road
      const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, this.size), roadMat);
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(coord, 0, 0);
      vRoad.receiveShadow = true;
      this.scene.add(vRoad);
      this.roadSegments.push({ x1: coord, z1: -half, x2: coord, z2: half, axis: 'v' });

      // Lane lines (dashed yellow center)
      this._addLaneLines(0, coord, this.size, roadWidth, 'h');
      this._addLaneLines(coord, 0, roadWidth, this.size, 'v');
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
        const buildArea = innerSize - 6;

        // Sidewalk slab
        const sw = new THREE.Mesh(
          new THREE.BoxGeometry(sidewalkSize, 0.12, sidewalkSize),
          sidewalkMat
        );
        sw.position.set(cx, 0.06, cz);
        sw.receiveShadow = true;
        this.scene.add(sw);
        this.sidewalks.push({
          x1: cx - sidewalkSize/2, z1: cz - sidewalkSize/2,
          x2: cx + sidewalkSize/2, z2: cz + sidewalkSize/2,
        });

        // Curb edges (subtle)
        const curbT = 0.18;
        const curbW = 0.4;
        // Place curb just outside the sidewalk slab so it sits in the road-side gap,
        // not on top of the slab where it would overlap zebra-crossing stripes.
        const curbOff = sidewalkSize/2 + curbW/2;
        for (const [dx, dz, w, d] of [
          [0, -curbOff, sidewalkSize, curbW],
          [0,  curbOff, sidewalkSize, curbW],
          [-curbOff, 0, curbW, sidewalkSize],
          [ curbOff, 0, curbW, sidewalkSize],
        ]) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(w, curbT, d), curbMat);
          c.position.set(cx + dx, curbT/2 + 0.12, cz + dz);
          this.scene.add(c);
        }

        // Buildings inside block (1-4 buildings, low-poly)
        this._buildBuildings(cx, cz, buildArea);

        // Spawn points (corners of sidewalk)
        const off = sidewalkSize/2 - 1.5;
        this.spawnPoints.push(
          { x: cx - off, z: cz - off },
          { x: cx + off, z: cz - off },
          { x: cx - off, z: cz + off },
          { x: cx + off, z: cz + off },
        );
      }
    }

    // === Intersections + crossings + lights ===
    // Combined signal poles: car signal (3 lamps) on top, pedestrian signal (2 lamps) below,
    // both on the same pole. Placed on the RIGHT side of each crossing (Polish traffic convention).
    const crossOff = roadWidth/2 + 1.5;
    const crossWidth = 3.0;

    for (let i = 1; i < g; i++) {
      for (let j = 1; j < g; j++) {
        const x = i * bs - half;
        const z = j * bs - half;
        const intKey = `${i}_${j}`;
        this.intersections.push({ x, z });

        // Create 2 logical light states per intersection (NS controls N-S vehicles, EW controls E-W)
        const nsLight = this._createLightState('ns', intKey);
        const ewLight = this._createLightState('ew', intKey);

        // North arm crossing (z - crossOff): peds walk X direction
        {
          const cz = z - crossOff;
          this._addZebra(x, cz, 'x', roadWidth, crossWidth);
          // Right side poles: ped at left edge facing +X → right side is -Z; ped at right edge facing -X → right side is +Z
          const ps1 = this._addCombinedSignal(x - roadWidth/2 - 0.8, cz - 1.2, -Math.PI / 2, nsLight);
          const ps2 = this._addCombinedSignal(x + roadWidth/2 + 0.8, cz + 1.2, Math.PI / 2, nsLight);
          this.crossings.push({
            x, z: cz, axis: 'h', light: nsLight,
            x1: x - roadWidth/2, z1: cz - crossWidth/2,
            x2: x + roadWidth/2, z2: cz + crossWidth/2,
            pedSignals: [ps1, ps2],
          });
        }
        // South arm crossing (z + crossOff): peds walk X direction
        {
          const cz = z + crossOff;
          this._addZebra(x, cz, 'x', roadWidth, crossWidth);
          const ps1 = this._addCombinedSignal(x - roadWidth/2 - 0.8, cz - 1.2, -Math.PI / 2, nsLight);
          const ps2 = this._addCombinedSignal(x + roadWidth/2 + 0.8, cz + 1.2, Math.PI / 2, nsLight);
          this.crossings.push({
            x, z: cz, axis: 'h', light: nsLight,
            x1: x - roadWidth/2, z1: cz - crossWidth/2,
            x2: x + roadWidth/2, z2: cz + crossWidth/2,
            pedSignals: [ps1, ps2],
          });
        }
        // West arm crossing (x - crossOff): peds walk Z direction
        {
          const cx = x - crossOff;
          this._addZebra(cx, z, 'z', roadWidth, crossWidth);
          // Ped at top edge facing +Z → right side is +X; ped at bottom edge facing -Z → right side is -X
          const ps1 = this._addCombinedSignal(cx + 1.2, z - roadWidth/2 - 0.8, Math.PI, ewLight);
          const ps2 = this._addCombinedSignal(cx - 1.2, z + roadWidth/2 + 0.8, 0, ewLight);
          this.crossings.push({
            x: cx, z, axis: 'v', light: ewLight,
            x1: cx - crossWidth/2, z1: z - roadWidth/2,
            x2: cx + crossWidth/2, z2: z + roadWidth/2,
            pedSignals: [ps1, ps2],
          });
        }
        // East arm crossing (x + crossOff): peds walk Z direction
        {
          const cx = x + crossOff;
          this._addZebra(cx, z, 'z', roadWidth, crossWidth);
          const ps1 = this._addCombinedSignal(cx + 1.2, z - roadWidth/2 - 0.8, Math.PI, ewLight);
          const ps2 = this._addCombinedSignal(cx - 1.2, z + roadWidth/2 + 0.8, 0, ewLight);
          this.crossings.push({
            x: cx, z, axis: 'v', light: ewLight,
            x1: cx - crossWidth/2, z1: z - roadWidth/2,
            x2: cx + crossWidth/2, z2: z + roadWidth/2,
            pedSignals: [ps1, ps2],
          });
        }
      }
    }

    // Link N-S and E-W lights so they oppose each other
    this._linkTrafficLights();

    // === Cameras (Avigilon) ===
    this._placeCameras();

    // === Roadworks obstacles ===
    if (this.zone.id === 'industrial' || this.zone.id === 'highway') {
      this._addRoadworks();
    }

    // === Street lamps (every other block, more dense at night) ===
    this._addLamps();

    // === Boundary box ===
    this.bounds = { min: -half, max: half };
  }

  _addLaneLines(cx, cz, w, d, axis) {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff066 });
    if (axis === 'h') {
      const dashLen = 2, gap = 2;
      for (let x = -w/2 + 1; x < w/2; x += dashLen + gap) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(dashLen, 0.25), lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(cx + x, 0.01, cz);
        this.scene.add(line);
      }
    } else {
      const dashLen = 2, gap = 2;
      for (let z = -d/2 + 1; z < d/2; z += dashLen + gap) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, dashLen), lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(cx, 0.01, cz + z);
        this.scene.add(line);
      }
    }
  }

  _addZebra(cx, cz, pedAxis, roadW, footprint) {
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripes = 5;
    const thick = footprint / (stripes * 2 - 1);
    for (let i = 0; i < stripes; i++) {
      const off = -footprint/2 + thick/2 + i * thick * 2;
      let geo, pos;
      if (pedAxis === 'x') {
        geo = new THREE.PlaneGeometry(roadW, thick);
        pos = [cx, 0.015, cz + off];
      } else {
        geo = new THREE.PlaneGeometry(thick, roadW);
        pos = [cx + off, 0.015, cz];
      }
      const s = new THREE.Mesh(geo, stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(...pos);
      this.scene.add(s);
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff066 });
    if (pedAxis === 'x') {
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, footprint), lineMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(cx + side * (roadW/2 + 0.3), 0.012, cz);
        this.scene.add(m);
      }
    } else {
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(footprint, 0.4), lineMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(cx, 0.012, cz + side * (roadW/2 + 0.3));
        this.scene.add(m);
      }
    }
  }

  // Create a logical light state (no visual — visuals are on combined signal poles)
  _createLightState(axis, intKey) {
    const lightObj = {
      axis,
      state: 'red',
      timer: Math.random() * 6,
      cycleRed: 6.0,
      cycleGreen: 5.0,
      cycleAmber: 1.2,
      // Materials for car signal are on the combined signal poles, stored in .visuals[]
      redMat: null, ambMat: null, grnMat: null,
      pos: { x: 0, z: 0 },
      intKey,
      visuals: [], // [{redMat, ambMat, grnMat}] from each combined signal pole
    };
    this.trafficLights.push(lightObj);
    return lightObj;
  }

  // Combined signal pole: car signal (3 lamps) on top, ped signal (2 lamps) below
  _addCombinedSignal(x, z, rotY, lightState) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    const group = new THREE.Group();

    // Main pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 5.5, 8),
      poleMat
    );
    pole.position.y = 2.75;
    pole.castShadow = true;
    group.add(pole);

    // === Car signal housing (top) ===
    const carHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.6, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x1a1f28 })
    );
    carHousing.position.set(0, 5.3, 0);
    group.add(carHousing);

    // Car signal lamps
    const carRedMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0x220000, emissiveIntensity: 0.4 });
    const carAmbMat = new THREE.MeshStandardMaterial({ color: 0x553f00, emissive: 0x221800, emissiveIntensity: 0.4 });
    const carGrnMat = new THREE.MeshStandardMaterial({ color: 0x005522, emissive: 0x002211, emissiveIntensity: 0.4 });
    const carRed = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), carRedMat);
    carRed.position.set(0, 5.85, 0.24);
    const carAmb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), carAmbMat);
    carAmb.position.set(0, 5.35, 0.24);
    const carGrn = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), carGrnMat);
    carGrn.position.set(0, 4.85, 0.24);
    group.add(carRed, carAmb, carGrn);

    // === Ped signal housing (below car signal, on same pole) ===
    const pedHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.9, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x1a1f28 })
    );
    pedHousing.position.set(0, 3.6, 0);
    group.add(pedHousing);

    // Ped signal lamps (red on top = don't walk, green on bottom = walk)
    const pedRedMat = new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff2233, emissiveIntensity: 1.8 });
    const pedRed = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), pedRedMat);
    pedRed.position.set(0, 3.85, 0.18);
    group.add(pedRed);

    const pedGrnMat = new THREE.MeshStandardMaterial({ color: 0x003311, emissive: 0x001808, emissiveIntensity: 0.2 });
    const pedGrn = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), pedGrnMat);
    pedGrn.position.set(0, 3.35, 0.18);
    group.add(pedGrn);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    this.scene.add(group);

    // Register visual materials on the light state so _applyLightVisual can update them
    lightState.visuals.push({ redMat: carRedMat, ambMat: carAmbMat, grnMat: carGrnMat });
    // Use first visual's materials as the canonical ones for compatibility
    if (!lightState.redMat) {
      lightState.redMat = carRedMat;
      lightState.ambMat = carAmbMat;
      lightState.grnMat = carGrnMat;
    }
    lightState.pos = { x, z };

    return { group, redMat: pedRedMat, grnMat: pedGrnMat };
  }

  _linkTrafficLights() {
    const groups = {};
    for (const tl of this.trafficLights) {
      if (!groups[tl.intKey]) groups[tl.intKey] = [];
      groups[tl.intKey].push(tl);
    }
    for (const key of Object.keys(groups)) {
      const items = groups[key];
      const ns = items.filter(t => t.axis === 'ns');
      const ew = items.filter(t => t.axis === 'ew');
      ns.forEach(t => { t.state = 'green'; t.timer = 0; });
      ew.forEach(t => { t.state = 'red';   t.timer = 0; });
      this._applyLightVisual(ns);
      this._applyLightVisual(ew);
    }
    this._updatePedSignals();
  }

  _applyLightVisual(list) {
    for (const t of list) {
      const setLamp = (mat, on, onCol, offCol) => {
        mat.color.setHex(on ? onCol : offCol);
        if (mat.emissive) {
          mat.emissive.setHex(on ? onCol : (offCol >> 2));
          mat.emissiveIntensity = on ? 2.2 : 0.2;
        }
      };
      // Update all visual poles linked to this light state
      for (const v of (t.visuals || [t])) {
        setLamp(v.redMat, t.state === 'red',   0xff2233, 0x550000);
        setLamp(v.ambMat, t.state === 'amber', 0xffaa00, 0x553f00);
        setLamp(v.grnMat, t.state === 'green', 0x33ee55, 0x005522);
      }
    }
  }

  _updatePedSignals() {
    for (const c of this.crossings) {
      if (!c.pedSignals) continue;
      const light = c.light;
      const carState = light.state;
      const pedGreen = carState === 'red';
      // Flashing green: last 3 seconds of car red cycle, ped green blinks
      const timeLeft = light.cycleRed - light.timer;
      const flashing = pedGreen && timeLeft <= 3.0 && timeLeft > 0;
      const flashOff = flashing && (Math.floor(light.timer * 4) % 2 === 0);

      for (const ps of c.pedSignals) {
        if (pedGreen && !flashOff) {
          // Ped green ON
          ps.redMat.color.setHex(0x330808);
          ps.redMat.emissive.setHex(0x110404);
          ps.redMat.emissiveIntensity = 0.15;
          ps.grnMat.color.setHex(0x33ee55);
          ps.grnMat.emissive.setHex(0x33ee55);
          ps.grnMat.emissiveIntensity = 2.0;
        } else {
          // Ped red ON (or flash-off moment)
          ps.redMat.color.setHex(0xff2233);
          ps.redMat.emissive.setHex(0xff2233);
          ps.redMat.emissiveIntensity = 2.0;
          ps.grnMat.color.setHex(0x003311);
          ps.grnMat.emissive.setHex(0x001808);
          ps.grnMat.emissiveIntensity = 0.15;
        }
      }
    }
  }

  updateTrafficLights(dt) {
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
    this._updatePedSignals();
  }

  _buildBuildings(cx, cz, area) {
    const palette = PALETTE.building;
    const count = 1 + Math.floor(Math.random() * 3);
    const slot = area / Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const w = slot * (0.5 + Math.random() * 0.45);
      const d = slot * (0.5 + Math.random() * 0.45);
      const h = 6 + Math.random() * 14 * (this.zone.id === 'downtown' ? 1.8 : 1);
      const offX = (Math.random() - 0.5) * (area - w);
      const offZ = (Math.random() - 0.5) * (area - d);
      const col = palette[Math.floor(Math.random() * palette.length)];
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.78, metalness: 0.08 });
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      bldg.position.set(cx + offX, h/2 + 0.12, cz + offZ);
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      this.scene.add(bldg);

      // Cokół (ciemniejszy parter)
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.03, 1.5, d * 1.03),
        new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.7 })
      );
      base.position.set(cx + offX, 0.75 + 0.12, cz + offZ);
      base.receiveShadow = true;
      this.scene.add(base);

      // Gzyms na górze
      const cornice = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.05, 0.25, d * 1.05),
        new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.6 })
      );
      cornice.position.set(cx + offX, h + 0.12, cz + offZ);
      this.scene.add(cornice);

      this._addWindows(bldg, w, h, d);

      // Dach
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 0.8, d * 0.7),
        new THREE.MeshStandardMaterial({ color: 0x3a404c, roughness: 0.7 })
      );
      roof.position.set(cx + offX, h + 0.55, cz + offZ);
      this.scene.add(roof);
      // Klimatyzator na dachu
      if (Math.random() > 0.4) {
        const ac = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.6, 0.8),
          new THREE.MeshStandardMaterial({ color: 0x8a8e96, roughness: 0.5, metalness: 0.4 })
        );
        ac.position.set(cx + offX + (Math.random()-0.5)*w*0.4, h + 1.2, cz + offZ + (Math.random()-0.5)*d*0.4);
        this.scene.add(ac);
      }
      // Antena dla wyższych budynków
      if (h > 14 && Math.random() > 0.5) {
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 3),
          new THREE.MeshStandardMaterial({ color: 0xcc2233, emissive: 0x551111 })
        );
        ant.position.set(cx + offX, h + 2.5, cz + offZ);
        this.scene.add(ant);
      }

      this.buildings.push({
        x1: cx + offX - w/2, z1: cz + offZ - d/2,
        x2: cx + offX + w/2, z2: cz + offZ + d/2,
      });
    }
    // Dodaj drzewa i ławki przy chodnikach
    if (Math.random() > 0.3) this._addStreetFurniture(cx, cz, area);
  }

  _addStreetFurniture(cx, cz, area) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a1d, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.zone.timeOfDay === 'night' ? 0x244833 : 0x4a8a3f,
      roughness: 0.85,
    });
    const trees = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < trees; i++) {
      const tx = cx + (Math.random() - 0.5) * area * 0.95;
      const tz = cz + (Math.random() - 0.5) * area * 0.95;
      // pomiń jeśli w budynku
      if (this.collidesBuilding(tx, tz, 1)) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.6, 8), trunkMat);
      trunk.position.set(tx, 0.92, tz);
      trunk.castShadow = true;
      this.scene.add(trunk);
      const r = 1.0 + Math.random() * 0.6;
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
      leaves.position.set(tx, 2.3, tz);
      leaves.castShadow = true;
      this.scene.add(leaves);
      // dwie mniejsze "kępy" - mniej geometrycznie
      const leaves2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.65, 1), leafMat);
      leaves2.position.set(tx + 0.4, 2.6, tz - 0.3);
      this.scene.add(leaves2);
    }
    // Ławka
    if (Math.random() > 0.55) {
      const bx = cx + (Math.random() - 0.5) * area * 0.7;
      const bz = cz + (Math.random() - 0.5) * area * 0.7;
      if (!this.collidesBuilding(bx, bz, 1)) {
        const benchMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.7 });
        const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.4 });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), benchMat);
        seat.position.set(bx, 0.5, bz);
        seat.castShadow = true;
        this.scene.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), benchMat);
        back.position.set(bx, 0.8, bz - 0.21);
        this.scene.add(back);
        for (const sx of [-0.8, 0.8]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.4), legMat);
          leg.position.set(bx + sx, 0.25, bz);
          this.scene.add(leg);
        }
      }
    }
  }

  _addWindows(parent, w, h, d) {
    const winMat = this.isNight
      ? new THREE.MeshStandardMaterial({
          color: 0xffe9a8, emissive: 0xffd07a, emissiveIntensity: 1.1, roughness: 0.4
        })
      : new THREE.MeshStandardMaterial({
          color: 0x9bc3e6, roughness: 0.15, metalness: 0.7, emissive: 0x1a2a3a, emissiveIntensity: 0.15
        });
    const rows = Math.floor(h / 2.4);
    const cols = Math.max(1, Math.floor(w / 2.0));
    const sz = 0.6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.7) continue;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), winMat);
        win.position.set(
          -w/2 + (c + 0.5) * (w / cols),
          -h/2 + 1.5 + r * 2.4,
          d/2 + 0.02
        );
        parent.add(win);
        const winB = win.clone();
        winB.position.z = -d/2 - 0.02;
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
        new THREE.MeshLambertMaterial({ color: 0x333a44 })
      );
      pole.position.set(p.x + 4, 2.5, p.z + 4);
      this.scene.add(pole);

      const cam = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.8),
        new THREE.MeshLambertMaterial({ color: 0xeeeeee })
      );
      cam.position.set(p.x + 4, 5.0, p.z + 4);
      this.scene.add(cam);

      // Red status LED
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff2233 })
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
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8), coneMat);
        cone.position.set(x + c * 0.8, 0.45, z);
        cone.castShadow = true;
        this.scene.add(cone);
        // Reflective band
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.22, 0.1, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        band.position.set(x + c * 0.8, 0.5, z);
        this.scene.add(band);
      }
      this.obstacles.push({ x1: x - 1.5, z1: z - 0.5, x2: x + 1.5, z2: z + 0.5 });
    }
  }

  _addLamps() {
    const positions = [];
    const g = this.gridSize, bs = this.blockSize;
    const half = (g * bs) / 2;
    for (let i = 0; i <= g; i++) {
      for (let j = 0; j <= g; j++) {
        if ((i + j) % 2 === 0) continue;
        positions.push({ x: i * bs - half, z: j * bs - half });
      }
    }
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6, metalness: 0.5 });
    const bulbMatNight = new THREE.MeshStandardMaterial({
      color: 0xfff1c2, emissive: 0xffd47a, emissiveIntensity: 2.5
    });
    const bulbMatDay = new THREE.MeshStandardMaterial({
      color: 0xddddcc, roughness: 0.3, metalness: 0.2
    });
    for (const p of positions) {
      // Offset lamps to sidewalk area (road half-width is 4, so 6 puts them on the chodnik)
      const px = p.x + 6.0, pz = p.z + 6.0;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 4.8, 8), poleMat);
      pole.position.set(px, 2.4, pz);
      pole.castShadow = true;
      this.scene.add(pole);
      // ramię wysięgnikowe
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), poleMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(px + 0.45, 4.7, pz);
      this.scene.add(arm);
      // klosz
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.12, 0.32),
        poleMat
      );
      housing.position.set(px + 0.85, 4.65, pz);
      this.scene.add(housing);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 8),
        this.isNight ? bulbMatNight : bulbMatDay
      );
      head.scale.set(1.2, 0.5, 0.9);
      head.position.set(px + 0.85, 4.55, pz);
      this.scene.add(head);
      if (this.isNight) {
        const pl = new THREE.PointLight(0xffd28a, 0.9, 16, 1.6);
        pl.position.set(px + 0.85, 4.45, pz);
        this.scene.add(pl);
      }
    }
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
    if (x < this.bounds.min || x > this.bounds.max || z < this.bounds.min || z > this.bounds.max) return false;
    const roadHalf = 4; // roadWidth / 2
    for (const seg of this.roadSegments) {
      if (seg.axis === 'h') {
        // Horizontal road: check if within Z band and X range
        if (Math.abs(z - seg.z1) <= roadHalf && x >= seg.x1 && x <= seg.x2) return true;
      } else {
        // Vertical road: check if within X band and Z range
        if (Math.abs(x - seg.x1) <= roadHalf && z >= seg.z1 && z <= seg.z2) return true;
      }
    }
    return false;
  }
  // Returns true if player is on any safe ground (sidewalk or grass - anything not road/crossing)
  isOnSafeGround(x, z) {
    if (this.isOnSidewalk(x, z)) return true;
    // Grass: within bounds, not on road, not on crossing
    if (x < this.bounds.min || x > this.bounds.max || z < this.bounds.min || z > this.bounds.max) return false;
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
      if (x + r > b.x1 && x - r < b.x2 && z + r > b.z1 && z - r < b.z2) return true;
    }
    for (const o of this.obstacles) {
      if (x + r > o.x1 && x - r < o.x2 && z + r > o.z1 && z - r < o.z2) return true;
    }
    return false;
  }

  // Pick a random spawn point far from a position
  farSpawn(fromX, fromZ, minDist = 60) {
    const candidates = this.spawnPoints
      .map(p => ({ p, d: Math.hypot(p.x - fromX, p.z - fromZ) }))
      .filter(o => o.d > minDist)
      .sort((a, b) => b.d - a.d);
    if (!candidates.length) return this.spawnPoints[0];
    return candidates[Math.floor(Math.random() * Math.min(5, candidates.length))].p;
  }

  // Random sidewalk point
  randomSidewalkPoint() {
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
  }
}
