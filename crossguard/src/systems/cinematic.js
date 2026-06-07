// Tryb pokazowy: nagrywamy filmik promocyjny
// Odpalanie: ?cinema w URL, F9 albo klik z menu.
//
// Pokazujemy tylko centrum - najbardziej filmowy klimat: deszcz, neony,
// tramwaje itp. Chodzi o pokazanie ficzersów: kamery Avigilon, pasy,
// karetki i postać gracza. Między ujęciami dajemy chamski fade-to-black
// dla kinowego efektu. Na koniec mozaika z innymi strefami.

import * as THREE from 'three';
import { interpolateAngle } from '../core/mathUtils.js';

// Utilities
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smoothstep = (t) => t * t * (3 - 2 * t);

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Prowadzi gracza do celu bez dotykania klawiatury
function steerPlayer(player, city, dt, target, runSpeed = false) {
  if (!player || !target) return true;
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.2) {
    if (player.mixer) {
      player._blendFraction = THREE.MathUtils.lerp(player._blendFraction, 0, Math.min(1, dt * 6));
      player._setLocomotionBlend(player._blendFraction);
      player.mixer.update(dt);
    }
    return true;
  }
  const speed = (runSpeed ? player.runSpeed : player.walkSpeed) * 0.78;
  const nx = player.pos.x + (dx / d) * speed * dt;
  const nz = player.pos.z + (dz / d) * speed * dt;
  if (!city.collidesBuilding(nx, player.pos.z)) player.pos.x = nx;
  if (!city.collidesBuilding(player.pos.x, nz)) player.pos.z = nz;
  const targetFacing = Math.atan2(dx, dz);
  player.facing = interpolateAngle(player.facing, targetFacing, Math.min(1, dt * 10));
  if (player.mixer) {
    const tgt = runSpeed ? 1.0 : 0.5;
    player._blendFraction = THREE.MathUtils.lerp(player._blendFraction, tgt, Math.min(1, dt * 6));
    player._setLocomotionBlend(player._blendFraction);
    player.mixer.update(dt);
  }
  player.group.position.x = player.pos.x;
  player.group.position.z = player.pos.z;
  player.group.rotation.y = player.facing;
  return false;
}

// Generatory ujęć (shot factories)

function shotIntroSweep(ctx) {
  const center = ctx.center;
  const radius = ctx.cityRadius;
  return {
    duration: 7,
    label: null, // title card covers it
    fadeIn: 1.2,
    fadeOut: 0.5,
    update(dt, t) {
      const e = easeInOut(t);
      const a = -Math.PI / 4 + e * 0.55;
      const r = lerp(radius * 1.45, radius * 1.0, e);
      const h = lerp(radius * 1.3, radius * 0.55, e);
      ctx.camera.position.set(
        center.x + Math.cos(a) * r,
        h,
        center.z + Math.sin(a) * r,
      );
      ctx.camera.lookAt(center.x, lerp(0, 3, e), center.z);
    },
  };
}

function shotAerialOrbit(ctx) {
  const center = ctx.center;
  const radius = ctx.cityRadius * 0.85;
  const height = ctx.cityRadius * 0.75;
  const startAngle = Math.random() * Math.PI * 2;
  return {
    duration: 8,
    label: 'SAFECITY · INTELIGENTNE MIASTO',
    fadeIn: 0.6, fadeOut: 0.6,
    update(dt, t) {
      const a = startAngle + t * 0.5;
      const x = center.x + Math.cos(a) * radius;
      const z = center.z + Math.sin(a) * radius;
      const y = lerp(height * 1.05, height * 0.85, easeInOut(t));
      ctx.camera.position.set(x, y, z);
      ctx.camera.lookAt(center.x, 0, center.z);
    },
  };
}

function shotCameraReveal(ctx) {
    // Zbliżenie na kamerę Avigilon na skrzyżowaniu
  const cam = pick(ctx.city.cameras);
  if (!cam) return shotAerialOrbit(ctx);
  const baseAngle = Math.random() * Math.PI * 2;
  return {
    duration: 7,
    label: 'AVIGILON · KAMERA MONITORUJĄCA',
    fadeIn: 0.6, fadeOut: 0.6,
    update(dt, t) {
      const e = easeInOut(t);
      const a = baseAngle + e * 0.9;
      const dist = lerp(11, 5, e);
      const height = lerp(8, 5.5, e);
      ctx.camera.position.set(
        cam.x + Math.cos(a) * dist,
        height,
        cam.z + Math.sin(a) * dist,
      );
      ctx.camera.lookAt(cam.x, 5.4, cam.z);
    },
  };
}

