import * as THREE from 'three';
import { PALETTE } from './config.js';
import { settings } from './settings.js';

export class TrafficSystem {
  constructor(scene, city, zone, carModels = null) {
    this.scene = scene;
    this.city = city;
    this.zone = zone;
    this.carModels = carModels; // { filename: { model, size, def } }
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
        // Sciezki
    if (settings.current.quality !== 'low' && this.carModels && Object.keys(this.carModels).length > 0) {
      return this._makeVehicleGLB(forceType);
    }
        // To stary kod z boxami jak sie wywala glb, zostawiamy the failsafe
    return this._makeVehicleBox(forceType);
  }

  _makeVehicleGLB(forceType = null) {
        // Wybierz model na podstawie strefy
    const allDefs = Object.values(this.carModels);
    const carDefs     = allDefs.filter(d => d.def.type === 'car');
    const busDefs     = allDefs.filter(d => d.def.type === 'bus');
    const truckDefs   = allDefs.filter(d => d.def.type === 'truck');
    const emergDefs   = allDefs.filter(d => d.def.type === 'emergency');

        // Losowanko wagowe dla zonow
    let pool;
    if (forceType === 'emergency') {
      pool = emergDefs.length ? emergDefs : carDefs;
    } else if (this.zone.id === 'industrial' && Math.random() < 0.5) {
      pool = truckDefs.length ? truckDefs : carDefs;
    } else if (this.zone.id === 'school' && Math.random() < 0.3) {
      pool = busDefs.length ? busDefs : carDefs;
    } else if (this.zone.id === 'downtown' && Math.random() < 0.15) {
      pool = busDefs.length ? busDefs : carDefs;
    } else {
            // W centrum glownie osobówki
      const r = Math.random();
      if (r < 0.7) pool = carDefs;
      else if (r < 0.85) pool = busDefs.length ? busDefs : carDefs;
      else pool = truckDefs.length ? truckDefs : carDefs;
    }

    if (!pool.length) pool = carDefs.length ? carDefs : allDefs;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const def = chosen.def;

        // Sklonuj autko, owin w grupe by przesunac pivot na srodek
    const inner = chosen.model.clone(true);
    const hasShadows = settings.current.shadows;
    inner.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.castShadow = hasShadows;
        child.receiveShadow = hasShadows;
      }
    });

        // Przeskaluj jak bydle wyszlo z blendera zamale
    const modelSize = chosen.size;
    const scaleX = def.w / modelSize.x;
    const scaleY = def.h / modelSize.y;
    const scaleZ = def.d / modelSize.z;
    const uniformScale = Math.min(scaleX, scaleY, scaleZ);
    inner.scale.setScalar(uniformScale);

        // Oblicz nowe wymiary boxow do hitboxów na wypadek zderzeń
    const actualW = modelSize.x * uniformScale;
    const actualH = modelSize.y * uniformScale;
    const actualD = modelSize.z * uniformScale;

        // GLB ma pivot byle gdzie — recentruj zeby v.pos byl srodkiem auta a kola na y=0
    const bbox = new THREE.Box3().setFromObject(inner);
    const center = bbox.getCenter(new THREE.Vector3());
    inner.position.set(-center.x, -bbox.min.y, -center.z);

    const group = new THREE.Group();
    group.add(inner);

        // Modele GLB maja swoje swiatla, nie dolepiamy kulek

    this.scene.add(group);

        // Losuj gdzie ma jechac i jakim pasem
    const seg = this.city.roadSegments[Math.floor(Math.random() * this.city.roadSegments.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    // Right-hand traffic: when driving +x, stay on -z side; when -x, stay on +z.
    const laneOffset = -1.6 * dir;

    let x, z, vx, vz, axis;
    if (seg.axis === 'h') {
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
        // Kenney ogarnal modele +Z wiec dzialaja bez rotacji pi
    group.rotation.y = Math.atan2(vx, vz);

    return {
      group,
      type: def.type === 'emergency' ? 'car' : def.type,
      w: actualW, h: actualH, d: actualD,
      baseSpeed: this.zone.vehicleSpeed * def.speed * 38,
      speed: this.zone.vehicleSpeed * def.speed * 38,
      speedFactor: def.speed,
      glbModel: true,
      vx, vz, axis, dir,
      pos: { x, z },
      stopped: false,
      runsRed: Math.random() < this.zone.redLightRunChance,
      isEmergency: false,
      siren: null,
    };
  }

  _makeVehicleBox(forceType = null) {
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
      if (Math.random() < 0.5) t = types[4];
    }
    if (this.zone.id === 'downtown' && Math.random() < 0.2) {
      t = types[5];
    }
    if (this.zone.id === 'school' && Math.random() < 0.3) {
      t = types[3];
    }
    if (forceType) t = types.find(x => x.type === forceType) || t;

    const color = t.color ?? PALETTE.vehicle[Math.floor(Math.random() * PALETTE.vehicle.length)];

    const group = new THREE.Group();
    const isLow = settings.current.quality === 'low';
    const hasShadows = settings.current.shadows;

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
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(t.w, t.h * 0.42, t.d, 1, 1, 4),
        bodyMat
      );
      lower.position.y = t.h * 0.34;
      lower.castShadow = hasShadows && !isLow;
      group.add(lower);

      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.95, t.h * 0.22, t.d * 0.32),
        bodyMat
      );
      hood.position.set(0, t.h * 0.6, -t.d * 0.32);
      group.add(hood);
      const trunk = hood.clone();
      trunk.position.z = t.d * 0.32;
      group.add(trunk);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.85, t.h * 0.42, t.d * 0.45),
        cabinMat
      );
      cabin.position.set(0, t.h * 0.78, 0);
      group.add(cabin);

      if (!isLow) {
        const wsGeo = new THREE.PlaneGeometry(t.w * 0.78, t.h * 0.38);
        const ws = new THREE.Mesh(wsGeo, glassMat);
        ws.position.set(0, t.h * 0.78, -t.d * 0.22);
        ws.rotation.x = -0.25;
        group.add(ws);
        const wsBack = ws.clone();
        wsBack.position.z = t.d * 0.22;
        wsBack.rotation.x = 0.25;
        group.add(wsBack);
        const sideGeo = new THREE.PlaneGeometry(t.d * 0.42, t.h * 0.32);
        const sideL = new THREE.Mesh(sideGeo, glassMat);
        sideL.position.set(-t.w * 0.43, t.h * 0.8, 0);
        sideL.rotation.y = -Math.PI / 2;
        group.add(sideL);
        const sideR = sideL.clone();
        sideR.position.x = t.w * 0.43;
        sideR.rotation.y = Math.PI / 2;
        group.add(sideR);

        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(t.w * 0.7, 0.05, t.d * 0.4),
          new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.55 })
        );
        roof.position.set(0, t.h * 1.0, 0);
        group.add(roof);
      }
    } else if (t.type === 'bus' || t.type === 'truck') {
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(t.w, t.h * 0.6, t.d),
        bodyMat
      );
      lower.position.y = t.h * 0.45;
      lower.castShadow = hasShadows && !isLow;
      group.add(lower);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.95, t.h * 0.4, t.d * 0.55),
        new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.4 })
      );
      cabin.position.set(0, t.h * 0.95, t.type === 'truck' ? -t.d * 0.18 : -t.d * 0.05);
      group.add(cabin);
      if (!isLow) {
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
        const fws = new THREE.Mesh(
          new THREE.PlaneGeometry(t.w * 0.85, t.h * 0.35),
          glassMat
        );
        fws.position.set(0, t.h * 0.95, -t.d * 0.5);
        group.add(fws);
      }
    } else if (t.type === 'tram') {
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(t.w, t.h * 0.5, t.d),
        bodyMat
      );
      lower.position.y = t.h * 0.4;
      lower.castShadow = hasShadows && !isLow;
      group.add(lower);
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.95, t.h * 0.45, t.d * 0.95),
        new THREE.MeshStandardMaterial({ color: 0xaa2020, roughness: 0.4 })
      );
      top.position.y = t.h * 0.88;
      group.add(top);
      if (!isLow) {
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
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.8),
          new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 })
        );
        pole.position.y = t.h * 1.2;
        group.add(pole);
      }
    }

    if (t.type !== 'tram') {
      const wheelR = Math.min(0.36, t.h * 0.3);
      const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.22, isLow ? 6 : 14);
      const rimGeo = isLow ? null : new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.24, 10);
      const axles = (t.type === 'car') ? [-t.d * 0.32, t.d * 0.32] : [-t.d * 0.36, t.d * 0.36];
      for (const az of axles) {
        for (const ax of [-t.w * 0.5, t.w * 0.5]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(ax, wheelR, az);
          w.castShadow = hasShadows && !isLow;
          group.add(w);
          if (!isLow && rimGeo) {
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            rim.position.set(ax * 1.01, wheelR, az);
            group.add(rim);
          }
        }
      }
    } else {
      for (const az of [-t.d * 0.35, t.d * 0.35]) {
        const w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, t.w * 1.05, isLow ? 6 : 12),
          wheelMat
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(0, 0.28, az);
        group.add(w);
      }
    }

    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff6d2, emissive: 0xfff2c8, emissiveIntensity: 1.4
    });
    const hL = new THREE.Mesh(new THREE.SphereGeometry(0.13, isLow ? 4 : 10, isLow ? 4 : 8), lightMat);
    hL.scale.set(1.2, 0.7, 0.5);
    hL.position.set(-t.w * 0.32, t.h * 0.45, -t.d / 2 - 0.02);
    group.add(hL);
    const hR = hL.clone();
    hR.position.x = t.w * 0.32;
    group.add(hR);
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

    const seg = this.city.roadSegments[Math.floor(Math.random() * this.city.roadSegments.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    // Right-hand traffic: when driving +x, stay on -z side; when -x, stay on +z.
    const laneOffset = -1.6 * dir;

    let x, z, vx, vz, axis;
    if (seg.axis === 'h') {
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
      baseSpeed: this.zone.vehicleSpeed * t.speed * 38,
      speed: this.zone.vehicleSpeed * t.speed * 38,
      speedFactor: t.speed,
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

    const isLow = settings.current.quality === 'low';
    const hasShadows = settings.current.shadows;

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

            // cialko bota
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28, 1, 2, 1), shirtMat);
      torso.position.y = 1.0;
      torso.castShadow = hasShadows && !isLow;
      group.add(torso);
            // kark
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, isLow ? 4 : 10), skinMat);
      neck.position.y = 1.42;
      group.add(neck);
            // dynia
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, isLow ? 6 : 14, isLow ? 6 : 12), skinMat);
      head.position.y = 1.6;
      head.scale.set(1, 1.08, 0.95);
      head.castShadow = hasShadows && !isLow;
      group.add(head);
            // fryz
      if (Math.random() > 0.15) {
        const hair = new THREE.Mesh(
          new THREE.SphereGeometry(0.21, isLow ? 6 : 14, isLow ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2.1),
          hairMat
        );
        hair.position.y = 1.64;
        group.add(hair);
      }
            // rączki
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.6, isLow ? 4 : 10), shirtMat);
      armL.position.set(-0.32, 1.05, 0);
      armL.castShadow = hasShadows && !isLow;
      group.add(armL);
      const armR = armL.clone(); armR.position.x = 0.32;
      group.add(armR);
            // łapy
      const handL = new THREE.Mesh(new THREE.SphereGeometry(0.08, isLow ? 4 : 8, isLow ? 4 : 6), skinMat);
      handL.position.set(-0.32, 0.74, 0);
      group.add(handL);
      const handR = handL.clone(); handR.position.x = 0.32;
      group.add(handR);
            // giry
      const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.65, isLow ? 4 : 10), pantsMat);
      legL.position.set(-0.12, 0.34, 0);
      legL.castShadow = hasShadows && !isLow;
      group.add(legL);
      const legR = legL.clone(); legR.position.x = 0.12;
      group.add(legR);
            // trzewiki
      const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), shoesMat);
      shoeL.position.set(-0.12, 0.05, 0.04);
      group.add(shoeL);
      const shoeR = shoeL.clone(); shoeR.position.x = 0.12;
      group.add(shoeR);

            // cien cieniutki
      if (hasShadows && !isLow) {
        const sh = new THREE.Mesh(
          new THREE.CircleGeometry(0.38, 10),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
        );
        sh.rotation.x = -Math.PI / 2;
        sh.position.y = 0.02;
        group.add(sh);
      }

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

    // Trasa na caly etat: zrob pętlę wokół skrzyżowania.
    // przejdz wszystkie 4 boki po pasach zgodnie z swiatłami
    // Trasa leci jak wskazówki zegara
    // w nieskonczonosc bo zycie npece jest nudne
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

            // Punkty do łażenia
      const pts = [
        { x: ix + RE + ST, z: iz + CO },   // east of south arm
        { x: ix - CO,      z: iz + RE + ST }, // south of west arm
        { x: ix - RE - ST, z: iz - CO },   // west of north arm
        { x: ix + CO,      z: iz - RE - ST }, // north of east arm
      ];
      if (pts.some(p => this.city.collidesBuilding(p.x, p.z, 0.3))) continue;

            // Losowy start bo inaczej tloczyliby sie na jednym pasie
      const startArm = Math.floor(Math.random() * 4);
      const full = [
                // Dolny bok: idzie w lewo
        { x: ix + RE + ST, z: iz + CO,  type: 'walk' },
        { x: ix + RE,      z: iz + CO,  type: 'wait', light: S.light },
        { x: ix - RE,      z: iz + CO,  type: 'walk' },
        { x: ix - RE,      z: iz + RE,  type: 'walk' }, // SW corner
                // Lewy: w gore
        { x: ix - CO,      z: iz + RE + ST, type: 'walk' },
        { x: ix - CO,      z: iz + RE,  type: 'wait', light: W.light },
        { x: ix - CO,      z: iz - RE,  type: 'walk' },
        { x: ix - RE,      z: iz - RE,  type: 'walk' }, // NW corner
                // Gorny: w prawo
        { x: ix - RE - ST, z: iz - CO,  type: 'walk' },
        { x: ix - RE,      z: iz - CO,  type: 'wait', light: N.light },
        { x: ix + RE,      z: iz - CO,  type: 'walk' },
        { x: ix + RE,      z: iz - RE,  type: 'walk' }, // NE corner
                // Prawy: w dol
        { x: ix + CO,      z: iz - RE - ST, type: 'walk' },
        { x: ix + CO,      z: iz - RE,  type: 'wait', light: E.light },
        { x: ix + CO,      z: iz + RE,  type: 'walk' },
        { x: ix + RE,      z: iz + RE,  type: 'walk' }, // SE corner
      ];

            // Rozrzuc ich po skrzyzowaniu
      const offset = startArm * 4;
      return [...full.slice(offset), ...full.slice(0, offset)];
    }
    return null;
  }

  update(dt, playerPos, signals) {
        // Aktualizacja bryk
    for (const v of this.vehicles) {
      this._updateVehicle(v, dt, playerPos, signals);
    }
        // Ludziki: spacer -> stoimy przed przejsciem -> zielone to idziemy -> znowu spacer
    for (const p of this.peds) {
      if (!p.route || p.route.length === 0) continue;
      const wp = p.route[p.wpIdx];
      const dx = wp.x - p.pos.x;
      const dz = wp.z - p.pos.z;
      const d  = Math.hypot(dx, dz);

      if (wp.type === 'wait') {
        if (d > 0.4) {
                    // Jeszcze nie doszedl do krawedzi drogi
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
        // Na przejsciu -> samochody maja czerwone to znaczy my smigamy
                // ale jak mruga zielone to odpuszczamy, glupio zginąć
        let canCross = false;
        if (wp.light) {
          canCross = wp.light.state === 'red' && !wp.light._pedFlashing;
        } else {
          // Brak sygnalizacji: pieszy AI przechodzi, jeśli w pobliżu nie ma zbliżających się pojazdów
          let carNear = false;
          for (const v of this.vehicles) {
            const d = Math.hypot(v.pos.x - wp.x, v.pos.z - wp.z);
            if (d < 12.0) {
              const dx = wp.x - v.pos.x;
              const dz = wp.z - v.pos.z;
              const heading = v.vx * dx + v.vz * dz;
              if (heading > 0) {
                carNear = true;
                break;
              }
            }
          }
          canCross = !carNear;
        }
        if (!canCross) {
                    // Stoi znudzony i czeka na światło
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

            // tryb spacerku
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
        // Pogoda potrafi nieźle popsuc przyczepnosc
    const weatherMul = this.zone.weather === 'rain' ? 0.85 : this.zone.weather === 'fog' ? 0.8 : 1.0;
    const maxSpeed = v.baseSpeed * weatherMul * (v.isEmergency ? 1.4 : 1);

        // distToStop = ile metrow centrum wozu moze jeszcze przejechac
        // zanim musi sie zatrzymac. Inf jezeli nic nas nie blokuje.
        // Pas (lane) jest przesuniety o ~1.6 od osi drogi — perp tolerancja ~3.
    let distToStop = Infinity;
    const STOP_AHEAD = 7.5 + v.d / 2;  // srodek wozu zatrzymuje sie tutaj (bumper tuz przed zebra)

        // 1) Czerwone/zolte swiatlo na najblizszym skrzyzowaniu na naszym pasie
    if (!v.runsRed && !v.isEmergency) {
      for (const tl of this.city.trafficLights) {
        const controls = (v.axis === 'h' && tl.axis === 'ew') || (v.axis === 'v' && tl.axis === 'ns');
        if (!controls) continue;

        // Sprawdzenie, czy sygnalizator kontroluje nasz kierunek wjazdu na skrzyżowanie.
        // Odrzucamy te sygnalizatory, które są po drugiej stronie (zjazdowe) przy użyciu iloczynu skalarnego.
        if (tl.pos && tl.intersection) {
          const approachDir = v.vx * (tl.pos.x - tl.intersection.x) + v.vz * (tl.pos.z - tl.intersection.z);
          if (approachDir >= 0) continue;
        }

        if (tl.state !== 'red' && tl.state !== 'amber') continue;
        if (!tl.intersection) continue;
        const idx = tl.intersection.x - v.pos.x;
        const idz = tl.intersection.z - v.pos.z;
        const along = v.vx * idx + v.vz * idz;
        const perp  = Math.abs(v.vx * idz - v.vz * idx);
        if (perp >= 3) continue;
                // Jezeli juz wjechalismy na pasy/skrzyzowanie (along < STOP_AHEAD)
                // — przejedzmy, nie blokuj sie w srodku skrzyzowania.
        const d = along - STOP_AHEAD;
        if (d > -0.3 && d < distToStop) distToStop = d;
      }

      // Ustępowanie pierwszeństwa na skrzyżowaniach bez sygnalizacji świetlnej
      if (v.axis === 'v') { // Oś pionowa ustępuje pierwszeństwa
        let yieldInter = null;
        let yieldDist = Infinity;
        for (const inter of this.city.intersections) {
          if (inter.signalized) continue;
          const idx = inter.x - v.pos.x;
          const idz = inter.z - v.pos.z;
          const along = v.vx * idx + v.vz * idz;
          const perp  = Math.abs(v.vx * idz - v.vz * idx);
          if (perp < 3 && along > 0 && along < 30 && along < yieldDist) {
            yieldInter = inter;
            yieldDist = along;
          }
        }
        if (yieldInter && yieldDist > 7.5 + v.d / 2 && yieldDist < 22) {
          let priorityCarApproaching = false;
          for (const other of this.vehicles) {
            if (other === v) continue;
            if (other.axis !== 'h') continue; // tylko auta na drodze z pierwszeństwem
            const odx = yieldInter.x - other.pos.x;
            const odz = yieldInter.z - other.pos.z;
            const oalong = other.vx * odx + other.vz * odz;
            const operp = Math.abs(other.vx * odz - other.vz * odx);
            if (operp < 3 && oalong > -4 && oalong < 25) {
              priorityCarApproaching = true;
              break;
            }
          }
          if (priorityCarApproaching) {
            const d = yieldDist - STOP_AHEAD;
            if (d > -0.3 && d < distToStop) distToStop = d;
          }
        }
      }
    }

        // 2) Pieszy na zebrze przed nami — ale TYLKO jezeli jeszcze nie wjechalismy
        // na skrzyzowanie. Jak juz jestesmy w srodku, lepiej przejechac niz stanac na pasach.
    const pdx = playerPos.x - v.pos.x;
    const pdz = playerPos.z - v.pos.z;
    const palong = v.vx * pdx + v.vz * pdz;
    const pperp  = Math.abs(v.vx * pdz - v.vz * pdx);
    const playerOnCrossing = this.city.isOnCrossing(playerPos.x, playerPos.z);
    if (playerOnCrossing && palong > 0 && pperp < 4) {
      let bestAlong = Infinity;
      for (const inter of this.city.intersections) {
        const idx = inter.x - v.pos.x;
        const idz = inter.z - v.pos.z;
        const ialong = v.vx * idx + v.vz * idz;
        const iperp  = Math.abs(v.vx * idz - v.vz * idx);
        if (iperp >= 3 || ialong <= 0) continue;
        const pdInter = Math.hypot(playerPos.x - inter.x, playerPos.z - inter.z);
        if (pdInter < 10 && ialong < bestAlong) bestAlong = ialong;
      }
      if (bestAlong !== Infinity) {
        const d = bestAlong - STOP_AHEAD;
                // d > 0 znaczy ze linia stopu wciaz przed nami — hamujemy
                // d < 0 znaczy ze juz wjechalismy — odpuszczamy, przejedzmy szybko
        if (d > 0 && d < distToStop) distToStop = d;
      }
    }
        // Awaryjne hamowanie: pieszy DOSLOWNIE przed maska, w naszym pasie.
        // Wask, zeby nie hamowac przy pieszym ktory tylko mija pas obok.
    if (palong > 0 && palong < v.d / 2 + 2.5 && pperp < 0.9) {
      const d = palong - v.d / 2 - 0.6;
      if (d < distToStop) distToStop = d;
    }

        // 3) Wóz z przodu na tym samym pasie — trzymaj odstęp
    for (const other of this.vehicles) {
      if (other === v) continue;
      if (other.axis !== v.axis) continue;
      if (other.vx !== v.vx || other.vz !== v.vz) continue;
      const odx = other.pos.x - v.pos.x;
      const odz = other.pos.z - v.pos.z;
      const oa = v.vx * odx + v.vz * odz;
      const op = Math.abs(v.vx * odz - v.vz * odx);
      if (op >= 2.2 || oa <= 0) continue;
      const gap = 1.5;
      const d = oa - other.d / 2 - v.d / 2 - gap;
      if (d < distToStop) distToStop = d;
    }

        // Plynne hamowanie: v = sqrt(2*a*d) — odpalamy hamulec proporcjonalnie do dystansu
    let target;
    if (distToStop === Infinity) {
      target = maxSpeed;
    } else if (distToStop <= 0.05) {
      target = 0;
    } else {
      const brakeA = 8.0;
      target = Math.min(maxSpeed, Math.sqrt(2 * brakeA * distToStop));
    }

    if (target > v.speed) {
      // Płynne przyspieszanie liniowe z uwzględnieniem typu pojazdu i pogody
      const baseAccel = 3.8;
      const accelRate = baseAccel * (v.speedFactor || 1.0) * weatherMul;
      v.speed = Math.min(target, v.speed + accelRate * dt);
    } else if (target < v.speed) {
      // Dynamiczne hamowanie liniowe z lepszym czasem reakcji dla uprzywilejowanych
      const baseDecel = 12.0;
      const decelRate = baseDecel * (v.isEmergency ? 1.3 : 1.0) * weatherMul;
      v.speed = Math.max(target, v.speed - decelRate * dt);
    }
    if (v.speed < 0) v.speed = 0;
    if (target === 0 && v.speed < 0.05) v.speed = 0;

    v.pos.x += v.vx * v.speed * dt;
    v.pos.z += v.vz * v.speed * dt;

        // Jak spadnie za mape
    const b = this.city.bounds;
    if (v.pos.x < b.min - 10 || v.pos.x > b.max + 10 ||
        v.pos.z < b.min - 10 || v.pos.z > b.max + 10) {
            // Zrespiamy go znienacka z drugiej strony na jakims kawalku
      const fresh = this._makeVehicle();
      v.pos = fresh.pos; v.vx = fresh.vx; v.vz = fresh.vz;
      v.axis = fresh.axis; v.dir = fresh.dir;
      v.glbModel = fresh.glbModel;
      v.group.position.set(v.pos.x, 0, v.pos.z);
      v.group.rotation.y = Math.atan2(v.vx, v.vz) + (v.glbModel ? 0 : Math.PI);
            // Wyrzuc ten prowizoryczny visual do smieci
      this.scene.remove(fresh.group);
    }

    v.group.position.set(v.pos.x, 0, v.pos.z);
        // Kenney ogarnął od zlej strony niz my boxy
    v.group.rotation.y = Math.atan2(v.vx, v.vz) + (v.glbModel ? 0 : Math.PI);

        // Swiatelka w radiolach
    if (v.isEmergency && v.siren) {
      v.siren.userData.t = (v.siren.userData.t || 0) + dt * 8;
      const t = Math.sin(v.siren.userData.t);
      v.siren.children[0].material.opacity = t > 0 ? 1 : 0.1;
      v.siren.children[1].material.opacity = t < 0 ? 1 : 0.1;
    }
  }

  _spawnEmergency() {
        // Preferuj ladny model erki jezeli jest
    const v = this._makeVehicle('emergency');
    v.isEmergency = true;
    v.runsRed = true;

        // A jak goly box to po prostu pokoloruj
    if (!this.carModels || Object.keys(this.carModels).length === 0) {
      const newCol = Math.random() < 0.5 ? 0xffffff : 0xdd2c2c;
      const newMat = new THREE.MeshStandardMaterial({ color: newCol, roughness: 0.3, metalness: 0.6 });
      v.group.children.forEach(ch => {
        if (ch.material && ch.material.color && ch.geometry && ch.geometry.type === 'BoxGeometry') {
          ch.material = newMat;
        }
      });
    }

        // Kogut
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

        // Strzel eventem pod system gry
    return v;
  }

    // Funkcja sprawdza czy gracz zrobil plask
  vehicleHitting(pos) {
    for (const v of this.vehicles) {
      const dx = pos.x - v.pos.x;
      const dz = pos.z - v.pos.z;
            // Odwracamy punkt odniesienia do ramy samochodu
      const cos = v.vz, sin = -v.vx;
            // Troche matmy, odwracamy lokalnie przez kat ujemny
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
