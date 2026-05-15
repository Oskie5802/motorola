// === Player: Alex Nawigant, stylizowana postać o lepszych proporcjach ===
import * as THREE from 'three';

// Helper: lekko zaokrąglone "pudełko" jako wycięta sfera w skali, daje miły shading bez kosztu rzeczywistej geometrii skróconej.
function softBox(w, h, d, mat) {
  const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Player {
  constructor(scene, startPos) {
    this.scene = scene;
    this.group = new THREE.Group();

    // Materials (PBR - ładny shading)
    const skin   = new THREE.MeshStandardMaterial({ color: 0xf6c8a0, roughness: 0.75, metalness: 0.0 });
    const hair   = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.55, metalness: 0.0 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x00A3E0, roughness: 0.55, metalness: 0.0 });
    const jacketDark = new THREE.MeshStandardMaterial({ color: 0x003DA5, roughness: 0.5, metalness: 0.0 });
    const pants  = new THREE.MeshStandardMaterial({ color: 0x1a2540, roughness: 0.85, metalness: 0.0 });
    const shoes  = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6,  metalness: 0.05 });
    const cuff   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5,  metalness: 0.0 });

    // === Tors (kurtka z paskiem i akcentem) ===
    const torso = softBox(0.62, 0.92, 0.34, jacket);
    torso.position.y = 1.10;
    this.group.add(torso);

    // Akcent na klatce (Motorola batch)
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.18, 0.02),
      jacketDark
    );
    chest.position.set(0, 1.20, 0.18);
    this.group.add(chest);
    const logo = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb800, emissive: 0xffb800, emissiveIntensity: 0.6 })
    );
    logo.position.set(-0.18, 1.22, 0.19);
    this.group.add(logo);

    // Biodro / pasek
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.07, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x0a0f1c, roughness: 0.7 })
    );
    belt.position.y = 0.65;
    this.group.add(belt);

    // === Szyja ===
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.11, 0.16, 12),
      skin
    );
    neck.position.y = 1.62;
    this.group.add(neck);

    // === Głowa - lekko owalna ===
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 18, 14), skin);
    head.scale.set(1.0, 1.08, 0.95);
    head.position.y = 1.82;
    head.castShadow = true;
    this.group.add(head);
    this.head = head;

    // Włosy (półsfera)
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2.1),
      hair
    );
    hairTop.position.y = 1.86;
    hairTop.scale.set(1.02, 1.0, 1.02);
    this.group.add(hairTop);

    // Oczy
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.3 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeMat);
    eyeL.position.set(-0.08, 1.85, 0.21);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.08;
    this.group.add(eyeL, eyeR);

    // Uszy
    const earL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
    earL.position.set(-0.22, 1.82, 0);
    earL.scale.set(0.6, 1.2, 0.4);
    const earR = earL.clone(); earR.position.x = 0.22;
    this.group.add(earL, earR);

    // === Ramiona (staw + ramię + przedramię + dłoń) ===
    this.armL = new THREE.Group();
    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), jacket);
    shoulderL.position.y = 0;
    this.armL.add(shoulderL);
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.32, 12), jacket);
    upperArmL.position.y = -0.18;
    upperArmL.castShadow = true;
    this.armL.add(upperArmL);
    const elbowL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), jacket);
    elbowL.position.y = -0.36;
    this.armL.add(elbowL);
    const cuffL = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.04, 12), cuff);
    cuffL.position.y = -0.38;
    this.armL.add(cuffL);
    const forearmL = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.075, 0.30, 12), skin);
    forearmL.position.y = -0.54;
    this.armL.add(forearmL);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), skin);
    handL.position.y = -0.74;
    handL.scale.set(0.9, 1.05, 0.75);
    this.armL.add(handL);
    this.armL.position.set(-0.36, 1.50, 0);
    this.group.add(this.armL);

    this.armR = this.armL.clone(true);
    this.armR.position.x = 0.36;
    this.group.add(this.armR);

    // === Nogi (udo + kolano + łydka + but) ===
    this.legL = new THREE.Group();
    const thighL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.5, 12), pants);
    thighL.position.y = -0.25;
    thighL.castShadow = true;
    this.legL.add(thighL);
    const kneeL = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), pants);
    kneeL.position.y = -0.5;
    this.legL.add(kneeL);
    const shinL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.42, 12), pants);
    shinL.position.y = -0.72;
    this.legL.add(shinL);
    // But z noskiem
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.34), shoes);
    shoeL.position.set(0, -0.97, 0.05);
    shoeL.castShadow = true;
    this.legL.add(shoeL);
    const toeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), shoes);
    toeL.position.set(0, -0.97, 0.20);
    toeL.scale.set(0.85, 0.55, 0.9);
    this.legL.add(toeL);
    this.legL.position.set(-0.16, 0.62, 0);
    this.group.add(this.legL);

    this.legR = this.legL.clone(true);
    this.legR.position.x = 0.16;
    this.group.add(this.legR);

    // === Plecak ===
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.7, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x0a223f, roughness: 0.7 })
    );
    back.position.set(0, 1.15, -0.22);
    back.castShadow = true;
    this.group.add(back);
    const backStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.08, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xffb800, emissive: 0xffb800, emissiveIntensity: 0.25 })
    );
    backStrap.position.set(0, 1.25, -0.09);
    this.group.add(backStrap);

    // Cień miękki pod stopami (decal)
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 24),
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

  update(dt, city) {
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
    const rgtX =  cy, rgtZ = -sy;
    const wx = (-dz) * fwdX + dx * rgtX;
    const wz = (-dz) * fwdZ + dx * rgtZ;

    const mvX = wx * speed * dt;
    const mvZ = wz * speed * dt;
    const newX = this.pos.x + mvX;
    const newZ = this.pos.z + mvZ;

    if (!city.collidesBuilding(newX, this.pos.z)) this.pos.x = newX;
    if (!city.collidesBuilding(this.pos.x, newZ)) this.pos.z = newZ;

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
    if (this.moving) {
      this.walkPhase += dt * (running ? 12 : 8);
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.armL.rotation.x = swing;
      this.armR.rotation.x = -swing;
      this.legL.rotation.x = -swing * 0.85;
      this.legR.rotation.x = swing * 0.85;
      // delikatne bujanie torsem
      this.group.position.y = Math.abs(Math.sin(this.walkPhase * 2)) * 0.05;
    } else {
      this.armL.rotation.x *= 0.85;
      this.armR.rotation.x *= 0.85;
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
      this.group.position.y *= 0.85;
    }
    if (this.onPhone) {
      this.armR.rotation.x = -1.3;
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