function shotIntersectionLife(ctx) {
    // Ujęcie z dźwigu na zatłoczone skrzyżowanie
  const inter = pick(ctx.city.intersections) || { x: 0, z: 0 };
  const angle = Math.random() * Math.PI * 2;
  return {
    duration: 7,
    label: 'SKRZYŻOWANIE · RUCH MIEJSKI',
    fadeIn: 0.6, fadeOut: 0.6,
    update(dt, t) {
      const e = easeInOut(t);
      const off = lerp(32, 15, e);
      const x = inter.x + Math.cos(angle) * off;
      const z = inter.z + Math.sin(angle) * off;
      const y = lerp(24, 8, e);
      ctx.camera.position.set(x, y, z);
      ctx.camera.lookAt(inter.x, 1.5, inter.z);
    },
  };
}

// Pomocnik: buduje trasę chodnik->zebra->chodnik dla gracza
function buildCrossingWalk(cr) {
    // przejścia 'h' leżą na drodze NS, więc piesi idą wzdłuż X
    // przejścia 'v' leżą na drodze EW, więc piesi idą wzdłuż Z
    // Połowa drogi to ~4, chodnik jest dalej - zaczynamy od ~9 i
    // kończymy na ~9 po drugiej stronie, żeby gracz szedł idealnie
    // przez środek pasów (bez chodzenia na skróty)
  const sideOuter = 9;
  const sideZebra = 4;
  if (cr.axis === 'h') {
    return {
      start: { x: cr.x - sideOuter, z: cr.z },
      waypoints: [
        { x: cr.x - sideZebra, z: cr.z }, // step onto zebra
        { x: cr.x + sideZebra, z: cr.z }, // step off zebra
        { x: cr.x + sideOuter, z: cr.z }, // continue along sidewalk
      ],
    };
  } else {
    return {
      start: { x: cr.x, z: cr.z - sideOuter },
      waypoints: [
        { x: cr.x, z: cr.z - sideZebra },
        { x: cr.x, z: cr.z + sideZebra },
        { x: cr.x, z: cr.z + sideOuter },
      ],
    };
  }
}

function shotCrossingHero(ctx) {
    // Gracz idzie chodnikiem -> przez pasy -> dalej po drugiej stronie
  const cr = pick(ctx.city.crossings);
  if (!cr || !ctx.player) return shotAerialOrbit(ctx);
  const path = buildCrossingWalk(cr);
  ctx.player.pos.set(path.start.x, 0, path.start.z);
  ctx.player.group.position.set(path.start.x, 0, path.start.z);
    // Obracamy go na start żeby nie było widać jak się obraca w pierwszej klatce
  const firstWp = path.waypoints[0];
  ctx.player.facing = Math.atan2(firstWp.x - path.start.x, firstWp.z - path.start.z);
  ctx.player.group.rotation.y = ctx.player.facing;
  ctx.waypoints = path.waypoints.slice();
  ctx.target = ctx.waypoints.shift();

  const camSide = Math.random() < 0.5 ? 1 : -1;
  return {
    duration: 9,
    label: 'PRZEJŚCIE DLA PIESZYCH · ALEX NAWIGANT',
    fadeIn: 0.6, fadeOut: 0.6,
    update(dt, t) {
      const e = easeInOut(t);
            // Kamera prostopadle żeby gracz fajnie wchodził w kadr
            // i lekki zoom in dla dramatyzmu
      const dist = lerp(10, 5, e);
      const cx = cr.axis === 'v' ? cr.x : cr.x + dist * camSide;
      const cz = cr.axis === 'h' ? cr.z : cr.z + dist * camSide;
      const cy = lerp(2.4, 1.55, e);
      ctx.camera.position.set(cx, cy, cz);
      ctx.camera.lookAt(ctx.player.pos.x, 1.2, ctx.player.pos.z);
    },
  };
}

function shotHeroOrbit(ctx) {
    // Spacer chodnikiem: ładujemy dwa najbliższe rogi chodnika
    // żeby gracz ładnie szedł w trakcie ujęcia z orbity
  if (ctx.player && ctx.city.spawnPoints && ctx.city.spawnPoints.length) {
    const px = ctx.player.pos.x, pz = ctx.player.pos.z;
    const sorted = ctx.city.spawnPoints
      .map(p => ({ p, d: Math.hypot(p.x - px, p.z - pz) }))
      .filter(o => o.d > 3)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map(o => o.p);
    ctx.waypoints = sorted;
    ctx.target = ctx.waypoints.shift() || null;
  }
  const startAngle = Math.random() * Math.PI * 2;
  return {
    duration: 8,
    label: 'CERTIFIED SAFE CITIZEN',
    fadeIn: 0.6, fadeOut: 1.0,
    update(dt, t) {
      if (!ctx.player) return;
      const a = startAngle + t * 1.05;
      const r = lerp(7.5, 5.2, easeOut(t));
      const h = lerp(2.7, 1.7, easeOut(t));
      ctx.camera.position.set(
        ctx.player.pos.x + Math.cos(a) * r,
        h,
        ctx.player.pos.z + Math.sin(a) * r,
      );
      ctx.camera.lookAt(ctx.player.pos.x, 1.3, ctx.player.pos.z);
    },
  };
}

