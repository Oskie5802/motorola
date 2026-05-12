// === Core game: mission, scoring rules, dynamic events, win/lose ===
import * as THREE from 'three';
import { SCORE, gradeFor } from './config.js';

const MISSION_LABELS = [
  'Idź do szkoły',
  'Dotrzyj na przystanek autobusowy',
  'Spotkanie z przyjaciółmi w parku',
  'Wizyta w sklepie spożywczym',
  'Powrót do domu',
  'Wizyta u lekarza',
  'Praca po szkole',
  'Misja: ewakuacja pieszych ze strefy zagrożenia',
];

export class GameLogic {
  constructor({ city, player, traffic, hud, audio, zone }) {
    this.city = city;
    this.player = player;
    this.traffic = traffic;
    this.hud = hud;
    this.audio = audio;
    this.zone = zone;

    this.score = 0;
    this.elapsed = 0;
    this.timeLimit = zone.id === 'highway' ? 240 : 180;
    this.violations = 0;
    this.successfulCrossings = 0;
    this.usedPhone = false;
    this.state = 'playing'; // playing | done

    this._goalMarker = null;
    this._setupGoal();

    // Cooldowns to prevent multi-score per frame
    this._lastCrossEvalAt = 0;
    this._lastJaywalkAt = -10;
    this._lastRedCrossAt = -10;
    this._lastGreenCrossAt = -10;
    this._wasOnCrossing = false;
    this._lastCrossing = null;
    this._lastCrossingLightState = null;

    // Dynamic events - quieter in residential, more chaotic later
    const evMul = zone.id === 'residential' ? 2.2 : zone.id === 'school' ? 1.5 : 1.0;
    this._eventTimer = (18 + Math.random() * 18) * evMul;
    this._lprTimer   = (24 + Math.random() * 18) * evMul;
    this._eventMul = evMul;

    // Final mission
    const missionLabel = zone.id === 'highway'
      ? MISSION_LABELS[MISSION_LABELS.length - 1]
      : MISSION_LABELS[Math.floor(Math.random() * (MISSION_LABELS.length - 1))];
    this.hud.setMission(missionLabel);
    this.hud.setAssist(`Witaj, Alex. Cel: ${missionLabel}. Powodzenia!`);
  }

