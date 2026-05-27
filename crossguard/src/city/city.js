// === City generation: deterministyczne layouty per poziom ===
// Kazdy poziom ma recznie zaprojektowany uklad siatki,
// selektywne skrzyzowania i rozne typy blokow (budynki, parki, place).
import * as THREE from "three";
import { PALETTE } from "../core/config.js";
import { settings } from "../core/settings.js";

// Import split texture functions
import {
  _createAsphaltTexture,
  _createAsphaltBumpMap,
  _createSidewalkTexture,
  _createSidewalkBumpMap,
  _createCurbTexture,
  _createCurbBumpMap,
  _createRoadEdgeLineTexture
} from './cityTextures.js';

// Import split park/plaza functions
import { _buildPark, _buildPlaza } from './cityParks.js';

// Import split traffic signals/signage functions
import {
  _addLaneLines,
  _addZebra,
  _addTrafficLight,
  _addPedestrianLight,
  _applyPedLightVisual,
  _linkTrafficLights,
  _applyLightVisual,
  updateTrafficLights,
  _placeCameras,
  _addRoadworks,
  _addLamps,
  _createStreetLamp,
  _createSignBoard,
  _createSign,
  _createDoubleSign
} from './citySignals.js';

// Import split building functions
import {
  _buildBuildings,
  _buildBuildingsFromModels,
  _buildBuildingsSimple,
  _addBlockTrees,
  _spawnTree,
  _addStreetFurniture,
  _spawnBench,
  _addWindows,
  _buildGhostIslands
} from './cityBuildings.js';

export class City {
  static _textureCache = {};

  constructor(scene, zone, isNight, models = null) {
    this.scene = scene;
    this.zone = zone;
    this.isNight = isNight;
    this.models = models;
    this.castShadows = settings.current.shadows;
    this.receiveShadows = settings.current.shadows;

    // Layout z konfiguracji strefy
    const layout = zone.layout;
    this.layout = layout;
    this.gridSize = layout.xWidths.length;

    // Stalowe wspolrzedne siatki z layoutu (zamiast losowych)
    this.xCoords = this._layoutToCoords(layout.xWidths);
    this.zCoords = this._layoutToCoords(layout.zWidths);
    this.size = this.xCoords[this.gridSize] - this.xCoords[0];

    // Mapa sygnalizowanych skrzyzowan dla szybkiego lookupu
    this._signalSet = new Set(layout.signals.map(([i,j]) => `${i},${j}`));

    // Tracked entities
    this.crossings = [];
    this.trafficLights = [];
    this.cameras = [];
    this.intersections = [];
    this.roadSegments = [];
    this.sidewalks = [];
    this.spawnPoints = [];
    this.buildings = [];
    this.obstacles = [];
    this.tramRails = [];
    this.pedestrianLights = [];
    this.trees = [];
    this.benches = [];
    this.ghostBuildings = [];

    this._build();
  }

  // Zamienia tablice szerokosc blokow na tablice wspolrzednych, wycentrowana wokol zera
  _layoutToCoords(widths) {
    const total = widths.reduce((a, b) => a + b, 0);
    const half = total / 2;
    const coords = [-half];
    for (let i = 0; i < widths.length; i++) {
      coords.push(coords[i] + widths[i]);
    }
    coords[widths.length] = half; // pin dokladnego konca
    return coords;
  }

  cellToWorld(i, j) {
    return { x: this.xCoords[i], z: this.zCoords[j] };
  }