// Reżyser ujęć
export class CinematicDirector {
  constructor({ camera, scene, city, traffic, player, zone, ui }) {
    this.camera = camera;
    this.scene = scene;
    this.city = city;
    this.traffic = traffic;
    this.player = player;
    this.zone = zone;
    this.ui = ui;

    this.ctx = {
      camera, scene, city, traffic, player,
      center: { x: 0, z: 0 },
      cityRadius: city.size / 2,
      target: null,
      waypoints: [], // queue of {x,z} for the player to follow in order
    };

        // Z góry ustalona sekwencja żeby pokazać bajery Motoroli
    this.shots = [
      shotIntroSweep(this.ctx),
      shotAerialOrbit(this.ctx),
      shotIntersectionLife(this.ctx),
      shotCameraReveal(this.ctx),
      shotCrossingHero(this.ctx),
      shotHeroOrbit(this.ctx),
    ];
    this.shotIdx = 0;
    this.shotTime = 0;
    this.totalTime = 0;
    this.onZoneDone = null;
    this._labelShown = false;

    this._showTitle();
    this._fadeOpacity = 1; // start from black, intro will fade in
  }

  _showTitle() {
    if (!this.ui) return;
    this.ui.title.textContent = this.zone.name;
    this.ui.subtitle.textContent = this.zone.desc;
    this.ui.titleCard.classList.remove('cn-hidden', 'cn-fadeout');
    void this.ui.titleCard.offsetWidth;
    this.ui.titleCard.classList.add('cn-fadein');
    setTimeout(() => {
      this.ui.titleCard.classList.remove('cn-fadein');
      this.ui.titleCard.classList.add('cn-fadeout');
    }, 3400);
    setTimeout(() => {
      this.ui.titleCard.classList.add('cn-hidden');
      this.ui.titleCard.classList.remove('cn-fadeout');
    }, 4500);
  }

  _showShotLabel() {
    if (!this.ui) return;
    const sh = this.shots[this.shotIdx];
    if (!sh || !sh.label) {
      this.ui.label.classList.add('cn-hidden');
      return;
    }
    this.ui.label.textContent = sh.label;
    this.ui.label.classList.remove('cn-hidden', 'cn-fadein');
    void this.ui.label.offsetWidth;
    this.ui.label.classList.add('cn-fadein');
  }

  _setFade(opacity) {
    if (!this.ui || !this.ui.fade) return;
    this.ui.fade.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  }

  next() {
    this.shotIdx++;
    this.shotTime = 0;
    this._labelShown = false;
    if (this.shotIdx >= this.shots.length) {
      if (this.onZoneDone) this.onZoneDone();
      return;
    }
  }

  update(dt) {
    this.shotTime += dt;
    this.totalTime += dt;
    const sh = this.shots[this.shotIdx];
    if (!sh) return;
    const t = Math.min(1, this.shotTime / sh.duration);
    sh.update(dt, t, this.ctx);

        // Przejścia ekranu z/do czarnego
    const fadeIn = sh.fadeIn || 0.4;
    const fadeOut = sh.fadeOut || 0.4;
    let alpha = 0;
    if (this.shotTime < fadeIn) {
      alpha = 1 - smoothstep(this.shotTime / fadeIn);
    } else if (this.shotTime > sh.duration - fadeOut) {
      alpha = smoothstep((this.shotTime - (sh.duration - fadeOut)) / fadeOut);
    }
    this._setFade(alpha);

        // Wyświetl tytuł ujęcia jak ekran się rozjaśni
    if (!this._labelShown && this.shotTime > fadeIn + 0.1) {
      this._labelShown = true;
      this._showShotLabel();
    }

        // Kierujemy gracza do celu, jak dojdzie to wywalamy punkt z kolejki
        // Jak kolejka pusta to gracz stoi (żadnego łażenia losowo)
    if (this.ctx.target && this.player) {
      const reached = steerPlayer(this.player, this.city, dt, this.ctx.target);
      if (reached) {
        this.ctx.target = (this.ctx.waypoints && this.ctx.waypoints.length)
          ? this.ctx.waypoints.shift()
          : null;
      }
    } else if (this.player && this.player.mixer) {
      this.player._blendFraction = THREE.MathUtils.lerp(this.player._blendFraction, 0, Math.min(1, dt * 6));
      this.player._setLocomotionBlend(this.player._blendFraction);
      this.player.mixer.update(dt);
    }

    if (this.shotTime >= sh.duration) this.next();
  }
}

