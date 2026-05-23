// Gracz = Alex
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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
    this.cameraMode = 'firstperson'; // 'thirdperson' | 'firstperson'
    this.cameraPitchFPP = 0.0;

    this.walkSpeed = 4.0;
    this.runSpeed = 7.5;
    this.stopped = false;

    this.onPhone = false;
    this.lastCrossingId = null;
    this.devMode = false;
    this.isDead = false;
    this.deathTime = 0;

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
        this.onPhone = !this.onPhone;
        document.getElementById('phoneOverlay').classList.toggle('hidden', !this.onPhone);
      }
      if (e.code === 'KeyV') {
        const isMenuOpen = !document.getElementById('menu').classList.contains('hidden') || 
                           !document.getElementById('pause').classList.contains('hidden') || 
                           !document.getElementById('settings').classList.contains('hidden') || 
                           !document.getElementById('tutorial').classList.contains('hidden') || 
                           !document.getElementById('results').classList.contains('hidden');
        if (isMenuOpen) return;

        this.cameraMode = this.cameraMode === 'thirdperson' ? 'firstperson' : 'thirdperson';
        const isFPP = this.cameraMode === 'firstperson';

        // Update model visibility
        if (this._model) this._model.visible = !isFPP;
        if (this._fallbackBody) this._fallbackBody.visible = !isFPP;
        if (this._fallbackHead) this._fallbackHead.visible = !isFPP;

        // Update HUD text
        const cameraTextEl = document.getElementById('hudCameraText');
        if (cameraTextEl) {
          cameraTextEl.textContent = isFPP ? 'FPP [V]' : 'TPP [V]';
        }

        // Handle Pointer Lock
        if (isFPP) {
          canvas.requestPointerLock();
        } else {
          if (document.pointerLockElement === canvas) {
            document.exitPointerLock();
          }
        }
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
      if (this.cameraMode === 'firstperson') {
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
      this.deathTime += dt;
      const t = Math.min(1.0, this.deathTime / 0.8);
      
      this.group.position.x = this.pos.x;
      this.group.position.z = this.pos.z;
      
      // Animacja upadku procedurowego
      this.group.rotation.z = -Math.PI / 2 * t;
      this.group.rotation.x = Math.PI / 6 * t;
      this.group.rotation.y = this.facing + t * Math.PI;
      this.group.position.y = Math.sin(t * Math.PI) * 0.8;
      
      if (this._softShadow) {
        this._softShadow.material.opacity = 0.22 * (1 - t);
      }
      this.moving = false;
      return;
    }

    if (!this.keys) return;
    const running = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const stopping = this.keys['Space'];
    const fastDev = this.devMode && this.keys['KeyC'];
    const speed = stopping ? 0 : (fastDev ? 50.0 : (running ? this.runSpeed : this.walkSpeed) * (this.onPhone ? 0.85 : 1));

    let dx = 0, dz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

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

    const collidesVehicle = (x, z) => !fastDev && traffic && !!traffic.vehicleHitting({ x, z });
    if (fastDev || (!city.collidesBuilding(newX, this.pos.z) && !collidesVehicle(newX, this.pos.z))) this.pos.x = newX;
    if (fastDev || (!city.collidesBuilding(this.pos.x, newZ) && !collidesVehicle(this.pos.x, newZ))) this.pos.z = newZ;

    const b = city.bounds;
    this.pos.x = Math.max(b.min - 4, Math.min(b.max + 4, this.pos.x));
    this.pos.z = Math.max(b.min - 4, Math.min(b.max + 4, this.pos.z));

    if (this.cameraMode === 'firstperson') {
      this.facing = this.cameraYaw + Math.PI;
    } else {
      if (len > 0) {
        const target = Math.atan2(wx, wz);
        let diff = target - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * Math.min(1, dt * 12);
      }
    }

    this.moving = len > 0 && speed > 0;

    // Obliczanie head bobbingu w FPP
    if (this.cameraMode === 'firstperson') {
      const bobAmountY = running ? 0.08 : 0.04;
      const bobAmountX = running ? 0.04 : 0.02;
      
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
