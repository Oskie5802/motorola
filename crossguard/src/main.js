// Odpalanie całego bałaganu (main loop)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZONES, gradeFor } from './core/config.js';
import { City } from './city/city.js';
import { Player } from './entities/player.js';
import { TrafficSystem } from './entities/traffic.js';
import { HUD } from './systems/hud.js';
import { AudioSystem } from './systems/audio.js';
import { Environment } from './city/environment.js';
import { GameLogic } from './core/game.js';
import { loadBuildingModels, loadCharacterModel, loadCarModels, loadSuburbanModels } from './entities/modelLoader.js';
import { CinematicDirector, buildCinematicOverlay, showFinaleMosaic, hideCinemaOverlay } from './systems/cinematic.js';
import { settings } from './core/settings.js';

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
let cachedModels = null;    // OBJ building models, loaded once
let cachedCharacter = null; // Kenney animated character, loaded once
let cachedCars = null;      // Kenney car-kit GLB models, loaded once
let cachedSuburban = null;  // Kenney city-kit-suburban GLB models, loaded once

// Składanie manu w html
function renderZoneSelect() {
  const container = $('zoneSelect');
  container.innerHTML = '';
  for (let i = 0; i < ZONES.length; i++) {
    const z = ZONES[i];
    
    // Blokada poziomów: pierwszy jest zawsze odblokowany, kolejne wymagają oceny B (140 pkt) na poprzednim
    let locked = false;
    if (i > 0) {
      const prevZone = ZONES[i - 1];
      const prevBest = progress[prevZone.id]?.bestScore || 0;
      locked = prevBest < 140;
    }
    
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
      ${locked ? `<div class="zlock">🔒 ZABLOKOWANE (WYMAGA OCENY B NA POZ. ${i})</div>` : `<div class="zunlocked">◆</div>`}
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
  const isLow = settings.current.quality === 'low';
  if (cachedCharacter && (isLow || (cachedModels && cachedCars && Object.keys(cachedCars).length > 0))) {
    return { ...(cachedModels || { buildings: [], skyscrapers: [] }), suburban: cachedSuburban || [] };
  }
  const bar = document.querySelector('.bar-fill');
  if (bar) { bar.style.width = '0%'; bar.classList.remove('anim'); }
  showLoading();
  const [models, character, cars, suburban] = await Promise.all([
    (isLow || cachedModels) ? Promise.resolve(cachedModels || { buildings: [], skyscrapers: [] }) : loadBuildingModels((p) => {
      if (bar) bar.style.width = (p * 50).toFixed(0) + '%';
    }),
    cachedCharacter || loadCharacterModel().catch((e) => {
      console.warn('Character model failed to load, using fallback:', e);
      return null;
    }),
    (isLow || cachedCars) ? Promise.resolve(cachedCars || {}) : loadCarModels((p) => {
      if (bar) bar.style.width = (50 + p * 50).toFixed(0) + '%';
    }),
    (isLow || cachedSuburban) ? Promise.resolve(cachedSuburban || []) : loadSuburbanModels().catch(e => {
      console.warn('Suburban models failed to load:', e);
      return [];
    }),
  ]);
  cachedModels = models;
  cachedCharacter = character;
  cachedCars = cars;
  cachedSuburban = suburban;
  if (bar) bar.style.width = '100%';
  await hideLoading();
  return { ...cachedModels, suburban: cachedSuburban };
}

// Setup dynamic graphics setting updates at runtime
async function applySettingsDynamically() {
  if (!currentSession) return;

  const hasShadows = settings.current.shadows;
  
  // Update renderer settings
  currentSession.renderer.shadowMap.enabled = hasShadows;
  currentSession.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.current.pixelRatioLimit));
  
  // Trigger environment settings update
  if (currentSession.env && typeof currentSession.env.applyDynamicSettings === 'function') {
    currentSession.env.applyDynamicSettings();
  }

  // Update object cast/receive shadow flags dynamically
  currentSession.scene.traverse(obj => {
    if (obj.isMesh) {
      if (obj.userData && (obj.userData.isHUDElement || obj.userData.isMarker)) return;
      obj.castShadow = hasShadows;
      obj.receiveShadow = hasShadows;
    }
  });

  // Pre-load assets in background if settings upgraded to Med/High and not loaded yet
  if (settings.current.quality !== 'low') {
    if (!cachedModels || !cachedCars || Object.keys(cachedCars).length === 0 || !cachedSuburban || cachedSuburban.length === 0) {
      console.log('[Settings] Upgraded quality in-game. Pre-loading models in the background...');
      const [models, cars, suburban] = await Promise.all([
        (cachedModels && cachedModels.buildings.length > 0) ? Promise.resolve(cachedModels) : loadBuildingModels().catch(() => ({ buildings: [], skyscrapers: [] })),
        (cachedCars && Object.keys(cachedCars).length > 0) ? Promise.resolve(cachedCars) : loadCarModels().catch(() => ({})),
        (cachedSuburban && cachedSuburban.length > 0) ? Promise.resolve(cachedSuburban) : loadSuburbanModels().catch(() => []),
      ]);
      cachedModels = models;
      cachedCars = cars;
      cachedSuburban = suburban;
      if (currentSession && currentSession.traffic) {
        currentSession.traffic.carModels = cachedCars;
      }
    }
  }
}

