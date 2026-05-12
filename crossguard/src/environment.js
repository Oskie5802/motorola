// === Sky, lighting, day/night, weather (rain/fog/snow) ===
import * as THREE from 'three';
import { PALETTE } from './config.js';

export class Environment {
  constructor(scene, zone) {
    this.scene = scene;
    this.zone = zone;
    this.isNight = zone.timeOfDay === 'night';
    this.isMorning = zone.timeOfDay === 'morning';

    // Sky color
    const skyColor = this.isNight ? 0x07142e : (this.isMorning ? 0xffd9a8 : 0x87ceeb);
    scene.background = new THREE.Color(skyColor);

    // Fog
    if (zone.weather === 'fog') {
      scene.fog = new THREE.Fog(this.isNight ? 0x1a1f30 : 0xb8c4d8, 8, 70);
    } else if (zone.weather === 'rain') {
      scene.fog = new THREE.Fog(this.isNight ? 0x0a1426 : 0x6c7d9e, 25, 160);
    } else {
      scene.fog = new THREE.Fog(skyColor, 40, 220);
    }

    // Lights
    const ambient = new THREE.HemisphereLight(
      this.isNight ? 0x4a5d8a : 0xfff5e8,
      this.isNight ? 0x0a142e : 0x6d7a8a,
      this.isNight ? 0.35 : 0.85
    );
    scene.add(ambient);

    this.sun = new THREE.DirectionalLight(
      this.isNight ? 0xa8c0ff : (this.isMorning ? 0xffd09a : 0xffffff),
      this.isNight ? 0.25 : 0.95
    );
    this.sun.position.set(60, 100, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 100;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.far = 300;
    scene.add(this.sun);

    // Rain
    if (zone.weather === 'rain') this._initRain();
    if (zone.weather === 'snow') this._initSnow();

    // Stars at night
    if (this.isNight) this._initStars();
  }

  _initRain() {
    const count = 1200;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.rainSpeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 200;
      positions[i*3+1] = Math.random() * 60;
      positions[i*3+2] = (Math.random() - 0.5) * 200;
      this.rainSpeed[i] = 40 + Math.random() * 25;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaaccee, size: 0.18, transparent: true, opacity: 0.6
    });
    this.rain = new THREE.Points(geom, mat);
    this.scene.add(this.rain);
  }

  _initSnow() {
    const count = 700;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.snowSpeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 200;
      positions[i*3+1] = Math.random() * 60;
      positions[i*3+2] = (Math.random() - 0.5) * 200;
      this.snowSpeed[i] = 1.5 + Math.random() * 1.5;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.35, transparent: true, opacity: 0.85
    });
    this.snow = new THREE.Points(geom, mat);
    this.scene.add(this.snow);
  }

  _initStars() {
    const count = 350;
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 220;
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI / 2;
      positions[i*3]   = r * Math.sin(theta) * Math.cos(phi);
      positions[i*3+1] = r * Math.cos(theta) + 60;
      positions[i*3+2] = r * Math.sin(theta) * Math.sin(phi);
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.2, transparent: true, opacity: 0.85
    }));
    this.scene.add(stars);

    // Moon
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff5d2 })
    );
    moon.position.set(80, 90, -80);
    this.scene.add(moon);
  }

  update(dt, playerPos) {
    if (this.rain) {
      const pos = this.rain.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < this.rainSpeed.length; i++) {
        arr[i*3+1] -= this.rainSpeed[i] * dt;
        if (arr[i*3+1] < 0) {
          arr[i*3+1] = 55;
          arr[i*3]   = playerPos.x + (Math.random() - 0.5) * 120;
          arr[i*3+2] = playerPos.z + (Math.random() - 0.5) * 120;
        }
      }
      pos.needsUpdate = true;
    }
    if (this.snow) {
      const pos = this.snow.geometry.attributes.position;
      const arr = pos.array;
      const t = performance.now() * 0.001;
      for (let i = 0; i < this.snowSpeed.length; i++) {
        arr[i*3+1] -= this.snowSpeed[i] * dt;
        arr[i*3]   += Math.sin(t + i) * 0.05;
        if (arr[i*3+1] < 0) {
          arr[i*3+1] = 55;
          arr[i*3]   = playerPos.x + (Math.random() - 0.5) * 120;
          arr[i*3+2] = playerPos.z + (Math.random() - 0.5) * 120;
        }
      }
      pos.needsUpdate = true;
    }
  }
}
