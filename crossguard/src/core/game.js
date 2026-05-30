// Głowna logika gry, zasady punktacji
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

        // Cooldowny zeby nie nabijalo pkt pare razy na klatke
    this._lastCrossEvalAt = 0;
    this._lastJaywalkAt = -10;
    this._lastRedCrossAt = -10;
    this._lastGreenCrossAt = -10;
    this._wasOnCrossing = false;
    this._lastCrossing = null;
    this._lastCrossingLightState = null;
    this._completedCrossings = new Set(); // crossing keys already scored
    this._timeStoppedNearCrossing = 0;
    this._lastNearCrossingKey = null;

        // Aktywne porady od AI
    this._activeAdvice = null; // { text, check: () => bool, expiresAt }
    this._adviceCooldown = 0;

        // Eventy (na poczatku nudy, pozniej sie dzieje)
    const evMul = zone.id === 'residential' ? 2.2 : zone.id === 'school' ? 1.5 : 1.0;
    this._eventTimer = (18 + Math.random() * 18) * evMul;
    this._lprTimer   = (24 + Math.random() * 18) * evMul;
    this._cameraAlertTimer = 6 + Math.random() * 8;
    this._eventMul = evMul;

        // Ostatnia misja
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

        // Marker punktu docelowego - widać go wszędzie
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

        // Strzalka navi nad graczem, kręci sie w kierunku celu
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

    // Obsługa opóźnienia zakończenia gry po śmierci gracza
    if (this.player.isDead) {
      if (this._deathTimer !== undefined) {
        this._deathTimer -= dt;
        if (this._deathTimer <= 0) {
          this._finish('accident');
        }
      }
      if (this._goalMarker) {
        this._goalMarker.rotation.y += dt * 0.6;
      }
      return;
    }

    this.elapsed += dt;
    const timeLeft = Math.max(0, this.timeLimit - this.elapsed);
    this.hud.setTimer(timeLeft);

        // Krecimy i bobbing markera
    if (this._goalMarker) {
      this._goalMarker.rotation.y += dt * 0.6;
      this._goalMarker.children[2].position.y = 14 + Math.sin(this.elapsed * 2) * 0.4;
    }
        // Strzalka navi musi lewitowac i gasnac przy celu
    if (this._navArrow) {
      const dx = this.goal.x - this.player.pos.x;
      const dz = this.goal.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      this._navArrow.position.set(this.player.pos.x, 3.2 + Math.sin(this.elapsed * 3) * 0.15, this.player.pos.z);
      this._navArrow.rotation.y = Math.atan2(dx, dz);
      this._navArrow.visible = d > 4;
    }
        // Podświetlamy tych wariatów co jadą na czerwonym
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
            // Zflagowani w LPR mają cyanowy kolor
      if (v._lprFlagged && !v._lprRing) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.5, 1.9, 18),
          new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.08;
        v.group.add(ring);
        v._lprRing = ring;
      }
      if (v._lprRing) {
        v._lprRing.material.opacity = 0.35 + 0.3 * Math.sin(this.elapsed * 4);
      }
    }

    // Weryfikacja gdzie jest gracz
    const pos = this.player.pos;
    const moving = this.player.moving;
    const onSidewalk = this.city.isOnSafeGround(pos.x, pos.z);
    const onCrossing = this.city.isOnCrossing(pos.x, pos.z);
    const onRoad = this.city.isOnRoad(pos.x, pos.z) && !onCrossing;

    // Weryfikacja zatrzymania przed przejściem bez sygnalizacji (skrzyżowaniem równorzędnym)
    let closestUnsigCrossing = null;
    let minCrossingDist = Infinity;
    for (const c of this.city.crossings) {
      if (c.light === null) {
        const dx = Math.max(0, c.x1 - pos.x, pos.x - c.x2);
        const dz = Math.max(0, c.z1 - pos.z, pos.z - c.z2);
        const dist = Math.hypot(dx, dz);
        if (dist < minCrossingDist) {
          minCrossingDist = dist;
          closestUnsigCrossing = c;
        }
      }
    }

    if (closestUnsigCrossing && minCrossingDist <= 2.0) {
      if (!moving) {
        this._timeStoppedNearCrossing += dt;
      }
      const cKey = `${closestUnsigCrossing.x1},${closestUnsigCrossing.z1}`;
      if (this._lastNearCrossingKey && this._lastNearCrossingKey !== cKey) {
        this._timeStoppedNearCrossing = 0;
      }
      this._lastNearCrossingKey = cKey;
    } else {
      this._timeStoppedNearCrossing = 0;
      this._lastNearCrossingKey = null;
    }

    // Ile jeszcze do przejscia
    const gd = Math.hypot(this.goal.x - pos.x, this.goal.z - pos.z);
    this.hud.setDist(gd);

    // Podpowiedzi na przejsciu
    let crossingLightForPed = null;
    if (onCrossing) {
      // Które światło kontroluje te pasy
      const tl = onCrossing.light;
      crossingLightForPed = tl ? (tl.state === 'green' ? 'red' :
                            tl.state === 'red' ? 'green' :
                            'amber') : null;
      // Zasada: jak auta stoja (czerwone) to pieszy idzie (zielone)
      this.hud.showCrossPrompt(crossingLightForPed);
    } else {
      this.hud.showCrossPrompt(null);
    }

    // Scoring za przejscia pasami
    const _crossingKey = (c) => `${c.x1},${c.z1},${c.x2},${c.z2}`;
    if (onCrossing && !this._wasOnCrossing) {
      // Wszedł na przejscie
      this.audio.crossingEnter();
      this._lastCrossing = onCrossing;
      const cKey = _crossingKey(onCrossing);
      const alreadyDone = this._completedCrossings.has(cKey);
      const tl = onCrossing.light;
      const pedState = tl ? (tl.state === 'green' ? 'red' : tl.state === 'red' ? 'green' : 'amber') : 'green';
      this._lastCrossingLightState = pedState;
      this._lastCrossingAlreadyDone = alreadyDone;

      // Weryfikacja zatrzymania (min. 0.5s) przed przejściem równorzędnym (bez sygnalizacji)
      if (tl === null && !alreadyDone) {
        if (this._timeStoppedNearCrossing < 0.5) {
          this.addScore(SCORE.STOP_VIOLATION, '⛔ Brak zatrzymania i ostrożności przed przejściem!', 'bad');
          this.violations++;
          this.audio.warn();
        }
      }
      this._timeStoppedNearCrossing = 0;
      this._lastNearCrossingKey = null;

      if (pedState === 'green' && !alreadyDone) {
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

    if (!this._wasOnCrossing && this.player.moving) {
      // Logic for ongoing state management moved above, just ensuring context persists
    }

    if (!this.city.isOnCrossing(this.player.pos.x, this.player.pos.z) && this._wasOnCrossing && this._lastCrossing) {
            // Zeszedl z przejscia
      this.audio.crossingExit();
      const exitedToSafe = this.city.isOnSafeGround(this.player.pos.x, this.player.pos.z);
      if (exitedToSafe && this._lastCrossingLightState === 'green' && !this._lastCrossingAlreadyDone) {
        this.addScore(SCORE.CROSS_GREEN, '✓ Bezpieczne przejście', 'good');
        this.successfulCrossings++;
        this._completedCrossings.add(_crossingKey(this._lastCrossing));
      }
      this._lastCrossing = null;
    }
    this._wasOnCrossing = !!onCrossing;

        // Sprawdzamy czy gracz posluchal porady
    if (this._activeAdvice && this.elapsed > this._activeAdvice.expiresAt) {
            // Czas minal, sprawdz czy typ zastosowal porade
      if (this._activeAdvice.check()) {
        this.addScore(SCORE.FOLLOW_ASSIST, '✓ Posłuchałeś Assist AI!', 'good');
      } else {
        this.addScore(SCORE.IGNORE_ASSIST, '⚠ Zignorowałeś radę Assist AI', 'bad');
      }
      this._activeAdvice = null;
    }

        // Odpalanie porad tekstowych
    this._adviceCooldown -= dt;
    if (!this._activeAdvice && this._adviceCooldown <= 0) {
      this._generateAdvice();
    }

        // Karaoke za wbijanie na pałe (jaywalking)
    if (onRoad && this.elapsed - this._lastJaywalkAt > 3.0) {
      this.addScore(SCORE.JAYWALK, '⛔ Wejście poza przejściem!', 'bad');
      this.violations++;
      this._lastJaywalkAt = this.elapsed;
    }

        // Wypadki aut z graczem - śmierć i automatyczna przegrana (poza devMode z KeyC)
    if (!this.player.isDead && !(this.player.devMode && this.player.keys && this.player.keys['KeyC'])) {
      const hit = this.traffic.vehicleHitting(pos);
      if (hit) {
        this.player.isDead = true;
        
        // Odrzut 3D (wystrzelenie w powietrze i odrzut poziomy zależny od prędkości auta)
        const horizKnockback = 1.45;
        const vertFling = 0.58;
        this.player.deathVelocity = new THREE.Vector3(
          hit.vx * hit.speed * horizKnockback,
          hit.speed * vertFling + 2.5, // Wystrzelenie w pionie
          hit.vz * hit.speed * horizKnockback
        );

        // Losowy kierunek i prędkość obrotu (koziołkowania) dla naturalniejszego efektu
        this.player.deathSpinX = (Math.random() > 0.5 ? 1 : -1) * (2.8 + Math.random() * 2.2);
        this.player.deathSpinY = (Math.random() > 0.5 ? 1 : -1) * (3.8 + Math.random() * 3.2);
        this.player.deathSpinZ = Math.random() > 0.5 ? -Math.PI / 2 : Math.PI / 2;

        this.player.vel.set(0, 0, 0);
        this._deathTimer = 1.8; // Zwiększone z 0.8s, aby dać czas na dramatyczną pauzę po wylądowaniu
        this.audio.crash();
        this.addScore(SCORE.HIT_BY_CAR, '🚨 KATASTROFA! Potrącenie przez pojazd!', 'bad');
        this.violations++;
      }
    }

        // Eventy karetki (reagujesz = pkt, olewasz = minus)
        // Sprawdz czy karetka jest dosc blisko
    let anyEmergencyNear = false;
    for (const ev of this.traffic.emergency) {
      const d = Math.hypot(ev.pos.x - pos.x, ev.pos.z - pos.z);

      if (d < 22) {
        anyEmergencyNear = true;
        if (!ev._sirenAlerted) {
          ev._sirenAlerted = true;
          this.hud.alert('🚨 Pojazd uprzywilejowany w pobliżu!', 'warn');
        }
      }
      if (d > 30) {
        ev._sirenAlerted = false;
      }

      if (d < 15 && !ev._reacted) {
        if (onSidewalk) {
          ev._reacted = true;
          this.addScore(SCORE.REACT_EMERGENCY, '✓ Ustąpiłeś służbom!', 'good');
        } else if (!onSidewalk && !ev._penalized) {
          ev._penalized = true;
          this.addScore(-10, '⚠ Nie ustąpiłeś pojazdowi uprzywilejowanemu!', 'bad');
          this.violations++;
        }
      }
    }
        // Odpal syrene jak trzeba
    if (anyEmergencyNear) {
      this.audio.sirenStart();
    } else {
      this.audio.sirenStop();
    }

        // Doszedles do celu
    if (gd < 2.5) {
      this.audio.goalReached();
      this.addScore(SCORE.REACH_GOAL, '🏁 Cel osiągnięty!', 'good');
      this._finish('success');
      return;
    }

        // Skonczył sie czas, zgon
    if (this.elapsed >= this.timeLimit) {
      this._finish('timeout');
      return;
    }


        // Randomowe dziwne sytuacje na mapie
    this._eventTimer -= dt;
    if (this._eventTimer <= 0) {
      this._eventTimer = (24 + Math.random() * 28) * this._eventMul;
      this._triggerRandomEvent();
    }

        // Sprawdzanie kamer avigilon
    this._cameraAlertTimer -= dt;
    if (this._cameraAlertTimer <= 0) {
      this._cameraAlertTimer = 8 + Math.random() * 12;
      for (const cam of this.city.cameras) {
        const camToPlayer = Math.hypot(cam.x - pos.x, cam.z - pos.z);
        if (camToPlayer < 30) {
                    // Kamera skanuje czy ktos nie przejechal na wariata
          for (const v of this.traffic.vehicles) {
            if (v.runsRed && !v.isEmergency && !v._avigilonFlagged) {
              const camToVeh = Math.hypot(cam.x - v.pos.x, cam.z - v.pos.z);
              if (camToVeh < 25) {
                v._avigilonFlagged = true;
                this.hud.alert('📷 AVIGILON: pojazd łamie przepisy wykryty!', 'warn');
                this.audio.cameraDetect();
                break;
              }
            }
          }
        }
      }
    }

        // Alarmy systemu LPR
    this._lprTimer -= dt;
    if (this._lprTimer <= 0) {
      this._lprTimer = (28 + Math.random() * 24) * this._eventMul;
            // LPR łapie kogos
      const candidates = this.traffic.vehicles.filter(v => !v.isEmergency && !v._lprFlagged);
      if (candidates.length > 0) {
        const v = candidates[Math.floor(Math.random() * candidates.length)];
        v._lprFlagged = true;
        this.hud.incLPR();
        this.hud.alert('LPR: pojazd na obserwacji namierzony!', 'warn', 2400);
        this.audio.lprScan();
      }
    }

    // Check if any car is passing close to the player (within 9 meters)
    for (const v of this.traffic.vehicles) {
      const d = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z);
      if (d < 9.0) {
        if (v.speed > 2.0 && !v._passbyTriggered) {
          v._passbyTriggered = true;
          this.audio.playPassBy(v.type, v.speed);
        }
        // Play brake squeal if the vehicle has triggered the pass-by sound and is now braking/stopping
        if (v.speed > 0.05 && v.speed < 2.2 && v._passbyTriggered && !v._brakeTriggered) {
          v._brakeTriggered = true;
          this.audio.playBrakeSqueal(v.type, v.type === 'truck' || v.type === 'bus' ? 0.12 : 0.07);
        }
      } else if (d > 12.0) {
        v._passbyTriggered = false;
        v._brakeTriggered = false;
      }
    }

        // Update audio per frame z pełnym stanem gracza
    const running = this.player.keys && (this.player.keys['ShiftLeft'] || this.player.keys['ShiftRight']);
    this.audio.update(dt, {
      moving: this.player.moving,
      running: !!running,
      onRoad: onRoad,
      onCrossing: !!onCrossing,
      crossingLight: crossingLightForPed,
      timeLeft: timeLeft,
      timeLimit: this.timeLimit,
    });
  }

  _generateAdvice() {
    const pos = this.player.pos;
    const onSidewalk = this.city.isOnSafeGround(pos.x, pos.z);
    const onCrossing = this.city.isOnCrossing(pos.x, pos.z);

        // Priorytet 1: uwazaj wariat
    for (const v of this.traffic.vehicles) {
      if (v.runsRed && !v.isEmergency) {
        const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
        if (d < 25 && d > 5) {
          const dir = v.vx > 0 ? 'wschód' : v.vx < 0 ? 'zachód' : v.vz > 0 ? 'północ' : 'południe';
          const text = `⚠ Pojazd z ${dir} ignoruje światło! Czekaj na chodniku.`;
          this.hud.setAssist(text);
          this._activeAdvice = {
            text,
            check: () => this.city.isOnSafeGround(this.player.pos.x, this.player.pos.z),
            expiresAt: this.elapsed + 8,
          };
          this._adviceCooldown = 12;
          return;
        }
      }
    }

        // Priorytet 2: jedzie erka, zrob miejsce
    for (const ev of this.traffic.emergency) {
      if (ev._reacted) continue;
      const d = Math.hypot(ev.pos.x - pos.x, ev.pos.z - pos.z);
      if (d < 22 && d > 5) {
        const dir = ev.vx > 0 ? 'wschodu' : ev.vx < 0 ? 'zachodu' : ev.vz > 0 ? 'północy' : 'południa';
        const text = `🚑 Pojazd uprzywilejowany od ${dir}! Zejdź na chodnik.`;
        this.hud.setAssist(text);
        this._activeAdvice = {
          text,
          check: () => this.city.isOnSafeGround(this.player.pos.x, this.player.pos.z),
          expiresAt: this.elapsed + 10,
        };
        this._adviceCooldown = 14;
        return;
      }
    }

        // Priorytet 3: stój na czerwonym
    if (onCrossing || onSidewalk) {
      for (const c of this.city.crossings) {
        const d = Math.hypot((c.x1+c.x2)/2 - pos.x, (c.z1+c.z2)/2 - pos.z);
        if (d < 8) {
          const pedState = c.light ? (c.light.state === 'green' ? 'red' : c.light.state === 'red' ? 'green' : 'amber') : 'green';
          if (pedState === 'red') {
            const text = '🔴 Czerwone światło dla pieszych - czekaj!';
            this.hud.setAssist(text);
            this._activeAdvice = {
              text,
              check: () => !this.city.isOnCrossing(this.player.pos.x, this.player.pos.z),
              expiresAt: this.elapsed + 6,
            };
            this._adviceCooldown = 10;
            return;
          }
        }
      }
    }

        // Priorytet 4: wlaza na jezdnie, mow im zeby znalezli przejscie
    const onRoad = this.city.isOnRoad(pos.x, pos.z) && !onCrossing;
    if (onRoad) {
      const text = '⛔ Jesteś na jezdni! Znajdź przejście dla pieszych.';
      this.hud.setAssist(text);
      this._activeAdvice = {
        text,
        check: () => this.city.isOnSafeGround(this.player.pos.x, this.player.pos.z) || this.city.isOnCrossing(this.player.pos.x, this.player.pos.z),
        expiresAt: this.elapsed + 5,
      };
      this._adviceCooldown = 8;
      return;
    }

        // Opcja awaryjna: losuj standardowy tip
    this._adviceCooldown = 10 + Math.random() * 6;
  }

  _triggerRandomEvent() {
    const events = [
      () => {
        this.hud.alert('AVIGILON: pojazd ignoruje czerwone światło', 'warn');
        this.audio.cameraDetect();
        const v = this.traffic.vehicles.find(v => !v.runsRed);
        if (v) v.runsRed = true;
      },
      () => {
        this.traffic._spawnEmergency();
      },
      () => {
        this.hud.alert('AWARIA SYGNALIZACJI - zachowaj ostrożność', 'warn');
        this.audio.warn();
        const tl = this.city.trafficLights[Math.floor(Math.random() * this.city.trafficLights.length)];
        // Wymuszamy żółte światło na obu sygnalizatorach na tej samej osi (para)
        const pairedLights = this.city.trafficLights.filter(
          x => x.intersection.x === tl.intersection.x &&
               x.intersection.z === tl.intersection.z &&
               x.axis === tl.axis
        );
        for (const light of pairedLights) {
          light.state = 'amber';
          light.timer = 0;
        }
        this.city._applyLightVisual(pairedLights);
      },
      () => {
        this.hud.alert('LPR: skradzione auto namierzone', 'warn');
        this.hud.incLPR();
        this.audio.lprScan();
      },
      () => {
                // Roboty drogowe - blokujemy graczowi droge zeby musial obejść
        this._spawnRoadworks();
      },
    ];
    const ev = events[Math.floor(Math.random() * events.length)];
    ev();
  }

  _spawnRoadworks() {
    const pos = this.player.pos;
        // Znajdz chodnik blisko typa
    const nearby = this.city.sidewalks.filter(s => {
      const cx = (s.x1 + s.x2) / 2, cz = (s.z1 + s.z2) / 2;
      const d = Math.hypot(cx - pos.x, cz - pos.z);
      return d > 10 && d < 50; // not too close, not too far
    });
    if (nearby.length === 0) return;

    const s = nearby[Math.floor(Math.random() * nearby.length)];
    const cx = (s.x1 + s.x2) / 2, cz = (s.z1 + s.z2) / 2;

        // Pachołki i beczki
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6a00 });
    for (let c = -1; c <= 1; c++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8), coneMat);
      cone.position.set(cx + c * 0.8, 0.45, cz);
      cone.castShadow = true;
      this.city.scene.add(cone);
    }
        // Zapora
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.8, 0.15),
      new THREE.MeshLambertMaterial({ color: 0xffcc00 })
    );
    bar.position.set(cx, 0.4, cz);
    this.city.scene.add(bar);

        // Hitbox żeby gracz nie przeszedł
    this.city.obstacles.push({ x1: cx - 1.8, z1: cz - 1.0, x2: cx + 1.8, z2: cz + 1.0 });

    this.hud.alert('🚧 Roboty drogowe - chodnik zamknięty! Szukaj objazu!', 'warn');
    this.audio.roadworks();
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
        // Latajaca liczba punktow nad graczem - instant feedback
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
    this.audio.sirenStop();
    this.audio.stopHeartbeat();
    this.audio.stopCrossingBeep();
    this.hud.showCrossPrompt(null);
    
    let grade = gradeFor(this.score);
    if (reason === 'accident') {
      grade = { letter: 'F', color: '#e63946', label: 'POTRĄCENIE PRZEZ POJAZD (KURS BRD WYMAGANY)' };
    }
    
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
