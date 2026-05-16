// === Vehicles, NPC pedestrians, emergency vehicles ===
import * as THREE from 'three';
import { PALETTE } from './config.js';

export class TrafficSystem {
  constructor(scene, city, zone) {
    this.scene = scene;
    this.city = city;
    this.zone = zone;
    this.vehicles = [];
    this.peds = [];
    this.emergency = []; // active emergency vehicle instances

    this._spawnVehicles(zone.vehicles);
    this._spawnPeds(zone.pedestrians);
  }

  _spawnVehicles(n) {
    for (let i = 0; i < n; i++) {
      this.vehicles.push(this._makeVehicle());
    }
  }

  _makeVehicle(forceType = null) {
    const types = [
      { type: 'car',    w: 1.6, h: 1.1, d: 3.0, speed: 1.0, color: null },
      { type: 'car',    w: 1.6, h: 1.1, d: 3.0, speed: 1.0, color: null },
      { type: 'car',    w: 1.6, h: 1.1, d: 3.0, speed: 1.0, color: null },
      { type: 'bus',    w: 2.2, h: 2.4, d: 7.0, speed: 0.7, color: 0xffc23a },
      { type: 'truck',  w: 2.0, h: 2.2, d: 5.5, speed: 0.65, color: 0x555588 },
      { type: 'tram',   w: 2.3, h: 2.6, d: 9.0, speed: 0.8, color: 0xc23030 },
    ];
    let t = types[Math.floor(Math.random() * types.length)];
    if (this.zone.id === 'industrial') {
      // Bias to truck
      if (Math.random() < 0.5) t = types[4];
    }
    if (this.zone.id === 'downtown' && Math.random() < 0.2) {
      t = types[5]; // tram
    }
    if (this.zone.id === 'school' && Math.random() < 0.3) {
      t = types[3]; // school bus
    }
    if (forceType) t = types.find(x => x.type === forceType) || t;

    const color = t.color ?? PALETTE.vehicle[Math.floor(Math.random() * PALETTE.vehicle.length)];

    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.35, metalness: 0.55,
    });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x12161e, roughness: 0.25, metalness: 0.3,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x6fbfe3, roughness: 0.15, metalness: 0.4,
      transparent: true, opacity: 0.55, envMapIntensity: 1.2,
    });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.85 });
    const rimMat   = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.85 });

    if (t.type === 'car') {
      // Dolne nadwozie (szersze podwozie)
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(t.w, t.h * 0.42, t.d, 1, 1, 4),
        bodyMat
      );
      lower.position.y = t.h * 0.34;
      lower.castShadow = true;
      group.add(lower);

      // Maska (przód niżej) i bagażnik
      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.95, t.h * 0.22, t.d * 0.32),
        bodyMat
      );
      hood.position.set(0, t.h * 0.6, -t.d * 0.32);
      group.add(hood);
      const trunk = hood.clone();
      trunk.position.z = t.d * 0.32;
      group.add(trunk);

      // Kabina (trapezoidalna - skalowana)
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.85, t.h * 0.42, t.d * 0.45),
        cabinMat
      );
      cabin.position.set(0, t.h * 0.78, 0);
      group.add(cabin);

      // Szyba przednia
      const wsGeo = new THREE.PlaneGeometry(t.w * 0.78, t.h * 0.38);
      const ws = new THREE.Mesh(wsGeo, glassMat);
      ws.position.set(0, t.h * 0.78, -t.d * 0.22);
      ws.rotation.x = -0.25;
      group.add(ws);
      const wsBack = ws.clone();
      wsBack.position.z = t.d * 0.22;
      wsBack.rotation.x = 0.25;
      group.add(wsBack);
      // Szyby boczne
      const sideGeo = new THREE.PlaneGeometry(t.d * 0.42, t.h * 0.32);
      const sideL = new THREE.Mesh(sideGeo, glassMat);
      sideL.position.set(-t.w * 0.43, t.h * 0.8, 0);
      sideL.rotation.y = -Math.PI / 2;
      group.add(sideL);
      const sideR = sideL.clone();
      sideR.position.x = t.w * 0.43;
      sideR.rotation.y = Math.PI / 2;
      group.add(sideR);

      // Dach - subtelny pasek
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.7, 0.05, t.d * 0.4),
        new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.55 })
      );
      roof.position.set(0, t.h * 1.0, 0);
      group.add(roof);
    } else if (t.type === 'bus' || t.type === 'truck') {
      // Korpus
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(t.w, t.h * 0.6, t.d),
        bodyMat
      );
      lower.position.y = t.h * 0.45;
      lower.castShadow = true;
      group.add(lower);
      // Kabina/dach
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.95, t.h * 0.4, t.d * 0.55),
        new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.4 })
      );
      cabin.position.set(0, t.h * 0.95, t.type === 'truck' ? -t.d * 0.18 : -t.d * 0.05);
      group.add(cabin);
      // Pasy okien
      for (let i = 0; i < (t.type === 'bus' ? 5 : 2); i++) {
        const wn = new THREE.Mesh(
          new THREE.PlaneGeometry(t.d * 0.13, t.h * 0.3),
          glassMat
        );
        wn.position.set(-t.w * 0.501, t.h * 0.65, -t.d * 0.35 + (i + 0.5) * (t.d * 0.7 / Math.max(1, (t.type==='bus'?5:2))));
        wn.rotation.y = -Math.PI / 2;
        group.add(wn);
        const wnR = wn.clone();
        wnR.position.x = t.w * 0.501;
        wnR.rotation.y = Math.PI / 2;
        group.add(wnR);
      }
      // Szyba przednia (kabina)
      const fws = new THREE.Mesh(
        new THREE.PlaneGeometry(t.w * 0.85, t.h * 0.35),
        glassMat
      );
      fws.position.set(0, t.h * 0.95, -t.d * 0.5);
      group.add(fws);
    } else if (t.type === 'tram') {
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(t.w, t.h * 0.5, t.d),
        bodyMat
      );
      lower.position.y = t.h * 0.4;
      lower.castShadow = true;
      group.add(lower);
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.95, t.h * 0.45, t.d * 0.95),
        new THREE.MeshStandardMaterial({ color: 0xaa2020, roughness: 0.4 })
      );
      top.position.y = t.h * 0.88;
      group.add(top);
      // Długie szyby
      for (let i = 0; i < 6; i++) {
        const wn = new THREE.Mesh(new THREE.PlaneGeometry(t.d * 0.12, t.h * 0.3), glassMat);
        wn.position.set(-t.w * 0.501, t.h * 0.85, -t.d * 0.42 + (i + 0.5) * (t.d * 0.85 / 6));
        wn.rotation.y = -Math.PI / 2;
        group.add(wn);
        const wnR = wn.clone();
        wnR.position.x = t.w * 0.501;
        wnR.rotation.y = Math.PI / 2;
        group.add(wnR);
      }
      // Pantograf
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 })
      );
      pole.position.y = t.h * 1.2;
      group.add(pole);
    }

    // === Koła (wszystkie pojazdy) ===
    if (t.type !== 'tram') {
      const wheelR = Math.min(0.36, t.h * 0.3);
      const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 14);
      const rimGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.24, 10);
      const axles = (t.type === 'car') ? [-t.d * 0.32, t.d * 0.32] : [-t.d * 0.36, t.d * 0.36];
      for (const az of axles) {
        for (const ax of [-t.w * 0.5, t.w * 0.5]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(ax, wheelR, az);
          w.castShadow = true;
          group.add(w);
          const rim = new THREE.Mesh(rimGeo, rimMat);
          rim.rotation.z = Math.PI / 2;
          rim.position.set(ax * 1.01, wheelR, az);
          group.add(rim);
        }
      }
    } else {
      // Tram - dwie pary niskich kół
      for (const az of [-t.d * 0.35, t.d * 0.35]) {
        const w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, t.w * 1.05, 12),
          wheelMat
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(0, 0.28, az);
        group.add(w);
      }
    }

    // Reflektory
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff6d2, emissive: 0xfff2c8, emissiveIntensity: 1.4
    });
    const hL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lightMat);
    hL.scale.set(1.2, 0.7, 0.5);
    hL.position.set(-t.w * 0.32, t.h * 0.45, -t.d / 2 - 0.02);
    group.add(hL);
    const hR = hL.clone();
    hR.position.x = t.w * 0.32;
    group.add(hR);
    // Tylne światła
    const tMat = new THREE.MeshStandardMaterial({
      color: 0xff2a2a, emissive: 0xff2030, emissiveIntensity: 0.9
    });
    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), tMat);
    tL.position.set(-t.w * 0.32, t.h * 0.45, t.d / 2 + 0.02);
    group.add(tL);
    const tR = tL.clone();
    tR.position.x = t.w * 0.32;
    group.add(tR);

    this.scene.add(group);

    // Choose a road segment & lane direction
    const seg = this.city.roadSegments[Math.floor(Math.random() * this.city.roadSegments.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const laneOffset = 1.6 * dir; // offset to right side of road

    let x, z, vx, vz, axis;
    if (seg.axis === 'h') {
      // road runs along x; offset in z
      x = seg.x1 + Math.random() * (seg.x2 - seg.x1);
      z = seg.z1 + laneOffset;
      vx = dir;
      vz = 0;
      axis = 'h';
    } else {
      x = seg.x1 + laneOffset;
      z = seg.z1 + Math.random() * (seg.z2 - seg.z1);
      vx = 0;
      vz = dir;
      axis = 'v';
    }
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(vx, vz) + Math.PI;

    return {
      group,
      type: t.type,
      w: t.w, h: t.h, d: t.d,
      baseSpeed: this.zone.vehicleSpeed * t.speed * 12, // u/s
      speed: this.zone.vehicleSpeed * t.speed * 12,
      vx, vz, axis, dir,
      pos: { x, z },
      stopped: false,
      runsRed: Math.random() < this.zone.redLightRunChance,
      isEmergency: false,
      siren: null,
    };
  }

  _spawnPeds(n) {
    const shirtColors = [0xd34c4c, 0x4cd366, 0xd3c44c, 0x6f4cd3, 0x4cb5d3, 0xd34cb5,
                         0xe8772c, 0x2e8f6b, 0x9c3b6f, 0x36507c];
    const skinTones = [0xf6c8a0, 0xe2b48a, 0xc99772, 0xa6764e, 0x8b5a3c];
    const hairColors = [0x1a1108, 0x3c2210, 0x6b4423, 0xa67442, 0xd9b271, 0x2c2c2c];
    const pantsColors = [0x1a2540, 0x2a2f38, 0x3a3b48, 0x554938, 0x202833];

    for (let i = 0; i < n; i++) {
      const p = this.city.randomSidewalkPoint();
      const group = new THREE.Group();
      const heightScale = 0.85 + Math.random() * 0.3;
      const c = shirtColors[Math.floor(Math.random() * shirtColors.length)];
      const skinC = skinTones[Math.floor(Math.random() * skinTones.length)];
      const hairC = hairColors[Math.floor(Math.random() * hairColors.length)];
      const pantsC = pantsColors[Math.floor(Math.random() * pantsColors.length)];

      const shirtMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
      const skinMat  = new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.8 });
      const hairMat  = new THREE.MeshStandardMaterial({ color: hairC, roughness: 0.6 });
      const pantsMat = new THREE.MeshStandardMaterial({ color: pantsC, roughness: 0.85 });
      const shoesMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });

      // Tors
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28, 1, 2, 1), shirtMat);
      torso.position.y = 1.0;
      torso.castShadow = true;
      group.add(torso);
      // Szyja
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 10), skinMat);
      neck.position.y = 1.42;
      group.add(neck);
      // Głowa
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 14, 12), skinMat);
      head.position.y = 1.6;
      head.scale.set(1, 1.08, 0.95);
      head.castShadow = true;
      group.add(head);
      // Włosy (półsfera)
      if (Math.random() > 0.15) {
        const hair = new THREE.Mesh(
          new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1),
          hairMat
        );
        hair.position.y = 1.64;
        group.add(hair);
      }
      // Ramiona (cylindry)
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.6, 10), shirtMat);
      armL.position.set(-0.32, 1.05, 0);
      armL.castShadow = true;
      group.add(armL);
      const armR = armL.clone(); armR.position.x = 0.32;
      group.add(armR);
      // Dłonie
      const handL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skinMat);
      handL.position.set(-0.32, 0.74, 0);
      group.add(handL);
      const handR = handL.clone(); handR.position.x = 0.32;
      group.add(handR);
      // Nogi
      const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.65, 10), pantsMat);
      legL.position.set(-0.12, 0.34, 0);
      legL.castShadow = true;
      group.add(legL);
      const legR = legL.clone(); legR.position.x = 0.12;
      group.add(legR);
      // Buty
      const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), shoesMat);
      shoeL.position.set(-0.12, 0.05, 0.04);
      group.add(shoeL);
      const shoeR = shoeL.clone(); shoeR.position.x = 0.12;
      group.add(shoeR);

      // miękki cień
      const sh = new THREE.Mesh(
        new THREE.CircleGeometry(0.38, 18),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.02;
      group.add(sh);

      group.scale.setScalar(heightScale);

      const route = this._makeNpcRoute();
      const start = route ? route[0] : this.city.randomSidewalkPoint();

      group.position.set(start.x, 0, start.z);
      this.scene.add(group);

      this.peds.push({
        group,
        pos: { x: start.x, z: start.z },
        route,   // array of {x,z,type:'walk'|'wait',light?}
        wpIdx: 0,
        speed: 1.2 + Math.random() * 0.6,
        phase: Math.random() * 10,
        armL, armR, legL, legR,
      });
    }
  }

  // Build a looping NPC route that circles one full intersection,
  // crossing all 4 arms and obeying each arm's traffic light.
  // Layout (clockwise): south arm → SW corner → west arm → NW corner →
  //                     north arm → NE corner → east arm → SE corner → repeat
  _makeNpcRoute() {
    const inters = this.city.intersections;
    const crossings = this.city.crossings;
    if (!inters?.length || !crossings?.length) return null;

    const CO = 5.5;  // crossing center from intersection (roadHalf 4 + 1.5)
    const RE = 4.8;  // road-edge entry point (roadHalf 4 + padding 0.8)
    const ST = 8;    // stroll distance along sidewalk before/after crossing

    const find = (axis, px, pz) =>
      crossings.find(c => c.axis === axis &&
                          Math.abs(c.x - px) < 2 &&
                          Math.abs(c.z - pz) < 2);

    for (let t = 0; t < 20; t++) {
      const { x: ix, z: iz } =
        inters[Math.floor(Math.random() * inters.length)];

      const S = find('h', ix, iz + CO);
      const W = find('v', ix - CO, iz);
      const N = find('h', ix, iz - CO);
      const E = find('v', ix + CO, iz);

      if (!S || !W || !N || !E) continue;

      // Stroll points — skip if inside a building
      const pts = [
        { x: ix + RE + ST, z: iz + CO },   // east of south arm
        { x: ix - CO,      z: iz + RE + ST }, // south of west arm
        { x: ix - RE - ST, z: iz - CO },   // west of north arm
        { x: ix + CO,      z: iz - RE - ST }, // north of east arm
      ];
      if (pts.some(p => this.city.collidesBuilding(p.x, p.z, 0.3))) continue;

      // Pick a random starting arm so NPCs spread around the intersection
      const startArm = Math.floor(Math.random() * 4);
      const full = [
        // South arm: cross east → west
        { x: ix + RE + ST, z: iz + CO,  type: 'walk' },
        { x: ix + RE,      z: iz + CO,  type: 'wait', light: S.light },
        { x: ix - RE,      z: iz + CO,  type: 'walk' },
        { x: ix - RE,      z: iz + RE,  type: 'walk' }, // SW corner
        // West arm: cross south → north
        { x: ix - CO,      z: iz + RE + ST, type: 'walk' },
        { x: ix - CO,      z: iz + RE,  type: 'wait', light: W.light },
        { x: ix - CO,      z: iz - RE,  type: 'walk' },
        { x: ix - RE,      z: iz - RE,  type: 'walk' }, // NW corner
        // North arm: cross west → east
        { x: ix - RE - ST, z: iz - CO,  type: 'walk' },
        { x: ix - RE,      z: iz - CO,  type: 'wait', light: N.light },
        { x: ix + RE,      z: iz - CO,  type: 'walk' },
        { x: ix + RE,      z: iz - RE,  type: 'walk' }, // NE corner
        // East arm: cross north → south
        { x: ix + CO,      z: iz - RE - ST, type: 'walk' },
        { x: ix + CO,      z: iz - RE,  type: 'wait', light: E.light },
        { x: ix + CO,      z: iz + RE,  type: 'walk' },
        { x: ix + RE,      z: iz + RE,  type: 'walk' }, // SE corner
      ];

      // Rotate so NPCs start at different arms
      const offset = startArm * 4;
      return [...full.slice(offset), ...full.slice(0, offset)];
    }
    return null;
  }

  update(dt, playerPos, signals) {
    // Vehicles
    for (const v of this.vehicles) {
      this._updateVehicle(v, dt, playerPos, signals);
    }
    // NPC pedestrians: walk sidewalk → stop at crossing → cross on green → repeat
    for (const p of this.peds) {
      if (!p.route || p.route.length === 0) continue;
      const wp = p.route[p.wpIdx];
      const dx = wp.x - p.pos.x;
      const dz = wp.z - p.pos.z;
      const d  = Math.hypot(dx, dz);

      if (wp.type === 'wait') {
        if (d > 0.4) {
          // Not yet at the road edge — walk there first
          const nx = p.pos.x + (dx / d) * p.speed * dt;
          const nz = p.pos.z + (dz / d) * p.speed * dt;
          if (!this.city.collidesBuilding(nx, nz, 0.25)) {
            p.pos.x = nx; p.pos.z = nz;
          }
          p.phase += dt * 6;
          const sw = Math.sin(p.phase) * 0.5;
          if (p.armL) p.armL.rotation.x = sw;
          if (p.armR) p.armR.rotation.x = -sw;
          if (p.legL) p.legL.rotation.x = -sw * 0.7;
          if (p.legR) p.legR.rotation.x =  sw * 0.7;
          p.group.position.set(p.pos.x, Math.abs(Math.sin(p.phase * 2)) * 0.04, p.pos.z);
          p.group.rotation.y = Math.atan2(dx, dz);
          continue;
        }
        // At road edge — vehicle RED = pedestrian GREEN, safe to cross
        const canCross = wp.light && wp.light.state === 'red';
        if (!canCross) {
          // Stand still with gentle idle sway
          p.phase += dt * 1.5;
          const sway = Math.sin(p.phase) * 0.08;
          if (p.armL) p.armL.rotation.x = sway;
          if (p.armR) p.armR.rotation.x = -sway;
          if (p.legL) p.legL.rotation.x = 0;
          if (p.legR) p.legR.rotation.x = 0;
          p.group.position.set(p.pos.x, 0, p.pos.z);
          continue;
        }
        p.wpIdx = (p.wpIdx + 1) % p.route.length;
        continue;
      }

      // type === 'walk'
      if (d < 0.4) {
        p.wpIdx = (p.wpIdx + 1) % p.route.length;
        continue;
      }
      const nx = p.pos.x + (dx / d) * p.speed * dt;
      const nz = p.pos.z + (dz / d) * p.speed * dt;
      const onCrossing = this.city.isOnCrossing(nx, nz);
      if (onCrossing || !this.city.collidesBuilding(nx, nz, 0.25)) {
        p.pos.x = nx; p.pos.z = nz;
      } else {
        p.wpIdx = (p.wpIdx + 1) % p.route.length;
      }
      p.phase += dt * 6;
      const swing = Math.sin(p.phase) * 0.5;
      if (p.armL) p.armL.rotation.x = swing;
      if (p.armR) p.armR.rotation.x = -swing;
      if (p.legL) p.legL.rotation.x = -swing * 0.7;
      if (p.legR) p.legR.rotation.x =  swing * 0.7;
      p.group.position.set(p.pos.x, Math.abs(Math.sin(p.phase * 2)) * 0.04, p.pos.z);
      p.group.rotation.y = Math.atan2(dx, dz);
    }

  }

  _updateVehicle(v, dt, playerPos, signals) {
    // Check upcoming traffic light & player on crossing in front
    let shouldStop = false;
    const lookAhead = 6 + v.d / 2;

    // Front position
    const fx = v.pos.x + v.vx * lookAhead;
    const fz = v.pos.z + v.vz * lookAhead;

    // Check traffic light in front
    if (!v.runsRed && !v.isEmergency) {
      for (const tl of this.city.trafficLights) {
        const tdx = tl.pos.x - v.pos.x;
        const tdz = tl.pos.z - v.pos.z;
        const along = (v.vx * tdx) + (v.vz * tdz);
        const perp = Math.abs(v.vx * tdz - v.vz * tdx);
        // Light controls car direction perpendicular to its axis label
        const controls = (v.axis === 'h' && tl.axis === 'ew') || (v.axis === 'v' && tl.axis === 'ns');
        if (controls && along > 0 && along < lookAhead + 3 && perp < 8) {
          if (tl.state === 'red' || tl.state === 'amber') {
            shouldStop = true;
          }
        }
      }
    }

    // Player on crossing in front
    const pdx = playerPos.x - v.pos.x;
    const pdz = playerPos.z - v.pos.z;
    const palong = v.vx * pdx + v.vz * pdz;
    const pperp = Math.abs(v.vx * pdz - v.vz * pdx);
    if (palong > 0 && palong < lookAhead && pperp < 2.5) {
      const cross = this.city.isOnCrossing(playerPos.x, playerPos.z);
      if (cross) shouldStop = true;
      // Also stop if very close (avoid running over jaywalker)
      if (palong < 4 && pperp < 1.6) shouldStop = true;
    }

    // Vehicle ahead?
    for (const other of this.vehicles) {
      if (other === v) continue;
      const odx = other.pos.x - v.pos.x;
      const odz = other.pos.z - v.pos.z;
      const oa = v.vx * odx + v.vz * odz;
      const op = Math.abs(v.vx * odz - v.vz * odx);
      if (oa > 0 && oa < lookAhead && op < 2.0) {
        shouldStop = true;
        break;
      }
    }

    // Weather effect
    const weatherMul = this.zone.weather === 'rain' ? 0.85 : this.zone.weather === 'fog' ? 0.8 : 1.0;
    const target = shouldStop ? 0 : v.baseSpeed * weatherMul * (v.isEmergency ? 1.4 : 1);
    v.speed += (target - v.speed) * Math.min(1, dt * 3.0);

    v.pos.x += v.vx * v.speed * dt;
    v.pos.z += v.vz * v.speed * dt;

    // Wrap when off-grid
    const b = this.city.bounds;
    if (v.pos.x < b.min - 10 || v.pos.x > b.max + 10 ||
        v.pos.z < b.min - 10 || v.pos.z > b.max + 10) {
      // Respawn on a random road segment
      const fresh = this._makeVehicle();
      v.pos = fresh.pos; v.vx = fresh.vx; v.vz = fresh.vz;
      v.axis = fresh.axis; v.dir = fresh.dir;
      v.group.position.set(v.pos.x, 0, v.pos.z);
      v.group.rotation.y = Math.atan2(v.vx, v.vz);
      // Remove the temp visual we just created
      this.scene.remove(fresh.group);
      this.vehicles.splice(this.vehicles.indexOf(fresh), 1);
    }

    v.group.position.set(v.pos.x, 0, v.pos.z);
    v.group.rotation.y = Math.atan2(v.vx, v.vz) + Math.PI;

    // Emergency siren visual
    if (v.isEmergency && v.siren) {
      v.siren.userData.t = (v.siren.userData.t || 0) + dt * 8;
      const t = Math.sin(v.siren.userData.t);
      v.siren.children[0].material.opacity = t > 0 ? 1 : 0.1;
      v.siren.children[1].material.opacity = t < 0 ? 1 : 0.1;
    }
  }

  _spawnEmergency() {
    const v = this._makeVehicle('car');
    v.isEmergency = true;
    v.runsRed = true;

    // Repaint body
    const newCol = Math.random() < 0.5 ? 0xffffff : 0xdd2c2c;
    const newMat = new THREE.MeshStandardMaterial({ color: newCol, roughness: 0.3, metalness: 0.6 });
    v.group.children.forEach(ch => {
      if (ch.material && ch.material.color && ch.geometry && ch.geometry.type === 'BoxGeometry') {
        ch.material = newMat;
      }
    });

    // Siren bar on top
    const sirenGroup = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 1 })
    );
    red.position.x = -0.3;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2266ff, transparent: true, opacity: 0.2 })
    );
    blue.position.x = 0.3;
    sirenGroup.add(red, blue);
    sirenGroup.position.y = v.h * 1.25;
    v.group.add(sirenGroup);
    v.siren = sirenGroup;

    this.vehicles.push(v);
    this.emergency.push(v);

    // Notify gameplay (signals)
    return v;
  }

  // Returns vehicle colliding with player (or null)
  vehicleHitting(pos) {
    for (const v of this.vehicles) {
      const dx = pos.x - v.pos.x;
      const dz = pos.z - v.pos.z;
      // Rotate into vehicle frame
      const cos = v.vz, sin = -v.vx;
      // Actually rotation: vehicle rotated by atan2(vx, vz), so to get local: rotate by -angle
      const ang = Math.atan2(v.vx, v.vz);
      const cs = Math.cos(-ang), sn = Math.sin(-ang);
      const lx = dx * cs - dz * sn;
      const lz = dx * sn + dz * cs;
      if (Math.abs(lx) < v.w/2 + 0.4 && Math.abs(lz) < v.d/2 + 0.4) {
        return v;
      }
    }
    return null;
  }
}
