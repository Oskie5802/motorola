// Gracz = Alex
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { interpolateAngle } from '../core/mathUtils.js';

const MODEL_SCALE = 0.006; // Kenney FBX units → game world scale (fits building door height)

export class Player {
  constructor(scene, startPos, characterData) {
    this.scene = scene;
    this.group = new THREE.Group();

        // Zmienne animacji
    this.mixer = null;
    this.actions = {};
    this._currentAction = null;
    this._blendFraction = 0;

        // Skladanie modela z czesci z fbx
    if (characterData && characterData.model) {
      this._buildFromModel(characterData);
    } else {
      this._buildFallback();
    }

        // Decal na cien pod ludzikiem
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);
    this._softShadow = shadow;

    this.group.position.set(startPos.x, 0, startPos.z);
    this.scene.add(this.group);

    this.pos = new THREE.Vector3(startPos.x, 0, startPos.z);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.walkPhase = 0;

    this.cameraOffset = new THREE.Vector3(0, 12, 12);
    this.cameraYaw = 0;
    this.cameraPitch = 0.55;
    this.cameraDistance = 12;
    this.cameraMode = 'thirdperson'; // 'thirdperson' | 'firstperson'
    this.cameraPitchFPP = 0.0;

    this.walkSpeed = 4.0;
    this.runSpeed = 7.5;
    this.stopped = false;

    this.onPhone = false;
    this.phoneState = 'hidden'; // 'hidden' | 'peeking' | 'expanded'
    this.lastCrossingId = null;
    this.devMode = false;
    this.isDead = false;
    this.deathTime = 0;
    this.deathVelocity = null;
    this.deathSpinX = 0;
    this.deathSpinY = 0;
    this.deathSpinZ = -Math.PI / 2;

    // Ukrywamy model domyślnie, ponieważ zaczynamy w FPP
    const isFPP = this.cameraMode === 'firstperson';
    if (this._model) this._model.visible = !isFPP;
    if (this._fallbackBody) this._fallbackBody.visible = !isFPP;
    if (this._fallbackHead) this._fallbackHead.visible = !isFPP;