// Settings UI event bindings
function initSettingsUI() {
  const qualityLow = $('qualityLow');
  const qualityMed = $('qualityMed');
  const qualityHigh = $('qualityHigh');
  const settingShadows = $('settingShadows');
  const settingLOD = $('settingLOD');
  const settingParticles = $('settingParticles');
  const settingChunkLimit = $('settingChunkLimit');
  const chunkLimitVal = $('chunkLimitVal');
  const qualityDesc = $('qualityDesc');

  let settingsOrigin = 'menu';
  let qualityOnOpen = settings.current.quality; // Track quality when settings opened

  function updateUI() {
    qualityLow.classList.toggle('active', settings.current.quality === 'low');
    qualityMed.classList.toggle('active', settings.current.quality === 'medium');
    qualityHigh.classList.toggle('active', settings.current.quality === 'high');

    settingShadows.checked = settings.current.shadows;
    settingLOD.checked = settings.current.lod;
    settingParticles.checked = settings.current.particles;
    
    if (settingChunkLimit) {
      settingChunkLimit.value = settings.current.chunkLimit || 200;
    }
    if (chunkLimitVal) {
      chunkLimitVal.textContent = (settings.current.chunkLimit || 200) + 'm';
    }

    if (settings.current.quality === 'low') {
      qualityDesc.textContent = 'Maksymalna wydajność. Brak cieni i cząsteczek, uproszczone modele, jednorodne szare nawierzchnie dróg.';
    } else if (settings.current.quality === 'medium') {
      qualityDesc.textContent = 'Zrównoważona grafika. Włączone cienie i cząsteczki, płaskie, cieniowane nawierzchnie (bez tekstur), uproszczona geometria sygnalizatorów.';
    } else if (settings.current.quality === 'high') {
      qualityDesc.textContent = 'Najlepsza grafika. Pełne tekstury asfaltu i chodników z mapami wypukłości (bump), pełne cienie, wysoka rozdzielczość i detale skrzyżowań.';
    }
  }

  $('settingsBtn').onclick = () => {
    settingsOrigin = 'menu';
    qualityOnOpen = settings.current.quality;
    $('menu').classList.add('hidden');
    $('settings').classList.remove('hidden');
    updateUI();
  };

  $('pauseSettingsBtn').onclick = () => {
    settingsOrigin = 'pause';
    qualityOnOpen = settings.current.quality;
    $('pause').classList.add('hidden');
    $('settings').classList.remove('hidden');
    updateUI();
  };

  $('settingsBack').onclick = async () => {
    $('settings').classList.add('hidden');
    const qualityChanged = qualityOnOpen !== settings.current.quality;

    if (settingsOrigin === 'pause' && currentSession && qualityChanged) {
      // Quality changed during gameplay — rebuild the session to regenerate
      // city textures, traffic lights, and all quality-dependent elements
      const zone = currentSession.zone;
      const wasCinematic = currentSession.cinematic;
      isPaused = false;
      endSession();
      await startGame(zone, { cinematic: wasCinematic });
    } else if (settingsOrigin === 'pause') {
      $('pause').classList.remove('hidden');
      applySettingsDynamically();
    } else {
      $('menu').classList.remove('hidden');
    }
  };

  qualityLow.onclick = () => {
    settings.setQuality('low');
    updateUI();
  };
  qualityMed.onclick = () => {
    settings.setQuality('medium');
    updateUI();
  };
  qualityHigh.onclick = () => {
    settings.setQuality('high');
    updateUI();
  };

  settingShadows.onchange = () => {
    settings.current.shadows = settingShadows.checked;
    settings.save();
  };

  settingLOD.onchange = () => {
    settings.current.lod = settingLOD.checked;
    settings.save();
  };

  settingParticles.onchange = () => {
    settings.current.particles = settingParticles.checked;
    settings.save();
  };

  if (settingChunkLimit) {
    settingChunkLimit.oninput = () => {
      if (chunkLimitVal) {
        chunkLimitVal.textContent = settingChunkLimit.value + 'm';
      }
    };
    settingChunkLimit.onchange = () => {
      settings.current.chunkLimit = parseInt(settingChunkLimit.value, 10);
      settings.save();
    };
  }
}

