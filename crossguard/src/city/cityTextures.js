import * as THREE from 'three';

const _textureCache = {};

export function _createAsphaltTexture(isNight, quality = 'high') {
  const key = `asphalt_${isNight}_${quality}`;
  if (_textureCache[key]) return _textureCache[key];

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

  _textureCache[key] = tex;
  return tex;
}

export function _createAsphaltBumpMap(isNight, quality = 'high') {
  const key = `asphalt_bump_${isNight}_${quality}`;
  if (_textureCache[key]) return _textureCache[key];

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

  _textureCache[key] = tex;
  return tex;
}

export function _createSidewalkTexture(isNight, quality = 'high') {
  const key = `sidewalk_${isNight}_${quality}`;
  if (_textureCache[key]) return _textureCache[key];

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

  _textureCache[key] = tex;
  return tex;
}

export function _createSidewalkBumpMap(isNight, quality = 'high') {
  const key = `sidewalk_bump_${isNight}_${quality}`;
  if (_textureCache[key]) return _textureCache[key];

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

  _textureCache[key] = tex;
  return tex;
}

export function _createCurbTexture(isNight, quality = 'high') {
  const key = `curb_${isNight}_${quality}`;
  if (_textureCache[key]) return _textureCache[key];

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

  _textureCache[key] = tex;
  return tex;
}

export function _createCurbBumpMap(isNight, quality = 'high') {
  const key = `curb_bump_${isNight}_${quality}`;
  if (_textureCache[key]) return _textureCache[key];

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

  _textureCache[key] = tex;
  return tex;
}

export function _createRoadEdgeLineTexture() {
  const key = 'road_edge';
  if (_textureCache[key]) return _textureCache[key];

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

  _textureCache[key] = tex;
  return tex;
}