    this.bobTime = 0;
    this.bobY = 0;
    this.bobX = 0;
  }

  _buildFromModel(characterData) {
    const model = SkeletonUtils.clone(characterData.model);
    model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        // Po sklonowaniu gubi materiały, narzucamy recznie jeszcze raz
    const srcMaterials = [];
    characterData.model.traverse((child) => {
      if (child.isMesh) srcMaterials.push(child.material);
    });
    let mi = 0;
    model.traverse((child) => {
      if (child.isMesh) {
        if (mi < srcMaterials.length) child.material = srcMaterials[mi++];
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.group.add(model);
    this._model = model;

        // Szukamy obiektu ze skinem by mixer zadzialal poprawnie
        // bo inaczej rzuca sie o getBoneByName
        // na rigach z IKam (jak u Kenneya) wyskakuje błąd, ten fix to must have
    let skinnedMesh = null;
    model.traverse(child => { if (child.isSkinnedMesh && !skinnedMesh) skinnedMesh = child; });

        // Dodaj mixer albo idziemy na latwizne i nie dziala plynnie
    this.mixer = new THREE.AnimationMixer(skinnedMesh || model);
    const anims = characterData.animations;

        // rejestrujemy co potrafi odpalic
    for (const [name, clip] of Object.entries(anims)) {
      const action = this.mixer.clipAction(clip);
      this.actions[name] = action;
    }

        // Locomotion blend, czyli nie ma od razu sprintu z miejsca
    this._setupLocomotionBlend();
  }

  _buildFallback() {
        // Prowizoryczny kwadraciak jezeli modele nie dotarły
    const mat = new THREE.MeshStandardMaterial({ color: 0x00A3E0, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), mat);
    body.position.y = 0.9;
    body.castShadow = true;
    this.group.add(body);
    this._fallbackBody = body;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf6c8a0, roughness: 0.75 })
    );
    head.position.y = 2.0;
    head.castShadow = true;
    this.group.add(head);
    this._fallbackHead = head;
  }

  _setupLocomotionBlend() {
    const idle = this.actions['idle'];
    const walk = this.actions['walk'];
    const run  = this.actions['run'];
    if (idle) { idle.reset(); idle.setEffectiveWeight(1); idle.play(); }
    if (walk) { walk.reset(); walk.setEffectiveWeight(0); walk.play(); }
    if (run)  { run.reset();  run.setEffectiveWeight(0);  run.play();  }
    this._blendFraction = 0;
  }

    // waga 0=stoi 0.5=lazi 1=biegnie
  _setLocomotionBlend(fraction) {
    const idle = this.actions['idle'];
    const walk = this.actions['walk'];
    const run  = this.actions['run'];

    if (walk) {
      if (fraction <= 0.5) {
        const t = fraction * 2;
        if (idle) idle.setEffectiveWeight(1 - t);
        walk.setEffectiveWeight(t);
        if (run)  run.setEffectiveWeight(0);
        walk.setEffectiveTimeScale(0.8 + t * 0.4);
      } else {
        const t = (fraction - 0.5) * 2;
        if (idle) idle.setEffectiveWeight(0);
        walk.setEffectiveWeight(1 - t);
        if (run)  run.setEffectiveWeight(t);
        if (run)  run.setEffectiveTimeScale(0.9 + t * 0.5);
      }
    } else {
            // blend tylko idle i run (chodzenia zapomnialem wgrac)
      if (idle) idle.setEffectiveWeight(1 - fraction);
      if (run) {
        run.setEffectiveWeight(fraction);
        run.setEffectiveTimeScale(0.55 + fraction * 0.75);
      }
    }
  }

  _playAction(name) {
    if (!this.mixer || !this.actions[name]) return;
    if (this._currentAction === name) return;
    const prev = this.actions[this._currentAction];
    const next = this.actions[name];
    if (prev) prev.fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    this._currentAction = name;
  }

  setupInput(canvas) {
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.devMode = !this.devMode;
        return;
      }
      this.keys[e.code] = true;
      if (e.code === 'KeyP') {
        if (this.phoneState === 'expanded') {
          this.setPhoneState('hidden');
        } else {
          this.setPhoneState('expanded');
        }
      }
      if (e.code === 'KeyO') {
        if (this.phoneState === 'expanded' || this.phoneState === 'peeking') {
          this.setPhoneState('hidden');
        }
      }
      if (e.code === 'KeyV') {
        this.toggleCamera(canvas);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        return;
      }
      this.keys[e.code] = false;
    });

    this.mouseDown = false;
    canvas.addEventListener('mousedown', () => { this.mouseDown = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      const isPointerLocked = document.pointerLockElement === canvas;
      if (this.cameraMode === 'firstperson') {
        if (isPointerLocked || this.mouseDown) {
          this.cameraYaw -= e.movementX * 0.003;
          this.cameraPitchFPP = Math.max(-0.9, Math.min(0.9, this.cameraPitchFPP - e.movementY * 0.003));
        }
      } else {
        if (this.mouseDown) {
          this.cameraYaw -= e.movementX * 0.005;
          this.cameraPitch = Math.max(0.2, Math.min(1.2, this.cameraPitch - e.movementY * 0.003));
        }
      }
    });
    canvas.addEventListener('wheel', (e) => {
      if (this.cameraMode !== 'firstperson') {
        this.cameraDistance = Math.max(6, Math.min(22, this.cameraDistance + e.deltaY * 0.01));
      }
      e.preventDefault();
    }, { passive: false });

    // Request pointer lock again on click if in FPP
    canvas.addEventListener('click', () => {
      if (this.cameraMode === 'firstperson' && !this.isTouch) {
        const isMenuOpen = !document.getElementById('menu').classList.contains('hidden') ||
                           !document.getElementById('pause').classList.contains('hidden') ||
                           !document.getElementById('settings').classList.contains('hidden') ||
                           !document.getElementById('tutorial').classList.contains('hidden') ||
                           !document.getElementById('results').classList.contains('hidden');
        if (!isMenuOpen) {
          canvas.requestPointerLock();
        }
      }
    });

    // Obsługa kliknięcia przycisku wyłączenia telefonu w nakładce
    const phoneCloseBtn = document.getElementById('phoneCloseBtn');
    if (phoneCloseBtn) {
      phoneCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setPhoneState('hidden');
      });
    }

    // Obsługa szybkiego wyłączenia telefonu w bannerze powiadomienia (z stopPropagation)
    const phoneQuickCloseBtn = document.getElementById('phoneQuickCloseBtn');
    if (phoneQuickCloseBtn) {
      phoneQuickCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Zapobiega rozwinięciu telefonu przy kliknięciu "SCHOWAJ"
        this.setPhoneState('hidden');
      });
    }

    // Kliknięcie w wystający telefon rozwija go do góry
    const phoneContainer = document.querySelector('.phone-container');
    if (phoneContainer) {
      phoneContainer.addEventListener('click', (e) => {
        if (this.phoneState === 'peeking') {
          e.stopPropagation();
          this.setPhoneState('expanded');
        }
      });
    }

    this.setupTouch(canvas);
  }

  _menuOpen() {
    return !document.getElementById('menu').classList.contains('hidden') ||
           !document.getElementById('pause').classList.contains('hidden') ||
           !document.getElementById('settings').classList.contains('hidden') ||
           !document.getElementById('tutorial').classList.contains('hidden') ||
           !document.getElementById('results').classList.contains('hidden');
  }

  toggleCamera(canvas) {
    if (this._menuOpen()) return;

    this.cameraMode = this.cameraMode === 'thirdperson' ? 'firstperson' : 'thirdperson';
    const isFPP = this.cameraMode === 'firstperson';

    // Widoczność modelu
    if (this._model) this._model.visible = !isFPP;
    if (this._fallbackBody) this._fallbackBody.visible = !isFPP;
    if (this._fallbackHead) this._fallbackHead.visible = !isFPP;

    // Tekst HUD
    const cameraTextEl = document.getElementById('hudCameraText');
    if (cameraTextEl) cameraTextEl.textContent = isFPP ? 'FPP [V]' : 'TPP [V]';

    // Przycisk dotykowy
    const btnCam = document.getElementById('btnCam');
    if (btnCam) btnCam.textContent = isFPP ? 'TPP' : 'FPP';

    // Pointer Lock tylko na desktopie (na dotyku kamerą sterujemy palcem)
    if (!this.isTouch) {
      if (isFPP) canvas.requestPointerLock();
      else if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  }

  setPhoneState(state) {
    this.phoneState = state; // 'hidden' | 'peeking' | 'expanded'
    
    const overlay = document.getElementById('phoneOverlay');
    const btnPhone = document.getElementById('btnPhone');
    const banner = document.getElementById('phoneNotificationBanner');
    
    if (overlay) {
      // Wyczyszczenie oczekującego timera ukrywania
      if (this._phoneHideTimeout) {
        clearTimeout(this._phoneHideTimeout);
        this._phoneHideTimeout = null;
      }
      
      // Jeśli pokazujemy telefon, usuwamy klasę display: none ('hidden') natychmiast
      if (state !== 'hidden') {
        overlay.classList.remove('hidden');
      }
      
      overlay.classList.remove('state-hidden', 'state-peeking', 'state-expanded');
      
      if (state === 'hidden') {
        overlay.classList.add('state-hidden');
        this.onPhone = false;
        if (btnPhone) btnPhone.classList.remove('active');
        if (banner) banner.classList.remove('active');
        
        // Czekamy na animację wysunięcia w dół (0.4s) zanim dodamy display: none (hidden)
        this._phoneHideTimeout = setTimeout(() => {
          if (this.phoneState === 'hidden') {
            overlay.classList.add('hidden');
          }
          this._phoneHideTimeout = null;
        }, 400);
      } else if (state === 'peeking') {
        overlay.classList.add('state-peeking');
        this.onPhone = false;
        if (btnPhone) btnPhone.classList.remove('active');
        if (banner) banner.classList.add('active');
      } else if (state === 'expanded') {
        overlay.classList.add('state-expanded');
        this.onPhone = true;
        if (btnPhone) btnPhone.classList.add('active');
        if (banner) banner.classList.remove('active');
      }
    }
  }

  togglePhone() {
    if (this.phoneState === 'expanded') {
      this.setPhoneState('hidden');
    } else {
      this.setPhoneState('expanded');
    }
  }

  setupTouch(canvas) {
    // Pokazujemy sterowanie dotykowe TYLKO na urządzeniach z dotykiem jako głównym
    // sterowaniem (telefony/tablety). Laptopy z myszką - nawet z ekranem dotykowym -
    // mają wskaźnik "fine", więc gamepad się tam nie pojawi.
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isTouch = hasTouch && coarsePointer;
    if (!isTouch) return;
    this.isTouch = true;

    // Analogowy wektor ruchu z joysticka (-1..1) i flaga biegu
    this.touchMove = { x: 0, z: 0 };
    this.touchRun = false;

    const controls = document.getElementById('mobileControls');
    if (controls) controls.classList.remove('hidden');

    // --- Wirtualny joystick (lewy dolny róg) ---
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystickKnob');
    if (joy && knob) {
      let joyId = null;
      let maxR = 46; // promień wychylenia gałki w px (fallback)

      const updateMaxR = () => {
        if (joy.clientWidth && knob.clientWidth) {
          maxR = (joy.clientWidth - knob.clientWidth) / 2 + 6;
        }
      };

      const setKnob = (dx, dz) => { knob.style.transform = `translate(${dx}px, ${dz}px)`; };
      const resetJoy = () => {
        joyId = null;
        this.touchMove.x = 0;
        this.touchMove.z = 0;
        setKnob(0, 0);
      };
      const handle = (t, rect) => {
        let dx = t.clientX - (rect.left + rect.width / 2);
        let dz = t.clientY - (rect.top + rect.height / 2);
        const dist = Math.hypot(dx, dz);
        if (dist > maxR) { dx = dx / dist * maxR; dz = dz / dist * maxR; }
        setKnob(dx, dz);
        this.touchMove.x = dx / maxR;
        this.touchMove.z = dz / maxR;
      };

      joy.addEventListener('touchstart', (e) => {
        e.preventDefault();
        updateMaxR();
        const t = e.changedTouches[0];
        joyId = t.identifier;
        handle(t, joy.getBoundingClientRect());
      }, { passive: false });
      joy.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = joy.getBoundingClientRect();
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) handle(t, rect);
        }
      }, { passive: false });
      const onJoyEnd = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) { resetJoy(); break; }
        }
      };
      joy.addEventListener('touchend', onJoyEnd);
      joy.addEventListener('touchcancel', onJoyEnd);
    }

    // --- Sterowanie kamerą: przeciąganie palcem po canvasie ---
    let camId = null, lastX = 0, lastY = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (this._menuOpen()) return;
      const t = e.changedTouches[0];
      camId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== camId) continue;
        const mx = t.clientX - lastX;
        const my = t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
        if (this.cameraMode === 'firstperson') {
          this.cameraYaw -= mx * 0.005;
          this.cameraPitchFPP = Math.max(-0.9, Math.min(0.9, this.cameraPitchFPP - my * 0.005));
        } else {
          this.cameraYaw -= mx * 0.008;
          this.cameraPitch = Math.max(0.2, Math.min(1.2, this.cameraPitch - my * 0.005));
        }
      }
    }, { passive: true });
    const onCamEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === camId) { camId = null; break; }
      }
    };
    canvas.addEventListener('touchend', onCamEnd, { passive: true });
    canvas.addEventListener('touchcancel', onCamEnd, { passive: true });

    // --- Przyciski akcji ---
    const btnRun = document.getElementById('btnRun');
    if (btnRun) {
      const press = (e) => { e.preventDefault(); this.touchRun = true; btnRun.classList.add('active'); };
      const release = (e) => { e.preventDefault(); this.touchRun = false; btnRun.classList.remove('active'); };
      btnRun.addEventListener('touchstart', press, { passive: false });
      btnRun.addEventListener('touchend', release, { passive: false });
      btnRun.addEventListener('touchcancel', release, { passive: false });
    }

    const btnPhone = document.getElementById('btnPhone');
    if (btnPhone) {
      btnPhone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this._menuOpen()) return;
        this.togglePhone();
      }, { passive: false });
    }

    const btnCam = document.getElementById('btnCam');
    if (btnCam) {
      btnCam.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.toggleCamera(canvas);
      }, { passive: false });
    }
  }

  update(dt, city, traffic) {
    if (this.isDead) {
      if (this.cameraMode === 'firstperson') {
        this.cameraMode = 'thirdperson';
        if (this._model) this._model.visible = true;
        if (this._fallbackBody) this._fallbackBody.visible = true;
        if (this._fallbackHead) this._fallbackHead.visible = true;
        const cameraTextEl = document.getElementById('hudCameraText');
        if (cameraTextEl) {
          cameraTextEl.textContent = 'TPP [V]';
        }
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
      const deathSpeedup = 2.5;
      const simDt = dt * deathSpeedup;
      this.deathTime += simDt;
      const t = Math.min(1.0, this.deathTime / 0.85);
      
      if (this.deathVelocity) {
        const gravity = 15.0; // Siła grawitacji w grze
        this.deathVelocity.y -= gravity * simDt;
        
        const nextX = this.pos.x + this.deathVelocity.x * simDt;
        const nextZ = this.pos.z + this.deathVelocity.z * simDt;
        const nextY = this.pos.y + this.deathVelocity.y * simDt;
        
        // Kolizja pozioma z budynkami, żeby nie wpaść w ściany pod mapę podczas lotu
        if (!city.collidesBuilding(nextX, this.pos.z)) {
          this.pos.x = nextX;
        } else {
          this.deathVelocity.x *= -0.2; // Lekkie odbicie od ściany
        }
        if (!city.collidesBuilding(this.pos.x, nextZ)) {
          this.pos.z = nextZ;
        } else {
          this.deathVelocity.z *= -0.2; // Lekkie odbicie od ściany
        }
        
        // Pionowa granica podłoża (y = 0)
        if (nextY <= 0) {
          this.pos.y = 0;
          if (this.deathVelocity.y < -2.2) {
            // Odbicie od asfaltu
            this.deathVelocity.y = -this.deathVelocity.y * 0.35;
            this.deathVelocity.x *= 0.65;
            this.deathVelocity.z *= 0.65;
          } else {
            this.deathVelocity.y = 0;
            // Tarcie o podłoże po wylądowaniu (stopniowe zatrzymanie)
            this.deathVelocity.x *= Math.max(0, 1 - simDt * 5.0);
            this.deathVelocity.z *= Math.max(0, 1 - simDt * 5.0);
          }
        } else {
          this.pos.y = nextY;
        }
      }
      
      this.group.position.x = this.pos.x;
      this.group.position.z = this.pos.z;
      
      // Animacja obrotu / koziołkowania
      const spinZ = this.deathSpinZ !== null ? this.deathSpinZ : -Math.PI / 2;
      const spinX = this.deathSpinX || 0;
      const spinY = this.deathSpinY || 0;
 
      if (this.pos.y > 0.05) {
        // Koziołkowanie / latanie w powietrzu (dynamiczne kierunki spinów)
        this.group.rotation.z = spinZ * t;
        this.group.rotation.x = this.deathTime * spinX;
        this.group.rotation.y = this.facing + this.deathTime * spinY;
        this.group.position.y = this.pos.y;
      } else {
        // Wyrównanie do leżenia płasko po wylądowaniu na ziemi
        this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, spinZ, simDt * 12.0);
        this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, simDt * 12.0);
        this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, this.facing + (spinY > 0 ? Math.PI : -Math.PI), simDt * 6.0);
        this.group.position.y = this.pos.y + 0.3; // Wysokość 0.3 zapobiega wpadaniu ciała pod ziemię
      }
      
      if (this._softShadow) {
        // Cień oddala się i znika, gdy gracz leci w górę
        const heightFactor = Math.max(0, 1 - this.pos.y / 6.0);
        this._softShadow.material.opacity = 0.22 * (1 - t) * heightFactor;
        this._softShadow.position.y = -this.pos.y + 0.02; // Utrzymujemy cień na ziemi
      }
      this.moving = false;
      return;
    }

    if (!this.keys) return;
    const running = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchRun;
    const stopping = this.keys['Space'];
    const fastDev = this.devMode && this.keys['KeyC'];
    const speed = stopping ? 0 : (fastDev ? 50.0 : (running ? this.runSpeed : this.walkSpeed) * (this.onPhone ? 0.70 : 1));

    let dx = 0, dz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
    // Analogowy joystick dotykowy (zachowuje wychylenie = prędkość)
    if (this.touchMove && (this.touchMove.x || this.touchMove.z)) {
      dx += this.touchMove.x;
      dz += this.touchMove.z;
    }
    const len = Math.hypot(dx, dz);
    // Normalizujemy tylko gdy przekroczono 1 (klawiatura/diagonale), analog <1 zostawiamy
    if (len > 1) { dx /= len; dz /= len; }

    const sy = Math.sin(this.cameraYaw);
    const cy = Math.cos(this.cameraYaw);
    const fwdX = -sy, fwdZ = -cy;
    const rgtX = cy, rgtZ = -sy;
    const wx = (-dz) * fwdX + dx * rgtX;
    const wz = (-dz) * fwdZ + dx * rgtZ;

    const mvX = wx * speed * dt;
    const mvZ = wz * speed * dt;
    const newX = this.pos.x + mvX;
    const newZ = this.pos.z + mvZ;

    const collidesVehicle = (x, z) => !fastDev && traffic && (() => {
      const hit = traffic.vehicleHitting({ x, z }, true);
      return hit && hit.speed < 0.1;
    })();
    if (fastDev || (!city.collidesBuilding(newX, this.pos.z) && !collidesVehicle(newX, this.pos.z))) this.pos.x = newX;
    if (fastDev || (!city.collidesBuilding(this.pos.x, newZ) && !collidesVehicle(this.pos.x, newZ))) this.pos.z = newZ;

    const b = city.bounds;
    this.pos.x = Math.max(b.minX - 4, Math.min(b.maxX + 4, this.pos.x));
    this.pos.z = Math.max(b.minZ - 4, Math.min(b.maxZ + 4, this.pos.z));

    if (this.cameraMode === 'firstperson') {
      this.facing = this.cameraYaw + Math.PI;
    } else {
      if (len > 0) {
        const target = Math.atan2(wx, wz);
        this.facing = interpolateAngle(this.facing, target, Math.min(1, dt * 12));
      }
    }

    this.moving = len > 0 && speed > 0;

    // Obliczanie head bobbingu w FPP
    if (this.cameraMode === 'firstperson') {
      const bobAmountY = running ? 0.18 : 0.08;
      const bobAmountX = running ? 0.09 : 0.04;
      
      if (this.moving) {
        const bobSpeed = running ? 15 : 10;
        this.bobTime = (this.bobTime || 0) + dt * bobSpeed;
        this.targetBobY = Math.sin(this.bobTime) * bobAmountY;
        this.targetBobX = Math.sin(this.bobTime * 0.5) * bobAmountX;
      } else {
        this.targetBobY = 0;
        this.targetBobX = 0;
        this.bobTime = 0;
      }
      
      // Interpolacja
      this.bobY = THREE.MathUtils.lerp(this.bobY || 0, this.targetBobY, Math.min(1, dt * 8));
      this.bobX = THREE.MathUtils.lerp(this.bobX || 0, this.targetBobX, Math.min(1, dt * 8));
    } else {
      this.bobY = 0;
      this.bobX = 0;
      this.bobTime = 0;
    }

        // przelicznik szybkosci animacji na bazie predkosci wektora poruszania
    if (this.mixer) {
      const targetFraction = !this.moving ? 0 : running ? 1.0 : 0.5;
      this._blendFraction = THREE.MathUtils.lerp(this._blendFraction, targetFraction, Math.min(1, dt * 7));
      this._setLocomotionBlend(this._blendFraction);
      this.mixer.update(dt);
    }

    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.rotation.y = this.facing;
  }

  updateCamera(camera) {
    if (this.isDead) {
      // Filmowa kamera po śmierci (zbliżenie, niski kąt, rotacja wokół postaci)
      const t = Math.min(1.0, this.deathTime / 0.85);
      
      // Dynamiczne przybliżenie kamery (od domyślnej odległości do bliskich 2.6 jednostek)
      const r = THREE.MathUtils.lerp(this.cameraDistance, 2.6, t);
      
      // Obniżenie kąta patrzenia (patrzy bardziej z poziomu drogi na leżącą postać)
      const pitch = THREE.MathUtils.lerp(this.cameraPitch, 0.22, t);
      
      // Powolna rotacja kamery wokół postaci dla dramatyzmu
      const yaw = this.cameraYaw + t * 1.6;
      
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      
      const x = this.pos.x + Math.sin(yaw) * r * cp;
      const z = this.pos.z + Math.cos(yaw) * r * cp;
      const y = this.pos.y + 0.3 + r * sp; // kamera podąża za wysokością postaci (lot/odbicie)
      
      camera.position.set(x, y, z);
      
      // Cel celownika kamery (śledzi 3D pozycję gracza z lekkim przesunięciem)
      camera.lookAt(this.pos.x, this.pos.y + 0.25, this.pos.z);
      return;
    }

    if (this.cameraMode === 'firstperson') {
      // Obliczanie kierunku kołysania na boki (prostopadle do kierunku patrzenia)
      const sy = Math.sin(this.cameraYaw);
      const cy = Math.cos(this.cameraYaw);
      
      const bx = this.bobX || 0;
      const by = this.bobY || 0;
      
      const swayX = cy * bx;
      const swayZ = -sy * bx;
      
      // Position the camera at the head level (y = 1.65) with bobbing offsets
      camera.position.set(this.pos.x + swayX, 1.65 + by, this.pos.z + swayZ);
      
      const cp = Math.cos(this.cameraPitchFPP);
      const sp = Math.sin(this.cameraPitchFPP);
      
      const targetX = this.pos.x + swayX - Math.sin(this.cameraYaw) * cp;
      const targetY = 1.65 + by + sp;
      const targetZ = this.pos.z + swayZ - Math.cos(this.cameraYaw) * cp;
      
      camera.lookAt(targetX, targetY, targetZ);
    } else {
      const r = this.cameraDistance;
      const cp = Math.cos(this.cameraPitch);
      const sp = Math.sin(this.cameraPitch);
      const x = this.pos.x + Math.sin(this.cameraYaw) * r * cp;
      const z = this.pos.z + Math.cos(this.cameraYaw) * r * cp;
      const y = 1.5 + r * sp;
      camera.position.set(x, y, z);
      camera.lookAt(this.pos.x, 1.2, this.pos.z);
    }
  }
}