initSettingsUI();
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
    if (!$('settings').classList.contains('hidden')) {
      $('settingsBack').click();
      return;
    }
    
    // Jeśli wskaźnik był zablokowany, pozwól przeglądarce go odblokować i spauzuj grę
    if (document.pointerLockElement) {
      if (!isPaused) {
        isPaused = true;
        $('pause').classList.remove('hidden');
        audio.pauseIn();
      }
      return;
    }

    isPaused = !isPaused;
    $('pause').classList.toggle('hidden', !isPaused);
    if (isPaused) audio.pauseIn();
    else audio.pauseOut();
  }
});

// Automatyczne pauzowanie gry przy utracie Pointer Locka w trybie FPP
document.addEventListener('pointerlockchange', () => {
  if (currentSession && currentSession.player && currentSession.player.cameraMode === 'firstperson') {
    const canvas = $('game');
    if (document.pointerLockElement !== canvas && !isPaused && currentSession.game.state === 'playing') {
      isPaused = true;
      $('pause').classList.remove('hidden');
      audio.pauseIn();
    }
  }
});
$('resumeBtn').onclick = () => { 
  isPaused = false; 
  $('pause').classList.add('hidden'); 
  audio.pauseOut(); 
  requestGamePointerLock();
};
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
  const idx = ZONES.findIndex(z => z.id === currentSession.zone.id);
  const next = ZONES[idx + 1];
  if (next) {
    selectedZoneId = next.id;
    endSession();
    startGame(next);
  }
};
$('retryBtn').onclick = () => {
  $('results').classList.add('hidden');
  const currentZone = currentSession.zone;
  endSession();
  startGame(currentZone);
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

function requestGamePointerLock() {
  if (currentSession && currentSession.player && currentSession.player.cameraMode === 'firstperson' && !currentSession.cinematic) {
    const isMenuOpen = !$('menu').classList.contains('hidden') || 
                       !$('pause').classList.contains('hidden') || 
                       !$('settings').classList.contains('hidden') || 
                       !$('tutorial').classList.contains('hidden') || 
                       !$('results').classList.contains('hidden');
    if (!isMenuOpen) {
      $('game').requestPointerLock();
    }
  }
}

// Inicjalizacja swiata
async function startGame(zone, opts = {}) {
  const cinematic = !!opts.cinematic;
  const models = await ensureModels();

    // Scena
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.current.pixelRatioLimit));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = settings.current.shadows;
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
      requestGamePointerLock();
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
    const t0 = (player && player.devMode) ? performance.now() : 0;
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
    city.cullScene(camera);
    renderer.render(scene, camera);

    if (player && player.devMode) {
      // Usunięto renderer.getContext().finish() - blokowało to potok renderowania i zbijało klatki do 30 FPS
      player.lastFrameTime = performance.now() - t0;
    }
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

  // Jeśli samouczek został już zaliczony i nie jesteśmy w trybie cinematic, zablokuj kursor
  if (!cinematic && progress._seenTutorial) {
    requestGamePointerLock();
  }
}

function endSession() {
  if (currentSession) {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
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
                             result.reason === 'timeout' ? 'CZAS MINĄŁ' :
                             result.reason === 'accident' ? 'POTRĄCENIE PRZEZ POJAZD' : '-';
  $('resultsHeader').textContent =
    result.reason === 'success' ? 'RAPORT MISJI · SUKCES' :
    result.reason === 'accident' ? 'RAPORT MISJI · PORAŻKA (KOLIZJA)' :
    'RAPORT MISJI · CZAS MINĄŁ';
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

  // Sprawdzamy odblokowanie następnego poziomu (wymagana ocena B, czyli score >= 140)
  const idx = ZONES.findIndex(z => z.id === zid);
  const hasNext = idx < ZONES.length - 1;
  const nextBtn = $('nextBtn');
  if (hasNext) {
    nextBtn.classList.remove('hidden');
    const currentBest = progress[zid]?.bestScore || 0;
    if (currentBest >= 140) {
      nextBtn.disabled = false;
      nextBtn.textContent = '▶ NASTĘPNA MISJA';
      nextBtn.classList.remove('disabled-btn');
    } else {
      nextBtn.disabled = true;
      nextBtn.textContent = '▶ ZABLOKOWANE (WYMAGANA OCENA B)';
      nextBtn.classList.add('disabled-btn');
    }
  } else {
    nextBtn.classList.add('hidden');
  }

  audio.motoChime();
  $('results').classList.remove('hidden');
}