// Interfejs (overlay)
export function buildCinematicOverlay() {
  let root = document.getElementById('cinema');
  if (root) return _refs(root);

  root = document.createElement('div');
  root.id = 'cinema';
  root.innerHTML = `
    <div class="cn-bar cn-top"></div>
    <div class="cn-bar cn-bottom"></div>
    <div class="cn-vignette"></div>

    <div class="cn-brand">
      <span class="cn-live"></span>MOTOROLA SOLUTIONS · SAFECITY COMMAND CENTER
    </div>

    <div class="cn-titlecard cn-hidden">
      <div class="cn-eyebrow">CROSSGUARD · TRYB POKAZOWY</div>
      <div class="cn-title">CENTRUM MIASTA</div>
      <div class="cn-subtitle">Intensywny ruch, tramwaje</div>
      <div class="cn-rule"></div>
    </div>

    <div class="cn-label cn-hidden">SAFECITY</div>

    <div class="cn-fade"></div>

    <div class="cn-finale cn-hidden">
      <div class="cn-finale-header">
        <div class="cn-finale-eyebrow">DO ODBLOKOWANIA · WIĘCEJ STREF</div>
        <div class="cn-finale-title">SAFECITY ROZSZERZA SIĘ</div>
      </div>
      <div class="cn-finale-grid"></div>
      <div class="cn-finale-footer">
        <div class="cn-finale-cta">CROSSGUARD · ZESPÓŁ UNDEFINED</div>
        <div class="cn-finale-sub">MOTOROLA SOLUTIONS SCIENCE CUP 2026</div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return _refs(root);
}

function _refs(root) {
  return {
    root,
    titleCard: root.querySelector('.cn-titlecard'),
    title: root.querySelector('.cn-title'),
    subtitle: root.querySelector('.cn-subtitle'),
    label: root.querySelector('.cn-label'),
    fade: root.querySelector('.cn-fade'),
    finale: root.querySelector('.cn-finale'),
    finaleGrid: root.querySelector('.cn-finale-grid'),
  };
}

// Finał: kafelki ze strefami przecięte po skosie
export function showFinaleMosaic(ui, zones, featuredZoneId) {
  if (!ui) return;
  const others = zones.filter(z => z.id !== featuredZoneId);

    // Kolory i ikonki dla stref
  const themes = {
    residential: { color: '#5fc56e', icon: '🏘️' },
    school:      { color: '#ffb800', icon: '🚸' },
    downtown:    { color: '#00A3E0', icon: '🌆' },
    industrial:  { color: '#ff7a45', icon: '🏗️' },
    highway:     { color: '#e63946', icon: '🛣️' },
  };

  ui.finaleGrid.innerHTML = '';
  others.forEach((z, i) => {
    const th = themes[z.id] || { color: '#00A3E0', icon: '◆' };
    const card = document.createElement('div');
    card.className = `cn-finale-card cn-card-${i}`;
    card.style.setProperty('--accent', th.color);
    card.style.setProperty('--delay', `${0.5 + i * 0.18}s`);
    const num = String(zones.indexOf(z) + 1).padStart(2, '0');
    card.innerHTML = `
      <div class="cn-finale-card-bg"></div>
      <div class="cn-finale-card-inner">
        <div class="cn-finale-num">${num}</div>
        <div class="cn-finale-icon">${th.icon}</div>
        <div class="cn-finale-name">${z.name}</div>
        <div class="cn-finale-desc">${z.desc}</div>
        <div class="cn-finale-meta">
          <span>🚗 ${z.vehicles}</span>
          <span>👥 ${z.pedestrians}</span>
          <span>📷 ${z.cameras}</span>
        </div>
      </div>
    `;
    ui.finaleGrid.appendChild(card);
  });

    // Płynne przejście z gry do finału
  ui.fade.style.opacity = '1';
  ui.label.classList.add('cn-hidden');
  ui.finale.classList.remove('cn-hidden');
  void ui.finale.offsetWidth;
  ui.finale.classList.add('cn-show');
}

export function hideCinemaOverlay(ui) {
  if (!ui) return;
  ui.root.remove();
}
