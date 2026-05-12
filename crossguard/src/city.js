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

    // === Ground (grass base) ===
    const groundGeo = new THREE.PlaneGeometry(this.size + 200, this.size + 200);
    const groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.02;
    this.scene.add(ground);

    // === Roads: full grid (every blockSize) ===
    const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    const curbMat = new THREE.MeshLambertMaterial({ color: PALETTE.curb });

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
        const innerSize = bs - roadWidth - 2; // leave gap for sidewalk
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
        for (const [dx, dz, w, d] of [
          [0, -sidewalkSize/2, sidewalkSize, curbW],
          [0,  sidewalkSize/2, sidewalkSize, curbW],
          [-sidewalkSize/2, 0, curbW, sidewalkSize],
          [ sidewalkSize/2, 0, curbW, sidewalkSize],
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
    for (let i = 1; i < g; i++) {
      for (let j = 1; j < g; j++) {
        const x = i * bs - half;
        const z = j * bs - half;
        this.intersections.push({ x, z });

        // 4 zebra crossings around each intersection
        const offset = roadWidth/2 + 1.5;
        const crossLen = roadWidth - 1;
        const crossWidth = 3.2;

        // North/south arms: crossings on VERTICAL road (peds walk E-W = X axis).
        // Controlled by NS vehicle light (NS cars stop → peds go).
        for (const dz of [-offset, +offset]) {
          this._addZebra(x, z + dz, 'x', roadWidth, crossWidth);
          const lightObj = this._addTrafficLight(x + 3.5, z + dz - (dz < 0 ? 3.0 : -3.0), 'ns');
          this.crossings.push({
            x, z: z + dz, axis: 'h', light: lightObj,
            x1: x - roadWidth/2, z1: z + dz - crossWidth/2,
            x2: x + roadWidth/2, z2: z + dz + crossWidth/2,
          });
        }
        // East/west arms: crossings on HORIZONTAL road (peds walk N-S = Z axis).
        // Controlled by EW vehicle light.
        for (const dx of [-offset, +offset]) {
          this._addZebra(x + dx, z, 'z', roadWidth, crossWidth);
          const lightObj = this._addTrafficLight(x + dx - (dx < 0 ? 3.0 : -3.0), z + 3.5, 'ew');
          this.crossings.push({
            x: x + dx, z, axis: 'v', light: lightObj,
            x1: x + dx - crossWidth/2, z1: z - roadWidth/2,
            x2: x + dx + crossWidth/2, z2: z + roadWidth/2,
          });
        }
      }
    }

    // Link N-S and E-W lights so they oppose each other (per intersection)
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

  // Render a zebra crossing.
  //   pedAxis: 'x' or 'z' — direction the pedestrian walks (perpendicular to vehicles)
  //   roadW: road width (= length of each stripe, spans across the road in walk direction)
  //   footprint: width of crossing along the vehicle direction
  // Real zebras: stripes are LONG in pedestrian walking direction (you walk across each bar),
  // and arrayed along the vehicle direction.
  _addZebra(cx, cz, pedAxis, roadW, footprint) {
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripes = 5;
    const thick = footprint / (stripes * 2 - 1);
    for (let i = 0; i < stripes; i++) {
      const off = -footprint/2 + thick/2 + i * thick * 2;
      let geo, pos;
      if (pedAxis === 'x') {
        // Peds walk X → vehicles travel Z → stripes long in X, arrayed in Z
        geo = new THREE.PlaneGeometry(roadW, thick);
        pos = [cx, 0.015, cz + off];
      } else {
        // Peds walk Z → vehicles travel X → stripes long in Z, arrayed in X
        geo = new THREE.PlaneGeometry(thick, roadW);
        pos = [cx + off, 0.015, cz];
      }
      const s = new THREE.Mesh(geo, stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(...pos);
      this.scene.add(s);
    }
    // Pedestrian stop-line just before the zebra (subtle yellow) — helps players locate it
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff066 });
    if (pedAxis === 'x') {
      // Markers at ends of zebra on sidewalk side
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

  _addTrafficLight(x, z, axis) {
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
    const redMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
    const ambMat = new THREE.MeshBasicMaterial({ color: 0x553f00 });
    const grnMat = new THREE.MeshBasicMaterial({ color: 0x005522 });
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), redMat);
    red.position.set(0, 4.55, 0.26);
    const amb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), ambMat);
    amb.position.set(0, 4.05, 0.26);
    const grn = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), grnMat);
    grn.position.set(0, 3.55, 0.26);
    group.add(red, amb, grn);

    group.position.set(x, 0, z);
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
      pairedWith: null,
    };
    this.trafficLights.push(lightObj);
    return lightObj;
  }

  _linkTrafficLights() {
    // Group lights by intersection (within ~10 units)
    const groups = [];
    for (const tl of this.trafficLights) {
      let g = groups.find(grp =>
        Math.abs(grp.cx - tl.pos.x) < 12 && Math.abs(grp.cz - tl.pos.z) < 12
      );
      if (!g) { g = { cx: tl.pos.x, cz: tl.pos.z, items: [] }; groups.push(g); }
      g.items.push(tl);
    }
    // Sync NS and EW
    for (const g of groups) {
      const ns = g.items.filter(t => t.axis === 'ns');
      const ew = g.items.filter(t => t.axis === 'ew');
      // Initial offset: ns green when ew red
      ns.forEach(t => { t.state = 'green'; t.timer = 0; });
      ew.forEach(t => { t.state = 'red';   t.timer = 0; });
      this._applyLightVisual(ns);
      this._applyLightVisual(ew);
    }
  }

  _applyLightVisual(list) {
    for (const t of list) {
      t.redMat.color.setHex(t.state === 'red' ? 0xff2233 : 0x550000);
      t.ambMat.color.setHex(t.state === 'amber' ? 0xffaa00 : 0x553f00);
      t.grnMat.color.setHex(t.state === 'green' ? 0x33ee55 : 0x005522);
    }
  }

  updateTrafficLights(dt) {
    // Track intersections & switch in pairs
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
      const mat = new THREE.MeshLambertMaterial({ color: col });
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      bldg.position.set(cx + offX, h/2 + 0.12, cz + offZ);
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      this.scene.add(bldg);

      // Windows: tiny dots on facades (simple decorative planes)
      this._addWindows(bldg, w, h, d);

      // Roof block
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 0.8, d * 0.7),
        new THREE.MeshLambertMaterial({ color: 0x444a55 })
      );
      roof.position.set(cx + offX, h + 0.4, cz + offZ);
      this.scene.add(roof);

      this.buildings.push({
        x1: cx + offX - w/2, z1: cz + offZ - d/2,
        x2: cx + offX + w/2, z2: cz + offZ + d/2,
      });
    }
  }

  _addWindows(parent, w, h, d) {
    const winMat = new THREE.MeshBasicMaterial({
      color: this.isNight ? 0xffe9a8 : 0x9bc3e6,
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
    for (const p of positions) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 4.5),
        new THREE.MeshLambertMaterial({ color: 0x2a2f38 })
      );
      pole.position.set(p.x + 2.8, 2.25, p.z + 2.8);
      this.scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 6),
        new THREE.MeshBasicMaterial({ color: this.isNight ? 0xffeaa0 : 0xddddcc })
      );
      head.position.set(p.x + 2.8, 4.7, p.z + 2.8);
      this.scene.add(head);
      if (this.isNight) {
        const pl = new THREE.PointLight(0xffd28a, 0.6, 14);
        pl.position.set(p.x + 2.8, 4.6, p.z + 2.8);
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
    // road if not on sidewalk and within city bounds — approximate
    if (x < this.bounds.min || x > this.bounds.max || z < this.bounds.min || z > this.bounds.max) return false;
    return !this.isOnSidewalk(x, z);
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