  _build() {
    const g = this.gridSize;
    const xs = this.xCoords;
    const zs = this.zCoords;
    const sizeX = xs[g] - xs[0];
    const sizeZ = zs[g] - zs[0];
    const half = this.size / 2;
    const roadWidth = 8;
    this.bounds = { min: -half, max: half };

    // === Podloze ===
    const groundGeo = new THREE.PlaneGeometry(
      sizeX + 8,
      sizeZ + 8,
    );
    const groundMat = new THREE.MeshStandardMaterial({
      color: PALETTE.grass,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = this.receiveShadows;
    ground.position.y = -0.08;
    this.scene.add(ground);

    // === Floating Island Base (Minecraft Skyblock / Fantasy Style) ===
    const topW = sizeX + 8;
    const topD = sizeZ + 8;
    
    // Layer 1: top soil layer (depth 4 units)
    const layer1Geo = new THREE.BoxGeometry(topW, 4, topD);
    const layer1Mat = new THREE.MeshStandardMaterial({
      color: 0x22262e, // dark concrete/dirt color
      roughness: 0.9,
      metalness: 0.1,
    });
    const layer1 = new THREE.Mesh(layer1Geo, layer1Mat);
    layer1.position.set(0, -2.08, 0); // top is at -0.08
    layer1.receiveShadow = this.receiveShadows;
    layer1.castShadow = this.receiveShadows;
    this.scene.add(layer1);

    // Layer 2: middle rock layer (depth 6 units, slightly tapered)
    const layer2Geo = new THREE.BoxGeometry(topW * 0.94, 6, topD * 0.94);
    const layer2Mat = new THREE.MeshStandardMaterial({
      color: 0x181a20, // darker stone
      roughness: 0.95,
      metalness: 0.15,
    });
    const layer2 = new THREE.Mesh(layer2Geo, layer2Mat);
    layer2.position.set(0, -7.08, 0); // top is at -4.08
    layer2.receiveShadow = this.receiveShadows;
    layer2.castShadow = this.receiveShadows;
    this.scene.add(layer2);

    // Layer 3: bottom rock core (depth 8 units, more tapered)
    const layer3Geo = new THREE.BoxGeometry(topW * 0.82, 8, topD * 0.82);
    const layer3Mat = new THREE.MeshStandardMaterial({
      color: 0x101116, // deep dark rock
      roughness: 0.98,
      metalness: 0.2,
    });
    const layer3 = new THREE.Mesh(layer3Geo, layer3Mat);
    layer3.position.set(0, -14.08, 0); // top is at -10.08, bottom at -18.08
    layer3.receiveShadow = this.receiveShadows;
    layer3.castShadow = this.receiveShadows;
    this.scene.add(layer3);

    // Add some random rocky stalactites hanging from the bottom of Layer 3
    const numStalactites = 15;
    for (let k = 0; k < numStalactites; k++) {
      const rw = 4 + Math.random() * 8;
      const rh = 3 + Math.random() * 8;
      const rd = 4 + Math.random() * 8;
      const rx = (Math.random() - 0.5) * topW * 0.75;
      const rz = (Math.random() - 0.5) * topD * 0.75;
      
      const rockGeo = new THREE.BoxGeometry(rw, rh, rd);
      const rock = new THREE.Mesh(rockGeo, layer3Mat);
      rock.position.set(rx, -18.08 - rh / 2 + 1, rz);
      rock.receiveShadow = this.receiveShadows;
      rock.castShadow = this.receiveShadows;
      this.scene.add(rock);
    }

    // === Materialy ===
    const quality = settings.current.quality;
    const isHighQuality = quality === 'high';
    const isMediumQuality = quality === 'medium';

    let roadMat, sidewalkMat, curbMat;
    if (isHighQuality) {
      // High quality: procedural canvas textures with bump maps
      const asphaltTex = City._createAsphaltTexture(this.isNight, 'high');
      const asphaltBump = City._createAsphaltBumpMap(this.isNight, 'high');
      roadMat = new THREE.MeshStandardMaterial({
        map: asphaltTex,
        bumpMap: asphaltBump,
        bumpScale: 0.15,
        roughness: 0.82,
        metalness: 0.05,
        roughnessMap: asphaltBump,
      });

      const sidewalkTex = City._createSidewalkTexture(this.isNight, 'high');
      const sidewalkBump = City._createSidewalkBumpMap(this.isNight, 'high');
      sidewalkMat = new THREE.MeshStandardMaterial({
        map: sidewalkTex,
        bumpMap: sidewalkBump,
        bumpScale: 0.2,
        roughness: 0.88,
        roughnessMap: sidewalkBump,
      });

      const curbTex = City._createCurbTexture(this.isNight, 'high');
      const curbBump = City._createCurbBumpMap(this.isNight, 'high');
      curbMat = new THREE.MeshStandardMaterial({
        map: curbTex,
        bumpMap: curbBump,
        bumpScale: 0.12,
        roughness: 0.75,
      });
    } else if (isMediumQuality) {
      // Medium quality: simpler procedural textures WITH subtle bump maps, NO roughness maps
      const asphaltTex = City._createAsphaltTexture(this.isNight, 'medium');
      const asphaltBump = City._createAsphaltBumpMap(this.isNight, 'medium');
      roadMat = new THREE.MeshStandardMaterial({
        map: asphaltTex,
        bumpMap: asphaltBump,
        bumpScale: 0.06,
        roughness: 0.85,
        metalness: 0.05,
      });

      const sidewalkTex = City._createSidewalkTexture(this.isNight, 'medium');
      const sidewalkBump = City._createSidewalkBumpMap(this.isNight, 'medium');
      sidewalkMat = new THREE.MeshStandardMaterial({
        map: sidewalkTex,
        bumpMap: sidewalkBump,
        bumpScale: 0.08,
        roughness: 0.9,
      });

      const curbTex = City._createCurbTexture(this.isNight, 'medium');
      const curbBump = City._createCurbBumpMap(this.isNight, 'medium');
      curbMat = new THREE.MeshStandardMaterial({
        map: curbTex,
        bumpMap: curbBump,
        bumpScale: 0.05,
        roughness: 0.8,
      });
    } else {
      // Low quality: flat colors, cheaper Lambert materials
      roadMat = new THREE.MeshLambertMaterial({
        color: PALETTE.road,
      });
      sidewalkMat = new THREE.MeshLambertMaterial({
        color: PALETTE.sidewalk,
      });
      curbMat = new THREE.MeshLambertMaterial({
        color: PALETTE.curb,
      });
    }

    // === Drogi poziome (staly z, rozciagaja sie na cala szerokosc w x, dopasowane do wyspy) ===
    for (let j = 0; j <= g; j++) {
      const coord = zs[j];
      const hRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(sizeX, roadWidth),
        roadMat,
      );
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0, coord);
      hRoad.receiveShadow = this.receiveShadows;
      this.scene.add(hRoad);
      this.roadSegments.push({
        x1: -sizeX / 2, z1: coord, x2: sizeX / 2, z2: coord, axis: "h",
      });
      this._addLaneLines(0, coord, sizeX, roadWidth, "h");
    }

    // === Drogi pionowe (staly x, rozciagaja sie na cala glebokosc w z, dopasowane do wyspy) ===
    for (let i = 0; i <= g; i++) {
      const coord = xs[i];
      const vRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth, sizeZ),
        roadMat,
      );
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(coord, 0, 0);
      vRoad.receiveShadow = this.receiveShadows;
      this.scene.add(vRoad);
      this.roadSegments.push({
        x1: coord, z1: -sizeZ / 2, x2: coord, z2: sizeZ / 2, axis: "v",
      });
      this._addLaneLines(coord, 0, roadWidth, sizeZ, "v");
    }

    // === Budowa Zakrzywionych Ramp na Krawedziach Drogi ===
    const rampLength = 30;
    const rampDepth = 20;
    const numSegments = 20;
    const minX = -sizeX / 2;
    const maxX = sizeX / 2;
    const minZ = -sizeZ / 2;
    const maxZ = sizeZ / 2;

    const isHQ = settings.current.quality === 'high';
    const lineMat = isHQ
      ? new THREE.MeshBasicMaterial({ color: 0xe8ecf0, transparent: true, opacity: 0.85 })
      : new THREE.MeshBasicMaterial({ color: 0xffffff });

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x7a829c, // light stone gray
      roughness: 0.8,
      metalness: 0.2,
    });

    const createRampSegment = (w, h, d, x, y, z, rotX, rotZ, customMat = null) => {
      const geom = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geom, customMat || roadMat);
      mesh.position.set(x, y, z);
      mesh.rotation.order = 'YXZ';
      if (rotX) mesh.rotation.x = rotX;
      if (rotZ) mesh.rotation.z = rotZ;
      mesh.receiveShadow = this.receiveShadows;
      this.scene.add(mesh);
      return mesh;
    };

    // Horizontal roads: ramps at left and right ends
    for (let j = 0; j <= g; j++) {
      const coord = zs[j];

      // Left Ramp (extending left from minX - 4)
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (minX - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dx = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(segmentLength, 0.15, roadWidth, x_mid, y_mid, coord, 0, angle);

        // Lane line dash
        if (i % 2 === 0) {
          createRampSegment(segmentLength, 0.16, 0.25, x_mid, y_mid + 0.01, coord, 0, angle, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord - 3.8, 0, angle, wallMat);
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord + 3.8, 0, angle, wallMat);
      }

      // Right Ramp (extending right from maxX + 4)
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (maxX + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dx = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(segmentLength, 0.15, roadWidth, x_mid, y_mid, coord, 0, angle);

        // Lane line dash
        if (i % 2 === 0) {
          createRampSegment(segmentLength, 0.16, 0.25, x_mid, y_mid + 0.01, coord, 0, angle, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord - 3.8, 0, angle, wallMat);
        createRampSegment(segmentLength, 0.8, 0.4, x_mid, y_mid + 0.4, coord + 3.8, 0, angle, wallMat);
      }
    }

    // Vertical roads: ramps at top and bottom ends
    for (let i = 0; i <= g; i++) {
      const coord = xs[i];

      // Top Ramp (extending top from minZ - 4)
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (minZ - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dz = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(roadWidth, 0.15, segmentLength, coord, y_mid, z_mid, -angle, 0);

        // Lane line dash
        if (j % 2 === 0) {
          createRampSegment(0.25, 0.16, segmentLength, coord, y_mid + 0.01, z_mid, -angle, 0, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(0.4, 0.8, segmentLength, coord - 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
        createRampSegment(0.4, 0.8, segmentLength, coord + 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
      }

      // Bottom Ramp (extending bottom from maxZ + 4)
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (maxZ + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dz = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        createRampSegment(roadWidth, 0.15, segmentLength, coord, y_mid, z_mid, -angle, 0);

        // Lane line dash
        if (j % 2 === 0) {
          createRampSegment(0.25, 0.16, segmentLength, coord, y_mid + 0.01, z_mid, -angle, 0, lineMat);
        }

        // Stone guardrails on the sides
        createRampSegment(0.4, 0.8, segmentLength, coord - 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
        createRampSegment(0.4, 0.8, segmentLength, coord + 3.8, y_mid + 0.4, z_mid, -angle, 0, wallMat);
      }
    }

    // Fill the 4x4 gaps at the 4 intersection corners of the island
    const cornerFillers = [
      [minX - 2, minZ - 2], // Top-Left
      [maxX + 2, minZ - 2], // Top-Right
      [minX - 2, maxZ + 2], // Bottom-Left
      [maxX + 2, maxZ + 2], // Bottom-Right
    ];
    for (const [fx, fz] of cornerFillers) {
      const fillGeo = new THREE.PlaneGeometry(4, 4);
      const fill = new THREE.Mesh(fillGeo, roadMat);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(fx, 0, fz);
      fill.receiveShadow = this.receiveShadows;
      this.scene.add(fill);
    }

    // === Wypelnienie skalne miedzy drogami i lekki mur obwodowy ===
    const grassMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x1a2e1a : 0x3a7a3a, // green grass color matching parks
      roughness: 0.95,
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x2a1c0e : 0x5b3a1d,
      roughness: 0.9,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x142820 : 0x4a8a3f,
      roughness: 0.85,
    });

    const spawnSlopedTree = (tx, ty, tz) => {
      const isLow = settings.current.quality === 'low';
      const group = new THREE.Group();
      group.position.set(tx, ty, tz);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 1.6, isLow ? 5 : 8),
        trunkMat,
      );
      trunk.position.y = 0.92;
      trunk.castShadow = this.castShadows;
      group.add(trunk);
      const r = 0.9 + Math.random() * 0.5;
      const leaves = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, isLow ? 0 : 1),
        leafMat,
      );
      leaves.position.y = 2.3;
      leaves.castShadow = this.castShadows;
      group.add(leaves);
      if (!isLow) {
        const leaves2 = new THREE.Mesh(
          new THREE.IcosahedronGeometry(r * 0.65, 1),
          leafMat,
        );
        leaves2.position.set(0.4, 2.6, -0.3);
        group.add(leaves2);
      }

      this.scene.add(group);
      this.trees.push({ x: tx, z: tz, mesh: group });
    };

    const spawnHouse = (x, y, z, rotY) => {
      const houseMat = new THREE.MeshStandardMaterial({
        color: PALETTE.building[Math.floor(Math.random() * PALETTE.building.length)],
        roughness: 0.8,
      });
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xaa3333, // red roof
        roughness: 0.6,
      });

      const houseGeo = new THREE.BoxGeometry(3, 3, 3);
      const house = new THREE.Mesh(houseGeo, houseMat);
      house.position.set(x, y + 1.5, z);
      house.rotation.y = rotY;
      house.castShadow = this.castShadows;
      house.receiveShadow = this.receiveShadows;
      this.scene.add(house);
      this.buildings.push({ mesh: house, x1: x-1.5, z1: z-1.5, x2: x+1.5, z2: z+1.5, height: 3 });

      // Roof (Cone)
      const roofGeo = new THREE.ConeGeometry(2.5, 2, 4);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(x, y + 3.5, z);
      roof.rotation.y = rotY + Math.PI / 4;
      roof.castShadow = this.castShadows;
      this.scene.add(roof);
    };
    
    // 1. Lewa krawedź wyspy (Left)
    for (let j = 0; j < g; j++) {
      const z1 = zs[j] + 4;
      const z2 = zs[j+1] - 4;
      const z_mid = (z1 + z2) / 2;
      const depth = z2 - z1;

      // Build sloped grass hillside with rocks underneath
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (minX - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dx = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(segmentLength, 0.2, depth, x_mid, y_mid, z_mid, 0, angle, grassMat);

        // Rocky base segment
        createRampSegment(segmentLength, 4.0, depth, x_mid, y_mid - 2.0, z_mid, 0, angle, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const z_off = (Math.random() - 0.5) * (depth - 6);
          spawnSlopedTree(x_mid, y_mid, z_mid + z_off);
        }
        if (Math.random() < 0.12 && i > 2 && i < numSegments - 2) {
          const z_off = (Math.random() - 0.5) * (depth - 8);
          spawnHouse(x_mid, y_mid, z_mid + z_off, -Math.PI / 2);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(0.4, 0.8, depth);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(minX - 4, 0.4, z_mid);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 2. Prawa krawedź wyspy (Right)
    for (let j = 0; j < g; j++) {
      const z1 = zs[j] + 4;
      const z2 = zs[j+1] - 4;
      const z_mid = (z1 + z2) / 2;
      const depth = z2 - z1;

      // Build sloped grass hillside with rocks underneath
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const x_mid = (maxX + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dx = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dx);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(segmentLength, 0.2, depth, x_mid, y_mid, z_mid, 0, angle, grassMat);

        // Rocky base segment
        createRampSegment(segmentLength, 4.0, depth, x_mid, y_mid - 2.0, z_mid, 0, angle, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const z_off = (Math.random() - 0.5) * (depth - 6);
          spawnSlopedTree(x_mid, y_mid, z_mid + z_off);
        }
        if (Math.random() < 0.12 && i > 2 && i < numSegments - 2) {
          const z_off = (Math.random() - 0.5) * (depth - 8);
          spawnHouse(x_mid, y_mid, z_mid + z_off, Math.PI / 2);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(0.4, 0.8, depth);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(maxX + 4, 0.4, z_mid);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 3. Gorna krawedź wyspy (Top)
    for (let i = 0; i < g; i++) {
      const x1 = xs[i] + 4;
      const x2 = xs[i+1] - 4;
      const x_mid = (x1 + x2) / 2;
      const width = x2 - x1;

      // Build sloped grass hillside with rocks underneath
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (minZ - 4 - rampLength) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.sin(t_mid * Math.PI / 2));

        const dy_dz = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(width, 0.2, segmentLength, x_mid, y_mid, z_mid, -angle, 0, grassMat);

        // Rocky base segment
        createRampSegment(width, 4.0, segmentLength, x_mid, y_mid - 2.0, z_mid, -angle, 0, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const x_off = (Math.random() - 0.5) * (width - 6);
          spawnSlopedTree(x_mid + x_off, y_mid, z_mid);
        }
        if (Math.random() < 0.12 && j > 2 && j < numSegments - 2) {
          const x_off = (Math.random() - 0.5) * (width - 8);
          spawnHouse(x_mid + x_off, y_mid, z_mid, 0);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(width, 0.8, 0.4);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(x_mid, 0.4, minZ - 4);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 4. Dolna krawedź wyspy (Bottom)
    for (let i = 0; i < g; i++) {
      const x1 = xs[i] + 4;
      const x2 = xs[i+1] - 4;
      const x_mid = (x1 + x2) / 2;
      const width = x2 - x1;

      // Build sloped grass hillside with rocks underneath
      for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const z_mid = (maxZ + 4) + t_mid * rampLength;
        const y_mid = -rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        const dy_dz = - (rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t_mid * Math.PI / 2);
        const angle = Math.atan(dy_dz);
        const segmentLength = (rampLength / numSegments) / Math.cos(angle);

        // Grass surface segment
        createRampSegment(width, 0.2, segmentLength, x_mid, y_mid, z_mid, -angle, 0, grassMat);

        // Rocky base segment
        createRampSegment(width, 4.0, segmentLength, x_mid, y_mid - 2.0, z_mid, -angle, 0, layer2Mat);

        // Spawn trees and cottages on the slope
        if (Math.random() < 0.25) {
          const x_off = (Math.random() - 0.5) * (width - 6);
          spawnSlopedTree(x_mid + x_off, y_mid, z_mid);
        }
        if (Math.random() < 0.12 && j > 2 && j < numSegments - 2) {
          const x_off = (Math.random() - 0.5) * (width - 8);
          spawnHouse(x_mid + x_off, y_mid, z_mid, Math.PI);
        }
      }

      // Stone wall at top edge
      const wGeo = new THREE.BoxGeometry(width, 0.8, 0.4);
      const w = new THREE.Mesh(wGeo, wallMat);
      w.position.set(x_mid, 0.4, maxZ + 4);
      w.receiveShadow = this.receiveShadows;
      w.castShadow = this.receiveShadows;
      this.scene.add(w);
    }

    // 5. Narożniki (Corners)
    const cornerW = 25;
    const cornerD = 25;

    // Helper to create a closed concentric ring sector using ExtrudeGeometry
    const createRingSectorMesh = (sx, sz, r1, r2, height, yTop, startAngle, endAngle, material) => {
      const shape = new THREE.Shape();
      if (r1 === 0) {
        shape.moveTo(0, 0);
        shape.absarc(0, 0, r2, startAngle, endAngle, false);
        shape.lineTo(0, 0);
      } else {
        shape.moveTo(r1 * Math.cos(startAngle), r1 * Math.sin(startAngle));
        shape.absarc(0, 0, r2, startAngle, endAngle, false);
        shape.lineTo(r1 * Math.cos(endAngle), r1 * Math.sin(endAngle));
        shape.absarc(0, 0, r1, endAngle, startAngle, true);
      }

      const extrudeSettings = {
        depth: height,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 16,
      };

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, material);
      
      // Rotate by Math.PI / 2 so shape's X-Y plane lies in world X-Z, and depth extrudes downwards
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(sx, yTop, sz);
      
      mesh.receiveShadow = this.receiveShadows;
      mesh.castShadow = this.receiveShadows;
      this.scene.add(mesh);
      return mesh;
    };

    const roundedCorners = [
      // [sx, sz, startAngle, endAngle, diagAngle, houseRotation]
      [minX - 4, minZ - 4, Math.PI, 1.5 * Math.PI, 1.25 * Math.PI, -Math.PI / 4], // Top-Left
      [maxX + 4, minZ - 4, 1.5 * Math.PI, 2 * Math.PI, 1.75 * Math.PI, Math.PI / 4],  // Top-Right
      [minX - 4, maxZ + 4, Math.PI / 2, Math.PI, 0.75 * Math.PI, -3 * Math.PI / 4], // Bottom-Left
      [maxX + 4, maxZ + 4, 0, Math.PI / 2, 0.25 * Math.PI, 3 * Math.PI / 4],  // Bottom-Right
    ];

    for (const [sx, sz, startAngle, endAngle, da, rotY] of roundedCorners) {
      // Build sloped grass hillside with rocks underneath in concentric rings
      const numSegments = 16;
      for (let k = 0; k < numSegments; k++) {
        const t1 = k / numSegments;
        const t2 = (k + 1) / numSegments;
        const t_mid = (t1 + t2) / 2;

        const r1 = t1 * 25;
        const r2 = t2 * 25;

        // y_mid curves from 0.12 (at t_mid = 0) down to 0.12 - rampDepth (at t_mid = 1)
        const y_mid = 0.12 - rampDepth * (1 - Math.cos(t_mid * Math.PI / 2));

        // 1. Grass surface ring segment (depth 0.2)
        createRingSectorMesh(sx, sz, r1, r2, 0.2, y_mid, startAngle, endAngle, grassMat);

        // 2. Middle rock layer (depth 12.0)
        createRingSectorMesh(sx, sz, r1, r2, 12.0, y_mid - 0.2, startAngle, endAngle, layer2Mat);

        // 3. Bottom rock layer (depth 8.0, tapered radius by 0.9)
        createRingSectorMesh(sx, sz, r1 * 0.9, r2 * 0.9, 8.0, y_mid - 12.2, startAngle, endAngle, layer3Mat);
      }

      // 4. Stone wall at the outer curved edge (bottom of the slope at r = 25)
      const numWallSegs = 16;
      const arcLength = 25 * (endAngle - startAngle);
      const segW = arcLength / numWallSegs + 0.1; // slight overlap to prevent gaps
      const wy_outer = 0.12 - rampDepth; // at r = 25, the slope has fully dropped to bottom
      for (let i = 0; i < numWallSegs; i++) {
        const t = (i + 0.5) / numWallSegs;
        const angle = startAngle + t * (endAngle - startAngle);
        const wx = sx + 25 * Math.cos(angle);
        const wz = sz + 25 * Math.sin(angle);
        
        const wallSegGeo = new THREE.BoxGeometry(segW, 0.8, 0.4);
        const wallSeg = new THREE.Mesh(wallSegGeo, wallMat);
        wallSeg.position.set(wx, wy_outer + 0.4, wz);
        wallSeg.rotation.y = -angle - Math.PI / 2;
        wallSeg.receiveShadow = this.receiveShadows;
        wallSeg.castShadow = this.receiveShadows;
        this.scene.add(wallSeg);
      }

      // 5. Spawn a cottage and trees on the sloped rounded corner
      const hx = sx + 14 * Math.cos(da);
      const hz = sz + 14 * Math.sin(da);
      const hy = 0.12 - rampDepth * (1 - Math.cos((14 / 25) * Math.PI / 2));
      spawnHouse(hx, hy, hz, rotY);

      // Place 4 trees distributed down the slope
      const treeAngles = [da - 0.2, da + 0.2, da - 0.35, da + 0.35];
      const treeDists = [8, 9, 18, 19];
      for (let i = 0; i < 4; i++) {
        const tx = sx + treeDists[i] * Math.cos(treeAngles[i]);
        const tz = sz + treeDists[i] * Math.sin(treeAngles[i]);
        const ty = 0.12 - rampDepth * (1 - Math.cos((treeDists[i] / 25) * Math.PI / 2));
        spawnSlopedTree(tx, ty, tz);
      }
    }

    // === Bloki: chodnik + zawartosc w zaleznosci od typu ===
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g; j++) {
        const cellW = xs[i + 1] - xs[i];
        const cellD = zs[j + 1] - zs[j];
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cz = (zs[j] + zs[j + 1]) / 2;

        const sidewalkW = cellW - roadWidth - 6;
        const sidewalkD = cellD - roadWidth - 6;
        const buildAreaW = sidewalkW - 2;
        const buildAreaD = sidewalkD - 2;

        // Chodnik — zawsze obecny
        const sw = new THREE.Mesh(
          new THREE.BoxGeometry(sidewalkW, 0.12, sidewalkD),
          sidewalkMat,
        );
        sw.position.set(cx, 0.06, cz);
        sw.receiveShadow = this.receiveShadows;
        this.scene.add(sw);
        this.sidewalks.push({
          x1: cx - sidewalkW / 2,
          z1: cz - sidewalkD / 2,
          x2: cx + sidewalkW / 2,
          z2: cz + sidewalkD / 2,
        });

        // Krawezniki
        const curbT = 0.28;
        const curbW = 0.55;
        const curbOffX = cellW / 2 - roadWidth / 2 - curbW / 2;
        const curbOffZ = cellD / 2 - roadWidth / 2 - curbW / 2;

        const getSubIntervals = (A, B, disallowed) => {
          let intervals = [{ start: A, end: B }];
          for (const disc of disallowed) {
            const nextIntervals = [];
            for (const inv of intervals) {
              if (disc.end <= inv.start || disc.start >= inv.end) {
                nextIntervals.push(inv);
              } else {
                if (disc.start > inv.start) {
                  nextIntervals.push({ start: inv.start, end: disc.start });
                }
                if (disc.end < inv.end) {
                  nextIntervals.push({ start: disc.end, end: inv.end });
                }
              }
            }
            intervals = nextIntervals;
          }
          return intervals;
        };

        // 1. North curb (adjacent to zs[j])
        {
          const A = xs[i] + roadWidth / 2;
          const B = xs[i+1] - roadWidth / 2;
          const disallowed = [];
          if (j > 0) {
            if (i > 0) disallowed.push({ start: xs[i] + 4, end: xs[i] + 7 });
            if (i < g - 1) disallowed.push({ start: xs[i+1] - 7, end: xs[i+1] - 4 });
          }
          const intervals = getSubIntervals(A, B, disallowed);
          for (const inv of intervals) {
            const len = inv.end - inv.start;
            if (len <= 0.01) continue;
            const xPos = (inv.start + inv.end) / 2;
            const zPos = cz - curbOffZ;
            const c = new THREE.Mesh(
              new THREE.BoxGeometry(len, curbT, curbW),
              curbMat,
            );
            c.position.set(xPos, curbT / 2 + 0.12, zPos);
            this.scene.add(c);
          }
        }

        // 2. South curb (adjacent to zs[j+1])
        {
          const A = xs[i] + roadWidth / 2;
          const B = xs[i+1] - roadWidth / 2;
          const disallowed = [];
          if (j < g - 1) {
            if (i > 0) disallowed.push({ start: xs[i] + 4, end: xs[i] + 7 });
            if (i < g - 1) disallowed.push({ start: xs[i+1] - 7, end: xs[i+1] - 4 });
          }
          const intervals = getSubIntervals(A, B, disallowed);
          for (const inv of intervals) {
            const len = inv.end - inv.start;
            if (len <= 0.01) continue;
            const xPos = (inv.start + inv.end) / 2;
            const zPos = cz + curbOffZ;
            const c = new THREE.Mesh(
              new THREE.BoxGeometry(len, curbT, curbW),
              curbMat,
            );
            c.position.set(xPos, curbT / 2 + 0.12, zPos);
            this.scene.add(c);
          }
        }

        // 3. West curb (adjacent to xs[i])
        {
          const A = zs[j] + roadWidth / 2;
          const B = zs[j+1] - roadWidth / 2;
          const disallowed = [];
          if (i > 0) {
            if (j > 0) disallowed.push({ start: zs[j] + 4, end: zs[j] + 7 });
            if (j < g - 1) disallowed.push({ start: zs[j+1] - 7, end: zs[j+1] - 4 });
          }
          const intervals = getSubIntervals(A, B, disallowed);
          for (const inv of intervals) {
            const len = inv.end - inv.start;
            if (len <= 0.01) continue;
            const xPos = cx - curbOffX;
            const zPos = (inv.start + inv.end) / 2;
            const c = new THREE.Mesh(
              new THREE.BoxGeometry(curbW, curbT, len),
              curbMat,
            );
            c.position.set(xPos, curbT / 2 + 0.12, zPos);
            this.scene.add(c);
          }
        }

        // 4. East curb (adjacent to xs[i+1])
        {
          const A = zs[j] + roadWidth / 2;
          const B = zs[j+1] - roadWidth / 2;
          const disallowed = [];
          if (i < g - 1) {
            if (j > 0) disallowed.push({ start: zs[j] + 4, end: zs[j] + 7 });
            if (j < g - 1) disallowed.push({ start: zs[j+1] - 7, end: zs[j+1] - 4 });
          }
          const intervals = getSubIntervals(A, B, disallowed);
          for (const inv of intervals) {
            const len = inv.end - inv.start;
            if (len <= 0.01) continue;
            const xPos = cx + curbOffX;
            const zPos = (inv.start + inv.end) / 2;
            const c = new THREE.Mesh(
              new THREE.BoxGeometry(curbW, curbT, len),
              curbMat,
            );
            c.position.set(xPos, curbT / 2 + 0.12, zPos);
            this.scene.add(c);
          }
        }

        // === Detale high quality: linie krawędziowe i rynsztok ===
        if (isHighQuality) {
          const edgeLineMat = new THREE.MeshBasicMaterial({
            color: 0xd8dce4,
            transparent: true,
            opacity: 0.7,
          });
          const gutterMat = new THREE.MeshStandardMaterial({
            color: this.isNight ? 0x181c24 : 0x2a2e38,
            roughness: 0.95,
            metalness: 0.1,
          });
          const edgeLineW = 0.15;
          const gutterW = 0.25;
          const edgeOff = curbW / 2 + edgeLineW / 2 + 0.05;
          const gutterOff = curbW / 2 + gutterW / 2 + edgeLineW + 0.08;

          // Road edge lines (white paint) and gutter strips
          for (const [dx, dz, len, isH] of [
            [0, -curbOffZ - edgeOff, sidewalkW, true],  // South edge
            [0, curbOffZ + edgeOff, sidewalkW, true],   // North edge
            [-curbOffX - edgeOff, 0, sidewalkD, false],  // West edge
            [curbOffX + edgeOff, 0, sidewalkD, false],   // East edge
          ]) {
            // White road edge line
            const lineGeo = isH
              ? new THREE.PlaneGeometry(len, edgeLineW)
              : new THREE.PlaneGeometry(edgeLineW, len);
            const line = new THREE.Mesh(lineGeo, edgeLineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(cx + dx, 0.012, cz + dz);
            this.scene.add(line);
          }

          // Gutter strips (darker strip where road meets curb)
          for (const [dx, dz, len, isH] of [
            [0, -curbOffZ - gutterOff, sidewalkW, true],
            [0, curbOffZ + gutterOff, sidewalkW, true],
            [-curbOffX - gutterOff, 0, sidewalkD, false],
            [curbOffX + gutterOff, 0, sidewalkD, false],
          ]) {
            const gutterGeo = isH
              ? new THREE.PlaneGeometry(len, gutterW)
              : new THREE.PlaneGeometry(gutterW, len);
            const gutter = new THREE.Mesh(gutterGeo, gutterMat);
            gutter.rotation.x = -Math.PI / 2;
            gutter.position.set(cx + dx, 0.005, cz + dz);
            this.scene.add(gutter);
          }
        }

        // Zawartosc bloku w zaleznosci od typu w layoucie
        const blockType = (this.layout.blocks && this.layout.blocks[`${i},${j}`]) || 'building';

        switch (blockType) {
          case 'park':
            this._buildPark(cx, cz, sidewalkW, sidewalkD);
            break;
          case 'plaza':
            this._buildPlaza(cx, cz, sidewalkW, sidewalkD);
            break;
          case 'empty':
            // Sam chodnik, moze lawka
            if (Math.random() > 0.5) this._spawnBench(cx, cz);
            this._addBlockTrees(cx, cz, sidewalkW, sidewalkD);
            break;
          case 'building':
          default:
            this._buildBuildings(cx, cz, Math.min(buildAreaW, buildAreaD));
            this._addBlockTrees(cx, cz, sidewalkW, sidewalkD);
            break;
        }

        // Punkty spawnu na rogach chodnika
        const offX = sidewalkW / 2 - 1.5;
        const offZ = sidewalkD / 2 - 1.5;
        for (const pt of [
          { x: cx - offX, z: cz - offZ },
          { x: cx + offX, z: cz - offZ },
          { x: cx - offX, z: cz + offZ },
          { x: cx + offX, z: cz + offZ },
        ]) {
          if (!this.collidesBuilding(pt.x, pt.z, 0.6))
            this.spawnPoints.push(pt);
        }
      }
    }

    // === Skrzyzowania — sygnalizowane lub ze znakami ===
    const crossOff = roadWidth / 2 + 1.5;
    const crossWidth = 3.0;
    const roadHalf = roadWidth / 2;
    const sigOff = crossOff + crossWidth / 2 + 0.5;

    for (let i = 1; i < g; i++) {
      for (let j = 1; j < g; j++) {
        const x = xs[i];
        const z = zs[j];

        if (this._signalSet.has(`${i},${j}`)) {
          // --- Skrzyżowanie z sygnalizacją świetlną ---
          this.intersections.push({ x, z, signalized: true });

          // Sygnalizacja pojazdowa (4 ramiona)
          const tlForSouth = this._addTrafficLight(x + roadHalf + 0.5, z + sigOff, 'ns', 0, x, z);
          const tlForNorth = this._addTrafficLight(x - roadHalf - 0.5, z - sigOff, 'ns', Math.PI, x, z);
          const tlForWest = this._addTrafficLight(x - sigOff, z + roadHalf + 0.5, 'ew', -Math.PI / 2, x, z);
          const tlForEast = this._addTrafficLight(x + sigOff, z - roadHalf - 0.5, 'ew', Math.PI / 2, x, z);

          // Sygnalizacja piesza
          const pedCorner = roadHalf + 3;
          const pedOff = roadHalf + 0.5;
          this._addPedestrianLight(x - pedOff, z - pedCorner, Math.PI / 2, tlForNorth);
          this._addPedestrianLight(x + pedOff, z - pedCorner, -Math.PI / 2, tlForNorth);
          this._addPedestrianLight(x - pedOff, z + pedCorner, Math.PI / 2, tlForSouth);
          this._addPedestrianLight(x + pedOff, z + pedCorner, -Math.PI / 2, tlForSouth);
          this._addPedestrianLight(x + pedCorner, z - pedOff, 0, tlForEast);
          this._addPedestrianLight(x + pedCorner, z + pedOff, Math.PI, tlForEast);
          this._addPedestrianLight(x - pedCorner, z - pedOff, 0, tlForWest);
          this._addPedestrianLight(x - pedCorner, z + pedOff, Math.PI, tlForWest);

          // Zebry
          for (const dz of [-crossOff, +crossOff]) {
            this._addZebra(x, z + dz, 'x', roadWidth, crossWidth);
            const lightObj = dz < 0 ? tlForNorth : tlForSouth;
            this.crossings.push({
              x, z: z + dz, axis: 'h', light: lightObj,
              x1: x - roadWidth / 2, z1: z + dz - crossWidth / 2,
              x2: x + roadWidth / 2, z2: z + dz + crossWidth / 2,
            });
          }
          for (const dx of [-crossOff, +crossOff]) {
            this._addZebra(x + dx, z, 'z', roadWidth, crossWidth);
            const lightObj = dx < 0 ? tlForWest : tlForEast;
            this.crossings.push({
              x: x + dx, z, axis: 'v', light: lightObj,
              x1: x + dx - crossWidth / 2, z1: z - roadWidth / 2,
              x2: x + dx + crossWidth / 2, z2: z + roadWidth / 2,
            });
          }
        } else {
          // --- Skrzyżowanie równorzędne ze znakami (bez sygnalizacji) ---
          this.intersections.push({ x, z, signalized: false });

          // Zebry bez sygnalizacji
          for (const dz of [-crossOff, +crossOff]) {
            this._addZebra(x, z + dz, 'x', roadWidth, crossWidth);
            this.crossings.push({
              x, z: z + dz, axis: 'h', light: null,
              x1: x - roadWidth / 2, z1: z + dz - crossWidth / 2,
              x2: x + roadWidth / 2, z2: z + dz + crossWidth / 2,
            });
          }
          for (const dx of [-crossOff, +crossOff]) {
            this._addZebra(x + dx, z, 'z', roadWidth, crossWidth);
            this.crossings.push({
              x: x + dx, z, axis: 'v', light: null,
              x1: x + dx - crossWidth / 2, z1: z - roadWidth / 2,
              x2: x + dx + crossWidth / 2, z2: z + roadWidth / 2,
            });
          }

          // Znaki pionowe na skrzyżowaniach bez sygnalizacji (przesunięte przed przejście dla pieszych i bardziej na bok):
          const unsigSignOff = crossOff + crossWidth / 2 + 2.0; // 9.0 (odsunięcie przed przejście dla pieszych)
          const unsigSignLat = roadHalf + 1.2; // 5.2 (bardziej na bok drogi, aby nie blokować wejścia na pasy)

          // Droga z pierwszeństwem (D-1) z podczepionym znakiem przejścia dla pieszych (D-6) na jednym słupku (oś pozioma)
          this._createDoubleSign(x - unsigSignOff, z + unsigSignLat, 'D-1', 'D-6', -Math.PI / 2); // West approach & crossing
          this._createDoubleSign(x + unsigSignOff, z - unsigSignLat, 'D-1', 'D-6', Math.PI / 2);  // East approach & crossing

          // Ustąp pierwszeństwa (A-7) z podczepionym znakiem przejścia dla pieszych (D-6) na jednym słupku (oś pionowa)
          this._createDoubleSign(x - unsigSignLat, z - unsigSignOff, 'A-7', 'D-6', Math.PI); // North approach & crossing
          this._createDoubleSign(x + unsigSignLat, z + unsigSignOff, 'A-7', 'D-6', 0);       // South approach & crossing
        }

        // === High quality intersection details: drain grates & stop lines ===
        if (isHighQuality) {
          const grateMat = new THREE.MeshStandardMaterial({
            color: 0x1a1e26,
            metalness: 0.7,
            roughness: 0.4,
          });
          const grateSlotMat = new THREE.MeshStandardMaterial({
            color: 0x0a0c10,
            metalness: 0.5,
            roughness: 0.6,
          });
          // Drain grates at 4 corners of intersection
          for (const [dx, dz] of [
            [roadHalf + 1.2, roadHalf + 1.2],
            [-roadHalf - 1.2, roadHalf + 1.2],
            [roadHalf + 1.2, -roadHalf - 1.2],
            [-roadHalf - 1.2, -roadHalf - 1.2],
          ]) {
            const grateGroup = new THREE.Group();
            // Frame
            const frame = new THREE.Mesh(
              new THREE.BoxGeometry(0.8, 0.04, 0.5),
              grateMat,
            );
            frame.position.y = 0.02;
            grateGroup.add(frame);
            // Slots
            for (let s = -3; s <= 3; s++) {
              const slot = new THREE.Mesh(
                new THREE.BoxGeometry(0.65, 0.02, 0.03),
                grateSlotMat,
              );
              slot.position.set(0, 0.05, s * 0.06);
              grateGroup.add(slot);
            }
            grateGroup.position.set(x + dx, 0.005, z + dz);
            grateGroup.rotation.x = 0;
            this.scene.add(grateGroup);
          }

          // Stop lines before crossings (thick white lines)
          const stopLineMat = new THREE.MeshBasicMaterial({
            color: 0xd8dce4,
            transparent: true,
            opacity: 0.75,
          });
          const stopLineThick = 0.4;
          const stopLineDist = crossOff + crossWidth / 2 + 0.8;
          // NS stop lines (horizontal, on vertical road approach)
          for (const dz of [-stopLineDist, stopLineDist]) {
            const stopLine = new THREE.Mesh(
              new THREE.PlaneGeometry(roadWidth * 0.8, stopLineThick),
              stopLineMat,
            );
            stopLine.rotation.x = -Math.PI / 2;
            stopLine.position.set(x, 0.013, z + dz);
            this.scene.add(stopLine);
          }
          // EW stop lines (vertical, on horizontal road approach)
          for (const dx of [-stopLineDist, stopLineDist]) {
            const stopLine = new THREE.Mesh(
              new THREE.PlaneGeometry(stopLineThick, roadWidth * 0.8),
              stopLineMat,
            );
            stopLine.rotation.x = -Math.PI / 2;
            stopLine.position.set(x + dx, 0.013, z);
            this.scene.add(stopLine);
          }
        }
      }
    }

    this._linkTrafficLights();
    this._placeCameras();

    if (this.zone.id === "industrial" || this.zone.id === "highway") {
      this._addRoadworks();
    }

    this._addLamps();
    this._buildGhostIslands();
    this.bounds = { min: -half, max: half };
  }

  // ============================================================
  // Helpery do gameplayu
  // ============================================================

  isOnSidewalk(x, z) {
    for (const s of this.sidewalks) {
      if (x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2) return true;
    }
    return false;
  }

  isOnRoad(x, z) {
    if (
      x < this.bounds.min ||
      x > this.bounds.max ||
      z < this.bounds.min ||
      z > this.bounds.max
    )
      return false;
    const roadHalf = 4;
    for (const seg of this.roadSegments) {
      if (seg.axis === "h") {
        if (
          Math.abs(z - seg.z1) <= roadHalf &&
          x >= seg.x1 &&
          x <= seg.x2
        )
          return true;
      } else {
        if (
          Math.abs(x - seg.x1) <= roadHalf &&
          z >= seg.z1 &&
          z <= seg.z2
        )
          return true;
      }
    }
    return false;
  }

  isOnSafeGround(x, z) {
    if (this.isOnSidewalk(x, z)) return true;
    if (
      x < this.bounds.min ||
      x > this.bounds.max ||
      z < this.bounds.min ||
      z > this.bounds.max
    )
      return false;
    return !this.isOnRoad(x, z) && !this.isOnCrossing(x, z);
  }

  isOnCrossing(x, z) {
    for (const c of this.crossings) {
      if (x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2) return c;
    }
    return null;
  }

  collidesBuilding(x, z, r = 0.6) {
    for (const b of this.buildings) {
      if (x + r > b.x1 && x - r < b.x2 && z + r > b.z1 && z - r < b.z2)
        return true;
    }
    for (const o of this.obstacles) {
      if (x + r > o.x1 && x - r < o.x2 && z + r > o.z1 && z - r < o.z2)
        return true;
    }
    return false;
  }

  farSpawn(fromX, fromZ, minDist = 60) {
    const candidates = this.spawnPoints
      .map((p) => ({ p, d: Math.hypot(p.x - fromX, p.z - fromZ) }))
      .filter((o) => o.d > minDist)
      .sort((a, b) => b.d - a.d);
    if (!candidates.length) return this.spawnPoints[0];
    return candidates[
      Math.floor(Math.random() * Math.min(5, candidates.length))
    ].p;
  }

  randomSidewalkPoint() {
    return this.spawnPoints[
      Math.floor(Math.random() * this.spawnPoints.length)
    ];
  }

  cullScene(camera) {
    try {
      const camPos = camera.position;
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      if (!this._logCount) this._logCount = 0;
      if (this._logCount < 10) {
        this._logCount++;
        const sampleBuildings = [];
        for (let i = 0; i < Math.min(5, this.buildings.length); i++) {
          const b = this.buildings[i];
          if (b.mesh) {
            const bx = (b.x1 + b.x2) / 2;
            const bz = (b.z1 + b.z2) / 2;
            const by = (b.mesh.userData.height || 20) / 2;
            const vx = bx - camPos.x;
            const vy = by - camPos.y;
            const vz = bz - camPos.z;
            const dist = Math.hypot(vx, vz);
            const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
            sampleBuildings.push({ i, bx, by, bz, vx, vy, vz, dist, dot });
          }
        }
        fetch('/log', {
          method: 'POST',
          body: JSON.stringify({
            tick: this._logCount,
            camPos: { x: camPos.x, y: camPos.y, z: camPos.z },
            camDir: { x: camDir.x, y: camDir.y, z: camDir.z },
            buildingsCount: this.buildings.length,
            treesCount: this.trees.length,
            benchesCount: this.benches.length,
            samples: sampleBuildings
          })
        }).catch(() => {});
      }
      
      const objPos = new THREE.Vector3();
      
      // Cull buildings
      for (const b of this.buildings) {
        if (b.mesh) {
          const bx = (b.x1 + b.x2) / 2;
          const bz = (b.z1 + b.z2) / 2;
          const by = (b.mesh.userData.height || 20) / 2;
          
          objPos.set(bx, by, bz);
          
          const vx = objPos.x - camPos.x;
          const vy = objPos.y - camPos.y;
          const vz = objPos.z - camPos.z;
          const dist = Math.hypot(vx, vz);
          
          const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
          
          // Pokaż tylko jeśli jest z przodu kamery (z marginesem -15) i w odległości 200m
          b.mesh.visible = (dot > -15) && (dist < 200);
        }
      }
      
      // Cull trees
      for (const t of this.trees) {
        if (t.mesh) {
          const vx = t.x - camPos.x;
          const vy = 2.0 - camPos.y;
          const vz = t.z - camPos.z;
          const dist = Math.hypot(vx, vz);
          const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
          
          t.mesh.visible = (dot > -10) && (dist < 150);
        }
      }
      
      // Cull benches
      for (const bn of this.benches) {
        if (bn.mesh) {
          const vx = bn.x - camPos.x;
          const vy = 0.5 - camPos.y;
          const vz = bn.z - camPos.z;
          const dist = Math.hypot(vx, vz);
          const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
          
          bn.mesh.visible = (dot > -10) && (dist < 120);
        }
      }

      // Cull ghost buildings
      if (this.ghostBuildings) {
        for (const gb of this.ghostBuildings) {
          if (gb.mesh) {
            const bx = (gb.x1 + gb.x2) / 2;
            const bz = (gb.z1 + gb.z2) / 2;
            const by = gb.height / 2;
            
            const vx = bx - camPos.x;
            const vy = by - camPos.y;
            const vz = bz - camPos.z;
            const dist = Math.hypot(vx, vz);
            const dot = vx * camDir.x + vy * camDir.y + vz * camDir.z;
            
            // Widmowe budynki widać znacznie dalej (do 400m)
            gb.mesh.visible = (dot > -30) && (dist < 400);
          }
        }
      }
    } catch (e) {
      console.error("Error in cullScene:", e);
    }
  }
}

// Attach static texture methods
City._createAsphaltTexture = _createAsphaltTexture;
City._createAsphaltBumpMap = _createAsphaltBumpMap;
City._createSidewalkTexture = _createSidewalkTexture;
City._createSidewalkBumpMap = _createSidewalkBumpMap;
City._createCurbTexture = _createCurbTexture;
City._createCurbBumpMap = _createCurbBumpMap;
City._createRoadEdgeLineTexture = _createRoadEdgeLineTexture;

// Attach park/plaza prototype methods
City.prototype._buildPark = _buildPark;
City.prototype._buildPlaza = _buildPlaza;

// Attach signals/signage prototype methods
City.prototype._addLaneLines = _addLaneLines;
City.prototype._addZebra = _addZebra;
City.prototype._addTrafficLight = _addTrafficLight;
City.prototype._addPedestrianLight = _addPedestrianLight;
City.prototype._applyPedLightVisual = _applyPedLightVisual;
City.prototype._linkTrafficLights = _linkTrafficLights;
City.prototype._applyLightVisual = _applyLightVisual;
City.prototype.updateTrafficLights = updateTrafficLights;
City.prototype._placeCameras = _placeCameras;
City.prototype._addRoadworks = _addRoadworks;
City.prototype._addLamps = _addLamps;
City.prototype._createStreetLamp = _createStreetLamp;
City.prototype._createSignBoard = _createSignBoard;
City.prototype._createSign = _createSign;
City.prototype._createDoubleSign = _createDoubleSign;

// Attach building prototype methods
City.prototype._buildBuildings = _buildBuildings;
City.prototype._buildBuildingsFromModels = _buildBuildingsFromModels;
City.prototype._buildBuildingsSimple = _buildBuildingsSimple;
City.prototype._addBlockTrees = _addBlockTrees;
City.prototype._spawnTree = _spawnTree;
City.prototype._addStreetFurniture = _addStreetFurniture;
City.prototype._spawnBench = _spawnBench;
City.prototype._addWindows = _addWindows;
City.prototype._buildGhostIslands = _buildGhostIslands;
