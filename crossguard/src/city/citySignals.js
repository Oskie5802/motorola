import * as THREE from 'three';
import { settings } from '../core/settings.js';

export function _addLaneLines(cx, cz, w, d, axis) {
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

export function _addZebra(cx, cz, pedAxis, roadW, footprint) {
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

export function _addTrafficLight(x, z, axis, rotationY = 0, intersectionX = x, intersectionZ = z) {
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

export function _addPedestrianLight(x, z, rotationY, linkedVehicle) {
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

export function _applyPedLightVisual(pl) {
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

export function _linkTrafficLights() {
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

export function _applyLightVisual(list) {
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

export function updateTrafficLights(dt) {
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

export function _placeCameras() {
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

export function _addRoadworks() {
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

export function _addLamps() {
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

export function _createStreetLamp(x, z, poleMat, headMat) {
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

export function _createSignBoard(type) {
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

export function _createSign(x, z, type, rotationY) {
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

export function _createDoubleSign(x, z, topType, bottomType, rotationY) {
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
