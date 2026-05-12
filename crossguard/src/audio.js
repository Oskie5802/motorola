// === Audio: lightweight WebAudio synth — no external assets required ===

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

  // --- One-shot SFX ---
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
    // Motorola-esque double-tone
    this.blip(660, 0.12, 0.13, 'sine');
    setTimeout(() => this.blip(990, 0.18, 0.13, 'sine'), 110);
  }
  honk() {
    this.blip(330, 0.18, 0.18, 'square');
  }
  siren() {
    if (!this.enabled) return;
    this._init();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    g.gain.value = 0.06;
    o.connect(g).connect(this.ctx.destination);
    o.start();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      o.frequency.setValueAtTime(620, t + i * 0.4);
      o.frequency.linearRampToValueAtTime(1000, t + i * 0.4 + 0.2);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.stop(t + 2.5);
  }

  ambient(zone) {
    // Subtle low hum + occasional bird/horn (no heavy looping for code-only sim)
    if (!this.enabled) return;
    this._init();
    // Hum
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

    // Periodic birds / honks
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
