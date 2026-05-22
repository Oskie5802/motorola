// Pogoda, niebo, oswietlenie itp
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { settings } from './settings.js';

export class Environment {
  constructor(scene, zone) {
    this.scene = scene;
    this.zone = zone;
    this.isNight = zone.timeOfDay === 'night';
    this.isMorning = zone.timeOfDay === 'morning';

        // Gradient na niebie, zawsze w klimacie nocnym
    const skyColor = this.isNight ? 0x040810 : (this.isMorning ? 0xffd9a8 : 0x87ceeb);
    const topColor = this.isNight ? '#010308' : (this.isMorning ? '#ff9a5a' : '#3aa3e0');
    const midColor = this.isNight ? '#0a0f22' : (this.isMorning ? '#ffcca0' : '#7ac4e8');
    const botColor = this.isNight ? '#1a1535' : (this.isMorning ? '#ffe9c4' : '#cfe9ff');
    const cnv = document.createElement('canvas');
    cnv.width = 2; cnv.height = 512;
    const ctx = cnv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.3, midColor);
    grad.addColorStop(0.7, botColor);
        // Ciepła łuna od miasta na horyzoncie
    if (this.isNight) {
      grad.addColorStop(0.85, '#1a1028');
      grad.addColorStop(1.0, '#2a1530');
    } else {
      grad.addColorStop(1, botColor);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const skyTex = new THREE.CanvasTexture(cnv);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;

        // Mgła
    if (zone.weather === 'fog') {
      scene.fog = new THREE.FogExp2(this.isNight ? 0x0a0e1a : 0xb8c4d8, this.isNight ? 0.018 : 0.015);
    } else if (zone.weather === 'rain') {
      scene.fog = new THREE.FogExp2(this.isNight ? 0x060a16 : 0x6c7d9e, this.isNight ? 0.012 : 0.008);
    } else {
      scene.fog = new THREE.Fog(skyColor, this.isNight ? 30 : 40, this.isNight ? 160 : 220);
    }

        // Ambient light dla nocy (mocno przyciemniony)
    const ambient = new THREE.HemisphereLight(
      this.isNight ? 0x1a2244 : 0xfff5e8,
      this.isNight ? 0x050810 : 0x556070,
      this.isNight ? 0.15 : 0.7
    );
    scene.add(ambient);

        // Lekkie kolorowe swiatlo symulujace odbicia neonow
    const fill = new THREE.DirectionalLight(
      this.isNight ? 0x3040a0 : 0xb0c6e0,
      this.isNight ? 0.08 : 0.35
    );
    fill.position.set(-40, 50, -30);
    scene.add(fill);

        // Drugie odbicie neonu z innej strony
    if (this.isNight) {
      const fill2 = new THREE.DirectionalLight(0x601830, 0.06);
      fill2.position.set(40, 30, 30);
      scene.add(fill2);
    }

    this.sun = new THREE.DirectionalLight(
      this.isNight ? 0x4060a0 : (this.isMorning ? 0xffd09a : 0xfff8ec),
      this.isNight ? 0.12 : 1.15
    );
    this.sun.position.set(60, 100, 40);
    this.sun.castShadow = settings.current.shadows;
    const shadowMapSize = settings.current.quality === 'high' ? 2048 : (settings.current.quality === 'medium' ? 1024 : 512);
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.5;
    const d = 100;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.far = 300;
    scene.add(this.sun);

        // Deszczyk
    if (zone.weather === 'rain') this._initRain();
    if (zone.weather === 'snow') this._initSnow();

        // Gwiazdki
    if (this.isNight) this._initStars();

    this.applyDynamicSettings();
  }

  applyDynamicSettings() {
    this.sun.castShadow = settings.current.shadows;
    if (this.rain) {
      this.rain.visible = settings.current.particles;
    }
    if (this.snow) {
      this.snow.visible = settings.current.particles;
    }
    if (this.stars) {
      this.stars.visible = settings.current.particles;
    }
  }

  _initRain() {
    const count = settings.current.quality === 'low' ? 200 : (settings.current.quality === 'medium' ? 800 : 1800);
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
      color: 0x6688bb, size: 0.18, transparent: true, opacity: 0.45
    });
    this.rain = new THREE.Points(geom, mat);
    this.scene.add(this.rain);
  }

  _initSnow() {
    const count = settings.current.quality === 'low' ? 100 : (settings.current.quality === 'medium' ? 350 : 700);
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
    const count = settings.current.quality === 'low' ? 100 : (settings.current.quality === 'medium' ? 300 : 600);
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 220;
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI / 2;
      positions[i*3]   = r * Math.sin(theta) * Math.cos(phi);
      positions[i*3+1] = r * Math.cos(theta) + 60;
      positions[i*3+2] = r * Math.sin(theta) * Math.sin(phi);
            // Gwiazdy w roznych odcieniach
      const tint = Math.random();
      if (tint < 0.3) {
        colors[i*3] = 0.7; colors[i*3+1] = 0.8; colors[i*3+2] = 1.0;
      } else if (tint < 0.5) {
        colors[i*3] = 1.0; colors[i*3+1] = 0.95; colors[i*3+2] = 0.7;
      } else {
        colors[i*3] = 1.0; colors[i*3+1] = 1.0; colors[i*3+2] = 1.0;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({
      size: 1.0, transparent: true, opacity: 0.9,
      vertexColors: true, sizeAttenuation: false,
    }));
    this.scene.add(this.stars);

        // Ksiezyc z poświata
    const moonGroup = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(5, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xe8e0d0 })
    );
    moonGroup.add(moon);
        // Miękki glow ksiezyca
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(9, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xccbbaa, transparent: true, opacity: 0.08,
        side: THREE.BackSide,
      })
    );
    moonGroup.add(glow);
    const glow2 = new THREE.Mesh(
      new THREE.SphereGeometry(14, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x8888aa, transparent: true, opacity: 0.03,
        side: THREE.BackSide,
      })
    );
    moonGroup.add(glow2);
    moonGroup.position.set(80, 90, -80);
    this.scene.add(moonGroup);
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
