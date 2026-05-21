// Odpalanie całego bałaganu (main loop)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZONES, gradeFor } from './config.js';
import { City } from './city.js';
import { Player } from './player.js';
import { TrafficSystem } from './traffic.js';
import { HUD } from './hud.js';
import { AudioSystem } from './audio.js';
import { Environment } from './environment.js';
import { GameLogic } from './game.js';
import { loadBuildingModels, loadCharacterModel, loadCarModels } from './modelLoader.js';
import { CinematicDirector, buildCinematicOverlay, showFinaleMosaic, hideCinemaOverlay } from './cinematic.js';

const $ = (id) => document.getElementById(id);

const audio = new AudioSystem();

// Zapis gry w przegladarce
const PROGRESS_KEY = 'crossguard_progress_v1';
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
  catch { return {}; }
}
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}
let progress = loadProgress();

// Stan apki
let selectedZoneId = ZONES[0].id;
let currentSession = null; // { renderer, scene, camera, ... }
let cachedModels = null;   // OBJ building models, loaded once
let cachedCharacter = null; // Kenney animated character, loaded once
let cachedCars = null;      // Kenney car-kit GLB models, loaded once

// Składanie manu w html
function renderZoneSelect() {
  const container = $('zoneSelect');
  container.innerHTML = '';
  const totalScore = Object.values(progress).reduce((s, v) => s + (v.score || 0), 0);
  for (let i = 0; i < ZONES.length; i++) {
    const z = ZONES[i];
    const locked = totalScore < z.requiredScore;
    const best = progress[z.id]?.bestScore;
    const card = document.createElement('div');
    card.className = 'zone-card' + (z.id === selectedZoneId ? ' selected' : '') + (locked ? ' locked' : '');
    const num = String(i + 1).padStart(2, '0');
    card.innerHTML = `
      <div class="znum">${num}</div>
      <div class="zinfo">
        <div class="zname">${z.name}</div>
        <div class="zdesc">${z.desc}</div>
        ${best !== undefined ? `<div class="zbest">BEST: ${best} PKT &nbsp;·&nbsp; ${gradeFor(best).letter}</div>` : ''}
      </div>
      ${locked ? `<div class="zlock">🔒 ${z.requiredScore}</div>` : `<div class="zunlocked">◆</div>`}
    `;
    if (!locked) {
      card.onclick = () => {
        selectedZoneId = z.id;
        renderZoneSelect();
      };
    }
    container.appendChild(card);
  }
}

// Funkcje do loadingu
function hideLoading() {
  return new Promise(resolve => {
    const el = $('loading');
    el.classList.add('loading-exit');
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('loading-exit');
      resolve();
    }, 500);
  });
}

function showLoading() {
  const el = $('loading');
  el.classList.remove('hidden', 'loading-exit', 'loading-visible');
  el.classList.add('loading-bare');
    // Hack z rAF zeby przejscie CSS w ogole zaczelo lapac opacity: 0
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.add('loading-visible');
  }));
}

// Ekran loadingu przeskakuje na menu
window.addEventListener('load', () => {
    // Animuj pasek progressu
  const barFill = document.querySelector('.bar-fill');
  if (barFill) barFill.classList.add('anim');

  const params = new URLSearchParams(location.search);
  const autoCinema = params.has('cinema') || params.has('showcase') || location.hash === '#cinema';

  setTimeout(() => {
        // Buduj to menu jak jeszcze ukryte
    renderZoneSelect();
    if (autoCinema) {
            // Przeskocz do dema
      $('menu').classList.add('hidden');
      hideLoading().then(() => {
        audio.resume();
        startCinematic();
      });
    } else {
      $('menu').classList.remove('hidden');
      hideLoading();
    }
  }, 1100);
});

// Nasluchiwacze na buttony
$('startBtn').onclick = () => {
  audio.resume();
  $('menu').classList.add('hidden');
  startGame(ZONES.find(z => z.id === selectedZoneId));
};

