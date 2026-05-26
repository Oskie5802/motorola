// Audio: rozbudowany syntezator WebAudio, immersja pelna geba
// Bez zewnetrznych plikow - wszystko generowane proceduralnie

export class AudioSystem {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;

    // Referki do ciaglych dzwiekow
    this._hum = null;
    this._wind = null;
    this._cityDrone = null;
    this._rainNode = null;
    this._heartbeat = null;
    this._crossingBeep = null;
    this._footstepPhase = 0;
    this._lastFootstepAt = 0;
    this._engineDrones = new Map(); // vehicle id -> {nodes}

    // Stany immersji
    this._dangerLevel = 0;   // 0-1 jak blisko niebezpieczenstwa
    this._tensionLevel = 0;  // 0-1 napięcie z czasem
    this._onRoadTime = 0;    // ile czasu na jezdni
  }

  _init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Master chain: sfx/ambient/music -> master -> destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.5;
      this.ambientGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.04;
      this.musicGain.connect(this.masterGain);

      // Kompresor zeby nie szlo w clip jak duzo dzwiekow naraz
      this._compressor = this.ctx.createDynamicsCompressor();
      this._compressor.threshold.value = -24;
      this._compressor.knee.value = 12;
      this._compressor.ratio.value = 4;
      this.masterGain.disconnect();
      this.masterGain.connect(this._compressor);
      this._compressor.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
  }

  resume() {
    this._init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }


  // === BAZOWE NARZEDZIA SYNTEZY ===

  // Proste blipy z envelope
  blip(freq = 880, dur = 0.08, vol = 0.12, type = 'square') {
    if (!this.enabled || this.muted) return;
    this._init();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(this.sfxGain);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.stop(this.ctx.currentTime + dur + 0.01);
  }

  // Tonalny sfx z attack-decay-release
  _tone(freq, dur, vol, type, attack = 0.01, decay = 0.3, dest = null) {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(vol * decay, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
    return { osc: o, gain: g };
  }

  // Szum bialy/rozowy do ambientu
  _noiseBuffer(dur = 2, type = 'white') {
    const len = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else {
      // Rozowy szum - lepszy do ambientu
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }


  // === DZWIEKI EVENTOWE (SFX) ===

  // Zdobyles punkty, melodyczny dzing
  good() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Trojdzwiek C-E-G w gorze, delikatny jak dzwonek
    const notes = [523, 659, 784];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, t + i * 0.06);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.35);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.4);
    });
    // Shimmer na wierzchu (harmonik)
    const sh = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sh.type = 'triangle';
    sh.frequency.value = 1568;
    sg.gain.setValueAtTime(0.001, t + 0.12);
    sg.gain.linearRampToValueAtTime(0.05, t + 0.15);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sh.connect(sg).connect(this.sfxGain);
    sh.start(t + 0.12);
    sh.stop(t + 0.55);
  }

  // Straciles punkty, ciemny ton
  bad() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Zlosliwy bas + dysonans
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(180, t);
    o1.frequency.linearRampToValueAtTime(120, t + 0.25);
    o2.type = 'square';
    o2.frequency.setValueAtTime(185, t); // lekki detune daje napięcie
    o2.frequency.linearRampToValueAtTime(110, t + 0.25);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o1.connect(g).connect(this.sfxGain);
    o2.connect(g);
    o1.start(t); o2.start(t);
    o1.stop(t + 0.4); o2.stop(t + 0.4);
    // Dudnienie
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = 55;
    sg.gain.setValueAtTime(0.18, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    sub.connect(sg).connect(this.sfxGain);
    sub.start(t); sub.stop(t + 0.35);
  }

  // Ostrzezenie - podwojny sygnał
  warn() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.001, t + i * 0.14);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.14 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.1);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.14);
      o.stop(t + i * 0.14 + 0.12);
    }
  }

  // Chime motoroli na zakonczenie levelu
  motoChime() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Signature dwutonowka Moto
    const freqs = [660, 990, 1320];
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, t + i * 0.11);
      g.gain.linearRampToValueAtTime(0.1, t + i * 0.11 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.4);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 0.45);
    });
  }

  // Klakson aut (bardziej realistyczny)
  honk() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Dwa oscylatory blisko siebie = charakterystyczny klakson
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o1.type = 'square';
    o2.type = 'sawtooth';
    o1.frequency.value = 340;
    o2.frequency.value = 420;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.02);
    g.gain.setValueAtTime(0.14, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1200;
    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g).connect(this.sfxGain);
    o1.start(t); o2.start(t);
    o1.stop(t + 0.3); o2.stop(t + 0.3);
  }

  // Dlugi klakson ciężarówki
  truckHonk() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.linearRampToValueAtTime(175, t + 0.5);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.04);
    g.gain.setValueAtTime(0.12, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 600;
    o.connect(filt).connect(g).connect(this.sfxGain);
    o.start(t); o.stop(t + 0.65);
  }


  // === SYRENA (karetka/policja) ===

  sirenStart() {
    if (!this.enabled || this._sirenOsc || this.muted) return;
    this._init();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    g.gain.value = 0.06;

    // Leciutki chorus na syrenie zeby brzmiala bardziej realnie
    const o2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    o2.type = 'sine';
    g2.gain.value = 0.025;

    o.connect(g).connect(this.sfxGain);
    o2.connect(g2).connect(this.sfxGain);
    o.start(); o2.start();
    this._sirenOsc = o;
    this._sirenOsc2 = o2;
    this._sirenGain = g;
    this._sirenGain2 = g2;

    const schedule = () => {
      if (!this._sirenOsc) return;
      const t = this.ctx.currentTime;
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(620, t);
      o.frequency.linearRampToValueAtTime(1000, t + 0.4);
      o.frequency.linearRampToValueAtTime(620, t + 0.8);
      // Chorus jest odsuniety w fazie
      o2.frequency.cancelScheduledValues(t);
      o2.frequency.setValueAtTime(625, t);
      o2.frequency.linearRampToValueAtTime(1008, t + 0.42);
      o2.frequency.linearRampToValueAtTime(625, t + 0.82);
      this._sirenTimer = setTimeout(schedule, 700);
    };
    schedule();
  }

  sirenStop() {
    if (!this._sirenOsc) return;
    clearTimeout(this._sirenTimer);
    try {
      const t = this.ctx.currentTime;
      this._sirenGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      this._sirenOsc.stop(t + 0.2);
      if (this._sirenOsc2) {
        this._sirenGain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        this._sirenOsc2.stop(t + 0.2);
      }
    } catch {}
    this._sirenOsc = null;
    this._sirenOsc2 = null;
    this._sirenGain = null;
    this._sirenGain2 = null;
  }


  // === KROKI GRACZA ===

  footstep(surface = 'sidewalk', running = false) {
    if (!this.enabled || this.muted) return;
    const now = performance.now();
    const minInterval = running ? 220 : 350;
    if (now - this._lastFootstepAt < minInterval) return;
    this._lastFootstepAt = now;

    this._init();
    const t = this.ctx.currentTime;
    this._footstepPhase++;

    // Rozne tekstury na roznych nawierzchniach
    const configs = {
      sidewalk: { freq: 120 + Math.random() * 40, dur: 0.06, vol: 0.06, filter: 800 },
      road:     { freq: 90 + Math.random() * 30,  dur: 0.05, vol: 0.05, filter: 600 },
      crossing: { freq: 150 + Math.random() * 50, dur: 0.04, vol: 0.07, filter: 1200 },
    };
    const c = configs[surface] || configs.sidewalk;

    // Szum kroków (noise burst)
    const buf = this._noiseBuffer(0.08, 'white');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = c.filter;
    filt.Q.value = 1.2;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(c.vol * (running ? 1.3 : 1), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + c.dur + 0.03);
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + c.dur + 0.05);

    // Subtelne uderzenie (thud)
    const thud = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.value = c.freq;
    tg.gain.setValueAtTime(c.vol * 0.6, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    thud.connect(tg).connect(this.sfxGain);
    thud.start(t);
    thud.stop(t + 0.06);

    // Co drugi krok delikatnie inny ton (lewa-prawa noga)
    if (this._footstepPhase % 2 === 0) {
      const click = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      click.type = 'triangle';
      click.frequency.value = c.freq * 2.5;
      cg.gain.setValueAtTime(0.02, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      click.connect(cg).connect(this.sfxGain);
      click.start(t); click.stop(t + 0.04);
    }
  }


  // === SYGNALIZATOR DLA PIESZYCH (bip-bip na przejsciu) ===

  startCrossingBeep(state) {
    // state: 'green' = szybkie bip, 'red' = wolne klik, 'amber' = szybkie ostrzezenie
    this.stopCrossingBeep();
    if (!this.enabled || this.muted) return;
    this._init();

    const intervals = { green: 400, red: 1200, amber: 250 };
    const freqs = { green: 1200, red: 880, amber: 1000 };
    const interval = intervals[state] || 800;
    const freq = freqs[state] || 1000;

    const beep = () => {
      if (!this._crossingBeepActive) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(state === 'green' ? 0.08 : 0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.connect(g).connect(this.sfxGain);
      o.start(t);
      o.stop(t + 0.08);
      this._crossingBeepTimer = setTimeout(beep, interval);
    };

    this._crossingBeepActive = true;
    beep();
  }

  stopCrossingBeep() {
    this._crossingBeepActive = false;
    clearTimeout(this._crossingBeepTimer);
  }


  // === BICIE SERCA (na jezdni / w niebezpieczenstwie) ===

  startHeartbeat() {
    if (this._heartbeatActive || !this.enabled || this.muted) return;
    this._init();
    this._heartbeatActive = true;

    const beat = () => {
      if (!this._heartbeatActive) return;
      const t = this.ctx.currentTime;

      // Podwojne bicie: LUB-DUB
      for (let i = 0; i < 2; i++) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = i === 0 ? 55 : 45;
        const offset = i * 0.15;
        g.gain.setValueAtTime(0.001, t + offset);
        g.gain.linearRampToValueAtTime(i === 0 ? 0.12 : 0.08, t + offset + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.15);
        o.connect(g).connect(this.sfxGain);
        o.start(t + offset);
        o.stop(t + offset + 0.18);
      }

      this._heartbeatTimer = setTimeout(beat, 750);
    };
    beat();
  }

  stopHeartbeat() {
    this._heartbeatActive = false;
    clearTimeout(this._heartbeatTimer);
  }


  // === DZWIEKI ZBIERANIA / OSIAGNIEC ===

  // Dotarles do celu
  goalReached() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Triumfalny arpeggio C-E-G-C
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, t + i * 0.08);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.55);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.6);
    });
    // Bonus shimmer
    setTimeout(() => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = 2000 + i * 400;
        g.gain.setValueAtTime(0.001, t2);
        g.gain.linearRampToValueAtTime(0.04, t2 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t2 + 0.6);
        o.connect(g).connect(this.sfxGain);
        o.start(t2); o.stop(t2 + 0.65);
      }
    }, 350);
  }

  // Potrącenie przez auto
  crash() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;

    // Noise burst jak zderzenie
    const buf = this._noiseBuffer(0.3, 'white');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3000, t);
    filt.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(t); src.stop(t + 0.4);

    // Sub-boom
    const boom = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    bg.gain.setValueAtTime(0.3, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    boom.connect(bg).connect(this.sfxGain);
    boom.start(t); boom.stop(t + 0.4);
  }

  // Odblokowanie radia
  radioUnlock() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Statyczny szum -> czysty sygnal
    const buf = this._noiseBuffer(0.5, 'white');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2000;
    filt.Q.value = 3;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(t); src.stop(t + 0.5);

    // Potem czysty bip radia
    setTimeout(() => {
      this.blip(1200, 0.08, 0.1, 'sine');
      setTimeout(() => this.blip(1600, 0.1, 0.1, 'sine'), 100);
    }, 300);
  }

  // Komunikat radiowy (krótki szum + bip)
  radioMessage() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;

    // Szum statyczny
    const buf = this._noiseBuffer(0.15, 'white');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1800;
    filt.Q.value = 5;
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(t); src.stop(t + 0.15);

    // Klik PTT
    this.blip(800, 0.03, 0.08, 'square');
  }

  // Tykanie zegara (jak mało czasu)
  tick() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 3200;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g).connect(this.sfxGain);
    o.start(t); o.stop(t + 0.04);
  }

  // Dzwiek wejscia na pasy
  crossingEnter() {
    if (!this.enabled || this.muted) return;
    this._init();
    // Subtelny blip potwierdzajacy wejscie na pasy
    this.blip(1000, 0.05, 0.06, 'sine');
    setTimeout(() => this.blip(1200, 0.04, 0.04, 'sine'), 50);
  }

  // Dzwiek wyjscia z przejscia (bezpieczne)
  crossingExit() {
    if (!this.enabled || this.muted) return;
    this._init();
    this.blip(880, 0.06, 0.05, 'triangle');
  }

  // Dzwiek zmany swiatel
  lightChange(toState) {
    if (!this.enabled || this.muted) return;
    this._init();
    if (toState === 'green') {
      // Charakterystyczny bip-bip przejscia
      this.blip(1100, 0.05, 0.06, 'sine');
      setTimeout(() => this.blip(1100, 0.05, 0.06, 'sine'), 400);
    } else if (toState === 'red') {
      this.blip(600, 0.08, 0.04, 'sine');
    }
  }

  // Kamera avigilon - elektroniczny scan
  cameraDetect() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.linearRampToValueAtTime(1200, t + 0.15);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.sfxGain);
    o.start(t); o.stop(t + 0.25);
    // Kliknięcie migawki
    setTimeout(() => {
      if (!this.ctx) return;
      const buf = this._noiseBuffer(0.03, 'white');
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.08;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 3000;
      src.connect(filt).connect(g2).connect(this.sfxGain);
      src.start(); src.stop(this.ctx.currentTime + 0.04);
    }, 150);
  }

  // LPR namierzanie
  lprScan() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Elektroniczny sweep
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(400, t);
    o.frequency.linearRampToValueAtTime(800, t + 0.2);
    o.frequency.linearRampToValueAtTime(400, t + 0.4);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.05);
    g.gain.setValueAtTime(0.04, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 600;
    filt.Q.value = 4;
    o.connect(filt).connect(g).connect(this.sfxGain);
    o.start(t); o.stop(t + 0.5);
  }

  // Pauza gry
  pauseIn() {
    if (!this.enabled || this.muted) return;
    this._init();
    // Filtrowane wyciszenie
    this.blip(600, 0.12, 0.08, 'sine');
    setTimeout(() => this.blip(400, 0.15, 0.06, 'sine'), 80);
  }

  pauseOut() {
    if (!this.enabled || this.muted) return;
    this._init();
    this.blip(400, 0.08, 0.08, 'sine');
    setTimeout(() => this.blip(600, 0.1, 0.08, 'sine'), 60);
  }

  // Roboty drogowe
  roadworks() {
    if (!this.enabled || this.muted) return;
    this._init();
    const t = this.ctx.currentTime;
    // Metaliczny brzek
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 800 + i * 200 + Math.random() * 100;
      g.gain.setValueAtTime(0.001, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.06, t + i * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.08);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.1);
    }
  }


  // === AMBIENT SYSTEM ===

  ambient(zone) {
    if (!this.enabled) return;
    this._init();

    // Zatrzymaj stare warstwy
    this._stopAmbientLayers();

    // Warstwa 1: Niski hum miasta (buczenie infrastruktury)
    const hum = this.ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = zone === 'industrial' ? 55 : zone === 'highway' ? 70 : 80;
    const humGain = this.ctx.createGain();
    humGain.gain.value = 0.004;
    const humFilt = this.ctx.createBiquadFilter();
    humFilt.type = 'lowpass';
    humFilt.frequency.value = 180;
    hum.connect(humFilt).connect(humGain).connect(this.ambientGain);
    hum.start();
    this._hum = { osc: hum, gain: humGain };

    // Warstwa 2: Wiatr (filtrowany szum)
    const windBuf = this._noiseBuffer(4, 'pink');
    const wind = this.ctx.createBufferSource();
    wind.buffer = windBuf;
    wind.loop = true;
    const windGain = this.ctx.createGain();
    windGain.gain.value = zone === 'highway' ? 0.035 : 0.018;
    const windFilt = this.ctx.createBiquadFilter();
    windFilt.type = 'lowpass';
    windFilt.frequency.value = zone === 'highway' ? 800 : 500;
    // LFO na wietrze - oddychanie
    const windLfo = this.ctx.createOscillator();
    const windLfoGain = this.ctx.createGain();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.15 + Math.random() * 0.1;
    windLfoGain.gain.value = zone === 'highway' ? 0.015 : 0.008;
    windLfo.connect(windLfoGain).connect(windGain.gain);
    windLfo.start();
    wind.connect(windFilt).connect(windGain).connect(this.ambientGain);
    wind.start();
    this._wind = { src: wind, gain: windGain, lfo: windLfo };

    // Warstwa 3: Daleki ruch uliczny (szerokopasmowy szum)
    const cityBuf = this._noiseBuffer(3, 'pink');
    const city = this.ctx.createBufferSource();
    city.buffer = cityBuf;
    city.loop = true;
    const cityGain = this.ctx.createGain();
    cityGain.gain.value = zone === 'downtown' ? 0.02 : zone === 'residential' ? 0.008 : 0.015;
    const cityFilt = this.ctx.createBiquadFilter();
    cityFilt.type = 'bandpass';
    cityFilt.frequency.value = 300;
    cityFilt.Q.value = 0.5;
    city.connect(cityFilt).connect(cityGain).connect(this.ambientGain);
    city.start();
    this._cityDrone = { src: city, gain: cityGain };

    // Warstwa 4: Losowe dzwieki otoczenia (ptaki, klaksony, silniki w oddali)
    clearInterval(this._amInt);
    this._amInt = setInterval(() => {
      if (this.muted) return;
      const r = Math.random();

      if (r < 0.15) {
        // Ptak - cwierknięcie (chirp z modulacją)
        const t = this.ctx.currentTime;
        const birdFreq = 2000 + Math.random() * 1200;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(birdFreq, t);
        o.frequency.linearRampToValueAtTime(birdFreq * 1.3, t + 0.04);
        o.frequency.linearRampToValueAtTime(birdFreq * 0.9, t + 0.08);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.03, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g).connect(this.ambientGain);
        o.start(t); o.stop(t + 0.12);

        // Drugie cwierknięcie po chwili
        if (Math.random() < 0.6) {
          setTimeout(() => {
            if (!this.ctx) return;
          const t2 = this.ctx.currentTime;
            const o2 = this.ctx.createOscillator();
            const g2 = this.ctx.createGain();
            o2.type = 'sine';
            o2.frequency.setValueAtTime(birdFreq * 1.1, t2);
            o2.frequency.linearRampToValueAtTime(birdFreq * 1.4, t2 + 0.035);
            g2.gain.setValueAtTime(0.001, t2);
            g2.gain.linearRampToValueAtTime(0.025, t2 + 0.01);
            g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.08);
            o2.connect(g2).connect(this.ambientGain);
            o2.start(t2); o2.stop(t2 + 0.1);
          }, 120 + Math.random() * 80);
        }
      } else if (r < 0.25) {
        // Daleki klakson
        this._distantHonk();
      } else if (r < 0.32) {
        // Przelatujacy samochod (doppler sweep)
        this._distantCar();
      } else if (r < 0.36 && zone !== 'residential') {
        // Hamowanie (screech)
        this._distantBrake();
      }
    }, 3000 + Math.random() * 2000);
  }

  // Wlacz deszcz w tle
  startRain() {
    if (this._rainNode || !this.enabled) return;
    this._init();
    const buf = this._noiseBuffer(3, 'pink');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.045;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 400;
    const filt2 = this.ctx.createBiquadFilter();
    filt2.type = 'lowpass';
    filt2.frequency.value = 6000;
    src.connect(filt).connect(filt2).connect(g).connect(this.ambientGain);
    src.start();
    this._rainNode = { src, gain: g };

    // Losowe kapanie
    this._rainDropInt = setInterval(() => {
      if (this.muted || !this.ctx) return;
      if (Math.random() < 0.4) {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const gd = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(4000 + Math.random() * 2000, t);
        o.frequency.exponentialRampToValueAtTime(800, t + 0.03);
        gd.gain.setValueAtTime(0.02, t);
        gd.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.connect(gd).connect(this.ambientGain);
        o.start(t); o.stop(t + 0.05);
      }
    }, 800);
  }

  stopRain() {
    if (this._rainNode) {
      try { this._rainNode.src.stop(); } catch {}
      this._rainNode = null;
    }
    clearInterval(this._rainDropInt);
  }


  // === DZWIEKI W TLE (oddalone) ===

  _distantHonk() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = 280 + Math.random() * 100;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.03);
    g.gain.setValueAtTime(0.02, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 600;
    o.connect(filt).connect(g).connect(this.ambientGain);
    o.start(t); o.stop(t + 0.25);
  }

  _distantCar() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this._noiseBuffer(1.5, 'pink');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(200, t);
    filt.frequency.linearRampToValueAtTime(400, t + 0.6);
    filt.frequency.linearRampToValueAtTime(150, t + 1.2);
    filt.Q.value = 2;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.015, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    src.connect(filt).connect(g).connect(this.ambientGain);
    src.start(t); src.stop(t + 1.4);
  }

  _distantBrake() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.linearRampToValueAtTime(800, t + 0.2);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.015, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 500;
    o.connect(filt).connect(g).connect(this.ambientGain);
    o.start(t); o.stop(t + 0.3);
  }

  _stopAmbientLayers() {
    if (this._hum) { try { this._hum.osc.stop(); } catch {} this._hum = null; }
    if (this._wind) {
      try { this._wind.src.stop(); this._wind.lfo.stop(); } catch {}
      this._wind = null;
    }
    if (this._cityDrone) { try { this._cityDrone.src.stop(); } catch {} this._cityDrone = null; }
    clearInterval(this._amInt);
  }


  // === UPDATE PER-FRAME (wola main loop) ===

  // Aktualizacja dzwiekow zależnych od stanu gry
  update(dt, playerState) {
    if (!this.enabled || !this.ctx || this.muted) return;

    // playerState: { onRoad, onCrossing, running, moving, timeLeft, timeLimit, dangerNear }

    // Kroki gracza
    if (playerState.moving) {
      const surface = playerState.onCrossing ? 'crossing' :
                      playerState.onRoad ? 'road' : 'sidewalk';
      this.footstep(surface, playerState.running);
    }

    // Heartbeat na jezdni
    if (playerState.onRoad && !playerState.onCrossing) {
      this._onRoadTime += dt;
      if (this._onRoadTime > 0.5) {
        this.startHeartbeat();
      }
    } else {
      this._onRoadTime = 0;
      this.stopHeartbeat();
    }

    // Sygnalizator na przejsciu
    if (playerState.crossingLight && playerState.crossingLight !== this._lastCrossingLight) {
      this.startCrossingBeep(playerState.crossingLight);
      this._lastCrossingLight = playerState.crossingLight;
    } else if (!playerState.crossingLight && this._lastCrossingLight) {
      this.stopCrossingBeep();
      this._lastCrossingLight = null;
    }

    // Tykanie zegara jak mało czasu
    if (playerState.timeLeft !== undefined && playerState.timeLimit) {
      const ratio = playerState.timeLeft / playerState.timeLimit;
      if (ratio < 0.15 && ratio > 0) {
        this._tickTimer = (this._tickTimer || 0) + dt;
        const interval = ratio < 0.05 ? 0.4 : 0.7;
        if (this._tickTimer >= interval) {
          this.tick();
          this._tickTimer = 0;
        }
      }
    }
  }


  // === KONTROLA GLOSNOSCI ===

  setMasterVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  mute() {
    this.muted = true;
    if (this.masterGain) {
      this.masterGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    }
  }

  unmute() {
    this.muted = false;
    if (this.masterGain) {
      this.masterGain.gain.linearRampToValueAtTime(0.85, this.ctx.currentTime + 0.1);
    }
  }

  // Duck audio na czas alertu (scisz tlo, poglos sfx)
  duckAmbient(duration = 2) {
    if (!this.ambientGain) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.linearRampToValueAtTime(0.15, t + 0.1);
    this.ambientGain.gain.linearRampToValueAtTime(0.5, t + duration);
  }

  stop() {
    this._stopAmbientLayers();
    this.stopRain();
    this.stopHeartbeat();
    this.stopCrossingBeep();
    this.sirenStop();
    clearInterval(this._amInt);
    clearInterval(this._rainDropInt);
  }
}
