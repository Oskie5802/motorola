// UI gry (hud)
import * as THREE from 'three';
import { RADIO_EVENTS, RADIO_FLAVOR, ASSIST_TIPS } from './config.js';
import { settings } from './settings.js';

export class HUD {
  constructor(city, zone) {
    this.city = city;
    this.zone = zone;

    this.scoreEl = document.getElementById('scoreText');
    this.timerEl = document.getElementById('timerText');
    this.missionEl = document.getElementById('missionText');
    this.distEl = document.getElementById('distText');
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
    this._lastRadioEvent = null; // { text, event } from RADIO_EVENTS
    this.radioUnlocked = false; // unlocked via progression

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && this.radioUnlocked) {
        this.radioVisible = !this.radioVisible;
        this.radioBox.classList.toggle('hidden', !this.radioVisible);
      }
    });

    // Diagnostyka trybu deweloperskiego
    this.fpsTimer = 0;
    this.fpsCount = 0;
    this.currentFPS = 0;
    this.devOverlayEl = document.getElementById('devOverlay');
    this.devFPSEl = document.getElementById('devFPS');
    this.devCoordsEl = document.getElementById('devCoords');
    this.devVehiclesEl = document.getElementById('devVehicles');
    this.devPedsEl = document.getElementById('devPeds');
    this.devQualityEl = document.getElementById('devQuality');
    this.devShadowsEl = document.getElementById('devShadows');
    this.devLODEl = document.getElementById('devLOD');
  }

  setMission(text) { this.missionEl.textContent = text; }
  setDist(m) { this.distEl.textContent = m < 1000 ? `${Math.round(m)}m` : `${(m/1000).toFixed(1)}km`; }
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
        // stany to red green amber albo null
    if (!state) {
      this.crossPromptEl.classList.add('hidden');
      return;
    }
    this.crossPromptEl.classList.remove('hidden');
    const colorMap = { red: '#e63946', green: '#00b074', amber: '#ffb800' };
    const textMap = {
      red: 'Czekaj - sygnał czerwony',
      green: 'Idź - sygnał zielony',
      amber: 'Uwaga - sygnał żółty',
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

    // Przeliczanie pozycji 3d na 2d do latajacych punktow nad modelem
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
        // W 60 procentach event wplynie na gre, reszta to zapchajdziura w radiu
    if (Math.random() < 0.6 && RADIO_EVENTS.length > 0) {
      const ev = RADIO_EVENTS[Math.floor(Math.random() * RADIO_EVENTS.length)];
      this._lastRadioEvent = ev;
      this.setRadio(ev.text);
    } else {
      this._lastRadioEvent = null;
      this.setRadio(RADIO_FLAVOR[Math.floor(Math.random() * RADIO_FLAVOR.length)]);
    }
  }
  consumeRadioEvent() {
    const ev = this._lastRadioEvent;
    this._lastRadioEvent = null;
    return ev;
  }

  unlockRadio() {
    if (this.radioUnlocked) return;
    this.radioUnlocked = true;
    this.radioBox.classList.remove('hidden');
    this.setRadio('📡 Kanał dyspozytorski odblokowany!');
    this.alert('🔓 Radio APX P25 odblokowane! [R] aby podsłuchiwać', 'good', 4000);
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

    // Aktualizacja trybu deweloperskiego
    this.fpsCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.currentFPS = Math.round(this.fpsCount / this.fpsTimer);
      if (player.lastFrameTime > 0) {
        this.potentialFPS = Math.round(1000 / player.lastFrameTime);
      } else {
        this.potentialFPS = 0;
      }
      this.fpsCount = 0;
      this.fpsTimer = 0;
    }

    if (player.devMode) {
      if (this.devOverlayEl) {
        this.devOverlayEl.classList.remove('hidden');
        if (this.devFPSEl) {
          const rawFpsText = this.potentialFPS > 0 ? `${this.currentFPS} (RAW: ${this.potentialFPS})` : `${this.currentFPS}`;
          this.devFPSEl.textContent = rawFpsText;
        }
        if (this.devCoordsEl) this.devCoordsEl.textContent = `X: ${player.pos.x.toFixed(1)}, Z: ${player.pos.z.toFixed(1)}`;
        if (this.devVehiclesEl) this.devVehiclesEl.textContent = traffic ? traffic.vehicles.length : 0;
        if (this.devPedsEl) this.devPedsEl.textContent = traffic ? traffic.peds.length : 0;
        
        const qNames = { low: 'NISKA', medium: 'ŚREDNIA', high: 'WYSOKA' };
        if (this.devQualityEl) this.devQualityEl.textContent = qNames[settings.current.quality] || settings.current.quality.toUpperCase();
        if (this.devShadowsEl) this.devShadowsEl.textContent = settings.current.shadows ? 'TAK' : 'NIE';
        if (this.devLODEl) this.devLODEl.textContent = settings.current.lod ? 'TAK' : 'NIE';
      }
    } else {
      if (this.devOverlayEl) this.devOverlayEl.classList.add('hidden');
    }
  }

  _renderMinimap(player, traffic, goalPos) {
    const ctx = this.mctx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const R = W / 2;
    const cx = R, cy = R;
    const now = Date.now();

    const VIEW = 90;
    const worldToMap = (wx, wz) => ({
      mx: cx + (wx - player.pos.x) / VIEW * R,
      my: cy + (wz - player.pos.z) / VIEW * R,
    });

    // --- Clipping do koła ---
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // ── TŁO ────────────────────────────────────────────────────────────
    // Gradient tła – ciemny środek, lekko jaśniejszy przy krawędziach
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bgGrad.addColorStop(0, '#0b1c2e');
    bgGrad.addColorStop(1, '#071424');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const xs = this.city.xCoords;
    const zs = this.city.zCoords;
    const roadHalf = VIEW * 0.048;

    // Granice siatki miasta w pikselach – drogi rysujemy TYLKO w tych zakresach
    const { mx: gridMinX } = worldToMap(xs[0] - roadHalf, 0);
    const { mx: gridMaxX } = worldToMap(xs[xs.length - 1] + roadHalf, 0);
    const { my: gridMinY } = worldToMap(0, zs[0] - roadHalf);
    const { my: gridMaxY } = worldToMap(0, zs[zs.length - 1] + roadHalf);

    // ── DROGI – rysowane tylko w obrębie siatki ─────────────────────────
    ctx.fillStyle = '#1a3550';
    // Pionowe (wzdłuż osi Z) – ograniczone do zakresu Z siatki
    for (const c of xs) {
      const { mx: lx } = worldToMap(c - roadHalf, 0);
      const { mx: rx } = worldToMap(c + roadHalf, 0);
      ctx.fillRect(lx, gridMinY, rx - lx, gridMaxY - gridMinY);
    }
    // Poziome (wzdłuż osi X) – ograniczone do zakresu X siatki
    for (const c of zs) {
      const { my: ty } = worldToMap(0, c - roadHalf);
      const { my: by } = worldToMap(0, c + roadHalf);
      ctx.fillRect(gridMinX, ty, gridMaxX - gridMinX, by - ty);
    }

    // ── BLOKI ZABUDOWY ──────────────────────────────────────────────────
    ctx.fillStyle = '#0d2438';
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const left  = xs[i]   + roadHalf;
        const right = xs[i+1] - roadHalf;
        const top   = zs[j]   + roadHalf;
        const bot   = zs[j+1] - roadHalf;
        const { mx: lx, my: ty } = worldToMap(left, top);
        const { mx: rx, my: by } = worldToMap(right, bot);
        const bw = rx - lx, bh = by - ty;
        if (bw > 1 && bh > 1) {
          // Blok z zaokrąglonymi rogami
          const rad = Math.min(3, bw * 0.12, bh * 0.12);
          ctx.beginPath();
          ctx.moveTo(lx + rad, ty);
          ctx.lineTo(rx - rad, ty); ctx.arcTo(rx, ty, rx, ty + rad, rad);
          ctx.lineTo(rx, by - rad); ctx.arcTo(rx, by, rx - rad, by, rad);
          ctx.lineTo(lx + rad, by); ctx.arcTo(lx, by, lx, by - rad, rad);
          ctx.lineTo(lx, ty + rad); ctx.arcTo(lx, ty, lx + rad, ty, rad);
          ctx.closePath();
          ctx.fill();
          // Delikatna obramówka bloku
          ctx.strokeStyle = 'rgba(30,80,120,0.5)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // ── ŚRODKOWE LINIE DRÓG (przerywane, tylko w siatce) ────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255,200,60,0.13)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 7]);
    for (const c of xs) {
      const { mx } = worldToMap(c, 0);
      ctx.beginPath(); ctx.moveTo(mx, gridMinY); ctx.lineTo(mx, gridMaxY); ctx.stroke();
    }
    for (const c of zs) {
      const { my } = worldToMap(0, c);
      ctx.beginPath(); ctx.moveTo(gridMinX, my); ctx.lineTo(gridMaxX, my); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // ── KAMERY AVIGILON ─────────────────────────────────────────────────
    for (const cam of this.city.cameras) {
      const { mx, my } = worldToMap(cam.x, cam.z);
      if (mx < -10 || mx > W+10 || my < -10 || my > H+10) continue;
      const pulse = 0.5 + 0.5 * Math.sin(now / 700 + cam.x * 0.4);
      // Pole widzenia kamery
      ctx.beginPath(); ctx.arc(mx, my, 5 + pulse * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160,100,255,${0.08 + 0.06 * pulse})`;
      ctx.fill();
      // Punkt kamery
      ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190,130,255,${0.75 + 0.25 * pulse})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(220,180,255,${0.5 * pulse})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // ── POJAZDY ────────────────────────────────────────────────────────
    // Granice siatki w world-units – pojazdy poza siatką (na drogach wjazdowych) ukryte
    const gridWMinX = xs[0] - roadHalf * 2;
    const gridWMaxX = xs[xs.length - 1] + roadHalf * 2;
    const gridWMinZ = zs[0] - roadHalf * 2;
    const gridWMaxZ = zs[zs.length - 1] + roadHalf * 2;

    for (const v of traffic.vehicles) {
      // Ukryj jeśli pojazd jest poza granicami siatki ulic
      if (v.pos.x < gridWMinX || v.pos.x > gridWMaxX ||
          v.pos.z < gridWMinZ || v.pos.z > gridWMaxZ) continue;
      const { mx, my } = worldToMap(v.pos.x, v.pos.z);
      if (mx < -10 || mx > W+10 || my < -10 || my > H+10) continue;

      if (v.isEmergency) {
        const blink = Math.sin(now / 130) > 0;
        const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 220));
        // Błyskający krąg
        ctx.beginPath(); ctx.arc(mx, my, 6 + pulse * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,40,60,${0.18 + 0.1 * pulse})`;
        ctx.fill();
        ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fillStyle = blink ? '#ff2a3c' : '#ff9000';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (v._lprFlagged) {
        const p2 = 0.5 + 0.5 * Math.abs(Math.sin(now / 360));
        ctx.beginPath(); ctx.arc(mx, my, 5 + p2 * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,220,255,${0.12 + 0.08 * p2})`;
        ctx.fill();
        ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.fill();
        ctx.strokeStyle = `rgba(0,240,255,${0.7 * p2})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // Zwykły pojazd – strzałka kierunku
        const dir = Math.atan2(v.vx || 0, v.vz || 0);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(dir);
        // Karoseria
        ctx.fillStyle = '#2c5f8a';
        ctx.strokeStyle = 'rgba(100,180,255,0.45)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.roundRect(-2.2, -4, 4.4, 8, 1.5);
        ctx.fill(); ctx.stroke();
        // Czubek (przód)
        ctx.fillStyle = 'rgba(150,220,255,0.8)';
        ctx.beginPath();
        ctx.moveTo(0, -5.5); ctx.lineTo(2.2, -3); ctx.lineTo(-2.2, -3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // ── CEL ────────────────────────────────────────────────────────────
    if (goalPos) {
      const { mx: gx, my: gy } = worldToMap(goalPos.x, goalPos.z);
      const inRange = gx > -20 && gx < W+20 && gy > -20 && gy < H+20;
      const pulse = 0.5 + 0.5 * Math.sin(now / 420);

      if (inRange) {
        // Wielokrąg poświaty
        const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 16);
        gg.addColorStop(0, `rgba(255,190,0,${0.5 * pulse})`);
        gg.addColorStop(0.5, `rgba(255,140,0,${0.2 * pulse})`);
        gg.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(gx, gy, 16, 0, Math.PI * 2); ctx.fill();
        // Gwiazdka / diament celu
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(now / 1200);
        ctx.fillStyle = `rgba(255,200,0,${0.88 + 0.12 * pulse})`;
        for (let p = 0; p < 4; p++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, -7); ctx.lineTo(2.2, -2.2); ctx.lineTo(7, 0);
          ctx.lineTo(2.2, 2.2); ctx.lineTo(0, 7); ctx.lineTo(-2.2, 2.2);
          ctx.lineTo(-7, 0); ctx.lineTo(-2.2, -2.2); ctx.closePath();
          ctx.fill();
          break;
        }
        // Gwiazda 4-ramienna
        ctx.fillStyle = `rgba(255,200,0,${0.88 + 0.12 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(2, -2); ctx.lineTo(7, 0);
        ctx.lineTo(2, 2); ctx.lineTo(0, 7); ctx.lineTo(-2, 2);
        ctx.lineTo(-7, 0); ctx.lineTo(-2, -2); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff8d0';
        ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Przerywana linia do celu
        ctx.strokeStyle = `rgba(255,170,0,${0.22 + 0.1 * pulse})`;
        ctx.setLineDash([3, 7]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(gx, gy); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Cel poza widokiem – strzałka na krawędzi z etykietą
        const ang = Math.atan2(goalPos.z - player.pos.z, goalPos.x - player.pos.x);
        const edgeDist = R - 16;
        const ex = cx + Math.cos(ang) * edgeDist;
        const ey = cy + Math.sin(ang) * edgeDist;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang + Math.PI / 2);
        // Cień strzałki
        ctx.shadowColor = 'rgba(255,160,0,0.6)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = `rgba(255,190,0,${0.75 + 0.25 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(5.5, 4.5); ctx.lineTo(-5.5, 4.5);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
        // Odległość do celu
        const dist = Math.sqrt(
          (goalPos.x - player.pos.x) ** 2 + (goalPos.z - player.pos.z) ** 2
        );
        const distLabel = dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`;
        ctx.font = 'bold 8px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255,200,80,${0.8 + 0.2 * pulse})`;
        ctx.fillText(distLabel, ex, ey + 14);
        ctx.textAlign = 'left';
      }
    }

    // ── GRACZ (zawsze w centrum) ────────────────────────────────────────
    const facing = player.facing;
    const canvasAngle = Math.PI / 2 - facing;

    // Pierścień pulsujący
    const ringPulse = 0.4 + 0.6 * Math.abs(Math.sin(now / 800));
    ctx.beginPath(); ctx.arc(cx, cy, 11 + ringPulse * 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,180,255,${0.15 + 0.1 * ringPulse})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Poświata gracza
    const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 15);
    pg.addColorStop(0, 'rgba(0,163,224,0.35)');
    pg.addColorStop(1, 'rgba(0,163,224,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();

    // Stożek widzenia
    ctx.save();
    ctx.translate(cx, cy);
    const fovSpread = Math.PI * 0.26;
    const fovDx = Math.cos(canvasAngle), fovDy = Math.sin(canvasAngle);
    const fov = ctx.createLinearGradient(0, 0, fovDx * 24, fovDy * 24);
    fov.addColorStop(0, 'rgba(0,200,255,0.18)');
    fov.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 24, canvasAngle - fovSpread, canvasAngle + fovSpread);
    ctx.closePath();
    ctx.fillStyle = fov;
    ctx.fill();
    ctx.restore();

    // Kółko gracza z białą obramówką
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#00A3E0'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.8; ctx.stroke();

    // Strzałka kierunku
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(canvasAngle);
    ctx.shadowColor = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(5, -3.5);
    ctx.lineTo(5,  3.5);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── WINIETA ────────────────────────────────────────────────────────
    const vig = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.8, 'rgba(0,0,0,0.25)');
    vig.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vig;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.restore(); // koniec clipu
  }

  incLPR() {
    this.lprCount++;
    this.setLPR(this.lprCount);
  }
}