async function ensureModels() {
  if (cachedModels && cachedCharacter && cachedCars) return cachedModels;
  const bar = document.querySelector('.bar-fill');
  if (bar) { bar.style.width = '0%'; bar.classList.remove('anim'); }
  showLoading();
  const [models, character, cars] = await Promise.all([
    cachedModels || loadBuildingModels((p) => {
      if (bar) bar.style.width = (p * 50).toFixed(0) + '%';
    }),
    cachedCharacter || loadCharacterModel().catch((e) => {
      console.warn('Character model failed to load, using fallback:', e);
      return null;
    }),
    cachedCars || loadCarModels((p) => {
      if (bar) bar.style.width = (50 + p * 50).toFixed(0) + '%';
    }),
  ]);
  cachedModels = models;
  cachedCharacter = character;
  cachedCars = cars;
  if (bar) bar.style.width = '100%';
  await hideLoading();
  return cachedModels;
}
// F9 odpala demo w kazdym miejscu
window.addEventListener('keydown', (e) => {
  if (e.code === 'F9') {
    e.preventDefault();
    if (cinematicActive) return;
    audio.resume();
    $('menu').classList.add('hidden');
    $('results').classList.add('hidden');
    $('howto').classList.add('hidden');
    endSession();
    startCinematic();
  }
});

$('howToBtn').onclick = () => {
  $('menu').classList.add('hidden');
  $('howto').classList.remove('hidden');
};
$('howtoBack').onclick = () => {
  $('howto').classList.add('hidden');
  $('menu').classList.remove('hidden');
};

// Pauza gry
let isPaused = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && currentSession && !currentSession.cinematic) {
    isPaused = !isPaused;
    $('pause').classList.toggle('hidden', !isPaused);
    if (isPaused) audio.pauseIn();
    else audio.pauseOut();
  }
});
$('resumeBtn').onclick = () => { isPaused = false; $('pause').classList.add('hidden'); audio.pauseOut(); };
$('quitBtn').onclick = () => {
  isPaused = false; $('pause').classList.add('hidden');
  endSession();
  $('hud').classList.add('hidden');
  renderZoneSelect();
  $('menu').classList.remove('hidden');
};

// Ekran koncowy, co dalej
$('nextBtn').onclick = () => {
  $('results').classList.add('hidden');
    // Gramy nastepny poziom albo to samo jak nie masz lepszego
  const idx = ZONES.findIndex(z => z.id === currentSession.zone.id);
  const totalScore = Object.values(progress).reduce((s, v) => s + (v.score || 0), 0);
  let next = ZONES[idx + 1];
  if (!next || totalScore < next.requiredScore) next = ZONES[idx];
  selectedZoneId = next.id;
  endSession();
  startGame(next);
};
$('menuBtn').onclick = () => {
  $('results').classList.add('hidden');
  endSession();
  renderZoneSelect();
  $('menu').classList.remove('hidden');
};

// Tryb Showcase
let cinematicActive = false;
let cinematicAbort = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startCinematic() {
  if (cinematicActive) return;
  cinematicActive = true;
  await ensureModels();
  const overlay = buildCinematicOverlay();

  let aborted = false;
  const onKey = (e) => { if (e.code === 'Escape') aborted = true; };
  window.addEventListener('keydown', onKey);
  cinematicAbort = () => { aborted = true; };

    // Pokazujemy glowne miasto bo deszcz i tramwaje
  const featured = ZONES.find(z => z.id === 'downtown') || ZONES[2] || ZONES[0];

  await startGame(featured, { cinematic: true });
  const session = currentSession;
  if (session && !aborted) {
    const director = new CinematicDirector({
      camera: session.camera,
      scene: session.scene,
      city: session.city,
      traffic: session.traffic,
      player: session.player,
      zone: featured,
      ui: overlay,
    });
    session.director = director;

        // Czekaj az skoncza to krecic
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearInterval(poll); resolve(); };
      const poll = setInterval(() => { if (aborted) finish(); }, 120);
      director.onZoneDone = finish;
    });
  }

    // Na koniec mozaika ekranow z innymi trybami
  if (!aborted) {
    showFinaleMosaic(overlay, ZONES, featured.id);
        // Zostaw na ekranie chwile zeby user popatrzyl
    await Promise.race([
      sleep(8500),
      new Promise(res => {
        const tick = setInterval(() => { if (aborted) { clearInterval(tick); res(); } }, 100);
      }),
    ]);
  }

  window.removeEventListener('keydown', onKey);
  hideCinemaOverlay(overlay);
  cinematicActive = false;
  cinematicAbort = null;
  endSession();
  renderZoneSelect();
  $('menu').classList.remove('hidden');
}

