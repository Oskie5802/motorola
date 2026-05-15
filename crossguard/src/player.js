// === Player: Alex Nawigant – Kenney animated character model ===
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODEL_SCALE = 0.006; // Kenney FBX units → game world scale (fits building door height)

export class Player {
  constructor(scene, startPos, characterData) {
    this.scene = scene;
    this.group = new THREE.Group();

    // --- Animation state ---
    this.mixer = null;
    this.actions = {};
    this._currentAction = null;

    // --- Build character from loaded FBX data ---
    if (characterData && characterData.model) {
      this._buildFromModel(characterData);
    } else {
      this._buildFallback();
    }

    // Cień miękki pod stopami (decal)
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

    this.walkSpeed = 4.0;
    this.runSpeed = 7.5;
    this.stopped = false;

    this.onPhone = false;
    this.lastCrossingId = null;
  }

  _buildFromModel(characterData) {
    // SkeletonUtils.clone properly handles SkinnedMesh + Skeleton bindings
    const model = SkeletonUtils.clone(characterData.model);
    model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

    // Re-apply skin material after clone (clone may lose custom materials)
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

    // Setup AnimationMixer
    this.mixer = new THREE.AnimationMixer(model);
    const anims = characterData.animations;

    // Register available animation clips
    for (const [name, clip] of Object.entries(anims)) {
      const action = this.mixer.clipAction(clip);
      this.actions[name] = action;

      if (name === 'run') {
        action.timeScale = 1.2;
      }
    }

    // Start with idle
    this._playAction('idle');
  }

  _buildFallback() {
    // Simple box placeholder if model fails to load
    const mat = new THREE.MeshStandardMaterial({ color: 0x00A3E0, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), mat);
    body.position.y = 0.9;
    body.castShadow = true;
    this.group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf6c8a0, roughness: 0.75 })
    );
    head.position.y = 2.0;
    head.castShadow = true;
    this.group.add(head);
  }

  _playAction(name) {
    if (!this.mixer || !this.actions[name]) return;
    if (this._currentAction === name) return;

    const prev = this.actions[this._currentAction];
    const next = this.actions[name];

    if (prev) {
      prev.fadeOut(0.25);
    }
    next.reset().fadeIn(0.25).play();
    this._currentAction = name;
  }

  setupInput(canvas) {
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyP') {
        this.onPhone = !this.onPhone;
        document.getElementById('phoneOverlay').classList.toggle('hidden', !this.onPhone);
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.mouseDown = false;
    canvas.addEventListener('mousedown', () => { this.mouseDown = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseDown) return;
      this.cameraYaw -= e.movementX * 0.005;
      this.cameraPitch = Math.max(0.2, Math.min(1.2, this.cameraPitch - e.movementY * 0.003));
    });
    canvas.addEventListener('wheel', (e) => {
      this.cameraDistance = Math.max(6, Math.min(22, this.cameraDistance + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });
  }

  update(dt, city, traffic) {
    if (!this.keys) return;
    const running = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const stopping = this.keys['Space'];
    const speed = stopping ? 0 : (running ? this.runSpeed : this.walkSpeed) * (this.onPhone ? 0.85 : 1);

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

    const collidesVehicle = (x, z) => traffic && !!traffic.vehicleHitting({ x, z });
    if (!city.collidesBuilding(newX, this.pos.z) && !collidesVehicle(newX, this.pos.z)) this.pos.x = newX;
    if (!city.collidesBuilding(this.pos.x, newZ) && !collidesVehicle(this.pos.x, newZ)) this.pos.z = newZ;

    const b = city.bounds;
    this.pos.x = Math.max(b.min - 4, Math.min(b.max + 4, this.pos.x));
    this.pos.z = Math.max(b.min - 4, Math.min(b.max + 4, this.pos.z));

    if (len > 0) {
      const target = Math.atan2(wx, wz);
      let diff = target - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * 12);
    }

    this.moving = len > 0 && speed > 0;

    // Animation state machine
    if (this.mixer) {
      if (this.moving && running) {
        this._playAction('run');
        if (this.actions['run']) this.actions['run'].timeScale = 1.4;
      } else if (this.moving) {
        this._playAction('run');
        if (this.actions['run']) this.actions['run'].timeScale = 0.85;
      } else {
        this._playAction('idle');
      }
      this.mixer.update(dt);
    }

    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.rotation.y = this.facing;
  }

  updateCamera(camera) {
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
