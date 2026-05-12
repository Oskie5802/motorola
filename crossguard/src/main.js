// === CrossGuard main bootstrap: menu → game → results ===
import * as THREE from 'three';
import { ZONES, gradeFor } from './config.js';
import { City } from './city.js';
import { Player } from './player.js';
import { TrafficSystem } from './traffic.js';
import { HUD } from './hud.js';
import { AudioSystem } from './audio.js';
import { Environment } from './environment.js';
import { GameLogic } from './game.js';

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

// === Menu construction ===
function renderZoneSelect() {
  const container = $('zoneSelect');
  container.innerHTML = '';
  for (const z of ZONES) {
    const totalScore = Object.values(progress).reduce((s, v) => s + (v.score || 0), 0);
    const locked = totalScore < z.requiredScore;
    const best = progress[z.id]?.bestScore;
    const card = document.createElement('div');
    card.className = 'zone-card' + (z.id === selectedZoneId ? ' selected' : '') + (locked ? ' locked' : '');
    card.innerHTML = `
      ${locked ? `<div class="zlock">🔒 ${z.requiredScore} pkt</div>` : ''}
      <div class="zname">${z.name}</div>
      <div class="zdesc">${z.desc}</div>
      ${best !== undefined ? `<div class="zbest">Najlepszy: ${best} pkt (${gradeFor(best).letter})</div>` : ''}
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

// === Loading screen → menu ===
window.addEventListener('load', () => {
  setTimeout(() => {
    $('loading').classList.add('hidden');
    renderZoneSelect();
    $('menu').classList.remove('hidden');
  }, 900);
});

// === Menu events ===
$('startBtn').onclick = () => {
  audio.resume();
  $('menu').classList.add('hidden');
  startGame(ZONES.find(z => z.id === selectedZoneId));
};
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
function startGame(zone) {
  // Scene
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // Camera
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 14, 14);

  const env = new Environment(scene, zone);
  const city = new City(scene, zone, env.isNight);
  city.scene = scene; // for goal marker access

  // Player at random sidewalk spawn
  const spawn = city.spawnPoints[Math.floor(Math.random() * city.spawnPoints.length)];
  const player = new Player(scene, spawn);
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
      player.update(dt, city);
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
                             result.reason === 'timeout' ? 'CZAS MINĄŁ' : '—';
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