// Inicjalizacja swiata
async function startGame(zone, opts = {}) {
  const cinematic = !!opts.cinematic;
  const models = await ensureModels();

    // Scena
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = zone.timeOfDay === 'night' ? 0.75 : 1.15;

  const scene = new THREE.Scene();

    // Mapa srodowiska dla refleksow (paskudne to bez)
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envTex;

    // Kamera glowna
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 14, 14);

  const env = new Environment(scene, zone);
  const city = new City(scene, zone, env.isNight, models);
  city.scene = scene; // for goal marker access

    // Gracz w jakims dziwnym miejscu
  const spawn = city.spawnPoints[Math.floor(Math.random() * city.spawnPoints.length)];
  const player = new Player(scene, spawn, cachedCharacter);
  if (!cinematic) player.setupInput(canvas);
  else { player.keys = {}; } // disable input; cinematic drives the player

  const traffic = new TrafficSystem(scene, city, zone, cachedCars);
  const hud = new HUD(city, zone);
  const game = new GameLogic({ city, player, traffic, hud, audio, zone });
  game.camera = camera; // for floater projection

    // Nasluch na zakonczenie
  if (!cinematic) game.onComplete = (result) => showResults(result);

    // Odpalaj ui
  if (!cinematic) $('hud').classList.remove('hidden');
  else $('hud').classList.add('hidden');

    // Samouczek jak jeszcze nie widziales (nie puszczaj w trybie demo)
  if (!cinematic && !progress._seenTutorial) {
    $('tutorial').classList.remove('hidden');
    isPaused = true;
    $('tutorialOk').onclick = () => {
      $('tutorial').classList.add('hidden');
      isPaused = false;
      progress._seenTutorial = true;
      saveProgress(progress);
    };
  }

        // Glosniczki
    audio.ambient(zone.id);

        // Deszcz w tle jak pada
    if (zone.weather === 'rain') audio.startRain();

    // Obsluga skalowania ona
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

    // Glowna pętla
  const clock = new THREE.Clock();
  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, clock.getDelta());
    if (cinematic) {
            // Tryb cinema: swiat sobie leci, ale kamerą i typem steruje reżyser
            // czyli cinematic.js
      city.updateTrafficLights(dt);
      traffic.update(dt, player.pos, null);
      env.update(dt, player.pos);
      if (currentSession && currentSession.director) {
        currentSession.director.update(dt);
      }
    } else {
      if (!isPaused && game.state === 'playing') {
        city.updateTrafficLights(dt);
        traffic.update(dt, player.pos, null);
        player.update(dt, city, traffic);
        env.update(dt, player.pos);
        game.update(dt);
        hud.update(dt, player, traffic, game.goal);
      }
      player.updateCamera(camera);
    }
    renderer.render(scene, camera);
  }
  tick();

  currentSession = {
    renderer, scene, camera, raf, onResize, zone, audio,
    city, traffic, player, env, game, hud, cinematic,
    cleanup: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
            // Posprzątaj RAM po levelu
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      audio.stop();
    },
  };
}

function endSession() {
  if (currentSession) {
    currentSession.cleanup();
    currentSession = null;
  }
  $('hud').classList.add('hidden');
}

// Widok punktow
function showResults(result) {
  $('hud').classList.add('hidden');
  $('gradeLetter').textContent = result.grade.letter;
  $('gradeLetter').style.color = result.grade.color;
  $('rScore').textContent = result.score;
  $('rTime').textContent = `${result.time}s`;
  $('rCross').textContent = result.crossings;
  $('rViolations').textContent = result.violations;
  $('rZone').textContent = result.zone.name;
  $('rStatus').textContent = result.reason === 'success' ? 'CEL OSIĄGNIĘTY' :
                             result.reason === 'timeout' ? 'CZAS MINĄŁ' : '-';
  $('resultsHeader').textContent =
    result.reason === 'success' ? 'RAPORT MISJI · SUKCES' : 'RAPORT MISJI · CZAS MINĄŁ';
  $('lessonBox').innerHTML = `
    <b>${result.grade.label}</b><br/>
    ${result.zone.lesson}
  `;

    // Zapisz do localstorage
  const zid = result.zone.id;
  const prev = progress[zid] || { bestScore: -Infinity, score: 0 };
  if (result.score > prev.bestScore) prev.bestScore = result.score;
  prev.score = Math.max(prev.score || 0, result.score);
  progress[zid] = prev;
  saveProgress(progress);

  audio.motoChime();
  $('results').classList.remove('hidden');
}
