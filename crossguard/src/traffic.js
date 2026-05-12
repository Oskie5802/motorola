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
    this.emergencyTimer = 8 + Math.random() * 12;

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
    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(t.w, t.h * 0.6, t.d),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = t.h * 0.45;
    body.castShadow = true;
    group.add(body);
    // Cabin top
    if (t.type !== 'tram') {
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.9, t.h * 0.45, t.d * 0.55),
        new THREE.MeshLambertMaterial({ color: 0x1a1f28 })
      );
      cabin.position.set(0, t.h * 0.9, -t.d * 0.05);
      group.add(cabin);
    } else {
      // Tram top with windows
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.95, t.h * 0.4, t.d * 0.95),
        new THREE.MeshLambertMaterial({ color: 0xaa2020 })
      );
      top.position.y = t.h * 0.95;
      group.add(top);
    }
    // Headlights
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6d2 });
    const hL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.08), lightMat);
    hL.position.set(-t.w * 0.3, t.h * 0.4, -t.d / 2);
    group.add(hL);
    const hR = hL.clone();
    hR.position.x = t.w * 0.3;
    group.add(hR);
    // Tail lights
    const tMat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06), tMat);
    tL.position.set(-t.w * 0.3, t.h * 0.4, t.d / 2);
    group.add(tL);
    const tR = tL.clone();
    tR.position.x = t.w * 0.3;
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
    group.rotation.y = Math.atan2(vx, vz);

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
    for (let i = 0; i < n; i++) {
      const p = this.city.randomSidewalkPoint();
      const group = new THREE.Group();
      const shirtColors = [0xd34c4c, 0x4cd366, 0xd3c44c, 0x6f4cd3, 0x4cb5d3, 0xd34cb5];
      const c = shirtColors[Math.floor(Math.random() * shirtColors.length)];
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25),
        new THREE.MeshLambertMaterial({ color: c }));
      torso.position.y = 0.95;
      torso.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xfcd5a0 }));
      head.position.y = 1.55;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.25),
        new THREE.MeshLambertMaterial({ color: 0x2a2f38 }));
      legs.position.y = 0.32;
      group.add(torso, head, legs);
      group.position.set(p.x, 0, p.z);
      this.scene.add(group);

      this.peds.push({
        group,
        pos: { x: p.x, z: p.z },
        target: this.city.randomSidewalkPoint(),
        speed: 1.2 + Math.random() * 0.6,
      });
    }
  }

  update(dt, playerPos, signals) {
    // Vehicles
    for (const v of this.vehicles) {
      this._updateVehicle(v, dt, playerPos, signals);
    }
    // NPC pedestrians: wander between sidewalk points (stay on sidewalk)
    for (const p of this.peds) {
      const dx = p.target.x - p.pos.x;
      const dz = p.target.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8) {
        p.target = this.city.randomSidewalkPoint();
        continue;
      }
      const mvX = (dx / d) * p.speed * dt;
      const mvZ = (dz / d) * p.speed * dt;
      const nx = p.pos.x + mvX, nz = p.pos.z + mvZ;
      // Keep on sidewalks (best effort)
      if (this.city.isOnSidewalk(nx, nz) && !this.city.collidesBuilding(nx, nz, 0.3)) {
        p.pos.x = nx; p.pos.z = nz;
      } else {
        p.target = this.city.randomSidewalkPoint();
      }
      p.group.position.set(p.pos.x, 0, p.pos.z);
      p.group.rotation.y = Math.atan2(dx, dz);
    }

    // Emergency vehicle spawns
    this.emergencyTimer -= dt;
    if (this.emergencyTimer <= 0) {
      this.emergencyTimer = 18 + Math.random() * 30;
      if (Math.random() < this.zone.sirenChance * 6) {
        this._spawnEmergency();
      }
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
    v.group.rotation.y = Math.atan2(v.vx, v.vz);

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
    const body = v.group.children[0];
    body.material = new THREE.MeshLambertMaterial({
      color: Math.random() < 0.5 ? 0xffffff : 0xdd2c2c,
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