  _setupGoal() {
    const start = this.player.pos;
    const goal = this.city.farSpawn(start.x, start.z, this.city.size * 0.5);
    this.goal = goal;

    // Beacon marker - visible from across the city
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb800, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 14, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0.55 })
    );
    pillar.position.y = 7;
    group.add(pillar);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd866 })
    );
    sphere.position.y = 14;
    group.add(sphere);
    group.position.set(goal.x, 0, goal.z);
    this.city.scene.add(group);
    this._goalMarker = group;

    // Navigation arrow - hovers above the player, rotates toward goal
    const arrowGroup = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.0, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb800 })
    );
    cone.rotation.x = Math.PI / 2; // point along +Z
    cone.position.z = 0.3;
    arrowGroup.add(cone);
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.07, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0.7 })
    );
    ring2.rotation.x = Math.PI / 2;
    arrowGroup.add(ring2);
    this.city.scene.add(arrowGroup);
    this._navArrow = arrowGroup;
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.elapsed += dt;
    this.hud.setTimer(Math.max(0, this.timeLimit - this.elapsed));

    // Animate goal beacon
    if (this._goalMarker) {
      this._goalMarker.rotation.y += dt * 0.6;
      this._goalMarker.children[2].position.y = 14 + Math.sin(this.elapsed * 2) * 0.4;
    }
    // Update nav arrow (hovers above player, points at goal, fades close to goal)
    if (this._navArrow) {
      const dx = this.goal.x - this.player.pos.x;
      const dz = this.goal.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      this._navArrow.position.set(this.player.pos.x, 3.2 + Math.sin(this.elapsed * 3) * 0.15, this.player.pos.z);
      this._navArrow.rotation.y = Math.atan2(dx, dz);
      this._navArrow.visible = d > 4;
    }
    // Highlight red-light-runner vehicles with a red glow ring
    for (const v of this.traffic.vehicles) {
      if (v.runsRed && !v._dangerRing) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.3, 1.7, 18),
          new THREE.MeshBasicMaterial({ color: 0xff2233, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        v.group.add(ring);
        v._dangerRing = ring;
      }
      if (v._dangerRing) {
        v._dangerRing.material.opacity = 0.45 + 0.35 * Math.sin(this.elapsed * 6);
      }
    }

    // === Position checks ===
    const pos = this.player.pos;
    const moving = this.player.moving;
    const onSidewalk = this.city.isOnSafeGround(pos.x, pos.z);
    const onCrossing = this.city.isOnCrossing(pos.x, pos.z);
    const onRoad = this.city.isOnRoad(pos.x, pos.z) && !onCrossing;

    // === Crossing prompt ===
    if (onCrossing) {
      // Determine light controlling this crossing
      const tl = onCrossing.light;
      const lightStateForPed = tl.state === 'green' ? 'red' :
                               tl.state === 'red' ? 'green' :
                               'amber';
      // For pedestrian: when cars have red -> peds can go (green)
      this.hud.showCrossPrompt(lightStateForPed);
    } else {
      this.hud.showCrossPrompt(null);
    }

    // === Score rules: detect crossing entry/exit ===
    if (onCrossing && !this._wasOnCrossing) {
      // Entered a crossing
      this._lastCrossing = onCrossing;
      const tl = onCrossing.light;
      const pedState = tl.state === 'green' ? 'red' : tl.state === 'red' ? 'green' : 'amber';
      this._lastCrossingLightState = pedState;
      if (pedState === 'green') {
        this.addScore(SCORE.USE_CROSSING, 'Korzystasz z przejścia');
        if (this.player.onPhone) {
          this.addScore(SCORE.PHONE_CROSS, '⚠ Telefon na przejściu', 'warn');
          this.usedPhone = true;
        }
      } else if (pedState === 'red') {
        this.addScore(SCORE.CROSS_RED, '⛔ Wszedłeś na czerwonym!', 'bad');
        this.violations++;
        this._lastRedCrossAt = this.elapsed;
      }
    }
    if (!onCrossing && this._wasOnCrossing && this._lastCrossing) {
      // Exited a crossing
      const exitedToSafe = this.city.isOnSafeGround(pos.x, pos.z);
      if (exitedToSafe && this._lastCrossingLightState === 'green') {
        this.addScore(SCORE.CROSS_GREEN, '✓ Bezpieczne przejście', 'good');
        this.successfulCrossings++;
      }
      this._lastCrossing = null;
    }
    this._wasOnCrossing = !!onCrossing;

    // === Jaywalking penalty (entering road outside crossing) ===
    if (onRoad && this.elapsed - this._lastJaywalkAt > 3.0) {
      this.addScore(SCORE.JAYWALK, '⛔ Wejście poza przejściem!', 'bad');
      this.violations++;
      this._lastJaywalkAt = this.elapsed;
    }

    // === Vehicle collision ===
    const hit = this.traffic.vehicleHitting(pos);
    if (hit && this.elapsed - (this._lastHitAt || -10) > 3) {
      this._lastHitAt = this.elapsed;
      this.addScore(SCORE.HIT_BY_CAR, '🚨 Potrącenie przez pojazd!', 'bad');
      this.audio.bad();
      this.violations++;
      // Push player away
      this.player.pos.x -= (hit.vx) * 2;
      this.player.pos.z -= (hit.vz) * 2;
    }

    // === Emergency vehicle proximity (react = good) ===
    for (const ev of this.traffic.emergency) {
      const d = Math.hypot(ev.pos.x - pos.x, ev.pos.z - pos.z);
      if (d < 15 && !ev._reacted && onSidewalk) {
        ev._reacted = true;
        this.addScore(SCORE.REACT_EMERGENCY, '✓ Ustąpiłeś służbom!', 'good');
      }
    }

    // === Goal reached ===
    const gd = Math.hypot(this.goal.x - pos.x, this.goal.z - pos.z);
    if (gd < 2.5) {
      this.addScore(SCORE.REACH_GOAL, '🏁 Cel osiągnięty!', 'good');
      this._finish('success');
      return;
    }

    // === Timeout ===
    if (this.elapsed >= this.timeLimit) {
      this._finish('timeout');
      return;
    }

    // === Dynamic events ===
    this._eventTimer -= dt;
    if (this._eventTimer <= 0) {
      this._eventTimer = (24 + Math.random() * 28) * this._eventMul;
      this._triggerRandomEvent();
    }

    // === LPR alerts ===
    this._lprTimer -= dt;
    if (this._lprTimer <= 0) {
      this._lprTimer = (28 + Math.random() * 24) * this._eventMul;
      this.hud.incLPR();
      this.hud.alert('LPR ALERT - pojazd na obserwacji', 'warn', 2400);
    }
  }

  _triggerRandomEvent() {
    const events = [
      () => {
        this.hud.alert('AVIGILON: pojazd ignoruje czerwone światło', 'warn');
        this.audio.warn();
        const v = this.traffic.vehicles.find(v => !v.runsRed);
        if (v) v.runsRed = true;
      },
      () => {
        this.hud.alert('SYRENA - Pojazd uprzywilejowany', 'info');
        this.audio.siren();
        this.traffic._spawnEmergency();
      },
      () => {
        this.hud.alert('AWARIA SYGNALIZACJI - zachowaj ostrożność', 'warn');
        const tl = this.city.trafficLights[Math.floor(Math.random() * this.city.trafficLights.length)];
        // Force amber for a moment
        tl.state = 'amber'; tl.timer = 0;
        this.city._applyLightVisual([tl]);
      },
      () => {
        this.hud.alert('LPR: skradzione auto namierzone', 'warn');
        this.hud.incLPR();
      },
      () => {
        this.hud.alert('Assist AI: korek na trasie głównej', 'info');
        this.hud.setAssist('Asystent: korek przed Tobą - rozważ obejście.');
      },
    ];
    const ev = events[Math.floor(Math.random() * events.length)];
    ev();
  }

  addScore(delta, text, kind = 'info') {
    this.score += delta;
    this.hud.setScore(this.score);
    if (text) {
      const sign = delta >= 0 ? '+' : '';
      this.hud.alert(`${text}  ${sign}${delta}`, kind);
      if (delta > 0) this.audio.good();
      else this.audio.bad();
    }
    // Floating number above the player so feedback is tied to the action
    if (this.camera) {
      this.hud.spawnFloater(
        { x: this.player.pos.x, z: this.player.pos.z },
        `${delta >= 0 ? '+' : ''}${delta}`,
        delta >= 0 ? 'pos' : 'neg',
        this.camera,
      );
    }
  }

  _finish(reason) {
    this.state = 'done';
    this.hud.showCrossPrompt(null);
    const grade = gradeFor(this.score);
    const result = {
      reason,
      score: Math.round(this.score),
      time: Math.round(this.elapsed),
      crossings: this.successfulCrossings,
      violations: this.violations,
      grade,
      zone: this.zone,
    };
    if (this.onComplete) this.onComplete(result);
  }
}
