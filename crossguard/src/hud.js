// === HUD: mini-map, score, mission text, alerts, assist, radio, weather, day/night ===
import * as THREE from 'three';
import { RADIO_MESSAGES, ASSIST_TIPS } from './config.js';

export class HUD {
  constructor(city, zone) {
    this.city = city;
    this.zone = zone;

    this.scoreEl = document.getElementById('scoreText');
    this.timerEl = document.getElementById('timerText');
    this.missionEl = document.getElementById('missionText');
    this.zoneEl = document.getElementById('zoneText');
    this.weatherEl = document.getElementById('weatherText');
    this.timeEl = document.getElementById('timeOfDayText');
    this.lprEl = document.getElementById('lprText');
    this.assistEl = document.getElementById('assistMsg');
    this.radioEl = document.getElementById('radioMsg');
    this.radioBox = document.getElementById('radio');
    this.alertsEl = document.getElementById('alerts');
    this.crossPromptEl = document.getElementById('crossPrompt');
    this.crossLightIcon = document.getElementById('crossLightIcon');
    this.crossPromptText = document.getElementById('crossPromptText');
    this.minimapCanvas = document.getElementById('minimapCanvas');
    this.mctx = this.minimapCanvas.getContext('2d');

    this.zoneEl.textContent = zone.name;
    this.weatherEl.textContent =
      zone.weather === 'rain' ? 'Deszcz' :
      zone.weather === 'fog'  ? 'Mgła'  :
      zone.weather === 'snow' ? 'Śnieg' : 'Słonecznie';
    this.timeEl.textContent =
      zone.timeOfDay === 'night' ? 'Noc' :
      zone.timeOfDay === 'morning' ? 'Poranek' : 'Dzień';

    this.lprCount = 0;
    this.assistRotateTimer = 0;
    this.radioTimer = 4;
    this.radioVisible = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') {
        this.radioVisible = !this.radioVisible;
        this.radioBox.classList.toggle('hidden', !this.radioVisible);
      }
    });
  }

  setMission(text) { this.missionEl.textContent = text; }
  setScore(n) { this.scoreEl.textContent = String(Math.round(n)); }
  setTimer(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    this.timerEl.textContent = `${m}:${s}`;
  }
  setLPR(n) { this.lprEl.textContent = String(n); }
  setAssist(msg) { this.assistEl.textContent = msg; }
  setRadio(msg) {
    this.radioEl.textContent = msg;
    if (!this.radioVisible) {
      this.radioVisible = true;
      this.radioBox.classList.remove('hidden');
    }
  }

  showCrossPrompt(state) {
    // state: 'red' | 'green' | 'amber' | null
    if (!state) {
      this.crossPromptEl.classList.add('hidden');
      return;
    }
    this.crossPromptEl.classList.remove('hidden');
    const colorMap = { red: '#e63946', green: '#00b074', amber: '#ffb800' };
    const textMap = {
      red: 'Czekaj — sygnał czerwony',
      green: 'Idź — sygnał zielony',
      amber: 'Uwaga — sygnał żółty',
    };
    this.crossLightIcon.style.color = colorMap[state];
    this.crossPromptText.textContent = textMap[state];
  }

  alert(text, kind = 'info', durationMs = 2700) {
    const el = document.createElement('div');
    el.className = `alert ${kind}`;
    el.textContent = text;
    this.alertsEl.appendChild(el);
    setTimeout(() => { el.remove(); }, durationMs + 350);
  }

  // Floating score number anchored to a world position (projected through camera each frame)
  spawnFloater(worldPos, text, kind = 'pos', camera) {
    const el = document.createElement('div');
    el.className = `floater ${kind}`;
    el.textContent = text;
    document.body.appendChild(el);

    const v = new THREE.Vector3(worldPos.x, 1.8, worldPos.z);
    const start = performance.now();
    const update = () => {
      const t = performance.now() - start;
      if (t > 1400) { el.remove(); return; }
      v.set(worldPos.x, 1.8, worldPos.z);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      requestAnimationFrame(update);
    };
    update();
  }

  randomAssistTip() {
    this.setAssist(ASSIST_TIPS[Math.floor(Math.random() * ASSIST_TIPS.length)]);
  }
  randomRadio() {
    this.setRadio(RADIO_MESSAGES[Math.floor(Math.random() * RADIO_MESSAGES.length)]);
  }

  update(dt, player, traffic, goalPos) {
    this.assistRotateTimer -= dt;
    if (this.assistRotateTimer <= 0) {
      this.assistRotateTimer = 12 + Math.random() * 6;
      this.randomAssistTip();
    }
    this.radioTimer -= dt;
    if (this.radioTimer <= 0) {
      this.radioTimer = 15 + Math.random() * 12;
      this.randomRadio();
    }
    this._renderMinimap(player, traffic, goalPos);
  }

  _renderMinimap(player, traffic, goalPos) {
    const ctx = this.mctx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const bounds = this.city.bounds;
    const span = bounds.max - bounds.min;
    const scale = (W - 8) / span;
    const toMap = (x, z) => ({
      mx: (x - bounds.min) * scale + 4,
      my: (z - bounds.min) * scale + 4,
    });

    // Background
    ctx.fillStyle = '#0a1d3f';
    ctx.fillRect(0, 0, W, H);

    // Grid lines (roads)
    ctx.strokeStyle = '#1c3a78';
    ctx.lineWidth = 2;
    const g = this.city.gridSize, bs = this.city.blockSize;
    for (let i = 0; i <= g; i++) {
      const c = i * bs + bounds.min;
      const p1 = toMap(c, bounds.min);
      const p2 = toMap(c, bounds.max);
      ctx.beginPath(); ctx.moveTo(p1.mx, p1.my); ctx.lineTo(p2.mx, p2.my); ctx.stroke();
      const p3 = toMap(bounds.min, c);
      const p4 = toMap(bounds.max, c);
      ctx.beginPath(); ctx.moveTo(p3.mx, p3.my); ctx.lineTo(p4.mx, p4.my); ctx.stroke();
    }

    // Cameras
    ctx.fillStyle = '#b16fff';
    for (const cam of this.city.cameras) {
      const { mx, my } = toMap(cam.x, cam.z);
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI*2); ctx.fill();
    }

    // Vehicles
    for (const v of traffic.vehicles) {
      const { mx, my } = toMap(v.pos.x, v.pos.z);
      ctx.fillStyle = v.isEmergency ? '#ff2233' : '#789bcb';
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }

    // Emergency: pulsing larger ring
    for (const e of traffic.emergency) {
      if (!traffic.vehicles.includes(e)) continue;
      const { mx, my } = toMap(e.pos.x, e.pos.z);
      ctx.strokeStyle = '#ff2233';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 4 + Math.sin(Date.now()/180) * 2, 0, Math.PI*2);
      ctx.stroke();
    }

    // Goal
    if (goalPos) {
      const { mx, my } = toMap(goalPos.x, goalPos.z);
      ctx.fillStyle = '#ffb800';
      ctx.beginPath();
      ctx.moveTo(mx, my - 5); ctx.lineTo(mx + 5, my + 4); ctx.lineTo(mx - 5, my + 4);
      ctx.closePath(); ctx.fill();

      // Distance line from player to goal
      const pp = toMap(player.pos.x, player.pos.z);
      ctx.strokeStyle = 'rgba(255,184,0,0.4)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pp.mx, pp.my); ctx.lineTo(mx, my); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Player
    const { mx, my } = toMap(player.pos.x, player.pos.z);
    ctx.fillStyle = '#00A3E0';
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI*2); ctx.fill();
    // Facing arrow
    const fx = mx + Math.sin(player.facing) * 8;
    const fy = my + Math.cos(player.facing) * 8;
    ctx.strokeStyle = '#00A3E0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(fx, fy); ctx.stroke();
  }

  incLPR() {
    this.lprCount++;
    this.setLPR(this.lprCount);
  }
}
