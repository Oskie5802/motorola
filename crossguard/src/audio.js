// Audio: prosty syntezator WebAudio, bez zewnetrznych plikow bo po co

export class AudioSystem {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.ambientGain = null;
    this.musicGain = null;
    this.muted = false;
  }

  _init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.08;
      this.ambientGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.04;
      this.musicGain.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
  }

  resume() {
    this._init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // efekty dzwiekowe jednorazowe (sfx)
  blip(freq = 880, dur = 0.08, vol = 0.12, type = 'square') {
    if (!this.enabled) return;
    this._init();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(this.ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.stop(this.ctx.currentTime + dur);
  }

  good() { this.blip(880, 0.1, 0.15, 'sine'); setTimeout(() => this.blip(1320, 0.12, 0.15, 'sine'), 70); }
  bad()  { this.blip(180, 0.18, 0.2, 'sawtooth'); }
  warn() { this.blip(440, 0.08, 0.15, 'square'); setTimeout(() => this.blip(440, 0.08, 0.15, 'square'), 120); }
  motoChime() {
    // podwojny tonik w stylu motoroli
    this.blip(660, 0.12, 0.13, 'sine');
    setTimeout(() => this.blip(990, 0.18, 0.13, 'sine'), 110);
  }
  honk() {
    this.blip(330, 0.18, 0.18, 'square');
  }
  sirenStart() {
    if (!this.enabled || this._sirenOsc) return;
    this._init();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    g.gain.value = 0.07;
    o.connect(g).connect(this.ctx.destination);
    o.start();
    this._sirenOsc = o;
    this._sirenGain = g;
    // ciagla petla syreny, robimy to na setInterval zeby przeliczac rampy czestotliwosci
    const schedule = () => {
      if (!this._sirenOsc) return;
      const t = this.ctx.currentTime;
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(620, t);
      o.frequency.linearRampToValueAtTime(1000, t + 0.4);
      o.frequency.linearRampToValueAtTime(620, t + 0.8);
      this._sirenTimer = setTimeout(schedule, 700);
    };
    schedule();
  }

  sirenStop() {
    if (!this._sirenOsc) return;
    clearTimeout(this._sirenTimer);
    try {
      this._sirenGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
      this._sirenOsc.stop(this.ctx.currentTime + 0.15);
    } catch {}
    this._sirenOsc = null;
    this._sirenGain = null;
  }

  ambient(zone) {
    // cichy szum w tle i czasem jakis ptak albo klakson (bez ciezkiego loopowania audio)
    if (!this.enabled) return;
    this._init();
    // buczenie
    if (this._hum) try { this._hum.stop(); } catch {}
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = zone === 'industrial' ? 60 : 80;
    const g = this.ctx.createGain();
    g.gain.value = 0.005;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 200;
    o.connect(filt).connect(g).connect(this.ctx.destination);
    o.start();
    this._hum = o;

    // losowe ptaki i traby co jakis czas
    clearInterval(this._amInt);
    this._amInt = setInterval(() => {
      if (Math.random() < 0.3) this.blip(2200 + Math.random() * 800, 0.06, 0.04, 'triangle');
      if (Math.random() < 0.12) this.honk();
    }, 4000);
  }

  stop() {
    if (this._hum) try { this._hum.stop(); } catch {}
    clearInterval(this._amInt);
  }
}
