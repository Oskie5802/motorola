// === CrossGuard main bootstrap: menu → game → results ===
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
import { loadBuildingModels, loadCharacterModel } from './modelLoader.js';

const $ = (id) => document.getElementById(id);

const audio = new AudioSystem();

// === Progress (localStorage) ===
const PROGRESS_KEY = 'crossguard_progress_v1';
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
  catch { return {}; }
}
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}
let progress = loadProgress();

// === State ===
let selectedZoneId = ZONES[0].id;
let currentSession = null; // { renderer, scene, camera, ... }
let cachedModels = null;   // OBJ building models, loaded once
let cachedCharacter = null; // Kenney animated character, loaded once

// === Menu construction ===
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

// === Loading screen helpers ===
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
  // Double rAF forces transition to pick up the opacity:0 start
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.add('loading-visible');
  }));
}

// === Loading screen → menu ===
window.addEventListener('load', () => {
  // Mark bar fill as animated (initial load)
  const barFill = document.querySelector('.bar-fill');
  if (barFill) barFill.classList.add('anim');

  setTimeout(() => {
    // Prepare menu while loading still visible
    renderZoneSelect();
    $('menu').classList.remove('hidden');
    // Now burn the loading screen away — menu crossfades in beneath
    hideLoading();
  }, 1100);
});

// === Menu events ===
$('startBtn').onclick = () => {
  audio.resume();
  $('menu').classList.add('hidden');
  startGame(ZONES.find(z => z.id === selectedZoneId));
};

async function ensureModels() {
  if (cachedModels && cachedCharacter) return cachedModels;
  const bar = document.querySelector('.bar-fill');
  if (bar) { bar.style.width = '0%'; bar.classList.remove('anim'); }
  showLoading();
  const [models, character] = await Promise.all([
    cachedModels || loadBuildingModels((p) => {
      if (bar) bar.style.width = (p * 80).toFixed(0) + '%';
    }),
    cachedCharacter || loadCharacterModel().catch((e) => {
      console.warn('Character model failed to load, using fallback:', e);
      return null;
    }),
  ]);
  cachedModels = models;
  cachedCharacter = character;
  if (bar) bar.style.width = '100%';
  await hideLoading();
  return cachedModels;
}
$('howToBtn').onclick = () => {
  $('menu').classList.add('hidden');
  $('howto').classList.remove('hidden');
};
$('howtoBack').onclick = () => {
  $('howto').classList.add('hidden');
  $('menu').classList.remove('hidden');
};

// === Pause ===
let isPaused = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && currentSession) {
    isPaused = !isPaused;
    $('pause').classList.toggle('hidden', !isPaused);
  }
});
$('resumeBtn').onclick = () => { isPaused = false; $('pause').classList.add('hidden'); };
$('quitBtn').onclick = () => {
  isPaused = false; $('pause').classList.add('hidden');
  endSession();
  $('hud').classList.add('hidden');
  renderZoneSelect();
  $('menu').classList.remove('hidden');
};

// === Results actions ===
$('nextBtn').onclick = () => {
  $('results').classList.add('hidden');
  // Advance to next unlocked zone if available, else replay
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

// === Game start ===
async function startGame(zone) {
  const models = await ensureModels();

  // Scene
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

  // Environment map dla ładnych refleksów na pojazdach i szybach
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envTex;

  // Camera
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 14, 14);

  const env = new Environment(scene, zone);
  const city = new City(scene, zone, env.isNight, models);
  city.scene = scene; // for goal marker access

  // Player at random sidewalk spawn
  const spawn = city.spawnPoints[Math.floor(Math.random() * city.spawnPoints.length)];
  const player = new Player(scene, spawn, cachedCharacter);
  player.setupInput(canvas);

  const traffic = new TrafficSystem(scene, city, zone);
  const hud = new HUD(city, zone);
  const game = new GameLogic({ city, player, traffic, hud, audio, zone });
  game.camera = camera; // for floater projection

  // Hook completion
  game.onComplete = (result) => showResults(result);

  // Show HUD
  $('hud').classList.remove('hidden');

  // First-run tutorial (only once, stored in progress)
  if (!progress._seenTutorial) {
    $('tutorial').classList.remove('hidden');
    isPaused = true;
    $('tutorialOk').onclick = () => {
      $('tutorial').classList.add('hidden');
      isPaused = false;
      progress._seenTutorial = true;
      saveProgress(progress);
    };
  }

  // Audio
  audio.ambient(zone.id);

  // Resize
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // Loop
  const clock = new THREE.Clock();
  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, clock.getDelta());
    if (!isPaused && game.state === 'playing') {
      city.updateTrafficLights(dt);
      traffic.update(dt, player.pos, null);
      player.update(dt, city, traffic);
      env.update(dt, player.pos);
      game.update(dt);
      hud.update(dt, player, traffic, game.goal);
    }
    player.updateCamera(camera);
    renderer.render(scene, camera);
  }
  tick();

  currentSession = {
    renderer, scene, camera, raf, onResize, zone, audio,
    cleanup: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      // Dispose all scene materials/geometries
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

// === Results screen ===
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

  // Save progress
  const zid = result.zone.id;
  const prev = progress[zid] || { bestScore: -Infinity, score: 0 };
  if (result.score > prev.bestScore) prev.bestScore = result.score;
  prev.score = Math.max(prev.score || 0, result.score);
  progress[zid] = prev;
  saveProgress(progress);

  audio.motoChime();
  $('results').classList.remove('hidden');
}
