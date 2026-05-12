// === Player: Alex Nawigant, low-poly stickman, WASD + Shift + Space + mouse look ===
import * as THREE from 'three';

export class Player {
  constructor(scene, startPos) {
    this.scene = scene;
    this.group = new THREE.Group();

    // Body parts: simple low-poly
    const skin = new THREE.MeshLambertMaterial({ color: 0xfcd5a0 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x00A3E0 }); // Motorola cyan
    const pants = new THREE.MeshLambertMaterial({ color: 0x1a2540 });
    const shoes = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.3), shirt);
    torso.position.y = 1.05;
    torso.castShadow = true;
    this.group.add(torso);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.7;
    head.castShadow = true;
    this.group.add(head);
    // Cap (Motorola dark blue)
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.12, 12),
      new THREE.MeshLambertMaterial({ color: 0x003DA5 })
    );
    cap.position.y = 1.85;
    this.group.add(cap);
    // Arms
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), shirt);
    this.armL.position.set(-0.4, 1.05, 0);
    this.armL.castShadow = true;
    this.group.add(this.armL);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.4;
    this.group.add(this.armR);
    // Legs
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.22), pants);
    this.legL.position.set(-0.17, 0.42, 0);
    this.legL.castShadow = true;
    this.group.add(this.legL);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.17;
    this.group.add(this.legR);
    // Shoes
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.35), shoes);
    shoeL.position.set(-0.17, 0.06, 0.05);
    this.group.add(shoeL);
    const shoeR = shoeL.clone();
    shoeR.position.x = 0.17;
    this.group.add(shoeR);

    this.group.position.set(startPos.x, 0, startPos.z);
    this.scene.add(this.group);

    this.pos = new THREE.Vector3(startPos.x, 0, startPos.z);
    this.vel = new THREE.Vector3();
    this.facing = 0; // radians
    this.walkPhase = 0;

    // Camera target (third-person)
    this.cameraOffset = new THREE.Vector3(0, 12, 12);
    this.cameraYaw = 0;
    this.cameraPitch = 0.55; // looking down slightly
    this.cameraDistance = 12;

    // Movement params
    this.walkSpeed = 4.0;   // u/s
    this.runSpeed = 7.5;
    this.stopped = false;

    // Status flags (for scoring)
    this.onPhone = false;
    this.lastCrossingId = null;
  }

  setupInput(canvas) {
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyP') this.onPhone = !this.onPhone;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // Mouse look (drag)
    this.mouseDown = false;
    canvas.addEventListener('mousedown', () => { this.mouseDown = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseDown) return;
      this.cameraYaw -= e.movementX * 0.005;
      this.cameraPitch = Math.max(0.2, Math.min(1.2, this.cameraPitch - e.movementY * 0.003));
    });
    // Wheel zoom
    canvas.addEventListener('wheel', (e) => {
      this.cameraDistance = Math.max(6, Math.min(22, this.cameraDistance + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });
  }

  update(dt, city) {
    if (!this.keys) return;
    const running = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const stopping = this.keys['Space'];
    const speed = stopping ? 0 : (running ? this.runSpeed : this.walkSpeed) * (this.onPhone ? 0.85 : 1);

    // Input direction (camera-relative)
    let dx = 0, dz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    // Camera-relative movement.
    // Camera sits at (sin yaw, cos yaw) * r → forward (away from camera) = (-sin yaw, -cos yaw)
    // right vector = (cos yaw, -sin yaw). W = forward, D = right.
    const sy = Math.sin(this.cameraYaw);
    const cy = Math.cos(this.cameraYaw);
    const fwdX = -sy, fwdZ = -cy;
    const rgtX =  cy, rgtZ = -sy;
    // dz = -1 means W (forward), dx = +1 means D (right)
    const wx = (-dz) * fwdX + dx * rgtX;
    const wz = (-dz) * fwdZ + dx * rgtZ;

    // Movement
    const mvX = wx * speed * dt;
    const mvZ = wz * speed * dt;
    const newX = this.pos.x + mvX;
    const newZ = this.pos.z + mvZ;

    // Collide with buildings (slide)
    if (!city.collidesBuilding(newX, this.pos.z)) this.pos.x = newX;
    if (!city.collidesBuilding(this.pos.x, newZ)) this.pos.z = newZ;

    // Clamp to bounds
    const b = city.bounds;
    this.pos.x = Math.max(b.min - 4, Math.min(b.max + 4, this.pos.x));
    this.pos.z = Math.max(b.min - 4, Math.min(b.max + 4, this.pos.z));

    // Facing
    if (len > 0) {
      const target = Math.atan2(wx, wz);
      // Lerp angle
      let diff = target - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * 12);
    }

    // Animate walk
    this.moving = len > 0 && speed > 0;
    if (this.moving) {
      this.walkPhase += dt * (running ? 12 : 8);
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.armL.rotation.x = swing;
      this.armR.rotation.x = -swing;
      this.legL.rotation.x = -swing * 0.8;
      this.legR.rotation.x = swing * 0.8;
    } else {
      this.armL.rotation.x *= 0.85;
      this.armR.rotation.x *= 0.85;
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
    }
    // Phone gesture
    if (this.onPhone) {
      this.armR.rotation.x = -1.3;
    }

    this.group.position.set(this.pos.x, 0, this.pos.z);
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
