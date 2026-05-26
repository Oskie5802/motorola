// === City generation: deterministyczne layouty per poziom ===
// Kazdy poziom ma recznie zaprojektowany uklad siatki,
// selektywne skrzyzowania i rozne typy blokow (budynki, parki, place).
import * as THREE from "three";
import { PALETTE } from "./config.js";
import { settings } from "./settings.js";

export class City {

  // ============================================================
  // Procedural texture generators (high quality mode only)
  // ============================================================

  static _textureCache = {};

  static _createAsphaltTexture(isNight, quality = 'high') {
    const key = `asphalt_${isNight}_${quality}`;
    if (City._textureCache[key]) return City._textureCache[key];

    const isMedium = quality === 'medium';
    const size = isMedium ? 256 : 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base asphalt color
    const baseR = isNight ? 22 : 34;
    const baseG = isNight ? 26 : 38;
    const baseB = isNight ? 32 : 46;
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    ctx.fillRect(0, 0, size, size);

    // Aggregate/grain noise - small random speckles simulating asphalt aggregate
    const noiseCount = isMedium ? 6000 : 18000;
    for (let i = 0; i < noiseCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const brightness = Math.random();
      const r = baseR + (brightness - 0.5) * 28;
      const g = baseG + (brightness - 0.5) * 24;
      const b = baseB + (brightness - 0.5) * 20;
      const alpha = 0.15 + Math.random() * 0.35;
      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${alpha})`;
      const s = 0.5 + Math.random() * (isMedium ? 1.5 : 2.5);
      ctx.fillRect(x, y, s, s);
    }

    // Larger aggregate stones
    const stoneCount = isMedium ? 250 : 800;
    for (let i = 0; i < stoneCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const brightness = 0.3 + Math.random() * 0.7;
      const r = baseR + brightness * 20 + Math.random() * 12;
      const g = baseG + brightness * 18 + Math.random() * 10;
      const b = baseB + brightness * 14 + Math.random() * 8;
      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},0.3)`;
      const s = (1.5 + Math.random() * 3) * (isMedium ? 0.75 : 1.0);
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * (0.7 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle cracks - skipped on medium
    if (!isMedium) {
      ctx.strokeStyle = `rgba(${baseR - 10},${baseG - 10},${baseB - 10}, 0.25)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        let cx = Math.random() * size;
        let cy = Math.random() * size;
        ctx.moveTo(cx, cy);
        const segs = 4 + Math.floor(Math.random() * 8);
        for (let j = 0; j < segs; j++) {
          cx += (Math.random() - 0.5) * 40;
          cy += (Math.random() - 0.3) * 30;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }

    // Tar/repair patches (darker irregular rectangles)
    const patchCount = isMedium ? 1 : 3;
    for (let i = 0; i < patchCount; i++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const pw = (15 + Math.random() * 40) * (isMedium ? 0.6 : 1.0);
      const ph = (10 + Math.random() * 30) * (isMedium ? 0.6 : 1.0);
      ctx.fillStyle = `rgba(${baseR - 8},${baseG - 8},${baseB - 6}, 0.25)`;
      ctx.fillRect(px, py, pw, ph);
    }

    // Oil stains (very subtle) - skipped on medium
    if (!isMedium) {
      for (let i = 0; i < 4; i++) {
        const ox = Math.random() * size;
        const oy = Math.random() * size;
        const or = 5 + Math.random() * 18;
        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
        grad.addColorStop(0, `rgba(${baseR + 5},${baseG + 3},${baseB - 2}, 0.12)`);
        grad.addColorStop(1, `rgba(${baseR},${baseG},${baseB}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(ox - or, oy - or, or * 2, or * 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.anisotropy = isMedium ? 2 : 4;

    City._textureCache[key] = tex;
    return tex;
  }

  static _createAsphaltBumpMap(isNight, quality = 'high') {
    const key = `asphalt_bump_${isNight}_${quality}`;
    if (City._textureCache[key]) return City._textureCache[key];

    const isMedium = quality === 'medium';
    const size = isMedium ? 256 : 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Medium gray base
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Surface variation (aggregate bumps)
    const noiseCount = isMedium ? 4000 : 12000;
    for (let i = 0; i < noiseCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const val = 118 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${val},${val},${val})`;
      const s = 0.5 + Math.random() * (isMedium ? 1.2 : 2.0);
      ctx.fillRect(x, y, s, s);
    }

    // Larger bumps
    const stoneCount = isMedium ? 150 : 400;
    for (let i = 0; i < stoneCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const val = 115 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${val},${val},${val})`;
      const s = (2 + Math.random() * 4) * (isMedium ? 0.75 : 1.0);
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cracks as dark grooves - skipped on medium
    if (!isMedium) {
      ctx.strokeStyle = 'rgba(60,60,60,0.3)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        let cx = Math.random() * size;
        let cy = Math.random() * size;
        ctx.moveTo(cx, cy);
        for (let j = 0; j < 6; j++) {
          cx += (Math.random() - 0.5) * 35;
          cy += (Math.random() - 0.3) * 25;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.anisotropy = isMedium ? 2 : 4;

    City._textureCache[key] = tex;
    return tex;
  }

  static _createSidewalkTexture(isNight, quality = 'high') {
    const key = `sidewalk_${isNight}_${quality}`;
    if (City._textureCache[key]) return City._textureCache[key];

    const isMedium = quality === 'medium';
    const size = isMedium ? 256 : 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base concrete/paver color
    const baseR = isNight ? 56 : 82;
    const baseG = isNight ? 60 : 86;
    const baseB = isNight ? 68 : 96;
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    ctx.fillRect(0, 0, size, size);

    // Draw paving stone grid pattern (concrete slabs)
    const tileSize = isMedium ? 32 : 64;
    const groutWidth = isMedium ? 1 : 2;
    const groutColor = isNight ? 'rgba(35,38,44,0.7)' : 'rgba(55,58,68,0.7)';

    // Horizontal grout lines
    ctx.fillStyle = groutColor;
    for (let y = 0; y < size; y += tileSize) {
      ctx.fillRect(0, y, size, groutWidth);
    }

    // Vertical grout lines (offset every other row for brick pattern)
    for (let row = 0; row < size / tileSize; row++) {
      const yStart = row * tileSize;
      const offset = (row % 2 === 0) ? 0 : tileSize / 2;
      for (let x = offset; x < size; x += tileSize) {
        ctx.fillRect(x, yStart, groutWidth, tileSize);
      }
    }

    // Per-tile color variation
    for (let row = 0; row < size / tileSize; row++) {
      const offset = (row % 2 === 0) ? 0 : tileSize / 2;
      for (let x = offset; x < size + tileSize; x += tileSize) {
        const variation = (Math.random() - 0.5) * 16;
        const r = baseR + variation;
        const g = baseG + variation + (Math.random() - 0.5) * 6;
        const b = baseB + variation + (Math.random() - 0.5) * 4;
        ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},0.35)`;
        ctx.fillRect(x + groutWidth, row * tileSize + groutWidth, tileSize - groutWidth * 2, tileSize - groutWidth * 2);
      }
    }

    // Surface texture noise on each tile
    const noiseCount = isMedium ? 2500 : 8000;
    for (let i = 0; i < noiseCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const brightness = Math.random();
      const val = baseR + (brightness - 0.5) * 22;
      ctx.fillStyle = `rgba(${val|0},${val|0},${(val + 2)|0}, 0.12)`;
      const s = 0.5 + Math.random() * 1.5;
      ctx.fillRect(x, y, s, s);
    }

    // Occasional stains/weathering
    const stainCount = isMedium ? 2 : 6;
    for (let i = 0; i < stainCount; i++) {
      const sx = Math.random() * size;
      const sy = Math.random() * size;
      const sr = (8 + Math.random() * 25) * (isMedium ? 0.7 : 1.0);
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      const darker = isNight ? 10 : 15;
      grad.addColorStop(0, `rgba(${baseR - darker},${baseG - darker},${baseB - darker}, 0.15)`);
      grad.addColorStop(1, `rgba(${baseR},${baseG},${baseB}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = isMedium ? 2 : 4;

    City._textureCache[key] = tex;
    return tex;
  }

  static _createSidewalkBumpMap(isNight, quality = 'high') {
    const key = `sidewalk_bump_${isNight}_${quality}`;
    if (City._textureCache[key]) return City._textureCache[key];

    const isMedium = quality === 'medium';
    const size = isMedium ? 256 : 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Light gray base (flat surface)
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, size, size);

    const tileSize = isMedium ? 32 : 64;
    const groutWidth = isMedium ? 1 : 2;

    // Grooves between tiles (dark = lower)
    ctx.fillStyle = '#505050';
    for (let y = 0; y < size; y += tileSize) {
      ctx.fillRect(0, y, size, groutWidth);
    }
    for (let row = 0; row < size / tileSize; row++) {
      const offset = (row % 2 === 0) ? 0 : tileSize / 2;
      for (let x = offset; x < size; x += tileSize) {
        ctx.fillRect(x, row * tileSize, groutWidth, tileSize);
      }
    }

    // Slight raised edges on tiles (lighter = higher) - skipped on medium
    if (!isMedium) {
      for (let row = 0; row < size / tileSize; row++) {
        const offset = (row % 2 === 0) ? 0 : tileSize / 2;
        for (let x = offset; x < size + tileSize; x += tileSize) {
          const inset = groutWidth + 1;
          ctx.strokeStyle = 'rgba(170,170,170,0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + inset, row * tileSize + inset, tileSize - inset * 2, tileSize - inset * 2);
        }
      }
    }

    // Surface roughness
    const roughnessCount = isMedium ? 1500 : 5000;
    for (let i = 0; i < roughnessCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const val = 128 + Math.floor((Math.random() - 0.5) * 20);
      ctx.fillStyle = `rgb(${val},${val},${val})`;
      ctx.fillRect(x, y, 1, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = isMedium ? 2 : 4;

    City._textureCache[key] = tex;
    return tex;
  }

  static _createCurbTexture(isNight, quality = 'high') {
    const key = `curb_${isNight}_${quality}`;
    if (City._textureCache[key]) return City._textureCache[key];

    const isMedium = quality === 'medium';
    const size = isMedium ? 128 : 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base concrete color (lighter than sidewalk)
    const baseR = isNight ? 140 : 178;
    const baseG = isNight ? 144 : 182;
    const baseB = isNight ? 156 : 196;
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    ctx.fillRect(0, 0, size, size);

    // Segment lines (curb stones are typically ~1m long)
    const segSize = isMedium ? 24 : 48;
    ctx.strokeStyle = isNight ? 'rgba(90,94,104,0.5)' : 'rgba(130,134,150,0.5)';
    ctx.lineWidth = isMedium ? 1.0 : 1.5;
    for (let x = segSize; x < size; x += segSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    // Surface grain
    const grainCount = isMedium ? 1500 : 6000;
    for (let i = 0; i < grainCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const variation = (Math.random() - 0.5) * 18;
      const r = baseR + variation;
      const g = baseG + variation;
      const b = baseB + variation;
      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},0.15)`;
      ctx.fillRect(x, y, Math.random() * 2, Math.random() * 2);
    }

    // Weathering/dirt at bottom edge (typically where curb meets road)
    const gradient = ctx.createLinearGradient(0, size * 0.7, 0, size);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(${baseR - 30},${baseG - 30},${baseB - 25}, 0.25)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, size * 0.7, size, size * 0.3);

    // Small chips/damage - skipped on medium
    if (!isMedium) {
      for (let i = 0; i < 5; i++) {
        const cx = Math.random() * size;
        const cy = Math.random() * size;
        ctx.fillStyle = `rgba(${baseR - 20},${baseG - 20},${baseB - 15}, 0.2)`;
        ctx.beginPath();
        ctx.arc(cx, cy, 2 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = isMedium ? 2 : 4;

    City._textureCache[key] = tex;
    return tex;
  }

  static _createCurbBumpMap(isNight, quality = 'high') {
    const key = `curb_bump_${isNight}_${quality}`;
    if (City._textureCache[key]) return City._textureCache[key];

    const isMedium = quality === 'medium';
    const size = isMedium ? 128 : 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, size, size);

    // Segment grooves
    const segSize = isMedium ? 24 : 48;
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = isMedium ? 1.0 : 1.5;
    for (let x = segSize; x < size; x += segSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    // Surface roughness
    const roughnessCount = isMedium ? 1000 : 4000;
    for (let i = 0; i < roughnessCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const val = 128 + Math.floor((Math.random() - 0.5) * 16);
      ctx.fillStyle = `rgb(${val},${val},${val})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Chipped edges - skipped on medium
    if (!isMedium) {
      for (let i = 0; i < 5; i++) {
        const cx = Math.random() * size;
        const cy = Math.random() * size;
        ctx.fillStyle = '#707070';
        ctx.beginPath();
        ctx.arc(cx, cy, 2 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = isMedium ? 2 : 4;

    City._textureCache[key] = tex;
    return tex;
  }

  static _createRoadEdgeLineTexture() {
    const key = 'road_edge';
    if (City._textureCache[key]) return City._textureCache[key];

    const w = 256, h = 16;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Worn white paint line
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, w, h);

    // Wear/fade
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.fillStyle = `rgba(100,104,112,${0.1 + Math.random() * 0.2})`;
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(8, 1);

    City._textureCache[key] = tex;
    return tex;
  }

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
    this.trees = [];
    this.benches = [];
    this.ghostBuildings = [];

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
    const xs = this.xCoords;
    const zs = this.zCoords;
    const sizeX = xs[g] - xs[0];
    const sizeZ = zs[g] - zs[0];
    const half = this.size / 2;
    const roadWidth = 8;
    this.bounds = { min: -half, max: half };

    // === Podloze ===
    const groundGeo = new THREE.PlaneGeometry(
      sizeX + 8,
      sizeZ + 8,
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

    // === Floating Island Base (Minecraft Skyblock / Fantasy Style) ===
    const topW = sizeX + 8;
    const topD = sizeZ + 8;
    
    // Layer 1: top soil layer (depth 4 units)
    const layer1Geo = new THREE.BoxGeometry(topW, 4, topD);
    const layer1Mat = new THREE.MeshStandardMaterial({
      color: 0x22262e, // dark concrete/dirt color
      roughness: 0.9,
      metalness: 0.1,
    });
    const layer1 = new THREE.Mesh(layer1Geo, layer1Mat);
    layer1.position.set(0, -2.08, 0); // top is at -0.08
    layer1.receiveShadow = this.receiveShadows;
    layer1.castShadow = this.receiveShadows;
    this.scene.add(layer1);

    // Layer 2: middle rock layer (depth 6 units, slightly tapered)
    const layer2Geo = new THREE.BoxGeometry(topW * 0.94, 6, topD * 0.94);
    const layer2Mat = new THREE.MeshStandardMaterial({
      color: 0x181a20, // darker stone
      roughness: 0.95,
      metalness: 0.15,
    });
    const layer2 = new THREE.Mesh(layer2Geo, layer2Mat);
    layer2.position.set(0, -7.08, 0); // top is at -4.08
    layer2.receiveShadow = this.receiveShadows;
    layer2.castShadow = this.receiveShadows;
    this.scene.add(layer2);

    // Layer 3: bottom rock core (depth 8 units, more tapered)
    const layer3Geo = new THREE.BoxGeometry(topW * 0.82, 8, topD * 0.82);
    const layer3Mat = new THREE.MeshStandardMaterial({
      color: 0x101116, // deep dark rock
      roughness: 0.98,
      metalness: 0.2,
    });
    const layer3 = new THREE.Mesh(layer3Geo, layer3Mat);
    layer3.position.set(0, -14.08, 0); // top is at -10.08, bottom at -18.08
    layer3.receiveShadow = this.receiveShadows;
    layer3.castShadow = this.receiveShadows;
    this.scene.add(layer3);

    // Add some random rocky stalactites hanging from the bottom of Layer 3
    const numStalactites = 15;
    for (let k = 0; k < numStalactites; k++) {
      const rw = 4 + Math.random() * 8;
      const rh = 3 + Math.random() * 8;
      const rd = 4 + Math.random() * 8;
      const rx = (Math.random() - 0.5) * topW * 0.75;
      const rz = (Math.random() - 0.5) * topD * 0.75;
      
      const rockGeo = new THREE.BoxGeometry(rw, rh, rd);
      const rock = new THREE.Mesh(rockGeo, layer3Mat);
      rock.position.set(rx, -18.08 - rh / 2 + 1, rz);
      rock.receiveShadow = this.receiveShadows;
      rock.castShadow = this.receiveShadows;
      this.scene.add(rock);
    }

    // === Materialy ===
    const quality = settings.current.quality;
    const isHighQuality = quality === 'high';
    const isMediumQuality = quality === 'medium';

    let roadMat, sidewalkMat, curbMat;
    if (isHighQuality) {
      // High quality: procedural canvas textures with bump maps
      const asphaltTex = City._createAsphaltTexture(this.isNight, 'high');
      const asphaltBump = City._createAsphaltBumpMap(this.isNight, 'high');
      roadMat = new THREE.MeshStandardMaterial({
        map: asphaltTex,
        bumpMap: asphaltBump,
        bumpScale: 0.15,
        roughness: 0.82,
        metalness: 0.05,
        roughnessMap: asphaltBump,
      });

      const sidewalkTex = City._createSidewalkTexture(this.isNight, 'high');
      const sidewalkBump = City._createSidewalkBumpMap(this.isNight, 'high');
      sidewalkMat = new THREE.MeshStandardMaterial({
        map: sidewalkTex,
        bumpMap: sidewalkBump,
        bumpScale: 0.2,
        roughness: 0.88,
        roughnessMap: sidewalkBump,
      });

      const curbTex = City._createCurbTexture(this.isNight, 'high');
      const curbBump = City._createCurbBumpMap(this.isNight, 'high');
      curbMat = new THREE.MeshStandardMaterial({
        map: curbTex,
        bumpMap: curbBump,
        bumpScale: 0.12,
        roughness: 0.75,
      });
    } else if (isMediumQuality) {
      // Medium quality: simpler procedural textures WITH subtle bump maps, NO roughness maps
      const asphaltTex = City._createAsphaltTexture(this.isNight, 'medium');
      const asphaltBump = City._createAsphaltBumpMap(this.isNight, 'medium');
      roadMat = new THREE.MeshStandardMaterial({
        map: asphaltTex,
        bumpMap: asphaltBump,
        bumpScale: 0.06,
        roughness: 0.85,
        metalness: 0.05,
      });

      const sidewalkTex = City._createSidewalkTexture(this.isNight, 'medium');
      const sidewalkBump = City._createSidewalkBumpMap(this.isNight, 'medium');
      sidewalkMat = new THREE.MeshStandardMaterial({
        map: sidewalkTex,
        bumpMap: sidewalkBump,
        bumpScale: 0.08,
        roughness: 0.9,
      });

      const curbTex = City._createCurbTexture(this.isNight, 'medium');
      const curbBump = City._createCurbBumpMap(this.isNight, 'medium');
      curbMat = new THREE.MeshStandardMaterial({
        map: curbTex,
        bumpMap: curbBump,
        bumpScale: 0.05,
        roughness: 0.8,
      });
    } else {
      // Low quality: flat colors, cheaper Lambert materials
      roadMat = new THREE.MeshLambertMaterial({
        color: PALETTE.road,
      });
      sidewalkMat = new THREE.MeshLambertMaterial({
        color: PALETTE.sidewalk,
      });
      curbMat = new THREE.MeshLambertMaterial({
        color: PALETTE.curb,
      });
    }

    // === Drogi poziome (staly z, rozciagaja sie na cala szerokosc w x, dopasowane do wyspy) ===
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

    // === Drogi pionowe (staly x, rozciagaja sie na cala glebokosc w z, dopasowane do wyspy) ===
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

    // === Budowa Zakrzywionych Ramp na Krawedziach Drogi ===
    const rampLength = 30;
    const rampDepth = 20;
    const numSegments = 20;
    const minX = -sizeX / 2;
    const maxX = sizeX / 2;
    const minZ = -sizeZ / 2;
    const maxZ = sizeZ / 2;

    const isHQ = settings.current.quality === 'high';
    const lineMat = isHQ
      ? new THREE.MeshBasicMaterial({ color: 0xe8ecf0, transparent: true, opacity: 0.85 })
      : new THREE.MeshBasicMaterial({ color: 0xffffff });

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x7a828c, // light stone gray
      roughness: 0.8,
      metalness: 0.2,
    });

    const createRampSegment = (w, h, d, x, y, z, rotX, rotZ, customMat = null) => {
      const geom = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geom, customMat || roadMat);
      mesh.position.set(x, y, z);
      mesh.rotation.order = 'YXZ';
      if (rotX) mesh.rotation.x = rotX;
      if (rotZ) mesh.rotation.z = rotZ;
      mesh.receiveShadow = this.receiveShadows;
      this.scene.add(mesh);
      return mesh;
    };

    // Horizontal roads: ramps at left and right ends
    for (let j = 0; j <= g; j++) {
      const coord = zs[j];

      // Left Ramp (extending left from minX - 4)
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (minX - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dx = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(segmentLength, 0.15, roadWidth, x_mid, y_mid, coord, 0, angle);

        // Lane line dash
        if (i % 2 === 0) {
          createRampSegment(segmentLength, 0.16, 0.25, x_mid, y_mid + 0.01, coord, 0, angle, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord - 3.8, 0, angle, wallMat);
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord + 3.8, 0, angle, wallMat);
      }

      // Right Ramp (extending right from maxX + 4)
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (maxX + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dx = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(segmentLength, 0.15, roadWidth, x_mid, y_mid, coord, 0, angle);

        // Lane line dash
        if (i % 2 === 0) {
          createRampSegment(segmentLength, 0.16, 0.25, x_mid, y_mid + 0.01, coord, 0, angle, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord - 3.8, 0, angle, wallMat);
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord + 3.8, 0, angle, wallMat);
      }
    }

    // Vertical roads: ramps at top and bottom ends
    for (let i = 0; i <= g; i++) {
      const coord = xs[i];

      // Top Ramp (extending top from minZ - 4)
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (minZ - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dz = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(roadWidth, 0.15, segmentLength, coord, y_mid, z_mid, -angle, 0);

        // Lane line dash
        if (j % 2 === 0) {
          createRampSegment(0.25, 0.16, segmentLength, coord, y_mid + 0.01, z_mid, -angle, 0, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(0.4, 0.8, segmentLength, coord - 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
        createRampSegment(0.4, 0.8, segmentLength, coord + 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
      }

      // Bottom Ramp (extending bottom from maxZ + 4)
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (maxZ + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dz = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(roadWidth, 0.15, segmentLength, coord, y_mid, z_mid, -angle, 0);

        // Lane line dash
        if (j % 2 === 0) {
          createRampSegment(0.25, 0.16, segmentLength, coord, y_mid + 0.01, z_mid, -angle, 0, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(0.4, 0.8, segmentLength, coord - 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
        createRampSegment(0.4, 0.8, segmentLength, coord + 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
      }
    }

    // Fill the 4x4 gaps at the 4 intersection corners of the island
    const cornerFillers = [
      [minX - 2, minZ - 2], // Top-Left
      [maxX + 2, minZ - 2], // Top-Right
      [minX - 2, maxZ + 2], // Bottom-Left
      [maxX + 2, maxZ + 2], // Bottom-Right
    ];
    for (const [fx, fz] of cornerFillers) {
      const fillGeo = new THREE.PlaneGeometry(4, 4);
      const fill = new THREE.Mesh(fillGeo, roadMat);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(fx, 0, fz);
      fill.receiveShadow = this.receiveShadows;
      this.scene.add(fill);
    }

    // === Wypelnienie skalne miedzy drogami i lekki mur obwodowy ===
    const grassMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x1a2e1a : 0x3a7a3a, // green grass color matching parks
      roughness: 0.95,
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x2a1c0e : 0x5b3a1d,
      roughness: 0.9,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x142820 : 0x4a8a3f,
      roughness: 0.85,
    });

    const spawnSlopedTree = (tx, ty, tz) => {
      const isLow = settings.current.quality === 'low';
      const group = new THREE.Group();
      group.position.set(tx, ty, tz);

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
    };

    const spawnHouse = (x, y, z, rotY) => {
      const houseMat = new THREE.MeshStandardMaterial({
        color: PALETTE.building[Math.floor(Math.random() * PALETTE.building.length)],
        roughness: 0.8,
      });
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xaa3333, // red roof
        roughness: 0.6,
      });

      const houseGeo = new THREE.BoxGeometry(3, 3, 3);
      const house = new THREE.Mesh(houseGeo, houseMat);
      house.position.set(x, y + 1.5, z);
      house.rotation.y = rotY;
      house.castShadow = this.castShadows;
      house.receiveShadow = this.receiveShadows;
      this.scene.add(house);
      this.buildings.push({ mesh: house, x1: x-1.5, z1: z-1.5, x2: x+1.5, z2: z+1.5, height: 3 });

      // Roof (Cone)
      const roofGeo = new THREE.ConeGeometry(2.5, 2, 4);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(x, y + 3.5, z);
      roof.rotation.y = rotY + Math.PI / 4;
      roof.castShadow = this.castShadows;
      this.scene.add(roof);
    };
    
    // 1. Lewa krawedź wyspy (Left)
    for (let j = 0; j < g; j++) {
      const z1 = zs[j] + 4;
      const z2 = zs[j+1] - 4;
      const z_mid = (z1 + z2) / 2;
      const depth = z2 - z1;

      // Build sloped grass hillside with rocks underneath
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (minX - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dx = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(segmentLength, 0.2, depth, x_mid, y_mid, z_mid, 0, angle, grassMat);

        // Rocky base segment
        createRampSegment(segmentLength, 4.0, depth, x_mid, y_mid - 2.0, z_mid, 0, angle, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const z_off = (Math.random() - 0.5) * (depth - 6);
          spawnSlopedTree(x_mid, y_mid, z_mid + z_off);
        }
        if (Math.random() < 0.12 && i > 2 && i < numSegments - 2) {
          const z_off = (Math.random() - 0.5) * (depth - 8);
          spawnHouse(x_mid, y_mid, z_mid + z_off, -Math.PI / 2);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(0.4, 0.8, depth);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(minX - 4, 0.4, z_mid);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 2. Prawa krawedź wyspy (Right)
    for (let j = 0; j < g; j++) {
      const z1 = zs[j] + 4;
      const z2 = zs[j+1] - 4;
      const z_mid = (z1 + z2) / 2;
      const depth = z2 - z1;

      // Build sloped grass hillside with rocks underneath
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (maxX + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dx = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(segmentLength, 0.2, depth, x_mid, y_mid, z_mid, 0, angle, grassMat);

        // Rocky base segment
        createRampSegment(segmentLength, 4.0, depth, x_mid, y_mid - 2.0, z_mid, 0, angle, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const z_off = (Math.random() - 0.5) * (depth - 6);
          spawnSlopedTree(x_mid, y_mid, z_mid + z_off);
        }
        if (Math.random() < 0.12 && i > 2 && i < numSegments - 2) {
          const z_off = (Math.random() - 0.5) * (depth - 8);
          spawnHouse(x_mid, y_mid, z_mid + z_off, Math.PI / 2);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(0.4, 0.8, depth);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(maxX + 4, 0.4, z_mid);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 3. Gorna krawedź wyspy (Top)
    for (let i = 0; i < g; i++) {
      const x1 = xs[i] + 4;
      const x2 = xs[i+1] - 4;
      const x_mid = (x1 + x2) / 2;
      const width = x2 - x1;

      // Build sloped grass hillside with rocks underneath
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (minZ - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dz = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(width, 0.2, segmentLength, x_mid, y_mid, z_mid, -angle, 0, grassMat);

        // Rocky base segment
        createRampSegment(width, 4.0, segmentLength, x_mid, y_mid - 2.0, z_mid, -angle, 0, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const x_off = (Math.random() - 0.5) * (width - 6);
          spawnSlopedTree(x_mid + x_off, y_mid, z_mid);
        }
        if (Math.random() < 0.12 && j > 2 && j < numSegments - 2) {
          const x_off = (Math.random() - 0.5) * (width - 8);
          spawnHouse(x_mid + x_off, y_mid, z_mid, 0);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(width, 0.8, 0.4);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(x_mid, 0.4, minZ - 4);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 4. Dolna krawedź wyspy (Bottom)
    for (let i = 0; i < g; i++) {
      const x1 = xs[i] + 4;
      const x2 = xs[i+1] - 4;
      const x_mid = (x1 + x2) / 2;
      const width = x2 - x1;

      // Build sloped grass hillside with rocks underneath
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (maxZ + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dz = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(width, 0.2, segmentLength, x_mid, y_mid, z_mid, -angle, 0, grassMat);

        // Rocky base segment
        createRampSegment(width, 4.0, segmentLength, x_mid, y_mid - 2.0, z_mid, -angle, 0, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const x_off = (Math.random() - 0.5) * (width - 6);
          spawnSlopedTree(x_mid + x_off, y_mid, z_mid);
        }
        if (Math.random() < 0.12 && j > 2 && j < numSegments - 2) {
          const x_off = (Math.random() - 0.5) * (width - 8);
          spawnHouse(x_mid + x_off, y_mid, z_mid, Math.PI);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(width, 0.8, 0.4);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(x_mid, 0.4, maxZ + 4);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 5. Narożniki (Corners)
    const cornerW = 25;
    const cornerD = 25;

    // Helper to create a closed concentric ring sector using ExtrudeGeometry
    const createRingSectorMesh = (sx, sz, r1, r2, height, yTop, startAngle, endAngle, material) => {
      const shape = new THREE.Shape();
      if (r1 === 0) {
        shape.moveTo(0, 0);
        shape.absarc(0, 0, r2, startAngle, endAngle, false);
        shape.lineTo(0, 0);
      } else {
        shape.moveTo(r1 * Math.cos(startAngle), r1 * Math.sin(startAngle));
        shape.absarc(0, 0, r2, startAngle, endAngle, false);
        shape.lineTo(r1 * Math.cos(endAngle), r1 * Math.sin(endAngle));
        shape.absarc(0, 0, r1, endAngle, startAngle, true);
      }

      const extrudeSettings = {
        depth: height,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 16,
      };

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, material);
      
      // Rotate by Math.PI / 2 so shape's X-Y plane lies in world X-Z, and depth extrudes downwards
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(sx, yTop, sz);
      
      mesh.receiveShadow = this.receiveShadows;
      mesh.castShadow = this.receiveShadows;
      this.scene.add(mesh);
      return mesh;
    };

    const roundedCorners = [
      // [sx, sz, startAngle, endAngle, diagAngle, houseRotation]
      [minX - 4, minZ - 4, Math.PI, 1.5 * Math.PI, 1.25 * Math.PI, -Math.PI / 4], // Top-Left
      [maxX + 4, minZ - 4, 1.5 * Math.PI, 2 * Math.PI, 1.75 * Math.PI, Math.PI / 4],  // Top-Right
      [minX - 4, maxZ + 4, Math.PI / 2, Math.PI, 0.75 * Math.PI, -3 * Math.PI / 4], // Bottom-Left
      [maxX + 4, maxZ + 4, 0, Math.PI / 2, 0.25 * Math.PI, 3 * Math.PI / 4],  // Bottom-Right
    ];

    for (const [sx, sz, startAngle, endAngle, da, rotY] of roundedCorners) {
      // Build sloped grass hillside with rocks underneath in concentric rings
      const numSegments = 16;
      for (let k = 0; k < numSegments; k++) {
        const t1 = k / numSegments;
        const t2 = (k + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const r1 = t1 * 25;
        const r2 = t2 * 25;

        // y_mid curves from 0.12 (at t_mid = 0) down to 0.12 - rampDepth (at t_mid = 1)
        const y_mid = 0.12 - rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        // 1. Grass surface ring segment (depth 0.2)
        createRingSectorMesh(sx, sz, r1, r2, 0.2, y_mid, startAngle, endAngle, grassMat);

        // 2. Middle rock layer (depth 12.0)
        createRingSectorMesh(sx, sz, r1, r2, 12.0, y_mid - 0.2, startAngle, endAngle, layer2Mat);

        // 3. Bottom rock layer (depth 8.0, tapered radius by 0.9)
        createRingSectorMesh(sx, sz, r1 * 0.9, r2 * 0.9, 8.0, y_mid - 12.2, startAngle, endAngle, layer3Mat);
      }

      // 4. Stone wall at the outer curved edge (bottom of the slope at r = 25)
      const numWallSegs = 16;
      const arcLength = 25 * (endAngle - startAngle);
      const segW = arcLength / numWallSegs + 0.1; // slight overlap to prevent gaps
      const wy_outer = 0.12 - rampDepth; // at r = 25, the slope has fully dropped to bottom
      for (let i = 0; i < numWallSegs; i++) {
        const t = (i + 0.5) / numWallSegs;
        const angle = startAngle + t * (endAngle - startAngle);
        const wx = sx + 25 * Math.cos(angle);
        const wz = sz + 25 * Math.sin(angle);
        
        const wallSegGeo = new THREE.BoxGeometry(segW, 0.8, 0.4);
        const wallSeg = new THREE.Mesh(wallSegGeo, wallMat);
        wallSeg.position.set(wx, wy_outer + 0.4, wz);
        wallSeg.rotation.y = -angle - Math.PI / 2;
        wallSeg.receiveShadow = this.receiveShadows;
        wallSeg.castShadow = this.receiveShadows;
        this.scene.add(wallSeg);
      }

      // 5. Spawn a cottage and trees on the sloped rounded corner
      const hx = sx + 14 * Math.cos(da);
      const hz = sz + 14 * Math.sin(da);
      const hy = 0.12 - rampDepth * (1 - Math.cos((14 / 25) * Math.PI / 2));
      spawnHouse(hx, hy, hz, rotY);

      // Place 4 trees distributed down the slope
      const treeAngles = [da - 0.2, da + 0.2, da - 0.35, da + 0.35];
      const treeDists = [8, 9, 18, 19];
      for (let i = 0; i < 4; i++) {
        const tx = sx + treeDists[i] * Math.cos(treeAngles[i]);
        const tz = sz + treeDists[i] * Math.sin(treeAngles[i]);
        const ty = 0.12 - rampDepth * (1 - Math.cos((treeDists[i] / 25) * Math.PI / 2));
        spawnSlopedTree(tx, ty, tz);
      }
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

        // === Detale high quality: linie krawędziowe i rynsztok ===
        if (isHighQuality) {
          const edgeLineMat = new THREE.MeshBasicMaterial({
            color: 0xd8dce4,
            transparent: true,
            opacity: 0.7,
          });
          const gutterMat = new THREE.MeshStandardMaterial({
            color: this.isNight ? 0x181c24 : 0x2a2e38,
            roughness: 0.95,
            metalness: 0.1,
          });
          const edgeLineW = 0.15;
          const gutterW = 0.25;
          const edgeOff = curbW / 2 + edgeLineW / 2 + 0.05;
          const gutterOff = curbW / 2 + gutterW / 2 + edgeLineW + 0.08;

          // Road edge lines (white paint) and gutter strips
          for (const [dx, dz, len, isH] of [
            [0, -curbOffZ - edgeOff, sidewalkW, true],  // South edge
            [0, curbOffZ + edgeOff, sidewalkW, true],   // North edge
            [-curbOffX - edgeOff, 0, sidewalkD, false],  // West edge
            [curbOffX + edgeOff, 0, sidewalkD, false],   // East edge
          ]) {
            // White road edge line
            const lineGeo = isH
              ? new THREE.PlaneGeometry(len, edgeLineW)
              : new THREE.PlaneGeometry(edgeLineW, len);
            const line = new THREE.Mesh(lineGeo, edgeLineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(cx + dx, 0.012, cz + dz);
            this.scene.add(line);
          }

          // Gutter strips (darker strip where road meets curb)
          for (const [dx, dz, len, isH] of [
            [0, -curbOffZ - gutterOff, sidewalkW, true],
            [0, curbOffZ + gutterOff, sidewalkW, true],
            [-curbOffX - gutterOff, 0, sidewalkD, false],
            [curbOffX + gutterOff, 0, sidewalkD, false],
          ]) {
            const gutterGeo = isH
              ? new THREE.PlaneGeometry(len, gutterW)
              : new THREE.PlaneGeometry(gutterW, len);
            const gutter = new THREE.Mesh(gutterGeo, gutterMat);
            gutter.rotation.x = -Math.PI / 2;
            gutter.position.set(cx + dx, 0.005, cz + dz);
            this.scene.add(gutter);
          }
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

        // === High quality intersection details: drain grates & stop lines ===
        if (isHighQuality) {
          const grateMat = new THREE.MeshStandardMaterial({
            color: 0x1a1e26,
            metalness: 0.7,
            roughness: 0.4,
          });
          const grateSlotMat = new THREE.MeshStandardMaterial({
            color: 0x0a0c10,
            metalness: 0.5,
            roughness: 0.6,
          });
          // Drain grates at 4 corners of intersection
          for (const [dx, dz] of [
            [roadHalf + 1.2, roadHalf + 1.2],
            [-roadHalf - 1.2, roadHalf + 1.2],
            [roadHalf + 1.2, -roadHalf - 1.2],
            [-roadHalf - 1.2, -roadHalf - 1.2],
          ]) {
            const grateGroup = new THREE.Group();
            // Frame
            const frame = new THREE.Mesh(
              new THREE.BoxGeometry(0.8, 0.04, 0.5),
              grateMat,
            );
            frame.position.y = 0.02;
            grateGroup.add(frame);
            // Slots
            for (let s = -3; s <= 3; s++) {
              const slot = new THREE.Mesh(
                new THREE.BoxGeometry(0.65, 0.02, 0.03),
                grateSlotMat,
              );
              slot.position.set(0, 0.05, s * 0.06);
              grateGroup.add(slot);
            }
            grateGroup.position.set(x + dx, 0.005, z + dz);
            grateGroup.rotation.x = 0;
            this.scene.add(grateGroup);
          }

          // Stop lines before crossings (thick white lines)
          const stopLineMat = new THREE.MeshBasicMaterial({
            color: 0xd8dce4,
            transparent: true,
            opacity: 0.75,
          });
          const stopLineThick = 0.4;
          const stopLineDist = crossOff + crossWidth / 2 + 0.8;
          // NS stop lines (horizontal, on vertical road approach)
          for (const dz of [-stopLineDist, stopLineDist]) {
            const stopLine = new THREE.Mesh(
              new THREE.PlaneGeometry(roadWidth * 0.8, stopLineThick),
              stopLineMat,
            );
            stopLine.rotation.x = -Math.PI / 2;
            stopLine.position.set(x, 0.013, z + dz);
            this.scene.add(stopLine);
          }
          // EW stop lines (vertical, on horizontal road approach)
          for (const dx of [-stopLineDist, stopLineDist]) {
            const stopLine = new THREE.Mesh(
              new THREE.PlaneGeometry(stopLineThick, roadWidth * 0.8),
              stopLineMat,
            );
            stopLine.rotation.x = -Math.PI / 2;
            stopLine.position.set(x + dx, 0.013, z);
            this.scene.add(stopLine);
          }
        }
      }
    }

    this._linkTrafficLights();
    this._placeCameras();

    if (this.zone.id === "industrial" || this.zone.id === "highway") {
      this._addRoadworks();
    }

    this._addLamps();
    this._buildGhostIslands();
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
    const isHQ = settings.current.quality === 'high';
    const lineMat = isHQ
      ? new THREE.MeshBasicMaterial({ color: 0xe8ecf0, transparent: true, opacity: 0.85 })
      : new THREE.MeshBasicMaterial({ color: 0xffffff });
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
    const isHQ = settings.current.quality === 'high';
    const stripeCount = 8;
    const stripeLen = footprint;
    const totalSpan = roadW * 0.85;
    const stripeThick = totalSpan / (stripeCount * 2 - 1);
    for (let i = 0; i < stripeCount; i++) {
      const off = -totalSpan / 2 + stripeThick / 2 + i * stripeThick * 2;

      // In high quality, vary stripe opacity slightly to simulate wear
      const stripeMat = isHQ
        ? new THREE.MeshBasicMaterial({
            color: 0xeef0f4,
            transparent: true,
            opacity: 0.78 + Math.random() * 0.18,
          })
        : new THREE.MeshBasicMaterial({ color: 0xffffff });

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
    const quality = settings.current.quality;
    const group = new THREE.Group();

    // --- Materials: LOW uses Lambert for pole/housing to save GPU ---
    let poleMat, housingMat;
    if (quality === 'low') {
      poleMat = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
      housingMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
    } else {
      poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.6, roughness: 0.5 });
      housingMat = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.4, roughness: 0.6 });
    }

    // --- Pole ---
    const poleSegs = quality === 'low' ? 6 : (quality === 'medium' ? 8 : 12);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 4.6, poleSegs),
      poleMat
    );
    pole.position.y = 2.3;
    pole.castShadow = this.castShadows;
    group.add(pole);

    // --- Base: medium & high only ---
    if (quality !== 'low') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.32, 0.25, poleSegs),
        poleMat
      );
      base.position.y = 0.12;
      group.add(base);
    }

    // --- Bracket: high only ---
    if (quality === 'high') {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.35),
        poleMat
      );
      bracket.position.set(0, 4.0, 0.17);
      group.add(bracket);
    }

    // --- Backboard: high only ---
    if (quality === 'high') {
      const backboardMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.3, roughness: 0.8 });
      const backboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 2.05, 0.06),
        backboardMat
      );
      backboard.position.set(0, 4.0, 0.31);
      group.add(backboard);
    }

    // --- Housing ---
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 1.85, 0.42),
      housingMat
    );
    housing.position.set(0, 4.0, 0.36);
    housing.castShadow = this.castShadows;
    group.add(housing);

    // --- Lamp materials — brighter emissive when lit ---
    const redMat = new THREE.MeshStandardMaterial({ color: 0x3a0a10, emissive: 0x180005, emissiveIntensity: 0.3, roughness: 0.4 });
    const ambMat = new THREE.MeshStandardMaterial({ color: 0x3a2a05, emissive: 0x1a1200, emissiveIntensity: 0.3, roughness: 0.4 });
    const grnMat = new THREE.MeshStandardMaterial({ color: 0x0a3a18, emissive: 0x00180a, emissiveIntensity: 0.3, roughness: 0.4 });

    // --- Lamps: LOW uses spheres, MEDIUM/HIGH use lens discs ---
    if (quality === 'low') {
      const lampGeo = new THREE.SphereGeometry(0.16, 8, 6);
      const red = new THREE.Mesh(lampGeo, redMat);
      red.position.set(0, 4.62, 0.58);
      const amb = new THREE.Mesh(lampGeo, ambMat);
      amb.position.set(0, 4.0, 0.58);
      const grn = new THREE.Mesh(lampGeo, grnMat);
      grn.position.set(0, 3.38, 0.58);
      group.add(red, amb, grn);
    } else {
      const lensSegs = quality === 'medium' ? 12 : 20;
      const lensGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, lensSegs);
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
    }

    // --- Visors: high only ---
    if (quality === 'high') {
      const visorMat = housingMat;
      const visorGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 16, 1, true, -Math.PI / 2, Math.PI);
      for (const y of [4.62, 4.0, 3.38]) {
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.rotation.x = Math.PI / 2;
        visor.position.set(0, y, 0.55);
        visor.scale.set(1, 1.2, 1);
        group.add(visor);
      }
    }

    // --- Halos: high only ---
    let redHalo = null, ambHalo = null, grnHalo = null;
    if (quality === 'high') {
      const haloGeo = new THREE.CircleGeometry(0.32, 16);
      const makeHalo = (col) => new THREE.Mesh(
        haloGeo,
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      redHalo = makeHalo(0xff2233);
      redHalo.position.set(0, 4.62, 0.63);
      ambHalo = makeHalo(0xffaa00);
      ambHalo.position.set(0, 4.0, 0.63);
      grnHalo = makeHalo(0x33ee55);
      grnHalo.position.set(0, 3.38, 0.63);
      group.add(redHalo, ambHalo, grnHalo);
    }

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
    const quality = settings.current.quality;
    const group = new THREE.Group();

    // --- Materials: LOW uses Lambert for pole/housing to save GPU ---
    let poleMat, housingMat;
    if (quality === 'low') {
      poleMat = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
      housingMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
    } else {
      poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.6, roughness: 0.5 });
      housingMat = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.4, roughness: 0.6 });
    }

    // Słupek (zwężany, metaliczny jak dla samochodów)
    const poleSegs = quality === 'low' ? 6 : (quality === 'medium' ? 8 : 12);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 2.6, poleSegs),
      poleMat
    );
    pole.position.y = 1.3;
    pole.castShadow = this.castShadows;
    group.add(pole);

    // Podstawa słupka
    if (quality !== 'low') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.15, poleSegs),
        poleMat
      );
      base.position.y = 0.075;
      group.add(base);
    }

    // Uchwyt montażowy ze słupka do obudowy
    if (quality === 'high') {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.22),
        poleMat
      );
      bracket.position.set(0, 2.85, 0.1);
      group.add(bracket);
    }

    // Ekran kontrastowy (backboard)
    if (quality === 'high') {
      const backboardMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.3, roughness: 0.8 });
      const backboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 1.15, 0.04),
        backboardMat
      );
      backboard.position.set(0, 2.85, 0.21);
      group.add(backboard);
    }

    // Obudowa sygnalizatora (czarny plastik/metal)
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 1.0, 0.24),
      housingMat
    );
    housing.position.set(0, 2.85, 0.25);
    housing.castShadow = this.castShadows;
    group.add(housing);

    // Materiały kloszy (zgaszone na start)
    const redMat = new THREE.MeshStandardMaterial({ color: 0x3a0a10, emissive: 0x0e0204, emissiveIntensity: 0.2, roughness: 0.4 });
    const grnMat = new THREE.MeshStandardMaterial({ color: 0x0a3a18, emissive: 0x020e06, emissiveIntensity: 0.2, roughness: 0.4 });

    // Klosze: LOW uses spheres, MEDIUM/HIGH use lens discs
    if (quality === 'low') {
      const lampGeo = new THREE.SphereGeometry(0.1, 8, 6);
      const redLamp = new THREE.Mesh(lampGeo, redMat);
      redLamp.position.set(0, 3.1, 0.37);
      const grnLamp = new THREE.Mesh(lampGeo, grnMat);
      grnLamp.position.set(0, 2.6, 0.37);
      group.add(redLamp, grnLamp);
    } else {
      const lensSegs = quality === 'medium' ? 10 : 16;
      const lensGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.03, lensSegs);
      const redLamp = new THREE.Mesh(lensGeo, redMat);
      redLamp.rotation.x = Math.PI / 2;
      redLamp.position.set(0, 3.1, 0.38);
      const grnLamp = new THREE.Mesh(lensGeo, grnMat);
      grnLamp.rotation.x = Math.PI / 2;
      grnLamp.position.set(0, 2.6, 0.38);
      group.add(redLamp, grnLamp);
    }

    // Daszki ochronne (visors) nad każdą lampą
    if (quality === 'high') {
      const visorMat = housingMat;
      const visorGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.14, 16, 1, true, -Math.PI / 2, Math.PI);
      for (const y of [3.1, 2.6]) {
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.rotation.x = Math.PI / 2;
        visor.position.set(0, y, 0.36);
        visor.scale.set(1, 1.2, 1);
        group.add(visor);
      }
    }

    // Dyski poświaty (halos) włączane przy aktywnym świetle
    let redHalo = null, grnHalo = null;
    if (quality === 'high') {
      const haloGeo = new THREE.CircleGeometry(0.20, 16);
      const makeHalo = (col) => new THREE.Mesh(
        haloGeo,
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      redHalo = makeHalo(0xff2233);
      redHalo.position.set(0, 3.1, 0.405);
      grnHalo = makeHalo(0x33ee55);
      grnHalo.position.set(0, 2.6, 0.405);
      group.add(redHalo, grnHalo);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.scene.add(group);

    const pedLight = { group, state: 'red', redMat, grnMat, redHalo, grnHalo, linkedVehicle };
    this.pedestrianLights.push(pedLight);
    return pedLight;
  }

  _applyPedLightVisual(pl) {
    const on = pl.state === 'green';
    pl.redMat.color.setHex(on ? 0x3a0a10 : 0xff2233);
    pl.redMat.emissive.setHex(on ? 0x0e0204 : 0xff2233);
    pl.redMat.emissiveIntensity = on ? 0.2 : 2.4;
    pl.grnMat.color.setHex(on ? 0x33ee55 : 0x0a3a18);
    pl.grnMat.emissive.setHex(on ? 0x33ee55 : 0x020e06);
    pl.grnMat.emissiveIntensity = on ? 2.4 : 0.2;
    if (pl.redHalo) pl.redHalo.material.opacity = on ? 0 : 0.55;
    if (pl.grnHalo) pl.grnHalo.material.opacity = on ? 0.55 : 0;
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
        pl.grnMat.color.setHex(on ? 0x33ee55 : 0x0a3a18);
        pl.grnMat.emissive.setHex(on ? 0x33ee55 : 0x020e06);
        pl.grnMat.emissiveIntensity = on ? 2.4 : 0.2;
        pl.redMat.color.setHex(0x3a0a10);
        pl.redMat.emissive.setHex(0x0e0204);
        pl.redMat.emissiveIntensity = 0.2;
        if (pl.redHalo) pl.redHalo.material.opacity = 0;
        if (pl.grnHalo) pl.grnHalo.material.opacity = on ? 0.55 : 0;
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
      for (let attempt = 0; attempt < 15; attempt++) {
        offX = (Math.random() - 0.5) * 2 * maxOffX;
        offZ = (Math.random() - 0.5) * 2 * maxOffZ;
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

  _buildGhostIslands() {
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

      // 4. A small cottage and trees on top of the island
      if (Math.random() < 0.7) {
        // Spawn small cottage
        const cw = 2 + Math.random() * 1.5;
        const ch = 2 + Math.random() * 1.5;
        const houseGeo = new THREE.BoxGeometry(cw, ch, cw);
        const house = new THREE.Mesh(houseGeo, ghostRockMat);
        house.position.set(-iw/4 + Math.random() * 2, 0.4 + ch/2, -id/4 + Math.random() * 2);
        group.add(house);

        // Roof
        const roofGeo = new THREE.ConeGeometry(cw * 0.8, 1.2, 4);
        const roof = new THREE.Mesh(roofGeo, ghostRoofMat);
        roof.position.set(house.position.x, house.position.y + ch/2 + 0.6, house.position.z);
        roof.rotation.y = Math.PI / 4;
        group.add(roof);

        // Add a glowing window dot on the cottage
        if (Math.random() < 0.8) {
          const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), winMat);
          dot.position.set(house.position.x, house.position.y, house.position.z + cw/2 + 0.02);
          group.add(dot);
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

  cullScene(camera) {
    try {
      const camPos = camera.position;
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      if (!this._logCount) this._logCount = 0;
      if (this._logCount < 10) {
        this._logCount++;
        const sampleBuildings = [];
        for (let i = 0; i < Math.min(5, this.buildings.length); i++) {
          const b = this.buildings[i];
          if (b.mesh) {
            const bx = (b.x1 + b.x2) / 2;
            const bz = (b.z1 + b.z2) / 2;
            const by = (b.mesh.userData.height || 20) / 2;
            const vx = bx - camPos.x;
            const vy = by - camPos.y;
            const vz = bz - camPos.z;
            const dist = Math.hypot(vx, vz);
            const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
            sampleBuildings.push({ i, bx, by, bz, vx, vy, vz, dist, dot });
          }
        }
        fetch('/log', {
          method: 'POST',
          body: JSON.stringify({
            tick: this._logCount,
            camPos: { x: camPos.x, y: camPos.y, z: camPos.z },
            camDir: { x: camDir.x, y: camDir.y, z: camDir.z },
            buildingsCount: this.buildings.length,
            treesCount: this.trees.length,
            benchesCount: this.benches.length,
            samples: sampleBuildings
          })
        }).catch(() => {});
      }
      
      const objPos = new THREE.Vector3();
      
      // Cull buildings
      for (const b of this.buildings) {
        if (b.mesh) {
          const bx = (b.x1 + b.x2) / 2;
          const bz = (b.z1 + b.z2) / 2;
          const by = (b.mesh.userData.height || 20) / 2;
          
          objPos.set(bx, by, bz);
          
          const vx = objPos.x - camPos.x;
          const vy = objPos.y - camPos.y;
          const vz = objPos.z - camPos.z;
          const dist = Math.hypot(vx, vz);
          
          const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
          
          // Pokaż tylko jeśli jest z przodu kamery (z marginesem -15) i w odległości 200m
          b.mesh.visible = (dot > -15) && (dist < 200);
        }
      }
      
      // Cull trees
      for (const t of this.trees) {
        if (t.mesh) {
          const vx = t.x - camPos.x;
          const vy = 2.0 - camPos.y;
          const vz = t.z - camPos.z;
          const dist = Math.hypot(vx, vz);
          const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
          
          t.mesh.visible = (dot > -10) && (dist < 150);
        }
      }
      
      // Cull benches
      for (const bn of this.benches) {
        if (bn.mesh) {
          const vx = bn.x - camPos.x;
          const vy = 0.5 - camPos.y;
          const vz = bn.z - camPos.z;
          const dist = Math.hypot(vx, vz);
          const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
          
          bn.mesh.visible = (dot > -10) && (dist < 120);
        }
      }

      // Cull ghost buildings
      if (this.ghostBuildings) {
        for (const gb of this.ghostBuildings) {
          if (gb.mesh) {
            const bx = (gb.x1 + gb.x2) / 2;
            const bz = (gb.z1 + gb.z2) / 2;
            const by = gb.height / 2;
            
            const vx = bx - camPos.x;
            const vy = by - camPos.y;
            const vz = bz - camPos.z;
            const dist = Math.hypot(vx, vz);
            const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
            
            // Widmowe budynki widać znacznie dalej (do 400m)
            gb.mesh.visible = (dot > -30) && (dist < 400);
          }
        }
      }
    } catch (e) {
      console.error("Error in cullScene:", e);
    }
  }
}
